import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyRound, ShieldCheck, Smartphone } from "lucide-react-native";

import { useTerminalAgent } from "@/hooks/useTerminalAgent";

export function TerminalAgent() {
  const {
    status,
    deviceId,
    message,
    enroll,
  } = useTerminalAgent();

  const [enrollmentKey, setEnrollmentKey] = useState("");

  if (status === "initializing" || status === "active") {
    return null;
  }

  if (status === "storage-error") {
    return (
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

  const registering = status === "registering";

  return (
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
            Enter the enrollment key configured on your Kinesis backend. This
            registers the device so it can appear in the admin's Terminal
            Management page.
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
            disabled={!enrollmentKey.trim() || registering || !deviceId}
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
