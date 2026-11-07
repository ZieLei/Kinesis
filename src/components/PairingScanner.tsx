import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import { Smartphone } from "lucide-react-native";

export type PairingScannerProps = {
  /** Whether the camera should currently look for codes. */
  scanEnabled: boolean;
  /** Raw text of a scanned (or pasted) code. */
  onScanned: (data: string) => void;
  /** The camera could not start. */
  onError: (message: string) => void;
  /** Shown in place of the camera while scanning is paused. */
  pausedContent: ReactNode;
};

/** Native QR scanner (iOS/Android) using expo-camera. */
export function PairingScanner({
  scanEnabled,
  onScanned,
  onError,
  pausedContent,
}: PairingScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();

  if (!permission?.granted) {
    return (
      <View className="mt-4 overflow-hidden rounded-xl border border-ctp-surface1 bg-ctp-base p-5">
        <View className="items-center">
          <Smartphone size={30} color="#cba6f7" />

          <Text className="mt-3 font-line-seed text-sm font-semibold text-ctp-text">
            Camera permission required
          </Text>

          <Text className="mt-2 text-center font-line-seed text-xs leading-5 text-ctp-subtext0">
            Kinesis needs camera access to scan your administrator&apos;s
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
    );
  }

  return (
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
          onBarcodeScanned={(result: BarcodeScanningResult) =>
            onScanned(result.data)
          }
          onMountError={(event) => {
            onError(`Camera could not start: ${event.message}`);
          }}
        />
      ) : (
        pausedContent
      )}
    </View>
  );
}
