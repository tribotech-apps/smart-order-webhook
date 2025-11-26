import { ifoodApi } from './ifoodApiService';
import { 
  mapIFoodOrderToStoreOrder,
  mapIFoodOrderStatusToFlowId,
  validateIFoodOrder,
  IFoodStoreOrder
} from './ifoodDataMappers';
import { 
  IFoodOrder, 
  IFoodOrderFilters,
  IFoodOrderStatus,
  IFoodApiResponse 
} from '../../types/IFood';
import { diagnostics, DiagnosticCategory } from '../diagnosticsService';

export class IFoodOrderService {

  /**
   * Busca um pedido específico pelo ID
   */
  async getOrder(orderId: string): Promise<IFoodOrder | null> {
    try {
      diagnostics.info('Fetching iFood order', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_get_order',
        details: { orderId }
      });

      const order = await ifoodApi.get<IFoodOrder>('order', `/orders/${orderId}`);
      
      if (!order) {
        diagnostics.warn('Order not found', {
          category: DiagnosticCategory.EXTERNAL_API,
          action: 'ifood_order_not_found',
          details: { orderId }
        });
        return null;
      }

      diagnostics.info('Order fetched successfully', {
        category: DiagnosticCategory.EXTERNAL_API,
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
    } catch (error: any) {
      diagnostics.error('Error fetching order', error, {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_order_error',
        details: { orderId }
      });
      return null;
    }
  }

  /**
   * Busca pedidos com filtros
   */
  async getOrders(filters: IFoodOrderFilters = {}): Promise<IFoodOrder[]> {
    try {
      diagnostics.info('Fetching iFood orders with filters', {
        category: DiagnosticCategory.EXTERNAL_API,
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

      const response = await ifoodApi.get<IFoodApiResponse<IFoodOrder[]>>('order', endpoint);
      const orders = response.data || [];
      
      diagnostics.info('Orders fetched successfully', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_orders_success',
        details: { 
          count: orders.length,
          page: response.page,
          total: response.total
        }
      });

      return orders;
    } catch (error: any) {
      diagnostics.error('Error fetching orders', error, {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_orders_error',
        details: { filters }
      });
      return [];
    }
  }

  /**
   * Busca pedidos de um merchant específico
   */
  async getMerchantOrders(
    merchantId: string,
    status?: IFoodOrderStatus[],
    limit: number = 50
  ): Promise<IFoodOrder[]> {
    const filters: IFoodOrderFilters = {
      merchantId,
      status,
      size: limit
    };

    return await this.getOrders(filters);
  }

  /**
   * Busca pedidos recentes de um merchant
   */
  async getRecentMerchantOrders(
    merchantId: string,
    hoursBack: number = 24
  ): Promise<IFoodOrder[]> {
    const fromDate = new Date();
    fromDate.setHours(fromDate.getHours() - hoursBack);

    const filters: IFoodOrderFilters = {
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
  async confirmOrder(orderId: string): Promise<boolean> {
    try {
      diagnostics.info('Confirming iFood order', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_confirm_order',
        details: { orderId }
      });

      await ifoodApi.post('order', `/orders/${orderId}/confirm`, {});
      
      diagnostics.info('Order confirmed successfully', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_order_confirmed',
        details: { orderId }
      });

      return true;
    } catch (error: any) {
      diagnostics.error('Error confirming order', error, {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_confirm_order_error',
        details: { orderId }
      });
      return false;
    }
  }

  /**
   * Inicia preparação de um pedido
   */
  async startPreparation(orderId: string): Promise<boolean> {
    try {
      diagnostics.info('Starting order preparation', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_start_preparation',
        details: { orderId }
      });

      await ifoodApi.post('order', `/orders/${orderId}/startPreparation`, {});
      
      diagnostics.info('Order preparation started', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_preparation_started',
        details: { orderId }
      });

      return true;
    } catch (error: any) {
      diagnostics.error('Error starting preparation', error, {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_start_preparation_error',
        details: { orderId }
      });
      return false;
    }
  }

  /**
   * Marca pedido como pronto para retirada/entrega
   */
  async markReadyToPickup(orderId: string): Promise<boolean> {
    try {
      diagnostics.info('Marking order ready to pickup', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_ready_pickup',
        details: { orderId }
      });

      await ifoodApi.post('order', `/orders/${orderId}/readyToPickup`, {});
      
      diagnostics.info('Order marked as ready to pickup', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_ready_pickup_success',
        details: { orderId }
      });

      return true;
    } catch (error: any) {
      diagnostics.error('Error marking order ready to pickup', error, {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_ready_pickup_error',
        details: { orderId }
      });
      return false;
    }
  }

  /**
   * Cancela um pedido
   */
  async cancelOrder(orderId: string, reason: string): Promise<boolean> {
    try {
      diagnostics.info('Cancelling iFood order', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_cancel_order',
        details: { orderId, reason }
      });

      await ifoodApi.post('order', `/orders/${orderId}/cancel`, {
        reason,
        code: 'MERCHANT_REQUEST'
      });
      
      diagnostics.info('Order cancelled successfully', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_order_cancelled',
        details: { orderId, reason }
      });

      return true;
    } catch (error: any) {
      diagnostics.error('Error cancelling order', error, {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_cancel_order_error',
        details: { orderId, reason }
      });
      return false;
    }
  }

  /**
   * Converte um pedido iFood para o formato do sistema
   */
  async getConvertedOrder(orderId: string, merchantId: string): Promise<IFoodStoreOrder | null> {
    try {
      const ifoodOrder = await this.getOrder(orderId);
      
      if (!ifoodOrder) {
        return null;
      }

      const convertedOrder = mapIFoodOrderToStoreOrder(ifoodOrder);
      
      if (!validateIFoodOrder(convertedOrder)) {
        diagnostics.error('Invalid order data after conversion', new Error('Order validation failed'), {
          category: DiagnosticCategory.EXTERNAL_API,
          action: 'ifood_order_validation_error',
          details: { orderId, merchantId }
        });
        return null;
      }

      return convertedOrder;
    } catch (error: any) {
      diagnostics.error('Error converting order', error, {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_convert_order_error',
        details: { orderId, merchantId }
      });
      return null;
    }
  }

  /**
   * Busca pedidos convertidos de um merchant
   */
  async getConvertedMerchantOrders(
    merchantId: string,
    status?: IFoodOrderStatus[]
  ): Promise<IFoodStoreOrder[]> {
    try {
      const ifoodOrders = await this.getMerchantOrders(merchantId, status);
      const convertedOrders: IFoodStoreOrder[] = [];

      for (const order of ifoodOrders) {
        const converted = mapIFoodOrderToStoreOrder(order);
        if (validateIFoodOrder(converted)) {
          convertedOrders.push(converted);
        }
      }

      return convertedOrders;
    } catch (error: any) {
      diagnostics.error('Error fetching converted merchant orders', error, {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_converted_orders_error',
        details: { merchantId }
      });
      return [];
    }
  }

  /**
   * Atualiza status de um pedido baseado no status iFood
   */
  getOrderFlowId(status: string): number {
    return mapIFoodOrderStatusToFlowId(status);
  }

  /**
   * Verifica se um pedido está ativo (não finalizado)
   */
  isOrderActive(status: string): boolean {
    const inactiveStatuses = ['DELIVERED', 'CONCLUDED', 'CANCELLED', 'TIMEOUT'];
    return !inactiveStatuses.includes(status.toUpperCase());
  }

  /**
   * Busca pedidos ativos de um cliente específico por telefone
   */
  async getActiveOrdersByPhone(
    merchantId: string,
    phoneNumber: string
  ): Promise<IFoodStoreOrder[]> {
    try {
      // Buscar pedidos recentes do merchant
      const recentOrders = await this.getRecentMerchantOrders(merchantId, 24);
      
      // Filtrar por telefone e status ativo
      const activeOrders = recentOrders
        .filter(order => 
          order.customer.phone === phoneNumber && 
          this.isOrderActive(order.orderTiming || 'PLACED')
        )
        .map(order => mapIFoodOrderToStoreOrder(order))
        .filter(order => validateIFoodOrder(order));

      return activeOrders;
    } catch (error: any) {
      diagnostics.error('Error fetching active orders by phone', error, {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_active_orders_phone_error',
        details: { merchantId, phoneNumber }
      });
      return [];
    }
  }

  /**
   * Cache de pedidos para evitar muitas consultas
   */
  private orderCache = new Map<string, { order: IFoodOrder; timestamp: number }>();
  private readonly ORDER_CACHE_DURATION = 2 * 60 * 1000; // 2 minutos

  /**
   * Busca pedido com cache
   */
  async getOrderWithCache(orderId: string): Promise<IFoodOrder | null> {
    const now = Date.now();
    const cached = this.orderCache.get(orderId);

    if (cached && (now - cached.timestamp) < this.ORDER_CACHE_DURATION) {
      diagnostics.debug('Using cached order data', {
        category: DiagnosticCategory.EXTERNAL_API,
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
  clearOrderCache(orderId: string): void {
    this.orderCache.delete(orderId);
  }

  /**
   * Limpa todo o cache de pedidos
   */
  clearAllOrderCache(): void {
    this.orderCache.clear();
  }
}

// Instância singleton
export const ifoodOrderService = new IFoodOrderService();