"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ifoodOrderService = exports.IFoodOrderService = void 0;
const ifoodApiService_1 = require("./ifoodApiService");
const ifoodDataMappers_1 = require("./ifoodDataMappers");
const diagnosticsService_1 = require("../diagnosticsService");
class IFoodOrderService {
    constructor() {
        /**
         * Cache de pedidos para evitar muitas consultas
         */
        this.orderCache = new Map();
        this.ORDER_CACHE_DURATION = 2 * 60 * 1000; // 2 minutos
    }
    /**
     * Busca um pedido específico pelo ID
     */
    async getOrder(orderId) {
        try {
            diagnosticsService_1.diagnostics.info('Fetching iFood order', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_get_order',
                details: { orderId }
            });
            const order = await ifoodApiService_1.ifoodApi.get('order', `/orders/${orderId}`);
            if (!order) {
                diagnosticsService_1.diagnostics.warn('Order not found', {
                    category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                    action: 'ifood_order_not_found',
                    details: { orderId }
                });
                return null;
            }
            diagnosticsService_1.diagnostics.info('Order fetched successfully', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_order_success',
                details: {
                    orderId,
                    orderType: order.orderType,
                    customerName: order.customer.name,
                    total: order.total.orderAmount,
                    status: 'FETCHED'
                }
            });
            return order;
        }
        catch (error) {
            diagnosticsService_1.diagnostics.error('Error fetching order', error, {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_order_error',
                details: { orderId }
            });
            return null;
        }
    }
    /**
     * Busca pedidos com filtros
     */
    async getOrders(filters = {}) {
        try {
            diagnosticsService_1.diagnostics.info('Fetching iFood orders with filters', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_get_orders',
                details: { filters }
            });
            let endpoint = '/orders';
            const queryParams = new URLSearchParams();
            // Aplicar filtros
            if (filters.merchantId) {
                queryParams.append('merchantId', filters.merchantId);
            }
            if (filters.status && filters.status.length > 0) {
                filters.status.forEach(status => {
                    queryParams.append('status', status);
                });
            }
            if (filters.createdAt?.from) {
                queryParams.append('createdAt.from', filters.createdAt.from);
            }
            if (filters.createdAt?.to) {
                queryParams.append('createdAt.to', filters.createdAt.to);
            }
            if (filters.page) {
                queryParams.append('page', filters.page.toString());
            }
            if (filters.size) {
                queryParams.append('size', filters.size.toString());
            }
            if (queryParams.toString()) {
                endpoint += `?${queryParams.toString()}`;
            }
            const response = await ifoodApiService_1.ifoodApi.get('order', endpoint);
            const orders = response.data || [];
            diagnosticsService_1.diagnostics.info('Orders fetched successfully', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_orders_success',
                details: {
                    count: orders.length,
                    page: response.page,
                    total: response.total
                }
            });
            return orders;
        }
        catch (error) {
            diagnosticsService_1.diagnostics.error('Error fetching orders', error, {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_orders_error',
                details: { filters }
            });
            return [];
        }
    }
    /**
     * Busca pedidos de um merchant específico
     */
    async getMerchantOrders(merchantId, status, limit = 50) {
        const filters = {
            merchantId,
            status,
            size: limit
        };
        return await this.getOrders(filters);
    }
    /**
     * Busca pedidos recentes de um merchant
     */
    async getRecentMerchantOrders(merchantId, hoursBack = 24) {
        const fromDate = new Date();
        fromDate.setHours(fromDate.getHours() - hoursBack);
        const filters = {
            merchantId,
            createdAt: {
                from: fromDate.toISOString()
            },
            size: 100
        };
        return await this.getOrders(filters);
    }
    /**
     * Confirma um pedido
     */
    async confirmOrder(orderId) {
        try {
            diagnosticsService_1.diagnostics.info('Confirming iFood order', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_confirm_order',
                details: { orderId }
            });
            await ifoodApiService_1.ifoodApi.post('order', `/orders/${orderId}/confirm`, {});
            diagnosticsService_1.diagnostics.info('Order confirmed successfully', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_order_confirmed',
                details: { orderId }
            });
            return true;
        }
        catch (error) {
            diagnosticsService_1.diagnostics.error('Error confirming order', error, {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_confirm_order_error',
                details: { orderId }
            });
            return false;
        }
    }
    /**
     * Inicia preparação de um pedido
     */
    async startPreparation(orderId) {
        try {
            diagnosticsService_1.diagnostics.info('Starting order preparation', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_start_preparation',
                details: { orderId }
            });
            await ifoodApiService_1.ifoodApi.post('order', `/orders/${orderId}/startPreparation`, {});
            diagnosticsService_1.diagnostics.info('Order preparation started', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_preparation_started',
                details: { orderId }
            });
            return true;
        }
        catch (error) {
            diagnosticsService_1.diagnostics.error('Error starting preparation', error, {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_start_preparation_error',
                details: { orderId }
            });
            return false;
        }
    }
    /**
     * Marca pedido como pronto para retirada/entrega
     */
    async markReadyToPickup(orderId) {
        try {
            diagnosticsService_1.diagnostics.info('Marking order ready to pickup', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_ready_pickup',
                details: { orderId }
            });
            await ifoodApiService_1.ifoodApi.post('order', `/orders/${orderId}/readyToPickup`, {});
            diagnosticsService_1.diagnostics.info('Order marked as ready to pickup', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_ready_pickup_success',
                details: { orderId }
            });
            return true;
        }
        catch (error) {
            diagnosticsService_1.diagnostics.error('Error marking order ready to pickup', error, {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_ready_pickup_error',
                details: { orderId }
            });
            return false;
        }
    }
    /**
     * Cancela um pedido
     */
    async cancelOrder(orderId, reason) {
        try {
            diagnosticsService_1.diagnostics.info('Cancelling iFood order', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_cancel_order',
                details: { orderId, reason }
            });
            await ifoodApiService_1.ifoodApi.post('order', `/orders/${orderId}/cancel`, {
                reason,
                code: 'MERCHANT_REQUEST'
            });
            diagnosticsService_1.diagnostics.info('Order cancelled successfully', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_order_cancelled',
                details: { orderId, reason }
            });
            return true;
        }
        catch (error) {
            diagnosticsService_1.diagnostics.error('Error cancelling order', error, {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_cancel_order_error',
                details: { orderId, reason }
            });
            return false;
        }
    }
    /**
     * Converte um pedido iFood para o formato do sistema
     */
    async getConvertedOrder(orderId, merchantId) {
        try {
            const ifoodOrder = await this.getOrder(orderId);
            if (!ifoodOrder) {
                return null;
            }
            const convertedOrder = (0, ifoodDataMappers_1.mapIFoodOrderToStoreOrder)(ifoodOrder);
            if (!(0, ifoodDataMappers_1.validateIFoodOrder)(convertedOrder)) {
                diagnosticsService_1.diagnostics.error('Invalid order data after conversion', new Error('Order validation failed'), {
                    category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                    action: 'ifood_order_validation_error',
                    details: { orderId, merchantId }
                });
                return null;
            }
            return convertedOrder;
        }
        catch (error) {
            diagnosticsService_1.diagnostics.error('Error converting order', error, {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_convert_order_error',
                details: { orderId, merchantId }
            });
            return null;
        }
    }
    /**
     * Busca pedidos convertidos de um merchant
     */
    async getConvertedMerchantOrders(merchantId, status) {
        try {
            const ifoodOrders = await this.getMerchantOrders(merchantId, status);
            const convertedOrders = [];
            for (const order of ifoodOrders) {
                const converted = (0, ifoodDataMappers_1.mapIFoodOrderToStoreOrder)(order);
                if ((0, ifoodDataMappers_1.validateIFoodOrder)(converted)) {
                    convertedOrders.push(converted);
                }
            }
            return convertedOrders;
        }
        catch (error) {
            diagnosticsService_1.diagnostics.error('Error fetching converted merchant orders', error, {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_converted_orders_error',
                details: { merchantId }
            });
            return [];
        }
    }
    /**
     * Atualiza status de um pedido baseado no status iFood
     */
    getOrderFlowId(status) {
        return (0, ifoodDataMappers_1.mapIFoodOrderStatusToFlowId)(status);
    }
    /**
     * Verifica se um pedido está ativo (não finalizado)
     */
    isOrderActive(status) {
        const inactiveStatuses = ['DELIVERED', 'CONCLUDED', 'CANCELLED', 'TIMEOUT'];
        return !inactiveStatuses.includes(status.toUpperCase());
    }
    /**
     * Busca pedidos ativos de um cliente específico por telefone
     */
    async getActiveOrdersByPhone(merchantId, phoneNumber) {
        try {
            // Buscar pedidos recentes do merchant
            const recentOrders = await this.getRecentMerchantOrders(merchantId, 24);
            // Filtrar por telefone e status ativo
            const activeOrders = recentOrders
                .filter(order => order.customer.phone === phoneNumber &&
                this.isOrderActive(order.orderTiming || 'PLACED'))
                .map(order => (0, ifoodDataMappers_1.mapIFoodOrderToStoreOrder)(order))
                .filter(order => (0, ifoodDataMappers_1.validateIFoodOrder)(order));
            return activeOrders;
        }
        catch (error) {
            diagnosticsService_1.diagnostics.error('Error fetching active orders by phone', error, {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_active_orders_phone_error',
                details: { merchantId, phoneNumber }
            });
            return [];
        }
    }
    /**
     * Busca pedido com cache
     */
    async getOrderWithCache(orderId) {
        const now = Date.now();
        const cached = this.orderCache.get(orderId);
        if (cached && (now - cached.timestamp) < this.ORDER_CACHE_DURATION) {
            diagnosticsService_1.diagnostics.debug('Using cached order data', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_order_cache_hit',
                details: { orderId }
            });
            return cached.order;
        }
        const order = await this.getOrder(orderId);
        if (order) {
            this.orderCache.set(orderId, {
                order,
                timestamp: now
            });
        }
        return order;
    }
    /**
     * Limpa cache de um pedido
     */
    clearOrderCache(orderId) {
        this.orderCache.delete(orderId);
    }
    /**
     * Limpa todo o cache de pedidos
     */
    clearAllOrderCache() {
        this.orderCache.clear();
    }
}
exports.IFoodOrderService = IFoodOrderService;
// Instância singleton
exports.ifoodOrderService = new IFoodOrderService();
