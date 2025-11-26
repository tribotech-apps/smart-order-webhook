"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTotalAditionalsItem = exports.getTotalOrderItem = exports.getTotalOrder = exports.getActiveOrder = exports.createOrder = exports.getUserPendingOrders = void 0;
const firebase_1 = __importDefault(require("../firebase"));
const firestore_1 = require("firebase/firestore");
const Order_1 = require("../types/Order");
const userController_1 = require("../controllers/userController");
const storeController_1 = require("./storeController");
const messagingService_1 = require("../services/messagingService");
const orderAlertScheduler_1 = require("../services/orderAlertScheduler");
const db = (0, firestore_1.getFirestore)(firebase_1.default);
const getUserPendingOrders = async ({ uid }) => {
    try {
        const ordersRef = (0, firestore_1.collection)(db, "Orders");
        const ordersQuery = (0, firestore_1.query)(ordersRef, (0, firestore_1.where)("uid", "==", uid));
        const querySnapshot = await (0, firestore_1.getDocs)(ordersQuery);
        if (!querySnapshot || !querySnapshot.size) {
            return [];
        }
        const response = [];
        querySnapshot.forEach((doc) => {
            const orderData = doc.data();
            if (orderData.currentFlow.flowId < 4)
                response.push({ ...orderData });
        });
        return response;
    }
    catch (error) {
        // TODO: handle
        return [];
    }
};
exports.getUserPendingOrders = getUserPendingOrders;
/**
 * Cria um pedido no Firestore, garantindo que o usuário exista.
 * @param conversation Dados da conversa.
 * @param paymentId ID do pagamento gerado (ex.: ID do Pagar.me).
 */
const createOrder = async (conversation, paymentId) => {
    try {
        if (!conversation.store?.slug?.trim()) {
            // TODO: handle
            // If store is not found, we need to handle this case
            (0, messagingService_1.notifyAdmin)('Store parameter is missing');
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
        const userUid = await (0, userController_1.ensureUserExists)(conversation.customerName, conversation.phoneNumber, conversation.address);
        console.log('Usuário garantido. Prosseguindo com a criação do pedido.');
        // Get store
        const store = await (0, storeController_1.getStore)(conversation.store.slug.trim());
        if (!store) {
            // TODO: handle
            (0, messagingService_1.notifyAdmin)('Loja não encontrada');
            throw new Error('Loja não encontrada.');
        }
        // Criar o pedido no Firestore
        const order = {
            id: `${store?.slug}-${(new Date().getUTCMilliseconds() + Math.floor(Math.random() * 100000)).toFixed(0).toString()}`,
            uid: userUid,
            deliveryOption: 'DELIVERY',
            address: conversation.address,
            currentFlow: { hour: firestore_1.Timestamp.now(), flowId: Order_1.OrderFlow.QUEUE },
            customerName: conversation.customerName,
            deliveryPrice: conversation.deliveryPrice || 0,
            createdAt: firestore_1.Timestamp.now(),
            items: conversation.cartItems?.map((item, index) => ({
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
            workflow: [{ flowId: Order_1.OrderFlow.QUEUE, minutes: 0 }],
            printed: false,
            paymentId: paymentId,
        };
        console.log('Pedido para ser criado:', order);
        const docRef = await (0, firestore_1.addDoc)((0, firestore_1.collection)(db, 'Orders'), order);
        const orderId = docRef.id;
        console.log('Pedido criado com sucesso no Firestore:', order);
        // Agendar alertas do estágio 1 (fila) usando Firebase Scheduler
        console.log(`🔔 PREPARING TO SCHEDULE ALERTS - orderId: ${orderId}, storeId: ${store._id}, rowTime: ${store.rowTime}`);
        if (store && order.createdAt) {
            console.log(`🚀 CALLING OrderAlertScheduler.scheduleStageAlerts...`);
            await orderAlertScheduler_1.OrderAlertScheduler.scheduleStageAlerts(order.id, 1, store._id, order.createdAt.toDate(), store.rowTime);
            console.log(`✅ scheduleStageAlerts call completed for pedido ${orderId}`);
            // Enviar notificações WhatsApp quando pedido for criado (estágio 1)
            console.log(`📱 CALLING OrderAlertScheduler.handleStageChange for WhatsApp notifications...`);
            await orderAlertScheduler_1.OrderAlertScheduler.handleStageChange(order.id, 1, store._id, order.createdAt.toDate());
            console.log(`✅ handleStageChange call completed for pedido ${orderId}`);
        }
        else {
            console.log(`❌ NOT SCHEDULING ALERTS - store: ${!!store}, createdAt: ${!!order.createdAt}`);
        }
        return { ...order, _id: orderId };
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao criar pedido:', error.message);
        throw new Error('Erro ao criar pedido.');
    }
};
exports.createOrder = createOrder;
const getActiveOrder = async (phoneNumber, storeId) => {
    try {
        // Garante que o número de telefone tenha o simbolo + no  inicio
        if (!phoneNumber.startsWith('+')) {
            phoneNumber = `+${phoneNumber}`;
        }
        console.log('getActiveOrder', phoneNumber, storeId, typeof storeId);
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Define o início do dia
        const ordersRef = (0, firestore_1.collection)(db, 'Orders');
        const ordersQuery = (0, firestore_1.query)(ordersRef, (0, firestore_1.where)('storeId', '==', storeId.toString()), (0, firestore_1.where)('phoneNumber', '==', phoneNumber), (0, firestore_1.where)('currentFlow.flowId', '<', 4) // Verifica se o flowId é menor que 4
        );
        const ordersSnapshot = await (0, firestore_1.getDocs)(ordersQuery);
        console.log('Ordens ativas encontradas:', ordersSnapshot.size, phoneNumber);
        if (ordersSnapshot.empty) {
            console.log('Nenhuma ordem ativa encontrada para o cliente.');
            return null;
        }
        // Filtrar ordens criadas no mesmo dia
        const activeOrder = ordersSnapshot.docs
            .map((doc) => doc.data())
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
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao buscar ordem ativa:', error);
        return null;
    }
};
exports.getActiveOrder = getActiveOrder;
const getTotalOrder = (orderItems) => {
    if (!orderItems?.length)
        return 0;
    let total = 0;
    orderItems.forEach((item) => {
        // total = total + (item.price * item.quantity)
        let totalAditionals = 0;
        item.questions?.forEach((question) => {
            question.answers?.forEach((answer) => {
                if (answer.price && answer.quantity) {
                    totalAditionals = totalAditionals + (answer.price * answer.quantity);
                }
            });
        });
        total = total + ((item.price + totalAditionals) * item.quantity);
    });
    return total;
};
exports.getTotalOrder = getTotalOrder;
const getTotalOrderItem = (item) => {
    let total = 0;
    let totalAditionals = 0;
    item.questions?.forEach((question) => {
        question.answers?.forEach((answer) => {
            if (answer.price && answer.quantity) {
                // console.log(answer)
                totalAditionals = totalAditionals + (answer.price * answer.quantity);
            }
        });
    });
    total = total + ((item.price + totalAditionals) * item.quantity);
    return total;
};
exports.getTotalOrderItem = getTotalOrderItem;
const getTotalAditionalsItem = (item) => {
    let totalAditionals = 0;
    item.questions?.forEach((question) => {
        question.answers?.forEach((answer) => {
            if (answer.price && answer.quantity) {
                totalAditionals = totalAditionals + (answer.price * answer.quantity);
            }
        });
    });
    return totalAditionals;
};
exports.getTotalAditionalsItem = getTotalAditionalsItem;
