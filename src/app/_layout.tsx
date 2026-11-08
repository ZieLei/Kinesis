
import { useEffect, useState } from "react";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
  Stack,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { Platform, StyleSheet, View } from "react-native";
import { useColorScheme } from "nativewind";
import { useFonts } from "expo-font";

import "../../global.css";

import { CartProvider } from "@/app/context/CartContext";
import { CatalogProvider } from "@/app/context/CatalogContext";
import { TerminalSettingsProvider } from "@/app/context/TerminalSettingsContext";
import {
  CashierAuthProvider,
  CashierRouteGuard,
} from "@/app/context/CashierAuthContext";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { TerminalAgent } from "@/components/TerminalAgent";
import TerminalInactivityGuard from "@/components/TerminalInactivityGuard";

import { latte, mocha } from "@/theme";

SplashScreen.preventAutoHideAsync();

const styles = StyleSheet.create({
  root: {
    flex: 1,
    position: "relative",
  },
  application: {
    flex: 1,
  },
  terminalOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    elevation: 1000,
  },
});

export default function RootLayout() {
  const { colorScheme } = useColorScheme();

  // Web: React Native's <Modal> renders into a portal on document.body,
  // outside the root View below that carries the theme variables. Mirror the
  // active palette onto <html> so modals (GCash scanner, bottom sheets) get
  // the same colours instead of unstyled white.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const palette = (colorScheme === "dark" ? mocha : latte) as Record<string, string>;
    const root = document.documentElement;
    for (const [name, value] of Object.entries(palette)) {
      if (name.startsWith("--")) root.style.setProperty(name, value);
    }
    root.style.colorScheme = colorScheme === "dark" ? "dark" : "light";
  }, [colorScheme]);

  // Whether this device holds a terminal credential. The credential itself
  // stays in the keystore (native) or an HttpOnly cookie (web).
  const [terminalPaired, setTerminalPaired] = useState(false);

  const [fontsLoaded] = useFonts({
    FredokaOne: require("../../assets/fonts/FredokaOne-Regular.ttf"),
    "LINESeed-Thin": require("../../assets/fonts/LINESeedSans_A_Th.ttf"),
    "LINESeed-Regular": require("../../assets/fonts/LINESeedSans_A_Rg.ttf"),
    "LINESeed-Bold": require("../../assets/fonts/LINESeedSans_A_Bd.ttf"),
    "LINESeed-ExtraBold": require("../../assets/fonts/LINESeedSans_A_XBd.ttf"),
    "LINESeed-Heavy": require("../../assets/fonts/LINESeedSans_A_He.ttf"),
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ThemeProvider
      value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
    >
      <View
        style={[
          styles.root,
          colorScheme === "dark" ? mocha : latte,
        ]}
      >
        <TerminalSettingsProvider
          terminalPaired={terminalPaired}
        >
          <CashierAuthProvider
            terminalPaired={terminalPaired}
          >
            <CatalogProvider>
              <CartProvider>
                <View style={styles.application}>
                  <AnimatedSplashOverlay />

                  <CashierRouteGuard>
                    <TerminalInactivityGuard>
                      {/*
                        Native stack: every pushed screen is a real history
                        entry. Back (in-app, Android system back/predictive
                        gesture, iOS swipe) pops exactly one entry. Screens
                        below stay mounted, so returning preserves their state.
                        The tab group's own history lives in (tabs)/_layout.
                      */}
                      <Stack
                        screenOptions={{
                          headerShown: false,
                          fullScreenGestureEnabled: true,
                        }}
                      >
                        {/* One instance each: re-opening the cart from the
                            Services tab never stacks a duplicate cart. */}
                        <Stack.Screen name="cart" dangerouslySingular />
                        <Stack.Screen name="checkout" dangerouslySingular />
                        <Stack.Screen
                          name="transactions"
                          dangerouslySingular
                        />
                      </Stack>
                    </TerminalInactivityGuard>
                  </CashierRouteGuard>
                </View>

                <View
                  pointerEvents="box-none"
                  style={styles.terminalOverlay}
                >
                  <TerminalAgent
                    onPairedChange={setTerminalPaired}
                  />
                </View>
              </CartProvider>
            </CatalogProvider>
          </CashierAuthProvider>
        </TerminalSettingsProvider>
      </View>
    </ThemeProvider>
  );
}
