import 'dotenv/config.js';
import express from 'express';
import { getStoreByWabaPhoneNumberId, getStoreStatus } from '../../controllers/storeController';
import crypto from 'crypto';

// Função para formatar o cardápio de forma bonita
function formatBeautifulMenu(products: any[]): string {
  if (!products || products.length === 0) {
    return '📋 *Cardápio Vazio*\n\nDesculpe, não temos produtos disponíveis no momento.';
  }

  let beautifulMenu = '🍽️ *NOSSO CARDÁPIO* 🍽️\n\n';

  products.forEach((product, index) => {
    // Ícone baseado na categoria/tipo do produto
    let icon = '🍴';
    const name = product.menuName.toLowerCase();
    if (name.includes('pizza')) icon = '🍕';
    else if (name.includes('hambur') || name.includes('burger')) icon = '🍔';
    else if (name.includes('coca') || name.includes('refri') || name.includes('suco')) icon = '🥤';
    else if (name.includes('marmitex') || name.includes('marmita') || name.includes('prato')) icon = '🍱';
    else if (name.includes('sorvete') || name.includes('açaí')) icon = '🍦';
    else if (name.includes('lanche') || name.includes('sanduiche')) icon = '🥪';
    else if (name.includes('cerveja') || name.includes('bebida')) icon = '🍺';
    else if (name.includes('doce') || name.includes('sobremesa')) icon = '🧁';

    beautifulMenu += `${icon} *${product.menuName}*\n`;
    beautifulMenu += `💰 R$ ${product.price.toFixed(2).replace('.', ',')}\n`;

    if (product.menuDescription) {
      beautifulMenu += `📝 ${product.menuDescription}\n`;
    }

    // Mostrar opcionais disponíveis de forma resumida
    if (product.questions && product.questions.length > 0) {
      const optionalQuestions = product.questions.filter((q: any) => q.minAnswerRequired === 0);
      const requiredQuestions = product.questions.filter((q: any) => q.minAnswerRequired > 0);

      // if (requiredQuestions.length > 0) {
      //   beautifulMenu += `⚠️ *Inclui escolha de:* ${requiredQuestions.map((q: any) => q.questionName.toLowerCase()).join(', ')}\n`;
      // }

      if (optionalQuestions.length > 0) {
        beautifulMenu += `➕ *Adicionais disponíveis:* ${optionalQuestions.map((q: any) => q.questionName.toLowerCase()).join(', ')}\n`;
      }
    }

    beautifulMenu += '\n━━━━━━━━━━━━━━━━━━━━\n\n';
  });

  beautifulMenu += '📱 *Para fazer seu pedido, informe o nome do produto desejado!*\n\n';
  beautifulMenu += '💬 Exemplo: "Quero uma pizza margherita" ou "1 marmitex médio"';

  return beautifulMenu;
}

import { v4 as uuidv4 } from 'uuid';
import cors from 'cors';
import {
  createConversation,
  getRecentConversation,
  updateConversation
} from '../../controllers/conversationController';
import { Conversation } from '../../types/Conversation';
require("firebase-functions/logger/compat");
import { notifyAdmin, sendMessage } from '../../services/messagingService';
// import { buildCartTableString, buildCartTableStringFromRichText, redirectToOrderSummary } from '../../services/shoppingService';
import { handleIncomingTextMessage } from '../../services/incomingMessageService';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { getUserByPhone } from '../../controllers/userController';
import { Client } from '@googlemaps/google-maps-services-js';
import { diagnostics, DiagnosticCategory } from '../../services/diagnosticsService';
import { getActiveOrder } from '../../controllers/ordersController';
import { classifyCustomerIntent, extractProductsFromMessageWithAI, } from '../../services/messageHelper';
import { processVoiceMessage, isVoiceMessage, extractAudioFromMessage } from '../../services/audioService';
import { filterMenuByWeekday } from '../../services/orderService';

const client = new SecretManagerServiceClient();
const clientGoogle = new Client({});

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
// Cache to store address details temporarily
const addressCache: {
  [key: string]: {
    lat: number;
    lng: number;
    title: string;
    description: string;
    placeId: string;
    street?: string; // Rua
    number?: string; // Número
    neighborhood?: string; // Bairro
    city?: string; // Cidade
    state?: string; // Estado
    zipCode?: string; // CEP
  };
} = {};


// Função auxiliar para gerar o layout melhorado do carrinho de compras
// async function generateShoppingCartLayout(currentConversation: Conversation, cartAction = "finalizar") {
//   const deliveryAddress = currentConversation.address?.name || 'Endereço não informado';

//   // Gerar a tabela formatada como array de strings (baseada no RichText)
//   const cartTableArray = await buildCartTableStringFromRichText(
//     currentConversation.store!,
//     currentConversation.cartItems || [],
//     deliveryAddress
//   );

//   return {
//     screen: "SHOPPING_CART",
//     data: {
//       cartTable: cartTableArray,
//       cartAction: cartAction
//     },
//     layout: {
//       type: "SingleColumnLayout",
//       children: [
//         {
//           type: "TextBody",
//           markdown: true,
//           text: "${data.cartTable}"
//         },
//         {
//           type: "Form",
//           name: "cart_form",
//           children: [
//             {
//               type: "RadioButtonsGroup",
//               label: "O que deseja fazer?",
//               name: "cartAction",
//               "data-source": [
//                 {
//                   id: "finalizar",
//                   title: "Finalizar Compra"
//                 },
//                 {
//                   id: "adicionar",
//                   title: "Adicionar Mais Itens"
//                 },
//                 {
//                   id: "alterar",
//                   title: "Alterar/Excluir Itens"
//                 }
//               ],
//               required: true
//             },
//             {
//               type: "Footer",
//               label: "Avançar",
//               "on-click-action": {
//                 name: "data_exchange",
//                 payload: {
//                   cartAction: "${form.cartAction}"
//                 }
//               }
//             }
//           ]
//         }
//       ]
//     }
//   };
// }

const router = express.Router();
router.use(cors());
router.use(express.json()); // Middleware para processar JSON no corpo da requisição

// Variáveis de ambiente
const WABA_VERIFY_TOKEN = process.env.WABA_VERIFY_TOKEN || '';

// Variáveis de ambiente
async function getPrivateKey() {
  const [version] = await client.accessSecretVersion({
    name: 'projects/talkcommerce-2c6e6/secrets/talkcommerce_private_key/versions/latest',
  });

  console.log('VERSION', version)

  const privateKey = version.payload?.data?.toString();
  if (!privateKey) {
    throw new Error('PRIVATE_KEY is not defined in Secret Manager.');
  }

  // Limpa espaços em branco extras que podem causar erro na chave
  const cleanedPrivateKey = privateKey
    .split('\n')
    .map(line => line.trim())
    .join('\n');

  return cleanedPrivateKey;
}

// Função utilitária para converter imagem remota em base64 (opcional)
const convertImageToBase64 = async (imageUrl?: string): Promise<string> => {
  if (!imageUrl) return "";

  console.log('Converting image to Base64:', imageUrl);

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Erro ao buscar imagem: ${response.statusText}`);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer.toString('base64');
  } catch (error) {
    console.error('Erro ao converter imagem para Base64:', error);
    return "";
  }
};

// Exemplo de função para filtrar os campos permitidos:
async function getProductsForFlow(products: any[]): Promise<any[]> {
  return Promise.all(products.map(async prod => ({
    id: String(prod.menuId),
    title: prod.menuName + (prod.price ? ` - R$ ${prod.price.toFixed(2)}` : ''),
    description: prod.menuDescription,
    "alt-text": prod.menuName ? `Imagem de ${prod.menuName}` : undefined,
    image: await convertImageToBase64(prod.menuImageUrl || undefined)
  })));
}

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
          const type = message.type; // Tipo da mensagem

          if (!store?.wabaEnvironments) {
            // TODO: handle
            console.error('LOJA SEM WABA ENVIRONMENTS')
            return;
          }

          //**** MENSAGEM DE TEXTO OU VOZ ******/
          if (!message?.interactive) {
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

                // Send confirmation to user that voice was processed
                // await sendMessage({
                //   messaging_product: 'whatsapp',
                //   to: "+" + from,
                //   type: 'text',
                //   text: { body: `🎤 _Entendi: "${transcription}"_` }
                // }, store.wabaEnvironments);

              } catch (error) {
                console.error('❌ Erro ao processar mensagem de voz:', error);

                await sendMessage({
                  messaging_product: 'whatsapp',
                  to: "+" + from,
                  type: 'text',
                  text: { body: '🎤 Desculpe, não consegui entender sua mensagem de voz. Pode enviar uma mensagem de texto?' }
                }, store.wabaEnvironments);

                return;
              }
            }

            let currentConversation: Conversation | undefined = await getRecentConversation(from, store._id);

            if (!currentConversation) {
              const activeOrder = await getActiveOrder(from, store._id);
              console.log('COMPRAS ANTIGAS', currentConversation, activeOrder)
              if (activeOrder) {
                // Envia mensagem sobre o status do pedido atual e se quer cancelar
                const responseMessage = `Seu pedido está ${activeOrder.currentFlow.flowId === 1 ? 'Aguardando Confirmacao' : activeOrder.currentFlow.flowId === 2 ? 'Em preparação' : activeOrder.currentFlow.flowId === 3 ? 'Em rota de entrega' : activeOrder.currentFlow.flowId === 4 ? 'Entregue' : 'Cancelado'}`
                const messagePayload: any = {
                  messaging_product: 'whatsapp',
                  to: '+' + from,
                  type: 'interactive',
                  interactive: {
                    type: 'button',
                    body: {
                      text: responseMessage
                    },
                    action: {
                      buttons: [
                        {
                          type: 'reply',
                          reply: {
                            id: 'start_new_order',
                            title: 'Fazer novo Pedido'
                          }
                        },
                        {
                          type: 'reply',
                          reply: {
                            id: 'cancel_order',
                            title: 'Cancelar Pedido'
                          }
                        },
                      ]
                    }
                  }
                };

                // Adicionar header com logo da loja se disponível
                if (store.logo) {
                  messagePayload.interactive.header = {
                    type: 'image',
                    image: {
                      link: store.logo
                    }
                  };
                }

                await (sendMessage(messagePayload, store.wabaEnvironments))
                return;

              }


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
                }, store.wabaEnvironments);

                return;
              }

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
                text: { body: `✅ Olá, tudo bem? Obrigado pela visita. Este canal é exclusivo para pedidos delivery.` }
              }, store.wabaEnvironments);


              const messageIntention = await classifyCustomerIntent(message.text.body, currentConversation?.cartItems?.map(item => ({ menuId: item.menuId, menuName: item.menuName, quantity: item.quantity })));

              console.log('MESSAGE INTENTION ', messageIntention)
              console.log('**************************', messageIntention.intent)
              console.log('VAI ENTRAR NO SWITCH', messageIntention.intent === "ordering_products")

              switch (messageIntention.intent) {
                case "greeting":
                case "other":
                  // await sendMessage({
                  //   messaging_product: 'whatsapp',
                  //   to: "+" + from,
                  //   type: 'text',
                  //   text: { body: `✅ Olá, tudo bem? Este canal é exclusivo para pedidos delivery. O que gostaria de pedir hoje?` }
                  // }, store.wabaEnvironments);

                  break;
                case "want_menu_or_start":
                  const beautifulMenu = formatBeautifulMenu(filterMenuByWeekday(store.menu) || []);
                  // Enviar cardápio formatado para o cliente
                  if (store.wabaEnvironments) {
                    await sendMessage({
                      messaging_product: 'whatsapp',
                      to: "+" + from,
                      type: 'text',
                      text: { body: `✅Segue nosso cardápio**.\n\n${beautifulMenu}` }
                    }, store.wabaEnvironments);
                  }

                  // Save message in conversartions
                  // await updateConversation(currentConversation, {
                  //   flow: 'CATEGORIES'
                  // })

                  break;
                case "ordering_products":
                  console.log('VAI ENVIAR TIPO DE ENTREGA ---->')

                  // Save message in conversartions
                  await updateConversation(currentConversation, {
                    lastMessage: message.text.body,
                    flow: 'DELIVERY_TYPE'
                  })

                  //Send delivery type message 
                  await sendMessage({
                    messaging_product: 'whatsapp',
                    to: "+" + from,
                    type: 'text',
                    text: { body: '🚚 Seu pedido é para **entrega** ou **retirada** na loja?' }
                  }, store.wabaEnvironments)

                  break;
                case "close_order":
                  break;
                case "change_quantity":
                  break;
                case "replace_product":
                  break;
                case "remove_product":
                  break;
              }

              return;
            }

            const userFrom = await getUserByPhone(from);

            await handleIncomingTextMessage(from, message, store, res, customerName || 'Consumidor', userFrom?.address);
            return;
          }

          // //**** MENSAGEM INTERATIVA, DELIVERY OR COUNTER ******/
          // if (message.interactive?.type === 'button_reply' &&
          //   (message.interactive?.button_reply?.id === 'delivery' || message.interactive?.button_reply?.id === 'counter')) {

          //   const deliveryChoice = message.interactive.button_reply.id;
          //   let currentConversation: Conversation | undefined = await getRecentConversation(from, store._id);
          //   const userFrom = await getUserByPhone(from);

          //   console.log(`----BOTÃO ${deliveryChoice.toUpperCase()} CLICADO-----`, currentConversation?.lastMessage);

          //   if (!currentConversation || currentConversation.flow !== 'DELIVERY_TYPE') {
          //     console.log('ERRO: Conversa não encontrada ou flow incorreto para delivery choice');
          //     return;
          //   }

          //   if (deliveryChoice === 'counter') {
          //     // Cliente escolheu retirada no balcão
          //     console.log('----cliente ESCOLHEU RETIRADA NO BALCÃO-----', currentConversation?.lastMessage)

          //     await updateConversation(currentConversation, {
          //       deliveryOption: 'counter',
          //       flow: 'CATEGORIES'
          //     })

          //     if (currentConversation.lastMessage) {
          //       const extractedProdutcs = await extractProductsFromMessageWithAI(currentConversation?.lastMessage || "", store.menu.map(item => { return { menuId: item.menuId, menuName: item.menuName, price: item.price } }))

          //       console.log('*********** EXTRACTED PRODUCTS z***********: ', extractedProdutcs);

          //       if (extractedProdutcs?.ambiguidades?.length) {

          //         const itensAmbiguos = extractedProdutcs.ambiguidades[0].items.map(item => `${item.menuName} - ${item.price}`).join('\n');

          //         extractedProdutcs.ambiguidades[0].refining = true;

          //         await updateConversation(currentConversation, {
          //           flow: `ORDER_REFINMENT`,
          //           refinmentItems: extractedProdutcs,
          //         });

          //         await sendMessage({
          //           messaging_product: 'whatsapp',
          //           to: "+" + from,
          //           type: 'text',
          //           text: { body: `Você pediu ${extractedProdutcs.ambiguidades[0].quantity} ${extractedProdutcs.ambiguidades[0].palavra}, qual das opções você deseja?\n\n${itensAmbiguos}` }
          //         }, store.wabaEnvironments);
          //       } else if (extractedProdutcs.items && extractedProdutcs.items.length > 0) {
          //         // Itens resolvidos diretamente, vamos confirmar com o cliente
          //         const itensResolvidos = extractedProdutcs.items.map((item: any) => `${item.quantity}x ${item.menuName} - R$ ${(item.price * item.quantity).toFixed(2)}`).join('\n');

          //         await updateConversation(currentConversation, {
          //           flow: `ORDER_REFINMENT_CONFIRMATION`,
          //           refinmentItems: extractedProdutcs
          //         });

          //         await sendMessage({
          //           messaging_product: 'whatsapp',
          //           to: "+" + from,
          //           type: 'text',
          //           text: { body: `Confirmando seu pedido:\n\n${itensResolvidos}\n\nEsta correto? Posso adicionar ao seu carrinho?` }
          //         }, store.wabaEnvironments);
          //       } else {
          //         // Não encontrou produtos
          //         await sendMessage({
          //           messaging_product: 'whatsapp',
          //           to: "+" + from,

          //           type: 'text',
          //           text: { body: `Não consegui identificar os produtos que você mencionou. Pode me dizer o nome do produto que deseja do nosso cardápio?` }
          //         }, store.wabaEnvironments);
          //       }

          //       return;
          //     }

          //     // // Formatar cardápio bonito e enviar direto
          //     // console.log('Enviando cardápio formatado para retirada', currentConversation.lastMessage)

          //     // const beautifulMenu = formatBeautifulMenu(store.menu || []);

          //     // // Atualizar histórico da conversa
          //     // await updateConversation(currentConversation, {
          //     //   deliveryOption: 'counter', // Garantir que mantém como retirada
          //     //   flow: 'CATEGORIES',
          //     //   history: `${currentConversation.history ? currentConversation.history + ' --- ' : ''} Cliente escolheu retirada na loja`
          //     // });

          //     // // Enviar cardápio formatado para o cliente
          //     // if (store.wabaEnvironments) {
          //     //   await sendMessage({
          //     //     messaging_product: 'whatsapp',
          //     //     to: "+" + from,
          //     //     type: 'text',
          //     //     text: { body: `✅ Perfeito! Você escolheu **retirada na loja**.\n\n${beautifulMenu}` }
          //     //   }, store.wabaEnvironments);
          //     // }

          //   } else if (deliveryChoice === 'delivery') {
          //     // Cliente escolheu delivery
          //     console.log('----cliente ESCOLHEU DELIVERY-----')

          //     await updateConversation(currentConversation, {
          //       deliveryOption: 'delivery',
          //       flow: 'CHECK_ADDRESS'
          //     })

          //     // Agora verifica se tem endereço cadastrado
          //     if (userFrom?.address) {
          //       console.log('----cliente TEM ENDERECO-----')

          //       if (store.wabaEnvironments) {
          //         await sendMessage({
          //           messaging_product: 'whatsapp',
          //           to: "+" + from,
          //           type: 'text',
          //           text: { body: `✅ Endereço encontrado!\n\n📍 **${userFrom.address.name}**\n\nVocê confirma este endereço ou deseja informar outro?` },
          //         }, store.wabaEnvironments)
          //       }

          //       await updateConversation(currentConversation, { flow: 'ADDRESS_CONFIRMATION' })

          //     } else {
          //       console.log('----cliente NAO TEM ENDERECO, PEDE PARA INFORMAR-----')

          //       if (store.wabaEnvironments) {
          //         await sendMessage({
          //           messaging_product: 'whatsapp',
          //           to: "+" + from,
          //           type: 'text',
          //           text: { body: `✅ Por favor, informe seu endereço` },
          //         }, store.wabaEnvironments)
          //       }

          //       await updateConversation(currentConversation, { flow: 'NEW_ADDRESS' })
          //     }
          //   }
          // }
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
