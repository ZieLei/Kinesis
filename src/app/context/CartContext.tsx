import { createContext, useContext, useReducer } from "react";

export type CartItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
};

type CartState = {
  items: CartItem[];
};

type CartAction =
  | { type: 'ADD'; product: Omit<CartItem, 'quantity'> }
  | { type: 'INCREASE'; id: number }
  | { type: 'DECREASE'; id: number }
  | { type: 'REMOVE'; id: number }
  | { type: 'CLEAR' };

function cartReducer(
  state: CartState,
  action: CartAction
): CartState {
  switch (action.type) {
    case 'ADD': {
      const existingItem = state.items.find(
        (item) => item.id === action.product.id
      );

      if (existingItem) {
        return {
          ...state,
          items: state.items.map((item) =>
            item.id === action.product.id
              ? {
                ...item,
                quantity: item.quantity + 1,
              }
              : item
          ),
        };
      }

      return {
        ...state,
        items: [
          ...state.items,
          {
            ...action.product,
            quantity: 1,
          },
        ],
      };
    }

    case 'INCREASE':
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.id
            ? {
              ...item,
              quantity: item.quantity + 1,
            }
            : item
        ),
      };

    case 'DECREASE':
      return {
        ...state,
        items: state.items
          .map((item) =>
            item.id === action.id
              ? {
                ...item,
                quantity: item.quantity - 1,
              }
              : item
          )
          .filter((item) => item.quantity > 0),
      };

    case 'REMOVE':
      return {
        ...state,
        items: state.items.filter(
          (item) => item.id !== action.id
        ),
      };

    case 'CLEAR':
      return {
        items: [],
      };

    default:
      return state;
  }
}

type CartContextType = {
  items: CartItem[];
  addToCart: (product: Omit<CartItem, 'quantity'>) => void;
  increaseQuantity: (id: number) => void;
  decreaseQuantity: (id: number) => void;
  removeFromCart: (id: number) => void;
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

  const addToCart = (product: Omit<CartItem, 'quantity'>) => {
    dispatch({
      type: 'ADD',
      product,
    });
  };

  const increaseQuantity = (id: number) => {
    dispatch({
      type: 'INCREASE',
      id,
    });
  };

  const decreaseQuantity = (id: number) => {
    dispatch({
      type: 'DECREASE',
      id,
    });
  };

  const removeFromCart = (id: number) => {
    dispatch({
      type: 'REMOVE',
      id,
    });
  };

  const clearCart = () => {
    dispatch({
      type: 'CLEAR',
    });
  };

  const total = state.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const itemCount = state.items.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        items: state.items, addToCart,
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
    throw new Error(
      'useCart must be used inside CartProvider'
    );
  }

  return context;
}
