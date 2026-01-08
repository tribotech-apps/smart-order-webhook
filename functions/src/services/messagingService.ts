import axios from 'axios';
import { AxiosHeaders } from 'axios';
import { Client } from '@googlemaps/google-maps-services-js';
import { getStore } from '../controllers/storeController';
import { Store, WABAEnvironments } from '../types/Store';

const client = new Client({});

const ADMIN_PHONE_NUMBER = process.env.ADMIN_PHONE_NUMBER || '+5511910970283'; // Substitua pelo número do administrador

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const sendMessage = async (data: Record<string, any>, wabaEnvironments: WABAEnvironments): Promise<any> => {
  console.log('<><><><><><><><><><><>><><><><><><>', JSON.stringify(data))
  const url = `https://graph.facebook.com/${process.env.WABA_VERSION}/${wabaEnvironments.wabaPhoneNumberId}/messages`;
  console.log('wabaEnvironments', wabaEnvironments);

  // Criar os cabeçalhos corretamente
  const headers = new AxiosHeaders();
  headers.set('Authorization', `Bearer ${wabaEnvironments.wabaAccessToken}`);
  headers.set('Content-Type', 'application/json');

  console.log('Enviando mensagem para o WABA...', JSON.stringify(data));

  try {
    const response = await axios.post(url, data, { headers });
    return response.data;
  } catch (e) {
    console.log('ERROR sendMessage', e)
    return null;
  }

};

export const sendWelcomeMessage = async (
  phoneNumber: string,
  flowToken: string,
  wabaEnvironments: WABAEnvironments,
  store: Store,
  imageUrl?: string,
): Promise<void> => {
  try {
    await sendMessage({
      recipient_type: 'individual',
      messaging_product: 'whatsapp',
      to: '+' + phoneNumber,
      type: 'interactive',
      interactive: {
        type: 'flow',
        header: imageUrl
          ? {
            type: 'image',
            image: {
              link: imageUrl,
            },
          }
          : {
            type: 'text',
            text: store.name,
          },
        body: {
          text: `Olá! Bem-vindo(a) à ${store.name}!\n\nEsse canal é exclusivo para compras pelo WhatsApp. Faça seu pedido de forma rápida e prática através do nosso cardápio digital.`,
        },
        footer: {
          text: 'Agradecemos a preferência!',
        },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_id: store.flowId,
            flow_token: flowToken,
            flow_cta: 'Peça Agora',
          },
        },
      },
    }, wabaEnvironments);
    // Deletar a imagem do WABA após o envio, se ela foi salva
    // if (imageId) {
    //   await deleteImageFromWABA(imageId, wabaEnvironments);
    // }
  } catch (error: any) {
    notifyAdmin('Erro ao enviar mensagem de boas-vindas:', error.response?.data || error.message);
    throw new Error(error.response?.data || error.message);
  }
};

export const sendConfirmationMessage = async (phoneNumber: string, wabaEnvironments: WABAEnvironments): Promise<void> => {
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

  await sendMessage(messagePayload, wabaEnvironments);
};

export const sendDeliveryMessage = async (phoneNumber: string, wabaEnvironments: WABAEnvironments): Promise<void> => {
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

  await sendMessage(messagePayload, wabaEnvironments);
};

export const sendDeliveredMessage = async (phoneNumber: string, wabaEnvironments: WABAEnvironments, orderNumber: string, deliveryOption: 'DELIVERY' | 'COUNTER'): Promise<void> => {

  const body = deliveryOption === 'DELIVERY' ? `Seu pedido ${orderNumber} foi entregue. Obrigado pela confiança, estamos à disposição!` : `Seu pedido ${orderNumber} está disponivel para retirada na loja. Obrigado pela confiança, estamos à disposição!`

  const messagePayload = {
    messaging_product: 'whatsapp',
    to: phoneNumber,
    type: 'text',
    text: {
      body
    }
  };

  await sendMessage(messagePayload, wabaEnvironments);
};

export const sendContactMessage = async (from: string, storeSlug: string, wabaEnvironments: WABAEnvironments): Promise<void> => {

  if (!storeSlug) {
    // TODO: handle
    // If store is not found, we need to handle this case
    notifyAdmin('Store parameter is missing');
    throw new Error('Parâmetro da loja não encontrado.');
  } 1

  const store = await getStore(storeSlug);

  // assegurar que o numero de telefone contenha o simbolo de +
  if (!from.startsWith('+')) {
    from = '+' + from;
  }

  // Enviar uma mensagem de contato para o usuário
  await sendMessage({
    messaging_product: 'whatsapp',
    to: from,

    type: 'contacts',
    contacts: [
      {
        name: {
          formatted_name: "Loja ACME",
          first_name: "Loja",
          last_name: "ACME"
        },
        phones: [
          {
            phone: "+5514997113606", // Número da loja
            type: "CELL"
          }
        ],
        org: {
          company: "Loja ACME",
          title: "Atendimento ao Cliente"
        },
        addresses: [
          {
            street: "Rua das Flores, 123",
            city: "São Paulo",
            state: "SP",
            zip: "01000-000",
            country: "Brasil",
            country_code: "BR",
            type: "WORK"
          }
        ],
        emails: [
          {
            email: "contato@lojaacme.com",
            type: "WORK"
          }
        ],
        urls: [
          {
            url: `https://talkcommerce-2c6e6.firebaseapp.com/${store?.slug}`,
            type: "WORK"
          }
        ]
      }
    ]
  }, wabaEnvironments);
};


export const notifyAdmin = async (errorMessage: string, additionalInfo?: any): Promise<void> => {
  try {

    console.error('Notificando administrador:', errorMessage, additionalInfo);

    const messageBody = `⚠️ *Erro no Sistema* ⚠️\n\n${errorMessage}\n\n` +
      (additionalInfo ? `Detalhes: ${JSON.stringify(additionalInfo, null, 2)}` : '');

    // await sendMessage({
    //   messaging_product: 'whatsapp',
    //   to: ADMIN_PHONE_NUMBER,
    //   type: 'text',
    //   text: {
    //     body: messageBody,
    //   },
    // });

    console.error('Erro notificado ao administrador:', errorMessage, additionalInfo);

    console.log('Mensagem de erro enviada ao administrador.');
  } catch (error) {
    notifyAdmin('Erro ao enviar mensagem ao administrador:', error);
  }
};

export function sendWaitingMessage(
  from: string,
  store: Store,
  wabaEnvironments: WABAEnvironments
): Promise<void> {
  return sendMessage({
    messaging_product: 'whatsapp',
    to: from,
    type: 'text',
    text: {
      body: `Processando, por favor, aguarde...`
    }
  }, wabaEnvironments);
}
