"use strict";
/**
 * Teste para descobrir os endpoints corretos da API iFood
 * Testando diferentes versões e formatos
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.testEndpoints = testEndpoints;
require("dotenv/config.js");
async function testEndpoints() {
    console.log('🔍 Descobrindo endpoints corretos da API iFood...\n');
    const CLIENT_ID = process.env.IFOOD_CLIENT_ID;
    const CLIENT_SECRET = process.env.IFOOD_CLIENT_SECRET;
    if (!CLIENT_ID || !CLIENT_SECRET) {
        console.log('❌ Credenciais não encontradas');
        return;
    }
    const REAL_MERCHANT_ID = '681ebe9f-f255-4b08-a400-7ec13c699726';
    // Obter token
    console.log('1️⃣ Obtendo token...');
    const token = await getAccessToken(CLIENT_ID, CLIENT_SECRET);
    if (!token)
        return;
    // Testar diferentes endpoints de categorias
    console.log('\n2️⃣ Testando endpoints de categorias...');
    const categoryEndpoints = [
        `/catalog/v1.0/merchants/${REAL_MERCHANT_ID}/categories`,
        `/catalog/v2.0/merchants/${REAL_MERCHANT_ID}/categories`,
        `/catalog/v2/merchants/${REAL_MERCHANT_ID}/categories`,
        `/catalog/v1.0/merchants/${REAL_MERCHANT_ID}/catalogs/default/categories`,
        `/catalog/v2.0/merchants/${REAL_MERCHANT_ID}/catalogs/default/categories`,
        `/catalog/v1.0/merchants/${REAL_MERCHANT_ID}/catalogs/1/categories`,
        `/merchant/v1.0/merchants/${REAL_MERCHANT_ID}/categories`,
        `/v1.0/merchants/${REAL_MERCHANT_ID}/categories`,
        `/v2.0/merchants/${REAL_MERCHANT_ID}/categories`
    ];
    for (const endpoint of categoryEndpoints) {
        await testEndpoint(token, endpoint, 'Categorias');
    }
    // Testar diferentes endpoints de pedidos
    console.log('\n3️⃣ Testando endpoints de pedidos...');
    const orderEndpoints = [
        `/order/v1.0/orders?merchantId=${REAL_MERCHANT_ID}&size=5`,
        `/order/v2.0/orders?merchantId=${REAL_MERCHANT_ID}&size=5`,
        `/orders/v1.0/orders?merchantId=${REAL_MERCHANT_ID}&size=5`,
        `/orders/v2.0/orders?merchantId=${REAL_MERCHANT_ID}&size=5`,
        `/v1.0/orders?merchantId=${REAL_MERCHANT_ID}&size=5`,
        `/v2.0/orders?merchantId=${REAL_MERCHANT_ID}&size=5`,
        `/merchant/v1.0/merchants/${REAL_MERCHANT_ID}/orders?size=5`,
        `/order/v1.0/merchants/${REAL_MERCHANT_ID}/orders?size=5`
    ];
    for (const endpoint of orderEndpoints) {
        await testEndpoint(token, endpoint, 'Pedidos');
    }
    // Testar endpoint de menu/items
    console.log('\n4️⃣ Testando endpoints de menu/items...');
    const menuEndpoints = [
        `/catalog/v1.0/merchants/${REAL_MERCHANT_ID}/items`,
        `/catalog/v2.0/merchants/${REAL_MERCHANT_ID}/items`,
        `/catalog/v1.0/merchants/${REAL_MERCHANT_ID}/products`,
        `/catalog/v2.0/merchants/${REAL_MERCHANT_ID}/products`,
        `/catalog/v1.0/merchants/${REAL_MERCHANT_ID}/catalogs/default/sellableItems`,
        `/catalog/v2.0/merchants/${REAL_MERCHANT_ID}/catalogs/default/sellableItems`
    ];
    for (const endpoint of menuEndpoints) {
        await testEndpoint(token, endpoint, 'Menu/Items');
    }
    console.log('\n🎉 Teste de endpoints finalizado!');
}
async function getAccessToken(clientId, clientSecret) {
    try {
        const body = new URLSearchParams({
            'grantType': 'client_credentials',
            'clientId': clientId,
            'clientSecret': clientSecret
        });
        const response = await fetch('https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: body.toString()
        });
        if (response.ok) {
            const data = await response.json();
            console.log('   ✅ Token obtido');
            return data.accessToken;
        }
        else {
            console.log('   ❌ Erro ao obter token');
            return null;
        }
    }
    catch (error) {
        console.log(`   ❌ Erro: ${error.message}`);
        return null;
    }
}
async function testEndpoint(token, endpoint, type) {
    try {
        const url = `https://merchant-api.ifood.com.br${endpoint}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
        const status = response.status;
        const statusText = response.statusText;
        if (status === 200) {
            const data = await response.json();
            const count = Array.isArray(data) ? data.length : (typeof data === 'object' ? Object.keys(data).length : 'N/A');
            console.log(`   ✅ ${endpoint}`);
            console.log(`      Status: ${status} ${statusText}`);
            console.log(`      Dados: ${count} items encontrados`);
            // Mostrar amostra dos dados
            if (Array.isArray(data) && data.length > 0) {
                const sample = data[0];
                const sampleKeys = Object.keys(sample).slice(0, 3);
                console.log(`      Amostra: {${sampleKeys.join(', ')}}`);
            }
            console.log('');
        }
        else if (status === 404) {
            console.log(`   ❌ ${endpoint} - 404 Not Found`);
        }
        else if (status === 403) {
            console.log(`   ⚠️  ${endpoint} - 403 Forbidden (sem permissão)`);
        }
        else if (status === 400) {
            const errorText = await response.text();
            console.log(`   ❌ ${endpoint} - 400 Bad Request: ${errorText.substring(0, 100)}...`);
        }
        else {
            console.log(`   ❌ ${endpoint} - ${status} ${statusText}`);
        }
    }
    catch (error) {
        console.log(`   ❌ ${endpoint} - Erro: ${error.message}`);
    }
}
// Executar apenas se chamado diretamente
if (require.main === module) {
    testEndpoints().then(() => {
        console.log('\n✅ Teste finalizado');
        process.exit(0);
    }).catch(error => {
        console.error('❌ Falha no teste:', error);
        process.exit(1);
    });
}
