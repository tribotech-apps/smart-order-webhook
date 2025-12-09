"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAIResponse = parseAIResponse;
exports.handleIncomingTextMessage = handleIncomingTextMessage;
exports.classifyUserMessage = classifyUserMessage;
exports.classifyPaymentType = classifyPaymentType;
exports.interpretDeliveryChoice = interpretDeliveryChoice;
exports.interpretAddressConfirmation = interpretAddressConfirmation;
const ordersController_1 = require("../controllers/ordersController");
const conversationController_1 = require("../controllers/conversationController");
const messagingService_1 = require("./messagingService");
const userController_1 = require("../controllers/userController");
const storeController_1 = require("../controllers/storeController");
const openai_1 = __importDefault(require("openai"));
const google_maps_services_js_1 = require("@googlemaps/google-maps-services-js");
const secret_manager_1 = require("@google-cloud/secret-manager");
const client = new secret_manager_1.SecretManagerServiceClient();
const clientGoogle = new google_maps_services_js_1.Client({});
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
// Cache to store address details temporarily
// Função para calcular distância usando fórmula de Haversine
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Raio da Terra em km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distância em km
    return d;
}
function deg2rad(deg) {
    return deg * (Math.PI / 180);
}
const addressCache = {};
// Função para validar itens do pedido
function validateOrderItem(item, menu) {
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
function parseAIResponse(content) {
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
        console.log('NORMALIZED RESPONSE', normalizedResponse);
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
                normalizedResponse.items.forEach((item, index) => {
                    if (!item.menuId || !item.menuName || !item.quantity) {
                        console.error(`ERRO CRÍTICO: Item ${index} está incompleto:`, item);
                    }
                    // Log para debug: verificar se tem questions quando deveria ter
                    if (item.questions && item.questions.length > 0) {
                        console.log(`✅ Item ${item.menuName} tem ${item.questions.length} questions configuradas`);
                        item.questions.forEach((q) => {
                            if (q.answers && q.answers.length > 0) {
                                console.log(`   - ${q.questionName}: ${q.answers.map((a) => a.answerName).join(', ')}`);
                            }
                        });
                    }
                    else {
                        console.warn(`⚠️ Item ${item.menuName} não tem questions (pode estar faltando adicionais)`);
                    }
                });
            }
        }
        return normalizedResponse;
    }
    catch (err) {
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
        }
        catch (fallbackErr) {
            console.error("Fallback parsing também falhou:", fallbackErr);
        }
        return { action: "error", message: "Erro ao processar resposta", items: [] };
    }
}
async function handleIncomingTextMessage(from, message, store, res, name, address) {
    console.log('MENSAGEM RECEBIDA', message);
    if (message?.interactive?.type === 'nfm_reply') {
        return;
    }
    if (!store.wabaEnvironments) {
        (0, messagingService_1.notifyAdmin)(' conversa:', 'Loja não possui WABA configurado');
        return;
    }
    // Check opening hour
    const storeStatus = (0, storeController_1.getStoreStatus)(store);
    console.log('STATUS DA LOJA', storeStatus);
    try {
        if (storeStatus !== 'ABERTA') {
            await (0, messagingService_1.sendMessage)({
                messaging_product: 'whatsapp',
                to: "+" + from,
                type: 'text',
                text: {
                    body: 'A loja está fechada no momento, nosso horário de atendimento é de segunda à sexta, das 08:00 as 19:00 e aos sábados, das 08:00 às 12:00.\nAgradecemos a preferência.',
                },
            }, store.wabaEnvironments);
            return;
        }
        // Loja Aberta
        let currentConversation = await (0, conversationController_1.getRecentConversation)(from, store._id);
        const user = await (0, userController_1.getUserByPhone)(from);
        // verifica tipo de entrega desejado
        if (currentConversation?.flow === 'WELCOME') {
            console.log('----()PRIMEIRA CONVERSA PERGUNTA TIPO DE ENTREGA()-----');
            // Pergunta se é delivery ou retirada no balcão com botões interativos
            (0, messagingService_1.sendMessage)({
                messaging_product: 'whatsapp',
                to: "+" + from,
                type: 'interactive',
                interactive: {
                    type: 'button',
                    body: {
                        text: 'Como você gostaria de receber seu pedido?'
                    },
                    action: {
                        buttons: [
                            {
                                type: 'reply',
                                reply: {
                                    id: 'delivery',
                                    title: '🚚 Delivery'
                                }
                            },
                            {
                                type: 'reply',
                                reply: {
                                    id: 'counter',
                                    title: '🏪 Retirada'
                                }
                            }
                        ]
                    }
                }
            }, store.wabaEnvironments);
            await (0, conversationController_1.updateConversation)(currentConversation, { flow: 'DELIVERY_TYPE' });
            return;
        }
        // Tratamento de DELIVERY_TYPE movido para sellerFlows.ts (botões interativos)
        // verifica se e confirmacao de endereco
        if (currentConversation?.flow === 'NEW_ADDRESS') {
            console.log('---------new ADDRESS---------');
            const address = message?.text?.body;
            if (!address) {
                (0, messagingService_1.sendMessage)({
                    messaging_product: 'whatsapp',
                    to: "+" + from,
                    type: 'text',
                    text: { body: `✅ Por favor, informe seu endereço completo` },
                }, store.wabaEnvironments);
                return;
            }
            // Chama o Google Places API
            try {
                // Chama o Google Places Autocomplete
                const response = await clientGoogle.placeAutocomplete({
                    params: {
                        input: `${address} - ${store.address?.city || ''} - ${store.address?.state || ''}`,
                        types: google_maps_services_js_1.PlaceAutocompleteType.geocode,
                        key: GOOGLE_PLACES_API_KEY,
                    },
                });
                if (!response?.data?.predictions || response.data.predictions.length === 0) {
                    // Não encontrou endereço: retorna para ADDRESS_INFORMATION (mensagem de erro pode ser implementada depois)
                    (0, messagingService_1.sendMessage)({
                        messaging_product: 'whatsapp',
                        to: "+" + from,
                        type: 'text',
                        text: { body: `📍 Por favor, informe seu endereço completo novamente, incluindo o bairro.\n\nExemplo: Rua das Flores, 181, apto 10 - Jadim Amaro` },
                    }, store.wabaEnvironments);
                    await (0, conversationController_1.updateConversation)(currentConversation, { flow: 'NEW_ADDRESS' });
                    console.log('Endereço não encontrado, retornando para ADDRESS_INFORMATION');
                    return;
                }
                else {
                    // Encontrou resultados: monta lista para ADDRESS_RESULT
                    const predictions = await Promise.all(response.data.predictions.slice(0, 9).map(async (prediction) => {
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
                            lat: location?.lat,
                            lng: location?.lng,
                            title: prediction.terms[0].value,
                            description: prediction.description,
                            placeId: prediction.place_id,
                        };
                        return {
                            id: prediction.place_id,
                            title: prediction.terms[0].value,
                            description: prediction.description,
                        };
                    }));
                    if (!predictions.length) {
                        console.log('NAO ENCONTROU ENDERECOS - PREDICTIONS VAZIO');
                        (0, messagingService_1.sendMessage)({
                            messaging_product: 'whatsapp',
                            to: "+" + from,
                            type: 'text',
                            text: { body: `📍 Por favor, informe seu endereço completo novamente, incluindo o bairro.\n\nExemplo: Rua das Flores, 181, apto 10 - Jadim Amaro` },
                        }, store.wabaEnvironments);
                        await (0, conversationController_1.updateConversation)(currentConversation, { flow: 'NEW_ADDRESS' });
                        return;
                    }
                    // encontrou o endereco
                    if (predictions.length === 1) {
                        console.log('ENCONTROU ENDERECO - PREDICTIONS === 1');
                        const fullAddress = addressCache[predictions[0].id].description;
                        (0, messagingService_1.sendMessage)({
                            messaging_product: 'whatsapp',
                            to: "+" + from,
                            type: 'text',
                            text: { body: `✅ Endereço encontrado!\n\n📍 **${fullAddress}**\n\nPor favor, confirme se o endereço está correto.` },
                        }, store.wabaEnvironments);
                        await (0, conversationController_1.updateConversation)(currentConversation, {
                            address: {
                                ...addressCache[predictions[0].id], street: '', number: '', neighborhood: '', city: '', state: '', zipCode: '',
                                name: predictions[0].description,
                                main: true
                            }, flow: 'ADDRESS_CONFIRMATION'
                        });
                        return;
                    }
                    // multiplos enderecos
                    if (predictions.length > 1) {
                        console.log(' ENCONTROU MULTIPLOS ENDERECOS ');
                        (0, messagingService_1.sendMessage)({
                            messaging_product: 'whatsapp',
                            to: "+" + from,
                            type: 'text',
                            text: { body: `🔍 Encontramos múltiplos endereços!\n\nPor favor, verifique e informe novamente seu endereço de forma mais específica:\n\n${predictions.map((pre, index) => `${index + 1}. 📍 ${pre.description}`).join('\n')}\n\nDigite seu endereço completo novamente.` },
                        }, store.wabaEnvironments);
                        await (0, conversationController_1.updateConversation)(currentConversation, { flow: 'NEW_ADDRESS' });
                        return;
                    }
                }
            }
            catch (error) {
                (0, messagingService_1.notifyAdmin)('Erro ao consultar Google Places:', error);
                (0, messagingService_1.sendMessage)({
                    messaging_product: 'whatsapp',
                    to: "+" + from,
                    type: 'text',
                    text: { body: `Erro ao buscar endereço, por favor, tente novamente.` },
                }, store.wabaEnvironments);
            }
            return;
        }
        // verifica se e confirmacao de endereco
        if (currentConversation?.flow === 'ADDRESS_CONFIRMATION') {
            console.log('----()---------ADDRESS CONFIRMATON', message);
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
                        const storeLat = store.address?.lat;
                        const storeLng = store.address?.lng;
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
                            await (0, messagingService_1.sendMessage)({
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
                await (0, conversationController_1.updateConversation)(currentConversation, { flow: 'CATEGORIES' });
                // Cliente já tem endereço confirmado pelo sistema
                const cardapioMessage = { text: { body: 'cardápio' } };
                const intent = await classifyUserMessage(cardapioMessage, store, currentConversation.history || '');
                const content = parseAIResponse(intent.message?.content);
                console.log('Resposta da IA para cardápio:', content);
                // Atualizar histórico com a resposta da IA
                await (0, conversationController_1.updateConversation)(currentConversation, {
                    flow: 'CATEGORIES',
                    history: `${currentConversation.history ? currentConversation.history + ' --- ' : ''} ${content.message}`
                });
                // Enviar resposta da IA para o cliente
                await (0, messagingService_1.sendMessage)({
                    messaging_product: 'whatsapp',
                    to: "+" + from,
                    type: 'text',
                    text: { body: content.message }
                }, store.wabaEnvironments);
            }
            else if (addressConfirmationResult.newAddress) {
                // Cliente forneceu um novo endereço
                console.log('Cliente forneceu novo endereço:', addressConfirmationResult.newAddress);
                await (0, messagingService_1.sendMessage)({
                    messaging_product: 'whatsapp',
                    to: "+" + from,
                    type: 'text',
                    text: { body: '🔍 Verificando o novo endereço...' }
                }, store.wabaEnvironments);
                // Atualizar para fluxo de novo endereço e reprocessar
                delete currentConversation.address;
                await (0, conversationController_1.updateConversation)(currentConversation, { flow: 'NEW_ADDRESS' });
                // Simular mensagem com o novo endereço
                const newMessage = { text: { body: addressConfirmationResult.newAddress } };
                console.log('vai CHAMAR NOVO ENDERECO', addressConfirmationResult.newAddress);
                return handleIncomingTextMessage(from, newMessage, store, res, name, addressConfirmationResult.newAddress);
            }
            else {
                // Cliente disse "não" - pedir novo endereço
                console.log('Cliente não confirmou o endereço');
                await (0, messagingService_1.sendMessage)({
                    messaging_product: 'whatsapp',
                    to: "+" + from,
                    type: 'text',
                    text: { body: '📍 Por favor, informe seu endereço completo novamente, incluindo o bairro.\n\nExemplo: Rua das Flores, 181, apto 10 - Jadim Amaro' }
                }, store.wabaEnvironments);
                delete currentConversation.address;
                await (0, conversationController_1.updateConversation)(currentConversation, { flow: 'NEW_ADDRESS' });
            }
            return;
        }
        if (!currentConversation)
            return;
        // Atualiza a Conversation com a mensagem d 
        await (0, conversationController_1.updateConversation)(currentConversation, {
            history: `${currentConversation.history ? currentConversation.history + ' --- ' : ''} ${message?.text?.body}`
        });
        try {
            // Call AI agent
            console.log('CLIENTE USUARIO', user);
            const intent = await classifyUserMessage(message, store, currentConversation.history);
            console.log('INTENTION RETURNED: ', intent, intent.message?.content, JSON.stringify(intent.message?.content));
            const content = parseAIResponse(intent.message?.content);
            console.log('INTENTION CONTENT', content);
            // Update history conversation
            await (0, conversationController_1.updateConversation)(currentConversation, {
                history: `${currentConversation.history ? currentConversation.history + ' --- ' : ''} ${content.message}`
            });
            if (typeof content === 'object') {
                switch (content.action) {
                    case 'Pedido Finalizado':
                        console.log('Order finished, storing in Firestore', content.items);
                        currentConversation.cartItems = [];
                        content.items?.forEach((product) => {
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
                                currentConversation.cartItems?.push(cartItem);
                                console.log('ITEm ADICIONADO', cartItem);
                            }
                        });
                        // Cliente já tem endereço configurado pelo sistema, vai direto para pagamento
                        await (0, conversationController_1.updateConversation)(currentConversation, {
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
                        console.log('VAI CRIAR A ORDER', currentConversation.docId, currentConversation.cartItems);
                        // Criar resumo detalhado dos itens do pedido para a loja ANTES de limpar currentConversation
                        const cartItems = currentConversation.cartItems || [];
                        const itemsSummary = cartItems.map((item) => `• ${item.quantity}x ${item.menuName}${item.price ? ` - R$ ${item.price.toFixed(2)}` : ''}`).join('\n') || 'Itens não especificados';
                        // Calcular subtotal, entrega e total final
                        const subtotal = currentConversation.totalPrice || 0;
                        const deliveryPrice = store.deliveryPrice || 0;
                        const totalFinal = subtotal + deliveryPrice;
                        const totalValue = `\n💰 *Subtotal: R$ ${subtotal.toFixed(2)}*\n🚚 *Entrega: R$ ${deliveryPrice.toFixed(2)}*\n💰 *TOTAL: R$ ${totalFinal.toFixed(2)}*`;
                        const deliveryAddress = user?.address ?
                            `${user.address.street}, ${user.address.number} - ${user.address.neighborhood}` :
                            'Endereço não informado';
                        const customerName = currentConversation.customerName || 'Cliente não identificado';
                        const newOrder = await (0, ordersController_1.createOrder)({
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
                                const updatedAddress = {
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
                                await (0, userController_1.updateUserAddress)(from, updatedAddress);
                                console.log('Endereço do usuário atualizado após pedido:', updatedAddress.name);
                            }
                        }
                        if (currentConversation.docId) {
                            await (0, conversationController_1.deleteConversation)(currentConversation.docId);
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
                        await (0, messagingService_1.sendMessage)({
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
                        await (0, messagingService_1.sendMessage)({
                            messaging_product: 'whatsapp',
                            to: "+" + from,
                            type: 'text',
                            text: { body: customerMessage }
                        }, store.wabaEnvironments);
                        return;
                    default:
                        break;
                }
            }
            // Tratamento de erro
            if (content.action === 'error') {
                console.error('IA retornou erro:', content.message);
                await (0, messagingService_1.sendMessage)({
                    messaging_product: 'whatsapp',
                    to: "+" + from,
                    type: 'text',
                    text: { body: 'Desculpe, ocorreu um erro. Vamos recomeçar. Digite "cardápio" para ver nossos produtos.' }
                }, store.wabaEnvironments);
                return;
            }
            await (0, messagingService_1.sendMessage)({
                messaging_product: 'whatsapp',
                to: "+" + from,
                type: 'text',
                text: { body: content.message }
            }, store.wabaEnvironments);
            // await sendWelcomeMessage(from, flowToken, store.wabaEnvironments, store);
        }
        catch (error) {
            console.error("Erro ao enviar mensagem:", error);
            res.status(500).send("Erro ao enviar mensagem");
        }
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('  conversa:', error);
        return res.status(500).send('Erro ao criar nova conversa');
        ;
    }
}
async function classifyUserMessage(message, store, history) {
    const categories = store.categories.map((category) => {
        return {
            name: category.categoryName,
            id: category.categoryId
        };
    });
    const products = store.menu.map((item) => {
        return `${item.menuName}
      ${item.menuDescription}
      R$ ${item.price}
      Opcionais: ${item.questions.map(question => (`
        ${question.questionName},
        ${question.answers?.map(answer => (`${answer.answerName}`))}`))}))
    }}`;
    });
    const systemPrompt = `
Você é um assistente de pedidos para delivery no WhatsApp.

## OBJETIVO
Conduzir pedidos de delivery do início ao fim: saudação → anotação do pedido → confirmação → finalização.

Voce deve entender o que o cliente esta querendo, se é apenas um produto ou mais de um produto na memsa mensagem e interpretar, consultando o cardápio enviado

Voce recebera o campo 'historico' que conterá o historico da conversa desde o seu início, com as mensagens do cliente e as respostas que voce enviou, que voce DEVERÁ SEMPRE consultar antes de interpertar a mensatem do cliente, para entener o contexto da conversa 

Voce é um atendende de pedidos para delivery, antes de tudo, voce deve primeiro entender o cardápio que contem os produtos que voce vai vender, para poder saber como anotar um pedido corretamente.

Modelo:

## ITENS DO MENU ##
  price: number;
  questions: MenuItemQuestion[];
}

## QUESTIONS ##
export interface MenuItemQuestion {
  questionId: number;
  questionName: string;
  minAnswerRequired: number;
  answers?: MenuItemAnswer[];
}

## ANSWERS ##
export interface MenuItemAnswer {
  answerId: number;
  answerName: string;
  price?: number;
  quantitt?: number;
}

Explicação do modelo do cardápio:
- Um item de menu (menuItem) possui, alem das informacoes de nome, descricao e preco, o campo questions que é um campo opcional (pode ser um array vazio) 
- Questions são as opcionais do produto. São perguntas que devem ser extraidas do cliente, que possuem respostas pré-cadastradas (campo 'answers'), para que sejam informadas uma ou mais respostas para serem adicionadas o pedido. 
- O campo 'minAnswerRequired' de 'questions' define a quantidade de respostas que o cliente deve informar, dentre as opçoes da pergunta (campo 'answers'). 
- O cliente deve informar o número de responstas do campo 'minAnswerRequired' da collection 'questions'

Exemplo: 
{
  menuName: 'Guaraná',
  price: 5.50
  questions: [
    {
      questionName: 'Deseja gelado?'
      minAnswerRequired: 1,
      answers: [
        {
          answerName: 'Sim',
          price: 1.00
        },
        {
          answerName: 'Não',
          price: 0
        }
      ]
    }
  ] 
}

- No exemplo acioma, quando o cliente pede um guaraná, voce deve verificar que o guarana possui 1 pergunta a ser extraída do cliente, passando as opçoes de resposta existentes (campo 'answers') e informando o preco de cada resposta, caso seja maior que zero.
**IMPORTNTE** - Se a resposta possuir um preco (campo price), este deve ser sempre informado ao cliente junto nas oções de resposta, para que o ciente tenha ciencia que vai ter um custo adicional ao item

Outro exemplo, com minAnserRequired = 3

{
  menuName: 'Marmitex Grande - Escolha 3 carnes',
  price: 5.50
  questions: [
    {
      questionName: 'Escolha 3 carnes'
      minAnswerRequired: 3,
      answers: [
        {
          answerName: 'File de Frango',
          price: 0.00
        },
        {
          answerName: 'Bife a Rolê',
          price: 0.00
        },
        {
          answerName: 'File de Fígado',
          price: 0.00
        },
        {
          answerName: 'Bife a Parmegiana',
          price: 10.00
        }
      ]
    }
  ] 
}

- No exemplo acima, minAnswerRequired = 3 signigica que o cliente tem que informar 3 das 4 repostas exsitentes
- O cliente poderá escolher mais de uma quantidade de uma mesma respota, (por isso existe o campo 'quantity' no objeto MenuItemAnswer). 
- Por Exemplo - no caso acima, o cliente pode pedir 2 file a parmegiana e 1 file de frango. 
- Nesse caso o array de objeto ficaria assim:
  answers: [
    {
      answerName: 'Filé a Parmegiana';
      price?: 10;
      quantitt?: 2;
    },{
      answerName: 'Filé de Frango';
      price?: 0;
      quantitt?: 1;
    }
  ]

- REGRA: Se a resposta escolhida possuir o campo 'price' maior que 0, este valor deve ser SEMPRE acrescentado ao pedido. 
- Exemplo: Deseja adionar batata rústica? (Sim: +10,00 ou Não)
- REGRA: Quando solicitar as respostas de uma pergunta, infrmar sempre o preco da resposta (campo price), se for maior que zero, para que o cliente tenha ciência que o valor será acresentado na conta, caso ele escolha a oção

- Um menuItem poderá ter mais de 1 question:
Exemplo: 
{
  menuName: 'Carne assada',
  price: 5.50
  questions: [
    {
      questionName: 'Qual o ponto da carne?'
      minAnswerRequired: 1,
      answers: [
        {
          answerName: 'A ponto',
          price: 0.00
        },
        {
          answerName: 'Mal passada',
          price: 0
        },
        {
          answerName: 'Bem passada',
          price: 0
        }
      ]
    },
    {
      questionName: 'Inclui Talheres?'
      minAnswerRequired: 1,
      answers: [
        {
          answerName: 'Sim',
          price: 0.00
        },
        {
          answerName: 'Não',
          price: 0
        }
      ]
    }
  ] 
}

- Voce deve fazer uma pergunta por vez, sendo proibido fazer mais de uma pergunta ao mesmo tempo na mesma mensgaem:
- Exemplo Errado: (NUNCA FAZER) - Vocẽ pediu uma carne assada, qual o ponto da carne? Precisa de talheres?
- Exemplo Correto: Voce pediu uma carne assada. 'Qual o ponto da carne?'. Após o clilente responder o ponto da carne, voce envia OUTRA mensgaem: 'Você precisa de talheres?' 

## 🚨 REGRAS CRÍTICAS QUE VOCÊ DEVE SEGUIR OBRIGATORIAMENTE 🚨

### 1. Desde a primeira mensagem, até a finalização, TODAS as suas mensagens DEVERÃO SER UMA PERGUNTA. Você NUNCA deverá enviar uma mensagem informativa apensas, SEMPRE deverá ser uma pergunta tentando extrair uma informação do pedido.

### 2. MOSTRAR PREÇOS DAS ANSWERS(OBRIGATÓRIO!)
**QUANDO fazer question com answers que têm preço (campo 'price' > 0):**
- ❌ ERRADO: "Quer guaraná gelado? (sim/não)"
- ✅ CORRETO: "Quer guaraná gelado (+R$1,00) ou natural?"
- ❌ ERRADO: "Incluir batata rústica? (sim/não)" 
- ✅ CORRETO: "Incluir batata rústica (+R$5,00)? (sim/não)"

**FORMATO OBRIGATÓRIO:** Sempre mostre "(+R$X,XX)" quando answer tem preço > 0

### 3. SOMAR PREÇOS DAS ANSWERS NO TOTAL (OBRIGATÓRIO!)
**CÁLCULO CORRETO:**
- Guaraná: R$3,00 (base) + Gelado: R$1,00 (answer) = R$4,00 por unidade
- 2x Guaraná Gelado = 2 × R$4,00 = R$8,00 TOTAL

**NO RESUMO E PEDIDO FINALIZADO:**
- ❌ ERRADO: "2x Guaraná - R$6,00" (só preço base)
- ✅ CORRETO: "2x Guaraná Gelado - R$8,00" (base + answers)
- SEMPRE checar se todos as respostas foram respondidas para cada item do pedido antes de enviar o RESIMO DO PEDIDO
- SEMPRE checar se todos os preços das respostas foram acrescentadas no pedido, antes de enviar o RESIMO DO PEDIDO

**CRÍTICO:** SEMPRE some preços das answers escolhidas ao preço base!

**EXEMPLO 1 - Guaraná:**
Produto: Guaraná (price: R$3,00)
Question: "Gelada?" (min: 0, max: 1)  
Answers: [{answerName: "Sim", price: 1.00}, {answerName: "Não", price: 0}]
**PERGUNTA CORRETA:** "Quer guaraná gelado (+R$1,00) ou natural?"

**EXEMPLO 2 - Marmitex:**
Produto: Marmitex Grande (price: R$15,00)
Question: "Escolha 3 carnes" (min: 3, max: 3)
Answers: [{answerName: "Filé de Frango", price: 0}, {answerName: "Bife à Role", price: 0}, {answerName: "Filé à Parmegiana", price: 10.00}]
**PERGUNTA CORRETA:** "Escolha 3 carnes (pode repetir): Filé de Frango, Bife à Role, Filé à Parmegiana (+R$10,00)"

### REGRAS CRÍTICAS:
1. **minAnswerRequired = 0**: Pergunta OPCIONAL
2. **minAnswerRequired > 0**: Pergunta OBRIGATÓRIA  
3. **Pode repetir answers**: Cliente pode escolher "2x Frango + 1x Parmegiana"
4. **Sempre mostrar preço**: Se answer.price > 0, mostre "(+R$X,XX)"

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
- **CRÍTICO SISTEMA:** TODA mensagem DEVE terminar com uma PERGUNTA - NUNCA apenas afirmações (exceto a ultima, na finalizacao do pedido, apos a informacao da forma de pagamento)
- **CRÍTICO SISTEMA:** NUNCA diga "Vou adicionar" ou "Adicionando" sem fazer pergunta depois
- **CRÍTICO:** ANTES de adicionar produto → PROCURE questions no cardápio
- **CRÍTICO:** Se produto TEM questions com minAnswerRequired > 0 → **NUNCA adicione sem perguntar**
- **CRÍTICO:** Se produto NÃO tem questions → adicione DIRETO sem perguntar nada
- **CRÍTICO:** NUNCA invente opcionais fictícios - use APENAS questions reais do cardápio
- Confirme cada item antes de adicionar ao pedido
- **OBRIGATÓRIO:** Mostre pedido atualizado após cada alteração (adicionar/remover/alterar item)
- **SEMPRE inclua o resumo completo do pedido COM VALOR DA ENTREGA antes de perguntar se deseja mais algo**
- **OBRIGATÓRIO:** Resumo deve ter: itens + subtotal + entrega + total final
- **CRÍTICO:** No resumo final, CALCULE preços corretos (base + answers) para cada item
- IMPORTANTE: Se perguntou "deseja mais algo?" e cliente disse "não/nada/é isso" → FINALIZAR
- OBRIGATÓRIO: Ao finalizar pedido, SEMPRE pergunte forma de pagamento

## REGRA CRÍTICA DO SISTEMA - SEMPRE TERMINAR COM PERGUNTA
**PROBLEMA GRAVE:** O sistema trava se você fizer apenas afirmações sem perguntas!

**OBRIGATÓRIO:** Toda mensagem DEVE terminar com uma pergunta para manter o fluxo ativo.

**EXCEÇÃO ÚNICA:** Após action "Forma de Pagamento" (último passo), pode terminar sem pergunta.

**EXEMPLOS ERRADOS que TRAVAM o sistema:**
❌ "Pizza adicionada ao pedido!" (sem pergunta)
❌ "Vou adicionar a pizza ao seu pedido." (sem pergunta)  
❌ "Aguarde, estou processando seu pedido." (sem pergunta)

**EXEMPLOS CORRETOS:**
✅ "Pizza adicionada! [RESUMO] Deseja adicionar algo mais?"
✅ "Produto adicionado ao pedido! [RESUMO] O que mais gostaria?"
✅ "Entendi sua escolha! Que quantidade você quer?"
✅ "Obrigado! Seu pedido foi enviado." (APENAS após "Forma de Pagamento")

**REGRA DE OURO:** Se você confirma uma ação → SEMPRE mostre resumo + faça pergunta! (exceto fim do processo)

## REGRA CRÍTICA - EVITAR LOOPS INFINITOS
**PROBLEMA CRÍTICO:** IA está repetindo a mesma pergunta infinitamente quando cliente responde!
**CONSULTE O  CAMPO 'historico' SEMPRE ANTES DE FAZER UMA PERGUNTA PARA ENTENDER O CONTEXTO E 'NUNCA' REPITA A MESMA PERGUNTA 2 VEZES**

**FLUXO OBRIGATÓRIO PARA RECONHECER RESPOSTAS:**
1. **ANALISE O HISTÓRICO:** Procure a última pergunta feita
2. **IDENTIFIQUE RESPOSTA:** Cliente respondeu à pergunta?
3. **ACEITE VARIAÇÕES:** "gelada", "sim", "gelado", "quente", "não" = respostas válidas
4. **NUNCA REPITA:** Se cliente já respondeu, PROCESSE a resposta e AVANCE

**EXEMPLO CRÍTICO DE LOOP (CORRIGIR):**
- IA pergunta: "Deseja que seu guaraná seja gelado? (digite sim ou não)"
- Cliente: "gelada" → IA DEVE ACEITAR como "sim" e adicionar produto
- Cliente: "sim" → IA DEVE ACEITAR e adicionar produto  
- Cliente: "gelado" → IA DEVE ACEITAR como "sim" e adicionar produto

**REGRAS PARA RECONHECIMENTO DE RESPOSTAS:**
- **SIM/POSITIVO:** "sim", "gelada", "gelado", "quero", "ok", "aceito", "pode ser"
- **NÃO/NEGATIVO:** "não", "nao", "natural", "sem", "não quero"
- **SE HISTÓRICO TEM PERGUNTA + CLIENTE RESPONDEU:** PROCESSE, não repita!

**DETECÇÃO DE LOOP OBRIGATÓRIA:**
- Se última mensagem do histórico contém pergunta sobre X
- E cliente respondeu sobre X  
- **NUNCA** pergunte sobre X novamente
- **SEMPRE** processe a resposta e avance no fluxo

**EXEMPLO CORRETO:**
1. IA: "Deseja guaraná gelado?"
2. Cliente: "gelada"  
3. IA: "Guaraná gelado adicionado! [RESUMO] Deseja algo mais?" (NÃO repete pergunta)

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
  "price": number, // CRÍTICO: PREÇO BASE DO PRODUTO (sem adicionais)
  "questions": [
    {
      "questionId": number,
      "questionName": "string", 
      "minAnswerRequred": "number",
      "maxAnswerRequred": "number",
      "answers": [
        {"answerId": number, "answerName": "string", "quantity": number, "price": number}
      ]
    }
  ]
}

**EXEMPLO PRÁTICO COM ANSWERS:**
{
  "menuId": 5,
  "menuName": "Guaraná", 
  "quantity": 2,
  "price": 3.00,
  "questions": [
    {
      "questionId": 1,
      "questionName": "Gelada?",
      "answers": [
        {"answerId": 2, "answerName": "Sim", "quantity": 2, "price": 1.00}
      ]
    }
  ]
}

**RESULTADO:** 2x Guaraná base (R$3,00) + 2x Gelada (R$1,00) = 2 × R$4,00 = R$8,00 TOTAL

## CÁLCULO CRÍTICO - PREÇO TOTAL DO ITEM
**ERRO GRAVÍSSIMO:** Não somar preços das answers no total!

**CÁLCULO OBRIGATÓRIO:**
Preço Total do Item = Preço Base + (Soma de todos os preços das answers)

**EXEMPLO CRÍTICO:**
- Guaraná: R$ 3,00 (preço base)
- Answer "Gelada": R$ 1,00 (adicional)
- **PREÇO TOTAL DO ITEM:** R$ 4,00
- **Para 2 guaranás gelados:** 2 × R$ 4,00 = R$ 8,00

**REGRA OBRIGATÓRIA:** SEMPRE some os preços das answers escolhidas ao preço base!

## REGRA CRÍTICA PARA "PEDIDO FINALIZADO"
Quando action = "Pedido Finalizado", você **OBRIGATORIAMENTE** deve:
1. **CALCULAR PREÇOS CORRETOS:** Para cada item, some preço base + preços das answers
2. Confirmar o pedido com TODOS os detalhes (itens, quantidades, preços TOTAIS corretos, subtotal)
3. **SEMPRE incluir o valor da entrega** (use o valor "Taxa de Entrega" fornecido) e mostrar o total final com entrega
4. **SEMPRE perguntar forma de pagamento** (cliente já tem endereço válido)
5. NUNCA mencionar endereço - isso já foi resolvido pelo sistema

**IMPORTANTE:** O valor da entrega está sempre disponível no contexto como "Taxa de Entrega". USE SEMPRE este valor no resumo final.

**EXEMPLO OBRIGATÓRIO (COM CÁLCULO CORRETO):**
{
  "action": "Pedido Finalizado",
  "mensagem": "Perfeito! Seu pedido foi finalizado com sucesso!\\n\\n📋 **RESUMO DO PEDIDO:**\\n• 2x Guaraná Gelado - R$ 4,00 cada = R$ 8,00\\n\\n**SUBTOTAL: R$ 8,00**\\n🚚 **Entrega: R$ 5,00**\\n💰 **TOTAL FINAL: R$ 13,00**\\n\\n💳 **FORMA DE PAGAMENTO:**\\nEscolha uma opção:\\n• PIX\\n• Cartão de Crédito\\n• Pagamento na Entrega\\n\\nDigite sua escolha:",
  "items": [{"menuId": 5, "menuName": "Guaraná", "quantity": 2, "price": 3.00, "questions": [{"questionId": 1, "questionName": "Gelada?", "answers": [{"answerId": 2, "answerName": "Sim", "quantity": 2, "price": 1.00}]}]}]
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

## REGRA CRÍTICA - QUESTIONS OBRIGATÓRIAS (NUNCA IGNORE!)
**ATENÇÃO:** Esta regra está sendo violada! IA está adicionando produtos COM questions SEM perguntar!

**FLUXO OBRIGATÓRIO - SIGA À RISCA:**
1. **VERIFICAÇÃO OBRIGATÓRIA:** Cliente quer produto X → PROCURE produto X no cardápio
2. **PROCURE O CAMPO "questions":**
   - SE produto.questions = [] (vazio) → Adicione DIRETO
   - SE produto.questions tem itens → **PARE! NUNCA ADICIONE SEM PERGUNTAR!**

3. **SE TEM QUESTIONS:**
   - Analise CADA question do array
   - Se minAnswerRequired > 0 → pergunta é OBRIGATÓRIA 
   - Se minAnswerRequired = 0 → pergunta é OPCIONAL
   - **NUNCA adicione produto antes de obter respostas para questions obrigatórias**

**EXEMPLO CRÍTICO:**

Produto no cardápio tem questions com minAnswerRequired = 1 (obrigatória)
Cliente: "Quero guaraná"
ERRO: "Guaraná adicionado!" (sem perguntar temperatura obrigatória)
CORRETO: "Quer guaraná gelada (+R$1,00) ou natural?"

**REGRA DE OURO:** SE produto TEM questions E minAnswerRequired > 0 → **NUNCA adicione antes de perguntar!**

## REGRA CRÍTICA - QUESTIONS SEQUENCIAIS (UMA POR VEZ!)
**ATENÇÃO:** Quando um produto tem MÚLTIPLAS questions, você DEVE processá-las SEQUENCIALMENTE!

**FLUXO OBRIGATÓRIO PARA MÚLTIPLAS QUESTIONS:**
1. **IDENTIFIQUE PRODUTO:** Cliente quer "Filé de Tilápia"
2. **PROCURE QUESTIONS:** Produto tem 2 questions: [talheres?, batata rústica?]
3. **PROCESSAMENTO SEQUENCIAL OBRIGATÓRIO:**
   - **PRIMEIRA QUESTION:** Pergunte APENAS a primeira question
   - **AGUARDE RESPOSTA:** NÃO faça mais perguntas até receber resposta
   - **PRÓXIMA QUESTION:** Só após resposta, pergunte a segunda question
   - **CONTINUE:** Repita até finalizar todas as questions

**EXEMPLO CORRETO:**
Produto: "Filé de Tilápia" tem 2 questions: ["Incluir talheres?", "Incluir batata rústica?"]

❌ **ERRO (PROIBIDO):**
"Incluir talheres? (sim/não)\nIncluir batata rústica? (sim/não)\n\nDeseja incluir talheres ou batata?"

✅ **CORRETO:**
1ª mensagem: "Perfeito! Filé de Tilápia selecionado.\n\nIncluir talheres? (digite sim ou não)"
2ª mensagem (só após resposta): "Incluir batata rústica (+R$5,00)? (digite sim ou não)"  
3ª mensagem (só após resposta): "Filé de Tilápia adicionado! [RESUMO DO PEDIDO]"

**REGRAS ABSOLUTAS:**
- **NUNCA** faça duas perguntas na mesma mensagem
- **NUNCA** escreva "Deseja incluir X ou Y?" para múltiplas options
- **SEMPRE** processe questions uma de cada vez
- **SEMPRE** aguarde resposta antes da próxima question
- **SEMPRE** termine cada mensagem com UMA pergunta específica

**GERENCIAMENTO DE ESTADO - MÚLTIPLAS QUESTIONS:**
O sistema gerencia o estado através do histórico. Quando você tem múltiplas questions:

1. **PRIMEIRA QUESTION:** Pergunte só a primeira, termine mensagem com esta pergunta
2. **AGUARDE:** Sistema espera resposta do cliente  
3. **CLIENTE RESPONDE:** Analise o histórico para ver qual question foi feita
4. **PRÓXIMA QUESTION:** Se ainda há questions pendentes, pergunte APENAS a próxima
5. **REPITA:** Até completar todas as questions
6. **FINALIZAR:** Só após todas as respostas, adicione o produto com resumo

**IMPORTANTE:** Use o histórico para identificar em qual question você está:
- Se histórico contém "Incluir talheres?" → próxima é batata rústica
- Se histórico contém ambas respostas → adicionar produto final

## REGRA CRÍTICA - MOSTRAR PREÇOS NAS QUESTIONS
**OBRIGATÓRIO:** Quando uma answer tem preço adicional (campo "price"), você DEVE informar o valor na pergunta!

**FLUXO OBRIGATÓRIO:**
1. **PROCURE answers da question no cardápio**
2. **VERIFIQUE se alguma answer tem campo "price" > 0**
3. **SE TEM PREÇO:** Inclua o valor na mensagem da pergunta
4. **FORMATO OBRIGATÓRIO:** "Opção (+R$X,XX)" ou "Opção (R$X,XX adicional)"

**EXEMPLOS CORRETOS:**

❌ **ERRO (PROIBIDO):**
"Gostaria de incluir batata rústica? (sim/não)"

✅ **CORRETO:**
"Gostaria de incluir batata rústica? Sim (+R$1,00) ou Não"

❌ **ERRO (PROIBIDO):**
"Quer guaraná gelada? (sim/não)"

✅ **CORRETO:**
"Quer guaraná gelada (+R$1,00) ou natural?"

**REGRAS PARA PREÇOS NAS QUESTIONS:**
- **SEMPRE** verifique o campo "price" nas answers
- **SEMPRE** mostre preços positivos na pergunta
- **FORMATO:** Use "+R$X,XX" para valores adicionais
- **SEM PREÇO:** Se price = 0, não mencione valor
- **TRANSPARÊNCIA:** Cliente deve saber custo ANTES de escolher

## VALIDAÇÕES
- Só aceite produtos do cardápio fornecido
- Respeite limites min/max dos opcionais
- Se histórico vazio = nova conversa
- NUNCA finalize sem detalhes completos na mensagem
- CRÍTICO: SEMPRE capture adicionais/sabores mencionados pelo cliente

## AÇÕES POR TIPO DE MENSAGEM

**Saudação:** "Oi", "Cardápio", "Boa tarde"
→ Action: "Saudacao" + boas-vindas + cardápio completo

**Fazendo Pedido:** "Quero 1 marmitex", "Adicionar pizza", "Sorvete de chocolate"
→ Action: "Fazendo Pedido" + confirma produto + **OBRIGATÓRIO: verifica se produto tem questions no cardápio** + **SE NÃO TEM questions: adiciona DIRETO** + **SE TEM questions: PARE e pergunte APENAS UMA question por vez (SEQUENCIAL)** + **NUNCA invente opcionais fictícios** + **CRÍTICO: Se produto tem múltiplas questions, processe UMA DE CADA VEZ** + **SEMPRE MOSTRA RESUMO DO PEDIDO ATUAL** + pergunta se deseja mais algo

**Respondendo Question:** "sim", "não", "gelada", "gelado", "natural", "com", "sem", respostas específicas para questions
→ Action: "Fazendo Pedido" + **CRÍTICO: ANALISE O HISTÓRICO para ver qual question foi feita** + **PROCESSE a resposta e passe para próxima question** + **SE foi última question: adicione produto com resumo** + **SE tem mais questions: faça APENAS a próxima question** + **NUNCA repita a mesma question**

## COMO IDENTIFICAR RESPOSTAS ÀS QUESTIONS
**REGRA CRÍTICA:** Se o histórico contém uma pergunta recente E cliente está respondendo → É resposta à question!

**EXEMPLOS DE IDENTIFICAÇÃO:**

**CENÁRIO 1:**
- Histórico: "...Deseja guaraná gelado? (digite sim ou não)"
- Cliente: "gelada" → **É RESPOSTA!** Não é novo pedido
- Ação: Adicionar guaraná gelado ao pedido + resumo

**CENÁRIO 2:**  
- Histórico: "...Incluir talheres?"
- Cliente: "sim" → **É RESPOSTA!** Não é novo pedido
- Ação: Se tem mais questions → próxima question. Se não → adicionar produto

**CENÁRIO 3:**
- Histórico: "...Deseja adicionar algo mais?"
- Cliente: "pizza" → **É NOVO PEDIDO!** Não é resposta à question
- Ação: Iniciar processo de adicionar pizza

**CENÁRIO 4 - MÚLTIPLAS RESPOSTAS:**
- Histórico: "...Escolha 3 carnes: Filé de Frango, Bife à Role, Filé à Parmegiana (+R$10,00)"
- Cliente: "2 frango e 1 parmegiana" → **É RESPOSTA!** Múltiplas escolhas
- Ação: Processar 2x Filé de Frango + 1x Filé à Parmegiana = 3 escolhas ✅

**REGRAS PARA MÚLTIPLAS RESPOSTAS:**
1. **Verificar quantidade:** Resposta atende min/max da question?
2. **Aceitar variações:** "2 frango 1 parmegiana", "frango, frango, parmegiana"
3. **Calcular preços:** 2×R$0 (frango) + 1×R$10 (parmegiana) = +R$10 adicional

**PALAVRA-CHAVE PARA DETECÇÃO:**
Se cliente usa palavras como "sim", "não", "gelada", "quente", "com", "sem" OU menciona itens das answers LOGO APÓS uma question no histórico → É resposta à question!

**REGRA OBRIGATÓRIA - RESUMO A CADA ALTERAÇÃO:**
TODA VEZ que adicionar, remover ou alterar um item no pedido, você DEVE:
1. Confirmar a ação (ex: "Pizza Margherita adicionada!")
2. **OBRIGATORIAMENTE mostrar o resumo completo do pedido atual**
3. **SEMPRE incluir subtotal + valor da entrega + total final**
4. Perguntar se deseja adicionar algo mais

**IMPORTANTE:** O resumo SEMPRE deve mostrar:
- Lista de itens com preços
- SUBTOTAL dos itens
- Valor da entrega (use "Taxa de Entrega" do contexto) - SE for delivery
- Se for retirada no balcão: "🏪 Retirada na loja: R$ 0,00"
- TOTAL FINAL (subtotal + entrega ou apenas subtotal se retirada)

**IMPORTANTE:** Você SEMPRE deverá consultar os itens do resumo do pedido para verificar se todas as questions foram respondidas corretamente, conforme o campo 'minAnswersRequired'

**IMPORTANTE:** Você SEMPRE deverá informar o preco da resposta selecionada (answers[x].price) quando enviar o RESUMO DO PEDIDO.

**Formato obrigatório do resumo:**
"📋 **SEU PEDIDO ATUAL:**\\n• 1x Pizza Margherita - R$ 25,00\\n• 2x Refrigerante - R$ 6,00\\n\\n**SUBTOTAL: R$ 31,00**\\n🚚 **Entrega: R$ 5,00**\\n💰 **TOTAL: R$ 36,00**\\n\\nDeseja adicionar algo mais?"

**IMPORTANTE:** Se cliente mencionar adicionais (ex: "sorvete de chocolate"):
1. Confirme o produto + adicional: "Perfeito! Sorvete de chocolate anotado"
2. **SEMPRE mostre o resumo do pedido atualizado**
3. Verifique se há outros opcionais disponíveis
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
0. ✅ **🚨 CRÍTICO PREÇOS:** Se estou fazendo question → verifiquei se answers têm preço e mostrei "(+R$X,XX)"?
1. ✅ **🚨 CRÍTICO CÁLCULO:** Se estou finalizando pedido → somei preços base + answers de TODOS os items?
2. ✅ **CRÍTICO SISTEMA:** Minha mensagem termina com uma PERGUNTA? (exceção: APENAS após "Forma de Pagamento")
3. ✅ **CRÍTICO LOOP:** Estou repetindo a mesma pergunta do histórico? SE SIM → PROCESSE a resposta do cliente em vez de repetir!
4. ✅ **CRÍTICO LOOP:** Cliente já respondeu minha última pergunta? SE SIM → AVANCE no fluxo, NÃO repita!
5. ✅ CRÍTICO: Produto TEM questions no cardápio? SE SIM → perguntei questions obrigatórias? SE NÃO → adicionei direto?
6. ✅ CRÍTICO: NÃO inventei opcionais fictícios que não existem no cardápio?
7. ✅ Se cliente mencionou sabor/adicional → está nas questions/answers reais do produto?
8. ✅ Se action="Fazendo Pedido" → mensagem inclui resumo completo (itens + subtotal + entrega + total)?
9. ✅ Se action="Pedido Finalizado" → items array tem todos os produtos?
10. ✅ **CRÍTICO:** Se action="Pedido Finalizado" → calculei preços corretos (base + answers) para cada item?
11. ✅ Se action="Pedido Finalizado" → mensagem pergunta FORMA DE PAGAMENTO?
12. ✅ NUNCA mencione endereços (sistema já gerencia isso)

**ERRO GRAVE:** Adicionar produto sem capturar adicionais mencionados pelo cliente.
**EXEMPLO ERRO:** Cliente: "sorvete de chocolate" → Você adiciona apenas "sorvete" sem o "chocolate"

**ERRO GRAVÍSSIMO:** Não somar preços das answers no total do item!
**EXEMPLO ERRO:** 2x Guaraná Gelado → Calculou R$ 6,00 (só produto) em vez de R$ 8,00 (produto + gelada)

**ERRO GRAVÍSSIMO QUE TRAVA O SISTEMA:** Enviar mensagem sem pergunta.
**EXEMPLO ERRO:** "Pizza adicionada!" → Sistema trava esperando interação

**FLUXO OBRIGATÓRIO:** Pedido → Forma de Pagamento

**REGRA FINAL:** TODA mensagem deve ter ação + pergunta. NUNCA apenas confirmações sem pergunta.
Seja direto, mantenha fluidez, mas SEMPRE termine com pergunta para manter o fluxo ativo.
    `;
    const client = new openai_1.default({
        apiKey: process.env.OPENAI_API_KEY,
    });
    const storeStatus = (0, storeController_1.getStoreStatus)(store);
    const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: systemPrompt },
            {
                role: "user",
                content: `Mensagem: ${(JSON.stringify(message))}, Histórico da Conversa:'${history}', Cardápio: ${JSON.stringify(products)}, Horário de Aendimento: 08:30 às 17:00, Status da Loja: ${storeStatus}, Taxa de Entrega: R$ ${store.deliveryPrice?.toFixed(2) || '0,00'}`,
            }
        ]
    });
    return response.choices[0];
}
async function classifyPaymentType(message) {
    const systemPrompt = `Voce é robo que ajuda a identificar a forma de pagamento enviada pelo cliente. 
  As 3 formas de pagamento existentes são: PIX, Cartão de Crédito e Pagamento na Entrega.
  Voce vai receber a forma de pagameno digitada pelo cliente e deve identificar qual forma de pagamento é entre as opçoes PIX, Cartão de Crédito e Pagamento na Entrega. 
  O cliente pode digitar errado e voce deve identificar qual a forma de pagamento o cliente quis informar e devolver essa resposta.`;
    const client = new openai_1.default({
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
async function interpretDeliveryChoice(userResponse) {
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

Retorne APENAS o JSON, sem texto adicional.`;
    const client = new openai_1.default({
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
            choice: parsed.choice || 'unclear',
            response: parsed.response || 'não interpretado'
        };
    }
    catch (error) {
        console.error('Erro ao parsear resposta de escolha de entrega:', error);
        return {
            choice: 'unclear',
            response: 'erro na interpretação'
        };
    }
}
async function interpretAddressConfirmation(userResponse) {
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

Retorne APENAS o JSON, sem texto adicional.`;
    const client = new openai_1.default({
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
    }
    catch (error) {
        console.error('Erro ao parsear resposta de confirmação de endereço:', error);
        return {
            confirmed: false,
            newAddress: null,
            response: 'erro na interpretação'
        };
    }
}
