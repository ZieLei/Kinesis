// Shared geometry for the GCash reference scanner.
//
// The on-screen guide and the OCR crop are both derived from the same
// rectangle so that "what the cashier lines up" is exactly "what gets read".

export type Size = { width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };

/**
 * Width:height of the scanning guide. A GCash reference line
 * ("Ref No. 1234 567 890123") is roughly 8–10x wider than it is tall; 4.5:1
 * leaves vertical slack for hand shake and a few degrees of tilt while still
 * excluding the amount / phone number rows above and below.
 */
export const GUIDE_ASPECT_RATIO = 4.5;
const GUIDE_WIDTH_FRACTION = 0.88;
const GUIDE_MAX_WIDTH = 560;

/** Guide rectangle in camera-view coordinates (centered). */
export function getGuideRect(view: Size): Rect {
  const width = Math.min(view.width * GUIDE_WIDTH_FRACTION, GUIDE_MAX_WIDTH);
  const height = Math.min(width / GUIDE_ASPECT_RATIO, view.height * 0.5);

  return {
    x: (view.width - width) / 2,
    y: (view.height - height) / 2,
    width,
    height,
  };
}

/**
 * Maps a rectangle from the camera preview into captured-image pixels.
 *
 * Every platform's preview is rendered "aspect fill" (iOS resizeAspectFill,
 * Android PreviewView FILL_CENTER, web `object-fit: cover`), so the photo is
 * scaled until it covers the view and the overflow is cropped equally on both
 * sides. `padding` grows the region by a fraction of the guide size to tolerate
 * slight misalignment between the preview and the still capture.
 */
export function mapViewRectToImage(
  rect: Rect,
  view: Size,
  image: Size,
  padding: { x: number; y: number } = { x: 0, y: 0 },
): Rect {
  const scale = Math.max(view.width / image.width, view.height / image.height);
  const offsetX = (image.width * scale - view.width) / 2;
  const offsetY = (image.height * scale - view.height) / 2;

  const padX = rect.width * padding.x;
  const padY = rect.height * padding.y;

  const left = Math.max(0, (rect.x - padX + offsetX) / scale);
  const top = Math.max(0, (rect.y - padY + offsetY) / scale);
  const right = Math.min(
    image.width,
    (rect.x + rect.width + padX + offsetX) / scale,
  );
  const bottom = Math.min(
    image.height,
    (rect.y + rect.height + padY + offsetY) / scale,
  );

  const x = Math.floor(left);
  const y = Math.floor(top);

  return {
    x,
    y,
    width: Math.max(1, Math.floor(right) - x),
    height: Math.max(1, Math.floor(bottom) - y),
  };
}

/** Input shared by the platform OCR implementations. */
export type GcashCapture = {
  uri: string;
  /** Size of the camera preview view the guide was drawn in. */
  viewport: Size;
  /** Guide rectangle in viewport coordinates. */
  guide: Rect;
};

/** Crop paddings tried in order: tight first, then a taller band. */
export const CROP_PASSES = [
  { x: 0.03, y: 0.15 },
  { x: 0.03, y: 0.6 },
] as const;
