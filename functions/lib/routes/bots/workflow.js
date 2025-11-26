"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const workflowService_1 = require("../../services/workflowService");
const router = (0, express_1.Router)();
/**
 * Move um pedido para o próximo estágio do workflow
 */
const moveOrderToNextFlow = async (req, res) => {
    try {
        console.log('🔄 [WORKFLOW] Received move-to-next-flow request');
        console.log('📦 [WORKFLOW] Request body:', JSON.stringify(req.body, null, 2));
        const { orderId, fromFlowId, toFlowId, minutes, batchNumber, deliveryManId, cancel, storeId } = req.body;
        console.log('🔍 [WORKFLOW] Extracted parameters:', {
            orderId,
            fromFlowId: { value: fromFlowId, type: typeof fromFlowId },
            toFlowId: { value: toFlowId, type: typeof toFlowId },
            minutes: { value: minutes, type: typeof minutes },
            batchNumber,
            deliveryManId,
            cancel,
            storeId
        });
        // Validações
        if (!orderId || !storeId) {
            console.log('❌ [WORKFLOW] Missing required fields');
            res.status(400).json({
                error: 'orderId and storeId are required'
            });
            return;
        }
        if (typeof fromFlowId !== 'number' || typeof toFlowId !== 'number') {
            console.log('❌ [WORKFLOW] Invalid flow IDs type');
            res.status(400).json({
                error: 'fromFlowId and toFlowId must be numbers'
            });
            return;
        }
        if (typeof minutes !== 'number' || minutes < 0) {
            console.log('❌ [WORKFLOW] Invalid minutes value');
            res.status(400).json({
                error: 'minutes must be a positive number'
            });
            return;
        }
        console.log('✅ [WORKFLOW] All validations passed, calling workflowService...');
        const success = await workflowService_1.workflowService.moveOrderToNextFlow({
            orderId,
            fromFlowId,
            toFlowId,
            minutes,
            batchNumber,
            deliveryManId,
            cancel: Boolean(cancel),
            storeId
        });
        console.log('🔄 [WORKFLOW] WorkflowService result:', success);
        if (success) {
            console.log('✅ [WORKFLOW] Successfully moved order');
            res.json({
                success: true,
                message: 'Order moved successfully',
                orderId,
                fromFlowId,
                toFlowId
            });
        }
        else {
            console.log('❌ [WORKFLOW] Failed to move order (workflowService returned false)');
            res.status(500).json({
                error: 'Failed to move order to next flow'
            });
        }
    }
    catch (error) {
        console.error('💥 [WORKFLOW] Critical error in moveOrderToNextFlow:', error);
        console.error('💥 [WORKFLOW] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
/**
 * Cancela um pedido
 */
const cancelOrder = async (req, res) => {
    try {
        const { orderId, reason, storeId } = req.body;
        if (!orderId || !storeId) {
            res.status(400).json({
                error: 'orderId and storeId are required'
            });
            return;
        }
        const success = await workflowService_1.workflowService.cancelOrder(orderId, reason || 'Cancelado pela loja', storeId);
        if (success) {
            res.json({
                success: true,
                message: 'Order cancelled successfully',
                orderId
            });
        }
        else {
            res.status(500).json({
                error: 'Failed to cancel order'
            });
        }
    }
    catch (error) {
        console.error('Error in cancelOrder:', error);
        res.status(500).json({
            error: 'Internal server error'
        });
    }
};
/**
 * Obtém o status atual de um pedido
 */
const getOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        if (!orderId) {
            res.status(400).json({
                error: 'orderId is required'
            });
            return;
        }
        const status = await workflowService_1.workflowService.getOrderStatus(orderId);
        res.json({
            success: true,
            data: status
        });
    }
    catch (error) {
        console.error('Error in getOrderStatus:', error);
        if (error instanceof Error && error.message.includes('not found')) {
            res.status(404).json({
                error: 'Order not found'
            });
        }
        else {
            res.status(500).json({
                error: 'Internal server error'
            });
        }
    }
};
/**
 * Rota legacy para compatibilidade com sistema antigo
 * Estas rotas devem ser gradualmente substituídas pela nova API
 */
const sendOrderProduction = async (req, res) => {
    try {
        const { orderId, storeId } = req.body;
        console.log('Legacy sendOrderProduction called, redirecting to new workflow API');
        // Para manter compatibilidade, assumir que está movendo de fila (1) para produção (2)
        const success = await workflowService_1.workflowService.moveOrderToNextFlow({
            orderId,
            fromFlowId: 1,
            toFlowId: 2,
            minutes: 0, // Para rotas legacy, usar 0 como padrão
            storeId
        });
        if (success) {
            res.json({ success: true, message: 'Order moved to production' });
        }
        else {
            res.status(500).json({ error: 'Failed to move order to production' });
        }
    }
    catch (error) {
        console.error('Error in legacy sendOrderProduction:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
const sendOrderDeliveryRoute = async (req, res) => {
    try {
        const { orderId, storeId } = req.body;
        console.log('Legacy sendOrderDeliveryRoute called, redirecting to new workflow API');
        const success = await workflowService_1.workflowService.moveOrderToNextFlow({
            orderId,
            fromFlowId: 2,
            toFlowId: 3,
            minutes: 0,
            storeId
        });
        if (success) {
            res.json({ success: true, message: 'Order moved to delivery route' });
        }
        else {
            res.status(500).json({ error: 'Failed to move order to delivery route' });
        }
    }
    catch (error) {
        console.error('Error in legacy sendOrderDeliveryRoute:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
const sendOrderDelivered = async (req, res) => {
    try {
        const { orderId, storeId } = req.body;
        console.log('Legacy sendOrderDelivered called, redirecting to new workflow API');
        const success = await workflowService_1.workflowService.moveOrderToNextFlow({
            orderId,
            fromFlowId: 3,
            toFlowId: 4,
            minutes: 0,
            storeId
        });
        if (success) {
            res.json({ success: true, message: 'Order marked as delivered' });
        }
        else {
            res.status(500).json({ error: 'Failed to mark order as delivered' });
        }
    }
    catch (error) {
        console.error('Error in legacy sendOrderDelivered:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
// Rotas da nova API
router.post('/move-to-next-flow', moveOrderToNextFlow);
router.post('/cancel-order', cancelOrder);
router.get('/order-status/:orderId', getOrderStatus);
// Rotas legacy para compatibilidade
router.post('/sendOrderProduction', sendOrderProduction);
router.post('/sendOrderDeliveryRoute', sendOrderDeliveryRoute);
router.post('/sendOrderDelivered', sendOrderDelivered);
exports.default = router;
