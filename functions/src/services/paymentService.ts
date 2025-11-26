import axios from 'axios';
import { getConversationByDocId, updateConversation } from '../controllers/conversationController';
import { notifyAdmin, sendMessage } from './messagingService';
import { Conversation } from '../types/Conversation';
import { getStore } from '../controllers/storeController';

interface PagarMeCallback {
  id: string;
  status: string;
  metadata: {
    conversationId: string;
  };
}

// Função para gerar um link de pagamento
export const generatePaymentLink = async (
  conversation: Conversation,
  totalPrice: number
): Promise<string> => {
  if (!conversation.address) {
    throw new Error('Endereço não encontrado na conversa.');
  }
  if (!conversation.cartItems || conversation.cartItems.length === 0) {
    throw new Error('Nenhum item no carrinho.');
  }
  if (!totalPrice || totalPrice <= 0) {
    throw new Error('Valor total inválido.');
  }
  if (!process.env.PAGARME_API_SECRET || !process.env.PAGARME_API_URL) {
    throw new Error('Configuração do Pagar.me não encontrada.');
  }
  if (!conversation.phoneNumber) {
    throw new Error('Número de telefone do cliente não encontrado.');
  }

  if (!conversation.store?.slug) {
    // TODO: Adicionar tratamento de erro
    throw new Error('Configuração do slug da loja não encontrada.');
  }

  // Get storef 
  const store = await getStore(conversation.store?.slug);
  if (!store) {
    // TODO: Adicionar tratamento de erro
    throw new Error('Loja não encontrada.');
  }


  try {
    // Configurar Basic Auth
    const headers = {
      Authorization: `Basic ${Buffer.from(`${process.env.PAGARME_API_SECRET}:`).toString('base64')}`,
    };

    console.log('Headers enviados na requisição:', headers);

    // Calcular o total detalhado para cada item no carrinho
    const cartItems = conversation.cartItems.map((item) => {
      const basePrice = item.price;
      const answersTotal = item.questions?.reduce((sum, question) => {
        const selectedAnswers = question.answers || [];
        return sum + selectedAnswers.reduce((answerSum, answer) => answerSum + (answer.price || 0), 0);
      }, 0) || 0;

      const totalItemPrice = basePrice + answersTotal;

      return {
        name: item.menuName,
        amount: Math.round(totalItemPrice * 100), // Valor em centavos
        default_quantity: item.quantity || 1,
      };
    });


    // Gerar o payload para o Pagar.me
    const response = await axios.post(
      `${process.env.PAGARME_API_URL}/paymentlinks`,
      {
        is_building: false,
        type: 'order',
        payment_settings: {
          accepted_payment_methods: ['CREDIT_CARD', 'BOLETO', 'PIX'],
          credit_card_settings: {
            operation_type: 'auth_and_capture',
            installments: [
              { number: 1, total: Math.round(totalPrice * 100) },
              { number: 2, total: Math.round(totalPrice * 100) },
              { number: 3, total: Math.round(totalPrice * 100) },
            ],
          },
          boleto_settings: {
            due_in: 3, // Dias para vencimento do boleto
          },
          pix_settings: {
            expires_in: 1440, // Expiração do PIX em minutos (1 dia)
          },
        },
        cart_settings: {
          items: cartItems,
        },
      },
      {
        headers,
      }
    );

    console.log('Link de pagamento gerado:', response.data.url);
    return response.data.url;
  } catch (error: any) {
    notifyAdmin('Erro ao gerar link de pagamento:', error.response?.data || error.message);
    throw new Error('Erro ao gerar link de pagamento.');
  }
};

// Função para tratar o callback do Pagar.me
export const handlePagarMeCallback = async (callbackData: PagarMeCallback): Promise<void> => {
  try {
    const { id, status, metadata } = callbackData;

    console.log('Callback recebido do Pagar.me:', callbackData);

    // Recuperar o ID da conversa
    const conversationId = metadata.conversationId;

    if (!conversationId) {
      notifyAdmin('ID da conversa não encontrado no callback.');
      return;
    }

    const currentConversation = await getConversationByDocId(conversationId);
    if (!currentConversation) {
      notifyAdmin('Conversa não encontrada para o ID:', conversationId);
      return;
    }


    if (!currentConversation.store?.wabaEnvironments) {
      notifyAdmin('Erro: currentConversation.store.wabaEnvironments não está definido.');
      return;
    }

    // Atualizar o status do pedido na conversa
    await updateConversation(currentConversation, {
      paymentStatus: status,
    });

    // Informar o usuário sobre o status do pagamento
    const message =
      status === 'paid'
        ? 'Pagamento confirmado! Seu pedido está sendo processado.'
        : status === 'refused'
          ? 'Pagamento recusado. Por favor, tente novamente.'
          : 'Pagamento em análise. Você será notificado assim que for confirmado.';

    await sendMessage({
      messaging_product: 'whatsapp',
      to: conversationId, // Número do telefone do cliente
      type: 'text',
      text: {
        body: message,
      },
    }, currentConversation.store.wabaEnvironments);

    console.log('Usuário informado sobre o status do pagamento:', status);
  } catch (error: any) {
    notifyAdmin('Erro ao processar callback do Pagar.me:', error.response?.data || error.message);
    throw new Error('Erro ao processar callback do Pagar.me.');
  }
};