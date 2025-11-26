"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config.js");
const express_1 = __importDefault(require("express"));
const twilio_1 = __importDefault(require("twilio"));
const userController_1 = require("../controllers/userController");
const ordersController_1 = require("../controllers/ordersController");
const router = express_1.default.Router();
const storeSlug = 'terracota';
const client = (0, twilio_1.default)(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
// const MessagingResponse = twilio.twiml.MessagingResponse;
router.post('/sendOrderConfirmation', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('--------------------------------------sendOrderConfirmation--------------------------------------');
    console.log(req.body.to);
    const to = req.body.to || '5511910970283';
    // Send welcome template
    const message = yield client.messages.create({
        contentSid: "HXa351462585b9af444a7cc97eaac42685",
        // contentVariables: JSON.stringify({ 1: "Name" }),
        from: process.env.WABA_PHONE_NUMBER,
        to: `whatsapp:+${req.body.to}`,
    }).then(message => {
        console.log('MESSAGE SENT', message);
        res.send(message);
    })
        .catch((error) => {
        // TODO: handle
        console.log('Twilio Error:', error);
        res.send(JSON.stringify(error));
    });
}));
router.post('/sendOrderProduction', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('--------------------------------------sendOrderProduction--------------------------------------');
    console.log(req.body);
    // Send welcome template
    client.messages.create({
        from: "whatsapp:+5514998157619",
        to: 'whatsapp:+5511910970283',
        body: "Pedido confirmado !" +
            "Seu pedido foi confirmado e está sendo preparado para levar até você etc e tal",
        // messagingServiceSid: "MGfe6dae00a40201c79cd4f01a8a1e0362",
    }).then(message => res.send(message))
        .catch((error) => {
        // TODO: handle
        console.log('Twilio Error:', error);
        res.send(JSON.stringify(error));
    });
}));
router.post('/sendOrderDeliveryRoute', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('--------------------------------------sendOrderDeliveryRoute--------------------------------------');
    console.log(req.body);
    // Send welcome template
    client.messages.create({
        from: "whatsapp:+5514998157619",
        to: 'whatsapp:+5511910970283',
        body: "Pedido em rota de entrega !" +
            "Seu pedido saiu para a entrega e está sendo levado até voce.",
        // messagingServiceSid: "MGfe6dae00a40201c79cd4f01a8a1e0362",
    }).then(message => res.send(message))
        .catch((error) => {
        // TODO: handle
        console.log('Twilio Error:', error);
        res.send(JSON.stringify(error));
    });
}));
router.post('/sendOrderDelivered', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('--------------------------------------sendOrderDelivered--------------------------------------');
    console.log(req.body);
    // Send welcome template
    client.messages.create({
        // contentSid: "HXbb102802efc505580407e37984022224",
        // contentVariables: JSON.stringify({ 1: userName }),
        from: "whatsapp:+5514998157619",
        to: 'whatsapp:+5511910970283',
        body: "Pedido entregue!" +
            "Seu pedido foi entregue.",
        // messagingServiceSid: "MGfe6dae00a40201c79cd4f01a8a1e0362",
    }).then(message => res.send(message))
        .catch((error) => {
        // TODO: handle
        console.log('Twilio Error:', error);
        res.send(JSON.stringify(error));
    });
}));
router.post('/receiveMessage', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('--------------------------------------RECEIVE--------------------------------------');
    console.log(req.body);
    const { ProfileName, To, From } = req.body;
    // First message
    if (req.body.MessageType === 'text') {
        // Check store staus
        const store = yield (0, userController_1.getStore)(storeSlug);
        if (!store) {
            // TODO: handle
            return;
        }
        const status = (0, userController_1.getStoreStatus)(store);
        if (status === 'FECHADA') {
            client.messages.create({
                // contentSid: "HXbb102802efc505580407e37984022224",
                // contentVariables: JSON.stringify({ 1: userName }),
                from: To,
                to: From,
                body: `Olá. ${ProfileName}` +
                    "A loja está fechada no momento, nosso horario de atendimento é...",
                // messagingServiceSid: "MGfe6dae00a40201c79cd4f01a8a1e0362",
            }).then(message => res.send(message))
                .catch((error) => {
                // TODO: handle
                console.log('Error ---->', error);
                res.send(JSON.stringify(error));
            });
            return;
        }
        // Check if user is already registered by phone 
        const appUser = yield (0, userController_1.getUserByPhone)({ phone: `${req.body.WaId}` });
        const userName = appUser ? appUser.name : 'visitante';
        // If appUser, check if there is pendent orders 
        if (appUser === null || appUser === void 0 ? void 0 : appUser.uid) {
            const userOrders = yield (0, ordersController_1.getUserPendingOrders)({ uid: appUser.uid });
            console.log('Achou usuario');
            if (userOrders === null || userOrders === void 0 ? void 0 : userOrders.length) {
                // Check if order is late
                // if late => send buttons to cancel or ask for new deadline
                // if not late => send message informning it can be canceled after be late
                // Send welcome template
                client.messages.create({
                    // contentSid: "HXbb102802efc505580407e37984022224",
                    // contentVariables: JSON.stringify({ 1: userName }),
                    from: To,
                    to: From,
                    body: `Voce possui os pedidos em andamento: ${userOrders.map(order => {
                        return `Pedido: ${order.id} - ${order.currentFlow.flowId === 1 ? 'Aguardando Confirmação' : order.currentFlow.flowId === 2 ? 'Em Preparaçãp' : 'Em Rota de Entrega'}`;
                    })}`,
                    // messagingServiceSid: "MGfe6dae00a40201c79cd4f01a8a1e0362",
                }).then(message => res.send(message))
                    .catch((error) => {
                    // TODO: handle
                    console.log('Error ---->', error);
                    res.send(JSON.stringify(error));
                });
                console.log('EXISTE PEDIDO EM ANDAMENTO');
            }
            else {
                console.log('NAO EXISTE PEDIDO EM ANDAMENTO');
                // Send welcome template
                client.messages.create({
                    // contentSid: "HXbb102802efc505580407e37984022224",
                    // contentVariables: JSON.stringify({ 1: userName }),
                    from: To,
                    to: From,
                    body: `Olá ${userName}, agradecemos sua visita.` +
                        "Para compras online, acesse nosso catálogo https://talkcommerce-2c6e6.firebaseapp.com/terracota",
                    // messagingServiceSid: "MGfe6dae00a40201c79cd4f01a8a1e0362",
                }).then(message => res.send(message))
                    .catch((error) => {
                    // TODO: handle
                    console.log('Error ---->', error);
                    res.send(JSON.stringify(error));
                });
            }
        }
        else {
            // Send welcome template
            client.messages.create({
                // contentSid: "HXbb102802efc505580407e37984022224",
                // contentVariables: JSON.stringify({ 1: userName }),
                from: To,
                to: From,
                body: `Olá ${userName}, agradecemos sua visita.` +
                    "Para compras online, acesse nosso catálogo https://talkcommerce-2c6e6.firebaseapp.com/terracota",
                // messagingServiceSid: "MGfe6dae00a40201c79cd4f01a8a1e0362",
            }).then(message => res.send(message))
                .catch((error) => {
                // TODO: handle
                console.log('Error ---->', error);
                res.send(JSON.stringify(error));
            });
        }
    }
}));
router.post('/callbackMessage', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('--------------------------------------CALLBACK--------------------------------------');
    console.log('Callback: ', req.body);
}));
// const MessagingResponse = twilio.twiml.MessagingResponse;
router.post('/newOrderIncoming', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('--------------------------------------newOrderIncoming--------------------------------------');
    console.log(req.body);
    // client.messages.create({
    //   from: process.env.WABA_PHONE_NUMBER,
    //   to: `whatsapp:${req.body.to}`,
    //   body: "Novo Pedido." +
    //     "Chegou um novo pedido.",
    //   messagingServiceSid: "MGfe6dae00a40201c79cd4f01a8a1e0362",
    // }).then(message => res.send(message))
    //   .catch((error) => {
    //     // TODO: handle
    //     res.send(JSON.stringify(error))
    //   });
    client.messages
        .create({
        body: 'Chegou um novo pedido.',
        messagingServiceSid: 'MGfe6dae00a40201c79cd4f01a8a1e0362',
        to: req.body.to
    })
        .then(message => console.log(message.sid));
}));
exports.default = router;
