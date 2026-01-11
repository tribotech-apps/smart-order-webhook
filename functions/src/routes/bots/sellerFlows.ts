import 'dotenv/config.js';
import express from 'express';
import { getStoreByWabaPhoneNumberId, getStoreStatus } from '../../controllers/storeController';

import { v4 as uuidv4 } from 'uuid';
import cors from 'cors';
import {
  createConversation,
  getRecentConversation,
} from '../../controllers/conversationController';
import { Conversation } from '../../types/Conversation';
require("firebase-functions/logger/compat");
import { notifyAdmin, sendMessage } from '../../services/messagingService';
import { handleIncomingTextMessage } from '../../services/incomingMessageService';
import { withLock, generateLockKey } from '../../utils/concurrencyControl';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { getUserByPhone } from '../../controllers/userController';
import { Client } from '@googlemaps/google-maps-services-js';
import { diagnostics, DiagnosticCategory } from '../../services/diagnosticsService';
import { getActiveOrder } from '../../controllers/ordersController';
import { processVoiceMessage, isVoiceMessage, extractAudioFromMessage } from '../../services/audioService';

const router = express.Router();
router.use(cors());
router.use(express.json()); // Middleware para processar JSON no corpo da requisição

// Variáveis de ambiente
const WABA_VERIFY_TOKEN = process.env.WABA_VERIFY_TOKEN || '';

// Rota para validar o webhook do Facebook
router.get('/webhook', (req, res) => {
  const startTime = Date.now();

  diagnostics.webhookReceived('', 'webhook_verification');
  diagnostics.debug('Validação de webhook solicitada', {
    category: DiagnosticCategory.WEBHOOK,
    action: 'webhook_verification',
    details: {
      mode: req.query['hub.mode'],
      hasToken: !!req.query['hub.verify_token'],
      hasChallenge: !!req.query['hub.challenge']
    }
  });

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Token verification
  if (mode && token === WABA_VERIFY_TOKEN) {
    const executionTime = Date.now() - startTime;
    diagnostics.info('Webhook validado com sucesso', {
      category: DiagnosticCategory.WEBHOOK,
      action: 'webhook_verified',
      executionTime
    });
    res.status(200).send(challenge);
  } else {
    const executionTime = Date.now() - startTime;
    diagnostics.warn('Falha na validação do webhook', {
      category: DiagnosticCategory.WEBHOOK,
      action: 'webhook_verification_failed',
      executionTime,
      details: { mode, tokenMatch: token === WABA_VERIFY_TOKEN }
    });
    notifyAdmin('Falha na validação do webhook');
    res.status(403).send('Forbidden');
  }
});

// Rota para processar mensagens recebidas pelo webhook
router.post('/webhook', async (req, res) => {
  const startTime = Date.now();

  diagnostics.debug('Webhook POST recebido', {
    category: DiagnosticCategory.WEBHOOK,
    action: 'webhook_post_received',
    details: {
      bodySize: JSON.stringify(req.body).length,
      hasFlowData: !!(req.body.encrypted_flow_data && req.body.encrypted_aes_key && req.body.initial_vector)
    }
  });

  // Verificar se a requisição é relacionada ao WhatsApp Flows
  // const { encrypted_flow_data, encrypted_aes_key, initial_vector } = req.body;

  /***************************************************************************************************************************** *
  /* ----------------------------------------- MENSAGENS RECEBIDAS POR TEXTO NORMAL  ------------------------------------------- */
  /***************************************************************************************************************************** */

  // Verifica o phone number origem da loja
  const storePhoneNumberId = req.body.entry[0]?.changes?.[0]?.value?.metadata?.phone_number_id; // ID do objeto recebido
  if (!storePhoneNumberId) {
    // notifyAdmin('Webhook sem phoneNumberId');
    // res.status(400).send('Bad Request');
    return;
  }

  // Busca o nome do cliente
  const customerName = req.body.entry[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name;

  // Buscar a loja pelo campo phoneNumberId
  const store = await getStoreByWabaPhoneNumberId(storePhoneNumberId);

  if (!store?.wabaEnvironments) {
    notifyAdmin('Loja não encontrada, ou wabaEnvironments nao setados para o phoneNumberId: ' + storePhoneNumberId);
    res.status(404).send('Loja não encontrada');
    return;
  }

  // Verifica se o corpo da requisição contém o objeto "entry"
  if (!req.body.entry?.length) {
    notifyAdmin('Webhook sem entrada');
    // res.status(400).send('Bad Request');
    return;
  }

  // Processar mensagens normais do WhatsApp Business API
  try {
    req.body.entry.forEach((entry: any) => {
      entry.changes.forEach(async (change: any) => {
        const value = change.value;

        if (value.messages) {
          const message = value.messages[0];

          console.log('Mensagem recebida', value, message)

          const from = message.from; // Número de telefone do remetente

          //**** MENSAGEM DE TEXTO OU VOZ ******/
          if (!message?.interactive) {
            // Use lock to prevent concurrent message processing for the same user
            const lockKey = generateLockKey(from, store._id);
            const wabaEnv = store.wabaEnvironments; // Capture reference before async context
            await withLock(lockKey, async () => {
              // Check if it's a voice message and convert to text
              if (isVoiceMessage(message)) {
                try {
                  console.log('🎤 Mensagem de voz recebida, iniciando transcrição...');

                  const audioData = extractAudioFromMessage(message);
                  if (!audioData) {
                    console.error('Erro: Não foi possível extrair dados do áudio');
                    return;
                  }

                  const transcription = await processVoiceMessage(audioData, store);
                  console.log('✅ Transcrição concluída:', transcription);

                  // Replace message content with transcribed text to continue normal flow
                  message.text = { body: transcription };
                  message.type = 'text'; // Change type to text so it continues in text flow

                } catch (error) {
                  console.error('❌ Erro ao processar mensagem de voz:', error);

                  await sendMessage({
                    messaging_product: 'whatsapp',
                    to: "+" + from,
                    type: 'text',
                    text: { body: '🎤 Desculpe, não consegui entender sua mensagem de voz. Pode enviar uma mensagem de texto?' }
                  }, wabaEnv!);

                  return;
                }
              }

              let currentConversation: Conversation | undefined = await getRecentConversation(from, store._id);

              if (!currentConversation) {
                // Check opening hour
                const storeStatus = getStoreStatus(store);
                console.log('STATUS DA LOJA', storeStatus)

                if (storeStatus !== 'ABERTA') {
                  await sendMessage({
                    messaging_product: 'whatsapp',
                    to: "+" + from,
                    type: 'text',
                    text: {
                      body: 'Olá, a loja está fechada no momento, nosso horário de atendimento é de segunda à sexta, das 08:00 as 19:00 e aos sábados, das 08:00 às 12:00.\nAgradecemos a preferência.',
                    },
                  }, wabaEnv!);

                  return;
                }

                const activeOrder = await getActiveOrder(from, store._id);
                if (activeOrder) {
                  console.log('COMPRAS ANTIGAS', currentConversation, activeOrder)

                  await sendMessage({
                    messaging_product: 'whatsapp',
                    to: "+" + from,
                    type: 'text',
                    text: { body: `Seu pedido está ${activeOrder.currentFlow.flowId === 1 ? 'Aguardando Confirmacao' : activeOrder.currentFlow.flowId === 2 ? 'Em preparação' : activeOrder.currentFlow.flowId === 3 ? 'Em rota de entrega' : activeOrder.currentFlow.flowId === 4 ? 'Entregue' : 'Cancelado'}` }
                  }, wabaEnv!)

                  return;

                }

                // ----- Novo Pedido -----
                const flowToken = uuidv4(); // ou outro gerador de token

                // Start new conversation
                const newConversation: Conversation = {
                  date: new Date(),
                  phoneNumber: from,
                  flow: 'WELCOME',
                  selectedAnswers: [],
                  deliveryPrice: store.deliveryPrice,
                  flowToken,
                  customerName,
                  store,
                  message,
                };

                const userFrom = await getUserByPhone(from);

                if (userFrom?.address) {
                  newConversation.address = userFrom.address;
                }

                const docId = await createConversation(newConversation);
                currentConversation = { ...newConversation, docId };

                await sendMessage({
                  messaging_product: 'whatsapp',
                  to: "+" + from,
                  type: 'text',
                  text: { body: `✅ Olá, tudo bem? Obrigado pela visita. Este canal é exclusivo para pedidos delivery. Um momento, por favor...` }
                }, wabaEnv!);
              } else {
                await sendMessage({
                  messaging_product: 'whatsapp',
                  to: "+" + from,
                  type: 'text',
                  text: { body: `✅ Um momento, por favor...` }
                }, wabaEnv!);
              }

              const userFrom = await getUserByPhone(from);

              await handleIncomingTextMessage(currentConversation, from, message, store, res, customerName || 'Consumidor', userFrom?.address);
            }); // Fim do withLock

          }

        }
      });
    });

    res.status(200).send('EVENT_RECEIVED');
  } catch (error) {
    notifyAdmin('Erro ao processar mensagem:', error);
    res.status(500).send('Erro ao processar mensagem');
  }
});

// Rota para Health Check
router.post('/health-check', (req, res) => {
  res.status(200).send({ data: { status: "active" } });
});

// Rota para Error Notification
router.post('/error-notification', (req, res) => {
  const { error } = req.body;

  console.error('Error Notification Received:', error);
  notifyAdmin('Error Notification Received:', error);

  res.status(200).send({ status: 'received' });
});


export default router;
