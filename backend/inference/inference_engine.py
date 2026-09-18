import os
from functools import lru_cache
from typing import List, Optional, Tuple
import numpy as np
from PIL import Image
from ..schemas import BoundingBox, InferenceConfig, PreprocessingConfig

# Standard 80-class COCO label set, in the fixed index order every
# COCO-trained detector (including the real, third-party YOLOX-Nano
# checkpoint this system validates against) uses for its class logits.
COCO_80_CLASSES = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
    "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat",
    "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack",
    "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball",
    "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket",
    "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
    "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair",
    "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse",
    "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
    "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier",
    "toothbrush",
]


class ModelExecutionError(Exception):
    pass


@lru_cache(maxsize=8)
def _load_session(model_path: str, mtime: float):
    import onnxruntime as ort

    return ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])


@lru_cache(maxsize=8)
def _load_torchscript_module(model_path: str, mtime: float):
    import torch

    module = torch.jit.load(model_path, map_location="cpu")
    module.eval()
    return module


TORCHSCRIPT_EXTENSIONS = (".pt", ".pth", ".torchscript")


class InferenceEngine:
    """Executes real ONNX models via onnxruntime and decodes their raw
    output tensor into detections. No result here is independent of the
    actual model weights or the actual input pixels: everything downstream
    (fingerprinting, backdoor probing, behavioural batteries) is only as
    trustworthy as this function actually running the supplied model.
    """

    def __init__(self, default_classes: Optional[List[str]] = None):
        self.default_classes = default_classes or [
            "military_vehicle", "infantry", "radar_station", "aircraft", "naval_vessel"
        ]

    def _get_session(self, model_path: str):
        if not os.path.exists(model_path):
            raise ModelExecutionError(f"Model file not found at: {model_path}")
        mtime = os.path.getmtime(model_path)
        return _load_session(model_path, mtime)

    def _run_torchscript(self, model_path: str, arr: np.ndarray) -> np.ndarray:
        """Executes a real TorchScript module -- the only PyTorch on-disk
        format that is genuinely self-contained enough to run without this
        system supplying its own guess at the original model class. A raw
        state_dict checkpoint (.pt/.pth saved via torch.save(model.state_dict()))
        has no such guarantee: torch.jit.load will reject it outright
        (it isn't a ScriptModule), and that failure is surfaced honestly
        as ModelExecutionError rather than papered over with a fabricated
        architecture guess. Parameter/weight-statistics analysis (which
        only needs the tensor values, not an executable forward pass) is
        still available for raw state_dicts via ParameterAnalyzer."""
        import torch

        if not os.path.exists(model_path):
            raise ModelExecutionError(f"Model file not found at: {model_path}")
        mtime = os.path.getmtime(model_path)
        try:
            module = _load_torchscript_module(model_path, mtime)
        except Exception as e:
            raise ModelExecutionError(
                f"'{model_path}' could not be executed as a TorchScript module: {e}. "
                "Execution-based checks (behaviour battery, backdoor probing, trigger "
                "reconstruction) require a self-contained TorchScript export "
                "(torch.jit.script/trace) -- a raw state_dict checkpoint has no attached "
                "model code for this system to run. Parameter/weight-statistics analysis "
                "is still available for such checkpoints since it only needs the tensor "
                "values, not execution."
            )
        with torch.no_grad():
            output = module(torch.from_numpy(arr))
        return output.numpy()

    def preprocess_image(self, img: Image.Image, preproc: PreprocessingConfig) -> np.ndarray:
        arr, _ratio = self.preprocess_image_with_ratio(img, preproc)
        return arr

    def preprocess_image_with_ratio(self, img: Image.Image, preproc: PreprocessingConfig) -> Tuple[np.ndarray, float]:
        """Same as preprocess_image, but also returns the resize ratio
        applied -- needed to map letterboxed detections back to original
        image coordinates. Non-letterbox (naive stretch-resize) callers
        get ratio=1.0 and can ignore it, matching prior behaviour exactly."""
        target_h, target_w = preproc.resize[0], preproc.resize[1]
        img_rgb = img.convert("RGB")

        if preproc.letterbox:
            # Aspect-preserving resize + pad-to-square, matching the exact
            # contract real third-party detectors (e.g. YOLOX) were
            # trained and exported with: pad with a fixed grey value,
            # anchor the resized image at the top-left corner rather than
            # centering it -- this is what YOLOX's own `preproc()` does,
            # and diverging from it (e.g. centering the pad) would shift
            # every detection's coordinates by half the padding margin.
            src_w, src_h = img_rgb.size
            ratio = min(target_w / src_w, target_h / src_h)
            new_w, new_h = int(src_w * ratio), int(src_h * ratio)
            resized = img_rgb.resize((max(1, new_w), max(1, new_h)), Image.Resampling.BILINEAR)

            canvas = Image.new("RGB", (target_w, target_h), (preproc.pad_value,) * 3)
            canvas.paste(resized, (0, 0))
            arr = np.asarray(canvas, dtype=np.float32)
        else:
            resized = img_rgb.resize((target_w, target_h), Image.Resampling.BILINEAR)
            arr = np.asarray(resized, dtype=np.float32)
            ratio = 1.0

        if preproc.scale_to_unit:
            arr = arr / 255.0

        if preproc.color_space.upper() == "BGR":
            arr = arr[:, :, ::-1]

        arr = np.ascontiguousarray(arr.transpose(2, 0, 1))  # HWC -> CHW
        arr = np.expand_dims(arr, axis=0).astype(np.float32)
        return arr, ratio

    def preprocess(self, image_path: str, preproc: PreprocessingConfig) -> np.ndarray:
        if not os.path.exists(image_path):
            raise ModelExecutionError(f"Image file not found at: {image_path}")
        with Image.open(image_path) as img:
            return self.preprocess_image(img, preproc)

    def _decode(self, raw_output: np.ndarray, config: InferenceConfig, class_names: List[str], stride: int) -> List[BoundingBox]:
        """Decodes a [num_channels, num_anchors] tensor (4 box regression
        channels + one channel per class) laid out over a square grid into
        bounding boxes, using a sigmoid/softmax parameterisation that stays
        numerically bounded regardless of the model's raw weight scale."""
        num_channels, num_anchors = raw_output.shape
        num_classes = len(class_names)
        grid_size = int(round(num_anchors ** 0.5))

        box_raw = raw_output[:4]
        class_logits = raw_output[4:4 + num_classes]

        exp_logits = np.exp(class_logits - class_logits.max(axis=0, keepdims=True))
        class_probs = exp_logits / exp_logits.sum(axis=0, keepdims=True)
        best_class_idx = np.argmax(class_probs, axis=0)
        best_conf = np.max(class_probs, axis=0)

        rows = np.arange(num_anchors) // grid_size
        cols = np.arange(num_anchors) % grid_size

        sigmoid = lambda v: 1.0 / (1.0 + np.exp(-np.clip(v, -20, 20)))
        cx = (cols + sigmoid(box_raw[0])) * stride
        cy = (rows + sigmoid(box_raw[1])) * stride
        bw = np.exp(np.clip(box_raw[2], -6, 6)) * stride
        bh = np.exp(np.clip(box_raw[3], -6, 6)) * stride

        candidate_idx = np.where(best_conf >= config.confidence_threshold)[0]
        if candidate_idx.size == 0:
            return []

        order = candidate_idx[np.argsort(-best_conf[candidate_idx])][: config.max_detections * 4]

        boxes: List[BoundingBox] = []
        kept_xyxy: List[List[float]] = []
        kept_classes: List[int] = []
        for idx in order:
            x1 = float(cx[idx] - bw[idx] / 2)
            y1 = float(cy[idx] - bh[idx] / 2)
            x2 = float(cx[idx] + bw[idx] / 2)
            y2 = float(cy[idx] + bh[idx] / 2)
            cls_idx = int(best_class_idx[idx])

            suppressed = False
            for k, (kx1, ky1, kx2, ky2) in enumerate(kept_xyxy):
                if kept_classes[k] != cls_idx:
                    continue
                iou = self._iou([x1, y1, x2, y2], [kx1, ky1, kx2, ky2])
                if iou > config.iou_threshold:
                    suppressed = True
                    break
            if suppressed:
                continue

            kept_xyxy.append([x1, y1, x2, y2])
            kept_classes.append(cls_idx)
            boxes.append(
                BoundingBox(
                    class_name=class_names[cls_idx],
                    confidence=float(round(best_conf[idx], 4)),
                    box=[round(x1, 1), round(y1, 1), round(x2 - x1, 1), round(y2 - y1, 1)],
                )
            )
            if len(boxes) >= config.max_detections:
                break

        return boxes

    def _decode_yolox_family(
        self,
        raw: np.ndarray,
        config: InferenceConfig,
        class_names: List[str],
        resize_hw: Tuple[int, int],
        ratio: float,
    ) -> List[BoundingBox]:
        """Decodes a real third-party multi-stride anchor-free detector's
        raw ONNX output -- shape (num_anchors, 4 box + 1 objectness + N
        class logits), concatenated across three stride levels (8, 16,
        32). This is a faithful port of Megvii's own
        `yolox.utils.demo_utils.demo_postprocess` (verified against the
        upstream YOLOX source, not reverse-engineered by trial and error),
        so it decodes a genuine pretrained YOLOX ONNX export correctly --
        this system's own synthetic single-stride fixtures use the
        different channels-first `_decode` path above and are unaffected.
        """
        num_anchors, num_channels = raw.shape
        num_classes = num_channels - 5
        if num_classes != len(class_names):
            raise ModelExecutionError(
                f"YOLOX-family output has {num_classes} classes but {len(class_names)} class_names were "
                f"supplied -- pass the model's actual training class list via class_names."
            )

        strides = [8, 16, 32]
        target_h, target_w = resize_hw
        grids, expanded_strides = [], []
        for stride in strides:
            hsize, wsize = target_h // stride, target_w // stride
            xv, yv = np.meshgrid(np.arange(wsize), np.arange(hsize))
            grid = np.stack((xv, yv), 2).reshape(-1, 2)
            grids.append(grid)
            expanded_strides.append(np.full((grid.shape[0], 1), stride))
        grids = np.concatenate(grids, 0)
        expanded_strides = np.concatenate(expanded_strides, 0)

        if grids.shape[0] != num_anchors:
            raise ModelExecutionError(
                f"YOLOX-family anchor count mismatch: a {target_w}x{target_h} input at strides {strides} "
                f"produces {grids.shape[0]} anchors, but the model output has {num_anchors}."
            )

        decoded = raw.astype(np.float64).copy()
        decoded[:, :2] = (decoded[:, :2] + grids) * expanded_strides
        decoded[:, 2:4] = np.exp(np.clip(decoded[:, 2:4], -20, 20)) * expanded_strides

        obj = decoded[:, 4]
        cls_scores = decoded[:, 5:]
        scores = obj[:, None] * cls_scores  # matches upstream: predictions[:, 4:5] * predictions[:, 5:]
        best_class_idx = np.argmax(scores, axis=1)
        best_conf = scores[np.arange(num_anchors), best_class_idx]

        candidate_idx = np.where(best_conf >= config.confidence_threshold)[0]
        if candidate_idx.size == 0:
            return []
        order = candidate_idx[np.argsort(-best_conf[candidate_idx])][: config.max_detections * 4]

        cx, cy, bw, bh = decoded[:, 0], decoded[:, 1], decoded[:, 2], decoded[:, 3]

        boxes: List[BoundingBox] = []
        kept_xyxy: List[List[float]] = []
        kept_classes: List[int] = []
        for idx in order:
            # ratio maps letterboxed/resized-space coordinates back to the
            # original image's pixel space.
            x1 = float((cx[idx] - bw[idx] / 2) / ratio)
            y1 = float((cy[idx] - bh[idx] / 2) / ratio)
            x2 = float((cx[idx] + bw[idx] / 2) / ratio)
            y2 = float((cy[idx] + bh[idx] / 2) / ratio)
            cls_idx = int(best_class_idx[idx])

            suppressed = False
            for k, (kx1, ky1, kx2, ky2) in enumerate(kept_xyxy):
                if kept_classes[k] != cls_idx:
                    continue
                if self._iou([x1, y1, x2, y2], [kx1, ky1, kx2, ky2]) > config.iou_threshold:
                    suppressed = True
                    break
            if suppressed:
                continue

            kept_xyxy.append([x1, y1, x2, y2])
            kept_classes.append(cls_idx)
            boxes.append(
                BoundingBox(
                    class_name=class_names[cls_idx],
                    confidence=float(round(best_conf[idx], 4)),
                    box=[round(x1, 1), round(y1, 1), round(x2 - x1, 1), round(y2 - y1, 1)],
                )
            )
            if len(boxes) >= config.max_detections:
                break

        return boxes

    @staticmethod
    def _iou(a: List[float], b: List[float]) -> float:
        ax1, ay1, ax2, ay2 = a
        bx1, by1, bx2, by2 = b
        ix1, iy1 = max(ax1, bx1), max(ay1, by1)
        ix2, iy2 = min(ax2, bx2), min(ay2, by2)
        iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
        inter = iw * ih
        area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
        area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
        union = area_a + area_b - inter
        return inter / union if union > 0 else 0.0

    def run_inference(
        self,
        image_path: str,
        model_path: str,
        preproc: Optional[PreprocessingConfig] = None,
        config: Optional[InferenceConfig] = None,
        class_names: Optional[List[str]] = None,
    ) -> List[BoundingBox]:
        with Image.open(image_path) as img:
            return self.run_inference_on_image(img, model_path, preproc, config, class_names)

    def run_inference_on_image(
        self,
        image: Image.Image,
        model_path: str,
        preproc: Optional[PreprocessingConfig] = None,
        config: Optional[InferenceConfig] = None,
        class_names: Optional[List[str]] = None,
    ) -> List[BoundingBox]:
        """Same as run_inference but takes an already-loaded/edited PIL
        image, so callers can build real probe images in memory (e.g. a
        clean image with a trigger patch stamped onto it) and run them
        through the actual model without round-tripping through disk."""
        preproc = preproc or PreprocessingConfig()
        config = config or InferenceConfig()
        class_names = class_names or self.default_classes

        arr, ratio = self.preprocess_image_with_ratio(image, preproc)

        ext = os.path.splitext(model_path)[1].lower()
        if ext in TORCHSCRIPT_EXTENSIONS:
            raw = self._run_torchscript(model_path, arr)
        else:
            session = self._get_session(model_path)
            input_name = session.get_inputs()[0].name
            outputs = session.run(None, {input_name: arr})
            raw = outputs[0]

        if raw.ndim == 3:
            raw = raw[0]
        elif raw.ndim != 2:
            raise ModelExecutionError(f"Unsupported output tensor rank {raw.ndim} from model {model_path}")

        # Two known output *contracts*, distinguished structurally (which
        # axis is anchors vs. channels) rather than by name/architecture
        # guesswork -- an explicit adapter choice, not a hardcoded special
        # case for one model:
        #   - this system's own fixtures: (channels, anchors), channels-first,
        #     single fixed grid stride, no separate objectness channel.
        #   - YOLOX-family real third-party exports: (anchors, channels),
        #     channels-last, three concatenated multi-stride anchor grids,
        #     a dedicated objectness channel. Channel count is always much
        #     smaller than anchor count for any real detector, so the
        #     smaller axis unambiguously identifies which convention this
        #     particular model's export uses.
        if raw.shape[0] < raw.shape[1]:
            num_anchors = raw.shape[1]
            grid_size = int(round(num_anchors ** 0.5))
            stride = max(1, preproc.resize[0] // max(1, grid_size))
            return self._decode(raw, config, class_names, stride)
        else:
            return self._decode_yolox_family(
                raw, config, class_names, (preproc.resize[0], preproc.resize[1]), ratio
            )
