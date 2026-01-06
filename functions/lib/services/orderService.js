"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleMakeOrder = handleMakeOrder;
exports.handleBuySingleProduct = handleBuySingleProduct;
exports.filterMenuByWeekday = filterMenuByWeekday;
const conversationController_1 = require("../controllers/conversationController");
const addressService_1 = require("../services/addressService");
const messagingService_1 = require("../services/messagingService");
async function handleMakeOrder(from, currentConversation, currentUser) {
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
    try {
        // Atualizar o fluxo anterior na conversa
        await (0, conversationController_1.updateConversation)(currentConversation, {
            previousFlow: 'Fazer um Pedido',
        });
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao atualizar a conversa:', error);
        return;
    }
    console.log('Inicio tratamento endereco no handleMakeOrder');
    // if (currentUser?.address) {
    //   // Usuário já possui um endereço registrado
    //   try {
    //     await updateConversation(currentConversation, {
    //       flow: 'ADDRESS_CONFIRMATION',
    //     });
    //     // Enviar mensagem para confirmar o endereço
    //     await sendAddressConfirmation(from, currentUser.name, currentUser.address?.name, currentConversation.store.wabaEnvironments);
    //   } catch (error) {
    //     notifyAdmin('Erro ao enviar mensagem de confirmação de endereço:', error);
    //   }
    // } else {
    //   // Usuário não possui endereço registrado
    //   try {
    //     await updateConversation(currentConversation, {
    //       flow: 'NEW_ADDRESS',
    //     });
    //     // Enviar mensagem solicitando um novo endereço
    //     await sendNewAddressMessage(from, currentConversation.store.wabaEnvironments);
    //   } catch (error) {
    //     notifyAdmin('Erro ao solicitar novo endereço:', error);
    //   }
    // }
}
async function handleBuySingleProduct(from, currentConversation, currentUser) {
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
    try {
        // Atualizar o fluxo anterior na conversa
        await (0, conversationController_1.updateConversation)(currentConversation, {
            previousFlow: currentConversation.store?.singleProductText || 'Fazer um Pedido',
        });
    }
    catch (error) {
        (0, messagingService_1.notifyAdmin)('Erro ao atualizar a conversa:', error);
        return;
    }
    if (currentUser?.address) {
        // Usuário já possui um endereço registrado
        try {
            await (0, conversationController_1.updateConversation)(currentConversation, {
                flow: 'ADDRESS_CONFIRMATION',
            });
            // Enviar mensagem para confirmar o endereço
            await (0, addressService_1.sendAddressConfirmation)(from, currentUser.name, currentUser.address?.name, currentConversation.store.wabaEnvironments);
        }
        catch (error) {
            (0, messagingService_1.notifyAdmin)('Erro ao enviar mensagem de confirmação de endereço:', error);
        }
    }
    else {
        // Usuário não possui endereço registrado
        try {
            await (0, conversationController_1.updateConversation)(currentConversation, {
                flow: 'NEW_ADDRESS',
            });
            // Enviar mensagem solicitando um novo endereço
            await (0, addressService_1.sendNewAddressMessage)(from, currentConversation.store.wabaEnvironments);
        }
        catch (error) {
            (0, messagingService_1.notifyAdmin)('Erro ao solicitar novo endereço:', error);
        }
    }
}
// Função para filtrar menu baseado no dia da semana
function filterMenuByWeekday(menu) {
    const today = new Date();
    const currentWeekday = today.getDay() === 0 ? 7 : today.getDay(); // Domingo=7, Segunda=1, ..., Sábado=6
    return menu.filter(item => {
        // Se allDays é true, item está sempre disponível
        if (item.allDays) {
            return true;
        }
        console.log('---()---', item.weekdays);
        // Se allDays é false, verificar se o dia atual está no array weekdays
        if (item.weekdays && Array.isArray(item.weekdays)) {
            console.log('---$$$$$$$$$$$$---', item.weekdays.includes(currentWeekday));
            return item.weekdays.includes(currentWeekday);
        }
        // Se allDays é false mas não tem weekdays definido, não mostrar o item
        return false;
    });
}
