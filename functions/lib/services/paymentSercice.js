"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlePagarMeCallback = exports.generatePaymentLink = void 0;
const axios_1 = __importDefault(require("axios"));
const conversationController_1 = require("../controllers/conversationController");
const whatsappService_1 = require("./whatsappService");
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
    try {
        // Configurar Basic Auth
        const headers = {
            Authorization: `Basic ${Buffer.from(`${process.env.PAGARME_API_SECRET}:`).toString('base64')}`,
        };
        console.log('Headers enviados na requisição:', headers);
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
                items: conversation.cartItems?.map((item) => ({
                    name: item.menuName,
                    amount: Math.round(item.price * 100), // Valor em centavos
                    default_quantity: item.quantity || 1,
                })),
            },
        }, {
            headers,
        });
        console.log('Link de pagamento gerado:', response.data.url);
        return response.data.url;
    }
    catch (error) {
        console.error('Erro ao gerar link de pagamento:', error.response?.data || error.message);
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
            console.error('ID da conversa não encontrado no callback.');
            return;
        }
        // Atualizar o status do pedido na conversa
        await (0, conversationController_1.updateConversation)(conversationId, {
            paymentStatus: status,
        });
        // Informar o usuário sobre o status do pagamento
        const message = status === 'paid'
            ? 'Pagamento confirmado! Seu pedido está sendo processado.'
            : status === 'refused'
                ? 'Pagamento recusado. Por favor, tente novamente.'
                : 'Pagamento em análise. Você será notificado assim que for confirmado.';
        await (0, whatsappService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: conversationId, // Número do telefone do cliente
            type: 'text',
            text: {
                body: message,
            },
        });
        console.log('Usuário informado sobre o status do pagamento:', status);
    }
    catch (error) {
        console.error('Erro ao processar callback do Pagar.me:', error.response?.data || error.message);
        throw new Error('Erro ao processar callback do Pagar.me.');
    }
};
exports.handlePagarMeCallback = handlePagarMeCallback;
