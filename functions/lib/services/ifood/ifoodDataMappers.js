"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapIFoodMerchantToStore = mapIFoodMerchantToStore;
exports.mapIFoodCategoriesToStoreCategories = mapIFoodCategoriesToStoreCategories;
exports.mapIFoodMenuItemsToStoreMenuItems = mapIFoodMenuItemsToStoreMenuItems;
exports.mapIFoodModifierGroupsToStoreModifierGroups = mapIFoodModifierGroupsToStoreModifierGroups;
exports.mapIFoodModifiersToStoreModifiers = mapIFoodModifiersToStoreModifiers;
exports.mapIFoodOrderToStoreOrder = mapIFoodOrderToStoreOrder;
exports.mapIFoodPaymentMethod = mapIFoodPaymentMethod;
exports.mapIFoodOrderStatusToFlowId = mapIFoodOrderStatusToFlowId;
exports.validateIFoodStore = validateIFoodStore;
exports.validateIFoodOrder = validateIFoodOrder;
exports.filterAvailableMenuItems = filterAvailableMenuItems;
exports.groupMenuItemsByCategory = groupMenuItemsByCategory;
/**
 * Converte um merchant do iFood para o tipo Store do sistema
 */
function mapIFoodMerchantToStore(merchant) {
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
function mapIFoodCategoriesToStoreCategories(categories) {
    return categories.map((category, index) => ({
        id: parseInt(category.id) || index + 1,
        name: category.name,
        status: category.status
    }));
}
/**
 * Converte itens do menu iFood para itens do sistema
 */
function mapIFoodMenuItemsToStoreMenuItems(items, categoryId) {
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
function mapIFoodModifierGroupsToStoreModifierGroups(modifierGroups) {
    return modifierGroups.map((group, index) => {
        // Determina o tipo baseado na quantidade
        let type;
        if (group.maxQuantity === 1) {
            type = 'RADIO';
        }
        else if (group.maxQuantity > 1 && group.modifiers && group.modifiers.length > 1) {
            type = 'QUANTITY';
        }
        else {
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
function mapIFoodModifiersToStoreModifiers(modifiers) {
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
function mapIFoodOrderToStoreOrder(order) {
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
function mapIFoodPaymentMethod(method) {
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
function mapIFoodOrderStatusToFlowId(status) {
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
function validateIFoodStore(store) {
    return !!(store.id &&
        store.name &&
        store.address?.city &&
        store.address?.latitude &&
        store.address?.longitude);
}
/**
 * Valida se um pedido convertido está consistente
 */
function validateIFoodOrder(order) {
    return !!(order.id &&
        order.customerName &&
        order.items &&
        order.items.length > 0 &&
        order.total?.total > 0);
}
/**
 * Utilitário para filtrar itens disponíveis do menu
 */
function filterAvailableMenuItems(items) {
    return items.filter(item => item.status === 'AVAILABLE');
}
/**
 * Utilitário para agrupar itens por categoria
 */
function groupMenuItemsByCategory(items) {
    return items.reduce((acc, item) => {
        if (!acc[item.categoryId]) {
            acc[item.categoryId] = [];
        }
        acc[item.categoryId].push(item);
        return acc;
    }, {});
}
