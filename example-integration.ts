// Exemplo de como usar o novo endpoint de envio de mensagens WhatsApp
// após mover um pedido para o próximo estágio

import axios from 'axios';

// Função que pode ser chamada após moveOrderToNextFlow
export const notifyOrderStageChange = async (
  orderId: string,
  customerPhoneNumbers: string[],
  currentStage: string,
  storeName: string,
  wabaEnvironments: any,
  baseUrl: string = 'http://localhost:5000' // URL base da sua API
) => {
  try {
    const messageData = {
      phoneNumbers: customerPhoneNumbers,
      message: currentStage, // A mensagem base será formatada automaticamente
      wabaEnvironments,
      formatType: 'order-status', // Usar formatação especial para status de pedido
      orderId,
      currentStage,
      storeName
    };

    const response = await axios.post(
      `${baseUrl}/bots/messages/send-whatsapp-message`, 
      messageData
    );

    console.log('✅ Mensagens de notificação enviadas:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('❌ Erro ao enviar mensagens de notificação:', error);
    throw error;
  }
};

// Exemplo de uso no workflow
export const exampleWorkflowIntegration = async () => {
  try {
    // 1. Mover pedido para próximo estágio
    const moveResponse = await axios.post('/bots/workflow/move-to-next-flow', {
      orderId: 'ORD-123',
      fromFlowId: 1,
      toFlowId: 2,
      minutes: 30,
      storeId: 'store-abc'
    });

    if (moveResponse.data.success) {
      // 2. Enviar notificação para o cliente
      await notifyOrderStageChange(
        'ORD-123',
        ['+5511999999999'], // Números do cliente
        'Em produção',
        'Pizzaria do João',
        {
          wabaPhoneNumberId: 'your-phone-number-id',
          wabaAccessToken: 'your-access-token'
        }
      );
    }
  } catch (error) {
    console.error('Erro na integração workflow + mensagem:', error);
  }
};

// Exemplo de mensagem customizada simples
export const sendCustomMessage = async (
  phoneNumbers: string[],
  message: string,
  wabaEnvironments: any
) => {
  try {
    const response = await axios.post('/bots/messages/send-whatsapp-message', {
      phoneNumbers,
      message,
      wabaEnvironments,
      formatType: 'text' // Texto simples sem formatação especial
    });

    return response.data;
  } catch (error: any) {
    console.error('Erro ao enviar mensagem customizada:', error);
    throw error;
  }
};