import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { useCart, type ProductCartItem } from "@/app/context/CartContext";
import { CounterCameraView } from "@/components/counter-scanner/CounterCameraView";
import CounterScannerResults, {
  type ScanLine,
} from "@/components/counter-scanner/CounterScannerResults";
import ScreenHeader from "@/components/ScreenHeader";
import { useBackNavigation } from "@/hooks/useBackNavigation";
import { useInventory } from "@/hooks/useInventory";
import { usePOSFormatting } from "@/hooks/usePOSFormatting";
import { createCounterDetector } from "@/lib/counterScanner/detector";
import type {
  CounterDetection,
  CounterFrame,
} from "@/lib/counterScanner/types";
import type { Product } from "@/types/product";

type ScanStatus = "idle" | "scanning" | "done" | "error";

let nextLineKey = 0;

/** Turns detections into editable rows; the same product merges into one. */
function detectionsToLines(
  detections: CounterDetection[],
  productIds: ReadonlySet<number>,
): ScanLine[] {
  const lines = new Map<number, ScanLine>();

  for (const detection of detections) {
    const productId = detection.best.productId;
    if (!productIds.has(productId)) continue;

    const quantity = Math.max(1, Math.round(detection.quantity ?? 1));
    const existing = lines.get(productId);

    if (existing) {
      existing.quantity += quantity;
      continue;
    }

    lines.set(productId, {
      key: `scan-${nextLineKey++}`,
      productId,
      quantity,
      alternates: detection.alternates ?? [],
    });
  }

  return [...lines.values()];
}

export default function CounterScanner() {
  const { canGoBack, goBack } = useBackNavigation("/new-sale");
  const { allowNegativeInventory } = usePOSFormatting();
  const { inventory, fetchInventory } = useInventory();
  const { addProductToCart, items } = useCart();

  const [focused, setFocused] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [lines, setLines] = useState<ScanLine[]>([]);

  const captureRef = useRef<(() => CounterFrame | null) | null>(null);
  const scanAbortRef = useRef<AbortController | null>(null);
  const detectorRef = useRef<ReturnType<typeof createCounterDetector> | null>(
    null,
  );

  // The camera and any running scan stop whenever this screen is not shown.
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();

      void fetchInventory(true, controller.signal);
      setFocused(true);

      return () => {
        controller.abort();
        scanAbortRef.current?.abort();
        setFocused(false);
        setCameraReady(false);
      };
    }, [fetchInventory]),
  );

  useEffect(
    () => () => {
      scanAbortRef.current?.abort();
      detectorRef.current?.dispose?.();
      detectorRef.current = null;
    },
    [],
  );

  const cartQuantities = useMemo(
    () =>
      new Map(
        items
          .filter((item): item is ProductCartItem => item.type === "product")
          .map((item) => [item.id, item.quantity]),
      ),
    [items],
  );

  const scan = useCallback(async () => {
    const frame = captureRef.current?.();
    if (!frame) return;

    scanAbortRef.current?.abort();
    const controller = new AbortController();
    scanAbortRef.current = controller;

    detectorRef.current ??= createCounterDetector();
    setStatus("scanning");

    try {
      const detections = await detectorRef.current.detect(frame, {
        inventory,
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      setLines(
        detectionsToLines(
          detections,
          new Set(inventory.map((product) => product.id)),
        ),
      );
      setStatus("done");
    } catch {
      if (controller.signal.aborted) return;
      setStatus("error");
    }
  }, [inventory]);

  const updateLine = useCallback(
    (key: string, update: Partial<ScanLine>) =>
      setLines((current) =>
        current.map((line) =>
          line.key === key ? { ...line, ...update } : line,
        ),
      ),
    [],
  );

  const removeLine = useCallback(
    (key: string) =>
      setLines((current) => current.filter((line) => line.key !== key)),
    [],
  );

  const confirm = useCallback(
    (additions: { product: Product; quantity: number }[]) => {
      for (const { product, quantity } of additions) {
        for (let count = 0; count < quantity; count += 1) {
          addProductToCart({
            id: product.id,
            name: product.name,
            price: product.price,
          });
        }
      }

      setLines([]);
      setStatus("idle");
      goBack();
    },
    [addProductToCart, goBack],
  );

  return (
    <SafeAreaView className="flex-1 bg-ctp-base">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pt-7 pb-8"
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          title="Counter Scanner"
          onBack={canGoBack ? goBack : () => router.replace("/new-sale")}
        />

        <CounterCameraView
          active={focused}
          captureRef={captureRef}
          onReadyChange={setCameraReady}
        />

        <Text className="mt-3 font-inter-regular text-xs leading-5 text-ctp-subtext0">
          Place the parts on the counter and point the camera at them. You
          confirm every match before anything is added to the sale.
        </Text>

        <Pressable
          onPress={() => void scan()}
          disabled={!cameraReady || status === "scanning"}
          accessibilityRole="button"
          className="mt-4 min-h-12 items-center justify-center rounded-lg bg-ctp-mauve px-4 disabled:opacity-50"
        >
          <Text className="font-inter-semibold text-sm text-ctp-crust">
            {status === "scanning" ? "Scanning..." : "Scan counter"}
          </Text>
        </Pressable>

        <View className="mt-5">
          <Text className="mb-1 font-inter-semibold text-base text-ctp-text">
            Matches
          </Text>

          {lines.length > 0 ? (
            <CounterScannerResults
              lines={lines}
              inventory={inventory}
              cartQuantities={cartQuantities}
              allowNegativeInventory={allowNegativeInventory}
              onChangeLine={updateLine}
              onRemoveLine={removeLine}
              onConfirm={confirm}
            />
          ) : (
            <Text
              accessibilityLiveRegion="polite"
              className={`py-4 font-inter-medium text-sm ${
                status === "error" ? "text-ctp-red" : "text-ctp-subtext0"
              }`}
            >
              {status === "error"
                ? "The scan failed. Try again."
                : status === "done"
                  ? "No matching products were found. Scanning is not active in this version."
                  : "No matches yet."}
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
