"""Reads the photo folder: <root>/<product>/<session>/<photo>.

`product` is the product's SKU or id (whatever you named the folder; keep it
consistent with the inventory). `session` is one sitting, for example
`2026-11-16-counter-evening`. Evaluation never mixes photos from one session
between the reference set and the test set, so keep each sitting in its own
folder.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd
from PIL import Image, ImageOps

try:  # iPhone photos are HEIC by default.
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:  # pragma: no cover - only matters without pillow-heif
    pass

# The ml/ folder, wherever the scripts are run from.
ML_ROOT = Path(__file__).resolve().parents[1]

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}


def load_image(path: str | Path) -> Image.Image:
    """Opens a photo upright (EXIF rotation applied) as RGB."""
    with Image.open(path) as image:
        return ImageOps.exif_transpose(image).convert("RGB")


def scan_dataset(root: str | Path) -> tuple[pd.DataFrame, list[str]]:
    """Returns (photos, problems). `photos` has columns product, session, path."""
    root = Path(root)
    problems: list[str] = []
    rows: list[dict[str, str]] = []

    if not root.is_dir():
        raise FileNotFoundError(f"Dataset folder not found: {root}")

    for product_dir in sorted(p for p in root.iterdir() if p.is_dir() and not p.name.startswith(".")):
        for entry in sorted(product_dir.iterdir()):
            if entry.name.startswith("."):
                continue

            if entry.is_file() and entry.suffix.lower() in IMAGE_EXTENSIONS:
                problems.append(
                    f"{entry.relative_to(root)}: photo is not inside a session folder "
                    f"(expected {product_dir.name}/<session>/<photo>); skipped."
                )
            elif entry.is_dir():
                for photo in sorted(entry.rglob("*")):
                    if photo.is_file() and photo.suffix.lower() in IMAGE_EXTENSIONS:
                        rows.append(
                            {
                                "product": product_dir.name,
                                "session": entry.name,
                                "path": str(photo),
                            }
                        )

    photos = pd.DataFrame(rows, columns=["product", "session", "path"])
    return photos, problems


def summarize(photos: pd.DataFrame) -> list[str]:
    """Human-readable dataset summary and warnings."""
    if photos.empty:
        return ["No photos found."]

    per_product = photos.groupby("product").size()
    sessions_per_product = photos.groupby("product")["session"].nunique()

    lines = [
        f"{len(photos)} photos, {photos['product'].nunique()} products, "
        f"{photos['session'].nunique()} distinct session names",
        f"photos per product: min {per_product.min()}, median {int(per_product.median())}, "
        f"max {per_product.max()}",
    ]

    single = sorted(sessions_per_product[sessions_per_product < 2].index)
    if single:
        lines.append(
            f"WARNING: {len(single)} product(s) have only one session and cannot be "
            f"tested (they need a second sitting): {', '.join(single[:10])}"
            + (" ..." if len(single) > 10 else "")
        )

    few = sorted(per_product[per_product < 10].index)
    if few:
        lines.append(f"note: {len(few)} product(s) have fewer than 10 photos.")

    return lines


def main() -> None:
    parser = argparse.ArgumentParser(description="Check the photo folder layout.")
    parser.add_argument("root", nargs="?", default=str(ML_ROOT / "data" / "pilot"))
    args = parser.parse_args()

    photos, problems = scan_dataset(args.root)

    for line in summarize(photos):
        print(line)
    for problem in problems:
        print("PROBLEM:", problem)

    if not photos.empty:
        print()
        table = photos.groupby(["product", "session"]).size().unstack(fill_value=0)
        print(table.to_string())


if __name__ == "__main__":
    main()
