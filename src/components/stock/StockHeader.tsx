import { ActivityIndicator, Pressable } from "react-native";

import RefreshCw from "lucide-react-native/icons/refresh-cw";

import ScreenHeader from "@/components/ScreenHeader";
import { styledIcon } from "@/components/StyledIcon";
import { useThemeColors } from "@/hooks/useThemeColors";

const StyledRefreshCw = styledIcon(RefreshCw);

type StockHeaderProps = {
  title: string;
  refreshing: boolean;
  refreshDisabled: boolean;
  onBack: () => void;
  onRefresh: () => void;
};

export default function StockHeader({
  title,
  refreshing,
  refreshDisabled,
  onBack,
  onRefresh,
}: StockHeaderProps) {
  const { refreshSpinner } = useThemeColors();

  return (
    <ScreenHeader
      title={title}
      onBack={onBack}
      right={
        <Pressable
          onPress={onRefresh}
          disabled={refreshDisabled}
          accessibilityRole="button"
          accessibilityLabel="Refresh inventory"
          className="h-8 w-8 items-center justify-center"
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={refreshSpinner} />
          ) : (
            <StyledRefreshCw size={18} className="text-ctp-subtext0" />
          )}
        </Pressable>
      }
    />
  );
}
