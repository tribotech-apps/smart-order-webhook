"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationService = exports.NotificationService = void 0;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const messaging_1 = require("firebase-admin/messaging");
const firebase_1 = require("../firebase");
const firestore_1 = require("firebase/firestore");
const luxon_1 = require("luxon");
class NotificationService {
    get messaging() {
        return (0, messaging_1.getMessaging)();
    }
    /**
     * Envia notificação push para um token específico
     */
    async sendPushNotification(token, notification) {
        try {
            const message = {
                token,
                notification: {
                    title: notification.title,
                    body: notification.body,
                },
                data: {
                    ...notification.data,
                    orderId: notification.orderId || '',
                    storeId: notification.storeId || '',
                    timestamp: Date.now().toString(),
                },
                android: {
                    priority: 'high',
                    notification: {
                        channelId: 'orders',
                        sound: 'default',
                        priority: 'max',
                    },
                },
                apns: {
                    payload: {
                        aps: {
                            alert: {
                                title: notification.title,
                                body: notification.body,
                            },
                            sound: 'default',
                            badge: 1,
                            'content-available': 1,
                        },
                    },
                },
            };
            const response = await this.messaging.send(message);
            console.log('Push notification sent successfully:', response);
            return true;
        }
        catch (error) {
            console.error('Error sending push notification:', error);
            return false;
        }
    }
    /**
     * Envia notificação para múltiplos tokens
     */
    async sendMulticastNotification(tokens, notification) {
        if (!tokens.length)
            return;
        try {
            const message = {
                tokens,
                notification: {
                    title: notification.title,
                    body: notification.body,
                },
                data: {
                    ...notification.data,
                    orderId: notification.orderId || '',
                    storeId: notification.storeId || '',
                    timestamp: Date.now().toString(),
                },
                android: {
                    priority: 'high',
                    notification: {
                        channelId: 'orders',
                        sound: 'default',
                        priority: 'max',
                    },
                },
                apns: {
                    payload: {
                        aps: {
                            alert: {
                                title: notification.title,
                                body: notification.body,
                            },
                            sound: 'default',
                            badge: 1,
                            'content-available': 1,
                        },
                    },
                },
            };
            const response = await this.messaging.sendEachForMulticast(message);
            console.log(`Sent ${response.successCount} notifications successfully`);
            if (response.failureCount > 0) {
                console.error(`Failed to send ${response.failureCount} notifications`);
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        console.error(`Failed token ${tokens[idx]}:`, resp.error);
                    }
                });
            }
        }
        catch (error) {
            console.error('Error sending multicast notification:', error);
        }
    }
    /**
     * Envia notificação para todos os dispositivos de uma loja
     */
    async sendNotificationToStore(storeId, notification) {
        try {
            console.log(`📱 [NOTIFICATION_SERVICE] Sending notification to store ${storeId}`);
            // Debug: Descobrir qual service account está sendo usado
            try {
                const app = firebase_admin_1.default.app();
                console.log(`🔍 [DEBUG] Project ID: ${app.options.projectId}`);
                console.log(`🔍 [DEBUG] Service account email: ${app.options.serviceAccountId || 'default'}`);
                // Tentar pegar o service account real
                const credential = app.options.credential;
                if (credential && credential.getAccessToken) {
                    console.log(`🔍 [DEBUG] Using custom credential`);
                }
                else {
                    console.log(`🔍 [DEBUG] Using default service account`);
                }
            }
            catch (debugError) {
                console.error(`🔍 [DEBUG] Error getting service account info:`, debugError);
            }
            // Buscar todos os tokens de dispositivos da loja
            const tokensQuery = (0, firestore_1.query)((0, firestore_1.collection)(firebase_1.db, 'DeviceTokens'), (0, firestore_1.where)('storeId', '==', storeId), (0, firestore_1.where)('lastUpdated', '>', luxon_1.DateTime.now().minus({ days: 30 }).toJSDate()));
            const tokensSnapshot = await (0, firestore_1.getDocs)(tokensQuery);
            const allTokens = tokensSnapshot.docs.map(doc => doc.data().token);
            // Filtrar apenas tokens FCM válidos (remover Expo tokens)
            const tokens = allTokens.filter(token => token &&
                typeof token === 'string' &&
                !token.startsWith('ExponentPushToken') &&
                token.length > 50 // FCM tokens são longos
            );
            console.log(`📱 [NOTIFICATION_SERVICE] Filtered ${allTokens.length - tokens.length} invalid tokens`);
            console.log(`📱 [NOTIFICATION_SERVICE] Found ${tokens.length} active tokens for store ${storeId}`);
            if (tokens.length === 0) {
                console.log(`📱 [NOTIFICATION_SERVICE] No active tokens found for store ${storeId}`);
                return;
            }
            await this.sendMulticastNotification(tokens, {
                ...notification,
                storeId,
            });
            console.log(`✅ [NOTIFICATION_SERVICE] Notification sent to store ${storeId}`);
        }
        catch (error) {
            console.error(`💥 [NOTIFICATION_SERVICE] Error sending notification to store ${storeId}:`, error);
            // Não re-throw para não quebrar o workflow principal
        }
    }
    /**
     * Registra um token de dispositivo
     */
    async registerDeviceToken(token, storeId, platform) {
        try {
            const deviceTokenDoc = (0, firestore_1.doc)(firebase_1.db, 'DeviceTokens', token);
            await (0, firestore_1.setDoc)(deviceTokenDoc, {
                token,
                storeId,
                platform,
                lastUpdated: luxon_1.DateTime.now().setZone('America/Sao_Paulo').toJSDate(),
            });
            console.log(`Device token registered for store ${storeId}`);
        }
        catch (error) {
            console.error('Error registering device token:', error);
        }
    }
    /**
     * Remove um token de dispositivo
     */
    async unregisterDeviceToken(token) {
        try {
            const deviceTokenDoc = (0, firestore_1.doc)(firebase_1.db, 'DeviceTokens', token);
            await (0, firestore_1.deleteDoc)(deviceTokenDoc);
            console.log('Device token unregistered');
        }
        catch (error) {
            console.error('Error unregistering device token:', error);
        }
    }
    /**
     * Notifica sobre novo pedido
     */
    async notifyNewOrder(orderId, storeId) {
        await this.sendNotificationToStore(storeId, {
            title: '🛒 Novo Pedido!',
            body: `Pedido #${orderId} recebido. Toque para confirmar.`,
            data: {
                type: 'new_order',
                action: 'open_order',
            },
            orderId,
            storeId,
        });
    }
    /**
     * Notifica sobre pagamento confirmado
     */
    async notifyPaymentConfirmed(orderId, storeId) {
        await this.sendNotificationToStore(storeId, {
            title: '✅ Pagamento Confirmado!',
            body: `Pagamento do pedido #${orderId} foi confirmado.`,
            data: {
                type: 'payment_confirmed',
                action: 'open_order',
            },
            orderId,
            storeId,
        });
    }
    /**
     * Notifica sobre pedido cancelado
     */
    async notifyOrderCancelled(orderId, storeId, reason) {
        await this.sendNotificationToStore(storeId, {
            title: '❌ Pedido Cancelado',
            body: `Pedido #${orderId} foi cancelado. ${reason || ''}`,
            data: {
                type: 'order_cancelled',
                action: 'open_order',
            },
            orderId,
            storeId,
        });
    }
}
exports.NotificationService = NotificationService;
exports.notificationService = new NotificationService();
