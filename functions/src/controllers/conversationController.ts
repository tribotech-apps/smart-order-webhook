import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  getDoc,
} from 'firebase/firestore';
import { Conversation } from '../types/Conversation';
import { notifyAdmin } from '../services/messagingService';

// Função para buscar o documento mais recente
export const getRecentConversation = async (phoneNumber: string, storeId: string): Promise<Conversation | undefined> => {
  const db = getFirestore();
  const conversationsRef = collection(db, 'Conversations'); // Substitua 'conversations' pelo nome da sua coleção
  // console.log('Buscando conversa mais recente para o número:', phoneNumber, storeId);
  // Calcular a data/hora atual menos 5 minutos
  const minutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  // Verificar se o número de telefone não contém o símbolo '+', adicionando-o se necessário
  if (!phoneNumber.startsWith('+')) {
    // console.log(`Número de telefone ajustado para incluir '+': ${phoneNumber}`);
    phoneNumber = `+${phoneNumber}`;
  }

  // console.log('Customer Phone Number:', phoneNumber);

  // Criar a query para buscar o documento mais recente
  const q = query(
    conversationsRef,
    where('phoneNumber', '==', phoneNumber),
    where('date', '>=', minutesAgo),
    where('store._id', '==', storeId),
    orderBy('date', 'desc'),
    limit(1)
  );

  // Executar a query
  const querySnapshot = await getDocs(q);

  // Retornar o documento mais recente, se existir
  if (!querySnapshot.empty) {
    const doc = querySnapshot.docs[0];
    console.log('Documento encontrado:', doc.id, '=>', doc.data());
    return { ...(doc.data() as Conversation), docId: doc.id, date: doc.data().date.toDate() };
  }

  return undefined;
};

export const getConversationByDocId = async (docId: string): Promise<Conversation | null> => {
  const db = getFirestore();

  try {
    // Acessar diretamente o documento pelo docId (que é o externalReference)
    const conversationDocRef = doc(db, 'Conversations', docId);
    const conversationDoc = await getDoc(conversationDocRef);

    // Verificar se o documento existe
    if (conversationDoc.exists()) {
      return { ...(conversationDoc.data() as Conversation), docId: conversationDoc.id, date: conversationDoc.data().date.toDate() };
    } else {
      notifyAdmin(`Nenhuma conversa encontrada para o docId: ${docId}`);
      return null;
    }
  } catch (error) {
    notifyAdmin('Erro ao buscar conversa pelo docId:', error);
    throw new Error('Erro ao buscar conversa pelo docId.');
  }
};

export const getConversationByFlowToken = async (flowToken: string): Promise<Conversation | null> => {
  const db = getFirestore();
  const conversationsRef = collection(db, 'Conversations'); // Substitua 'conversations' pelo nome da sua coleção
  console.log('Buscando conversa mais recente para o flow token:', flowToken);
  // Calcular a data/hora atual menos 5 minutos
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);


  // Criar a query para buscar o documento mais recente
  const q = query(
    conversationsRef,
    where('flowToken', '==', flowToken),
    where('date', '>=', tenMinutesAgo),
    orderBy('date', 'desc'),
    limit(1)
  );

  // Executar a query
  const querySnapshot = await getDocs(q);

  // Retornar o documento mais recente, se existir
  if (!querySnapshot.empty) {
    const doc = querySnapshot.docs[0];
    console.log('Documento encontrado:', doc.id, '=>', doc.data());
    return { ...(doc.data() as Conversation), docId: doc.id, date: doc.data().date.toDate() };
  }

  return null;
};

export const createConversation = async (conversation: Conversation): Promise<string> => {
  const db = getFirestore();
  const conversationsRef = collection(db, 'Conversations'); // Substitua 'conversations' pelo nome da sua coleção

  // Verificar se o número de telefone não contém o símbolo '+', adicionando-o se necessário
  if (!conversation.phoneNumber.startsWith('+')) {
    // console.log(`Número de telefone ajustado para incluir '+': ${conversation.phoneNumber}`);
    conversation.phoneNumber = `+${conversation.phoneNumber}`;
  }

  try {
    const docRef = await addDoc(conversationsRef, conversation);
    // console.log('Documento criado com ID:', docRef.id);
    return docRef.id; // Retorna o ID do documento criado
  } catch (error) {
    notifyAdmin('Erro ao criar conversa:', error);
    throw new Error('Erro ao criar conversa');
  }
};

export const updateConversation = async (currentConversation: Conversation, updates: Partial<Conversation>): Promise<Conversation> => {
  const db = getFirestore();
  if (!currentConversation.docId) {
    notifyAdmin('Erro ao atualizar conversa: docId não encontrado');
    throw new Error('Erro ao atualizar conversa: docId não encontrado');
  }

  const conversationDocRef = doc(db, 'Conversations', currentConversation?.docId);

  try {
    // Função para remover campos undefined (Firestore não aceita undefined)
    const removeUndefined = (obj: any): any => {
      if (obj === null || obj === undefined) {
        return null;
      }

      if (Array.isArray(obj)) {
        return obj.map(removeUndefined);
      }

      if (typeof obj === 'object') {
        const cleaned: any = {};
        for (const key in obj) {
          if (obj[key] !== undefined) {
            cleaned[key] = removeUndefined(obj[key]);
          }
        }
        return cleaned;
      }

      return obj;
    };

    // Limpar undefined dos updates e adicionar o campo `date`
    const cleanedUpdates = removeUndefined(updates);
    const updatesWithDate = {
      ...cleanedUpdates,
      date: new Date(), // Atualiza o campo `date` com a data/hora atual
    };

    console.log('Atualizando conversa com dados limpos:', updatesWithDate);
    await updateDoc(conversationDocRef, updatesWithDate);

    // atualizar currentConversation com os novos dados
    // Atualizar as propriedades do objeto diretamente
    Object.assign(currentConversation, updatesWithDate);

    console.log('Documento atualizado com sucesso:', currentConversation);
    return currentConversation;
  } catch (error) {
    notifyAdmin('Erro ao atualizar conversa:', error);
    throw new Error('Erro ao atualizar conversa');
  }
};

/**
 * Exclui uma conversa do Firestore.
 * @param docId ID do documento da conversa.
 */
export const deleteConversation = async (docId: string): Promise<void> => {
  const db = getFirestore();

  try {
    const conversationDocRef = doc(db, 'Conversations', docId);
    await deleteDoc(conversationDocRef);
    // console.log(`Conversa com ID ${docId} excluída com sucesso.`);
  } catch (error) {
    notifyAdmin(`Erro ao excluir a conversa com ID ${docId}:`, error);
    throw new Error('Erro ao excluir a conversa.');
  }
};