"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const notificationService_1 = require("../../services/notificationService");
const router = (0, express_1.Router)();
/**
 * Registra um token de dispositivo
 */
const registerToken = async (req, res) => {
    try {
        const { token, storeId, platform } = req.body;
        if (!token || !storeId || !platform) {
            res.status(400).json({
                error: 'Token, storeId and platform are required'
            });
            return;
        }
        if (platform !== 'ios' && platform !== 'android') {
            res.status(400).json({
                error: 'Platform must be ios or android'
            });
            return;
        }
        await notificationService_1.notificationService.registerDeviceToken(token, storeId, platform);
        res.json({
            success: true,
            message: 'Device token registered successfully'
        });
    }
    catch (error) {
        console.error('Error registering device token:', error);
        res.status(500).json({
            error: 'Internal server error'
        });
    }
};
/**
 * Remove um token de dispositivo
 */
const unregisterToken = async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            res.status(400).json({
                error: 'Token is required'
            });
            return;
        }
        await notificationService_1.notificationService.unregisterDeviceToken(token);
        res.json({
            success: true,
            message: 'Device token unregistered successfully'
        });
    }
    catch (error) {
        console.error('Error unregistering device token:', error);
        res.status(500).json({
            error: 'Internal server error'
        });
    }
};
/**
 * Envia notificação de teste
 */
const testNotification = async (req, res) => {
    try {
        const { token, title, body, data } = req.body;
        if (!token || !title || !body) {
            res.status(400).json({
                error: 'Token, title and body are required'
            });
            return;
        }
        const success = await notificationService_1.notificationService.sendPushNotification(token, {
            title,
            body,
            data: data || {}
        });
        if (success) {
            res.json({
                success: true,
                message: 'Test notification sent successfully'
            });
        }
        else {
            res.status(500).json({
                error: 'Failed to send test notification'
            });
        }
    }
    catch (error) {
        console.error('Error sending test notification:', error);
        res.status(500).json({
            error: 'Internal server error'
        });
    }
};
/**
 * Envia notificação para toda a loja
 */
const notifyStore = async (req, res) => {
    try {
        const { storeId, title, body, data } = req.body;
        if (!storeId || !title || !body) {
            res.status(400).json({
                error: 'StoreId, title and body are required'
            });
            return;
        }
        await notificationService_1.notificationService.sendNotificationToStore(storeId, {
            title,
            body,
            data: data || {},
            storeId
        });
        res.json({
            success: true,
            message: 'Notification sent to store successfully'
        });
    }
    catch (error) {
        console.error('Error sending notification to store:', error);
        res.status(500).json({
            error: 'Internal server error'
        });
    }
};
router.post('/register-token', registerToken);
router.post('/unregister-token', unregisterToken);
router.post('/test-notification', testNotification);
router.post('/notify-store', notifyStore);
exports.default = router;
