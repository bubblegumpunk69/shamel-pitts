"""Pose estimation backends.

Each backend exposes the same interface so they can be swapped via config:

    backend = get_backend("rtmpose")
    keypoints, scores = backend.estimate(image_bgr)

Returns:
    keypoints: ndarray (N, K, 2) — (x, y) in image pixels, one person at index 0
    scores:    ndarray (N, K)    — per-keypoint confidence in [0, 1]
"""

from abc import ABC, abstractmethod
from typing import Tuple

import numpy as np


class PoseBackend(ABC):
    name: str
    keypoint_names: list[str]

    @abstractmethod
    def estimate(self, image_bgr: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        ...


class RTMPoseBackend(PoseBackend):
    """RTMPose via rtmlib + onnxruntime (no MMPose install required)."""

    name = "rtmpose"
    # COCO-WholeBody body keypoints (17 standard COCO body keypoints first)
    keypoint_names = [
        "nose", "left_eye", "right_eye", "left_ear", "right_ear",
        "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
        "left_wrist", "right_wrist", "left_hip", "right_hip",
        "left_knee", "right_knee", "left_ankle", "right_ankle",
    ]

    def __init__(self):
        from rtmlib import Body
        # 'balanced' = RTMPose-m, good accuracy/speed tradeoff on CPU
        self.model = Body(mode="balanced", to_openpose=False, backend="onnxruntime", device="cpu")

    def estimate(self, image_bgr: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        keypoints, scores = self.model(image_bgr)
        return keypoints, scores


class MediaPipeBackend(PoseBackend):
    """MediaPipe Pose — fallback, single person, 33 landmarks."""

    name = "mediapipe"
    keypoint_names = [
        "nose", "left_eye_inner", "left_eye", "left_eye_outer",
        "right_eye_inner", "right_eye", "right_eye_outer",
        "left_ear", "right_ear", "mouth_left", "mouth_right",
        "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
        "left_wrist", "right_wrist", "left_pinky", "right_pinky",
        "left_index", "right_index", "left_thumb", "right_thumb",
        "left_hip", "right_hip", "left_knee", "right_knee",
        "left_ankle", "right_ankle", "left_heel", "right_heel",
        "left_foot_index", "right_foot_index",
    ]

    def __init__(self):
        import mediapipe as mp
        self.pose = mp.solutions.pose.Pose(
            static_image_mode=False,
            model_complexity=2,
            enable_segmentation=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

    def estimate(self, image_bgr: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        import cv2
        rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        h, w = image_bgr.shape[:2]
        result = self.pose.process(rgb)
        if result.pose_landmarks is None:
            k = len(self.keypoint_names)
            return np.zeros((1, k, 2)), np.zeros((1, k))
        lms = result.pose_landmarks.landmark
        kp = np.array([[lm.x * w, lm.y * h] for lm in lms]).reshape(1, -1, 2)
        sc = np.array([lm.visibility for lm in lms]).reshape(1, -1)
        return kp, sc


def get_backend(name: str) -> PoseBackend:
    name = name.lower()
    if name == "rtmpose":
        return RTMPoseBackend()
    if name == "mediapipe":
        return MediaPipeBackend()
    raise ValueError(f"Unknown pose backend: {name}")


def get_backend_with_fallback(order: list[str]) -> PoseBackend:
    last_err = None
    for name in order:
        try:
            print(f"Trying pose backend: {name}")
            return get_backend(name)
        except Exception as e:
            print(f"  {name} unavailable: {e}")
            last_err = e
    raise RuntimeError(f"No pose backend available. Last error: {last_err}")
