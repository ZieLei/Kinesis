import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import jsQR from "jsqr";
import { Camera } from "lucide-react-native";

import type { PairingScannerProps } from "./PairingScanner";

type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
};

type BarcodeDetectorConstructor = new (options: {
  formats: string[];
}) => BarcodeDetectorLike;

type CameraState = "idle" | "starting" | "scanning" | "error";

const SCAN_INTERVAL_MS = 250;

function createNativeDetector(): BarcodeDetectorLike | null {
  const Detector = (
    globalThis as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
  ).BarcodeDetector;

  if (!Detector) {
    return null;
  }

  try {
    return new Detector({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

function cameraErrorMessage(error: unknown): string {
  const name = (error as { name?: string } | null)?.name;

  if (name === "NotAllowedError") {
    return "Camera access was denied. Allow camera access for this site in the browser settings, or paste the pairing code below.";
  }

  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found. Paste the pairing code shown in Terminal Management instead.";
  }

  return "The camera could not start. Paste the pairing code shown in Terminal Management instead.";
}

/**
 * Browser QR scanner.
 *
 * expo-camera's web scanner depends on the BarcodeDetector API, which
 * Safari (including iPhone) and Firefox do not provide. This scanner uses
 * BarcodeDetector where available and otherwise decodes frames with jsQR.
 * Camera access requires a secure (HTTPS) origin. A paste field covers
 * computers without a camera; it submits the same single-use code.
 */
export function PairingScanner({
  scanEnabled,
  onScanned,
  onError,
  pausedContent,
}: PairingScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [cameraMessage, setCameraMessage] = useState("");
  const [pastedCode, setPastedCode] = useState("");

  const secureContext =
    typeof window !== "undefined" && window.isSecureContext;

  const cameraAvailable =
    secureContext &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;

  const stopCamera = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraState("idle");
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  useEffect(() => {
    if (!scanEnabled) {
      stopCamera();
    }
  }, [scanEnabled, stopCamera]);

  const startCamera = useCallback(async () => {
    if (!cameraAvailable || cameraState !== "idle") {
      return;
    }

    setCameraState("starting");
    setCameraMessage("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      streamRef.current = stream;

      const video = videoRef.current;

      if (!video) {
        stopCamera();
        return;
      }

      video.srcObject = stream;
      await video.play();

      setCameraState("scanning");

      const detector = createNativeDetector();
      let busy = false;

      timerRef.current = window.setInterval(async () => {
        if (busy || video.readyState < 2) {
          return;
        }

        busy = true;

        try {
          let value: string | null = null;

          if (detector) {
            const codes = await detector.detect(video);
            value = codes[0]?.rawValue ?? null;
          } else {
            const canvas = (canvasRef.current ??=
              document.createElement("canvas"));

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const context = canvas.getContext("2d", {
              willReadFrequently: true,
            });

            if (context && canvas.width > 0 && canvas.height > 0) {
              context.drawImage(video, 0, 0, canvas.width, canvas.height);

              const image = context.getImageData(
                0,
                0,
                canvas.width,
                canvas.height,
              );

              value =
                jsQR(image.data, image.width, image.height, {
                  inversionAttempts: "dontInvert",
                })?.data ?? null;
            }
          }

          if (value) {
            stopCamera();
            onScanned(value);
          }
        } catch {
          // A single frame failing to decode is normal; keep scanning.
        } finally {
          busy = false;
        }
      }, SCAN_INTERVAL_MS);
    } catch (error) {
      stopCamera();

      const message = cameraErrorMessage(error);

      setCameraState("error");
      setCameraMessage(message);
      onError(message);
    }
  }, [cameraAvailable, cameraState, onError, onScanned, stopCamera]);

  const submitPastedCode = () => {
    const value = pastedCode.trim();

    if (!value) {
      return;
    }

    setPastedCode("");
    onScanned(value);
  };

  return (
    <View className="mt-4 gap-3">
      <View className="overflow-hidden rounded-xl border border-ctp-surface1 bg-black">
        {scanEnabled ? (
          <View className="h-[280px] items-center justify-center">
            <video
              ref={videoRef}
              muted
              playsInline
              aria-label="Camera preview for scanning the pairing QR code"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: cameraState === "scanning" ? "block" : "none",
              }}
            />

            {cameraState !== "scanning" && (
              <View className="items-center px-5">
                <Camera size={30} color="#cba6f7" />

                <Text className="mt-3 text-center font-line-seed text-xs leading-5 text-white/70">
                  {!secureContext
                    ? "The camera needs a secure connection. Open Kinesis using its https:// address, or paste the pairing code below."
                    : !cameraAvailable
                      ? "This browser cannot use the camera. Paste the pairing code below."
                      : cameraMessage ||
                        "Point the camera at the QR code shown in Terminal Management."}
                </Text>

                {cameraAvailable && cameraState !== "error" && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void startCamera()}
                    disabled={cameraState === "starting"}
                    className="mt-4 min-h-11 items-center justify-center rounded-lg bg-ctp-mauve px-5"
                  >
                    <Text className="font-line-seed text-xs font-bold text-ctp-crust">
                      {cameraState === "starting"
                        ? "Starting camera..."
                        : "Start camera"}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        ) : (
          pausedContent
        )}
      </View>

      {scanEnabled && (
        <View className="rounded-xl border border-ctp-surface1 bg-ctp-base p-3">
          <Text className="font-line-seed text-[11px] font-semibold uppercase tracking-wide text-ctp-subtext0">
            No camera? Paste the pairing code
          </Text>

          <TextInput
            value={pastedCode}
            onChangeText={setPastedCode}
            onSubmitEditing={submitPastedCode}
            placeholder="KINESIS-PAIRING:v1:..."
            placeholderTextColor="#6c7086"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            className="mt-2 min-h-11 rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 font-line-seed text-xs text-ctp-text"
          />

          <Pressable
            accessibilityRole="button"
            onPress={submitPastedCode}
            disabled={!pastedCode.trim()}
            className="mt-2 min-h-11 items-center justify-center rounded-lg bg-ctp-mauve px-4 disabled:opacity-50"
          >
            <Text className="font-line-seed text-xs font-bold text-ctp-crust">
              Pair with code
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
