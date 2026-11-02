

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
import { router } from "expo-router";

import {
  ArrowLeft,
  LockKeyhole,
  RefreshCw,
  UserRound,
} from "lucide-react-native";

import {
  apiRequest,
  ApiError,
} from "@/lib/api";

import {
  useCashierAuth,
  type CashierAccount,
} from "@/app/context/CashierAuthContext";

type CashierListResponse = {
  items: CashierAccount[];
};

export default function CashierLogin() {
  const { login } = useCashierAuth();

  const [accounts, setAccounts] = useState<CashierAccount[]>([]);
  const [selectedCashier, setSelectedCashier] =
    useState<CashierAccount | null>(null);

  const [pin, setPin] = useState("");

  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [accountError, setAccountError] = useState("");
  const [loginError, setLoginError] = useState("");

  const fetchAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    setAccountError("");

    try {
      const response = await apiRequest<CashierListResponse>(
        "/api/cashier-auth/accounts",
      );

      setAccounts(response.items);

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
      setAccountError(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not load cashier accounts.",
      );

      setAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  useEffect(() => {
    void fetchAccounts();
  }, [fetchAccounts]);

  const selectCashier = (account: CashierAccount) => {
    if (submitting) return;

    setSelectedCashier(account);
    setPin("");
    setLoginError("");
  };

  const handleLogin = async () => {
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

      setPin("");

      router.replace("/dashboard");
    } catch (error) {
      setPin("");

      setLoginError(
        error instanceof Error
          ? error.message
          : "Could not sign in. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const changeAccount = () => {
    if (submitting) return;

    setSelectedCashier(null);
    setPin("");
    setLoginError("");
  };

  return (
    <SafeAreaView className="flex-1 bg-ctp-base">
      <View className="flex-1 px-6 pt-5">
        <Pressable
          onPress={() => {
            if (selectedCashier) {
              changeAccount();
            } else {
              router.replace("/");
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          className="mb-5 h-10 w-10 items-center justify-center rounded-full"
        >
          <ArrowLeft size={23} color="#CDD6F4" />
        </Pressable>

        <View className="mb-7">
          <Text className="font-fredoka text-3xl text-ctp-text">
            Kinesis
          </Text>

          <Text className="mt-2 font-line-seed text-sm text-ctp-subtext0">
            {selectedCashier
              ? "Enter your PIN to continue."
              : "Welcome back. Who's using this terminal?"}
          </Text>
        </View>

        {!selectedCashier ? (
          <View className="flex-1">
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="font-line-seed text-base font-bold text-ctp-text">
                Select your account
              </Text>

              <Pressable
                onPress={() => void fetchAccounts()}
                disabled={loadingAccounts}
                className="h-9 w-9 items-center justify-center rounded-lg bg-ctp-surface0"
                accessibilityRole="button"
                accessibilityLabel="Refresh cashier accounts"
              >
                {loadingAccounts ? (
                  <ActivityIndicator size="small" color="#89B4FA" />
                ) : (
                  <RefreshCw size={17} color="#89B4FA" />
                )}
              </Pressable>
            </View>

            {loadingAccounts ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator size="large" color="#89B4FA" />

                <Text className="mt-4 font-line-seed text-sm text-ctp-subtext0">
                  Loading cashier accounts...
                </Text>
              </View>
            ) : accountError ? (
              <View className="rounded-xl border border-ctp-red/30 bg-ctp-red/10 p-4">
                <Text className="font-line-seed text-sm text-ctp-red">
                  {accountError}
                </Text>

                <Pressable
                  onPress={() => void fetchAccounts()}
                  className="mt-4 min-h-11 items-center justify-center rounded-lg bg-ctp-blue"
                >
                  <Text className="font-line-seed text-sm font-bold text-ctp-crust">
                    Try again
                  </Text>
                </Pressable>
              </View>
            ) : accounts.length === 0 ? (
              <View className="items-center rounded-xl border border-ctp-surface0 bg-ctp-mantle px-5 py-8">
                <UserRound size={32} color="#A6ADC8" />

                <Text className="mt-4 text-center font-line-seed text-base font-bold text-ctp-text">
                  No cashier accounts available
                </Text>

                <Text className="mt-2 text-center font-line-seed text-sm leading-6 text-ctp-subtext0">
                  Ask your shop administrator to create or enable a cashier account.
                </Text>
              </View>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
              >
                {accounts.map((account) => (
                  <Pressable
                    key={account.id}
                    onPress={() => selectCashier(account)}
                    className="min-h-[76px] flex-row items-center rounded-xl border border-ctp-surface0 bg-ctp-mantle px-4 py-3 active:bg-ctp-surface0"
                  >
                    <View className="mr-4 h-11 w-11 items-center justify-center rounded-full bg-ctp-blue/15">
                      <Text className="font-line-seed text-lg font-bold text-ctp-blue">
                        {account.display_name
                          .trim()
                          .charAt(0)
                          .toUpperCase()}
                      </Text>
                    </View>

                    <View className="flex-1">
                      <Text className="font-line-seed text-base font-bold text-ctp-text">
                        {account.display_name}
                      </Text>

                      <Text className="mt-1 font-line-seed text-xs text-ctp-subtext0">
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
                <UserRound size={30} color="#89B4FA" />
              </View>

              <Text className="mt-3 font-line-seed text-lg font-bold text-ctp-text">
                {selectedCashier.display_name}
              </Text>

              <Text className="mt-1 font-line-seed text-xs text-ctp-subtext0">
                @{selectedCashier.username}
              </Text>

              <Pressable
                onPress={changeAccount}
                disabled={submitting}
                className="mt-3"
              >
                <Text className="font-line-seed text-xs font-semibold text-ctp-blue">
                  Switch account
                </Text>
              </Pressable>
            </View>

            <View className="mt-8">
              <View className="mb-3 flex-row items-center justify-center gap-2">
                <LockKeyhole size={17} color="#A6ADC8" />

                <Text className="font-line-seed text-sm font-semibold text-ctp-text">
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
                placeholderTextColor="#6C7086"
                selectionColor="#89B4FA"
                accessibilityLabel="Six-digit cashier PIN"
                className="min-h-16 rounded-xl border border-ctp-surface1 bg-ctp-mantle px-5 text-center font-line-seed text-2xl tracking-[12px] text-ctp-text"
                onSubmitEditing={() => void handleLogin()}
                returnKeyType="go"
              />

              <Text className="mt-3 text-center font-line-seed text-xs text-ctp-subtext0">
                Your PIN is only used to authenticate your cashier account.
              </Text>
            </View>

            {loginError ? (
              <View className="mt-5 rounded-lg border border-ctp-red/30 bg-ctp-red/10 p-3">
                <Text className="text-center font-line-seed text-sm text-ctp-red">
                  {loginError}
                </Text>
              </View>
            ) : null}

            <View className="mt-auto pb-6">
              <Pressable
                onPress={() => void handleLogin()}
                disabled={submitting || pin.length !== 6}
                className={`min-h-14 flex-row items-center justify-center gap-2 rounded-xl ${submitting || pin.length !== 6
                  ? "bg-ctp-blue/40"
                  : "bg-ctp-blue active:opacity-80"
                  }`}
              >
                {submitting ? (
                  <ActivityIndicator color="#1E1E2E" />
                ) : null}

                <Text className="font-line-seed text-base font-bold text-ctp-crust">
                  {submitting ? "Signing in..." : "Continue"}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        <View className="items-center border-t border-ctp-surface0 py-4">
          <Text className="font-line-seed text-[11px] text-ctp-subtext0">
            Kinesis POS · Authorized personnel only
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
