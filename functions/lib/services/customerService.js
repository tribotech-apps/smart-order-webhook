"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCustomerNameFlow = handleCustomerNameFlow;
const ordersController_1 = require("../controllers/ordersController");
const conversationController_1 = require("../controllers/conversationController");
const messagingService_1 = require("./messagingService");
const paymentService_1 = require("./paymentService");
async function handleCustomerNameFlow(from, name, currentConversation, store) {
    if (!store.wabaEnvironments) {
        (0, messagingService_1.notifyAdmin)('Erro: Loja não possui WhatsApp configurado.');
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
        }, store.wabaEnvironments);
        return;
    }
    // Verifica se o nome do cliente é válido com o mínimo de 3 caracteres
    if (name.length < 3) {
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: '+' + from,
            type: 'text',
            text: {
                body: 'Por favor, informe um nome válido com pelo menos 3 caracteres.',
            },
        }, store.wabaEnvironments);
        return;
    }
    // // Atualizar o nome do cliente na conversa
    // await updateConversation(currentConversation.docId, {
    //   customerName: name,
    // });
    // currentConversation.customerName = name;
    try {
        // Calcular o preço total considerando os preços das respostas selecionadas
        const totalPrice = currentConversation.cartItems?.reduce((sum, item) => {
            const basePrice = item.price;
            const answersPrice = item.questions?.reduce((answerSum, question) => {
                const selectedAnswers = question.answers || [];
                return answerSum + selectedAnswers.reduce((sum, answer) => sum + (answer.price || 0), 0);
            }, 0) || 0;
            const itemTotal = (basePrice + answersPrice) * item.quantity;
            return sum + itemTotal;
        }, 0);
        if (!totalPrice || totalPrice <= 0) {
            return; // O preço total deve ser maior que 0
        }
        const paymentLink = await (0, paymentService_1.generatePaymentLink)(currentConversation, totalPrice);
        // Simular um ID de pagamento
        const paymentId = `payment-${Date.now()}`;
        // Enviar mensagem com o link de pagamento
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: '+' + from,
            type: 'text',
            text: {
                body: `Seu pedido foi finalizado! Para concluir o pagamento, acesse o link: ${paymentLink}`,
            },
        }, store.wabaEnvironments);
        // Criar o pedido e excluir a conversa
        await (0, ordersController_1.createOrder)(currentConversation, paymentId);
        if (currentConversation.docId) {
            await (0, conversationController_1.deleteConversation)(currentConversation.docId);
        }
        // Enviar mensagem para a loja sobre a compra efetuada
        if (store.whatsappNumber) {
            await (0, messagingService_1.sendMessage)({
                messaging_product: 'whatsapp',
                to: store.whatsappNumber,
                type: 'text',
                text: {
                    body: `Novo pedido recebido de ${currentConversation.customerName} (${currentConversation.phoneNumber}). Total: R$ ${totalPrice.toFixed(2)}`,
                },
            }, store.wabaEnvironments);
        }
    }
    catch (error) {
        // Enviar mensagem de erro ao cliente
        await (0, messagingService_1.sendMessage)({
            messaging_product: 'whatsapp',
            to: '+' + from,
            type: 'text',
            text: {
                body: 'Desculpe, ocorreu um erro ao gerar o link de pagamento. Por favor, tente novamente mais tarde.',
            },
        }, store.wabaEnvironments);
    }
}
