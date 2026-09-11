import { View, Text, StyleSheet, Dimensions, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { LinearGradient } from 'expo-linear-gradient';
import orders from '../data/orders.json';

export default function Dashboard() {
  const { width: screenWidth } = Dimensions.get("window");
  const [fontsLoaded] = useFonts({
    FredokaOne: require("../../assets/fonts/FredokaOne-Regular.ttf"),
    Inter: require("../../assets/fonts/Inter-VariableFont_opsz,wght.ttf"),
  });

  if (!fontsLoaded) {
    return null;
  }
  const statusStyles = {
    Confirmed: "bg-green-100 text-green-600",
    Pending: "bg-yellow-100 text-yellow-600",
    Cancelled: "bg-red-100 text-red-600",
  };

  type order = {
    id: number;
    time: string;
    date: string;
    amount: number;
    status: string;
  };

  return (
    <SafeAreaView className="bg-[#F5F5F5] flex-1">
      <ScrollView className="flex-1"
        contentContainerClassName="px-5 py-7"
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-black"
            style={{
              fontFamily: "FredokaOne",
              fontSize: screenWidth * 0.06,
            }}>
            Kinesis
          </Text>

          <View className="bg-black/10 h-10 w-10 rounded-full" />
        </View>

        <Text className="py-6"
          style={{
            fontFamily: "Inter",
            fontWeight: 500,
            fontSize: screenWidth * 0.04,
          }}
        >Welcome, User!</Text>

        <LinearGradient
          colors={['#575757', '#000000']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 10,
            height: screenWidth * 0.5,
            paddingHorizontal: 20,
            paddingVertical: 15,
          }}
        >
          <Text className="text-white/90"
            style={{
              fontFamily: "Inter",
              fontWeight: 400,
              fontSize: screenWidth * 0.035,
            }}
          >
            Today's Sales
          </Text>
          <Text className="text-white tracking-[1px] my-3"
            style={{
              fontFamily: "Inter",
              fontWeight: 600,
              fontSize: screenWidth * 0.065,
            }}
          >
            ₱2,450.00
          </Text>

          <View className="flex-row items-center">
            <Text className="bg-white text-green-600 rounded-full items-center py-1 px-2"
              style={{
                fontFamily: "Inter",
                fontWeight: 800,
                fontSize: screenWidth * 0.03
              }}
            >
              +15%
            </Text>
            <Text className="text-white/80 ml-2"
              style={{
                fontFamily: "Inter",
                fontWeight: 400,
                fontSize: screenWidth * 0.035,
              }}
            >
              From previous week.
            </Text>
          </View>
        </LinearGradient>

        <View className="mt-[20px]">
          <Pressable className="bg-black/80 items-center justify-center rounded-full h-[40px]">
            <Text className="text-white"
              style={{
                fontFamily: "Inter",
                fontWeight: 500,
                fontSize: screenWidth * 0.038,
              }}
            >
              + New Sale
            </Text>
          </Pressable>
        </View>

        <View className="flex-row py-[20px] justify-between">
          <View className="rounded-[10px] h-[149px] w-[172px] flex-col bg-white px-[15px] py-[15px]">
            <View className="flex-row items-center gap-1.5">
              <View className="h-8 w-8 rounded-full bg-black/10" />
              <Text className=""
                style={{
                  fontFamily: "Inter",
                  fontWeight: 600,
                  fontSize: screenWidth * 0.033,
                }}
              >Products</Text>
            </View>
            <View className="flex-row justify-between py-5">
              <Text
                style={{
                  fontFamily: "Inter",
                  fontWeight: 700,
                  fontSize: screenWidth * 0.05,
                }}
              >350</Text>
              <Text className="bg-green-200/50 text-green-600 py-1 px-2 rounded-full"
                style={{
                  fontFamily: "Inter",
                  fontWeight: 700,
                  fontSize: screenWidth * 0.03,
                }}
              >
                +15%
              </Text>
            </View>
            <View className="-mx-[15px] h-[1px] bg-black/5" />

            <Text className="text-black/30 mt-auto"
              style={{
                fontFamily: "Inter",
                fontWeight: 500,
                fontSize: screenWidth * 0.03,
              }}
            >Update: 20 Aug 2026</Text>
          </View>
          <View className="rounded-[10px] h-[149px] w-[172px] flex-col bg-white px-[15px] py-[15px]">
            <View className="flex-row items-center gap-1.5">
              <View className="h-8 w-8 rounded-full bg-black/10" />
              <Text className=""
                style={{
                  fontFamily: "Inter",
                  fontWeight: 600,
                  fontSize: screenWidth * 0.033,
                }}
              >Categories</Text>
            </View>
            <View className="flex-row justify-between py-5">
              <Text
                style={{
                  fontFamily: "Inter",
                  fontWeight: 700,
                  fontSize: screenWidth * 0.05,
                }}
              >5</Text>
              <Text className="bg-green-200/50 text-green-600 py-1 px-2 rounded-full"
                style={{
                  fontFamily: "Inter",
                  fontWeight: 700,
                  fontSize: screenWidth * 0.03,
                }}
              >
                +25%
              </Text>
            </View>
            <View className="-mx-[15px] h-[1px] bg-black/5" />

            <Text className="text-black/30 mt-auto"
              style={{
                fontFamily: "Inter",
                fontWeight: 500,
                fontSize: screenWidth * 0.03,
              }}
            >Update: 20 Aug 2026</Text>
          </View>
        </View>
        <View className="flex-row justify-between">
          <View className="rounded-[10px] h-[149px] w-[172px] flex-col bg-white px-[15px] py-[15px]">
            <View className="flex-row items-center gap-1.5">
              <View className="h-8 w-8 rounded-full bg-black/10" />
              <Text className=""
                style={{
                  fontFamily: "Inter",
                  fontWeight: 600,
                  fontSize: screenWidth * 0.033,
                }}
              >Items sold</Text>
            </View>
            <View className="flex-row justify-between py-5">
              <Text
                style={{
                  fontFamily: "Inter",
                  fontWeight: 700,
                  fontSize: screenWidth * 0.05,
                }}
              >12</Text>
              <Text className="bg-green-200/50 text-green-600 py-1 px-2 rounded-full"
                style={{
                  fontFamily: "Inter",
                  fontWeight: 700,
                  fontSize: screenWidth * 0.03,
                }}
              >
                +12%
              </Text>
            </View>
            <View className="-mx-[15px] h-[1px] bg-black/5" />

            <Text className="text-black/30 mt-auto"
              style={{
                fontFamily: "Inter",
                fontWeight: 500,
                fontSize: screenWidth * 0.03,
              }}
            >Update: 20 Aug 2026</Text>
          </View>
          <View className="rounded-[10px] h-[149px] w-[172px] flex-col bg-white px-[15px] py-[15px]">
            <View className="flex-row items-center gap-1.5">
              <View className="h-8 w-8 rounded-full bg-black/10" />
              <Text className=""
                style={{
                  fontFamily: "Inter",
                  fontWeight: 600,
                  fontSize: screenWidth * 0.033,
                }}
              >Monthly sales</Text>
            </View>
            <View className="flex-row justify-between py-5">
              <Text
                style={{
                  fontFamily: "Inter",
                  fontWeight: 700,
                  fontSize: screenWidth * 0.05,
                }}
              >₱12.25K</Text>
              <Text className="bg-green-200/50 text-green-600 py-1 px-2 rounded-full"
                style={{
                  fontFamily: "Inter",
                  fontWeight: 700,
                  fontSize: screenWidth * 0.03,
                }}
              >
                +10%
              </Text>
            </View>
            <View className="-mx-[15px] h-[1px] bg-black/5" />

            <Text className="text-black/30 mt-auto"
              style={{
                fontFamily: "Inter",
                fontWeight: 500,
                fontSize: screenWidth * 0.03,
              }}
            >Update: 20 Aug 2026</Text>
          </View>
        </View>
        <View className="bg-white rounded-[10px] h-[500px] w-full mt-[20px] px-5 py-4 flex-col">
          <View className="flex-row items-center mb-3">
            <Text className="text-black"
              style={{
                fontFamily: "Inter",
                fontWeight: 500,
                fontSize: screenWidth * 0.04,
              }}
            >
              Recent Transactions
            </Text>

            <Pressable className="ml-auto bg-black/10 py-2 px-2 rounded-md">
              <Text className=""
                selectable={false}
                style={{
                  fontFamily: "Inter",
                  fontWeight: 700,
                  fontSize: screenWidth * 0.03,
                }}
              >
                View All
              </Text>
            </Pressable>
          </View>

          {orders.map((order) => (
            <View key={order.id} className="flex-row w-full h-[70px] my-2">

              <View className="bg-black/20 aspect-square rounded-lg" />

              <View className="flex-col gap-2 ml-2">
                <Text
                  className="text-black"
                  style={{
                    fontFamily: "Inter",
                    fontWeight: 700,
                    fontSize: screenWidth * 0.04,
                  }}
                >
                  Order #{order.id}
                </Text>

                <Text
                  className="text-black/30"
                  style={{
                    fontFamily: "Inter",
                    fontWeight: 600,
                    fontSize: screenWidth * 0.03,
                  }}
                >
                  {order.time}{"\n"}
                  {order.date}
                </Text>
              </View>

              <View className="ml-auto">
                <Text className="mb-2"
                  style={{
                    fontFamily: "Inter",
                    fontWeight: 700,
                    fontSize: screenWidth * 0.04,
                  }}
                >
                  ₱{order.amount.toFixed(2)}
                </Text>

                <Text
                  className={`rounded-full w-[80px] text-center px-2 py-1 ${statusStyles[order.status as keyof typeof statusStyles]
                    }`}
                  style={{
                    fontFamily: "Inter",
                    fontWeight: 600,
                    fontSize: screenWidth * 0.03,
                  }}
                >
                  {order.status}
                </Text>
              </View>

            </View>
          ))}

        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
