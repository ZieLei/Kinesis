import { createWorker, type PSM } from "tesseract.js";

import {
  isConfidentResult,
  mergeLinesIntoRows,
  rankGcashReferenceCandidates,
  type OcrLine,
  type RankedCandidate,
} from "./gcashReferenceCandidates";
import {
  CROP_PASSES,
  mapViewRectToImage,
  type GcashCapture,
  type Rect,
} from "./gcashScanRegion";

let workerPromise: ReturnType<typeof createWorker> | null = null;

function getWorker(): ReturnType<typeof createWorker> {
  if (!workerPromise) {
    // Kinesis serves these OCR files from its own origin. No receipt image,
    // OCR worker, language model, or WASM core is fetched from a third party.
    const ocrBase = `${window.location.origin}/tesseract`;
    const pendingWorker = createWorker("eng", 1, {
      workerPath: `${ocrBase}/worker.min.js`,
      corePath: `${ocrBase}/core`,
      langPath: `${ocrBase}/lang`,
      gzip: true,
      cacheMethod: "write",
      workerBlobURL: false,
    });

    workerPromise = pendingWorker;
    pendingWorker.catch(() => {
      if (workerPromise === pendingWorker) {
        workerPromise = null;
      }
    });
  }

  return workerPromise;
}

// Tesseract is most accurate with glyphs ~30–40px tall. Scale the crop so the
// reference line lands near that, without exploding the pixel count.
const TARGET_CROP_WIDTH = 1800;
const MAX_UPSCALE = 3;

async function loadImage(uri: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = uri;
  await image.decode();
  return image;
}

/** Crops, upscales, and converts the region to luminance values. */
function cropToGray(
  image: HTMLImageElement,
  crop: Rect,
  rotateDegrees = 0,
): { gray: Uint8ClampedArray; width: number; height: number } {
  const scale = Math.min(
    MAX_UPSCALE,
    Math.max(1, TARGET_CROP_WIDTH / crop.width),
  );
  const width = Math.round(crop.width * scale);
  const height = Math.round(crop.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is not available for OCR.");

  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  if (rotateDegrees !== 0) {
    context.translate(width / 2, height / 2);
    context.rotate((rotateDegrees * Math.PI) / 180);
    context.translate(-width / 2, -height / 2);
  }

  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    width,
    height,
  );

  const { data } = context.getImageData(0, 0, width, height);
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < gray.length; i += 1, p += 4) {
    gray[i] = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
  }

  return { gray, width, height };
}

/**
 * Percentile contrast stretch (handles dim / washed-out captures), and
 * inversion so text is always dark on light (handles dark-mode screens).
 */
function normalizeContrast(gray: Uint8ClampedArray): Uint8ClampedArray {
  const histogram = new Uint32Array(256);
  for (const value of gray) histogram[value] += 1;

  const percentile = (fraction: number) => {
    const target = gray.length * fraction;
    let count = 0;
    for (let value = 0; value < 256; value += 1) {
      count += histogram[value];
      if (count >= target) return value;
    }
    return 255;
  };

  const low = percentile(0.02);
  const high = percentile(0.98);
  const range = Math.max(1, high - low);
  // Background is the majority of the crop, so the median tells us whether
  // the background is light (paper / light mode) or dark (dark-mode screen).
  const invert = percentile(0.5) < (low + high) / 2;

  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i += 1) {
    const stretched = ((gray[i] - low) * 255) / range;
    out[i] = invert ? 255 - stretched : stretched;
  }
  return out;
}

/**
 * Bradley adaptive threshold: compares each pixel to its local mean, so
 * shadows, glare, and uneven lighting across the receipt don't wipe out text
 * the way a single global threshold would.
 */
function adaptiveThreshold(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      rowSum += gray[y * width + x];
      integral[(y + 1) * (width + 1) + (x + 1)] =
        integral[y * (width + 1) + (x + 1)] + rowSum;
    }
  }

  const half = Math.max(8, Math.round(Math.min(width, height * 4) / 16));
  const out = new Uint8ClampedArray(gray.length);

  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(height - 1, y + half);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(width - 1, x + half);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const total =
        integral[(y1 + 1) * (width + 1) + (x1 + 1)] -
        integral[y0 * (width + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (width + 1) + x0] +
        integral[y0 * (width + 1) + x0];
      out[y * width + x] = gray[y * width + x] * area < total * 0.85 ? 0 : 255;
    }
  }

  return out;
}

function grayToCanvas(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available for OCR.");

  const imageData = context.createImageData(width, height);
  for (let i = 0, p = 0; i < gray.length; i += 1, p += 4) {
    imageData.data[p] = gray[i];
    imageData.data[p + 1] = gray[i];
    imageData.data[p + 2] = gray[i];
    imageData.data[p + 3] = 255;
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}

type Pass = {
  padding: (typeof CROP_PASSES)[number];
  rotate: number;
  binarize: boolean;
  digitsOnly: boolean;
};

// Ordered cheapest/most-likely first; scanning stops once a result is
// confident. Rotated passes cover receipts held a few degrees off level.
const PASSES: Pass[] = [
  { padding: CROP_PASSES[0], rotate: 0, binarize: false, digitsOnly: false },
  { padding: CROP_PASSES[0], rotate: 0, binarize: true, digitsOnly: false },
  { padding: CROP_PASSES[0], rotate: 0, binarize: true, digitsOnly: true },
  { padding: CROP_PASSES[1], rotate: 0, binarize: true, digitsOnly: false },
  { padding: CROP_PASSES[0], rotate: -3, binarize: true, digitsOnly: false },
  { padding: CROP_PASSES[0], rotate: 3, binarize: true, digitsOnly: false },
];

export async function scanGcashReference(
  capture: GcashCapture,
): Promise<RankedCandidate[]> {
  const [worker, image] = await Promise.all([
    getWorker(),
    loadImage(capture.uri),
  ]);
  // Use the decoded frame size: the camera's reported track size can be in
  // the sensor orientation rather than the displayed one on mobile browsers.
  const imageSize = { width: image.naturalWidth, height: image.naturalHeight };

  const results: OcrLine[][] = [];
  let ranked: RankedCandidate[] = [];

  for (const pass of PASSES) {
    const crop = mapViewRectToImage(
      capture.guide,
      capture.viewport,
      imageSize,
      pass.padding,
    );
    const { gray, width, height } = cropToGray(image, crop, pass.rotate);
    const contrasted = normalizeContrast(gray);
    const pixels = pass.binarize
      ? adaptiveThreshold(contrasted, width, height)
      : contrasted;

    await worker.setParameters({
      // Single uniform block: tolerates the label row plus a neighbouring row.
      tessedit_pageseg_mode: "6" as PSM,
      tessedit_char_whitelist: pass.digitsOnly ? "0123456789" : "",
      user_defined_dpi: "300",
    });

    const { data } = await worker.recognize(
      grayToCanvas(pixels, width, height),
      {},
      { text: true, blocks: true },
    );

    const lines = (data.blocks ?? []).flatMap((block) =>
      block.paragraphs.flatMap((paragraph) =>
        paragraph.lines.map((line) => ({
          text: line.text.trim(),
          top: line.bbox.y0,
          bottom: line.bbox.y1,
          left: line.bbox.x0,
        })),
      ),
    );

    results.push(
      lines.length > 0
        ? mergeLinesIntoRows(lines, height)
        : (data.text ?? "").split(/\r?\n/).map((text) => ({ text })),
    );

    ranked = rankGcashReferenceCandidates(results);
    if (isConfidentResult(ranked)) break;
  }

  return ranked;
}
