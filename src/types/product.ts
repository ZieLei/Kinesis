import type { ImagePickerAsset } from "expo-image-picker";

export type Product = {
  id: number;
  sku: string | null;
  name: string;
  category: string;
  price: number;
  stock: number;
  howMuchSold: number;
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
};

/** The text fields the API accepts when updating a product. */
export type ProductUpdate = Pick<
  Product,
  "name" | "category" | "price" | "stock"
>;

/** Validated output of the add/edit product form. */
export type ProductFormValues = ProductUpdate & {
  image: ImagePickerAsset | null;
  removeImage: boolean;
};
