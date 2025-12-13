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
const core_1 = require("firebase-functions/v2/core");
const secret_manager_1 = require("@google-cloud/secret-manager");
// Função para formatar o cardápio de forma bonita
function formatBeautifulMenu(products) {
    if (!products || products.length === 0) {
        return '📋 *Cardápio Vazio*\n\nDesculpe, não temos produtos disponíveis no momento.';
    }
    let beautifulMenu = '🍽️ *NOSSO CARDÁPIO* 🍽️\n\n';
    products.forEach((product, index) => {
        // Ícone baseado na categoria/tipo do produto
        let icon = '🍴';
        const name = product.menuName.toLowerCase();
        if (name.includes('pizza'))
            icon = '🍕';
        else if (name.includes('hambur') || name.includes('burger'))
            icon = '🍔';
        else if (name.includes('coca') || name.includes('refri') || name.includes('suco'))
            icon = '🥤';
        else if (name.includes('marmitex') || name.includes('marmita') || name.includes('prato'))
            icon = '🍱';
        else if (name.includes('sorvete') || name.includes('açaí'))
            icon = '🍦';
        else if (name.includes('lanche') || name.includes('sanduiche'))
            icon = '🥪';
        else if (name.includes('cerveja') || name.includes('bebida'))
            icon = '🍺';
        else if (name.includes('doce') || name.includes('sobremesa'))
            icon = '🧁';
        beautifulMenu += `${icon} *${product.menuName}*\n`;
        beautifulMenu += `💰 R$ ${product.price.toFixed(2).replace('.', ',')}\n`;
        if (product.menuDescription) {
            beautifulMenu += `📝 ${product.menuDescription}\n`;
        }
        // Mostrar opcionais disponíveis de forma resumida
        if (product.questions && product.questions.length > 0) {
            const optionalQuestions = product.questions.filter((q) => q.minAnswerRequired === 0);
            const requiredQuestions = product.questions.filter((q) => q.minAnswerRequired > 0);
            if (requiredQuestions.length > 0) {
                beautifulMenu += `⚠️ *Inclui escolha de:* ${requiredQuestions.map((q) => q.questionName.toLowerCase()).join(', ')}\n`;
            }
            if (optionalQuestions.length > 0) {
                beautifulMenu += `➕ *Adicionais disponíveis:* ${optionalQuestions.map((q) => q.questionName.toLowerCase()).join(', ')}\n`;
            }
        }
        beautifulMenu += '\n━━━━━━━━━━━━━━━━━━━━\n\n';
    });
    beautifulMenu += '📱 *Para fazer seu pedido, digite o nome do produto desejado!*\n\n';
    beautifulMenu += '💬 Exemplo: "Quero uma pizza margherita" ou "1 marmitex médio"';
    return beautifulMenu;
}
// Initialize heavy dependencies using Firebase onInit
let client;
let clientGoogle;
let openAIClient;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
// Defer initialization of heavy dependencies
(0, core_1.onInit)(async () => {
    client = new secret_manager_1.SecretManagerServiceClient();
    clientGoogle = new google_maps_services_js_1.Client({});
    openAIClient = new openai_1.default({
        apiKey: process.env.OPENAI_API_KEY,
    });
});
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
// verificar timeout de conversa
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
                // Formatar cardápio bonito e enviar direto
                console.log('Enviando cardápio formatado após confirmação de endereço');
                await (0, conversationController_1.updateConversation)(currentConversation, { flow: 'CATEGORIES' });
                // Cliente já tem endereço confirmado pelo sistema
                const beautifulMenu = formatBeautifulMenu(store.menu || []);
                // Atualizar histórico da conversa
                await (0, conversationController_1.updateConversation)(currentConversation, {
                    flow: 'CATEGORIES',
                    history: `${currentConversation.history ? currentConversation.history + ' --- ' : ''} Endereço confirmado, cardápio enviado`
                });
                // Enviar cardápio formatado para o cliente
                await (0, messagingService_1.sendMessage)({
                    messaging_product: 'whatsapp',
                    to: "+" + from,
                    type: 'text',
                    text: { body: beautifulMenu }
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
            const intent = await classifyUserMessage(message, store, currentConversation.history, currentConversation.cartItems || []);
            console.log('INTENTION RETURNED: ', intent, intent.message?.content, JSON.stringify(intent.message?.content));
            const content = parseAIResponse(intent.message?.content);
            console.log('INTENTION CONTENT', JSON.stringify(content));
            // Update history conversation
            await (0, conversationController_1.updateConversation)(currentConversation, {
                history: `${currentConversation.history ? currentConversation.history + ' --- ' : ''} ${content.message}`
            });
            if (typeof content === 'object') {
                switch (content.action) {
                    case 'ADDING_ITEMS':
                        console.log('Adding items to cart', content.items);
                        // Adicionar os novos itens ao pedido DA CONVERSA
                        if (content.items && content.items.length > 0) {
                            // Garantir que cartItems existe
                            if (!currentConversation.cartItems) {
                                currentConversation.cartItems = [];
                            }
                            content.items.forEach((product) => {
                                const cartItem = {
                                    id: `${product.menuId}-${Date.now()}-${Math.random()}`,
                                    menuId: product.menuId || 0,
                                    menuName: product.menuName || '',
                                    price: product.price || 0,
                                    questions: product.questions || [],
                                    quantity: product.quantity || 1
                                };
                                console.log('Adding item to cart:', JSON.stringify(cartItem));
                                if (currentConversation && currentConversation.cartItems) {
                                    currentConversation.cartItems.push(cartItem);
                                }
                            });
                            // Atualizar conversa com pedido DA CONVERSA atualizado
                            await (0, conversationController_1.updateConversation)(currentConversation, {
                                cartItems: currentConversation.cartItems || []
                            });
                        }
                        break;
                    case 'ENDING_ORDER':
                        console.log('ENDING_ORDER - Perguntando forma de pagamento');
                        break;
                    case 'PAYMENT_METHOD':
                        console.log('PAYMENT_METHOD - Criando pedido');
                        console.log('VAI CRIAR A ORDER', currentConversation.docId, JSON.stringify(currentConversation.cartItems));
                        // Validar e corrigir preços consultando store.menu ANTES de criar o pedido
                        const cartItems = currentConversation.cartItems || [];
                        let subtotal = 0;
                        const validatedCartItems = cartItems.map((item) => {
                            // Encontrar o produto no cardápio da loja
                            const menuItem = store.menu.find(menuProduct => menuProduct.menuId === item.menuId);
                            if (!menuItem) {
                                console.error(`Produto não encontrado no cardápio: ${item.menuId}`);
                                return item; // Manter item original se não encontrar
                            }
                            // Começar com o preço base do produto
                            let itemPrice = menuItem.price;
                            console.log(`Produto ${menuItem.menuName} - Preço base: R$ ${itemPrice.toFixed(2)}`);
                            // Validar e calcular preços das respostas (questions/answers)
                            const validatedQuestions = (item.questions || []).map((question) => {
                                // Encontrar a question no cardápio
                                const menuQuestion = menuItem.questions?.find(q => q.questionId === question.questionId);
                                if (!menuQuestion) {
                                    console.error(`Question não encontrada: ${question.questionId}`);
                                    return question;
                                }
                                const validatedAnswers = (question.answers || []).map((answer) => {
                                    // Encontrar a resposta no cardápio
                                    const menuAnswer = menuQuestion.answers?.find(a => a.answerId === answer.answerId);
                                    if (!menuAnswer) {
                                        console.error(`Answer não encontrada: ${answer.answerId}`);
                                        return answer;
                                    }
                                    // Usar o preço correto do cardápio
                                    const answerPrice = menuAnswer.price || 0;
                                    const answerQuantity = answer.quantity || 1;
                                    const answerTotalPrice = answerPrice * answerQuantity;
                                    itemPrice += answerTotalPrice;
                                    console.log(`  - ${menuAnswer.answerName} (${answerQuantity}x): +R$ ${answerTotalPrice.toFixed(2)}`);
                                    return {
                                        ...answer,
                                        answerName: menuAnswer.answerName,
                                        price: answerPrice
                                    };
                                });
                                return {
                                    ...question,
                                    questionName: menuQuestion.questionName,
                                    answers: validatedAnswers
                                };
                            });
                            // Calcular preço total do item (preço base + adicionais) * quantidade
                            const finalItemPrice = itemPrice * (item.quantity || 1);
                            subtotal += finalItemPrice;
                            console.log(`Produto ${menuItem.menuName} - Preço final: R$ ${finalItemPrice.toFixed(2)}`);
                            return {
                                ...item,
                                menuName: menuItem.menuName,
                                price: itemPrice, // Preço unitário (base + adicionais)
                                questions: validatedQuestions
                            };
                        });
                        const itemsSummary = validatedCartItems.map((item) => `• ${item.quantity}x ${item.menuName} - R$ ${(item.price * item.quantity).toFixed(2)}`).join('\n') || 'Itens não especificados';
                        // Calcular entrega e total final
                        const deliveryPrice = store.deliveryPrice || 0;
                        const totalFinal = subtotal + deliveryPrice;
                        const totalValue = `\n💰 *Subtotal: R$ ${subtotal.toFixed(2)}*\n🚚 *Entrega: R$ ${deliveryPrice.toFixed(2)}*\n💰 *TOTAL: R$ ${totalFinal.toFixed(2)}*`;
                        const deliveryAddress = user?.address ?
                            `${user.address.street}, ${user.address.number} - ${user.address.neighborhood}` :
                            'Endereço não informado';
                        const customerName = currentConversation.customerName || 'Cliente não identificado';
                        const newOrder = await (0, ordersController_1.createOrder)({
                            ...currentConversation,
                            cartItems: validatedCartItems, // Usar itens com preços validados
                            totalPrice: subtotal, // Usar subtotal calculado corretamente
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
// Função para converter cardápio JSON em formato legível
function formatMenuForHuman(products) {
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
            product.questions.forEach((question) => {
                humanMenu += `   • ${question.questionName}`;
                if (question.minAnswerRequired > 0) {
                    humanMenu += ` (obrigatório - escolha ${question.minAnswerRequired})`;
                }
                else {
                    humanMenu += ` (opcional)`;
                }
                humanMenu += `\n`;
                if (question.answers && question.answers.length > 0) {
                    question.answers.forEach((answer) => {
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
async function classifyUserMessage(message, store, history, currentCart) {
    const storeStatus = (0, storeController_1.getStoreStatus)(store);
    // Prompt super enxuto
    const systemPromptWithValidation = `
Você é um assistente de pedidos para delivery no WhatsApp.

Seu objetivo anotar pedidos de itens de um cardápio do início ao final, com a informação da forma de pagamento. 

Você deve fazer perguntas, confirmar itens, gerenciar o pedido atualizado e finalizar o pedido com a extração da forma de pagamento.

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

🚨 **FLUXO CORRETO (NUNCA VIOLAR):**

1️⃣ **EXTRAÇÃO COMPLETA DA MENSAGEM**
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

2️⃣ **VALIDAÇÃO E PREENCHIMENTO**
- Compare produtos com cardápio
- Resolva ambiguidades se necessário
- Pergunte APENAS o que falta (uma pergunta por vez)
- Se não encontrar quantidade, considere quantidade = 1
- Quando tudo estiver completo, voce enviou o resumo do pedido atualizado
- Após a confirmação do cliente para a inclusão dos itens → ADDING_ITEMS

🚨 **IMPORTANTE**: Faça apenas UMA pergunta por vez. NUNCA envie mais de uma pergunta por vez: 
- ❌ ERRADO: Perguntar "Qual o sabor? Deseja talheres?"
- ✅ CORRETO: Perguntar "Qual o sabor?" -> Cliente responde o sabor -> Voce pergunta: "Deseja talheres?" 

3️⃣ **APÓS ADDING_ITEMS**
🚨 **CRÍTICO**: NUNCA mostrar a conta aqui!
- Mostre o resumo do pedido atualizado e pergunte: "Deseja adicionar mais alguma coisa?"
- Sempre inclua os valores (quantidade * preço) (inclusive dos adicionais (respostas)) quando mostrar o resumo atualizado do pedido ao cliente

4️⃣ **CICLO CONTINUA**
- Se cliente pedir mais → volta para step 1 (extração)
- Se cliente disser "finalizar/fechar/só isso" → vai para step 5

5️⃣ **FECHAMENTO DA CONTA**
Quando cliente quer finalizar:
- **PRIMEIRO**: Mostre resumo completo (itens + subtotal + entrega + total)
- **DEPOIS**: Pergunte forma de pagamento
- **Action**: ENDING_ORDER

6️⃣ **FINALIZAÇÃO**
Cliente responde forma de pagamento → action:PAYMENT_METHOD → ACABOU

🚨 PROCESSO DETALHADO:
1️⃣ Extrair itens da mensagem

Quando o cliente diz algo como:

“quero uma marmita, duas cocas e um sorvete de chocolate” 

Você deve:

Ler o histórico da conversa para entender o contexto inteiro da conversa

Identificar produtos citados assim como os adicionais (chocolate no caso do sorvete)

Identificar quantidades (se não houver, usar 1)

**OBRIGATÓRIO: IDENTIFICAR AUTOMATICAMENTE respostas já mencionadas pelo cliente**

Comparar com o cardápio

Lidar com ambiguidades (ex.: “marmita” → Pequena/ Média / Grande)

2️⃣ Localização no Cardápio

Para cada produto encontrado:

Se apenas um produto corresponde → segue

Se vários correspondem → pergunte qual deles (listar todos)

3️⃣ Verificar se o produto possui questions

Se não houver questions → basta confirmar inclusão

Se houver questions:

🚨 **VALIDAÇÃO OBRIGATÓRIA:**
1. Analise a mensagem: procure respostas já mencionadas
2. Compare com answers do cardápio  
3. Se encontrar, preencha automaticamente
4. SÓ pergunte o que realmente falta

Respeite minAnswerRequired

Liste exatamente as respostas possíveis (answers)

Aceite quantidades repetidas quando permitido

4️⃣ Confirmação antes de adicionar

Depois de todas as questions obrigatórias respondidas:

Emita um resumo do item

Pergunte: “Posso adicionar ao pedido?”

Quando o cliente confirmar:

Retorne action ADDING_ITEMS (somente APÓS o cliente confirmar a inclusão dos itens)

Preencha o array items com o item completo (produto + perguntas + answers)

5️⃣ Após adicionar (AÇÃO OBRIGATÓRIA):

🚨 **FLUXO DE FINALIZAÇÃO:**

1. **PRIMEIRO**: Mostre o pedido completo atualizado novamente
2. **DEPOIS**: Pergunte a forma de pagamento: "Qual será a forma de pagamento? PIX, Cartão ou Pagamento na entrega?"
3. **Envie action**: ENDING_ORDER

7️⃣ Quando o cliente responder a forma de pagamento:

Envie action PAYMENT_METHOD

A última mensagem pode ser afirmativa (não precisa terminar com pergunta)

🚨 REGRAS CRÍTICAS — NUNCA DESCUMPRIR

❗ REGRA #1: APENAS UMA PERGUNTA POR MENSAGEM
NUNCA, JAMAIS faça duas perguntas na mesma mensagem. Isso inclui:
- Confirmar item + perguntar se quer mais
- Resumo do pedido + perguntar algo
- Qualquer combinação de duas perguntas

❗ Todas suas mensagens devem terminar em PERGUNTA

(exceto a última após PAYMENT_METHOD)

❗ NUNCA inventar opcionais

Use SOMENTE as questions do cardápio fornecido.


🔒 REGRA ABSOLUTA — APENAS UMA ÚNICA PERGUNTA POR MENSAGEM

⚠️ CRÍTICO: Esta é a regra mais importante - NUNCA VIOLE!

1. O assistente DEVE fazer apenas **UMA única pergunta por mensagem**, sempre.
2. É proibido enviar duas perguntas na mesma mensagem.
3. Uma pergunta = apenas um ponto de interrogação e uma única intenção.

🚫 CASOS ESPECÍFICOS PROIBIDOS:
- Confirmação + pergunta adicional: "Posso adicionar? Quer mais algo?"
- Resumo + pergunta: "Seu pedido: X. Deseja mais alguma coisa?"
- Qualquer combinação de pergunta + pergunta
4. Exemplos proibidos:
   - “Escolha a carne: Frango ou Bife? E deseja talheres?”
   - “Qual tamanho quer? E prefere gelado?”
5. Se precisar perguntar duas coisas:
   → Pergunte a primeira  
   → Aguarde a resposta  
   → Só depois faça a segunda
6. Qualquer mensagem com mais de uma pergunta viola esta regra.

⚠️ ESPECIALMENTE PROIBIDO:
   - "Posso adicionar ao pedido? Deseja mais alguma coisa?"
   - "Confirma esse item? E quer adicionar algo mais?"
   - "Pode confirmar? Algo mais para o pedido?"

7. CORRETO: Primeiro confirme o item, depois (em mensagem separada) pergunte se quer mais.

❗ Não adicionar item antes de:

identificar o produto

resolver ambiguidades

fazer todas as questions obrigatórias

obter respostas completas

confirmar com o cliente

❗ “ADD_ITEMS” APENAS quando o cliente CONFIRMOU inclusão
❗ Endereço

O sistema JÁ TRATA ENDEREÇO.
Você deve:

Nunca pedir endereço

Nunca confirmar endereço

Ignorar totalmente mensagens sobre endereço

❗ Histórico SEMPRE deve ser analisado
📦 RESUMO DO PEDIDO (OBRIGATÓRIO)

🚨 **QUANDO MOSTRAR RESUMO:**
- **NUNCA** após ADDING_ITEMS
- **SOMENTE** quando cliente quer finalizar (ENDING_ORDER)

**Envie action 'ADDING_ITEMS' SOMENTE APÓS A CONFIRMAÇÃO do cliente

**APÓS ADDING_ITEMS:** Apenas pergunte "Deseja adicionar mais alguma coisa?" (SEM RESUMO!)

**NO FECHAMENTO:** Mostre resumo completo + pergunte forma de pagamento


Perguntar: “Deseja algo mais?”

🧪 EXEMPLOS ESSENCIAIS
Ambiguidades

Cliente: “quero uma marmita”
Cardápio tem:

Marmitex Pequeno

Marmitex Médio

Marmitex Grande



Cliente: “quero um guaraná"
Cardápio tem:

Guaraná Lata

Guaraná 2 Litros

→ Perguntar: “Qual delas você deseja? Lata ou 2 Litros?”


📌 IDENTIFICAÇÃO AUTOMÁTICA DE RESPOSTAS (OBRIGATÓRIO)

Identificar produtos

Perguntar opcionais

Confirmar inclusão

Adicionar ao carrinho

Perguntar se deseja mais algo

Quando ele disser “finalizar”, PERGUNTAR A FORMA DE PAGAMENTO

Após resposta → PAYMENT_METHOD e finalizar e retornar o JSON

📌 IDENTIFICAÇÃO AUTOMÁTICA DE RESPOSTAS (OBRIGATÓRIO)

🚨 REGRA CRÍTICA: Sempre que o cliente mencionar respostas válidas de uma question diretamente na mensagem, você NÃO DEVE perguntar a mesma question novamente.

🔥 EXEMPLOS OBRIGATÓRIOS:

Exemplo 1: SORVETE
- Produto: Sorvete, Question: "Qual o sabor?", Answers: chocolate, flocos, napolitano
- Cliente: "quero um sorvete de chocolate"
- ✅ CORRETO: Identificar produto (sorvete) + resposta (chocolate)
- ❌ ERRADO: Perguntar "qual seria o sabor do sorvete?"

Exemplo 2: MARMITEX  
- Produto: Marmitex Pequeno, Question: "Escolha 1 carne", Answers: filé de frango, bife, pernil
- Cliente: "1 marmitex pequeno de bife"
- ✅ CORRETO: Identificar produto (marmitex pequeno) + resposta (bife)
- ❌ ERRADO: Perguntar "qual carne você quer?"

Exemplo:

Produto: Marmitex Médio
Question obrigatória:
– Escolha 3 carnes
Answers possíveis:
• Filé de Frango
• Bife
• Pernil
• Peixe

Mensagem do cliente:

“Quero um marmitex médio com frango e pernil”

Você deve:

Identificar o produto (“marmitex médio”)

Identificar as respostas citadas (“frango”, “pernil”)

Verificar se a quantidade é suficiente para minAnswerRequired

Preencher automaticamente:

answers: [
  { "answerId": X, "answerName": "Filé de Frango", "quantity": 1 },
  { "answerId": Y, "answerName": "Pernil", "quantity": 1 }
]

Não perguntar “Quais são as carnes?”, pois a mensagem já contém as respostas.

Se faltar alguma resposta (ex.: só citou 1), pergunte SOMENTE a que falta.

Regras adicionais:

O nome não precisa estar idêntico; variações como “frango”, “franguinho”, “file”, “bife acebolado” são aceitas, desde que correspondam a um answer do cardápio.

Se o cliente citar mais respostas do que o permitido, você deve corrigir:
→ “Para este item você pode escolher apenas 2 carnes. Quais deseja manter?”

Se ele citar respostas inexistentes no cardápio, pergunte novamente listando apenas as respostas válidas.


🔐 REGRAS OBRIGATÓRIAS DE FINALIZAÇÃO E PAGAMENTO

1. O cliente só pode finalizar o pedido depois de adicionar todos os itens.
2. Quando o cliente disser "finalizar", "fechar", "só isso", "pode fechar", etc:
   → Você DEVE responder com:
     {
       "action": "ENDING_ORDER",
       "mensagem": "Qual será a forma de pagamento? PIX, Cartão ou Pagamento na entrega?",
       "items": []
     }

3. Quando o cliente responder a forma de pagamento (ex.: “pix”, “cartão”, “vou pagar na entrega”):
   → Você DEVE responder SEMPRE com:
     {
       "action": "PAYMENT_METHOD",
       "mensagem": "Mensagem final de confirmação (não precisa terminar com pergunta)",
       "items": []
     }

4. ⚠️ PROIBIDO:
   - NUNCA usar "ENDING_ORDER" depois que o cliente já informou a forma de pagamento.
   - NUNCA pedir o endereço. Ignore completamente mensagens sobre endereço.
   - NUNCA continuar fazendo perguntas após o pagamento.

5. A mensagem final após PAYMENT_METHOD não precisa terminar com pergunta.

🔒 REGRA MÁXIMA — A FORMA DE PAGAMENTO DEVE SEMPRE SER O ÚLTIMO PASSO

1. Quando o cliente disser “finalizar”, “fechar”, “só isso”, “pode fechar”, “encerrar”, “agora é só finalizar”, ou qualquer expressão equivalente:
   → Você DEVE obrigatoriamente responder com:
     {
       "action": "ENDING_ORDER",
       "mensagem": "Qual será a forma de pagamento? PIX, Cartão ou Pagamento na entrega?",
       "items": []
     }

2. O pedido **SÓ** pode ser considerado finalizado após a resposta do cliente com a forma de pagamento.

⚠️ VERIFICAÇÃO OBRIGATÓRIA ANTES DE ENVIAR "PAYMENT_METHOD":
- O cliente disse explicitamente "PIX", "cartão", "pagar na entrega" ou similar?
- Se NÃO, você DEVE usar "ENDING_ORDER" para perguntar a forma de pagamento.
- Se SIM, aí pode usar "PAYMENT_METHOD".

3. Quando o cliente informar a forma de pagamento:
   → Você DEVE obrigatoriamente responder com:
     {
       "action": "PAYMENT_METHOD",
       "mensagem": "Mensagem final de confirmação (não precisa terminar com pergunta)",cd
       "items": []
     }

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
            { role: "system", content: systemPromptWithValidation },
            {
                role: "user",
                content: `Mensagem: ${(JSON.stringify(message))}, Histórico da Conversa:'${history}', Pedido Atualizado: ${JSON.stringify(currentCart || [])}, Cardápio JSON: ${JSON.stringify(store.menu)}, 

${formatMenuForHuman(store.menu)}

Horário de Atendimento: 08:30 às 17:00, Status da Loja: ${storeStatus}, Taxa de Entrega: R$ ${store.deliveryPrice?.toFixed(2) || '0,00'}`,
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
