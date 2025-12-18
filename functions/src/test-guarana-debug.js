/**
 * Debug do problema: "guaraná" não sendo identificado
 * 
 * Entrada: "guaraná"
 * Cardápio: [{ menuId: 6, menuName: 'Guaraná Lata', price: 5.9 }]
 * Resultado: { items: [], ambiguidades: [] }
 * 
 * ESPERADO: { items: [{ menuId: 6, menuName: 'Guaraná Lata', ... }] }
 */

console.log('🐛 Debug: Problema com identificação de "guaraná"');
console.log('='.repeat(60));

console.log('📋 Cenário do problema:');
console.log('Input do cliente: "guaraná"');
console.log('Cardápio disponível:');

const cardapio = [
  { menuId: 1, menuName: 'Marmitex Pequeno ', price: 19.9 },
  { menuId: 2, menuName: 'Marmitex Médio', price: 25.9 },
  { menuId: 3, menuName: 'Marmitex Grande ', price: 39.9 },
  { menuId: 4, menuName: 'Sorvete', price: 16 },
  { menuId: 5, menuName: 'Coca Cola Lata', price: 6.9 },
  { menuId: 6, menuName: 'Guaraná Lata', price: 5.9 },
  { menuId: 7, menuName: 'Bolo Aniversário', price: 32.4 },
  { menuId: 8, menuName: 'Coca Cola 1 Litro', price: 22 }
];

cardapio.forEach((item, index) => {
  console.log(`${index + 1}. ${item.menuName} - R$ ${item.price}`);
});

console.log('\n❌ Resultado atual: { items: [], ambiguidades: [] }');
console.log('✅ Resultado esperado: { items: [{ menuId: 6, menuName: "Guaraná Lata", quantity: 1, ... }] }');

console.log('\n🔍 Possíveis causas:');
console.log('1. Prompt muito restritivo com matching exato');
console.log('2. IA não fazendo matching "guaraná" → "Guaraná Lata"');
console.log('3. Problema com normalização de caracteres (á)');
console.log('4. Threshold de similaridade muito alto');
console.log('5. Fallback não funcionando');

console.log('\n💡 Testes necessários:');
console.log('1. "guarana" (sem acento) → deve encontrar "Guaraná Lata"');
console.log('2. "guaraná lata" (completo) → deve encontrar "Guaraná Lata"');  
console.log('3. "coca" → deve encontrar "Coca Cola Lata"');
console.log('4. "sorvete" → deve encontrar "Sorvete"');

console.log('\n📝 Debug do prompt atual:');
console.log('O prompt atual tem estas regras:');
console.log('- IDENTIFICAR CADA PRODUTO MENCIONADO SEPARADAMENTE');
console.log('- Se palavra genérica + múltiplas opções → ambiguidades');
console.log('- Se específico → items diretos');
console.log('- Palavra genérica = ambiguidade!');

console.log('\n🤔 Análise do caso "guaraná":');
console.log('Cliente: "guaraná"');
console.log('Menu: ["Guaraná Lata"] (apenas 1 opção)');
console.log('ESPERADO: Como há apenas 1 opção, deveria ir para items diretos');
console.log('PROBLEMA: IA não está fazendo o matching "guaraná" → "Guaraná Lata"');

console.log('\n🔧 Possíveis soluções:');
console.log('1. Melhorar o matching no prompt');
console.log('2. Adicionar exemplos específicos no prompt');
console.log('3. Verificar se tryFallbackMatching está funcionando');
console.log('4. Adicionar normalização de texto no prompt');

console.log('\n⚡ Teste rápido do que deveria acontecer:');
console.log('Input: "guaraná"');
console.log('1. IA analisa cardápio');
console.log('2. Encontra "Guaraná Lata" como match');
console.log('3. Como há apenas 1 opção → items direto');
console.log('4. Retorna: { items: [{ menuId: 6, menuName: "Guaraná Lata", quantity: 1 }] }');

console.log('\n' + '='.repeat(60));
console.log('🎯 Próximo passo: Investigar o prompt e melhorar o matching');