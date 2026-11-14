
import { useCallback, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ChevronLeft,
  Search,
  Plus,
  Wrench,
  X,
  Clock,
  Pencil,
  ShoppingCart,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";

import { useServices } from "@/hooks/useServices";
import { useCart } from "@/app/context/CartContext";
import { usePOSFormatting } from "@/hooks/usePOSFormatting";
import { useBackNavigation } from "@/hooks/useBackNavigation";
import { useCashierAuth } from "@/app/context/CashierAuthContext";
import ConfirmDialog from "@/components/ConfirmDialog";
import ServiceFormSheet from "@/components/services/ServiceFormSheet";
import Snackbar from "@/components/Snackbar";
import type { Service } from "@/types/service";

export default function Services() {
  const { canGoBack, goBack } = useBackNavigation();
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { formatCurrency } = usePOSFormatting();

  const [searchQuery, setSearchQuery] = useState("");

  const {
    services,
    loading,
    loadError,
    refreshServices,
    addService,
    editService,
    archiveService,
  } = useServices(searchQuery);

  const { addServiceToCart, removeFromCart, items } = useCart();
  const { cashier } = useCashierAuth();

  // Only supervisors reprice or retire services (the server enforces it too).
  const canManage = cashier?.is_supervisor === true;

  // `undefined`: sheet closed. `null`: creating. A service: editing it.
  const [sheetTarget, setSheetTarget] = useState<Service | null | undefined>(
    undefined,
  );
  const [archiveTarget, setArchiveTarget] = useState<Service | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const hideNotice = useCallback(() => setNotice(null), []);

  const submitService = async (values: Parameters<typeof addService>[0]) => {
    if (sheetTarget) {
      const saved = await editService(sheetTarget.id, values);
      setNotice(`${saved.name} was updated.`);
    } else {
      const created = await addService(values);
      setSearchQuery("");
      setNotice(`${created.name} was added.`);
    }

    setSheetTarget(undefined);
  };

  const confirmArchive = async () => {
    const service = archiveTarget;
    if (!service || archiving) return;

    setArchiving(true);
    setArchiveError("");

    try {
      await archiveService(service.id);
      // A retired service cannot be sold: take it out of this cart too.
      removeFromCart("service", service.id);
      setArchiveTarget(null);
      setSheetTarget(undefined);
      setNotice(`${service.name} was archived.`);
    } catch (caught) {
      setArchiveError(
        caught instanceof Error
          ? caught.message
          : "Could not archive this service. Check your connection and try again.",
      );
    } finally {
      setArchiving(false);
    }
  };

  const addServiceToSale = (service: (typeof services)[number]) => {
    addServiceToCart({
      id: service.id,
      name: service.name,
      description: service.description,
      price: service.price,
    });
  };

  const serviceCartCount = items.reduce(
    (count, item) =>
      item.type === "service" ? count + item.quantity : count,
    0,
  );

  return (
    <SafeAreaView className="flex-1 bg-ctp-base">
      <View className="flex-1 px-5 pt-7">
        <View className="mb-6 flex-row items-center justify-between">
          {canGoBack ? (
            <Pressable
              onPress={goBack}
              className="h-9 w-9 items-center justify-center rounded-lg"
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <ChevronLeft
                size={22}
                color={isDark ? "#CDD6F4" : "#4C4F69"}
              />
            </Pressable>
          ) : (
            <View className="h-9 w-9" />
          )}

          <Text className="text-lg font-inter-semibold text-ctp-text">
            Services
          </Text>

          <Pressable
            onPress={() => router.push("/cart")}
            className="h-9 min-w-9 flex-row items-center justify-center gap-1 rounded-lg"
            accessibilityRole="button"
            accessibilityLabel={`Open cart, ${serviceCartCount} services`}
          >
            <ShoppingCart
              size={19}
              color={isDark ? "#CDD6F4" : "#4C4F69"}
            />
            {serviceCartCount > 0 ? (
              <Text className="font-inter-semibold text-xs text-ctp-blue">
                {serviceCartCount}
              </Text>
            ) : null}
          </Pressable>
        </View>

        <View className="mb-5 h-12 flex-row items-center rounded-lg border-[1.5px] border-ctp-surface2 bg-ctp-mantle px-3">
          <View className="mr-2 h-full items-center justify-center">
            <Search
              size={19}
              color={isDark ? "#A6ADC8" : "#6C6F85"}
            />
          </View>

          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search services..."
            placeholderTextColor={isDark ? "#A6ADC8" : "#6C6F85"}
            selectionColor={isDark ? "#89B4FA" : "#1E66F5"}
            className="flex-1 py-0 text-base font-inter-regular text-ctp-text"
            returnKeyType="search"
            autoCapitalize="none"
          />

          {searchQuery.length > 0 ? (
            <Pressable
              onPress={() => setSearchQuery("")}
              className="items-center justify-center p-1"
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <X
                size={17}
                color={isDark ? "#A6ADC8" : "#6C6F85"}
              />
            </Pressable>
          ) : null}
        </View>

        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-sm font-inter-medium text-ctp-subtext1">
            Available Services
          </Text>

          <Text className="text-xs font-inter-medium text-ctp-subtext0">
            {loading
              ? "Loading..."
              : `${services.length} ${services.length === 1 ? "service" : "services"
              }`}
          </Text>
        </View>

        <FlatList
          data={services}
          keyExtractor={(item) => String(item.id)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: 20,
            flexGrow: 1,
          }}
          ItemSeparatorComponent={() => <View className="h-3" />}
          renderItem={({ item }) => (
            <View className="rounded-lg border border-ctp-surface0 bg-ctp-mantle p-4">
              <View className="flex-row items-start">
                <View className="h-12 w-12 items-center justify-center rounded-md bg-ctp-surface0">
                  <Wrench
                    size={23}
                    color={isDark ? "#CDD6F4" : "#4C4F69"}
                  />
                </View>

                <View className="ml-3 flex-1">
                  <Text className="text-base font-inter-semibold text-ctp-text">
                    {item.name}
                  </Text>

                  <Text className="mt-1 text-xs leading-5 font-inter-regular text-ctp-subtext1">
                    {item.description || "No description provided."}
                  </Text>
                </View>
              </View>

              <View className="my-4 border-t border-ctp-surface0" />

              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <Clock
                    size={15}
                    color={isDark ? "#A6ADC8" : "#6C6F85"}
                  />

                  <Text className="text-sm font-inter-medium text-ctp-subtext0">
                    Service fee:
                  </Text>
                </View>

                <Text className="text-base font-inter-bold text-ctp-text">
                  {formatCurrency(item.price)}
                </Text>
              </View>

              <View className="mt-2 flex-row items-center justify-between">
                <Text className="text-xs font-inter-medium text-ctp-subtext0">
                  Estimated cost:
                </Text>

                <Text className="text-xs font-inter-semibold text-ctp-text">
                  {item.estimated_cost === null
                    ? "Not recorded"
                    : formatCurrency(item.estimated_cost)}
                </Text>
              </View>

              <Pressable
                onPress={() => addServiceToSale(item)}
                className="mt-4 flex-row items-center justify-center gap-2 rounded-lg bg-ctp-blue px-4 py-3"
                accessibilityRole="button"
                accessibilityLabel={`Add ${item.name} to sale`}
              >
                <Plus
                  size={17}
                  color={isDark ? "#11111B" : "#FFFFFF"}
                />
                <Text className="font-inter-semibold text-sm text-white">
                  Add to Sale
                </Text>
              </Pressable>

              {canManage ? (
                <Pressable
                  onPress={() => setSheetTarget(item)}
                  className="mt-2 flex-row items-center justify-center gap-2 rounded-lg border border-ctp-surface2 px-4 py-2.5"
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${item.name}`}
                >
                  <Pencil
                    size={15}
                    color={isDark ? "#CDD6F4" : "#4C4F69"}
                  />
                  <Text className="font-inter-semibold text-sm text-ctp-text">
                    Edit service
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-12">
              {loading ? (
                <ActivityIndicator
                  size="large"
                  color={isDark ? "#89B4FA" : "#1E66F5"}
                />
              ) : loadError ? (
                <>
                  <Text className="text-center text-sm font-inter-medium text-ctp-red">
                    {loadError}
                  </Text>

                  <Pressable
                    onPress={refreshServices}
                    className="mt-3 rounded-lg bg-ctp-surface0 px-4 py-2"
                    accessibilityRole="button"
                  >
                    <Text className="font-inter-semibold text-sm text-ctp-text">
                      Retry
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <View className="mb-3 h-14 w-14 items-center justify-center rounded-full bg-ctp-mantle">
                    <Search
                      size={24}
                      color={isDark ? "#A6ADC8" : "#6C6F85"}
                    />
                  </View>

                  <Text className="text-base font-inter-semibold text-ctp-text">
                    No services found
                  </Text>

                  <Text className="mt-1 text-center text-sm font-inter-regular text-ctp-subtext0">
                    Try another search or create a new service.
                  </Text>
                </>
              )}
            </View>
          }
          ListFooterComponent={
            <Pressable
              onPress={() => setSheetTarget(null)}
              className="mt-3 min-h-[100px] flex-row items-center justify-center rounded-lg border border-dashed border-ctp-surface2 bg-ctp-mantle p-6"
              accessibilityRole="button"
              accessibilityLabel="Create new service"
            >
              <View className="mr-3 h-11 w-11 items-center justify-center rounded-full bg-ctp-surface2">
                <Plus
                  size={23}
                  color={isDark ? "#11111B" : "#EFF1F5"}
                />
              </View>

              <View className="flex-1">
                <Text className="text-sm font-inter-semibold text-ctp-text">
                  Create New Service
                </Text>

                <Text className="mt-1 text-xs font-inter-regular text-ctp-subtext0">
                  Add a motorcycle service and set its price and estimated cost.
                </Text>
              </View>

              <Plus
                size={19}
                color={isDark ? "#CDD6F4" : "#4C4F69"}
              />
            </Pressable>
          }
        />
      </View>

      {sheetTarget !== undefined ? (
        <ServiceFormSheet
          service={sheetTarget}
          onClose={() => setSheetTarget(undefined)}
          onSubmit={submitService}
          onArchive={
            sheetTarget && canManage
              ? () => {
                  setArchiveError("");
                  setArchiveTarget(sheetTarget);
                }
              : undefined
          }
        />
      ) : null}

      <ConfirmDialog
        visible={archiveTarget !== null}
        title="Archive service?"
        message={
          archiveTarget
            ? `"${archiveTarget.name}" will be removed from the POS and can no longer be sold. Its past sales and reports are kept, and an administrator can restore it from the admin console.`
            : ""
        }
        confirmLabel="Archive"
        busy={archiving}
        error={archiveError}
        onConfirm={() => void confirmArchive()}
        onCancel={() => {
          if (!archiving) {
            setArchiveTarget(null);
            setArchiveError("");
          }
        }}
      />

      <Snackbar message={notice} onHide={hideNotice} />
    </SafeAreaView>
  );
}
