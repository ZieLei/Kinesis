import { Tabs, TabList, TabTrigger, TabSlot } from 'expo-router/ui';
import { Text, View, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { LinearGradient } from 'expo-linear-gradient';

export default function TabLayout() {

  const { width: screenWidth } = Dimensions.get("window");
  const [fontsLoaded] = useFonts({
    FredokaOne: require("../../../assets/fonts/FredokaOne-Regular.ttf"),
    Inter: require("../../../assets/fonts/Inter-VariableFont_opsz,wght.ttf"),
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />

      <TabList
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 13,

          boxShadow: '0px -4px 10px 1px rgba(0, 0, 0, 0.05)',
        }}
      >
        <TabTrigger name="dashboard" href="/dashboard" style={{ flex: 1 }}>
          <View className="items-center">
            <View className="aspect-square h-[20px] bg-black/20" />
            <Text className="pt-2"
              style={{
                fontFamily: "Inter",
                fontWeight: 700,
                fontSize: screenWidth * 0.03
              }}
            >HOME</Text>
          </View>
        </TabTrigger>

        <TabTrigger name="cart" href="/cart" style={{ flex: 1 }}>
          <View className="items-center">
            <View className="aspect-square h-[20px] bg-black/20" />
            <Text className="pt-2"
              style={{
                fontFamily: "Inter",
                fontWeight: 700,
                fontSize: screenWidth * 0.03
              }}
            >CART</Text>
          </View>
        </TabTrigger>

        <TabTrigger name="new-sale" href="/new-sale"
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <LinearGradient
            colors={['#575757', '#000000']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              height: 50,
              width: 50,
              borderRadius: 100,
              justifyContent: 'center',
            }}
          >
            <Text className="text-white text-center"
              style={{
                fontFamily: "Inter",
                fontWeight: 300,
                fontSize: screenWidth * 0.09,
                lineHeight: screenWidth * 0.09,
                transform: [{ translateY: -2 }],
              }}
            >+</Text>
          </LinearGradient>
        </TabTrigger>

        <TabTrigger name="stock" href="/stock" style={{ flex: 1 }}>
          <View className="items-center">
            <View className="aspect-square h-[20px] bg-black/20" />
            <Text className="pt-2"
              style={{
                fontFamily: "Inter",
                fontWeight: 700,
                fontSize: screenWidth * 0.03
              }}
            >STOCK</Text>
          </View>
        </TabTrigger>

        <TabTrigger name="reports" href="/reports" style={{ flex: 1 }}>
          <View className="items-center">
            <View className="aspect-square h-[20px] bg-black/20" />
            <Text className="pt-2"
              style={{
                fontFamily: "Inter",
                fontWeight: 700,
                fontSize: screenWidth * 0.03
              }}
            >REPORTS</Text>
          </View>
        </TabTrigger>
      </TabList>
    </Tabs >
  );
}
