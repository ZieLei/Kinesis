
import { View, Text, Pressable, Image } from "react-native";
import { mocha } from "@/theme";
import { useRouter } from "expo-router";
import {
  Search,
  ShoppingCart,
  CreditCard,
  Package,
} from "lucide-react-native";

export default function Home() {
  const router = useRouter();

  // Fixed type sizes: sizes derived from Dimensions are 0 when the web build
  // is pre-rendered, and the hydrated page kept that invisible 0px text.
  const POS_PREVIEW = require("../assets/images/pos-preview.jpg");

  // Fixed preview dimensions to avoid unsupported asset resolution on web.
  const PREVIEW_WIDTH = 200;
  const PREVIEW_HEIGHT = 300;

  // The screenshot is 1220x2712 (portrait). Draw it at the frame's width and
  // its own aspect ratio, pinned to the top, so the frame crops the bottom
  // instead of squashing the whole image into the box.
  const PREVIEW_IMAGE_HEIGHT = Math.round(PREVIEW_WIDTH * (2712 / 1220));

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
          // The card is always dark; pin the dark palette so its text
          // classes stay readable when the device theme is light.
          ...(mocha as Record<string, string>),
          width: "90%",
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
        <View className="flex-row items-center" style={{ paddingLeft: 8 }}>
          <Text className="text-ctp-text text-2xl font-fredoka">
            Kinesis
          </Text>
        </View>

        {/* Welcome Section */}
        <View className="items-center pt-8">
          <Text
            className="text-ctp-text font-inter-semibold"
            style={{
              fontSize: 22,
            }}
          >
            Powering Your Business.
          </Text>

          <Text
            className="text-center text-ctp-subtext1 pt-7 w-[300px] font-inter-regular"
            style={{
              fontSize: 14,
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
            onPress={() => router.replace("/dashboard")}
          >
            <Text
              selectable={false}
              className="text-ctp-base font-inter-bold"
              style={{
                fontSize: 14,
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
              fontSize: 18,
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
                      fontSize: 16,
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
                      fontSize: 12,
                    }}
                  >
                    {label}
                  </Text>
                </View>

                {index < workflow.length - 1 && (
                  <Text
                    className="text-ctp-overlay0"
                    style={{
                      fontSize: 16,
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
            width: PREVIEW_WIDTH,
            height: PREVIEW_HEIGHT,
            overflow: "hidden",
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            borderWidth: 2,
            borderColor: "#45475a",
          }}
        >
          <Image
            source={POS_PREVIEW}
            resizeMode="cover"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: PREVIEW_WIDTH,
              height: PREVIEW_IMAGE_HEIGHT,
            }}
          />
        </View>
      </View>
    </View>
  );
}
