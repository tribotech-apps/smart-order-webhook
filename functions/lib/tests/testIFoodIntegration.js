"use strict";
/**
 * Script de teste para validar a integração com iFood API
 * Execute com: npm run test:ifood
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.testIFoodAPI = testIFoodAPI;
require("dotenv/config.js");
const ifoodMerchantService_1 = require("../services/ifood/ifoodMerchantService");
const ifoodMenuService_1 = require("../services/ifood/ifoodMenuService");
const ifoodOrderService_1 = require("../services/ifood/ifoodOrderService");
// IDs de teste - substitua pelos seus dados reais de desenvolvimento
const TEST_MERCHANT_ID = '681ebe9f-f255-4b08-a400-7ec13c699726';
const TEST_CATALOG_ID = 'a957b48d-2d50-4ce6-b833-15af5adf178e';
const TEST_PHONE_NUMBER = process.env.IFOOD_TEST_PHONE || '+5511999999999';
async function testIFoodAPI() {
    console.log('🧪 Iniciando testes da API iFood...\n');
    try {
        // 1. Testar autenticação e busca de merchant
        console.log('1️⃣ Testando busca de merchant...');
        const merchant = await ifoodMerchantService_1.ifoodMerchantService.getMerchant(TEST_MERCHANT_ID);
        console.log('✅ Merchant encontrado:', {
            id: merchant?.id,
            name: merchant?.name,
            status: merchant?.status
        });
        // 2. Testar status da loja
        console.log('\n2️⃣ Testando status da loja...');
        const storeStatus = await ifoodMerchantService_1.ifoodMerchantService.getMerchantStatus(TEST_MERCHANT_ID);
        console.log('✅ Status da loja:', storeStatus);
        // 3. Testar busca de categorias
        console.log('\n3️⃣ Testando busca de categorias...');
        const categories = await ifoodMerchantService_1.ifoodMerchantService.getMerchantCategories(TEST_MERCHANT_ID, TEST_CATALOG_ID);
        console.log(`✅ Categorias encontradas: ${categories.length}`);
        categories.slice(0, 3).forEach(cat => {
            console.log(`   - ${cat.name} (ID: ${cat.id})`);
        });
        // 4. Testar busca de produtos por categoria
        if (categories.length > 0) {
            console.log('\n4️⃣ Testando busca de produtos por categoria...');
            const firstCategoryId = parseInt(categories[0].id);
            const products = await ifoodMenuService_1.ifoodMenuService.getProductsByCategory(TEST_MERCHANT_ID, TEST_CATALOG_ID, firstCategoryId);
            console.log(`✅ Produtos encontrados na categoria "${categories[0].name}": ${products.length}`);
            products.slice(0, 3).forEach(prod => {
                console.log(`   - ${prod.name} (ID: ${prod.id}) - R$ ${prod.price}`);
            });
            // 5. Testar busca de produto específico
            if (products.length > 0) {
                console.log('\n5️⃣ Testando busca de produto específico...');
                const firstProduct = products[0];
                const productDetail = await ifoodMenuService_1.ifoodMenuService.getProductById(TEST_MERCHANT_ID, TEST_CATALOG_ID, firstProduct.id);
                console.log('✅ Produto detalhado:', {
                    id: productDetail?.id,
                    name: productDetail?.name,
                    price: productDetail?.price,
                    modifierGroups: productDetail?.modifierGroups?.length || 0
                });
            }
        }
        // 6. Testar busca de pedidos ativos
        console.log('\n6️⃣ Testando busca de pedidos ativos...');
        const activeOrders = await ifoodOrderService_1.ifoodOrderService.getActiveOrdersByPhone(TEST_MERCHANT_ID, TEST_PHONE_NUMBER);
        console.log(`✅ Pedidos ativos encontrados: ${activeOrders.length}`);
        activeOrders.forEach(order => {
            console.log(`   - Pedido ${order.id} - Cliente: ${order.customerName} - Status: ${order.status}`);
        });
        // 7. Testar dados completos da loja
        console.log('\n7️⃣ Testando dados completos da loja...');
        const completeStore = await ifoodMerchantService_1.ifoodMerchantService.getCompleteStore(TEST_MERCHANT_ID, TEST_CATALOG_ID);
        console.log('✅ Loja completa:', {
            name: completeStore?.name,
            isOpen: completeStore?.isOpen,
            categoriesCount: completeStore?.categories?.length || 0,
            menuItemsCount: completeStore?.menu?.length || 0
        });
        console.log('\n🎉 Todos os testes da API iFood foram executados com sucesso!');
    }
    catch (error) {
        console.error('❌ Erro durante os testes:', error);
        process.exit(1);
    }
}
// Executar apenas se chamado diretamente
if (require.main === module) {
    testIFoodAPI().then(() => {
        console.log('\n✅ Testes concluídos');
        process.exit(0);
    }).catch(error => {
        console.error('❌ Falha nos testes:', error);
        process.exit(1);
    });
}
