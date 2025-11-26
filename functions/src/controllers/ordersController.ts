import firebase from '../firebase';
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  Timestamp,
  addDoc,
} from 'firebase/firestore';
import { OrderFlow, OrderItemType, OrderType, ShoppingCartType } from '../types/Order';
import { ensureUserExists } from '../controllers/userController';
import { Conversation } from '../types/Conversation';
import { getStore } from './storeController';
import { notifyAdmin } from '../services/messagingService';
import { ShoppingCartItem } from '../types/Store';
import { OrderAlertScheduler } from '../services/orderAlertScheduler';

const db = getFirestore(firebase);

export const getUserPendingOrders = async ({ uid }: { uid: string }): Promise<OrderType[]> => {
  try {
    const ordersRef = collection(db, "Orders")
    const ordersQuery = query(ordersRef, where("uid", "==", uid));

    const querySnapshot = await getDocs(ordersQuery);

    if (!querySnapshot || !querySnapshot.size) {
      return []
    }
    const response: OrderType[] = [];

    querySnapshot.forEach((doc) => {
      const orderData = doc.data() as OrderType;
      if (orderData.currentFlow.flowId < 4) response.push({ ...orderData });
    });

    return response;
  } catch (error) {
    // TODO: handle
    return [];
  }

}

/**
 * Cria um pedido no Firestore, garantindo que o usuário exista.
 * @param conversation Dados da conversa.
 * @param paymentId ID do pagamento gerado (ex.: ID do Pagar.me).
 */
export const createOrder = async (conversation: Conversation, paymentId: string): Promise<OrderType> => {
  try {
    if (!conversation.store?.slug?.trim()) {
      // TODO: handle
      // If store is not found, we need to handle this case
      notifyAdmin('Store parameter is missing');
      throw new Error('Parâmetro da loja não encontrado.');
    }

    console.log('Iniciando criação do pedido...', conversation, conversation?.customerName, !conversation?.phoneNumber, !conversation.address, paymentId);

    // consistencia dos parametros enviados
    if (!conversation?.customerName || !conversation?.phoneNumber || !conversation.address || !paymentId) {
      throw new Error('Cliente não foi enviado ou ID do pagamento é inválido.');
    }
    console.log('Dados da conversa:', conversation);
    // garantir que o número de telefone tenha o símbolo + no início
    if (!conversation.phoneNumber.startsWith('+')) {
      console.log(`Número de telefone ajustado para incluir '+': ${conversation.phoneNumber}`);
      conversation.phoneNumber = `+${conversation.phoneNumber}`;
    }

    // Garantir que o usuário exista
    const userUid = await ensureUserExists(
      conversation.customerName,
      conversation.phoneNumber,
      conversation.address
    );

    console.log('Usuário garantido. Prosseguindo com a criação do pedido.');


    // Get store
    const store = await getStore(conversation.store.slug.trim());
    if (!store) {
      // TODO: handle
      notifyAdmin('Loja não encontrada');
      throw new Error('Loja não encontrada.');
    }

    // Criar o pedido no Firestore
    const order: OrderType = {
      id: `${store?.slug}-${(new Date().getUTCMilliseconds() + Math.floor(Math.random() * 100000)).toFixed(0).toString()}`,
      uid: userUid,
      deliveryOption: 'DELIVERY',
      address: conversation.address,
      currentFlow: { hour: Timestamp.now(), flowId: OrderFlow.QUEUE },
      customerName: conversation.customerName,
      deliveryPrice: conversation.deliveryPrice || 0,
      createdAt: Timestamp.now(),
      items: conversation.cartItems?.map((item: any, index: number) => ({
        id: index ? index + 1 : 1,
        menuId: item.menuId,
        menuName: item.menuName || '',
        menuImage: item.menuImage || '',
        menuImageUrl: item.menuImageUrl || '',
        comments: item.comments || '',
        price: item.price || 0,
        quantity: item.quantity || 0,
        questions: item.questions || [],
      })) || [],
      paymentMethod: conversation.paymentMethod || 'PIX',
      phoneNumber: conversation.phoneNumber,
      storeId: store._id,
      total: conversation.totalPrice || 0,
      workflow: [{ flowId: OrderFlow.QUEUE, minutes: 0 }],
      printed: false,
      paymentId: paymentId,
    };

    console.log('Pedido para ser criado:', order);

    const docRef = await addDoc(collection(db, 'Orders'), order);
    const orderId = docRef.id;

    console.log('Pedido criado com sucesso no Firestore:', order);


    // Agendar alertas do estágio 1 (fila) usando Firebase Scheduler
    console.log(`🔔 PREPARING TO SCHEDULE ALERTS - orderId: ${orderId}, storeId: ${store._id}, rowTime: ${store.rowTime}`);
    if (store && order.createdAt) {
      console.log(`🚀 CALLING OrderAlertScheduler.scheduleStageAlerts...`);
      await OrderAlertScheduler.scheduleStageAlerts(
        order.id,
        1,
        store._id,
        order.createdAt.toDate(),
        store.rowTime
      );
      console.log(`✅ scheduleStageAlerts call completed for pedido ${orderId}`);

      // Enviar notificações WhatsApp quando pedido for criado (estágio 1)
      console.log(`📱 CALLING OrderAlertScheduler.handleStageChange for WhatsApp notifications...`);
      await OrderAlertScheduler.handleStageChange(
        order.id,
        1,
        store._id,
        order.createdAt.toDate()
      );
      console.log(`✅ handleStageChange call completed for pedido ${orderId}`);
    } else {
      console.log(`❌ NOT SCHEDULING ALERTS - store: ${!!store}, createdAt: ${!!order.createdAt}`);
    }

    return { ...order, _id: orderId };
  } catch (error: any) {
    notifyAdmin('Erro ao criar pedido:', error.message);
    throw new Error('Erro ao criar pedido.');
  }
};


export const getActiveOrder = async (phoneNumber: string, storeId: string): Promise<OrderType | null> => {
  try {

    // Garante que o número de telefone tenha o simbolo + no  inicio
    if (!phoneNumber.startsWith('+')) {
      phoneNumber = `+${phoneNumber}`;
    }

    console.log('getActiveOrder', phoneNumber, storeId, typeof storeId);

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Define o início do dia

    const ordersRef = collection(db, 'Orders');
    const ordersQuery = query(
      ordersRef,
      where('storeId', '==', storeId.toString()),
      where('phoneNumber', '==', phoneNumber),
      where('currentFlow.flowId', '<', 4) // Verifica se o flowId é menor que 4
    );
    const ordersSnapshot = await getDocs(ordersQuery);

    console.log('Ordens ativas encontradas:', ordersSnapshot.size, phoneNumber);

    if (ordersSnapshot.empty) {
      console.log('Nenhuma ordem ativa encontrada para o cliente.');
      return null;
    }

    // Filtrar ordens criadas no mesmo dia
    const activeOrder = ordersSnapshot.docs
      .map((doc) => doc.data() as OrderType)
      .find((order) => {
        const createdAtDate = order.createdAt.toDate(); // Converte o Timestamp para Date
        return createdAtDate.toDateString() === today.toDateString(); // Compara as datas
      });


    console.log('Ordem ativa encontrada:', activeOrder, ordersSnapshot.docs);

    if (!activeOrder) {
      console.log('Nenhuma ordem ativa encontrada para o cliente no mesmo dia.');
      return null;
    }

    return activeOrder;
  } catch (error) {
    notifyAdmin('Erro ao buscar ordem ativa:', error);
    return null;
  }
};


export const getTotalOrder = (orderItems: ShoppingCartItem[]): number => {
  if (!orderItems?.length) return 0;

  let total = 0;

  orderItems.forEach((item: ShoppingCartItem) => {
    // total = total + (item.price * item.quantity)
    let totalAditionals = 0;
    item.questions?.forEach((question) => {
      question.answers?.forEach((answer) => {
        if (answer.price && answer.quantity) {
          totalAditionals = totalAditionals + (answer.price * answer.quantity)
        }
      })
    })

    total = total + ((item.price + totalAditionals) * item.quantity)
  });

  return total;
}

export const getTotalOrderItem = (item: OrderItemType) => {
  let total = 0;
  let totalAditionals = 0;
  item.questions?.forEach((question) => {
    question.answers?.forEach((answer) => {
      if (answer.price && answer.quantity) {
        // console.log(answer)
        totalAditionals = totalAditionals + (answer.price * answer.quantity)
      }
    })
  })

  total = total + ((item.price + totalAditionals) * item.quantity)

  return total;
}

export const getTotalAditionalsItem = (item: OrderItemType) => {
  let totalAditionals = 0;
  item.questions?.forEach((question) => {
    question.answers?.forEach((answer) => {
      if (answer.price && answer.quantity) {
        totalAditionals = totalAditionals + (answer.price * answer.quantity)
      }
    })
  })


  return totalAditionals;
}