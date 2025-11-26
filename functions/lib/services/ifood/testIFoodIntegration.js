"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ifoodTester = exports.IFoodIntegrationTester = void 0;
exports.quickTest = quickTest;
exports.testAuth = testAuth;
const ifoodApiService_1 = require("./ifoodApiService");
const ifoodMerchantService_1 = require("./ifoodMerchantService");
const ifoodMenuService_1 = require("./ifoodMenuService");
const ifoodOrderService_1 = require("./ifoodOrderService");
const TEST_CATALOG_ID = 'a957b48d-2d50-4ce6-b833-15af5adf178e';
/**
 * Classe para testar a integração com a API do iFood
 */
class IFoodIntegrationTester {
    /**
     * Testa a autenticação básica
     */
    async testAuthentication() {
        try {
            console.log('🔐 Testing iFood authentication...');
            console.log('Testing token from environment...');
            const token = await ifoodApiService_1.ifoodApi.getAccessToken();
            console.log('✅ Authentication successful. Token obtained:', token.substring(0, 20) + '...');
            return true;
        }
        catch (error) {
            console.error('❌ Authentication failed:', error);
            return false;
        }
    }
    /**
     * Testa busca de merchants
     */
    async testMerchantService() {
        try {
            console.log('\n🏪 Testing merchant service...');
            // Testar busca de lista de merchants
            const merchants = await ifoodMerchantService_1.ifoodMerchantService.getMerchants();
            console.log(`Found ${merchants.length} merchants`);
            if (merchants.length > 0) {
                const merchantId = merchants[0].id;
                console.log(`Testing with merchant ID: ${merchantId}`);
                // Testar busca de merchant específico
                const merchant = await ifoodMerchantService_1.ifoodMerchantService.getMerchant(merchantId);
                if (merchant) {
                    console.log(`✅ Merchant found: ${merchant.name}`);
                    console.log(`Status: ${merchant.status}`);
                    console.log(`Is Open: ${merchant.availability?.isOpen}`);
                    // Testar conversão para Store
                    const store = await ifoodMerchantService_1.ifoodMerchantService.getCompleteStore(merchantId, TEST_CATALOG_ID);
                    if (store) {
                        console.log(`✅ Store converted successfully`);
                        console.log(`Store name: ${store.name}`);
                        console.log(`Categories: ${store.categories.length}`);
                        console.log(`Delivery fee: R$ ${store.deliveryFee}`);
                    }
                    return true;
                }
            }
            console.log('❌ No merchants found or unable to fetch merchant data');
            return false;
        }
        catch (error) {
            console.error('❌ Merchant service test failed:', error);
            return false;
        }
    }
    /**
     * Testa serviço de menu
     */
    async testMenuService(merchantId) {
        try {
            console.log('\n🍕 Testing menu service...');
            if (!merchantId) {
                console.log('No merchant ID provided for menu test');
                return false;
            }
            // Testar busca de categorias
            const categories = await ifoodMenuService_1.ifoodMenuService.getCategories(merchantId);
            console.log(`✅ Found ${categories.length} categories`);
            if (categories.length > 0) {
                console.log('Categories:', categories.map(c => `${c.name} (${c.status})`).join(', '));
                // Testar busca de itens de uma categoria
                const firstCategory = categories[0];
                const categoryItems = await ifoodMenuService_1.ifoodMenuService.getCategoryItems(merchantId, firstCategory.id);
                console.log(`✅ Found ${categoryItems.length} items in category "${firstCategory.name}"`);
                if (categoryItems.length > 0) {
                    const firstItem = categoryItems[0];
                    console.log(`Sample item: ${firstItem.name} - R$ ${firstItem.price?.value || 0}`);
                    // Testar busca de item específico
                    const item = await ifoodMenuService_1.ifoodMenuService.getMenuItem(merchantId, firstItem.id);
                    if (item) {
                        console.log(`✅ Item fetched: ${item.name}`);
                        console.log(`Modifier groups: ${item.modifierGroups?.length || 0}`);
                    }
                }
            }
            // Testar menu completo
            const completeMenu = await ifoodMenuService_1.ifoodMenuService.getCompleteMenuWithCache(merchantId);
            console.log(`✅ Complete menu: ${completeMenu.categories.length} categories, ${completeMenu.allItems.length} items`);
            return true;
        }
        catch (error) {
            console.error('❌ Menu service test failed:', error);
            return false;
        }
    }
    /**
     * Testa serviço de pedidos
     */
    async testOrderService(merchantId) {
        try {
            console.log('\n📦 Testing order service...');
            if (!merchantId) {
                console.log('No merchant ID provided for order test');
                return false;
            }
            // Testar busca de pedidos recentes
            const recentOrders = await ifoodOrderService_1.ifoodOrderService.getRecentMerchantOrders(merchantId, 24);
            console.log(`✅ Found ${recentOrders.length} recent orders (last 24h)`);
            if (recentOrders.length > 0) {
                const firstOrder = recentOrders[0];
                console.log(`Sample order: ${firstOrder.id} - ${firstOrder.customer.name} - R$ ${firstOrder.total.orderAmount}`);
                // Testar busca de pedido específico
                const order = await ifoodOrderService_1.ifoodOrderService.getOrder(firstOrder.id);
                if (order) {
                    console.log(`✅ Order fetched: ${order.id}`);
                    console.log(`Order type: ${order.orderType}`);
                    console.log(`Items: ${order.items.length}`);
                    // Testar conversão de pedido
                    const convertedOrder = await ifoodOrderService_1.ifoodOrderService.getConvertedOrder(firstOrder.id, merchantId);
                    if (convertedOrder) {
                        console.log(`✅ Order converted successfully`);
                        console.log(`Converted total: R$ ${convertedOrder.total.total}`);
                    }
                }
            }
            return true;
        }
        catch (error) {
            console.error('❌ Order service test failed:', error);
            return false;
        }
    }
    /**
     * Testa integração completa
     */
    async runFullTest() {
        console.log('🚀 Starting iFood API integration tests...\n');
        const results = {
            authentication: false,
            merchant: false,
            menu: false,
            orders: false
        };
        // Teste de autenticação
        results.authentication = await this.testAuthentication();
        if (!results.authentication) {
            console.log('\n❌ Authentication failed. Stopping tests.');
            return;
        }
        // Teste de merchant
        results.merchant = await this.testMerchantService();
        let merchantId;
        if (results.merchant) {
            try {
                const merchants = await ifoodMerchantService_1.ifoodMerchantService.getMerchants();
                merchantId = merchants[0]?.id;
            }
            catch (error) {
                console.log('Could not get merchant ID for further tests');
            }
        }
        // Teste de menu
        if (merchantId) {
            results.menu = await this.testMenuService(merchantId);
            results.orders = await this.testOrderService(merchantId);
        }
        // Resumo dos resultados
        console.log('\n📊 Test Results Summary:');
        console.log('========================');
        console.log(`Authentication: ${results.authentication ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Merchant Service: ${results.merchant ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Menu Service: ${results.menu ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Order Service: ${results.orders ? '✅ PASS' : '❌ FAIL'}`);
        const totalPassed = Object.values(results).filter(r => r).length;
        const totalTests = Object.keys(results).length;
        console.log(`\nOverall: ${totalPassed}/${totalTests} tests passed`);
        if (totalPassed === totalTests) {
            console.log('🎉 All tests passed! iFood integration is working correctly.');
        }
        else {
            console.log('⚠️ Some tests failed. Check the logs above for details.');
        }
    }
    /**
     * Testa endpoints específicos da API
     */
    async testSpecificEndpoints() {
        console.log('\n🔍 Testing specific API endpoints...');
        try {
            // Teste direto de endpoint
            console.log('Testing direct API call...');
            const response = await ifoodApiService_1.ifoodApi.get('merchant', '/merchants');
            console.log('✅ Direct API call successful');
            console.log('Response type:', typeof response);
            console.log('Response keys:', Object.keys(response || {}));
        }
        catch (error) {
            console.error('❌ Direct API call failed:', error);
        }
    }
    /**
     * Função helper para testar com um merchant ID específico
     */
    async testWithMerchantId(merchantId) {
        console.log(`\n🎯 Testing with specific merchant ID: ${merchantId}\n`);
        const results = {
            authentication: false,
            merchant: false,
            menu: false,
            orders: false
        };
        results.authentication = await this.testAuthentication();
        if (results.authentication) {
            // Testar merchant específico
            try {
                const store = await ifoodMerchantService_1.ifoodMerchantService.getCompleteStore(merchantId);
                results.merchant = !!store;
                if (store) {
                    console.log(`✅ Merchant ${merchantId} found: ${store.name}`);
                }
            }
            catch (error) {
                console.error(`❌ Failed to fetch merchant ${merchantId}:`, error);
            }
            results.menu = await this.testMenuService(merchantId);
            results.orders = await this.testOrderService(merchantId);
        }
        console.log('\n📊 Results for merchant', merchantId);
        console.log(`Authentication: ${results.authentication ? '✅' : '❌'}`);
        console.log(`Merchant: ${results.merchant ? '✅' : '❌'}`);
        console.log(`Menu: ${results.menu ? '✅' : '❌'}`);
        console.log(`Orders: ${results.orders ? '✅' : '❌'}`);
    }
}
exports.IFoodIntegrationTester = IFoodIntegrationTester;
// Instância para uso direto
exports.ifoodTester = new IFoodIntegrationTester();
// Função para executar teste rápido
async function quickTest() {
    await exports.ifoodTester.runFullTest();
}
// Função para testar apenas autenticação
async function testAuth() {
    await exports.ifoodTester.testAuthentication();
}
