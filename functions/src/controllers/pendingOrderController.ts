import firebase from '../firebase';
import {
  getFirestore,
  collection,
  addDoc,
  getDoc,
  updateDoc,
  doc,
  query,
  where,
  getDocs,
  Timestamp,
  deleteDoc
} from 'firebase/firestore';
import { PendingOrder } from '../types/Order';

const db = getFirestore(firebase);
const PENDING_ORDERS_COLLECTION = 'PendingOrders';

/**
 * Cria um pedido pendente aguardando confirmação de pagamento
 */
export async function createPendingOrder(pendingOrder: PendingOrder): Promise<string> {
  try {
    console.log('Criando pedido pendente:', pendingOrder.externalReference);

    const docRef = await addDoc(collection(db, PENDING_ORDERS_COLLECTION), {
      ...pendingOrder,
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000), // Expira em 24h
      status: 'pending'
    });

    console.log('Pedido pendente criado com ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Erro ao criar pedido pendente:', error);
    throw new Error('Falha ao criar pedido pendente');
  }
}

/**
 * Busca um pedido pendente pelo externalReference
 */
export async function getPendingOrderByReference(externalReference: string): Promise<PendingOrder | null> {
  try {
    const pendingOrdersRef = collection(db, PENDING_ORDERS_COLLECTION);
    const q = query(pendingOrdersRef, where('externalReference', '==', externalReference));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.log('Nenhum pedido pendente encontrado com referência:', externalReference);
      return null;
    }

    const docData = querySnapshot.docs[0].data() as PendingOrder;
    return { ...docData, _id: querySnapshot.docs[0].id } as any;
  } catch (error) {
    console.error('Erro ao buscar pedido pendente:', error);
    throw error;
  }
}

/**
 * Busca um pedido pendente pelo ID da preferência do Mercado Pago
 */
export async function getPendingOrderByPreferenceId(preferenceId: string): Promise<PendingOrder | null> {
  try {
    const pendingOrdersRef = collection(db, PENDING_ORDERS_COLLECTION);
    const q = query(pendingOrdersRef, where('mercadoPagoPreferenceId', '==', preferenceId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.log('Nenhum pedido pendente encontrado com preferenceId:', preferenceId);
      return null;
    }

    const docData = querySnapshot.docs[0].data() as PendingOrder;
    return { ...docData, _id: querySnapshot.docs[0].id } as any;
  } catch (error) {
    console.error('Erro ao buscar pedido pendente:', error);
    throw error;
  }
}

/**
 * Busca um pedido pendente pelo ID do pagamento do Mercado Pago
 */
export async function getPendingOrderByPaymentId(paymentId: string): Promise<PendingOrder | null> {
  try {
    const pendingOrdersRef = collection(db, PENDING_ORDERS_COLLECTION);
    const q = query(pendingOrdersRef, where('mercadoPagoPaymentId', '==', paymentId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.log('Nenhum pedido pendente encontrado com paymentId:', paymentId);
      return null;
    }

    const docData = querySnapshot.docs[0].data() as PendingOrder;
    return { ...docData, _id: querySnapshot.docs[0].id } as any;
  } catch (error) {
    console.error('Erro ao buscar pedido pendente:', error);
    throw error;
  }
}

/**
 * Atualiza o status de um pedido pendente
 */
export async function updatePendingOrderStatus(
  externalReference: string,
  status: PendingOrder['status'],
  mercadoPagoPaymentId?: string
): Promise<void> {
  try {
    const pendingOrder = await getPendingOrderByReference(externalReference);

    if (!pendingOrder || !(pendingOrder as any)._id) {
      throw new Error('Pedido pendente não encontrado');
    }

    const docRef = doc(db, PENDING_ORDERS_COLLECTION, (pendingOrder as any)._id);

    const updateData: any = { status };
    if (mercadoPagoPaymentId) {
      updateData.mercadoPagoPaymentId = mercadoPagoPaymentId;
    }

    await updateDoc(docRef, updateData);
    console.log('Status do pedido pendente atualizado:', externalReference, '→', status);
  } catch (error) {
    console.error('Erro ao atualizar status do pedido pendente:', error);
    throw error;
  }
}

/**
 * Atualiza pedido pendente com dados do Mercado Pago
 */
export async function updatePendingOrderWithMercadoPagoData(
  externalReference: string,
  mercadoPagoPreferenceId: string,
  paymentLinkUrl: string
): Promise<void> {
  try {
    const pendingOrder = await getPendingOrderByReference(externalReference);

    if (!pendingOrder || !(pendingOrder as any)._id) {
      throw new Error('Pedido pendente não encontrado');
    }

    const docRef = doc(db, PENDING_ORDERS_COLLECTION, (pendingOrder as any)._id);
    await updateDoc(docRef, {
      mercadoPagoPreferenceId,
      paymentLinkUrl
    });

    console.log('Pedido pendente atualizado com dados do Mercado Pago:', externalReference);
  } catch (error) {
    console.error('Erro ao atualizar pedido pendente:', error);
    throw error;
  }
}

/**
 * Deleta um pedido pendente
 */
export async function deletePendingOrder(externalReference: string): Promise<void> {
  try {
    const pendingOrder = await getPendingOrderByReference(externalReference);

    if (!pendingOrder || !(pendingOrder as any)._id) {
      console.log('Pedido pendente não encontrado para deletar:', externalReference);
      return;
    }

    const docRef = doc(db, PENDING_ORDERS_COLLECTION, (pendingOrder as any)._id);
    await deleteDoc(docRef);
    console.log('Pedido pendente deletado:', externalReference);
  } catch (error) {
    console.error('Erro ao deletar pedido pendente:', error);
    throw error;
  }
}

/**
 * Busca pedidos pendentes expirados
 */
export async function getExpiredPendingOrders(): Promise<PendingOrder[]> {
  try {
    const now = Timestamp.now();
    const pendingOrdersRef = collection(db, PENDING_ORDERS_COLLECTION);
    const q = query(
      pendingOrdersRef,
      where('status', '==', 'pending'),
      where('expiresAt', '<=', now)
    );

    const querySnapshot = await getDocs(q);
    const expiredOrders: PendingOrder[] = [];

    querySnapshot.forEach((doc) => {
      expiredOrders.push({ ...doc.data() as PendingOrder, _id: doc.id } as any);
    });

    console.log(`Encontrados ${expiredOrders.length} pedidos pendentes expirados`);
    return expiredOrders;
  } catch (error) {
    console.error('Erro ao buscar pedidos expirados:', error);
    throw error;
  }
}
