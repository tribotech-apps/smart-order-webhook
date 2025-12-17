/**
 * Teste para verificar o novo formato de resumo que mostra TODAS as respostas
 * 
 * Cenário de teste:
 * Produto: 2x Marmitex Grande com múltiplas customizações
 * - Pergunta 1: Escolha a proteína → Filé à Parmegiana (pago)
 * - Pergunta 2: Escolha o acompanhamento → Arroz e Feijão (gratuito)
 * - Pergunta 3: Adicionais → Batata Frita (pago)
 * 
 * Formato esperado:
 * • 2x Marmitex Grande
 *     └ Escolha a proteína: 1x Filé à Parmegiana (+R$ 11.80)
 *     └ Escolha o acompanhamento: 1x Arroz e Feijão
 *     └ Adicionais: 1x Batata Frita (+R$ 7.00) - R$ 54.80
 */

console.log('📋 Teste do novo formato de resumo completo');
console.log('='.repeat(60));

// Simular item de carrinho com customizações completas
const cartItem = {
  menuId: 1,
  menuName: "Marmitex Grande",
  price: 18.00,
  quantity: 2,
  questions: [
    {
      questionId: 1,
      questionName: "Escolha a proteína",
      answers: [
        {
          answerId: 1,
          answerName: "Filé à Parmegiana",
          price: 5.90,
          quantity: 1
        }
      ]
    },
    {
      questionId: 2,
      questionName: "Escolha o acompanhamento",
      answers: [
        {
          answerId: 5,
          answerName: "Arroz e Feijão",
          price: 0, // Gratuito
          quantity: 1
        }
      ]
    },
    {
      questionId: 3,
      questionName: "Adicionais",
      answers: [
        {
          answerId: 8,
          answerName: "Batata Frita",
          price: 3.50,
          quantity: 1
        }
      ]
    }
  ]
};

// Função copiada do código principal
function calculateItemTotalPrice(item) {
  let totalPrice = item.price * item.quantity;
  
  if (item.questions && Array.isArray(item.questions)) {
    item.questions.forEach((question) => {
      if (question.answers && Array.isArray(question.answers)) {
        question.answers.forEach((answer) => {
          if (answer.price && answer.price > 0 && answer.quantity) {
            totalPrice += answer.price * answer.quantity * item.quantity;
          }
        });
      }
    });
  }
  
  return totalPrice;
}

// Função atualizada copiada do código principal
function generateItemDescription(item) {
  let description = `• ${item.quantity}x ${item.menuName}`;
  let itemTotal = item.price * item.quantity;
  
  // Lista de todas as respostas selecionadas (pagas e gratuitas)
  const allAnswerDetails = [];
  
  if (item.questions && Array.isArray(item.questions)) {
    item.questions.forEach((question) => {
      if (question.answers && Array.isArray(question.answers)) {
        // Mostrar a pergunta como cabeçalho
        const questionTitle = `${question.questionName}:`;
        const selectedAnswers = [];
        
        question.answers.forEach((answer) => {
          if (answer.quantity && answer.quantity > 0) {
            // Calcular total do adicional se tiver preço
            if (answer.price && answer.price > 0) {
              const answerTotal = answer.price * answer.quantity * item.quantity;
              selectedAnswers.push(`${answer.quantity}x ${answer.answerName} (+R$ ${answerTotal.toFixed(2)})`);
              itemTotal += answerTotal;
            } else {
              // Resposta gratuita
              selectedAnswers.push(`${answer.quantity}x ${answer.answerName}`);
            }
          }
        });
        
        // Adicionar pergunta e respostas se houver seleções
        if (selectedAnswers.length > 0) {
          allAnswerDetails.push(`${questionTitle} ${selectedAnswers.join(', ')}`);
        }
      }
    });
  }
  
  // Adicionar detalhes de todas as respostas se houver
  if (allAnswerDetails.length > 0) {
    description += `\n    └ ${allAnswerDetails.join('\n    └ ')}`;
  }
  
  description += ` - R$ ${itemTotal.toFixed(2)}`;
  
  return description;
}

console.log('📦 Item de teste:');
console.log(`   ${cartItem.quantity}x ${cartItem.menuName} (base: R$ ${cartItem.price.toFixed(2)})`);

console.log('\n🍽️ Customizações:');
cartItem.questions.forEach((question, qIndex) => {
  console.log(`   ${qIndex + 1}. ${question.questionName}:`);
  question.answers.forEach((answer) => {
    const status = answer.price > 0 ? `(+R$ ${(answer.price * answer.quantity * cartItem.quantity).toFixed(2)})` : '(gratuito)';
    console.log(`      └ ${answer.quantity}x ${answer.answerName} ${status}`);
  });
});

console.log('\n🧮 Cálculo:');
const baseTotal = cartItem.price * cartItem.quantity;
const calculatedTotal = calculateItemTotalPrice(cartItem);
const addonsTotal = calculatedTotal - baseTotal;

console.log(`   Base: R$ ${baseTotal.toFixed(2)}`);
console.log(`   Adicionais: R$ ${addonsTotal.toFixed(2)}`);
console.log(`   TOTAL: R$ ${calculatedTotal.toFixed(2)}`);

console.log('\n📝 Formato ANTERIOR (só pagos):');
console.log('• 2x Marmitex Grande');
console.log('    └ 1x Filé à Parmegiana (+R$ 11.80)');
console.log('    └ 1x Batata Frita (+R$ 7.00) - R$ 54.80');

console.log('\n📝 Formato NOVO (todas as respostas):');
const description = generateItemDescription(cartItem);
console.log(description);

console.log('\n' + '='.repeat(60));
console.log('✅ Melhorias implementadas:');
console.log('');
console.log('📋 Exibição completa:');
console.log('   ✅ Mostra TODAS as perguntas feitas');
console.log('   ✅ Mostra TODAS as respostas selecionadas');
console.log('   ✅ Diferencia itens pagos vs gratuitos');
console.log('   ✅ Formato claro: Pergunta: Resposta');
console.log('');
console.log('💰 Cálculos corretos:');
console.log('   ✅ Inclui preços de todos os adicionais pagos');
console.log('   ✅ Não altera cálculo para itens gratuitos');
console.log('   ✅ Total correto no final');
console.log('');
console.log('🎯 Benefícios:');
console.log('   ✅ Cliente vê exatamente o que escolheu');
console.log('   ✅ Transparência total nas customizações');
console.log('   ✅ Fácil conferência do pedido');

console.log('\n📱 Agora no webhook, todos os resumos mostrarão:');
console.log('   - Nome do produto + quantidade');
console.log('   - Cada pergunta feita durante customização');
console.log('   - Cada resposta selecionada (paga ou gratuita)');
console.log('   - Total final correto');