"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendQuestion = void 0;
exports.handleProductSelection = handleProductSelection;
exports.handleProductQuantity = handleProductQuantity;
exports.handleProductQuestions = handleProductQuestions;
exports.sendCartItemsListResponse = sendCartItemsListResponse;
exports.processCheckboxResponse = processCheckboxResponse;
exports.sendCheckboxQuestion = sendCheckboxQuestion;
exports.redirectToOrderSummary = redirectToOrderSummary;
exports.handleCollectCustomQuantityFlow = handleCollectCustomQuantityFlow;
exports.handleEditCartItems = handleEditCartItems;
exports.handleDeleteCartItem = handleDeleteCartItem;
exports.handleAlterItemQuantity = handleAlterItemQuantity;
exports.buildCartTableString = buildCartTableString;
exports.buildCartRichTextTable = buildCartRichTextTable;
exports.buildCartTableStringFromRichText = buildCartTableStringFromRichText;
const conversationController_1 = require("../controllers/conversationController");
const storeController_1 = require("../controllers/storeController");
const messagingService_1 = require("./messagingService");
const catalogService_1 = require("./catalogService");
const uuid_1 = require("uuid"); // Certifique-se de instalar o pacote uuid: npm install uuid
const sendQuestion = async (to, question, wabaEnvironments) => {
    // console.log(`Enviando pergunta: ${question.questionName}`);
    const rows = question.answers?.map((answer) => ({
        id: `answer_${answer.answerId}`,
        title: answer.answerName.slice(0, 20), // Garantir que o título tenha no máximo 20 caracteres
        description: answer.price ? `Preço adicional: R$ ${answer.price.toFixed(2)}` : 'Sem custo adicional',
    }));
    if (question.minAnswerRequired === 0) {
        rows?.unshift({
            id: `answer_none`,
            title: 'Não selecionar nenhum item', // Garantir que o título tenha no máximo 20 caracteres
            description: '',
        });
    }
    if (question.questionType === 'RADIO') {
        await (0, messagingService_1.sendMessage)({
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
        }, wabaEnvironments);
    }
    else if (question.questionType === 'CHECK' || question.questionType === 'QUANTITY') {
        await (0, messagingService_1.sendMessage)({
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
        }, wabaEnvironments);
    }
};
exports.sendQuestion = sendQuestion;
function generateCartItemId() {
    // Gerar um UUID único para o cartItem
    return (0, uuid_1.v4)();
}
async function handleProductSelection(from, productId, store, currentConversation) {
    // console.log(`Produto selecionado: product_${productId}`);
    if (!store.wabaEnvironments) {
        (0, messagingService_1.notifyAdmin)('Erro: currentConversation.store.wabaEnvironments não está definido.');
        return;
    }
    const selectedProduct = store.menu.find((product) => product.menuId === productId);
    if (!selectedProduct) {
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: from,
            type: 'text',
            text: { body: 'Desculpe, o produto selecionado não foi encontrado.' },
        }, store.wabaEnvironments);
        return;
    }
    if (!currentConversation.docId) {
        (0, messagingService_1.notifyAdmin)('Erro: Nenhuma conversa encontrada para atualizar.');
        return;
    }
    // Gerar o ID único para o cartItem
    const cartItemId = generateCartItemId();
    const newProduct = {
        ...selectedProduct,
        id: cartItemId, // Adicionar o ID único ao produto
        quantity: 0,
    };
    await (0, conversationController_1.updateConversation)(currentConversation, {
        product: newProduct,
        productBeingAnswered: newProduct.id,
    });
    console.log(`Produto encontrado: ${newProduct}`);
    // Verificar se o produto possui perguntas
    if (newProduct.questions && newProduct.questions.length > 0) {
        console.log('Produto possui perguntas. Iniciando fluxo de perguntas...');
        await handleProductQuestions(from, newProduct, currentConversation, 0);
    }
    else {
        console.log('Produto não possui perguntas. Iniciando fluxo de quantidade...');
        // Atualizar a conversa para o fluxo de quantidade
        await (0, conversationController_1.updateConversation)(currentConversation, {
            flow: 'PRODUCT_QUANTITY',
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
        await (0, messagingService_1.sendMessage)({
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
        }, store.wabaEnvironments);
        // console.log('Mensagem de seleção de quantidade enviada ao cliente.');
    }
}
async function handleProductQuantity(from, currentConversation) {
    const { product } = currentConversation;
    if (!currentConversation.docId) {
        (0, messagingService_1.notifyAdmin)('Erro: Nenhuma conversa encontrada para atualizar.');
        return;
    }
    if (!currentConversation.store?.wabaEnvironments) {
        (0, messagingService_1.notifyAdmin)('Erro: currentConversation.store.wabaEnvironments não está definido.');
        return;
    }
    if (!product) {
        (0, messagingService_1.notifyAdmin)('Erro: Nenhum produto selecionado.');
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
    await (0, conversationController_1.updateConversation)(currentConversation, {
        flow: 'PRODUCT_QUANTITY',
    });
    // Enviar a mensagem interativa
    try {
        await (0, messagingService_1.sendMessage)(messagePayload, currentConversation.store?.wabaEnvironments);
        // console.log('Mensagem de seleção de quantidade enviada ao cliente.');
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao enviar mensagem de seleção de quantidade:', error.response?.data || error.message);
    }
}
async function handleProductQuestions(from, product, currentConversation, questionIndex) {
    if (!currentConversation.docId) {
        (0, messagingService_1.notifyAdmin)('Erro: Nenhuma conversa encontrada para atualizar.');
        return;
    }
    if (!currentConversation.store?.wabaEnvironments) {
        (0, messagingService_1.notifyAdmin)('Erro: currentConversation.store.wabaEnvironments não está definido.');
        return;
    }
    // Verificar se o índice da pergunta é válido
    if (!product.questions || questionIndex < 0 || questionIndex >= product.questions.length) {
        (0, messagingService_1.notifyAdmin)(`Índice da pergunta inválido: ${questionIndex}`);
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: from,
            type: 'text',
            text: {
                body: 'Ocorreu um erro ao processar a pergunta. Por favor, tente novamente.',
            },
        }, currentConversation.store?.wabaEnvironments);
        return;
    }
    // Obter a pergunta com base no índice
    const question = product.questions[questionIndex];
    const answers = question.answers || [];
    // console.log(`Pergunta atual: ${question.questionName}, Tipo: ${question.questionType}`);
    // Atualizar o fluxo da conversa
    await (0, conversationController_1.updateConversation)(currentConversation, {
        flow: 'PRODUCT_QUESTIONS',
        currentQuestionIndex: questionIndex,
    });
    // Verificar o tipo de pergunta
    if (question.questionType === 'RADIO') {
        // Lógica atual para perguntas do tipo RADIO
        const listItems = question.answers?.map((answer) => ({
            id: `answer_${answer.answerId}`,
            title: answer.answerName?.slice(0, 20) || '',
            description: answer.price
                ? `Preço adicional: R$ ${answer.price.toFixed(2)}`
                : 'Sem custo adicional',
        }));
        if (!listItems || listItems.length === 0) {
            (0, messagingService_1.notifyAdmin)('Erro: Nenhuma resposta disponível para a pergunta.');
            await (0, messagingService_1.sendMessage)({
                messaging_product: 'whatsapp',
                to: from,
                type: 'text',
                text: {
                    body: 'Desculpe, ocorreu um erro ao processar a pergunta. Tente novamente.',
                },
            }, currentConversation.store?.wabaEnvironments);
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
        await (0, messagingService_1.sendMessage)(messagePayload, currentConversation.store?.wabaEnvironments);
        // console.log(`Pergunta enviada ao cliente: ${question.questionName}`);
    }
    else if (question.questionType === 'CHECK' || question.questionType === 'QUANTITY') {
        // Lógica para perguntas do tipo CHECKBOX
        // console.log('Pergunta do tipo CHECKBOX detectada.');
        // Enviar a pergunta do tipo CHECKBOX
        await sendCheckboxQuestion(from, question, currentConversation);
    }
    else {
        (0, messagingService_1.notifyAdmin)(`Tipo de pergunta desconhecido: ${question.questionType}`);
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: from,
            type: 'text',
            text: {
                body: 'Desculpe, ocorreu um erro ao processar a pergunta. Tente novamente.',
            },
        }, currentConversation.store?.wabaEnvironments);
    }
}
async function sendCartItemsListResponse(from, cartItemsList, wabaEnvironments) {
    try {
        const sections = [
            {
                title: 'Itens no Carrinho',
                rows: cartItemsList.map((item) => ({
                    id: item.id,
                    title: item.title.slice(0, 20), // Garantir que o título tenha no máximo 20 caracteres
                    description: item.description.slice(0, 50), // Garantir que a descrição tenha no máximo 60 caracteres
                })),
            },
        ];
        await (0, messagingService_1.sendMessage)({
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
        }, wabaEnvironments);
        // console.log('Lista de itens do carrinho enviada ao cliente.');
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao enviar a lista de itens do carrinho:', error);
    }
}
async function proceedToNextQuestion(from, currentConversation) {
    const { product, currentQuestionIndex } = currentConversation;
    if (!currentConversation.docId) {
        (0, messagingService_1.notifyAdmin)('Erro: Nenhuma conversa encontrada para atualizar.');
        return;
    }
    if (!currentConversation.store?.wabaEnvironments) {
        (0, messagingService_1.notifyAdmin)('Erro: currentConversation.store.wabaEnvironments não está definido.');
        return;
    }
    if (!product || !product.questions) {
        (0, messagingService_1.notifyAdmin)('Erro: Nenhum produto ou perguntas associadas.');
        return;
    }
    // Verificar se há mais perguntas no fluxo
    const nextQuestionIndex = (currentQuestionIndex || 0) + 1;
    if (nextQuestionIndex < product.questions.length) {
        // Atualizar o índice da pergunta atual
        await (0, conversationController_1.updateConversation)(currentConversation, {
            currentQuestionIndex: nextQuestionIndex,
        });
        // Enviar a próxima pergunta
        const nextQuestion = product.questions[nextQuestionIndex];
        // console.log(`Enviando próxima pergunta: ${nextQuestion.questionName}`);
        await (0, exports.sendQuestion)(from, nextQuestion, currentConversation.store.wabaEnvironments);
    }
    else {
        // Todas as perguntas foram respondidas
        // console.log('Todas as perguntas foram respondidas. Finalizando fluxo.');
        // Atualizar o fluxo para indicar que as perguntas foram concluídas
        await (0, conversationController_1.updateConversation)(currentConversation, {
            flow: 'QUESTIONS_COMPLETED',
        });
        // Enviar mensagem de confirmação ao cliente
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: from,
            type: 'text',
            text: {
                body: 'Obrigado pelas respostas, todas as perguntas foram respondidas.',
            },
        }, currentConversation.store?.wabaEnvironments);
        //redirecionar para o fluxo da quantidade
        // console.log('Redirecionando para o fluxo de quantidade...');
        await handleProductQuantity(from, currentConversation);
    }
}
async function validateCheckboxAnswers(from, currentConversation, question) {
    if (!currentConversation.docId) {
        return;
    }
    if (!currentConversation.store?.wabaEnvironments) {
        (0, messagingService_1.notifyAdmin)('Erro: currentConversation.store.wabaEnvironments não está definido.');
        return;
    }
    const { selectedAnswers } = currentConversation;
    if (!selectedAnswers || selectedAnswers.length === 0) {
        (0, messagingService_1.notifyAdmin)('Erro: Nenhuma resposta selecionada.');
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: from,
            type: 'text',
            text: {
                body: 'Por favor, selecione pelo menos uma opção.',
            },
        }, currentConversation.store.wabaEnvironments);
        return;
    }
    // Verificar se o número de respostas está dentro do intervalo permitido
    if (selectedAnswers.length < (question.minAnswerRequired || 0) ||
        selectedAnswers.length > (question.maxAnswerRequired || Infinity)) {
        (0, messagingService_1.notifyAdmin)('Número de respostas inválido.');
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: from,
            type: 'text',
            text: {
                body: `1. Por favor, selecione entre ${question.minAnswerRequired} e ${question.maxAnswerRequired} opções.`,
            },
        }, currentConversation.store.wabaEnvironments);
        return;
    }
    // console.log('Respostas válidas:', selectedAnswers);
    // Atualizar a conversa com as respostas selecionadas
    await (0, conversationController_1.updateConversation)(currentConversation, {
        selectedAnswers,
    });
    // Passar para a próxima pergunta ou finalizar
    await proceedToNextQuestion(from, currentConversation);
}
async function processCheckboxResponse(from, selectedId, currentConversation) {
    const { product, currentQuestionId, selectedAnswers } = currentConversation;
    // console.log('Selected Anserws', selectedAnswers)
    if (!currentConversation.docId) {
        (0, messagingService_1.notifyAdmin)('Erro: Nenhuma conversa encontrada para atualizar.');
        return;
    }
    if (!currentConversation.store?.wabaEnvironments) {
        (0, messagingService_1.notifyAdmin)('Erro: currentConversation.store.wabaEnvironments não está definido.');
        return;
    }
    if (!product || !product.questions) {
        (0, messagingService_1.notifyAdmin)('Erro: Nenhuma pergunta em andamento.');
        return;
    }
    const question = product.questions.find((q) => q.questionId === currentQuestionId);
    if (!question) {
        (0, messagingService_1.notifyAdmin)('Erro: Pergunta não encontrada.');
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
        (0, messagingService_1.notifyAdmin)('Erro: ID da resposta selecionada é inválido.');
        return;
    }
    console.log('ID da resposta selecionada:', selectedIdNumber);
    console.log('Lista de respostas disponíveis:', question.answers);
    const selectedAnswer = question.answers?.find(answer => answer.answerId === selectedIdNumber);
    if (!selectedAnswer) {
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: from,
            type: 'text',
            text: {
                body: 'Por favor, selecione pelo menos uma opção válida.',
            },
        }, currentConversation.store.wabaEnvironments);
        return;
    }
    console.log(`Resposta selecionada: ${selectedAnswer.answerName}`);
    // Adicionar a resposta ao array de respostas selecionadas
    selectedAnswers.push(selectedAnswer.answerId.toString());
    console.log('Respostas selecionadas atualizadas:', selectedAnswers);
    // Atualizar a conversa com as respostas selecionadas
    await (0, conversationController_1.updateConversation)(currentConversation, {
        selectedAnswers,
    });
    // Atualizar o cartItems com as respostas selecionadas
    const updatedCartItems = currentConversation.cartItems || [];
    const existingCartItem = updatedCartItems.find(item => item.id === product.id);
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
    await (0, conversationController_1.updateConversation)(currentConversation, {
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
    if (!currentConversation.store?.wabaEnvironments) {
        (0, messagingService_1.notifyAdmin)('Erro: currentConversation.store.wabaEnvironments não está definido.');
        return;
    }
    const rows = question.answers?.map((answer) => ({
        id: `answer_${answer.answerId}`,
        title: answer.answerName?.slice(0, 20) || '',
        description: answer.price
            ? `Preço adicional: R$ ${answer.price.toFixed(2)}`
            : 'Sem custo adicional',
    }));
    if (!rows || rows.length === 0) {
        (0, messagingService_1.notifyAdmin)('Erro: Nenhuma resposta disponível para a pergunta.');
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: to,
            type: 'text',
            text: {
                body: 'Desculpe, ocorreu um erro ao processar a pergunta. Tente novamente.',
            },
        }, currentConversation.store.wabaEnvironments);
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
    // Verificar se há mais respostas a serem enviadas
    const selectedAnswersCount = currentConversation.selectedAnswers?.length || 0;
    const maxAnswers = question.maxAnswerRequired || Infinity;
    const hasMoreAnswers = selectedAnswersCount < maxAnswers - 1;
    // Ajustar a mensagem com base na existência de mais respostas
    const bodyText = hasMoreAnswers
        ? 'Selecione uma das opções abaixo. Você poderá escolher mais respostas em mensagens seguintes.'
        : 'Selecione a última opção abaixo para concluir sua escolha.';
    // Enviar a lista inicial de opções
    await (0, messagingService_1.sendMessage)({
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
                text: bodyText,
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
    }, currentConversation.store.wabaEnvironments);
    // Atualizar o fluxo para processar as respostas
    await (0, conversationController_1.updateConversation)(currentConversation, {
        flow: 'CHECKBOX_QUESTION',
        currentQuestionId: question.questionId,
    });
    // console.log('Pergunta do tipo CHECKBOX enviada ao cliente.');
}
async function redirectToOrderSummary(from, currentConversation) {
    if (!currentConversation.docId) {
        return;
    }
    if (!currentConversation.store?.wabaEnvironments) {
        (0, messagingService_1.notifyAdmin)('Erro: currentConversation.store.wabaEnvironments não está definido.');
        return;
    }
    if (!currentConversation.store?.slug) {
        // TODO: handle
        // If store is not found, we need to handle this case
        (0, messagingService_1.notifyAdmin)('Store parameter is missing');
        throw new Error('Parâmetro da loja não encontrado.');
    }
    const store = await (0, storeController_1.getStore)(currentConversation.store?.slug);
    if (!store) {
        (0, messagingService_1.notifyAdmin)('Erro: Loja não encontrada.');
        (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: from,
            type: 'text',
            text: {
                body: 'Desculpe, loja não encontrada. Por favor, tente novamente mais tarde.',
            },
        }, currentConversation.store.wabaEnvironments);
        return;
    }
    if (!currentConversation.cartItems || currentConversation.cartItems.length === 0) {
        // console.log('Carrinho vazio ou conversa não encontrada.');
        if (currentConversation.flow === 'PRODUCT_QUANTITY') {
            const product = currentConversation.product;
            if (!product) {
                (0, messagingService_1.notifyAdmin)('Erro: Nenhum produto encontrado no fluxo PRODUCT_QUANTITY.');
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
            await (0, messagingService_1.sendMessage)({
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
            }, currentConversation.store.wabaEnvironments);
            // console.log('Mensagem de seleção de quantidade enviada ao cliente.');
            return;
        }
        // console.log('Redirecionando para o menu de categorias...');
        console.log('CURRENT FLOW:', currentConversation.flow);
        // if (currentConversation.flow === 'CATEGORIES') {
        //   const textBody = `Seu carrinho está vazio. Por favor, adicione produtos antes de finalizar a compra.`;
        //   await sendMessage({
        //     messaging_product: 'whatsapp',
        //     to: from,
        //     type: 'text',
        //     text: {
        //       body: textBody,
        //     },
        //   }, currentConversation.store.wabaEnvironments);
        // }
        // Atualizar o fluxo da conversa para "CATEGORIES"
        await (0, conversationController_1.updateConversation)(currentConversation, {
            flow: 'CATEGORIES',
        });
        if (currentConversation.store?.slug) {
            const store = await (0, storeController_1.getStore)(currentConversation.store?.slug);
            // Enviar lista de categorias
            if (store?.categories && store?.menu) {
                await (0, catalogService_1.sendCategoriesMessage)(from, store.categories, store.menu, currentConversation.store.wabaEnvironments, currentConversation);
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
        const deliveryPrice = store?.deliveryPrice || 0;
        const totalWithDelivery = totalPrice + deliveryPrice;
        // Obter o endereço selecionado
        const address = currentConversation.address?.name || 'Endereço não informado';
        // Atualizar o fluxo para ORDER_SUMMARY
        await (0, conversationController_1.updateConversation)(currentConversation, {
            flow: 'ORDER_SUMMARY',
            totalPrice,
            selectedAnswers: [],
        });
        // Gerar a mensagem de resumo do pedido
        const summaryMessage = `
RESUMO DO PEDIDO:
${cartSummary}
Entrega: R$ ${deliveryPrice.toFixed(2)}
TOTAL GERAL: R$ ${totalWithDelivery.toFixed(2)}

Endereço de entrega:
${address}

Escolha uma das opções abaixo:
    `;
        console.log('Resumo do pedido:', summaryMessage);
        // Assegurar que o resumo do pedido não exceda 1024 caracteres
        if (summaryMessage.length > 1024) {
            (0, messagingService_1.notifyAdmin)('Resumo do pedido excede o limite de 1024 caracteres.');
            await (0, messagingService_1.sendMessage)({
                messaging_product: 'whatsapp',
                to: from,
                type: 'text',
                text: {
                    body: 'Desculpe, o resumo do pedido é muito longo para ser enviado por completo. Por favor, entre em contato com a loja.',
                },
            }, currentConversation.store.wabaEnvironments);
            return;
        }
        // Enviar mensagem com os botões de ação
        await (0, messagingService_1.sendMessage)({
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
                                title: 'Alterar ou Excluir',
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
        }, currentConversation.store.wabaEnvironments);
        // console.log('Resumo do pedido enviado ao cliente.');
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao redirecionar para ORDER_SUMMARY:', error.message);
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: from,
            type: 'text',
            text: {
                body: 'Desculpe, ocorreu um erro ao processar o resumo do pedido. Por favor, tente novamente mais tarde.',
            },
        }, currentConversation.store.wabaEnvironments);
    }
}
async function handleCollectCustomQuantityFlow(from, text, currentConversation) {
    if (!currentConversation.store?.wabaEnvironments) {
        (0, messagingService_1.notifyAdmin)('Erro: currentConversation.store.wabaEnvironments não está definido.');
        return;
    }
    if (!currentConversation.docId) {
        (0, messagingService_1.notifyAdmin)('Erro: currentConversation.docId não está definido.');
        const reply = `Desculpe, ocorreu um erro ao processar seu pedido. Por favor, tente novamente.`;
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: '+' + from,
            type: 'text',
            text: { body: reply },
        }, currentConversation.store.wabaEnvironments);
        return;
    }
    // Tentar converter o texto para um número inteiro
    const quantity = parseInt(text, 10);
    // Verificar se a quantidade é válida
    if (isNaN(quantity) || quantity <= 0) {
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: '+' + from,
            type: 'text',
            text: {
                body: 'Por favor, informe uma quantidade válida (número inteiro maior que zero).',
            },
        }, currentConversation.store.wabaEnvironments);
        return;
    }
    // Atualizar o carrinho com a quantidade digitada
    const updatedCartItems = currentConversation.cartItems || [];
    const existingCartItem = currentConversation.product?.questions?.length ?
        updatedCartItems.find((item) => item.id === currentConversation.productBeingAnswered)
        : updatedCartItems.find((item) => item.menuId === currentConversation.product?.menuId);
    if (existingCartItem) {
        existingCartItem.quantity += quantity;
    }
    else {
        updatedCartItems.push({
            ...currentConversation.product,
            quantity,
        });
    }
    // Atualizar a conversa com o carrinho atualizado
    await (0, conversationController_1.updateConversation)(currentConversation, {
        cartItems: updatedCartItems,
    });
    // Redirecionar para o resumo do pedido
    await (0, messagingService_1.sendMessage)({
        messaging_product: 'whatsapp',
        to: '+' + from,
        type: 'text',
        text: {
            body: 'Quantidade adicionada ao carrinho com sucesso! Redirecionando para o resumo do pedido...',
        },
    }, currentConversation.store.wabaEnvironments);
    // Redirecionar para o resumo do pedido
    await redirectToOrderSummary(from, currentConversation);
}
async function handleEditCartItems(from, currentConversation) {
    console.log('Handling edit cart items for:', from);
    if (!currentConversation.store?.wabaEnvironments) {
        (0, messagingService_1.notifyAdmin)('Erro: currentConversation.store.wabaEnvironments não está definido.');
        return;
    }
    // Verificar consistência do docId
    if (!currentConversation.docId) {
        (0, messagingService_1.notifyAdmin)('Erro: currentConversation.docId não está definido.');
        const reply = `Desculpe, ocorreu um erro ao processar seu pedido. Por favor, tente novamente.`;
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: '+' + from,
            type: 'text',
            text: { body: reply },
        }, currentConversation.store.wabaEnvironments);
        return;
    }
    const cartItems = currentConversation.cartItems || [];
    if (cartItems.length === 1) {
        // Se houver apenas um item no carrinho, enviar a mensagem diretamente
        const singleItem = cartItems[0];
        // console.log('Apenas um item no carrinho:', singleItem);
        // Salvar o índice do item na conversa
        await (0, conversationController_1.updateConversation)(currentConversation, {
            flow: 'EDIT_CART_ACTION',
            selectedItemIndex: 0, // Índice do único item
        });
        // Enviar mensagem com as opções "Alterar Quantidade" e "Excluir Item"
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: '+' + from,
            type: 'interactive',
            interactive: {
                type: 'button',
                body: {
                    text: `O que você deseja fazer com "${singleItem.menuName}"?`,
                },
                action: {
                    buttons: [
                        {
                            type: 'reply',
                            reply: {
                                id: `edit_quantity_0`,
                                title: 'Alterar Quantidade',
                            },
                        },
                        {
                            type: 'reply',
                            reply: {
                                id: `remove_item_0`,
                                title: 'Excluir Item',
                            },
                        },
                        {
                            type: 'reply',
                            reply: {
                                id: `cancel_add_remove`,
                                title: 'Cancelar Alteração',
                            },
                        },
                    ],
                },
            },
        }, currentConversation.store.wabaEnvironments);
        // console.log('Mensagem enviada diretamente para o único item no carrinho.');
        return;
    }
    if (cartItems.length === 0) {
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: '+' + from,
            type: 'text',
            text: {
                body: 'Seu carrinho está vazio. Por favor, adicione itens antes de tentar alterá-los.',
            },
        }, currentConversation.store.wabaEnvironments);
        return;
    }
    // Gerar a lista de itens do carrinho para o cliente escolher
    const cartItemsList = cartItems.map((item, index) => ({
        id: `item_${index}`, // ID único para cada item
        title: item.menuName,
        description: `Quantidade: ${item.quantity} | Total: R$ ${(item.price * item.quantity).toFixed(2)}`,
    }));
    // Adicionar uma opção para cancelar a alteração
    cartItemsList.push({
        id: 'cancel_edit',
        title: 'Cancelar',
        description: 'Voltar ao menu anterior.',
    });
    // Enviar a lista de itens para o cliente
    await sendCartItemsListResponse(from, cartItemsList, currentConversation.store.wabaEnvironments);
    // Atualizar o fluxo da conversa para "EDIT_CART_ITEM"
    await (0, conversationController_1.updateConversation)(currentConversation, {
        flow: 'EDIT_CART_ITEM',
    });
}
async function handleDeleteCartItem(from, buttonReplyId, currentConversation) {
    if (!currentConversation.store?.wabaEnvironments) {
        (0, messagingService_1.notifyAdmin)('Erro: currentConversation.store.wabaEnvironments não está definido.');
        return;
    }
    // Verificar consistência do docId
    if (!currentConversation.docId) {
        (0, messagingService_1.notifyAdmin)('Erro: currentConversation.docId não está definido.');
        const reply = `Desculpe, ocorreu um erro ao processar seu pedido. Por favor, tente novamente.`;
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: '+' + from,
            type: 'text',
            text: { body: reply },
        }, currentConversation.store.wabaEnvironments);
        return;
    }
    // Recuperar o índice do item selecionado
    const removeItemIndex = parseInt(buttonReplyId.replace('remove_item_', ''), 10);
    const itemToRemove = currentConversation.cartItems?.[removeItemIndex];
    if (!itemToRemove) {
        (0, messagingService_1.notifyAdmin)('Item selecionado para exclusão não encontrado no carrinho.');
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: '+' + from,
            type: 'text',
            text: {
                body: 'Desculpe, o item selecionado não foi encontrado no carrinho. Por favor, tente novamente.',
            },
        }, currentConversation.store.wabaEnvironments);
        return;
    }
    // Salvar o índice do item na conversa e atualizar o fluxo
    await (0, conversationController_1.updateConversation)(currentConversation, {
        flow: 'WAITING_DELETE_CONFIRMATION',
        selectedItemIndex: removeItemIndex, // Salvar o índice do item a ser excluído
    });
    // Enviar mensagem de confirmação ao cliente
    await (0, messagingService_1.sendMessage)({
        messaging_product: 'whatsapp',
        to: '+' + from,
        type: 'interactive',
        interactive: {
            type: 'button',
            body: {
                text: `Você tem certeza de que deseja excluir o item "${itemToRemove.menuName}" do seu carrinho?`,
            },
            action: {
                buttons: [
                    {
                        type: 'reply',
                        reply: {
                            id: 'confirm_delete',
                            title: 'Sim',
                        },
                    },
                    {
                        type: 'reply',
                        reply: {
                            id: 'cancel_delete',
                            title: 'Não',
                        },
                    },
                ],
            },
        },
    }, currentConversation.store.wabaEnvironments);
    console.log('Mensagem de confirmação enviada ao cliente.');
}
async function handleAlterItemQuantity(from, buttonReplyId, currentConversation) {
    if (!currentConversation.store?.wabaEnvironments) {
        (0, messagingService_1.notifyAdmin)('Erro: currentConversation.store.wabaEnvironments não está definido.');
        return;
    }
    // Verificar consistência do docId
    if (!currentConversation.docId) {
        (0, messagingService_1.notifyAdmin)('Erro: currentConversation.docId não está definido.');
        const reply = `Desculpe, ocorreu um erro ao processar seu pedido. Por favor, tente novamente.`;
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: '+' + from,
            type: 'text',
            text: { body: reply },
        }, currentConversation.store.wabaEnvironments);
        return;
    }
    // Recuperar o índice do item selecionado
    const editItemIndex = parseInt(buttonReplyId.replace('edit_quantity_', ''), 10);
    const itemToEdit = currentConversation.cartItems?.[editItemIndex];
    if (!itemToEdit) {
        (0, messagingService_1.notifyAdmin)('Item selecionado para alteração não encontrado no carrinho.');
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: '+' + from,
            type: 'text',
            text: {
                body: 'Desculpe, o item selecionado não foi encontrado no carrinho. Por favor, tente novamente.',
            },
        }, currentConversation.store.wabaEnvironments);
        return;
    }
    // Criar as opções de quantidade (1 a 10)
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
    await (0, messagingService_1.sendMessage)({
        messaging_product: 'whatsapp',
        to: '+' + from,
        type: 'interactive',
        interactive: {
            type: 'list',
            header: {
                type: 'text',
                text: `Quantas unidades de "${itemToEdit.menuName}" você deseja?`,
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
    }, currentConversation.store.wabaEnvironments);
    // Atualizar o fluxo para "EDIT_ITEM_QUANTITY"
    await (0, conversationController_1.updateConversation)(currentConversation, {
        flow: 'EDIT_ITEM_QUANTITY',
        selectedItemIndex: editItemIndex,
    });
    console.log('Lista de quantidades enviada ao cliente para alterar a quantidade do item.');
}
// Função helper para truncar texto com "..."
function truncateText(text, maxLength) {
    if (text.length <= maxLength)
        return text;
    return text.substring(0, maxLength - 3) + "...";
}
function buildCartTableString(store, cartItems, deliveryAddress) {
    let totalGeral = 0;
    let tableLines = [];
    // Header dos itens
    // tableLines.push("📦 **ITENS DO PEDIDO:**");
    cartItems.forEach((item, index) => {
        let respostasStr = "";
        let totalItemUnit = item.price;
        if (item.questions && item.questions.length > 0) {
            const respostasArray = [];
            item.questions.forEach((q) => {
                if (q.answers && q.answers.length > 0) {
                    const answers = q.answers.map((a) => {
                        const answerQty = a.quantity ?? 1;
                        const answerPrice = a.price ?? 0;
                        const totalAnswerPrice = answerPrice * answerQty;
                        totalItemUnit += totalAnswerPrice;
                        return a.price && a.price > 0 ?
                            `${truncateText(a.answerName, 15)} ${item.quantity > 1 ? `R$ ${((a.price || 0)).toFixed(2)}` : ''} → R$${((a.price || 0) * item.quantity).toFixed(2)}` :
                            `${truncateText(a.answerName, 15)}`;
                    });
                    respostasArray.push(`${truncateText(q.questionName, 15)} ${answers.join(', ')}`);
                }
            });
            respostasStr = respostasArray.join('\n');
        }
        const totalItem = totalItemUnit * item.quantity;
        totalGeral += totalItem;
        // Item com formatação compacta
        const itemLine = `${item.quantity} ${truncateText(item.menuName, 20)} - R$ ${item.price.toFixed(2)} → R$ ${(item.price * item.quantity).toFixed(2)}`;
        tableLines.push(itemLine);
        if (respostasStr)
            tableLines.push(`${respostasStr}`);
        // Separador sutil entre itens (exceto no último)
        if (index < cartItems.length - 1) {
            // tableLines.push("───────────────────────────────");
        }
    });
    const deliveryPrice = store?.deliveryPrice || 0;
    const totalWithDelivery = totalGeral + deliveryPrice;
    // Resumo financeiro compacto
    tableLines.push("───────────────────────────────");
    tableLines.push(`R$ ${totalGeral.toFixed(2)} + Entrega: R$ ${deliveryPrice.toFixed(2)} = **R$ ${totalWithDelivery.toFixed(2)}**`);
    tableLines.push("───────────────────────────────");
    // Endereço de entrega compacto
    if (deliveryAddress) {
        tableLines.push("📍 *" + deliveryAddress + "*");
        tableLines.push("───────────────────────────────");
    }
    return tableLines;
}
// Função auxiliar para converter imagem para base64
async function convertImageToBase64(imageUrl) {
    if (!imageUrl)
        return "";
    try {
        const response = await fetch(imageUrl);
        if (!response.ok)
            throw new Error(`Erro ao buscar imagem: ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        return buffer.toString('base64');
    }
    catch (error) {
        console.error('Erro ao converter imagem para Base64:', error);
        return "";
    }
}
async function buildCartRichTextTable(store, cartItems, deliveryAddress) {
    let totalGeral = 0;
    let markdown = "# 🛒 Carrinho de Compras\n\n";
    // markdown += "## 📦 Itens do Pedido\n\n";
    // Processar cada item com sua imagem
    for (const item of cartItems) {
        let totalItemUnit = item.price;
        // Calcular preços adicionais das perguntas
        if (item.questions && item.questions.length > 0) {
            item.questions.forEach((q) => {
                if (q.answers && q.answers.length > 0) {
                    q.answers.forEach((a) => {
                        const answerQty = a.quantity ?? 1;
                        const answerPrice = a.price ?? 0;
                        totalItemUnit += answerPrice * answerQty;
                    });
                }
            });
        }
        const totalItem = totalItemUnit * item.quantity;
        totalGeral += totalItem;
        // Converter imagem para base64 se disponível
        const imageBase64 = await convertImageToBase64(item.menuImageUrl);
        // Adicionar imagem se disponível
        if (imageBase64) {
            markdown += `![${item.menuName}](data:image/png;base64,${imageBase64})\n\n`;
        }
        // Tabela do item específico
        markdown += `### ${item.menuName}\n\n`;
        markdown += "| Descrição | Preço Unit. | Qtd | Total |\n";
        markdown += "|-----------|-------------|-----|-------|\n";
        const productName = truncateText(item.menuName, 25);
        markdown += `| **${productName}** | R$ ${item.price.toFixed(2)} | ${item.quantity} | **R$ ${totalItem.toFixed(2)}** |\n`;
        // Sub-tabela para perguntas e respostas
        if (item.questions && item.questions.length > 0) {
            markdown += `| *Personalizações:* | | | |\n`;
            item.questions.forEach((q) => {
                if (q.answers && q.answers.length > 0) {
                    const questionName = truncateText(q.questionName, 20);
                    markdown += `| └ **${questionName}** | | | |\n`;
                    q.answers.forEach((a) => {
                        const answerQty = a.quantity ?? 1;
                        const answerPrice = a.price ?? 0;
                        const answerTotal = answerPrice * answerQty * item.quantity;
                        const answerName = truncateText(a.answerName, 20);
                        if (answerPrice > 0) {
                            markdown += `| └─ ${answerName} | R$ ${answerPrice.toFixed(2)} | ${answerQty}x${item.quantity} | R$ ${answerTotal.toFixed(2)} |\n`;
                        }
                        else {
                            markdown += `| └─ ${answerName} | - | ${answerQty}x${item.quantity} | - |\n`;
                        }
                    });
                }
            });
        }
        markdown += "\n---\n\n";
    }
    const deliveryPrice = store?.deliveryPrice || 0;
    const totalWithDelivery = totalGeral + deliveryPrice;
    // Resumo financeiro
    markdown += "## 💰 RESUMO DO PEDDIDO\n\n";
    markdown += "| Descrição | Valor |\n";
    markdown += "|-----------|-------|\n";
    markdown += `| Subtotal | R$ ${totalGeral.toFixed(2)} |\n`;
    markdown += `| Taxa de Entrega | R$ ${deliveryPrice.toFixed(2)} |\n`;
    markdown += `| **TOTAL GERAL** | **R$ ${totalWithDelivery.toFixed(2)}** |\n`;
    // Endereço de entrega
    if (deliveryAddress) {
        // markdown += "\n## 📍 Endereço de Entrega\n\n";
        markdown += `**${deliveryAddress}**\n`;
    }
    // Instruções
    markdown += "\n---\n\n";
    markdown += "💡 **OPÇÕES DISPONÍVEIS:**\n";
    markdown += "• **Finalizar Compra** - *Prosseguir para pagamento*\n";
    markdown += "• **Adicionar Mais Itens** - *Voltar ao catálogo*\n";
    markdown += "• **Alterar/Excluir Itens** - *Modificar seu pedido*\n\n";
    markdown += "⚠️ **Use essas opções antes de clicar em Avançar!**";
    return markdown;
}
// Função para converter RichText Markdown para array de strings formatadas
async function buildCartTableStringFromRichText(store, cartItems, deliveryAddress) {
    const richTextContent = await buildCartRichTextTable(store, cartItems, deliveryAddress);
    // Converter o Markdown para array de strings formatadas
    const lines = richTextContent.split('\n');
    const formattedLines = [];
    let isFirstItem = true;
    let currentQuestionName = '';
    for (const line of lines) {
        const trimmedLine = line.trim();
        // Pular linhas vazias, imagens base64 e separadores markdown
        if (!trimmedLine || trimmedLine === '---' || trimmedLine.startsWith('![')) {
            continue;
        }
        // Converter headers - remover título principal "Carrinho de Compras"
        if (trimmedLine.startsWith('# ')) {
            // Pular o título principal
            continue;
        }
        else if (trimmedLine.startsWith('## ')) {
            const sectionTitle = trimmedLine.replace('## ', '').replace('📦 ', '').replace('💰 ', '').replace('📍 ', '');
            // Adicionar separador antes de cada seção
            formattedLines.push('═══════════════════');
            if (sectionTitle.includes(' RESUMO')) {
                formattedLines.push(`💰 **${sectionTitle}**`);
            }
            else if (sectionTitle.includes('Endereço')) {
                formattedLines.push(`📍 **${sectionTitle}**`);
            }
            else {
                formattedLines.push(`📦 **${sectionTitle}**`);
            }
        }
        else if (trimmedLine.startsWith('### ')) {
            // Pular a linha com nome do produto e dois pontos (ex: "Gas Industrial:")
            continue;
        }
        // Converter tabelas para formato de lista
        else if (trimmedLine.startsWith('|') && !trimmedLine.includes('---')) {
            const cells = trimmedLine.split('|').map(cell => cell.trim()).filter(cell => cell);
            // Pular headers de tabela  
            if (cells.includes('Descrição') || cells.includes('Produto') || cells.includes('Valor')) {
                continue;
            }
            // Processar linhas da tabela
            if (cells.length >= 4) {
                const [desc, price, qty, total] = cells;
                if (desc.startsWith('**') && desc.endsWith('**')) {
                    // Item principal - adicionar linha tracejada entre itens (exceto o primeiro)
                    if (!isFirstItem) {
                        formattedLines.push('- - - - - - - - - - - - - - -');
                    }
                    isFirstItem = false;
                    const itemName = desc.replace(/\*\*/g, '');
                    const itemQty = qty;
                    const itemTotal = total.replace(/\*\*/g, '');
                    formattedLines.push(`**${itemQty}x ${itemName}** - ${itemTotal}`);
                }
                else if (desc.startsWith('└─')) {
                    // Personalização - mostrar resposta com nome da pergunta
                    const customName = desc.replace('└─ ', '');
                    if (price !== '-' && total !== '-') {
                        formattedLines.push(`  **${customName}** - ${qty} (${price})`);
                    }
                    else {
                        formattedLines.push(`  **${customName}** - ${qty}`);
                    }
                }
                else if (desc.includes('Personalizações')) {
                    // Pular linha de personalizações
                    continue;
                }
                else if (desc.startsWith('└ **')) {
                    // Capturar nome da pergunta para usar nas respostas
                    currentQuestionName = desc.replace('└ **', '').replace('**', '');
                    formattedLines.push(`  *${currentQuestionName}:*`);
                }
            }
            else if (cells.length === 2) {
                // Resumo financeiro
                const [label, value] = cells;
                if (label.includes('TOTAL GERAL')) {
                    formattedLines.push(`💰 **${label.replace(/\*\*/g, '')}: ${value.replace(/\*\*/g, '')}**`);
                }
                else if (!label.includes('Subtotal') && !label.includes('Taxa')) {
                    continue;
                }
                else {
                    formattedLines.push(`*${label}:* ${value}`);
                }
            }
        }
        // Endereço de entrega
        else if (trimmedLine.startsWith('**') && !trimmedLine.includes('|')) {
            formattedLines.push(`📍 **Endereço:** ${trimmedLine.replace(/\*\*/g, '')}`);
        }
        // Remover seção de instruções/opções disponíveis
        else if (trimmedLine.includes('OPÇÕES DISPONÍVEIS') ||
            trimmedLine.startsWith('• **') ||
            trimmedLine.includes('Use essas opções')) {
            continue;
        }
    }
    // Adicionar separador final após endereço
    formattedLines.push('═══════════════════');
    return formattedLines.filter(line => line !== undefined);
}
