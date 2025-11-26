// Types matching the admin API
export interface IFoodCatalog {
  id: string;
  name: string;
  description?: string;
  status: 'AVAILABLE' | 'UNAVAILABLE';
  modifiedAt?: string;
  categories?: IFoodCategory[];
}

export interface IFoodCategory {
  id: string;
  name: string;
  status: 'AVAILABLE' | 'UNAVAILABLE';
  order?: number;
  template?: string;
  items?: IFoodCompleteItem[];
}

export interface IFoodCompleteItem {
  item: IFoodItem;
  products: IFoodProduct[];
  optionGroups: IFoodOptionGroup[];
  options: IFoodOption[];
}

export interface IFoodItem {
  id: string;
  type: 'DEFAULT' | 'PIZZA' | string;
  categoryId: string;
  status: 'AVAILABLE' | 'UNAVAILABLE';
  price: IFoodPrice;
  externalCode?: string;
  index?: number;
  productId: string;
  shifts?: IFoodShift[] | null;
  tags?: string[] | null;
  contextModifiers?: IFoodItemContextModifier[];
}

export interface IFoodProduct {
  id: string;
  externalCode?: string;
  name: string;
  description?: string;
  additionalInformation?: string;
  imagePath?: string;
  ean?: string;
  serving?: 'SERVES_1' | 'SERVES_2' | 'SERVES_3' | 'SERVES_4' | 'SERVES_5' | string;
  dietaryRestrictions?: string[] | null;
  quantity?: number | null;
  optionGroups?: IFoodProductOptionGroup[] | null;
  tags?: string[];
  industrialized?: boolean;
}

export interface IFoodProductOptionGroup {
  id: string;
  min: number;
  max: number;
}

export interface IFoodOptionGroup {
  id: string;
  name: string;
  externalCode?: string;
  status: 'AVAILABLE' | 'UNAVAILABLE';
  index?: number;
  optionGroupType?: 'DEFAULT' | string;
  optionIds: string[];
}

export interface IFoodOption {
  id: string;
  status: 'AVAILABLE' | 'UNAVAILABLE';
  index?: number;
  productId: string;
  price: IFoodPrice;
  contextModifiers?: IFoodOptionContextModifier[];
  fractions?: string[] | null;
  externalCode?: string;
}

export interface IFoodPrice {
  value: number;
  originalValue?: number;
}

export interface IFoodItemContextModifier {
  catalogContext: 'WHITELABEL' | 'INDOOR' | string;
  status: 'AVAILABLE' | 'UNAVAILABLE';
  price: IFoodPrice;
  externalCode?: string;
  itemContextId?: string;
}

export interface IFoodOptionContextModifier {
  parentOptionId?: string | null;
  catalogContext: 'WHITELABEL' | 'INDOOR' | string;
  status: 'AVAILABLE' | 'UNAVAILABLE';
  price: IFoodPrice;
  externalCode?: string;
}

export interface IFoodShift {
  startTime: string;
  endTime: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
}

export interface IFoodCategoryItemsResponse {
  categoryId: string;
  items: IFoodItem[];
  products: IFoodProduct[];
  optionGroups: IFoodOptionGroup[];
  options: IFoodOption[];
}

// Request types
export interface CreateCategoryRequest {
  name: string;
  order?: number;
  template?: string;
}

export interface CreateCompleteItemRequest {
  item: IFoodItem;
  products: IFoodProduct[];
  optionGroups: IFoodOptionGroup[];
  options: IFoodOption[];
}

export interface UpdateItemPriceRequest {
  itemId: string;
  price: IFoodPrice;
}

export interface UpdateItemStatusRequest {
  itemId: string;
  status: 'AVAILABLE' | 'UNAVAILABLE';
}

export interface UpdateOptionPriceRequest {
  optionId: string;
  price: IFoodPrice;
}

export interface UpdateOptionStatusRequest {
  optionId: string;
  status: 'AVAILABLE' | 'UNAVAILABLE';
}

export interface ImageUploadResponse {
  id: string;
  url: string;
  thumbnail?: string;
}