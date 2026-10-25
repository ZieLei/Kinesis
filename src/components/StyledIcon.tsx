import { cssInterop } from "nativewind";
import type { LucideIcon } from "lucide-react-native";

export function styledIcon(Icon: LucideIcon) {
  cssInterop(Icon, {
    className: {
      target: false,
      nativeStyleToProp: {
        color: "color",
      },
    },
  });

  return Icon;
}
