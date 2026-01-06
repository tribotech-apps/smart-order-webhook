import { CloudTasksClient } from '@google-cloud/tasks';
import { db } from '../firebase';
import { doc, updateDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { OrderType, OrderAlertStatus } from '../types/Order';
import { Store } from '../types/Store';
import { notificationService } from './notificationService';
import { sendMessage } from './messagingService';
import { getStoreById } from '../controllers/storeController';
import { DateTime } from 'luxon';

const tasksClient = new CloudTasksClient();
const project = process.env.PROJECT_ID || 'your-project-id';
const location = 'us-central1';
const queue = 'TalkCommerceOrderQueue';

export class OrderAlertScheduler {

  /**
   * Agenda alertas usando Cloud Tasks no horário específico
   */
  public static async scheduleStageAlerts(
    orderId: string,
    stageId: number,
    storeId: string,
    createdAt: Date,
    stageLimitMinutes: number
  ): Promise<void> {
    console.log(`🚀 STARTING scheduleStageAlerts for order ${orderId}, stage ${stageId}, storeId ${storeId}`);
    console.log(`📋 Parameters: createdAt=${createdAt}, stageLimitMinutes=${stageLimitMinutes}`);
    console.log(`🌍 PROJECT_ID: ${process.env.PROJECT_ID || 'NOT_SET'}`);

    try {
      // Cancelar tasks anteriores
      console.log(`🗑️ Cancelling previous tasks for order ${orderId}...`);
      console.log(`🔍 [DEBUG] Order ID received: "${orderId}" (type: ${typeof orderId})`);
      await this.cancelOrderTasks(orderId);

      const created = DateTime.fromJSDate(createdAt).setZone('America/Sao_Paulo');
      const warningTime = created.plus({ minutes: stageLimitMinutes * 0.75 });
      const overdueTime = created.plus({ minutes: stageLimitMinutes });

      console.log(`⏰ Calculated times:`);
      console.log(`   - Created: ${created.toISO()}`);
      console.log(`   - Warning (75%): ${warningTime.toISO()}`);
      console.log(`   - Overdue (100%): ${overdueTime.toISO()}`);

      // Agendar alerta amarelo
      console.log(`🟡 Creating WARNING task for order ${orderId}...`);
      await this.createTask({
        taskId: `${orderId}_warning_${stageId}`,
        scheduleTime: warningTime.toJSDate(),
        payload: {
          type: 'warning',
          orderId,
          stageId,
          storeId
        }
      });
      console.log(`✅ WARNING task created successfully`);

      // Agendar alerta vermelho
      console.log(`🔴 Creating OVERDUE task for order ${orderId}...`);
      await this.createTask({
        taskId: `${orderId}_overdue_${stageId}`,
        scheduleTime: overdueTime.toJSDate(),
        payload: {
          type: 'overdue',
          orderId,
          stageId,
          storeId
        }
      });
      console.log(`✅ OVERDUE task created successfully`);

      console.log(`🎉 Cloud Tasks scheduled successfully for order ${orderId} stage ${stageId}`);
    } catch (error: any) {
      console.error(`💥 ERROR scheduling alerts for order ${orderId}:`, error);
      console.error(`💥 Error details:`, {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    }
  }

  /**
   * Cria uma task no Cloud Tasks
   */
  private static async createTask({ taskId, scheduleTime, payload }: {
    taskId: string;
    scheduleTime: Date;
    payload: any;
  }): Promise<void> {
    console.log(`🔧 CREATING TASK: ${taskId}`);
    console.log(`📍 Queue path config: project=${project}, location=${location}, queue=${queue}`);

    const parent = tasksClient.queuePath(project, location, queue);
    console.log(`📋 Parent queue path: ${parent}`);

    const task = {
      name: `${parent}/tasks/${taskId}`,
      scheduleTime: {
        seconds: Math.floor(scheduleTime.getTime() / 1000)
      },
      httpRequest: {
        httpMethod: 'POST' as const,
        url: `https://${location}-${project}.cloudfunctions.net/processOrderAlert`,
        headers: {
          'Content-Type': 'application/json'
        },
        body: Buffer.from(JSON.stringify(payload))
      }
    };

    console.log(`📦 Task configuration:`, {
      name: task.name,
      scheduleTime: new Date(task.scheduleTime.seconds * 1000).toISOString(),
      url: task.httpRequest.url,
      payload: payload
    });

    try {
      console.log(`🚀 Calling tasksClient.createTask...`);
      const [createdTask] = await tasksClient.createTask({ parent, task });
      console.log(`✅ Task created successfully:`, {
        taskName: createdTask.name,
        scheduleTime: createdTask.scheduleTime
      });
    } catch (error: any) {
      console.error(`💥 ERROR creating task ${taskId}:`, error);
      console.error(`💥 Task creation error details:`, {
        message: error.message,
        code: error.code,
        details: error.details,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Cancela tasks de um pedido
   */
  public static async cancelOrderTasks(orderId: string): Promise<void> {
    try {
      const parent = tasksClient.queuePath(project, location, queue);

      // Listar tasks que começam com o orderId
      const [tasks] = await tasksClient.listTasks({ parent });

      console.log(`🔍 [DEBUG] Found ${tasks.length} total tasks in queue`);
      console.log(`🔍 [DEBUG] Looking for tasks containing: "${orderId}"`);

      const tasksToDelete = tasks.filter(task => {
        const taskName = task.name || '';
        const contains = taskName.includes(orderId);
        console.log(`🔍 [DEBUG] Task: "${taskName}" contains "${orderId}"? ${contains}`);
        return contains;
      });

      console.log(`🔍 [DEBUG] Found ${tasksToDelete.length} tasks to delete`);

      const deletePromises = tasksToDelete.map(task => tasksClient.deleteTask({ name: task.name! }));

      await Promise.all(deletePromises);

      console.log(`🗑️ Cancelled ${deletePromises.length} tasks for order ${orderId}`);
    } catch (error) {
      console.error(`Error cancelling tasks for order ${orderId}:`, error);
    }
  }

  /**
   * Agenda alertas para mudança de estágio
   */
  public static async handleStageChange(
    orderId: string,
    newStageId: number,
    storeId: string,
    createdAt: Date
  ): Promise<void> {
    console.log(`🔄 [STAGE_CHANGE] Starting handleStageChange for order ${orderId} to stage ${newStageId}`);
    try {
      const store = await this.getStore(storeId);
      if (!store) {
        console.log(`❌ [STAGE_CHANGE] Store ${storeId} not found`);
        return;
      }

      console.log(`🏪 [STAGE_CHANGE] Store found: rowTime=${store.rowTime}, productionTime=${store.productionTime}, deliveryTime=${store.deliveryTime}`);

      // Enviar notificação para o cliente sobre mudança de estágio
      await this.sendStageChangeNotificationToCustomer(orderId, newStageId, storeId);

      // Se é estágio "aguardando confirmação" (stage 1), enviar WhatsApp para o usuário
      if (newStageId === 1) {
        await this.sendConfirmationRequestToStore(orderId, storeId);
      }

      // Calcular tempo limite do estágio
      let limitMinutes = 0;
      switch (newStageId) {
        case 1: limitMinutes = store.rowTime; break;
        case 2: limitMinutes = store.rowTime + store.productionTime; break;
        case 3: limitMinutes = store.rowTime + store.productionTime + store.deliveryTime; break;
        default:
          console.log(`❌ [STAGE_CHANGE] Invalid stage ${newStageId}`);
          return;
      }

      console.log(`⏱️ [STAGE_CHANGE] Stage ${newStageId} limit: ${limitMinutes} minutes`);

      const now = DateTime.now().setZone('America/Sao_Paulo');
      const created = DateTime.fromJSDate(createdAt).setZone('America/Sao_Paulo');
      const warningTime = created.plus({ minutes: limitMinutes * 0.75 });
      const overdueTime = created.plus({ minutes: limitMinutes });

      console.log(`🕐 [STAGE_CHANGE] Time comparison:`);
      console.log(`   - Now: ${now.toISO()}`);
      console.log(`   - Created: ${created.toISO()}`);
      console.log(`   - Warning (75%): ${warningTime.toISO()}`);
      console.log(`   - Overdue (100%): ${overdueTime.toISO()}`);

      // Verificar status atual e agir
      if (now >= overdueTime) {
        console.log(`🔴 [STAGE_CHANGE] OVERDUE - sending immediate red alert`);
        await this.sendOverdueAlert(orderId, newStageId, storeId);
      } else if (now >= warningTime) {
        console.log(`🟡 [STAGE_CHANGE] WARNING - sending immediate yellow alert + scheduling red`);
        await this.sendWarningAlert(orderId, newStageId, storeId);

        // Agendar apenas o vermelho
        await this.createTask({
          taskId: `${orderId}_overdue_${newStageId}`,
          scheduleTime: overdueTime.toJSDate(),
          payload: {
            type: 'overdue',
            orderId,
            stageId: newStageId,
            storeId
          }
        });
      } else {
        console.log(`🟢 [STAGE_CHANGE] GREEN - scheduling both alerts`);
        // await this.scheduleStageAlerts(orderId, newStageId, storeId, createdAt, limitMinutes);
      }
    } catch (error) {
      console.error(`Error handling stage change for order ${orderId}:`, error);
    }
  }

  /**
   * Envia alerta amarelo
   */
  public static async sendWarningAlert(orderId: string, stageId: number, storeId: string): Promise<void> {
    console.log(`🟡 [WARNING_ALERT] Processing for order ${orderId}, stage ${stageId}, store ${storeId}`);

    const order = await this.getOrder(orderId);
    if (!order) {
      console.log(`❌ [WARNING_ALERT] Order ${orderId} not found`);
      return;
    }

    console.log(`📋 [WARNING_ALERT] Order found: currentFlow.flowId=${order.currentFlow?.flowId}, expected stageId=${stageId}`);

    // Se o pedido já mudou de estágio, não enviar alerta
    if (order.currentFlow?.flowId !== stageId) {
      console.log(`⏭️ [WARNING_ALERT] Order ${orderId} moved to stage ${order.currentFlow?.flowId}, skipping warning for stage ${stageId}`);
      return;
    }

    const now = DateTime.now().setZone('America/Sao_Paulo');
    const created = DateTime.fromJSDate(order.createdAt.toDate()).setZone('America/Sao_Paulo');
    const elapsedMinutes = Math.floor(now.diff(created, 'minutes').minutes);
    const stageName = this.getStageName(stageId);

    // Buscar dados da loja para WhatsApp
    const store = await this.getStore(storeId);

    // Mensagem WhatsApp para a loja (se configurado)
    if (store?.whatsappNumber && store?.wabaEnvironments) {
      const whatsappMessage = `🟡 *ALERTA AMARELO - 75%*\n\n⚠️ Pedido #${order.id} está próximo do prazo\n👤 Cliente: ${order.customerName}\n⏱️ Tempo: ${elapsedMinutes} minutos\n📍 Estágio: ${stageName}\n\n_Atenção necessária para manter a qualidade do serviço._`;

      try {
        await sendMessage({
          messaging_product: 'whatsapp',
          to: store.whatsappNumber,
          type: 'text',
          text: {
            body: whatsappMessage
          }
        }, store.wabaEnvironments);
        console.log(`✅ [WARNING_ALERT] WhatsApp message sent to store for order ${orderId}`);
      } catch (error) {
        console.error(`💥 [WARNING_ALERT] WhatsApp message failed:`, error);
      }
    } else {
      console.log(`⚠️ [WARNING_ALERT] Store ${storeId} has no WhatsApp config: whatsappNumber=${!!store?.whatsappNumber}, wabaEnvironments=${!!store?.wabaEnvironments}`);
    }

    // Atualizar status
    await this.updateOrderStatus(orderId, 'yellow');
  }

  /**
   * Envia alerta vermelho
   */
  public static async sendOverdueAlert(orderId: string, stageId: number, storeId: string): Promise<void> {
    console.log(`🔴 [OVERDUE_ALERT] Processing for order ${orderId}, stage ${stageId}, store ${storeId}`);

    const order = await this.getOrder(orderId);
    if (!order) {
      console.log(`❌ [OVERDUE_ALERT] Order ${orderId} not found`);
      return;
    }

    console.log(`📋 [OVERDUE_ALERT] Order found: currentFlow.flowId=${order.currentFlow?.flowId}, expected stageId=${stageId}`);

    // Se o pedido já mudou de estágio, não enviar alerta
    if (order.currentFlow?.flowId !== stageId) {
      console.log(`⏭️ [OVERDUE_ALERT] Order ${orderId} moved to stage ${order.currentFlow?.flowId}, skipping overdue alert for stage ${stageId}`);
      return;
    }

    const now = DateTime.now().setZone('America/Sao_Paulo');
    const created = DateTime.fromJSDate(order.createdAt.toDate()).setZone('America/Sao_Paulo');
    const elapsedMinutes = Math.floor(now.diff(created, 'minutes').minutes);
    const stageName = this.getStageName(stageId);

    // Buscar dados da loja para WhatsApp
    const store = await this.getStore(storeId);

    // Mensagem WhatsApp para a loja (se configurado)
    if (store?.whatsappNumber && store?.wabaEnvironments) {
      const whatsappMessage = `🔴 *ALERTA VERMELHO - PEDIDO EM ATRASO* 🚨\n\n⚠️ *AÇÃO IMEDIATA NECESSÁRIA*\n\n📋 Pedido #${order.id}\n👤 Cliente: ${order.customerName}\n⏱️ Tempo decorrido: ${elapsedMinutes} minutos\n📍 Estágio: ${stageName}\n\n⚡ *Este pedido ultrapassou o prazo estabelecido!*\n_Verifique o status e tome as ações necessárias._`;

      try {
        await sendMessage({
          messaging_product: 'whatsapp',
          to: store.whatsappNumber,
          type: 'text',
          text: {
            body: whatsappMessage
          }
        }, store.wabaEnvironments);
        console.log(`✅ [OVERDUE_ALERT] WhatsApp message sent to store for order ${orderId}`);
      } catch (error) {
        console.error(`💥 [OVERDUE_ALERT] WhatsApp message failed:`, error);
      }
    } else {
      console.log(`⚠️ [OVERDUE_ALERT] Store ${storeId} has no WhatsApp config: whatsappNumber=${!!store?.whatsappNumber}, wabaEnvironments=${!!store?.wabaEnvironments}`);
    }

    // Atualizar status
    await this.updateOrderStatus(orderId, 'red');
  }

  /**
   * Atualiza status da ordem
   */
  private static async updateOrderStatus(orderId: string, status: OrderAlertStatus): Promise<void> {
    try {
      console.log(`📝 [UPDATE_STATUS] Updating status for order ${orderId} to ${status}`);

      // Buscar ordem pela propriedade id
      const order = await this.getOrder(orderId);
      if (!order || !order._id) {
        console.log(`❌ [UPDATE_STATUS] Order not found: ${orderId}`);
        return;
      }

      const orderRef = doc(db, 'Orders', order._id);
      await updateDoc(orderRef, { alertStatus: status });
      console.log(`✅ [UPDATE_STATUS] Status updated successfully for order ${orderId}`);
    } catch (error) {
      console.error(`💥 [UPDATE_STATUS] Error updating order status:`, error);
    }
  }

  /**
   * Busca ordem pela propriedade 'id' (não pelo document ID do Firebase)
   */
  private static async getOrder(orderId: string): Promise<OrderType | null> {
    try {
      console.log(`🔍 [GET_ORDER] Searching for order with id property: ${orderId}`);

      const ordersCollection = collection(db, 'Orders');
      const q = query(ordersCollection, where('id', '==', orderId), limit(1));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        console.log(`❌ [GET_ORDER] Order not found with id: ${orderId}`);
        return null;
      }

      const orderDoc = querySnapshot.docs[0];
      console.log(`✅ [GET_ORDER] Found order - Firebase doc ID: ${orderDoc.id}, order.id: ${orderId}`);
      return { _id: orderDoc.id, ...orderDoc.data() } as OrderType;
    } catch (error) {
      console.error(`💥 [GET_ORDER] Error searching for order ${orderId}:`, error);
      return null;
    }
  }

  /**
   * Busca loja por ID
   */
  private static async getStore(storeId: string): Promise<Store | null> {
    return (await getStoreById(storeId)) || null;
  }

  /**
   * Nome do estágio
   */
  private static getStageName(stageId: number): string {
    switch (stageId) {
      case 1: return 'Fila de Espera';
      case 2: return 'Preparação';
      case 3: return 'Em Rota de Entrega';
      default: return `Estágio ${stageId}`;
    }
  }

  /**
   * Envia notificação para o cliente sobre mudança de estágio
   */
  private static async sendStageChangeNotificationToCustomer(orderId: string, newStageId: number, storeId: string): Promise<void> {
    console.log(`📱 [CUSTOMER_NOTIFICATION] Sending stage change notification for order ${orderId} to stage ${newStageId}`);

    try {
      const order = await this.getOrder(orderId);
      if (!order || !order.phoneNumber) {
        console.log(`❌ [CUSTOMER_NOTIFICATION] Order ${orderId} not found or no phone number`);
        return;
      }

      const store = await this.getStore(storeId);
      if (!store?.wabaEnvironments) {
        console.log(`❌ [CUSTOMER_NOTIFICATION] Store ${storeId} not found or no WABA config`);
        return;
      }

      const stageName = this.getStageName(newStageId);
      let messageText = '';

      switch (newStageId) {
        case 1:
          messageText = `🔔 *Pedido recebido!*\n\nOlá ${order.customerName}!\n\nSeu pedido #${order.id} foi recebido e está *aguardando confirmação* da loja.\n\nEm breve você receberá uma confirmação! 😊`;
          break;
        case 2:
          messageText = `👨‍🍳 *Pedido confirmado!*\n\nOlá ${order.customerName}!\n\nSeu pedido #${order.id} foi confirmado e está em *preparação*!\n\nEstamos preparando tudo com carinho para você. 🍽️`;
          break;
        case 3:
          messageText = `🚗 *Pedido saiu para entrega!*\n\nOlá ${order.customerName}!\n\nSeu pedido #${order.id} está *em rota de entrega*!\n\nEm breve chegará até você! 🛵`;
          break;
        case 4:
          messageText = `✅ *Pedido entregue!*\n\nOlá ${order.customerName}!\n\nSeu pedido #${order.id} foi *entregue com sucesso*!\n\nObrigado por escolher nossos serviços! ⭐`;
          break;
        default:
          messageText = `📋 *Atualização do pedido*\n\nOlá ${order.customerName}!\n\nSeu pedido #${order.id} foi atualizado para: *${stageName}*`;
      }

      await sendMessage({
        messaging_product: 'whatsapp',
        to: order.phoneNumber,
        type: 'text',
        text: {
          body: messageText
        }
      }, store.wabaEnvironments);

      console.log(`✅ [CUSTOMER_NOTIFICATION] Stage change notification sent to customer for order ${orderId}`);
    } catch (error) {
      console.error(`💥 [CUSTOMER_NOTIFICATION] Error sending stage change notification:`, error);
    }
  }

  /**
   * Envia WhatsApp para a loja quando pedido chega em aguardando confirmação
   */
  private static async sendConfirmationRequestToStore(orderId: string, storeId: string): Promise<void> {
    console.log(`🏪 [CONFIRMATION_REQUEST] Sending confirmation request for order ${orderId} to store ${storeId}`);

    try {
      const order = await this.getOrder(orderId);
      if (!order) {
        console.log(`❌ [CONFIRMATION_REQUEST] Order ${orderId} not found`);
        return;
      }

      const store = await this.getStore(storeId);
      if (!store?.whatsappNumber || !store?.wabaEnvironments) {
        console.log(`❌ [CONFIRMATION_REQUEST] Store ${storeId} not found or no WhatsApp/WABA config`);
        return;
      }

      // Criar resumo dos itens do pedido
      const itemsSummary = order.items?.map(item =>
        `• ${item.quantity}x ${item.menuName}${item.price ? ` - R$ ${item.price.toFixed(2)}` : ''}`
      ).join('\n') || 'Itens não especificados';

      const totalValue = order.total ? `\n💰 *Total: R$ ${order.total.toFixed(2)}*` : '';

      const deliveryAddress = order.address ?
        `${order.address.street}, ${order.address.number} - ${order.address.neighborhood}` :
        'Não informado';

      const messageText = `🔔 *NOVO PEDIDO - AGUARDANDO CONFIRMAÇÃO*\n\n` +
        `📋 *Pedido:* #${order.id}\n` +
        `👤 *Cliente:* ${order.customerName}\n` +
        `📱 *Telefone:* ${order.phoneNumber}\n` +
        `📍 *Endereço:* ${deliveryAddress}\n\n` +
        `🛒 *Itens:*\n${itemsSummary}${totalValue}\n\n` +
        `⚡ *AÇÃO NECESSÁRIA:* Confirme ou rejeite este pedido no sistema!`;

      await sendMessage({
        messaging_product: 'whatsapp',
        to: store.whatsappNumber,
        type: 'text',
        text: {
          body: messageText
        }
      }, store.wabaEnvironments);

      console.log(`✅ [CONFIRMATION_REQUEST] Confirmation request sent to store ${storeId} for order ${orderId}`);
    } catch (error) {
      console.error(`💥 [CONFIRMATION_REQUEST] Error sending confirmation request:`, error);
    }
  }
}