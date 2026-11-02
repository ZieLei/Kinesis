
export type Service = {
  id: number;
  name: string;
  description: string;
  price: number;
  estimated_cost: number | null;
};

export type ServiceCreate = {
  name: string;
  description: string;
  price: number;
  estimated_cost?: number | null;
};

export type ServicesResponse = {
  items: Service[];
  limit: number;
  offset: number;
  count: number;
};
