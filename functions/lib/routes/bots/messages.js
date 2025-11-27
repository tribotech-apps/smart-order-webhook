"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config.js");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const messagingService_js_1 = require("../../services/messagingService.js");
const imageService_js_1 = require("../../services/imageService.js");
const path_1 = __importDefault(require("path"));
require("firebase-functions/logger/compat");
const router = express_1.default.Router();
router.use((0, cors_1.default)());
// Fazer upload da imagem
// Lista de extensões de imagens permitidas pelo WABA
const allowedImageExtensions = ['jpeg', 'png', 'webp'];
router.post('/uploadImageToWaba', async (req, res) => {
    const wabaEnvironments = typeof req.body.wabaEnvironments === 'string'
        ? JSON.parse(req.body.wabaEnvironments)
        : req.body.wabaEnvironments;
    console.log('wabaEnvironments recebido de uploadImagemToWaba', wabaEnvironments);
    if (!wabaEnvironments) {
        res.status(425).send({ error: 'wabaEnvironments não encontrado ou inválido.' });
        return;
    }
    try {
        const { imageUrl } = req.body;
        if (!imageUrl) {
            res.status(400).send({ error: 'imageUrl não fornecido.' });
            return;
        }
        // Extrair a extensão da URL da imagem
        const imageExtension = path_1.default.extname(new URL(imageUrl).pathname).replace('.', '').toLowerCase();
        console.log('Extensão da imagem extraída:', imageExtension);
        // Verificar se a extensão é permitida
        if (!allowedImageExtensions.includes(imageExtension)) {
            res.status(400).send({ error: `Extensão de imagem não permitida. Permitidas: ${allowedImageExtensions.join(', ')}` });
            return;
        }
        // Construir o formato correto para o upload (image/jpeg, image/png, etc.)
        const imageMimeType = `image/${imageExtension}`;
        // Passar a URL da imagem, o formato e os ambientes WABA para a função de upload
        const response = await (0, imageService_js_1.uploadImageFromUrlToWABAGeneric)(imageUrl, imageMimeType, wabaEnvironments);
        res.status(200).send(response);
    }
    catch (error) {
        console.error('Erro ao fazer upload da imagem:', error.message);
        res.status(500).send({ error: error.message });
    }
});
// Deletar imagem
router.post('/deleteImageFromWaba', async (req, res) => {
    console.log('deleteImageFromWaba', req.body);
    const { mediaId } = req.body;
    const wabaEnvironments = req.body.wabaEnvironments || null;
    console.log('wabaEnvironments recebido de deleteImageFromWaba', wabaEnvironments, mediaId);
    if (!wabaEnvironments) {
        res.status(400).send({ error: 'wabaEnvironments não encontrado.' });
        return;
    }
    try {
        const response = await (0, imageService_js_1.deleteImageFromWABA)(mediaId, req.body.wabaEnvironments);
        res.status(200).send(response);
    }
    catch (error) {
        res.status(500).send({ error: error.message });
    }
});
router.post('/sendOrderProduction', async (req, res) => {
    const { to, name } = req.body;
    const wabaEnvironments = req.body.wabaEnvironments || null;
    if (!wabaEnvironments) {
        res.status(400).send({ error: 'wabaEnvironments não encontrado.' });
        return;
    }
    try {
        (0, messagingService_js_1.sendConfirmationMessage)(to, wabaEnvironments);
        res.status(200);
    }
    catch (error) {
        res.status(500).send({ error: error.message });
    }
});
router.post('/sendOrderDeliveryRoute', async (req, res) => {
    const { to, name } = req.body;
    console.log('sendOrderDeliveryRoute', req.body);
    const wabaEnvironments = req.body.wabaEnvironments || null;
    if (!wabaEnvironments) {
        res.status(400).send({ error: 'wabaEnvironments não encontrado.' });
        return;
    }
    try {
        (0, messagingService_js_1.sendDeliveryMessage)(to, wabaEnvironments);
        res.status(200);
    }
    catch (error) {
        res.status(500).send({ error: error.message });
    }
});
router.post('/sendOrderDelivered', async (req, res) => {
    const { to, name } = req.body;
    const wabaEnvironments = req.body.wabaEnvironments || null;
    if (!wabaEnvironments) {
        res.status(400).send({ error: 'wabaEnvironments não encontrado.' });
        return;
    }
    try {
        (0, messagingService_js_1.sendDeliveredMessage)(to, wabaEnvironments);
        res.status(200);
    }
    catch (error) {
        res.status(500).send({ error: error.message });
    }
});
router.post('/send-whatsapp-message', async (req, res) => {
    try {
        const { phoneNumbers, message, wabaEnvironments, formatType = 'text' } = req.body;
        if (!phoneNumbers || !message || !wabaEnvironments) {
            res.status(400).json({
                error: 'phoneNumbers, message and wabaEnvironments are required'
            });
            return;
        }
        if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
            res.status(400).json({
                error: 'phoneNumbers must be a non-empty array'
            });
            return;
        }
        const results = [];
        for (const phoneNumber of phoneNumbers) {
            try {
                let formattedMessage = message;
                if (formatType === 'order-status') {
                    const { orderId, currentStage, storeName } = req.body;
                    formattedMessage = `🛍️ *${storeName || 'Loja'}*\n\n` +
                        `Seu pedido #${orderId || 'XXX'} foi atualizado!\n\n` +
                        `📋 Status atual: *${currentStage || message}*\n\n` +
                        `Obrigado pela sua confiança! 😊`;
                }
                const messagePayload = {
                    messaging_product: 'whatsapp',
                    to: phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`,
                    type: 'text',
                    text: {
                        body: formattedMessage
                    }
                };
                await (0, messagingService_js_1.sendMessage)(messagePayload, wabaEnvironments);
                results.push({
                    phoneNumber,
                    status: 'success',
                    message: 'Message sent successfully'
                });
                await (0, messagingService_js_1.delay)(500);
            }
            catch (error) {
                console.error(`Error sending message to ${phoneNumber}:`, error);
                results.push({
                    phoneNumber,
                    status: 'error',
                    error: error.message
                });
            }
        }
        res.json({
            success: true,
            results
        });
    }
    catch (error) {
        console.error('Error in send-whatsapp-message:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
});
exports.default = router;
