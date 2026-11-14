import type { CounterDetector } from "./types";

/**
 * Placeholder detector: there is no model yet, so it finds nothing.
 * Replace the body of this factory (or the object it returns) to plug in a
 * real implementation; the Counter Scanner page needs no other change.
 */
export function createCounterDetector(): CounterDetector {
  return {
    async detect() {
      return [];
    },
  };
}
