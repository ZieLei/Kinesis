import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import MlkitOcr from "rn-mlkit-ocr";

import {
  isConfidentResult,
  mergeLinesIntoRows,
  rankGcashReferenceCandidates,
  type OcrLine,
  type RankedCandidate,
} from "./gcashReferenceCandidates";
import { CROP_PASSES, mapViewRectToImage, type GcashCapture } from "./gcashScanRegion";

// ML Kit wants Latin glyphs at least ~16px tall. Small crops are upscaled and
// very large ones downscaled (faster, no accuracy loss at that size).
const MIN_CROP_WIDTH = 1200;
const MAX_CROP_WIDTH = 2400;

async function recognizeRegion(
  source: Parameters<typeof ImageManipulator.manipulate>[0],
  crop: { x: number; y: number; width: number; height: number },
): Promise<OcrLine[]> {
  let context = ImageManipulator.manipulate(source).crop({
    originX: crop.x,
    originY: crop.y,
    width: crop.width,
    height: crop.height,
  });

  if (crop.width < MIN_CROP_WIDTH) {
    context = context.resize({ width: MIN_CROP_WIDTH });
  } else if (crop.width > MAX_CROP_WIDTH) {
    context = context.resize({ width: MAX_CROP_WIDTH });
  }

  const image = await context.renderAsync();
  try {
    const saved = await image.saveAsync({
      format: SaveFormat.PNG,
    });
    const result = await MlkitOcr.recognizeText(saved.uri, "latin");

    const lines = (result.blocks ?? []).flatMap((block) =>
      block.lines.map((line) => ({
        text: line.text,
        top: line.frame.y,
        bottom: line.frame.y + line.frame.height,
        left: line.frame.x,
      })),
    );

    return lines.length > 0
      ? mergeLinesIntoRows(lines, saved.height)
      : (result.text ?? "").split(/\r?\n/).map((text) => ({ text }));
  } finally {
    image.release();
    context.release();
  }
}

export async function scanGcashReference(
  capture: GcashCapture,
): Promise<RankedCandidate[]> {
  // Decode once and use the decoded (orientation-applied) pixel size, so the
  // crop math is based on the exact image that gets cropped.
  const fullContext = ImageManipulator.manipulate(capture.uri);
  const full = await fullContext.renderAsync();

  try {
    const passes: OcrLine[][] = [];
    let ranked: RankedCandidate[] = [];

    for (const padding of CROP_PASSES) {
      const crop = mapViewRectToImage(
        capture.guide,
        capture.viewport,
        { width: full.width, height: full.height },
        padding,
      );

      passes.push(await recognizeRegion(full, crop));
      ranked = rankGcashReferenceCandidates(passes);
      if (isConfidentResult(ranked)) break;
    }

    return ranked;
  } finally {
    full.release();
    fullContext.release();
  }
}
