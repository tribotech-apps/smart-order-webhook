"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exemploDeUso = exemploDeUso;
const textProductMatcher_1 = require("./textProductMatcher");
// Exemplo de como usar o sistema sem IA
function exemploDeUso() {
    // Cardápio de exemplo
    const menu = [
        {
            menuId: 1,
            menuName: 'Marmitex Pequeno',
            menuDescription: 'Marmitex pequeno com 1 carne',
            categoryId: 1,
            price: 15.00,
            questions: [],
            allDays: true
        },
        {
            menuId: 2,
            menuName: 'Marmitex Médio',
            menuDescription: 'Marmitex médio com 2 carnes',
            categoryId: 1,
            price: 18.00,
            questions: [],
            allDays: true
        },
        {
            menuId: 3,
            menuName: 'Marmitex Grande',
            menuDescription: 'Marmitex grande com 3 carnes',
            categoryId: 1,
            price: 22.00,
            questions: [],
            allDays: true
        },
        {
            menuId: 4,
            menuName: 'Coca Cola Lata',
            menuDescription: 'Refrigerante Coca Cola 350ml',
            categoryId: 2,
            price: 5.00,
            questions: [],
            allDays: true
        },
        {
            menuId: 5,
            menuName: 'Coca Cola 2 Litros',
            menuDescription: 'Refrigerante Coca Cola 2L',
            categoryId: 2,
            price: 8.00,
            questions: [],
            allDays: true
        },
        {
            menuId: 6,
            menuName: 'Guaraná Lata',
            menuDescription: 'Guaraná Antarctica 350ml',
            categoryId: 2,
            price: 4.50,
            questions: [],
            allDays: true
        }
    ];
    // Teste com diferentes tipos de mensagem
    const testMessages = [
        'quero uma marmita e dois guarana',
        'uma coca e 3 marmitex pequeno',
        'dois refri',
        'marmita grande',
        'ccoca lata', // erro de digitação
        'guarana + pizza', // produto que não existe
        '2 marmita medio e uma coca 2 litros'
    ];
    console.log('=== TESTE DO SISTEMA SEM IA ===\n');
    testMessages.forEach((message, index) => {
        console.log(`\n📝 TESTE ${index + 1}: "${message}"`);
        console.log('='.repeat(50));
        const result = textProductMatcher_1.textProductMatcher.matchProducts(message, menu);
        console.log('✅ PRODUTOS IDENTIFICADOS:');
        if (result.identifiedProducts.length === 0) {
            console.log('   (nenhum)');
        }
        else {
            result.identifiedProducts.forEach(product => {
                console.log(`   • ${product.quantity}x ${product.menuName} (confidence: ${product.confidence.toFixed(2)})`);
            });
        }
        console.log('\n🤔 PRODUTOS AMBÍGUOS:');
        if (result.ambiguousProducts.length === 0) {
            console.log('   (nenhum)');
        }
        else {
            result.ambiguousProducts.forEach(ambiguous => {
                console.log(`   • Termo: "${ambiguous.searchTerm}"`);
                ambiguous.possibleMatches.forEach(match => {
                    console.log(`     - ${match.menuName} (confidence: ${match.confidence.toFixed(2)})`);
                });
            });
        }
    });
}
