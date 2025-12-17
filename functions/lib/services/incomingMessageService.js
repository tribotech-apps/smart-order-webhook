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
const uuid_1 = require("uuid");
const messageHelper_1 = require("./messageHelper");
// Função para formatar o cardápio de forma bonita
function formatBeautifulMenu(products) {
    if (!products || products.length === 0) {
        return '📋 *Cardápio Vazio*\n\nDesculpe, não temos produtos disponíveis no momento.';
    }
    let beautifulMenu = '🍽️ *NOSSO CARDÁPIO* 🍽️\n\n';
    products.forEach((product) => {
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
let clientGoogle;
let openAIClient;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
// Defer initialization of heavy dependencies
(0, core_1.onInit)(async () => {
    clientGoogle = new google_maps_services_js_1.Client({});
    openAIClient = new openai_1.default({
        apiKey: process.env.OPENAI_API_KEY,
    });
});
// Função auxiliar para calcular preço total de um item incluindo respostas das perguntas
function calculateItemTotalPrice(item) {
    let totalPrice = item.price * item.quantity;
    if (item.questions && Array.isArray(item.questions)) {
        item.questions.forEach((question) => {
            if (question.answers && Array.isArray(question.answers)) {
                question.answers.forEach((answer) => {
                    if (answer.price && answer.price > 0 && answer.quantity) {
                        totalPrice += answer.price * answer.quantity * item.quantity;
                    }
                });
            }
        });
    }
    return totalPrice;
}
// Função auxiliar para gerar descrição detalhada de um item incluindo TODAS as respostas selecionadas
function generateItemDescription(item) {
    let description = `• ${item.quantity}x ${item.menuName}`;
    let itemTotal = item.price * item.quantity;
    // Lista de todas as respostas selecionadas (pagas e gratuitas)
    const allAnswerDetails = [];
    if (item.questions && Array.isArray(item.questions)) {
        item.questions.forEach((question) => {
            if (question.answers && Array.isArray(question.answers)) {
                // Mostrar a pergunta como cabeçalho
                const questionTitle = `${question.questionName}:`;
                const selectedAnswers = [];
                question.answers.forEach((answer) => {
                    if (answer.quantity && answer.quantity > 0) {
                        // Calcular total do adicional se tiver preço
                        if (answer.price && answer.price > 0) {
                            const answerTotal = answer.price * answer.quantity * item.quantity;
                            selectedAnswers.push(`${answer.quantity}x ${answer.answerName} (+R$ ${answerTotal.toFixed(2)})`);
                            itemTotal += answerTotal;
                        }
                        else {
                            // Resposta gratuita
                            selectedAnswers.push(`${answer.quantity}x ${answer.answerName}`);
                        }
                    }
                });
                // Adicionar pergunta e respostas se houver seleções
                if (selectedAnswers.length > 0) {
                    allAnswerDetails.push(`${questionTitle} ${selectedAnswers.join(', ')}`);
                }
            }
        });
    }
    // Adicionar detalhes de todas as respostas se houver
    if (allAnswerDetails.length > 0) {
        description += `\n    └ ${allAnswerDetails.join('\n    └ ')}`;
    }
    description += ` - R$ ${itemTotal.toFixed(2)}`;
    return description;
}
// Função auxiliar para processar próximo produto da fila
async function processNextProductInQueue(conversation, store, from) {
    const { pendingProductsQueue = [], cartItems = [] } = conversation;
    if (pendingProductsQueue.length === 0) {
        // Sem mais produtos na fila - mostrar resumo final
        const subtotal = cartItems.reduce((total, item) => total + calculateItemTotalPrice(item), 0);
        const deliveryPrice = store.deliveryPrice || 0;
        const totalFinal = subtotal + deliveryPrice;
        const itemsSummary = cartItems.map((item) => generateItemDescription(item)).join('\n');
        await (0, conversationController_1.updateConversation)(conversation, {
            flow: 'CATEGORIES',
            pendingProductsQueue: undefined,
            currentProcessingProduct: null,
            product: null,
            currentQuestionIndex: null
        });
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: "+" + from,
            type: 'text',
            text: { body: `✅ Todos os produtos foram adicionados!\n\n🛒 **RESUMO DO PEDIDO:**\n${itemsSummary}\n\n💰 **Subtotal:** R$ ${subtotal.toFixed(2)}\n🚚 **Entrega:** R$ ${deliveryPrice.toFixed(2)}\n💵 **TOTAL:** R$ ${totalFinal.toFixed(2)}\n\n❓ **O que deseja fazer agora?**\n\n1️⃣ Adicionar mais produtos\n2️⃣ Finalizar pedido` }
        }, store.wabaEnvironments);
        return;
    }
    // Pegar próximo produto da fila
    const nextProduct = pendingProductsQueue[0];
    const remainingQueue = pendingProductsQueue.slice(1);
    const fullMenuItem = store.menu.find((item) => item.menuId === nextProduct.menuId);
    if (!fullMenuItem) {
        // Produto não encontrado - pular para o próximo
        await (0, conversationController_1.updateConversation)(conversation, {
            pendingProductsQueue: remainingQueue
        });
        await processNextProductInQueue(conversation, store, from);
        return;
    }
    if (!fullMenuItem.questions || fullMenuItem.questions.length === 0) {
        // Produto sem perguntas - adicionar direto ao carrinho
        const newCartItem = {
            id: `${nextProduct.menuId}-${Date.now()}-${Math.random()}`,
            menuId: nextProduct.menuId,
            menuName: nextProduct.menuName,
            menuDescription: fullMenuItem.menuDescription || '',
            categoryId: fullMenuItem.categoryId || 0,
            allDays: fullMenuItem.allDays || [],
            price: nextProduct.price,
            quantity: nextProduct.quantity,
            questions: []
        };
        cartItems.push(newCartItem);
        await (0, conversationController_1.updateConversation)(conversation, {
            cartItems: cartItems,
            pendingProductsQueue: remainingQueue
        });
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: "+" + from,
            type: 'text',
            text: { body: `✅ ${nextProduct.quantity}x ${nextProduct.menuName} adicionado ao pedido!` }
        }, store.wabaEnvironments);
        // Processar próximo produto
        await processNextProductInQueue({ ...conversation, cartItems, pendingProductsQueue: remainingQueue }, store, from);
        return;
    }
    // Produto com perguntas - iniciar fluxo de customização
    const firstQuestion = fullMenuItem.questions[0];
    const optionsList = firstQuestion.answers?.map((answer) => `• ${answer.answerName}${answer.price > 0 ? ` (+R$ ${answer.price.toFixed(2)})` : ''}`).join('\n') || 'Opções não disponíveis';
    await (0, conversationController_1.updateConversation)(conversation, {
        flow: 'PRODUCT_QUESTIONS',
        currentProcessingProduct: nextProduct,
        pendingProductsQueue: remainingQueue,
        product: {
            id: (0, uuid_1.v4)(),
            menuId: nextProduct.menuId,
            menuName: nextProduct.menuName,
            menuDescription: fullMenuItem.menuDescription || '',
            categoryId: fullMenuItem.categoryId || 0,
            allDays: fullMenuItem.allDays || [],
            price: nextProduct.price,
            quantity: nextProduct.quantity,
            questions: []
        },
        currentQuestionIndex: 0
    });
    await (0, messagingService_1.sendMessage)({
        messaging_product: 'whatsapp',
        to: "+" + from,
        type: 'text',
        text: { body: `🍽️ Vamos customizar: ${nextProduct.quantity}x ${nextProduct.menuName}\n\n${firstQuestion.questionName}:\n\n${optionsList}` }
    }, store.wabaEnvironments);
}
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
    try {
        // Loja Aberta
        let currentConversation = await (0, conversationController_1.getRecentConversation)(from, store._id);
        const user = await (0, userController_1.getUserByPhone)(from);
        // verifica tipo de entrega desejado
        if (currentConversation?.flow === 'WELCOME') {
            const messageIntention = await (0, messageHelper_1.classifyCustomerIntent)(message.text.body, currentConversation?.cartItems?.map(item => ({ menuId: item.menuId, menuName: item.menuName, quantity: item.quantity })));
            console.log('MESSAGE INTENTION ', messageIntention);
            console.log('**************************', messageIntention.intent);
            switch (messageIntention.intent) {
                case "greeting":
                case "other":
                case "want_menu_or_start":
                    const beautifulMenu = formatBeautifulMenu(store.menu || []);
                    // Enviar cardápio formatado para o cliente
                    if (store.wabaEnvironments) {
                        await (0, messagingService_1.sendMessage)({
                            messaging_product: 'whatsapp',
                            to: "+" + from,
                            type: 'text',
                            text: { body: `✅ Perfeito! Você escolheu **retirada na loja**.\n\n${beautifulMenu}` }
                        }, store.wabaEnvironments);
                    }
                    break;
                case "ordering_products":
                    console.log('vai ENVIAR A MENSAGEM.......do tipo de delvry');
                    // Save message in conversartions
                    await (0, conversationController_1.updateConversation)(currentConversation, {
                        lastMessage: message.text.body,
                        flow: 'DELIVERY_TYPE'
                    });
                    //Send delivery type message 
                    await (0, messagingService_1.sendMessage)({
                        messaging_product: 'whatsapp',
                        to: "+" + from,
                        type: 'text',
                        text: { body: '🚚 Seu pedido é para **entrega** ou **retirada** na loja?' }
                    }, store.wabaEnvironments);
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
        if (!currentConversation)
            return;
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
        // Atualiza a Conversation com a mensagem d 
        await (0, conversationController_1.updateConversation)(currentConversation, {
            history: `${currentConversation.history ? currentConversation.history + ' --- ' : ''} ${message?.text?.body}`
        });
        try {
            if (currentConversation?.flow === 'DELIVERY_TYPE') {
                // Processar escolha de entrega/retirada com IA
                if (!message?.text?.body) {
                    return;
                }
                const deliveryChoice = await (0, messageHelper_1.identifyDeliveryType)(message.text.body);
                console.log('Delivery type identification:', deliveryChoice);
                if (!deliveryChoice.type || deliveryChoice.confidence < 50) {
                    await (0, messagingService_1.sendMessage)({
                        messaging_product: 'whatsapp',
                        to: "+" + from,
                        type: 'text',
                        text: { body: '🚚 Por favor, me informe se seu pedido é para **entrega** ou **retirada** na loja.' }
                    }, store.wabaEnvironments);
                    return;
                }
                // Processar escolha confirmada
                if (deliveryChoice.type === 'counter') {
                    // Retirada - processar produtos da mensagem original
                    await (0, conversationController_1.updateConversation)(currentConversation, {
                        deliveryOption: 'counter',
                        flow: 'CATEGORIES'
                    });
                    if (currentConversation.lastMessage) {
                        const extractedProducts = await (0, messageHelper_1.extractProductsFromMessageWithAI)(currentConversation.lastMessage, store.menu.map(item => ({ menuId: item.menuId, menuName: item.menuName, price: item.price })));
                        if (extractedProducts?.ambiguidades?.length) {
                            const itensAmbiguos = extractedProducts.ambiguidades[0].items.map(item => `${item.menuName} - R$ ${item.price.toFixed(2)}`).join('\n');
                            extractedProducts.ambiguidades[0].refining = true;
                            await (0, conversationController_1.updateConversation)(currentConversation, {
                                flow: 'ORDER_REFINMENT',
                                refinmentItems: extractedProducts,
                            });
                            await (0, messagingService_1.sendMessage)({
                                messaging_product: 'whatsapp',
                                to: "+" + from,
                                type: 'text',
                                text: { body: `✅ **Retirada na loja confirmada!**\n\nVocê pediu ${extractedProducts.ambiguidades[0].quantity} ${extractedProducts.ambiguidades[0].palavra}, qual das opções você deseja?\n\n${itensAmbiguos}` }
                            }, store.wabaEnvironments);
                        }
                        else if (extractedProducts.items && extractedProducts.items.length > 0) {
                            const itensResolvidos = extractedProducts.items.map((item) => `${item.quantity}x ${item.menuName} - R$ ${(item.price * item.quantity).toFixed(2)}`).join('\n');
                            await (0, conversationController_1.updateConversation)(currentConversation, {
                                flow: 'ORDER_REFINMENT_CONFIRMATION',
                                refinmentItems: extractedProducts
                            });
                            await (0, messagingService_1.sendMessage)({
                                messaging_product: 'whatsapp',
                                to: "+" + from,
                                type: 'text',
                                text: { body: `✅ **Retirada na loja confirmada!**\n\nConfirmando seu pedido:\n\n${itensResolvidos}\n\nEsta correto? Posso adicionar ao seu carrinho?` }
                            }, store.wabaEnvironments);
                        }
                    }
                }
                else if (deliveryChoice.type === 'delivery') {
                    // Entrega - verificar endereço
                    await (0, conversationController_1.updateConversation)(currentConversation, {
                        deliveryOption: 'delivery',
                        flow: 'CHECK_ADDRESS'
                    });
                    const userFrom = await (0, userController_1.getUserByPhone)(from);
                    if (userFrom?.address) {
                        await (0, messagingService_1.sendMessage)({
                            messaging_product: 'whatsapp',
                            to: "+" + from,
                            type: 'text',
                            text: { body: `✅ **Entrega confirmada!**\n\n📍 **Endereço encontrado:**\n${userFrom.address.name}\n\nVocê confirma este endereço ou deseja informar outro?` }
                        }, store.wabaEnvironments);
                        await (0, conversationController_1.updateConversation)(currentConversation, { flow: 'ADDRESS_CONFIRMATION' });
                    }
                    else {
                        await (0, messagingService_1.sendMessage)({
                            messaging_product: 'whatsapp',
                            to: "+" + from,
                            type: 'text',
                            text: { body: '✅ **Entrega confirmada!**\n\n📍 Por favor, informe seu endereço completo para entrega.' }
                        }, store.wabaEnvironments);
                        await (0, conversationController_1.updateConversation)(currentConversation, { flow: 'NEW_ADDRESS' });
                    }
                }
                return;
            }
            if (currentConversation?.flow === 'CATEGORIES') {
                // Call extractProductsFromMessage directly on user's message
                if (!message?.text?.body) {
                    // TODO: handle
                    return;
                }
                // Se já tem itens no carrinho, primeiro verificar se quer finalizar ou adicionar mais
                if (currentConversation.cartItems && currentConversation.cartItems.length > 0) {
                    const customerIntent = await (0, messageHelper_1.classifyCustomerIntent)(message.text.body, currentConversation.cartItems.map(item => ({ menuId: item.menuId, menuName: item.menuName, quantity: item.quantity })));
                    console.log('Customer intent with existing cart:', customerIntent);
                    if (customerIntent.intent === 'close_order') {
                        // Cliente quer finalizar pedido - ir para seleção de pagamento
                        await (0, conversationController_1.updateConversation)(currentConversation, {
                            flow: 'SELECT_PAYMENT_METHOD'
                        });
                        await (0, messagingService_1.sendMessage)({
                            messaging_product: 'whatsapp',
                            to: "+" + from,
                            type: 'text',
                            text: { body: `💳 **Como você gostaria de pagar?**\n\n1️⃣ PIX\n2️⃣ Cartão de Crédito\n3️⃣ Pagamento na Entrega` }
                        }, store.wabaEnvironments);
                        return;
                    }
                    // Se não é para finalizar, continua o fluxo normal para adicionar mais produtos
                }
                const extractedProdutcs = await (0, messageHelper_1.extractProductsFromMessageWithAI)(message.text.body || "", store.menu.map(item => { return { menuId: item.menuId, menuName: item.menuName, price: item.price }; }));
                console.log('*********** EXTRACTED PRODUCTS ***********: ', message.text.body, store.menu.map(item => { return { menuId: item.menuId, menuName: item.menuName, price: item.price }; }), extractedProdutcs);
                if (extractedProdutcs?.ambiguidades?.length) {
                    const itensAmbiguos = extractedProdutcs.ambiguidades[0].items.map(item => `${item.menuName} - ${item.price}`).join('\n');
                    extractedProdutcs.ambiguidades[0].refining = true;
                    await (0, conversationController_1.updateConversation)(currentConversation, {
                        flow: `ORDER_REFINMENT`,
                        refinmentItems: extractedProdutcs,
                    });
                    await (0, messagingService_1.sendMessage)({
                        messaging_product: 'whatsapp',
                        to: "+" + from,
                        type: 'text',
                        text: { body: `Você pediu ${extractedProdutcs.ambiguidades[0].quantity} ${extractedProdutcs.ambiguidades[0].palavra}, qual das opções você deseja?\n\n${itensAmbiguos}` }
                    }, store.wabaEnvironments);
                }
                else if (extractedProdutcs.items && extractedProdutcs.items.length > 0) {
                    // Itens resolvidos diretamente, vamos confirmar com o cliente
                    const itensResolvidos = extractedProdutcs.items.map((item) => `${item.quantity}x ${item.menuName} - R$ ${(item.price * item.quantity).toFixed(2)}`).join('\n');
                    await (0, conversationController_1.updateConversation)(currentConversation, {
                        flow: `ORDER_REFINMENT_CONFIRMATION`,
                        refinmentItems: extractedProdutcs
                    });
                    await (0, messagingService_1.sendMessage)({
                        messaging_product: 'whatsapp',
                        to: "+" + from,
                        type: 'text',
                        text: { body: `Confirmando seu pedido:\n\n${itensResolvidos}\n\nEsta correto? Posso adicionar ao seu carrinho?` }
                    }, store.wabaEnvironments);
                }
                else {
                    // Não encontrou produtos
                    await (0, messagingService_1.sendMessage)({
                        messaging_product: 'whatsapp',
                        to: "+" + from,
                        type: 'text',
                        text: { body: `Não consegui identificar os produtos que você mencionou. Pode me dizer o nome do produto que deseja do nosso cardápio?` }
                    }, store.wabaEnvironments);
                }
                return;
            }
            // // Detectar se cliente quer finalizar o pedido
            // const finalizarPalavras = ['finalizar', 'fechar', 'concluir', 'terminar', 'so isso', 'só isso', 'ta bom', 'pronto', 'é isso'];
            // const isFinalizando = finalizarPalavras.some(palavra => (message?.text?.body || '').toLowerCase().includes(palavra));
            // if (isFinalizando && currentConversation.cartItems && currentConversation.cartItems.length > 0) {
            //   // Cliente quer finalizar o pedido
            //   const cartItems = currentConversation.cartItems;
            //   const subtotal = cartItems.reduce((total, item) => total + (item.price * item.quantity), 0);
            //   const deliveryPrice = store.deliveryPrice || 0;
            //   const totalFinal = subtotal + deliveryPrice;
            //   const itensResumo = cartItems.map((item: any) =>
            //     `• ${item.quantity}x ${item.menuName} - R$ ${(item.price * item.quantity).toFixed(2)}`
            //   ).join('\n');
            //   await sendMessage({
            //     messaging_product: 'whatsapp',
            //     to: "+" + from,
            //     type: 'text',
            //     text: { body: `📋 *Resumo do seu pedido:*\n\n${itensResumo}\n\n💰 *Subtotal: R$ ${subtotal.toFixed(2)}*\n🚚 *Taxa de entrega: R$ ${deliveryPrice.toFixed(2)}*\n💵 *TOTAL: R$ ${totalFinal.toFixed(2)}*\n\nComo você gostaria de pagar?\n\n1️⃣ PIX\n2️⃣ Cartão na Entrega\n3️⃣ Dinheiro na Entrega` }
            //   }, store.wabaEnvironments);
            //   await updateConversation(currentConversation, { flow: 'SELECT_PAYMENT_METHOD' });
            //   return;
            // }
            if (currentConversation?.flow === 'ORDER_REFINMENT') {
                const currentRefinment = currentConversation.refinmentItems?.ambiguidades?.find(item => item.refining);
                console.log('current Refinement', currentRefinment, message.text.body);
                if (!currentRefinment) {
                    await (0, messagingService_1.sendMessage)({
                        messaging_product: 'whatsapp',
                        to: "+" + from,
                        type: 'text',
                        text: { body: `Não consegui encontrar o que você está tentando resolver. Vamos recomeçar?` }
                    }, store.wabaEnvironments);
                    await (0, conversationController_1.updateConversation)(currentConversation, { flow: 'CATEGORIES' });
                    return;
                }
                console.log('DIZAAAAAAA', message.text.body || "", currentRefinment.items);
                const multipleProductsFromMessage = await (0, messageHelper_1.selectMultipleOptionsByAI)(message.text.body || "", currentRefinment.items.map(item => ({
                    menuId: item.menuId,
                    menuName: item.menuName,
                    price: item.price
                })), currentRefinment.quantity || 1);
                console.log('MULTIPLE PRODUCTS FROM MESSAGE', multipleProductsFromMessage);
                if (multipleProductsFromMessage && multipleProductsFromMessage.answers.length > 0) {
                    // Cliente escolheu produtos específicos - converter para formato esperado
                    const resolvedItems = multipleProductsFromMessage.answers.map(answer => {
                        const productDb = store.menu.find(item => item.menuId === answer.answerId);
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
                    await (0, conversationController_1.updateConversation)(currentConversation, {
                        flow: `ORDER_REFINMENT_CONFIRMATION`,
                        refinmentItems: {
                            items: allItems,
                            ambiguidades: [] // Limpar apenas as ambiguidades processadas
                        }
                    });
                    // Criar texto de confirmação para TODOS os produtos (existentes + novos)
                    const confirmationText = allItems.map(item => `${item.quantity}x ${item.menuName} - R$ ${(item.price * item.quantity).toFixed(2)}`).join('\n');
                    const totalPrice = allItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                    await (0, messagingService_1.sendMessage)({
                        messaging_product: 'whatsapp',
                        to: "+" + from,
                        type: 'text',
                        text: { body: `Você confirma a inclusão destes produtos no pedido?\n\n${confirmationText}\n\nTotal: R$ ${totalPrice.toFixed(2)}` }
                    }, store.wabaEnvironments);
                }
                else {
                    // Não reconheceu a resposta
                    const itensDisponiveis = currentRefinment.items.map(item => `${item.menuName} - R$ ${item.price.toFixed(2)}`).join('\n');
                    await (0, messagingService_1.sendMessage)({
                        messaging_product: 'whatsapp',
                        to: "+" + from,
                        type: 'text',
                        text: { body: `Não consegui entender sua escolha. Por favor, digite exatamente o nome de uma das opções:\n\n${itensDisponiveis}` }
                    }, store.wabaEnvironments);
                }
                return;
            }
            if (currentConversation?.flow === 'ORDER_REFINMENT_CONFIRMATION') {
                const itemParaConfirmar = currentConversation.refinmentItems?.items?.[0];
                if (!itemParaConfirmar) {
                    await (0, messagingService_1.sendMessage)({
                        messaging_product: 'whatsapp',
                        to: "+" + from,
                        type: 'text',
                        text: { body: `Não consegui encontrar o item para confirmar. Vamos recomeçar?` }
                    }, store.wabaEnvironments);
                    await (0, conversationController_1.updateConversation)(currentConversation, { flow: 'CATEGORIES' });
                    return;
                }
                // Verificar se cliente confirmou, rejeitou ou fez novo pedido
                const confirmationResult = await (0, messageHelper_1.interpretOrderConfirmation)(message?.text?.body || '');
                if (confirmationResult.type === 'CONFIRMED') {
                    // Cliente confirmou - criar fila de produtos para processar
                    const cartItems = currentConversation.cartItems || [];
                    // Coletar TODOS os produtos confirmados (podem ser múltiplos)
                    const allConfirmedItems = currentConversation.refinmentItems?.items || [itemParaConfirmar];
                    const remainingAmbiguities = currentConversation.refinmentItems?.ambiguidades?.filter(amb => !amb.refining) || [];
                    // Criar fila de produtos que precisam ser processados
                    const productsQueue = [...allConfirmedItems];
                    // Limpar refinement items já que vamos processar tudo na fila
                    await (0, conversationController_1.updateConversation)(currentConversation, {
                        cartItems: cartItems,
                        pendingProductsQueue: productsQueue,
                        refinmentItems: remainingAmbiguities.length > 0 ? {
                            items: [],
                            ambiguidades: remainingAmbiguities
                        } : undefined
                    });
                    // Processar o primeiro produto da fila
                    await processNextProductInQueue(currentConversation, store, from);
                }
                else {
                    // Cliente não confirmou - verificar se há mais ambiguidades pendentes
                    const remainingAmbiguidades = currentConversation.refinmentItems?.ambiguidades?.filter(amb => !amb.refining) || [];
                    if (remainingAmbiguidades.length > 0) {
                        // Ainda há ambiguidades - continuar com a próxima
                        remainingAmbiguidades[0].refining = true;
                        const itensAmbiguos = remainingAmbiguidades[0].items.map(item => `${item.menuName} - R$ ${item.price.toFixed(2)}`).join('\n');
                        await (0, conversationController_1.updateConversation)(currentConversation, {
                            flow: 'ORDER_REFINMENT',
                            refinmentItems: {
                                items: currentConversation.refinmentItems?.items || [],
                                ambiguidades: remainingAmbiguidades
                            }
                        });
                        await (0, messagingService_1.sendMessage)({
                            messaging_product: 'whatsapp',
                            to: "+" + from,
                            type: 'text',
                            text: { body: `Ok, não vou adicionar esse item. Agora preciso resolver outra dúvida: você pediu "${remainingAmbiguidades[0].palavra}". Qual dessas opções você deseja?\n\n${itensAmbiguos}` }
                        }, store.wabaEnvironments);
                    }
                    else {
                        // Sem mais ambiguidades - voltar ao fluxo normal
                        await (0, messagingService_1.sendMessage)({
                            messaging_product: 'whatsapp',
                            to: "+" + from,
                            type: 'text',
                            text: { body: `Ok, não vou adicionar esse item. O que mais você gostaria de pedir?` }
                        }, store.wabaEnvironments);
                        await (0, conversationController_1.updateConversation)(currentConversation, {
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
                    const confirmationResult = await (0, messageHelper_1.interpretOrderConfirmation)(message?.text?.body || '');
                    console.log('CONFIRMATIONREUSLT ', confirmationResult);
                    if (confirmationResult.type === 'CONFIRMED') {
                        // Cliente confirmou a resposta, prosseguir para próxima pergunta ou finalizar
                        const product = currentConversation.product;
                        const pendingAnswers = currentConversation.pendingAnswerConfirmation.selectedAnswers ||
                            [currentConversation.pendingAnswerConfirmation.selectedAnswer]; // compatibilidade
                        const questionIndex = currentConversation.pendingAnswerConfirmation.questionIndex;
                        // Encontrar o produto completo no menu
                        const fullMenuItem = store.menu.find(item => item.menuId === product.menuId);
                        if (!fullMenuItem?.questions)
                            return;
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
                            const optionsList = currentQuestionFromMenu.answers?.map((answer) => `• ${answer.answerName}${answer.price > 0 ? ` (+R$ ${answer.price.toFixed(2)})` : ''}`).join('\n') || 'Opções não disponíveis';
                            const remaining = minRequired - totalSelectedForCurrentQuestion;
                            // Remover pendingAnswerConfirmation do Firestore
                            const conversationUpdate = { ...currentConversation };
                            delete conversationUpdate.pendingAnswerConfirmation;
                            await (0, conversationController_1.updateConversation)(currentConversation, conversationUpdate);
                            await (0, messagingService_1.sendMessage)({
                                messaging_product: 'whatsapp',
                                to: "+" + from,
                                type: 'text',
                                text: { body: `✅ Perfeito! Você já escolheu ${totalSelectedForCurrentQuestion}/${minRequired}. Ainda precisa escolher mais ${remaining}:\n\n${optionsList}` }
                            }, store.wabaEnvironments);
                            return; // CRITICAL: Stop processing after asking for more selections
                        }
                        else {
                            // Atingiu o mínimo - pode ir para a próxima pergunta
                            const nextQuestionIndex = questionIndex + 1;
                            if (nextQuestionIndex < fullMenuItem.questions.length) {
                                // Há mais perguntas
                                const nextQuestion = fullMenuItem.questions[nextQuestionIndex];
                                const optionsList = nextQuestion.answers?.map((answer) => `• ${answer.answerName}${answer.price > 0 ? ` (+R$ ${answer.price.toFixed(2)})` : ''}`).join('\n') || 'Opções não disponíveis';
                                await (0, conversationController_1.updateConversation)(currentConversation, {
                                    currentQuestionIndex: nextQuestionIndex,
                                    pendingAnswerConfirmation: null // Firestore aceita null para remover campo
                                });
                                await (0, messagingService_1.sendMessage)({
                                    messaging_product: 'whatsapp',
                                    to: "+" + from,
                                    type: 'text',
                                    text: { body: `✅ Perfeito!\n\n${nextQuestion.questionName}:\n\n${optionsList}` }
                                }, store.wabaEnvironments);
                                return; // CRITICAL: Stop processing after advancing to next question
                            }
                            else {
                                // Todas as perguntas respondidas, adicionar ao carrinho
                                // Adicionar produto ao carrinho com suas customizações
                                const cartItems = currentConversation.cartItems || [];
                                // Usar item completo do menu já disponível no escopo
                                const cartItem = {
                                    ...fullMenuItem, // copia todos os campos de MenuItem
                                    id: (0, uuid_1.v4)(), // gerar ID único para o item do carrinho
                                    quantity: 1,
                                    questions: product.questions // preservar respostas customizadas
                                };
                                cartItems.push(cartItem);
                                await (0, conversationController_1.updateConversation)(currentConversation, {
                                    flow: 'CATEGORIES',
                                    product: null,
                                    currentQuestionIndex: null,
                                    pendingAnswerConfirmation: null,
                                    cartItems: cartItems
                                });
                                // Criar resumo do carrinho e perguntar próxima ação
                                const subtotal = cartItems.reduce((total, item) => total + calculateItemTotalPrice(item), 0);
                                const deliveryPrice = store.deliveryPrice || 0;
                                const totalFinal = subtotal + deliveryPrice;
                                const itemsSummary = cartItems.map((item) => generateItemDescription(item)).join('\n');
                                await (0, messagingService_1.sendMessage)({
                                    messaging_product: 'whatsapp',
                                    to: "+" + from,
                                    type: 'text',
                                    text: { body: `✅ Produto adicionado ao carrinho!\n\n🛒 **RESUMO DO PEDIDO:**\n${itemsSummary}\n\n💰 **Subtotal:** R$ ${subtotal.toFixed(2)}\n🚚 **Entrega:** R$ ${deliveryPrice.toFixed(2)}\n💵 **TOTAL:** R$ ${totalFinal.toFixed(2)}\n\n❓ **O que deseja fazer agora?**\n\n1️⃣ Adicionar mais produtos\n2️⃣ Finalizar pedido` }
                                }, store.wabaEnvironments);
                                return; // CRITICAL: Stop processing after completing all questions
                            }
                        }
                    }
                    else {
                        // Cliente não confirmou OU está dando uma nova resposta para a pergunta atual
                        const clientMessage = message?.text?.body || '';
                        const product = currentConversation.product;
                        const questionIndex = currentConversation.pendingAnswerConfirmation.questionIndex;
                        const fullMenuItem = store.menu.find(item => item.menuId === product.menuId);
                        const currentQuestion = fullMenuItem?.questions?.[questionIndex];
                        console.log('ALLLLLLLLLLLLCIONE', currentQuestion, fullMenuItem, questionIndex, product);
                        // Verificar se a mensagem é uma resposta válida para a pergunta atual (não confirmação)
                        let isNewAnswer = false;
                        if (currentQuestion?.answers) {
                            const availableAnswers = currentQuestion.answers.map(ans => ({
                                menuId: ans.answerId,
                                menuName: ans.answerName,
                                price: ans.price
                            }));
                            const multipleAnswerMatch = await (0, messageHelper_1.selectMultipleOptionsByAI)(clientMessage, availableAnswers, currentQuestion.minAnswerRequired || 1);
                            if (multipleAnswerMatch && multipleAnswerMatch.answers.length > 0) {
                                isNewAnswer = true;
                                console.log('🔄 Cliente deu nova(s) resposta(s) em vez de confirmar. Processando como nova resposta.');
                                // Limpar pendingAnswerConfirmation e processar como nova resposta
                                await (0, conversationController_1.updateConversation)(currentConversation, {
                                    pendingAnswerConfirmation: null
                                });
                                // Não fazer return aqui - deixar o código continuar para processar a resposta
                            }
                        }
                        if (!isNewAnswer && currentQuestion) {
                            // Realmente rejeitou - pedir para escolher novamente
                            const optionsList = currentQuestion.answers?.map((answer) => `• ${answer.answerName}${answer.price > 0 ? ` (+R$ ${answer.price.toFixed(2)})` : ''}`).join('\n') || 'Opções não disponíveis';
                            await (0, conversationController_1.updateConversation)(currentConversation, {
                                pendingAnswerConfirmation: null,
                                currentQuestionIndex: questionIndex // Manter o índice correto da pergunta atual
                            });
                            await (0, messagingService_1.sendMessage)({
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
                    await (0, messagingService_1.sendMessage)({
                        messaging_product: 'whatsapp',
                        to: "+" + from,
                        type: 'text',
                        text: { body: 'Erro interno. Vamos recomeçar o pedido.' }
                    }, store.wabaEnvironments);
                    await (0, conversationController_1.updateConversation)(currentConversation, { flow: 'CATEGORIES' });
                    return;
                }
                // Encontrar o produto completo no menu
                const fullMenuItem = store.menu.find(item => item.menuId === product.menuId);
                if (!fullMenuItem?.questions || currentQuestionIndex >= fullMenuItem.questions.length) {
                    console.error('Question não encontrada ou índice inválido');
                    await (0, conversationController_1.updateConversation)(currentConversation, { flow: 'CATEGORIES' });
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
                    const multipleSelection = await (0, messageHelper_1.selectMultipleOptionsByAI)(clientMessage, availableAnswers.map(ans => ({
                        menuId: ans.answerId,
                        menuName: ans.answerName,
                        price: ans.price
                    })), currentQuestion.minAnswerRequired || 1);
                    console.log('🎯 Múltiplas respostas selecionadas:', multipleSelection);
                    if (!multipleSelection || multipleSelection.answers.length === 0) {
                        // Não conseguiu extrair nenhuma resposta válida
                        const optionsList = currentQuestion.answers?.map((answer) => `• ${answer.answerName}${answer.price > 0 ? ` (+R$ ${answer.price.toFixed(2)})` : ''}`).join('\n') || 'Opções não disponíveis';
                        await (0, messagingService_1.sendMessage)({
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
                        await (0, messagingService_1.sendMessage)({
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
                            await (0, messagingService_1.sendMessage)({
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
                    }
                    else {
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
                    await (0, conversationController_1.updateConversation)(currentConversation, {
                        product: updatedProduct
                    });
                    // Aplicar lógica diretamente - avançar para próxima pergunta ou finalizar
                    const totalSelectedForCurrentQuestion = updatedQuestions.find(q => q.questionId === currentQuestion.questionId)?.answers?.reduce((sum, answer) => sum + (answer.quantity || 0), 0) || 0;
                    const minRequired = currentQuestion.minAnswerRequired || 0;
                    if (totalSelectedForCurrentQuestion < minRequired) {
                        // Ainda não atingiu o mínimo - pedir mais seleções
                        const remaining = minRequired - totalSelectedForCurrentQuestion;
                        const optionsList = currentQuestion.answers?.map((answer) => `• ${answer.answerName}${answer.price > 0 ? ` (+R$ ${answer.price.toFixed(2)})` : ''}`).join('\n') || 'Opções não disponíveis';
                        await (0, messagingService_1.sendMessage)({
                            messaging_product: 'whatsapp',
                            to: "+" + from,
                            type: 'text',
                            text: { body: `✅ Perfeito! Você já escolheu ${totalSelectedForCurrentQuestion}/${minRequired}. Ainda precisa escolher mais ${remaining}:\n\n${optionsList}` }
                        }, store.wabaEnvironments);
                    }
                    else {
                        // Atingiu o mínimo - avançar para próxima pergunta
                        const nextQuestionIndex = currentQuestionIndex + 1;
                        if (nextQuestionIndex < fullMenuItem.questions.length) {
                            // Há mais perguntas
                            const nextQuestion = fullMenuItem.questions[nextQuestionIndex];
                            const optionsList = nextQuestion.answers?.map((answer) => `• ${answer.answerName}${answer.price > 0 ? ` (+R$ ${answer.price.toFixed(2)})` : ''}`).join('\n') || 'Opções não disponíveis';
                            await (0, conversationController_1.updateConversation)(currentConversation, {
                                currentQuestionIndex: nextQuestionIndex
                            });
                            await (0, messagingService_1.sendMessage)({
                                messaging_product: 'whatsapp',
                                to: "+" + from,
                                type: 'text',
                                text: { body: `✅ Perfeito!\n\n${nextQuestion.questionName}:\n\n${optionsList}` }
                            }, store.wabaEnvironments);
                        }
                        else {
                            // Todas as perguntas respondidas - adicionar ao carrinho
                            const cartItems = currentConversation.cartItems || [];
                            const cartItem = {
                                ...fullMenuItem,
                                id: (0, uuid_1.v4)(),
                                quantity: currentConversation.currentProcessingProduct?.quantity || 1,
                                questions: updatedProduct.questions
                            };
                            cartItems.push(cartItem);
                            // Atualizar conversation para remover produto atual da fila
                            await (0, conversationController_1.updateConversation)(currentConversation, {
                                cartItems: cartItems,
                                currentProcessingProduct: null,
                                product: null,
                                currentQuestionIndex: null
                            });
                            await (0, messagingService_1.sendMessage)({
                                messaging_product: 'whatsapp',
                                to: "+" + from,
                                type: 'text',
                                text: { body: `✅ ${cartItem.quantity}x ${cartItem.menuName} adicionado ao pedido!` }
                            }, store.wabaEnvironments);
                            // Processar próximo produto da fila
                            await processNextProductInQueue({ ...currentConversation, cartItems }, store, from);
                        }
                    }
                }
                catch (error) {
                    console.error('❌ Erro ao processar resposta da question:', error);
                    await (0, messagingService_1.sendMessage)({
                        messaging_product: 'whatsapp',
                        to: "+" + from,
                        type: 'text',
                        text: { body: 'Não consegui processar sua resposta. Pode tentar novamente?' }
                    }, store.wabaEnvironments);
                }
                return;
            }
            if (currentConversation?.flow === 'SELECT_PAYMENT_METHOD') {
                const paymentIdentification = await (0, messageHelper_1.identifyPaymentMethod)(message?.text?.body || '');
                console.log('Payment identification result:', paymentIdentification);
                if (!paymentIdentification.method || paymentIdentification.confidence < 50) {
                    await (0, messagingService_1.sendMessage)({
                        messaging_product: 'whatsapp',
                        to: "+" + from,
                        type: 'text',
                        text: { body: `Por favor, escolha uma das opções de pagamento:\n\n1️⃣ PIX\n2️⃣ Cartão de Crédito\n3️⃣ Pagamento na Entrega` }
                    }, store.wabaEnvironments);
                    return;
                }
                const paymentMethod = paymentIdentification.method;
                // Criar o pedido
                console.log('VAI CRIAR A ORDER', currentConversation.docId, JSON.stringify(currentConversation.cartItems));
                const cartItems = currentConversation.cartItems || [];
                const subtotal = cartItems.reduce((total, item) => total + calculateItemTotalPrice(item), 0);
                const deliveryPrice = store.deliveryPrice || 0;
                const totalFinal = subtotal + deliveryPrice;
                const itemsSummary = cartItems.map((item) => generateItemDescription(item)).join('\n') || 'Itens não especificados';
                const deliveryAddress = user?.address ?
                    `${user.address.street}, ${user.address.number} - ${user.address.neighborhood}` :
                    'Endereço não informado';
                const customerName = currentConversation.customerName || user?.name || 'Cliente não identificado';
                // Traduzir método de pagamento para exibição
                const paymentDisplayName = paymentMethod === 'PIX' ? 'PIX' :
                    paymentMethod === 'CREDIT_CARD' ? 'Cartão na Entrega' :
                        'Dinheiro na Entrega';
                const newOrder = await (0, ordersController_1.createOrder)({
                    ...currentConversation,
                    cartItems: cartItems,
                    totalPrice: subtotal,
                    phoneNumber: from,
                    paymentMethod: paymentMethod,
                    address: user?.address || {
                        name: 'Endereço não informado',
                        main: true, neighborhood: '', number: '', zipCode: '', street: ''
                    }
                }, store._id);
                // Atualizar endereço do usuário se necessário
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
                        await (0, userController_1.updateUserAddress)(from, updatedAddress);
                        console.log('Endereço do usuário atualizado após pedido:', updatedAddress.name);
                    }
                }
                // Deletar conversa
                if (currentConversation.docId) {
                    await (0, conversationController_1.deleteConversation)(currentConversation.docId);
                }
                console.log('New order has been created', newOrder);
                // Mensagem para a loja
                const detailedStoreMessage = `🔔 *NOVO PEDIDO - AGUARDANDO CONFIRMAÇÃO*\n\n` +
                    `📋 *Pedido:* #${newOrder.id}\n` +
                    `👤 *Cliente:* ${customerName}\n` +
                    `📱 *Telefone:* ${from}\n` +
                    `📍 *Endereço:* ${deliveryAddress}\n\n` +
                    `🛒 *Itens:*\n${itemsSummary}\n\n` +
                    `💰 *Subtotal:* R$ ${subtotal.toFixed(2)}\n` +
                    `🚚 *Entrega:* R$ ${deliveryPrice.toFixed(2)}\n` +
                    `💵 *TOTAL:* R$ ${totalFinal.toFixed(2)}\n\n` +
                    `💳 *Pagamento:* ${paymentDisplayName}\n\n` +
                    `⚡ *AÇÃO NECESSÁRIA:* Confirme ou rejeite este pedido no sistema!`;
                await (0, messagingService_1.sendMessage)({
                    messaging_product: 'whatsapp',
                    to: store.whatsappNumber,
                    type: 'text',
                    text: { body: detailedStoreMessage }
                }, store.wabaEnvironments);
                // Mensagem para o cliente
                const customerMessage = `✅ *Pedido Confirmado!*\n\n` +
                    `📋 *Número do Pedido:* #${newOrder.id}\n` +
                    `🛒 *Resumo:*\n${itemsSummary}\n\n` +
                    `💰 *Subtotal:* R$ ${subtotal.toFixed(2)}\n` +
                    `🚚 *Entrega:* R$ ${deliveryPrice.toFixed(2)}\n` +
                    `💵 *TOTAL:* R$ ${totalFinal.toFixed(2)}\n\n` +
                    `💳 *Pagamento:* ${paymentDisplayName}\n` +
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
            }
            // await updateConversation(currentConversation, {
            //   history: `${currentConversation.history ? currentConversation.history + ' --- ' : ''} ${content.message}`
            // });
            // const content = parseAIResponse((intent as any).message?.content)
            // console.log('INTENTION CONTENT', JSON.stringify(content))
            // Update history conversation
            // if (typeof content === 'object') {
            //   switch (content.action) {
            //     case 'ADDING_ITEMS':
            //       console.log('Adding items to cart', content.items);
            //       // Adicionar os novos itens ao pedido DA CONVERSA
            //       if (content.items && content.items.length > 0) {
            //         // Garantir que cartItems existe
            //         if (!currentConversation.cartItems) {
            //           currentConversation.cartItems = [];
            //         }
            //         content.items.forEach((product: ShoppingCartItem) => {
            //           const cartItem = {
            //             id: `${product.menuId}-${Date.now()}-${Math.random()}`,
            //             menuId: product.menuId || 0,
            //             menuName: product.menuName || '',
            //             price: product.price || 0,
            //             questions: product.questions || [],
            //             quantity: product.quantity || 1
            //           };
            //           console.log('Adding item to cart:', JSON.stringify(cartItem));
            //           if (currentConversation && currentConversation.cartItems) {
            //             currentConversation.cartItems.push(cartItem as ShoppingCartItem);
            //           }
            //         });
            //         // Atualizar conversa com pedido DA CONVERSA atualizado
            //         await updateConversation(currentConversation, {
            //           cartItems: currentConversation.cartItems || []
            //         });
            //       }
            //       break;
            //     case 'ENDING_ORDER':
            //       console.log('ENDING_ORDER - Perguntando forma de pagamento');
            //       break;
            //     case 'PAYMENT_METHOD':
            //       console.log('PAYMENT_METHOD - Criando pedido');
            //       console.log('VAI CRIAR A ORDER', currentConversation.docId, JSON.stringify(currentConversation.cartItems))
            //       // Validar e corrigir preços consultando store.menu ANTES de criar o pedido
            //       const cartItems = currentConversation.cartItems || [];
            //       let subtotal = 0;
            //       const validatedCartItems = cartItems.map((item: any) => {
            //         // Encontrar o produto no cardápio da loja
            //         const menuItem = store.menu.find(menuProduct => menuProduct.menuId === item.menuId);
            //         if (!menuItem) {
            //           console.error(`Produto não encontrado no cardápio: ${item.menuId}`);
            //           return item; // Manter item original se não encontrar
            //         }
            //         // Começar com o preço base do produto
            //         let itemPrice = menuItem.price;
            //         console.log(`Produto ${menuItem.menuName} - Preço base: R$ ${itemPrice.toFixed(2)}`);
            //         // Validar e calcular preços das respostas (questions/answers)
            //         const validatedQuestions = (item.questions || []).map((question: any) => {
            //           // Encontrar a question no cardápio
            //           const menuQuestion = menuItem.questions?.find(q => q.questionId === question.questionId);
            //           if (!menuQuestion) {
            //             console.error(`Question não encontrada: ${question.questionId}`);
            //             return question;
            //           }
            //           const validatedAnswers = (question.answers || []).map((answer: any) => {
            //             // Encontrar a resposta no cardápio
            //             const menuAnswer = menuQuestion.answers?.find(a => a.answerId === answer.answerId);
            //             if (!menuAnswer) {
            //               console.error(`Answer não encontrada: ${answer.answerId}`);
            //               return answer;
            //             }
            //             // Usar o preço correto do cardápio
            //             const answerPrice = menuAnswer.price || 0;
            //             const answerQuantity = answer.quantity || 1;
            //             const answerTotalPrice = answerPrice * answerQuantity;
            //             itemPrice += answerTotalPrice;
            //             console.log(`  - ${menuAnswer.answerName} (${answerQuantity}x): +R$ ${answerTotalPrice.toFixed(2)}`);
            //             return {
            //               ...answer,
            //               answerName: menuAnswer.answerName,
            //               price: answerPrice
            //             };
            //           });
            //           return {
            //             ...question,
            //             questionName: menuQuestion.questionName,
            //             answers: validatedAnswers
            //           };
            //         });
            //         // Calcular preço total do item (preço base + adicionais) * quantidade
            //         const finalItemPrice = itemPrice * (item.quantity || 1);
            //         subtotal += finalItemPrice;
            //         console.log(`Produto ${menuItem.menuName} - Preço final: R$ ${finalItemPrice.toFixed(2)}`);
            //         return {
            //           ...item,
            //           menuName: menuItem.menuName,
            //           price: itemPrice, // Preço unitário (base + adicionais)
            //           questions: validatedQuestions
            //         };
            //       });
            //       const itemsSummary = validatedCartItems.map((item: any) =>
            //         `• ${item.quantity}x ${item.menuName} - R$ ${(item.price * item.quantity).toFixed(2)}`
            //       ).join('\n') || 'Itens não especificados';
            //       // Calcular entrega e total final
            //       const deliveryPrice = store.deliveryPrice || 0;
            //       const totalFinal = subtotal + deliveryPrice;
            //       const totalValue = `\n💰 *Subtotal: R$ ${subtotal.toFixed(2)}*\n🚚 *Entrega: R$ ${deliveryPrice.toFixed(2)}*\n💰 *TOTAL: R$ ${totalFinal.toFixed(2)}*`;
            //       const deliveryAddress = user?.address ?
            //         `${user.address.street}, ${user.address.number} - ${user.address.neighborhood}` :
            //         'Endereço não informado';
            //       const customerName = currentConversation.customerName || 'Cliente não identificado';
            //       const newOrder = await createOrder({
            //         ...currentConversation,
            //         cartItems: validatedCartItems, // Usar itens com preços validados
            //         totalPrice: subtotal, // Usar subtotal calculado corretamente
            //         phoneNumber: from,
            //         address: user?.address || {
            //           name: 'Rua Jose Roberto Messias, 160 - Residencial Ville de France 3',
            //           main: true, neighborhood: '', number: '10', zipCode: '', street: ''
            //         }
            //       }, '111');
            //       // Atualizar endereço do usuário com o endereço usado no pedido
            //       if (currentConversation.address && currentConversation.address.placeId) {
            //         const addressFromCache = addressCache[currentConversation.address.placeId];
            //         if (addressFromCache) {
            //           const updatedAddress: Address = {
            //             name: addressFromCache.description,
            //             lat: addressFromCache.lat,
            //             lng: addressFromCache.lng,
            //             main: true,
            //             street: addressFromCache.street || '',
            //             number: addressFromCache.number || '',
            //             neighborhood: addressFromCache.neighborhood || '',
            //             city: addressFromCache.city || '',
            //             state: addressFromCache.state || '',
            //             zipCode: addressFromCache.zipCode || ''
            //           };
            //           // Atualizar endereço do usuário
            //           await updateUserAddress(from, updatedAddress);
            //           console.log('Endereço do usuário atualizado após pedido:', updatedAddress.name);
            //         }
            //       }
            //       if (currentConversation.docId) {
            //         await deleteConversation(currentConversation.docId)
            //       }
            //       currentConversation = undefined;
            //       console.log('New order has been created', newOrder);
            //       // await sendMessage({
            //       //   messaging_product: 'whatsapp',
            //       //   to: "+" + from,
            //       //   type: 'text',
            //       //   text: { body: 'Obrigado pela confiança, Estamos preparando etc e tal' }
            //       // }, store.wabaEnvironments);
            //       const detailedStoreMessage = `🔔 *NOVO PEDIDO - AGUARDANDO CONFIRMAÇÃO*\n\n` +
            //         `📋 *Pedido:* #${newOrder.id}\n` +
            //         `👤 *Cliente:* ${customerName}\n` +
            //         `📱 *Telefone:* ${from}\n` +
            //         `📍 *Endereço:* ${deliveryAddress}\n\n` +
            //         `🛒 *Itens:*\n${itemsSummary}${totalValue}\n\n` +
            //         `⚡ *AÇÃO NECESSÁRIA:* Confirme ou rejeite este pedido no sistema!`;
            //       await sendMessage({
            //         messaging_product: 'whatsapp',
            //         to: store.whatsappNumber,
            //         type: 'text',
            //         text: { body: detailedStoreMessage }
            //       }, store.wabaEnvironments);
            //       const customerMessage = `✅ *Pedido Confirmado!*\n\n` +
            //         `📋 *Número do Pedido:* #${newOrder.id}\n` +
            //         `🛒 *Resumo:*\n${itemsSummary}${totalValue}\n\n` +
            //         `📍 *Endereço de Entrega:* ${deliveryAddress}\n\n` +
            //         `⏰ *Status:* Aguardando confirmação da loja\n` +
            //         `🚛 *Estimativa:* Você será notificado quando o pedido for confirmado!\n\n` +
            //         `Obrigado pela preferência! 😊`;
            //       await sendMessage({
            //         messaging_product: 'whatsapp',
            //         to: "+" + from,
            //         type: 'text',
            //         text: { body: customerMessage }
            //       }, store.wabaEnvironments);
            //       return;
            //     default:
            //       break
            //   }
            // }
            // // Tratamento de erro
            // if (content.action === 'error') {
            //   console.error('IA retornou erro:', content.message);
            //   await sendMessage({
            //     messaging_product: 'whatsapp',
            //     to: "+" + from,
            //     type: 'text',
            //     text: { body: 'Desculpe, ocorreu um erro. Vamos recomeçar. Digite "cardápio" para ver nossos produtos.' }
            //   }, store.wabaEnvironments);
            //   return;
            // }
            // await sendMessage({
            //   messaging_product: 'whatsapp',
            //   to: "+" + from,
            //   type: 'text',
            //   text: { body: content.message }
            // }, store.wabaEnvironments);
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
  `;
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

  ### 🛑 REGRA CRÍTICA ZERADA: SOMA DE QUANTIDADES OBRIGATÓRIA

  SEMPRE some as quantidades mencionadas pelo cliente para preencher o requisito de 'minAnswerRequired' de uma pergunta.

  **A soma total de 'quantity' de todas as respostas (answers) deve ser exatamente igual a 'minAnswerRequired' para prosseguir.**

  * ✅ **CORRETO (Soma):** Cliente diz "2 pernil e 1 filé" para "Escolha 3 carnes" -> Total = 3 carnes. (2 + 1 = 3)
  * ❌ **ERRADO (Tipos):** Contar apenas 2 (dois tipos de carne).

  ### ⚙️ ESTRUTURA DO CARDÁPIO (INPUT)

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
