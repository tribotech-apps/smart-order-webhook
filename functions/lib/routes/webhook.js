"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config.js");
const express_1 = __importDefault(require("express"));
const twilio_1 = __importDefault(require("twilio"));
const userController_1 = require("../controllers/userController");
const ordersController_1 = require("../controllers/ordersController");
const cors_1 = __importDefault(require("cors"));
const storeController_1 = require("../controllers/storeController");
const conversationController_1 = require("../controllers/conversationController");
const logger_1 = require("firebase-functions/logger");
require("firebase-functions/logger/compat");
const whatsappApiUrl = 'https://graph.facebook.com/v15.0'; // Replace with the correct API URL if different
// import * as functions from 'firebase-functions';
const router = express_1.default.Router();
router.use((0, cors_1.default)());
const storeSlug = 'terracota';
const TWILIO_SID = process.env.TWILIO_SID || '';
const TWILIO_TOKEN = process.env.TWILIO_TOKEN || '';
const client = (0, twilio_1.default)(TWILIO_SID, TWILIO_TOKEN);
const sendWelcomeMessage = async (from, to, userName) => {
    // Welcome template
    return await client.messages.create({
        from: 'whatsapp:+14155238886',
        contentSid: 'HX350d429d32e64a552466cafecbe95f3c',
        // contentVariables: '{"1":"12/1","2":"3pm"}',
        to: 'whatsapp:+5511910970283'
    });
};
// const MessagingResponse = twilio.twiml.MessagingResponse;
router.post('/sendOrderConfirmation', async (req, res) => {
    console.log('--------------------------------------sendOrderConfirmation--------------------------------------');
    console.log(req.body.to);
    const to = req.body.to || '5511910970283';
    // Send welcome template
    const message = await client.messages.create({
        contentSid: "HX99f7aa8812a3db4b8c5bfbb3c7e3c25a",
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
});
router.post('/sendOrderProduction', async (req, res) => {
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
});
router.post('/sendOrderDeliveryRoute', async (req, res) => {
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
});
router.post('/sendOrderDelivered', async (req, res) => {
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
});
router.post('/receiveMessage', async (req, res) => {
    console.log('--------------------------------------RECEIVE--------------------------------------');
    console.log(req.body.MessageType, req.body);
    if (!req.body) {
        console.log('No body');
        res.send('No body');
        return;
    }
    // Get products by category
    const store = await (0, userController_1.getStore)('terracota');
    if (!store) {
        // TODO: handle
        // If store is not found, we need to handle this case
        console.log('STORE NOT FOUND');
        return;
    }
    const { ProfileName, To, From } = req.body;
    if (!ProfileName || !To || !From) {
        console.log('No From');
        res.send('No From');
        return;
    }
    const currentConversation = await (0, conversationController_1.getRecentConversation)(From);
    if (!currentConversation) {
        // --------------------------------- FIRST MESSAGE ---------------------------------- //
        if (req.body.MessageType !== 'text') {
            // TODO: handle
            console.log('First message not text');
            console.log('currentConversation', currentConversation);
            return;
        }
        console.log('FIRST TEXT MESSAGE RECEIVED', currentConversation);
        // Check store staus
        const store = await (0, userController_1.getStore)(storeSlug);
        if (!store) {
            // TODO: handle
            return;
        }
        const status = (0, userController_1.getStoreStatus)(store);
        if (status === 'FECHADA') {
            try {
                const message = await client.messages.create({
                    // contentSid: "HXbb102802efc505580407e37984022224",
                    // contentVariables: JSON.stringify({ 1: userName }),
                    from: To,
                    to: From,
                    body: `Olá. ${ProfileName}` +
                        "A loja está fechada no momento, nosso horario de atendimento é...",
                    // messagingServiceSid: "MGfe6dae00a40201c79cd4f01a8a1e0362",
                });
                res.send(message);
            }
            catch (error) {
                // TODO: handle
                console.log('Error ---->', error);
                res.send(JSON.stringify(error));
                return;
            }
        }
        // Start new conversation
        const newConversation = {
            date: new Date(),
            phoneNumber: From,
            // waitingForAnswer: false,
            flow: 'MENU',
        };
        await (0, conversationController_1.createConversation)(newConversation);
        // Check if user is already registered by phone 
        const appUser = await (0, userController_1.getUserByPhone)({ phone: `${req.body.WaId}` });
        const userName = appUser ? appUser.name : 'visitante';
        if (!appUser?.uid) {
            // User not registered - send welcome template
            try {
                const responseMessage = sendWelcomeMessage(From, To, userName);
                res.send(responseMessage);
            }
            catch (error) {
                // TODO: handle
                res.send(JSON.stringify(error));
                console.log('Error ---->', error);
                return;
            }
        }
        else {
            // User registered, check if there is pendent orders 
            const userOrders = await (0, ordersController_1.getUserPendingOrders)({ uid: appUser.uid });
            if (userOrders?.length) {
                // No pending orders, send welcome template
                try {
                    const responseMessage = client.messages.create({
                        from: To,
                        to: From,
                        body: `Voce possui o pedido em andamento: ${userOrders.map(order => {
                            return `Pedido: ${order.id} - ${order.currentFlow.flowId === 1 ? 'Aguardando Confirmação' : order.currentFlow.flowId === 2 ? 'Em Preparaçãp' : 'Em Rota de Entrega'}`;
                        })}`,
                        // messagingServiceSid: "MGfe6dae00a40201c79cd4f01a8a1e0362",
                    });
                    res.send(responseMessage);
                }
                catch (error) {
                    // TODO: handle
                    console.log('Error ---->', error);
                    res.send(JSON.stringify(error));
                }
                ;
            }
            else {
                // No pending orders, send welcome template
                try {
                    const responseMessage = sendWelcomeMessage(To, From, userName);
                    res.send(responseMessage);
                }
                catch (error) {
                    // TODO: handle
                    console.log('Error ---->', error);
                    res.send(JSON.stringify(error));
                }
                console.log('THERE ARE NO PENDING ORDERS');
            }
        }
    }
    else {
        // --------------------------------- RESPONSE MESSAGE ---------------------------------- //
        switch (req.body.MessageType) {
            case 'text':
                console.log('TEXT MESSAGE');
                // User is waiting for an answer
                // if (currentConversation?.waitingForAnswer) {
                // check current flow
                switch (currentConversation.flow) {
                    case 'MENU':
                        // TODO: handle
                        // We are waiting for a button at this point, if user sends a text, we won't handle
                        try {
                            const responseMessage = sendWelcomeMessage(To, From, '');
                            res.send(responseMessage);
                        }
                        catch (error) {
                            // TODO: handle
                            console.log('Error ---->', error);
                            res.send(JSON.stringify(error));
                        }
                        break;
                    case 'CATEGORIES':
                        // Check if user selected a valid category
                        const categoryId = parseInt(req.body.Body);
                        console.log('SENT CATEGORY ID:', categoryId);
                        const categories = await (0, storeController_1.getStoreCategories)();
                        if (!categories?.length) {
                            // TODO: handle
                            // If categories are not found, we need to handle this case
                            console.log('CATEGORIES NOT FOUND');
                            return;
                        }
                        // Check if categoryId is numeric and valid
                        if (isNaN(categoryId) || categoryId < 1 || categoryId > categories.length) {
                            console.log('INVALID CATEGORY ID');
                            try {
                                const responseMessage = await client.messages.create({
                                    from: 'whatsapp:+14155238886',
                                    to: 'whatsapp:+5511910970283',
                                    body: 'Por favor, selecione uma categoria válida. \n' +
                                        categories
                                            .map((category, index) => {
                                            return `${(index + 1).toString()} - ${category.categoryName} \n`;
                                        })
                                });
                                res.send(responseMessage);
                            }
                            catch (error) {
                                // TODO: handle
                                console.log('Twilio Error:', error);
                                res.send(JSON.stringify(error));
                            }
                            ;
                            return;
                        }
                        // CategoryId is valid, we can proceed
                        console.log('VALID CATEGORY ID');
                        // Update conversations categoryId
                        if (currentConversation?.docId) {
                            currentConversation.categoryId = categoryId;
                            await (0, conversationController_1.updateConversation)(currentConversation.docId, currentConversation);
                        }
                        const currentCategoryId = categories[categoryId - 1].categoryId;
                        console.log('CURRENT CATEGORY ID:', currentCategoryId);
                        const products = store.menu.filter(item => item.categoryId === currentCategoryId);
                        console.log('PRODUCTS:', products);
                        let message = '0 - Selecionar outra categoria. \n';
                        products?.map((product, index) => {
                            message = `${message} ${(index + 1).toString()} - ${product.menuName}- ${product.price.toFixed(2)} \n`;
                        });
                        try {
                            const responseMessage = client.messages.create({
                                from: 'whatsapp:+14155238886',
                                to: 'whatsapp:+5511910970283',
                                body: message,
                            });
                            // Update conversations
                            if (currentConversation?.docId) {
                                currentConversation.flow = 'PRODUCTS';
                                await (0, conversationController_1.updateConversation)(currentConversation.docId, currentConversation);
                            }
                            res.send(responseMessage);
                        }
                        catch (e) {
                            console.log('Twilio Error:', e);
                            res.send(JSON.stringify(e));
                        }
                        break;
                    case 'PRODUCTS':
                        console.log('PRODUCTS');
                        if (!store.menu?.length) {
                            // TODO: handle
                            // If product are not found, we need to handle this case
                            console.log('NO PRODUCTS WAS FOUND IN DATABSE');
                            return;
                        }
                        // get cagegoryId from currentConversation
                        const categoryIdFromConversartion = currentConversation.categoryId;
                        if (!categoryIdFromConversartion) {
                            // TODO: if there is no categoryId, we  zneed to handle this case
                            console.log('NO CATEGORY ID FOUND IN CONVERSATIONS - BUG');
                            return;
                        }
                        console.log('CATEGORY ID:', categoryIdFromConversartion);
                        // get products by categoryId
                        const productId = parseInt(req.body.Body);
                        console.log('SENT PRODUCT ID:', productId);
                        const storeMenu = store.menu.filter(item => item.categoryId === categoryIdFromConversartion);
                        console.log('STORE PRODUCTS:', storeMenu);
                        if (!storeMenu?.length) {
                            // TODO: if there is no products, we need to handle this case
                            console.log('NO PRODUCTS FOUND IN STORE');
                            return;
                        }
                        // Check if product is numeric and valid
                        if (isNaN(productId) || productId < 0) {
                            console.log('INVALID SENT PRODUCT ID');
                            try {
                                const responseMessageProducts = await client.messages.create({
                                    from: 'whatsapp:+14155238886',
                                    to: 'whatsapp:+5511910970283',
                                    body: 'Por favor, selecione um produto válido. \n' +
                                        storeMenu
                                            .map((product, index) => {
                                            return `${(index + 1).toString()} - ${product.menuName} = ${product.price.toFixed(2)} \n`;
                                        })
                                });
                                res.send(responseMessageProducts);
                            }
                            catch (error) {
                                // TODO: handle
                                console.log('Twilio Error:', error);
                                res.send(JSON.stringify(error));
                            }
                            ;
                        }
                        // If product === 0, we need to go back to categories
                        if (productId === 0) {
                            console.log('SELECTING ANOTHER CATEGORY');
                            // Update conversations
                            if (currentConversation?.docId) {
                                currentConversation.flow = 'CATEGORIES';
                                await (0, conversationController_1.updateConversation)(currentConversation.docId, currentConversation);
                            }
                            const categories = await (0, storeController_1.getStoreCategories)();
                            console.log('CATEGORIAS', categories);
                            let message = '';
                            categories.map((category, index) => {
                                message = `${message} ${(index + 1).toString()} - ${category.categoryName} \n`;
                            });
                            console.log('MESSAGE:', message);
                            const createdMessage = await client.messages.create({
                                from: 'whatsapp:+14155238886',
                                to: 'whatsapp:+5511910970283',
                                body: message,
                            });
                            res.send(createdMessage);
                            return;
                        }
                        // We are waiting for a button, we won't handle text messages
                        // reuturn;
                        // Check if product is numeric and valid
                        if (productId > storeMenu.length) {
                            console.log('INVALID SENT PRODUCT ID');
                            try {
                                const responseMessageProducts = await client.messages.create({
                                    from: 'whatsapp:+14155238886',
                                    to: 'whatsapp:+5511910970283',
                                    body: 'Por favor, selecione um produto válido. \n' +
                                        '0 - Selecionar outra categoria. \n' +
                                        storeMenu
                                            .map((product, index) => {
                                            return `${(index + 1).toString()} - ${product.menuName} = ${product.price.toFixed(2)} \n`;
                                        })
                                });
                                res.send(responseMessageProducts);
                            }
                            catch (error) {
                                // TODO: handle
                                console.log('Twilio Error:', error);
                                res.send(JSON.stringify(error));
                            }
                            ;
                            return;
                        }
                        // ProductId is valid, we can proceed
                        console.log('VALID PRODUCT ID', storeMenu);
                        const selectedProduct = storeMenu.find(item => item.menuId === productId);
                        console.log('SELECTED PRODUCT:', selectedProduct);
                        // Update conversations categoryId
                        if (currentConversation?.docId) {
                            currentConversation.productId = selectedProduct?.menuId;
                            currentConversation.flow = 'QUANTITY';
                            await (0, conversationController_1.updateConversation)(currentConversation.docId, currentConversation);
                        }
                        try {
                            const responseMessageProducts = await client.messages.create({
                                from: 'whatsapp:+14155238886',
                                to: 'whatsapp:+5511910970283',
                                body: 'Produto Selecionaro. \n' + selectedProduct?.menuName + ' - ' + selectedProduct?.price.toFixed(2) + '\n' +
                                    'Por favor, digite a quantidade desejada.',
                            });
                            res.send(responseMessageProducts);
                        }
                        catch (error) {
                            // TODO: handle
                            console.log('Twilio Error:', error);
                            res.send(JSON.stringify(error));
                        }
                        ;
                        break;
                    case 'QUANTITY':
                        console.log('QUANTITY');
                        break;
                    default:
                        console.log('DEFAULT');
                        break;
                }
                break;
            case 'button':
                console.log('BUTTON MESSAGE');
                const { ButtonText: buttonText } = req.body;
                try {
                    switch (buttonText) {
                        case 'Reschedule':
                            const categories = await (0, storeController_1.getStoreCategories)();
                            console.log('CATEGORIAS', categories);
                            let message = '';
                            categories.map((category, index) => {
                                message = `${message} ${(index + 1).toString()} - ${category.categoryName} \n`;
                            });
                            console.log('MESSAGE:', message);
                            const createdMessage = await client.messages.create({
                                from: 'whatsapp:+14155238886',
                                to: 'whatsapp:+5511910970283',
                                body: message,
                            });
                            // Update conversations
                            if (currentConversation?.docId) {
                                currentConversation.flow = 'CATEGORIES';
                                await (0, conversationController_1.updateConversation)(currentConversation.docId, currentConversation);
                            }
                            res.send(createdMessage);
                            break;
                        case 'Confirm':
                            console.log('Chama Confirmar Pedido');
                            break;
                    }
                }
                catch (error) {
                    console.log('Error --->', error);
                }
                // } else if (req.body.MessageType === 'location') {
                //   console.log('LOCATION PRESSED')
                //   console.log(req.body)
                // }
                // else if (req.body.MessageType === 'interactive') {
                //   console.log('INTERACTIVE PRESSED')
                //   console.log(req.body)
                // }
                // else if (req.body.MessageType === 'status') {
                //   console.log('STATUS PRESSED')
                //   console.log(req.body)
                // }
                break;
            case 'location':
                console.log('LOCATION MESSAGE');
                break;
            case 'interactive':
                console.log('INTERACTIVE MESSAGE');
                break;
        }
    }
});
router.post('/callbackMessage', async (req, res) => {
    console.log('--------------------------------------CALLBACK--------------------------------------');
    console.log('Callback: ', req.body);
    (0, logger_1.log)('--------------------------------------CALLBACK--------------------------------------');
    (0, logger_1.log)('Callback: ', req.body);
});
// const MessagingResponse = twilio.twiml.MessagingResponse;
router.post('/newOrderIncoming', async (req, res) => {
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
});
exports.default = router;
