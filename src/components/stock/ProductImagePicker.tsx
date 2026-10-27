import { Image, Pressable, Text, View } from "react-native";

import ImagePlus from "lucide-react-native/icons/image-plus";
import ImageOff from "lucide-react-native/icons/image-off";

import { styledIcon } from "@/components/StyledIcon";
import { useThemeColors } from "@/hooks/useThemeColors";

const StyledImagePlus = styledIcon(ImagePlus);
const StyledImageOff = styledIcon(ImageOff);

type ProductImagePickerProps = {
  previewUri: string | null;
  disabled: boolean;
  onChoose: () => void;
  onRemove: () => void;
  onPreviewError: () => void;
};

export default function ProductImagePicker({
  previewUri,
  disabled,
  onChoose,
  onRemove,
  onPreviewError,
}: ProductImagePickerProps) {
  const { isDark } = useThemeColors();

  return (
    <View className="mb-5 flex-row items-center gap-4">
      <View className="h-28 w-28 overflow-hidden rounded-xl border border-ctp-surface2 bg-ctp-base">
        {previewUri ? (
          <Image
            key={previewUri}
            source={{ uri: previewUri }}
            resizeMode="cover"
            className="h-full w-full"
            onError={onPreviewError}
          />
        ) : (
          <View className="flex-1 items-center justify-center px-2">
            <StyledImageOff size={24} className="text-ctp-subtext0" />
            <Text className="mt-2 text-center font-inter-medium text-[10px] text-ctp-subtext0">
              No image
            </Text>
          </View>
        )}
      </View>

      <View className="flex-1 gap-2">
        <Pressable
          onPress={onChoose}
          disabled={disabled}
          className="flex-row items-center justify-center gap-2 rounded-lg bg-ctp-blue px-3 py-3"
        >
          <StyledImagePlus
            size={17}
            className={isDark ? "text-ctp-crust" : "text-white"}
          />
          <Text
            className={`font-inter-semibold text-sm ${isDark ? "text-ctp-crust" : "text-white"
              }`}
          >
            {previewUri ? "Change image" : "Choose image"}
          </Text>
        </Pressable>

        {previewUri ? (
          <Pressable
            onPress={onRemove}
            disabled={disabled}
            className="rounded-lg border border-ctp-surface2 px-3 py-2"
          >
            <Text className="text-center font-inter-medium text-xs text-ctp-red">
              Remove image
            </Text>
          </Pressable>
        ) : null}

        <Text className="font-inter-regular text-[10px] text-ctp-subtext0">
          JPEG, PNG, GIF or WebP · Maximum 5 MB
        </Text>
      </View>
    </View>
  );
}
