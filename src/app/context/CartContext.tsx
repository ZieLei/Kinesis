
import { createContext, useContext, useReducer } from "react";

export type ProductCartItem = {
  type: "product";
  id: number;
  name: string;
  price: number;
  quantity: number;
};

export type ServiceCartItem = {
  type: "service";
  id: number;
  name: string;
  description: string;
  price: number;
  quantity: number;
};

export type CartItem = ProductCartItem | ServiceCartItem;

type CartState = {
  items: CartItem[];
};

type CartAction =
  | {
    kind: "ADD_PRODUCT";
    product: Omit<ProductCartItem, "type" | "quantity">;
  }
  | {
    kind: "ADD_SERVICE";
    service: Omit<ServiceCartItem, "type" | "quantity">;
  }
  | {
    kind: "INCREASE";
    itemType: CartItem["type"];
    id: number;
  }
  | {
    kind: "DECREASE";
    itemType: CartItem["type"];
    id: number;
  }
  | {
    kind: "REMOVE";
    itemType: CartItem["type"];
    id: number;
  }
  | { kind: "CLEAR" };

function cartReducer(
  state: CartState,
  action: CartAction,
): CartState {
  switch (action.kind) {
    case "ADD_PRODUCT": {
      const existing = state.items.find(
        (item) =>
          item.type === "product" &&
          item.id === action.product.id,
      );

      if (existing) {
        return {
          ...state,
          items: state.items.map((item) =>
            item.type === "product" &&
              item.id === action.product.id
              ? { ...item, quantity: item.quantity + 1 }
              : item,
          ),
        };
      }

      return {
        ...state,
        items: [
          ...state.items,
          {
            ...action.product,
            type: "product",
            quantity: 1,
          },
        ],
      };
    }

    case "ADD_SERVICE": {
      const existing = state.items.find(
        (item) =>
          item.type === "service" &&
          item.id === action.service.id,
      );

      if (existing) {
        return {
          ...state,
          items: state.items.map((item) =>
            item.type === "service" &&
              item.id === action.service.id
              ? { ...item, quantity: item.quantity + 1 }
              : item,
          ),
        };
      }

      return {
        ...state,
        items: [
          ...state.items,
          {
            ...action.service,
            type: "service",
            quantity: 1,
          },
        ],
      };
    }

    case "INCREASE":
      return {
        ...state,
        items: state.items.map((item) =>
          item.type === action.itemType &&
            item.id === action.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        ),
      };

    case "DECREASE":
      return {
        ...state,
        items: state.items
          .map((item) =>
            item.type === action.itemType &&
              item.id === action.id
              ? { ...item, quantity: item.quantity - 1 }
              : item,
          )
          .filter((item) => item.quantity > 0),
      };

    case "REMOVE":
      return {
        ...state,
        items: state.items.filter(
          (item) =>
            item.type !== action.itemType ||
            item.id !== action.id,
        ),
      };

    case "CLEAR":
      return { items: [] };

    default:
      return state;
  }
}

type CartContextType = {
  items: CartItem[];
  addProductToCart: (
    product: Omit<ProductCartItem, "type" | "quantity">,
  ) => void;
  addServiceToCart: (
    service: Omit<ServiceCartItem, "type" | "quantity">,
  ) => void;
  increaseQuantity: (
    itemType: CartItem["type"],
    id: number,
  ) => void;
  decreaseQuantity: (
    itemType: CartItem["type"],
    id: number,
  ) => void;
  removeFromCart: (
    itemType: CartItem["type"],
    id: number,
  ) => void;
  clearCart: () => void;
  total: number;
  itemCount: number;
};

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(cartReducer, {
    items: [],
  });

  const addProductToCart = (
    product: Omit<ProductCartItem, "type" | "quantity">,
  ) => {
    dispatch({ kind: "ADD_PRODUCT", product });
  };

  const addServiceToCart = (
    service: Omit<ServiceCartItem, "type" | "quantity">,
  ) => {
    dispatch({ kind: "ADD_SERVICE", service });
  };

  const increaseQuantity = (
    itemType: CartItem["type"],
    id: number,
  ) => {
    dispatch({ kind: "INCREASE", itemType, id });
  };

  const decreaseQuantity = (
    itemType: CartItem["type"],
    id: number,
  ) => {
    dispatch({ kind: "DECREASE", itemType, id });
  };

  const removeFromCart = (
    itemType: CartItem["type"],
    id: number,
  ) => {
    dispatch({ kind: "REMOVE", itemType, id });
  };

  const clearCart = () => {
    dispatch({ kind: "CLEAR" });
  };

  const total = state.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  const itemCount = state.items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  return (
    <CartContext.Provider
      value={{
        items: state.items,
        addProductToCart,
        addServiceToCart,
        increaseQuantity,
        decreaseQuantity,
        removeFromCart,
        clearCart,
        total,
        itemCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used inside CartProvider");
  }

  return context;
}
