import Fuse from 'fuse.js';
import { v4 as uuidv4 } from 'uuid'; // npm install uuid
import { AmbiguityGroup, ExtractionResult, AmbiguousItems, ResolvedItem } from '../types/Conversation';
import OpenAI from 'openai';

const SIZE_VARIANT_WORDS = new Set([
  'lata', 'litro', '1l', '2l', '600ml', '300ml', '350ml',
  'pequeno', 'pequena', 'medio', 'médio', 'grande'
]);

function getBaseName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(' ')
    .filter(word => !SIZE_VARIANT_WORDS.has(word.trim()))
    .join(' ')
    .trim();
}

interface MenuOption {
  menuId: number;
  menuName: string;
  price?: number;
}

interface SelectedAnswer {
  answerId: number;
  answerName: string;
  quantity: number;
  price?: number;
}

interface MultipleSelectionResult {
  answers: SelectedAnswer[];
  totalSelected: number;
  isValid: boolean;
}

interface OrderItem {
  menuId: number;
  menuName: string;
  quantity: number;
  // outros campos se precisar
}

interface ClassificationResult {
  intent:
  | "greeting"                  // só saudação
  | "want_menu_or_start"        // quer cardápio ou começar pedido sem itens
  | "ordering_products"         // pedindo produtos específicos
  | "close_order"               // quer finalizar
  | "change_quantity"           // alterar quantidade ou adicionar mais
  | "replace_product"           // trocar um produto por outro
  | "remove_product"            // remover um produto
  | "other";                    // não identificou nenhuma das acima

  details?: {
    productsMentioned?: string[];           // para ordering_products
    productToChange?: string;               // para change/replace/remove
    newQuantity?: number;
    action?: "increase" | "decrease" | "set";
    newProduct?: string;                    // para replace
  };

  items?: {
    menuId: number;
    quantity: number;
  }[];                                      // para remove_product - itens a serem removidos
}

const SYSTEM_PROMPT = `
Você é um classificador de intenções ultra-preciso para bot de delivery via WhatsApp.

Analise a mensagem do cliente e o pedido atual.

Responda SEMPRE com JSON válido no formato exato abaixo. Nunca adicione texto extra.

{
  "intent": "greeting" | "want_menu_or_start" | "ordering_products" | "close_order" | "change_quantity" | "replace_product" | "remove_product" | "other",
  "details": {
    "productsMentioned": string[] (opcional, só se intent = "ordering_products" - nomes aproximados que o cliente usou),
    "productToChange": string (opcional, nome aproximado do produto afetado),
    "newQuantity": number (opcional, se for alteração de quantidade),
    "action": "increase" | "decrease" | "set" (opcional),
    "newProduct": string (opcional, se for troca)
  },
  "items": [
    {
      "menuId": number,
      "quantity": number
    }
  ] (OBRIGATÓRIO se intent = "remove_product" - array com menuId e quantity dos itens a serem removidos do pedido atual)
}

Regras de classificação (priorize na ordem):

- "greeting": apenas saudação (oi, olá, bom dia, boa tarde, tudo bem, e aí) sem menção a pedido/comida.

- "want_menu_or_start": quer ver cardápio, catálogo, menu SEM mencionar produto específico ("quero pedir", "pode mandar o cardápio?", "faz um pedido", "quero fazer pedido", "me manda o menu").

- "ordering_products": menciona produtos específicos MESMO que seja genérico ("uma marmitex", "marmita", "2 cocas", "um sorvete", "pode mandar uma pizza", "quero um hambúrguer", "manda um marmitex"). SEMPRE que mencionar nome de produto = ordering_products.

- "close_order": quer finalizar ("só isso", "é só", "pode fechar", "finaliza", "ta bom assim", "nada mais", "quero pagar").

- "change_quantity": alterar quantidade ou adicionar mais ("mais uma coca", "coloca 3 marmitex", "tira uma", "agora quero 2").

- "replace_product": trocar um produto por outro ("troca o frango por bife", "em vez da coca quero guaraná", "quero trocar a pizza brotinho pela grande", "trocar o pequeno pelo médio", "muda a pizza de mussarela para calabresa").

- "remove_product": remover algo ("cancela a coca", "tira o marmitex pequeno", "remove o sorvete", "não quero mais isso"). IMPORTANTE: Quando for remove_product, você DEVE identificar quais itens específicos do pedido atual devem ser removidos e incluir no array "items" com menuId e quantity exatos.

- "other": qualquer outra coisa.

Pedido atual (para contexto): {currentOrder}

EXEMPLOS CRÍTICOS DE CLASSIFICAÇÃO:

Cliente: "pode mandar uma marmita" → {"intent": "ordering_products"} (menciona produto específico)
Cliente: "quero um marmitex" → {"intent": "ordering_products"} (menciona produto específico)
Cliente: "manda uma coca" → {"intent": "ordering_products"} (menciona produto específico)
Cliente: "tem pizza?" → {"intent": "ordering_products"} (pergunta sobre produto específico)

Cliente: "quero pedir" → {"intent": "want_menu_or_start"} (não menciona produto)
Cliente: "pode mandar o cardápio?" → {"intent": "want_menu_or_start"} (pede cardápio)
Cliente: "quero fazer um pedido" → {"intent": "want_menu_or_start"} (não especifica produto)

REGRA PRINCIPAL: Se a mensagem contém QUALQUER nome de comida/bebida (marmita, pizza, coca, hambúrguer, etc.) = ordering_products

EXEMPLOS PARA REMOVE_PRODUCT:

Cliente: "quero remover 2 cocas"
Pedido atual: [{"menuId": 5, "menuName": "Coca Cola", "quantity": 3}, {"menuId": 10, "menuName": "Pizza", "quantity": 1}]
Resposta: {
  "intent": "remove_product",
  "items": [{"menuId": 5, "quantity": 2}]
}

Cliente: "cancela o marmitex pequeno"  
Pedido atual: [{"menuId": 1, "menuName": "Marmitex Pequeno", "quantity": 1}, {"menuId": 5, "menuName": "Coca Cola", "quantity": 2}]
Resposta: {
  "intent": "remove_product", 
  "items": [{"menuId": 1, "quantity": 1}]
}

Cliente: "remove tudo"
Pedido atual: [{"menuId": 1, "menuName": "Marmitex", "quantity": 2}, {"menuId": 5, "menuName": "Coca", "quantity": 1}]
Resposta: {
  "intent": "remove_product",
  "items": [{"menuId": 1, "quantity": 2}, {"menuId": 5, "quantity": 1}]
}

EXEMPLOS PARA REPLACE_PRODUCT:

Cliente: "quero trocar a pizza brotinho pela grande"
Pedido atual: [{"menuId": 10, "menuName": "Pizza Brotinho", "quantity": 1}]
Resposta: {
  "intent": "replace_product",
  "details": {
    "productToChange": "pizza brotinho",
    "newProduct": "pizza grande"
  }
}

Cliente: "troca o marmitex pequeno pelo médio"
Pedido atual: [{"menuId": 1, "menuName": "Marmitex Pequeno", "quantity": 1}]
Resposta: {
  "intent": "replace_product",
  "details": {
    "productToChange": "marmitex pequeno",
    "newProduct": "marmitex médio"
  }
}

Cliente: "em vez da coca quero guaraná"
Pedido atual: [{"menuId": 15, "menuName": "Coca-Cola Lata", "quantity": 1}]
Resposta: {
  "intent": "replace_product",
  "details": {
    "productToChange": "coca",
    "newProduct": "guaraná"
  }
}

Cliente: "muda a pizza de mussarela para calabresa"
Pedido atual: [{"menuId": 20, "menuName": "Pizza de Mussarela", "quantity": 1}]
Resposta: {
  "intent": "replace_product",
  "details": {
    "productToChange": "pizza de mussarela",
    "newProduct": "pizza de calabresa"
  }
}

REGRAS PARA REPLACE_PRODUCT:
1. Detecte palavras-chave: "trocar", "troca", "em vez de", "ao invés de", "muda", "mudar", "pela", "pelo", "para"
2. Identifique o produto atual (productToChange) e o produto novo (newProduct)
3. SEMPRE preencha ambos os campos: productToChange e newProduct
`;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Função de fallback para matching simples quando OpenAI falha
function tryFallbackMatching(message: string, options: MenuOption[], minRequired: number): MultipleSelectionResult | null {
  const normalizedMessage = message
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .trim();

  // Palavras-chave para matching
  const matches: { option: MenuOption; confidence: number }[] = [];

  // REGRA CRÍTICA: Matching parcial de palavra-chave única
  // Se apenas 1 opção contém a palavra do cliente, selecione automaticamente
  const messageWords = normalizedMessage.split(/\s+/).filter(w => w.length >= 3);

  for (const msgWord of messageWords) {
    const optionsWithWord = options.filter(opt => {
      const normalizedOption = opt.menuName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      return normalizedOption.includes(msgWord);
    });

    // Se APENAS 1 opção contém essa palavra → match direto
    if (optionsWithWord.length === 1) {
      console.log(`✅ Fallback: encontrou match único para "${msgWord}" → ${optionsWithWord[0].menuName}`);
      return {
        answers: [{
          answerId: optionsWithWord[0].menuId,
          answerName: optionsWithWord[0].menuName,
          quantity: 1,
          price: optionsWithWord[0].price
        }],
        totalSelected: 1,
        isValid: 1 >= minRequired
      };
    }
  }

  // Fallback original: matching por confiança
  options.forEach(option => {
    const normalizedOption = option.menuName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    let confidence = 0;

    // Verificar se a mensagem contém palavras-chave da opção
    const optionWords = normalizedOption.split(/\s+/);

    messageWords.forEach(msgWord => {
      optionWords.forEach(optWord => {
        if (optWord.includes(msgWord) || msgWord.includes(optWord)) {
          confidence += msgWord.length >= 3 ? 1 : 0.5; // Palavras maiores têm mais peso
        }
      });
    });

    // Casos específicos para bebidas
    if (normalizedMessage.includes('lata') && normalizedOption.includes('lata')) {
      confidence += 2;
    }
    if (normalizedMessage.includes('litro') || normalizedMessage.includes('2l') || normalizedMessage.includes('1l')) {
      if (normalizedOption.includes('litro') || normalizedOption.includes('2l') || normalizedOption.includes('1l')) {
        confidence += 2;
      }
    }

    if (confidence > 0) {
      matches.push({ option, confidence });
    }
  });

  // Ordenar por confiança e pegar o melhor match
  matches.sort((a, b) => b.confidence - a.confidence);

  if (matches.length > 0 && matches[0].confidence >= 1) {
    const bestMatch = matches[0].option;
    return {
      answers: [{
        answerId: bestMatch.menuId,
        answerName: bestMatch.menuName,
        quantity: 1,
        price: bestMatch.price
      }],
      totalSelected: 1,
      isValid: 1 >= minRequired
    };
  }

  return null;
}

/**
 * Seleciona múltiplas opções usando OpenAI para análise inteligente da mensagem
 * Usado no fluxo de questions/customização de produtos
 * @param message - Mensagem do cliente
 * @param options - Lista de opções com menuId e menuName
 * @param minRequired - Quantidade mínima necessária (do campo minAnswerRequired)
 * @returns Array de seleções com quantidades ou null se não encontrar match
 */
export function extractProductsFromMessage(
  message: string,
  cardapio: AmbiguousItems[],
  fuzzyThreshold: number = 0.4
): ExtractionResult {
  if (!cardapio || cardapio.length === 0) return { items: [], ambiguidades: [] };

  const normalizedMessage = message
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const extensoParaNumero: Record<string, number> = {
    um: 1, uma: 1, dois: 2, duas: 2, tres: 3, três: 3,
    quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10
  };

  // Pré-processar cardápio
  const menuWithBase = cardapio.map(item => ({
    original: item,
    baseName: getBaseName(item.menuName),
  }));

  const fuse = new Fuse(menuWithBase, {
    keys: ['baseName'],
    threshold: fuzzyThreshold,
    includeScore: true,
    shouldSort: true,
  });

  const resolved: ResolvedItem[] = [];
  const ambiguityMap = new Map<string, AmbiguityGroup>(); // chave: palavra do cliente

  // Dividir mensagem em partes
  const parts = normalizedMessage.split(/\s+e\s+|\s*,\s*|\se\s/);

  for (let rawPart of parts) {
    let part = rawPart.trim();
    if (part.length < 3) continue;

    let quantity = 1;
    let palavraCliente = part;

    // Extrair quantidade
    const qtyMatch = part.match(/^(\d+|um|uma|dois|duas|tres|três|quatro|cinco|seis|sete|oito|nove|dez)\s+/);
    if (qtyMatch) {
      const q = qtyMatch[1];
      quantity = !isNaN(parseInt(q)) ? parseInt(q) : extensoParaNumero[q] || 1;
      part = part.replace(qtyMatch[0], '').trim();
      palavraCliente = part;
    }

    if (part.length < 3) continue;

    const baseSearch = getBaseName(part);
    const results = fuse.search(baseSearch);
    const goodMatches = results
      .filter(r => r.score !== undefined && r.score <= fuzzyThreshold)
      .map(r => r.item.original);

    if (goodMatches.length === 1) {
      // Resolvido diretamente
      const item = goodMatches[0];
      resolved.push({
        menuId: item.menuId,
        menuName: item.menuName.trim(),
        quantity,
        palavra: palavraCliente,
        price: item.price,
      });
    } else if (goodMatches.length > 1) {
      // Ambiguidade → agrupar por palavra
      const key = palavraCliente;
      if (!ambiguityMap.has(key)) {
        ambiguityMap.set(key, {
          id: `amb_${uuidv4().split('-')[0]}`,
          palavra: palavraCliente,
          quantity,
          items: [],
        });
      }

      const group = ambiguityMap.get(key)!;
      group.quantity = quantity; // atualiza (caso tenha mais de um pedido da mesma coisa)

      goodMatches.forEach(item => {
        if (!group.items.some(o => o.menuId === item.menuId)) {
          group.items.push({
            menuId: item.menuId,
            menuName: item.menuName.trim(),
            price: item.price,
          });
        }
      });
    }
  }

  return {
    items: resolved,
    ambiguidades: Array.from(ambiguityMap.values()),
  };
}

export async function selectMultipleOptionsByAI(
  message: string,
  options: MenuOption[],
  minRequired: number = 1
): Promise<MultipleSelectionResult | null> {
  if (!message || message.trim() === '' || options.length === 0) {
    return null;
  }

  console.log('vai CHAMAR AI PARA multiplas opcoes de respostas', message, options, minRequired)

  const systemPrompt = `
Você é um assistente especializado em identificar múltiplas escolhas de produtos/opções em respostas de customização.

TAREFA: Analisar a resposta do cliente e identificar quais opções da lista ele escolheu e em que quantidades.

REGRAS IMPORTANTES:
1. Cliente pode escolher múltiplas opções diferentes (ex: "filé de frango e bife")
2. Cliente pode escolher a mesma opção múltiplas vezes (ex: "2 filé de frango", "dois bife")
3. Se não mencionar quantidade, assumir 1
4. Seja MUITO flexível com variações linguísticas e sinônimos
5. Mínimo necessário: ${minRequired} escolhas no total
6. Total de quantidades deve somar pelo menos ${minRequired}

MATCHING PARCIAL DE PALAVRAS-CHAVE (REGRA CRÍTICA - MÁXIMA PRIORIDADE):
- SEMPRE procure por PALAVRAS-CHAVE PARCIAIS da resposta do cliente nos nomes das opções
- Se APENAS 1 opção contém a palavra-chave → SEMPRE SELECIONE ESSA OPÇÃO AUTOMATICAMENTE
- Ignore acentos, maiúsculas/minúsculas, e palavras extras na comparação
- Matching parcial é PRIORITÁRIO sobre matching exato

EXEMPLOS OBRIGATÓRIOS DE MATCHING PARCIAL:
1. Cliente: "bife" + Opções: ["Filé de Frango", "Bife Acebolado", "Parmegiana"]
   → Apenas 1 opção contém "bife" → SELECIONE "Bife Acebolado" automaticamente

2. Cliente: "frango" + Opções: ["Filé de Frango", "Bife Acebolado"]
   → Apenas 1 opção contém "frango" → SELECIONE "Filé de Frango" automaticamente

3. Cliente: "parmegiana" + Opções: ["Filé de Frango", "Parmegiana Acebolada", "Bife"]
   → Apenas 1 opção contém "parmegiana" → SELECIONE "Parmegiana Acebolada" automaticamente

4. Cliente: "frango" + Opções: ["Filé de Frango", "Frango Grelhado", "Bife"]
   → 2 opções contêm "frango" → NÃO selecione automaticamente (ambíguo)

ALGORITMO DE MATCHING:
1. Normalize a palavra do cliente (remova acentos, lowercase)
2. Para cada opção, normalize o nome e verifique se CONTÉM a palavra do cliente
3. Se EXATAMENTE 1 opção contém → SELECIONE
4. Se 0 ou 2+ opções contêm → retorne vazio ou pergunte

OPÇÕES DISPONÍVEIS:
${JSON.stringify(options, null, 2)}

RESPOSTA EM JSON:
{
  "answers": [
    {
      "answerId": number (usar menuId da opção),
      "answerName": "string (nome exato da opção)",
      "quantity": number,
      "price": number (opcional, usar price se disponível)
    }
  ],
  "totalSelected": number (soma de todas as quantidades),
  "isValid": boolean (true se totalSelected >= ${minRequired})
}

EXEMPLOS:
Cliente: "filé de frango e bife" (minRequired=2)
→ {"answers": [{"answerId": 1, "answerName": "Filé de Frango", "quantity": 1}, {"answerId": 2, "answerName": "Bife", "quantity": 1}], "totalSelected": 2, "isValid": true}

Cliente: "bife" com opções [Filé de Frango, Bife Acebolado, Parmegiana] (minRequired=1)
→ {"answers": [{"answerId": 2, "answerName": "Bife Acebolado", "quantity": 1}], "totalSelected": 1, "isValid": true}
MOTIVO: "bife" aparece APENAS em "Bife Acebolado"

Cliente: "frango" com opções [Filé de Frango, Bife Acebolado] (minRequired=1)
→ {"answers": [{"answerId": 1, "answerName": "Filé de Frango", "quantity": 1}], "totalSelected": 1, "isValid": true}
MOTIVO: "frango" aparece APENAS em "Filé de Frango"

Cliente: "2 filé de frango" (minRequired=2)
→ {"answers": [{"answerId": 1, "answerName": "Filé de Frango", "quantity": 2}], "totalSelected": 2, "isValid": true}

Cliente: "lata" com opções [Coca Cola Lata, Coca Cola 2L] (minRequired=1)
→ {"answers": [{"answerId": 5, "answerName": "Coca Cola Lata", "quantity": 1}], "totalSelected": 1, "isValid": true}

Cliente: "2 litros" com opções [Coca Cola Lata, Coca Cola 2L] (minRequired=1)
→ {"answers": [{"answerId": 8, "answerName": "Coca Cola 2L", "quantity": 1}], "totalSelected": 1, "isValid": true}

Cliente: "só frango" (minRequired=3)
→ {"answers": [{"answerId": 1, "answerName": "Filé de Frango", "quantity": 1}], "totalSelected": 1, "isValid": false}

Se não conseguir identificar nenhuma opção válida, retorne:
{"answers": [], "totalSelected": 0, "isValid": false}
`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Cliente respondeu: "${message}"` }
      ],
    });

    const content = response.choices[0]?.message?.content?.trim() || '{}';
    console.log(`🤖 OpenAI resposta bruta para "${message}":`, content);

    const parsed = JSON.parse(content);
    console.log(`🧠 OpenAI parsed:`, JSON.stringify(parsed, null, 2));

    // Validar estrutura da resposta
    const result: MultipleSelectionResult = {
      answers: Array.isArray(parsed.answers) ? parsed.answers : [],
      totalSelected: parsed.totalSelected || 0,
      isValid: parsed.isValid || false
    };

    console.log(`📊 Resultado inicial:`, JSON.stringify(result, null, 2));

    // Validar se os answerIds retornados existem nas opções
    console.log(`🔍 Validando IDs. Opções disponíveis:`, options.map(opt => `ID:${opt.menuId} → ${opt.menuName}`));
    result.answers = result.answers.filter(answer => {
      const exists = options.find(opt => opt.menuId === answer.answerId);
      if (!exists) {
        console.log(`❌ OpenAI retornou ID inválido: ${answer.answerId}. IDs válidos: [${options.map(opt => opt.menuId).join(', ')}]`);
        return false;
      }
      console.log(`✅ ID válido encontrado: ${answer.answerId} → ${exists.menuName}`);
      return true;
    });

    // Recalcular totais após filtrar IDs inválidos
    result.totalSelected = result.answers.reduce((sum, answer) => sum + answer.quantity, 0);
    result.isValid = result.totalSelected >= minRequired;

    if (result.answers.length > 0) {
      console.log(`✅ OpenAI selecionou múltiplas opções: "${message}" → ${result.answers.length} opções, total: ${result.totalSelected}`);
      return result;
    } else {
      console.log(`❌ OpenAI não encontrou opções válidas para: "${message}"`);

      // Fallback: tentar matching simples por palavras-chave
      console.log(`🔄 Tentando fallback com matching simples...`);
      const fallbackResult = tryFallbackMatching(message, options, minRequired);
      if (fallbackResult) {
        console.log(`✅ Fallback funcionou: ${JSON.stringify(fallbackResult)}`);
        return fallbackResult;
      }

      return null;
    }

  } catch (error) {
    console.error('Erro ao usar OpenAI para seleção múltipla:', error);
    return null;
  }
}

export async function classifyCustomerIntent(
  message: string,
  currentOrder: OrderItem[] = []
): Promise<ClassificationResult> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini', // barato e rápido, ou 'gpt-4o' para máxima precisão
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT.replace('{currentOrder}', JSON.stringify(currentOrder))
      },
      { role: "user", content: message }
    ],
  });

  const content = response.choices[0]?.message?.content || '{}';
  return JSON.parse(content);
}

/**
 * Interpreta resposta do cliente para confirmação de pedido
 * Detecta se confirma, rejeita, ou está fazendo novo pedido
 */
export async function interpretOrderConfirmation(userResponse: string) {
  const systemPrompt = `Você é um assistente que interpreta respostas de confirmação de pedido.

O cliente foi perguntado se confirma um pedido específico. Você deve analisar a resposta e classificar em uma das categorias:

1. CONFIRMED - Cliente confirmou (sim, ok, correto, pode adicionar, etc.) - MESMO se houver conteúdo adicional
2. REJECTED - Cliente rejeitou sem fazer novo pedido (não, não quero, cancela, etc.)  
3. NEW_ORDER - Cliente rejeitou E está fazendo um novo pedido na mesma mensagem
4. CONFIRMED_WITH_ADDITION - Cliente confirmou E está adicionando mais itens na mesma mensagem

RESPONDA EM JSON:
{
  "type": "CONFIRMED" | "REJECTED" | "NEW_ORDER" | "CONFIRMED_WITH_ADDITION",
  "response": string, // interpretação da resposta
  "newOrderText": string | null // se NEW_ORDER ou CONFIRMED_WITH_ADDITION, extrair o texto do novo pedido
}

EXEMPLOS:

Cliente: "sim" → {"type": "CONFIRMED", "response": "confirmado", "newOrderText": null}
Cliente: "ok" → {"type": "CONFIRMED", "response": "confirmado", "newOrderText": null}
Cliente: "pode adicionar" → {"type": "CONFIRMED", "response": "confirmado", "newOrderText": null}

Cliente: "sim, e quero mais uma coca" → {"type": "CONFIRMED_WITH_ADDITION", "response": "confirmou e quer adicionar mais", "newOrderText": "quero mais uma coca"}
Cliente: "ok, e adiciona uma pizza" → {"type": "CONFIRMED_WITH_ADDITION", "response": "confirmou e quer adicionar mais", "newOrderText": "adiciona uma pizza"}
Cliente: "sim, e manda mais uma coca lata por favor" → {"type": "CONFIRMED_WITH_ADDITION", "response": "confirmou e quer adicionar mais", "newOrderText": "manda mais uma coca lata por favor"}
Cliente: "sim, e quero mais dois guaranás e um sorvete de chocolate" → {"type": "CONFIRMED_WITH_ADDITION", "response": "confirmou e quer adicionar mais", "newOrderText": "quero mais dois guaranás e um sorvete de chocolate"}
Cliente: "sim e manda um marmitex pequeno com filé de frango também" → {"type": "CONFIRMED_WITH_ADDITION", "response": "confirmou e quer adicionar mais", "newOrderText": "manda um marmitex pequeno com filé de frango também"}
Cliente: "pode adicionar e também quero uma coca cola lata" → {"type": "CONFIRMED_WITH_ADDITION", "response": "confirmou e quer adicionar mais", "newOrderText": "também quero uma coca cola lata"}
Cliente: "correto, e coloca mais uma pizza margherita" → {"type": "CONFIRMED_WITH_ADDITION", "response": "confirmou e quer adicionar mais", "newOrderText": "coloca mais uma pizza margherita"}

Cliente: "não" → {"type": "REJECTED", "response": "rejeitado", "newOrderText": null}
Cliente: "não quero" → {"type": "REJECTED", "response": "rejeitado", "newOrderText": null}

Cliente: "não, quero o médio" → {"type": "NEW_ORDER", "response": "rejeitou e fez novo pedido", "newOrderText": "quero o médio"}
Cliente: "não quero pequeno, quero marmitex médio e duas cocas" → {"type": "NEW_ORDER", "response": "rejeitou e fez novo pedido", "newOrderText": "quero marmitex médio e duas cocas"}
Cliente: "na verdade quero uma pizza" → {"type": "NEW_ORDER", "response": "rejeitou e fez novo pedido", "newOrderText": "quero uma pizza"}

REGRAS IMPORTANTES:
1. Se a mensagem contém palavras de confirmação (sim, ok, correto, pode, etc.) no INÍCIO, sempre considere como confirmação, mesmo se houver conteúdo adicional.
2. Para CONFIRMED_WITH_ADDITION, extraia EXATAMENTE a parte da mensagem que representa o pedido adicional:
   - "sim, e manda mais uma coca lata" → newOrderText: "manda mais uma coca lata"
   - "ok, e quero dois guaranás" → newOrderText: "quero dois guaranás"
   - "pode adicionar e também um marmitex pequeno com frango" → newOrderText: "também um marmitex pequeno com frango"
3. Detecte palavras conectoras: "e", "também", "mais", "ainda", "além disso", "e quero", "e manda"
4. SEMPRE extraia quantidades específicas: "dois", "três", "uma", "2", "3", etc.
5. SEMPRE extraia especificações: "com filé de frango", "de chocolate", "lata", "pequeno", etc.

Retorne APENAS o JSON, sem texto adicional.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userResponse }
      ],
    });

    const content = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    return {
      type: parsed.type || 'REJECTED',
      response: parsed.response || 'não interpretado',
      newOrderText: parsed.newOrderText || null
    };

  } catch (error) {
    console.error('Erro ao interpretar confirmação de pedido:', error);
    return {
      type: 'REJECTED',
      response: 'erro na interpretação',
      newOrderText: null
    };
  }
}

/**
 * Extrai produtos de uma mensagem usando OpenAI para identificação inteligente
 */
export async function extractProductsFromMessageWithAI(
  message: string,
  cardapio: any[]
): Promise<ExtractionResult> {
  if (!cardapio || cardapio.length === 0) {
    return { items: [], ambiguidades: [] };
  }

  const systemPrompt = `
TAREFA: Identifique a INTENÇÃO da mensagem e extraia produtos se aplicável.

⚠️ PRIMEIRA ETAPA - DETECTAR INTENÇÃO ⚠️
Antes de extrair produtos, identifique se o cliente está:
1. **PEDINDO** (ordering): "quero uma pizza", "manda um marmitex", "me dá uma coca"
2. **PERGUNTANDO** (asking): "vocês tem pizza?", "tem pepperoni aí?", "vende coca?"
3. **PERGUNTANDO SOBRE ENTREGA** (asking_delivery): "vocês entregam em [endereço]?", "entrega no bairro X?"

REGRAS DE INTENÇÃO (ORDEM DE PRIORIDADE):

1. **PERGUNTAS EXPLÍCITAS** (tem palavras interrogativas + produto):
   - "tem?", "vocês tem?", "tem aí?", "vende?", "fazem?", "existe?" → intent: "asking"
   - "entregam?", "vocês entregam?" → intent: "asking_delivery"

2. **PEDIDOS EXPLÍCITOS** (tem palavras de pedido):
   - "quero", "manda", "pode mandar", "me dá", "vou querer", "pede" → intent: "ordering"

3. **APENAS NOME DO PRODUTO** (SEM palavras interrogativas):
   - Se menciona APENAS o nome do produto (ex: "marmitex", "pizza", "coca") → intent: "ordering"
   - REGRA: Se NÃO tem palavras interrogativas, assumir que é PEDIDO

EXEMPLOS DE INTENÇÃO:

PEDIDOS (ordering):
"quero uma pizza de mussarela" → intent: "ordering" → EXTRAIR produtos
"manda um marmitex e uma coca" → intent: "ordering" → EXTRAIR produtos
"pode mandar uma coca lata" → intent: "ordering" → EXTRAIR produtos
"vou querer dois guaranás" → intent: "ordering" → EXTRAIR produtos
"marmitex" → intent: "ordering" → EXTRAIR produtos ✅ (sem palavra interrogativa)
"pizza de calabresa" → intent: "ordering" → EXTRAIR produtos ✅ (sem palavra interrogativa)
"uma coca" → intent: "ordering" → EXTRAIR produtos ✅ (sem palavra interrogativa)
"dois guaranás" → intent: "ordering" → EXTRAIR produtos ✅ (sem palavra interrogativa)

PERGUNTAS (asking):
"vocês tem pizza de pepperoni aí?" → intent: "asking" → NÃO EXTRAIR (tem "tem?")
"tem marmitex?" → intent: "asking" → NÃO EXTRAIR (tem "tem?")
"fazem pizza de calabresa?" → intent: "asking" → NÃO EXTRAIR (tem "fazem?")
"vende coca?" → intent: "asking" → NÃO EXTRAIR (tem "vende?")

PERGUNTAS SOBRE ENTREGA (asking_delivery):
"vocês entregam na rua das flores?" → intent: "asking_delivery" → NÃO EXTRAIR
"entrega no bairro X?" → intent: "asking_delivery" → NÃO EXTRAIR

REGRA CRÍTICA: Se a mensagem NÃO contém palavras interrogativas ("tem?", "fazem?", "vende?", "existe?", "entregam?"), SEMPRE trate como "ordering"

TAREFA: Identifique produtos do cardápio na mensagem do cliente APENAS se intent = "ordering".

⚠️ REGRA CRÍTICA - SEMPRE RETORNE OS IDs ⚠️
VOCÊ DEVE SEMPRE BUSCAR E RETORNAR:
1. menuId: Busque no cardápio JSON abaixo e retorne o menuId EXATO
2. questionId: Se houver selectedAnswers, busque o questionId nas questions do produto
3. answerId: Se houver selectedAnswers, busque o answerId nas answers da question
4. price: Copie o price do produto do cardápio
NUNCA retorne apenas nomes sem IDs. SEMPRE inclua menuId, questionId, answerId quando aplicável.

REGRA CRÍTICA: Processe cada produto individualmente. Se um não existir, ignore-o e continue com os outros.

⚠️ REGRA CRÍTICA - NUNCA INFERIR INFORMAÇÕES ⚠️
VOCÊ NÃO PODE ASSUMIR, INFERIR OU ADICIONAR INFORMAÇÕES QUE O CLIENTE NÃO MENCIONOU EXPLICITAMENTE.

EXEMPLOS PROIBIDOS:
❌ Cliente: "uma pizza" → VOCÊ NÃO PODE escolher "Pizza de Mussarela" (cliente não mencionou mussarela)
❌ Cliente: "um marmitex" → VOCÊ NÃO PODE escolher "Marmitex Pequeno" (cliente não mencionou pequeno)
❌ Cliente: "uma coca" → VOCÊ NÃO PODE escolher "Coca-Cola Lata" (cliente não mencionou lata)

QUANDO O CLIENTE NÃO ESPECIFICA:
✅ Cliente: "uma pizza" + Cardápio tem: ["Pizza de Mussarela", "Pizza de Calabresa", "Pizza Margherita"]
   → Retorne AMBIGUIDADE com todas as 3 opções (deixe o cliente escolher)

✅ Cliente: "um marmitex" + Cardápio tem: ["Marmitex Pequeno", "Marmitex Médio", "Marmitex Grande"]
   → Retorne AMBIGUIDADE com todas as 3 opções

✅ Cliente: "uma coca" + Cardápio tem: ["Coca-Cola Lata 350ml", "Coca-Cola 2L"]
   → Retorne AMBIGUIDADE com ambas opções

QUANDO O CLIENTE ESPECIFICA:
✅ Cliente: "uma pizza de mussarela" → Pode escolher "Pizza de Mussarela" (especificou mussarela)
✅ Cliente: "marmitex médio" → Pode escolher "Marmitex Médio" (especificou médio)
✅ Cliente: "coca lata" → Pode escolher "Coca-Cola Lata" (especificou lata)

REGRA: Se a mensagem do cliente é GENÉRICA (sem especificar sabor/tamanho/tipo) e existem MÚLTIPLAS opções no cardápio, SEMPRE crie uma AMBIGUIDADE.

⚠️ REGRA CRÍTICA DE MATCHING - PRIORIZAR MAIS PALAVRAS EM COMUM ⚠️
Quando houver MÚLTIPLOS produtos similares no cardápio, SEMPRE escolha aquele que tem MAIS PALAVRAS EM COMUM com a mensagem do cliente.

ALGORITMO DE MATCHING OBRIGATÓRIO:
1. Normalize a mensagem do cliente (lowercase, sem acentos)
2. Normalize todos os nomes de produtos do cardápio
3. Para cada produto candidato, conte quantas palavras da mensagem aparecem no nome do produto
4. SEMPRE escolha o produto com MAIOR número de palavras em comum
5. NUNCA escolha um produto com menos palavras em comum quando existe um com mais

EXEMPLOS CRÍTICOS:
Cliente: "um pedaço de pizza de mussarela"
Cardápio: [
  {"menuName": "Pizza de Mussarela"},
  {"menuName": "Pedaço de Pizza de Mussarela"}
]
→ "Pizza de Mussarela" = 3 palavras em comum (pizza, de, mussarela)
→ "Pedaço de Pizza de Mussarela" = 5 palavras em comum (pedaço, de, pizza, de, mussarela)
→ ESCOLHA: "Pedaço de Pizza de Mussarela" ✅ (MAIS palavras em comum)

Cliente: "quero uma pizza grande"
Cardápio: [
  {"menuName": "Pizza"},
  {"menuName": "Pizza Grande"}
]
→ "Pizza" = 1 palavra em comum (pizza)
→ "Pizza Grande" = 2 palavras em comum (pizza, grande)
→ ESCOLHA: "Pizza Grande" ✅ (MAIS palavras em comum)

Cliente: "marmitex pequeno"
Cardápio: [
  {"menuName": "Marmitex"},
  {"menuName": "Marmitex Pequeno"},
  {"menuName": "Marmitex Grande"}
]
→ "Marmitex" = 1 palavra em comum (marmitex)
→ "Marmitex Pequeno" = 2 palavras em comum (marmitex, pequeno)
→ "Marmitex Grande" = 1 palavra em comum (marmitex)
→ ESCOLHA: "Marmitex Pequeno" ✅ (MAIS palavras em comum)

CARDÁPIO COMPLETO COM PERGUNTAS E RESPOSTAS:
${JSON.stringify(cardapio, null, 2)}

IMPORTANTE - NOMES ALTERNATIVOS:
- Alguns produtos têm o campo "alternativeNames" com nomes alternativos separados por vírgula
- Você DEVE considerar tanto o "menuName" quanto os "alternativeNames" ao buscar produtos
- Exemplo: Se o produto tem menuName="pizza 2 sabores" e alternativeNames="pizza meio mussarela meio calabresa, meio a meio, meio sabor 1 meio sabor 2"
  → Cliente pode pedir: "quero uma tubaina" ou "me dá uma taubaina"
- SEMPRE busque por correspondência em AMBOS os campos (menuName E alternativeNames)

ALGORITMO:
1. Divida a mensagem em produtos (ex: "marmitex médio e sorvete de chocolate" = 2 produtos: "marmitex médio", "sorvete de chocolate")
2. Para cada produto: busque nome similar no cardápio (ignore acentos/case)
   - Busque no menuName do produto
   - Busque também nos alternativeNames se existir
   IMPORTANTE: "sorvete de chocolate" deve buscar por "sorvete" no cardápio
3. Decisão: 0 match = ignore | 1 match = item direto | 2+ matches = ambiguidade
4. Para items diretos com questions/answers: REGRAS PARA EXTRAÇÃO DE RESPOSTAS
   - SEMPRE extraia respostas que o cliente mencionou EXPLICITAMENTE
   - "marmitex médio com parmegiana e bife acebolado" → extrair "parmegiana" e "bife acebolado" como selectedAnswers
   - "sorvete de morango" → extrair "morango" como selectedAnswer
   - REGRA CRÍTICA: Se o cliente mencionou EXPLICITAMENTE alguma opção, SEMPRE extraia como selectedAnswer
   - Exemplo: "eu pedi um marmitex medio com parmegiana e bife acebolado e um sorvete de morango"
     → extrair "parmegiana", "bife acebolado" como selectedAnswers do marmitex
     → extrair "morango" como selectedAnswer do sorvete
   - Se o cliente especificou TODAS as respostas obrigatórias → item direto
   - Se o cliente especificou ALGUMAS mas não todas as obrigatórias → ambiguidade
   - "marmitex médio" sem especificar carne (obrigatória) → AMBIGUIDADE
   - "marmitex médio com frango" especificando carne obrigatória → item direto

EXEMPLOS CORRETOS COM IDs REAIS:

EXEMPLO 1 - Como buscar IDs:
Cliente: "quero uma coca cola"
Cardápio tem: {"menuId": 15, "menuName": "Coca-Cola Lata", "price": 5.00}
→ items: [{"menuId": 15, "menuName": "Coca-Cola Lata", "quantity": 1, "price": 5.00}]

EXEMPLO 2 - Produto com selectedAnswers:
Cliente: "quero sorvete de chocolate"
Cardápio tem: {
  "menuId": 20,
  "menuName": "Sorvete",
  "price": 8.00,
  "questions": [{
    "questionId": 100,
    "questionName": "Sabor",
    "answers": [
      {"answerId": 200, "answerName": "Chocolate", "price": 0},
      {"answerId": 201, "answerName": "Morango", "price": 0}
    ]
  }]
}
→ items: [{
  "menuId": 20,
  "menuName": "Sorvete",
  "quantity": 1,
  "price": 8.00,
  "selectedAnswers": [
    {"questionId": 100, "answerId": 200, "answerName": "Chocolate"}
  ]
}]

PRODUTO ÚNICO (mais permissivo):
"marmitex médio" com produto que tem pergunta obrigatória "Escolha a carne"
→ items: []
→ ambiguidades: [{"palavra": "marmitex médio", "quantity": 1, "items": [{"menuId": 10, "menuName": "Marmitex Médio", "price": 25.00}]}]

MÚLTIPLOS PRODUTOS (inteligente):
"2 guaranás e coca" = produtos SEM perguntas
Cardápio: [
  {"menuId": 15, "menuName": "Coca-Cola Lata", "price": 5.00},
  {"menuId": 16, "menuName": "Guaraná Lata", "price": 4.50}
]
→ items: [
  {"menuId": 16, "menuName": "Guaraná Lata", "quantity": 2, "price": 4.50},
  {"menuId": 15, "menuName": "Coca-Cola Lata", "quantity": 1, "price": 5.00}
]
→ ambiguidades: []

"marmitex médio com parmegiana e bife acebolado"
→ Busque no cardápio o menuId do "Marmitex Médio"
→ Busque questionId da pergunta "Escolha as carnes"
→ Busque answerId de "Parmegiana" e "Bife Acebolado"
→ items: [{
  "menuId": [ID_DO_CARDAPIO],
  "menuName": "Marmitex Médio",
  "quantity": 1,
  "price": [PRECO_DO_CARDAPIO],
  "selectedAnswers": [
    {"questionId": [ID_QUESTION], "answerId": [ID_PARMEGIANA], "answerName": "Parmegiana"},
    {"questionId": [ID_QUESTION], "answerId": [ID_BIFE], "answerName": "Bife Acebolado"}
  ]
}]

"marmitex médio com frango e sorvete de chocolate" = especificação clara
→ items: [{"menuName": "Marmitex Médio", "selectedAnswers": [frango]}, {"menuName": "Sorvete", "selectedAnswers": [chocolate]}]

EXEMPLO ESPECÍFICO DO USUÁRIO:
"eu pedi um marmitex medio com parmegiana e bife acebolado e um sorvete de morango"
→ SEMPRE EXTRAIR AS OPÇÕES EXPLÍCITAS: "parmegiana", "bife acebolado", "morango"
→ items: [
    {"menuName": "Marmitex Médio", "selectedAnswers": [{"answerName": "Parmegiana"}, {"answerName": "Bife Acebolado"}]},
    {"menuName": "Sorvete", "selectedAnswers": [{"answerName": "Morango"}]}
]

EXEMPLOS COM NOMES ALTERNATIVOS (alternativeNames):
"quero uma tubaina" onde há produto: {"menuName": "Guaraná Dolly", "alternativeNames": "tubaina, taubaina, dolly"}
→ items: [{"menuName": "Guaraná Dolly", "quantity": 1}] (reconhece "tubaina" pelo alternativeNames)

"me dá uma pizza meio a meio mussarela e calabresa" onde há: {"menuName": "Pizza 2 Sabores", "alternativeNames": "pizza meio sabor, pizza meio a meio, pizza metade"}
→ items: [{"menuName": "Pizza 2 Sabores", "quantity": 1, "selectedAnswers": [...]}] (reconhece pelo alternativeNames)

EXEMPLOS CRÍTICOS DE AMBIGUIDADE (NÃO INFERIR):

Cliente: "uma pizza"
Cardápio: [
  {"menuId": 1, "menuName": "Pizza de Mussarela", "price": 35},
  {"menuId": 2, "menuName": "Pizza de Calabresa", "price": 38},
  {"menuId": 3, "menuName": "Pizza Margherita", "price": 40}
]
→ CORRETO: {
  "items": [],
  "ambiguidades": [{
    "id": "amb_123",
    "palavra": "pizza",
    "quantity": 1,
    "items": [
      {"menuId": 1, "menuName": "Pizza de Mussarela", "price": 35},
      {"menuId": 2, "menuName": "Pizza de Calabresa", "price": 38},
      {"menuId": 3, "menuName": "Pizza Margherita", "price": 40}
    ]
  }]
}
❌ ERRADO: escolher "Pizza de Mussarela" sozinha (cliente NÃO mencionou mussarela)

Cliente: "um marmitex"
Cardápio: [
  {"menuId": 10, "menuName": "Marmitex Pequeno", "price": 20},
  {"menuId": 11, "menuName": "Marmitex Médio", "price": 25},
  {"menuId": 12, "menuName": "Marmitex Grande", "price": 30}
]
→ CORRETO: {
  "items": [],
  "ambiguidades": [{
    "palavra": "marmitex",
    "quantity": 1,
    "items": [
      {"menuId": 10, "menuName": "Marmitex Pequeno", "price": 20},
      {"menuId": 11, "menuName": "Marmitex Médio", "price": 25},
      {"menuId": 12, "menuName": "Marmitex Grande", "price": 30}
    ]
  }]
}
❌ ERRADO: escolher "Marmitex Médio" sozinho (cliente NÃO mencionou médio)

Cliente: "quero uma coca"
Cardápio: [
  {"menuId": 20, "menuName": "Coca-Cola Lata 350ml", "price": 5},
  {"menuId": 21, "menuName": "Coca-Cola 2L", "price": 10}
]
→ CORRETO: {
  "items": [],
  "ambiguidades": [{
    "palavra": "coca",
    "quantity": 1,
    "items": [
      {"menuId": 20, "menuName": "Coca-Cola Lata 350ml", "price": 5},
      {"menuId": 21, "menuName": "Coca-Cola 2L", "price": 10}
    ]
  }]
}
❌ ERRADO: escolher "Coca-Cola Lata 350ml" sozinha (cliente NÃO mencionou lata)

REGRA CRÍTICA: Se um produto tem perguntas obrigatórias (minAnswerRequired > 0) não respondidas pelo cliente, SEMPRE coloque em ambiguidades para o cliente escolher depois.

REGRA OBRIGATÓRIA - IDs:
VOCÊ DEVE SEMPRE RETORNAR OS IDs DO CARDÁPIO:
- menuId (OBRIGATÓRIO): Busque no cardápio e retorne o menuId EXATO do produto
- questionId (OBRIGATÓRIO para selectedAnswers): Busque nas questions do produto
- answerId (OBRIGATÓRIO para selectedAnswers): Busque nas answers da question
- NUNCA retorne apenas nomes sem IDs
- SEMPRE busque os IDs correspondentes no cardápio fornecido em JSON

FORMATO JSON OBRIGATÓRIO:
{
  "intent": "ordering" | "asking" | "asking_delivery",
  "items": [
    {
      "menuId": number (OBRIGATÓRIO - busque no cardápio),
      "menuName": "string",
      "quantity": number,
      "palavra": "string",
      "price": number,
      "selectedAnswers"?: [
        {
          "questionId": number (OBRIGATÓRIO),
          "answerId": number (OBRIGATÓRIO),
          "answerName": "string",
          "quantity"?: number,
          "price"?: number
        }
      ]
    }
  ],
  "ambiguidades": [
    {
      "id": "string",
      "palavra": "string",
      "quantity": number,
      "items": [
        {
          "menuId": number (OBRIGATÓRIO),
          "menuName": "string",
          "price": number
        }
      ]
    }
  ]
}

EXEMPLOS COMPLETOS COM INTENÇÃO:

EXEMPLO 1 - PEDIDO (extrair produtos):
Cliente: "quero uma pizza de mussarela"
→ {
  "intent": "ordering",
  "items": [{"menuId": 10, "menuName": "Pizza de Mussarela", "quantity": 1, "price": 35.00}],
  "ambiguidades": []
}

EXEMPLO 2 - PERGUNTA (NÃO extrair):
Cliente: "vocês tem pizza de pepperoni aí?"
→ {
  "intent": "asking",
  "items": [],
  "ambiguidades": []
}

EXEMPLO 3 - PERGUNTA SOBRE ENTREGA (NÃO extrair):
Cliente: "vocês entregam na rua das flores?"
→ {
  "intent": "asking_delivery",
  "items": [],
  "ambiguidades": []
}

EXEMPLO 4 - PEDIDO MÚLTIPLO (extrair produtos):
Cliente: "manda um marmitex médio e uma coca"
→ {
  "intent": "ordering",
  "items": [
    {"menuId": 5, "menuName": "Marmitex Médio", "quantity": 1, "price": 25.00},
    {"menuId": 15, "menuName": "Coca-Cola Lata", "quantity": 1, "price": 5.00}
  ],
  "ambiguidades": []
}

REGRA CRÍTICA: Se intent = "asking" ou "asking_delivery", SEMPRE retorne items: [] e ambiguidades: []
`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
    });

    const content = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    console.log(`🎯 IA detectou intenção para "${message}": ${parsed.intent}`);

    // Validar estrutura da resposta
    const result: ExtractionResult = {
      intent: parsed.intent || 'ordering', // Default para ordering se não especificado
      items: Array.isArray(parsed.items) ? parsed.items : [],
      ambiguidades: Array.isArray(parsed.ambiguidades) ? parsed.ambiguidades : []
    };

    // Se a intenção é perguntar, não processar produtos
    if (result.intent === 'asking' || result.intent === 'asking_delivery') {
      console.log(`❓ Cliente está PERGUNTANDO, não PEDINDO. Retornando listas vazias.`);
      return {
        intent: result.intent,
        items: [],
        ambiguidades: []
      };
    }

    // Adicionar IDs únicos para ambiguidades se não existirem
    result.ambiguidades = result.ambiguidades.map((amb: any) => ({
      ...amb,
      id: amb.id || `amb_${uuidv4().split('-')[0]}`
    }));

    // Pós-processamento: converter ambiguidades de 1 item em items diretos
    const ambiguidadesReais: any[] = [];
    result.ambiguidades.forEach((ambiguidade: any) => {
      if (ambiguidade.items && ambiguidade.items.length === 1) {
        // Se há apenas 1 item na ambiguidade, não é ambiguidade - mover para items
        const item = ambiguidade.items[0];
        result.items.push({
          menuId: item.menuId,
          menuName: item.menuName,
          quantity: ambiguidade.quantity || 1,
          palavra: ambiguidade.palavra,
          price: item.price,
          selectedAnswers: item.selectedAnswers
        });
      } else if (ambiguidade.items && ambiguidade.items.length > 1) {
        // Manter apenas ambiguidades reais (2+ items)
        ambiguidadesReais.push(ambiguidade);
      }
    });

    // Atualizar o resultado com apenas as ambiguidades reais
    result.ambiguidades = ambiguidadesReais;

    return result;
  } catch (error) {
    console.error('Erro ao extrair produtos com OpenAI:', error);
    // Fallback para método original
    return extractProductsFromMessage(message, cardapio);
  }
}

/**
 * Identifica método de pagamento escolhido pelo cliente usando IA
 * Também detecta se o cliente quer alterar o pedido ao invés de escolher pagamento
 */
export async function identifyPaymentMethod(userResponse: string): Promise<{
  method: 'PIX' | 'CREDIT_CARD' | 'DELIVERY' | null;
  confidence: number;
  wantsToChangeOrder: boolean;
  changeOrderReason?: string;
}> {
  const systemPrompt = `Você é um assistente especializado em identificar métodos de pagamento escolhidos por clientes.

TAREFA DUPLA: 
1. Identificar qual método de pagamento ele escolheu OU
2. Detectar se ele quer ALTERAR O PEDIDO ao invés de escolher pagamento

OPÇÕES DE PAGAMENTO DISPONÍVEIS:
- PIX - Pagamento via PIX
- CARTÃO DE CRÉDITO - Pagamento com cartão na entrega  
- PAGAMENTO NA ENTREGA - Dinheiro na entrega

RESPONDA EM JSON:
{
  "method": "PIX" | "CREDIT_CARD" | "DELIVERY" | null,
  "confidence": number (0-100),
  "wantsToChangeOrder": boolean,
  "changeOrderReason": "string (se wantsToChangeOrder for true)",
  "reasoning": "string explicando a decisão"
}

REGRAS PARA PAGAMENTO:
- Se mencionar "pix", "PIX", "Pix", "pixe", "piks", "pick", "1", "peace", "peas", "pis", "primeira", "primeira opção", "opção 1", "numero 1" → PIX
- Se mencionar "cartão", "cartao", "crédito", "credito", "card", "2", "segunda", "segunda opção", "opção 2", "numero 2" → CREDIT_CARD  
- Se mencionar "dinheiro", "entrega", "cash", "à vista", "3", "terceira", "terceira opção", "opção 3", "numero 3" → DELIVERY

REGRAS PARA ALTERAÇÃO DE PEDIDO (PRIORIDADE MÁXIMA):
- Se mencionar adicionar/incluir produtos → wantsToChangeOrder: true
- Se mencionar remover/tirar/cancelar produtos → wantsToChangeOrder: true  
- Se mencionar trocar/alterar produtos → wantsToChangeOrder: true
- Se mencionar quantidade (mais, menos, aumentar, diminuir) → wantsToChangeOrder: true
- Se mencionar nomes de produtos → wantsToChangeOrder: true
- Se disser "não" seguido de alteração → wantsToChangeOrder: true
- Se falar "antes de pagar" ou "primeiro" → wantsToChangeOrder: true

EXEMPLOS DE PAGAMENTO:
Cliente: "PIX" → {"method": "PIX", "confidence": 95, "wantsToChangeOrder": false, "reasoning": "menciona PIX diretamente"}
Cliente: "pix" → {"method": "PIX", "confidence": 95, "wantsToChangeOrder": false, "reasoning": "menciona pix minúsculo"}
Cliente: "Pix" → {"method": "PIX", "confidence": 95, "wantsToChangeOrder": false, "reasoning": "menciona Pix capitalizado"}
Cliente: "pixe" → {"method": "PIX", "confidence": 85, "wantsToChangeOrder": false, "reasoning": "variação de escrita de PIX"}
Cliente: "1" → {"method": "PIX", "confidence": 90, "wantsToChangeOrder": false, "reasoning": "escolheu opção 1"}
Cliente: "primeira" → {"method": "PIX", "confidence": 90, "wantsToChangeOrder": false, "reasoning": "escolheu primeira opção"}
Cliente: "opção 1" → {"method": "PIX", "confidence": 90, "wantsToChangeOrder": false, "reasoning": "escolheu opção 1"}
Cliente: "vou de pix" → {"method": "PIX", "confidence": 95, "wantsToChangeOrder": false, "reasoning": "confirmou pagamento via PIX"}
Cliente: "pode ser pix" → {"method": "PIX", "confidence": 90, "wantsToChangeOrder": false, "reasoning": "aceitou pagamento via PIX"}

EXEMPLOS DE ALTERAÇÃO DE PEDIDO:
Cliente: "quero incluir uma coca" → {"method": null, "confidence": 0, "wantsToChangeOrder": true, "changeOrderReason": "quer incluir produto", "reasoning": "quer alterar pedido antes do pagamento"}
Cliente: "pode tirar o sorvete?" → {"method": null, "confidence": 0, "wantsToChangeOrder": true, "changeOrderReason": "quer remover produto", "reasoning": "quer remover item do pedido"}
Cliente: "não, quero adicionar mais uma marmita" → {"method": null, "confidence": 0, "wantsToChangeOrder": true, "changeOrderReason": "quer adicionar produto", "reasoning": "rejeitou pagamento para alterar pedido"}
Cliente: "antes de pagar, posso trocar o tamanho?" → {"method": null, "confidence": 0, "wantsToChangeOrder": true, "changeOrderReason": "quer trocar produto", "reasoning": "quer alterar antes do pagamento"}
Cliente: "mais uma coca cola" → {"method": null, "confidence": 0, "wantsToChangeOrder": true, "changeOrderReason": "quer adicionar produto", "reasoning": "quer adicionar mais itens"}

VARIAÇÕES COMUNS DE PIX (todas devem ser identificadas como PIX):
- "pix", "PIX", "Pix", "PIx", "pIX" 
- "pixe", "piks", "pick" (erros de digitação)
- "vou de pix", "quero pix", "pode ser pix", "prefiro pix"
- "pix mesmo", "pix por favor", "vamos de pix"
- "1", "primeira", "primeira opção", "opção 1", "numero 1"

IMPORTANTE: Se detectar QUALQUER intenção de alterar pedido, sempre retorne wantsToChangeOrder: true e method: null.

ATENÇÃO: Seja MUITO permissivo com variações de PIX. Qualquer palavra que lembre PIX deve ser identificada como PIX.

Retorne APENAS o JSON, sem texto adicional.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userResponse }
      ],
    });

    const content = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    console.log(`💳 IA identificou pagamento para "${userResponse}":`, parsed);

    return {
      method: parsed.method || null,
      confidence: parsed.confidence || 0,
      wantsToChangeOrder: parsed.wantsToChangeOrder || false,
      changeOrderReason: parsed.changeOrderReason
    };

  } catch (error) {
    console.error('Erro ao identificar método de pagamento:', error);
    return { method: null, confidence: 0, wantsToChangeOrder: false };
  }
}

/**
 * Identifica tipo de entrega: se cliente informou ENDEREÇO (delivery) ou disse RETIRADA (counter)
 * Nova pergunta: "Informe seu endereço para entrega ou digite Retirada para retirar o pedido na loja"
 */
export async function identifyDeliveryType(userResponse: string): Promise<{
  type: 'delivery' | 'counter' | null;
  confidence: number;
  extractedAddress?: string;
  parsedAddress?: {
    street?: string;
    number?: string;
    neighborhood?: string;
    complement?: string;
  };
}> {
  const systemPrompt = `Você é um assistente especializado em identificar se o cliente informou um ENDEREÇO ou quer RETIRADA.

CONTEXTO: Cliente foi perguntado: "Informe seu endereço para entrega ou digite Retirada para retirar o pedido na loja"

TAREFA: Analisar se a resposta contém um endereço OU indica retirada na loja.

RESPONDA EM JSON:
{
  "type": "delivery" | "counter" | null,
  "confidence": number (0-100),
  "reasoning": "string explicando a decisão",
  "extractedAddress": "string" (OBRIGATÓRIO se type=delivery - endereço completo extraído),
  "parsedAddress": {
    "street": "string" (nome da rua/avenida),
    "number": "string" (número),
    "neighborhood": "string" (bairro, se mencionado),
    "complement": "string" (apartamento, casa, etc.)
  }
}

REGRAS PARA IDENTIFICAÇÃO:

1. **DELIVERY** - Cliente informou um ENDEREÇO:
   - Contém rua + número ("rua das flores 123", "av paulista 1000")
   - Padrões de endereço ("na rua...", "aqui na...", "r. antonio...")
   - Bairros conhecidos ("vila madalena", "centro", "jardim...")
   - CEPs ("01234-567", "12345678")
   - Qualquer indicação clara de localização física

2. **COUNTER** - Cliente quer RETIRADA:
   - Palavras: "retirada", "retirar", "buscar", "loja", "balcão", "pickup"
   - Frases: "vou buscar", "retirar na loja", "buscar no balcão"
   - Variações: "retiro", "pego lá", "vou pegar"

3. **NULL** - Não conseguiu identificar claramente

EXEMPLOS:

Cliente: "rua das flores, 123" → {
  "type": "delivery", 
  "confidence": 95, 
  "reasoning": "informou endereço completo",
  "extractedAddress": "rua das flores, 123",
  "parsedAddress": {
    "street": "rua das flores",
    "number": "123",
    "neighborhood": "",
    "complement": ""
  }
}

Cliente: "av paulista 1000 ap 50" → {
  "type": "delivery", 
  "confidence": 95, 
  "reasoning": "endereço com complemento",
  "extractedAddress": "av paulista 1000 ap 50",
  "parsedAddress": {
    "street": "av paulista",
    "number": "1000",
    "neighborhood": "",
    "complement": "ap 50"
  }
}

Cliente: "vila madalena, r. harmonia 789" → {
  "type": "delivery", 
  "confidence": 95, 
  "reasoning": "bairro e rua especificados",
  "extractedAddress": "vila madalena, r. harmonia 789",
  "parsedAddress": {
    "street": "r. harmonia",
    "number": "789",
    "neighborhood": "vila madalena",
    "complement": ""
  }
}

Cliente: "retirada" → {"type": "counter", "confidence": 95, "reasoning": "escolheu retirada explicitamente"}
Cliente: "vou buscar na loja" → {"type": "counter", "confidence": 90, "reasoning": "indica que vai buscar"}
Cliente: "retirar" → {"type": "counter", "confidence": 85, "reasoning": "variação de retirada"}
Cliente: "pego lá" → {"type": "counter", "confidence": 75, "reasoning": "indica retirada informal"}

Cliente: "sim" → {"type": null, "confidence": 20, "reasoning": "resposta ambígua"}
Cliente: "ok" → {"type": null, "confidence": 15, "reasoning": "confirmação sem especificação"}

IMPORTANTE: Priorize detecção de ENDEREÇOS (delivery) sobre palavras soltas. Se há indícios de localização física = delivery.

Retorne APENAS o JSON, sem texto adicional.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userResponse }
      ],
    });

    const content = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    console.log(`🚚 IA identificou entrega para "${userResponse}":`, parsed);

    return {
      type: parsed.type || null,
      confidence: parsed.confidence || 0,
      extractedAddress: parsed.extractedAddress,
      parsedAddress: parsed.parsedAddress
    };

  } catch (error) {
    console.error('Erro ao identificar tipo de entrega:', error);
    return { type: null, confidence: 0 };
  }
}

interface AddressDetectionResult {
  hasAddress: boolean;
  extractedAddress?: string;
  confidence: number;
  parsedAddress?: {
    street?: string;
    number?: string;
    neighborhood?: string;
    complement?: string;
  };
}

/**
 * Detecta se a mensagem contém um endereço de entrega
 */
export async function detectAddressInMessage(message: string): Promise<AddressDetectionResult> {
  const systemPrompt = `Você é um assistente especializado em detectar endereços de entrega em mensagens de pedidos de delivery.

TAREFA: Analisar se a mensagem contém um endereço completo ou parcial para entrega.

PADRÕES COMUNS DE ENDEREÇO:
- "manda um [produto] na rua [nome], [número], [bairro]"
- "aqui na rua [nome], [número]"
- "rua [nome], [número] - [bairro]"
- "av [nome], [número]"
- "entregar em [endereço]"
- "[produto] aqui na [endereço]"

RESPONDA EM JSON:
{
  "hasAddress": boolean,
  "extractedAddress": "string" (endereço extraído da mensagem),
  "confidence": number (0-100),
  "parsedAddress": {
    "street": "string" (nome da rua/avenida),
    "number": "string" (número),
    "neighborhood": "string" (bairro, se mencionado),
    "complement": "string" (apartamento, casa, etc.)
  }
}

REGRAS:
- hasAddress = true apenas se houver rua/av + número OU indicação clara de local
- extractedAddress deve conter o endereço completo encontrado na mensagem
- confidence alto (80+) para endereços completos, médio (50-79) para parciais, baixo (<50) para duvidosos
- Ignore referências genéricas como "em casa", "aqui", sem detalhes
- Detecte variações: "rua", "r.", "av", "avenida", "travessa", "alameda"

EXEMPLOS:

"manda um filé de frango na rua dos anjos, 10, vila emma" → {
  "hasAddress": true,
  "extractedAddress": "rua dos anjos, 10, vila emma",
  "confidence": 95,
  "parsedAddress": {
    "street": "rua dos anjos",
    "number": "10",
    "neighborhood": "vila emma",
    "complement": ""
  }
}

"pode mandar um marmitex medio aqui na rua jose roberto messias, 160 - v de france 3" → {
  "hasAddress": true,
  "extractedAddress": "rua jose roberto messias, 160 - v de france 3",
  "confidence": 95,
  "parsedAddress": {
    "street": "rua jose roberto messias",
    "number": "160",
    "neighborhood": "v de france 3",
    "complement": ""
  }
}

"quero uma pizza na rua das flores 250" → {
  "hasAddress": true,
  "extractedAddress": "rua das flores 250",
  "confidence": 85,
  "parsedAddress": {
    "street": "rua das flores",
    "number": "250",
    "neighborhood": "",
    "complement": ""
  }
}

"entrega na av paulista 1000 ap 50" → {
  "hasAddress": true,
  "extractedAddress": "av paulista 1000 ap 50",
  "confidence": 90,
  "parsedAddress": {
    "street": "av paulista",
    "number": "1000",
    "neighborhood": "",
    "complement": "ap 50"
  }
}

"quero um lanche" → {
  "hasAddress": false,
  "extractedAddress": "",
  "confidence": 5,
  "parsedAddress": {}
}

Retorne APENAS o JSON, sem texto adicional.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Mensagem do cliente: "${message}"` }
      ],
    });

    const content = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    console.log(`📍 IA detectou endereço para "${message}":`, parsed);

    return {
      hasAddress: parsed.hasAddress || false,
      extractedAddress: parsed.extractedAddress,
      confidence: parsed.confidence || 0,
      parsedAddress: parsed.parsedAddress
    };

  } catch (error) {
    console.error('Erro ao detectar endereço:', error);
    return {
      hasAddress: false,
      confidence: 0
    };
  }
}