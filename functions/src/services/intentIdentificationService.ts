import OpenAI from "openai";
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { MenuItem, ShoppingCartItem } from "../types/Store";

const client = new SecretManagerServiceClient();

export interface ClientIntention {
  intention: 'VER_CARDAPIO' | 'SAUDACAO' | 'PEDINDO_PRODUTOS' | 'RESPONDENDO_PERGUNTAS' | 'FINALIZANDO_PEDIDO' | 'FORMA_PAGAMENTO' |
  'EXCLUIR_ITENS' | 'ALTERAR_QUANTIDADE' | 'CONVERSA_GERAL' |
  'PERGUNTA_ENTREGA' | 'CANCELAR_PEDIDO';
  message: string;
}

class IntentIdentificationService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * Identifica a intenção do cliente baseado na mensagem
   */
  async identifyIntention(message: string, cartItems?: ShoppingCartItem[]): Promise<ClientIntention> {
    try {
      const prompt = `
Você é um especialista em identificar intenções de clientes em um sistema de delivery por WhatsApp.

Analise a mensagem do cliente e identifique qual é a intenção principal:

INTENÇÕES POSSÍVEIS:
- SAUDACAO: Cumprimentos como "oi", "olá", "bom dia", "boa tarde", "boa noite"
- VER_CARDAPIO: Quer ver o menu, cardápio, opções disponíveis
- PEDINDO_PRODUTOS: Está fazendo ou querendo fazer um pedido específico de produtos. Ex: Quero um marmitex pequeno e uma coca
- PERGUNTA_ENTREGA: Pergunta sobre entrega, raio, taxa, se entrega em algum local
- FINALIZANDO_PEDIDO: Quer finalizar, confirmar ou concluir o pedido atual
- FORMA_PAGAMENTO: Falando sobre pagamento, PIX, cartão, dinheiro
- ALTERAR_QUANTIDADE: Quer mudar quantidade de itens existentes no carrinho
- EXCLUIR_ITENS: Quer remover itens do carrinho
- CANCELAR_PEDIDO: Quer cancelar o pedido atual
- CONVERSA_GERAL: Outras conversas não relacionadas ao pedido

CONTEXTO:

MENSAGEM DO CLIENTE: "${message}"

RESPONDA APENAS EM JSON PURO (SEM blocos de código):
{
  "intention": "INTENÇÃO_IDENTIFICADA",
  "message": "Mensagem processada e limpa"
}

REGRAS:
- Responda SOMENTE com JSON válido, sem markdown
- Para saber se o cliente está pedindo para incluir ou alterar itens do pedido, voce deve consultar o carrinho de compras enviado junto com a mensagem. Se o produto existir no carrinho, é ALTERAR_QUANTIDADE, caso contrário PEDINDO_PRODUTOS 
`;


      console.log('PROMTP ENVIADO AO IA', prompt)


      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 500
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      // Limpar resposta se vier com markdown ou outros caracteres
      let cleanContent = content.trim();

      // Remover blocos de código markdown
      if (cleanContent.includes('```')) {
        cleanContent = cleanContent.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      }

      // Encontrar o JSON válido na resposta
      const jsonStart = cleanContent.indexOf('{');
      const jsonEnd = cleanContent.lastIndexOf('}');

      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        cleanContent = cleanContent.substring(jsonStart, jsonEnd + 1);
      }

      const result: ClientIntention = JSON.parse(cleanContent);

      // Validação básica
      if (!result.intention || !result.message) {
        throw new Error('Invalid response format from AI');
      }

      return result;

    } catch (error) {
      console.error('Erro na identificação de intenção:', error);

      // Fallback manual básico
      const lowerMessage = message.toLowerCase().trim();

      if (/^(oi|olá|ola|bom dia|boa tarde|boa noite|hey|e aí)/i.test(lowerMessage)) {
        return {
          intention: 'SAUDACAO',
          message: message.trim(),
        };
      }

      if (/cardápio|cardapio|menu|catálogo|catalogo|ver|mostrar|opções|opcoes/i.test(lowerMessage)) {
        return {
          intention: 'VER_CARDAPIO',
          message: message.trim(),
        };
      }

      if (/entrega|entregar|raio|taxa|delivery|entregar em/i.test(lowerMessage)) {
        return {
          intention: 'PERGUNTA_ENTREGA',
          message: message.trim(),
        };
      }

      // Default para pedindo produtos se tem palavras relacionadas a comida
      if (/quero|gostaria|pedir|pizza|hambur|lanche|bebida|refrigerante|coca|guaraná/i.test(lowerMessage)) {
        return {
          intention: 'PEDINDO_PRODUTOS',
          message: message.trim(),
        };
      }

      return {
        intention: 'CONVERSA_GERAL',
        message: message.trim(),
      };
    }
  }
}

export const intentIdentificationService = new IntentIdentificationService();