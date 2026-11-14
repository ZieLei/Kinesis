import type { Product } from "@/types/product";

/**
 * Contract between the Counter Scanner page and whatever turns a camera frame
 * into product matches. The page only knows these types, so a trained model
 * (running in the browser, in a worker, or behind a server call) can replace
 * the stub in detector.ts without changes to the page.
 */

/** One captured camera frame. */
export type CounterFrame = {
  /** Pixel source (a video element on the web). Not retained by the page. */
  source: CanvasImageSource;
  width: number;
  height: number;
  /** Capture time, milliseconds since the epoch. */
  timestamp: number;
  /**
   * The part of the frame the cashier framed in the guide box. A detector
   * should look only inside it: one item per scan.
   */
  region?: CounterBox;
};

/** Region of the frame, as fractions (0 to 1) of its width and height. */
export type CounterBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** A possible product for something seen in the frame. */
export type ProductMatch = {
  /** `Product.id` from the inventory API. */
  productId: number;
  /** 0 to 1. Only meaningful relative to other matches for the same item. */
  confidence: number;
};

/**
 * One thing found on the counter. Many motorcycle parts look alike, so a
 * detection carries ranked alternatives instead of a single answer; the
 * cashier picks the right one.
 */
export type CounterDetection = {
  /** Best guess. */
  best: ProductMatch;
  /** Other plausible products, most likely first. */
  alternates?: ProductMatch[];
  /** How many of this item were seen. Defaults to 1. */
  quantity?: number;
  box?: CounterBox;
};

export type CounterDetectContext = {
  /** Current inventory, so a detector never needs its own product list. */
  inventory: readonly Product[];
  /** Aborted when the page leaves or a newer scan starts. */
  signal?: AbortSignal;
};

export interface CounterDetector {
  /**
   * Looks for inventory products in a frame. Resolves to an empty list when
   * nothing is recognised. Must reject only for real failures.
   */
  detect(
    frame: CounterFrame,
    context: CounterDetectContext,
  ): Promise<CounterDetection[]>;

  /** Releases workers, models or connections. */
  dispose?(): void;
}
