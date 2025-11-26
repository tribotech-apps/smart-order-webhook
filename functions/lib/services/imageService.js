"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteImageFromWABA = exports.uploadImageFromUrlToWABAGeneric = exports.uploadImageFromUrlToWABA = void 0;
exports.uploadImageToWABA = uploadImageToWABA;
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const messagingService_1 = require("../services/messagingService");
const uploadImageFromUrlToWABA = async (imageUrl, wabaEnvironments) => {
    const url = `https://graph.facebook.com/${process.env.WABA_VERSION}/${wabaEnvironments.wabaPhoneNumberId}/media`;
    try {
        // Faz o download da imagem como um buffer
        const imageResponse = await axios_1.default.get(imageUrl, { responseType: 'arraybuffer' });
        // Cria um formulário com a imagem
        const formData = new form_data_1.default();
        formData.append('file', Buffer.from(imageResponse.data), {
            filename: 'image.jpg',
            contentType: imageResponse.headers['content-type'] || 'image/jpeg',
        });
        formData.append('type', 'image/jpeg'); // Tipo de mídia
        formData.append('messaging_product', 'whatsapp'); // Produto de mensagens
        console.log('Enviando imagem para o WABA:', formData);
        // Faz a requisição para o WABA
        const response = await axios_1.default.post(url, formData, {
            headers: {
                Authorization: `Bearer ${wabaEnvironments.wabaAccessToken}`,
                ...formData.getHeaders(), // Inclui os cabeçalhos do FormData
            },
        });
        const mediaId = response.data.id;
        // console.log('Imagem enviada com sucesso. ID da mídia:', mediaId);
        return mediaId;
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao enviar imagem ao WABA:', error.response?.data || error.message);
        throw new Error('Erro ao enviar imagem ao WABA');
    }
};
exports.uploadImageFromUrlToWABA = uploadImageFromUrlToWABA;
const uploadImageFromUrlToWABAGeneric = async (imageUrl, contentType, wabaEnvironments) => {
    const url = `https://graph.facebook.com/${process.env.WABA_VERSION}/${wabaEnvironments.wabaPhoneNumberId}/media`;
    try {
        // Faz o download da imagem como um buffer
        const imageResponse = await axios_1.default.get(imageUrl, { responseType: 'arraybuffer' });
        // Cria um formulário com a imagem
        const formData = new form_data_1.default();
        formData.append('file', Buffer.from(imageResponse.data), {
            filename: `image.${contentType.split('/')[1]}`, // Define a extensão com base no tipo de conteúdo
            contentType: contentType, // Tipo de conteúdo recebido como parâmetro
        });
        formData.append('type', contentType); // Tipo de mídia
        formData.append('messaging_product', 'whatsapp'); // Produto de mensagens
        // Faz a requisição para o WABA
        const response = await axios_1.default.post(url, formData, {
            headers: {
                Authorization: `Bearer ${wabaEnvironments.wabaAccessToken}`,
                ...formData.getHeaders(), // Inclui os cabeçalhos do FormData
            },
        });
        const mediaId = response.data.id;
        console.log('Imagem enviada com sucesso. ID da mídia:', mediaId);
        return mediaId;
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao enviar imagem ao WABA:', error.response?.data || error.message);
        throw new Error('Erro ao enviar imagem ao WABA');
    }
};
exports.uploadImageFromUrlToWABAGeneric = uploadImageFromUrlToWABAGeneric;
const deleteImageFromWABA = async (mediaId, wabaEnvironments) => {
    const url = `https://graph.facebook.com/${process.env.WABA_VERSION}/${mediaId}`;
    try {
        const response = await axios_1.default.delete(url, {
            headers: {
                Authorization: `Bearer ${wabaEnvironments.wabaAccessToken}`,
            },
        });
        // console.log('Imagem deletada com sucesso. Resposta:', response.data);
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao deletar imagem do WABA:', error.response?.data || error.message);
        throw new Error('Erro ao deletar imagem do WABA');
    }
};
exports.deleteImageFromWABA = deleteImageFromWABA;
async function uploadImageToWABA(imageUrl, wabaEnvironments) {
    try {
        const id = await (0, exports.uploadImageFromUrlToWABA)(imageUrl, wabaEnvironments);
        return { id };
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao fazer upload da imagem para o WABA:', error.response?.data || error.message);
        throw new Error('Erro ao fazer upload da imagem para o WABA.');
    }
}
