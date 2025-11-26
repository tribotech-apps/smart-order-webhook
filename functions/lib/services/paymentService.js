"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlePagarMeCallback = exports.generatePaymentLink = void 0;
const axios_1 = __importDefault(require("axios"));
const conversationController_1 = require("../controllers/conversationController");
const messagingService_1 = require("./messagingService");
const storeController_1 = require("../controllers/storeController");
// Função para gerar um link de pagamento
const generatePaymentLink = async (conversation, totalPrice) => {
    if (!conversation.address) {
        throw new Error('Endereço não encontrado na conversa.');
    }
    if (!conversation.cartItems || conversation.cartItems.length === 0) {
        throw new Error('Nenhum item no carrinho.');
    }
    if (!totalPrice || totalPrice <= 0) {
        throw new Error('Valor total inválido.');
    }
    if (!process.env.PAGARME_API_SECRET || !process.env.PAGARME_API_URL) {
        throw new Error('Configuração do Pagar.me não encontrada.');
    }
    if (!conversation.phoneNumber) {
        throw new Error('Número de telefone do cliente não encontrado.');
    }
    if (!conversation.store?.slug) {
        // TODO: Adicionar tratamento de erro
        throw new Error('Configuração do slug da loja não encontrada.');
    }
    // Get storef 
    const store = await (0, storeController_1.getStore)(conversation.store?.slug);
    if (!store) {
        // TODO: Adicionar tratamento de erro
        throw new Error('Loja não encontrada.');
    }
    try {
        // Configurar Basic Auth
        const headers = {
            Authorization: `Basic ${Buffer.from(`${process.env.PAGARME_API_SECRET}:`).toString('base64')}`,
        };
        console.log('Headers enviados na requisição:', headers);
        // Calcular o total detalhado para cada item no carrinho
        const cartItems = conversation.cartItems.map((item) => {
            const basePrice = item.price;
            const answersTotal = item.questions?.reduce((sum, question) => {
                const selectedAnswers = question.answers || [];
                return sum + selectedAnswers.reduce((answerSum, answer) => answerSum + (answer.price || 0), 0);
            }, 0) || 0;
            const totalItemPrice = basePrice + answersTotal;
            return {
                name: item.menuName,
                amount: Math.round(totalItemPrice * 100), // Valor em centavos
                default_quantity: item.quantity || 1,
            };
        });
        // Gerar o payload para o Pagar.me
        const response = await axios_1.default.post(`${process.env.PAGARME_API_URL}/paymentlinks`, {
            is_building: false,
            type: 'order',
            payment_settings: {
                accepted_payment_methods: ['CREDIT_CARD', 'BOLETO', 'PIX'],
                credit_card_settings: {
                    operation_type: 'auth_and_capture',
                    installments: [
                        { number: 1, total: Math.round(totalPrice * 100) },
                        { number: 2, total: Math.round(totalPrice * 100) },
                        { number: 3, total: Math.round(totalPrice * 100) },
                    ],
                },
                boleto_settings: {
                    due_in: 3, // Dias para vencimento do boleto
                },
                pix_settings: {
                    expires_in: 1440, // Expiração do PIX em minutos (1 dia)
                },
            },
            cart_settings: {
                items: cartItems,
            },
        }, {
            headers,
        });
        console.log('Link de pagamento gerado:', response.data.url);
        return response.data.url;
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao gerar link de pagamento:', error.response?.data || error.message);
        throw new Error('Erro ao gerar link de pagamento.');
    }
};
exports.generatePaymentLink = generatePaymentLink;
// Função para tratar o callback do Pagar.me
const handlePagarMeCallback = async (callbackData) => {
    try {
        const { id, status, metadata } = callbackData;
        console.log('Callback recebido do Pagar.me:', callbackData);
        // Recuperar o ID da conversa
        const conversationId = metadata.conversationId;
        if (!conversationId) {
            (0, messagingService_1.notifyAdmin)('ID da conversa não encontrado no callback.');
            return;
        }
        const currentConversation = await (0, conversationController_1.getConversationByDocId)(conversationId);
        if (!currentConversation) {
            (0, messagingService_1.notifyAdmin)('Conversa não encontrada para o ID:', conversationId);
            return;
        }
        if (!currentConversation.store?.wabaEnvironments) {
            (0, messagingService_1.notifyAdmin)('Erro: currentConversation.store.wabaEnvironments não está definido.');
            return;
        }
        // Atualizar o status do pedido na conversa
        await (0, conversationController_1.updateConversation)(currentConversation, {
            paymentStatus: status,
        });
        // Informar o usuário sobre o status do pagamento
        const message = status === 'paid'
            ? 'Pagamento confirmado! Seu pedido está sendo processado.'
            : status === 'refused'
                ? 'Pagamento recusado. Por favor, tente novamente.'
                : 'Pagamento em análise. Você será notificado assim que for confirmado.';
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: conversationId, // Número do telefone do cliente
            type: 'text',
            text: {
                body: message,
            },
        }, currentConversation.store.wabaEnvironments);
        console.log('Usuário informado sobre o status do pagamento:', status);
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao processar callback do Pagar.me:', error.response?.data || error.message);
        throw new Error('Erro ao processar callback do Pagar.me.');
    }
};
exports.handlePagarMeCallback = handlePagarMeCallback;
