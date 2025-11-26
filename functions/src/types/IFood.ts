// Tipos principais da API iFood

export interface IFoodMerchant {
  id: string;
  name: string;
  description?: string;
  corporateName?: string;
  tradingName?: string;
  cnpj?: string;
  createdAt?: string;
  updatedAt?: string;
  averageTicket?: number;
  address?: IFoodAddress;
  deliveryMethods?: IFoodDeliveryMethod[];
  phones?: IFoodPhone[];
  paymentMethods?: string[];
  functionalities?: string[];
  availability?: IFoodAvailability;
  categories?: IFoodCategory[];
  status?: 'AVAILABLE' | 'UNAVAILABLE';
}

export interface IFoodAddress {
  streetName?: string;
  streetNumber?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  country?: string;
  zipCode?: string;
  complement?: string;
  latitude?: number;
  longitude?: number;
  reference?: string;
}

export interface IFoodDeliveryMethod {
  id: string;
  mode: 'DELIVERY' | 'TAKEOUT';
  deliveryTime?: number;
  deliveryFee?: number;
  minimumOrderValue?: number;
  isActive?: boolean;
}

export interface IFoodPhone {
  number: string;
  type?: 'PHONE' | 'MOBILE' | 'WHATSAPP';
  extension?: string;
}

export interface IFoodAvailability {
  isOpen: boolean;
  unavailabilityReasons?: string[];
  openingHours?: IFoodOpeningHours[];
}

export interface IFoodOpeningHours {
  dayOfWeek: number; // 1-7 (Sunday = 1)
  openingTime: string; // HH:mm format
  closingTime: string; // HH:mm format
}

export interface IFoodCategory {
  id: string;
  name: string;
  status: 'AVAILABLE' | 'UNAVAILABLE';
  order?: number;
  template?: string;
  items?: IFoodMenuItem[];
}

export interface IFoodMenuItem {
  id: string;
  index?: number;
  name: string;
  description?: string;
  externalCode?: string;
  ean?: string;
  price?: IFoodPrice;
  originalPrice?: number;
  order?: number;
  imageUrl?: string;
  classification?: string;
  dietaryRestrictions?: string[];
  ingredients?: string[];
  nutritionalInfo?: IFoodNutritionalInfo;
  preparationTime?: number;
  serves?: number;
  status: 'AVAILABLE' | 'UNAVAILABLE';
  template?: string;
  modifierGroups?: IFoodModifierGroup[];
  shifts?: IFoodShift[];
  tags?: string[];
  unitType?: 'UNIT' | 'GRAMS' | 'LITERS';
  weight?: number;
}

export interface IFoodPrice {
  value: number;
  originalValue?: number;
  promotional?: boolean;
}

export interface IFoodNutritionalInfo {
  calories?: number;
  carbohydrates?: number;
  proteins?: number;
  fats?: number;
  fiber?: number;
  sodium?: number;
}

export interface IFoodModifierGroup {
  id: string;
  name: string;
  minQuantity: number;
  maxQuantity: number;
  modifiers?: IFoodModifier[];
}

export interface IFoodModifier {
  id: string;
  name: string;
  price?: number;
  originalPrice?: number;
  maxQuantity?: number;
  status: 'AVAILABLE' | 'UNAVAILABLE';
}

export interface IFoodShift {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

// Tipos de Pedidos
export interface IFoodOrder {
  id: string;
  reference?: string;
  shortReference?: string;
  externalCode?: string;
  orderType: 'DELIVERY' | 'TAKEOUT';
  orderTiming: 'IMMEDIATE' | 'SCHEDULED';
  displayId?: string;
  createdAt: string;
  preparationStartDateTime?: string;
  merchant: IFoodOrderMerchant;
  payments: IFoodPayment[];
  customer: IFoodCustomer;
  items: IFoodOrderItem[];
  extraInfo?: string;
  delivery?: IFoodDelivery;
  schedule?: IFoodSchedule;
  indoor?: IFoodIndoor;
  takeout?: IFoodTakeout;
  benefits?: IFoodBenefit[];
  total: IFoodOrderTotal;
  salesChannel?: string;
}

export interface IFoodOrderMerchant {
  id: string;
  name: string;
  phones?: IFoodPhone[];
}

export interface IFoodPayment {
  name: string;
  code: string;
  value: number;
  prepaid: boolean;
  issuer?: string;
  method?: 'CASH' | 'CREDIT' | 'DEBIT' | 'VOUCHER' | 'PIX' | 'ONLINE';
}

export interface IFoodCustomer {
  id?: string;
  name: string;
  phone?: string;
  email?: string;
  documentNumber?: string;
  ordersCountOnMerchant?: number;
}

export interface IFoodOrderItem {
  id: string;
  name: string;
  externalCode?: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  index?: number;
  unit?: string;
  optionsPrice?: number;
  observations?: string;
  options?: IFoodOrderItemOption[];
}

export interface IFoodOrderItemOption {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  index?: number;
  unit?: string;
  addition?: number;
}

export interface IFoodDelivery {
  mode: 'DEFAULT' | 'ECONOMIC' | 'EXPRESS';
  deliveredBy: 'MERCHANT' | 'IFOOD';
  deliveryDateTime?: string;
  deliveryAddress: IFoodAddress;
  observations?: string;
  deliveryFee?: number;
  deliveryTime?: number;
}

export interface IFoodSchedule {
  deliveryDateTimeStart?: string;
  deliveryDateTimeEnd?: string;
}

export interface IFoodIndoor {
  mode: 'PLACE_TABLE' | 'COUNTER';
  table?: string;
}

export interface IFoodTakeout {
  mode: 'SCHEDULED' | 'DEFAULT';
  takeoutDateTime?: string;
}

export interface IFoodBenefit {
  targetId: string;
  sponsorshipValues?: IFoodSponsorshipValue[];
  value?: number;
}

export interface IFoodSponsorshipValue {
  name: string;
  value: number;
}

export interface IFoodOrderTotal {
  subTotal: number;
  deliveryFee: number;
  benefits: number;
  orderAmount: number;
  additionalFees?: number;
}

// Tipos de Status e Eventos
export type IFoodOrderStatus = 
  | 'PLACED'
  | 'INTEGRATED'
  | 'CONFIRMED'
  | 'PREPARATION_STARTED'
  | 'READY_TO_PICKUP'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CONCLUDED'
  | 'CANCELLED'
  | 'TIMEOUT'
  | 'REQUEST_DELIVERY'
  | 'REQUEST_PICKUP';

export interface IFoodOrderEvent {
  orderId: string;
  fullCode: string;
  code: IFoodOrderStatus;
  correlationId: string;
  createdAt: string;
  metadata?: any;
}

// Tipos de resposta da API
export interface IFoodApiResponse<T> {
  data?: T;
  size?: number;
  page?: number;
  total?: number;
}

export interface IFoodError {
  code: string;
  message: string;
  description?: string;
  details?: any;
}

// Tipos para filtros e consultas
export interface IFoodOrderFilters {
  status?: IFoodOrderStatus[];
  merchantId?: string;
  createdAt?: {
    from?: string;
    to?: string;
  };
  page?: number;
  size?: number;
}

export interface IFoodMenuFilters {
  merchantId: string;
  categoryId?: string;
  availability?: 'AVAILABLE' | 'UNAVAILABLE';
}

// Tipos para webhook
export interface IFoodWebhookPayload {
  orderId: string;
  fullCode: string;
  code: IFoodOrderStatus;
  correlationId: string;
  createdAt: string;
  metadata?: any;
}