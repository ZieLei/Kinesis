import { View, Text, StyleSheet, Dimensions, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

export default function Home() {
  const router = useRouter();
  const { width: screenWidth } = Dimensions.get("window");

  const CARD_WIDTH = screenWidth * 0.9;
  const LOGO_SIZE = screenWidth * 0.035;

  return (
    <View className="flex-1 items-center justify-center bg-[#F5F5F5]">
      <LinearGradient
        colors={['#303030', '#000000']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: CARD_WIDTH,
          height: 750,
          borderRadius: 10,
          paddingHorizontal: 15,
          paddingTop: 30,
        }}>
        <View className="flex-row items-center">
          <View className="mr-3 h-9 w-9 rounded-full bg-white" />

          <Text
            className="text-white text-xl font-fredoka"
            style={{
              fontSize: LOGO_SIZE,
            }}
          >
            Kinesis
          </Text>
        </View>

        <View className="items-center pt-8">
          <Text className="text-white font-inter-semibold"
            style={{
              fontSize: screenWidth * 0.055,
            }}>
            Powering Your Business.
          </Text>
          <Text className="text-center text-white/70 pt-7 w-[300px] font-inter-regular"
            style={{
              fontSize: screenWidth * 0.035
            }}>
            A mobile POS build to make
            sales faster, simpler, and easier to manager.
          </Text>
        </View>

        <View className="items-center pt-5">
          <Pressable className="group rounded-full bg-white px-8 py-2 active:bg-black"
            onPress={() => router.navigate("/dashboard")}
          >
            <Text
              selectable={false}
              className="text-black group-active:text-white font-inter-bold"
              style={{
                fontSize: screenWidth * 0.035,
              }}
            >
              Login
            </Text>
          </Pressable>
          <Pressable className="border border-white rounded-full px-8 py-2 mt-4">
            <Text className="text-white font-inter-regular"
              style={{
                fontSize: screenWidth * 0.035,
              }}>
              Explore Features
            </Text>
          </Pressable>
        </View>

        <View className="items-center pt-10">
          <Text className="text-white font-inter-semibold"
            style={{
              fontSize: screenWidth * 0.045,
            }}>
            From part to purchase
          </Text>
          <View className="flex-row items-center justify-between gap-4 py-5">
            <View className="items-center">
              <Text className="text-white/80 font-inter-semibold"
                style={{
                  fontSize: screenWidth * 0.040,
                }}>
                01
              </Text>
              <View className="bg-white w-7 h-7 my-1.5" />
              <Text className="text-white font-inter-semibold"
                style={{
                  fontSize: screenWidth * 0.03,
                }}>
                FIND
              </Text>
            </View>

            <Text className="text-white"
              style={{
                fontSize: screenWidth * 0.04,
              }}>
              →
            </Text>

            <View className="items-center">
              <Text className="text-white/80 font-inter-semibold"
                style={{
                  fontSize: screenWidth * 0.040,
                }}>
                02
              </Text>
              <View className="bg-white w-7 h-7 my-1.5" />
              <Text className="text-white font-inter-semibold"
                style={{
                  fontSize: screenWidth * 0.03,
                }}>
                CART
              </Text>
            </View>

            <Text className="text-white"
              style={{
                fontSize: screenWidth * 0.04,
              }}>
              →
            </Text>

            <View className="items-center">
              <Text className="text-white/80 font-inter-semibold"
                style={{
                  fontSize: screenWidth * 0.040,
                }}>
                03
              </Text>
              <View className="bg-white w-7 h-7 my-1.5" />
              <Text className="text-white font-inter-semibold"
                style={{
                  fontSize: screenWidth * 0.03,
                }}>
                PAY
              </Text>
            </View>

            <Text className="text-white"
              style={{
                fontSize: screenWidth * 0.04,
              }}>
              →
            </Text>

            <View className="items-center">
              <Text className="text-white/80 font-inter-semibold"
                style={{
                  fontSize: screenWidth * 0.040,
                }}>
                04
              </Text>
              <View className="bg-white w-7 h-7 my-1.5" />
              <Text className="text-white font-inter-semibold"
                style={{
                  fontSize: screenWidth * 0.03,
                }}>
                STOCK
              </Text>
            </View>
          </View>
        </View>

        <View className="self-center h-[300px] w-[200px] rounded-tl-[20px] rounded-tr-[20px] bg-white mt-5" />
      </LinearGradient>
    </View >
  )
}

