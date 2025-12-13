import OpenAI from "openai";

export interface ProductSelectionResult {
  selectedProduct?: {
    menuId: number;
    menuName: string;
    quantity: number;
  };
  message: string;
}

class ProductSelectionService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * Identifica qual produto o cliente escolheu das opções ambíguas
   */
  async selectProductFromOptions(userResponse: string, ambiguousOptions: any[]): Promise<ProductSelectionResult> {
    try {
      const optionsForAI = ambiguousOptions.map((option, index) => ({
        index: index + 1,
        menuId: option.menuId,
        menuName: option.menuName
      }));

      const prompt = `
Você é um assistente especializado em identificar qual produto o cliente escolheu de uma lista de opções.

O cliente estava escolhendo entre estas opções ambíguas:
${optionsForAI.map(opt => `${opt.index}. ${opt.menuName} (ID: ${opt.menuId})`).join('\n')}

RESPOSTA DO CLIENTE: "${userResponse}"

Sua tarefa é identificar qual produto o cliente escolheu baseado na resposta dele.

REGRAS:
- O cliente pode ter escolhido por número (ex: "1", "opção 2", "o primeiro")
- O cliente pode ter escolhido pelo nome (ex: "coca lata", "o pequeno", "médio")
- O cliente pode ter especificado quantidade (ex: "2 coca lata", "quero 3 do primeiro")
- Se não conseguir identificar claramente, retorne selectedProduct como null

FORMATO DE RESPOSTA (JSON):
{
  "selectedProduct": {
    "menuId": number,
    "menuName": "string",
    "quantity": number
  } | null,
  "message": "string explicando o que foi identificado"
}

EXEMPLOS:

Resposta: "1"
{
  "selectedProduct": {
    "menuId": ${optionsForAI[0]?.menuId || 0},
    "menuName": "${optionsForAI[0]?.menuName || ''}",
    "quantity": 1
  },
  "message": "Cliente escolheu a opção 1"
}

Resposta: "quero 2 coca lata"
{
  "selectedProduct": {
    "menuId": [ID da Coca Lata],
    "menuName": "Coca Cola Lata",
    "quantity": 2
  },
  "message": "Cliente escolheu Coca Cola Lata com quantidade 2"
}

Resposta: "não sei"
{
  "selectedProduct": null,
  "message": "Cliente não conseguiu escolher"
}

RETORNE APENAS JSON.
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
        max_tokens: 500
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      // Limpar resposta se vier com markdown
      let cleanContent = content.trim();
      if (cleanContent.includes('```')) {
        cleanContent = cleanContent.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      }

      // Encontrar o JSON válido
      const jsonStart = cleanContent.indexOf('{');
      const jsonEnd = cleanContent.lastIndexOf('}');

      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        cleanContent = cleanContent.substring(jsonStart, jsonEnd + 1);
      }

      const result: ProductSelectionResult = JSON.parse(cleanContent);

      // Validação básica
      if (!result.message) {
        result.message = 'Produto processado';
      }

      return result;

    } catch (error) {
      console.error('Erro na seleção de produto:', error);

      // Fallback: tentar identificar por número simples
      const numberMatch = userResponse.match(/\b([1-9])\b/);
      if (numberMatch) {
        const optionIndex = parseInt(numberMatch[1]) - 1;
        if (optionIndex >= 0 && optionIndex < ambiguousOptions.length) {
          const selectedOption = ambiguousOptions[optionIndex];
          return {
            selectedProduct: {
              menuId: selectedOption.menuId,
              menuName: selectedOption.menuName,
              quantity: 1
            },
            message: `Produto selecionado pela opção ${optionIndex + 1}`
          };
        }
      }

      return {
        message: 'Não foi possível identificar a seleção do cliente'
      };
    }
  }
}

export const productSelectionService = new ProductSelectionService();