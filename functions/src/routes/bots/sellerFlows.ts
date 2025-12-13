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

      if (requiredQuestions.length > 0) {
        beautifulMenu += `⚠️ *Inclui escolha de:* ${requiredQuestions.map((q: any) => q.questionName.toLowerCase()).join(', ')}\n`;
      }

      if (optionalQuestions.length > 0) {
        beautifulMenu += `➕ *Adicionais disponíveis:* ${optionalQuestions.map((q: any) => q.questionName.toLowerCase()).join(', ')}\n`;
      }
    }

    beautifulMenu += '\n━━━━━━━━━━━━━━━━━━━━\n\n';
  });

  beautifulMenu += '📱 *Para fazer seu pedido, digite o nome do produto desejado!*\n\n';
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
import { notifyAdmin, sendContactMessage, sendMessage, sendWelcomeMessage } from '../../services/messagingService';
import { notificationService } from '../../services/notificationService';
// import { buildCartTableString, buildCartTableStringFromRichText, redirectToOrderSummary } from '../../services/shoppingService';
import { getProductsByCategory } from '../../services/catalogService';
import { handleIncomingTextMessage, classifyUserMessage, parseAIResponse } from '../../services/incomingMessageService';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { getUserByPhone } from '../../controllers/userController';
import { MenuItemAnswer, MenuItemQuestion, WABAEnvironments, QuestionType } from '../../types/Store';
import { calculateDistance, parseGooglePlacesAddress } from '../../services/geolocationService';
import { Client, PlaceAutocompleteType } from '@googlemaps/google-maps-services-js';
import { generateCreditCardPaymentLink, generatePixPayment } from '../../services/asaasServce';
import * as admin from 'firebase-admin';
import { uploadImageFromUrlToWABAGeneric } from '../../services/imageService';
import { diagnostics, DiagnosticCategory } from '../../services/diagnosticsService';
import { createOrder, getActiveOrder, getTotalOrder } from '../../controllers/ordersController';
import { updateCurrentUser } from 'firebase/auth';

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

  /***************************************************************************************************************************** */
  /** ------------------------------------- MENSAGENS RECEBIDAS PELO FLOWS ----------------------------------------------------  */
  /***************************************************************************************************************************** */
  // ----------- quando vem encrypted_flow_data, encrypted_aes_key e initial_vector --------------------
  // if (encrypted_flow_data && encrypted_aes_key && initial_vector) {
  //   try {
  //     diagnostics.info('Processando WhatsApp Flow', {
  //       category: DiagnosticCategory.FLOWS,
  //       action: 'flow_processing_started'
  //     });

  //     // Carregar a chave privada do Google Secret Manager
  //     const privateKey = await diagnostics.measureExecutionTime(
  //       DiagnosticCategory.EXTERNAL_API,
  //       'get_private_key',
  //       () => getPrivateKey()
  //     );

  //     // Debug da chave privada
  //     diagnostics.debug('Verificando chave privada', {
  //       category: DiagnosticCategory.FLOWS,
  //       action: 'debug_private_key',
  //       details: {
  //         keyLength: privateKey.length,
  //         startsWithBegin: privateKey.startsWith('-----BEGIN'),
  //         endsWithEnd: privateKey.endsWith('-----'),
  //         firstLine: privateKey.split('\n')[0],
  //         lastLine: privateKey.split('\n').pop()
  //       }
  //     });

  //     // Descriptografar a chave AES
  //     let keyObject;
  //     try {
  //       keyObject = crypto.createPrivateKey(privateKey);
  //     } catch (keyError: any) {
  //       diagnostics.error('Erro ao criar objeto de chave privada', {
  //         category: DiagnosticCategory.FLOWS,
  //         action: 'create_private_key_error',
  //         details: { error: keyError.message, keyStart: privateKey.substring(0, 50) }
  //       });
  //       throw keyError;
  //     }

  //     const decryptedAesKey = crypto.privateDecrypt(
  //       {
  //         key: keyObject,
  //         padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
  //         oaepHash: 'sha256',
  //       },
  //       Buffer.from(encrypted_aes_key, 'base64')
  //     );

  //     // Descriptografar os dados do fluxo
  //     const flowDataBuffer = Buffer.from(encrypted_flow_data, 'base64');
  //     const initialVectorBuffer = Buffer.from(initial_vector, 'base64');

  //     const TAG_LENGTH = 16;
  //     const encrypted_flow_data_body = flowDataBuffer.subarray(0, -TAG_LENGTH);
  //     const encrypted_flow_data_tag = flowDataBuffer.subarray(-TAG_LENGTH);

  //     const decipher = crypto.createDecipheriv(
  //       'aes-128-gcm',
  //       decryptedAesKey,
  //       initialVectorBuffer
  //     );

  //     decipher.setAuthTag(encrypted_flow_data_tag);

  //     const decryptedJSONString = Buffer.concat([
  //       decipher.update(encrypted_flow_data_body),
  //       decipher.final(),
  //     ]).toString('utf-8');

  //     // console.log('Decrypted Flow Data:', decryptedJSONString);

  //     // Processar os dados do fluxo
  //     const flowData = JSON.parse(decryptedJSONString);
  //     const action = flowData.action;

  //     diagnostics.info('Flow data descriptografado', {
  //       category: DiagnosticCategory.FLOWS,
  //       action: 'flow_data_decrypted',
  //       flowToken: flowData.flow_token,
  //       details: {
  //         action: flowData.action,
  //         screen: flowData.screen,
  //         hasData: !!flowData.data
  //       }
  //     });

  //     let responsePayload;

  //     if (action === 'ping') {
  //       diagnostics.debug('Ping recebido do WhatsApp', {
  //         category: DiagnosticCategory.FLOWS,
  //         action: 'ping_received',
  //         flowToken: flowData.flow_token
  //       });

  //       responsePayload = {
  //         data: {
  //           status: 'active',
  //         },
  //       };
  //     } else if ((action as string).toLowerCase() === 'data_exchange') {
  //       diagnostics.info('Processando data_exchange', {
  //         category: DiagnosticCategory.FLOWS,
  //         action: 'data_exchange_processing',
  //         flowToken: flowData.flow_token,
  //         details: { screen: flowData.screen }
  //       });

  //       // if (flowData.screen === 'ORDER_FINISHED') {
  //       //   diagnostics.info('Tela ORDER_FINISHED detectada, finalizando processamento', {
  //       //     category: DiagnosticCategory.FLOWS,
  //       //     action: 'order_finished_screen',
  //       //     flowToken: flowData.flow_token
  //       //   });
  //       //   return;
  //       // }

  //       const currentConversation = await diagnostics.measureExecutionTime(
  //         DiagnosticCategory.DATABASE,
  //         'get_conversation_by_flow_token',
  //         () => getConversationByFlowToken(flowData.flow_token),
  //         { flowToken: flowData.flow_token }
  //       );

  //       if (!currentConversation) {
  //         diagnostics.error('Conversa não encontrada para flow_token', undefined, {
  //           category: DiagnosticCategory.FLOWS,
  //           action: 'conversation_not_found',
  //           flowToken: flowData.flow_token
  //         });
  //         res.status(404).send('Conversa não encontrada');
  //         return;
  //       }

  //       if (!currentConversation.store) {
  //         console.error('Loja não encontrada para o flow_token:', flowData.flow_token);
  //         res.status(404).send('Loja não encontrada');
  //         return;
  //       }

  //       if (flowData.screen === 'WELCOME_SCREEN' && flowData.data?.start === true) {
  //         console.log('VAI TRATAR WELCOME SCREEN')
  //         if (currentConversation.address && currentConversation.address?.name) {
  //           // Usuário existe e tem endereço cadastrado
  //           responsePayload = {
  //             screen: "ADDRESS_USER",
  //             data: {
  //               enderecoCompleto: currentConversation.address.name
  //             }
  //           };
  //           console.log('Usuário encontrado, enviando ADDRESS_USER:', currentConversation.address.name);
  //         } else {
  //           // Usuário não existe ou não tem endereço cadastrado
  //           responsePayload = {
  //             screen: "ADDRESS_INFORMATION",
  //             data: {
  //               // error_message: "Endereço não encontrado, por favor, informe novamente."
  //             }
  //           };
  //           console.log('Usuário não encontrado, enviando ADDRESS_INFORMATION');
  //         }

  //       }

  //       // ...dentro do bloco do webhook, após verificar currentConversation e flowData...

  //       if (flowData.screen === "ADDRESS_INFORMATION" && flowData.data?.endereco && flowData.data?.numero) {
  //         const enderecoCompleto = `${flowData.data.endereco} ${flowData.data.numero}`;
  //         try {
  //           // Chama o Google Places Autocomplete
  //           const response = await clientGoogle.placeAutocomplete({
  //             params: {
  //               input: `${enderecoCompleto} ${currentConversation.store.address?.city || ''} ${currentConversation.store.address?.state || ''}`,
  //               types: PlaceAutocompleteType.geocode,
  //               key: GOOGLE_PLACES_API_KEY,
  //             },
  //           });

  //           if (!response?.data?.predictions || response.data.predictions.length === 0) {
  //             // Não encontrou endereço: retorna para ADDRESS_INFORMATION (mensagem de erro pode ser implementada depois)
  //             responsePayload = {
  //               screen: "ADDRESS_INFORMATION",
  //               data: {
  //                 error_message: "Endereço não encontrado, por favor, informe novamente."
  //               }
  //             };
  //             console.log('Endereço não encontrado, retornando para ADDRESS_INFORMATION');
  //           } else {
  //             // Encontrou resultados: monta lista para ADDRESS_RESULT
  //             const predictions = await Promise.all(
  //               response.data.predictions.slice(0, 9).map(async (prediction: { place_id: any; terms: { value: any; }[]; description: any; }) => {
  //                 const placeDetails = await clientGoogle.placeDetails({
  //                   params: {
  //                     place_id: prediction.place_id,
  //                     key: GOOGLE_PLACES_API_KEY,
  //                   },
  //                 });

  //                 const location = placeDetails.data.result.geometry?.location;

  //                 console.log('Location:', location);

  //                 // Armazenar no cache
  //                 addressCache[prediction.place_id] = {
  //                   lat: location?.lat!,
  //                   lng: location?.lng!,
  //                   title: prediction.terms[0].value,
  //                   description: prediction.description,
  //                   placeId: prediction.place_id,
  //                 };

  //                 return {
  //                   id: prediction.place_id,
  //                   title: prediction.terms[0].value,
  //                   description: prediction.description,
  //                 };
  //               })
  //             );

  //             // Adiciona opção "Endereço não está na lista"
  //             predictions.push({
  //               id: 'not_in_list',
  //               title: 'Endereço não está na lista',
  //               description: 'Tentar novamente com outro endereço.',
  //             });

  //             responsePayload = {
  //               screen: "ADDRESS_RESULT",
  //               data: {
  //                 addressResults: predictions
  //               }
  //             };
  //             console.log('Endereços encontrados, enviando ADDRESS_RESULT:', predictions);
  //           }
  //         } catch (error) {
  //           notifyAdmin('Erro ao consultar Google Places:', error);
  //           responsePayload = {
  //             screen: "ADDRESS_INFORMATION",
  //             data: {
  //               error_message: "Erro ao buscar endereço, tente novamente."
  //             }
  //           };
  //         }
  //       }

  //       if (flowData.screen === "ADDRESS_RESULT") {
  //         console.log('Processing ADDRESS_RESULT screen');

  //         const selectedPlaceId = flowData.data.selected_address;

  //         console.log('Selected Place ID:', selectedPlaceId);

  //         if (selectedPlaceId === 'not_in_list') {
  //           // Usuário quer informar outro endereço
  //           responsePayload = {
  //             screen: "ADDRESS_INFORMATION",
  //             data: {
  //               error_message: ""
  //             }
  //           };
  //         } else if (flowData.data?.selected_address) {

  //           console.log('ADDRESS CACHE:', addressCache);

  //           // --- CÓPIA ADAPTADA DO SEU CÓDIGO TESTADO (linhas 2259-2348) ---
  //           if (addressCache[selectedPlaceId]) {
  //             const selectedAddress = addressCache[selectedPlaceId];

  //             // Coordenadas da loja
  //             const storeLat = currentConversation.store.address?.lat!;
  //             const storeLng = currentConversation.store.address?.lng!;

  //             // Coordenadas do endereço selecionado
  //             const selectedLat = selectedAddress.lat;
  //             const selectedLng = selectedAddress.lng;

  //             // Calcular a distância entre a loja e o endereço selecionado
  //             const distance = calculateDistance(storeLat, storeLng, selectedLat, selectedLng);

  //             // Verificar se está dentro do raio de entrega
  //             if (distance <= currentConversation.store.deliveryMaxRadiusKm) {
  //               // Obter os detalhes do endereço usando o Google Places API
  //               const placeDetails = await clientGoogle.placeDetails({
  //                 params: {
  //                   place_id: selectedPlaceId,
  //                   key: GOOGLE_PLACES_API_KEY,
  //                 },
  //               });

  //               const addressComponents = placeDetails.data.result.address_components;

  //               // Processar os componentes do endereço
  //               const parsedAddress = parseGooglePlacesAddress(addressComponents);

  //               // Atualizar o cache com os novos campos
  //               addressCache[selectedPlaceId] = {
  //                 ...selectedAddress,
  //                 street: parsedAddress.street,
  //                 number: parsedAddress.number,
  //                 neighborhood: parsedAddress.neighborhood,
  //                 city: parsedAddress.city,
  //                 state: parsedAddress.state,
  //                 zipCode: parsedAddress.zipCode,
  //               };

  //               // Atualizar o modelo Conversation com os campos do endereço
  //               await updateConversation(currentConversation, {
  //                 address: {
  //                   name: selectedAddress.description,
  //                   placeId: selectedAddress.placeId,
  //                   lat: selectedAddress.lat,
  //                   lng: selectedAddress.lng,
  //                   street: parsedAddress.street,
  //                   number: parsedAddress.number,
  //                   neighborhood: parsedAddress.neighborhood,
  //                   city: parsedAddress.city,
  //                   state: parsedAddress.state,
  //                   zipCode: parsedAddress.zipCode,
  //                   main: true,
  //                 },
  //               });

  //               // Atualiza ou insere address na tabela Users 
  //               const userPhone = await getUserByPhone(currentConversation.phoneNumber);
  //               if (userPhone?.user) {
  //                 await admin.firestore().collection('Users').doc(userPhone.user.uid).set({
  //                   address: {
  //                     name: selectedAddress.description,
  //                     placeId: selectedAddress.placeId,
  //                     lat: selectedAddress.lat,
  //                     lng: selectedAddress.lng,
  //                     street: parsedAddress.street,
  //                     number: parsedAddress.number,
  //                     neighborhood: parsedAddress.neighborhood,
  //                     city: parsedAddress.city,
  //                     state: parsedAddress.state,
  //                     zipCode: parsedAddress.zipCode,
  //                     main: true,
  //                   }
  //                 })
  //               }

  //               // --- ADAPTAÇÃO PARA FLOWS: Enviar tela CATEGORY_SELECTION ---
  //               const { ifoodMerchantService } = await import('../../services/ifood/ifoodMerchantService');
  //               const merchantId = currentConversation.store.ifoodMerchantId;
  //               const catalogId = currentConversation.store.ifoodCatalogId;
  //               if (!merchantId || !catalogId) {
  //                 console.error('iFood Merchant ID or Catalog ID not configured for store');
  //                 return;
  //               }
  //               const ifoodCategories = await ifoodMerchantService.getMerchantCategories(merchantId, catalogId);

  //               const categories = ifoodCategories.map(cat => ({
  //                 id: String(cat.id),
  //                 title: cat.name,
  //               }));

  //               responsePayload = {
  //                 screen: "CATEGORY_SELECTION",
  //                 data: {
  //                   categories,
  //                 }
  //               };
  //             } else {
  //               // --- ADAPTAÇÃO PARA FLOWS: Fora do raio, volta para ADDRESS_INFORMATION com erro ---
  //               responsePayload = {
  //                 screen: "ADDRESS_INFORMATION",
  //                 data: {
  //                   error_message: `Endereço fora do raio de entrega da loja (${currentConversation.store.deliveryMaxRadiusKm} km), favor informar outro endereço.`
  //                 }
  //               };
  //             }
  //           } else {
  //             // PlaceId não encontrado no cache (erro raro)
  //             notifyAdmin('Place ID não encontrado no cache.');
  //             responsePayload = {
  //               screen: "ADDRESS_INFORMATION",
  //               data: {
  //                 error_message: "Erro ao processar endereço, tente novamente."
  //               }
  //             };
  //           }
  //         }
  //       }

  //       if (flowData.screen === "ADDRESS_USER" && flowData.data?.confirm_address) {
  //         if (flowData.data.confirm_address === "sim") {
  //           // Usuário confirmou o endereço, envia CATEGORY_SELECTION
  //           const userPhone = await getUserByPhone(currentConversation.phoneNumber);
  //           if (!userPhone) {
  //             console.error('Usuário não encontrado para o número:', currentConversation.phoneNumber);
  //             // TODO: handle because it should never happen
  //             notifyAdmin(`Usuário não encontrado para o número: ${currentConversation.phoneNumber} no fluxo ADDRESS_USER`);
  //             return;
  //           }

  //           // Buscar categorias via API iFood
  //           const { ifoodMerchantService } = await import('../../services/ifood/ifoodMerchantService');
  //           const merchantId = currentConversation.store.ifoodMerchantId;
  //           const catalogId = currentConversation.store.ifoodCatalogId;
  //           if (!merchantId || !catalogId) {
  //             console.error("iFood Merchant ID or Catalog ID not configured for store");
  //             return;
  //           }
  //           const ifoodCategories = await ifoodMerchantService.getMerchantCategories(merchantId, catalogId);

  //           const categories = ifoodCategories.length > 0
  //             ? ifoodCategories.map(cat => ({
  //               id: String(cat.id),
  //               title: cat.name,
  //             }))
  //             : [{
  //               id: "default",
  //               title: "Catálogo de Produtos"
  //             }];

  //           responsePayload = {
  //             screen: "CATEGORY_SELECTION",
  //             data: {
  //               categories,
  //             }
  //           };
  //         } else {
  //           // Usuário não confirmou, volta para ADDRESS_INFORMATION
  //           responsePayload = {
  //             screen: "ADDRESS_INFORMATION",
  //             data: {
  //               error_message: ""
  //             }
  //           };
  //         }
  //       }

  //       else if (flowData.screen === "CATEGORY_SELECTION" && flowData.data?.selected_category) {
  //         const categoryId = flowData.data.selected_category;

  //         // Buscar produtos da categoria via API iFood
  //         const { ifoodMenuService } = await import('../../services/ifood/ifoodMenuService');
  //         const merchantId = currentConversation.store.ifoodMerchantId;
  //         const catalogId = currentConversation.store.ifoodCatalogId;
  //         if (!merchantId || !catalogId) {
  //           console.error("iFood Merchant ID or Catalog ID not configured for store");
  //           return;
  //         }
  //         const products = await ifoodMenuService.getProductsByCategory(merchantId, catalogId, Number(categoryId));
  //         const productsWithImages = await getProductsForFlow(products);

  //         console.log('Product With Images:', productsWithImages);
  //         console.log('Category ID:', categoryId);

  //         if (!categoryId) {
  //           console.log('Categoria não informada no data_exchange.');
  //           responsePayload = {
  //             screen: "ERROR",
  //             data: { error_message: "Categoria não informada no data_exchange." }
  //           };
  //         } else {

  //           responsePayload = {
  //             screen: "PRODUCT_SELECTION",
  //             data: {
  //               products: productsWithImages,
  //             },
  //           };
  //         }
  //       }

  //       else if ((flowData.screen === "CATEGORY_SELECTION" || flowData.screen === "PRODUCT_SELECTION") && flowData.data?.selected_product) {
  //         console.log('Processing PRODUCT_SELECTION or CATEGORY_SELECTION screen', flowData.screen);

  //         const productId = Number(flowData.data.selected_product);

  //         // Buscar produto via API iFood
  //         const { ifoodMenuService } = await import('../../services/ifood/ifoodMenuService');
  //         const merchantId = currentConversation.store.ifoodMerchantId;
  //         const catalogId = currentConversation.store.ifoodCatalogId;
  //         if (!merchantId || !catalogId) {
  //           console.error("iFood Merchant ID or Catalog ID not configured for store");
  //           return;
  //         }
  //         const product = await ifoodMenuService.getProductById(merchantId, catalogId, productId);
  //         // Mapear modifierGroups para o formato esperado de questions
  //         const questions: MenuItemQuestion[] = product?.modifierGroups?.map(group => ({
  //           questionId: group.id,
  //           questionName: group.name,
  //           questionType: group.type as QuestionType,
  //           minAnswerRequired: group.minQuantity,
  //           maxAnswerRequired: group.maxQuantity,
  //           answers: group.modifiers?.map(modifier => ({
  //             answerId: modifier.id,
  //             answerName: modifier.name,
  //             price: modifier.price,
  //             quantity: modifier.maxQuantity
  //           }))
  //         })) || [];

  //         console.log('Product ID:', productId, 'Product:', product);

  //         if (!product) {
  //           responsePayload = {
  //             screen: "ERROR",
  //             data: { error_message: "Produto não encontrado." }
  //           };
  //         } else {

  //           console.log('Product ID:', productId, 'Product:', product);

  //           if (questions.length) {
  //             const maxQuestions = 5;
  //             const data: Record<string, any> = {
  //               selected_product: product.id.toString(),
  //               productImage: await convertImageToBase64(product.imageUrl),
  //               productImageWidth: 300,
  //               productImageHeight: 200,
  //               productImageAspectRatio: 1.5,
  //               productImageAltText: `Imagem de ${product.name}`
  //             };


  //             for (let i = 0; i < maxQuestions; i++) {
  //               const q = questions[i] as MenuItemQuestion | undefined;
  //               if (!q) {
  //                 // Zera tudo para perguntas inexistentes
  //                 data[`question_${i + 1}_id`] = '';
  //                 for (let j = 0; j < 10; j++) {
  //                   data[`question_${i + 1}_answer_${j + 1}_id`] = '';
  //                 }

  //                 data[`question_${i + 1}_title`] = '';
  //                 data[`question_${i + 1}_answers`] = [];
  //                 data[`is_radio_${i + 1}`] = false;
  //                 data[`is_check_${i + 1}`] = false;
  //                 data[`min_selected_items_${i + 1}`] = 0;
  //                 data[`max_selected_items_${i + 1}`] = 0;
  //                 for (let j = 0; j < 10; j++) {
  //                   data[`is_quantity_${i + 1}_option_${j + 1}`] = false;
  //                   data[`question_${i + 1}_quantity_${j + 1}_label`] = '';
  //                 }
  //                 continue;
  //               }

  //               // ID da pergunta
  //               data[`question_${i + 1}_id`] = q.questionId?.toString() || '';

  //               // IDs das respostas
  //               if (q.answers) {
  //                 for (let j = 0; j < q.answers.length; j++) {
  //                   data[`question_${i + 1}_answer_${j + 1}_id`] = q.answers[j].answerId?.toString() || '';
  //                 }
  //               }

  //               data[`question_${i + 1}_title`] = q.questionName;

  //               // Zera todos os controles antes do switch
  //               data[`is_radio_${i + 1}`] = false;
  //               data[`is_check_${i + 1}`] = false;
  //               data[`min_selected_items_${i + 1}`] = 0;
  //               data[`max_selected_items_${i + 1}`] = 0;
  //               data[`question_${i + 1}_answers`] = [];
  //               for (let j = 0; j < 10; j++) {
  //                 data[`is_quantity_${i + 1}_option_${j + 1}`] = false;
  //                 data[`question_${i + 1}_quantity_${j + 1}_label`] = '';
  //               }

  //               switch (q.questionType) {
  //                 case "RADIO":
  //                   data[`is_radio_${i + 1}`] = true;
  //                   data[`question_${i + 1}_answers`] = (q.answers || []).map(a => ({
  //                     id: a.answerId.toString(),
  //                     title: a.answerName + (a.price ? ` (R$ ${a.price.toFixed(2)})` : '')
  //                   }));
  //                   break;
  //                 case "CHECK":
  //                   data[`is_check_${i + 1}`] = true;
  //                   data[`question_${i + 1}_answers`] = (q.answers || []).map(a => ({
  //                     id: a.answerId.toString(),
  //                     title: a.answerName + (a.price ? ` (R$ ${a.price.toFixed(2)})` : '')
  //                   }));
  //                   const min = Math.max(1, q.minAnswerRequired || 1);
  //                   const optionsCount = (q.answers || []).length;
  //                   let max = typeof q.maxAnswerRequired === "number" ? q.maxAnswerRequired : optionsCount;
  //                   max = Math.max(min, max, 1);
  //                   max = Math.min(max, optionsCount);
  //                   if (optionsCount > 1 && max < 2) max = optionsCount;
  //                   data[`min_selected_items_${i + 1}`] = min;
  //                   data[`max_selected_items_${i + 1}`] = max;
  //                   break;
  //                 case "QUANTITY":
  //                   if (q.answers) {
  //                     for (let j = 0; j < q.answers.length; j++) {
  //                       data[`question_${i + 1}_quantity_${j + 1}_label`] = q.answers[j].answerName + (q.answers[j].price ? ` (R$ ${q.answers[j].price?.toFixed(2)})` : '');
  //                       data[`is_quantity_${i + 1}_option_${j + 1}`] = true;
  //                     }
  //                   }
  //                   break;
  //                 default:
  //                   // outros tipos, se houver
  //                   break;
  //               }
  //             }

  //             responsePayload = {
  //               screen: "PRODUCT_QUESTIONS",
  //               data: {
  //                 ...data,
  //                 productImage: await convertImageToBase64(product.imageUrl),
  //                 productImageWidth: 300,
  //                 productImageHeight: 200,
  //                 productImageAspectRatio: 1.5,
  //                 productImageAltText: `Imagem de ${product.name}`
  //               },
  //             };
  //           } else {
  //             // Se o produto não tiver perguntas, redireciona para a tela de confirmação de quantidade
  //             const itemLabel = product.name || '';

  //             // atualiza a conversation previousFLow para PRODUCT
  //             currentConversation.previousScreen = "PRODUCT";
  //             await updateConversation(currentConversation, { previousScreen: "PRODUCT" });

  //             const { editCartItemId, ...restData } = flowData.data || {};

  //             responsePayload = {
  //               screen: "QUANTITY_CONFIRMATION",
  //               data: {
  //                 ...restData, // <-- propaga todas as respostas das perguntas sem o editCartItemId
  //                 item_label: itemLabel,
  //                 quantidade: 1,
  //                 confirmacao: "sim",
  //                 selected_product: product?.id?.toString(), // <-- Adicione esta linha!
  //                 editCartItemId: "",
  //                 productImage: await convertImageToBase64(product.imageUrl),
  //                 productImageWidth: 300,
  //                 productImageHeight: 200,
  //                 productImageAspectRatio: 1.5,
  //                 productImageAltText: `Imagem de ${product.name}`
  //               }
  //             };
  //           }

  //           console.log('Response Payload for PRODUCT_QUESTIONS:', responsePayload);
  //         }
  //       }

  //       else if (flowData.screen === "PRODUCT_QUESTIONS" && flowData.data?.selected_product) {

  //         console.log('Processing PRODUCT_QUESTIONS screen');

  //         const productId = Number(flowData.data.selected_product);

  //         // Buscar produto via API iFood
  //         const { ifoodMenuService } = await import('../../services/ifood/ifoodMenuService');
  //         const merchantId = currentConversation.store.ifoodMerchantId;
  //         const catalogId = currentConversation.store.ifoodCatalogId;
  //         if (!merchantId || !catalogId) {
  //           console.error("iFood Merchant ID or Catalog ID not configured for store");
  //           return;
  //         }
  //         const product = await ifoodMenuService.getProductById(merchantId, catalogId, productId);

  //         // Mapear modifierGroups para o formato esperado de questions
  //         const questions: MenuItemQuestion[] = product?.modifierGroups?.map(group => ({
  //           questionId: group.id,
  //           questionName: group.name,
  //           questionType: group.type as QuestionType,
  //           minAnswerRequired: group.minQuantity,
  //           maxAnswerRequired: group.maxQuantity,
  //           answers: group.modifiers?.map(modifier => ({
  //             answerId: modifier.id,
  //             answerName: modifier.name,
  //             price: modifier.price,
  //             quantity: modifier.maxQuantity
  //           }))
  //         })) || [];

  //         const maxQuestions = 10;

  //         const resumoPerguntas: string[] = [];

  //         console.log('selected_product recebido:', flowData.data.selected_product);

  //         console.log('Product ID:', productId, 'Product:', product);

  //         let hasError = false;

  //         for (let i = 0; i < maxQuestions; i++) {
  //           console.log('Product Question I', i, questions[i])

  //           const q = questions[i];

  //           console.log('Validando pergunta:', q?.questionName, 'Tipo:', q?.questionType);

  //           if (!q) continue;

  //           if (q.questionType === "QUANTITY") {
  //             const min = q.minAnswerRequired ?? 0;
  //             const max = q.maxAnswerRequired ?? Infinity;
  //             let total = 0;

  //             for (let j = 0; j < (q.answers?.length || 0); j++) {
  //               const valor = Number(flowData.data[`question_${i + 1}_quantity_${j + 1}`] || 0);

  //               console.log('flow data', flowData, flowData.data[`question_${i + 1}_quantity_${j + 1}`])

  //               console.log(`Valor para a opção ${j + 1} da pergunta ${i + 1}:`, valor);

  //               total += valor;
  //             }

  //             console.log(`Quantidade total para a pergunta ${i + 1}:`, total, min, max);

  //             if (total < min || total > max) {
  //               let errorMsg = '';
  //               if (min === max) {
  //                 errorMsg = `Escolha exatamente ${min} opção(ões) para "${q.questionName}".`;
  //               } else if (max === Infinity) {
  //                 errorMsg = `Escolha no mínimo ${min} opção(ões) para "${q.questionName}".`;
  //               } else {
  //                 errorMsg = `Escolha entre ${min} e ${max} opção(ões) para "${q.questionName}".`;
  //               }
  //               responsePayload = {
  //                 screen: "PRODUCT_QUESTIONS",
  //                 data: {
  //                   ...flowData.data,
  //                   error_message: errorMsg,
  //                   error_visible: true,
  //                   productImage: await convertImageToBase64(product?.imageUrl),
  //                   productImageWidth: 300,
  //                   productImageHeight: 200,
  //                   productImageAspectRatio: 1.5,
  //                   productImageAltText: `Imagem de ${product?.name || 'produto'}`
  //                 }
  //               };
  //               hasError = true;
  //               break;
  //             }
  //           }

  //           if (!hasError) {
  //             let resposta = '';

  //             console.log('Question Type', q.questionType, 'Question Name:', q.questionName);

  //             if (q.questionType === "CHECK") {
  //               console.log(`CHECK: question_${i + 1}_check`, flowData.data[`question_${i + 1}_check`], q.answers);

  //               // resposta = selecionadas.join(', ');
  //               const selecionadas = (flowData.data[`question_${i + 1}_check`] || [])
  //                 .map((id: string) => {
  //                   const answer = q.answers?.find(a => a.answerId.toString() === id);
  //                   if (!answer) return null;
  //                   return answer.price
  //                     ? `${answer.answerName} (R$ ${answer.price.toFixed(2)})`
  //                     : answer.answerName;
  //                 })
  //                 .filter(Boolean);
  //               resposta = selecionadas.join(', ');

  //             } else if (q.questionType === "RADIO") {
  //               console.log(`RADIO: question_${i + 1}_radio`, flowData.data[`question_${i + 1}_radio`], q.answers);
  //               // const id = flowData.data[`question_${i + 1}_radio`];
  //               // resposta = q.answers?.find(a => a.answerId.toString() === id)?.answerName || '';

  //               const id = flowData.data[`question_${i + 1}_radio`];
  //               const answer = q.answers?.find(a => a.answerId.toString() === id);
  //               resposta = answer
  //                 ? answer.price
  //                   ? `${answer.answerName} (R$ ${answer.price.toFixed(2)})`
  //                   : answer.answerName
  //                 : '';

  //             } else if (q.questionType === "QUANTITY") {

  //               const opcoes = [];
  //               for (let j = 0; j < (q.answers?.length || 0); j++) {
  //                 const valor = Number(flowData.data[`question_${i + 1}_quantity_${j + 1}`] || 0);
  //                 if (valor > 0) {
  //                   const answer = q.answers?.[j];
  //                   const priceStr = answer?.price ? ` (R$ ${answer.price.toFixed(2)})` : '';
  //                   opcoes.push(`${answer?.answerName}${priceStr}: ${valor}`);
  //                 }
  //               }
  //               resposta = opcoes.join(', ');
  //             }

  //             if (resposta) {
  //               console.log(`Resposta para a pergunta ${i + 1}:`, resposta);
  //               resumoPerguntas.push(`${q.questionName}: ${resposta}`);
  //             }

  //           }
  //         }


  //         if (!hasError) {
  //           console.log('Resumo Perguntas:', resumoPerguntas);

  //           // Montar label do item
  //           const itemLabel = `${product?.name}${resumoPerguntas.length ? ' - ' + '\n' + resumoPerguntas.join(' | ') : ''}`;

  //           console.log('Item Label:', itemLabel);
  //           const { editCartItemId, ...restData } = flowData.data || {};

  //           // Montar payload da próxima tela


  //           responsePayload = {
  //             screen: "QUANTITY_CONFIRMATION",
  //             data: {
  //               ...restData, // sem o editCartItemId
  //               item_label: itemLabel,
  //               quantidade: 1,
  //               confirmacao: "sim",
  //               editCartItemId: "",
  //               selected_product: product?.id?.toString(), // <-- Adicione esta linha!
  //               productImage: await convertImageToBase64(product?.imageUrl),
  //               productImageWidth: 300,
  //               productImageHeight: 200,
  //               productImageAspectRatio: 1.5,
  //               productImageAltText: `Imagem de ${product?.name || 'produto'}`
  //             }
  //           };

  //           console.log('Response Payload for QUANTITY_CONFIRMATION:', responsePayload);
  //         }
  //       }

  //       else if (flowData.screen === "QUANTITY_CONFIRMATION") {

  //         const currentConversation = await getConversationByFlowToken(flowData.flow_token);

  //         if (!currentConversation?.store) {
  //           notifyAdmin('Conversa não encontrada para o flow_token: ' + flowData.flow_token);
  //           res.status(404).send('Conversa não encontrada');
  //           return;
  //         }

  //         const editCartItemId = flowData.data?.editCartItemId;

  //         if (editCartItemId) {
  //           if (!currentConversation.cartItems?.length) {
  //             notifyAdmin('Carrinho vazio para o flow_token: ' + flowData.flow_token);
  //             res.status(404).send('Carrinho vazio encontrado para edicao do item ' + editCartItemId);
  //             return;
  //           }

  //           const idx = currentConversation.cartItems.findIndex(item => item.id === editCartItemId);

  //           console.log('Edit Cart Item ID:', editCartItemId, 'Index:', idx);

  //           if (idx !== -1) {

  //             console.log('Item encontrado no carrinho para edicao:', currentConversation.cartItems[idx]);

  //             currentConversation.cartItems[idx].quantity = Number(flowData.data.quantidade);


  //             // Atualize outros campos se necessário
  //             await updateConversation(currentConversation, {
  //               cartItems: currentConversation.cartItems,
  //               previousScreen: "SHOPPING_CART"
  //             });

  //             console.log('Cart item updated:', currentConversation.cartItems[idx]);

  //             responsePayload = await generateShoppingCartLayout(currentConversation, "finalizar");


  //           } else {
  //             notifyAdmin('Item do carrinho não encontrado para o flow_token: ' + flowData.flow_token);
  //             res.status(404).send('Item do carrinho não encontrado');
  //             return;
  //           }

  //         } else {

  //           // Recuperar a conversa e o produto
  //           const productId = Number(flowData.data.selected_product);
  //           const product = currentConversation?.store?.menu.find(item => item.menuId === productId);

  //           console.log('&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&', flowData.data, currentConversation, product, productId)

  //           if (!currentConversation || !product) {
  //             notifyAdmin('Conversa ou produto não encontrado para o flow_token: ' + flowData.flow_token);
  //             res.status(404).send('Conversa ou produto não encontrado');
  //             return;
  //           }

  //           // Monte as respostas estruturadas ANTES de criar o cartItem:
  //           const answeredQuestions: MenuItemQuestion[] = product.questions
  //             .map((q, idx) => {
  //               let selectedAnswers: MenuItemAnswer[] = [];
  //               if (q.questionType === "RADIO") {
  //                 const selectedId = flowData.data[`question_${idx + 1}_radio`];
  //                 const answer = q.answers?.find(a => a.answerId.toString() === selectedId);
  //                 if (answer) selectedAnswers = [{ ...answer, quantity: 1 }];
  //               } else if (q.questionType === "CHECK") {
  //                 const selectedIds = flowData.data[`question_${idx + 1}_check`] || [];
  //                 selectedAnswers = (q.answers || [])
  //                   .filter(a => selectedIds.includes(a.answerId.toString()))
  //                   .map(a => ({ ...a, quantity: 1 }));
  //               } else if (q.questionType === "QUANTITY") {
  //                 selectedAnswers = (q.answers || []).reduce<MenuItemAnswer[]>((acc, a, j) => {
  //                   const qty = Number(flowData.data[`question_${idx + 1}_quantity_${j + 1}`] || 0);
  //                   if (qty > 0) acc.push({ ...a, quantity: qty });
  //                   return acc;
  //                 }, []);
  //               }
  //               if (selectedAnswers.length > 0) {
  //                 return {
  //                   ...q,
  //                   answers: selectedAnswers
  //                 } as MenuItemQuestion;
  //               }
  //               return null;
  //             })
  //             .filter((q): q is MenuItemQuestion => !!q && Array.isArray(q.answers) && q.answers.length > 0);

  //           // Calcule preço adicional, unitário, total, etc.
  //           let additional = 0;
  //           answeredQuestions.forEach(q => {
  //             (q.answers || []).forEach(a => {
  //               // some logic for additional price if needed
  //             });
  //           });

  //           const unitPrice = product.price + additional;
  //           const total = unitPrice * Number(flowData.data.quantidade);

  //           const cartItem = {
  //             id: `${product.menuId}-${Date.now()}`,
  //             menuId: product.menuId,
  //             menuName: product.menuName,
  //             menuDescription: product.menuDescription || '',
  //             categoryId: product.categoryId,
  //             price: product.price,
  //             unitPrice,
  //             quantity: Number(flowData.data.quantidade),
  //             total,
  //             imageUrl: product.menuImageUrl || '',
  //             questions: answeredQuestions,
  //             allDays: false,
  //           };

  //           // Adicione ao carrinho e salve
  //           currentConversation.cartItems = currentConversation.cartItems || [];
  //           currentConversation.cartItems.push(cartItem);
  //           await updateConversation(currentConversation, { cartItems: currentConversation.cartItems });

  //           // Atualiza conversations.previousFlow para SHOPPING_CART
  //           currentConversation.previousScreen = "SHOPPING_CART";
  //           await updateConversation(currentConversation, { previousScreen: "SHOPPING_CART" });

  //           responsePayload = await generateShoppingCartLayout(currentConversation, "finalizar");
  //         }
  //       }

  //       else if (flowData.screen === "SHOPPING_CART") {
  //         const cartAction = flowData.data?.cartAction;

  //         if (cartAction === "alterar") {
  //           // Responde com a tela CART_EDITION, listando os itens do carrinho

  //           const cartItems = (currentConversation.cartItems || []).map(item => {
  //             let respostasStr = "";
  //             let totalItemUnit = item.price;

  //             if (item.questions && item.questions.length > 0) {
  //               item.questions.forEach((q) => {
  //                 if (q.answers && q.answers.length > 0) {

  //                   respostasStr += `     ${q.questionName}:\n`;
  //                   // respostasStr += "      Qtd | Resposta | Valor\n";
  //                   q.answers.forEach((a) => {
  //                     const answerQty = a.quantity ?? 1;
  //                     const answerPrice = a.price ?? 0;
  //                     respostasStr += `        ${answerQty}   | ${a.answerName} | R$ ${answerPrice.toFixed(2)}\n`;
  //                     totalItemUnit += answerPrice * answerQty;
  //                   });
  //                 }
  //               });
  //             }

  //             return {
  //               id: item.id,
  //               title: `${item.quantity}x  ${item.menuName}  | R$ ${item.price.toFixed(2)}` + respostasStr
  //             }
  //           });

  //           responsePayload = {
  //             screen: "CART_EDITION",
  //             data: {
  //               cartItems
  //             },
  //             layout: {
  //               type: "SingleColumnLayout",
  //               children: [
  //                 {
  //                   type: "TextBody",
  //                   markdown: true,
  //                   text: "🛒 **EDITAR CARRINHO**\n\n*Você pode alterar a quantidade ou excluir itens do seu carrinho.*"
  //                 },
  //                 {
  //                   type: "Form",
  //                   name: "cart_edition_form",
  //                   children: [
  //                     {
  //                       type: "RadioButtonsGroup",
  //                       label: "Selecione o item que deseja alterar ou excluir",
  //                       name: "selectedCartItem",
  //                       "data-source": "${data.cartItems}",
  //                       required: true
  //                     },
  //                     {
  //                       type: "RadioButtonsGroup",
  //                       label: "O que deseja fazer?",
  //                       name: "editAction",
  //                       "data-source": [
  //                         { id: "alterar_quantidade", title: "Alterar quantidade" },
  //                         { id: "excluir_item", title: "Excluir item do carrinho" }
  //                       ],
  //                       required: true
  //                     },
  //                     {
  //                       type: "Footer",
  //                       label: "Avançar",
  //                       "on-click-action": {
  //                         name: "data_exchange",
  //                         payload: {
  //                           selectedCartItem: "${form.selectedCartItem}",
  //                           editAction: "${form.editAction}"
  //                         }
  //                       }
  //                     }
  //                   ]
  //                 }
  //               ]
  //             }
  //           };
  //         } else if (cartAction === "adicionar") {
  //           // Monta as categorias para a tela CATEGORY_SELECTION via API iFood
  //           const { ifoodMerchantService } = await import('../../services/ifood/ifoodMerchantService');
  //           const merchantId = currentConversation.store.ifoodMerchantId;
  //           const catalogId = currentConversation.store.ifoodCatalogId;
  //           if (!merchantId || !catalogId) {
  //             console.error("iFood Merchant ID or Catalog ID not configured for store");
  //             return;
  //           }
  //           const ifoodCategories = await ifoodMerchantService.getMerchantCategories(merchantId, catalogId);

  //           const categories = ifoodCategories.length > 0
  //             ? ifoodCategories.map(cat => ({
  //               id: String(cat.id),
  //               title: cat.name,
  //             }))
  //             : [{
  //               id: "default",
  //               title: "Catálogo de Produtos"
  //             }];

  //           responsePayload = {
  //             screen: "CATEGORY_SELECTION",
  //             data: {
  //               categories,
  //               selectedCartItem: ""
  //             }
  //           };
  //         } else if (cartAction === "finalizar") {
  //           responsePayload = {
  //             screen: "PAYMENT_SELECTION",
  //             data: {
  //               paymentMethod: "pix" // <-- valor inicial vazio para não pré-selecionar
  //             }
  //           };
  //         }
  //         else {

  //           // Iremos tratar depois
  //         }

  //         // Os outros fluxos ("adicionar" e "finalizar") você pode tratar nos próximos passos!
  //       }

  //       else if (flowData.screen === "CART_EDITION") {
  //         const { selectedCartItem, editAction } = flowData.data;
  //         const currentConversation = await getConversationByFlowToken(flowData.flow_token);

  //         if (!currentConversation?.store) {
  //           notifyAdmin('Conversa não encontrada para o flow_token: ' + flowData.flow_token);
  //           res.status(404).send('Conversa não encontrada');
  //           return;
  //         }

  //         if (editAction === "alterar_quantidade") {
  //           // Busca o item selecionado no carrinho
  //           const item = currentConversation.cartItems?.find(i => i.id === selectedCartItem);
  //           if (!item) {
  //             notifyAdmin('Item do carrinho não encontrado para o ID, ao tentar alterar a quantidade do item: ' + selectedCartItem);
  //             res.status(404).send('Item do carrinho não encontrado');
  //             return;
  //           }

  //           // Buscar produto via API iFood
  //           const { ifoodMenuService } = await import('../../services/ifood/ifoodMenuService');
  //           const merchantId = currentConversation.store.ifoodMerchantId;
  //           const catalogId = currentConversation.store.ifoodCatalogId;
  //           if (!merchantId || !catalogId) {
  //             console.error("iFood Merchant ID or Catalog ID not configured for store");
  //             return;
  //           }
  //           const product = await ifoodMenuService.getProductById(merchantId, catalogId, item?.menuId || 0);

  //           if (!product) {
  //             notifyAdmin('Produto não encontrado para o ID ao tentar alterar a quantidade do item: ' + item?.menuId);
  //             res.status(404).send('Produto não encontrado');
  //             return;
  //           }

  //           // Monte o item_label conforme sua lógica (exemplo simples abaixo)
  //           const itemLabel = `${item?.quantity}x ${item?.menuName} | R$ ${item?.price?.toFixed(2)}`;

  //           responsePayload = {
  //             screen: "QUANTITY_CONFIRMATION",
  //             data: {
  //               ...flowData.data, // Propaga todas as respostas das perguntas!
  //               item_label: itemLabel,
  //               quantidade: item?.quantity ?? 1,
  //               confirmacao: "sim",
  //               selected_product: product?.id?.toString(),
  //               editCartItemId: selectedCartItem,
  //               productImage: await convertImageToBase64(product?.imageUrl),
  //               productImageWidth: 300,
  //               productImageHeight: 200,
  //               productImageAspectRatio: 1.5,
  //               productImageAltText: `Imagem de ${product?.name || 'produto'}`
  //             }
  //           };

  //           console.log('Response Payload for alterar quantidade:', responsePayload);
  //         }


  //         else if (editAction === "excluir_item") {
  //           // Busca o item selecionado no carrinho
  //           const item = currentConversation.cartItems?.find(i => i.id === selectedCartItem);
  //           const itemLabel = `${item?.quantity}x ${item?.menuName} | R$ ${item?.price?.toFixed(2)}`;

  //           responsePayload = {
  //             screen: "DELETION_CONFIRMATION",
  //             data: {
  //               itemDescription: itemLabel,
  //               selectedCartItem
  //             },
  //             layout: {
  //               type: "SingleColumnLayout",
  //               children: [
  //                 {
  //                   type: "Form",
  //                   name: "deletion_confirmation_form",
  //                   children: [
  //                     {
  //                       type: "RadioButtonsGroup",
  //                       label: `Confirma a exclusão do item: ${itemLabel}?`,
  //                       name: "confirmDelete",
  //                       "data-source": [
  //                         { id: "sim", title: "Sim" },
  //                         { id: "nao", title: "Não" }
  //                       ],
  //                       required: true
  //                     },
  //                     {
  //                       type: "Footer",
  //                       label: "Avançar",
  //                       "on-click-action": {
  //                         name: "data_exchange",
  //                         payload: {
  //                           confirmDelete: "${form.confirmDelete}",
  //                           selectedCartItem
  //                         }
  //                       }
  //                     }
  //                   ]
  //                 }
  //               ]
  //             }
  //           };
  //         }

  //       }

  //       else if (flowData.screen === "DELETION_CONFIRMATION") {
  //         const { confirmDelete, selectedCartItem } = flowData.data;

  //         if (confirmDelete === "sim" && selectedCartItem) {
  //           // Remove o item do carrinho
  //           currentConversation.cartItems = (currentConversation.cartItems || []).filter(
  //             item => item.id !== selectedCartItem
  //           );

  //           await updateConversation(currentConversation, { cartItems: currentConversation.cartItems });

  //           if (!currentConversation.cartItems.length) {
  //             // Carrinho ficou vazio, redireciona para CATEGORY_SELECTION via API iFood
  //             const { ifoodMerchantService } = await import('../../services/ifood/ifoodMerchantService');
  //             const merchantId = currentConversation.store.ifoodMerchantId;
  //             const catalogId = currentConversation.store.ifoodCatalogId;
  //             if (!merchantId || !catalogId) {
  //               console.error("iFood Merchant ID or Catalog ID not configured for store");
  //               return;
  //             }
  //             const ifoodCategories = await ifoodMerchantService.getMerchantCategories(merchantId, catalogId);

  //             const categories = ifoodCategories.map(cat => ({
  //               id: String(cat.id),
  //               title: cat.name,
  //             }));
  //             responsePayload = {
  //               screen: "CATEGORY_SELECTION",
  //               data: categories,
  //             };
  //           } else {
  //             // Atualiza a tela do carrinho (volta para SHOPPING_CART)
  //             responsePayload = await generateShoppingCartLayout(currentConversation, "finalizar");
  //           }
  //         } else {
  //           // Atualiza a tela do carrinho (volta para SHOPPING_CART)
  //           responsePayload = await generateShoppingCartLayout(currentConversation, "finalizar");
  //         }
  //       }

  //       else if (flowData.screen === "PAYMENT_SELECTION") {

  //         console.log('Processing PAYMENT_SELECTION screen');

  //         if (!currentConversation?.docId || !currentConversation.store) {
  //           console.error('Nenhuma conversa encontrada para o flow_token:', flowData.flow_token);
  //           res.status(404).send('Conversa não encontrada');
  //           return;
  //         }

  //         const paymentMethod = flowData.data?.paymentMethod;
  //         const from = currentConversation.phoneNumber;
  //         const wabaEnvironments = currentConversation.store.wabaEnvironments as WABAEnvironments;


  //         console.log('Payment Method:', paymentMethod, 'From:', from, 'WABA Environments:', wabaEnvironments);

  //         switch (paymentMethod) {
  //           case "pix":
  //             // Chame sua lógica de pagamento PIX (igual ao seu fluxo on demand)
  //             // Gere o QR Code, envie mensagem, atualize a conversation, etc.

  //             try {
  //               // buscar o conversation no bd
  //               const currentConversationDB = await getConversationByDocId(currentConversation.docId);

  //               if (!currentConversationDB) {
  //                 notifyAdmin('Erro: Conversa não encontrada no banco de dados.');
  //                 return;
  //               }

  //               const totalPrice = (currentConversationDB.totalPrice || 0)

  //               // somar o preco da entrega (store.deliveryPrice)
  //               const deliveryPrice = currentConversation.deliveryPrice || currentConversation.store.deliveryPrice || 0;
  //               const totalPriceWithDelivery = Number((totalPrice + deliveryPrice).toFixed(2));
  //               console.log('Total do pedido:', totalPriceWithDelivery);

  //               const expirationDate = new Date();
  //               expirationDate.setHours(expirationDate.getHours() + 1); // Expira em 1 hora
  //               const formattedExpirationDate = expirationDate.toISOString().replace('T', ' ').split('.')[0];

  //               // Gerar o QR Code para pagamento via PIX
  //               const { qrCodeImage, payload } = await generatePixPayment(
  //                 'Pagamento do pedido',
  //                 totalPriceWithDelivery,
  //                 formattedExpirationDate,
  //                 currentConversation.docId
  //               );

  //               console.log('Pagamento do pedido',
  //                 totalPriceWithDelivery,
  //                 formattedExpirationDate)

  //               // Salvar a imagem do QR Code no Firebase Storage (opcional)
  //               const bucket = admin.storage().bucket();
  //               const fileName = `pix-qrcodes/${Date.now()}-qrcode.png`;
  //               const file = bucket.file(fileName);

  //               await file.save(Buffer.from(qrCodeImage, 'base64'), {
  //                 metadata: { contentType: 'image/png' },
  //               });

  //               // Tornar a URL pública
  //               await file.makePublic();
  //               const publicUrl = file.publicUrl();

  //               // Fazer upload da imagem para o WABA
  //               const mediaId = await uploadImageFromUrlToWABAGeneric(publicUrl, 'image/png', wabaEnvironments);

  //               console.log('ID da mídia do QR Code:', mediaId);
  //               console.log('Payload do PIX enviado ao cliente:',
  //                 Number(totalPriceWithDelivery),
  //                 payload,
  //               );

  //               responsePayload = {
  //                 screen: "ORDER_FINISHED",
  //                 data: {
  //                   itemDescription: "🔗 Esse é o código PIX. Seu pedido será processado após a confirmação do pagamento.",
  //                   paymentDescription: payload,
  //                   cartTable: await buildCartTableStringFromRichText(currentConversation.store, currentConversation.cartItems || [], currentConversation.address?.name)
  //                 }
  //               };

  //               // Atualizar o fluxo para aguardar confirmação de pagamento
  //               await updateConversation(currentConversation, {
  //                 flow: 'WAITING_PAYMENT_CONFIRMATION',
  //               });

  //             } catch (error: any) {
  //               notifyAdmin('Erro ao processar pagamento via PIX:', error.message);
  //             }
  //             break;

  //           case "credit_card":
  //             // Chame sua lógica de pagamento com cartão (igual ao seu fluxo on demand)
  //             // Gere o link, envie mensagem, atualize a conversation, etc.

  //             try {
  //               // buscar o conversation no bd
  //               const currentConversationDB = await getConversationByDocId(currentConversation.docId);

  //               if (!currentConversationDB) {
  //                 notifyAdmin('Erro: Conversa não encontrada no banco de dados.');
  //                 return;
  //               }

  //               const totalPrice = (currentConversationDB.totalPrice || 0)

  //               // Somar o preço da entrega (store.deliveryPrice)
  //               const deliveryPrice = currentConversation.deliveryPrice || currentConversation.store.deliveryPrice || 0;
  //               const totalPriceWithDelivery = Number((totalPrice + deliveryPrice).toFixed(2));
  //               console.log('Total do pedido:', totalPriceWithDelivery);

  //               // Calcular o número máximo de parcelas permitido
  //               const minInstallmentValue = 5.0; // Valor mínimo por parcela (definido pelo Asaas)
  //               const maxInstallmentCount = Math.min(
  //                 12, // Limite máximo de parcelas configurado
  //                 Math.floor(totalPriceWithDelivery / minInstallmentValue) // Parcelas permitidas pelo valor mínimo
  //               );

  //               if (maxInstallmentCount < 1) {
  //                 throw new Error('O valor total do pedido é muito baixo para ser parcelado.');
  //               }

  //               // Criar o link de pagamento via cartão de crédito
  //               const paymentResponse = await generateCreditCardPaymentLink({
  //                 name: 'Pagamento do Pedido',
  //                 description: 'Pagamento do pedido realizado via WhatsApp',
  //                 endDate: new Date(new Date().setDate(new Date().getDate() + 7)).toISOString().split('T')[0], // Data de encerramento (7 dias a partir de hoje)
  //                 value: totalPriceWithDelivery,
  //                 billingType: 'CREDIT_CARD', // Forma de pagamento: Cartão de Crédito
  //                 chargeType: 'INSTALLMENT', // Permitir parcelamento
  //                 maxInstallmentCount, // Número máximo de parcelas calculado
  //                 externalReference: `order-${currentConversation.docId}`, // Referência externa
  //                 notificationEnabled: true, // Habilitar notificações
  //               });

  //               console.log('Resposta completa do link de pagamento:', paymentResponse);

  //               responsePayload = {
  //                 screen: "ORDER_FINISHED",
  //                 data: {
  //                   itemDescription: "💳 Seu pedido será processado após a confirmação do pagamento.",
  //                   paymentDescription: paymentResponse.url,
  //                   cartTable: await buildCartTableStringFromRichText(currentConversation.store, currentConversation.cartItems || [], currentConversation.address?.name)
  //                 }
  //               };

  //               // Atualizar o fluxo para aguardar confirmação de pagamento
  //               await updateConversation(currentConversation, {
  //                 flow: 'WAITING_PAYMENT_CONFIRMATION',
  //                 paymentDetails: paymentResponse, // Salvar os detalhes do pagamento no banco de dados
  //               });
  //             } catch (error: any) {
  //               notifyAdmin('Erro ao processar pagamento via cartão de crédito:', error.message);
  //             }
  //             break;

  //           case "on_delivery":
  //             // Chame sua lógica de pagamento na entrega (igual ao seu fluxo on demand)
  //             // Crie o pedido, exclua a conversation, envie mensagem, etc.
  //             try {

  //               console.log('Processing ON_DELIVERY payment method');

  //               // buscar o conversation no bd
  //               const currentConversationDB = await getConversationByDocId(currentConversation.docId);

  //               if (!currentConversationDB) {
  //                 notifyAdmin('Erro: Conversa não encontrada no banco de dados.');
  //                 return;
  //               }

  //               const totalPrice = await getTotalOrder(currentConversationDB.cartItems || []);

  //               console.log('Total Price:', totalPrice);

  //               if (!totalPrice) {
  //                 // TODO: handle, it should be greater than 0
  //                 return;
  //               }

  //               // Somar o preço da entrega (store.deliveryPrice)
  //               const deliveryPrice = currentConversation.deliveryPrice || currentConversation.store.deliveryPrice || 0;
  //               const totalPriceWithDelivery = Number((totalPrice + deliveryPrice).toFixed(2));
  //               console.log('Total do pedido:', totalPriceWithDelivery);

  //               // Excluir o documento Conversation
  //               const paymentId = `payment-${Date.now()}`; // Simular um ID de pagamento

  //               currentConversationDB.paymentMethod = 'DELIVERY'

  //               const newOrder = await createOrder(currentConversationDB, paymentId);

  //               // Enviar notificação push para o app mobile
  //               if (newOrder && currentConversation.store._id) {
  //                 try {
  //                   await notificationService.notifyNewOrder(newOrder.id, currentConversation.store._id);
  //                   console.log('Push notification sent for new order:', newOrder.id);
  //                 } catch (error) {
  //                   console.error('Error sending push notification for new order:', error);
  //                 }
  //               }

  //               if (currentConversationDB.docId) {
  //                 await deleteConversation(currentConversationDB.docId);
  //               } else {
  //                 notifyAdmin('Erro: Nenhum docId encontrado para excluir a conversa.');
  //               }

  //               if (currentConversation.store.whatsappNumber && currentConversation.store.wabaEnvironments) {
  //                 // enviar mensagem para a loja no numero store.whatsappNumber, sobre a compra efetuada
  //                 const orderMessage = `🛍️ *Novo Pedido Recebido!*\n\n📱 Cliente: ${currentConversation.phoneNumber}\n💰 Total: R$ ${totalPriceWithDelivery.toFixed(2)}\n${buildCartTableString(currentConversation.store, currentConversation.cartItems || [], currentConversation.address?.name).join('\n')}`;

  //                 await sendMessage({
  //                   recipient_type: 'individual',
  //                   messaging_product: 'whatsapp',
  //                   to: currentConversation.store.whatsappNumber,
  //                   type: 'text',
  //                   text: {
  //                     body: orderMessage
  //                   }
  //                 }, currentConversation.store.wabaEnvironments);
  //               }

  //               responsePayload = {
  //                 screen: "ORDER_FINISHED",
  //                 data: {
  //                   itemDescription: "💵 Seu pedido foi enviado e está sendo processado. O pagamento será realizado na entrega.",
  //                   paymentDescription: "",
  //                   cartTable: await buildCartTableStringFromRichText(currentConversation.store, currentConversation.cartItems || [], currentConversation.address?.name)
  //                 }
  //               };
  //             } catch (error: any) {
  //               notifyAdmin('Erro ao gerar link de pagamento:', error.message);

  //             }

  //             break;

  //           default:
  //             // Trate erro de método não reconhecido
  //             break;
  //         }
  //       }

  //       else if (action === 'finalize') {
  //         console.log('Processing FINALIZE action');
  //       }

  //     } else if ((action as string) === 'BACK') {
  //     } else {
  //       // fallback: log, ignore ou retorna erro amigável
  //       console.log('Chamada ignorada ou payload incompleto:', flowData);
  //       // res.status(200).send({ data: { status: 'ignored' } });
  //       // return;
  //     }

  //     console.log('Iniciando a criptografia do payload de resposta', JSON.stringify(responsePayload));

  //     // Criptografar o payload de resposta usando a chave AES
  //     const flipped_iv = initialVectorBuffer.map((byte) => ~byte);
  //     const cipher = crypto.createCipheriv(
  //       'aes-128-gcm',
  //       decryptedAesKey,
  //       Buffer.from(flipped_iv)
  //     );

  //     const encryptedResponse = Buffer.concat([
  //       cipher.update(JSON.stringify(responsePayload), 'utf-8'),
  //       cipher.final(),
  //       cipher.getAuthTag(),
  //     ]).toString('base64');

  //     console.log('Encrypted Response Payload:', encryptedResponse);

  //     // Enviar o payload criptografado como resposta
  //     res.status(200).send(encryptedResponse);
  //   } catch (error) {
  //     console.error('Erro ao processar WhatsApp Flows payload:', error);
  //     res.status(500).send('Erro ao processar WhatsApp Flows payload');
  //   }
  //   return;
  // }
  /***************************************************************************************************************************** */
  // ---------------------------------------------------- FIM DO FLOWS ---------------------------------------------------------
  /***************************************************************************************************************************** */



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

  if (!store?.wabaEnvironments || !store?.flowId) {
    notifyAdmin('Loja não encontrada, ou wabaEnvironments e flowId nao setados para o phoneNumberId: ' + storePhoneNumberId);
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
          const activeOrder = await getActiveOrder(from, store._id);

          if (!message?.interactive) {
            let currentConversation: Conversation | undefined = await getRecentConversation(from, store._id);

            console.log('COMPRAS ANTIGAS', currentConversation, activeOrder)

            if (activeOrder && !currentConversation) {
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

              if (!store?.wabaEnvironments) return;

              await (sendMessage(messagePayload, store.wabaEnvironments))
              return;
            }

            const userFrom = await getUserByPhone(from);

            if (!currentConversation) {

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
                message
              };

              if (userFrom?.address) {
                newConversation.address = userFrom.address;
              }

              const docId = await createConversation(newConversation);
              currentConversation = { ...newConversation, docId };

              const responseMessage = `Olá, seja bem vindo, esse canal é exclusivo para pedidos delivery. O que gostaria de fazer hoje?`

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
                          title: 'Fazer um pedido'
                        }
                      },
                      {
                        type: 'reply',
                        reply: {
                          id: 'call_store',
                          title: 'Falar com a loja'
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

              if (!store?.wabaEnvironments) return;

              await (sendMessage(messagePayload, store.wabaEnvironments))

              return;
            }

            await handleIncomingTextMessage(from, message, store, res, customerName || 'Consumidor', userFrom?.address);
          } else {
            if (message.interactive?.type === 'button_reply' && message.interactive?.button_reply?.id === 'start_new_order') {
              let currentConversation: Conversation | undefined = await getRecentConversation(from, store._id);

              const userFrom = await getUserByPhone(from);

              if (!currentConversation) {

                const flowToken = uuidv4(); // ou outro gerador de token

                // Start new conversation
                const newConversation: Conversation = {
                  date: new Date(),
                  phoneNumber: from,
                  flow: 'WELCOME',
                  selectedAnswers: [],
                  deliveryPrice: store.deliveryPrice,
                  flowToken,
                  customerName: userFrom?.name || '',
                  store,
                  message
                };

                if (userFrom?.address) {
                  newConversation.address = userFrom.address;
                }

                const docId = await createConversation(newConversation);
                currentConversation = { ...newConversation, docId };
              } else {
                await updateConversation(currentConversation, { flow: 'WELCOME', selectedAnswers: [] });
              }

              await handleIncomingTextMessage(from, message, store, res, customerName || 'Consumidor', userFrom?.address);
            }

            else if (message.interactive?.type === 'button_reply' &&
              (message.interactive?.button_reply?.id === 'delivery' || message.interactive?.button_reply?.id === 'counter')) {

              const deliveryChoice = message.interactive.button_reply.id;
              let currentConversation: Conversation | undefined = await getRecentConversation(from, store._id);
              const userFrom = await getUserByPhone(from);

              console.log(`----BOTÃO ${deliveryChoice.toUpperCase()} CLICADO-----`);

              if (!currentConversation || currentConversation.flow !== 'DELIVERY_TYPE') {
                console.log('ERRO: Conversa não encontrada ou flow incorreto para delivery choice');
                return;
              }

              if (deliveryChoice === 'counter') {
                // Cliente escolheu retirada no balcão
                console.log('----cliente ESCOLHEU RETIRADA NO BALCÃO-----')

                await updateConversation(currentConversation, {
                  deliveryOption: 'counter',
                  flow: 'CATEGORIES'
                })

                // Formatar cardápio bonito e enviar direto
                console.log('Enviando cardápio formatado para retirada')

                const beautifulMenu = formatBeautifulMenu(store.menu || []);

                // Atualizar histórico da conversa
                await updateConversation(currentConversation, {
                  deliveryOption: 'counter', // Garantir que mantém como retirada
                  flow: 'CATEGORIES',
                  history: `${currentConversation.history ? currentConversation.history + ' --- ' : ''} Cliente escolheu retirada na loja`
                });

                // Enviar cardápio formatado para o cliente
                if (store.wabaEnvironments) {
                  await sendMessage({
                    messaging_product: 'whatsapp',
                    to: "+" + from,
                    type: 'text',
                    text: { body: `✅ Perfeito! Você escolheu **retirada na loja**.\n\n${beautifulMenu}` }
                  }, store.wabaEnvironments);
                }

              } else if (deliveryChoice === 'delivery') {
                // Cliente escolheu delivery
                console.log('----cliente ESCOLHEU DELIVERY-----')

                await updateConversation(currentConversation, {
                  deliveryOption: 'delivery',
                  flow: 'CHECK_ADDRESS'
                })

                // Agora verifica se tem endereço cadastrado
                if (userFrom?.address) {
                  console.log('----cliente TEM ENDERECO-----')

                  if (store.wabaEnvironments) {
                    await sendMessage({
                      messaging_product: 'whatsapp',
                      to: "+" + from,
                      type: 'text',
                      text: { body: `✅ Endereço encontrado!\n\n📍 **${userFrom.address.name}**\n\nVocê confirma este endereço ou deseja informar outro?` },
                    }, store.wabaEnvironments)
                  }

                  await updateConversation(currentConversation, { flow: 'ADDRESS_CONFIRMATION' })

                } else {
                  console.log('----cliente NAO TEM ENDERECO, PEDE PARA INFORMAR-----')

                  if (store.wabaEnvironments) {
                    await sendMessage({
                      messaging_product: 'whatsapp',
                      to: "+" + from,
                      type: 'text',
                      text: { body: `✅ Por favor, informe seu endereço completo` },
                    }, store.wabaEnvironments)
                  }

                  await updateConversation(currentConversation, { flow: 'NEW_ADDRESS' })
                }
              }
            }
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


