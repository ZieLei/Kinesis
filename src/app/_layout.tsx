import { DarkTheme, DefaultTheme, ThemeProvider, Slot } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { View } from "react-native";
import { useColorScheme } from "nativewind";
import "../../global.css";
import { useFonts } from "expo-font";
import { CartProvider } from "@/app/context/CartContext";
import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { latte, mocha } from "@/theme";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { colorScheme } = useColorScheme();

  const [fontsLoaded] = useFonts({
    FredokaOne: require("../../assets/fonts/FredokaOne-Regular.ttf"),
    "Inter-Thin": require("../../assets/fonts/Inter-Thin.ttf"),
    "Inter-ExtraLight": require("../../assets/fonts/Inter-ExtraLight.ttf"),
    "Inter-Light": require("../../assets/fonts/Inter-Light.ttf"),
    "Inter-Regular": require("../../assets/fonts/Inter-Regular.ttf"),
    "Inter-Medium": require("../../assets/fonts/Inter-Medium.ttf"),
    "Inter-SemiBold": require("../../assets/fonts/Inter-SemiBold.ttf"),
    "Inter-Bold": require("../../assets/fonts/Inter-Bold.ttf"),
    "Inter-ExtraBold": require("../../assets/fonts/Inter-ExtraBold.ttf"),
    "Inter-Black": require("../../assets/fonts/Inter-Black.ttf"),
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
          { flex: 1 },
          colorScheme === "dark" ? mocha : latte,
        ]}
      >
        <CartProvider>
          <AnimatedSplashOverlay />
          <Slot />
        </CartProvider>
      </View>
    </ThemeProvider>
  );
}
