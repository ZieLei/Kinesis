import { useCallback } from "react";
import { router, useNavigation, type Href } from "expo-router";
import { useNavigationState } from "expo-router/react-navigation";

type BackNavigation = {
  /** True when back has somewhere to go in the real navigation history. */
  canGoBack: boolean;
  /** Pop the current screen (or tab history entry). */
  goBack: () => void;
};

/**
 * In-app back that behaves exactly like the platform back action.
 *
 * Back is resolved by the navigators themselves: the root native stack pops
 * pushed screens, and the tab navigator (backBehavior "history") walks back
 * through the tabs the cashier actually visited. Android's hardware back,
 * predictive back gestures and the iOS swipe-back all go through the same
 * GO_BACK action, so the in-app button can never disagree with them.
 *
 * `upHref` is the screen's logical parent ("Up" in Android terms). It is used
 * only when the screen has no history beneath it: a cold deep link or a web
 * refresh. It is never a substitute for real history.
 *
 * When there is no history and no `upHref`, `canGoBack` is false and callers
 * should hide their back button: that is a root screen, where the platform
 * convention is no back affordance (Android's system back then leaves the app).
 */
export function useBackNavigation(upHref?: Href): BackNavigation {
  const navigation = useNavigation();

  // Re-render whenever this navigator's history changes, so `canGoBack`
  // stays current (e.g. after switching tabs). Parent-stack changes reach
  // the screen through focus/blur, which re-renders it as well.
  useNavigationState((state) => {
    const depth =
      "history" in state && Array.isArray(state.history)
        ? state.history.length
        : state.routes.length;
    return `${state.index}:${depth}`;
  });

  const hasHistory = navigation.canGoBack();

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else if (upHref) {
      router.replace(upHref);
    }
  }, [navigation, upHref]);

  return {
    canGoBack: hasHistory || upHref !== undefined,
    goBack,
  };
}
