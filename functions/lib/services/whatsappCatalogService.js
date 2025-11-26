"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCatalogItem = exports.updateCatalogItem = exports.addCatalogItem = exports.listCatalogItems = void 0;
const axios_1 = __importDefault(require("axios"));
const WABA_API_URL = `https://graph.facebook.com/v16.0`;
const WABA_ACCESS_TOKEN = process.env.WABA_ACCESS_TOKEN;
const WABA_PHONE_NUMBER_ID = process.env.WABA_PHONE_NUMBER_ID;
if (!WABA_ACCESS_TOKEN || !WABA_PHONE_NUMBER_ID) {
    throw new Error('WABA Access Token ou Phone Number ID não configurados. Verifique o arquivo .env.');
}
// Configuração do cliente Axios para chamadas à API do WhatsApp
const whatsappClient = axios_1.default.create({
    baseURL: WABA_API_URL,
    headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${WABA_ACCESS_TOKEN}`,
    },
});
/**
 * Listar todos os produtos do catálogo
 */
const listCatalogItems = async () => {
    try {
        const response = await whatsappClient.get(`/${WABA_PHONE_NUMBER_ID}/catalog`);
        console.log('Itens do catálogo:', response.data);
        return response.data;
    }
    catch (error) {
        console.error('Erro ao listar itens do catálogo:', error.response?.data || error.message);
        throw new Error('Erro ao listar itens do catálogo');
    }
};
exports.listCatalogItems = listCatalogItems;
/**
 * Adicionar um novo produto ao catálogo
 */
const addCatalogItem = async (productData) => {
    try {
        const response = await whatsappClient.post(`/${WABA_PHONE_NUMBER_ID}/catalog`, productData);
        console.log('Produto adicionado ao catálogo:', response.data);
        return response.data;
    }
    catch (error) {
        console.error('Erro ao adicionar produto ao catálogo:', error.response?.data || error.message);
        throw new Error('Erro ao adicionar produto ao catálogo');
    }
};
exports.addCatalogItem = addCatalogItem;
/**
 * Atualizar um produto existente no catálogo
 */
const updateCatalogItem = async (productId, productData) => {
    try {
        const response = await whatsappClient.post(`/${productId}`, productData);
        console.log('Produto atualizado no catálogo:', response.data);
        return response.data;
    }
    catch (error) {
        console.error('Erro ao atualizar produto no catálogo:', error.response?.data || error.message);
        throw new Error('Erro ao atualizar produto no catálogo');
    }
};
exports.updateCatalogItem = updateCatalogItem;
/**
 * Excluir um produto do catálogo
 */
const deleteCatalogItem = async (productId) => {
    try {
        const response = await whatsappClient.delete(`/${productId}`);
        console.log('Produto excluído do catálogo:', response.data);
        return response.data;
    }
    catch (error) {
        console.error('Erro ao excluir produto do catálogo:', error.response?.data || error.message);
        throw new Error('Erro ao excluir produto do catálogo');
    }
};
exports.deleteCatalogItem = deleteCatalogItem;
