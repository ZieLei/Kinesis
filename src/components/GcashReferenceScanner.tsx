import { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Flashlight, FlashlightOff } from "lucide-react-native";

import "../lib/webCameraCompat";
import { scanGcashReference } from "../lib/gcashOcr";
import {
  GCASH_REFERENCE_LENGTH,
  formatGcashReference,
  isValidGcashReference,
  normalizeGcashReference,
} from "../lib/gcashReferenceCandidates";
import { getGuideRect, type Size } from "../lib/gcashScanRegion";
import { useDismissOnBack } from "@/hooks/useDismissOnBack";

/** Browser camera errors, in words a cashier can act on. */
function describeWebCameraError(error: unknown): string {
  // Firefox raises plain Errors, Chrome DOMExceptions: both carry a name.
  const name =
    typeof error === "object" && error !== null && typeof (error as { name?: unknown }).name === "string"
      ? (error as { name: string }).name
      : "";
  const manual = " You can still type the reference number on the checkout screen.";

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return (
        "The browser is blocking the camera for this site. Tap the icon left of the address bar, open Permissions (or Site settings), set Camera to Allow, then reopen the scanner." +
        manual
      );
    case "NotReadableError":
    case "AbortError":
    case "TrackStartError":
      return (
        "The camera is busy. Close other apps or browser tabs that use the camera, then try again." +
        manual
      );
    case "NotFoundError":
    case "OverconstrainedError":
      return "No usable camera was found on this device." + manual;
    default:
      return (
        `The camera could not be started${name ? ` (${name})` : ""}.` + manual
      );
  }
}

type GcashReferenceScannerProps = {
  visible: boolean;
  onClose: () => void;
  onConfirm: (referenceNumber: string) => void;
};

export default function GcashReferenceScanner({
  visible,
  onClose,
  onConfirm,
}: GcashReferenceScannerProps) {
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [cameraError, setCameraError] = useState("");
  // Some Android browsers report the camera as busy for a moment after the
  // permission check released it; remount the camera view and try again.
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [scanError, setScanError] = useState("");
  const [candidates, setCandidates] = useState<string[]>([]);
  const [referenceDraft, setReferenceDraft] = useState("");
  const [viewport, setViewport] = useState<Size | null>(null);
  const [torchOn, setTorchOn] = useState(false);

  // One rectangle drives both the on-screen guide and the OCR crop.
  const guide = viewport ? getGuideRect(viewport) : null;

  const handleRequestPermission = async () => {
    setCameraError("");

    if (Platform.OS === "web") {
      // expo-camera's web permission request reports every getUserMedia
      // failure as "denied". Ask for the camera the same way the pairing
      // scanner does and say what actually went wrong.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        stream.getTracks().forEach((track) => track.stop());
        await requestPermission();
      } catch (error) {
        setCameraError(describeWebCameraError(error));
      }
      return;
    }

    try {
      const result = await requestPermission();
      if (!result.granted) {
        setCameraError(
          "Camera permission was not granted. You can still enter the reference number manually on the checkout screen.",
        );
      }
    } catch {
      setCameraError(
        "The camera permission request failed. Check the browser or device permission settings.",
      );
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current || !cameraReady || scanning || !viewport || !guide)
      return;

    setScanning(true);
    setScanError("");
    setCameraError("");

    try {
      const picture = await cameraRef.current.takePictureAsync({
        quality: 1,
        base64: Platform.OS === "web",
      });

      if (!picture?.uri) {
        throw new Error("The camera did not return an image.");
      }

      const ranked = await scanGcashReference({
        uri: picture.uri,
        viewport,
        guide,
      });
      const detectedCandidates = ranked.map((candidate) => candidate.value);

      setCandidates(detectedCandidates);
      setReferenceDraft(
        detectedCandidates[0] ? formatGcashReference(detectedCandidates[0]) : "",
      );
      setHasScanned(true);
      setTorchOn(false);

      if (detectedCandidates.length === 0) {
        setScanError(
          `No ${GCASH_REFERENCE_LENGTH}-digit reference number was found inside the frame. Line up only the "Ref No." row in the frame, hold steady, and try again — or enter it manually below.`,
        );
      }
    } catch (error) {
      setHasScanned(true);
      setCandidates([]);
      setReferenceDraft("");
      setScanError(
        error instanceof Error
          ? error.message
          : "The receipt could not be read. Try again or enter the reference number manually.",
      );
    } finally {
      setScanning(false);
    }
  };

  const handleScanAgain = () => {
    setHasScanned(false);
    setCameraReady(false);
    setCandidates([]);
    setReferenceDraft("");
    setScanError("");
    setCameraError("");
    setCameraAttempt(0);
  };

  const draftIsValid = isValidGcashReference(referenceDraft);
  const canConfirm = draftIsValid && !scanning;

  // Android back / browser back closes this first (web; native handles it).
  useDismissOnBack(visible, onClose);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-ctp-base">
        <View className="flex-row items-center justify-between border-b border-ctp-surface0 px-5 py-3">
          <Pressable
            onPress={onClose}
            disabled={scanning}
            accessibilityRole="button"
            accessibilityLabel="Close reference scanner"
            className="rounded-lg px-2 py-2"
          >
            <Text className="font-inter-semibold text-sm text-ctp-subtext1">
              Cancel
            </Text>
          </Pressable>

          <Text className="font-inter-semibold text-base text-ctp-text">
            GCash Reference Scanner
          </Text>

          <View className="w-12" />
        </View>

        {!permission ? (
          <View className="flex-1 items-center justify-center gap-3 px-8">
            <ActivityIndicator size="large" color="#89B4FA" />
            <Text className="text-center font-inter-medium text-sm text-ctp-subtext0">
              Checking camera permission…
            </Text>
          </View>
        ) : !permission.granted ? (
          <View className="flex-1 items-center justify-center gap-4 px-8">
            <Text className="text-center font-inter-semibold text-lg text-ctp-text">
              Camera access is needed
            </Text>
            <Text className="text-center font-inter-regular text-sm leading-6 text-ctp-subtext0">
              Kinesis uses the camera to read the reference number printed or
              displayed on the customer's GCash receipt. The image is processed
              on this device and is not uploaded for OCR.
            </Text>
            {cameraError ? (
              <Text className="text-center font-inter-medium text-xs leading-5 text-ctp-red">
                {cameraError}
              </Text>
            ) : null}
            <Pressable
              onPress={handleRequestPermission}
              className="rounded-lg bg-ctp-blue px-5 py-3"
            >
              <Text className="font-inter-semibold text-sm text-ctp-crust">
                Allow Camera Access
              </Text>
            </Pressable>
            {!permission.canAskAgain ? (
              <Text className="text-center font-inter-regular text-xs leading-5 text-ctp-subtext0">
                Camera access was previously blocked. Enable it in your device
                or browser settings, then reopen the scanner.
              </Text>
            ) : null}
          </View>
        ) : hasScanned ? (
          <KeyboardAvoidingView
            className="flex-1"
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text className="font-inter-semibold text-lg text-ctp-text">
                Review detected reference
              </Text>
              <Text className="mt-1 font-inter-regular text-sm leading-5 text-ctp-subtext0">
                OCR only suggests a value. Check every character against the
                customer's receipt before using it.
              </Text>

              {scanError ? (
                <View className="mt-4 rounded-lg border border-ctp-yellow/40 bg-ctp-yellow/10 p-3">
                  <Text className="font-inter-medium text-sm leading-5 text-ctp-yellow">
                    {scanError}
                  </Text>
                </View>
              ) : null}

              {candidates.length > 1 ? (
                <View className="mt-5 gap-2">
                  <Text className="font-inter-semibold text-xs text-ctp-subtext1">
                    OTHER POSSIBLE MATCHES
                  </Text>
                  {candidates.map((candidate) => (
                    <Pressable
                      key={candidate}
                      onPress={() =>
                        setReferenceDraft(formatGcashReference(candidate))
                      }
                      className={`rounded-lg border px-3 py-3 ${normalizeGcashReference(referenceDraft) === candidate ? "border-ctp-blue bg-ctp-blue/10" : "border-ctp-surface1 bg-ctp-mantle"}`}
                    >
                      <Text className="font-inter-semibold text-base tracking-wide text-ctp-text">
                        {formatGcashReference(candidate)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <View className="mt-5 gap-2">
                <Text className="font-inter-semibold text-sm text-ctp-text">
                  Reference number
                </Text>
                <TextInput
                  value={referenceDraft}
                  onChangeText={setReferenceDraft}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="number-pad"
                  maxLength={20}
                  placeholder="1234 567 890123"
                  placeholderTextColor="#6C7086"
                  selectionColor="#89B4FA"
                  className="rounded-lg border border-ctp-surface1 bg-ctp-mantle px-4 py-3 font-inter-semibold text-lg tracking-wide text-ctp-text"
                />
                {referenceDraft.trim().length > 0 && !draftIsValid ? (
                  <Text className="font-inter-medium text-xs leading-5 text-ctp-red">
                    A GCash reference number has exactly{" "}
                    {GCASH_REFERENCE_LENGTH} digits (currently{" "}
                    {normalizeGcashReference(referenceDraft).replace(/\D/g, "")
                      .length}
                    ).
                  </Text>
                ) : null}
              </View>

              <View className="mt-6 gap-3">
                <Pressable
                  onPress={() =>
                    onConfirm(normalizeGcashReference(referenceDraft))
                  }
                  disabled={!canConfirm}
                  className={`items-center rounded-lg py-4 ${canConfirm ? "bg-ctp-blue" : "bg-ctp-blue/40"}`}
                >
                  <Text className="font-inter-semibold text-base text-ctp-crust">
                    Use This Reference
                  </Text>
                </Pressable>

                <Pressable
                  onPress={handleScanAgain}
                  className="items-center rounded-lg border border-ctp-surface1 bg-ctp-mantle py-3"
                >
                  <Text className="font-inter-semibold text-sm text-ctp-text">
                    Scan Another Receipt
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        ) : (
          <View className="flex-1 p-4">
            <Text className="mb-3 text-center font-inter-regular text-sm leading-5 text-ctp-subtext0">
              Line up only the "Ref No." row of the receipt inside the frame.
              Only the area inside the frame is read.
            </Text>

            <View
              className="flex-1 overflow-hidden rounded-2xl bg-black"
              onLayout={(event) => {
                const { width, height } = event.nativeEvent.layout;
                setViewport((current) =>
                  current?.width === width && current?.height === height
                    ? current
                    : { width, height },
                );
              }}
            >
              <CameraView
                key={cameraAttempt}
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing="back"
                enableTorch={torchOn}
                onCameraReady={() => setCameraReady(true)}
                onMountError={(event) => {
                  const detail =
                    (event as { nativeEvent?: unknown }).nativeEvent ?? event;
                  const name =
                    typeof detail === "object" && detail !== null
                      ? String((detail as { name?: unknown }).name ?? "")
                      : "";

                  if (
                    Platform.OS === "web" &&
                    cameraAttempt < 2 &&
                    ["NotReadableError", "AbortError", "TrackStartError"].includes(name)
                  ) {
                    setTimeout(() => setCameraAttempt((n) => n + 1), 700);
                    return;
                  }

                  setCameraError(
                    Platform.OS === "web"
                      ? describeWebCameraError(detail)
                      : event.message || "The camera could not be started.",
                  );
                }}
              />

              {viewport && guide ? (
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                  {/* Dim everything outside the region that is actually read. */}
                  <View
                    style={[styles.shade, { top: 0, left: 0, right: 0, height: guide.y }]}
                  />
                  <View
                    style={[
                      styles.shade,
                      { top: guide.y + guide.height, left: 0, right: 0, bottom: 0 },
                    ]}
                  />
                  <View
                    style={[
                      styles.shade,
                      { top: guide.y, left: 0, width: guide.x, height: guide.height },
                    ]}
                  />
                  <View
                    style={[
                      styles.shade,
                      {
                        top: guide.y,
                        left: guide.x + guide.width,
                        right: 0,
                        height: guide.height,
                      },
                    ]}
                  />
                  <View
                    style={{
                      position: "absolute",
                      left: guide.x,
                      top: guide.y,
                      width: guide.width,
                      height: guide.height,
                    }}
                    className="rounded-lg border-2 border-[#89B4FA]"
                  />
                  <Text
                    style={{
                      position: "absolute",
                      left: guide.x,
                      width: guide.width,
                      top: Math.max(4, guide.y - 28),
                    }}
                    className="text-center font-inter-semibold text-xs text-white"
                  >
                    Ref No. 0000 000 000000
                  </Text>
                </View>
              ) : null}

              <View
                pointerEvents="none"
                className="absolute inset-x-4 bottom-4 rounded-lg bg-black/70 px-3 py-2"
              >
                <Text className="text-center font-inter-medium text-xs leading-5 text-white">
                  Fill the frame with the reference line, keep it level, and
                  hold still until the digits look sharp.
                </Text>
              </View>

              {Platform.OS !== "web" ? (
                <Pressable
                  onPress={() => setTorchOn((value) => !value)}
                  accessibilityRole="button"
                  accessibilityLabel={torchOn ? "Turn off flashlight" : "Turn on flashlight"}
                  className="absolute right-3 top-3 rounded-full bg-black/60 p-3"
                >
                  {torchOn ? (
                    <FlashlightOff size={20} color="#FFFFFF" />
                  ) : (
                    <Flashlight size={20} color="#FFFFFF" />
                  )}
                </Pressable>
              ) : null}

              {scanning ? (
                <View className="absolute inset-0 items-center justify-center bg-black/65">
                  <ActivityIndicator size="large" color="#89B4FA" />
                  <Text className="mt-3 font-inter-semibold text-sm text-white">
                    Reading GCash receipt…
                  </Text>
                  <Text className="mt-1 font-inter-regular text-xs text-white/80">
                    Processing locally on this device
                  </Text>
                </View>
              ) : null}
            </View>

            {cameraError ? (
              <Text className="mt-3 text-center font-inter-medium text-xs leading-5 text-ctp-red">
                {cameraError}
                {Platform.OS === "web" &&
                typeof window !== "undefined" &&
                !window.isSecureContext
                  ? " Browser camera access requires HTTPS or localhost."
                  : ""}
              </Text>
            ) : null}

            <Pressable
              onPress={handleCapture}
              disabled={!cameraReady || scanning || !guide}
              className={`mt-4 items-center rounded-lg py-4 ${cameraReady && !scanning && guide ? "bg-ctp-blue" : "bg-ctp-blue/40"}`}
            >
              <Text className="font-inter-semibold text-base text-ctp-crust">
                {scanning ? "Reading Receipt…" : "Capture & Read Reference"}
              </Text>
            </Pressable>

            <Text className="mt-3 text-center font-inter-regular text-xs leading-5 text-ctp-subtext0">
              If scanning is unavailable, close this window and type the
              reference number in the checkout field.
            </Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shade: {
    position: "absolute",
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
});
