
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useNavigation } from "expo-router";

import {
  ArrowLeft,
  LockKeyhole,
  RefreshCw,
  UserRound,
  WifiOff,
} from "lucide-react-native";

import {
  apiRequest,
  ApiError,
  isNetworkError,
} from "@/lib/api";

import {
  useCashierAuth,
  type CashierAccount,
} from "@/app/context/CashierAuthContext";
import { useBackNavigation } from "@/hooks/useBackNavigation";
import { useDismissOnBack } from "@/hooks/useDismissOnBack";


type CashierListResponse = {
  items: CashierAccount[];
};


function getLoginErrorMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return (
      "Cannot connect to the Kinesis server. Connect this device " +
      "to the shop's Wi-Fi and make sure the host computer is running."
    );
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Could not complete the request. Please try again.";
}


// Catppuccin Mocha (dark) and Latte (light) values for the few places that
// need a raw colour instead of a theme class (icon strokes, spinners, inputs).
const DARK = {
  text: "#CDD6F4",
  warning: "#F9E2AF",
  accent: "#89B4FA",
  danger: "#F38BA8",
  muted: "#A6ADC8",
  placeholder: "#6C7086",
  onAccent: "#11111B",
};

const LIGHT = {
  text: "#4C4F69",
  warning: "#DF8E1D",
  accent: "#1E66F5",
  danger: "#D20F39",
  muted: "#6C6F85",
  placeholder: "#8C8FA1",
  onAccent: "#DCE0E8",
};

export default function CashierLogin() {
  const { isDark } = useThemeColors();
  const c = isDark ? DARK : LIGHT;

  const { login } = useCashierAuth();

  const [accounts, setAccounts] = useState<CashierAccount[]>([]);

  const [selectedCashier, setSelectedCashier] =
    useState<CashierAccount | null>(null);

  const [pin, setPin] = useState("");

  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [accountError, setAccountError] = useState("");
  const [loginError, setLoginError] = useState("");

  const [serverOnline, setServerOnline] =
    useState<boolean | null>(null);


  // --------------------------------------------------
  // Load available cashier accounts
  // --------------------------------------------------


  const fetchAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    setAccountError("");

    try {
      const response = await apiRequest<CashierListResponse>(
        "/api/cashier-auth/accounts",
      );

      if (!Array.isArray(response.items)) {
        throw new Error(
          "The server returned an invalid cashier account list.",
        );
      }

      setAccounts(response.items);
      setServerOnline(true);

      setSelectedCashier((current) => {
        if (
          current &&
          response.items.some(
            (account) => account.id === current.id,
          )
        ) {
          return current;
        }

        return null;
      });
    } catch (error) {
      if (isNetworkError(error)) {
        setServerOnline(false);
      } else if (error instanceof ApiError) {
        setServerOnline(true);
      }

      setAccountError(getLoginErrorMessage(error));
    } finally {
      setLoadingAccounts(false);
    }
  }, []);


  useEffect(() => {
    void fetchAccounts();
  }, [fetchAccounts]);


  // --------------------------------------------------
  // Account selection
  // --------------------------------------------------


  const selectCashier = (account: CashierAccount) => {
    if (submitting) return;

    setSelectedCashier(account);
    setPin("");

    setAccountError("");
    setLoginError("");
  };


  const changeAccount = () => {
    if (submitting) return;

    setSelectedCashier(null);
    setPin("");
    setLoginError("");
  };

  // iOS swipe must not skip past the PIN step either. setOptions only runs
  // when the value changes: an inline <Stack.Screen options={{...}} /> passes
  // a new object every render and loops the navigator.
  const navigation = useNavigation();
  const pinStepOpen = selectedCashier !== null;
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !pinStepOpen });
  }, [navigation, pinStepOpen]);

  // Leaving login goes back through real history; "/" (the landing page)
  // is only the Up target when login was opened with nothing beneath it.
  const { goBack } = useBackNavigation("/");

  // The PIN step is a nested step of this screen: system back (Android
  // gesture/button, browser back) returns to the account list exactly like
  // the in-app back arrow. changeAccount() ignores it while signing in.
  useDismissOnBack(selectedCashier !== null, changeAccount);


  // --------------------------------------------------
  // Cashier login
  // --------------------------------------------------


  const handleLogin = async () => {
    if (submitting) return;

    if (!selectedCashier) {
      setLoginError("Select your cashier account first.");
      return;
    }

    if (!/^\d{6}$/.test(pin)) {
      setLoginError("Enter your complete six-digit PIN.");
      return;
    }

    setSubmitting(true);
    setLoginError("");

    try {
      await login(
        selectedCashier.username,
        pin,
      );

      setServerOnline(true);
      setPin("");

      // CashierRouteGuard sees the new session and moves to Home with a
      // cleared history; navigating here as well would race it.
    } catch (error) {
      const networkFailure = isNetworkError(error);

      if (networkFailure) {
        setServerOnline(false);
      } else {
        if (error instanceof ApiError) {
          setServerOnline(true);
        }

        setPin("");
      }

      setLoginError(getLoginErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };


  // --------------------------------------------------
  // UI
  // --------------------------------------------------


  return (
    <SafeAreaView className="flex-1 bg-ctp-base">
      <View className="flex-1 px-6 pt-5">
        <Pressable
          onPress={() => {
            if (selectedCashier) {
              changeAccount();
            } else {
              goBack();
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          className="mb-5 h-10 w-10 items-center justify-center rounded-full"
        >
          <ArrowLeft size={23} color={c.text} />
        </Pressable>

        <View className="mb-7">
          <Text className="font-fredoka text-3xl text-ctp-text">
            Kinesis
          </Text>

          <Text className="mt-2 font-inter-regular text-sm text-ctp-subtext0">
            {selectedCashier
              ? "Enter your PIN to continue."
              : "Welcome back. Who's using this terminal?"}
          </Text>
        </View>


        {/* Server connection warning */}

        {serverOnline === false && (
          <View className="mb-5 flex-row items-center gap-3 rounded-xl border border-ctp-yellow/30 bg-ctp-yellow/10 p-3">
            <WifiOff
              size={19}
              color={c.warning}
            />

            <View className="min-w-0 flex-1">
              <Text className="font-inter-bold text-sm text-ctp-yellow">
                Kinesis server unreachable
              </Text>

              <Text className="mt-1 font-inter-regular text-xs leading-5 text-ctp-subtext0">
                Check the shop Wi-Fi and host computer. Your login
                will work again when the connection is restored.
              </Text>
            </View>

            <Pressable
              onPress={() => void fetchAccounts()}
              disabled={loadingAccounts}
              accessibilityRole="button"
              accessibilityLabel="Check server connection"
              className="h-9 w-9 items-center justify-center rounded-lg bg-ctp-surface0"
            >
              {loadingAccounts ? (
                <ActivityIndicator
                  size="small"
                  color={c.warning}
                />
              ) : (
                <RefreshCw
                  size={16}
                  color={c.warning}
                />
              )}
            </Pressable>
          </View>
        )}


        {!selectedCashier ? (
          <View className="flex-1">
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="font-inter-bold text-base text-ctp-text">
                Select your account
              </Text>

              <Pressable
                onPress={() => void fetchAccounts()}
                disabled={loadingAccounts}
                className="h-9 w-9 items-center justify-center rounded-lg bg-ctp-surface0"
                accessibilityRole="button"
                accessibilityLabel="Refresh cashier accounts"
              >
                {loadingAccounts && accounts.length === 0 ? (
                  <ActivityIndicator
                    size="small"
                    color={c.accent}
                  />
                ) : (
                  <RefreshCw
                    size={17}
                    color={c.accent}
                  />
                )}
              </Pressable>
            </View>


            {!!accountError && accounts.length > 0 && (
              <View className="mb-3 rounded-lg border border-ctp-yellow/30 bg-ctp-yellow/10 p-3">
                <Text className="font-inter-regular text-xs leading-5 text-ctp-yellow">
                  {accountError}
                </Text>
              </View>
            )}


            {loadingAccounts && accounts.length === 0 ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator
                  size="large"
                  color={c.accent}
                />

                <Text className="mt-4 font-inter-regular text-sm text-ctp-subtext0">
                  Connecting to Kinesis...
                </Text>
              </View>
            ) : accountError && accounts.length === 0 ? (
              <View className="rounded-xl border border-ctp-red/30 bg-ctp-red/10 p-4">
                <View className="flex-row items-center gap-2">
                  <WifiOff
                    size={17}
                    color={c.danger}
                  />

                  <Text className="font-inter-bold text-sm text-ctp-red">
                    Unable to load cashier accounts
                  </Text>
                </View>

                <Text className="mt-2 font-inter-regular text-sm leading-6 text-ctp-red">
                  {accountError}
                </Text>

                <Pressable
                  onPress={() => void fetchAccounts()}
                  disabled={loadingAccounts}
                  className="mt-4 min-h-11 flex-row items-center justify-center gap-2 rounded-lg bg-ctp-blue"
                >
                  {loadingAccounts && (
                    <ActivityIndicator
                      size="small"
                      color={c.onAccent}
                    />
                  )}

                  <Text className="font-inter-bold text-sm text-ctp-crust">
                    Try again
                  </Text>
                </Pressable>
              </View>
            ) : accounts.length === 0 ? (
              <View className="items-center rounded-xl border border-ctp-surface0 bg-ctp-mantle px-5 py-8">
                <UserRound size={32} color={c.muted} />

                <Text className="mt-4 text-center font-inter-bold text-base text-ctp-text">
                  No cashier accounts available
                </Text>

                <Text className="mt-2 text-center font-inter-regular text-sm leading-6 text-ctp-subtext0">
                  Ask your shop administrator to create or enable
                  a cashier account.
                </Text>
              </View>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                  gap: 10,
                  paddingBottom: 24,
                }}
              >
                {accounts.map((account) => (
                  <Pressable
                    key={account.id}
                    onPress={() => selectCashier(account)}
                    className="min-h-[76px] flex-row items-center rounded-xl border border-ctp-surface0 bg-ctp-mantle px-4 py-3 active:bg-ctp-surface0"
                  >
                    <View className="mr-4 h-11 w-11 items-center justify-center rounded-full bg-ctp-blue/15">
                      <Text className="font-inter-bold text-lg text-ctp-blue">
                        {account.display_name
                          .trim()
                          .charAt(0)
                          .toUpperCase()}
                      </Text>
                    </View>

                    <View className="flex-1">
                      <Text className="font-inter-bold text-base text-ctp-text">
                        {account.display_name}
                      </Text>

                      <Text className="mt-1 font-inter-regular text-xs text-ctp-subtext0">
                        @{account.username}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        ) : (
          <View className="flex-1">
            <View className="items-center rounded-xl border border-ctp-surface0 bg-ctp-mantle p-5">
              <View className="h-16 w-16 items-center justify-center rounded-full bg-ctp-blue/15">
                <UserRound size={30} color={c.accent} />
              </View>

              <Text className="mt-3 font-inter-bold text-lg text-ctp-text">
                {selectedCashier.display_name}
              </Text>

              <Text className="mt-1 font-inter-regular text-xs text-ctp-subtext0">
                @{selectedCashier.username}
              </Text>

              <Pressable
                onPress={changeAccount}
                disabled={submitting}
                className="mt-3"
              >
                <Text className="font-inter-semibold text-xs text-ctp-blue">
                  Switch account
                </Text>
              </Pressable>
            </View>


            <View className="mt-8">
              <View className="mb-3 flex-row items-center justify-center gap-2">
                <LockKeyhole size={17} color={c.muted} />

                <Text className="font-inter-semibold text-sm text-ctp-text">
                  Enter your six-digit PIN
                </Text>
              </View>

              <TextInput
                value={pin}
                onChangeText={(value) => {
                  setPin(
                    value.replace(/\D/g, "").slice(0, 6),
                  );

                  setLoginError("");
                }}
                editable={!submitting}
                autoFocus
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="••••••"
                placeholderTextColor={c.placeholder}
                selectionColor={c.accent}
                accessibilityLabel="Six-digit cashier PIN"
                className="min-h-16 rounded-xl border border-ctp-surface1 bg-ctp-mantle px-5 text-center font-inter-regular text-2xl tracking-[12px] text-ctp-text"
                onSubmitEditing={() => void handleLogin()}
                returnKeyType="go"
              />

              <Text className="mt-3 text-center font-inter-regular text-xs text-ctp-subtext0">
                Your PIN is only used to authenticate your cashier account.
              </Text>
            </View>


            {loginError ? (
              <View className="mt-5 rounded-lg border border-ctp-red/30 bg-ctp-red/10 p-3">
                <Text
                  accessibilityRole="alert"
                  className="text-center font-inter-regular text-sm leading-5 text-ctp-red"
                >
                  {loginError}
                </Text>
              </View>
            ) : null}


            <View className="mt-auto pb-6">
              <Pressable
                onPress={() => void handleLogin()}
                disabled={submitting || pin.length !== 6}
                accessibilityRole="button"
                accessibilityLabel="Continue to Kinesis"
                className={`min-h-14 flex-row items-center justify-center gap-2 rounded-xl ${submitting || pin.length !== 6
                    ? "bg-ctp-blue/40"
                    : "bg-ctp-blue active:opacity-80"
                  }`}
              >
                {submitting ? (
                  <ActivityIndicator color={c.onAccent} />
                ) : null}

                <Text className="font-inter-bold text-base text-ctp-crust">
                  {submitting ? "Signing in..." : "Continue"}
                </Text>
              </Pressable>
            </View>
          </View>
        )}


        <View className="items-center border-t border-ctp-surface0 py-4">
          <Text className="font-inter-regular text-[11px] text-ctp-subtext0">
            Kinesis POS · Authorized personnel only
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
