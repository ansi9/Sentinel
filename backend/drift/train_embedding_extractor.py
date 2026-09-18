"""One-time, offline SimCLR-style contrastive pretraining for the
distribution-shift embedding extractor.

This replaces `EmbeddingExtractor`'s previous fixed-random-seed
("arbitrary but reproducible") convolutional filters with filters that
actually learned something: two random augmentations of the same image
are pulled together in embedding space, and augmentations of different
images are pushed apart (NT-Xent / SimCLR loss). The result is a real
learned feature space, not an arbitrary one -- while remaining fully
self-contained: training data is this repository's own real (COCO,
CC BY 4.0 / Apache-2.0, see real_validation/PROVENANCE.md) and synthetic
images, no external pretrained weights are downloaded or depended on,
and the trained result is baked into a deterministic ONNX file checked
into the repo, so no training happens at runtime and no PyTorch training
step is required in the air-gapped deployment path.

Run once, offline, to regenerate `test_assets/models/embedding_extractor.onnx`:
    python -m backend.drift.train_embedding_extractor
"""
import glob
import os
import random
from typing import List

import numpy as np


def _collect_training_images() -> List[str]:
    paths = []
    paths += glob.glob("real_validation/images/*.jpg")
    paths += glob.glob("test_assets/images/*.jpg")
    return sorted(set(paths))


def _augment(img, input_size: int, rng: random.Random):
    """A small, dependency-free augmentation pipeline (PIL + numpy only):
    random-resized-crop, horizontal flip, and colour jitter -- the same
    families of augmentation SimCLR itself uses, scaled down for a CPU-only,
    offline, no-torchvision environment."""
    from PIL import Image, ImageEnhance

    w, h = img.size
    scale = rng.uniform(0.6, 1.0)
    crop_w, crop_h = int(w * scale), int(h * scale)
    x0 = rng.randint(0, max(0, w - crop_w))
    y0 = rng.randint(0, max(0, h - crop_h))
    cropped = img.crop((x0, y0, x0 + crop_w, y0 + crop_h)).resize((input_size, input_size), Image.Resampling.BILINEAR)

    if rng.random() < 0.5:
        cropped = cropped.transpose(Image.Transpose.FLIP_LEFT_RIGHT)

    cropped = ImageEnhance.Brightness(cropped).enhance(rng.uniform(0.7, 1.3))
    cropped = ImageEnhance.Contrast(cropped).enhance(rng.uniform(0.7, 1.3))
    cropped = ImageEnhance.Color(cropped).enhance(rng.uniform(0.6, 1.4))

    arr = np.asarray(cropped.convert("RGB"), dtype=np.float32) / 255.0
    return arr.transpose(2, 0, 1)


def nt_xent_loss(z, temperature: float = 0.5):
    """Standard SimCLR NT-Xent loss over a batch of 2N embeddings, where
    (2i, 2i+1) are the two augmented views of image i."""
    import torch
    import torch.nn.functional as F

    z = F.normalize(z, dim=1)
    n = z.shape[0]
    sim = z @ z.T / temperature
    sim.fill_diagonal_(-1e9)

    targets = torch.arange(n)
    targets = torch.where(targets % 2 == 0, targets + 1, targets - 1)
    return F.cross_entropy(sim, targets)


def train(
    output_path: str = "real_validation/models/embedding_extractor_trained.onnx",
    epochs: int = 12,
    batch_images: int = 8,
    seed: int = 7,
) -> str:
    import torch
    import torch.nn as nn
    from PIL import Image

    from .embedding_extractor import EMBED_DIM, INPUT_SIZE

    image_paths = _collect_training_images()
    if len(image_paths) < batch_images:
        raise RuntimeError(
            f"Need at least {batch_images} training images (found {len(image_paths)}); "
            "run AssetGenerator.ensure_test_assets() and/or populate real_validation/images/ first."
        )

    torch.manual_seed(seed)
    rng = random.Random(seed)

    class TorchEmbeddingNet(nn.Module):
        def __init__(self):
            super().__init__()
            self.c1 = nn.Conv2d(3, 8, 3, stride=2, padding=1, bias=False)
            self.c2 = nn.Conv2d(8, 16, 3, stride=2, padding=1, bias=False)
            self.c3 = nn.Conv2d(16, EMBED_DIM, 3, stride=2, padding=1, bias=False)
            self.relu = nn.ReLU()
            self.pool = nn.AdaptiveAvgPool2d(1)

        def forward(self, x):
            x = self.relu(self.c1(x))
            x = self.relu(self.c2(x))
            x = self.relu(self.c3(x))
            x = self.pool(x)
            return x.flatten(1)

    model = TorchEmbeddingNet()
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)

    loaded_images = []
    for p in image_paths:
        try:
            with Image.open(p) as im:
                loaded_images.append(im.convert("RGB").copy())
        except Exception:
            continue

    for epoch in range(epochs):
        rng.shuffle(loaded_images)
        epoch_loss = 0.0
        num_batches = 0
        for i in range(0, len(loaded_images) - batch_images + 1, batch_images):
            batch_imgs = loaded_images[i:i + batch_images]
            views = []
            for img in batch_imgs:
                views.append(_augment(img, INPUT_SIZE, rng))
                views.append(_augment(img, INPUT_SIZE, rng))
            batch_arr = torch.from_numpy(np.stack(views)).float()

            optimizer.zero_grad()
            z = model(batch_arr)
            loss = nt_xent_loss(z)
            loss.backward()
            optimizer.step()

            epoch_loss += float(loss.item())
            num_batches += 1

        if num_batches:
            print(f"epoch {epoch+1}/{epochs}: NT-Xent loss = {epoch_loss / num_batches:.4f}")

    _export_to_onnx(model, output_path)
    return output_path


def _export_to_onnx(model, output_path: str) -> None:
    import onnx
    from onnx import helper, TensorProto

    from .embedding_extractor import EMBED_DIM, INPUT_SIZE

    w1 = model.c1.weight.detach().numpy().astype(np.float32)
    w2 = model.c2.weight.detach().numpy().astype(np.float32)
    w3 = model.c3.weight.detach().numpy().astype(np.float32)

    initializers = [
        helper.make_tensor("w1", TensorProto.FLOAT, w1.shape, w1.tobytes(), raw=True),
        helper.make_tensor("w2", TensorProto.FLOAT, w2.shape, w2.tobytes(), raw=True),
        helper.make_tensor("w3", TensorProto.FLOAT, w3.shape, w3.tobytes(), raw=True),
    ]
    nodes = [
        helper.make_node("Conv", ["images", "w1"], ["c1"], kernel_shape=[3, 3], strides=[2, 2], pads=[1, 1, 1, 1]),
        helper.make_node("Relu", ["c1"], ["r1"]),
        helper.make_node("Conv", ["r1", "w2"], ["c2"], kernel_shape=[3, 3], strides=[2, 2], pads=[1, 1, 1, 1]),
        helper.make_node("Relu", ["c2"], ["r2"]),
        helper.make_node("Conv", ["r2", "w3"], ["c3"], kernel_shape=[3, 3], strides=[2, 2], pads=[1, 1, 1, 1]),
        helper.make_node("Relu", ["c3"], ["r3"]),
        helper.make_node("GlobalAveragePool", ["r3"], ["pooled"]),
        helper.make_node("Flatten", ["pooled"], ["embedding"], axis=1),
    ]
    input_tensor = helper.make_tensor_value_info("images", TensorProto.FLOAT, [1, 3, INPUT_SIZE, INPUT_SIZE])
    output_tensor = helper.make_tensor_value_info("embedding", TensorProto.FLOAT, [1, EMBED_DIM])

    graph = helper.make_graph(
        nodes, "intelx_embedding_extractor_trained", [input_tensor], [output_tensor], initializer=initializers
    )
    onnx_model = helper.make_model(
        graph, producer_name="IntelX-AirGap-Compiler-SimCLR",
        opset_imports=[helper.make_opsetid("", 17)],
    )
    onnx.checker.check_model(onnx_model)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    onnx.save(onnx_model, output_path)


if __name__ == "__main__":
    train()
