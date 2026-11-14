"""Turns photos into embedding vectors with a pretrained backbone.

No training happens here. A pretrained image model maps each photo to a vector
so that similar-looking items land close together. Vectors are L2-normalised,
so a dot product is cosine similarity.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import timm
import torch
from timm.data import create_transform, resolve_data_config
from torch.utils.data import DataLoader, Dataset

from .dataset import ML_ROOT, load_image

# Small, fast models first. All are pretrained on ImageNet and need no training.
DEFAULT_BACKBONE = "mobilenetv3_large_100.ra_in1k"
SUGGESTED_BACKBONES = [
    "mobilenetv3_large_100.ra_in1k",  # ~5M params; the realistic phone candidate
    "efficientnet_b0.ra_in1k",  # ~5M params
    "vit_small_patch14_dinov2.lvd142m",  # ~22M params; strong for fine-grained retrieval
]


class _Photos(Dataset):
    def __init__(self, paths: list[str], transform):
        self.paths = paths
        self.transform = transform

    def __len__(self) -> int:
        return len(self.paths)

    def __getitem__(self, index: int):
        return self.transform(load_image(self.paths[index]))


def load_backbone(name: str = DEFAULT_BACKBONE, device: str = "cpu"):
    """Returns (model, transform). The classifier head is removed."""
    model = timm.create_model(name, pretrained=True, num_classes=0).eval().to(device)
    config = resolve_data_config({}, model=model)
    transform = create_transform(**config)
    return model, transform


@torch.inference_mode()
def embed_paths(
    paths: list[str],
    name: str = DEFAULT_BACKBONE,
    device: str = "cpu",
    batch_size: int = 32,
    workers: int = 4,
) -> np.ndarray:
    model, transform = load_backbone(name, device)
    loader = DataLoader(
        _Photos(paths, transform),
        batch_size=batch_size,
        num_workers=workers,
        shuffle=False,
    )

    chunks = []
    for batch in loader:
        features = model(batch.to(device))
        features = torch.nn.functional.normalize(features, dim=1)
        chunks.append(features.cpu().numpy())

    if not chunks:
        return np.zeros((0, 0), dtype=np.float32)

    return np.concatenate(chunks).astype(np.float32)


def _stamp(path: str) -> str:
    stat = Path(path).stat()
    return f"{stat.st_size}:{int(stat.st_mtime)}"


def cached_embeddings(
    photos: pd.DataFrame,
    name: str = DEFAULT_BACKBONE,
    cache_dir: str | Path = ML_ROOT / "data" / "cache",
    **kwargs,
) -> np.ndarray:
    """Embeddings for every row of `photos`, computed once and cached on disk.

    A photo is re-embedded only if its file changed.
    """
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file = cache_dir / f"{name.replace('/', '_')}.npz"

    known: dict[str, tuple[str, np.ndarray]] = {}
    if cache_file.exists():
        stored = np.load(cache_file, allow_pickle=False)
        for path, stamp, vector in zip(stored["paths"], stored["stamps"], stored["vectors"]):
            known[str(path)] = (str(stamp), vector)

    paths = photos["path"].tolist()
    stamps = [_stamp(path) for path in paths]
    missing = [i for i, (p, s) in enumerate(zip(paths, stamps)) if p not in known or known[p][0] != s]

    if missing:
        print(f"Embedding {len(missing)} photo(s) with {name} ({len(paths) - len(missing)} cached)...")
        fresh = embed_paths([paths[i] for i in missing], name=name, **kwargs)
        for i, vector in zip(missing, fresh):
            known[paths[i]] = (stamps[i], vector)

        np.savez(
            cache_file,
            paths=np.array(list(known.keys())),
            stamps=np.array([v[0] for v in known.values()]),
            vectors=np.stack([v[1] for v in known.values()]),
        )

    return np.stack([known[p][1] for p in paths]).astype(np.float32)
