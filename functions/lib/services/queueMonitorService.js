"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueMonitorService = exports.QueueMonitorService = void 0;
const firebase_1 = require("../firebase");
const firestore_1 = require("firebase/firestore");
const Order_1 = require("../types/Order");
const messagingService_1 = require("./messagingService");
class QueueMonitorService {
    /**
     * Monitora todas as filas de pedidos ativos e envia alertas quando necessário
     */
    async monitorAllQueues() {
        try {
            console.log('🔍 [QUEUE_MONITOR] Starting queue monitoring...');
            // Buscar todos os pedidos ativos (flows 1, 2, 3)
            const activeOrders = await this.getActiveOrders();
            console.log(`📊 [QUEUE_MONITOR] Found ${activeOrders.length} active orders`);
            if (activeOrders.length === 0) {
                console.log('✅ [QUEUE_MONITOR] No active orders to monitor');
                return;
            }
            // Agrupar pedidos por loja para buscar configurações de tempo
            const ordersByStore = this.groupOrdersByStore(activeOrders);
            // Processar cada loja
            for (const [storeId, orders] of ordersByStore.entries()) {
                await this.processStoreOrders(storeId, orders);
            }
            console.log('✅ [QUEUE_MONITOR] Queue monitoring completed');
        }
        catch (error) {
            console.error('💥 [QUEUE_MONITOR] Error in queue monitoring:', error);
        }
    }
    /**
     * Busca todos os pedidos ativos (flows 1, 2, 3)
     */
    async getActiveOrders() {
        const ordersRef = (0, firestore_1.collection)(firebase_1.db, 'Orders');
        const activeFlows = [Order_1.OrderFlow.QUEUE, Order_1.OrderFlow.PREPARATION, Order_1.OrderFlow.DELIVERY_ROUTE];
        const q = (0, firestore_1.query)(ordersRef, (0, firestore_1.where)('currentFlow.flowId', 'in', activeFlows));
        const snapshot = await (0, firestore_1.getDocs)(q);
        return snapshot.docs.map((doc) => ({
            _id: doc.id,
            ...doc.data()
        }));
    }
    /**
     * Agrupa pedidos por loja
     */
    groupOrdersByStore(orders) {
        const grouped = new Map();
        for (const order of orders) {
            if (!grouped.has(order.storeId)) {
                grouped.set(order.storeId, []);
            }
            grouped.get(order.storeId).push(order);
        }
        return grouped;
    }
    /**
     * Processa os pedidos de uma loja específica
     */
    async processStoreOrders(storeId, orders) {
        try {
            console.log(`🏪 [QUEUE_MONITOR] Processing ${orders.length} orders for store ${storeId}`);
            // Buscar configurações de tempo da loja
            const store = await this.getStore(storeId);
            if (!store) {
                console.error(`⚠️ [QUEUE_MONITOR] Store ${storeId} not found`);
                return;
            }
            // Processar cada pedido
            for (const order of orders) {
                await this.processOrder(order, store);
            }
        }
        catch (error) {
            console.error(`💥 [QUEUE_MONITOR] Error processing store ${storeId}:`, error);
        }
    }
    /**
     * Processa um pedido individual
     */
    async processOrder(order, store) {
        try {
            const flowId = order.currentFlow.flowId;
            const flowStartTime = order.currentFlow.hour;
            if (!flowStartTime || !order.phoneNumber) {
                return;
            }
            // Calcular tempo decorrido em minutos
            const now = firestore_1.Timestamp.now();
            const elapsedMinutes = Math.floor((now.seconds - flowStartTime.seconds) / 60);
            // Obter limite de tempo para o flow atual
            const timeLimit = this.getTimeLimitForFlow(flowId, store);
            if (!timeLimit) {
                console.log(`⚠️ [QUEUE_MONITOR] No time limit configured for flow ${flowId}`);
                return;
            }
            console.log(`⏱️ [QUEUE_MONITOR] Order ${order.id} - Flow ${flowId} - ${elapsedMinutes}/${timeLimit} minutes`);
            // Verificar alertas
            const warningThreshold = Math.floor(timeLimit * 0.75); // 75%
            const overdueThreshold = timeLimit; // 100%
            const alertStatus = order.alertStatus?.[flowId] || { warningShort: false, overdue: false };
            // Verificar alerta de 75%
            if (elapsedMinutes >= warningThreshold && !alertStatus.warningShort) {
                await this.sendWarningAlert(order, store, elapsedMinutes, timeLimit);
                await this.updateAlertStatus(order._id, flowId, { ...alertStatus, warningShort: true });
            }
            // Verificar alerta de atraso (100%)
            if (elapsedMinutes >= overdueThreshold && !alertStatus.overdue) {
                await this.sendOverdueAlert(order, store, elapsedMinutes, timeLimit);
                await this.updateAlertStatus(order._id, flowId, { ...alertStatus, overdue: true });
            }
        }
        catch (error) {
            console.error(`💥 [QUEUE_MONITOR] Error processing order ${order.id}:`, error);
        }
    }
    /**
     * Obtém limite de tempo para um flow específico
     */
    getTimeLimitForFlow(flowId, store) {
        switch (flowId) {
            case Order_1.OrderFlow.QUEUE:
                return store.rowTime;
            case Order_1.OrderFlow.PREPARATION:
                return store.productionTime;
            case Order_1.OrderFlow.DELIVERY_ROUTE:
                return store.deliveryTime;
            default:
                return null;
        }
    }
    /**
     * Envia alerta de warning (75%)
     */
    async sendWarningAlert(order, store, elapsedMinutes, timeLimit) {
        try {
            console.log(`⚠️ [QUEUE_MONITOR] Sending warning alert for order ${order.id}`);
            if (!store.wabaEnvironments) {
                console.log(`⚠️ [QUEUE_MONITOR] No WABA config for store ${store._id}`);
                return;
            }
            const flowName = this.getFlowName(order.currentFlow.flowId);
            const message = `⚠️ *Alerta de Fila - 75%*\n\n🏪 Loja: ${store.name}\n📦 Pedido: #${order.id}\n👤 Cliente: ${order.customerName}\n📞 Telefone: ${order.phoneNumber}\n⏱️ Tempo na "${flowName}": ${elapsedMinutes}/${this.getTimeLimitForFlow(order.currentFlow.flowId, store)} min\n\n⚠️ Pedido próximo do limite de tempo!`;
            await (0, messagingService_1.sendMessage)({
                messaging_product: 'whatsapp',
                to: store.whatsappNumber,
                type: 'text',
                text: {
                    body: message
                }
            }, store.wabaEnvironments);
            console.log(`✅ [QUEUE_MONITOR] Warning alert sent for order ${order.id}`);
        }
        catch (error) {
            console.error(`💥 [QUEUE_MONITOR] Error sending warning alert for order ${order.id}:`, error);
        }
    }
    /**
     * Envia alerta de atraso (100%)
     */
    async sendOverdueAlert(order, store, elapsedMinutes, timeLimit) {
        try {
            console.log(`🚨 [QUEUE_MONITOR] Sending overdue alert for order ${order.id}`);
            if (!store.wabaEnvironments) {
                console.log(`⚠️ [QUEUE_MONITOR] No WABA config for store ${store._id}`);
                return;
            }
            const flowName = this.getFlowName(order.currentFlow.flowId);
            const delayMinutes = elapsedMinutes - timeLimit;
            const message = `🚨 *PEDIDO EM ATRASO*\n\n🏪 Loja: ${store.name}\n📦 Pedido: #${order.id}\n👤 Cliente: ${order.customerName}\n📞 Telefone: ${order.phoneNumber}\n⏱️ Tempo na "${flowName}": ${elapsedMinutes}/${timeLimit} min\n🚨 Atraso: ${delayMinutes} minutos\n\n⚠️ AÇÃO NECESSÁRIA: Cliente pode estar aguardando!`;
            await (0, messagingService_1.sendMessage)({
                messaging_product: 'whatsapp',
                to: store.whatsappNumber,
                type: 'text',
                text: {
                    body: message
                }
            }, store.wabaEnvironments);
            console.log(`✅ [QUEUE_MONITOR] Overdue alert sent for order ${order.id}`);
        }
        catch (error) {
            console.error(`💥 [QUEUE_MONITOR] Error sending overdue alert for order ${order.id}:`, error);
        }
    }
    /**
     * Atualiza status de alerta no banco
     */
    async updateAlertStatus(orderId, flowId, alertStatus) {
        try {
            const orderRef = (0, firestore_1.doc)(firebase_1.db, 'Orders', orderId);
            await (0, firestore_1.updateDoc)(orderRef, {
                [`alertStatus.${flowId}`]: alertStatus
            });
            console.log(`📝 [QUEUE_MONITOR] Alert status updated for order ${orderId} flow ${flowId}`);
        }
        catch (error) {
            console.error(`💥 [QUEUE_MONITOR] Error updating alert status for order ${orderId}:`, error);
        }
    }
    /**
     * Busca dados da loja
     */
    async getStore(storeId) {
        try {
            const storeRef = (0, firestore_1.doc)(firebase_1.db, 'Stores', storeId);
            const docSnap = await (0, firestore_1.getDoc)(storeRef);
            if (!docSnap.exists()) {
                return null;
            }
            return { _id: docSnap.id, ...docSnap.data() };
        }
        catch (error) {
            console.error(`💥 [QUEUE_MONITOR] Error fetching store ${storeId}:`, error);
            return null;
        }
    }
    /**
     * Obtém nome amigável do flow
     */
    getFlowName(flowId) {
        switch (flowId) {
            case Order_1.OrderFlow.QUEUE:
                return 'Fila';
            case Order_1.OrderFlow.PREPARATION:
                return 'Preparação';
            case Order_1.OrderFlow.DELIVERY_ROUTE:
                return 'Entrega';
            default:
                return `Flow ${flowId}`;
        }
    }
}
exports.QueueMonitorService = QueueMonitorService;
// Instância singleton
exports.queueMonitorService = new QueueMonitorService();
