import { createOrder } from '../controllers/ordersController';
import { createConversation, deleteConversation, getRecentConversation, updateConversation } from '../controllers/conversationController';
import { sendMessage, notifyAdmin } from './messagingService';
import { Conversation } from '../types/Conversation';
import { ShoppingCartItem, Store } from '../types/Store';
import { v4 as uuidv4 } from 'uuid';
import { Address } from '../types/User';
import { getUserByPhone, updateUserAddress } from '../controllers/userController';
import { getStoreStatus } from '../controllers/storeController';
import OpenAI from "openai";
import { Client, PlaceAutocompleteType } from '@googlemaps/google-maps-services-js';

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { add } from 'winston';
/**
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

const client = new SecretManagerServiceClient();
const clientGoogle = new Client({});

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';

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


// Função para validar itens do pedido
function validateOrderItem(item: any, menu: any[]): boolean {
  if (!item.menuId || !item.menuName || !item.quantity || item.quantity <= 0) {
    return false;
  }

  const product = menu.find(p => p.menuId === item.menuId);
  if (!product) {
    console.error(`Produto não encontrado no menu: ${item.menuId}`);
    return false;
  }

  return true;
}

// Função para verificar timeout de conversa
const CONVERSATION_TIMEOUT = 5 * 60 * 1000; // 5 minutos

function parseAIResponse(content: string | null): AIAnswer {
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
  from: string,
  message: any,
  store: Store,
  res: any,
  name?: string,
  address?: Address,
) {

  console.log('MENSAGEM RECEBIDA', message)

  if (message?.interactive?.type === 'nfm_reply') {
    return
  }

  if (!store.wabaEnvironments) {
    notifyAdmin(' conversa:', 'Loja não possui WABA configurado');
    return;
  }

  // Check opening hour
  const storeStatus = getStoreStatus(store);
  console.log('STATUS DA LOJA', storeStatus)

  try {
    if (storeStatus !== 'ABERTA') {
      await sendMessage({
        messaging_product: 'whatsapp',
        to: "+" + from,
        type: 'text',
        text: {
          body: 'A loja está fechada no momento, nosso horário de atendimento é de segunda à sexta, das 08:00 as 19:00 e aos sábados, das 08:00 às 12:00. Se quiser, digite cardápio para ver nossos pratos. Agradecemos a preferência.',
        },
      }, store.wabaEnvironments);

      return;
    }

    // Loja Aberta
    let currentConversation: Conversation | undefined = await getRecentConversation(from, store._id);

    const user = await getUserByPhone(from);

    // verifica se e confirmacao de endereco
    if (currentConversation?.flow === 'WELCOME') {
      console.log('----()PRIMEIRA CONVERSA VERIFICA SE TEM ENDERECO()-----')

      if (address) {

        console.log('----cliente TEM ENDERECO()-----')

        sendMessage({
          messaging_product: 'whatsapp',
          to: "+" + from,
          type: 'text',
          text: { body: `✅ Endereço encontrado!\n\n📍 **${address.name}**\n\nVocê confirma este endereço ou deseja informar outro?` },
        }, store.wabaEnvironments)

        await updateConversation(currentConversation, { flow: 'ADDRESS_CONFIRMATION' })

        return;
      } else {
        console.log('----cliente NAO TEM ENDERECO, PEDE PARA INFORMAR -----', message)

        sendMessage({
          messaging_product: 'whatsapp',
          to: "+" + from,
          type: 'text',
          text: { body: `✅ Por favor, informe seu endereço completo, exemplo, Avenida 9 de julho, 181, apto 10` },
        }, store.wabaEnvironments)

        await updateConversation(currentConversation, { flow: 'NEW_ADDRESS' })

        return;
      }
    }

    // verifica se e confirmacao de endereco
    if (currentConversation?.flow === 'NEW_ADDRESS') {

      console.log('---------new ADDRESS---------')

      const address = message?.text?.body;
      if (!address) {
        sendMessage({
          messaging_product: 'whatsapp',
          to: "+" + from,
          type: 'text',
          text: { body: `✅ Por favor, informe seu endereço completo, exemplo, Avenida 9 de julho, 181, apto 10` },
        }, store.wabaEnvironments)

        return;
      }

      // Chama o Google Places API
      try {
        // Chama o Google Places Autocomplete
        const response = await clientGoogle.placeAutocomplete({
          params: {
            input: `${address} - ${store.address?.city || ''} - ${store.address?.state || ''}`,
            types: PlaceAutocompleteType.geocode,
            key: GOOGLE_PLACES_API_KEY,
          },
        });

        if (!response?.data?.predictions || response.data.predictions.length === 0) {
          // Não encontrou endereço: retorna para ADDRESS_INFORMATION (mensagem de erro pode ser implementada depois)
          sendMessage({
            messaging_product: 'whatsapp',
            to: "+" + from,
            type: 'text',
            text: { body: `Endereço não encontrado. Por favor, informe seu endereço completo, exemplo, Avenida 9 de julho, 181, apto 10` },
          }, store.wabaEnvironments)

          await updateConversation(currentConversation, { flow: 'NEW_ADDRESS' });

          console.log('Endereço não encontrado, retornando para ADDRESS_INFORMATION');
          return;

        } else {
          // Encontrou resultados: monta lista para ADDRESS_RESULT
          const predictions = await Promise.all(
            response.data.predictions.slice(0, 9).map(async (prediction: { place_id: any; terms: { value: any; }[]; description: any; }) => {
              const placeDetails = await clientGoogle.placeDetails({
                params: {
                  place_id: prediction.place_id,
                  key: GOOGLE_PLACES_API_KEY,
                },
              });

              const location = placeDetails.data.result.geometry?.location;

              console.log('Location:', location);

              // Armazenar no cache
              addressCache[prediction.place_id] = {
                lat: location?.lat!,
                lng: location?.lng!,
                title: prediction.terms[0].value,
                description: prediction.description,
                placeId: prediction.place_id,
              };

              return {
                id: prediction.place_id,
                title: prediction.terms[0].value,
                description: prediction.description,
              };
            })
          );


          if (!predictions.length) {
            console.log('NAO ENCONTROU ENDERECOS - PREDICTIONS VAZIO')

            sendMessage({
              messaging_product: 'whatsapp',
              to: "+" + from,
              type: 'text',
              text: { body: `Endereço não encontrado. Por favor, informe seu endereço completo, exemplo, Avenida 9 de julho, 181, apto 10` },
            }, store.wabaEnvironments)

            await updateConversation(currentConversation, { flow: 'NEW_ADDRESS' });

            return;
          }

          // encontrou o endereco
          if (predictions.length === 1) {
            console.log('ENCONTROU ENDERECO - PREDICTIONS === 1')

            const fullAddress = addressCache[predictions[0].id].description

            sendMessage({
              messaging_product: 'whatsapp',
              to: "+" + from,
              type: 'text',
              text: { body: `✅ Endereço encontrado!\n\n📍 **${fullAddress}**\n\nPor favor, confirme se o endereço está correto.` },
            }, store.wabaEnvironments)


            await updateConversation(currentConversation, {
              address:
              {
                ...addressCache[predictions[0].id], street: '', number: '', neighborhood: '', city: '', state: '', zipCode: '',
                name: predictions[0].description,
                main: true
              }, flow: 'ADDRESS_CONFIRMATION'
            });

            return;
          }

          // multiplos enderecos
          if (predictions.length > 1) {
            console.log(' ENCONTROU MULTIPLOS ENDERECOS ')

            sendMessage({
              messaging_product: 'whatsapp',
              to: "+" + from,
              type: 'text',
              text: { body: `🔍 Encontramos múltiplos endereços!\n\nPor favor, verifique e informe novamente seu endereço de forma mais específica:\n\n${predictions.map((pre, index) => `${index + 1}. 📍 ${pre.description}`).join('\n')}\n\nDigite seu endereço completo novamente.` },
            }, store.wabaEnvironments)


            await updateConversation(currentConversation, { flow: 'NEW_ADDRESS' });

            return;
          }

        }
      } catch (error) {
        notifyAdmin('Erro ao consultar Google Places:', error);
        sendMessage({
          messaging_product: 'whatsapp',
          to: "+" + from,
          type: 'text',
          text: { body: `Erro ao buscar endereço, por favor, tente novamente.` },
        }, store.wabaEnvironments)
      }

      return;
    }

    // verifica se e confirmacao de endereco
    if (currentConversation?.flow === 'ADDRESS_CONFIRMATION') {
      console.log('----()---------ADDRESS CONFIRMATON', message)

      // Chamar OpenAI para interpretar a resposta do cliente
      const userResponse = message?.text?.body || '';
      const addressConfirmationResult = await interpretAddressConfirmation(userResponse);

      console.log('Resposta interpretada:', addressConfirmationResult);

      if (addressConfirmationResult.confirmed) {
        // Cliente confirmou o endereço
        console.log('Cliente confirmou o endereço');

        console.log('Vai verificar o raio de entrega');

        if (currentConversation?.address?.placeId) {
          const selectedAddress = addressCache[currentConversation?.address?.placeId];
          if (selectedAddress) {
            // Coordenadas da loja
            const storeLat = store.address?.lat!;
            const storeLng = store.address?.lng!;

            // Coordenadas do endereço selecionado
            const selectedLat = selectedAddress.lat;
            const selectedLng = selectedAddress.lng;

            // Calcular a distância entre a loja e o endereço selecionado
            const distance = calculateDistance(storeLat, storeLng, selectedLat, selectedLng);

            console.log('Distância calculada:', distance, store.deliveryMaxRadiusKm);


            // Verificar se está dentro do raio de entrega
            if (distance > store.deliveryMaxRadiusKm || 0) {
              console.log('FORA do raio de entrega');

              // Enviar resposta da IA para o cliente
              await sendMessage({
                messaging_product: 'whatsapp',
                to: "+" + from,
                type: 'text',
                text: { body: `O endereço informado está fora do nosso raio de entrega. Fazemos entrega em um raio de ${store.deliveryMaxRadiusKm} kilometros.` }
              }, store.wabaEnvironments);

              return;
            }

          }
        }


        // Chamar OpenAI com mensagem "cardápio" para iniciar o pedido
        console.log('Chamando IA com mensagem "cardápio" para iniciar pedido');

        await updateConversation(currentConversation, { flow: 'CATEGORIES' });

        // Cliente já tem endereço confirmado pelo sistema

        const cardapioMessage = { text: { body: 'cardápio' } };
        const intent = await classifyUserMessage(cardapioMessage, store, currentConversation.history || '');

        const content = parseAIResponse((intent as any).message?.content);
        console.log('Resposta da IA para cardápio:', content);

        // Atualizar histórico com a resposta da IA
        await updateConversation(currentConversation, {
          flow: 'CATEGORIES',
          history: `${currentConversation.history ? currentConversation.history + ' --- ' : ''} ${content.message}`
        });

        // Enviar resposta da IA para o cliente
        await sendMessage({
          messaging_product: 'whatsapp',
          to: "+" + from,
          type: 'text',
          text: { body: content.message }
        }, store.wabaEnvironments);

      } else if (addressConfirmationResult.newAddress) {
        // Cliente forneceu um novo endereço
        console.log('Cliente forneceu novo endereço:', addressConfirmationResult.newAddress);

        await sendMessage({
          messaging_product: 'whatsapp',
          to: "+" + from,
          type: 'text',
          text: { body: '🔍 Verificando o novo endereço...' }
        }, store.wabaEnvironments);

        // Atualizar para fluxo de novo endereço e reprocessar
        delete currentConversation.address;
        await updateConversation(currentConversation, { flow: 'NEW_ADDRESS' });

        // Simular mensagem com o novo endereço
        const newMessage = { text: { body: addressConfirmationResult.newAddress } };
        console.log('vai CHAMAR NOVO ENDERECO', addressConfirmationResult.newAddress)
        return handleIncomingTextMessage(from, newMessage, store, res, name, addressConfirmationResult.newAddress);

      } else {
        // Cliente disse "não" - pedir novo endereço
        console.log('Cliente não confirmou o endereço');

        await sendMessage({
          messaging_product: 'whatsapp',
          to: "+" + from,
          type: 'text',
          text: { body: '📍 Por favor, informe seu endereço completo novamente.\n\nExemplo: Avenida 9 de Julho, 181, apto 10' }
        }, store.wabaEnvironments);

        delete currentConversation.address;
        await updateConversation(currentConversation, { flow: 'NEW_ADDRESS' });
      }

      return;
    }

    if (!currentConversation) return;

    // Atualiza a Conversation com a mensagem d 
    await updateConversation(currentConversation, {
      history: `${currentConversation.history ? currentConversation.history + ' --- ' : ''} ${message?.text?.body}`
    });

    try {
      // Call AI agent
      console.log('CLIENTE USUARIO', user)
      const intent = await classifyUserMessage(message, store, currentConversation.history);

      console.log('INTENTION RETURNED: ', intent, (intent as any).message?.content, JSON.stringify((intent as any).message?.content));

      const content = parseAIResponse((intent as any).message?.content)

      console.log('INTENTION CONTENT', content)

      // Update history conversation
      await updateConversation(currentConversation, {
        history: `${currentConversation.history ? currentConversation.history + ' --- ' : ''} ${content.message}`
      });

      if (typeof content === 'object') {
        switch (content.action) {
          case 'Pedido Finalizado':
            console.log('Order finished, storing in Firestore', content.items);

            currentConversation.cartItems = [];

            content.items?.forEach((product: ShoppingCartItem) => {
              const cartItem = {
                id: `${product.menuId}-${Date.now()}`,
                menuId: product.menuId,
                menuName: product.menuName,
                price: product.price,
                questions: product.questions,
                quantity: product.quantity
              };

              // Adiciona ao pedido e salva
              if (currentConversation) {
                currentConversation.cartItems?.push(cartItem as ShoppingCartItem)
                console.log('ITEm ADICIONADO', cartItem)
              }
            })

            // Cliente já tem endereço configurado pelo sistema, vai direto para pagamento
            await updateConversation(currentConversation, {
              cartItems: currentConversation.cartItems,
              conversationStage: 'Normal'
            });

            // const newOrder = await createOrder({ ...currentConversation, phoneNumber: from, address: user?.address || { name: 'Rua teste', main: true, neighborhood: '', number: '10', zipCode: '', street: '' } }, '111');

            // if (currentConversation.docId) {
            //   await deleteConversation(currentConversation.docId,)
            // }

            // currentConversation = undefined;

            // console.log('New order has been created', newOrder);


            break;

          case 'Forma de Pagamento':
            // if (content.message === 'PIX' || content.message === 'Cartão de crédito' || content.message === 'Pagamento na Entrega') {
            console.log('VAI CRIAR A ORDER', currentConversation.docId, currentConversation.cartItems)

            // Criar resumo detalhado dos itens do pedido para a loja ANTES de limpar currentConversation
            const cartItems = currentConversation.cartItems || [];
            const itemsSummary = cartItems.map((item: any) =>
              `• ${item.quantity}x ${item.menuName}${item.price ? ` - R$ ${item.price.toFixed(2)}` : ''}`
            ).join('\n') || 'Itens não especificados';

            const totalValue = currentConversation.totalPrice ? `\n💰 *Total: R$ ${currentConversation.totalPrice.toFixed(2)}*` : '';

            const deliveryAddress = user?.address ?
              `${user.address.street}, ${user.address.number} - ${user.address.neighborhood}` :
              'Endereço não informado';

            const customerName = currentConversation.customerName || 'Cliente não identificado';

            const newOrder = await createOrder({
              ...currentConversation,
              phoneNumber: from,
              address: user?.address || {
                name: 'Rua Jose Roberto Messias, 160 - Residencial Ville de France 3',
                main: true, neighborhood: '', number: '10', zipCode: '', street: ''
              }
            }, '111');

            // Atualizar endereço do usuário com o endereço usado no pedido
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

                // Atualizar endereço do usuário
                await updateUserAddress(from, updatedAddress);
                console.log('Endereço do usuário atualizado após pedido:', updatedAddress.name);
              }
            }

            if (currentConversation.docId) {
              await deleteConversation(currentConversation.docId)
            }

            currentConversation = undefined;

            console.log('New order has been created', newOrder);

            // await sendMessage({
            //   messaging_product: 'whatsapp',
            //   to: "+" + from,
            //   type: 'text',
            //   text: { body: 'Obrigado pela confiança, Estamos preparando etc e tal' }
            // }, store.wabaEnvironments);

            const detailedStoreMessage = `🔔 *NOVO PEDIDO - AGUARDANDO CONFIRMAÇÃO*\n\n` +
              `📋 *Pedido:* #${newOrder.id}\n` +
              `👤 *Cliente:* ${customerName}\n` +
              `📱 *Telefone:* ${from}\n` +
              `📍 *Endereço:* ${deliveryAddress}\n\n` +
              `🛒 *Itens:*\n${itemsSummary}${totalValue}\n\n` +
              `⚡ *AÇÃO NECESSÁRIA:* Confirme ou rejeite este pedido no sistema!`;

            await sendMessage({
              messaging_product: 'whatsapp',
              to: store.whatsappNumber,
              type: 'text',
              text: { body: detailedStoreMessage }
            }, store.wabaEnvironments);

            const customerMessage = `✅ *Pedido Confirmado!*\n\n` +
              `📋 *Número do Pedido:* #${newOrder.id}\n` +
              `🛒 *Resumo:*\n${itemsSummary}${totalValue}\n\n` +
              `📍 *Endereço de Entrega:* ${deliveryAddress}\n\n` +
              `⏰ *Status:* Aguardando confirmação da loja\n` +
              `🚛 *Estimativa:* Você será notificado quando o pedido for confirmado!\n\n` +
              `Obrigado pela preferência! 😊`;

            await sendMessage({
              messaging_product: 'whatsapp',
              to: "+" + from,
              type: 'text',
              text: { body: customerMessage }
            }, store.wabaEnvironments);

            return;

          default:
            break
        }
      }

      // Tratamento de erro
      if (content.action === 'error') {
        console.error('IA retornou erro:', content.message);
        await sendMessage({
          messaging_product: 'whatsapp',
          to: "+" + from,
          type: 'text',
          text: { body: 'Desculpe, ocorreu um erro. Vamos recomeçar. Digite "cardápio" para ver nossos produtos.' }
        }, store.wabaEnvironments);
        return;
      }

      await sendMessage({
        messaging_product: 'whatsapp',
        to: "+" + from,
        type: 'text',
        text: { body: content.message }
      }, store.wabaEnvironments);

      // await sendWelcomeMessage(from, flowToken, store.wabaEnvironments, store);
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      res.status(500).send("Erro ao enviar mensagem");
    }
  } catch (error) {
    notifyAdmin('  conversa:', error);
    return res.status(500).send('Erro ao criar nova conversa');;
  }
}

export async function classifyUserMessage(message: any, store: Store, history?: string) {
  const categories = store.categories.map((category) => {
    return {
      name: category.categoryName,
      id: category.categoryId
    }
  });

  const products = store.menu.map((item) => {
    return `${item.menuName}
      ${item.menuDescription}
      R$ ${item.price}
      Opcionais: ${item.questions.map(question => (
      `
        ${question.questionName},
        ${question.answers?.map(answer => (
        `${answer.answerName}`
      ))}`
    ))
      }))
    }}`
  })

  const systemPrompt = `
Você é um assistente de pedidos para delivery no WhatsApp.

## OBJETIVO
Conduzir vendas do início ao fim: saudação → anotação do pedido → confirmação → finalização.

## FASES DO ATENDIMENTO
1. **SAUDACAO**: Envie boas-vindas + cardápio completo
2. **FAZENDO PEDIDO**: Anote itens, confirme antes de adicionar/alterar
3. **PEDIDO FINALIZADO**: Confirme pedido + perguntar forma de pagamento
4. **FORMA DE PAGAMENTO**: Identifique método (PIX/Cartão/Entrega)

## IMPORTANTE: GESTÃO DE ENDEREÇOS - REGRA CRÍTICA
O sistema já gerencia endereços automaticamente ANTES de você ser chamado.
- NUNCA pergunte sobre endereço em qualquer situação
- NUNCA mencione "informe seu endereço" ou "endereço completo"
- NUNCA use actions relacionadas a endereço
- NUNCA valide ou confirme endereços
- ASSUMA que o cliente SEMPRE já tem endereço válido configurado
- Se aparecer algo sobre endereço na mensagem, IGNORE COMPLETAMENTE

## REGRAS CRÍTICAS - NUNCA QUEBRAR
- Sempre consulte o HISTÓRICO antes de responder
- Confirme cada item antes de adicionar ao pedido
- Mostre pedido atualizado após cada alteração
- IMPORTANTE: Se perguntou "deseja mais algo?" e cliente disse "não/nada/é isso" → FINALIZAR
- OBRIGATÓRIO: Ao finalizar pedido, SEMPRE pergunte forma de pagamento

## EVITAR LOOPS
- Não repita a mesma pergunta se cliente já respondeu
- Se cliente disse "não quero mais nada" após ter itens no pedido → finalizar imediatamente
- Não pergunte novamente se deseja adicionar algo se já negou

## FORMATO DE RESPOSTA (sempre JSON válido)
{
  "action": "Saudacao|Fazendo Pedido|Pedido Finalizado|Forma de Pagamento",
  "mensagem": "sua resposta aqui (use \\n para quebras de linha)",
  "items": [] // só preencher quando action = "Pedido Finalizado"
}

IMPORTANTE: Use \\n para quebras de linha, não quebras literais no JSON.

## ESTRUTURA DE ITEMS (quando action = "Pedido Finalizado")
{
  "menuId": number,
  "menuName": "string",
  "quantity": number,
  "price": number,
  "questions": [
    {
      "questionId": number,
      "questionName": "string", 
      "answers": [
        {"answerId": number, "answerName": "string", "quantity": number}
      ]
    }
  ]
}

## REGRA CRÍTICA PARA "PEDIDO FINALIZADO"
Quando action = "Pedido Finalizado", você **OBRIGATORIAMENTE** deve:
1. Confirmar o pedido com TODOS os detalhes (itens, quantidades, preços, total)
2. **SEMPRE perguntar forma de pagamento** (cliente já tem endereço válido)
3. NUNCA mencionar endereço - isso já foi resolvido pelo sistema

**EXEMPLO OBRIGATÓRIO:**
{
  "action": "Pedido Finalizado",
  "mensagem": "Perfeito! Seu pedido foi finalizado com sucesso!\\n\\n📋 **RESUMO DO PEDIDO:**\\n• 1x Sorvete de Chocolate - R$ 15,00\\n**TOTAL: R$ 15,00**\\n\\n💳 **FORMA DE PAGAMENTO:**\\nEscolha uma opção:\\n• PIX\\n• Cartão de Crédito\\n• Pagamento na Entrega\\n\\nDigite sua escolha:",
  "items": [{"menuId": 5, "menuName": "Sorvete", "quantity": 1, "price": 15.00, "questions": [...]}]
}

## REGRA ABSOLUTA: NUNCA MENCIONE ENDEREÇOS
- JAMAIS escreva palavras como "endereço", "informe", "localização", "onde fica"
- O sistema já tem o endereço do cliente configurado
- Se tiver dúvidas sobre entrega, ignore completamente

## CAPTURA DE ADICIONAIS/SABORES - REGRA CRÍTICA
**SEMPRE** quando o cliente mencionar sabores, adicionais ou modificações:
1. Identifique o produto base no cardápio
2. Procure nas "questions" e "answers" do produto
3. OBRIGATÓRIO: Inclua os adicionais na estrutura questions/answers
4. NUNCA ignore sabores, adicionais ou modificações mencionadas pelo cliente

**Exemplos:**
- "Sorvete de chocolate" → produto: Sorvete + sabor: chocolate nas questions
- "Pizza de calabresa" → produto: Pizza + sabor: calabresa nas questions  
- "Hambúrguer sem cebola" → produto: Hambúrguer + modificação: sem cebola nas questions

## VALIDAÇÕES
- Só aceite produtos do cardápio fornecido
- Respeite limites min/max dos opcionais
- Se histórico vazio = nova conversa
- NUNCA finalize sem detalhes completos na mensagem
- CRÍTICO: SEMPRE capture adicionais/sabores mencionados pelo cliente

## AÇÕES POR TIPO DE MENSAGEM

**Saudação:** "Oi", "Cardápio", "Boa tarde"
→ Action: "Saudacao" + boas-vindas + cardápio completo

**Fazendo Pedido:** "Quero 1 marmitex", "Sim, quero bebida", "Sorvete de chocolate"
→ Action: "Fazendo Pedido" + confirma + verifica se mencionou adicionais + pergunta opcionais faltantes + mostra pedido

**IMPORTANTE:** Se cliente mencionar adicionais (ex: "sorvete de chocolate"):
1. Confirme o produto + adicional: "Perfeito! Sorvete de chocolate anotado"
2. Verifique se há outros opcionais disponíveis
3. Se houver, pergunte: "Deseja algum adicional? Temos: [listar opções]"
4. SEMPRE inclua o adicional mencionado na estrutura do produto

**Finalização:** "Finalizar", "Fechar conta", "É isso", "Não quero mais nada", "Só isso"
→ Action: "Pedido Finalizado" + detalhes completos + pergunta forma de pagamento + items array

**Pagamento:** "PIX", "Cartão", "Na entrega" (respostas do cliente)
→ Action: "Forma de Pagamento" + método identificado

## REGRA IMPORTANTE PARA PERGUNTAS
Quando perguntar "Deseja adicionar algo mais?", aceite essas respostas:
- "Não", "Nada", "Só isso", "É isso" → Finalizar pedido
- "Sim", nome de produto → Adicionar item
- Qualquer produto mencionado → Adicionar item

## REGRA CRÍTICA SOBRE ACTIONS
**"Pedido Finalizado"** = Quando VOCÊ pergunta qual forma de pagamento (resumo + pergunta)
**"Forma de Pagamento"** = Quando cliente RESPONDE com "PIX", "Cartão", "Na entrega"

**Pagamento:** "PIX", "Cartão", "Na entrega" (APENAS respostas do cliente)
→ Action: "Forma de Pagamento" + método identificado

## ÚLTIMA VERIFICAÇÃO ANTES DE ENVIAR
SEMPRE faça estas verificações:
1. ✅ Se cliente mencionou sabor/adicional → está nas questions/answers?
2. ✅ Se action="Pedido Finalizado" → items array tem todos os produtos?
3. ✅ Se action="Pedido Finalizado" → mensagem pergunta FORMA DE PAGAMENTO?
4. ✅ NUNCA mencione endereços (sistema já gerencia isso)

**ERRO GRAVE:** Adicionar produto sem capturar adicionais mencionados pelo cliente.
**EXEMPLO ERRO:** Cliente: "sorvete de chocolate" → Você adiciona apenas "sorvete" sem o "chocolate"

**FLUXO OBRIGATÓRIO:** Pedido → Forma de Pagamento

NUNCA envie "Pedido finalizado" sem os detalhes completos na mensagem.
Seja direto, mantenha fluidez, não faça muitas perguntas numa mensagem.
    `;

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const storeStatus = getStoreStatus(store)

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Mensagem: ${(JSON.stringify(message))}, Histórico da Conversa:'${history}', Cardápio: ${JSON.stringify(products)}, Horário de Aendimento: 08:30 às 17:00, Status da Loja: ${storeStatus}`,
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

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await client.chat.completions.create({
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

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await client.chat.completions.create({
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
