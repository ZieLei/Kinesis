# Counter Scanner experiments

Offline experiments for the Counter Scanner (photo → inventory product). Nothing in this folder is used by the app, the backend or the installer, and its Python packages live in `ml/.venv`, never in the backend's venv.

## Idea in one paragraph

A pretrained image model turns every photo into a vector (an *embedding*). Photos of the same part land close together. To identify a part, compare its embedding to the embeddings of reference photos of every product and rank the products. There is no per-product training, so a new product only needs a few reference photos. Because many parts look alike, the result is a ranked list, and the cashier confirms.

## Setup (once)

```sh
python3 -m venv ml/.venv
ml/.venv/bin/pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
ml/.venv/bin/pip install -r ml/requirements.txt
```

The first run downloads the pretrained weights from the model hub (needs internet once; the shop itself never does).

## Photo folder

`ml/data/` is gitignored. Put photos here:

```
ml/data/pilot/<product>/<session>/<photo>
```

- `<product>`: the product's SKU or id, the same on every photo of that product.
- `<session>`: one sitting (one place, one lighting, one day), e.g. `2026-11-16-counter-evening`. Evaluation never mixes one session between reference and test photos, so every product needs **at least two sessions**.
- Photos: JPG, PNG, WebP or iPhone HEIC. Rotation is handled.

## Pilot protocol

- About **20 products**: the best sellers plus a few look-alike pairs (front/rear, different sizes).
- About **20 photos per product**, across **at least 3 sessions**.
- Shoot on the shop owner's iPhone, on the real counter.
- Frame it like the scanner will: one item, centred, filling most of the frame. The app will crop to a guide box.
- Vary angle, distance and lighting between sessions. Include a few slightly blurry shots and some with a hand holding the part.
- Do not shoot 20 near-identical frames in a row. Move the part between shots.

## Commands

Run from `ml/` (or set `PYTHONPATH=ml`):

```sh
cd ml
.venv/bin/python -m kinesis_ml.dataset data/pilot      # check layout, list photos per session
.venv/bin/python -m kinesis_ml.evaluate --data data/pilot --out reports/baseline
```

Options: `--backbone` (see `SUGGESTED_BACKBONES` in `embeddings.py`), `--method max|prototype`, `--shots 1,3,5,10`.

Reports land in `ml/reports/<name>/` (gitignored):

| File | Meaning |
|---|---|
| `summary.json` | top-1 / top-3 / top-5 accuracy, mean reciprocal rank |
| `learning_curve.csv/.png` | accuracy against the number of reference photos per product (how well a new product with few photos does) |
| `per_product.csv` | accuracy per product, weakest first |
| `confusion_pairs.csv` | which products get mistaken for which |
| `reject_curve.csv/.png` | a "no confident match" threshold: share answered, accuracy when answered, share of not-in-inventory items correctly refused |
| `per_photo.csv` | every tested photo with its rank |

## Reading the results

- Top-3 is the number that matters for the cashier UI, which shows ranked options.
- The learning curve shows whether more photos per product still help.
- Compare backbones and `--method` for an ablation table.
- Look at `confusion_pairs.csv`: pairs that are mistaken for each other are the ones needing extra photos, fine-tuning, or text reading (SKU on the part).
