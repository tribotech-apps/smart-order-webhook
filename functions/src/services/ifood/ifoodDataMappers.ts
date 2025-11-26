import { 
  IFoodMerchant, 
  IFoodMenuItem, 
  IFoodModifierGroup, 
  IFoodOrder,
  IFoodCategory,
  IFoodOrderItem,
  IFoodModifier
} from '../../types/IFood';

// Tipos simplificados para o sistema baseado no iFood
export interface IFoodStore {
  id: string;
  name: string;
  description: string;
  address: IFoodStoreAddress;
  phone?: string;
  deliveryFee: number;
  deliveryTime: number;
  deliveryRadius: number;
  isOpen: boolean;
  categories: IFoodStoreCategory[];
  menu: IFoodStoreMenuItem[];
  openingHours?: IFoodStoreHours[];
}

export interface IFoodStoreAddress {
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  latitude: number;
  longitude: number;
  fullAddress: string;
}

export interface IFoodStoreCategory {
  id: number;
  name: string;
  status: 'AVAILABLE' | 'UNAVAILABLE';
}

export interface IFoodStoreMenuItem {
  id: number;
  name: string;
  description: string;
  price: number;
  imageUrl?: string;
  categoryId: number;
  status: 'AVAILABLE' | 'UNAVAILABLE';
  modifierGroups: IFoodStoreModifierGroup[];
}

export interface IFoodStoreModifierGroup {
  id: number;
  name: string;
  minQuantity: number;
  maxQuantity: number;
  type: 'RADIO' | 'CHECK' | 'QUANTITY';
  modifiers: IFoodStoreModifier[];
}

export interface IFoodStoreModifier {
  id: number;
  name: string;
  price: number;
  maxQuantity?: number;
}

export interface IFoodStoreOrder {
  id: string;
  reference?: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  orderType: 'DELIVERY' | 'TAKEOUT';
  status: string;
  createdAt: string;
  items: IFoodStoreOrderItem[];
  deliveryAddress?: IFoodStoreAddress;
  total: {
    subtotal: number;
    deliveryFee: number;
    total: number;
  };
  payments: IFoodStorePayment[];
}

export interface IFoodStoreOrderItem {
  id: number;
  menuId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  observations?: string;
  modifiers: IFoodStoreOrderModifier[];
}

export interface IFoodStoreOrderModifier {
  id: number;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface IFoodStorePayment {
  method: 'CASH' | 'CREDIT' | 'DEBIT' | 'PIX' | 'VOUCHER';
  value: number;
  prepaid: boolean;
}

export interface IFoodStoreHours {
  dayOfWeek: number; // 1-7 (Sunday = 1)
  openTime: string; // HH:mm
  closeTime: string; // HH:mm
}

/**
 * Converte um merchant do iFood para o tipo Store do sistema
 */
export function mapIFoodMerchantToStore(merchant: IFoodMerchant): IFoodStore {
  const deliveryMethod = merchant.deliveryMethods?.[0];
  
  return {
    id: merchant.id,
    name: merchant.name,
    description: merchant.description || '',
    
    address: {
      street: merchant.address?.streetName || '',
      number: merchant.address?.streetNumber || '',
      neighborhood: merchant.address?.neighborhood || '',
      city: merchant.address?.city || '',
      state: merchant.address?.state || '',
      zipCode: merchant.address?.zipCode || '',
      latitude: merchant.address?.latitude || 0,
      longitude: merchant.address?.longitude || 0,
      fullAddress: `${merchant.address?.streetName} ${merchant.address?.streetNumber}, ${merchant.address?.neighborhood}, ${merchant.address?.city}`
    },
    
    phone: merchant.phones?.[0]?.number,
    deliveryFee: deliveryMethod?.deliveryFee || 0,
    deliveryTime: deliveryMethod?.deliveryTime || 60,
    deliveryRadius: 10, // Default 10km, pode ser configurado
    isOpen: merchant.availability?.isOpen || false,
    
    categories: [],
    menu: [],
    openingHours: merchant.availability?.openingHours?.map(hours => ({
      dayOfWeek: hours.dayOfWeek,
      openTime: hours.openingTime,
      closeTime: hours.closingTime
    }))
  };
}

/**
 * Converte categorias do iFood para categorias do sistema
 */
export function mapIFoodCategoriesToStoreCategories(categories: IFoodCategory[]): IFoodStoreCategory[] {
  return categories.map((category, index) => ({
    id: parseInt(category.id) || index + 1,
    name: category.name,
    status: category.status
  }));
}

/**
 * Converte itens do menu iFood para itens do sistema
 */
export function mapIFoodMenuItemsToStoreMenuItems(
  items: IFoodMenuItem[], 
  categoryId: number
): IFoodStoreMenuItem[] {
  return items
    .filter(item => item.status === 'AVAILABLE')
    .map(item => ({
      id: parseInt(item.id) || 0,
      name: item.name,
      description: item.description || '',
      price: item.price?.value || item.originalPrice || 0,
      imageUrl: item.imageUrl,
      categoryId: categoryId,
      status: item.status,
      modifierGroups: item.modifierGroups ? 
        mapIFoodModifierGroupsToStoreModifierGroups(item.modifierGroups) : []
    }));
}

/**
 * Converte grupos de modificadores do iFood para grupos do sistema
 */
export function mapIFoodModifierGroupsToStoreModifierGroups(
  modifierGroups: IFoodModifierGroup[]
): IFoodStoreModifierGroup[] {
  return modifierGroups.map((group, index) => {
    // Determina o tipo baseado na quantidade
    let type: 'RADIO' | 'CHECK' | 'QUANTITY';
    if (group.maxQuantity === 1) {
      type = 'RADIO';
    } else if (group.maxQuantity > 1 && group.modifiers && group.modifiers.length > 1) {
      type = 'QUANTITY';
    } else {
      type = 'CHECK';
    }

    return {
      id: index + 1,
      name: group.name,
      minQuantity: group.minQuantity,
      maxQuantity: group.maxQuantity,
      type: type,
      modifiers: group.modifiers ? 
        mapIFoodModifiersToStoreModifiers(group.modifiers) : []
    };
  });
}

/**
 * Converte modificadores do iFood para modificadores do sistema
 */
export function mapIFoodModifiersToStoreModifiers(modifiers: IFoodModifier[]): IFoodStoreModifier[] {
  return modifiers
    .filter(modifier => modifier.status === 'AVAILABLE')
    .map((modifier, index) => ({
      id: parseInt(modifier.id) || index + 1,
      name: modifier.name,
      price: modifier.price || 0,
      maxQuantity: modifier.maxQuantity
    }));
}

/**
 * Converte um pedido do iFood para pedido do sistema
 */
export function mapIFoodOrderToStoreOrder(order: IFoodOrder): IFoodStoreOrder {
  return {
    id: order.id,
    reference: order.reference,
    customerId: order.customer.id,
    customerName: order.customer.name,
    customerPhone: order.customer.phone,
    orderType: order.orderType,
    status: 'PLACED', // Status inicial
    createdAt: order.createdAt,
    
    items: order.items.map((item, index) => ({
      id: index + 1,
      menuId: parseInt(item.id) || 0,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      observations: item.observations,
      modifiers: item.options?.map((option, optIndex) => ({
        id: optIndex + 1,
        name: option.name,
        quantity: option.quantity,
        unitPrice: option.unitPrice,
        totalPrice: option.totalPrice
      })) || []
    })),
    
    deliveryAddress: order.delivery?.deliveryAddress ? {
      street: order.delivery.deliveryAddress.streetName || '',
      number: order.delivery.deliveryAddress.streetNumber || '',
      neighborhood: order.delivery.deliveryAddress.neighborhood || '',
      city: order.delivery.deliveryAddress.city || '',
      state: order.delivery.deliveryAddress.state || '',
      zipCode: order.delivery.deliveryAddress.zipCode || '',
      latitude: order.delivery.deliveryAddress.latitude || 0,
      longitude: order.delivery.deliveryAddress.longitude || 0,
      fullAddress: `${order.delivery.deliveryAddress.streetName} ${order.delivery.deliveryAddress.streetNumber}`
    } : undefined,
    
    total: {
      subtotal: order.total.subTotal,
      deliveryFee: order.total.deliveryFee,
      total: order.total.orderAmount
    },
    
    payments: order.payments.map(payment => ({
      method: mapIFoodPaymentMethod(payment.method),
      value: payment.value,
      prepaid: payment.prepaid
    }))
  };
}

/**
 * Mapeia métodos de pagamento do iFood para o sistema
 */
export function mapIFoodPaymentMethod(method?: string): 'CASH' | 'CREDIT' | 'DEBIT' | 'PIX' | 'VOUCHER' {
  switch (method?.toLowerCase()) {
    case 'cash':
      return 'CASH';
    case 'credit':
      return 'CREDIT';
    case 'debit':
      return 'DEBIT';
    case 'pix':
      return 'PIX';
    case 'voucher':
      return 'VOUCHER';
    default:
      return 'CASH';
  }
}

/**
 * Converte status do pedido iFood para fluxo do sistema
 */
export function mapIFoodOrderStatusToFlowId(status: string): number {
  switch (status.toLowerCase()) {
    case 'placed':
    case 'integrated':
      return 1; // QUEUE
    case 'confirmed':
    case 'preparation_started':
      return 2; // PREPARATION
    case 'ready_to_pickup':
    case 'out_for_delivery':
      return 3; // DELIVERY_ROUTE
    case 'delivered':
    case 'concluded':
      return 4; // DELIVERED
    case 'cancelled':
    case 'timeout':
      return 5; // CANCELED
    default:
      return 1; // Default para QUEUE
  }
}

/**
 * Valida se uma loja convertida está consistente
 */
export function validateIFoodStore(store: IFoodStore): boolean {
  return !!(
    store.id &&
    store.name &&
    store.address?.city &&
    store.address?.latitude &&
    store.address?.longitude
  );
}

/**
 * Valida se um pedido convertido está consistente
 */
export function validateIFoodOrder(order: IFoodStoreOrder): boolean {
  return !!(
    order.id &&
    order.customerName &&
    order.items &&
    order.items.length > 0 &&
    order.total?.total > 0
  );
}

/**
 * Utilitário para filtrar itens disponíveis do menu
 */
export function filterAvailableMenuItems(items: IFoodStoreMenuItem[]): IFoodStoreMenuItem[] {
  return items.filter(item => item.status === 'AVAILABLE');
}

/**
 * Utilitário para agrupar itens por categoria
 */
export function groupMenuItemsByCategory(items: IFoodStoreMenuItem[]): Record<number, IFoodStoreMenuItem[]> {
  return items.reduce((acc, item) => {
    if (!acc[item.categoryId]) {
      acc[item.categoryId] = [];
    }
    acc[item.categoryId].push(item);
    return acc;
  }, {} as Record<number, IFoodStoreMenuItem[]>);
}