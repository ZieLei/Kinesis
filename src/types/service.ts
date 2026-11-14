
export type Service = {
  id: number;
  name: string;
  description: string;
  price: number;
  estimated_cost: number | null;
  archived?: boolean;
  updated_at?: string | null;
};

export type ServiceUpdate = Partial<ServiceCreate>;

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
