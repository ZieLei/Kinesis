import { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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
  PhilippinePeso,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";

type Service = {
  id: string;
  name: string;
  description: string;
  price: number;
};

export default function Services() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const [searchQuery, setSearchQuery] = useState("");
  const [services, setServices] = useState<Service[]>([
    {
      id: "1",
      name: "Basic Motorcycle Tune-Up",
      description:
        "General inspection, chain adjustment, and basic maintenance for your motorcycle.",
      price: 350,
    },
  ]);

  const [modalVisible, setModalVisible] = useState(false);
  const [serviceName, setServiceName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [formError, setFormError] = useState("");

  const filteredServices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) return services;

    return services.filter(
      (service) =>
        service.name.toLowerCase().includes(query) ||
        service.description.toLowerCase().includes(query),
    );
  }, [services, searchQuery]);

  const resetForm = () => {
    setServiceName("");
    setDescription("");
    setPrice("");
    setFormError("");
  };

  const closeModal = () => {
    setModalVisible(false);
    resetForm();
  };

  const createService = () => {
    const parsedPrice = Number(price);

    if (!serviceName.trim()) {
      setFormError("Please enter a service name.");
      return;
    }

    if (!price.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setFormError("Please enter a valid price.");
      return;
    }

    const newService: Service = {
      id: Date.now().toString(),
      name: serviceName.trim(),
      description: description.trim() || "No description provided.",
      price: parsedPrice,
    };

    setServices((current) => [newService, ...current]);
    setSearchQuery("");
    closeModal();
  };

  const formatPrice = (amount: number) =>
    `₱${amount.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <SafeAreaView className="flex-1 bg-ctp-base">
      <View className="flex-1 px-5 pt-7">
        {/* Header */}
        <View className="mb-6 flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="h-9 w-9 items-center justify-center rounded-lg"
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={22} color={isDark ? "#CDD6F4" : "#4C4F69"} />
          </Pressable>

          <Text className="text-lg font-inter-semibold text-ctp-text">
            Services
          </Text>

          <View className="h-9 w-9" />
        </View>


        <View className="mb-5 h-12 flex-row items-center rounded-lg border-[1.5px] border-ctp-surface2 bg-ctp-mantle px-3">
          <View className="mr-2 h-full items-center justify-center">
            <Search size={19} color={isDark ? "#A6ADC8" : "#6C6F85"} />
          </View>

          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search services..."
            placeholderTextColor={isDark ? "#A6ADC8" : "#6C6F85"}
            selectionColor={isDark ? "#89B4FA" : "#1E66F5"}
            className="flex-1 py-0 text-base font-inter-regular text-ctp-text"
            returnKeyType="search"
          />

          {searchQuery.length > 0 && (
            <Pressable
              onPress={() => setSearchQuery("")}
              className="items-center justify-center p-1"
              accessibilityLabel="Clear search"
            >
              <X size={17} color={isDark ? "#A6ADC8" : "#6C6F85"} />
            </Pressable>
          )}
        </View>

        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-sm font-inter-medium text-ctp-subtext1">
            Available Services
          </Text>

          <Text className="text-xs font-inter-medium text-ctp-subtext0">
            {filteredServices.length}{" "}
            {filteredServices.length === 1 ? "service" : "services"}
          </Text>
        </View>

        <FlatList
          data={filteredServices}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20, flexGrow: 1 }}
          ItemSeparatorComponent={() => <View className="h-3" />}
          renderItem={({ item }) => (
            <View className="rounded-lg border border-ctp-surface0 bg-ctp-mantle p-4">
              <View className="flex-row items-start">
                <View className="h-12 w-12 items-center justify-center rounded-md bg-ctp-surface0">
                  <Wrench
                    size={23}
                    className="text-ctp-text"
                  />
                </View>

                <View className="ml-3 flex-1">
                  <Text className="text-base font-inter-semibold text-ctp-text">
                    {item.name}
                  </Text>

                  <Text className="mt-1 text-xs leading-5 font-inter-regular text-ctp-subtext1">
                    {item.description}
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
                  {formatPrice(item.price)}
                </Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-12">
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
            </View>
          }
          ListFooterComponent={
            <Pressable
              onPress={() => setModalVisible(true)}
              className="mt-3 min-h-[100px] flex-row items-center justify-center rounded-lg border border-dashed border-ctp-surface2 bg-ctp-mantle p-6"
            >
              <View className="mr-3 h-11 w-11 items-center justify-center rounded-full bg-ctp-surface2">
                <Plus size={23} className="text-ctp-base" />
              </View>

              <View className="flex-1">
                <Text className="text-sm font-inter-semibold text-ctp-text">
                  Create New Service
                </Text>
                <Text className="mt-1 text-xs font-inter-regular text-ctp-subtext0">
                  Add a motorcycle service and set its price.
                </Text>
              </View>

              <Plus size={19} className="text-ctp-text" />
            </Pressable>
          }
        />
      </View>

      {/* Create Service Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
        statusBarTranslucent
      >
        {/* TODO: Keyboard avoid not working for android. IOS not tested yet */}
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1 justify-end"
        >
          <Pressable
            onPress={closeModal}
            className="absolute inset-0 bg-black/50"
          />

          <View className="max-h-[90%] rounded-t-3xl bg-ctp-base px-5 pb-8 pt-3">
            {/* Modal handle */}
            <View className="mb-5 items-center">
              <View className="h-1.5 w-12 rounded-full bg-ctp-surface2" />
            </View>

            {/* Modal header */}
            <View className="mb-6 flex-row items-center justify-between">
              <View>
                <Text className="text-xl font-inter-bold text-ctp-text">
                  Create Service
                </Text>
                <Text className="mt-1 text-sm font-inter-regular text-ctp-subtext0">
                  Enter the details for the new service.
                </Text>
              </View>

              <Pressable
                onPress={closeModal}
                className="h-9 w-9 items-center justify-center rounded-lg bg-ctp-mantle"
                accessibilityLabel="Close modal"
              >
                <X
                  size={19}
                  className="text-ctp-text"
                />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Service name */}
              <Text className="mb-2 text-sm font-inter-semibold text-ctp-text">
                Service Name *
              </Text>

              <TextInput
                value={serviceName}
                onChangeText={(value) => {
                  setServiceName(value);
                  setFormError("");
                }}
                placeholder="e.g. Oil Change"
                placeholderTextColor={isDark ? "#A6ADC8" : "#6C6F85"}
                selectionColor={isDark ? "#89B4FA" : "#1E66F5"}
                className="mb-5 rounded-lg border border-ctp-surface2 bg-ctp-mantle px-4 py-3 text-sm font-inter-regular text-ctp-text"
                maxLength={80}
              />

              {/* Description */}
              <Text className="mb-2 text-sm font-inter-semibold text-ctp-text">
                Description
              </Text>

              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Describe what's included in the service..."
                placeholderTextColor={isDark ? "#A6ADC8" : "#6C6F85"}
                selectionColor={isDark ? "#89B4FA" : "#1E66F5"}
                multiline
                textAlignVertical="top"
                className="mb-5 min-h-[100px] rounded-lg border border-ctp-surface2 bg-ctp-mantle px-4 py-3 text-sm font-inter-regular text-ctp-text"
                maxLength={300}
              />

              {/* Price */}
              <Text className="mb-2 text-sm font-inter-semibold text-ctp-text">
                Service Price (₱) *
              </Text>

              <View className="mb-3 flex-row items-center rounded-lg border border-ctp-surface2 bg-ctp-mantle px-4">
                <PhilippinePeso
                  size={18}
                  color={isDark ? "#A6ADC8" : "#6C6F85"}
                />

                <TextInput
                  value={price}
                  onChangeText={(value) => {
                    setPrice(value);
                    setFormError("");
                  }}
                  placeholder="0.00"
                  placeholderTextColor={isDark ? "#A6ADC8" : "#6C6F85"}
                  selectionColor={isDark ? "#89B4FA" : "#1E66F5"}
                  keyboardType="decimal-pad"
                  className="flex-1 px-3 py-3 text-sm font-inter-regular text-ctp-text"
                />
              </View>

              {formError ? (
                <Text className="mb-3 text-sm font-inter-medium text-ctp-red">
                  {formError}
                </Text>
              ) : null}

              {/* Actions */}
              <View className="mt-4 flex-row gap-3">
                <Pressable
                  onPress={closeModal}
                  className="flex-1 items-center justify-center rounded-lg border border-ctp-surface2 bg-ctp-mantle px-4 py-3"
                >
                  <Text className="text-sm font-inter-semibold text-ctp-text">
                    Cancel
                  </Text>
                </Pressable>

                <Pressable
                  onPress={createService}
                  className="flex-1 flex-row items-center justify-center rounded-xl bg-ctp-blue px-4 py-3"
                >
                  <Plus
                    size={17}
                    className={`${isDark ? "text-ctp-base" : "text-white"}`}
                  />
                  <Text
                    className={`ml-2 text-sm font-inter-semibold ${isDark ? "text-ctp-crust" : "text-white"
                      }`}
                  >
                    Create Service
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
