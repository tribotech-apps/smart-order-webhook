import { updateConversation } from '../controllers/conversationController';
import { sendAddressConfirmation, sendNewAddressMessage } from '../services/addressService';
import { notifyAdmin, sendMessage } from '../services/messagingService';
import { Conversation } from '../types/Conversation';
import { MenuItem, Weekday } from '../types/Store';

export async function handleMakeOrder(
  from: string,
  currentConversation: Conversation,
  currentUser: any
): Promise<void> {

  if (!currentConversation.store?.wabaEnvironments) {
    notifyAdmin('Erro: currentConversation.store.wabaEnvironments não está definido.');
    return
  }

  if (!currentConversation.docId) {
    notifyAdmin('Erro: currentConversation.docId não está definido.');
    const reply = `Desculpe, ocorreu um erro ao processar seu pedido. Por favor, tente novamente.`;
    await sendMessage({
      messaging_product: 'whatsapp',
      to: '+' + from,
      type: 'text',
      text: { body: reply },
    }, currentConversation.store.wabaEnvironments);
    return
  }

  try {
    // Atualizar o fluxo anterior na conversa
    await updateConversation(currentConversation, {
      previousFlow: 'Fazer um Pedido',
    });
  } catch (error) {
    notifyAdmin('Erro ao atualizar a conversa:', error);
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


export async function handleBuySingleProduct(
  from: string,
  currentConversation: Conversation,
  currentUser: any
): Promise<void> {

  if (!currentConversation.store?.wabaEnvironments) {
    notifyAdmin('Erro: currentConversation.store.wabaEnvironments não está definido.');
    return
  }

  if (!currentConversation.docId) {
    notifyAdmin('Erro: currentConversation.docId não está definido.');
    const reply = `Desculpe, ocorreu um erro ao processar seu pedido. Por favor, tente novamente.`;
    await sendMessage({
      messaging_product: 'whatsapp',
      to: '+' + from,
      type: 'text',
      text: { body: reply },
    }, currentConversation.store.wabaEnvironments);
    return
  }

  try {
    // Atualizar o fluxo anterior na conversa
    await updateConversation(currentConversation, {
      previousFlow: currentConversation.store?.singleProductText || 'Fazer um Pedido',
    });
  } catch (error) {
    notifyAdmin('Erro ao atualizar a conversa:', error);
    return;
  }

  if (currentUser?.address) {
    // Usuário já possui um endereço registrado
    try {
      await updateConversation(currentConversation, {
        flow: 'ADDRESS_CONFIRMATION',
      });

      // Enviar mensagem para confirmar o endereço
      await sendAddressConfirmation(from, currentUser.name, currentUser.address?.name, currentConversation.store.wabaEnvironments);
    } catch (error) {
      notifyAdmin('Erro ao enviar mensagem de confirmação de endereço:', error);
    }
  } else {
    // Usuário não possui endereço registrado
    try {
      await updateConversation(currentConversation, {
        flow: 'NEW_ADDRESS',
      });

      // Enviar mensagem solicitando um novo endereço
      await sendNewAddressMessage(from, currentConversation.store.wabaEnvironments);
    } catch (error) {
      notifyAdmin('Erro ao solicitar novo endereço:', error);
    }
  }
}

// Função para filtrar menu baseado no dia da semana
export function filterMenuByWeekday(menu: MenuItem[]): MenuItem[] {
  const today = new Date();
  const currentWeekday = today.getDay() === 0 ? 7 : today.getDay() as Weekday; // Domingo=7, Segunda=1, ..., Sábado=6

  return menu.filter(item => {
    // Se allDays é true, item está sempre disponível
    if (item.allDays) {
      return true;
    }

    // Se allDays é false, verificar se o dia atual está no array weekdays
    if (item.weekdays && Array.isArray(item.weekdays)) {
      return item.weekdays.includes(currentWeekday);
    }

    // Se allDays é false mas não tem weekdays definido, não mostrar o item
    return false;
  });
}

