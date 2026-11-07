// TypeScript fallback. Expo Metro selects gcashOcr.native.ts for native apps
// and gcashOcr.web.ts for browsers.
import type { RankedCandidate } from "./gcashReferenceCandidates";
import type { GcashCapture } from "./gcashScanRegion";

export async function scanGcashReference(
  _capture: GcashCapture,
): Promise<RankedCandidate[]> {
  throw new Error("GCash receipt OCR is not available on this platform.");
}
