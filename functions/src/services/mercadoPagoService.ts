import axios from 'axios';
import * as crypto from 'crypto';

// Configuração do Mercado Pago
const MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN || '';
const MERCADO_PAGO_API_URL = process.env.MERCADO_PAGO_API_URL || 'https://api.mercadopago.com';
const MERCADO_PAGO_WEBHOOK_SECRET = process.env.MERCADO_PAGO_WEBHOOK_SECRET || '';

// Tipos
export interface MercadoPagoItem {
  title: string;
  description: string;
  quantity: number;
  unit_price: number;
  currency_id?: string;
}

export interface MercadoPagoPayer {
  name?: string;
  surname?: string;
  email: string;
  phone?: {
    area_code: string;
    number: string;
  };
  identification?: {
    type: string; // CPF ou CNPJ
    number: string;
  };
  address?: {
    zip_code: string;
    street_name: string;
    street_number: string;
    neighborhood?: string;
    city?: string;
    federal_unit?: string;
  };
}

export interface PaymentPreferenceRequest {
  items: MercadoPagoItem[];
  payer?: MercadoPagoPayer;
  back_urls?: {
    success?: string;
    failure?: string;
    pending?: string;
  };
  notification_url?: string;
  auto_return?: 'approved' | 'all';
  external_reference?: string; // ID do seu sistema para rastrear o pedido
  payment_methods?: {
    excluded_payment_methods?: Array<{ id: string }>;
    excluded_payment_types?: Array<{ id: string }>;
    installments?: number;
  };
}

export interface PaymentPreferenceResponse {
  id: string;
  init_point: string; // Link de pagamento para enviar ao cliente
  sandbox_init_point?: string;
  date_created: string;
  items: MercadoPagoItem[];
  payer: MercadoPagoPayer;
  external_reference?: string;
}

export interface PaymentDetails {
  id: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'in_process' | 'refunded' | 'charged_back';
  status_detail: string;
  transaction_amount: number;
  description: string;
  external_reference?: string;
  payer: {
    email: string;
    identification?: {
      type: string;
      number: string;
    };
  };
  payment_method_id: string;
  payment_type_id: string;
  date_created: string;
  date_approved?: string;
  transaction_details?: {
    qr_code?: string;
    qr_code_base64?: string;
  };
}

export interface WebhookNotification {
  action: string;
  api_version: string;
  data: {
    id: string;
  };
  date_created: string;
  id: number;
  live_mode: boolean;
  type: string;
  user_id: string;
}

/**
 * Cria uma preferência de pagamento (link de checkout)
 */
export async function createPaymentPreference(
  request: PaymentPreferenceRequest
): Promise<PaymentPreferenceResponse> {
  try {
    console.log('Criando preferência de pagamento no Mercado Pago:', JSON.stringify(request, null, 2));

    const response = await axios.post(
      `${MERCADO_PAGO_API_URL}/checkout/preferences`,
      {
        ...request,
        items: request.items.map(item => ({
          ...item,
          currency_id: item.currency_id || 'BRL'
        }))
      },
      {
        headers: {
          'Authorization': `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Preferência criada com sucesso:', response.data.id);
    return response.data;
  } catch (error: any) {
    console.error('Erro ao criar preferência no Mercado Pago:', error.response?.data || error.message);
    throw new Error(`Erro ao criar link de pagamento: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Busca detalhes de um pagamento pelo ID
 */
export async function getPaymentDetails(paymentId: string): Promise<PaymentDetails> {
  try {
    console.log('Buscando detalhes do pagamento:', paymentId);

    const response = await axios.get(
      `${MERCADO_PAGO_API_URL}/v1/payments/${paymentId}`,
      {
        headers: {
          'Authorization': `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Detalhes do pagamento obtidos:', response.data.status);
    return response.data;
  } catch (error: any) {
    console.error('Erro ao buscar pagamento no Mercado Pago:', error.response?.data || error.message);
    throw new Error(`Erro ao buscar pagamento: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Valida a assinatura do webhook do Mercado Pago
 * Documentação: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 */
export function validateWebhookSignature(
  xSignature: string,
  xRequestId: string,
  dataId: string
): boolean {
  try {
    if (!MERCADO_PAGO_WEBHOOK_SECRET) {
      console.warn('MERCADO_PAGO_WEBHOOK_SECRET não configurado - pulando validação');
      return true; // Em desenvolvimento, pode pular validação
    }

    // Extrair ts e hash do header x-signature
    // Formato: "ts=1234567890,v1=hash_value"
    const parts = xSignature.split(',');
    const ts = parts.find(part => part.startsWith('ts='))?.split('=')[1];
    const hash = parts.find(part => part.startsWith('v1='))?.split('=')[1];

    if (!ts || !hash) {
      console.error('Formato de x-signature inválido');
      return false;
    }

    // Criar string para validação: "id;request-id;ts"
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

    // Gerar HMAC SHA256
    const hmac = crypto.createHmac('sha256', MERCADO_PAGO_WEBHOOK_SECRET);
    hmac.update(manifest);
    const calculatedHash = hmac.digest('hex');

    const isValid = calculatedHash === hash;
    console.log('Validação de webhook:', isValid ? '✅ Válido' : '❌ Inválido');

    return isValid;
  } catch (error) {
    console.error('Erro ao validar assinatura do webhook:', error);
    return false;
  }
}

/**
 * Cria um pagamento PIX direto (sem link de checkout)
 * Retorna QR Code para o cliente escanear
 */
export async function createPixPayment(
  amount: number,
  description: string,
  payer: MercadoPagoPayer,
  externalReference?: string
): Promise<PaymentDetails> {
  try {
    console.log('Criando pagamento PIX no Mercado Pago:', {
      amount,
      description,
      external_reference: externalReference
    });

    const idempotencyKey = `${externalReference || Date.now()}-${Math.random()}`;

    const response = await axios.post(
      `${MERCADO_PAGO_API_URL}/v1/payments`,
      {
        transaction_amount: amount,
        description: description,
        payment_method_id: 'pix',
        payer: payer,
        external_reference: externalReference,
        notification_url: process.env.MERCADO_PAGO_NOTIFICATION_URL
      },
      {
        headers: {
          'Authorization': `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey
        }
      }
    );

    console.log('Pagamento PIX criado:', response.data.id, 'Status:', response.data.status);
    return response.data;
  } catch (error: any) {
    console.error('Erro ao criar pagamento PIX:', error.response?.data || error.message);
    throw new Error(`Erro ao criar pagamento PIX: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Processa notificação do webhook
 */
export async function processWebhookNotification(notification: WebhookNotification): Promise<PaymentDetails | null> {
  try {
    // Verificar se é notificação de pagamento
    if (notification.type !== 'payment') {
      console.log('Notificação ignorada - tipo:', notification.type);
      return null;
    }

    // Buscar detalhes do pagamento
    const paymentDetails = await getPaymentDetails(notification.data.id);

    console.log(`Webhook processado - Payment ID: ${paymentDetails.id}, Status: ${paymentDetails.status}`);

    return paymentDetails;
  } catch (error) {
    console.error('Erro ao processar webhook:', error);
    throw error;
  }
}
