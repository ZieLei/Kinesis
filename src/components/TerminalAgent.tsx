import { useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";

import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";

import {
  Check,
  MessageSquareText,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Wifi,
  WifiOff,
  Wrench,
} from "lucide-react-native";

import { useTerminalAgent } from "@/hooks/useTerminalAgent";


type TerminalAgentProps = {
  onSessionTokenChange: (token: string | null) => void;
};

const PAIRING_TOKEN_PATTERN =
  /^KINESIS-PAIRING:v1:([A-Za-z0-9_-]{43})$/;


export function TerminalAgent({
  onSessionTokenChange,
}: TerminalAgentProps) {
  const {
    status,
    connectionStatus,
    deviceId,
    message,
    accessDisabled,
    maintenanceMode,
    broadcastQueue,
    dismissBroadcast,
    pair,
  } = useTerminalAgent(onSessionTokenChange);

  const [permission, requestPermission] =
    useCameraPermissions();

  const [scanEnabled, setScanEnabled] = useState(true);
  const [scanError, setScanError] = useState("");

  const scanLocked = useRef(false);

  const activeBroadcast = broadcastQueue[0] ?? null;

  const registering = status === "registering";
  const initializing = status === "initializing";


  // --------------------------------------------------
  // QR scanner
  // --------------------------------------------------


  const handleBarcodeScanned = async (
    result: BarcodeScanningResult,
  ) => {
    if (
      scanLocked.current ||
      registering ||
      !scanEnabled
    ) {
      return;
    }

    scanLocked.current = true;
    setScanEnabled(false);
    setScanError("");

    const match = PAIRING_TOKEN_PATTERN.exec(
      result.data.trim(),
    );

    if (!match) {
      setScanError(
        "This isn't a Kinesis pairing QR code. Scan the code displayed by Terminal Management.",
      );

      return;
    }

    const paired = await pair(match[1]);

    if (paired) {
      return;
    }

    // Keep scanning paused so an expired QR is not repeatedly submitted.
    scanLocked.current = false;
  };


  function resumeScanning() {
    scanLocked.current = false;
    setScanEnabled(true);
    setScanError("");
  }


  // --------------------------------------------------
  // Full-screen terminal state
  // --------------------------------------------------


  let blockingScreen: ReactNode = null;

  if (accessDisabled) {
    blockingScreen = (
      <View className="absolute inset-0 z-[100] flex-1 items-center justify-center bg-ctp-base px-6">
        <View className="w-full max-w-md rounded-2xl border border-ctp-red/30 bg-ctp-mantle p-5">
          <ShieldAlert size={34} color="#f38ba8" />

          <Text className="mt-4 font-line-seed text-xl font-bold text-ctp-text">
            Terminal access disabled
          </Text>

          <Text className="mt-2 font-line-seed text-sm leading-6 text-ctp-subtext0">
            An administrator has disabled this terminal. Kinesis will
            automatically reconnect when access is restored.
          </Text>

          <View className="mt-4 rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
            <Text className="font-line-seed text-[11px] font-semibold uppercase tracking-wide text-ctp-subtext0">
              Device ID
            </Text>

            <Text
              selectable
              className="mt-1 break-all font-line-seed text-xs text-ctp-text"
            >
              {deviceId}
            </Text>
          </View>

          {!!message && (
            <Text className="mt-3 font-line-seed text-xs leading-5 text-ctp-red">
              {message}
            </Text>
          )}

          <View className="mt-4 flex-row items-center gap-2">
            <ActivityIndicator size="small" color="#f38ba8" />

            <Text className="font-line-seed text-xs text-ctp-subtext0">
              Waiting for administrator re-enablement...
            </Text>
          </View>
        </View>
      </View>
    );
  } else if (maintenanceMode) {
    blockingScreen = (
      <View className="absolute inset-0 z-[100] flex-1 items-center justify-center bg-ctp-base px-6">
        <View className="w-full max-w-md rounded-2xl border border-ctp-yellow/30 bg-ctp-mantle p-5">
          <View className="h-12 w-12 items-center justify-center rounded-xl bg-ctp-yellow/10">
            <Wrench size={26} color="#f9e2af" />
          </View>

          <Text className="mt-4 font-line-seed text-xl font-bold text-ctp-text">
            Under maintenance
          </Text>

          <Text className="mt-2 font-line-seed text-sm leading-6 text-ctp-subtext0">
            This Kinesis terminal is temporarily unavailable while an
            administrator performs maintenance.
          </Text>

          <View className="mt-4 rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
            <Text className="font-line-seed text-[11px] font-semibold uppercase tracking-wide text-ctp-subtext0">
              Device ID
            </Text>

            <Text
              selectable
              className="mt-1 break-all font-line-seed text-xs text-ctp-text"
            >
              {deviceId}
            </Text>
          </View>

          <View className="mt-5 flex-row items-center gap-2">
            <ActivityIndicator size="small" color="#f9e2af" />

            <Text className="font-line-seed text-xs text-ctp-subtext0">
              Waiting for maintenance to finish...
            </Text>
          </View>

          <Text className="mt-4 font-line-seed text-[11px] leading-5 text-ctp-subtext0">
            Your connection remains active. The terminal will automatically
            return to the POS when maintenance mode is disabled.
          </Text>
        </View>
      </View>
    );
  } else if (status === "storage-error") {
    blockingScreen = (
      <View className="absolute inset-0 z-[100] flex-1 items-center justify-center bg-ctp-base px-6">
        <View className="w-full max-w-md rounded-2xl border border-ctp-surface0 bg-ctp-mantle p-5">
          <ShieldAlert size={32} color="#f38ba8" />

          <Text className="mt-4 font-line-seed text-xl font-bold text-ctp-text">
            Secure storage unavailable
          </Text>

          <Text className="mt-2 font-line-seed text-sm leading-6 text-ctp-subtext0">
            Kinesis could not safely access its saved device credentials.
            Restart the app and try again.
          </Text>

          {!!message && (
            <Text className="mt-3 font-line-seed text-xs leading-5 text-ctp-red">
              {message}
            </Text>
          )}
        </View>
      </View>
    );
  } else if (status !== "active") {
    blockingScreen = (
      <View className="absolute inset-0 z-[100] flex-1 justify-center bg-ctp-base px-5">
        <View className="w-full items-center">
          <View className="w-full max-w-md rounded-2xl border border-ctp-surface0 bg-ctp-mantle p-5">
            <View className="mb-4 h-12 w-12 items-center justify-center rounded-xl bg-ctp-mauve/15">
              {initializing ? (
                <ActivityIndicator
                  size="large"
                  color="#cba6f7"
                />
              ) : (
                <QrCode size={25} color="#cba6f7" />
              )}
            </View>

            <Text className="font-fredoka text-2xl text-ctp-text">
              Kinesis
            </Text>

            <Text className="mt-2 font-line-seed text-lg font-bold text-ctp-text">
              {initializing
                ? "Preparing terminal"
                : registering
                  ? "Pairing terminal..."
                  : "Pair this terminal"}
            </Text>

            <Text className="mt-2 font-line-seed text-sm leading-6 text-ctp-subtext0">
              {initializing
                ? "Restoring this device's terminal identity and checking its saved credentials."
                : registering
                  ? "The pairing code is being verified and your terminal is being registered."
                  : "Open Terminal Management on your administrator computer, select Add Terminal, and scan the QR code displayed there."}
            </Text>

            <View className="mt-4 rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
              <Text className="font-line-seed text-[11px] font-semibold uppercase tracking-wide text-ctp-subtext0">
                Device ID
              </Text>

              <Text
                selectable
                className="mt-1 break-all font-line-seed text-xs text-ctp-text"
              >
                {deviceId || "Preparing device identity..."}
              </Text>
            </View>

            {/* Camera permission */}

            {!initializing &&
              !registering &&
              !permission?.granted && (
                <View className="mt-4 overflow-hidden rounded-xl border border-ctp-surface1 bg-ctp-base p-5">
                  <View className="items-center">
                    <Smartphone
                      size={30}
                      color="#cba6f7"
                    />

                    <Text className="mt-3 font-line-seed text-sm font-semibold text-ctp-text">
                      Camera permission required
                    </Text>

                    <Text className="mt-2 text-center font-line-seed text-xs leading-5 text-ctp-subtext0">
                      Kinesis needs camera access to scan your administrator's
                      one-time pairing QR code.
                    </Text>

                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void requestPermission()}
                      className="mt-4 min-h-11 w-full items-center justify-center rounded-lg bg-ctp-mauve px-4"
                    >
                      <Text className="font-line-seed text-sm font-bold text-ctp-crust">
                        Allow camera access
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}

            {/* QR camera */}

            {!initializing &&
              !registering &&
              permission?.granted && (
                <View className="mt-4 overflow-hidden rounded-xl border border-ctp-surface1 bg-black">
                  {scanEnabled ? (
                    <CameraView
                      style={{
                        width: "100%",
                        height: 280,
                      }}
                      facing="back"
                      barcodeScannerSettings={{
                        barcodeTypes: ["qr"],
                      }}
                      onBarcodeScanned={handleBarcodeScanned}
                      onMountError={(event) => {
                        setScanEnabled(false);
                        setScanError(
                          `Camera could not start: ${event.message}`,
                        );
                      }}
                    />
                  ) : (
                    <View className="h-[280px] items-center justify-center px-5">
                      {registering ? (
                        <>
                          <ActivityIndicator
                            size="large"
                            color="#cba6f7"
                          />

                          <Text className="mt-3 font-line-seed text-sm text-white">
                            Pairing terminal...
                          </Text>
                        </>
                      ) : (
                        <>
                          <QrCode
                            size={30}
                            color="#cba6f7"
                          />

                          <Text className="mt-3 text-center font-line-seed text-sm font-semibold text-white">
                            Scanner paused
                          </Text>

                          <Text className="mt-2 text-center font-line-seed text-xs leading-5 text-white/60">
                            {scanError ||
                              message ||
                              "Resume scanning when you are ready."}
                          </Text>

                          <Pressable
                            accessibilityRole="button"
                            onPress={resumeScanning}
                            className="mt-4 min-h-11 items-center justify-center rounded-lg bg-ctp-mauve px-5"
                          >
                            <Text className="font-line-seed text-xs font-bold text-ctp-crust">
                              Scan again
                            </Text>
                          </Pressable>
                        </>
                      )}
                    </View>
                  )}
                </View>
              )}

            {!!scanError &&
              scanEnabled && (
                <Text
                  accessibilityRole="alert"
                  className="mt-3 font-line-seed text-xs leading-5 text-ctp-red"
                >
                  {scanError}
                </Text>
              )}

            {!!message && !scanError && (
              <Text
                accessibilityRole="alert"
                className="mt-3 font-line-seed text-xs leading-5 text-ctp-red"
              >
                {message}
              </Text>
            )}

            <View className="mt-4 flex-row items-start gap-2">
              <ShieldCheck
                size={15}
                color="#a6e3a1"
              />

              <Text className="flex-1 font-line-seed text-[11px] leading-5 text-ctp-subtext0">
                Pairing codes expire after five minutes and can only be used
                once. Your permanent terminal credential is stored securely
                after pairing.
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }


  // --------------------------------------------------
  // Non-blocking network status
  // --------------------------------------------------


  const connectionBanner =
    status === "active" &&
      !accessDisabled &&
      !maintenanceMode &&
      connectionStatus !== "online" ? (
      <View
        pointerEvents="none"
        className="absolute left-4 right-4 top-12 z-[90] rounded-xl border border-ctp-yellow/30 bg-ctp-mantle px-4 py-3"
      >
        <View className="flex-row items-center gap-3">
          {connectionStatus === "offline" ? (
            <WifiOff
              size={19}
              color="#f9e2af"
            />
          ) : (
            <ActivityIndicator
              size="small"
              color="#f9e2af"
            />
          )}

          <View className="min-w-0 flex-1">
            <Text className="font-line-seed text-sm font-semibold text-ctp-text">
              {connectionStatus === "offline"
                ? "Kinesis server unreachable"
                : "Connecting to Kinesis..."}
            </Text>

            <Text className="mt-0.5 font-line-seed text-xs leading-5 text-ctp-subtext0">
              {connectionStatus === "offline"
                ? "Check the shop Wi-Fi and host computer. Kinesis will retry automatically."
                : "Checking the connection to the host computer."}
            </Text>
          </View>

        </View>
      </View>
    ) : null;


  // --------------------------------------------------
  // Global broadcast modal
  // --------------------------------------------------


  return (
    <>
      {connectionBanner}
      {blockingScreen}

      <Modal
        visible={activeBroadcast !== null}
        transparent
        animationType="fade"
        onRequestClose={dismissBroadcast}
        statusBarTranslucent
      >
        <View className="flex-1 items-center justify-center bg-black/60 px-6">
          <View className="w-full max-w-md rounded-2xl border border-ctp-surface0 bg-ctp-mantle p-5">
            <View className="mb-4 h-11 w-11 items-center justify-center rounded-xl bg-ctp-blue/15">
              <MessageSquareText size={23} color="#89b4fa" />
            </View>

            <Text className="font-line-seed text-xl font-bold text-ctp-text">
              Message from Kinesis Admin
            </Text>

            <Text className="mt-3 text-sm leading-6 font-line-seed text-ctp-subtext0">
              {activeBroadcast?.message}
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={dismissBroadcast}
              className="mt-6 min-h-12 flex-row items-center justify-center gap-2 rounded-lg bg-ctp-blue px-4"
            >
              <Check size={18} color="#11111b" />

              <Text className="font-line-seed text-sm font-bold text-ctp-crust">
                Acknowledge
              </Text>
            </Pressable>

            {broadcastQueue.length > 1 && (
              <Text className="mt-3 text-center font-line-seed text-[11px] text-ctp-subtext0">
                {broadcastQueue.length - 1} more message(s) waiting
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
