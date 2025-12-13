import { MenuItem } from '../types/Store';

export interface MatchedProduct {
  menuId: number;
  menuName: string;
  quantity: number;
  confidence: number;
}

export interface ProductMatch {
  identifiedProducts: MatchedProduct[];
  ambiguousProducts: {
    searchTerm: string;
    possibleMatches: MatchedProduct[];
  }[];
}

class TextProductMatcher {
  // Sinônimos conhecidos
  private synonyms: Record<string, string[]> = {
    'marmita': ['marmitex', 'marmita'],
    'marmitex': ['marmitex', 'marmita'],
    'coca': ['coca', 'cola', 'coca-cola'],
    'cola': ['coca', 'cola', 'coca-cola'],
    'refri': ['refrigerante', 'refri', 'coca', 'cola', 'guarana', 'guaraná'],
    'refrigerante': ['refrigerante', 'refri', 'coca', 'cola', 'guarana', 'guaraná'],
    'guarana': ['guarana', 'guaraná'],
    'guaraná': ['guarana', 'guaraná'],
    'pizza': ['pizza'],
    'lanche': ['lanche', 'sanduiche', 'hambúrguer', 'hamburger'],
    'sanduiche': ['lanche', 'sanduiche', 'hambúrguer', 'hamburger'],
    'hambúrguer': ['lanche', 'sanduiche', 'hambúrguer', 'hamburger'],
    'hamburger': ['lanche', 'sanduiche', 'hambúrguer', 'hamburger']
  };

  // Palavras numéricas por extenso
  private numbersMap: Record<string, number> = {
    'um': 1, 'uma': 1, 'primeiro': 1, 'primeira': 1,
    'dois': 2, 'duas': 2, 'segundo': 2, 'segunda': 2,
    'três': 3, 'tres': 3, 'terceiro': 3, 'terceira': 3,
    'quatro': 4, 'quarto': 4, 'quarta': 4,
    'cinco': 5, 'quinto': 5, 'quinta': 5,
    'seis': 6, 'sexto': 6, 'sexta': 6,
    'sete': 7, 'sétimo': 7, 'sétima': 7,
    'oito': 8, 'oitavo': 8, 'oitava': 8,
    'nove': 9, 'nono': 9, 'nona': 9,
    'dez': 10, 'décimo': 10, 'décima': 10
  };

  /**
   * Identifica produtos na mensagem baseado no cardápio
   */
  matchProducts(message: string, menu: MenuItem[]): ProductMatch {
    console.log('🔍 Iniciando matching de produtos:', { message, menuCount: menu.length });

    // Normalizar mensagem
    const normalizedMessage = this.normalizeText(message);
    console.log('📝 Mensagem normalizada:', normalizedMessage);

    // Extrair termos de busca e suas quantidades
    const searchTerms = this.extractSearchTerms(normalizedMessage);
    console.log('🎯 Termos extraídos:', searchTerms);

    const identifiedProducts: MatchedProduct[] = [];
    const ambiguousProducts: { searchTerm: string; possibleMatches: MatchedProduct[] }[] = [];

    // Para cada termo de busca, encontrar produtos compatíveis
    for (const { term, quantity } of searchTerms) {
      console.log(`🔎 Processando termo: "${term}" (qty: ${quantity})`);

      const matches = this.findMatches(term, menu);
      console.log(`📊 Matches encontrados:`, matches);

      if (matches.length === 0) {
        console.log(`❌ Nenhum match para "${term}"`);
        continue;
      }

      if (matches.length === 1) {
        // Produto único identificado
        identifiedProducts.push({
          ...matches[0],
          quantity
        });
        console.log(`✅ Produto identificado: ${matches[0].menuName} (qty: ${quantity})`);
      } else {
        // Múltiplas opções - ambíguo
        ambiguousProducts.push({
          searchTerm: term,
          possibleMatches: matches.map(match => ({ ...match, quantity }))
        });
        console.log(`🤔 Produto ambíguo: "${term}" com ${matches.length} opções`);
      }
    }

    const result = { identifiedProducts, ambiguousProducts };
    console.log('🎉 Resultado final:', result);

    return result;
  }

  /**
   * Normaliza texto removendo acentos, pontuações e convertendo para lowercase
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^\w\s]/g, ' ') // Remove pontuações
      .replace(/\s+/g, ' ') // Múltiplos espaços em um
      .trim();
  }

  /**
   * Extrai termos de busca e suas quantidades da mensagem
   */
  private extractSearchTerms(message: string): { term: string; quantity: number }[] {
    const terms: { term: string; quantity: number }[] = [];
    const words = message.split(/\s+/);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      // Verificar se é um número ou quantidade
      const quantity = this.extractQuantity(words, i);

      // Pular palavras muito pequenas ou conectores
      if (word.length < 3 || this.isConnector(word)) {
        continue;
      }

      // Pular se for apenas um número
      if (/^\d+$/.test(word) || this.numbersMap[word]) {
        continue;
      }

      terms.push({
        term: word,
        quantity: quantity || 1
      });
    }

    return terms;
  }

  /**
   * Extrai quantidade considerando posição atual na mensagem
   */
  private extractQuantity(words: string[], currentIndex: number): number | null {
    // Verificar palavra anterior
    if (currentIndex > 0) {
      const prevWord = words[currentIndex - 1];

      // Número anterior
      const numFromPrev = parseInt(prevWord);
      if (!isNaN(numFromPrev) && numFromPrev > 0 && numFromPrev <= 20) {
        return numFromPrev;
      }

      // Palavra numérica anterior
      if (this.numbersMap[prevWord]) {
        return this.numbersMap[prevWord];
      }
    }

    // Verificar próxima palavra (menos comum)
    if (currentIndex < words.length - 1) {
      const nextWord = words[currentIndex + 1];
      const numFromNext = parseInt(nextWord);
      if (!isNaN(numFromNext) && numFromNext > 0 && numFromNext <= 20) {
        return numFromNext;
      }
    }

    return null;
  }

  /**
   * Verifica se é uma palavra conectora (preposições, artigos, etc.)
   */
  private isConnector(word: string): boolean {
    const connectors = [
      'e', 'de', 'da', 'do', 'dos', 'das', 'com', 'para', 'por', 'em', 'na', 'no', 'nas', 'nos',
      'um', 'uma', 'uns', 'umas', 'o', 'a', 'os', 'as', 'que', 'quero', 'gostaria', 'pedir',
      'pode', 'vou', 'queria', 'me', 'da', 'dar', 'favor', 'por'
    ];
    return connectors.includes(word);
  }

  /**
   * Encontra matches para um termo específico no cardápio
   */
  private findMatches(searchTerm: string, menu: MenuItem[]): MatchedProduct[] {
    const matches: MatchedProduct[] = [];

    for (const item of menu) {
      const confidence = this.calculateConfidence(searchTerm, item);

      if (confidence >= 0.6) { // Threshold mínimo para considerarmos um match
        matches.push({
          menuId: item.menuId,
          menuName: item.menuName,
          quantity: 1, // Será sobrescrito depois
          confidence
        });
      }
    }

    // Ordenar por confidence (maior primeiro)
    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Calcula confidence score entre termo de busca e item do menu
   */
  private calculateConfidence(searchTerm: string, menuItem: MenuItem): number {
    const normalizedItemName = this.normalizeText(menuItem.menuName);
    const normalizedDescription = this.normalizeText(menuItem.menuDescription || '');

    let maxConfidence = 0;

    // 1. Match exato
    if (normalizedItemName.includes(searchTerm)) {
      maxConfidence = Math.max(maxConfidence, 0.95);
    }

    // 2. Match em descrição
    if (normalizedDescription.includes(searchTerm)) {
      maxConfidence = Math.max(maxConfidence, 0.85);
    }

    // 3. Match por sinônimos
    const synonymConfidence = this.checkSynonymMatch(searchTerm, normalizedItemName);
    maxConfidence = Math.max(maxConfidence, synonymConfidence);

    // 4. Match por palavras individuais
    const wordMatchConfidence = this.checkWordMatch(searchTerm, normalizedItemName);
    maxConfidence = Math.max(maxConfidence, wordMatchConfidence);

    // 5. Similaridade de Levenshtein para erros de digitação
    const editConfidence = this.calculateEditDistanceConfidence(searchTerm, normalizedItemName);
    maxConfidence = Math.max(maxConfidence, editConfidence);

    return maxConfidence;
  }

  /**
   * Verifica match por sinônimos
   */
  private checkSynonymMatch(searchTerm: string, itemName: string): number {
    const synonyms = this.synonyms[searchTerm] || [];

    for (const synonym of synonyms) {
      if (itemName.includes(synonym)) {
        return 0.9; // Alta confidence para sinônimos
      }
    }

    return 0;
  }

  /**
   * Verifica match por palavras individuais
   */
  private checkWordMatch(searchTerm: string, itemName: string): number {
    const searchWords = searchTerm.split(/\s+/);
    const itemWords = itemName.split(/\s+/);

    let matches = 0;
    for (const searchWord of searchWords) {
      if (searchWord.length >= 3) {
        for (const itemWord of itemWords) {
          if (itemWord.includes(searchWord) || searchWord.includes(itemWord)) {
            matches++;
            break;
          }
        }
      }
    }

    if (matches > 0) {
      return Math.min(0.8, (matches / searchWords.length) * 0.8);
    }

    return 0;
  }

  /**
   * Calcula confidence baseado em distância de edição (para erros de digitação)
   */
  private calculateEditDistanceConfidence(searchTerm: string, itemName: string): number {
    // Para palavras muito diferentes em tamanho, não calcular
    if (Math.abs(searchTerm.length - itemName.length) > 5) {
      return 0;
    }

    const distance = this.levenshteinDistance(searchTerm, itemName);
    const maxLength = Math.max(searchTerm.length, itemName.length);

    const similarity = 1 - (distance / maxLength);

    // Só considerar se similaridade for alta (para evitar false positives)
    return similarity >= 0.7 ? similarity * 0.75 : 0;
  }

  /**
   * Calcula distância de Levenshtein entre duas strings
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

    for (let i = 0; i <= a.length; i += 1) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= b.length; j += 1) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= b.length; j += 1) {
      for (let i = 1; i <= a.length; i += 1) {
        const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[b.length][a.length];
  }
}

export const textProductMatcher = new TextProductMatcher();