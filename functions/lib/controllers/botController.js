"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startPurchaseFlow = void 0;
const messagingService_1 = require("../services/messagingService");
const startPurchaseFlow = async (req, res) => {
    const { to } = req.body;
    try {
        // Enviar mensagem inicial
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: { body: 'Bem-vindo! Qual produto você gostaria de comprar?' },
        });
        res.status(200).send({ message: 'Fluxo iniciado!' });
    }
    catch (error) {
        res.status(500).send({ error: error.message });
    }
};
exports.startPurchaseFlow = startPurchaseFlow;
