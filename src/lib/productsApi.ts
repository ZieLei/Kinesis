import type { ImagePickerAsset } from "expo-image-picker";

import { apiRequest } from "@/lib/api";
import type {
  Product,
  ProductCreate,
  ProductsResponse,
  ProductUpdate,
} from "@/types/product";

const PAGE_SIZE = 100;

export async function fetchAllProducts(
  signal?: AbortSignal,
): Promise<Product[]> {
  const allProducts: Product[] = [];
  let offset = 0;
  let expectedCount: number | null = null;

  while (true) {
    const response = await apiRequest<ProductsResponse>(
      `/api/products?limit=${PAGE_SIZE}&offset=${offset}`,
      { signal },
    );

    if (!Array.isArray(response.items)) {
      throw new Error("The server returned an unexpected inventory response.");
    }

    if (expectedCount === null) {
      expectedCount = response.count;
    }

    allProducts.push(...response.items);

    if (
      response.items.length === 0 ||
      allProducts.length >= expectedCount ||
      response.items.length < PAGE_SIZE
    ) {
      break;
    }

    offset += response.items.length;
  }

  return allProducts;
}

export function createProduct(data: ProductCreate): Promise<Product> {
  return apiRequest<Product>("/api/products", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateProduct(
  id: number,
  update: ProductUpdate,
): Promise<Product> {
  return apiRequest<Product>(`/api/products/${id}`, {
    method: "PUT",
    body: JSON.stringify(update),
  });
}

/** Uploads a new image using a real Blob in multipart/form-data. */
export async function uploadProductImage(
  id: number,
  image: ImagePickerAsset,
): Promise<Product> {
  const imageResponse = await fetch(image.uri);

  if (!imageResponse.ok) {
    throw new Error("Could not read the selected image from your device.");
  }

  const imageBlob = await imageResponse.blob();
  const formData = new FormData();

  const filename =
    image.fileName ||
    `product-${id}.${image.mimeType?.split("/")[1] || "jpg"}`;

  formData.append("file", imageBlob, filename);

  return apiRequest<Product>(`/api/products/${id}/image`, {
    method: "POST",
    body: formData,
  });
}

export function deleteProductImage(id: number): Promise<Product> {
  return apiRequest<Product>(`/api/products/${id}/image`, {
    method: "DELETE",
  });
}

export function deleteProduct(id: number) {
  return apiRequest<{ message: string; id: number }>(`/api/products/${id}`, {
    method: "DELETE",
  });
}
