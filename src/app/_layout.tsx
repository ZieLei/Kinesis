import { useState } from "react";
import { DarkTheme, DefaultTheme, ThemeProvider, Slot } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { View } from "react-native";
import { useColorScheme } from "nativewind";
import { useFonts } from "expo-font";

import "../../global.css";

import { CartProvider } from "@/app/context/CartContext";
import { TerminalSettingsProvider } from "@/app/context/TerminalSettingsContext";
import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { TerminalAgent } from "@/components/TerminalAgent";
import { latte, mocha } from "@/theme";

SplashScreen.preventAutoHideAsync();

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
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <View
        style={[
          { flex: 1 },
          colorScheme === "dark" ? mocha : latte,
        ]}
      >
        <TerminalSettingsProvider sessionToken={terminalSessionToken}>
          <CartProvider>
            <AnimatedSplashOverlay />
            <Slot />
            <TerminalAgent
              onSessionTokenChange={setTerminalSessionToken}
            />
          </CartProvider>
        </TerminalSettingsProvider>
      </View>
    </ThemeProvider>
  );
}
