"use strict";
// // Variáveis de ambiente
// const WABA_VERIFY_TOKEN = process.env.WABA_VERIFY_TOKEN || '';
// const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
require("dotenv/config.js");
const express_1 = __importDefault(require("express"));
const userController_1 = require("../../controllers/userController");
const storeController_1 = require("../../controllers/storeController");
const cors_1 = __importDefault(require("cors"));
const conversationController_1 = require("../../controllers/conversationController");
require("firebase-functions/logger/compat");
const google_maps_services_js_1 = require("@googlemaps/google-maps-services-js");
const geolocationService_1 = require("../../services/geolocationService");
const geolocationService_2 = require("../../services/geolocationService");
const ordersController_1 = require("../../controllers/ordersController");
const messagingService_1 = require("../../services/messagingService");
const shoppingService_1 = require("../../services/shoppingService");
const addressService_1 = require("../../services/addressService");
const catalogService_1 = require("../../services/catalogService");
const incomingMessageService_1 = require("../../services/incomingMessageService");
const orderService_1 = require("../../services/orderService");
const asaasServce_1 = require("../../services/asaasServce");
const secret_manager_1 = require("@google-cloud/secret-manager");
const clientMaps = new google_maps_services_js_1.Client({});
const client = new secret_manager_1.SecretManagerServiceClient();
// Cache to store address details temporarily
// const addressCache: { [key: string]: { lat: number; lng: number; title: string; description: string, placeId: string } } = {};
const addressCache = {};
const router = express_1.default.Router();
router.use((0, cors_1.default)());
router.use(express_1.default.json()); // Middleware para processar JSON no corpo da requisição
// Variáveis de ambiente
const WABA_VERIFY_TOKEN = process.env.WABA_VERIFY_TOKEN || '';
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
// Função para criptografar o payload
function encryptPayload(payload, aesKey) {
    const key = Buffer.from(aesKey, 'base64'); // Converter chave AES de Base64 para Buffer
    const iv = crypto_1.default.randomBytes(16); // Gerar vetor de inicialização (IV)
    const cipher = crypto_1.default.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(JSON.stringify(payload), 'utf8', 'base64');
    encrypted += cipher.final('base64');
    // Combinar IV e dados criptografados em uma única str  ing Base64
    const encryptedPayload = Buffer.concat([iv, Buffer.from(encrypted, 'base64')]).toString('base64');
    return encryptedPayload;
}
async function getPrivateKey() {
    const [version] = await client.accessSecretVersion({
        name: 'projects/talkcommerce-2c6e6/secrets/talkcommerce_private_key/versions/latest',
    });
    const privateKey = version.payload?.data?.toString();
    if (!privateKey) {
        throw new Error('PRIVATE_KEY is not defined in Secret Manager.');
    }
    return privateKey;
}
// Rota para validar o webhook do Facebook
router.get('/webhook', (req, res) => {
    console.log('--------------------------------------Message received GET--------------------------------------');
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode && token === WABA_VERIFY_TOKEN) {
        res.status(200).send(challenge); // Retorna o hub.challenge para validar o webhook
    }
    else {
        (0, messagingService_1.notifyAdmin)('Falha na validação do webhook');
        res.status(403).send('Forbidden');
    }
});
// Rota para processar mensagens recebidas pelo webhook
router.post('/webhook', async (req, res) => {
    console.log('--------------------------------------Message received POST--------------------------------------');
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
    // Verificar se a requisição é relacionada ao WhatsApp Flows
    const { encrypted_flow_data, encrypted_aes_key, initial_vector } = req.body;
    if (encrypted_flow_data && encrypted_aes_key && initial_vector) {
        try {
            console.log('WhatsApp Flows payload received');
            // Carregar a chave privada do Google Secret Manager
            const privateKey = await getPrivateKey();
            // Descriptografar a chave AES
            const decryptedAesKey = crypto_1.default.privateDecrypt({
                key: crypto_1.default.createPrivateKey(privateKey),
                padding: crypto_1.default.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: 'sha256',
            }, Buffer.from(encrypted_aes_key, 'base64'));
            // Descriptografar os dados do fluxo
            const flowDataBuffer = Buffer.from(encrypted_flow_data, 'base64');
            const initialVectorBuffer = Buffer.from(initial_vector, 'base64');
            const TAG_LENGTH = 16;
            const encrypted_flow_data_body = flowDataBuffer.subarray(0, -TAG_LENGTH);
            const encrypted_flow_data_tag = flowDataBuffer.subarray(-TAG_LENGTH);
            const decipher = crypto_1.default.createDecipheriv('aes-128-gcm', decryptedAesKey, initialVectorBuffer);
            decipher.setAuthTag(encrypted_flow_data_tag);
            const decryptedJSONString = Buffer.concat([
                decipher.update(encrypted_flow_data_body),
                decipher.final(),
            ]).toString('utf-8');
            console.log('Decrypted Flow Data:', decryptedJSONString);
            // Processar os dados do fluxo
            const flowData = JSON.parse(decryptedJSONString);
            const action = flowData.action;
            let responsePayload;
            if (action === 'ping') {
                responsePayload = {
                    data: {
                        status: 'active',
                    },
                };
            }
            else {
                responsePayload = {
                    data: {
                        message: 'Ação não reconhecida.',
                    },
                };
            }
            // Criptografar o payload de resposta usando a chave AES
            const flipped_iv = initialVectorBuffer.map((byte) => ~byte);
            const cipher = crypto_1.default.createCipheriv('aes-128-gcm', decryptedAesKey, Buffer.from(flipped_iv));
            const encryptedResponse = Buffer.concat([
                cipher.update(JSON.stringify(responsePayload), 'utf-8'),
                cipher.final(),
                cipher.getAuthTag(),
            ]).toString('base64');
            console.log('Encrypted Response Payload:', encryptedResponse);
            // Enviar o payload criptografado como resposta
            res.status(200).send(encryptedResponse);
        }
        catch (error) {
            console.error('Erro ao processar WhatsApp Flows payload:', error);
            res.status(500).send('Erro ao processar WhatsApp Flows payload');
        }
        return;
    }
    // Verifica se o corpo da requisição contém o objeto "entry"
    if (!req.body.entry?.length) {
        (0, messagingService_1.notifyAdmin)('Webhook sem entrada');
        res.status(400).send('Bad Request');
        return;
    }
    const phoneNumberId = req.body.entry[0]?.changes?.[0]?.value?.metadata?.phone_number_id; // ID do objeto recebido
    if (!phoneNumberId) {
        (0, messagingService_1.notifyAdmin)('Webhook sem phoneNumberId');
        res.status(400).send('Bad Request');
        return;
    }
    // Buscar a loja pelo campo phoneNumberId
    const store = await (0, storeController_1.getStoreByWabaPhoneNumberId)(phoneNumberId);
    if (!store?.wabaEnvironments) {
        (0, messagingService_1.notifyAdmin)('Loja não encontrada para o phoneNumberId: ' + phoneNumberId);
        res.status(404).send('Loja não encontrada');
        return;
    }
    // Verificar se a requisição é relacionada ao WhatsApp Flows
    const { aes_key, action } = req.body;
    if (aes_key) {
        // Processar requisição de Flows
        let responsePayload;
        console.log('Received action:', action, aes_key);
        if (action === 'ping') {
            responsePayload = {
                screen: "PING_RESPONSE", // Adicione a propriedade 'screen'
                data: {
                    status: 'active',
                },
            };
            console.log('Ping action received, responding with active status');
        }
        else {
            responsePayload = {
                screen: "UNKNOWN_ACTION", // Adicione a propriedade 'screen'
                data: {
                    message: 'Ação não reconhecida.',
                },
            };
            console.log('Action not recognized, responding with default message');
        }
        // Criptografar o payload usando a chave AES recebida
        const encryptedPayload = encryptPayload(responsePayload, aes_key);
        console.log('Encrypted Payload:', encryptedPayload);
        // Enviar o payload criptografado como resposta
        res.status(200).send(encryptedPayload);
        return;
    }
    // Processar mensagens normais do WhatsApp Business API
    try {
        req.body.entry.forEach((entry) => {
            entry.changes.forEach(async (change) => {
                const value = change.value;
                if (value.messages) {
                    const message = value.messages[0];
                    console.log('Received Message:', message);
                    const from = message.from; // Número do remetente
                    const type = message.type; // Tipo da mensagem
                    if (!store?.wabaEnvironments) {
                        (0, messagingService_1.notifyAdmin)('Loja não encontrada para o phoneNumberId: ' + phoneNumberId);
                        res.status(404).send('Loja não encontrada');
                        return;
                    }
                    // Adicione aqui a lógica existente para processar mensagens normais
                    // console.log(`Message received: ${from}: ${text}`, type, message);
                    //**************************************************************************************/
                    // Verifica se a loja está fechada ou aberta
                    //**************************************************************************************/
                    const storeStatus = (0, storeController_1.getStoreStatus)(store);
                    // console.log('Store Status:', store.openAt, store.closeAt, store.closed, store.closingDays, store.openingException, store.openingVariations, storeStatus);
                    if (!storeStatus || storeStatus === 'FECHADA') {
                        // console.log('STORE IS CLOSED!!!');
                        const reply = `Desculpe, a loja está fechada no momento. Por favor, entre em contato mais tarde.`;
                        await (0, messagingService_1.sendMessage)({
                            messaging_product: 'whatsapp',
                            to: '+' + from,
                            type: 'text',
                            text: {
                                body: reply,
                            },
                        }, store.wabaEnvironments);
                        res.status(200).send('Loja fechada');
                        return;
                    }
                    const currentConversation = await (0, conversationController_1.getRecentConversation)(from, store._id);
                    // First text message from user
                    if (!currentConversation?.docId) {
                        await (0, incomingMessageService_1.handleIncomingTextMessage)(from, message, store, res, '');
                        return;
                    }
                    //**************************************************************************************/
                    // TODO: Padronizar a logica, estamos verficando primeiro o fluxo atual,
                    // depois o tipo de mensagem, devmos melhorar a logica
                    //**************************************************************************************/
                    switch (type) {
                        case 'text':
                            let text = message.text.body?.replace(/[^a-zA-Z0-9]/g, '').trim();
                            // Remover caracteres especiais e espaços em branco
                            // Verificar se o cliente digitou "conta"
                            if (text.trim().toLowerCase() === 'conta') {
                                await (0, shoppingService_1.redirectToOrderSummary)(from, currentConversation);
                                return;
                            }
                            if (currentConversation.flow === 'WELCOME') {
                                // Enviar a lista de categorias para o usuário
                                // Send welcome interative message to client
                                await (0, messagingService_1.sendWelcomeMessage)(from, '', store.wabaEnvironments, store, store.logo);
                                return;
                            }
                            if (currentConversation.flow === 'CATEGORIES') {
                                // Enviar a lista de categorias para o usuário
                                await (0, catalogService_1.sendCategoriesMessage)(from, store.categories, store.menu, store.wabaEnvironments, currentConversation);
                                return;
                            }
                            // Flow NEW_ADDRESS - User sent a text new address
                            if (currentConversation.flow === 'NEW_ADDRESS') {
                                // console.log('User is in NEW_ADDRESS flow', text);
                                await (0, addressService_1.handleNewAddressFlow)(from, text, currentConversation, store, res, addressCache);
                                return;
                            }
                            // Tratamento para o fluxo COLLECT_CUSTOMER_NAME  
                            if (currentConversation.flow === 'COLLECT_CUSTOMER_NAME') {
                                // console.log('Usuário está no fluxo de "NOME DO CLIENTE".');
                                // Enviar uma lista para seleção do método de pagamento
                                await (0, messagingService_1.sendMessage)({
                                    messaging_product: 'whatsapp',
                                    to: '+' + from,
                                    type: 'interactive',
                                    interactive: {
                                        type: 'list',
                                        header: {
                                            type: 'text',
                                            text: 'Selecione o método de pagamento:',
                                        },
                                        body: {
                                            text: 'Escolha uma das opções abaixo para concluir o pagamento:',
                                        },
                                        action: {
                                            button: 'Selecionar',
                                            sections: [
                                                {
                                                    title: 'Métodos de Pagamento',
                                                    rows: [
                                                        {
                                                            id: 'pix',
                                                            title: 'Pix',
                                                            description: 'Pague com Pix de forma rápida e segura.',
                                                        },
                                                        {
                                                            id: 'credit_card',
                                                            title: 'Cartão de Crédito',
                                                            description: 'Pague com cartão de crédito.',
                                                        },
                                                        {
                                                            id: 'on_delivery',
                                                            title: 'Pagar na Entrega',
                                                            description: 'Pague diretamente ao receber o pedido.',
                                                        },
                                                    ],
                                                },
                                            ],
                                        },
                                    },
                                }, store.wabaEnvironments);
                                // Atualizar o fluxo para aguardar a seleção do método de pagamento
                                await (0, conversationController_1.updateConversation)(currentConversation, {
                                    flow: 'SELECT_PAYMENT_METHOD',
                                    customerName: text
                                });
                                currentConversation.flow = 'SELECT_PAYMENT_METHOD';
                                currentConversation.customerName = text;
                                return;
                            }
                            if (currentConversation.flow === 'COLLECT_CUSTOM_QUANTITY' || currentConversation.flow === 'EDIT_ITEM_QUANTITY') {
                                await (0, shoppingService_1.handleCollectCustomQuantityFlow)(from, text, currentConversation);
                                return;
                            }
                            break;
                        case 'interactive':
                            const interactiveType = message.interactive?.type; // Tipo de interação (list_reply, button_reply)
                            // console.log(`Interação recebida: ${interactiveType === 'button_reply' ? ' BOTÃO' : 'LISTA'}`);
                            // console.log('Interactive message:', message.interactive);
                            if (!currentConversation?.docId) {
                                // TODO: handle
                                // console.log('No conversation found for this user, ignoring interactive message');
                                return;
                            }
                            /**************************************************************************************************************************************/
                            /*********************************************************BUTTON REPLY***********************************************************************/
                            /**************************************************************************************************************************************/
                            // Reply from template buttons
                            if (interactiveType === 'button_reply') {
                                const buttonReply = message.interactive.button_reply?.title || '';
                                // console.log(`Interactive pressed: ${buttonReply}`);
                                const currentUser = await (0, userController_1.getUserByPhone)(from);
                                // atualiza a conversation com o usuario encontrado
                                if (currentUser) {
                                    // console.log('Usuário encontrado no banco de dados:', currentUser);
                                    if (currentConversation?.docId) {
                                        await (0, conversationController_1.updateConversation)(currentConversation, {
                                            customerName: currentUser.name,
                                            phoneNumber: currentUser.phone,
                                            address: currentConversation.address || currentUser.address,
                                        });
                                        currentConversation.customerName = currentUser.name || '';
                                        currentConversation.phoneNumber = currentUser.phone || '';
                                        currentConversation.address = currentConversation.address || currentUser.address;
                                        // console.log('Conversa atualizada com os dados do usuário:', currentConversation);
                                    }
                                    else {
                                        (0, messagingService_1.notifyAdmin)('Erro: Nenhuma conversa encontrada para atualizar.');
                                    }
                                }
                                else {
                                    // TODO: handle
                                    console.log('Usuário não encontrado no banco de dados.');
                                }
                                switch (buttonReply) {
                                    // case 'Fazer um Pedido':
                                    //   await handleMakeOrder(from, currentConversation, currentUser);
                                    //   break;
                                    case 'Falar com a Loja':
                                        await (0, messagingService_1.sendContactMessage)(from, store.slug, store.wabaEnvironments);
                                        break;
                                    case 'Usar este endereço':
                                        // Se a conversa esta em fluxo diferente da confirmacao do endereco, ignorar  
                                        if (currentConversation.flow !== 'ADDRESS_CONFIRMATION')
                                            return;
                                        // await sendWaitingMessage(from, store, store.wabaEnvironments);
                                        await (0, addressService_1.handleUseAddress)(from, currentConversation, currentUser, store);
                                        break;
                                    case 'Informar outro':
                                        // Se a conversa esta em fluxo diferente da confirmacao do endereco, ignorar  
                                        if (currentConversation.flow !== 'ADDRESS_CONFIRMATION')
                                            return;
                                        // await sendWaitingMessage(from, store, store.wabaEnvironments);
                                        // console.log('Botão "Usar outro endereço" pressionado');
                                        await (0, addressService_1.handleInformOtherAddress)(from, currentConversation);
                                        break;
                                    case 'Trocar categoria':
                                        // Se a conversa esta em fluxo diferente de produtos, ignorar  
                                        if (currentConversation.flow !== 'PRODUCTS')
                                            return;
                                        // await sendWaitingMessage(from, store, store.wabaEnvironments);
                                        await (0, catalogService_1.sendCategoriesMessage)(from, store.categories, store.menu, store.wabaEnvironments, currentConversation); // Enviar lista de categorias
                                        break;
                                    case 'Fazer Nova Compra':
                                    // // Se existe conversa, ignorar  
                                    // if (!!currentConversation?.docId || currentConversation.flow !== 'EDIT_OR_REMOVE_SELECTION') return;
                                    // // await sendWaitingMessage(from, store, store.wabaEnvironments);
                                    // // TODO: handle
                                    // try {
                                    //   // Start new conversation
                                    //   const newConversation: Conversation = {
                                    //     date: new Date(),
                                    //     phoneNumber: from,
                                    //     flow: 'WELCOME',
                                    //     selectedAnswers: [],
                                    //     flowToken
                                    //     // store
                                    //   };
                                    //   await createConversation(newConversation);
                                    //   await sendWelcomeMessage(from, '', store.wabaEnvironments, store, store.logo);
                                    //   return;
                                    // } catch (error) {
                                    //   notifyAdmin('  conversa:', error);
                                    //   return res.status(500).send('Erro ao criar nova conversa');;
                                    // }
                                    case 'Alterar Itens':
                                        console.log('Botão "Alterar Itens" pressionado', currentConversation.flow);
                                        if (!currentConversation?.docId || currentConversation.flow !== 'EDIT_OR_REMOVE_SELECTION')
                                            return;
                                        console.log('Vai chamar handleEditCartItems');
                                        // await sendWaitingMessage(from, store, store.wabaEnvironments);
                                        await (0, shoppingService_1.handleEditCartItems)(from, currentConversation);
                                        break;
                                    case 'Alterar Endereço':
                                        console.log('Botão "Alterar Endereço" pressionado', currentConversation.flow);
                                        // await sendWaitingMessage(from, store, store.wabaEnvironments);
                                        await (0, addressService_1.handleInformOtherAddress)(from, currentConversation);
                                        break;
                                    case 'Alterar ou Excluir':
                                        console.log('Botão "Alterar ou Excluir" pressionado');
                                        // Se a conversa esta em fluxo diferente de ORDER_SUMMARY, ignorar  
                                        if (currentConversation.flow !== 'ORDER_SUMMARY')
                                            return;
                                        // await sendWaitingMessage(from, store, store.wabaEnvironments);
                                        // Enviar mensagem perguntando se deseja alterar o endereço ou algum item
                                        await (0, messagingService_1.sendMessage)({
                                            messaging_product: 'whatsapp',
                                            to: '+' + from,
                                            type: 'interactive',
                                            interactive: {
                                                type: 'button',
                                                body: {
                                                    text: 'O que você deseja alterar?',
                                                },
                                                action: {
                                                    buttons: [
                                                        {
                                                            type: 'reply',
                                                            reply: {
                                                                id: 'edit_item', // Alterar item
                                                                title: 'Alterar Itens',
                                                            },
                                                        },
                                                        {
                                                            type: 'reply',
                                                            reply: {
                                                                id: 'edit_address', // Alterar endereço
                                                                title: 'Alterar Endereço',
                                                            },
                                                        },
                                                    ],
                                                },
                                            },
                                        }, store.wabaEnvironments);
                                        console.log('Current conversation antes do update:', currentConversation.flow);
                                        // Atualizar o fluxo para aguardar a resposta do usuário
                                        await (0, conversationController_1.updateConversation)(currentConversation, {
                                            flow: 'EDIT_OR_REMOVE_SELECTION',
                                        });
                                        console.log('Current conversation apos o update:', currentConversation.flow);
                                        return;
                                    case 'Excluir Item':
                                        // Se a conversa esta em fluxo diferente de EDIT_CART_ACTION, ignorar  
                                        if (currentConversation.flow !== 'EDIT_CART_ACTION')
                                            return;
                                        // await sendWaitingMessage(from, store, store.wabaEnvironments);
                                        await (0, shoppingService_1.handleDeleteCartItem)(from, message.interactive.button_reply.id, currentConversation);
                                        break;
                                    case 'Cancelar Alteração':
                                        // await sendWaitingMessage(from, store, store.wabaEnvironments);
                                        // redirect to order summary
                                        await (0, shoppingService_1.redirectToOrderSummary)(from, currentConversation);
                                        break;
                                    case 'Alterar Quantidade': // Alterar Quantidade
                                        // Se a conversa esta em fluxo diferente de EDIT_CART_ACTION, ignorar  
                                        if (currentConversation.flow !== 'EDIT_CART_ACTION')
                                            return;
                                        // await sendWaitingMessage(from, store, store.wabaEnvironments);
                                        await (0, shoppingService_1.handleAlterItemQuantity)(from, message.interactive.button_reply.id, currentConversation);
                                        break;
                                    default:
                                        // await sendWaitingMessage(from, store, store.wabaEnvironments);
                                        // Item de lista pressionado
                                        const buttonReplyId = message.interactive.button_reply.id;
                                        // console.log(`Item de Lista pressionado: ${buttonReplyId}`);
                                        // Verifica se o botão pressionado é o "Ver mais"
                                        if (typeof buttonReplyId === 'string' && buttonReplyId.startsWith('more_')) {
                                            // Se a conversa esta em fluxo diferente de PRODUCTS, ignorar  
                                            if (currentConversation.flow !== 'PRODUCTS')
                                                return;
                                            // console.log('Botão "Ver mais" pressionado:', buttonReplyId);
                                            const nextPage = parseInt(buttonReplyId.split('_')[1], 10); // Extrair o número da próxima página
                                            // console.log(`Carregando mais produtos, página ${nextPage}`);
                                            const products = currentConversation?.products || [];
                                            // await sendProductsWithPagination(from, products, nextPage, store.wabaEnvironments);
                                            await (0, catalogService_1.sendProductsListWithPagination)(from, products, nextPage, store.wabaEnvironments, currentConversation);
                                            // Atualizar a página atual na conversa
                                            await (0, conversationController_1.updateConversation)(currentConversation, {
                                                currentPage: nextPage,
                                            });
                                            currentConversation.currentPage = nextPage;
                                            return;
                                        }
                                        // Verifica se o botão pressionado é um produto
                                        if (buttonReplyId.startsWith('product_')) {
                                            // Se a conversa esta em fluxo diferente de PRODUCTS, ignorar  
                                            if (currentConversation.flow !== 'PRODUCTS')
                                                return;
                                            // Seleção de produto
                                            const productId = parseInt(buttonReplyId.split('_')[1], 10);
                                            await (0, shoppingService_1.handleProductSelection)(from, productId, store, currentConversation);
                                            return;
                                        }
                                        switch (buttonReplyId) {
                                            case 'view_catalog':
                                                // console.log('Usuário clicou em "Ver Catálogo".');
                                                // update conversation flow
                                                // await updateConversation(currentConversation, currentConversation.docId, {
                                                //   flow: 'CATALOG',
                                                // });
                                                // // console.log('Fluxo atualizado para CATALOG');
                                                // Enviar uma mensagem com o link ou abrir o navegador
                                                await (0, messagingService_1.sendMessage)({
                                                    messaging_product: 'whatsapp',
                                                    to: '+' + from,
                                                    type: 'text',
                                                    text: {
                                                        body: `Acesse nosso catálogo aqui: https://talkcommerce-2c6e6.firebaseapp.com/${store.slug}`,
                                                    },
                                                }, store.wabaEnvironments);
                                                break;
                                            case 'call_store':
                                                // Enviar uma mensagem de contato para o usuário
                                                await (0, messagingService_1.sendContactMessage)(from, store.slug, store.wabaEnvironments);
                                                break;
                                            case 'add_more_products':
                                                // Se a conversa esta em fluxo diferente de ORDER_SUMMARY, ignorar  
                                                if (currentConversation.flow !== 'ORDER_SUMMARY')
                                                    return;
                                                // console.log('Usuário clicou em "Continuar Comprando".');
                                                // Enviar a lista de categorias para o usuário
                                                await (0, catalogService_1.sendCategoriesMessage)(from, store.categories, store.menu, store.wabaEnvironments, currentConversation);
                                                // console.log('Lista de categorias enviada ao usuário.');
                                                break;
                                            case 'finalize_order':
                                                // Se a conversa esta em fluxo diferente de ORDER_SUMMARY, ignorar  
                                                if (currentConversation.flow !== 'ORDER_SUMMARY')
                                                    return;
                                                // console.log('Usuário clicou em "Finalizar Pedido".');
                                                // Verificar se o nome do cliente já foi coletado
                                                if (!currentConversation.customerName) {
                                                    // console.log('Solicitando o nome do cliente.');
                                                    // Atualizar o fluxo para coletar o nome
                                                    await (0, conversationController_1.updateConversation)(currentConversation, {
                                                        flow: 'COLLECT_CUSTOMER_NAME',
                                                    });
                                                    await (0, messagingService_1.sendMessage)({
                                                        messaging_product: 'whatsapp',
                                                        to: '+' + from,
                                                        type: 'text',
                                                        text: {
                                                            body: 'Por favor, informe o seu nome completo para continuar.',
                                                        },
                                                    }, store.wabaEnvironments);
                                                    return;
                                                }
                                                // Enviar uma lista para seleção do método de pagamento
                                                await (0, messagingService_1.sendMessage)({
                                                    messaging_product: 'whatsapp',
                                                    to: '+' + from,
                                                    type: 'interactive',
                                                    interactive: {
                                                        type: 'list',
                                                        header: {
                                                            type: 'text',
                                                            text: 'Selecione o método de pagamento:',
                                                        },
                                                        body: {
                                                            text: 'Escolha uma das opções abaixo para concluir o pagamento:',
                                                        },
                                                        action: {
                                                            button: 'Selecionar',
                                                            sections: [
                                                                {
                                                                    title: 'Métodos de Pagamento',
                                                                    rows: [
                                                                        {
                                                                            id: 'pix',
                                                                            title: 'Pix',
                                                                            description: 'Pague com Pix de forma rápida e segura.',
                                                                        },
                                                                        {
                                                                            id: 'credit_card',
                                                                            title: 'Cartão de Crédito',
                                                                            description: 'Pague com cartão de crédito.',
                                                                        },
                                                                        {
                                                                            id: 'on_delivery',
                                                                            title: 'Pagar na Entrega',
                                                                            description: 'Pague diretamente ao receber o pedido.',
                                                                        },
                                                                    ],
                                                                },
                                                            ],
                                                        },
                                                    },
                                                }, store.wabaEnvironments);
                                                // Atualizar o fluxo para aguardar a seleção do método de pagamento
                                                await (0, conversationController_1.updateConversation)(currentConversation, {
                                                    flow: 'SELECT_PAYMENT_METHOD',
                                                });
                                                break;
                                            case 'edit_cart':
                                                // Se a conversa esta em fluxo diferente de ORDER_SUMMARY, ignorar  
                                                if (currentConversation.flow !== 'ORDER_SUMMARY')
                                                    return;
                                                // console.log('Usuário clicou em "Alterar ou Excluir".');
                                                // Atualizar o fluxo da conversa para "EDIT_CART"
                                                await (0, conversationController_1.updateConversation)(currentConversation, {
                                                    flow: 'EDIT_CART',
                                                });
                                                // Enviar uma mensagem com a lista de itens do carrinho
                                                const cartItemsList = currentConversation.cartItems || [];
                                                const cartItemsMessage = cartItemsList
                                                    .map((item) => `${item.menuName} - ${item.quantity} x R$ ${item.price.toFixed(2)} = R$ ${(item.price * item.quantity).toFixed(2)}`)
                                                    .join('\n');
                                                const cartMessage = `Itens no Carrinho:\n\n${cartItemsMessage}\n\nPor favor, informe qual item você deseja alterar.`;
                                                await (0, messagingService_1.sendMessage)({
                                                    messaging_product: 'whatsapp',
                                                    to: '+' + from,
                                                    type: 'text',
                                                    text: {
                                                        body: cartMessage,
                                                    },
                                                }, store.wabaEnvironments);
                                                // console.log('Lista de itens do carrinho enviada ao usuário.');
                                                // Enviar uma mensagem para o usuário informando que ele pode editar o carrinho
                                                await (0, messagingService_1.sendMessage)({
                                                    messaging_product: 'whatsapp',
                                                    to: '+' + from,
                                                    type: 'text',
                                                    text: {
                                                        body: 'Por favor, informe qual item você deseja alterar.',
                                                    },
                                                }, store.wabaEnvironments);
                                                break;
                                            case 'confirm_delete':
                                                // Se a conversa esta em fluxo diferente de WAITING_DELETE_CONFIRMATION, ignorar  
                                                if (currentConversation.flow !== 'WAITING_DELETE_CONFIRMATION')
                                                    return;
                                                // console.log('Usuário confirmou a exclusão do item.');
                                                // Recuperar o índice do item a ser excluído
                                                const selectedItemIndex = currentConversation.selectedItemIndex;
                                                if (selectedItemIndex === undefined) {
                                                    (0, messagingService_1.notifyAdmin)('Erro: Nenhum índice de item selecionado encontrado.');
                                                    await (0, messagingService_1.sendMessage)({
                                                        messaging_product: 'whatsapp',
                                                        to: '+' + from,
                                                        type: 'text',
                                                        text: {
                                                            body: 'Desculpe, ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.',
                                                        },
                                                    }, store.wabaEnvironments);
                                                    return;
                                                }
                                                // Remover o item do carrinho
                                                const updatedCartItems = currentConversation.cartItems?.filter((_, index) => index !== selectedItemIndex) || [];
                                                // Atualizar o carrinho na conversa
                                                await (0, conversationController_1.updateConversation)(currentConversation, {
                                                    cartItems: updatedCartItems,
                                                });
                                                // Atualizar conversation.cartitems excluindo o item
                                                currentConversation.cartItems = updatedCartItems;
                                                // Informar ao cliente que o item foi removido
                                                await (0, messagingService_1.sendMessage)({
                                                    messaging_product: 'whatsapp',
                                                    to: '+' + from,
                                                    type: 'text',
                                                    text: {
                                                        body: 'O item foi removido do seu carrinho com sucesso.',
                                                    },
                                                }, store.wabaEnvironments);
                                                await (0, shoppingService_1.redirectToOrderSummary)(from, currentConversation);
                                                return;
                                            case 'cancel_delete':
                                                // Se a conversa esta em fluxo diferente de WAITING_DELETE_CONFIRMATION, ignorar  
                                                if (currentConversation.flow !== 'WAITING_DELETE_CONFIRMATION')
                                                    return;
                                                // console.log('Usuário cancelou a exclusão do item.');
                                                // Informar ao cliente que a exclusão foi cancelada
                                                await (0, messagingService_1.sendMessage)({
                                                    messaging_product: 'whatsapp',
                                                    to: '+' + from,
                                                    type: 'text',
                                                    text: {
                                                        body: 'A exclusão do item foi cancelada.',
                                                    },
                                                }, store.wabaEnvironments);
                                                // ENviar para o fluxo da funcao  redirectToOrderSummary
                                                await (0, conversationController_1.updateConversation)(currentConversation, {
                                                    flow: 'ORDER_SUMMARY',
                                                });
                                                await (0, shoppingService_1.redirectToOrderSummary)(from, currentConversation);
                                                // console.log('Fluxo redirecionado para ORDER_SUMMARY.');
                                                return;
                                            case 'buy_whatsapp':
                                                await (0, orderService_1.handleMakeOrder)(from, currentConversation, currentUser);
                                                return;
                                            case 'buy_product':
                                                await (0, orderService_1.handleBuySingleProduct)(from, currentConversation, currentUser);
                                                return;
                                            default:
                                                console.log('Botão não reconhecido:', buttonReplyId);
                                                break;
                                        }
                                }
                                return;
                            }
                            /**************************************************************************************************************************************/
                            /*********************************************************LIST REPLY***********************************************************************/
                            /**************************************************************************************************************************************/
                            // Reply from list item
                            if (interactiveType === 'list_reply') {
                                const listReplyId = message.interactive.list_reply.id;
                                if (!currentConversation?.docId) {
                                    // TODO: handle
                                    return;
                                }
                                // await sendWaitingMessage(from, store, store.wabaEnvironments);
                                // Address selection
                                if (currentConversation?.flow === 'NEW_ADDRESS' || currentConversation?.flow === 'ADDRESS_CONFIRMATION') {
                                    const selectedPlaceId = message.interactive.list_reply.id; // ID selecionado pelo usuário
                                    if (selectedPlaceId === 'not_in_list') {
                                        // console.log('Usuário selecionou "Endereço não está na lista".');
                                        // Atualizar o fluxo da conversa para "NEW_ADDRESS"
                                        await (0, conversationController_1.updateConversation)(currentConversation, {
                                            flow: 'NEW_ADDRESS',
                                        });
                                        // console.log('Fluxo atualizado para NEW_ADDRESS');
                                        // Enviar mensagem solicitando um novo endereço
                                        const reply = `Por favor, informe um novo endereço. Certifique-se de incluir o número.`;
                                        await (0, messagingService_1.sendMessage)({
                                            messaging_product: 'whatsapp',
                                            to: '+' + from,
                                            type: 'text',
                                            text: {
                                                body: reply,
                                            },
                                        }, store.wabaEnvironments);
                                        // Manter o fluxo em "NEW_ADDRESS"
                                        return;
                                    }
                                    // Caso contrário, continue com o fluxo normal
                                    if (addressCache[selectedPlaceId]) {
                                        const selectedAddress = addressCache[selectedPlaceId];
                                        // console.log('Endereço selecionado:', selectedAddress);
                                        // Coordenadas da loja
                                        const storeLat = store.address?.lat;
                                        const storeLng = store.address?.lng;
                                        // Coordenadas do endereço selecionado
                                        const selectedLat = selectedAddress.lat;
                                        const selectedLng = selectedAddress.lng;
                                        // Calcular a distância entre a loja e o endereço selecionado
                                        const distance = (0, geolocationService_1.calculateDistance)(storeLat, storeLng, selectedLat, selectedLng);
                                        // console.log(`Distância calculada: ${distance} km`);
                                        // Verificar se está dentro do raio de entrega
                                        if (distance <= store.deliveryMaxRadiusKm) {
                                            // console.log('Endereço dentro do raio de entrega.');
                                            const selectedAddress = addressCache[selectedPlaceId];
                                            // console.log('Endereço selecionado:', selectedAddress);
                                            // Obter os detalhes do endereço usando o Google Places API
                                            const placeDetails = await clientMaps.placeDetails({
                                                params: {
                                                    place_id: selectedPlaceId,
                                                    key: GOOGLE_PLACES_API_KEY,
                                                },
                                            });
                                            const addressComponents = placeDetails.data.result.address_components;
                                            // Processar os componentes do endereço
                                            const parsedAddress = (0, geolocationService_2.parseGooglePlacesAddress)(addressComponents);
                                            // Atualizar o cache com os novos campos
                                            addressCache[selectedPlaceId] = {
                                                ...selectedAddress,
                                                street: parsedAddress.street,
                                                number: parsedAddress.number,
                                                neighborhood: parsedAddress.neighborhood,
                                                city: parsedAddress.city,
                                                state: parsedAddress.state,
                                                zipCode: parsedAddress.zipCode,
                                            };
                                            // console.log('Endereço atualizado no cache:', addressCache[selectedPlaceId]);
                                            // Atualizar o modelo Conversation com os campos do endereço
                                            await (0, conversationController_1.updateConversation)(currentConversation, {
                                                address: {
                                                    name: selectedAddress.description,
                                                    placeId: selectedAddress.placeId,
                                                    lat: selectedAddress.lat,
                                                    lng: selectedAddress.lng,
                                                    street: parsedAddress.street,
                                                    number: parsedAddress.number,
                                                    neighborhood: parsedAddress.neighborhood,
                                                    city: parsedAddress.city,
                                                    state: parsedAddress.state,
                                                    zipCode: parsedAddress.zipCode,
                                                    main: true,
                                                },
                                            });
                                            // console.log('Endereço atualizado na conversa:', parsedAddress);
                                            if (currentConversation.previousFlow === 'Fazer um Pedido') {
                                                // // Enviar a próxima mensagem no fluxo// 
                                                // await sendCategoriesMessage(from, store.categories, store.menu, store.wabaEnvironments, currentConversation);
                                                // // atualiza o fluxo da conversa para CATEGORIES
                                                // await updateConversation(currentConversation, {
                                                //   flow: 'CATEGORIES',
                                                // });
                                                // await handleMakeOrder(from, currentConversation, currentUser);
                                                await (0, conversationController_1.updateConversation)(currentConversation, {
                                                    flow: 'CATEGORY_SELECTION',
                                                });
                                                await (0, messagingService_1.sendMessage)({
                                                    messaging_product: 'whatsapp',
                                                    to: '+' + from,
                                                    type: 'flow',
                                                    flow: {
                                                        flow_id: 1042584718014131, // ID do fluxo publicado no WABA
                                                    },
                                                }, store.wabaEnvironments);
                                                return;
                                            }
                                            if (currentConversation.previousFlow === store.singleProductText) {
                                                // redireciona para o fluxo de ORDER_SUMMARY
                                                if (!currentConversation.store?.menu?.length) {
                                                    // envia mensagem que nao existe produto
                                                    const reply = `Desculpe, não há produtos disponíveis no momento. Por favor, tente novamente mais tarde.`;
                                                    await (0, messagingService_1.sendMessage)({
                                                        messaging_product: 'whatsapp',
                                                        to: '+' + from,
                                                        type: 'text',
                                                        text: {
                                                            body: reply,
                                                        },
                                                    }, store.wabaEnvironments);
                                                    // Avisa o admin que nao existe produto
                                                    (0, messagingService_1.notifyAdmin)(`Não há produtos disponíveis no menu da loja ${store.name}`);
                                                    return;
                                                }
                                                const produtct = (0, catalogService_1.getSingleProduct)(currentConversation.store?.menu);
                                                if (!produtct?.length) {
                                                    // envia mensagem que nao existe produto
                                                    const reply = `Desculpe, não há produtos disponíveis no momento. Por favor, tente novamente mais tarde.`;
                                                    await (0, messagingService_1.sendMessage)({
                                                        messaging_product: 'whatsapp',
                                                        to: '+' + from,
                                                        type: 'text',
                                                        text: {
                                                            body: reply,
                                                        },
                                                    }, store.wabaEnvironments);
                                                    // Avisa o admin que nao existe produto
                                                    (0, messagingService_1.notifyAdmin)(`Não há produtos disponíveis no menu da loja ${store.name}`);
                                                    return;
                                                }
                                                // Atualiza o fluxo da conversa para ORDER_SUMMARY  
                                                await (0, conversationController_1.updateConversation)(currentConversation, {
                                                    flow: 'PRODUCTS'
                                                });
                                                await (0, catalogService_1.sendProductCard)(from, produtct[0], store.wabaEnvironments);
                                                return;
                                            }
                                            if (currentConversation.previousFlow === 'Alterar Endereço') {
                                                // redireciona para o fluxo de ORDER_SUMMARY
                                                await (0, shoppingService_1.redirectToOrderSummary)(from, currentConversation);
                                            }
                                            return;
                                        }
                                        else {
                                            // console.log('Endereço fora do raio de entrega.');
                                            // Enviar mensagem informando que o endereço está fora do raio de entrega
                                            const reply = `Desculpe, o endereço selecionado está fora do nosso raio de entrega de ${store.deliveryMaxRadiusKm} km. Por favor, informe outro endereço.`;
                                            await (0, messagingService_1.sendMessage)({
                                                messaging_product: 'whatsapp',
                                                to: '+' + from,
                                                type: 'text',
                                                text: {
                                                    body: reply,
                                                },
                                            }, store.wabaEnvironments);
                                            // Atualizar o fluxo para solicitar um novo endereço
                                            await (0, conversationController_1.updateConversation)(currentConversation, {
                                                flow: 'NEW_ADDRESS',
                                            });
                                        }
                                    }
                                    else {
                                        (0, messagingService_1.notifyAdmin)('Place ID não encontrado no cache.');
                                        // TODO: handle
                                    }
                                    return;
                                }
                                if (currentConversation?.flow === 'CATEGORIES' || currentConversation?.flow === 'PRODUCTS') {
                                    const selectedCategoryId = parseInt(message.interactive.list_reply.id); // ID da categoria selecionada
                                    const selectedCategory = store.categories.find((category) => category.categoryId === selectedCategoryId);
                                    if (!selectedCategory) {
                                        // console.log(`Categoria inválida selecionada: ${selectedCategoryId}`);
                                        const reply = `Desculpe, a categoria selecionada não é válida. Por favor, selecione uma categoria da lista.`;
                                        await (0, messagingService_1.sendMessage)({
                                            messaging_product: 'whatsapp',
                                            to: '+' + from,
                                            type: 'text',
                                            text: {
                                                body: reply,
                                            },
                                        }, store.wabaEnvironments);
                                        return;
                                    }
                                    // Atualizar o fluxo da conversa para "PRODUCTS"
                                    await (0, conversationController_1.updateConversation)(currentConversation, {
                                        flow: 'PRODUCTS',
                                        category: selectedCategory,
                                    });
                                    // Buscar os produtos da categoria
                                    const products = (0, catalogService_1.getProductsByCategory)(store.menu, selectedCategoryId);
                                    if (products.length > 0) {
                                        // console.log(`Produtos encontrados para a categoria "${selectedCategory.categoryName}":`, products);
                                        // Atualizar a conversa para incluir os produtos e a página atual
                                        await (0, conversationController_1.updateConversation)(currentConversation, {
                                            flow: 'PRODUCTS',
                                            category: selectedCategory,
                                            products,
                                            currentPage: 1, // Página inicial
                                        });
                                        // // Enviar uma mensagem dizendo que a lista de produtos será enviada de 5 em 5 produtos
                                        // await sendMessage({
                                        //   messaging_product: 'whatsapp',
                                        //   to: '+' + from,
                                        //   type: 'text',
                                        //   text: {
                                        //     body: `Aqui estão os produtos da categoria "${selectedCategory.categoryName}"`,
                                        //   },
                                        // }, store.wabaEnvironments);
                                        // Enviar os primeiros 5 produtos
                                        // await sendProductsWithPagination(from, products, 1, store.wabaEnvironments);
                                        await (0, catalogService_1.sendProductsListWithPagination)(from, products, 1, store.wabaEnvironments, currentConversation);
                                        return;
                                    }
                                    else {
                                        // console.log(`Nenhum produto encontrado para a categoria "${selectedCategory.categoryName}".`);
                                        const reply = `Desculpe, não há produtos disponíveis na categoria "${selectedCategory.categoryName}" no momento. Por favor, selecione outra categoria.`;
                                        await (0, messagingService_1.sendMessage)({
                                            messaging_product: 'whatsapp',
                                            to: '+' + from,
                                            type: 'text',
                                            text: {
                                                body: reply,
                                            },
                                        }, store.wabaEnvironments);
                                        await (0, catalogService_1.sendCategoriesMessage)(from, store.categories, store.menu, store.wabaEnvironments, currentConversation); // Enviar lista de categorias
                                    }
                                }
                                if (currentConversation?.flow === 'PRODUCT_QUESTIONS') {
                                    console.log('Usuário respondeu a pergunta do produto.');
                                    // Obter o produto sendo respondido
                                    const product = currentConversation.product;
                                    if (!product) {
                                        (0, messagingService_1.notifyAdmin)('Produto não encontrado no carrinho.');
                                        const reply = `Desculpe, ocorreu um erro ao processar sua resposta. Por favor, tente novamente.`;
                                        await (0, messagingService_1.sendMessage)({
                                            messaging_product: 'whatsapp',
                                            to: '+' + from,
                                            type: 'text',
                                            text: {
                                                body: reply,
                                            },
                                        }, store.wabaEnvironments);
                                        return;
                                    }
                                    const productId = currentConversation.productBeingAnswered;
                                    const currentQuestionIndex = currentConversation.currentQuestionIndex || 0;
                                    // Obter a pergunta atual com base no índice
                                    const selectedQuestion = product.questions?.[currentQuestionIndex];
                                    if (!selectedQuestion) {
                                        (0, messagingService_1.notifyAdmin)(`Questão inválida no índice ${currentQuestionIndex}.`);
                                        const reply = `Desculpe, a questão selecionada não é válida. Por favor, selecione uma questão da lista.`;
                                        await (0, messagingService_1.sendMessage)({
                                            messaging_product: 'whatsapp',
                                            to: '+' + from,
                                            type: 'text',
                                            text: {
                                                body: reply,
                                            },
                                        }, store.wabaEnvironments);
                                        return;
                                    }
                                    const selectedAnswerId = parseInt(message.interactive.list_reply.id.replace('answer_', ''), 10);
                                    // Buscar a resposta selecionada
                                    const selectedAnswer = selectedQuestion.answers?.find((answer) => answer.answerId === selectedAnswerId);
                                    if (!selectedAnswer) {
                                        (0, messagingService_1.notifyAdmin)(`Resposta inválida selecionada: ${selectedAnswerId}`);
                                        const reply = `Desculpe, a resposta selecionada não é válida. Por favor, selecione uma resposta da lista.`;
                                        await (0, messagingService_1.sendMessage)({
                                            messaging_product: 'whatsapp',
                                            to: '+' + from,
                                            type: 'text',
                                            text: {
                                                body: reply,
                                            },
                                        }, store.wabaEnvironments);
                                        return;
                                    }
                                    // Atualizar o carrinho com a pergunta e a resposta selecionada
                                    const updatedCartItems = currentConversation.cartItems || [];
                                    const existingCartItem = updatedCartItems.find((item) => item.id === currentConversation.productBeingAnswered);
                                    console.log('Existing cart item:', existingCartItem, productId);
                                    if (existingCartItem) {
                                        existingCartItem.questions = existingCartItem.questions || [];
                                        const existingQuestion = existingCartItem.questions.find((q) => q.questionId === selectedQuestion.questionId);
                                        if (existingQuestion) {
                                            const existingAnswer = existingQuestion.answers?.find((a) => a.answerId === selectedAnswer.answerId);
                                            if (existingAnswer) {
                                                // Incrementar a quantidade se a resposta já existir
                                                existingAnswer.quantity = (existingAnswer.quantity || 1) + 1;
                                            }
                                            else {
                                                // Adicionar a resposta com quantidade inicial 1
                                                existingQuestion.answers = existingQuestion.answers || [];
                                                existingQuestion.answers.push({
                                                    ...selectedAnswer,
                                                    quantity: 1,
                                                });
                                            }
                                        }
                                        else {
                                            existingCartItem.questions.push({
                                                ...selectedQuestion,
                                                answers: [
                                                    {
                                                        ...selectedAnswer,
                                                        quantity: 1,
                                                    },
                                                ],
                                            });
                                        }
                                    }
                                    else {
                                        updatedCartItems.push({
                                            ...product,
                                            questions: [
                                                {
                                                    ...selectedQuestion,
                                                    answers: [
                                                        {
                                                            ...selectedAnswer,
                                                            quantity: 1,
                                                        },
                                                    ],
                                                },
                                            ],
                                            quantity: 0,
                                        });
                                    }
                                    // Salvar o carrinho atualizado na conversa
                                    await (0, conversationController_1.updateConversation)(currentConversation, {
                                        cartItems: updatedCartItems,
                                    });
                                    console.log('Carrinho atualizado com as respostas selecionadas:', updatedCartItems);
                                    currentConversation.cartItems = updatedCartItems;
                                    // Verificar se há mais perguntas
                                    const nextQuestionIndex = currentQuestionIndex + 1;
                                    const nextQuestion = product.questions?.[nextQuestionIndex];
                                    if (nextQuestion) {
                                        // Atualizar o fluxo para a próxima pergunta
                                        await (0, conversationController_1.updateConversation)(currentConversation, {
                                            currentQuestionIndex: nextQuestionIndex,
                                        });
                                        // Enviar a próxima pergunta
                                        await (0, shoppingService_1.sendQuestion)(from, nextQuestion, store.wabaEnvironments);
                                    }
                                    else {
                                        // Todas as perguntas foram respondidas
                                        // console.log('Todas as perguntas foram respondidas para o produto:', product.menuName);
                                        // Atualizar a conversa para o fluxo de quantidade
                                        await (0, conversationController_1.updateConversation)(currentConversation, {
                                            flow: 'PRODUCT_QUANTITY',
                                            product: product,
                                        });
                                        // Enviar a lista interativa de quantidades
                                        const quantityOptions = Array.from({ length: 5 }, (_, i) => ({
                                            id: `quantity_${i + 1}`,
                                            title: `${i + 1}`,
                                            description: `Adicionar ${i + 1} unidade(s) ao carrinho`,
                                        }));
                                        quantityOptions.push({
                                            id: 'quantity_custom',
                                            title: 'Digitar a quantidade',
                                            description: 'Informe manualmente a quantidade desejada.',
                                        });
                                        await (0, messagingService_1.sendMessage)({
                                            messaging_product: 'whatsapp',
                                            to: "+" + from,
                                            type: 'interactive',
                                            interactive: {
                                                type: 'list',
                                                header: {
                                                    type: 'text',
                                                    text: `Quantas unidades você deseja adicionar ao carrinho?`,
                                                },
                                                body: {
                                                    text: 'Selecione uma quantidade abaixo:',
                                                },
                                                action: {
                                                    button: 'Selecionar',
                                                    sections: [
                                                        {
                                                            title: 'Quantidades disponíveis',
                                                            rows: quantityOptions,
                                                        },
                                                    ],
                                                },
                                            },
                                        }, store.wabaEnvironments);
                                    }
                                    return;
                                }
                                if (currentConversation.flow === 'PRODUCT_QUANTITY') {
                                    if (listReplyId === 'quantity_custom') {
                                        // console.log('Usuário selecionou "Digitar a quantidade".');
                                        // Atualizar o fluxo para coletar a quantidade manualmente
                                        await (0, conversationController_1.updateConversation)(currentConversation, {
                                            flow: 'COLLECT_CUSTOM_QUANTITY',
                                        });
                                        await (0, messagingService_1.sendMessage)({
                                            messaging_product: 'whatsapp',
                                            to: '+' + from,
                                            type: 'text',
                                            text: {
                                                body: 'Por favor, informe a quantidade desejada.',
                                            },
                                        }, store.wabaEnvironments);
                                        return;
                                    }
                                    // Extrair a quantidade do ID selecionado (ex.: "quantity_3" -> 3)
                                    const quantity = parseInt(listReplyId.replace('quantity_', ''), 10);
                                    console.log(`Quantidade selecionada: ${quantity}`);
                                    if (isNaN(quantity) || quantity < 1 || quantity > 10) {
                                        (0, messagingService_1.notifyAdmin)('Quantidade inválida selecionada:', listReplyId);
                                        await (0, messagingService_1.sendMessage)({
                                            messaging_product: 'whatsapp',
                                            to: '+' + from,
                                            type: 'text',
                                            text: {
                                                body: 'Desculpe, a quantidade selecionada é inválida. Por favor, tente novamente.',
                                            },
                                        }, store.wabaEnvironments);
                                        return;
                                    }
                                    // Atualizar o carrinho com a quantidade selecionada
                                    const updatedCartItems = currentConversation.cartItems || [];
                                    const existingCartItem = currentConversation.product?.questions?.length ?
                                        updatedCartItems.find((item) => item.id === currentConversation.productBeingAnswered)
                                        : updatedCartItems.find((item) => item.menuId === currentConversation.product?.menuId);
                                    if (existingCartItem) {
                                        existingCartItem.quantity += quantity;
                                        // atualiza currentConversation
                                    }
                                    else {
                                        updatedCartItems.push({
                                            ...currentConversation.product,
                                            quantity,
                                        });
                                    }
                                    // Salvar o carrinho atualizado na conversa
                                    await (0, conversationController_1.updateConversation)(currentConversation, {
                                        cartItems: updatedCartItems,
                                    });
                                    // Atualizar o carrinho na conversa atual
                                    currentConversation.cartItems = updatedCartItems;
                                    // Redirecionar para o resumo do pedido
                                    await (0, shoppingService_1.redirectToOrderSummary)(from, currentConversation);
                                    return;
                                }
                                if (currentConversation.flow === 'EDIT_CART_ITEM') {
                                    const selectedItemId = message.interactive.list_reply.id;
                                    if (selectedItemId === 'cancel_edit') {
                                        // console.log('Usuário cancelou a edição do carrinho.');
                                        // // Atualizar o fluxo para o menu principal
                                        // await updateConversation(currentConversation, {
                                        //   flow: 'CATEGORIES',
                                        // });
                                        // await redirectToOrderSummary(from, currentConversation);
                                        return;
                                    }
                                    const itemIndex = parseInt(selectedItemId.replace('item_', ''), 10);
                                    const selectedItem = currentConversation.cartItems?.[itemIndex];
                                    if (!selectedItem) {
                                        (0, messagingService_1.notifyAdmin)('Item selecionado não encontrado no carrinho.');
                                        await (0, messagingService_1.sendMessage)({
                                            messaging_product: 'whatsapp',
                                            to: '+' + from,
                                            type: 'text',
                                            text: {
                                                body: 'Desculpe, o item selecionado não foi encontrado no carrinho. Por favor, tente novamente.',
                                            },
                                        }, store.wabaEnvironments);
                                        return;
                                    }
                                    // console.log('Item selecionado para edição:', selectedItem);
                                    // Perguntar ao cliente se deseja alterar a quantidade ou excluir o item
                                    await (0, messagingService_1.sendMessage)({
                                        messaging_product: 'whatsapp',
                                        to: '+' + from,
                                        type: 'interactive',
                                        interactive: {
                                            type: 'button',
                                            body: {
                                                text: `O que você deseja fazer com "${selectedItem.menuName}"?`,
                                            },
                                            action: {
                                                buttons: [
                                                    {
                                                        type: 'reply',
                                                        reply: {
                                                            id: `edit_quantity_${itemIndex}`,
                                                            title: 'Alterar Quantidade',
                                                        },
                                                    },
                                                    {
                                                        type: 'reply',
                                                        reply: {
                                                            id: `remove_item_${itemIndex}`,
                                                            title: 'Excluir Item',
                                                        },
                                                    },
                                                    {
                                                        type: 'reply',
                                                        reply: {
                                                            id: `cancel_add_remove`,
                                                            title: 'Cancelar Alteração',
                                                        },
                                                    },
                                                ],
                                            },
                                        },
                                    }, store.wabaEnvironments);
                                    // Atualizar o fluxo para "EDIT_CART_ACTION"
                                    await (0, conversationController_1.updateConversation)(currentConversation, {
                                        flow: 'EDIT_CART_ACTION',
                                        selectedItemIndex: itemIndex,
                                    });
                                    return;
                                    // console.log('Pergunta enviada ao cliente sobre a ação no item selecionado.');
                                }
                                if (currentConversation.flow === 'EDIT_ITEM_QUANTITY') {
                                    // console.log('Usuário está no fluxo de "EDIT_ITEM_QUANTITY".');
                                    // Verificar se a mensagem é uma resposta de lista interativa
                                    const listReplyId = message.interactive?.list_reply?.id;
                                    if (!listReplyId) {
                                        (0, messagingService_1.notifyAdmin)('Erro: Nenhuma resposta de lista encontrada.');
                                        await (0, messagingService_1.sendMessage)({
                                            messaging_product: 'whatsapp',
                                            to: '+' + from,
                                            type: 'text',
                                            text: {
                                                body: 'Desculpe, ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.',
                                            },
                                        }, store.wabaEnvironments);
                                        return;
                                    }
                                    // Extrair a quantidade do ID selecionado (ex.: "quantity_3" -> 3)
                                    const quantity = parseInt(listReplyId.replace('quantity_', ''), 10);
                                    console.log('PREVISOUS FLOW', currentConversation.previousFlow, quantity);
                                    if (isNaN(quantity) || quantity < 1 || quantity > 10) {
                                        (0, messagingService_1.notifyAdmin)('Quantidade inválida selecionada:', listReplyId);
                                        await (0, messagingService_1.sendMessage)({
                                            messaging_product: 'whatsapp',
                                            to: '+' + from,
                                            type: 'text',
                                            text: {
                                                body: 'Desculpe, a quantidade selecionada é inválida. Por favor, tente novamente.',
                                            },
                                        }, store.wabaEnvironments);
                                        return;
                                    }
                                    console.log(`Quantidade válida recebida: ${quantity}`);
                                    // Recuperar o índice do item selecionado
                                    const selectedItemIndex = currentConversation.selectedItemIndex;
                                    if (selectedItemIndex === undefined) {
                                        (0, messagingService_1.notifyAdmin)('Erro: Nenhum índice de item selecionado encontrado.');
                                        await (0, messagingService_1.sendMessage)({
                                            messaging_product: 'whatsapp',
                                            to: '+' + from,
                                            type: 'text',
                                            text: {
                                                body: 'Desculpe, ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.',
                                            },
                                        }, store.wabaEnvironments);
                                        return;
                                    }
                                    const itemToEdit = currentConversation.cartItems?.[selectedItemIndex];
                                    if (!itemToEdit) {
                                        (0, messagingService_1.notifyAdmin)('Item selecionado para alteração não encontrado no carrinho.');
                                        await (0, messagingService_1.sendMessage)({
                                            messaging_product: 'whatsapp',
                                            to: '+' + from,
                                            type: 'text',
                                            text: {
                                                body: 'Desculpe, o item selecionado não foi encontrado no carrinho. Por favor, tente novamente.',
                                            },
                                        }, store.wabaEnvironments);
                                        return;
                                    }
                                    // console.log('Item selecionado para alterar quantidade:', itemToEdit);
                                    // Atualizar a quantidade do item no carrinho
                                    itemToEdit.quantity = quantity;
                                    // Atualizar o carrinho na conversa
                                    await (0, conversationController_1.updateConversation)(currentConversation, {
                                        cartItems: currentConversation.cartItems,
                                    });
                                    console.log('Quantidade do item atualizada no carrinho:', itemToEdit);
                                    // Informar ao cliente que a quantidade foi alterada
                                    await (0, messagingService_1.sendMessage)({
                                        messaging_product: 'whatsapp',
                                        to: '+' + from,
                                        type: 'text',
                                        text: {
                                            body: `A quantidade do item "${itemToEdit.menuName}" foi alterada para ${quantity}.`,
                                        },
                                    }, store.wabaEnvironments);
                                    // console.log('Carrinho atualizado, redirecionando para o resumo do pedido.');
                                    // Redirecionar para o resumo do pedido
                                    await (0, shoppingService_1.redirectToOrderSummary)(from, currentConversation);
                                    return;
                                }
                                if (currentConversation.flow === 'CHECKBOX_QUESTION') {
                                    // console.log('Usuário está no fluxo de "CHECKBOX_QUESTION".');
                                    const selectedAnswerId = message.interactive.list_reply.id; // ID da resposta selecionada
                                    if (!selectedAnswerId) {
                                        (0, messagingService_1.notifyAdmin)('Erro: Nenhuma resposta selecionada.');
                                        await (0, messagingService_1.sendMessage)({
                                            messaging_product: 'whatsapp',
                                            to: '+' + from,
                                            type: 'text',
                                            text: {
                                                body: 'Desculpe, ocorreu um erro ao processar sua resposta. Por favor, tente novamente.',
                                            },
                                        }, store.wabaEnvironments);
                                        return;
                                    }
                                    // console.log(`Resposta selecionada: ${selectedAnswerId}`);
                                    // Processar a resposta selecionada
                                    await (0, shoppingService_1.processCheckboxResponse)(from, selectedAnswerId, currentConversation);
                                    return;
                                }
                                if (currentConversation.flow === 'SELECT_PAYMENT_METHOD') {
                                    const listReplyId = message.interactive.list_reply.id;
                                    switch (listReplyId) {
                                        case 'pix':
                                            try {
                                                // buscar o conversation no bd
                                                const currentConversationDB = await (0, conversationController_1.getConversationByDocId)(currentConversation.docId);
                                                if (!currentConversationDB) {
                                                    (0, messagingService_1.notifyAdmin)('Erro: Conversa não encontrada no banco de dados.');
                                                    await (0, messagingService_1.sendMessage)({
                                                        messaging_product: 'whatsapp',
                                                        to: '+' + from,
                                                        type: 'text',
                                                        text: {
                                                            body: 'Desculpe, ocorreu um erro ao processar seu pedido. Por favor, tente novamente.',
                                                        },
                                                    }, store.wabaEnvironments);
                                                    return;
                                                }
                                                const totalPrice = (currentConversationDB.totalPrice || 0);
                                                // somar o preco da entrega (store.deliveryPrice)
                                                const deliveryPrice = currentConversation.deliveryPrice || store.deliveryPrice || 0;
                                                const totalPriceWithDelivery = Number((totalPrice + deliveryPrice).toFixed(2));
                                                console.log('Total do pedido:', totalPriceWithDelivery);
                                                const expirationDate = new Date();
                                                expirationDate.setHours(expirationDate.getHours() + 1); // Expira em 1 hora
                                                const formattedExpirationDate = expirationDate.toISOString().replace('T', ' ').split('.')[0];
                                                // Gerar o QR Code para pagamento via PIX
                                                const { qrCodeImage, payload } = await (0, asaasServce_1.generatePixPayment)('Pagamento do pedido', totalPriceWithDelivery, formattedExpirationDate, currentConversation.docId);
                                                console.log('Pagamento do pedido', totalPriceWithDelivery, formattedExpirationDate);
                                                // Salvar a imagem do QR Code no Firebase Storage (opcional)
                                                // const bucket = admin.storage().bucket();
                                                // const fileName = `pix-qrcodes/${Date.now()}-qrcode.png`;
                                                // const file = bucket.file(fileName);
                                                // await file.save(Buffer.from(qrCodeImage, 'base64'), {
                                                //   metadata: { contentType: 'image/png' },
                                                // });
                                                // // Tornar a URL pública
                                                // await file.makePublic();
                                                // const publicUrl = file.publicUrl();
                                                // // Fazer upload da imagem para o WABA
                                                // const mediaId = await uploadImageFromUrlToWABAGeneric(publicUrl, 'image/png');
                                                // console.log('ID da mídia do QR Code:', mediaId);
                                                // // Enviar a imagem do QR Code para o cliente via WABA
                                                // await sendMessage({
                                                //   messaging_product: 'whatsapp',
                                                //   to: '+' + from,
                                                //   type: 'image',
                                                //   image: {
                                                //     id: mediaId, // ID da mídia no WABA
                                                //     caption: `Aqui está o Coódigo PIX para pagamento  Copia e Cola. Total: R$ ${totalPrice.toFixed(2)}.`,
                                                //   },
                                                // });
                                                // Enviar o código "copia e cola" do PIX
                                                await (0, messagingService_1.sendMessage)({
                                                    messaging_product: 'whatsapp',
                                                    to: '+' + from,
                                                    type: 'text',
                                                    text: {
                                                        body: `Aqui está o Código PIX copia e cola. Estamos aguardando a finalização do pagamento para confirmar a compra. Total: R$ ${totalPriceWithDelivery}.`,
                                                    },
                                                }, store.wabaEnvironments);
                                                console.log('Payload do PIX enviado ao cliente:', Number(totalPriceWithDelivery), payload);
                                                // Enviar o código "copia e cola" do PIX
                                                await (0, messagingService_1.sendMessage)({
                                                    messaging_product: 'whatsapp',
                                                    to: '+' + from,
                                                    type: 'text',
                                                    text: {
                                                        body: `${payload}`,
                                                    },
                                                }, store.wabaEnvironments);
                                                // Atualizar o fluxo para aguardar confirmação de pagamento
                                                await (0, conversationController_1.updateConversation)(currentConversation, {
                                                    flow: 'WAITING_PAYMENT_CONFIRMATION',
                                                });
                                            }
                                            catch (error) {
                                                (0, messagingService_1.notifyAdmin)('Erro ao processar pagamento via PIX:', error.message);
                                                await (0, messagingService_1.sendMessage)({
                                                    messaging_product: 'whatsapp',
                                                    to: '+' + from,
                                                    type: 'text',
                                                    text: {
                                                        body: 'Desculpe, ocorreu um erro ao gerar o QR Code para pagamento via PIX. Por favor, tente novamente mais tarde.',
                                                    },
                                                }, store.wabaEnvironments);
                                            }
                                            break;
                                        case 'credit_card':
                                            try {
                                                // buscar o conversation no bd
                                                const currentConversationDB = await (0, conversationController_1.getConversationByDocId)(currentConversation.docId);
                                                if (!currentConversationDB) {
                                                    (0, messagingService_1.notifyAdmin)('Erro: Conversa não encontrada no banco de dados.');
                                                    await (0, messagingService_1.sendMessage)({
                                                        messaging_product: 'whatsapp',
                                                        to: '+' + from,
                                                        type: 'text',
                                                        text: {
                                                            body: 'Desculpe, ocorreu um erro ao processar seu pedido. Por favor, tente novamente.',
                                                        },
                                                    }, store.wabaEnvironments);
                                                    return;
                                                }
                                                const totalPrice = (currentConversationDB.totalPrice || 0);
                                                // Somar o preço da entrega (store.deliveryPrice)
                                                const deliveryPrice = currentConversation.deliveryPrice || store.deliveryPrice || 0;
                                                const totalPriceWithDelivery = Number((totalPrice + deliveryPrice).toFixed(2));
                                                console.log('Total do pedido:', totalPriceWithDelivery);
                                                // Calcular o número máximo de parcelas permitido
                                                const minInstallmentValue = 5.0; // Valor mínimo por parcela (definido pelo Asaas)
                                                const maxInstallmentCount = Math.min(12, // Limite máximo de parcelas configurado
                                                Math.floor(totalPriceWithDelivery / minInstallmentValue) // Parcelas permitidas pelo valor mínimo
                                                );
                                                if (maxInstallmentCount < 1) {
                                                    throw new Error('O valor total do pedido é muito baixo para ser parcelado.');
                                                }
                                                // Criar o link de pagamento via cartão de crédito
                                                const paymentResponse = await (0, asaasServce_1.generateCreditCardPaymentLink)({
                                                    name: 'Pagamento do Pedido',
                                                    description: 'Pagamento do pedido realizado via WhatsApp',
                                                    endDate: new Date(new Date().setDate(new Date().getDate() + 7)).toISOString().split('T')[0], // Data de encerramento (7 dias a partir de hoje)
                                                    value: totalPriceWithDelivery,
                                                    billingType: 'CREDIT_CARD', // Forma de pagamento: Cartão de Crédito
                                                    chargeType: 'INSTALLMENT', // Permitir parcelamento
                                                    maxInstallmentCount, // Número máximo de parcelas calculado
                                                    externalReference: `order-${currentConversation.docId}`, // Referência externa
                                                    notificationEnabled: true, // Habilitar notificações
                                                });
                                                console.log('Resposta completa do link de pagamento:', paymentResponse);
                                                // Enviar o link de pagamento para o cliente
                                                await (0, messagingService_1.sendMessage)({
                                                    messaging_product: 'whatsapp',
                                                    to: '+' + from,
                                                    type: 'text',
                                                    text: {
                                                        body: `Aqui está o link para pagamento via cartão de crédito. Total: R$ ${totalPriceWithDelivery.toFixed(2)}.\n\nAcesse o link para concluir o pagamento: ${paymentResponse.url}`,
                                                    },
                                                }, store.wabaEnvironments);
                                                // Atualizar o fluxo para aguardar confirmação de pagamento
                                                await (0, conversationController_1.updateConversation)(currentConversation, {
                                                    flow: 'WAITING_PAYMENT_CONFIRMATION',
                                                    paymentDetails: paymentResponse, // Salvar os detalhes do pagamento no banco de dados
                                                });
                                            }
                                            catch (error) {
                                                (0, messagingService_1.notifyAdmin)('Erro ao processar pagamento via cartão de crédito:', error.message);
                                                await (0, messagingService_1.sendMessage)({
                                                    messaging_product: 'whatsapp',
                                                    to: '+' + from,
                                                    type: 'text',
                                                    text: {
                                                        body: 'Desculpe, ocorreu um erro ao gerar o link de pagamento via cartão de crédito. Por favor, tente novamente mais tarde.',
                                                    },
                                                }, store.wabaEnvironments);
                                            }
                                            break;
                                        case 'on_delivery':
                                            // TODO: Implementar fluxo para pagamento na entrega
                                            try {
                                                // buscar o conversation no bd
                                                const currentConversationDB = await (0, conversationController_1.getConversationByDocId)(currentConversation.docId);
                                                if (!currentConversationDB) {
                                                    (0, messagingService_1.notifyAdmin)('Erro: Conversa não encontrada no banco de dados.');
                                                    await (0, messagingService_1.sendMessage)({
                                                        messaging_product: 'whatsapp',
                                                        to: '+' + from,
                                                        type: 'text',
                                                        text: {
                                                            body: 'Desculpe, ocorreu um erro ao processar seu pedido. Por favor, tente novamente.',
                                                        },
                                                    }, store.wabaEnvironments);
                                                    return;
                                                }
                                                const totalPrice = (currentConversationDB.totalPrice || 0);
                                                if (!totalPrice) {
                                                    // TODO: handle, it should be greater than 0
                                                    return;
                                                }
                                                // Somar o preço da entrega (store.deliveryPrice)
                                                const deliveryPrice = currentConversation.deliveryPrice || store.deliveryPrice || 0;
                                                const totalPriceWithDelivery = Number((totalPrice + deliveryPrice).toFixed(2));
                                                console.log('Total do pedido:', totalPriceWithDelivery);
                                                // console.log('Link de pagamento enviado ao usuário:', paymentLink);
                                                // Excluir o documento Conversation
                                                const paymentId = `payment-${Date.now()}`; // Simular um ID de pagamento
                                                currentConversationDB.paymentMethod = 'DELIVERY';
                                                await (0, ordersController_1.createOrder)(currentConversationDB, paymentId);
                                                if (currentConversationDB.docId) {
                                                    await (0, conversationController_1.deleteConversation)(currentConversationDB.docId);
                                                    // console.log('Documento Conversation excluído com sucesso.');
                                                }
                                                else {
                                                    (0, messagingService_1.notifyAdmin)('Erro: Nenhum docId encontrado para excluir a conversa.');
                                                }
                                                // Enviar o link de pagamento para o cliente
                                                await (0, messagingService_1.sendMessage)({
                                                    messaging_product: 'whatsapp',
                                                    to: '+' + from,
                                                    type: 'text',
                                                    text: {
                                                        body: `Obrigado pelo seu pedido! O pagamento será realizado na entrega. Total: R$ ${totalPriceWithDelivery.toFixed(2)}.`,
                                                    },
                                                }, store.wabaEnvironments);
                                                if (store.whatsappNumber) {
                                                    // enviar mensagem para a loja no numero store.whatsappNumber, sobre a compra efeturada
                                                    await (0, messagingService_1.sendMessage)({
                                                        messaging_product: 'whatsapp',
                                                        to: store.whatsappNumber,
                                                        type: 'text',
                                                        text: {
                                                            body: `Novo pedido recebido de ${currentConversationDB.customerName} (${currentConversationDB.phoneNumber}). Total: R$ ${totalPriceWithDelivery.toFixed(2)}.`,
                                                        },
                                                    }, store.wabaEnvironments);
                                                }
                                            }
                                            catch (error) {
                                                (0, messagingService_1.notifyAdmin)('Erro ao gerar link de pagamento:', error.message);
                                                await (0, messagingService_1.sendMessage)({
                                                    messaging_product: 'whatsapp',
                                                    to: '+' + from,
                                                    type: 'text',
                                                    text: {
                                                        body: 'Desculpe, ocorreu um erro ao gerar o link de pagamento. Por favor, tente novamente mais tarde.',
                                                    },
                                                }, store.wabaEnvironments);
                                            }
                                            break;
                                        default:
                                            (0, messagingService_1.notifyAdmin)('Método de pagamento não reconhecido:', listReplyId);
                                            await (0, messagingService_1.sendMessage)({
                                                messaging_product: 'whatsapp',
                                                to: '+' + from,
                                                type: 'text',
                                                text: {
                                                    body: 'Desculpe, o método de pagamento selecionado não é válido. Por favor, tente novamente.',
                                                },
                                            }, store.wabaEnvironments);
                                            break;
                                    }
                                }
                                if (currentConversation.flow === 'COLLECT_PRODUCT_LIST_ITEM') {
                                    if (listReplyId === 'change_category') {
                                        console.log('Usuário selecionou "Alterar Categoria".');
                                        return;
                                    }
                                    const productId = parseInt(listReplyId.split('_')[1], 10);
                                    await (0, shoppingService_1.handleProductSelection)(from, productId, store, currentConversation);
                                    return;
                                }
                                return;
                            }
                            break;
                        default:
                        // console.log(`Tipo de mensagem não suportado: ${type}`);
                    }
                }
            });
        });
        res.status(200).send('EVENT_RECEIVED');
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao processar mensagem:', error);
        res.status(500).send('Erro ao processar mensagem');
    }
});
exports.default = router;
