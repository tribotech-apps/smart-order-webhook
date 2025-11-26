"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const notificationService_1 = require("../services/notificationService");
const diagnosticsService_1 = require("../services/diagnosticsService");
const router = (0, express_1.Router)();
// Device Token Registration Route
router.post('/', async (req, res) => {
    try {
        const { token, storeId, platform } = req.body;
        if (!token || !storeId || !platform) {
            res.status(400).json({
                error: 'Missing required fields: token, storeId, platform'
            });
            return;
        }
        if (!['ios', 'android', 'web'].includes(platform)) {
            res.status(400).json({
                error: 'Platform must be ios, android, or web'
            });
            return;
        }
        // Registro do token usando o NotificationService
        await notificationService_1.notificationService.registerDeviceToken(token, storeId, platform);
        diagnosticsService_1.diagnostics.info('Device token registered', {
            category: diagnosticsService_1.DiagnosticCategory.AUTHENTICATION,
            action: 'device_token_register',
            details: { storeId, platform }
        });
        res.json({ success: true, message: 'Device token registered successfully' });
    }
    catch (error) {
        diagnosticsService_1.diagnostics.error('Error registering device token', error, {
            category: diagnosticsService_1.DiagnosticCategory.AUTHENTICATION,
            action: 'device_token_register_error'
        });
        res.status(500).json({ error: 'Failed to register device token' });
    }
});
// Device Token Unregistration Route
router.delete('/:token', async (req, res) => {
    try {
        const { token } = req.params;
        if (!token) {
            res.status(400).json({ error: 'Token is required' });
            return;
        }
        // Remoção do token usando o NotificationService
        await notificationService_1.notificationService.unregisterDeviceToken(token);
        diagnosticsService_1.diagnostics.info('Device token unregistered', {
            category: diagnosticsService_1.DiagnosticCategory.AUTHENTICATION,
            action: 'device_token_unregister',
            details: { token: token.substring(0, 10) + '...' }
        });
        res.json({ success: true, message: 'Device token unregistered successfully' });
    }
    catch (error) {
        diagnosticsService_1.diagnostics.error('Error unregistering device token', error, {
            category: diagnosticsService_1.DiagnosticCategory.AUTHENTICATION,
            action: 'device_token_unregister_error'
        });
        res.status(500).json({ error: 'Failed to unregister device token' });
    }
});
exports.default = router;
