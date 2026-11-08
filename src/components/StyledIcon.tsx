import { cssInterop } from "nativewind";
import type { LucideIcon } from "lucide-react-native";

/**
 * Lets a lucide icon take its colour from a NativeWind class
 * (`className="text-ctp-blue"`), on every platform.
 *
 * - Native: the class's `color` is moved into the icon's `color` prop.
 * - Web: the class is applied to the <svg> element itself, so CSS `color`
 *   (including the dark-theme CSS variables) reaches lucide's
 *   `stroke="currentColor"`.
 *
 * `target: false` worked on native only: on web the class was dropped and
 * every icon fell back to black, which is invisible on the dark theme.
 */
export function styledIcon(Icon: LucideIcon) {
  cssInterop(Icon, {
    className: {
      target: "style",
      nativeStyleToProp: {
        color: true,
      },
    },
  });

  return Icon;
}
