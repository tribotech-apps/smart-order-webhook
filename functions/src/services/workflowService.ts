import {
  doc,
  getDoc,
  updateDoc,
  runTransaction,
  collection,
  arrayUnion,
  serverTimestamp,
  Timestamp,
  query,
  where,
  getDocs,
  limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { notificationService } from './notificationService';
import { sendMessage } from './messagingService';
import { OrderAlertScheduler } from './orderAlertScheduler';
import { getStoreById } from '../controllers/storeController';
import { DateTime } from 'luxon';

interface WorkflowTransition {
  orderId: string;
  fromFlowId: number;
  toFlowId: number;
  minutes: number;
  batchNumber?: number;
  deliveryManId?: string;
  cancel?: boolean;
  storeId: string;
}

interface WorkflowState {
  flowId: number;
  hour: Timestamp;
  processedAt: Timestamp;
  processedBy?: string; // userId who processed
  messagesSent: {
    whatsapp: boolean;
    push: boolean;
  };
}

export class WorkflowService {
  /**
   * Busca um pedido pela propriedade 'id' (não pelo document ID do Firebase)
   */
  private async findOrderByIdProperty(orderId: string): Promise<{ docRef: any, docSnap: any, orderData: any } | null> {
    try {
      console.log(`🔍 [WORKFLOW_SERVICE] Searching for order with id property: ${orderId}`);

      const ordersCollection = collection(db, 'Orders');
      const q = query(ordersCollection, where('id', '==', orderId), limit(1));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        console.log(`❌ [WORKFLOW_SERVICE] No order found with id: ${orderId}`);
        return null;
      }

      const docSnap = querySnapshot.docs[0];
      const orderData = docSnap.data();

      console.log(`✅ [WORKFLOW_SERVICE] Found order with Firebase doc ID: ${docSnap.id}, order.id: ${orderData.id}`);

      return {
        docRef: docSnap.ref,
        docSnap: docSnap,
        orderData: orderData
      };
    } catch (error) {
      console.error(`💥 [WORKFLOW_SERVICE] Error searching for order ${orderId}:`, error);
      return null;
    }
  }

  /**
   * Move um pedido para o próximo estágio do workflow
   * Esta é a função autoritativa que deve ser usada por mobile e web
   */
  async moveOrderToNextFlow(transition: WorkflowTransition): Promise<boolean> {
    const { orderId, fromFlowId, toFlowId, minutes, batchNumber, deliveryManId, cancel, storeId } = transition;

    console.log('🔄 [WORKFLOW_SERVICE] Starting moveOrderToNextFlow');
    console.log('📦 [WORKFLOW_SERVICE] Transition data:', JSON.stringify(transition, null, 2));

    // Primeiro, buscar o pedido pela propriedade 'id'
    const orderResult = await this.findOrderByIdProperty(orderId);
    if (!orderResult) {
      console.error(`❌ [WORKFLOW_SERVICE] Order ${orderId} not found`);
      return false;
    }

    const { docRef: orderRef, orderData } = orderResult;

    // Usar transação para garantir consistência
    try {
      const result = await runTransaction(db, async (transaction) => {
        // Re-buscar o documento na transação para garantir consistência
        const orderDoc = await transaction.get(orderRef);

        if (!orderDoc.exists()) {
          throw new Error(`Order ${orderId} not found in transaction`);
        }

        const currentOrderData = orderDoc.data() as any;
        if (!currentOrderData) {
          throw new Error(`Order ${orderId} has no data`);
        }
        console.log('🔄 [WORKFLOW_SERVICE] Preparing updates...');

        const now = Timestamp.now();

        // Preparar updates
        const updates: any = {
          'currentFlow.flowId': cancel ? 5 : toFlowId,
          'currentFlow.hour': now,
          'currentFlow.processedAt': now,
          workflow: arrayUnion({
            flowId: fromFlowId,
            minutes: minutes,
            completedAt: now
          }),
          printed: true,
          checked: true,
          alertStatus: 'green' // Reset to green when changing stage
        };

        if (batchNumber) {
          updates.batchNumber = batchNumber;
        }

        if (deliveryManId) {
          updates.deliveryManId = deliveryManId;
        }

        if (cancel) {
          updates.batchNumber = null;
          updates.deliveryManId = null;
        }

        console.log('📝 [WORKFLOW_SERVICE] Updates to apply:', JSON.stringify(updates, null, 2));

        // Aplicar updates
        transaction.update(orderRef, updates);

        console.log('✅ [WORKFLOW_SERVICE] Transaction prepared successfully');

        return {
          orderData: { ...currentOrderData, ...updates },
        };
      });

      // Após sucesso da transação, lidar com alertas
      if (toFlowId <= 3 && !cancel) {
        // Para estágios 1, 2, 3: agendar novos alertas
        // await OrderAlertScheduler.handleStageChange(orderId, toFlowId, storeId, result.orderData.createdAt.toDate());
      } else if (toFlowId >= 4 || cancel) {
        // Para estágio 4 (entregue), 5 (cancelada) ou qualquer cancelamento: cancelar todas as tasks
        console.log(`🗑️ [WORKFLOW_SERVICE] Order ${orderId} moved to final stage ${toFlowId} or cancelled, cancelling all pending tasks...`);
        // await OrderAlertScheduler.cancelOrderTasks(orderId);
        console.log(`✅ [WORKFLOW_SERVICE] All tasks cancelled for order ${orderId}`);
      }

      // Enviar WhatsApp para o cliente informando a mudança de estágio
      await this.sendCustomerWhatsAppUpdate(result.orderData, fromFlowId, toFlowId, !!cancel, storeId);

      return true;

    } catch (error) {
      console.error(`💥 [WORKFLOW_SERVICE] Error moving order ${orderId} to next flow:`, error);
      console.error(`💥 [WORKFLOW_SERVICE] Error stack:`, error instanceof Error ? error.stack : 'No stack trace');

      // Log específico para erros de permissão do Firestore
      if (error instanceof Error) {
        if (error.message.includes('PERMISSION_DENIED')) {
          console.error(`🔒 [WORKFLOW_SERVICE] FIRESTORE PERMISSION ERROR: Firebase Admin não tem permissão para acessar a coleção Orders`);
          console.error(`🔒 [WORKFLOW_SERVICE] Verifique se o Firebase Admin foi inicializado corretamente e tem as credenciais adequadas`);
        } else if (error.message.includes('NOT_FOUND')) {
          console.error(`🔍 [WORKFLOW_SERVICE] ORDER NOT FOUND: Order ${orderId} não existe no Firestore`);
        }
      }

      return false;
    }
  }

  /**
   * Envia as mensagens apropriadas para o estágio do workflow
   */
  private async sendWorkflowMessages(
    orderId: string,
    flowId: number,
    orderData: any,
    storeId: string
  ): Promise<void> {
    try {
      console.log('📧 [WORKFLOW_SERVICE] Starting to send messages...');
      console.log('📧 [WORKFLOW_SERVICE] Order data structure:', {
        hasPhoneNumber: !!orderData.phoneNumber,
        hasStore: !!orderData.store,
        hasWabaEnvironments: !!orderData.store?.wabaEnvironments,
        orderId: orderData.id || orderData._id,
        storeId
      });

      const promises = [];

      // Buscar dados da store para enviar mensagem WhatsApp
      if (orderData.phoneNumber && storeId) {
        console.log('📧 [WORKFLOW_SERVICE] Fetching store data for WhatsApp message');
        try {
          const { getStore } = require('../controllers/storeController');
          const store = await getStore(storeId);

          if (store?.wabaEnvironments) {
            console.log('📧 [WORKFLOW_SERVICE] Adding WhatsApp message to promises');
            promises.push(
              this.sendWhatsAppMessage(flowId, orderData, store).catch(error => {
                console.error(`⚠️ [WORKFLOW_SERVICE] WhatsApp message failed for order ${orderId}:`, error);
                // Não re-throw o erro para não quebrar o workflow
              })
            );
          } else {
            console.log('📧 [WORKFLOW_SERVICE] Skipping WhatsApp message - store has no waba config');
          }
        } catch (error) {
          console.error(`⚠️ [WORKFLOW_SERVICE] Error fetching store for WhatsApp message:`, error);
        }
      } else {
        console.log('📧 [WORKFLOW_SERVICE] Skipping WhatsApp message - missing phone or storeId');
      }

      // Enviar notificação push para o app mobile da loja (não crítica - pode falhar)
      console.log('📧 [WORKFLOW_SERVICE] Adding push notification to promises');
      promises.push(
        this.sendPushNotification(flowId, orderId, storeId).catch(error => {
          console.error(`⚠️ [WORKFLOW_SERVICE] Push notification failed for order ${orderId}:`, error);
          // Não re-throw o erro para não quebrar o workflow
        })
      );

      await Promise.all(promises);
      console.log(`✅ [WORKFLOW_SERVICE] All messages sent for order ${orderId} flow ${flowId}`);

    } catch (error) {
      console.error(`💥 [WORKFLOW_SERVICE] Error sending messages for order ${orderId}:`, error);
      // Não re-throw o erro - as mensagens são opcionais e não devem quebrar o workflow principal
    }
  }

  /**
   * Envia WhatsApp para o cliente informando mudança de estágio
   */
  private async sendCustomerWhatsAppUpdate(
    orderData: any,
    fromFlowId: number,
    toFlowId: number,
    cancel: boolean,
    storeId: string
  ): Promise<void> {
    try {
      console.log(`📱 [CUSTOMER_WHATSAPP] Sending stage update to customer for order ${orderData.id}: ${fromFlowId} → ${toFlowId}`);

      if (!orderData.phoneNumber) {
        console.log(`📱 [CUSTOMER_WHATSAPP] No phone number for order ${orderData.id}`);
        return;
      }

      // Buscar dados da store para WABA
      console.log(`🏪 [CUSTOMER_WHATSAPP] Getting store data for storeId: ${storeId}`);
      const store = await getStoreById(storeId);

      console.log(`🏪 [CUSTOMER_WHATSAPP] Store found:`, !!store, store?.wabaEnvironments ? 'has WABA' : 'no WABA');

      if (!store?.wabaEnvironments) {
        console.log(`📱 [CUSTOMER_WHATSAPP] Store ${storeId} has no WABA config`);
        return;
      }

      // Determinar mensagem baseada na transição
      let messageText = '';

      if (cancel || toFlowId === 5) {
        messageText = `❌ Seu pedido #${orderData.id} foi cancelado. Entre em contato conosco se tiver dúvidas.`;
      } else {
        switch (toFlowId) {
          case 1:
            messageText = `✅ Seu pedido #${orderData.id} foi confirmado! Aguarde que em breve começaremos a preparar.`;
            break;
          case 2:
            messageText = `🍳 Seu pedido #${orderData.id} está sendo preparado! Em breve estará pronto para entrega.`;
            break;
          case 3:
            messageText = `🚚 Seu pedido #${orderData.id} saiu para entrega! Prepare-se para receber em breve.`;
            break;
          case 4:
            messageText = `✅ Seu pedido #${orderData.id} foi entregue! Obrigado pela preferência! 😊`;
            break;
          default:
            console.log(`📱 [CUSTOMER_WHATSAPP] No message template for flow ${toFlowId}`);
            return;
        }
      }

      // Garantir formato correto do número
      let phoneNumber = orderData.phoneNumber;
      if (!phoneNumber.startsWith('+')) {
        phoneNumber = `+${phoneNumber}`;
      }

      console.log(`📱 [CUSTOMER_WHATSAPP] Sending message:`, {
        to: phoneNumber,
        message: messageText,
        wabaConfig: !!store.wabaEnvironments
      });

      await sendMessage({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: {
          body: messageText
        }
      }, store.wabaEnvironments);

      console.log(`✅ [CUSTOMER_WHATSAPP] Stage update sent to customer ${phoneNumber} for order ${orderData.id}`);
    } catch (error) {
      console.error(`💥 [CUSTOMER_WHATSAPP] Error sending stage update for order ${orderData.id}:`, error);
      // Não re-throw para não quebrar o workflow principal
    }
  }

  /**
   * Envia mensagem WhatsApp baseada no fluxo
   */
  private async sendWhatsAppMessage(flowId: number, orderData: any, store?: any): Promise<void> {
    try {
      console.log(`📱 [WORKFLOW_SERVICE] Sending WhatsApp message for order ${orderData.id || orderData._id} flow ${flowId}`);

      const messageTemplates = {
        1: { // Pedido confirmado
          text: `✅ Seu pedido #${orderData.id} foi confirmado! Aguarde que em breve começaremos a preparar.`
        },
        2: { // Movendo para produção
          text: `🍳 Seu pedido #${orderData.id} está sendo preparado! Em breve estará pronto para entrega.`
        },
        3: { // Movendo para rota de entrega
          text: `🚚 Seu pedido #${orderData.id} saiu para entrega! Prepare-se para receber em breve.`
        },
        4: { // Pedido entregue
          text: `✅ Seu pedido #${orderData.id} foi entregue! Obrigado pela preferência! 😊`
        },
        5: { // Pedido cancelado
          text: `❌ Seu pedido #${orderData.id} foi cancelado. Entre em contato conosco se precisar de mais informações.`
        }
      };

      const template = messageTemplates[flowId as keyof typeof messageTemplates];
      if (!template) {
        console.log(`📱 [WORKFLOW_SERVICE] No WhatsApp message template for flow ${flowId}`);
        return;
      }

      await sendMessage({
        messaging_product: 'whatsapp',
        to: '+' + orderData.phoneNumber,
        type: 'text',
        text: {
          body: template.text
        }
      }, store?.wabaEnvironments || orderData.store?.wabaEnvironments);

      console.log(`✅ [WORKFLOW_SERVICE] WhatsApp message sent for order ${orderData.id} flow ${flowId}`);
    } catch (error) {
      console.error(`💥 [WORKFLOW_SERVICE] Error sending WhatsApp message for order ${orderData.id}:`, error);
      // Não re-throw para evitar quebrar o workflow principal
    }
  }

  /**
   * Envia notificação push para o app da loja
   */
  private async sendPushNotification(flowId: number, orderId: string, storeId: string): Promise<void> {
    try {
      console.log(`📱 [WORKFLOW_SERVICE] Sending push notification for order ${orderId} flow ${flowId}`);

      const notificationTemplates = {
        1: {
          title: '✅ Pedido Confirmado',
          body: `Pedido #${orderId} foi confirmado e está na fila`
        },
        2: {
          title: '🍳 Pedido em Produção',
          body: `Pedido #${orderId} foi movido para produção`
        },
        3: {
          title: '🚚 Pedido Saiu para Entrega',
          body: `Pedido #${orderId} está a caminho do cliente`
        },
        4: {
          title: '✅ Pedido Entregue',
          body: `Pedido #${orderId} foi entregue com sucesso`
        },
        5: {
          title: '❌ Pedido Cancelado',
          body: `Pedido #${orderId} foi cancelado`
        }
      };

      const template = notificationTemplates[flowId as keyof typeof notificationTemplates];
      if (!template) {
        console.log(`📱 [WORKFLOW_SERVICE] No push notification template for flow ${flowId}`);
        return;
      }

      console.log(`📱 [WORKFLOW_SERVICE] Calling notificationService.sendNotificationToStore...`);

      await notificationService.sendNotificationToStore(storeId, {
        title: template.title,
        body: template.body,
        data: {
          type: 'workflow_update',
          action: 'open_order'
        },
        orderId,
        storeId
      });

      console.log(`✅ [WORKFLOW_SERVICE] Push notification sent for order ${orderId} flow ${flowId}`);
    } catch (error) {
      console.error(`💥 [WORKFLOW_SERVICE] Error sending push notification for order ${orderId}:`, error);
      // Não re-throw para evitar quebrar o workflow principal
    }
  }

  /**
   * Retorna a chave de notificação para um fluxo específico
   */
  private getMessageKeyForFlow(flowId: number): string {
    switch (flowId) {
      case 2: return 'moveToProduction';
      case 3: return 'moveToDeliveryRoute';
      case 4: return 'moveToDone';
      case 5: return 'cancelled';
      default: return `flow_${flowId}`;
    }
  }

  /**
   * Cancela um pedido
   */
  async cancelOrder(orderId: string, reason: string, storeId: string): Promise<boolean> {
    try {
      // Buscar o pedido pela propriedade 'id'
      const orderResult = await this.findOrderByIdProperty(orderId);
      if (!orderResult) {
        throw new Error(`Order ${orderId} not found`);
      }

      const { docRef: orderRef, orderData } = orderResult;

      if (orderData.currentFlow?.flowId === 5) {
        console.log(`Order ${orderId} is already cancelled`);
        return true;
      }

      const now = Timestamp.now();

      await updateDoc(orderRef, {
        'currentFlow.flowId': 5,
        'currentFlow.hour': now,
        'currentFlow.processedAt': now,
        cancelReason: reason,
        cancelledAt: now,
        'notifications.cancelled': true,
        batchNumber: null,
        deliveryManId: null
      });

      // Cancelar todas as tasks pendentes
      // console.log(`🗑️ [WORKFLOW_SERVICE] Cancelling all pending tasks for cancelled order ${orderId}...`);
      // await OrderAlertScheduler.cancelOrderTasks(orderId);

      // Enviar notificações de cancelamento
      // await Promise.all([
      //   this.sendCancellationMessages(orderData, reason),
      //   notificationService.notifyOrderCancelled(orderId, storeId, reason)
      // ]);

      console.log(`Order ${orderId} cancelled successfully`);
      return true;

    } catch (error) {
      console.error(`Error cancelling order ${orderId}:`, error);
      return false;
    }
  }

  /**
   * Envia mensagens de cancelamento
   */
  private async sendCancellationMessages(orderData: any, reason: string): Promise<void> {
    if (orderData.phoneNumber && orderData.store?.wabaEnvironments) {
      await sendMessage({
        messaging_product: 'whatsapp',
        to: '+' + orderData.phoneNumber,
        type: 'text',
        text: {
          body: `❌ Seu pedido #${orderData.id} foi cancelado. ${reason ? `Motivo: ${reason}` : ''} Entre em contato conosco se tiver dúvidas.`
        }
      }, orderData.store.wabaEnvironments);
    }
  }

  /**
   * Obtém o status atual de um pedido
   */
  async getOrderStatus(orderId: string): Promise<any> {
    try {
      // Buscar o pedido pela propriedade 'id'
      const orderResult = await this.findOrderByIdProperty(orderId);
      if (!orderResult) {
        throw new Error(`Order ${orderId} not found`);
      }

      const { orderData } = orderResult;
      return {
        id: orderId,
        currentFlow: orderData?.currentFlow,
        workflow: orderData?.workflow || [],
        notifications: orderData?.notifications || {},
        batchNumber: orderData?.batchNumber,
        deliveryManId: orderData?.deliveryManId
      };

    } catch (error) {
      console.error(`Error getting order status ${orderId}:`, error);
      throw error;
    }
  }
}

export const workflowService = new WorkflowService();
