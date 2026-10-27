

export type Service = {
  id: number;
  name: string;
  description: string;
  price: number;
};

export type ServiceCreate = {
  name: string;
  description: string;
  price: number;
};

export type ServicesResponse = {
  items: Service[];
  limit: number;
  offset: number;
  count: number;
};
