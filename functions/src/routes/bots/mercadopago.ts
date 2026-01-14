import express from 'express';
import cors from 'cors';
import * as admin from 'firebase-admin';
import { validateWebhookSignature, getPaymentDetails } from '../../services/mercadoPagoService';
import { getPendingOrderByReference, updatePendingOrderStatus, deletePendingOrder } from '../../controllers/pendingOrderController';
import { createOrder } from '../../controllers/ordersController';
import { sendMessage, notifyAdmin } from '../../services/messagingService';
import { notificationService } from '../../services/notificationService';
import { getStoreById } from '../../controllers/storeController';
import { OrderItemType } from '../../types/Order';

const db = admin.firestore();
const router = express.Router();
router.use(cors());

/**
 * Webhook do Mercado Pago
 * Recebe notificações sobre mudanças de status de pagamento
 */
router.post('/webhook', async (req: any, res: any) => {
  try {
    console.log('📩 Webhook do Mercado Pago recebido');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));

    const xSignature = req.headers['x-signature'];
    const xRequestId = req.headers['x-request-id'];
    const notification = req.body;

    // Verificar se é notificação de teste
    if (notification.action === 'test') {
      console.log('🧪 Notificação de teste recebida');
      return res.status(200).json({ message: 'Test notification received' });
    }

    // Validar assinatura do webhook
    if (xSignature && xRequestId && notification.data?.id) {
      const isValid = validateWebhookSignature(xSignature, xRequestId, notification.data.id);

      if (!isValid) {
        console.error('❌ Assinatura do webhook inválida');
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }

      console.log('✅ Assinatura do webhook validada');
    }

    // Processar notificação
    if (notification.type !== 'payment') {
      console.log(`ℹ️ Tipo de notificação ignorado: ${notification.type}`);
      return res.status(200).json({ message: 'Notification type not handled' });
    }

    // Buscar detalhes do pagamento
    const paymentId = notification.data.id;
    console.log('🔍 Buscando detalhes do pagamento:', paymentId);

    const paymentDetails = await getPaymentDetails(paymentId);
    console.log('💳 Status do pagamento:', paymentDetails.status);
    console.log('📝 External Reference:', paymentDetails.external_reference);

    if (!paymentDetails.external_reference) {
      console.error('❌ External reference não encontrado no pagamento');
      return res.status(400).json({ error: 'External reference not found' });
    }

    // Buscar pedido pendente
    const pendingOrder = await getPendingOrderByReference(paymentDetails.external_reference);

    if (!pendingOrder) {
      console.error('❌ Pedido pendente não encontrado:', paymentDetails.external_reference);
      return res.status(404).json({ error: 'Pending order not found' });
    }

    console.log('📦 Pedido pendente encontrado:', pendingOrder.externalReference);

    // Processar de acordo com o status do pagamento
    switch (paymentDetails.status) {
      case 'approved':
        console.log('✅ PAGAMENTO APROVADO - Criando pedido...');

        try {
          // Atualizar status do pedido pendente
          await updatePendingOrderStatus(
            pendingOrder.externalReference,
            'approved',
            paymentId
          );

          // Buscar dados da loja
          const store = await getStoreById(pendingOrder.storeId);

          if (!store || !store.wabaEnvironments) {
            console.error('❌ Loja não encontrada ou sem WhatsApp configurado');
            return res.status(400).json({ error: 'Store not configured' });
          }

          // Calcular totais
          const subtotal = pendingOrder.totalPrice;
          const deliveryPrice = pendingOrder.deliveryPrice || 0;
          const totalFinal = subtotal + deliveryPrice;
          const isDelivery = pendingOrder.deliveryOption === 'DELIVERY';

          // Criar o pedido no sistema
          const conversationData = {
            date: new Date(),
            flow: 'ORDER_COMPLETED',
            phoneNumber: pendingOrder.phoneNumber,
            customerName: pendingOrder.customerName,
            deliveryOption: isDelivery ? 'delivery' : 'counter',
            address: pendingOrder.address,
            cartItems: pendingOrder.items.map(item => item as any),
            totalPrice: subtotal,
            deliveryPrice: deliveryPrice,
            paymentMethod: pendingOrder.paymentMethod,
            store: store,
            selectedAnswers: []
          };

          const newOrder = await createOrder(conversationData as any, paymentId, pendingOrder.storeId);

          console.log('✅ Pedido criado com sucesso:', newOrder.id);

          // Enviar notificação push para o app mobile
          try {
            await notificationService.notifyPaymentConfirmed(newOrder.id, pendingOrder.storeId);
            console.log('📱 Push notification enviada');
          } catch (error) {
            console.error('❌ Erro ao enviar push notification:', error);
          }

          // Deletar pedido pendente
          await deletePendingOrder(pendingOrder.externalReference);
          console.log('🗑️ Pedido pendente deletado');

          // Enviar mensagem de confirmação para o cliente
          const deliveryAddress = pendingOrder.address?.name || 'Endereço não informado';
          const customerAddressText = isDelivery
            ? `📍 *ENDEREÇO DE ENTREGA:* ${deliveryAddress}`
            : '🏪 *RETIRADA NA LOJA*';

          const itemsSummary = pendingOrder.items.map((item: OrderItemType) =>
            `${item.quantity}x ${item.menuName} - R$ ${item.price.toFixed(2)}`
          ).join('\n');

          const customerMessage = `🎉 *PAGAMENTO CONFIRMADO!* 🎉\n\n` +
            `✅ Seu pagamento foi aprovado pelo Mercado Pago!\n\n` +
            `📋 *Número do Pedido:* #${newOrder.id}\n` +
            `👤 *Cliente:* ${pendingOrder.customerName}\n` +
            `${customerAddressText}\n\n` +
            `🛒 *Resumo:*\n${itemsSummary}\n\n` +
            `💰 *Subtotal:* R$ ${subtotal.toFixed(2)}\n` +
            (isDelivery ? `🚚 *Entrega:* R$ ${deliveryPrice.toFixed(2)}\n` : '') +
            `💵 *TOTAL:* R$ ${totalFinal.toFixed(2)}\n\n` +
            `💳 *Forma de Pagamento:* ${pendingOrder.paymentMethod === 'PIX' ? 'PIX' : 'Cartão de Crédito'}\n\n` +
            `⏰ *STATUS:* Aguardando confirmação da loja\n` +
            `🚛 *ESTIMATIVA:* Você será notificado quando o pedido for confirmado!\n\n` +
            `Obrigado pela preferência! 😊`;

          await sendMessage({
            messaging_product: 'whatsapp',
            to: '+' + pendingOrder.phoneNumber,
            type: 'text',
            text: { body: customerMessage }
          }, store.wabaEnvironments);

          console.log('✅ Mensagem enviada para o cliente');

          // Enviar mensagem para a loja
          if (store.whatsappNumber) {
            const deliveryLabel = isDelivery ? 'entrega' : 'retirada na loja';
            const addressText = isDelivery
              ? `📍 *Endereço:* ${deliveryAddress}`
              : '🏪 *Retirada:* Na loja';

            const storeMessage = `🔔 *NOVO PEDIDO - PAGAMENTO CONFIRMADO* (${deliveryLabel})\n\n` +
              `📋 *Pedido:* #${newOrder.id}\n` +
              `👤 *Cliente:* ${pendingOrder.customerName}\n` +
              `📱 *Telefone:* ${pendingOrder.phoneNumber}\n` +
              `${addressText}\n\n` +
              `🛒 *Itens:*\n${itemsSummary}\n\n` +
              `💰 *Subtotal:* R$ ${subtotal.toFixed(2)}\n` +
              (isDelivery ? `🚚 *Entrega:* R$ ${deliveryPrice.toFixed(2)}\n` : '') +
              `💵 *TOTAL:* R$ ${totalFinal.toFixed(2)}\n\n` +
              `💳 *Pagamento:* ${pendingOrder.paymentMethod === 'PIX' ? 'PIX (Aprovado)' : 'Cartão de Crédito (Aprovado)'}\n\n` +
              `⚡ *AÇÃO NECESSÁRIA:* Confirme ou rejeite este pedido no sistema!`;

            await sendMessage({
              messaging_product: 'whatsapp',
              to: store.whatsappNumber,
              type: 'text',
              text: { body: storeMessage }
            }, store.wabaEnvironments);

            console.log('✅ Mensagem enviada para a loja');
          }

          return res.status(200).json({
            message: 'Payment processed successfully',
            orderId: newOrder.id
          });

        } catch (error: any) {
          console.error('❌ Erro ao processar pagamento aprovado:', error);
          notifyAdmin(`Erro ao criar pedido do Mercado Pago: ${error.message}`);
          return res.status(500).json({
            error: 'Error processing approved payment',
            details: error.message
          });
        }

      case 'rejected':
      case 'cancelled':
        console.log(`❌ Pagamento ${paymentDetails.status.toUpperCase()}`);

        try {
          // Atualizar status do pedido pendente
          await updatePendingOrderStatus(
            pendingOrder.externalReference,
            paymentDetails.status === 'rejected' ? 'rejected' : 'cancelled',
            paymentId
          );

          // Buscar dados da loja para enviar mensagem
          const store = await getStoreById(pendingOrder.storeId);

          if (store?.wabaEnvironments) {
            // Notificar o cliente
            const statusText = paymentDetails.status === 'rejected'
              ? '❌ *PAGAMENTO REJEITADO*'
              : '❌ *PAGAMENTO CANCELADO*';

            const clientMessage = `${statusText}\n\n` +
              `Olá ${pendingOrder.customerName},\n\n` +
              `Infelizmente seu pagamento não foi aprovado.\n\n` +
              `💰 *Valor:* R$ ${(pendingOrder.totalPrice + pendingOrder.deliveryPrice).toFixed(2)}\n` +
              `💳 *Método:* ${pendingOrder.paymentMethod === 'PIX' ? 'PIX' : 'Cartão de Crédito'}\n\n` +
              `Você pode fazer um novo pedido a qualquer momento!\n\n` +
              `Se tiver dúvidas, entre em contato conosco. 😊`;

            await sendMessage({
              messaging_product: 'whatsapp',
              to: '+' + pendingOrder.phoneNumber,
              type: 'text',
              text: { body: clientMessage }
            }, store.wabaEnvironments);

            console.log('✅ Cliente notificado sobre pagamento rejeitado/cancelado');
          }

          return res.status(200).json({
            message: 'Payment rejected/cancelled processed'
          });

        } catch (error: any) {
          console.error('❌ Erro ao processar pagamento rejeitado:', error);
          return res.status(500).json({
            error: 'Error processing rejected payment',
            details: error.message
          });
        }

      case 'pending':
      case 'in_process':
        console.log(`⏳ Pagamento em processamento: ${paymentDetails.status}`);

        // Atualizar status do pedido pendente se necessário
        await updatePendingOrderStatus(
          pendingOrder.externalReference,
          'pending',
          paymentId
        );

        return res.status(200).json({
          message: 'Payment pending, waiting for confirmation'
        });

      default:
        console.log(`ℹ️ Status de pagamento não tratado: ${paymentDetails.status}`);
        return res.status(200).json({
          message: 'Payment status not handled',
          status: paymentDetails.status
        });
    }

  } catch (error: any) {
    console.error('❌ Erro ao processar webhook do Mercado Pago:', error);
    notifyAdmin(`Erro no webhook do Mercado Pago: ${error.message}`);
    return res.status(500).json({
      error: 'Error processing webhook',
      details: error.message
    });
  }
});

export default router;
