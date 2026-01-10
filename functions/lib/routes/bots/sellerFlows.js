"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config.js");
const express_1 = __importDefault(require("express"));
const storeController_1 = require("../../controllers/storeController");
const uuid_1 = require("uuid");
const cors_1 = __importDefault(require("cors"));
const conversationController_1 = require("../../controllers/conversationController");
require("firebase-functions/logger/compat");
const messagingService_1 = require("../../services/messagingService");
// import { buildCartTableString, buildCartTableStringFromRichText, redirectToOrderSummary } from '../../services/shoppingService';
const incomingMessageService_1 = require("../../services/incomingMessageService");
const concurrencyControl_1 = require("../../utils/concurrencyControl");
const secret_manager_1 = require("@google-cloud/secret-manager");
const userController_1 = require("../../controllers/userController");
const google_maps_services_js_1 = require("@googlemaps/google-maps-services-js");
const diagnosticsService_1 = require("../../services/diagnosticsService");
const ordersController_1 = require("../../controllers/ordersController");
const audioService_1 = require("../../services/audioService");
const client = new secret_manager_1.SecretManagerServiceClient();
const clientGoogle = new google_maps_services_js_1.Client({});
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
// Cache to store address details temporarily
const addressCache = {};
const router = express_1.default.Router();
router.use((0, cors_1.default)());
router.use(express_1.default.json()); // Middleware para processar JSON no corpo da requisição
// Variáveis de ambiente
const WABA_VERIFY_TOKEN = process.env.WABA_VERIFY_TOKEN || '';
// Função utilitária para converter imagem remota em base64 (opcional)
const convertImageToBase64 = async (imageUrl) => {
    if (!imageUrl)
        return "";
    console.log('Converting image to Base64:', imageUrl);
    try {
        const response = await fetch(imageUrl);
        if (!response.ok)
            throw new Error(`Erro ao buscar imagem: ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        return buffer.toString('base64');
    }
    catch (error) {
        console.error('Erro ao converter imagem para Base64:', error);
        return "";
    }
};
// Rota para validar o webhook do Facebook
router.get('/webhook', (req, res) => {
    const startTime = Date.now();
    diagnosticsService_1.diagnostics.webhookReceived('', 'webhook_verification');
    diagnosticsService_1.diagnostics.debug('Validação de webhook solicitada', {
        category: diagnosticsService_1.DiagnosticCategory.WEBHOOK,
        action: 'webhook_verification',
        details: {
            mode: req.query['hub.mode'],
            hasToken: !!req.query['hub.verify_token'],
            hasChallenge: !!req.query['hub.challenge']
        }
    });
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    // Token verification
    if (mode && token === WABA_VERIFY_TOKEN) {
        const executionTime = Date.now() - startTime;
        diagnosticsService_1.diagnostics.info('Webhook validado com sucesso', {
            category: diagnosticsService_1.DiagnosticCategory.WEBHOOK,
            action: 'webhook_verified',
            executionTime
        });
        res.status(200).send(challenge);
    }
    else {
        const executionTime = Date.now() - startTime;
        diagnosticsService_1.diagnostics.warn('Falha na validação do webhook', {
            category: diagnosticsService_1.DiagnosticCategory.WEBHOOK,
            action: 'webhook_verification_failed',
            executionTime,
            details: { mode, tokenMatch: token === WABA_VERIFY_TOKEN }
        });
        (0, messagingService_1.notifyAdmin)('Falha na validação do webhook');
        res.status(403).send('Forbidden');
    }
});
// Rota para processar mensagens recebidas pelo webhook
router.post('/webhook', async (req, res) => {
    const startTime = Date.now();
    diagnosticsService_1.diagnostics.debug('Webhook POST recebido', {
        category: diagnosticsService_1.DiagnosticCategory.WEBHOOK,
        action: 'webhook_post_received',
        details: {
            bodySize: JSON.stringify(req.body).length,
            hasFlowData: !!(req.body.encrypted_flow_data && req.body.encrypted_aes_key && req.body.initial_vector)
        }
    });
    // Verificar se a requisição é relacionada ao WhatsApp Flows
    // const { encrypted_flow_data, encrypted_aes_key, initial_vector } = req.body;
    /***************************************************************************************************************************** *
    /* ----------------------------------------- MENSAGENS RECEBIDAS POR TEXTO NORMAL  ------------------------------------------- */
    /***************************************************************************************************************************** */
    // Verifica o phone number origem da loja
    const storePhoneNumberId = req.body.entry[0]?.changes?.[0]?.value?.metadata?.phone_number_id; // ID do objeto recebido
    if (!storePhoneNumberId) {
        // notifyAdmin('Webhook sem phoneNumberId');
        // res.status(400).send('Bad Request');
        return;
    }
    // Busca o nome do cliente
    const customerName = req.body.entry[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name;
    // Buscar a loja pelo campo phoneNumberId
    const store = await (0, storeController_1.getStoreByWabaPhoneNumberId)(storePhoneNumberId);
    if (!store?.wabaEnvironments) {
        (0, messagingService_1.notifyAdmin)('Loja não encontrada, ou wabaEnvironments nao setados para o phoneNumberId: ' + storePhoneNumberId);
        res.status(404).send('Loja não encontrada');
        return;
    }
    // Verifica se o corpo da requisição contém o objeto "entry"
    if (!req.body.entry?.length) {
        (0, messagingService_1.notifyAdmin)('Webhook sem entrada');
        // res.status(400).send('Bad Request');
        return;
    }
    // Processar mensagens normais do WhatsApp Business API
    try {
        req.body.entry.forEach((entry) => {
            entry.changes.forEach(async (change) => {
                const value = change.value;
                if (value.messages) {
                    const message = value.messages[0];
                    console.log('Mensagem recebida', value, message);
                    const from = message.from; // Número de telefone do remetente
                    //**** MENSAGEM DE TEXTO OU VOZ ******/
                    if (!message?.interactive) {
                        // Use lock to prevent concurrent message processing for the same user
                        const lockKey = (0, concurrencyControl_1.generateLockKey)(from, store._id);
                        const wabaEnv = store.wabaEnvironments; // Capture reference before async context
                        await (0, concurrencyControl_1.withLock)(lockKey, async () => {
                            // Check if it's a voice message and convert to text
                            if ((0, audioService_1.isVoiceMessage)(message)) {
                                try {
                                    console.log('🎤 Mensagem de voz recebida, iniciando transcrição...');
                                    const audioData = (0, audioService_1.extractAudioFromMessage)(message);
                                    if (!audioData) {
                                        console.error('Erro: Não foi possível extrair dados do áudio');
                                        return;
                                    }
                                    const transcription = await (0, audioService_1.processVoiceMessage)(audioData, store);
                                    console.log('✅ Transcrição concluída:', transcription);
                                    // Replace message content with transcribed text to continue normal flow
                                    message.text = { body: transcription };
                                    message.type = 'text'; // Change type to text so it continues in text flow
                                }
                                catch (error) {
                                    console.error('❌ Erro ao processar mensagem de voz:', error);
                                    await (0, messagingService_1.sendMessage)({
                                        messaging_product: 'whatsapp',
                                        to: "+" + from,
                                        type: 'text',
                                        text: { body: '🎤 Desculpe, não consegui entender sua mensagem de voz. Pode enviar uma mensagem de texto?' }
                                    }, wabaEnv);
                                    return;
                                }
                            }
                            let currentConversation = await (0, conversationController_1.getRecentConversation)(from, store._id);
                            if (!currentConversation) {
                                // Check opening hour
                                const storeStatus = (0, storeController_1.getStoreStatus)(store);
                                console.log('STATUS DA LOJA', storeStatus);
                                if (storeStatus !== 'ABERTA') {
                                    await (0, messagingService_1.sendMessage)({
                                        messaging_product: 'whatsapp',
                                        to: "+" + from,
                                        type: 'text',
                                        text: {
                                            body: 'Olá, a loja está fechada no momento, nosso horário de atendimento é de segunda à sexta, das 08:00 as 19:00 e aos sábados, das 08:00 às 12:00.\nAgradecemos a preferência.',
                                        },
                                    }, wabaEnv);
                                    return;
                                }
                                const activeOrder = await (0, ordersController_1.getActiveOrder)(from, store._id);
                                if (activeOrder) {
                                    console.log('COMPRAS ANTIGAS', currentConversation, activeOrder);
                                    await (0, messagingService_1.sendMessage)({
                                        messaging_product: 'whatsapp',
                                        to: "+" + from,
                                        type: 'text',
                                        text: { body: `Seu pedido está ${activeOrder.currentFlow.flowId === 1 ? 'Aguardando Confirmacao' : activeOrder.currentFlow.flowId === 2 ? 'Em preparação' : activeOrder.currentFlow.flowId === 3 ? 'Em rota de entrega' : activeOrder.currentFlow.flowId === 4 ? 'Entregue' : 'Cancelado'}` }
                                    }, wabaEnv);
                                    return;
                                }
                                // ----- Novo Pedido -----
                                const flowToken = (0, uuid_1.v4)(); // ou outro gerador de token
                                // Start new conversation
                                const newConversation = {
                                    date: new Date(),
                                    phoneNumber: from,
                                    flow: 'WELCOME',
                                    selectedAnswers: [],
                                    deliveryPrice: store.deliveryPrice,
                                    flowToken,
                                    customerName,
                                    store,
                                    message,
                                };
                                const userFrom = await (0, userController_1.getUserByPhone)(from);
                                if (userFrom?.address) {
                                    newConversation.address = userFrom.address;
                                }
                                const docId = await (0, conversationController_1.createConversation)(newConversation);
                                currentConversation = { ...newConversation, docId };
                                await (0, messagingService_1.sendMessage)({
                                    messaging_product: 'whatsapp',
                                    to: "+" + from,
                                    type: 'text',
                                    text: { body: `✅ Olá, tudo bem? Obrigado pela visita. Este canal é exclusivo para pedidos delivery. Um momento, por favor...` }
                                }, wabaEnv);
                            }
                            const userFrom = await (0, userController_1.getUserByPhone)(from);
                            await (0, incomingMessageService_1.handleIncomingTextMessage)(currentConversation, from, message, store, res, customerName || 'Consumidor', userFrom?.address);
                        }); // Fim do withLock
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
// Rota para Health Check
router.post('/health-check', (req, res) => {
    res.status(200).send({ data: { status: "active" } });
});
// Rota para Error Notification
router.post('/error-notification', (req, res) => {
    const { error } = req.body;
    console.error('Error Notification Received:', error);
    (0, messagingService_1.notifyAdmin)('Error Notification Received:', error);
    res.status(200).send({ status: 'received' });
});
exports.default = router;
