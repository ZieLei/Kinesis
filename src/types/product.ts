
import type { ImagePickerAsset } from "expo-image-picker";

export type Product = {
  id: number;
  sku: string | null;
  name: string;
  category: string;
  price: number;
  stock: number;
  howMuchSold: number;
  average_cost: number | null;
  image_path: string | null;
  image_url: string | null;
};

export type ProductsResponse = {
  items: Product[];
  limit: number;
  offset: number;
  count: number;
};

export type ProductCreate = Pick<
  Product,
  "name" | "category" | "price" | "stock"
> & {
  sku?: string | null;
  howMuchSold?: number;
  initial_unit_cost?: number | null;
};

/** Fields that can be changed without altering inventory quantity or cost. */
export type ProductUpdate = Pick<
  Product,
  "name" | "category" | "price"
> & {
  sku?: string | null;
};

/** Validated output of the add/edit product form. */
export type ProductFormValues = ProductCreate & {
  image: ImagePickerAsset | null;
  removeImage: boolean;
};
