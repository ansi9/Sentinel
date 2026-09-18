import os
from functools import lru_cache
from typing import List, Optional
import numpy as np
from PIL import Image

EMBED_DIM = 32
INPUT_SIZE = 64

# The real, SimCLR-contrastively-pretrained checkpoint (see
# backend/drift/train_embedding_extractor.py) -- checked into the repo
# under real_validation/ (not test_assets/, which is disposable and
# regenerated on every run) precisely so this trained result persists.
TRAINED_EMBEDDING_MODEL_PATH = "real_validation/models/embedding_extractor_trained.onnx"
# Fallback used only if the trained checkpoint above is missing (e.g. a
# fresh checkout that hasn't fetched real_validation/ yet): a
# deterministic fixed-random-seed CNN, arbitrary but reproducible.
FALLBACK_EMBEDDING_MODEL_PATH = "test_assets/models/embedding_extractor.onnx"
DEFAULT_EMBEDDING_MODEL_PATH = TRAINED_EMBEDDING_MODEL_PATH


def build_embedding_extractor_onnx(output_path: str = FALLBACK_EMBEDDING_MODEL_PATH) -> str:
    """Builds a small, real, deterministic (fixed-seed) CNN feature
    extractor and saves it as ONNX: three stride-2 3x3 convs down to an
    8x8 feature map, global-average-pooled to a fixed EMBED_DIM vector.

    This is the fallback generator, used only when the real
    contrastively-trained checkpoint (TRAINED_EMBEDDING_MODEL_PATH) is
    unavailable. It's still a genuine embedding-space comparison mechanism
    (a real forward pass through real convolutional filters, executed via
    onnxruntime) rather than raw pixel/color-moment statistics -- the
    fixed random seed just means these particular filters were never
    trained on anything, only reproducibly initialised.
    """
    import onnx
    from onnx import helper, TensorProto

    if os.path.exists(output_path):
        return output_path

    rng = np.random.RandomState(7)

    def conv_weight(out_c, in_c, k, scale=0.2):
        return rng.normal(0, scale, size=(out_c, in_c, k, k)).astype(np.float32)

    w1 = conv_weight(8, 3, 3)
    w2 = conv_weight(16, 8, 3)
    w3 = conv_weight(EMBED_DIM, 16, 3)

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

    graph = helper.make_graph(nodes, "intelx_embedding_extractor", [input_tensor], [output_tensor], initializer=initializers)
    model = helper.make_model(graph, producer_name="IntelX-AirGap-Compiler", opset_imports=[helper.make_opsetid("", 17)])
    onnx.checker.check_model(model)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    onnx.save(model, output_path)
    return output_path


@lru_cache(maxsize=2)
def _load_session(model_path: str, mtime: float):
    import onnxruntime as ort

    return ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])


class EmbeddingExtractor:
    """Extracts real, learned-filter feature-map embeddings for real
    distribution-shift comparison, as distinct from the color-moment
    pixel statistics `data_assurance/ood_detector.py` uses. Returns None
    on any failure (missing file, unreadable image, model load failure)
    so callers can fall back gracefully rather than fabricate a vector.
    """

    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path

    def _resolve_model_path(self) -> str:
        if self.model_path:
            return self.model_path
        if os.path.exists(TRAINED_EMBEDDING_MODEL_PATH):
            return TRAINED_EMBEDDING_MODEL_PATH
        return build_embedding_extractor_onnx(FALLBACK_EMBEDDING_MODEL_PATH)

    def _session(self):
        resolved = self._resolve_model_path()
        if not os.path.exists(resolved):
            resolved = build_embedding_extractor_onnx(resolved)
        mtime = os.path.getmtime(resolved)
        return _load_session(resolved, mtime)

    def extract(self, image_path: str) -> Optional[np.ndarray]:
        if not image_path or not os.path.exists(image_path):
            return None
        try:
            with Image.open(image_path) as img:
                arr = np.asarray(img.convert("RGB").resize((INPUT_SIZE, INPUT_SIZE)), dtype=np.float32) / 255.0
            arr = arr.transpose(2, 0, 1)[None, ...]
            session = self._session()
            output = session.run(None, {"images": arr})[0]
            return output.reshape(-1).astype(np.float64)
        except Exception:
            return None

    def extract_batch(self, image_paths: List[str]) -> np.ndarray:
        vectors = [self.extract(p) for p in image_paths]
        vectors = [v for v in vectors if v is not None]
        if not vectors:
            return np.empty((0, EMBED_DIM))
        return np.stack(vectors)

    @staticmethod
    def diagonal_frechet_distance(reference: np.ndarray, observed: np.ndarray) -> dict:
        """A diagonal-covariance approximation of the Frechet Inception
        Distance: full-covariance FID needs a matrix square root and is
        numerically fragile on the small sample sizes typical of an
        assurance evaluation (tens, not thousands, of images); the
        diagonal form is the standard lightweight substitute and still
        captures both a mean-shift term and a spread/variance-shift term
        per embedding dimension."""
        mu_r, mu_o = reference.mean(axis=0), observed.mean(axis=0)
        var_r = reference.var(axis=0) + 1e-6
        return EmbeddingExtractor.diagonal_frechet_distance_from_stats(mu_r, var_r, observed)

    @staticmethod
    def diagonal_frechet_distance_from_stats(mu_r: np.ndarray, var_r: np.ndarray, observed: np.ndarray) -> dict:
        """Same diagonal-Frechet computation as `diagonal_frechet_distance`,
        but taking a precomputed reference mean/variance instead of raw
        reference embeddings. This is what makes the embedding-shift signal
        usable against a *declared* reference baseline (computed once,
        offline, via `compute_reference_statistics`, and stored by the
        operator) instead of requiring the raw reference image set to be
        resupplied on every single evaluation call."""
        mu_o = observed.mean(axis=0)
        var_o = observed.var(axis=0) + 1e-6
        var_r = np.asarray(var_r, dtype=np.float64) + 1e-6
        mu_r = np.asarray(mu_r, dtype=np.float64)

        mean_term = float(np.sum((mu_r - mu_o) ** 2))
        var_term = float(np.sum(var_r + var_o - 2.0 * np.sqrt(var_r * var_o)))

        return {
            "embedding_frechet_distance": round(mean_term + var_term, 4),
            "mean_shift_component": round(mean_term, 4),
            "variance_shift_component": round(var_term, 4),
        }

    @classmethod
    def compute_reference_statistics(cls, image_paths: List[str], model_path: Optional[str] = None) -> Optional[dict]:
        """Precomputes a declared reference embedding baseline (mean +
        variance per dimension, JSON-serializable) from a set of reference
        images, once and offline. The operator stores the result in their
        declared `reference_profile` (as `embedding_centroid` /
        `embedding_variance`) so subsequent `evaluate_shift` calls get the
        embedding-space signal without needing to resupply raw reference
        images every time -- turning a per-call dependency into a one-time
        setup step, which is how a "declared reference distribution" is
        meant to be used operationally."""
        extractor = cls(model_path)
        embeddings = extractor.extract_batch(image_paths)
        if embeddings.shape[0] < 2:
            return None
        return {
            "embedding_centroid": embeddings.mean(axis=0).tolist(),
            "embedding_variance": embeddings.var(axis=0).tolist(),
            "embedding_dim": int(embeddings.shape[1]),
            "reference_sample_count": int(embeddings.shape[0]),
        }
