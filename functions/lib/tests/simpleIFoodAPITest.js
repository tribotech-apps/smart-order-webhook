"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSimpleAPITests = runSimpleAPITests;
require("dotenv/config.js");
const IFOOD_BASE_URLS = {
    authentication: 'https://merchant-api.ifood.com.br/authentication/v1.0',
    merchant: 'https://merchant-api.ifood.com.br/merchant/v1.0',
    order: 'https://merchant-api.ifood.com.br/order/v1.0',
    catalog_v1: 'https://merchant-api.ifood.com.br/catalog/v1.0',
    catalog_v2: 'https://merchant-api.ifood.com.br/catalog/v2.0',
    logistics: 'https://merchant-api.ifood.com.br/logistics/v1.0',
    shipping: 'https://merchant-api.ifood.com.br/shipping/v1.0',
    financial_v2: 'https://merchant-api.ifood.com.br/financial/v2.0',
    financial_v21: 'https://merchant-api.ifood.com.br/financial/v2.1',
    financial_v3: 'https://merchant-api.ifood.com.br/financial/v3.0',
    events: 'https://merchant-api.ifood.com.br/events/v1.0'
};
async function testSimpleAPICall(baseUrl, endpoint, name) {
    try {
        console.log(`\n🧪 Testing ${name}...`);
        console.log(`URL: ${baseUrl}${endpoint}`);
        const token = process.env.IFOOD_ACCESS_TOKEN;
        if (!token) {
            console.log('❌ No IFOOD_ACCESS_TOKEN found');
            return false;
        }
        const response = await fetch(`${baseUrl}${endpoint}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        console.log(`Status: ${response.status} ${response.statusText}`);
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Success:', JSON.stringify(data, null, 2));
            return true;
        }
        else {
            const errorText = await response.text();
            console.log('❌ Error:', errorText);
            return false;
        }
    }
    catch (error) {
        console.log('❌ Request failed:', error);
        return false;
    }
}
async function runSimpleAPITests() {
    console.log('🚀 Running simple iFood API tests...\n');
    const merchantId = '681ebe9f-f255-4b08-a400-7ec13c699726';
    const tests = [
        // Test merchant status - this is what we use in sellerFlows
        {
            baseUrl: IFOOD_BASE_URLS.merchant,
            endpoint: `/merchants/${merchantId}/status`,
            name: 'Merchant Status'
        },
        // Test merchant details
        {
            baseUrl: IFOOD_BASE_URLS.merchant,
            endpoint: `/merchants/${merchantId}`,
            name: 'Merchant Details'
        },
        // Test catalog categories
        {
            baseUrl: IFOOD_BASE_URLS.catalog_v1,
            endpoint: `/merchants/${merchantId}/categories`,
            name: 'Catalog Categories'
        },
        // Test orders
        {
            baseUrl: IFOOD_BASE_URLS.order,
            endpoint: `/orders?merchantId=${merchantId}&size=10`,
            name: 'Recent Orders'
        }
    ];
    let passedTests = 0;
    for (const test of tests) {
        const success = await testSimpleAPICall(test.baseUrl, test.endpoint, test.name);
        if (success)
            passedTests++;
    }
    console.log(`\n📊 Results: ${passedTests}/${tests.length} tests passed`);
    if (passedTests === tests.length) {
        console.log('🎉 All API tests passed!');
    }
    else {
        console.log('⚠️ Some tests failed. Check authentication and permissions.');
    }
}
if (require.main === module) {
    runSimpleAPITests();
}
