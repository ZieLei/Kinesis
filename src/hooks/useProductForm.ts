import { useState } from "react";
import * as ImagePicker from "expo-image-picker";

import { getImageUri } from "@/lib/products";
import type { Product, ProductFormValues } from "@/types/product";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function useProductForm(
  product: Product | null,
  active = product !== null,
) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [stock, setStock] = useState("0");
  const [price, setPrice] = useState("");
  const [customPercent, setCustomPercent] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [formError, setFormError] = useState("");
  const [selectedImage, setSelectedImage] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [removeExistingImage, setRemoveExistingImage] = useState(false);

  const [trackedProduct, setTrackedProduct] = useState<Product | null>(null);
  const [trackedActive, setTrackedActive] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  if (
    !hasInitialized ||
    product !== trackedProduct ||
    active !== trackedActive
  ) {
    setHasInitialized(true);
    setTrackedProduct(product);
    setTrackedActive(active);

    if (active && product) {
      setName(product.name);
      setCategory(product.category);
      setStock(String(product.stock));
      setPrice(String(product.price));
    } else {
      setName("");
      setCategory("");
      setStock("0");
      setPrice("");
    }

    setCustomPercent("");
    setNewCategory("");
    setShowNewCategory(false);
    setFormError("");
    setSelectedImage(null);
    setRemoveExistingImage(false);
  }

  const imagePreviewUri =
    selectedImage?.uri ?? (removeExistingImage ? null : getImageUri(product));

  const changeName = (value: string) => {
    setName(value);
    setFormError("");
  };

  const changeStock = (value: string) => {
    setStock(value);
    setFormError("");
  };

  const changePrice = (value: string) => {
    setPrice(value);
    setFormError("");
  };

  const changeCustomPercent = (value: string) => {
    setCustomPercent(value);
    setFormError("");
  };

  const changeNewCategory = (value: string) => {
    setNewCategory(value);
    setFormError("");
  };

  const selectCategory = (value: string) => {
    setCategory(value);
    setFormError("");
  };

  const toggleNewCategory = () => {
    setShowNewCategory((previous) => !previous);
    setNewCategory("");
    setFormError("");
  };

  const addCategory = () => {
    const trimmed = newCategory.trim();

    if (!trimmed) {
      setFormError("Enter a category name first.");
      return;
    }

    setCategory(trimmed);
    setNewCategory("");
    setShowNewCategory(false);
    setFormError("");
  };

  const chooseImage = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setFormError("Allow photo-library access to choose a product image.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];

      if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
        setFormError("Choose an image smaller than 5 MB.");
        return;
      }

      setSelectedImage(asset);
      setRemoveExistingImage(false);
      setFormError("");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not select the image.",
      );
    }
  };

  const removeImage = () => {
    setSelectedImage(null);

    if (product?.image_path || product?.image_url) {
      setRemoveExistingImage(true);
    } else {
      setRemoveExistingImage(false);
    }

    setFormError("");
  };

  const handleImagePreviewError = () => {
    if (!selectedImage) {
      setFormError(
        "The saved image could not be loaded. You can choose a replacement.",
      );
    }
  };

  const applyPricePercentage = (percentage: number) => {
    const currentPrice = Number(price);

    if (
      price.trim() === "" ||
      !Number.isFinite(currentPrice) ||
      currentPrice <= 0
    ) {
      setFormError("Enter a valid price greater than 0 first.");
      return;
    }

    const adjustedPrice = currentPrice * (1 + percentage / 100);

    if (!Number.isFinite(adjustedPrice) || adjustedPrice <= 0) {
      setFormError("The adjusted price must be greater than 0.");
      return;
    }

    setPrice(adjustedPrice.toFixed(2));
    setCustomPercent("");
    setFormError("");
  };

  const applyCustomPercentage = () => {
    const percentage = Number(customPercent);

    if (
      customPercent.trim() === "" ||
      !Number.isFinite(percentage) ||
      percentage <= -100
    ) {
      setFormError("Enter a valid percentage greater than -100.");
      return;
    }

    applyPricePercentage(percentage);
  };

  const validate = (): ProductFormValues | null => {
    const trimmedName = name.trim();
    const trimmedCategory = category.trim();
    const parsedPrice = Number(price);
    const parsedStock = Number(stock);

    if (!trimmedName) {
      setFormError("Product name is required.");
      return null;
    }

    if (!trimmedCategory) {
      setFormError("Choose or enter a category.");
      return null;
    }

    if (
      price.trim() === "" ||
      !Number.isFinite(parsedPrice) ||
      parsedPrice <= 0
    ) {
      setFormError("Price must be a valid number greater than 0.");
      return null;
    }

    if (
      stock.trim() === "" ||
      !Number.isInteger(parsedStock) ||
      parsedStock < 0
    ) {
      setFormError("Stock must be a whole number of 0 or higher.");
      return null;
    }

    setFormError("");

    return {
      name: trimmedName,
      category: trimmedCategory,
      price: Number(parsedPrice.toFixed(2)),
      stock: parsedStock,
      image: selectedImage,
      removeImage: removeExistingImage,
    };
  };

  return {
    name,
    category,
    stock,
    price,
    customPercent,
    newCategory,
    showNewCategory,
    formError,
    setFormError,
    imagePreviewUri,
    changeName,
    changeStock,
    changePrice,
    changeCustomPercent,
    changeNewCategory,
    selectCategory,
    toggleNewCategory,
    addCategory,
    chooseImage,
    removeImage,
    handleImagePreviewError,
    applyPricePercentage,
    applyCustomPercentage,
    validate,
  };
}
