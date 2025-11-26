"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteConversation = exports.updateConversation = exports.createConversation = exports.getConversationByFlowToken = exports.getConversationByDocId = exports.getRecentConversation = void 0;
const firestore_1 = require("firebase/firestore");
const messagingService_1 = require("../services/messagingService");
// Função para buscar o documento mais recente
const getRecentConversation = async (phoneNumber, storeId) => {
    const db = (0, firestore_1.getFirestore)();
    const conversationsRef = (0, firestore_1.collection)(db, 'Conversations'); // Substitua 'conversations' pelo nome da sua coleção
    // console.log('Buscando conversa mais recente para o número:', phoneNumber, storeId);
    // Calcular a data/hora atual menos 5 minutos
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    // Verificar se o número de telefone não contém o símbolo '+', adicionando-o se necessário
    if (!phoneNumber.startsWith('+')) {
        // console.log(`Número de telefone ajustado para incluir '+': ${phoneNumber}`);
        phoneNumber = `+${phoneNumber}`;
    }
    // console.log('Customer Phone Number:', phoneNumber);
    // Criar a query para buscar o documento mais recente
    const q = (0, firestore_1.query)(conversationsRef, (0, firestore_1.where)('phoneNumber', '==', phoneNumber), (0, firestore_1.where)('date', '>=', tenMinutesAgo), (0, firestore_1.where)('store._id', '==', storeId), (0, firestore_1.orderBy)('date', 'desc'), (0, firestore_1.limit)(1));
    // Executar a query
    const querySnapshot = await (0, firestore_1.getDocs)(q);
    // Retornar o documento mais recente, se existir
    if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        console.log('Documento encontrado:', doc.id, '=>', doc.data());
        return { ...doc.data(), docId: doc.id, date: doc.data().date.toDate() };
    }
    return undefined;
};
exports.getRecentConversation = getRecentConversation;
const getConversationByDocId = async (docId) => {
    const db = (0, firestore_1.getFirestore)();
    try {
        // Acessar diretamente o documento pelo docId (que é o externalReference)
        const conversationDocRef = (0, firestore_1.doc)(db, 'Conversations', docId);
        const conversationDoc = await (0, firestore_1.getDoc)(conversationDocRef);
        // Verificar se o documento existe
        if (conversationDoc.exists()) {
            return { ...conversationDoc.data(), docId: conversationDoc.id, date: conversationDoc.data().date.toDate() };
        }
        else {
            (0, messagingService_1.notifyAdmin)(`Nenhuma conversa encontrada para o docId: ${docId}`);
            return null;
        }
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao buscar conversa pelo docId:', error);
        throw new Error('Erro ao buscar conversa pelo docId.');
    }
};
exports.getConversationByDocId = getConversationByDocId;
const getConversationByFlowToken = async (flowToken) => {
    const db = (0, firestore_1.getFirestore)();
    const conversationsRef = (0, firestore_1.collection)(db, 'Conversations'); // Substitua 'conversations' pelo nome da sua coleção
    console.log('Buscando conversa mais recente para o flow token:', flowToken);
    // Calcular a data/hora atual menos 5 minutos
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    // Criar a query para buscar o documento mais recente
    const q = (0, firestore_1.query)(conversationsRef, (0, firestore_1.where)('flowToken', '==', flowToken), (0, firestore_1.where)('date', '>=', tenMinutesAgo), (0, firestore_1.orderBy)('date', 'desc'), (0, firestore_1.limit)(1));
    // Executar a query
    const querySnapshot = await (0, firestore_1.getDocs)(q);
    // Retornar o documento mais recente, se existir
    if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        console.log('Documento encontrado:', doc.id, '=>', doc.data());
        return { ...doc.data(), docId: doc.id, date: doc.data().date.toDate() };
    }
    return null;
};
exports.getConversationByFlowToken = getConversationByFlowToken;
const createConversation = async (conversation) => {
    const db = (0, firestore_1.getFirestore)();
    const conversationsRef = (0, firestore_1.collection)(db, 'Conversations'); // Substitua 'conversations' pelo nome da sua coleção
    // Verificar se o número de telefone não contém o símbolo '+', adicionando-o se necessário
    if (!conversation.phoneNumber.startsWith('+')) {
        // console.log(`Número de telefone ajustado para incluir '+': ${conversation.phoneNumber}`);
        conversation.phoneNumber = `+${conversation.phoneNumber}`;
    }
    try {
        const docRef = await (0, firestore_1.addDoc)(conversationsRef, conversation);
        // console.log('Documento criado com ID:', docRef.id);
        return docRef.id; // Retorna o ID do documento criado
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao criar conversa:', error);
        throw new Error('Erro ao criar conversa');
    }
};
exports.createConversation = createConversation;
const updateConversation = async (currentConversation, updates) => {
    const db = (0, firestore_1.getFirestore)();
    if (!currentConversation.docId) {
        (0, messagingService_1.notifyAdmin)('Erro ao atualizar conversa: docId não encontrado');
        throw new Error('Erro ao atualizar conversa: docId não encontrado');
    }
    const conversationDocRef = (0, firestore_1.doc)(db, 'Conversations', currentConversation?.docId);
    try {
        // Adicionar o campo `date` com a data/hora atual
        const updatesWithDate = {
            ...updates,
            date: new Date(), // Atualiza o campo `date` com a data/hora atual
        };
        await (0, firestore_1.updateDoc)(conversationDocRef, updatesWithDate);
        // atualizar currentConversation com os novos dados
        // Atualizar as propriedades do objeto diretamente
        Object.assign(currentConversation, updatesWithDate);
        console.log('Documento atualizado com sucesso:', currentConversation);
        return currentConversation;
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao atualizar conversa:', error);
        throw new Error('Erro ao atualizar conversa');
    }
};
exports.updateConversation = updateConversation;
/**
 * Exclui uma conversa do Firestore.
 * @param docId ID do documento da conversa.
 */
const deleteConversation = async (docId) => {
    const db = (0, firestore_1.getFirestore)();
    try {
        const conversationDocRef = (0, firestore_1.doc)(db, 'Conversations', docId);
        await (0, firestore_1.deleteDoc)(conversationDocRef);
        // console.log(`Conversa com ID ${docId} excluída com sucesso.`);
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)(`Erro ao excluir a conversa com ID ${docId}:`, error);
        throw new Error('Erro ao excluir a conversa.');
    }
};
exports.deleteConversation = deleteConversation;
