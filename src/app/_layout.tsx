
import { useState } from "react";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
  Slot,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StyleSheet, View } from "react-native";
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

  const [terminalSessionToken, setTerminalSessionToken] =
    useState<string | null>(null);

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
          sessionToken={terminalSessionToken}
        >
          <CashierAuthProvider
            terminalSessionToken={terminalSessionToken}
          >
            <CatalogProvider>
              <CartProvider>
                {/* Main application */}
                <View style={styles.application}>
                  <AnimatedSplashOverlay />

                  <CashierRouteGuard>
                    <Slot />
                  </CashierRouteGuard>
                </View>

                {/* Global terminal pairing and status overlay */}
                <View
                  pointerEvents="box-none"
                  style={styles.terminalOverlay}
                >
                  <TerminalAgent
                    onSessionTokenChange={setTerminalSessionToken}
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
