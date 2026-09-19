import { DarkTheme, DefaultTheme, ThemeProvider, Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import "../../global.css";
import { useFonts } from 'expo-font';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();

  const [fontsLoaded] = useFonts({
    FredokaOne: require("../../assets/fonts/FredokaOne-Regular.ttf"),
    Inter: require("../../assets/fonts/Inter-VariableFont_opsz,wght.ttf"),
  });

  if (!fontsLoaded) {
    return null;
  }
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Slot />
    </ThemeProvider>
  );
}
