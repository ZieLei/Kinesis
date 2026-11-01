
import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Wrench,
  MessageSquareText,
  Check,
} from "lucide-react-native";

import { useTerminalAgent } from "@/hooks/useTerminalAgent";

type TerminalAgentProps = {
  onSessionTokenChange: (token: string | null) => void;
};

export function TerminalAgent({
  onSessionTokenChange,
}: TerminalAgentProps) {
  const {
    status,
    deviceId,
    message,
    accessDisabled,
    maintenanceMode,
    broadcastQueue,
    dismissBroadcast,
    enroll,
  } = useTerminalAgent(onSessionTokenChange);

  const [enrollmentKey, setEnrollmentKey] = useState("");

  const activeBroadcast = broadcastQueue[0] ?? null;

  let blockingScreen: ReactNode = null;

  // --------------------------------------------------
  // Disabled terminal
  // --------------------------------------------------

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
  }

  // --------------------------------------------------
  // Maintenance mode
  // --------------------------------------------------

  else if (maintenanceMode) {
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
  }

  // --------------------------------------------------
  // Secure storage error
  // --------------------------------------------------

  else if (status === "storage-error") {
    blockingScreen = (
      <View className="absolute inset-0 z-[100] flex-1 items-center justify-center bg-ctp-base px-6">
        <View className="w-full max-w-md rounded-2xl border border-ctp-surface0 bg-ctp-mantle p-5">
          <ShieldCheck size={32} color="#f38ba8" />

          <Text className="mt-4 font-line-seed text-xl font-bold text-ctp-text">
            Secure storage unavailable
          </Text>

          <Text className="mt-2 font-line-seed text-sm leading-6 text-ctp-subtext0">
            Kinesis could not safely initialize this device's identity and
            session credentials. Restart the app and try again.
          </Text>

          {!!message && (
            <Text className="mt-3 font-line-seed text-xs leading-5 text-ctp-red">
              {message}
            </Text>
          )}
        </View>
      </View>
    );
  }

  // --------------------------------------------------
  // Enrollment
  // --------------------------------------------------

  else if (
    status !== "active" &&
    status !== "initializing"
  ) {
    const registering = status === "registering";

    blockingScreen = (
      <View className="absolute inset-0 z-[100] flex-1 justify-center bg-ctp-base px-5">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="w-full items-center"
        >
          <View className="w-full max-w-md rounded-2xl border border-ctp-surface0 bg-ctp-mantle p-5">
            <View className="mb-4 h-12 w-12 items-center justify-center rounded-xl bg-ctp-mauve/15">
              <Smartphone size={24} color="#cba6f7" />
            </View>

            <Text className="font-fredoka text-2xl text-ctp-text">
              Kinesis
            </Text>

            <Text className="mt-2 font-line-seed text-lg font-bold text-ctp-text">
              Register this terminal
            </Text>

            <Text className="mt-2 font-line-seed text-sm leading-6 text-ctp-subtext0">
              Enter the enrollment key configured on your Kinesis backend.
              This registers the device so it can appear in the admin's
              Terminal Management page.
            </Text>

            <View className="mt-4 rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
              <Text className="font-line-seed text-[11px] font-semibold uppercase tracking-wide text-ctp-subtext0">
                Device ID
              </Text>

              <Text
                selectable
                className="mt-1 break-all font-line-seed text-xs text-ctp-text"
              >
                {deviceId || "Preparing device identity…"}
              </Text>
            </View>

            <Text className="mb-2 mt-4 font-line-seed text-sm font-semibold text-ctp-text">
              Terminal enrollment key
            </Text>

            <View className="flex-row items-center rounded-lg border border-ctp-surface1 bg-ctp-base px-3">
              <KeyRound size={17} color="#a6adc8" />

              <TextInput
                value={enrollmentKey}
                onChangeText={setEnrollmentKey}
                placeholder="Enter enrollment key"
                placeholderTextColor="#7f849c"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                editable={!registering}
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (enrollmentKey.trim() && !registering) {
                    void enroll(enrollmentKey);
                  }
                }}
                className="min-h-12 flex-1 px-3 font-line-seed text-sm text-ctp-text"
              />
            </View>

            {!!message && (
              <Text
                accessibilityRole="alert"
                className="mt-3 font-line-seed text-xs leading-5 text-ctp-red"
              >
                {message}
              </Text>
            )}

            <Pressable
              accessibilityRole="button"
              disabled={
                !enrollmentKey.trim() ||
                registering ||
                !deviceId
              }
              onPress={() => void enroll(enrollmentKey)}
              className={`mt-4 min-h-12 flex-row items-center justify-center gap-2 rounded-lg px-4 ${!enrollmentKey.trim() || registering || !deviceId
                  ? "bg-ctp-surface1"
                  : "bg-ctp-mauve active:opacity-80"
                }`}
            >
              {registering ? (
                <ActivityIndicator color="#1e1e2e" />
              ) : (
                <ShieldCheck size={17} color="#1e1e2e" />
              )}

              <Text className="font-line-seed text-sm font-bold text-ctp-crust">
                {registering ? "Registering…" : "Register terminal"}
              </Text>
            </Pressable>

            <Text className="mt-4 font-line-seed text-[11px] leading-5 text-ctp-subtext0">
              Enrollment is required once per installation. After successful
              registration, the session token is kept in secure device storage.
            </Text>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // --------------------------------------------------
  // Global broadcast modal
  // --------------------------------------------------

  return (
    <>
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
