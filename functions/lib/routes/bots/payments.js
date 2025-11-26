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
const ordersController_1 = require("../../controllers/ordersController");
const messagingService_1 = require("../../services/messagingService");
const notificationService_1 = require("../../services/notificationService");
const conversationController_1 = require("../../controllers/conversationController");
const db = admin.firestore();
const router = express_1.default.Router();
router.use((0, cors_1.default)());
router.post('/asaas/pix-payment', async (req, res) => {
    try {
        const payload = req.body;
        console.log('Payload recebido do Asaas:', payload);
        // Verificar se o payload contém os campos necessários
        if (!payload.event || !payload.payment) {
            return res.status(400).json({ error: 'Payload inválido. Campos obrigatórios: event, payment.' });
        }
        const event = payload.event;
        const payment = payload.payment;
        console.log(`Evento recebido: ${event}`);
        console.log(`Detalhes da transferência:`, payment);
        // Processar eventos de transferência
        switch (event) {
            case 'PAYMENT_RECEIVED':
                console.log('Pagamento concluída com sucesso:', payment);
                try {
                    const externalReference = payment.externalReference;
                    if (!externalReference) {
                        (0, messagingService_1.notifyAdmin)('Erro: externalReference não encontrado no payload.');
                        return res.status(400).json({ error: 'externalReference não encontrado no payload.' });
                    }
                    // Recuperar a conversa associada ao pagamento
                    const currentConversation = await (0, conversationController_1.getConversationByDocId)(externalReference);
                    if (!currentConversation) {
                        (0, messagingService_1.notifyAdmin)('Nenhuma conversa encontrada para o identificador End-to-End:', payment.endToEndIdentifier);
                        return res.status(404).json({ error: 'Conversa não encontrada para o identificador End-to-End.' });
                    }
                    if (!currentConversation.store?.wabaEnvironments) {
                        (0, messagingService_1.notifyAdmin)('Erro: Loja não possui WhatsApp configurado.');
                        return res.status(400).json({ error: 'Loja não possui WhatsApp configurado.' });
                    }
                    // Calcular o total do pedido
                    // const totalPrice = currentConversation.cartItems?.reduce(
                    //   (sum: number, item: { price: number; quantity: number; }) => sum + item.price * item.quantity,
                    //   0
                    // );
                    const totalPrice = currentConversation.cartItems?.reduce((sum, item) => {
                        // Calcular o preço base do item
                        let itemTotal = item.price * item.quantity;
                        // Adicionar o preço das respostas selecionadas, se existirem
                        if (item.questions) {
                            item.questions.forEach((question) => {
                                if (question.answers) {
                                    question.answers.forEach((answer) => {
                                        itemTotal += (answer.price || 0) * (answer.quantity || 1);
                                    });
                                }
                            });
                        }
                        return sum + itemTotal;
                    }, 0) || 0;
                    if (!totalPrice) {
                        (0, messagingService_1.notifyAdmin)('Erro: O total do pedido deve ser maior que 0.');
                        return res.status(400).json({ error: 'O total do pedido deve ser maior que 0.' });
                    }
                    // Somar o preço da entrega (store.deliveryPrice)
                    const deliveryPrice = currentConversation.deliveryPrice || 0;
                    const totalPriceWithDelivery = Number((totalPrice + deliveryPrice).toFixed(2));
                    console.log('Total do pedido:', totalPriceWithDelivery);
                    // Criar o ID do pagamento
                    const paymentId = payment.id;
                    // Atualizar o método de pagamento na conversa
                    currentConversation.paymentMethod = 'PIX';
                    // Criar o pedido no banco de dados
                    const newOrder = await (0, ordersController_1.createOrder)(currentConversation, paymentId);
                    // Enviar notificação push para o app mobile
                    if (newOrder && currentConversation.store._id) {
                        try {
                            await notificationService_1.notificationService.notifyPaymentConfirmed(newOrder.id, currentConversation.store._id);
                            console.log('Push notification sent for payment confirmation:', newOrder.id);
                        }
                        catch (error) {
                            console.error('Error sending push notification for payment confirmation:', error);
                        }
                    }
                    // Excluir o documento da conversa
                    if (currentConversation.docId) {
                        await (0, conversationController_1.deleteConversation)(currentConversation.docId);
                        console.log('Documento Conversation excluído com sucesso.');
                    }
                    else {
                        (0, messagingService_1.notifyAdmin)('Erro: Nenhum docId encontrado para excluir a conversa.');
                    }
                    // Enviar mensagem de confirmação para o cliente
                    await (0, messagingService_1.sendMessage)({
                        messaging_product: 'whatsapp',
                        to: '+' + currentConversation.phoneNumber,
                        type: 'text',
                        text: {
                            body: `O pagamento foi confirmado via PIX. Total: R$ ${totalPriceWithDelivery.toFixed(2)}. Obrigado pela compra, estamos preparando seu pedido!`,
                        },
                    }, currentConversation.store.wabaEnvironments);
                    // Enviar mensagem para a loja sobre o novo pedido
                    if (currentConversation.store?.whatsappNumber) {
                        await (0, messagingService_1.sendMessage)({
                            messaging_product: 'whatsapp',
                            to: currentConversation.store.whatsappNumber,
                            type: 'text',
                            text: {
                                body: `Novo pedido recebido de ${currentConversation.customerName} (${currentConversation.phoneNumber}). Total: R$ ${totalPriceWithDelivery.toFixed(2)}.`,
                            },
                        }, currentConversation.store.wabaEnvironments);
                    }
                    return res.status(200).json({ message: 'Pedido criado com sucesso.' });
                }
                catch (error) {
                    (0, messagingService_1.notifyAdmin)('Erro ao criar o pedido:', error.message);
                    return res.status(500).json({ error: 'Erro ao criar o pedido.', details: error.message });
                }
            default:
                // console.warn('Evento não tratado:', event);
                return res.status(400).json({ error: 'Evento não tratado.' });
        }
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao processar webhook do Asaas:', error.message);
        return res.status(500).json({ error: 'Erro ao processar webhook.', details: error.message });
    }
});
router.post('/asaas/pix-payment/confirm', async (req, res) => {
    try {
        const { id } = req.body; // Recebe o ID do pagamento PIX no corpo da requisição
        if (!id) {
            return res.status(400).json({ error: 'O parâmetro "id" é obrigatório.' });
        }
        console.log(`${process.env.ASAAS_API_URL}/payment/${id}/confirm`);
        // Faz a requisição para confirmar o pagamento no Asaas
        const response = await axios_1.default.post(`${process.env.ASAAS_API_URL}/payment/${id}/confirm`, {
            headers: {
                'Content-Type': 'application/json',
                'access_token': process.env.ASAAS_API_KEY, // Token de acesso do Asaas
            },
        });
        return res.status(200).json({ message: 'Pagamento confirmado com sucesso.' });
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao confirmar pagamento PIX:', error.response?.data || error.message);
        return res.status(500).json({ error: 'Erro ao confirmar pagamento PIX.', details: error.response?.data || error.message });
    }
});
// Inicializa o servidor
const PORT = process.env.PORT || 3000;
exports.default = router;
/**
 *
 *
 * {
  "object": "customer",
  "id": "cus_000006718139",
  "dateCreated": "2025-05-21",
  "name": "Teste",
  "email": null,
  "company": null,
  "phone": null,
  "mobilePhone": null,
  "address": null,
  "addressNumber": null,
  "complement": null,
  "province": null,
  "postalCode": null,
  "cpfCnpj": "77612157071",
  "personType": "FISICA",
  "deleted": false,
  "additionalEmails": null,
  "externalReference": null,
  "notificationDisabled": false,
  "observations": null,
  "municipalInscription": null,
  "stateInscription": null,
  "canDelete": true,
  "cannotBeDeletedReason": null,
  "canEdit": true,
  "cannotEditReason": null,
  "city": null,
  "cityName": null,
  "state": null,
  "country": "Brasil"
}





{
  "id": "d1d322c7-1b65-47b2-8584-eb7adcdbff66",
  "transferId": "8b231714-7353-477b-9cd5-b711106bab6a",
  "endToEndIdentifier": null,
  "finality": null,
  "value": 194.99,
  "changeValue": null,
  "refundedValue": 0,
  "dateCreated": "2025-05-22 04:17:56",
  "effectiveDate": "2025-05-22 04:17:56",
  "scheduledDate": null,
  "status": "AWAITING_CRITICAL_ACTION_AUTHORIZATION",
  "type": "DEBIT",
  "originType": "STATIC_QRCODE",
  "conciliationIdentifier": "MBREVESI00000000643699ASA",
  "description": null,
  "transactionReceiptUrl": null,
  "chargedFeeValue": 0,
  "canBeRefunded": false,
  "refundDisabledReason": "A situação desta transação não permite que ela seja estornada.",
  "refusalReason": null,
  "canBeCanceled": true,
  "originalTransaction": null,
  "externalAccount": {
    "ispb": 19540550,
    "ispbName": "ASAAS GESTÃO FINANCEIRA INSTITUIÇÃO DE PAGAMENTO S.A.",
    "name": "MBreve Sistemas Ltda",
    "agency": "0000",
    "account": "000000",
    "accountDigit": "0",
    "accountType": "PAYMENT_ACCOUNT",
    "cpfCnpj": "51.579.438/0001-07",
    "addressKey": "51579438000107",
    "addressKeyType": "CNPJ"
  },
  "qrCode": {
    "payer": null,
    "conciliationIdentifier": "MBREVESI00000000643699ASA",
    "originalValue": 194.99,
    "dueDate": null,
    "interest": 0,
    "fine": 0,
    "discount": 0,
    "expirationDate": null
  },
  "payment": null,
  "addressKey": null,
  "addressKeyType": null,
  "externalReference": null
}
 */ 
