import OpenAI from "openai";
import { MenuItem } from '../types/Store';

export interface IdentifiedProduct {
  menuId: number;
  menuName: string;
  quantity: number;
  confidence: number;
}

export interface AmbiguousProduct {
  searchTerm: string;
  possibleMatches: IdentifiedProduct[];
}

export interface ProductIdentificationResult {
  identifiedProducts: IdentifiedProduct[];
  ambiguousProducts: AmbiguousProduct[];
}

class ProductIdentificationService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * Identifica produtos específicos na mensagem baseado no cardápio
   */
  async identifyProducts(message: string, menu: MenuItem[]): Promise<ProductIdentificationResult> {
    try {
      // Preparar o cardápio de forma simplificada para o AI
      const menuForAI = menu.map(item => ({
        id: item.menuId,
        name: item.menuName,
        description: item.menuDescription || '',
      }));

      const prompt = `
      Você é um parser de pedidos de delivery. Sua função é entnder um cardápio e ler uma mensagem do cliente fazendo um pedido de um ou mais produtos e identificar esses produtos no cardápio.
      Você deve retornar um JSON com os produtos identificados com certeza (match exato), assim como as respecitivas quantidades e os produtos com múltiplas opções (match ambíguo), com suas respectivas quntidades também.

      Cada produto deve ser identificado com:
      - menuId: ID do produto no cardápio
      - menuName: Nome do produto no cardápio
      - quantity: Quantidade do produto (padrão = 1)
      NÃO invente produtos. NÃO altere nomes. NÃO crie variações que não existem.

      Leia o cardápio e entenda que voce é um assistende de delivery e está tentando localizar no cardápio os produtos e quantidades que o cliente pediu na mensagem
      Voce pode encontrar um produto no cardápio que se encaixe com o que o cliente esta pedindo, como, o cliente pediu um guarana e voce localizou um Guarana Lata no caedapio, e só existe esse que se encaixa com o que o cliente pediu - entao joga em "identifiedProducts" (ver estrutura de respostas abaixo)
      Voce pode encontrar mais de um produto que satisfaca o que o cliente pediu, como, o cliente pediiu uma marmita e existe o marmitex pequeno e o marmitex grande entao, isso e uma ambiguidade, entao joga os dois, o pequeno e o grande, em "ambiguousProducts" (ver estrutura de respostas abaixo)
      Nunca se esqueca de jogar a quantiade tambem, exemplo, dois guaranas, voce deve devolver 2 no campo quantity (ver estrutura de respostas abaixo)

      FORMATO OBRIGATÓRIO DO JSON DE RETORNO:
      {
        "identifiedProducts": [
          {
            "menuId": number,
            "menuName": string,
            "quantity": number,
          }
        ],
        "ambiguousProducts": [
          {
            "searchTerm": string,
            "possibleMatches": [
              {
                "menuId": number,
                "menuName": string,
              }
            ],
          }
        ],
      }

      CARDÁPIO (JSON):
      {{${menuForAI}}}
 
      MENSAGEM DO CLIENTE:
      "{{${message}}}"

      OBJETIVO:
      Retornar um JSON com:
      1. Produtos identificados de forma única - somente um produto identificado -> campo “identifiedProducts”
      2. Termos ambíguos mapeando para múltiplos produtos - se mais de 1 produto do cardápio pode satisfazer a intencao do que o cliente esta pedindo -> campo “ambiguousProducts”
      
      SINÔNIMOS OBRIGATÓRIOS - DEVEM SER RECONHECIDOS:
      - "marmita" DEVE encontrar produtos com "marmitex" no nome
      - "coca" DEVE encontrar produtos com "coca" no nome, ex: coca-cola, Coca Cola, 
      - "refri" DEVE encontrar produtos com "refrigerante" no nome
      - "guaraná"/"guarana" são equivalentes
      - EXEMPLO: cliente pede "marmita" → deve encontrar "Marmitex Pequeno", "Marmitex Médio", "Marmitex Grande"

      REGRAS CRÍTICAS - VALIDAÇÃO SEMÂNTICA RIGOROSA:
      - NUNCA invente correspondências que não fazem sentido semântico e que nao estejam no menu
      - REGRA ABSOLUTA: Só retorne produtos que realmente fazem match com os pedidos na mensagem. Ex: Nunca retorne 'Marmitex' se o cliente pediu 'Coca'
      - Se não há correspondência semântica clara, retorne arrays VAZIOS
      - Seja EXTREMAMENTE RIGOROSO: prefira retornar vazio a fazer match incorreto
      - Nunca retorne produtos que não existam no cardápio
      - Only output JSON. Nunca escreva texto fora do JSON
      - NUNCA esqueca de extrair a quantidade da mensatem e retornar corretamente no campo 'quantity'
      - Se voce nao conseguir identificar a quantidade, retorne 1 no campo 'quantity'
      - PRIORIZE PRECISÃO ABSOLUTA sobre quantidade de resultados
      - NUNCA retorne apenas 1 produto no array de itens ambíguos
      
      REGRA CRÍTICA - QUANDO USAR identifiedProducts vs ambiguousProducts:
      - identifiedProducts: Quando há APENAS 1 produto compatível no cardápio (MESMO QUE O NOME NÃO SEJA EXATO)
      - ambiguousProducts: Quando há 2 ou MAIS produtos compatíveis no cardápio
      - IMPORTANTE: "guarana" que encontra só "Guaraná Lata" → identifiedProducts (nome não precisa ser 100% igual!)
      - IMPORTANTE: "marmita" que encontra "Marmitex P, M, G" → ambiguousProducts (múltiplas opções)
      - IMPORTANTE: NUNCA retorne um único item no array ambiguousProducts. Se existe somente 1 produto encontrado, entao ele deve ser retornado no array identifiedProducts
      - NÃO IMPORTA se o nome é exato ou não, importa QUANTOS produtos são compatíveis!
      
      REGRA CRÍTICA - QUANTIDADE:
      - SEMPRE extrair quantidade da mensagem do cliente
      - O cliente pode escrever quantiade em formato numérico (2, 3, 1) ou textual (dois, duas, um, uma, tres, três)
      - "dois guarana" = quantity: 2
      - "uma marmita" = quantity: 1  
      - "3 coca" = quantity: 3
      - "quero 5 pizza" = quantity: 5
      - Se não especificado = quantity: 1
      - NUNCA ignore números na mensagem!


      REGRA GERAL:
      - Sempre considere que o cliente erra na digitação, pontuação e acentos
      
      CRITÉRIOS DE CONFIRMAÇÃO:

      INSTRUÇÕES ADICIONAIS:
      - Sinônimos comuns devem ser entendidos ("coca" = "Coca-Cola", “refri” = refrigerantes).
      - Termos genéricos como “marmita”, “lanche”, “refri” só entram em IDENTIFIED se houver apenas 1 produto possível no cardápio.
      - Caso contrário, devem aparecer em AMBIGUOUS.

      EXEMPLO:

      Considere o seguinte Menu: 
        [{id: 1, name: 'Marmitex Pequeno', description: 'Marmitex Pequeno - Inclua 1 carne'},
        {id: 2, name: 'Marmitex Médio', description: 'Marmitex Médio - Inclua 2 carnes'},
        {id: 3, name: 'Marmitex Grande', description: 'Marmitex Grande - Inclua 3 carnes'},
        {id: 4, name: 'Coca Cola Lata', description: 'Refrigerante Coca Cola Lata'},
        {id: 5, name: 'Coca Cola 2 Litros', description: 'Refrigerante Coca Cola 2 Litros'},
        {id: 6, name: 'Guaraná Lata', description: 'Guaraná Lata'}]

      Exemplo 1 - SEU CASO EXATO "uma marmita e dois guarana":
      Mensagem: "uma marmita e dois guarana"
      ANÁLISE:
      - "guarana" → só 1 produto "Guaraná Lata" → identifiedProducts com quantity: 2
      - "marmita" → 3 produtos "Marmitex" → ambiguousProducts com quantity: 1
      
      RESPOSTA CORRETA OBRIGATÓRIA:
      {
        "identifiedProducts": [
          {
            "menuId": 6,
            "menuName": "Guaraná Lata",
            "quantity": 2
          }
        ],
        "ambiguousProducts": [
          {
            "searchTerm": "marmita",
            "possibleMatches": [
              {
                "menuId": 1,
                "menuName": "Marmitex Pequeno"
              },
              {
                "menuId": 2,
                "menuName": "Marmitex Médio"
              },
              {
                "menuId": 3,
                "menuName": "Marmitex Grande"
              }
            ]
          }
        ]
      }


      Exemplo 2 - PRODUTO ÚNICO vai para identifiedProducts:
      Mensagem: "quero 3 guarana"
      Retorno 
      {
        "identifiedProducts": [
          {
            "menuId": 6,
            "menuName": "Guaraná Lata",
            "quantity": 3,
          }
        ],
        "ambiguousProducts": [],
      }

      Exemplo 3 - MÚLTIPLAS OPÇÕES vai para ambiguousProducts:
      Mensagem: "quero um grande e 1 coca"
      Retorno 
      {
        "identifiedProducts": [{
        }],
        "ambiguousProducts": [
          {
            "searchTerm": "coca",
            "possibleMatches": [
              {
                "menuId": 4,
                "menuName": "Coca Cola Lata",
              },
              {
                "menuId": 5,
                "menuName": "Coca Cola 2 Litros",
              }
            ],
          }
        ],
      }

      Exemplo 4 (ERRO DE DIGITAÇÃO - AUTO-CORRIGIR):
      Mensagem: "quero 1 ccoca"
      Retorno 
      {
        "identifiedProducts": [],
        "ambiguousProducts": [
          {
            "menuId": 4,
            "menuName": "Coca Cola Lata",
            "quantity": 1,
          },

          {
            "menuId": 5,
            "menuName": "Coca Cola 2 Litros",
            "quantity": 1,
          }
        
        ],
      }

      Exemplo 5 - CRÍTICO "marmita" deve encontrar "marmitex":
      Mensagem: "quero uma marmita"
      Menu: [{id: 1, name: 'Marmitex Pequeno'}, {id: 2, name: 'Marmitex Médio'}, {id: 3, name: 'Marmitex Grande'}]
      Retorno OBRIGATÓRIO:
      {
        "identifiedProducts": [],
        "ambiguousProducts": [
          {
            "searchTerm": "marmita",
            "possibleMatches": [
              {"menuId": 1, "menuName": "Marmitex Pequeno"},
              {"menuId": 2, "menuName": "Marmitex Médio"},
              {"menuId": 3, "menuName": "Marmitex Grande"}
            ]
          }
        ]
      }

      EXEMPLOS DE ERROS PROIBIDOS (NUNCA FAÇA ISSO):

      ❌ ERRO GRAVE - Mensagem: "quero uma coca"
      NUNCA RETORNE:
      {
        "identifiedProducts": [
          {
            "menuId": 1,
            "menuName": "Marmitex Médio",
            "quantity": 1,
          }
        ]
      }

      ❌ ERRO GRAVE - Mensagem: "quero uma marmita" 
      NUNCA RETORNE VAZIO quando existem produtos "marmitex":
      {
        "identifiedProducts": [],
        "ambiguousProducts": []
      }
      
      ❌ ERRO GRAVE - Mensagem: "quero uma marmita"
      NUNCA RETORNE:
      {
        "identifiedProducts": [
          {
            "menuId": 3,
            "menuName": "Coca Cola Lata",
            "quantity": 1,
          }
        ]
      }

      - ETORNE APENAS JSON.
      `;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 1500
      });

      console.log('RESPONSE--->', response?.choices[0]?.message)

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

      const result: ProductIdentificationResult = JSON.parse(cleanContent);

      // Validação básica
      if (!result.identifiedProducts) result.identifiedProducts = [];
      if (!result.ambiguousProducts) result.ambiguousProducts = [];

      // Validar se os IDs dos produtos existem no menu E validar semântica
      // result.identifiedProducts = result.identifiedProducts.filter(product => {
      //   const menuItem = menu.find(item => item.menuId === product.menuId);
      //   if (menuItem) {
      //     product.menuName = menuItem.menuName; // Garantir nome correto

      //     // Validação semântica adicional para evitar cross-matches
      //     const isSemanticMatch = this.validateSemanticMatch(message.toLowerCase(), menuItem.menuName.toLowerCase());
      //     if (!isSemanticMatch) {
      //       console.warn(`BLOCKED CROSS-CATEGORY MATCH: "${message}" -> "${menuItem.menuName}"`);
      //       return false;
      //     }

      //     return true;
      //   }
      //   return false;
      // });

      // // Também validar produtos ambíguos
      // result.ambiguousProducts = result.ambiguousProducts.map(ambiguous => {
      //   ambiguous.possibleMatches = ambiguous.possibleMatches.filter(match => {
      //     const menuItem = menu.find(item => item.menuId === match.menuId);
      //     if (menuItem) {
      //       const isSemanticMatch = this.validateSemanticMatch(ambiguous.searchTerm.toLowerCase(), menuItem.menuName.toLowerCase());
      //       if (!isSemanticMatch) {
      //         console.warn(`BLOCKED AMBIGUOUS CROSS-MATCH: "${ambiguous.searchTerm}" -> "${menuItem.menuName}"`);
      //         return false;
      //       }
      //       return true;
      //     }
      //     return false;
      //   });
      //   return ambiguous;
      // }).filter(ambiguous => ambiguous.possibleMatches.length > 0);

      return result;

    } catch (error) {
      console.error('Erro na identificação de produtos:', error);

      // Fallback básico - busca por palavras-chave simples
      return {
        identifiedProducts: [],
        ambiguousProducts: []
      }

      // return this.basicProductSearch(message, menu);
    }
  }
}

export const productIdentificationService = new ProductIdentificationService();