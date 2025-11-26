"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertStore = exports.getStoreByWabaPhoneNumberId = exports.getStoreById = exports.getStore = void 0;
exports.getStoreStatus = getStoreStatus;
const firebase_1 = __importDefault(require("../firebase"));
const firestore_1 = require("firebase/firestore");
const luxon_1 = require("luxon");
const messagingService_1 = require("../services/messagingService");
const db = (0, firestore_1.getFirestore)(firebase_1.default);
const getStore = async (slug) => {
    try {
        const storesRef = (0, firestore_1.collection)(db, "Stores");
        console.log('======================================================*', slug);
        const storeQuery = (0, firestore_1.query)(storesRef, (0, firestore_1.where)("slug", "==", slug));
        const querySnapshot = await (0, firestore_1.getDocs)(storeQuery);
        if (!querySnapshot || !querySnapshot.size) {
            return undefined;
        }
        const store = querySnapshot.docs[0].data();
        return store;
    }
    catch (error) {
        // TODO: handle
        return undefined;
    }
};
exports.getStore = getStore;
const getStoreById = async (storeId) => {
    try {
        console.log('🏪 [GET_STORE_BY_ID] Getting store by ID:', storeId);
        const { doc, getDoc } = require('firebase/firestore');
        const storeRef = doc(db, "Stores", storeId);
        const storeDoc = await getDoc(storeRef);
        if (!storeDoc.exists()) {
            console.log('❌ [GET_STORE_BY_ID] Store not found:', storeId);
            return undefined;
        }
        const store = { _id: storeDoc.id, ...storeDoc.data() };
        console.log('✅ [GET_STORE_BY_ID] Store found:', storeId, !!store.wabaEnvironments);
        return store;
    }
    catch (error) {
        console.error('💥 [GET_STORE_BY_ID] Error:', error);
        return undefined;
    }
};
exports.getStoreById = getStoreById;
const getStoreByWabaPhoneNumberId = async (wabaPhoneNumberId) => {
    const storesRef = (0, firestore_1.collection)(db, 'Stores'); // Substitua 'Stores' pelo nome correto da sua coleção
    try {
        // Criar a query para buscar a loja pelo campo WABAEnvironments.wabaPhoneNumberId
        console.log('Buscando loja pelo wabaPhoneNumberId:', wabaPhoneNumberId);
        const q = (0, firestore_1.query)(storesRef, (0, firestore_1.where)('wabaEnvironments.wabaPhoneNumberId', '==', wabaPhoneNumberId));
        const querySnapshot = await (0, firestore_1.getDocs)(q);
        // Verificar se algum documento foi encontrado
        if (!querySnapshot.empty) {
            const doc = querySnapshot.docs[0];
            return { ...doc.data(), _id: doc.id };
        }
        else {
            console.error(`Nenhuma loja encontrada para o wabaPhoneNumberId: ${wabaPhoneNumberId}`);
            return null;
        }
    }
    catch (error) {
        console.error('Erro ao buscar loja pelo wabaPhoneNumberId:', error);
        throw new Error('Erro ao buscar loja pelo wabaPhoneNumberId.');
    }
};
exports.getStoreByWabaPhoneNumberId = getStoreByWabaPhoneNumberId;
function getStatusByHour(openAt, closeAt) {
    const today = luxon_1.DateTime.now().setZone('America/Sao_Paulo');
    console.log('TODAY', today);
    const currentHour = today.hour;
    console.log('currentHour', currentHour);
    const currentMinute = today.minute;
    console.log('currentMinute', currentMinute);
    // console.log(currentHour, currentMinute)
    // console.log(openAt)
    // console.log(closeAt)
    // Current hour between open and close hours
    if (openAt.hour < currentHour && closeAt.hour > currentHour) {
        console.log('1.....Current hour between open and close hours', currentHour, openAt, closeAt);
        return 'ABERTA';
    }
    // Current hour later than close hours
    if (currentHour > closeAt.hour)
        return 'FECHADA';
    // Current hour earlier than close hours
    if (currentHour < openAt.hour)
        return 'FECHADA';
    // Current hour same as open and close hours
    if (currentHour === openAt.hour && currentHour === closeAt.hour) {
        console.log('2.....Current hour same as open and close hours', openAt, closeAt, currentMinute >= openAt.minute && currentMinute <= closeAt.minute ? 'ABERTA' : 'FECHADA');
        return currentMinute >= openAt.minute && currentMinute <= closeAt.minute ? 'ABERTA' : 'FECHADA';
    }
    // Current hour equal only to open hour
    if (currentHour === openAt.hour) {
        console.log('3.....Current hour equal only to open hour', openAt, closeAt);
        return currentMinute >= openAt.minute ? 'ABERTA' : 'FECHADA';
    }
    // Current hour equal only to close hour
    if (currentHour === closeAt.hour) {
        console.log('4.....Current hour equal only to close hour', openAt, closeAt);
        return currentMinute < closeAt.minute ? 'ABERTA' : 'FECHADA';
    }
    // TODO: analytics
    return 'FECHADA';
}
function getStoreStatus(storeDb) {
    if (!storeDb) {
        return 'FECHADA';
    }
    const { closed, opened, closingDays, openingVariations, openAt, closeAt } = storeDb;
    const today = luxon_1.DateTime.now().setZone('America/Sao_Paulo').toJSDate();
    const day = today.getDay();
    const variation = openingVariations?.find(e => e.day === day);
    const openedDate = opened?.toDate();
    const closedDate = closed?.toDate();
    // const openingExceptionDate = openingException?.day.toDate();
    if (openedDate || closedDate) {
        console.log('storeDb', storeDb);
        console.log('openedDate', openedDate);
        // ------ Checking by Day of the Week ------
        openedDate?.setHours(0, 0, 0, 0);
        closedDate?.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        // openingExceptionDate?.setHours(0, 0, 0, 0);
        // Closed Dates Check
        if (closedDate && closedDate?.getDate() === today.getDate())
            return 'FECHADA';
        if (openedDate && openedDate?.getDate() === today.getDate()) {
            console.log('100000000.....', openedDate?.getDate(), today.getDate(), openedDate?.getDate() === today.getDate());
            return 'ABERTA';
        }
    }
    // console.log('3.....')
    // Opening Exceptions Check
    // if (openingException && openingExceptionDate === today) {
    //   const openingdates = { hour: openingException.openAt.hour, minute: openingException.openAt.minute };
    //   const closingdates = { hour: openingException.closeAt.hour, minute: openingException.closeAt.minute }
    //   // console.log('1......')
    //   const exceptionStatus = getStatusByHour(openingdates, closingdates);
    //   // console.log('4.....', openingException, openingdates, closingdates)
    //   return exceptionStatus;
    //   // if (exceptionStatus === 'FECHADA') return 'FECHADA';
    // }
    // console.log('5.....')
    // Closing Days Check
    if (closingDays?.includes(day))
        return 'FECHADA';
    // console.log('6.....')
    // Variations Check
    if (variation) {
        console.log('7......', variation);
        return getStatusByHour(variation.openAt, variation.closeAt);
    }
    // ------ Checking by Hour ------
    // console.log('4......', openAt)
    // console.log('8.....', openAt, closeAt)
    return getStatusByHour(openAt, closeAt);
}
const insertStore = async (req, res) => {
    const storeData = req.body;
    console.log('*************************************************************************');
    console.log(storeData);
    console.log('*************************************************************************');
    try {
        const docRef = (0, firestore_1.doc)(db, 'Stores', storeData.slug);
        console.log('storeData', storeData);
        await (0, firestore_1.setDoc)(docRef, storeData);
        console.log('Documento inserido com sucesso:', docRef.id);
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao inserir documento:', error);
    }
};
exports.insertStore = insertStore;
