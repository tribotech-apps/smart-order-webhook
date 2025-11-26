import admin from 'firebase-admin';
import { getMessaging } from 'firebase-admin/messaging';
import { db } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  deleteDoc,
  setDoc
} from 'firebase/firestore';
import { DateTime } from 'luxon';

interface PushNotificationData {
  title: string;
  body: string;
  data?: Record<string, string>;
  orderId?: string;
  storeId?: string;
}

interface DeviceToken {
  token: string;
  storeId: string;
  platform: 'ios' | 'android';
  lastUpdated: Date;
}

export class NotificationService {
  private get messaging() {
    return getMessaging();
  }

  /**
   * Envia notificação push para um token específico
   */
  async sendPushNotification(
    token: string,
    notification: PushNotificationData
  ): Promise<boolean> {
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
          priority: 'high' as const,
          notification: {
            channelId: 'orders',
            sound: 'default',
            priority: 'max' as const,
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
    } catch (error) {
      console.error('Error sending push notification:', error);
      return false;
    }
  }

  /**
   * Envia notificação para múltiplos tokens
   */
  async sendMulticastNotification(
    tokens: string[],
    notification: PushNotificationData
  ): Promise<void> {
    if (!tokens.length) return;

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
          priority: 'high' as const,
          notification: {
            channelId: 'orders',
            sound: 'default',
            priority: 'max' as const,
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
    } catch (error) {
      console.error('Error sending multicast notification:', error);
    }
  }

  /**
   * Envia notificação para todos os dispositivos de uma loja
   */
  async sendNotificationToStore(
    storeId: string,
    notification: PushNotificationData
  ): Promise<void> {
    try {
      console.log(`📱 [NOTIFICATION_SERVICE] Sending notification to store ${storeId}`);
      
      // Debug: Descobrir qual service account está sendo usado
      try {
        const app = admin.app();
        console.log(`🔍 [DEBUG] Project ID: ${app.options.projectId}`);
        console.log(`🔍 [DEBUG] Service account email: ${app.options.serviceAccountId || 'default'}`);
        
        // Tentar pegar o service account real
        const credential = app.options.credential;
        if (credential && (credential as any).getAccessToken) {
          console.log(`🔍 [DEBUG] Using custom credential`);
        } else {
          console.log(`🔍 [DEBUG] Using default service account`);
        }
      } catch (debugError) {
        console.error(`🔍 [DEBUG] Error getting service account info:`, debugError);
      }

      // Buscar todos os tokens de dispositivos da loja
      const tokensQuery = query(
        collection(db, 'DeviceTokens'),
        where('storeId', '==', storeId),
        where('lastUpdated', '>', DateTime.now().minus({ days: 30 }).toJSDate())
      );
      
      const tokensSnapshot = await getDocs(tokensQuery);
      const allTokens = tokensSnapshot.docs.map(doc => doc.data().token);
      
      // Filtrar apenas tokens FCM válidos (remover Expo tokens)
      const tokens = allTokens.filter(token => 
        token && 
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
    } catch (error) {
      console.error(`💥 [NOTIFICATION_SERVICE] Error sending notification to store ${storeId}:`, error);
      // Não re-throw para não quebrar o workflow principal
    }
  }

  /**
   * Registra um token de dispositivo
   */
  async registerDeviceToken(
    token: string,
    storeId: string,
    platform: 'ios' | 'android'
  ): Promise<void> {
    try {
      const deviceTokenDoc = doc(db, 'DeviceTokens', token);
      await setDoc(deviceTokenDoc, {
        token,
        storeId,
        platform,
        lastUpdated: DateTime.now().setZone('America/Sao_Paulo').toJSDate(),
      } as DeviceToken);

      console.log(`Device token registered for store ${storeId}`);
    } catch (error) {
      console.error('Error registering device token:', error);
    }
  }

  /**
   * Remove um token de dispositivo
   */
  async unregisterDeviceToken(token: string): Promise<void> {
    try {
      const deviceTokenDoc = doc(db, 'DeviceTokens', token);
      await deleteDoc(deviceTokenDoc);

      console.log('Device token unregistered');
    } catch (error) {
      console.error('Error unregistering device token:', error);
    }
  }

  /**
   * Notifica sobre novo pedido
   */
  async notifyNewOrder(orderId: string, storeId: string): Promise<void> {
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
  async notifyPaymentConfirmed(orderId: string, storeId: string): Promise<void> {
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
  async notifyOrderCancelled(orderId: string, storeId: string, reason?: string): Promise<void> {
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

export const notificationService = new NotificationService();
