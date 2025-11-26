"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPaymentLink = sendPaymentLink;
exports.generatePaymentLink = generatePaymentLink;
exports.generatePixPayment = generatePixPayment;
exports.generateCreditCardPaymentLink = generateCreditCardPaymentLink;
// filepath: /home/marcos/Tribotech/Apps/talk-commerce-webhook-server/functions/src/services/asaasService.ts
const axios_1 = __importDefault(require("axios"));
const messagingService_1 = require("./messagingService");
const ASAAS_API_URL = process.env.ASAAS_API_URL || 'https://www.asaas.com/api/v3';
const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
if (!ASAAS_API_KEY) {
    throw new Error('Asaas API Key não configurada. Verifique o arquivo .env.');
}
const asaasClient = axios_1.default.create({
    baseURL: ASAAS_API_URL,
    headers: {
        'Content-Type': 'application/json',
        'access_token': ASAAS_API_KEY,
    },
});
if (!ASAAS_API_KEY) {
    throw new Error('Asaas API Key não configurada. Verifique o arquivo .env.');
}
async function sendPaymentLink(phoneNumber, paymentLink, wabaEnvironments) {
    const messagePayload = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: {
            body: `Seu pedido foi finalizado! Para concluir o pagamento, acesse o link: ${paymentLink}`,
        },
    };
    try {
        await (0, messagingService_1.sendMessage)(messagePayload, wabaEnvironments);
        console.log('Link de pagamento enviado ao cliente:', paymentLink);
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao enviar link de pagamento:', error.response?.data || error.message);
        throw new Error('Erro ao enviar link de pagamento');
    }
}
async function generatePaymentLink(customerName, customerEmail, customerPhone, description, value) {
    try {
        const response = await axios_1.default.post(`${ASAAS_API_URL}/paymentLinks`, {
            name: `Pagamento para ${customerName}`,
            description,
            value,
            dueDate: new Date().toISOString().split('T')[0], // Data de vencimento: hoje
            maxInstallmentCount: 1, // Apenas pagamento à vista
            chargeInterest: false,
            discount: {
                value: 0,
                dueDateLimitDays: 0,
            },
            fine: {
                value: 0,
            },
            interest: {
                value: 0,
            },
            customer: {
                name: customerName,
                email: customerEmail,
                phone: customerPhone,
            },
        }, {
            headers: {
                'Content-Type': 'application/json',
                'access_token': ASAAS_API_KEY,
            },
        });
        console.log('Link de pagamento gerado com sucesso:', response.data);
        return response.data.url; // Retorna o link de pagamento gerado
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao gerar link de pagamento:', error.response?.data || error.message);
        throw new Error('Erro ao gerar link de pagamento');
    }
}
async function generatePixPayment(description, value, expirationDate, externalReference) {
    try {
        const payload = {
            addressKey: process.env.ASAAS_ADDRESS_KEY, // Chave de endereço do Asaas
            description,
            value,
            format: "ALL",
            expirationDate,
            expirationSeconds: null,
            externalReference,
        };
        console.log('URL:', `${process.env.ASAAS_API_URL}/pix/qrCodes/static`);
        console.log('Payload enviado:', payload);
        const response = await axios_1.default.post(`${process.env.ASAAS_API_URL}/pix/qrCodes/static`, payload, {
            headers: {
                'Content-Type': 'application/json',
                'access_token': process.env.ASAAS_API_KEY, // Token de acesso do Asaas
            },
        });
        console.log('QR Code gerado com sucesso:', response.data);
        // Retorna o código QR gerado // Retorna a imagem do QR Code e o payload do QR Code
        return {
            qrCodeImage: response.data.encodedImage, // Imagem do QR Code em base64
            payload: response.data.payload, // Identificador do QR Code
        };
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao gerar o PIX:', error.response?.data || error.message);
        throw new Error('Erro ao gerar o PIX. Por favor, tente novamente mais tarde.');
    }
}
async function generateCreditCardPaymentLink(payload) {
    try {
        const response = await axios_1.default.post(`${process.env.ASAAS_API_URL}/paymentLinks`, payload, {
            headers: {
                'Content-Type': 'application/json',
                'access_token': process.env.ASAAS_API_KEY, // Token de acesso do Asaas
            },
        });
        console.log('Link de pagamento gerado com sucesso:', response.data);
        // Retorna o objeto completo da resposta
        return response.data;
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao gerar link de pagamento:', error.response?.data || error.message);
        throw new Error('Erro ao gerar link de pagamento');
    }
}
