/**
 * Browser compatibility for expo-camera on the web.
 *
 * expo-camera's web stream code (WebCameraUtils.getPreferredStreamDevice)
 * retries with the other camera when a request fails with
 * `error instanceof OverconstrainedError`. Chrome defines that global;
 * Firefox does not (it throws a plain Error named "OverconstrainedError"), so
 * the check itself threw "OverconstrainedError is not defined", which hid the
 * real camera error and skipped the fallback.
 *
 * This defines a stand-in that matches errors by name. Browsers that have
 * the real class are left untouched. Importing the module is enough.
 */

// Typed loosely on purpose: the DOM lib declares OverconstrainedError as always present.
const scope = globalThis as unknown as Record<string, unknown>;

if (typeof window !== "undefined" && typeof scope.OverconstrainedError === "undefined") {
  class OverconstrainedErrorCompat extends Error {
    constraint?: string;

    static [Symbol.hasInstance](value: unknown): boolean {
      return (
        typeof value === "object" &&
        value !== null &&
        (value as { name?: unknown }).name === "OverconstrainedError"
      );
    }
  }

  scope.OverconstrainedError = OverconstrainedErrorCompat;
}

export {};
