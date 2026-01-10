import { createOrder } from '../controllers/ordersController';
import { deleteConversation, getRecentConversation, updateConversation } from '../controllers/conversationController';
import { sendMessage, notifyAdmin } from './messagingService';
import { Conversation } from '../types/Conversation';
import { MenuItemAnswer, ShoppingCartItem, Store } from '../types/Store';
import { Address } from '../types/User';
import { getUserByPhone, updateUserAddress } from '../controllers/userController';
import { getStoreStatus } from '../controllers/storeController';
import OpenAI from "openai";
import { Client, PlaceAutocompleteType } from '@googlemaps/google-maps-services-js';

import { onInit } from 'firebase-functions/v2/core';
import { v4 as uuidv4 } from 'uuid';

import { classifyCustomerIntent, extractProductsFromMessageWithAI, selectMultipleOptionsByAI, interpretOrderConfirmation, identifyPaymentMethod, identifyDeliveryType, detectAddressInMessage } from './messageHelper';
import { sendMessageWithOptionalAudio } from './messagingService';
import { filterMenuByWeekday } from './orderService';
import { user } from 'firebase-functions/v1/auth';

// Função helper para enviar mensagem com áudio baseado em configuração do usuário
async function sendMessageAccessible(messageData: any, wabaEnvironments: any, enableAudio: boolean = true) {
  return await sendMessageWithOptionalAudio(messageData, wabaEnvironments, enableAudio);
}

// Função para formatar o cardápio de forma bonita
function formatBeautifulMenu(products: any[]): string {
  if (!products || products.length === 0) {
    return '📋 *Cardápio Vazio*\n\nDesculpe, não temos produtos disponíveis no momento.';
  }

  let beautifulMenu = '';

  products.forEach((product) => {
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

  return beautifulMenu;
}

/*
 * Handle incoming text messages from users. 
 * @param from - The sender's phone number.
 * @param message - The message content.
 * @param store - The store information.
 * @param res - The response object.
 * @param name - The name of the user (optional).
 * @returns A promise that resolves when the message is processed.
 */
export interface AIAnswer {
  action: string;
  message: string;
  items: any[];
}

// Initialize heavy dependencies using Firebase onInit
let clientGoogle: Client;
let openAIClient: OpenAI;

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';

// Defer initialization of heavy dependencies
onInit(async () => {
  clientGoogle = new Client({});
  openAIClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
});

// Função auxiliar para calcular preço total de um item incluindo respostas das perguntas
function calculateItemTotalPrice(item: any): number {
  let totalPrice = item.price * item.quantity;

  if (item.questions && Array.isArray(item.questions)) {
    item.questions.forEach((question: any) => {
      if (question.answers && Array.isArray(question.answers)) {
        question.answers.forEach((answer: any) => {
          if (answer.price && answer.price > 0 && answer.quantity) {
            totalPrice += answer.price * answer.quantity * item.quantity;
          }
        });
      }
    });
  }

  return totalPrice;
}

// Função auxiliar para calcular preço de um item com selectedAnswers (formato da extração)
function calculateItemPriceWithSelectedAnswers(item: any, menuData: any[]): number {
  let basePrice = item.price * item.quantity;

  if (item.selectedAnswers && Array.isArray(item.selectedAnswers)) {
    // Buscar o produto no menu para ter acesso às perguntas e preços
    const menuItem = menuData.find((menuProduct: any) => menuProduct.menuId === item.menuId);

    if (menuItem && menuItem.questions) {
      item.selectedAnswers.forEach((selectedAnswer: any) => {
        // Encontrar a pergunta correspondente
        const question = menuItem.questions.find((q: any) => q.questionId === selectedAnswer.questionId);
        if (question && question.answers) {
          // Encontrar a resposta correspondente
          const originalAnswer = question.answers.find((a: any) => a.answerId === selectedAnswer.answerId);
          if (originalAnswer && originalAnswer.price) {
            const answerQuantity = selectedAnswer.quantity || 1;
            basePrice += originalAnswer.price * answerQuantity * item.quantity;
          }
        }
      });
    }
  }

  return basePrice;
}

// Função auxiliar para gerar descrição detalhada de um item incluindo TODAS as respostas selecionadas
function generateItemDescription(item: any): string {
  console.log('generateItemDescription', item)
  let itemTotal = item.price * item.quantity;

  // 🍽️ HEADER DO ITEM com espaçamento e visibilidade melhorada
  let description = `🍽️ *${item.quantity}x ${item.menuName.toUpperCase()}*`;

  // Lista de todas as respostas selecionadas (pagas e gratuitas)
  const allAnswerDetails: string[] = [];

  if (item.questions && Array.isArray(item.questions)) {
    item.questions.forEach((question: any) => {
      if (question.answers && Array.isArray(question.answers)) {
        // Mostrar a pergunta como cabeçalho mais visível
        const questionTitle = `📝 ${question.questionName}:`;
        const selectedAnswers: string[] = [];

        question.answers.forEach((answer: any) => {
          if (answer.quantity && answer.quantity > 0) {
            // Calcular total do adicional se tiver preço
            if (answer.price && answer.price > 0) {
              const answerTotal = answer.price * answer.quantity * item.quantity;
              selectedAnswers.push(`   • ${answer.quantity}x ${answer.answerName} (+R$ ${answerTotal.toFixed(2)})`);
              itemTotal += answerTotal;
            } else {
              // Resposta gratuita
              selectedAnswers.push(`   • ${answer.quantity}x ${answer.answerName}`);
            }
          }
        });

        // Adicionar pergunta e respostas se houver seleções
        if (selectedAnswers.length > 0) {
          allAnswerDetails.push(`${questionTitle}\n${selectedAnswers.join('\n')}`);
        }
      }
    });
  }

  // Adicionar detalhes de todas as respostas se houver
  if (allAnswerDetails.length > 0) {
    description += `\n\n${allAnswerDetails.join('\n\n')}`;
  }

  // 💰 PREÇO em linha separada e destaque
  description += `\n\n💰 *VALOR: R$ ${itemTotal.toFixed(2)}*`;

  return description;
}

// Função auxiliar para processar próximo produto da fila
async function processNextProductInQueue(
  conversation: Conversation,
  store: any,
  from: string
): Promise<void> {
  const { pendingProductsQueue = [], cartItems = [] } = conversation;

  console.log('--<>-- processNextProductInQueue --<>--', pendingProductsQueue)

  if (pendingProductsQueue.length === 0) {
    // Sem mais produtos na fila - mostrar resumo final
    const subtotal = cartItems.reduce((total, item) => total + calculateItemTotalPrice(item), 0);
    const isDelivery = conversation.deliveryOption === 'delivery';
    const deliveryPrice = isDelivery ? (store.deliveryPrice || 0) : 0;
    const totalFinal = subtotal + deliveryPrice;
    const itemsSummary = cartItems.map((item: any) => generateItemDescription(item)).join('\n\n━━━━━━━━━━━━━━━━━━━━\n\n');

    await updateConversation(conversation, {
      flow: 'CATEGORIES',
      pendingProductsQueue: undefined,
      currentProcessingProduct: null,
      product: null,
      currentQuestionIndex: null
    });

    const deliveryText = isDelivery ? `\n🚚 *Entrega:* R$ ${deliveryPrice.toFixed(2)}` : '';
    const deliveryLabel = isDelivery ? 'entrega' : 'retirada na loja';

    await sendMessage({
      messaging_product: 'whatsapp',
      to: "+" + from,
      type: 'text',
      text: { body: `✅ Todos os produtos foram adicionados!\n\n🛒 *RESUMO DO PEDIDO* (${deliveryLabel}):\n\n━━━━━━━━━━━━━━━━━━━━\n\n${itemsSummary}\n\n━━━━━━━━━━━━━━━━━━━━\n\n💰 *Subtotal:* R$ ${subtotal.toFixed(2)}${deliveryText}\n💵 *TOTAL:* R$ ${totalFinal.toFixed(2)}\n\n❓ *O que deseja fazer agora?*\n\n🔹 *ADICIONAR MAIS PRODUTOS*\n🔹 *FINALIZAR PEDIDO*` }
    }, store.wabaEnvironments);

    return;
  }

  // Pegar próximo produto da fila
  const nextProduct = pendingProductsQueue[0];
  const remainingQueue = pendingProductsQueue.slice(1);
  const fullMenuItem = filterMenuByWeekday(store.menu).find((item: any) => item.menuId === nextProduct.menuId);

  if (!fullMenuItem) {
    // Produto não encontrado - pular para o próximo
    await updateConversation(conversation, {
      pendingProductsQueue: remainingQueue
    });
    await processNextProductInQueue(conversation, store, from);
    return;
  }

  if (!fullMenuItem.questions || fullMenuItem.questions.length === 0) {
    // Produto sem perguntas - adicionar direto ao carrinho
    const newCartItem: any = {
      id: `${nextProduct.menuId}-${Date.now()}-${Math.random()}`,
      menuId: nextProduct.menuId,
      menuName: nextProduct.menuName,
      menuDescription: fullMenuItem.menuDescription || '',
      categoryId: fullMenuItem.categoryId || 0,
      allDays: fullMenuItem.allDays || [],
      price: nextProduct.price,
      quantity: nextProduct.quantity,
      questions: [],
      selectedAnswers: nextProduct.selectedAnswers?.map((answer: any) => answer.answerName) || []
    };

    cartItems.push(newCartItem);

    await updateConversation(conversation, {
      cartItems: cartItems,
      pendingProductsQueue: remainingQueue
    });

    // await sendMessage({
    //   messaging_product: 'whatsapp',
    //   to: "+" + from,
    //   type: 'text',
    //   text: { body: `✅ ${nextProduct.quantity}x ${nextProduct.menuName} adicionado ao pedido!` }
    // }, store.wabaEnvironments);

    // Processar próximo produto
    await processNextProductInQueue({ ...conversation, cartItems, pendingProductsQueue: remainingQueue }, store, from);
    return;
  }

  // Check if extracted answers already satisfy question requirements
  const extractedAnswers = nextProduct.selectedAnswers || [];
  const questionsNeedingAnswers = fullMenuItem.questions.filter((question: any) => {
    const currentQuestionAnswers = extractedAnswers.filter(answer => answer.questionId === question.questionId);
    const totalAnswerQuantity = currentQuestionAnswers.reduce((sum, answer) => sum + (answer.quantity || 1), 0);
    return totalAnswerQuantity < question.minAnswerRequired;
  });

  // If all required answers are already provided by AI extraction
  if (questionsNeedingAnswers.length === 0) {
    // Build cart item with extracted answers - include only selected answers
    const structuredAnswers = fullMenuItem.questions.map((question: any) => {
      const questionAnswers = extractedAnswers.filter(answer => answer.questionId === question.questionId);

      if (questionAnswers.length === 0) {
        return null; // No answers selected for this question
      }

      const selectedAnswersOnly = questionAnswers.map((selectedAnswer: any) => {
        const originalAnswer = question.answers?.find((a: any) => a.answerId === selectedAnswer.answerId);
        return {
          answerId: selectedAnswer.answerId,
          answerName: selectedAnswer.answerName,
          quantity: selectedAnswer.quantity || 1,
          price: originalAnswer?.price || 0
        };
      });

      return {
        ...question,
        answers: selectedAnswersOnly
      };
    }).filter((question: any) => question !== null); // Remove questions with no selected answers

    const newCartItem: any = {
      id: `${nextProduct.menuId}-${Date.now()}-${Math.random()}`,
      menuId: nextProduct.menuId,
      menuName: nextProduct.menuName,
      menuDescription: fullMenuItem.menuDescription || '',
      categoryId: fullMenuItem.categoryId || 0,
      allDays: fullMenuItem.allDays || [],
      price: nextProduct.price,
      quantity: nextProduct.quantity,
      questions: structuredAnswers,
      selectedAnswers: extractedAnswers.map((answer: any) => answer.answerName) || []
    };

    cartItems.push(newCartItem);

    // Generate description with extracted optionals and their prices for confirmation
    let extractedDescription = '';
    let additionalCost = 0;

    if (extractedAnswers.length > 0) {
      const answerDescriptions: string[] = [];

      extractedAnswers.forEach((selectedAnswer: any) => {
        // Find the original answer data to get the price
        const question = fullMenuItem.questions.find((q: any) => q.questionId === selectedAnswer.questionId);
        const originalAnswer = question?.answers?.find((a: any) => a.answerId === selectedAnswer.answerId);

        if (originalAnswer) {
          const answerQuantity = selectedAnswer.quantity || 1;
          if (originalAnswer.price && originalAnswer.price > 0) {
            const answerTotal = originalAnswer.price * answerQuantity;
            additionalCost += answerTotal;
            answerDescriptions.push(`${selectedAnswer.answerName} (+R$ ${answerTotal.toFixed(2)})`);
          } else {
            answerDescriptions.push(selectedAnswer.answerName);
          }
        } else {
          answerDescriptions.push(selectedAnswer.answerName);
        }
      });

      extractedDescription = ` com ${answerDescriptions.join(', ')}`;
    }

    // Calculate total item cost including optionals
    const itemBaseTotal = nextProduct.price * nextProduct.quantity;
    const finalAdditionalCost = additionalCost * nextProduct.quantity;
    const itemFinalTotal = itemBaseTotal + finalAdditionalCost;

    await updateConversation(conversation, {
      cartItems: cartItems,
      pendingProductsQueue: remainingQueue
    });

    // await sendMessage({
    //   messaging_product: 'whatsapp',
    //   to: "+" + from,
    //   type: 'text',
    //   text: { body: `✅ ${nextProduct.quantity}x ${nextProduct.menuName}${extractedDescription} adicionado ao pedido! - R$ ${itemFinalTotal.toFixed(2)}` }
    // }, store.wabaEnvironments);

    // Processar próximo produto
    await processNextProductInQueue({ ...conversation, cartItems, pendingProductsQueue: remainingQueue }, store, from);
    return;
  }

  // Produto com perguntas - iniciar fluxo de customização
  const firstQuestion = fullMenuItem.questions[0];
  const optionsList = firstQuestion.answers?.map((answer: any) =>
    `• ${answer.answerName}${answer.price > 0 ? ` (+R$ ${answer.price.toFixed(2)})` : ''}`
  ).join('\n') || 'Opções não disponíveis';

  await updateConversation(conversation, {
    flow: 'PRODUCT_QUESTIONS',
    currentProcessingProduct: nextProduct,
    pendingProductsQueue: remainingQueue,
    product: {
      id: uuidv4(),
      menuId: nextProduct.menuId,
      menuName: nextProduct.menuName,
      menuDescription: fullMenuItem.menuDescription || '',
      categoryId: fullMenuItem.categoryId || 0,
      allDays: fullMenuItem.allDays || true,
      price: nextProduct.price,
      quantity: nextProduct.quantity,
      questions: [],
      selectedAnswers: nextProduct.selectedAnswers?.map((answer: any) => answer.answerName) || []
    },
    currentQuestionIndex: 0
  });

  await sendMessage({
    messaging_product: 'whatsapp',
    to: "+" + from,
    type: 'text',
    text: { body: `🍽️ *PERSONALIZAR PRODUTO* 🍽️\n\n*${nextProduct.quantity}x ${nextProduct.menuName}*\n\n❓ *${firstQuestion.questionName.toUpperCase()}*\n\n${optionsList}\n\n👆 *ESCOLHA UMA OPÇÃO:*` }
  }, store.wabaEnvironments);
}

// Cache to store address details temporarily
// Função para calcular distância usando fórmula de Haversine
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Raio da Terra em km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distância em km
  return d;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

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

// verificar timeout de conversa
const CONVERSATION_TIMEOUT = 5 * 60 * 1000; // 5 minutos

export function parseAIResponse(content: string | null): AIAnswer {
  if (!content || typeof content !== "string") {
    return { action: "error", message: "Resposta vazia", items: [] };
  }

  try {
    // Remove blocos markdown e limpa conteúdo
    let clean = content
      .replace(/```(?:json)?/gi, "")
      .replace(/```/g, "")
      .trim();

    // Tenta extrair JSON válido
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("JSON não encontrado na resposta:", content);
      return { action: "error", message: "Formato de resposta inválido", items: [] };
    }

    clean = jsonMatch[0];

    // Corrige aspas simples para duplas
    if (clean.includes("'") && !clean.includes('"')) {
      clean = clean.replace(/'/g, '"');
    }

    // CORREÇÃO CRÍTICA: Escapar quebras de linha problemáticas
    // Encontra mensagens com quebras de linha e corrige
    clean = clean.replace(/"mensagem":\s*"([^"]*(?:\\.[^"]*)*)"/g, (match, messageContent) => {
      // Substitui quebras de linha literais por \\n escapadas
      const escapedMessage = messageContent
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
      return `"mensagem": "${escapedMessage}"`;
    });

    const parsed = JSON.parse(clean);

    // Validação da estrutura obrigatória
    if (!parsed.action) {
      console.error("Campo 'action' ausente na resposta:", parsed);
      return { action: "error", message: "Resposta sem ação definida", items: [] };
    }

    if (!parsed.mensagem && !parsed.message) {
      console.error("Campo 'mensagem' ausente na resposta:", parsed);
      return { action: "error", message: "Resposta sem mensagem", items: [] };
    }

    // Normaliza campo mensagem
    const normalizedResponse = {
      action: parsed.action,
      message: parsed.mensagem || parsed.message,
      items: parsed.items || [],
      endereco: parsed.endereco || ''
    };

    console.log('NORMALIZED RESPONSE', normalizedResponse)

    // Validação mais rigorosa para "Pedido Finalizado"
    if (parsed.action === "Pedido Finalizado") {
      if (!normalizedResponse.items || normalizedResponse.items.length === 0) {
        console.warn("AVISO: Pedido finalizado sem itens - permitindo continuar", parsed);
      }

      // Logs informativos mas não bloqueiam
      const hasOrderDetails = normalizedResponse.message.toLowerCase().includes("total") ||
        normalizedResponse.message.toLowerCase().includes("r$");
      const hasPaymentQuestion = normalizedResponse.message.toLowerCase().includes("pagamento") ||
        normalizedResponse.message.toLowerCase().includes("pix") ||
        normalizedResponse.message.toLowerCase().includes("cartão");

      if (!hasOrderDetails) {
        console.warn("AVISO: Mensagem sem detalhes do pedido - mas continuando");
      }
      if (!hasPaymentQuestion) {
        console.warn("AVISO: Mensagem sem pergunta de pagamento - mas continuando");
      }

      // Validação crítica: verificar se items têm estrutura correta
      if (normalizedResponse.items && normalizedResponse.items.length > 0) {
        normalizedResponse.items.forEach((item: any, index: number) => {
          if (!item.menuId || !item.menuName || !item.quantity) {
            console.error(`ERRO CRÍTICO: Item ${index} está incompleto:`, item);
          }

          // Log para debug: verificar se tem questions quando deveria ter
          if (item.questions && item.questions.length > 0) {
            console.log(`✅ Item ${item.menuName} tem ${item.questions.length} questions configuradas`);
            item.questions.forEach((q: any) => {
              if (q.answers && q.answers.length > 0) {
                console.log(`   - ${q.questionName}: ${q.answers.map((a: any) => a.answerName).join(', ')}`);
              }
            });
          } else {
            console.warn(`⚠️ Item ${item.menuName} não tem questions (pode estar faltando adicionais)`);
          }
        });
      }
    }

    return normalizedResponse;
  } catch (err: any) {
    console.error("Erro ao parsear resposta do modelo:", err.message, content);

    // Fallback: tentar extrair apenas action e message básicos
    try {
      const actionMatch = content.match(/"action":\s*"([^"]+)"/);
      const messageMatch = content.match(/"mensagem":\s*"([^"]+)"/) || content.match(/"message":\s*"([^"]+)"/);

      if (actionMatch && messageMatch) {
        console.warn("Usando fallback para parsing - JSON mal formado corrigido");
        return {
          action: actionMatch[1],
          message: messageMatch[1].replace(/\\n/g, '\n').replace(/\\r/g, '\r'),
          items: []
        };
      }
    } catch (fallbackErr) {
      console.error("Fallback parsing também falhou:", fallbackErr);
    }

    return { action: "error", message: "Erro ao processar resposta", items: [] };
  }
}

export async function handleIncomingTextMessage(
  currentConversation: Conversation,
  from: string,
  message: any,
  store: Store,
  res: any,
  name?: string,
  address?: Address,
): Promise<void> {
  console.log('MENSAGEM RECEBIDA', message)

  if (message?.interactive?.type === 'nfm_reply') {
    return
  }

  if (!store.wabaEnvironments) {
    notifyAdmin(' conversa:', 'Loja não possui WABA configurado');
    return;
  }

  try {
    // Loja Aberta
    if (!currentConversation) {
      // TODO: handle;
      console.log('Nenhuma conversa recente encontrada para o número:', from);
      return;
    }


    // Atualiza a Conversation com a mensagem d 
    await updateConversation(currentConversation, {
      history: `${currentConversation.history ? currentConversation.history + ' --- ' : ''} ${message?.text?.body}`
    });

    try {
      // verifica tipo de entrega desejado
      if (currentConversation?.flow === 'WELCOME') {
        const messageIntention = await classifyCustomerIntent(message.text.body, currentConversation?.cartItems?.map(item => ({ menuId: item.menuId, menuName: item.menuName, quantity: item.quantity })));

        switch (messageIntention.intent) {
          case "greeting":
          case "other":
          case "want_menu_or_start":
            const beautifulMenu = formatBeautifulMenu(filterMenuByWeekday(store.menu || []));
            // Enviar cardápio formatado para o cliente
            if (store.wabaEnvironments) {
              await sendMessage({
                messaging_product: 'whatsapp',
                to: "+" + from,
                type: 'text',
                text: { body: `📋 *NOSSO CARDÁPIO* 📋\n\n🍽️ C O N F I R A   N O S S A S   O P Ç Õ E S:\n\n${beautifulMenu}` }
              }, store.wabaEnvironments);

              const menuMessage = '📱 *COMO FAZER SEU PEDIDO* 📱\n\n🗣️ INFORME O PRODUTO DESEJADO\n\n🎤 *PODE MANDAR MENSAGEM DE VOZ!*\n\n📝 *EXEMPLOS:*\n"Quero uma pizza margherita"\n"1 marmitex médio"\n\n👆 *DIGITE OU FALE AGORA:*';

              await sendMessage({
                messaging_product: 'whatsapp',
                to: "+" + from,
                type: 'text',
                text: { body: `${menuMessage}` }
              }, store.wabaEnvironments);
            }

            return;
          case "ordering_products":
            console.log('vai ENVIAR A MENSAGEM.......do tipo de delvry')

            // Save message in conversartions
            await updateConversation(currentConversation, {
              lastMessage: message.text.body,
            })

            // Verificar se a mensagem contém um endereço de entrega
            const addressDetection = await detectAddressInMessage(message.text.body);

            console.log('addressDetection', addressDetection)

            if (addressDetection && addressDetection.hasAddress && addressDetection.confidence > 50) {
              // Entrega - verificar endereço
              await updateConversation(currentConversation, {
                deliveryOption: 'delivery',
                flow: 'CHECK_ADDRESS'
              });

              const addressFound = addressDetection.parsedAddress?.street ? `${addressDetection.parsedAddress?.street} ${addressDetection.parsedAddress?.number ? `,${addressDetection.parsedAddress?.number}` : ''} ${addressDetection.parsedAddress?.neighborhood ? ` - ${addressDetection.parsedAddress?.neighborhood}` : ''}` : '';

              if (addressFound) {
                await sendMessage({
                  messaging_product: 'whatsapp',
                  to: "+" + from,
                  type: 'text',
                  text: { body: `✅ *PEDIDO PARA ENTREGA* ✅\n\n📍 ${addressFound}\n\n❓ *VOCÊ CONFIRMA ESTE ENDEREÇO?*` } // 📝 *OU INFORME OUTRO ENDEREÇO:*
                }, store.wabaEnvironments);

                await updateConversation(currentConversation, {
                  flow: 'ADDRESS_CONFIRMATION',
                  pendingAddress: addressFound
                });
              } else {
                await sendMessage({
                  messaging_product: 'whatsapp',
                  to: "+" + from,
                  type: 'text',
                  text: { body: '✅ *PEDIDO PARA ENTREGA* ✅\n\n📍 *INFORME SEU ENDEREÇO* 📍\n\n🏠 POR FAVOR INFORME SEU *ENDEREÇO*\n\n📝 *EXEMPLO:*\nRua das Torres, 123, apto 45' }
                }, store.wabaEnvironments);

                await updateConversation(currentConversation, { flow: 'NEW_ADDRESS' });
              }

              return;
            } else {
              const userFrom = await getUserByPhone(from);
              if (userFrom?.address?.name && userFrom?.address?.name !== 'Endereço não informado') {

                await sendMessage({
                  messaging_product: 'whatsapp',
                  to: "+" + from,
                  type: 'text',
                  text: { body: `✅ *PEDIDO PARA ENTREGA* ✅\n\n📍 ${userFrom.address.name}\n\n❓ *VOCÊ CONFIRMA ESTE ENDEREÇO?*` } // 📝 *OU INFORME OUTRO ENDEREÇO:*
                }, store.wabaEnvironments);

                await updateConversation(currentConversation, {
                  flow: 'ADDRESS_CONFIRMATION',
                  pendingAddress: userFrom.address.name
                });
                return;
              }
            }

            // Save message in conversartions
            await updateConversation(currentConversation, {
              lastMessage: message.text.body,
              flow: 'DELIVERY_TYPE'
            })

            //Send delivery type message 
            await sendMessageAccessible({
              messaging_product: 'whatsapp',
              to: "+" + from,
              type: 'text',
              text: { body: `🚚 *ENTREGA OU RETIRADA?* 🚚\n\n📍 Informe seu *ENDEREÇO PARA ENTREGA* ou responda *RETIRADA* para retirar seu pedido na loja` }
            }, store.wabaEnvironments, true)

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

      if (currentConversation?.flow === 'DELIVERY_TYPE') {
        // Processar escolha de entrega/retirada com IA
        if (!message?.text?.body) {
          return;
        }

        const deliveryChoice = await identifyDeliveryType(message.text.body);
        console.log('Delivery type identification:', deliveryChoice);

        if (!deliveryChoice.type || deliveryChoice.confidence < 50) {
          await sendMessage({
            messaging_product: 'whatsapp',
            to: "+" + from,
            type: 'text',
            text: { body: '🚚 *ENTREGA OU RETIRADA?* 🚚\n\n📍 Informe seu *ENDEREÇO PARA ENTREGA* ou responda *RETIRADA* para retirar seu pedido na loja' }
          }, store.wabaEnvironments);
          return;
        }

        // Processar escolha confirmada
        if (deliveryChoice.type === 'counter') {
          // Retirada - processar produtos da mensagem original
          await updateConversation(currentConversation, {
            deliveryOption: 'counter',
            flow: 'CATEGORIES'
          });

          if (currentConversation.lastMessage) {
            console.log('VAI ENVIAR A MENSAGEM P EXTRACAO', currentConversation.lastMessage, filterMenuByWeekday(store.menu).map(item => ({ menuId: item.menuId, menuName: item.menuName, price: item.price })))

            const extractedProducts = await extractProductsFromMessageWithAI(
              currentConversation.lastMessage,
              filterMenuByWeekday(store.menu)
            );

            extractedProducts.items?.map(item => {
              item.selectedAnswers?.forEach(answer =>
                console.log('RETORNO DA EXTRACAO DA INTENCAO', answer)
              )
            })

            if (extractedProducts?.ambiguidades?.length) {
              const itensAmbiguos = extractedProducts.ambiguidades[0].items.map(item => `${item.menuName} - R$ ${item.price.toFixed(2)}`).join('\n');

              if (itensAmbiguos?.length > 1) {
                extractedProducts.ambiguidades[0].refining = true;

                await updateConversation(currentConversation, {
                  flow: 'ORDER_REFINMENT',
                  refinmentItems: extractedProducts,
                });

                await sendMessage({
                  messaging_product: 'whatsapp',
                  to: "+" + from,
                  type: 'text',
                  text: { body: `🔍 *ESCOLHA SEU PRODUTO* 🔍\n\n📝 VOCÊ PEDIU:\n*${extractedProducts.ambiguidades[0].quantity}x ${extractedProducts.ambiguidades[0].palavra.toUpperCase()}*\n\n⬇️ *OPÇÕES DISPONÍVEIS* ⬇️\n\n${itensAmbiguos}\n\n❓ *QUAL OPÇÃO VOCÊ DESEJA?*` }
                }, store.wabaEnvironments);
              } else {
                await sendMessage({
                  messaging_product: 'whatsapp',
                  to: "+" + from,
                  type: 'text',
                  text: { body: `❌ *PRODUTO NÃO ENCONTRADO* ❌\n\n🔍 *NÃO CONSEGUI IDENTIFICAR*\n\n📋 *POR FAVOR:*\nInforme produtos do nosso C A R D Á P I O\n\n📱 *Digite o nome do produto que deseja*` }
                }, store.wabaEnvironments);

                await updateConversation(currentConversation, { flow: 'CATEGORIES' })
              }
            } else if (extractedProducts.items && extractedProducts.items.length > 0) {
              const itensResolvidos = extractedProducts.items.map((item: any) => {
                const totalPrice = calculateItemPriceWithSelectedAnswers(item, filterMenuByWeekday(store.menu));

                // Montar descrição dos opcionais com preços individuais
                let opcString = '';

                console.log('***************************************xxxxxx', item.selectedAnswers)

                if (item.selectedAnswers && item.selectedAnswers.length > 0) {
                  const menuItem = filterMenuByWeekday(store.menu).find((m: any) => m.menuId === item.menuId);
                  const opcionaisComPreco: string[] = [];

                  item.selectedAnswers.forEach((selectedAnswer: any) => {
                    const question = menuItem?.questions?.find((q: any) => q.questionId === selectedAnswer.questionId);
                    const originalAnswer = question?.answers?.find((a: any) => a.answerId === selectedAnswer.answerId);
                    opcionaisComPreco.push(originalAnswer?.answerName || '' + (originalAnswer?.price && originalAnswer?.price > 0 ? `(+ ${(originalAnswer?.price * (originalAnswer?.quantity || 1)).toFixed(2)})` : ''))
                  });

                  opcString = ` (${opcionaisComPreco.join(', ')})`;
                }

                return `🔹 ${item.quantity}x ${item.menuName}${opcString} - R$ ${totalPrice.toFixed(2)}\n`;
              }).join('\n');

              await updateConversation(currentConversation, {
                flow: 'ORDER_REFINMENT_CONFIRMATION',
                refinmentItems: {
                  items: extractedProducts.items, // Preserva selectedAnswers de todos os items
                  ambiguidades: extractedProducts.ambiguidades || []
                }
              });

              await sendMessage({
                messaging_product: 'whatsapp',
                to: "+" + from,
                type: 'text',
                text: { body: `✅ *CONFIRMAÇÃO DO PEDIDO* ✅\n\n📋 SEU PEDIDO:\n\n${itensResolvidos}\n\n❓ *ESTÁ CORRETO? POSSO ADICIONAR AO CARRINHO?` }
              }, store.wabaEnvironments);
            } else {
              await sendMessage({
                messaging_product: 'whatsapp',
                to: "+" + from,
                type: 'text',
                text: { body: `❌ *PRODUTO NÃO ENCONTRADO* ❌\n\n🔍 NÃO CONSEGUI IDENTIFICAR\n\n📋 *POR FAVOR:*\nInforme produtos do nosso CARDÁPIO\n\n📱 *Digite o nome do produto que deseja*` }
              }, store.wabaEnvironments);

              await updateConversation(currentConversation, { flow: 'CATEGORIES' })
            }
          }
        } else if (deliveryChoice.type === 'delivery') {
          // Entrega - verificar endereço
          await updateConversation(currentConversation, {
            deliveryOption: 'delivery',
            flow: 'CHECK_ADDRESS'
          });

          const userFrom = await getUserByPhone(from);

          const addressFound = deliveryChoice.parsedAddress?.street ? `${deliveryChoice.parsedAddress?.street} ${deliveryChoice.parsedAddress?.number ? `,${deliveryChoice.parsedAddress?.number}` : ''} ${deliveryChoice.parsedAddress?.neighborhood ? ` - ${deliveryChoice.parsedAddress?.neighborhood}` : ''}` : userFrom?.address?.name

          if (addressFound) {
            await sendMessage({
              messaging_product: 'whatsapp',
              to: "+" + from,
              type: 'text',
              text: { body: `✅ *PEDIDO PARA ENTREGA* ✅\n\n📍 ${addressFound}\n\n❓ *VOCÊ CONFIRMA ESTE ENDEREÇO?*` }
            }, store.wabaEnvironments);

            await updateConversation(currentConversation, {
              flow: 'ADDRESS_CONFIRMATION',
              pendingAddress: addressFound
            });
          } else {

            await sendMessage({
              messaging_product: 'whatsapp',
              to: "+" + from,
              type: 'text',
              text: { body: '✅ *PEDIDO PARA ENTREGA* ✅\n\n📍 *INFORME SEU ENDEREÇO* 📍\n\n🏠 *POR FAVOR INFORME SEU ENDEREÇO*\n\n📝 *EXEMPLO:*\nRua das Torres, 123, apto 45' }
            }, store.wabaEnvironments);

            await updateConversation(currentConversation, { flow: 'NEW_ADDRESS' });
          }
        }

        return;
      }

      if (currentConversation?.flow === 'NEW_ADDRESS') {
        console.log('---------new ADDRESS---------', message?.text?.body)

        const address = message?.text?.body;
        if (!address) {
          await sendMessageAccessible({
            messaging_product: 'whatsapp',
            to: "+" + from,
            type: 'text',
            text: { body: `📍 *INFORME SEU ENDEREÇO* 📍\n\n📝 *EXEMPLO:*\nRua das Torres, 123, apto 45` },
          }, store.wabaEnvironments, true)

          return;
        }

        console.log('ENDERECO INFORMADO', address, `${address} - ${store.address?.city || ''} - ${store.address?.state || ''}`)

        sendMessage({
          messaging_product: 'whatsapp',
          to: "+" + from,
          type: 'text',
          text: { body: `✅ Posso confirmar o endereço informado? ${address}` },
        }, store.wabaEnvironments)

        await updateConversation(currentConversation, { flow: 'ADDRESS_CONFIRMATION' })

        return;
      }

      // verifica se e confirmacao de endereco
      if (currentConversation?.flow === 'ADDRESS_CONFIRMATION') {

        // Chamar OpenAI para interpretar a resposta do cliente
        const userResponse = message?.text?.body || '';
        const addressConfirmationResult = await interpretAddressConfirmation(userResponse);

        console.log('Resposta interpretada:', addressConfirmationResult);

        if (addressConfirmationResult.confirmed) {
          // Cliente confirmou o endereço
          console.log('Cliente confirmou o endereço');

          // Salvar endereço pendente como address da conversation
          const confirmedAddress = currentConversation.pendingAddress;

          // Delivery - Endereco obtido - processar produtos da mensagem original
          await updateConversation(currentConversation, {
            deliveryOption: 'delivery',
            flow: 'CATEGORIES',
            address: confirmedAddress ? { name: confirmedAddress, main: true, neighborhood: '', number: '', zipCode: '', street: '' } : undefined,
            pendingAddress: undefined // limpar o endereço pendente
          });

          if (currentConversation.lastMessage) {
            const extractedProducts = await extractProductsFromMessageWithAI(
              currentConversation.lastMessage,
              filterMenuByWeekday(store.menu)
            );

            if (extractedProducts?.ambiguidades?.length) {
              const itensAmbiguos = extractedProducts.ambiguidades[0].items.map(item => {
                let itemText = `${item.menuName}`;
                if (item.price > 0) {
                  itemText += ` - R$ ${item.price.toFixed(2)}`;
                }

                // Encontrar o item completo do menu para obter as perguntas
                const fullMenuItem = store.menu.find(menuItem => menuItem.menuId === item.menuId);
                if (fullMenuItem && fullMenuItem.questions && fullMenuItem.questions.length > 0) {
                  const questionsText = fullMenuItem.questions.map(question => {
                    const answersText = question.answers ? question.answers.map(answer => {
                      let answerText = answer.answerName;
                      if (answer.price && answer.price > 0) {
                        answerText += ` (+R$ ${answer.price.toFixed(2)})`;
                      }
                      return answerText;
                    }).join(', ') : '';
                    return `\n  ${question.questionName}: ${answersText}`;
                  }).join('');
                  itemText += questionsText;
                }

                return itemText;
              }).join('\n\n');

              if (itensAmbiguos?.length > 1) {
                extractedProducts.ambiguidades[0].refining = true;

                await updateConversation(currentConversation, {
                  flow: 'ORDER_REFINMENT',
                  refinmentItems: extractedProducts,
                });

                await sendMessage({
                  messaging_product: 'whatsapp',
                  to: "+" + from,
                  type: 'text',
                  text: { body: `🔍 *ESCOLHA SEU PRODUTO* 🔍\n\n📝 V O C Ê   P E D I U:\n*${extractedProducts.ambiguidades[0].quantity}x ${extractedProducts.ambiguidades[0].palavra.toUpperCase()}*\n\n⬇️ *OPÇÕES DISPONÍVEIS* ⬇️\n\n${itensAmbiguos}\n\n❓ *QUAL OPÇÃO VOCÊ DESEJA?*` }
                }, store.wabaEnvironments);
              }
              else {

                await sendMessage({
                  messaging_product: 'whatsapp',
                  to: "+" + from,
                  type: 'text',
                  text: { body: `❌ *PRODUTO NÃO ENCONTRADO* ❌\n\n🔍 N Ã O   C O N S E G U I   I D E N T I F I C A R\n\n📋 *POR FAVOR:*\nInforme produtos do nosso C A R D Á P I O\n\n📱 *Digite o nome do produto que deseja*` }
                }, store.wabaEnvironments);

                await updateConversation(currentConversation, { flow: 'CATEGORIES' })
              }
            } else if (extractedProducts.items && extractedProducts.items.length > 0) {
              const itensResolvidos = extractedProducts.items.map((item: any) => {
                const totalPrice = calculateItemPriceWithSelectedAnswers(item, filterMenuByWeekday(store.menu));

                // Montar descrição dos opcionais com preços individuais
                let opcString = '';

                // console.log('**************************xxxxxx', item.selectedAnswers)

                if (item.selectedAnswers && item.selectedAnswers.length > 0) {
                  const menuItem = filterMenuByWeekday(store.menu).find((m: any) => m.menuId === item.menuId);
                  const opcionaisComPreco: string[] = [];

                  item.selectedAnswers.forEach((selectedAnswer: any) => {
                    const question = menuItem?.questions?.find((q: any) => q.questionId === selectedAnswer.questionId);
                    const originalAnswer = question?.answers?.find((a: any) => a.answerId === selectedAnswer.answerId);
                    opcionaisComPreco.push(originalAnswer?.answerName || '' + (originalAnswer?.price && originalAnswer?.price > 0 ? `(+ ${(originalAnswer?.price * (originalAnswer?.quantity || 1)).toFixed(2)})` : ''))
                  });

                  opcString = ` (${opcionaisComPreco.join(', ')})`;
                }

                return `🔹 ${item.quantity}x ${item.menuName}${opcString} - R$ ${totalPrice.toFixed(2)}\n`;
              }).join('\n');

              await updateConversation(currentConversation, {
                flow: 'ORDER_REFINMENT_CONFIRMATION',
                refinmentItems: extractedProducts
              });

              await sendMessage({
                messaging_product: 'whatsapp',
                to: "+" + from,
                type: 'text',
                text: { body: `✅ *CONFIRMAÇÃO DO PEDIDO* ✅\n\n${itensResolvidos}\n\n❓ *ESTÁ CORRETO? POSSO ADICIONAR AO CARRINHO?*` }
              }, store.wabaEnvironments);
            } else {
              await sendMessage({
                messaging_product: 'whatsapp',
                to: "+" + from,
                type: 'text',
                text: { body: `✅ *Não consegui identificar o produto informado, por favor, informe um ou mais produtos do cardápio` }
              }, store.wabaEnvironments);

              await updateConversation(currentConversation, { flow: 'CATEGORIES' })
            }
          } else {
            await updateConversation(currentConversation, { flow: 'CATEGORIES' });

            // Cliente já tem endereço confirmado pelo sistema
            const beautifulMenu = formatBeautifulMenu(filterMenuByWeekday(store.menu || []));

            // Atualizar histórico da conversa
            await updateConversation(currentConversation, {
              // flow: 'CATEGORIES',
              history: `${currentConversation.history ? currentConversation.history + ' --- ' : ''} Endereço confirmado, cardápio enviado`
            });

            // Enviar cardápio formatado para o cliente
            await sendMessage({
              messaging_product: 'whatsapp',
              to: "+" + from,
              type: 'text',
              text: { body: beautifulMenu }
            }, store.wabaEnvironments);

          }

        } else if (addressConfirmationResult.newAddress) {
          // Cliente forneceu um novo endereço
          console.log('Cliente forneceu novo endereço:', addressConfirmationResult.newAddress);

          await sendMessage({
            messaging_product: 'whatsapp',
            to: "+" + from,
            type: 'text',
            text: { body: `📍 *CONFIRMAR ENDEREÇO* 📍\n\n🏠 *ENDEREÇO*   I N F O R M A D O:\n*${addressConfirmationResult.newAddress}*\n\n❓ *ESTE ENDEREÇO ESTÁ CORRETO?*\n\n` }
          }, store.wabaEnvironments);

          // Atualizar para fluxo de novo endereço e reprocessar
          delete currentConversation.address;
          await updateConversation(currentConversation, {
            flow: 'ADDRESS_CONFIRMATION',
            pendingAddress: addressConfirmationResult.newAddress // salvar novo endereço como pendente
          });

        } else {
          // Cliente disse "não" - pedir novo endereço
          console.log('Cliente não confirmou o endereço');

          await sendMessage({
            messaging_product: 'whatsapp',
            to: "+" + from,
            type: 'text',
            text: { body: '📍 *INFORME ENDEREÇO NOVAMENTE* 📍\n\n🏠 POR FAVOR INFORME NOVAMENTE\n\n⚠️ *IMPORTANTE:*\nNÃO precisa informar o B A I R R O\n\n📝 *EXEMPLO:*\nRua das Torres, 181, apto 10' }
          }, store.wabaEnvironments);

          delete currentConversation.address;
          await updateConversation(currentConversation, {
            flow: 'NEW_ADDRESS',
            pendingAddress: undefined // deletar endereço pendente
          });
        }

        return;
      }

      if (currentConversation?.flow === 'CATEGORIES') {
        // Call extractProductsFromMessage directly on user's message
        if (!message?.text?.body) {
          // TODO: handle
          return;
        }

        const customerIntent = await classifyCustomerIntent(
          message.text.body,
          currentConversation.cartItems?.map(item => ({ menuId: item.menuId, menuName: item.menuName, quantity: item.quantity }))
        );

        console.log('Customer intent with existing cart:', customerIntent);

        if (customerIntent.intent === 'want_menu_or_start') {
          const beautifulMenu = formatBeautifulMenu(filterMenuByWeekday(store.menu || []));
          // Enviar cardápio formatado para o cliente
          if (store.wabaEnvironments) {
            await sendMessage({
              messaging_product: 'whatsapp',
              to: "+" + from,
              type: 'text',
              text: { body: `📋 *NOSSO CARDÁPIO* 📋\n\n🍽️ C O N F I R A   N O S S A S   O P Ç Õ E S:\n\n${beautifulMenu}` }
            }, store.wabaEnvironments);

            const menuMessage = '📱 *COMO FAZER SEU PEDIDO* 📱\n\n🗣️ INFORME O PRODUTO DESEJADO\n\n🎤 *PODE MANDAR MENSAGEM DE VOZ!*\n\n📝 *EXEMPLOS:*\n"Quero uma pizza margherita"\n"1 marmitex médio"\n\n👆 *DIGITE OU FALE AGORA:*';

            await sendMessage({
              messaging_product: 'whatsapp',
              to: "+" + from,
              type: 'text',
              text: { body: `${menuMessage}` }
            }, store.wabaEnvironments);

          }

          return;
        }
        // Se já tem itens no carrinho, primeiro verificar se quer finalizar ou adicionar mais
        if (currentConversation.cartItems && currentConversation.cartItems.length > 0) {

          if (customerIntent.intent === 'close_order') {
            // Cliente quer finalizar pedido - ir para seleção de pagamento
            await updateConversation(currentConversation, {
              flow: 'SELECT_PAYMENT_METHOD',
              returnToPayment: false  // Limpar a flag
            });

            const finalMessage = (currentConversation as any).returnToPayment
              ? `✅ *ALTERAÇÕES SALVAS* ✅\n\nAgora vamos FINALIZAR seu pedido\n\n💳 *COMO VOCÊ GOSTARIA DE PAGAR?* 💳\n\n🔹 *PIX*\n🔹 *CARTÃO DE CRÉDITO*\n🔹 *PAGAMENTO NA ENTREGA*\n\n👆 *ESCOLHA UMA OPÇÃO:*`
              : `💳 *COMO VOCÊ GOSTARIA DE PAGAR?* 💳*\n\n🔹 *PIX*\n🔹 *CARTÃO DE CRÉDITO*\n🔹 *PAGAMENTO NA ENTREGA*\n\n👆 *ESCOLHA UMA OPÇÃO:*`;

            await sendMessage({
              messaging_product: 'whatsapp',
              to: "+" + from,
              type: 'text',
              text: { body: finalMessage }
            }, store.wabaEnvironments);

            return;
          }

          if (customerIntent.intent === 'remove_product') {
            console.log('---*---*---', customerIntent.items)

            // Remover itens do carrinho baseado nos customerIntent.items
            if (customerIntent.items && customerIntent.items.length > 0) {
              let updatedCartItems = [...(currentConversation.cartItems || [])];
              let removedItems: string[] = [];

              for (const itemToRemove of customerIntent.items) {
                // Encontrar o item no carrinho
                const cartItemIndex = updatedCartItems.findIndex(cartItem => cartItem.menuId === itemToRemove.menuId);

                if (cartItemIndex !== -1) {
                  const cartItem = updatedCartItems[cartItemIndex];
                  const quantityToRemove = itemToRemove.quantity;

                  if (cartItem.quantity <= quantityToRemove) {
                    // Remover completamente se a quantidade for igual ou menor
                    removedItems.push(`${cartItem.quantity}x ${cartItem.menuName}`);
                    updatedCartItems.splice(cartItemIndex, 1);
                  } else {
                    // Reduzir a quantidade
                    removedItems.push(`${quantityToRemove}x ${cartItem.menuName}`);
                    updatedCartItems[cartItemIndex].quantity -= quantityToRemove;
                  }
                }
              }

              // Atualizar a conversa com o carrinho modificado
              await updateConversation(currentConversation, {
                cartItems: updatedCartItems
              });

              // Enviar mensagem de confirmação
              if (removedItems.length > 0) {
                const removedItemsList = removedItems.join('\n');
                let responseMessage = `✅ Itens removidos:\n${removedItemsList}`;

                if (updatedCartItems.length > 0) {
                  const remainingItems = updatedCartItems.map(item =>
                    `🔹 ${item.quantity}x ${item.menuName} - R$ ${(calculateItemTotalPrice(item)).toFixed(2)}\n`
                  ).join('\n');
                  const totalPrice = updatedCartItems.reduce((total, item) => total + calculateItemTotalPrice(item), 0);

                  responseMessage += `\n\n🛒 *Seu carrinho atual:*\n${remainingItems}\n\n💰 *Total: R$ ${totalPrice.toFixed(2)}*\n\nDeseja adicionar mais algum item ou finalizar o pedido?`;
                } else {
                  responseMessage += '\n\n🛒 Seu carrinho está vazio agora. Gostaria de adicionar algum item?';
                }

                await sendMessage({
                  messaging_product: 'whatsapp',
                  to: "+" + from,
                  type: 'text',
                  text: { body: responseMessage }
                }, store.wabaEnvironments);
              } else {
                await sendMessage({
                  messaging_product: 'whatsapp',
                  to: "+" + from,
                  type: 'text',
                  text: { body: '❌ Não encontrei os itens que você quer remover no seu carrinho.' }
                }, store.wabaEnvironments);
              }
            }

            return;
          }

          // Se não é para finalizar, continua o fluxo normal para adicionar mais produtos
        }

        const extractedProducts = await extractProductsFromMessageWithAI(message.text.body || "", filterMenuByWeekday(store.menu))

        console.log('**** EXTRACTED PRODUCTS ****: ', message.text.body, filterMenuByWeekday(store.menu).map(item => { return { menuId: item.menuId, menuName: item.menuName, price: item.price } }), extractedProducts);

        if (extractedProducts?.ambiguidades?.length) {

          const itensAmbiguos = extractedProducts.ambiguidades[0].items.map(item => `${item.menuName} - ${item.price}`).join('\n');


          if (itensAmbiguos?.length > 1) {
            extractedProducts.ambiguidades[0].refining = true;

            await updateConversation(currentConversation, {
              flow: `ORDER_REFINMENT`,
              refinmentItems: extractedProducts,
            });

            await sendMessage({
              messaging_product: 'whatsapp',
              to: "+" + from,
              type: 'text',
              text: { body: `✅ Você pediu ${extractedProducts.ambiguidades[0].quantity} ${extractedProducts.ambiguidades[0].palavra}, qual das opções você deseja?\n\n${itensAmbiguos}` }
            }, store.wabaEnvironments);
          } else {
            await sendMessage({
              messaging_product: 'whatsapp',
              to: "+" + from,
              type: 'text',
              text: { body: `✅ *Não consegui identificar o produto informado, por favor, informe um ou mais produtos do cardápio` }
            }, store.wabaEnvironments);

            await updateConversation(currentConversation, { flow: 'CATEGORIES' })
          }

        } else if (extractedProducts.items && extractedProducts.items.length > 0) {
          // Itens resolvidos diretamente, vamos confirmar com o cliente
          const itensResolvidos = extractedProducts.items.map((item: any) => {
            const totalPrice = calculateItemPriceWithSelectedAnswers(item, filterMenuByWeekday(store.menu));

            // Montar descrição dos opcionais com preços individuais
            let opcString = '';

            console.log('***********************************xxxxxx', item.selectedAnswers)

            if (item.selectedAnswers && item.selectedAnswers.length > 0) {
              const menuItem = filterMenuByWeekday(store.menu).find((m: any) => m.menuId === item.menuId);
              const opcionaisComPreco: string[] = [];

              item.selectedAnswers.forEach((selectedAnswer: any) => {
                const question = menuItem?.questions?.find((q: any) => q.questionId === selectedAnswer.questionId);
                const originalAnswer = question?.answers?.find((a: any) => a.answerId === selectedAnswer.answerId);
                opcionaisComPreco.push(originalAnswer?.answerName || '' + (originalAnswer?.price && originalAnswer?.price > 0 ? `(+ ${(originalAnswer?.price * (originalAnswer?.quantity || 1)).toFixed(2)})` : ''))
              });

              opcString = ` (${opcionaisComPreco.join(', ')})`;
            }

            return `🔹 ${item.quantity}x ${item.menuName}${opcString} - R$ ${totalPrice.toFixed(2)}\n`;
          }).join('\n');

          await updateConversation(currentConversation, {
            flow: `ORDER_REFINMENT_CONFIRMATION`,
            refinmentItems: extractedProducts
          });

          await sendMessage({
            messaging_product: 'whatsapp',
            to: "+" + from,
            type: 'text',
            text: { body: `Confirmando seu pedido:\n\n${itensResolvidos}\n\nEsta correto? Posso adicionar ao seu carrinho?` }
          }, store.wabaEnvironments);

        } else {
          // Não encontrou produtos
          await sendMessage({
            messaging_product: 'whatsapp',
            to: "+" + from,
            type: 'text',
            text: { body: `✅ *Não consegui identificar o produto informado, por favor, informe um ou mais produtos do cardápio` }
          }, store.wabaEnvironments);

          await updateConversation(currentConversation, { flow: 'CATEGORIES' })
        }

        return;
      }

      if (currentConversation?.flow === 'ORDER_REFINMENT') {
        const currentRefinment = currentConversation.refinmentItems?.ambiguidades?.find(item => item.refining);
        console.log('current Refinement', currentRefinment, message.text.body)

        if (!currentRefinment) {
          await sendMessage({
            messaging_product: 'whatsapp',
            to: "+" + from,
            type: 'text',
            text: { body: `Não consegui encontrar o que você está tentando resolver. Vamos recomeçar?` }
          }, store.wabaEnvironments);

          await updateConversation(currentConversation, { flow: 'CATEGORIES' });
          return;
        }

        const multipleProductsFromMessage = await selectMultipleOptionsByAI(
          message.text.body || "",
          currentRefinment.items.map(item => ({
            menuId: item.menuId,
            menuName: item.menuName,
            price: item.price
          })),
          currentRefinment.quantity || 1
        );

        if (multipleProductsFromMessage && multipleProductsFromMessage.answers.length > 0) {
          // Cliente escolheu produtos específicos - converter para formato esperado
          const resolvedItems = multipleProductsFromMessage.answers.map(answer => {
            const productDb = filterMenuByWeekday(store.menu).find(item => item.menuId === answer.answerId);
            if (!productDb) {
              console.error('PRODUTO NÃO ENCONTRADO:', answer.answerId);
              return null;
            }
            return {
              menuId: productDb.menuId,
              menuName: productDb.menuName,
              quantity: answer.quantity,
              palavra: currentRefinment.palavra, // usar a palavra original da ambiguidade
              price: productDb.price
            };
          }).filter(item => item !== null);

          if (resolvedItems.length === 0) {
            console.error('NENHUM PRODUTO VÁLIDO ENCONTRADO');
            return;
          }

          // Preservar itens já resolvidos e adicionar os novos
          const existingItems = currentConversation.refinmentItems?.items || [];
          const allItems = [...existingItems, ...resolvedItems];

          await updateConversation(currentConversation, {
            flow: `ORDER_REFINMENT_CONFIRMATION`,
            refinmentItems: {
              items: allItems,
              ambiguidades: [] // Limpar apenas as ambiguidades processadas
            }
          });

          // Criar texto de confirmação para TODOS os produtos (existentes + novos)
          const confirmationText = allItems.map(item =>
            `🔹 ${item.quantity}x ${item.menuName} - R$ ${(item.price * item.quantity).toFixed(2)}\n`
          ).join('\n');

          const totalPrice = allItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

          await sendMessage({
            messaging_product: 'whatsapp',
            to: "+" + from,
            type: 'text',
            text: { body: `Você confirma a inclusão destes produtos no pedido?\n\n${confirmationText}\n\nTotal: R$ ${totalPrice.toFixed(2)}` }
          }, store.wabaEnvironments);
        } else {
          // Não reconheceu a resposta
          const itensDisponiveis = currentRefinment.items.map(item => `${item.menuName} - R$ ${item.price.toFixed(2)}`).join('\n');

          await sendMessage({
            messaging_product: 'whatsapp',
            to: "+" + from,
            type: 'text',
            text: { body: itensDisponiveis ? `Não consegui entender sua escolha. Por favor, digite exatamente o nome de uma das opções:\n\n${itensDisponiveis}` : `Não consegui encontrar o que você está tentando resolver. Vamos recomeçar?` }
          }, store.wabaEnvironments);

          await updateConversation(currentConversation, { flow: 'CATEGORIES' });
          return;
        }

        return;
      }

      if (currentConversation?.flow === 'ORDER_REFINMENT_CONFIRMATION') {
        const itemParaConfirmar = currentConversation.refinmentItems?.items?.[0];
        if (!itemParaConfirmar) {
          await sendMessage({
            messaging_product: 'whatsapp',
            to: "+" + from,
            type: 'text',
            text: { body: `Não consegui encontrar o item para confirmar. Vamos recomeçar?` }
          }, store.wabaEnvironments);

          await updateConversation(currentConversation, { flow: 'CATEGORIES' });
          return;
        }

        // Verificar se cliente confirmou, rejeitou ou fez novo pedido
        const confirmationResult = await interpretOrderConfirmation(message?.text?.body || '');

        console.log('¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨¨', confirmationResult)

        if (confirmationResult.type === 'CONFIRMED' || confirmationResult.type === 'CONFIRMED_WITH_ADDITION') {
          // Cliente confirmou - criar fila de produtos para processar
          const cartItems = currentConversation.cartItems || [];

          // Coletar TODOS os produtos confirmados (podem ser múltiplos)
          const allConfirmedItems = currentConversation.refinmentItems?.items || [itemParaConfirmar];
          const remainingAmbiguities = currentConversation.refinmentItems?.ambiguidades?.filter(amb => !amb.refining) || [];

          // Criar fila de produtos que precisam ser processados
          const productsQueue = [...allConfirmedItems];

          // Limpar refinement items já que vamos processar tudo na fila
          await updateConversation(currentConversation, {
            cartItems: cartItems,
            pendingProductsQueue: productsQueue,
            refinmentItems: remainingAmbiguities.length > 0 ? {
              items: [],
              ambiguidades: remainingAmbiguities
            } : undefined
          });


          console.log('88888888888888888888888888888888888888888888888888888888888888880 ', currentConversation)

          // Processar o primeiro produto da fila
          await processNextProductInQueue(currentConversation, store, from);


          console.log('PROCESSOU ()()()()', confirmationResult)

          // Se cliente confirmou e fez pedido adicional, processar também
          if (confirmationResult.type === 'CONFIRMED_WITH_ADDITION' && confirmationResult.newOrderText) {
            // Extrair produtos da mensagem adicional
            const additionalProducts = await extractProductsFromMessageWithAI(
              confirmationResult.newOrderText,
              filterMenuByWeekday(store.menu)
            );

            console.log('1111111111111111111111111111111111111111111111111111111111111111111111 ', currentConversation, additionalProducts)

            if (additionalProducts.items && additionalProducts.items.length > 0) {
              // Adicionar produtos adicionais à fila existente
              const updatedConversation = await getRecentConversation(from, store._id);
              const currentQueue = updatedConversation?.pendingProductsQueue || [];
              const newQueue = [...currentQueue, ...additionalProducts.items];

              await updateConversation(updatedConversation!, {
                pendingProductsQueue: newQueue
              });
            }
          }
        } else {
          // Cliente não confirmou - verificar se há mais ambiguidades pendentes
          const remainingAmbiguidades = currentConversation.refinmentItems?.ambiguidades?.filter(amb => !amb.refining) || [];

          if (remainingAmbiguidades.length > 0) {
            // Ainda há ambiguidades - continuar com a próxima
            remainingAmbiguidades[0].refining = true;
            const itensAmbiguos = remainingAmbiguidades[0].items.map(item => `${item.menuName} - R$ ${item.price.toFixed(2)}`).join('\n');

            await updateConversation(currentConversation, {
              flow: 'ORDER_REFINMENT',
              refinmentItems: {
                items: currentConversation.refinmentItems?.items || [],
                ambiguidades: remainingAmbiguidades
              }
            });

            await sendMessage({
              messaging_product: 'whatsapp',
              to: "+" + from,
              type: 'text',
              text: { body: `Ok, não vou adicionar esse item. Agora preciso resolver outra dúvida: você pediu "${remainingAmbiguidades[0].palavra}". Qual dessas opções você deseja?\n\n${itensAmbiguos}` }
            }, store.wabaEnvironments);
          } else {
            // Sem mais ambiguidades - voltar ao fluxo normal
            await sendMessage({
              messaging_product: 'whatsapp',
              to: "+" + from,
              type: 'text',
              text: { body: `Ok, não vou adicionar esse item. O que mais você gostaria de pedir?` }
            }, store.wabaEnvironments);

            await updateConversation(currentConversation, {
              flow: 'CATEGORIES',
              refinmentItems: undefined
            });
          }
        }

        return;
      }

      if (currentConversation?.flow === 'PRODUCT_QUESTIONS') {
        // Verificar se há confirmação pendente de resposta
        if (currentConversation.pendingAnswerConfirmation) {
          const confirmationResult = await interpretOrderConfirmation(message?.text?.body || '');

          console.log('CONFIRMATIONREUSLT ', confirmationResult);

          if (confirmationResult.type === 'CONFIRMED' || confirmationResult.type === 'CONFIRMED_WITH_ADDITION') {
            // Cliente confirmou a resposta, prosseguir para próxima pergunta ou finalizar
            const product = currentConversation.product!;
            const pendingAnswers = currentConversation.pendingAnswerConfirmation.selectedAnswers ||
              [currentConversation.pendingAnswerConfirmation.selectedAnswer]; // compatibilidade
            const questionIndex = currentConversation.pendingAnswerConfirmation.questionIndex;

            // Encontrar o produto completo no menu
            const fullMenuItem = filterMenuByWeekday(store.menu).find(item => item.menuId === product.menuId);
            if (!fullMenuItem?.questions) return;

            // Verificar se a pergunta atual atingiu o mínimo exigido
            const currentQuestionFromMenu = fullMenuItem.questions[questionIndex];
            const currentQuestionAnswers = product.questions?.find(q => q.questionId === currentQuestionFromMenu.questionId)?.answers || [];

            // Calcular total de quantidades das respostas atuais (não apenas contagem)
            const totalSelectedForCurrentQuestion = currentQuestionAnswers.reduce((sum, answer) => sum + (answer.quantity || 0), 0);
            const minRequired = currentQuestionFromMenu.minAnswerRequired || 0;

            console.log('🔍 Verificando mínimo:', {
              totalSelectedForCurrentQuestion,
              minRequired,
              currentQuestionAnswers,
              pendingAnswers
            });

            if (totalSelectedForCurrentQuestion < minRequired) {
              // Ainda não atingiu o mínimo - continuar na mesma pergunta
              const optionsList = currentQuestionFromMenu.answers?.map((answer: any) =>
                `• ${answer.answerName}${answer.price > 0 ? ` (+R$ ${answer.price.toFixed(2)})` : ''}`
              ).join('\n') || 'Opções não disponíveis';

              const remaining = minRequired - totalSelectedForCurrentQuestion;

              // Remover pendingAnswerConfirmation do Firestore
              const conversationUpdate = { ...currentConversation };
              delete conversationUpdate.pendingAnswerConfirmation;
              await updateConversation(currentConversation, conversationUpdate);

              await sendMessage({
                messaging_product: 'whatsapp',
                to: "+" + from,
                type: 'text',
                text: { body: `✅ Perfeito! Você já escolheu ${totalSelectedForCurrentQuestion}/${minRequired}. Ainda precisa escolher mais ${remaining}:\n\n${optionsList}` }
              }, store.wabaEnvironments);
              return; // CRITICAL: Stop processing after asking for more selections
            } else {
              // Atingiu o mínimo - pode ir para a próxima pergunta
              const nextQuestionIndex = questionIndex + 1;

              if (nextQuestionIndex < fullMenuItem.questions.length) {
                // Há mais perguntas
                const nextQuestion = fullMenuItem.questions[nextQuestionIndex];
                const optionsList = nextQuestion.answers?.map((answer: any) =>
                  `• ${answer.answerName}${answer.price > 0 ? ` (+R$ ${answer.price.toFixed(2)})` : ''}`
                ).join('\n') || 'Opções não disponíveis';

                await updateConversation(currentConversation, {
                  currentQuestionIndex: nextQuestionIndex,
                  pendingAnswerConfirmation: null // Firestore aceita null para remover campo
                });

                await sendMessage({
                  messaging_product: 'whatsapp',
                  to: "+" + from,
                  type: 'text',
                  text: { body: `✅ Perfeito!\n\n${nextQuestion.questionName}:\n\n${optionsList}` }
                }, store.wabaEnvironments);
                return; // CRITICAL: Stop processing after advancing to next question
              } else {
                // Todas as perguntas respondidas, adicionar ao carrinho
                // Adicionar produto ao carrinho com suas customizações
                const cartItems = currentConversation.cartItems || [];

                // Usar item completo do menu já disponível no escopo
                const cartItem: any = {
                  ...fullMenuItem, // copia todos os campos de MenuItem
                  id: uuidv4(), // gerar ID único para o item do carrinho
                  quantity: 1,
                  questions: product.questions // preservar respostas customizadas
                };

                cartItems.push(cartItem);

                await updateConversation(currentConversation, {
                  flow: 'CATEGORIES',
                  product: null,
                  currentQuestionIndex: null,
                  pendingAnswerConfirmation: null,
                  cartItems: cartItems
                });

                // Criar resumo do carrinho e perguntar próxima ação
                const subtotal = cartItems.reduce((total, item) => total + calculateItemTotalPrice(item), 0);
                const isDelivery = currentConversation.deliveryOption === 'delivery';
                const deliveryPrice = isDelivery ? (store.deliveryPrice || 0) : 0;
                const totalFinal = subtotal + deliveryPrice;

                const itemsSummary = cartItems.map((item: any) => generateItemDescription(item)).join('\n\n━━━━━━━━━━━━━━━━━━━━\n\n');
                const deliveryText = isDelivery ? `\n🚚 *Entrega:* R$ ${deliveryPrice.toFixed(2)}` : '';
                const deliveryLabel = isDelivery ? 'entrega' : 'retirada na loja';

                await sendMessage({
                  messaging_product: 'whatsapp',
                  to: "+" + from,
                  type: 'text',
                  text: { body: `✅ *PRODUTO ADICIONADO* ✅\n\n🛒 RESUMO DO PEDIDO (${deliveryLabel}):\n${itemsSummary}\n\n💰 *SUBTOTAL:* R$ ${subtotal.toFixed(2)}${deliveryText}\n💵 *TOTAL:* R$ ${totalFinal.toFixed(2)}\n\n❓ *O QUE DESEJA FAZER AGORA?*\n\n👆 Escolha uma opção:\n🔹 *ADICIONAR MAIS PRODUTOS*\n🔹 *FINALIZAR PEDIDO*` }
                }, store.wabaEnvironments);

                return; // CRITICAL: Stop processing after completing all questions
              }
            }
          } else {
            // Cliente não confirmou OU está dando uma nova resposta para a pergunta atual
            const clientMessage = message?.text?.body || '';
            const product = currentConversation.product!;
            const questionIndex = currentConversation.pendingAnswerConfirmation.questionIndex;
            const fullMenuItem = filterMenuByWeekday(store.menu).find(item => item.menuId === product.menuId);
            const currentQuestion = fullMenuItem?.questions?.[questionIndex];

            console.log('ALLLLLLLLLLLLCIONE', currentQuestion, fullMenuItem, questionIndex, product)

            // Verificar se a mensagem é uma resposta válida para a pergunta atual (não confirmação)
            let isNewAnswer = false;
            if (currentQuestion?.answers) {
              const availableAnswers = currentQuestion.answers.map(ans => ({
                menuId: ans.answerId,
                menuName: ans.answerName,
                price: ans.price
              }));

              const multipleAnswerMatch = await selectMultipleOptionsByAI(
                clientMessage,
                availableAnswers,
                currentQuestion.minAnswerRequired || 1
              );

              if (multipleAnswerMatch && multipleAnswerMatch.answers.length > 0) {
                isNewAnswer = true;
                console.log('🔄 Cliente deu nova(s) resposta(s) em vez de confirmar. Processando como nova resposta.');

                // Limpar pendingAnswerConfirmation e processar como nova resposta
                await updateConversation(currentConversation, {
                  pendingAnswerConfirmation: null
                });
                // Não fazer return aqui - deixar o código continuar para processar a resposta
              }
            }

            if (!isNewAnswer && currentQuestion) {
              // Realmente rejeitou - pedir para escolher novamente
              const optionsList = currentQuestion.answers?.map((answer: any) =>
                `• ${answer.answerName}${answer.price > 0 ? ` (+R$ ${answer.price.toFixed(2)})` : ''}`
              ).join('\n') || 'Opções não disponíveis';

              await updateConversation(currentConversation, {
                pendingAnswerConfirmation: null,
                currentQuestionIndex: questionIndex // Manter o índice correto da pergunta atual
              });

              await sendMessage({
                messaging_product: 'whatsapp',
                to: "+" + from,
                type: 'text',
                text: { body: `Ok, vamos escolher novamente.\n\n${currentQuestion.questionName}:\n\n${optionsList}` }
              }, store.wabaEnvironments);
              return; // Só faz return se realmente rejeitou
            }
          }

          // Se chegamos aqui e não havia pendingAnswerConfirmation ou era uma nova resposta, continuar processamento normal
          if (currentConversation.pendingAnswerConfirmation) {
            return; // Se ainda há confirmação pendente, parar aqui
          }
        }

        const product = currentConversation.product;
        const currentQuestionIndex = currentConversation.currentQuestionIndex || 0;

        if (!product || !store.menu) {
          console.error('Produto ou menu não encontrado no fluxo PRODUCT_QUESTIONS');
          await sendMessage({
            messaging_product: 'whatsapp',
            to: "+" + from,
            type: 'text',
            text: { body: 'Erro interno. Vamos recomeçar o pedido.' }
          }, store.wabaEnvironments);

          await updateConversation(currentConversation, { flow: 'CATEGORIES' });
          return;
        }

        // Encontrar o produto completo no menu
        const fullMenuItem = filterMenuByWeekday(store.menu).find(item => item.menuId === product.menuId);
        if (!fullMenuItem?.questions || currentQuestionIndex >= fullMenuItem.questions.length) {
          console.error('Question não encontrada ou índice inválido');
          await updateConversation(currentConversation, { flow: 'CATEGORIES' });
          return;
        }

        const currentQuestion = fullMenuItem.questions[currentQuestionIndex];
        const alreadyAnswered = product.questions || [];

        console.log(`🤔 Processando resposta para: ${currentQuestion.questionName}`);
        console.log(`📝 Respostas já coletadas: ${alreadyAnswered.length}`);

        try {
          // Usar IA para detectar múltiplas seleções com quantidades
          const clientMessage = message?.text?.body || '';
          const availableAnswers = currentQuestion.answers || [];

          const multipleSelection = await selectMultipleOptionsByAI(
            clientMessage,
            availableAnswers.map(ans => ({
              menuId: ans.answerId,
              menuName: ans.answerName,
              price: ans.price
            })),
            currentQuestion.minAnswerRequired || 1
          );

          console.log('🎯 Múltiplas respostas selecionadas:', multipleSelection);

          if (!multipleSelection || multipleSelection.answers.length === 0) {
            // Não conseguiu extrair nenhuma resposta válida
            const optionsList = currentQuestion.answers?.map((answer: any) =>
              `• ${answer.answerName}${answer.price > 0 ? ` (+R$ ${answer.price.toFixed(2)})` : ''}`
            ).join('\n') || 'Opções não disponíveis';

            await sendMessage({
              messaging_product: 'whatsapp',
              to: "+" + from,
              type: 'text',
              text: { body: `Não consegui identificar sua escolha. Por favor, selecione entre as opções disponíveis:\n\n${optionsList}\n\n${currentQuestion.questionName}` }
            }, store.wabaEnvironments);
            return;
          }

          // Verificar se atende o mínimo necessário
          if (!multipleSelection.isValid) {
            const missing = (currentQuestion.minAnswerRequired || 1) - multipleSelection.totalSelected;
            await sendMessage({
              messaging_product: 'whatsapp',
              to: "+" + from,
              type: 'text',
              text: { body: `Você precisa escolher pelo menos ${currentQuestion.minAnswerRequired} opções para "${currentQuestion.questionName}". Faltam ${missing} escolhas.` }
            }, store.wabaEnvironments);
            return;
          }

          // Processar todas as respostas selecionadas
          const updatedQuestions = [...alreadyAnswered];

          // Converter seleções em formato de answers
          const newAnswers = multipleSelection.answers.map(selection => {
            const answerDb = currentQuestion.answers?.find(item => item.answerId === selection.answerId);
            return {
              answerId: selection.answerId,
              answerName: selection.answerName,
              quantity: selection.quantity, // usar a quantidade detectada pela IA
              price: answerDb?.price || 0
            };
          });

          // Verificar se já existe essa question no produto
          const existingQuestionIndex = updatedQuestions.findIndex(q => q.questionId === currentQuestion.questionId);

          if (existingQuestionIndex >= 0) {
            // Atualizar question existente - adicionar múltiplas respostas às existentes
            const existingAnswers = updatedQuestions[existingQuestionIndex].answers || [];
            const totalAnswers = existingAnswers.length + newAnswers.length;

            // Verificar se já atingiu o máximo de respostas permitidas
            if (currentQuestion.maxAnswerRequired && totalAnswers > currentQuestion.maxAnswerRequired) {
              await sendMessage({
                messaging_product: 'whatsapp',
                to: "+" + from,
                type: 'text',
                text: { body: `Você já selecionou o máximo de ${currentQuestion.maxAnswerRequired} opções para "${currentQuestion.questionName}". Precisa remover alguma antes de adicionar outra.` }
              }, store.wabaEnvironments);
              return;
            }

            updatedQuestions[existingQuestionIndex] = {
              questionId: currentQuestion.questionId,
              questionName: currentQuestion.questionName,
              questionType: currentQuestion.questionType,
              minAnswerRequired: currentQuestion.minAnswerRequired,
              maxAnswerRequired: currentQuestion.maxAnswerRequired,
              answers: [...existingAnswers, ...newAnswers] // adicionar todas as novas respostas
            };
          } else {
            // Adicionar nova question com todas as respostas
            updatedQuestions.push({
              questionId: currentQuestion.questionId,
              questionName: currentQuestion.questionName,
              questionType: currentQuestion.questionType,
              minAnswerRequired: currentQuestion.minAnswerRequired,
              maxAnswerRequired: currentQuestion.maxAnswerRequired,
              answers: newAnswers // usar todas as respostas detectadas
            });
          }

          // Atualizar produto com as respostas
          const updatedProduct = {
            ...product,
            questions: updatedQuestions
          };

          // Prosseguir diretamente sem confirmação
          await updateConversation(currentConversation, {
            product: updatedProduct
          });

          // Aplicar lógica diretamente - avançar para próxima pergunta ou finalizar
          const totalSelectedForCurrentQuestion = updatedQuestions.find(q => q.questionId === currentQuestion.questionId)?.answers?.reduce((sum, answer) => sum + (answer.quantity || 0), 0) || 0;
          const minRequired = currentQuestion.minAnswerRequired || 0;

          if (totalSelectedForCurrentQuestion < minRequired) {
            // Ainda não atingiu o mínimo - pedir mais seleções
            const remaining = minRequired - totalSelectedForCurrentQuestion;
            const optionsList = currentQuestion.answers?.map((answer: any) =>
              `• ${answer.answerName}${answer.price > 0 ? ` (+R$ ${answer.price.toFixed(2)})` : ''}`
            ).join('\n') || 'Opções não disponíveis';

            await sendMessage({
              messaging_product: 'whatsapp',
              to: "+" + from,
              type: 'text',
              text: { body: `✅ Perfeito! Você já escolheu ${totalSelectedForCurrentQuestion}/${minRequired}. Ainda precisa escolher mais ${remaining}:\n\n${optionsList}` }
            }, store.wabaEnvironments);
          } else {
            // Atingiu o mínimo - avançar para próxima pergunta
            const nextQuestionIndex = currentQuestionIndex + 1;

            if (nextQuestionIndex < fullMenuItem.questions.length) {
              // Há mais perguntas
              const nextQuestion = fullMenuItem.questions[nextQuestionIndex];
              const optionsList = nextQuestion.answers?.map((answer: any) =>
                `• ${answer.answerName}${answer.price > 0 ? ` (+R$ ${answer.price.toFixed(2)})` : ''}`
              ).join('\n') || 'Opções não disponíveis';

              await updateConversation(currentConversation, {
                currentQuestionIndex: nextQuestionIndex
              });

              await sendMessage({
                messaging_product: 'whatsapp',
                to: "+" + from,
                type: 'text',
                text: { body: `✅ Perfeito!\n\n${nextQuestion.questionName}:\n\n${optionsList}` }
              }, store.wabaEnvironments);
            } else {
              // Todas as perguntas respondidas - adicionar ao carrinho
              const cartItems = currentConversation.cartItems || [];

              const cartItem: any = {
                ...fullMenuItem,
                id: uuidv4(),
                quantity: currentConversation.currentProcessingProduct?.quantity || 1,
                questions: updatedProduct.questions
              };

              cartItems.push(cartItem);

              // Atualizar conversation para remover produto atual da fila
              await updateConversation(currentConversation, {
                cartItems: cartItems,
                currentProcessingProduct: null,
                product: null,
                currentQuestionIndex: null
              });

              // await sendMessage({
              //   messaging_product: 'whatsapp',
              //   to: "+" + from,
              //   type: 'text',
              //   text: { body: `✅ ${cartItem.quantity}x ${cartItem.menuName} adicionado ao pedido!` }
              // }, store.wabaEnvironments);

              // Processar próximo produto da fila
              await processNextProductInQueue({ ...currentConversation, cartItems }, store, from);
            }
          }

        } catch (error) {
          console.error('❌ Erro ao processar resposta da question:', error);

          await sendMessage({
            messaging_product: 'whatsapp',
            to: "+" + from,
            type: 'text',
            text: { body: 'Não consegui processar sua resposta. Pode tentar novamente?' }
          }, store.wabaEnvironments);
        }

        return;
      }

      if (currentConversation?.flow === 'SELECT_PAYMENT_METHOD') {
        const paymentIdentification = await identifyPaymentMethod(message?.text?.body || '');

        console.log('Payment identification result:', paymentIdentification);

        // Verificar se cliente quer alterar o pedido ao invés de escolher pagamento
        if (paymentIdentification.wantsToChangeOrder) {
          console.log('Cliente quer alterar pedido durante pagamento:', paymentIdentification.changeOrderReason);

          await sendMessage({
            messaging_product: 'whatsapp',
            to: "+" + from,
            type: 'text',
            text: { body: `✏️ *ALTERAR PEDIDO* ✏️\n\n📝 E N T E N D I   Q U E   V O C Ê   Q U E R   A L T E R A R\n\n👆 *VOCÊ PODE:*\n🔹 *ADICIONAR* novos itens\n🔹 *REMOVER* itens existentes  \n🔹 *ALTERAR* quantidades\n\n💬 *INFORME O QUE DESEJA FAZER:*` }
          }, store.wabaEnvironments);

          // Redirecionar para o fluxo de categorias para permitir alterações
          // Marcar que cliente veio do pagamento para retornar depois
          await updateConversation(currentConversation, {
            flow: 'CATEGORIES',
            returnToPayment: true
          });

          return;
        }

        if (!paymentIdentification.method || paymentIdentification.confidence < 50) {
          await sendMessage({
            messaging_product: 'whatsapp',
            to: "+" + from,
            type: 'text',
            text: { body: `💳 *ESCOLHA O PAGAMENTO* 💳\n\n💰 POR FAVOR ESCOLHA:\n\n👆 *OPÇÕES DISPONÍVEIS:*\n\n🔹 *PIX*\n🔹 *CARTÃO DE CRÉDITO*\n🔹 *PAGAMENTO NA ENTREGA*\n\n📱 *DIGITE SUA ESCOLHA:*` }
          }, store.wabaEnvironments);
          return;
        }

        const paymentMethod = paymentIdentification.method;

        // Criar o pedido
        console.log('VAI CRIAR A ORDER', currentConversation.docId, JSON.stringify(currentConversation.cartItems))

        const cartItems = currentConversation.cartItems || [];
        const subtotal = cartItems.reduce((total, item) => total + calculateItemTotalPrice(item), 0);
        const isDelivery = currentConversation.deliveryOption === 'delivery';
        const deliveryPrice = isDelivery ? (store.deliveryPrice || 0) : 0;
        const totalFinal = subtotal + deliveryPrice;

        const itemsSummary = cartItems.map((item: any) => generateItemDescription(item)).join('\n\n___________________\n\n') || 'Itens não especificados';

        const deliveryAddress = currentConversation?.address ?
          `${currentConversation.address.name}` :
          'Endereço não informado';

        const customerName = currentConversation.customerName || 'Cliente não identificado';

        // Traduzir método de pagamento para exibição
        const paymentDisplayName = paymentMethod === 'PIX' ? 'PIX' :
          paymentMethod === 'CREDIT_CARD' ? 'Cartão na Entrega' :
            'Dinheiro na Entrega';

        const newOrder = await createOrder({
          ...currentConversation,
          cartItems: cartItems,
          totalPrice: subtotal,
          phoneNumber: from,
          paymentMethod: paymentMethod as 'PIX' | 'CREDIT_CARD' | 'DELIVERY',
          address: currentConversation?.address || {
            name: 'Endereço não informado',
            main: true, neighborhood: '', number: '', zipCode: '', street: ''
          },
        }, store._id, store._id);

        // Atualizar endereço do usuário se necessário
        if (currentConversation.address && currentConversation.address.placeId) {
          const addressFromCache = addressCache[currentConversation.address.placeId];
          if (addressFromCache) {
            const updatedAddress: Address = {
              name: addressFromCache.description,
              lat: addressFromCache.lat,
              lng: addressFromCache.lng,
              main: true,
              street: addressFromCache.street || '',
              number: addressFromCache.number || '',
              neighborhood: addressFromCache.neighborhood || '',
              city: addressFromCache.city || '',
              state: addressFromCache.state || '',
              zipCode: addressFromCache.zipCode || ''
            };

            await updateUserAddress(from, updatedAddress);
            console.log('Endereço do usuário atualizado após pedido:', updatedAddress.name);
          }
        }

        // Deletar conversa
        if (currentConversation.docId) {
          await deleteConversation(currentConversation.docId)
        }

        console.log('New order has been created', newOrder);

        // Mensagem para a loja
        const deliveryText = isDelivery ? `🚚 *Entrega:* R$ ${deliveryPrice.toFixed(2)}\n` : '';
        const deliveryLabel = isDelivery ? 'entrega' : 'retirada na loja';
        const addressText = isDelivery ? `📍 *Endereço:* ${deliveryAddress}` : '🏪 *Retirada:* Na loja';

        const detailedStoreMessage = `🔔 *NOVO PEDIDO - AGUARDANDO CONFIRMAÇÃO* (${deliveryLabel})\n\n` +
          `📋 *Pedido:* #${newOrder.id}\n` +
          `👤 *Cliente:* ${customerName}\n` +
          `📱 *Telefone:* ${from}\n` +
          `${addressText}\n\n` +
          `🛒 *Itens:*\n${itemsSummary}\n\n` +
          `💰 *Subtotal:* R$ ${subtotal.toFixed(2)}\n` +
          deliveryText +
          `💵 *TOTAL:* R$ ${totalFinal.toFixed(2)}\n\n` +
          `💳 *Pagamento:* ${paymentDisplayName}\n\n` +
          `⚡ *AÇÃO NECESSÁRIA:* Confirme ou rejeite este pedido no sistema!`;

        console.log('--------------------------------------**--------------------------------------', store.whatsappNumber)

        await sendMessage({
          messaging_product: 'whatsapp',
          to: store.whatsappNumber,
          type: 'text',
          text: { body: detailedStoreMessage }
        }, store.wabaEnvironments);

        // Mensagem para o cliente
        const customerAddressText = isDelivery ? `📍 *ENDEREÇO DE ENTREGA:* ${deliveryAddress}` : '🏪 *RETIRADA NA LOJA*';

        const customerMessage = `✅ *PEDIDO EFETUADO!* (${deliveryLabel})\n\n` +
          `📋 *Número do Pedido:* #${newOrder.id}\n\n` +
          `🛒 *RESUMO:*\n\n${itemsSummary}\n\n` +
          `💰 *SUBTOTAL:* R$ ${subtotal.toFixed(2)}\n` +
          deliveryText +
          `💵 *TOTAL:* R$ ${totalFinal.toFixed(2)}\n\n` +
          `💳 *PAGAMENTO:* ${paymentDisplayName}\n` +
          `${customerAddressText}\n\n` +
          `⏰ *STATUS:* Aguardando confirmação da loja\n` +
          `🚛 *ESTIMATIVA:* Você será notificado quando o pedido for confirmado!\n\n` +
          `Obrigado pela preferência! 😊`;

        await sendMessage({
          messaging_product: 'whatsapp',
          to: "+" + from,
          type: 'text',
          text: { body: customerMessage }
        }, store.wabaEnvironments);

        return;
      }
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      res.status(500).send("Erro ao enviar mensagem");
    }
  } catch (error) {
    notifyAdmin('  conversa:', error);
    return res.status(500).send('Erro ao criar nova conversa');;
  }
}

// Função para converter cardápio JSON em formato legível
function formatMenuForHuman(products: any[]): string {
  if (!products || products.length === 0) {
    return 'Cardápio vazio';
  }

  let humanMenu = '=== CARDÁPIO LEGÍVEL ===\n\n';

  products.forEach((product, index) => {
    humanMenu += `${index + 1}. ${product.menuName} - R$ ${product.price.toFixed(2)}\n`;
    if (product.menuDescription) {
      humanMenu += `   Descrição: ${product.menuDescription}\n`;
    }

    if (product.questions && product.questions.length > 0) {
      humanMenu += `   Opções:\n`;
      product.questions.forEach((question: any) => {
        humanMenu += `   • ${question.questionName}`;
        if (question.minAnswerRequired > 0) {
          humanMenu += ` (obrigatório - escolha ${question.minAnswerRequired})`;
        } else {
          humanMenu += ` (opcional)`;
        }
        humanMenu += `\n`;

        if (question.answers && question.answers.length > 0) {
          question.answers.forEach((answer: any) => {
            let answerLine = `     - ${answer.answerName}`;
            if (answer.price && answer.price > 0) {
              answerLine += ` (+R$ ${answer.price.toFixed(2)})`;
            }
            humanMenu += `${answerLine}\n`;
          });
        }
      });
    }

    humanMenu += `\n`;
  });

  return humanMenu;
}

export async function classifyUserMessage(message: any, store: Store, history?: string, currentCart?: ShoppingCartItem[]) {

  const storeStatus = getStoreStatus(store)

  const prompt = `
  Você é um assistente rigoroso de pedidos WhatsApp para delivery. Você NUNCA inventa produtos, nomes ou IDs. Tudo deve vir EXATAMENTE do cardápio fornecido em JSON.

### INPUT SEMPRE RECEBIDO
1. Histórico completo da conversa (LEIA SEMPRE com atenção)
2. Pedido atual (itens já adicionados)
3. Cardápio completo em JSON (array de produtos com menuId, menuName exato, price, questions)
4. Mensagem atual do cliente

### REGRA MAIS IMPORTANTE: RESPEITO TOTAL AO CARDÁPIO
- Você SÓ pode adicionar produtos que existem no cardápio.
- Você DEVE usar SEMPRE:
  - menuId EXATO do cardápio
  - menuName EXATO do cardápio (não abrevie, não mude letra, não traduza)
  - questionId, questionName, answerId, answerName EXATOS do cardápio
- PROIBIDO inventar, aproximar ou alterar qualquer nome ou ID.
- Se o cliente mencionar algo que não bate 100% com um menuName:
  - Procure por correspondência exata primeiro (case-insensitive)
  - Se não encontrar exata, procure por palavras-chave no menuName
  - Se ainda ambiguo ou múltiplas opções → pergunte ao cliente qual exatamente (liste as opções com nomes exatos do cardápio)
  - Exemplo: cliente diz "marmita grande" → liste: "Marmitex Grande", "Marmitex Executivo", etc. com nomes exatos

### REGRAS ANTI-LOOP E ANTI-REPETIÇÃO
1. SEMPRE leia o histórico completo.
2. NUNCA repita uma pergunta já respondida.
3. Se você enviou um resumo e perguntou "Está correto? Posso adicionar?" e o cliente respondeu "sim", "ok", "pode", "isso", "confirma", etc. → avance imediatamente para ADDING_ITEMS.
4. NUNCA peça confirmação duas vezes seguidas para os mesmos itens.

### FLUXO PASSO A PASSO (OBRIGATÓRIO)
1. Leia histórico + mensagem atual.
2. Extraia o que o cliente pediu (produtos, quantidades, adicionais).
3. Para cada produto mencionado:
   - Faça matching EXATO com o cardápio (use menuName completo).
   - Se não for exato → pergunte esclarecendo com as opções reais do cardápio.
4. Resolva ambiguidades e faça questions obrigatórias (uma por vez).
5. Quando tudo estiver completo e confirmado pelo cliente:
   - Envie resumo com nomes EXATOS do cardápio.
   - Pergunte UMA VEZ: "Está correto? Posso adicionar isso ao pedido?"
6. Após confirmação explícita do cliente → action "ADDING_ITEMS" com items usando IDs e nomes EXATOS.
7. Após adicionar → mostre resumo atualizado com preços e pergunte: "Deseja adicionar mais alguma coisa?"
8. Quando cliente quiser finalizar → resumo completo + pergunte pagamento → action "ENDING_ORDER"
9. Após pagamento informado → action "PAYMENT_METHOD"

### CONTAGEM DE QUANTIDADES
- Sempre some quantidades (ex: "2 frango e 1 bife" = 3 carnes).
- Se total ≠ minAnswerRequired → ajuste pedindo mais/menos.

### OUTPUT SEMPRE JSON
{
  "action": "TAKING_THE_ORDER" | "ADDING_ITEMS" | "ENDING_ORDER" | "PAYMENT_METHOD",
  "mensagem": "Texto claro e educado (use \\n para quebras)",
  "items": [ /* Só em ADDING_ITEMS, com dados 100% exatos do cardápio */ ]
}

### ESTRUTURA DO ITEM (exemplo rigoroso)
{
  "menuId": 5,  // EXATO do cardápio
  "menuName": "Marmitex Médio",  // EXATO do cardápio, sem alteração
  "questions": [
    {
      "questionId": 1,
      "questionName": "Escolha até 3 carnes",  // EXATO
      "answers": [
        { "answerId": 1, "answerName": "Filé de Frango", "quantity": 2 },
        { "answerId": 3, "answerName": "Bife Acebolado", "quantity": 1 }
      ]
    }
  ]
}

Seja extremamente preciso. Prefira perguntar ao cliente do que assumir ou inventar. Use apenas o que está no cardápio JSON.
  `

  // Prompt super enxuto
  const systemPromptWithValidation = `
  Assistente de pedidos WhatsApp para delivery. Anote pedidos do início ao fim com informação de pagamento.

  ############# MENSAGEM DE INPUT #############
  Sempre que receber uma mensagem, você receberá:

  1. Histórico da Conversa — necessário pois a conversa é stateless

  2. Pedido Atualizado — itens já adicionados até o momento

  3. Cardápio (JSON) — todos os produtos e suas questions/adicionais

  4. Mensagem do cliente — a mensaem atual que o cliente enviou que faz parte da conversa para fazer o pedido


  🚨 REGRA CRÍTICA - CONTAGEM DE QUANTIDADES:

  SEMPRE SOMAR AS QUANTIDADES MENCIONADAS PELO CLIENTE!

  ❌ ERRO COMUM: Cliente diz "2 pernil e 1 filé de frango" para "Escolha 3 carnes"
  - ERRADO: Contar apenas 2 carnes (tipos diferentes)
  - ✅ CORRETO: Contar 3 carnes TOTAIS (2 + 1 = 3)

  Exemplos:
  - "2 pernil + 1 frango" = 3 carnes ✓
  - "frango e pernil" = 2 carnes (assumir 1 de cada)
  - "3 bifes" = 3 carnes ✓

### REGRAS CRÍTICAS
1. CONTAGEM DE QUANTIDADES (NUNCA ERRE NISSO):
   - SEMPRE some as quantidades mencionadas pelo cliente.
   - Exemplos corretos:
     • "2 pernil e 1 frango" → total 3 carnes
     • "3 bifes" → total 3 carnes
     • "frango e bife" → total 2 carnes (1 de cada)
   - Se total < minAnswerRequired → peça mais
   - Se total > minAnswerRequired → peça para reduzir
   - Se total = minAnswerRequired → prosseguir



  Se total < minAnswerRequired → pedir mais
  Se total > minAnswerRequired → pedir para reduzir  
  Se total = minAnswerRequired → prosseguir

  🧩 ESTRUTURA DO CARDÁPIO (MODELO)

  - PRODUTOS
  MenuItem {
    menuId: number; *Id do produto
    menuName: string;  *Nome do produto
    menuDescription: string; *Descriçãodo produto
    price: number; *Preço unitário do produto
    questions?: MenuItemQuestion[]; *Perguntas e respectivas respostas para serem extraidas do cliente ao pedir esse produto
  }

  - PERGUNTAS
  MenuItemQuestion {
    questionId: number; *Id da pergunta
    questionName: string; *Nome da pergunta
    minAnswerRequired: number; *Minimo de respostas necessárias que o cliente deverá informar quando a pergunta for feita. (O cliente poderá informar uma ou mais respostas na pergunta)
    answers: MenuItemAnswer[]; *Array com o conjunto de respostas possíveis que o cliente poderá escolher
  }

  - RESPOSTAS
  MenuItemAnswer {
    answerId: number; *Id da resposta
    answerName: string; *Nome da resposta
    quantity?: number; *Quantidade informada da resposta (Ex: 2 (quantity) filé de frango (name))
    price?: number; *Preço da resposta, que deve ser adicionado ao precço do produto, caso a resposta seja selecionada
  }

  Regras:

  questions.length = 0 → nenhuma pergunta adicional deve ser feita ao cliente

  minAnswerRequired > 0 → pergunta obrigatória

  Cliente pode repetir answers (ex.: “2x Frango”)\

  ############# MENSAGEM DE OUTPUT - FORMATO DA SUA SUA RESPOSTA #############

  Responda SEMPRE com JSON:
  {
    "action": "TAKING_THE_ORDER | ADDING_ITEMS | ENDING_ORDER | PAYMENT_METHOD",
    "mensagem": "texto aqui (usar \\n para quebras de linha)",
    "items": []
  }

  ONDE: "items" - é um array do objeto 'MenuItem':

  "MenuItem"
  {
    menuId: number; *Id do produto, o mesmo do cardápio
    menuName: string; *Nome do produto, o mesmo do cardápio
    questions: [{ - * Perguntas respondidas
      questionId: number; *Id da pergunta, o mesmo do cardápio
      questionName: string; *Nome da pergunta, o mesmo do cardápio
      answers?: [{ *Respostas do cliente
        answerId: number; *Id da resposta, o mesmo do cardápio
        answerName: string; *Nome da resposta, o mesmo do cardápio
        quantity?: number; *Quantidade da resposta 
      }];
    }]
  }

  Exemplo:
  {
    menuId: 1;
    menuName: Marmitex Médido;
    questions: [{
      questionId: 1;
      questionName: Escolha 3 carnes;
      answers: [
      {
        answerId: 1;
        answerName: File de Frango;
        quantity: 2;
      },
      {
        answerId: 2;
        answerName: Biife Acebolado;
        quantity: 1;
      }];
    }]
  }

  SEMPRE localize o produto e as perguntas e respostas e envie os códigos Ids corretos

  ## ACTIONS ##

  Significados das ACTIONS:

  TAKING_THE_ORDER → fazendo perguntas, entendendo pedido, perguntando adicionais, quantidade, dúvidas, ambiguidades

  ADDING_ITEMS → SOMENTE APÓS O Cliente confirmar os item(s); você devolve os itens a serem adicionados

  ENDING_ORDER → quando o cliente quer finalizar; você pergunta a forma de pagamento

  PAYMENT_METHOD → cliente respondeu PIX / Cartão / Entrega

  Nunca finalize o pedido sem o cliente informar a forma de pagamento.

  🧠 FLUXO OBRIGATÓRIO COMPLETE DE UM PEDIDO NO SISTEMA

  🚨 *FLUXO CORRETO (NUNCA VIOLAR):*

  1️⃣ *EXTRAÇÃO COMPLETA DA MENSAGEM*
  Objetivo: Extrair todos os produtos, quantidade e, caso o produto possua perguntas, obter as devidas respostas 
  O fluxo começa com o cliente enviando uma mensagem com o seu pedido, que pode conter um ou mais produtos 
  → IA (você) entra no ciclo de perguntas para extração dos itens da mensagem:
  - Todos os produtos mencionados
  - Todas as quantidades ( se não encontrar ou não for mencionada, considere quantidade = 1)
  - Resolver todas as ambiguidades, se necessário - caso encontre mais de 1 produto no cardápio que satisfaça o que o cliente pediu (ex: cliente pediu marmitex e existem 3 produtos com marmitex no nome - marmitex pequeno, marmitex médio e marmitex grande) OU o cliente pediu uma coca e tem Coca Lata e Coca Litro no cardápiox', você precisa perguntar para o cliente confirmar qual é o produto que ele está querendo
  - Todas as respostas de questions já mencionadas (que pode vir contidas já na memsagem ou não, nesse caso, deverá ser extraída a resposta com pergunta feita ao cliente)

  Ex: Cliente pede 1 marmita e 2 cocas

  Voce lê o histórico da conversa
  Voce idenfifica que ele quer 2 produtos - 1 marmita e 2 cocas
  Voce procura o marmitex no cardapio e verifica que existe 3 produtos com marmita no nome - marmitex pequeno, marmitex médio e marmitex grande e extrai do cliente qual seria
  Voce verifica se o produto escolhido possui questions e faz todas as perguntas do array questions, mostrando as respostas possiveis e obtendo as respostas, que devem conter a quandiade de respotas igual ao campo 'minAnswerRequired'
  Apos finalizar o produto 'marmita', voce faz a mesma coisa com o produto 'coca'

  2️⃣ *VALIDAÇÃO E PREENCHIMENTO*
  - Compare produtos com cardápio
  - Resolva ambiguidades se necessário
  - Pergunte APENAS o que falta (uma pergunta por vez)
  - Se não encontrar quantidade, considere quantidade = 1
  - Quando tudo estiver completo, voce enviou o resumo do pedido atualizado
  - Após a confirmação do cliente para a inclusão dos itens → ADDING_ITEMS

  ### 🛑 REGRA CRÍTICA ZERADA: SOMA DE QUANTIDADES OBRIGATÓRIA

  SEMPRE some as quantidades mencionadas pelo cliente para preencher o requisito de 'minAnswerRequired' de uma pergunta.

  *A soma total de 'quantity' de todas as respostas (answers) deve ser exatamente igual a 'minAnswerRequired' para prosseguir.*

  * ✅ *CORRETO (Soma):* Cliente diz "2 pernil e 1 filé" para "Escolha 3 carnes" -> Total = 3 carnes. (2 + 1 = 3)
  * ❌ *ERRADO (Tipos):* Contar apenas 2 (dois tipos de carne).

  ### ⚙️ ESTRUTURA DO CARDÁPIO (INPUT)

  🚨 *IMPORTANTE*: Faça apenas UMA pergunta por vez. NUNCA envie mais de uma pergunta por vez: 
  - ❌ ERRADO: Perguntar "Qual o sabor? Deseja talheres?"
  - ✅ CORRETO: Perguntar "Qual o sabor?" -> Cliente responde o sabor -> Voce pergunta: "Deseja talheres?" 

  3️⃣ *APÓS ADDING_ITEMS*
  🚨 *CRÍTICO*: NUNCA mostrar a conta aqui!
  - Mostre o resumo do pedido atualizado e pergunte: "Deseja adicionar mais alguma coisa?"
  - Sempre inclua os valores (quantidade * preço) (inclusive dos adicionais (respostas)) quando mostrar o resumo atualizado do pedido ao cliente

  4️⃣ *CICLO CONTINUA*
  - Se cliente pedir mais → volta para step 1 (extração)
  - Se cliente disser "finalizar/fechar/só isso" → vai para step 5

  5️⃣ *FECHAMENTO DA CONTA*
  Quando cliente quer finalizar:
  - *PRIMEIRO*: Mostre resumo completo (itens + subtotal + entrega + total)
  - *DEPOIS*: Pergunte forma de pagamento
  - *Action*: ENDING_ORDER

  6️⃣ *FINALIZAÇÃO*
  Cliente responde forma de pagamento → action:PAYMENT_METHOD → ACABOU

  🚨 PROCESSO DETALHADO:
  1️⃣ Extrair itens da mensagem

  Quando o cliente diz algo como:

  “quero uma marmita, duas cocas e um sorvete de chocolate” 

  Você deve:

  Ler o histórico da conversa para entender o contexto inteiro da conversa

  Identificar produtos citados assim como os adicionais (chocolate no caso do sorvete)

  Identificar quantidades (se não houver, usar 1)

  4. ⚠️ PROIBIÇÕES ABSOLUTAS:
     - PROIBIDO finalizar o pedido antes da escolha da forma de pagamento.
     - PROIBIDO enviar "ENDING_ORDER" após já ter recebido a forma de pagamento.
     - PROIBIDO enviar "TAKING_THE_ORDER" ou "ADDING_ITEMS" depois que o cliente já informou a forma de pagamento.
     - PROIBIDO pular a pergunta sobre a forma de pagamento.
     - JAMAIS enviar "PAYMENT_METHOD" se o cliente não informou explicitamente a forma de pagamento.
     - JAMAIS assumir forma de pagamento por conta própria.
     - PROIBIDO adicionar itens, remover itens ou reabrir o fluxo após o pagamento.

  5. A última mensagem (após PAYMENT_METHOD) NÃO precisa terminar com pergunta.
  `;

  const response = await openAIClient.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: prompt },
      {
        role: "user",
        content: `Mensagem: ${(JSON.stringify(message))}, Histórico da Conversa:'${history}', Pedido Atualizado: ${JSON.stringify(currentCart || [])}, Cardápio JSON: ${JSON.stringify(filterMenuByWeekday(store.menu))}, 

${formatMenuForHuman(filterMenuByWeekday(store.menu))}

Horário de Atendimento: 08:30 às 17:00, Status da Loja: ${storeStatus}, Taxa de Entrega: R$ ${store.deliveryPrice?.toFixed(2) || '0,00'}`,
      }
    ]
  });

  return response.choices[0];
}

export async function classifyPaymentType(message: string) {
  const systemPrompt = `Voce é robo que ajuda a identificar a forma de pagamento enviada pelo cliente. 
  As 3 formas de pagamento existentes são: PIX, Cartão de Crédito e Pagamento na Entrega.
  Voce vai receber a forma de pagameno digitada pelo cliente e deve identificar qual forma de pagamento é entre as opçoes PIX, Cartão de Crédito e Pagamento na Entrega. 
  O cliente pode digitar errado e voce deve identificar qual a forma de pagamento o cliente quis informar e devolver essa resposta.`

  const response = await openAIClient.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Mensagem: ${(JSON.stringify(message))}`,
      }
    ]
  });


  return response.choices[0];
}

export async function interpretDeliveryChoice(userResponse: string) {
  const systemPrompt = `Você é um assistente que interpreta a escolha do cliente sobre tipo de entrega.

O cliente foi perguntado se quer delivery (entrega) ou retirada na loja. Você deve analisar a resposta e retornar um JSON com:

{
  "choice": "delivery" | "counter" | "unclear", // delivery=entrega, counter=retirada, unclear=não ficou claro
  "response": string // interpretação da resposta
}

EXEMPLOS:

Cliente: "delivery" → {"choice": "delivery", "response": "escolheu entrega"}
Cliente: "entrega" → {"choice": "delivery", "response": "escolheu entrega"}
Cliente: "quero que entregue" → {"choice": "delivery", "response": "escolheu entrega"}
Cliente: "pode trazer aqui" → {"choice": "delivery", "response": "escolheu entrega"}
Cliente: "retirada" → {"choice": "counter", "response": "escolheu retirada"}
Cliente: "vou buscar" → {"choice": "counter", "response": "escolheu retirada"}
Cliente: "prefiro retirar na loja" → {"choice": "counter", "response": "escolheu retirada"}
Cliente: "balcão" → {"choice": "counter", "response": "escolheu retirada"}
Cliente: "pego lá" → {"choice": "counter", "response": "escolheu retirada"}
Cliente: "não sei" → {"choice": "unclear", "response": "não decidiu"}
Cliente: "tanto faz" → {"choice": "unclear", "response": "não decidiu"}
Cliente: "cardápio" → {"choice": "unclear", "response": "mudou de assunto"}

Retorne APENAS o JSON, sem texto adicional.`

  const response = await openAIClient.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: userResponse,
      }
    ],
    temperature: 0.1
  });

  try {
    const content = response.choices[0].message?.content || '{}';
    const parsed = JSON.parse(content);
    return {
      choice: parsed.choice || 'unclear',
      response: parsed.response || 'não interpretado'
    };
  } catch (error) {
    console.error('Erro ao parsear resposta de escolha de entrega:', error);
    return {
      choice: 'unclear',
      response: 'erro na interpretação'
    };
  }
}

export async function interpretAddressConfirmation(userResponse: string) {
  const systemPrompt = `Você é um assistente que interpreta respostas de confirmação de endereço.

O cliente foi perguntado se confirma um endereço específico. Você deve analisar a resposta e retornar um JSON com:

{
  "confirmed": boolean, // true se cliente confirmou (sim, correto, ok, etc.)
  "newAddress": string | null, // novo endereço se cliente forneceu um
  "response": string // interpretação da resposta
}

EXEMPLOS:

Cliente: "sim" → {"confirmed": true, "newAddress": null, "response": "confirmado"}
Cliente: "correto" → {"confirmed": true, "newAddress": null, "response": "confirmado"}  
Cliente: "ok" → {"confirmed": true, "newAddress": null, "response": "confirmado"}
Cliente: "não" → {"confirmed": false, "newAddress": null, "response": "negado"}
Cliente: "nao" → {"confirmed": false, "newAddress": null, "response": "negado"}
Cliente: "não, é Rua José Roberto, 82" → {"confirmed": false, "newAddress": "Rua José Roberto, 82", "response": "forneceu novo endereço"}
Cliente: "errado, meu endereço é Avenida Brasil, 123" → {"confirmed": false, "newAddress": "Avenida Brasil, 123", "response": "forneceu novo endereço"}

Retorne APENAS o JSON, sem texto adicional.`

  const response = await openAIClient.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: userResponse,
      }
    ],
    temperature: 0.1
  });

  try {
    const content = response.choices[0].message?.content || '{}';
    const parsed = JSON.parse(content);
    return {
      confirmed: parsed.confirmed || false,
      newAddress: parsed.newAddress || null,
      response: parsed.response || 'não interpretado'
    };
  } catch (error) {
    console.error('Erro ao parsear resposta de confirmação de endereço:', error);
    return {
      confirmed: false,
      newAddress: null,
      response: 'erro na interpretação'
    };
  }
} 
