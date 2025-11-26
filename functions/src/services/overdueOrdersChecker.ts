import { db } from '../firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { OrderType } from '../types/Order';
import { Store } from '../types/Store';
import { sendMessage } from './messagingService';
import { getStoreById } from '../controllers/storeController';
import { DateTime } from 'luxon';

/**
 * Verifica todos os pedidos ativos e envia alertas para aqueles que estão em atraso
 */
export class OverdueOrdersChecker {

  /**
   * Função principal que verifica todos os pedidos ativos
   */
  public static async checkOverdueOrders(): Promise<void> {
    console.log(`🕐 [OVERDUE_CHECKER] Starting overdue orders check at ${new Date().toISOString()}`);

    try {
      // Buscar todos os pedidos ativos (não entregues e não cancelados)
      const activeOrders = await this.getActiveOrders();
      console.log(`📋 [OVERDUE_CHECKER] Found ${activeOrders.length} active orders to check`);

      if (activeOrders.length === 0) {
        console.log(`✅ [OVERDUE_CHECKER] No active orders found`);
        return;
      }

      // Verificar cada pedido
      for (const order of activeOrders) {
        await this.checkSingleOrder(order);
      }

      console.log(`✅ [OVERDUE_CHECKER] Completed check for all active orders`);
    } catch (error) {
      console.error(`💥 [OVERDUE_CHECKER] Error during overdue check:`, error);
    }
  }

  /**
   * Busca todos os pedidos ativos (não entregues e não cancelados)
   */
  private static async getActiveOrders(): Promise<OrderType[]> {
    try {
      const ordersCollection = collection(db, 'Orders');

      // Buscar pedidos que não estão entregues (flowId != 4) e não cancelados (flowId != 5)
      const q = query(
        ordersCollection,
        where('currentFlow.flowId', 'in', [1, 2, 3]) // Apenas pedidos nos estágios 1, 2 ou 3
      );

      const querySnapshot = await getDocs(q);

      const orders: OrderType[] = [];
      querySnapshot.forEach((doc) => {
        orders.push({ _id: doc.id, ...doc.data() } as OrderType);
      });

      console.log(`🔍 [GET_ACTIVE_ORDERS] Retrieved ${orders.length} active orders`);
      return orders;
    } catch (error) {
      console.error(`💥 [GET_ACTIVE_ORDERS] Error fetching active orders:`, error);
      return [];
    }
  }

  /**
   * Verifica um pedido específico
   */
  private static async checkSingleOrder(order: OrderType): Promise<void> {
    try {
      console.log(`🔍 [CHECK_ORDER] Checking order ${order.id} (stage: ${order.currentFlow.flowId})`);

      // Buscar dados da loja
      const store = await this.getStore(order.storeId);
      if (!store) {
        console.log(`❌ [CHECK_ORDER] Store ${order.storeId} not found for order ${order.id}`);
        return;
      }

      // Verificar se a loja tem WhatsApp configurado
      if (!store.whatsappNumber || !store.wabaEnvironments) {
        console.log(`⚠️ [CHECK_ORDER] Store ${order.storeId} has no WhatsApp config, skipping order ${order.id}`);
        return;
      }

      // TypeScript safety check
      if (!store.wabaEnvironments) {
        console.log(`⚠️ [CHECK_ORDER] Store ${order.storeId} has no WABA environments, skipping order ${order.id}`);
        return;
      }

      // Calcular tempos limite baseado no estágio atual
      const stageLimits = this.getStageLimits(store, order.currentFlow.flowId);
      if (!stageLimits) {
        console.log(`❌ [CHECK_ORDER] Invalid stage ${order.currentFlow.flowId} for order ${order.id}`);
        return;
      }

      const now = DateTime.now().setZone('America/Sao_Paulo');
      const created = DateTime.fromJSDate(order.createdAt.toDate()).setZone('America/Sao_Paulo');
      const elapsedMinutes = Math.floor(now.diff(created, 'minutes').minutes);

      // Calcular quando deveria ter chegado os alertas
      const warningThreshold = stageLimits.totalMinutes * 0.75;
      const overdueThreshold = stageLimits.totalMinutes;

      console.log(`⏱️ [CHECK_ORDER] Order ${order.id} timing:`);
      console.log(`   - Created: ${created.toISO()}`);
      console.log(`   - Elapsed: ${elapsedMinutes} minutes`);
      console.log(`   - Warning threshold: ${warningThreshold} minutes`);
      console.log(`   - Overdue threshold: ${overdueThreshold} minutes`);
      console.log(`   - Current alert status: ${order.alertStatus || 'none'}`);

      // Determinar se precisa enviar alerta
      if (elapsedMinutes >= overdueThreshold && order.alertStatus !== 'red') {
        console.log(`🔴 [CHECK_ORDER] Order ${order.id} is OVERDUE - sending red alert`);
        await this.sendOverdueAlert(order, store, elapsedMinutes);
      } else if (elapsedMinutes >= warningThreshold && order.alertStatus !== 'yellow' && order.alertStatus !== 'red') {
        console.log(`🟡 [CHECK_ORDER] Order ${order.id} is approaching deadline - sending yellow alert`);
        await this.sendWarningAlert(order, store, elapsedMinutes);
      } else {
        console.log(`🟢 [CHECK_ORDER] Order ${order.id} is on time or already alerted`);
      }
    } catch (error) {
      console.error(`💥 [CHECK_ORDER] Error checking order ${order.id}:`, error);
    }
  }

  /**
   * Calcula os limites de tempo baseado no estágio atual e configurações da loja
   */
  private static getStageLimits(store: Store, stageId: number): { totalMinutes: number; stageName: string } | null {
    switch (stageId) {
      case 1: // Aguardando confirmação
        return {
          totalMinutes: store.rowTime || 5, // Tempo para confirmar o pedido
          stageName: 'Aguardando Confirmação'
        };
      case 2: // Em preparação
        return {
          totalMinutes: (store.rowTime || 5) + (store.productionTime || 45), // Tempo total até terminar preparo
          stageName: 'Em Preparação'
        };
      case 3: // Em rota de entrega
        return {
          totalMinutes: (store.rowTime || 5) + (store.productionTime || 45) + (store.deliveryTime || 30), // Tempo total até entregar
          stageName: 'Em Rota de Entrega'
        };
      default:
        return null;
    }
  }

  /**
   * Envia alerta amarelo (75% do tempo)
   */
  private static async sendWarningAlert(order: OrderType, store: Store, elapsedMinutes: number): Promise<void> {
    try {
      const stageLimits = this.getStageLimits(store, order.currentFlow.flowId);
      if (!stageLimits) return;

      const whatsappMessage = `🟡 *ALERTA AMARELO - 75%*\n\n⚠️ Pedido #${order.id} está próximo do prazo\n👤 Cliente: ${order.customerName}\n📱 Telefone: ${order.phoneNumber}\n⏱️ Tempo decorrido: ${elapsedMinutes} minutos\n📍 Estágio: ${stageLimits.stageName}\n⏰ Limite: ${stageLimits.totalMinutes} minutos\n\n_Atenção necessária para manter a qualidade do serviço._`;

      await sendMessage({
        messaging_product: 'whatsapp',
        to: store.whatsappNumber!,
        type: 'text',
        text: {
          body: whatsappMessage
        }
      }, store.wabaEnvironments!);

      // Atualizar status do pedido
      await this.updateOrderStatus(order._id!, 'yellow');

      console.log(`✅ [WARNING_ALERT] Warning alert sent for order ${order.id}`);
    } catch (error) {
      console.error(`💥 [WARNING_ALERT] Error sending warning alert for order ${order.id}:`, error);
    }
  }

  /**
   * Envia alerta vermelho (100% do tempo - atrasado)
   */
  private static async sendOverdueAlert(order: OrderType, store: Store, elapsedMinutes: number): Promise<void> {
    try {
      const stageLimits = this.getStageLimits(store, order.currentFlow.flowId);
      if (!stageLimits) return;

      const whatsappMessage = `🔴 *ALERTA VERMELHO - PEDIDO EM ATRASO* 🚨\n\n⚠️ *AÇÃO IMEDIATA NECESSÁRIA*\n\n📋 Pedido #${order.id}\n👤 Cliente: ${order.customerName}\n📱 Telefone: ${order.phoneNumber}\n⏱️ Tempo decorrido: ${elapsedMinutes} minutos\n📍 Estágio: ${stageLimits.stageName}\n⏰ Limite: ${stageLimits.totalMinutes} minutos\n🚨 *ATRASO: ${elapsedMinutes - stageLimits.totalMinutes} minutos*\n\n⚡ *Este pedido ultrapassou o prazo estabelecido!*\n_Verifique o status imediatamente e tome as ações necessárias._`;

      await sendMessage({
        messaging_product: 'whatsapp',
        to: store.whatsappNumber!,
        type: 'text',
        text: {
          body: whatsappMessage
        }
      }, store.wabaEnvironments!);

      // Atualizar status do pedido
      await this.updateOrderStatus(order._id!, 'red');

      console.log(`✅ [OVERDUE_ALERT] Overdue alert sent for order ${order.id}`);
    } catch (error) {
      console.error(`💥 [OVERDUE_ALERT] Error sending overdue alert for order ${order.id}:`, error);
    }
  }

  /**
   * Atualiza o status de alerta do pedido
   */
  private static async updateOrderStatus(documentId: string, status: 'yellow' | 'red'): Promise<void> {
    try {
      const { doc, updateDoc } = await import('firebase/firestore');

      const orderRef = doc(db, 'Orders', documentId);
      await updateDoc(orderRef, {
        alertStatus: status,
        alertStatusUpdatedAt: Timestamp.now()
      });

      console.log(`📝 [UPDATE_STATUS] Updated status to ${status} for document ${documentId}`);
    } catch (error) {
      console.error(`💥 [UPDATE_STATUS] Error updating status:`, error);
    }
  }

  /**
   * Busca loja por ID
   */
  private static async getStore(storeId: string): Promise<Store | null> {
    return (await getStoreById(storeId)) || null;
  }
}