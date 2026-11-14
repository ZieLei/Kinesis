"""Session-split evaluation of photo-to-product matching.

Method (leave-one-session-out):
  for each session S:
      test photos      = photos taken in session S
      reference photos = photos from every OTHER session
  Each test photo is compared with the reference photos and every product gets
  a score; the products are then ranked. We measure how often the true product
  is ranked 1st (top-1) or within the first 3 / 5.

Why sessions, not random photos: photos taken seconds apart are near-copies, so
a random split would look far better than the shop will ever see.

Run from inside ml/:
    .venv/bin/python -m kinesis_ml.evaluate
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from .dataset import ML_ROOT, scan_dataset, summarize  # noqa: E402
from .embeddings import DEFAULT_BACKBONE, cached_embeddings  # noqa: E402


def product_scores(
    queries: np.ndarray,
    gallery: np.ndarray,
    gallery_product: np.ndarray,
    product_count: int,
    method: str,
) -> np.ndarray:
    """(queries x products) similarity; -inf for products with no reference photo."""
    scores = np.full((len(queries), product_count), -np.inf, dtype=np.float32)

    for product in np.unique(gallery_product):
        vectors = gallery[gallery_product == product]

        if method == "prototype":
            prototype = vectors.mean(axis=0)
            prototype /= np.linalg.norm(prototype) + 1e-12
            scores[:, product] = queries @ prototype
        else:  # "max": the single most similar reference photo
            scores[:, product] = (queries @ vectors.T).max(axis=1)

    return scores


def run_folds(
    embeddings: np.ndarray,
    photos: pd.DataFrame,
    method: str,
    shots: int | None,
    rng: np.random.Generator,
) -> pd.DataFrame:
    """One row per testable photo: rank of the true product and score details."""
    products = sorted(photos["product"].unique())
    product_index = photos["product"].map({p: i for i, p in enumerate(products)}).to_numpy()
    sessions = photos["session"].to_numpy()
    rows = []

    for session in np.unique(sessions):
        test = np.flatnonzero(sessions == session)
        reference = np.flatnonzero(sessions != session)

        if shots is not None:
            # Pretend each product only has `shots` reference photos.
            kept = []
            for product in np.unique(product_index[reference]):
                mine = reference[product_index[reference] == product]
                kept.extend(rng.choice(mine, size=min(shots, len(mine)), replace=False))
            reference = np.array(sorted(kept), dtype=int)

        if len(reference) == 0:
            continue

        scores = product_scores(
            embeddings[test], embeddings[reference], product_index[reference], len(products), method
        )

        for row, photo in enumerate(test):
            true = product_index[photo]
            true_score = scores[row, true]

            if not np.isfinite(true_score):
                continue  # this product has no reference photo from another session

            others = np.delete(scores[row], true)
            rows.append(
                {
                    "path": photos["path"].iloc[photo],
                    "product": products[true],
                    "session": session,
                    "rank": int(1 + (scores[row] > true_score).sum()),
                    "top_score": float(scores[row].max()),
                    "top_product": products[int(scores[row].argmax())],
                    # Best score if the true product were NOT in the inventory.
                    "unknown_score": float(others.max()) if others.size else -1.0,
                }
            )

    return pd.DataFrame(rows)


def accuracy(results: pd.DataFrame) -> dict[str, float]:
    ranks = results["rank"].to_numpy()
    return {
        "photos_tested": int(len(ranks)),
        "top1": float((ranks <= 1).mean()),
        "top3": float((ranks <= 3).mean()),
        "top5": float((ranks <= 5).mean()),
        "mrr": float((1.0 / ranks).mean()),
    }


def reject_curve(results: pd.DataFrame) -> pd.DataFrame:
    """How a 'no confident match' threshold trades coverage against accuracy.

    answered   = share of real products' photos the scanner would answer for
    accuracy   = of those, how many were ranked first
    unknown_rejected = if the item were NOT in inventory, share correctly refused
    """
    lows = min(results["top_score"].min(), results["unknown_score"].min())
    highs = max(results["top_score"].max(), results["unknown_score"].max())
    rows = []

    for threshold in np.linspace(lows, highs, 25):
        answered = results["top_score"] >= threshold
        rows.append(
            {
                "threshold": round(float(threshold), 3),
                "answered": float(answered.mean()),
                "accuracy_of_answered": float((results.loc[answered, "rank"] == 1).mean()) if answered.any() else float("nan"),
                "unknown_rejected": float((results["unknown_score"] < threshold).mean()),
            }
        )

    return pd.DataFrame(rows)


def confusions(results: pd.DataFrame) -> pd.DataFrame:
    wrong = results[results["rank"] > 1]
    pairs = wrong.groupby(["product", "top_product"]).size().rename("times").reset_index()
    return pairs.sort_values("times", ascending=False)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", default=str(ML_ROOT / "data" / "pilot"))
    parser.add_argument("--backbone", default=DEFAULT_BACKBONE)
    parser.add_argument("--method", choices=["max", "prototype"], default="max",
                        help="max: nearest reference photo; prototype: average vector per product")
    parser.add_argument("--shots", default="1,3,5,10", help="reference photos per product to try, comma separated")
    parser.add_argument("--repeats", type=int, default=5, help="random draws for each shots value")
    parser.add_argument("--out", default=str(ML_ROOT / "reports" / "latest"))
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    photos, problems = scan_dataset(args.data)
    for line in summarize(photos):
        print(line)
    for problem in problems:
        print("PROBLEM:", problem)
    if photos.empty or photos["session"].nunique() < 2:
        raise SystemExit("Need photos from at least two sessions to evaluate.")

    embeddings = cached_embeddings(photos, args.backbone, device=args.device, workers=args.workers)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(args.seed)

    results = run_folds(embeddings, photos, args.method, None, rng)
    if results.empty:
        raise SystemExit("No testable photos: every product needs photos in at least two sessions.")

    overall = accuracy(results)
    skipped = len(photos) - overall["photos_tested"]
    per_product = (
        results.assign(top1=results["rank"] == 1, top3=results["rank"] <= 3)
        .groupby("product")[["top1", "top3"]].mean()
        .join(results.groupby("product").size().rename("photos"))
        .sort_values("top1")
    )
    pairs = confusions(results)
    curve = reject_curve(results)

    # Learning curve: accuracy vs how many reference photos each product has.
    shot_rows = []
    for shots in [int(s) for s in args.shots.split(",") if s.strip()]:
        runs = [accuracy(run_folds(embeddings, photos, args.method, shots, rng)) for _ in range(args.repeats)]
        shot_rows.append(
            {
                "reference_photos_per_product": shots,
                "top1": float(np.mean([r["top1"] for r in runs])),
                "top1_std": float(np.std([r["top1"] for r in runs])),
                "top3": float(np.mean([r["top3"] for r in runs])),
            }
        )
    shot_rows.append({"reference_photos_per_product": "all", "top1": overall["top1"], "top1_std": 0.0, "top3": overall["top3"]})
    learning = pd.DataFrame(shot_rows)

    results.to_csv(out / "per_photo.csv", index=False)
    per_product.to_csv(out / "per_product.csv")
    pairs.to_csv(out / "confusion_pairs.csv", index=False)
    curve.to_csv(out / "reject_curve.csv", index=False)
    learning.to_csv(out / "learning_curve.csv", index=False)
    (out / "summary.json").write_text(
        json.dumps({"backbone": args.backbone, "method": args.method, **overall, "photos_not_testable": skipped}, indent=2)
    )

    numeric = learning[learning["reference_photos_per_product"] != "all"]
    if len(numeric):
        fig, ax = plt.subplots(figsize=(5, 3.5))
        ax.errorbar(numeric["reference_photos_per_product"], numeric["top1"], yerr=numeric["top1_std"], marker="o", label="top-1")
        ax.plot(numeric["reference_photos_per_product"], numeric["top3"], marker="s", label="top-3")
        ax.set_xlabel("reference photos per product")
        ax.set_ylabel("accuracy")
        ax.set_ylim(0, 1.02)
        ax.legend()
        ax.grid(alpha=0.3)
        fig.tight_layout()
        fig.savefig(out / "learning_curve.png", dpi=150)
        plt.close(fig)

    fig, ax = plt.subplots(figsize=(5, 3.5))
    ax.plot(curve["threshold"], curve["answered"], label="photos answered")
    ax.plot(curve["threshold"], curve["accuracy_of_answered"], label="accuracy when answered")
    ax.plot(curve["threshold"], curve["unknown_rejected"], label="unknown items refused")
    ax.set_xlabel("minimum match score")
    ax.set_ylim(0, 1.02)
    ax.legend(fontsize=8)
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(out / "reject_curve.png", dpi=150)
    plt.close(fig)

    print(f"\nBackbone {args.backbone}, scoring '{args.method}'")
    print(f"Tested {overall['photos_tested']} photos ({skipped} could not be tested: product seen in only one session)")
    print(f"top-1 {overall['top1']:.1%}   top-3 {overall['top3']:.1%}   top-5 {overall['top5']:.1%}   MRR {overall['mrr']:.3f}")
    print("\nAccuracy by reference photos per product:")
    print(learning.to_string(index=False, float_format=lambda v: f"{v:.3f}"))
    print("\nWeakest products:")
    print(per_product.head(8).to_string(float_format=lambda v: f"{v:.2f}"))
    if len(pairs):
        print("\nMost common mix-ups (true product -> what it was matched to):")
        print(pairs.head(8).to_string(index=False))
    print(f"\nFull report written to {out}/")


if __name__ == "__main__":
    main()
