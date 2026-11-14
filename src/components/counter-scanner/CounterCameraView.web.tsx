import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import Camera from "lucide-react-native/icons/camera";

import { styledIcon } from "@/components/StyledIcon";

import type { CounterCameraViewProps } from "./CounterCameraView";

const CameraIcon = styledIcon(Camera);

/** Side of the square guide, in CSS px. The cashier frames one item in it. */
const GUIDE_SIZE = 196;

type CameraState = "starting" | "live" | "error";

/** Browser camera errors, in words a cashier can act on. */
function describeCameraError(error: unknown): string {
  const name = (error as { name?: unknown } | null)?.name;

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "The browser is blocking the camera for this site. Tap the icon left of the address bar, open Permissions (or Site settings), set Camera to Allow, then try again.";
    case "NotReadableError":
    case "AbortError":
    case "TrackStartError":
      return "The camera is busy. Close other apps or browser tabs that use the camera, then try again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No usable camera was found on this device.";
    default:
      return `The camera could not be started${typeof name === "string" && name ? ` (${name})` : ""}.`;
  }
}

/**
 * Live browser camera preview. Uses getUserMedia like the pairing scanner
 * (HTTPS only) and keeps the stream open only while `active`, so a screen
 * left in the background never holds the camera.
 */
export function CounterCameraView({
  active,
  captureRef,
  onReadyChange,
}: CounterCameraViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [state, setState] = useState<CameraState>("starting");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);

  const secureContext =
    typeof window !== "undefined" && window.isSecureContext;
  const supported =
    secureContext &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;

  const unsupportedMessage = supported
    ? ""
    : secureContext
      ? "This browser cannot use the camera."
      : "The camera needs a secure connection. Open Kinesis using its https:// address.";

  const setReady = useCallback(
    (ready: boolean) => onReadyChange?.(ready),
    [onReadyChange],
  );

  useEffect(() => {
    if (!active || !supported) return;

    let cancelled = false;

    const stop = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;

      if (videoRef.current) videoRef.current.srcObject = null;

      captureRef.current = null;
      setReady(false);
    };

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // A modest resolution keeps frames cheap on low-end phones.
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const video = videoRef.current;

        if (!video) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        video.srcObject = stream;
        await video.play();

        if (cancelled) return;

        captureRef.current = () => {
          if (video.readyState < 2 || video.videoWidth === 0) return null;

          // The preview is cropped to fill its box ("cover"), and the guide
          // sits in the middle of it, so the guide is also the middle of the
          // full frame: convert its on-screen size to frame fractions.
          const scale = Math.max(
            video.clientWidth / video.videoWidth,
            video.clientHeight / video.videoHeight,
          );
          const side = Math.min(
            GUIDE_SIZE,
            video.clientWidth * 0.9, // the guide's maxWidth on narrow screens
            video.clientHeight,
          );
          const guideWidth = Math.min(1, side / scale / video.videoWidth);
          const guideHeight = Math.min(1, side / scale / video.videoHeight);

          return {
            source: video,
            width: video.videoWidth,
            height: video.videoHeight,
            timestamp: Date.now(),
            region: {
              x: (1 - guideWidth) / 2,
              y: (1 - guideHeight) / 2,
              width: guideWidth,
              height: guideHeight,
            },
          };
        };

        setState("live");
        setReady(true);
      } catch (error) {
        if (cancelled) return;

        stop();
        setState("error");
        setMessage(describeCameraError(error));
      }
    })();

    return () => {
      cancelled = true;
      stop();
      // The next start (focus or "Try again") begins from a clean slate.
      setState("starting");
      setMessage("");
    };
  }, [active, attempt, captureRef, secureContext, setReady, supported]);

  const shownState: CameraState = supported ? state : "error";
  const shownMessage = supported ? message : unsupportedMessage;

  return (
    <View className="h-[280px] overflow-hidden rounded-xl border border-ctp-surface1 bg-black">
      <video
        ref={videoRef}
        muted
        playsInline
        aria-label="Live camera view of the counter"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: shownState === "live" ? "block" : "none",
        }}
      />

      {shownState === "live" && (
        <View
          pointerEvents="none"
          className="absolute inset-0 items-center justify-center"
        >
          <View
            style={{ width: GUIDE_SIZE, height: GUIDE_SIZE, maxWidth: "90%" }}
            className="rounded-xl border-2 border-white/80"
          />
        </View>
      )}

      {shownState !== "live" && (
        <View className="absolute inset-0 items-center justify-center px-5">
          <CameraIcon size={30} className="text-ctp-mauve" />

          <Text
            accessibilityRole={shownState === "error" ? "alert" : undefined}
            className="mt-3 text-center font-inter-medium text-xs leading-5 text-white/70"
          >
            {shownState === "error" ? shownMessage : "Starting camera..."}
          </Text>

          {shownState === "error" && supported && (
            <Pressable
              accessibilityRole="button"
              onPress={() => setAttempt((value) => value + 1)}
              className="mt-4 min-h-11 items-center justify-center rounded-lg bg-ctp-mauve px-5"
            >
              <Text className="font-inter-semibold text-xs text-ctp-crust">
                Try again
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
