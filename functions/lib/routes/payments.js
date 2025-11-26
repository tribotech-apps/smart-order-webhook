"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const axios_1 = __importDefault(require("axios"));
const admin = __importStar(require("firebase-admin"));
const twilio_1 = require("twilio");
// Inicializa Firebase Admin
admin.initializeApp();
const db = admin.firestore();
const router = express_1.default.Router();
router.use((0, cors_1.default)());
// Inicializa Twilio
const twilioClient = new twilio_1.Twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
// Configurações do Pagar.me
const PAGARME_API_KEY = 'sk_test_b2fd2918f5034dfea52d4dd457c88d3a';
const PAGARME_API_URL = 'https://api.pagar.me/core/v5/payment_links';
// Rota 1: Criar link de pagamento
router.post('/createPaymentLink', async (req, res) => {
    const { amount, description, customer, items } = req.body;
    console.log('Amount:', amount);
    console.log('Description:', description);
    console.log('Customer:', customer);
    console.log('Items:', items);
    try {
        const response = await axios_1.default.post(PAGARME_API_URL, {
            amount, // Valor total em centavos
            description, // Descrição do pagamento
            items: items.map((item) => ({
                id: item.id,
                title: item.description,
                unit_price: item.amount,
                quantity: item.quantity,
                tangible: false, // Define se o item é tangível
            })),
            customer: {
                name: customer.name,
                email: customer.email,
                document: customer.document,
                type: 'individual',
                phones: {
                    mobile_phone: {
                        country_code: '55',
                        area_code: customer.phone.substring(2, 4),
                        number: customer.phone.substring(4),
                    },
                },
            },
            payment_config: {
                pix: {
                    enabled: true,
                    expires_in: 3600, // Expiração do PIX em segundos (1 hora)
                },
                boleto: {
                    enabled: false,
                },
                credit_card: {
                    enabled: false,
                },
            },
            metadata: {
                custom_data: 'Informações adicionais sobre o pedido',
            },
        }, {
            headers: {
                Authorization: `Bearer ${PAGARME_API_KEY}`,
            },
        });
        const paymentLink = response.data.url;
        console.log('Payment link created:', paymentLink);
        res.send({ paymentLink });
    }
    catch (error) {
        console.error('Error creating payment link:', error.response?.data || error.message);
        res.status(500).send('Error creating payment link');
    }
});
// Rota 2: Enviar link de pagamento pelo WhatsApp
router.post('/sendPaymentLink', async (req, res) => {
    const { to, paymentLink } = req.body;
    try {
        const message = await twilioClient.messages.create({
            from: process.env.WABA_PHONE_NUMBER,
            to: `whatsapp:${to}`,
            body: `Olá! Clique no link para realizar o pagamento: ${paymentLink}`,
        });
        res.send(message);
    }
    catch (error) {
        console.error('Error sending payment link:', error);
        res.status(500).send('Error sending payment link');
    }
});
// Rota 3: Webhook para notificações de pagamento
router.post('/webhook', async (req, res) => {
    const event = req.body;
    try {
        if (event.type === 'transaction_status_changed') {
            const { id, status } = event.data;
            // Atualiza o status do pagamento no Firestore
            await db.collection('payments').doc(id).set({ status }, { merge: true });
            console.log(`Pagamento ${id} atualizado para status: ${status}`);
        }
        res.sendStatus(200);
    }
    catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).send('Error processing webhook');
    }
});
// Rota 4: Cancelar pagamento
router.post('/cancelPayment', async (req, res) => {
    const { paymentLinkId } = req.body;
    try {
        const response = await axios_1.default.post(`${PAGARME_API_URL}/${paymentLinkId}/cancel`, {}, {
            headers: {
                Authorization: `Bearer ${PAGARME_API_KEY}`,
            },
        });
        res.send(response.data);
    }
    catch (error) {
        console.error('Error canceling payment link:', error.response?.data || error.message);
        res.status(500).send('Error canceling payment link');
    }
});
// Rota 5: Tratamento de erros de pagamento
router.post('/handlePaymentError', async (req, res) => {
    const { paymentLinkId, errorMessage } = req.body;
    try {
        // Salva o erro no Firestore
        await db.collection('paymentErrors').add({
            paymentLinkId,
            errorMessage,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`Erro registrado para link de pagamento ${paymentLinkId}: ${errorMessage}`);
        res.send('Erro registrado com sucesso');
    }
    catch (error) {
        console.error('Error handling payment error:', error);
        res.status(500).send('Error handling payment error');
    }
});
// Inicializa o servidor
const PORT = process.env.PORT || 3000;
exports.default = router;
