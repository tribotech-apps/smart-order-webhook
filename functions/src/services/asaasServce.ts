// filepath: /home/marcos/Tribotech/Apps/talk-commerce-webhook-server/functions/src/services/asaasService.ts
import axios from 'axios';
import { Conversation } from '../types/Conversation';
import { notifyAdmin, sendMessage } from './messagingService';
import { WABAEnvironments } from '../types/Store';

const ASAAS_API_URL = process.env.ASAAS_API_URL || 'https://www.asaas.com/api/v3';
const ASAAS_API_KEY = process.env.ASAAS_API_KEY;

if (!ASAAS_API_KEY) {
  throw new Error('Asaas API Key não configurada. Verifique o arquivo .env.');
}

const asaasClient = axios.create({
  baseURL: ASAAS_API_URL,
  headers: {
    'Content-Type': 'application/json',
    'access_token': ASAAS_API_KEY,
  },
});

if (!ASAAS_API_KEY) {
  throw new Error('Asaas API Key não configurada. Verifique o arquivo .env.');
}

export async function sendPaymentLink(
  phoneNumber: string,
  paymentLink: string,
  wabaEnvironments: WABAEnvironments,
): Promise<void> {
  const messagePayload = {
    messaging_product: 'whatsapp',
    to: phoneNumber,
    type: 'text',
    text: {
      body: `Seu pedido foi finalizado! Para concluir o pagamento, acesse o link: ${paymentLink}`,
    },
  };

  try {
    await sendMessage(messagePayload, wabaEnvironments);
    console.log('Link de pagamento enviado ao cliente:', paymentLink);
  } catch (error: any) {
    notifyAdmin('Erro ao enviar link de pagamento:', error.response?.data || error.message);
    throw new Error('Erro ao enviar link de pagamento');
  }
}

export async function generatePaymentLink(
  customerName: string,
  customerEmail: string,
  customerPhone: string,
  description: string,
  value: number
): Promise<string> {
  try {
    const response = await axios.post(
      `${ASAAS_API_URL}/paymentLinks`,
      {
        name: `Pagamento para ${customerName}`,
        description,
        value,
        dueDate: new Date().toISOString().split('T')[0], // Data de vencimento: hoje
        maxInstallmentCount: 1, // Apenas pagamento à vista
        chargeInterest: false,
        discount: {
          value: 0,
          dueDateLimitDays: 0,
        },
        fine: {
          value: 0,
        },
        interest: {
          value: 0,
        },
        customer: {
          name: customerName,
          email: customerEmail,
          phone: customerPhone,
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'access_token': ASAAS_API_KEY,
        },
      }
    );

    console.log('Link de pagamento gerado com sucesso:', response.data);
    return response.data.url; // Retorna o link de pagamento gerado
  } catch (error: any) {
    notifyAdmin('Erro ao gerar link de pagamento:', error.response?.data || error.message);
    throw new Error('Erro ao gerar link de pagamento');
  }
}

export async function generatePixPayment(description: string,
  value: number,
  expirationDate: string,
  externalReference: string): Promise<{ qrCodeImage: string; payload: string }> {
  try {
    const payload = {
      addressKey: process.env.ASAAS_ADDRESS_KEY, // Chave de endereço do Asaas
      description,
      value,
      format: "ALL",
      expirationDate,
      expirationSeconds: null,
      externalReference,
    };

    console.log('URL:', `${process.env.ASAAS_API_URL}/pix/qrCodes/static`);
    console.log('Payload enviado:', payload);

    const response = await axios.post(`${process.env.ASAAS_API_URL}/pix/qrCodes/static`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'access_token': process.env.ASAAS_API_KEY, // Token de acesso do Asaas
      },
    });

    console.log('QR Code gerado com sucesso:', response.data);

    // Retorna o código QR gerado // Retorna a imagem do QR Code e o payload do QR Code
    return {
      qrCodeImage: response.data.encodedImage, // Imagem do QR Code em base64
      payload: response.data.payload, // Identificador do QR Code
    };
  } catch (error: any) {
    notifyAdmin('Erro ao gerar o PIX:', error.response?.data || error.message);
    throw new Error('Erro ao gerar o PIX. Por favor, tente novamente mais tarde.');
  }
}

interface PaymentLinkPayload {
  name: string;
  description: string;
  endDate: string;
  value: number;
  billingType: string;
  chargeType: string;
  maxInstallmentCount?: number;
  dueDateLimitDays?: number;
  subscriptionCycle?: string;
  externalReference: string;
  notificationEnabled?: boolean;
}

export async function generateCreditCardPaymentLink(payload: PaymentLinkPayload): Promise<any> {
  try {
    const response = await axios.post(`${process.env.ASAAS_API_URL}/paymentLinks`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'access_token': process.env.ASAAS_API_KEY, // Token de acesso do Asaas
      },
    });

    console.log('Link de pagamento gerado com sucesso:', response.data);

    // Retorna o objeto completo da resposta
    return response.data;
  } catch (error: any) {
    notifyAdmin('Erro ao gerar link de pagamento:', error.response?.data || error.message);
    throw new Error('Erro ao gerar link de pagamento');
  }
}
