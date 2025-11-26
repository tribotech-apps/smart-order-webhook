"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendDeliveredMessage = exports.sendDeliveryMessage = exports.sendConfirmationMessage = exports.validateFlowAndHandleMessage = exports.processQuestionResponse = exports.sendQuestion = exports.hasStreetNumber = exports.deleteImageFromWABA = exports.uploadImageFromUrlToWABA = exports.sendAddressListResponse = exports.sendWaitForGoogleResponse = exports.sendNewAddressMessage = exports.sendAddressConfirmation = exports.sendWelcomeMessage = exports.sendMessage = void 0;
exports.sendCategoriesMessage = sendCategoriesMessage;
exports.sendProductCard = sendProductCard;
exports.sendProductsWithPagination = sendProductsWithPagination;
exports.getProductsByCategory = getProductsByCategory;
exports.filterProductsByKeyword = filterProductsByKeyword;
exports.processGooglePredictions = processGooglePredictions;
exports.handleProductSelection = handleProductSelection;
exports.handleProductQuantity = handleProductQuantity;
exports.handleProductQuestions = handleProductQuestions;
exports.redirectToOrderSummary = redirectToOrderSummary;
exports.sendCartItemsListResponse = sendCartItemsListResponse;
exports.processCheckboxResponse = processCheckboxResponse;
exports.sendCheckboxQuestion = sendCheckboxQuestion;
const axios_1 = __importDefault(require("axios"));
const axios_2 = require("axios");
const form_data_1 = __importDefault(require("form-data"));
const conversationController_1 = require("../controllers/conversationController");
const google_maps_services_js_1 = require("@googlemaps/google-maps-services-js");
const storeController_1 = require("../controllers/storeController");
const client = new google_maps_services_js_1.Client({});
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
const sendMessage = async (data) => {
    const url = `https://graph.facebook.com/${process.env.WABA_VERSION}/${process.env.WABA_PHONE_NUMBER_ID}/messages`;
    // Criar os cabeçalhos corretamente
    const headers = new axios_2.AxiosHeaders();
    headers.set('Authorization', `Bearer ${process.env.WABA_ACCESS_TOKEN}`);
    headers.set('Content-Type', 'application/json');
    // console.log('Enviando mensagem para o WABA...', url, JSON.stringify(data), headers);
    const response = await axios_1.default.post(url, data, { headers });
    return response.data;
};
exports.sendMessage = sendMessage;
const sendWelcomeMessage = async (phoneNumber, name, imageId) => {
    // console.log('Enviando mensagem de boas-vindas...');
    // console.log('Número de telefone:', phoneNumber);
    // console.log('Nome:', name);
    // console.log('ID da imagem:', imageId);
    const messagePayload = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'interactive',
        interactive: {
            type: 'button',
            header: {
                type: 'image',
                image: {
                    id: imageId
                }
            },
            body: {
                text: `Olá ${name}. Agradecemos a sua visita. O que gostaria de fazer?`
            },
            action: {
                buttons: [
                    {
                        type: 'reply',
                        reply: {
                            id: 'buy_whatsapp',
                            title: 'Fazer um Pedido'
                        }
                    },
                    {
                        type: 'reply',
                        reply: {
                            id: 'view_catalog',
                            title: 'Comprar pelo Site'
                        }
                    },
                    {
                        type: 'reply',
                        reply: {
                            id: 'call_store',
                            title: 'Falar com a Loja'
                        }
                    }
                ]
            }
        }
    };
    await (0, exports.sendMessage)(messagePayload);
};
exports.sendWelcomeMessage = sendWelcomeMessage;
const sendAddressConfirmation = async (phoneNumber, name, address) => {
    // console.log('Enviando mensagem para confirmacao do endereco...');
    // console.log('Número de telefone:', phoneNumber);
    // console.log('Endereco:', address);
    const messagePayload = {
        messaging_product: 'whatsapp',
        to: '+' + phoneNumber,
        type: 'interactive',
        interactive: {
            type: 'button',
            body: {
                text: `Olá ${name}, o endereço ${address} está correto?`
            },
            action: {
                buttons: [
                    {
                        type: 'reply',
                        reply: {
                            id: 'current_address',
                            title: 'Usar este endereço'
                        }
                    },
                    {
                        type: 'reply',
                        reply: {
                            id: 'inform_other_address',
                            title: 'Informar outro'
                        }
                    },
                ]
            }
        }
    };
    try {
        await (0, exports.sendMessage)(messagePayload);
    }
    catch (error) {
        // console.error('Erro ao enviar mensagem:', error.response?.data || error.message);
        // TODO: handle error
        throw (error);
    }
};
exports.sendAddressConfirmation = sendAddressConfirmation;
const sendNewAddressMessage = async (phoneNumber) => {
    // console.log('Enviando mensagem para informacao do novo endereco...');
    // console.log('Número de telefone:', phoneNumber);
    const messagePayload = {
        messaging_product: 'whatsapp',
        to: '+' + phoneNumber,
        type: 'text',
        text: {
            body: 'Por favor, informe seu endereço completo de entrega.'
        }
    };
    await (0, exports.sendMessage)(messagePayload);
};
exports.sendNewAddressMessage = sendNewAddressMessage;
const sendWaitForGoogleResponse = async (phoneNumber) => {
    // console.log('Enviando mensagem para informacao para aguardar pesquisa endereco ...');
    const messagePayload = {
        messaging_product: 'whatsapp',
        to: '+' + phoneNumber,
        type: 'text',
        text: {
            body: 'Efetuando a pesquisa do endereço...'
        }
    };
    // console.log('Número de telefone:', phoneNumber);
    // console.log('Payload da mensagem:', messagePayload);
    await (0, exports.sendMessage)(messagePayload);
};
exports.sendWaitForGoogleResponse = sendWaitForGoogleResponse;
const sendAddressListResponse = async (phoneNumber, addresses) => {
    // console.log('Enviando mensagem com os endereços...');
    // console.log('Número de telefone:', phoneNumber);
    // console.log('Endereços --->', addresses);
    // Garantir que não há mais que 10 endereços
    const limitedAddresses = addresses?.slice(0, 10) || [];
    // console.log('Endereços limitados:', JSON.stringify(limitedAddresses));
    // Criar lista de itens numerados
    const listItems = limitedAddresses.map((address) => ({
        id: address.id?.slice(0, 200), // Id único para cada item
        title: address.title === 'Endereço não está na lista' ? 'Nenhuma das opções' : `Endereço:`, // Limitando cada título a 24 caracteres
        description: address.description.slice(0, 50), // Limitar descrição a 80 caracteres, se necessário
    }));
    // Criar o payload para a mensagem de lista interativa
    const messagePayload = {
        messaging_product: 'whatsapp',
        to: '+' + phoneNumber,
        type: 'interactive',
        interactive: {
            type: 'list',
            body: {
                text: `Encontramos os seguintes endereços para você. Por favor, informe o número correspondente ao endereço desejado:`
            },
            action: {
                button: "Endereços",
                sections: [
                    {
                        title: 'Escolha um endereço',
                        rows: listItems,
                    },
                ],
            },
        },
    };
    // console.log('Payload da mensagem da lista:', messagePayload);
    try {
        await (0, exports.sendMessage)(messagePayload);
    }
    catch (error) {
        // console.error('Erro ao enviar mensagem:', error.response?.data || error.message);
    }
};
exports.sendAddressListResponse = sendAddressListResponse;
const uploadImageFromUrlToWABA = async (imageUrl) => {
    const url = `https://graph.facebook.com/${process.env.WABA_VERSION}/${process.env.WABA_PHONE_NUMBER_ID}/media`;
    try {
        // Faz o download da imagem como um buffer
        const imageResponse = await axios_1.default.get(imageUrl, { responseType: 'arraybuffer' });
        // Cria um formulário com a imagem
        const formData = new form_data_1.default();
        formData.append('file', Buffer.from(imageResponse.data), {
            filename: 'image.jpg',
            contentType: imageResponse.headers['content-type'] || 'image/jpeg',
        });
        formData.append('type', 'image/jpeg'); // Tipo de mídia
        formData.append('messaging_product', 'whatsapp'); // Produto de mensagens
        formData.append('type', 'image/jpeg'); // Tipo de arquivo
        // Faz a requisição para o WABA
        const response = await axios_1.default.post(url, formData, {
            headers: {
                Authorization: `Bearer ${process.env.WABA_ACCESS_TOKEN}`,
                ...formData.getHeaders(), // Inclui os cabeçalhos do FormData
            },
        });
        const mediaId = response.data.id;
        // console.log('Imagem enviada com sucesso. ID da mídia:', mediaId);
        return mediaId;
    }
    catch (error) {
        // console.error('Erro ao enviar imagem ao WABA:', error.response?.data || error.message);
        throw new Error('Erro ao enviar imagem ao WABA');
    }
};
exports.uploadImageFromUrlToWABA = uploadImageFromUrlToWABA;
const deleteImageFromWABA = async (mediaId) => {
    const url = `https://graph.facebook.com/${process.env.WABA_VERSION}/${mediaId}`;
    try {
        const response = await axios_1.default.delete(url, {
            headers: {
                Authorization: `Bearer ${process.env.WABA_ACCESS_TOKEN}`,
            },
        });
        // console.log('Imagem deletada com sucesso. Resposta:', response.data);
    }
    catch (error) {
        // console.error('Erro ao deletar imagem do WABA:', error.response?.data || error.message);
        throw new Error('Erro ao deletar imagem do WABA');
    }
};
exports.deleteImageFromWABA = deleteImageFromWABA;
async function sendCategoriesMessage(to, categories, menu) {
    const today = new Date().getDay() + 1; // Dias da semana no formato 1 (domingo) a 7 (sábado)
    // Filtrar categorias que possuem produtos disponíveis hoje
    const filteredCategories = categories.filter((category) => {
        const productsInCategory = menu.filter((product) => {
            if (product.categoryId !== category.categoryId)
                return false;
            // Verificar se o produto está disponível todos os dias ou no dia atual
            if (!product.allDays && product.weekdays && !product.weekdays.includes(today)) {
                return false;
            }
            return true;
        });
        // console.log(`Produtos disponíveis na categoria "${category.categoryName}":`, productsInCategory);
        return productsInCategory.length > 0; // Retorna apenas categorias com produtos disponíveis
    });
    // console.log('Categorias filtradas:', filteredCategories);
    // Verificar se há categorias disponíveis
    if (filteredCategories.length === 0) {
        await (0, exports.sendMessage)({
            messaging_product: 'whatsapp',
            to: "+" + to,
            type: 'text',
            text: {
                body: 'Desculpe, não há categorias disponíveis no momento.',
            },
        });
        return;
    }
    // Criar a lista de categorias para enviar
    const categoryRows = filteredCategories.map((category) => ({
        id: category.categoryId.toString(),
        title: category.categoryName,
    }));
    // Enviar a lista de categorias
    // Criar o texto do corpo da mensagem
    // caso ja exista item no carrinho, devemos acrescentar o texto 'A qualquer momento você pode: 
    // - Ver o menu de categorias - digite 'menu'  
    // - Finalizar a compra - digite 'comta'
    const bodyText = `Selecione uma categoria para ver os produtos disponíveis. '\n\nA qualquer momento você pode: \n- Digitar "conta" para receber o resumo e finalizar o pedido.`;
    await (0, exports.sendMessage)({
        messaging_product: 'whatsapp',
        to: "+" + to,
        type: 'interactive',
        interactive: {
            type: 'list',
            header: {
                type: 'text',
                text: 'Selecionar Categorias',
            },
            body: {
                text: bodyText,
            },
            action: {
                button: 'Selecionar',
                sections: [
                    {
                        title: 'Categorias',
                        rows: categoryRows,
                    },
                ],
            },
        },
    });
}
async function sendProductCard(to, product) {
    const bodyText = `${product.menuDescription}\n\nPreço: R$ ${product.price.toFixed(2)}`;
    try {
        await (0, exports.sendMessage)({
            messaging_product: 'whatsapp',
            to: "+" + to,
            type: 'interactive',
            interactive: {
                type: 'button',
                header: {
                    type: 'image',
                    image: {
                        id: product.menuImageWABAId, // ID da imagem no WABA
                    },
                },
                body: {
                    text: bodyText, // Descrição do produto e preço
                },
                footer: {
                    text: 'Clique em Comprar para adicionar ao carrinho:', // Rodapé ajustado para múltiplas opções
                },
                action: {
                    buttons: [
                        {
                            type: 'reply',
                            reply: {
                                id: `product_${product.menuId}`, // ID único do produto
                                title: 'Comprar', // Nome do botão
                            },
                        },
                    ],
                },
            },
        });
        // console.log(`Mensagem enviada com sucesso para ${to} com o produto ${product.menuName}`);
    }
    catch (error) {
        if (error.response?.data?.error?.code === 131056) {
            // console.warn('Rate limit atingido. Tentando novamente após 1 segundo...');
            await delay(1000); // Aguardar 1 segundo antes de tentar novamente
            return sendProductCard(to, product); // Tentar novamente
        }
        // console.error('Erro ao enviar o card do produto:', error.response?.data || error.message);
        throw new Error('Erro ao enviar o card do produto.');
    }
}
async function sendProductsWithPagination(to, products, currentPage = 1) {
    const itemsPerPage = 5; // Número de produtos por página
    const totalPages = Math.ceil(products.length / itemsPerPage);
    // Garantir que a página atual esteja dentro dos limites
    if (currentPage < 1)
        currentPage = 1;
    if (currentPage > totalPages)
        currentPage = totalPages;
    // Calcular os índices de início e fim para os produtos da página atual
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const productsOnPage = products.slice(startIndex, endIndex);
    // console.log(`Enviando produtos de ${startIndex + 1} a ${Math.min(endIndex, products.length)}`);
    // Enviar os produtos da página atual com atraso
    for (const product of productsOnPage) {
        try {
            await sendProductCard(to, product);
            // verficar se for o ultimo item,nao enviar a mensagem
            if (product !== productsOnPage[productsOnPage.length - 1]) {
                await (0, exports.sendMessage)({
                    messaging_product: 'whatsapp',
                    to: "+" + to,
                    type: 'text',
                    text: {
                        body: 'Enviando o próximo produto...\n',
                    },
                });
                await delay(500); // Adicionar um atraso de 500ms entre cada mensagem
            }
        }
        catch (error) {
            // console.error('Erro ao enviar o card do produto:', error.response?.data || error.message);
            throw error;
        }
    }
    const message = startIndex + 1 !== Math.min(endIndex, products.length) ?
        `Exibindo ${startIndex + 1}-${Math.min(endIndex, products.length)} de ${products.length} produtos.` :
        'Não há mais produtos para exibir nesta categoria.';
    // Criar botões de navegação
    const buttons = [];
    if (currentPage < totalPages) {
        buttons.push({
            type: 'reply',
            reply: {
                id: `more_${currentPage + 1}`, // Próxima página
                title: 'Ver mais produtos',
            },
        });
    }
    buttons.push({
        type: 'reply',
        reply: {
            id: 'change_category', // Trocar de categoria
            title: 'Trocar categoria',
        },
    });
    // Enviar os botões de navegação
    await (0, exports.sendMessage)({
        messaging_product: 'whatsapp',
        to: "+" + to,
        type: 'interactive',
        interactive: {
            type: 'button',
            body: {
                text: message,
            },
            action: {
                buttons,
            },
        },
    });
}
const hasStreetNumber = (address) => {
    const numberRegex = /\d+/; // Verifica se há pelo menos um número no texto
    return numberRegex.test(address);
};
exports.hasStreetNumber = hasStreetNumber;
function getProductsByCategory(menu, categoryId) {
    const today = new Date().getDay() + 1; // Dias da semana no formato 1 (domingo) a 7 (sábado)
    return menu.filter((item) => {
        if (item.categoryId !== categoryId)
            return false;
        // Verificar se o produto é vendido todos os dias ou apenas em dias específicos
        if (!item.allDays && item.weekdays && !item.weekdays.includes(today)) {
            return false;
        }
        return true;
    });
}
function filterProductsByKeyword(products, keyword) {
    const lowerKeyword = keyword.toLowerCase();
    return products.filter((product) => product.menuName.toLowerCase().includes(lowerKeyword) ||
        product.menuDescription.toLowerCase().includes(lowerKeyword));
}
async function processGooglePredictions(predictions, store) {
    // console.log('Processando previsões do Google Places:', predictions);
    // Transformar as previsões em um formato utilizável
    const processedPredictions = predictions.map((prediction) => ({
        id: prediction.place_id, // ID único do lugar
        title: prediction.structured_formatting.main_text, // Nome principal do lugar
        description: prediction.structured_formatting.secondary_text || '', // Descrição secundária (ex.: cidade, estado)
    }));
    // console.log('Previsões processadas:', processedPredictions);
    return processedPredictions;
}
const sendQuestion = async (to, question) => {
    // console.log(`Enviando pergunta: ${question.questionName}`);
    const rows = question.answers?.map((answer) => ({
        id: `answer_${answer.answerId}`,
        title: answer.answerName.slice(0, 20), // Garantir que o título tenha no máximo 20 caracteres
        description: answer.price ? `Preço adicional: R$ ${answer.price.toFixed(2)}` : 'Sem custo adicional',
    }));
    if (question.minAnswerRequired === 0) {
        rows?.unshift({
            id: `answer_none`,
            title: 'Não selecionar nenhum item'.slice(0, 20), // Garantir que o título tenha no máximo 20 caracteres
            description: '',
        });
    }
    if (question.questionType === 'RADIO') {
        await (0, exports.sendMessage)({
            messaging_product: 'whatsapp',
            to: "+" + to,
            type: 'interactive',
            interactive: {
                type: 'list',
                header: { type: 'text', text: question.questionName },
                body: { text: 'Selecione uma das opções abaixo:' },
                action: {
                    button: 'Selecionar',
                    sections: [{ title: 'Opções disponíveis', rows }],
                },
            },
        });
    }
    else if (question.questionType === 'CHECK' || question.questionType === 'QUANTITY') {
        await (0, exports.sendMessage)({
            messaging_product: 'whatsapp',
            to: "+" + to,
            type: 'interactive',
            interactive: {
                type: 'list',
                header: { type: 'text', text: question.questionName },
                body: { text: `Selecione as opções desejadas. Você pode escolher até ${question.maxAnswerRequired} itens.` },
                action: {
                    button: 'Selecionar',
                    sections: [{ title: 'Opções disponíveis', rows }],
                },
            },
        });
    }
};
exports.sendQuestion = sendQuestion;
const processQuestionResponse = async (from, response, currentConversation) => {
    const { product, currentQuestionIndex } = currentConversation;
    if (!currentConversation.docId) {
        // console.error('Erro: Nenhuma conversa encontrada para atualizar.');
        return;
    }
    if (!product || !product.questions) {
        // console.error('Erro: Nenhuma pergunta em andamento.');
        return;
    }
    // Validar se currentQuestionIndex é um número válido e está dentro do intervalo
    if (typeof currentQuestionIndex !== 'number' ||
        currentQuestionIndex < 0 ||
        currentQuestionIndex >= product.questions.length) {
        // console.error('Erro: currentQuestionIndex inválido ou fora do intervalo.');
        await (0, exports.sendMessage)({
            messaging_product: 'whatsapp',
            to: from,
            type: 'text',
            text: {
                body: 'Ocorreu um erro ao processar sua resposta. Por favor, tente novamente.',
            },
        });
        return;
    }
    const currentQuestion = product.questions[currentQuestionIndex];
    // console.log(`Processando resposta para a pergunta: ${currentQuestion.questionName.slice(0, 20)}`); // Garantir que o título tenha no máximo 20 caracteres
    if (response === 'answer_none' && currentQuestion.minAnswerRequired === 0) {
        // console.log('Usuário escolheu não selecionar nenhum item.');
    }
    else if (currentQuestion.questionType === 'CHECK' || currentQuestion.questionType === 'QUANTITY') {
        const selectedAnswers = response.split(','); // IDs das respostas selecionadas
        if (selectedAnswers.length < currentQuestion.minAnswerRequired ||
            selectedAnswers.length > currentQuestion.maxAnswerRequired) {
            await (0, exports.sendMessage)({
                messaging_product: 'whatsapp',
                to: from,
                type: 'text',
                text: {
                    body: `2. Por favor, selecione entre ${currentQuestion.minAnswerRequired} e ${currentQuestion.maxAnswerRequired} itens.`,
                },
            });
            return;
        }
    }
    // Avançar para a próxima pergunta ou finalizar
    if (currentQuestionIndex + 1 < product.questions.length) {
        const nextQuestion = product.questions[currentQuestionIndex + 1];
        await (0, conversationController_1.updateConversation)(currentConversation.docId, {
            currentQuestionIndex: currentQuestionIndex + 1,
        });
        await (0, exports.sendQuestion)(from, nextQuestion);
    }
    else {
        // console.log('Todas as perguntas foram respondidas.');
        await (0, exports.sendMessage)({
            messaging_product: 'whatsapp',
            to: from,
            type: 'text',
            text: { body: 'Obrigado por responder às perguntas. O produto foi adicionado ao carrinho.' },
        });
    }
};
exports.processQuestionResponse = processQuestionResponse;
const validateFlowAndHandleMessage = async (from, message, currentConversation, store) => {
    const { flow, isLocked } = currentConversation;
    // console.log(`Validando mensagem no fluxo: ${flow}, isLocked: ${isLocked}`);
    // Se o fluxo estiver bloqueado, ignore mensagens fora do contexto
    if (isLocked) {
        if (flow === 'PRODUCT_QUESTIONS' || flow === 'PRODUCT_QUANTITY') {
            // console.log('Fluxo bloqueado. Apenas mensagens relacionadas ao produto são permitidas.');
            return true; // Permitir mensagens relacionadas ao fluxo atual
        }
        // Mensagem fora do contexto
        // console.log('Mensagem fora do contexto enquanto o fluxo está bloqueado.');
        await (0, exports.sendMessage)({
            messaging_product: 'whatsapp',
            to: from,
            type: 'text',
            text: {
                body: 'Por favor, conclua o fluxo atual antes de realizar outra ação.',
            },
        });
        return false;
    }
    // Validação baseada no fluxo atual
    switch (flow) {
        case 'WELCOME':
            // Mensagens de texto genéricas no fluxo de boas-vindas
            if (message.text?.body) {
                // console.log('Mensagem de texto recebida no fluxo WELCOME.');
                await (0, exports.sendMessage)({
                    messaging_product: 'whatsapp',
                    to: from,
                    type: 'text',
                    text: {
                        body: 'Por favor, selecione uma das opções acima para continuar.',
                    },
                });
                return false; // Não processar mais nada
            }
            break;
        case 'CATEGORIES':
            if (message.interactive?.list_reply?.id) {
                return true; // Mensagem válida para seleção de categoria
            }
            break;
        case 'PRODUCTS':
            if (message.interactive?.button_reply?.id?.startsWith('product_') ||
                message.interactive?.button_reply?.id?.startsWith('more_')) {
                return true; // Mensagem válida para seleção de produto ou navegação
            }
            break;
        case 'PRODUCT_QUESTIONS':
            if (message.interactive?.button_reply?.id || message.text?.body) {
                return true; // Mensagem válida para responder perguntas
            }
            break;
        case 'PRODUCT_QUANTITY':
            if (message.text?.body) {
                return true; // Mensagem válida para informar a quantidade
            }
            break;
        case 'NEW_ADDRESS':
            if (message.text?.body) {
                return true; // Mensagem válida para informar endereço
            }
            break;
        case 'ADDRESS_CONFIRMATION':
            if (message.interactive?.button_reply?.id) {
                return true; // Mensagem válida para confirmar ou alterar endereço
            }
            break;
        default:
            // console.log(`Fluxo desconhecido ou não tratado: ${flow}`);
            break;
    }
    // Mensagem inválida para o fluxo atual
    // console.log('Mensagem inválida para o fluxo atual. Enviando resposta genérica.');
    await (0, exports.sendMessage)({
        messaging_product: 'whatsapp',
        to: from,
        type: 'text',
        text: {
            body: 'Desculpe, não entendi sua mensagem. Por favor, siga as instruções ou selecione uma opção válida.',
        },
    });
    return false; // Mensagem inválida
};
exports.validateFlowAndHandleMessage = validateFlowAndHandleMessage;
async function handleProductSelection(from, productId, store, currentConversation) {
    // console.log(`Produto selecionado: product_${productId}`);
    const selectedProduct = store.menu.find((product) => product.menuId === productId);
    if (!selectedProduct) {
        await (0, exports.sendMessage)({
            messaging_product: 'whatsapp',
            to: from,
            type: 'text',
            text: { body: 'Desculpe, o produto selecionado não foi encontrado.' },
        });
        return;
    }
    if (!currentConversation.docId) {
        // console.error('Erro: Nenhuma conversa encontrada para atualizar.');
        return;
    }
    // console.log(`Produto encontrado: ${selectedProduct.menuName}`);
    // Verificar se o produto possui perguntas
    if (selectedProduct.questions && selectedProduct.questions.length > 0) {
        // console.log('Produto possui perguntas. Iniciando fluxo de perguntas...');
        await handleProductQuestions(from, selectedProduct, currentConversation, 0);
    }
    else {
        // console.log('Produto não possui perguntas. Iniciando fluxo de quantidade...');
        // Atualizar a conversa para o fluxo de quantidade
        await (0, conversationController_1.updateConversation)(currentConversation.docId, {
            flow: 'PRODUCT_QUANTITY',
            product: selectedProduct,
        });
        // Criar as opções de quantidade (1 a 5) e a opção "Digitar a quantidade"
        const quantityOptions = Array.from({ length: 5 }, (_, i) => ({
            id: `quantity_${i + 1}`,
            title: `${i + 1}`,
            description: `Adicionar ${i + 1} unidade(s) ao carrinho`,
        }));
        quantityOptions.push({
            id: 'quantity_custom',
            title: 'Digitar a quantidade',
            description: 'Informe manualmente a quantidade desejada.',
        });
        // Enviar a lista interativa de quantidades
        await (0, exports.sendMessage)({
            messaging_product: 'whatsapp',
            to: from,
            type: 'interactive',
            interactive: {
                type: 'list',
                header: {
                    type: 'text',
                    text: `Quantas unidades você deseja adicionar ao carrinho?`,
                },
                body: {
                    text: 'Selecione uma quantidade abaixo:',
                },
                action: {
                    button: 'Selecionar',
                    sections: [
                        {
                            title: 'Quantidades disponíveis',
                            rows: quantityOptions,
                        },
                    ],
                },
            },
        });
        // console.log('Mensagem de seleção de quantidade enviada ao cliente.');
    }
}
async function handleProductQuantity(from, currentConversation) {
    const { product } = currentConversation;
    if (!currentConversation.docId) {
        // console.error('Erro: Nenhuma conversa encontrada para atualizar.');
        return;
    }
    if (!product) {
        // console.error('Erro: Nenhum produto selecionado.');
        return;
    }
    // Enviar a lista interativa de quantidades
    const quantityOptions = Array.from({ length: 5 }, (_, i) => ({
        id: `quantity_${i + 1}`,
        title: `${i + 1}`,
        // description: `Adicionar ${i + 1} unidade(s) ao carrinho`,
    }));
    quantityOptions.push({
        id: 'quantity_custom',
        title: 'Digitar a quantidade',
        // description: 'Informe manualmente a quantidade desejada.',
    });
    // Criar a mensagem interativa com a lista de quantidades
    const messagePayload = {
        messaging_product: 'whatsapp',
        to: from,
        type: 'interactive',
        interactive: {
            type: 'list',
            header: {
                type: 'text',
                text: `Quantas unidades você deseja adicionar ao carrinho?`,
            },
            body: {
                text: 'Selecione uma quantidade abaixo:',
            },
            action: {
                button: 'Selecionar',
                sections: [
                    {
                        title: 'Quantidades disponíveis',
                        rows: quantityOptions,
                    },
                ],
            },
        },
    };
    await (0, conversationController_1.updateConversation)(currentConversation.docId, {
        flow: 'PRODUCT_QUANTITY',
    });
    // Enviar a mensagem interativa
    try {
        await (0, exports.sendMessage)(messagePayload);
        // console.log('Mensagem de seleção de quantidade enviada ao cliente.');
    }
    catch (error) {
        // console.error('Erro ao enviar mensagem de seleção de quantidade:', error.response?.data || error.message);
    }
}
// Funcoes de envio do andamento do pedido
const sendConfirmationMessage = async (phoneNumber) => {
    // console.log('Enviando mensagem para informacao da confirmacao...');
    // console.log('Número de telefone:', phoneNumber);
    const messagePayload = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: {
            body: 'Seu pedido foi confirmado e está sendo preparado para a entrega.'
        }
    };
    await (0, exports.sendMessage)(messagePayload);
};
exports.sendConfirmationMessage = sendConfirmationMessage;
const sendDeliveryMessage = async (phoneNumber) => {
    // console.log('Enviando mensagem para informacao da confirmacao...');
    // console.log('Número de telefone:', phoneNumber);
    const messagePayload = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: {
            body: 'Seu pedido saiu para a entrega e está indo até você.'
        }
    };
    await (0, exports.sendMessage)(messagePayload);
};
exports.sendDeliveryMessage = sendDeliveryMessage;
const sendDeliveredMessage = async (phoneNumber) => {
    // console.log('Enviando mensagem para informacao da confirmacao...');
    // console.log('Número de telefone:', phoneNumber);
    const messagePayload = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: {
            body: 'Seu pedido foi entregue. Obrigado pela confiança, estamos à disposição!'
        }
    };
    await (0, exports.sendMessage)(messagePayload);
};
exports.sendDeliveredMessage = sendDeliveredMessage;
async function handleProductQuestions(from, product, currentConversation, questionIndex) {
    if (!currentConversation.docId) {
        // console.error('Erro: Nenhuma conversa encontrada para atualizar.');
        return;
    }
    // Atualizar a conversa com o produto selecionado
    await (0, conversationController_1.updateConversation)(currentConversation.docId, {
        product,
    });
    // Verificar se o índice da pergunta é válido
    if (!product.questions || questionIndex < 0 || questionIndex >= product.questions.length) {
        // console.error(`Índice da pergunta inválido: ${questionIndex}`);
        await (0, exports.sendMessage)({
            messaging_product: 'whatsapp',
            to: from,
            type: 'text',
            text: {
                body: 'Ocorreu um erro ao processar a pergunta. Por favor, tente novamente.',
            },
        });
        return;
    }
    // Obter a pergunta com base no índice
    const question = product.questions[questionIndex];
    const answers = question.answers || [];
    // console.log(`Pergunta atual: ${question.questionName}, Tipo: ${question.questionType}`);
    // Verificar o tipo de pergunta
    if (question.questionType === 'RADIO') {
        // Lógica atual para perguntas do tipo RADIO
        const listItems = question.answers?.map((answer) => ({
            id: `answer_${answer.answerId}`,
            title: answer.answerName,
            description: answer.price
                ? `Preço adicional: R$ ${answer.price.toFixed(2)}`
                : 'Sem custo adicional',
        }));
        if (!listItems || listItems.length === 0) {
            console.error('Erro: Nenhuma resposta disponível para a pergunta.');
            await (0, exports.sendMessage)({
                messaging_product: 'whatsapp',
                to: from,
                type: 'text',
                text: {
                    body: 'Desculpe, ocorreu um erro ao processar a pergunta. Tente novamente.',
                },
            });
            return;
        }
        // Criar a mensagem interativa com a lista
        const messagePayload = {
            messaging_product: 'whatsapp',
            to: from,
            type: 'interactive',
            interactive: {
                type: 'list',
                header: {
                    type: 'text',
                    text: question.questionName,
                },
                body: {
                    text: 'Selecione uma das opções abaixo:',
                },
                action: {
                    button: 'Selecionar',
                    sections: [
                        {
                            title: 'Opções disponíveis',
                            rows: listItems,
                        },
                    ],
                },
            },
        };
        // Enviar a mensagem interativa
        await (0, exports.sendMessage)(messagePayload);
        // Atualizar o fluxo da conversa
        await (0, conversationController_1.updateConversation)(currentConversation.docId, {
            flow: 'PRODUCT_QUESTIONS',
            productBeingAnswered: product.menuId,
            currentQuestionIndex: questionIndex,
        });
        // console.log(`Pergunta enviada ao cliente: ${question.questionName}`);
    }
    else if (question.questionType === 'CHECK' || question.questionType === 'QUANTITY') {
        // Lógica para perguntas do tipo CHECKBOX
        // console.log('Pergunta do tipo CHECKBOX detectada.');
        // Enviar a pergunta do tipo CHECKBOX
        await sendCheckboxQuestion(from, question, currentConversation);
    }
    else {
        console.error(`Tipo de pergunta desconhecido: ${question.questionType}`);
        await (0, exports.sendMessage)({
            messaging_product: 'whatsapp',
            to: from,
            type: 'text',
            text: {
                body: 'Desculpe, ocorreu um erro ao processar a pergunta. Tente novamente.',
            },
        });
    }
}
async function redirectToOrderSummary(from, currentConversation) {
    if (!currentConversation.docId) {
        return;
    }
    if (!currentConversation.cartItems || currentConversation.cartItems.length === 0) {
        // console.log('Carrinho vazio ou conversa não encontrada.');
        if (currentConversation.flow === 'PRODUCT_QUANTITY') {
            const product = currentConversation.product;
            if (!product) {
                // console.error('Erro: Nenhum produto encontrado no fluxo PRODUCT_QUANTITY.');
                return;
            }
            // Criar as opções de quantidade (1 a 5) e a opção "Digitar a quantidade"
            const quantityOptions = Array.from({ length: 5 }, (_, i) => ({
                id: `quantity_${i + 1}`,
                title: `${i + 1}`,
                description: `Adicionar ${i + 1} unidade(s) ao carrinho`,
            }));
            quantityOptions.push({
                id: 'quantity_custom',
                title: 'Digitar a quantidade',
                description: 'Informe manualmente a quantidade desejada.',
            });
            // Enviar a lista interativa de quantidades
            await (0, exports.sendMessage)({
                messaging_product: 'whatsapp',
                to: from,
                type: 'interactive',
                interactive: {
                    type: 'list',
                    header: {
                        type: 'text',
                        text: `Quantas unidades você deseja adicionar ao carrinho?`,
                    },
                    body: {
                        text: 'Selecione uma quantidade abaixo:',
                    },
                    action: {
                        button: 'Selecionar',
                        sections: [
                            {
                                title: 'Quantidades disponíveis',
                                rows: quantityOptions,
                            },
                        ],
                    },
                },
            });
            // console.log('Mensagem de seleção de quantidade enviada ao cliente.');
            return;
        }
        // console.log('Redirecionando para o menu de categorias...');
        if (currentConversation.flow === 'CATEGORIES') {
            const textBody = `Seu carrinho está vazio. Por favor, adicione produtos antes de finalizar a compra.`;
            await (0, exports.sendMessage)({
                messaging_product: 'whatsapp',
                to: from,
                type: 'text',
                text: {
                    body: textBody,
                },
            });
        }
        // Atualizar o fluxo da conversa para "CATEGORIES"
        await (0, conversationController_1.updateConversation)(currentConversation.docId, {
            flow: 'CATEGORIES',
        });
        if (process.env.STORE_SLUG) {
            const store = await (0, storeController_1.getStore)(process.env.STORE_SLUG);
            // Enviar lista de categorias
            if (store?.categories && store?.menu) {
                await sendCategoriesMessage(from, store.categories, store.menu);
            }
        }
        return;
    }
    try {
        // Calcular o total do pedido, incluindo preços das respostas selecionadas
        let totalPrice = 0;
        const cartSummary = currentConversation.cartItems
            .map((item) => {
            const basePrice = item.price;
            // Gerar detalhes das respostas selecionadas
            const answersDetails = item.questions?.map((question) => {
                const questionText = question.questionName; // Nome da pergunta
                const selectedAnswers = question.answers || [];
                const answersText = selectedAnswers
                    .map((answer) => {
                    const answerTotal = (answer.price || 0) * (answer.quantity || 1); // Multiplicar preço pela quantidade
                    return `    • ${answer.answerName} (x${answer.quantity || 1}): R$ ${answerTotal.toFixed(2)}`;
                })
                    .join('\n');
                return `  ${questionText}:\n${answersText}`;
            }).join('\n') || '';
            // Calcular o total das respostas selecionadas
            const answersTotal = item.questions?.reduce((sum, question) => {
                const selectedAnswers = question.answers || [];
                return sum + selectedAnswers.reduce((answerSum, answer) => answerSum + (answer.price || 0) * (answer.quantity || 1), 0);
            }, 0) || 0;
            const itemTotal = (basePrice + answersTotal) * item.quantity;
            totalPrice += itemTotal;
            // Garantir que `answersDetails` não seja apenas uma quebra de linha
            const sanitizedAnswersDetails = answersDetails.trim() ? `\n  ${answersDetails}` : '';
            // Construir o resumo do item
            return `
• ${item.menuName}:
  Preço Base: R$ ${basePrice.toFixed(2)}${sanitizedAnswersDetails}
  Quantidade: ${item.quantity}
  Subtotal: R$ ${itemTotal.toFixed(2)}
`;
        })
            .join('\n');
        // Atualizar o fluxo para ORDER_SUMMARY
        await (0, conversationController_1.updateConversation)(currentConversation.docId, {
            flow: 'ORDER_SUMMARY',
            totalPrice,
            selectedAnswers: [],
        });
        // Gerar a mensagem de resumo do pedido
        const summaryMessage = `
RESUMO DO PEDIDO:
${cartSummary}
TOTAL GERAL: R$ ${totalPrice.toFixed(2)}

Escolha uma das opções abaixo:
    `;
        console.log('Resumo do pedido:', summaryMessage);
        // Assegurar que o resumo do pedido não exceda 1024 caracteres
        if (summaryMessage.length > 1024) {
            // console.error('Resumo do pedido excede o limite de 1024 caracteres.');
            await (0, exports.sendMessage)({
                messaging_product: 'whatsapp',
                to: from,
                type: 'text',
                text: {
                    body: 'Desculpe, o resumo do pedido é muito longo para ser enviado por completo. Por favor, entre em contato com a loja.',
                },
            });
            return;
        }
        // Enviar mensagem com os botões de ação
        await (0, exports.sendMessage)({
            messaging_product: 'whatsapp',
            to: from,
            type: 'interactive',
            interactive: {
                type: 'button',
                body: {
                    text: summaryMessage,
                },
                action: {
                    buttons: [
                        {
                            type: 'reply',
                            reply: {
                                id: 'finalize_order',
                                title: 'Finalizar Pedido',
                            },
                        },
                        {
                            type: 'reply',
                            reply: {
                                id: 'edit_cart',
                                title: 'Alterar Itens',
                            },
                        },
                        {
                            type: 'reply',
                            reply: {
                                id: 'add_more_products',
                                title: 'Continuar Comprando',
                            },
                        },
                    ],
                },
            },
        });
        // console.log('Resumo do pedido enviado ao cliente.');
    }
    catch (error) {
        console.error('Erro ao redirecionar para ORDER_SUMMARY:', error.message);
        await (0, exports.sendMessage)({
            messaging_product: 'whatsapp',
            to: from,
            type: 'text',
            text: {
                body: 'Desculpe, ocorreu um erro ao processar o resumo do pedido. Por favor, tente novamente mais tarde.',
            },
        });
    }
}
async function sendCartItemsListResponse(from, cartItemsList) {
    try {
        const sections = [
            {
                title: 'Itens no Carrinho',
                rows: cartItemsList.map((item) => ({
                    id: item.id,
                    title: item.title,
                    description: item.description,
                })),
            },
        ];
        await (0, exports.sendMessage)({
            messaging_product: 'whatsapp',
            to: from,
            type: 'interactive',
            interactive: {
                type: 'list',
                header: {
                    type: 'text',
                    text: 'Selecione um item para alterar:',
                },
                body: {
                    text: 'Escolha um item do carrinho para alterar ou excluir.',
                },
                footer: {
                    text: 'Você pode cancelar a alteração a qualquer momento.',
                },
                action: {
                    button: 'Selecionar',
                    sections,
                },
            },
        });
        // console.log('Lista de itens do carrinho enviada ao cliente.');
    }
    catch (error) {
        // console.error('Erro ao enviar a lista de itens do carrinho:', error);
    }
}
async function proceedToNextQuestion(from, currentConversation) {
    const { product, currentQuestionIndex } = currentConversation;
    if (!currentConversation.docId) {
        // console.error('Erro: Nenhuma conversa encontrada para atualizar.');
        return;
    }
    if (!product || !product.questions) {
        // console.error('Erro: Nenhum produto ou perguntas associadas.');
        return;
    }
    // Verificar se há mais perguntas no fluxo
    const nextQuestionIndex = (currentQuestionIndex || 0) + 1;
    if (nextQuestionIndex < product.questions.length) {
        // Atualizar o índice da pergunta atual
        await (0, conversationController_1.updateConversation)(currentConversation.docId, {
            currentQuestionIndex: nextQuestionIndex,
        });
        // Enviar a próxima pergunta
        const nextQuestion = product.questions[nextQuestionIndex];
        // console.log(`Enviando próxima pergunta: ${nextQuestion.questionName}`);
        await (0, exports.sendQuestion)(from, nextQuestion);
    }
    else {
        // Todas as perguntas foram respondidas
        // console.log('Todas as perguntas foram respondidas. Finalizando fluxo.');
        // Atualizar o fluxo para indicar que as perguntas foram concluídas
        await (0, conversationController_1.updateConversation)(currentConversation.docId, {
            flow: 'QUESTIONS_COMPLETED',
        });
        // Enviar mensagem de confirmação ao cliente
        await (0, exports.sendMessage)({
            messaging_product: 'whatsapp',
            to: from,
            type: 'text',
            text: {
                body: 'Obrigado pelas respostas, todas as perguntas foram respondidas.',
            },
        });
        //redirecionar para o fluxo da quantidade
        // console.log('Redirecionando para o fluxo de quantidade...');
        await handleProductQuantity(from, currentConversation);
    }
}
async function validateCheckboxAnswers(from, currentConversation, question) {
    if (!currentConversation.docId) {
        return;
    }
    const { selectedAnswers } = currentConversation;
    if (!selectedAnswers || selectedAnswers.length === 0) {
        // console.error('Erro: Nenhuma resposta selecionada.');
        await (0, exports.sendMessage)({
            messaging_product: 'whatsapp',
            to: from,
            type: 'text',
            text: {
                body: 'Por favor, selecione pelo menos uma opção.',
            },
        });
        return;
    }
    // Verificar se o número de respostas está dentro do intervalo permitido
    if (selectedAnswers.length < (question.minAnswerRequired || 0) ||
        selectedAnswers.length > (question.maxAnswerRequired || Infinity)) {
        // console.error('Número de respostas inválido.');
        await (0, exports.sendMessage)({
            messaging_product: 'whatsapp',
            to: from,
            type: 'text',
            text: {
                body: `1. Por favor, selecione entre ${question.minAnswerRequired} e ${question.maxAnswerRequired} opções.`,
            },
        });
        return;
    }
    // console.log('Respostas válidas:', selectedAnswers);
    // Atualizar a conversa com as respostas selecionadas
    await (0, conversationController_1.updateConversation)(currentConversation.docId, {
        selectedAnswers,
    });
    // Passar para a próxima pergunta ou finalizar
    await proceedToNextQuestion(from, currentConversation);
}
async function processCheckboxResponse(from, selectedId, currentConversation) {
    const { product, currentQuestionId, selectedAnswers } = currentConversation;
    // console.log('Selected Anserws', selectedAnswers)
    if (!currentConversation.docId) {
        console.error('Erro: Nenhuma conversa encontrada para atualizar.');
        return;
    }
    if (!product || !product.questions) {
        console.error('Erro: Nenhuma pergunta em andamento.');
        return;
    }
    const question = product.questions.find((q) => q.questionId === currentQuestionId);
    if (!question) {
        console.error('Erro: Pergunta não encontrada.');
        return;
    }
    if (selectedId === 'no_need') {
        // console.log('Usuário escolheu "Não preciso".');
        // Finalizar a pergunta e passar para a próxima
        await proceedToNextQuestion(from, currentConversation);
        return;
    }
    // Extrair o ID da resposta selecionada
    const selectedIdParts = selectedId.split('_');
    const selectedIdNumber = parseInt(selectedIdParts[1], 10);
    if (isNaN(selectedIdNumber)) {
        console.error('Erro: ID da resposta selecionada é inválido.');
        return;
    }
    console.log('ID da resposta selecionada:', selectedIdNumber);
    console.log('Lista de respostas disponíveis:', question.answers);
    const selectedAnswer = question.answers?.find(answer => answer.answerId === selectedIdNumber);
    if (!selectedAnswer) {
        await (0, exports.sendMessage)({
            messaging_product: 'whatsapp',
            to: from,
            type: 'text',
            text: {
                body: 'Por favor, selecione pelo menos uma opção válida.',
            },
        });
        return;
    }
    console.log(`Resposta selecionada: ${selectedAnswer.answerName}`);
    // Adicionar a resposta ao array de respostas selecionadas
    selectedAnswers.push(selectedAnswer.answerId.toString());
    console.log('Respostas selecionadas atualizadas:', selectedAnswers);
    // Atualizar a conversa com as respostas selecionadas
    await (0, conversationController_1.updateConversation)(currentConversation.docId, {
        selectedAnswers,
    });
    // Atualizar o cartItems com as respostas selecionadas
    const updatedCartItems = currentConversation.cartItems || [];
    const existingCartItem = updatedCartItems.find(item => item.menuId === product.menuId);
    if (existingCartItem) {
        existingCartItem.questions = existingCartItem.questions || [];
        const existingQuestion = existingCartItem.questions.find((q) => q.questionId === question.questionId);
        if (existingQuestion) {
            const existingAnswer = existingQuestion.answers?.find((a) => a.answerId === selectedAnswer.answerId);
            if (existingAnswer) {
                // Incrementar a quantidade se a resposta já existir
                existingAnswer.quantity = (existingAnswer.quantity || 1) + 1;
            }
            else {
                // Adicionar a resposta com quantidade inicial 1
                existingQuestion.answers = existingQuestion.answers || [];
                existingQuestion.answers.push({
                    ...selectedAnswer,
                    quantity: 1,
                });
            }
        }
        else {
            existingCartItem.questions.push({
                ...question,
                answers: [
                    {
                        ...selectedAnswer,
                        quantity: 1,
                    },
                ],
            });
        }
    }
    else {
        updatedCartItems.push({
            ...product,
            questions: [
                {
                    ...question,
                    answers: [
                        {
                            ...selectedAnswer,
                            quantity: 1,
                        },
                    ],
                },
            ],
            quantity: 0,
        });
    }
    // Salvar o cartItems atualizado na conversa
    await (0, conversationController_1.updateConversation)(currentConversation.docId, {
        cartItems: updatedCartItems,
    });
    console.log('Carrinho atualizado com as respostas selecionadas:', updatedCartItems);
    // Verificar se atingiu o máximo de respostas permitidas
    if (selectedAnswers.length >= (question.maxAnswerRequired || Infinity)) {
        console.log('Número máximo de respostas atingido.');
        await validateCheckboxAnswers(from, currentConversation, question);
        return;
    }
    // Continuar perguntando para as próximas respostas
    await sendCheckboxQuestion(from, question, currentConversation);
}
async function sendCheckboxQuestion(to, question, currentConversation) {
    // console.log('Enviando pergunta do tipo CHECKBOX:', question);
    if (!currentConversation.docId) {
        return;
    }
    const rows = question.answers?.map((answer) => ({
        id: `answer_${answer.answerId}`,
        title: answer.answerName,
        description: answer.price
            ? `Preço adicional: R$ ${answer.price.toFixed(2)}`
            : 'Sem custo adicional',
    }));
    if (!rows || rows.length === 0) {
        console.error('Erro: Nenhuma resposta disponível para a pergunta.');
        await (0, exports.sendMessage)({
            messaging_product: 'whatsapp',
            to: to,
            type: 'text',
            text: {
                body: 'Desculpe, ocorreu um erro ao processar a pergunta. Tente novamente.',
            },
        });
        return;
    }
    // Adicionar a opção "Não preciso" se minAnswerRequired for 0
    if (question.minAnswerRequired === 0) {
        rows.push({
            id: 'no_need',
            title: 'Não preciso',
            description: 'Ignorar esta pergunta.',
        });
    }
    // Enviar a lista inicial de opções
    await (0, exports.sendMessage)({
        messaging_product: 'whatsapp',
        to: to,
        type: 'interactive',
        interactive: {
            type: 'list',
            header: {
                type: 'text',
                text: question.questionName,
            },
            body: {
                text: 'Selecione uma das opções abaixo:',
            },
            action: {
                button: 'Selecionar',
                sections: [
                    {
                        title: 'Opções disponíveis',
                        rows,
                    },
                ],
            },
        },
    });
    // Atualizar o fluxo para processar as respostas
    await (0, conversationController_1.updateConversation)(currentConversation.docId, {
        flow: 'CHECKBOX_QUESTION',
        currentQuestionId: question.questionId,
    });
    // console.log('Pergunta do tipo CHECKBOX enviada ao cliente.');
}
