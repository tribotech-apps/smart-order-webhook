"use strict";
/**
 * Script para testar o fluxo completo do bot com integração iFood
 * Execute com: npm run test:bot-flow
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.testBotFlow = testBotFlow;
require("dotenv/config.js");
const storeController_1 = require("../controllers/storeController");
const ifoodMerchantService_1 = require("../services/ifood/ifoodMerchantService");
const ifoodMenuService_1 = require("../services/ifood/ifoodMenuService");
const setupTestData_1 = require("./setupTestData");
const TEST_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || 'test-phone-id';
const TEST_MERCHANT_ID = process.env.IFOOD_TEST_MERCHANT_ID || 'test-merchant-id';
async function testBotFlow() {
    console.log('🤖 Testando fluxo completo do bot com iFood API...\n');
    try {
        // 1. Testar busca da loja pelo WhatsApp Phone Number ID
        console.log('1️⃣ Testando busca da loja pelo WABA Phone Number ID...');
        const store = await (0, storeController_1.getStoreByWabaPhoneNumberId)(TEST_PHONE_NUMBER_ID);
        console.log('✅ Loja encontrada:', {
            id: store?._id,
            name: store?.name,
            ifoodMerchantId: store?.ifoodMerchantId
        });
        if (!store) {
            console.log('❌ Loja não encontrada. Execute primeiro: npm run setup:test-data');
            return;
        }
        // 2. Testar verificação de status da loja via iFood
        console.log('\n2️⃣ Testando verificação de status da loja via iFood...');
        const merchantId = store.ifoodMerchantId || store._id;
        const storeStatus = await ifoodMerchantService_1.ifoodMerchantService.getMerchantStatus(merchantId);
        console.log('✅ Status da loja via iFood:', storeStatus);
        // 3. Testar busca de categorias via iFood
        console.log('\n3️⃣ Testando busca de categorias via iFood...');
        const categories = await ifoodMerchantService_1.ifoodMerchantService.getMerchantCategories(merchantId);
        console.log(`✅ Categorias encontradas: ${categories.length}`);
        if (categories.length > 0) {
            console.log('   Exemplo de categoria:', {
                id: categories[0].id,
                name: categories[0].name
            });
        }
        // 4. Testar busca de produtos por categoria via iFood
        if (categories.length > 0) {
            console.log('\n4️⃣ Testando busca de produtos por categoria via iFood...');
            const categoryId = parseInt(categories[0].id);
            const products = await ifoodMenuService_1.ifoodMenuService.getProductsByCategory(merchantId, categoryId);
            console.log(`✅ Produtos na categoria "${categories[0].name}": ${products.length}`);
            if (products.length > 0) {
                console.log('   Exemplo de produto:', {
                    id: products[0].id,
                    name: products[0].name,
                    price: products[0].price
                });
            }
        }
        // 5. Simular mensagem inicial do usuário
        console.log('\n5️⃣ Simulando fluxo de mensagem inicial...');
        const mockMessage = {
            type: 'text',
            text: { body: 'Olá' }
        };
        // Nota: Este é um teste conceitual - em produção você precisaria
        // simular toda a estrutura do webhook do WhatsApp
        console.log('📝 Estrutura de teste preparada para:', {
            from: setupTestData_1.TEST_USER_DATA.phoneNumber.replace('+', ''),
            store_id: store._id,
            message_type: mockMessage.type
        });
        console.log('\n✅ Todos os componentes do fluxo do bot estão funcionando!');
        console.log('\n📋 Próximos passos para teste completo:');
        console.log('   1. Configure as credenciais da API iFood');
        console.log('   2. Execute os testes unitários: npm run test:ifood');
        console.log('   3. Teste via webhook do WhatsApp Business');
        console.log('   4. Monitore os logs em tempo real');
    }
    catch (error) {
        console.error('❌ Erro durante teste do fluxo do bot:', error);
        throw error;
    }
}
// Executar apenas se chamado diretamente
if (require.main === module) {
    testBotFlow().then(() => {
        console.log('\n✅ Teste do fluxo concluído');
        process.exit(0);
    }).catch(error => {
        console.error('❌ Falha no teste do fluxo:', error);
        process.exit(1);
    });
}
