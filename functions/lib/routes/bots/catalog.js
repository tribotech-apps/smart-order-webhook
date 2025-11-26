"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const whatsappCatalogService_1 = require("../../services/whatsappCatalogService");
const router = express_1.default.Router();
/**
 * Rota para listar todos os produtos do catálogo
 */
router.get('/', async (req, res) => {
    try {
        const catalogItems = await (0, whatsappCatalogService_1.listCatalogItems)();
        res.status(200).json(catalogItems);
    }
    catch (error) {
        console.error('Erro ao listar itens do catálogo:', error.message);
        res.status(500).json({ error: 'Erro ao listar itens do catálogo' });
    }
});
/**
 * Rota para adicionar um novo produto ao catálogo
 */
router.post('/', async (req, res) => {
    try {
        const { name, description, price, currency, image_url } = req.body;
        if (!name || !description || !price || !currency || !image_url) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios: name, description, price, currency, image_url' });
        }
        console.log('Adicionando produto ao catálogo:', { name, description, price, currency, image_url });
        const newProduct = await (0, whatsappCatalogService_1.addCatalogItem)({ name, description, price, currency, image_url });
        res.status(201).json(newProduct);
    }
    catch (error) {
        console.error('Erro ao adicionar produto ao catálogo:', error.message);
        res.status(500).json({ error: 'Erro ao adicionar produto ao catálogo' });
    }
});
/**
 * Rota para atualizar um produto existente no catálogo
 */
router.put('/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const { name, description, price, currency } = req.body;
        if (!productId) {
            return res.status(400).json({ error: 'O ID do produto é obrigatório' });
        }
        const updatedProduct = await (0, whatsappCatalogService_1.updateCatalogItem)(productId, { name, description, price, currency });
        res.status(200).json(updatedProduct);
    }
    catch (error) {
        console.error('Erro ao atualizar produto no catálogo:', error.message);
        res.status(500).json({ error: 'Erro ao atualizar produto no catálogo' });
    }
});
/**
 * Rota para excluir um produto do catálogo
 */
router.delete('/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        if (!productId) {
            return res.status(400).json({ error: 'O ID do produto é obrigatório' });
        }
        await (0, whatsappCatalogService_1.deleteCatalogItem)(productId);
        res.status(204).send(); // No Content
    }
    catch (error) {
        console.error('Erro ao excluir produto do catálogo:', error.message);
        res.status(500).json({ error: 'Erro ao excluir produto do catálogo' });
    }
});
exports.default = router;
