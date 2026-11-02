import { View, Text, Dimensions, Pressable, Image } from "react-native";
import { useRouter } from "expo-router";
import {
  Search,
  ShoppingCart,
  CreditCard,
  Package,
} from "lucide-react-native";

export default function Home() {
  const router = useRouter();

  const { width: screenWidth } = Dimensions.get("window");

  const CARD_WIDTH = screenWidth * 0.9;
  const POS_PREVIEW = require("../assets/images/pos-preview.jpg");

  const previewDimensions = Image.resolveAssetSource(POS_PREVIEW);
  const PREVIEW_HEIGHT =
    (previewDimensions.height / previewDimensions.width) * 200;

  const workflow = [
    {
      label: "FIND",
      Icon: Search,
      color: "#89b4fa",
    },
    {
      label: "CART",
      Icon: ShoppingCart,
      color: "#cba6f7",
    },
    {
      label: "PAY",
      Icon: CreditCard,
      color: "#a6e3a1",
    },
    {
      label: "STOCK",
      Icon: Package,
      color: "#fab387",
    },
  ];

  return (
    <View className="flex-1 items-center justify-center bg-ctp-text">
      <View
        className="bg-ctp-mantle px-10"
        style={{
          width: CARD_WIDTH,
          height: 750,
          borderRadius: 10,
          paddingHorizontal: 15,
          paddingTop: 30,
          backgroundColor: "#1e1e2e",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Kinesis Logo */}
        <View className="flex-row items-center">
          <Text
            className="text-ctp-text text-2xl font-fredoka -mx-5"
          >
            Kinesis
          </Text>
        </View>

        {/* Welcome Section */}
        <View className="items-center pt-8">
          <Text
            className="text-ctp-text font-inter-semibold"
            style={{
              fontSize: screenWidth * 0.055,
            }}
          >
            Powering Your Business.
          </Text>

          <Text
            className="text-center text-ctp-subtext1 pt-7 w-[300px] font-inter-regular"
            style={{
              fontSize: screenWidth * 0.035,
            }}
          >
            A mobile POS built to make sales faster, simpler, and easier to
            manage.
          </Text>
        </View>

        {/* Login Button */}
        <View className="items-center pt-5">
          <Pressable
            className="rounded-full bg-ctp-blue px-8 py-2"
            onPress={() => router.navigate("/dashboard")}
          >
            <Text
              selectable={false}
              className="text-ctp-base font-inter-bold"
              style={{
                fontSize: screenWidth * 0.035,
              }}
            >
              Login
            </Text>
          </Pressable>
        </View>

        {/* From Part to Purchase */}
        <View className="items-center pt-10">
          <Text
            className="text-ctp-text font-inter-semibold"
            style={{
              fontSize: screenWidth * 0.045,
            }}
          >
            From part to purchase
          </Text>

          <View className="flex-row items-center justify-between w-full py-5">
            {workflow.map(({ label, Icon, color }, index) => (
              <View key={label} className="flex-row items-center">
                <View className="items-center">
                  <Text
                    className="text-ctp-subtext1 font-inter-semibold"
                    style={{
                      fontSize: screenWidth * 0.04,
                    }}
                  >
                    0{index + 1}
                  </Text>

                  <View className="my-1.5">
                    <Icon size={26} color={color} strokeWidth={1.8} />
                  </View>

                  <Text
                    className="text-ctp-text font-inter-semibold"
                    style={{
                      fontSize: screenWidth * 0.03,
                    }}
                  >
                    {label}
                  </Text>
                </View>

                {index < workflow.length - 1 && (
                  <Text
                    className="text-ctp-overlay0"
                    style={{
                      fontSize: screenWidth * 0.04,
                      marginHorizontal: 9,
                    }}
                  >
                    →
                  </Text>
                )}
              </View>
            ))}
          </View>
        </View>

        {/* POS Preview */}
        <View
          style={{
            position: "absolute",
            bottom: 0,
            alignSelf: "center",
            width: 200,
            height: 300,
            overflow: "hidden",
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            borderWidth: 2,
            borderColor: "#45475a",
          }}
        >
          <Image
            source={POS_PREVIEW}
            resizeMode="stretch"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 200,
              height: PREVIEW_HEIGHT,
            }}
          />
        </View>
      </View>
    </View>
  );
}
