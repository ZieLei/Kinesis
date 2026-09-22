import { Tabs, TabList, TabTrigger, TabSlot } from 'expo-router/ui';
import { Text, View, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { CartProvider } from '@/app/context/CartContext';

export default function TabLayout() {

  const { width: screenWidth } = Dimensions.get("window");

  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />

      <TabList
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 13,

          backgroundColor: '#F5F5F5',
          borderTopWidth: 0,
          borderTopColor: 'transparent',
          elevation: 0,
          shadowOpacity: 0,
          shadowRadius: 0,
        }}
      >
        <TabTrigger name="dashboard" href="/dashboard" style={{ flex: 1 }} android_ripple={{ color: 'transparent' }}>
          <View className="items-center">
            <View className="aspect-square h-[20px] bg-black/20" />
            <Text className="pt-2 font-inter-bold"
              style={{
                fontSize: screenWidth * 0.03
              }}
            >HOME</Text>
          </View>
        </TabTrigger>

        <TabTrigger name="cart" href="/cart" style={{ flex: 1 }} android_ripple={{ color: 'transparent' }}>
          <View className="items-center">
            <View className="aspect-square h-[20px] bg-black/20" />
            <Text className="pt-2 font-inter-bold"
              style={{
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
            <Text className="text-white text-center font-inter-light"
              style={{
                fontSize: screenWidth * 0.09,
                lineHeight: screenWidth * 0.09,
                transform: [{ translateY: -2 }],
              }}
            >+</Text>
          </LinearGradient>
        </TabTrigger>

        <TabTrigger name="stock" href="/stock" style={{ flex: 1 }} android_ripple={{ color: 'transparent' }}>
          <View className="items-center">
            <View className="aspect-square h-[20px] bg-black/20" />
            <Text className="pt-2 font-inter-bold"
              style={{
                fontSize: screenWidth * 0.03
              }}
            >STOCK</Text>
          </View>
        </TabTrigger>

        <TabTrigger name="reports" href="/reports" style={{ flex: 1 }} android_ripple={{ color: 'transparent' }}>
          <View className="items-center">
            <View className="aspect-square h-[20px] bg-black/20" />
            <Text className="pt-2 font-inter-bold"
              style={{
                fontSize: screenWidth * 0.03
              }}
            >REPORTS</Text>
          </View>
        </TabTrigger>
      </TabList>
    </Tabs >
  );
}
