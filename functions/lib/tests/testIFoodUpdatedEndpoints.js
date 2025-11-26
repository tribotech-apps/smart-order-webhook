"use strict";
/**
 * Teste com endpoints atualizados baseado na documentação oficial
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.testUpdatedEndpoints = testUpdatedEndpoints;
require("dotenv/config.js");
async function testUpdatedEndpoints() {
    console.log('🔧 Testando endpoints atualizados...\n');
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
    // Testar endpoints que funcionam
    console.log('\n2️⃣ Testando endpoints funcionais...');
    // Merchant status
    await testEndpoint(token, `/merchant/v1.0/merchants/${REAL_MERCHANT_ID}/status`, 'Status da loja');
    // Lista de merchants
    await testEndpoint(token, `/merchant/v1.0/merchants`, 'Lista de merchants');
    // Catálogos
    await testEndpoint(token, `/catalog/v1.0/merchants/${REAL_MERCHANT_ID}/catalogs`, 'Catálogos');
    // Interrupções
    await testEndpoint(token, `/merchant/v1.0/merchants/${REAL_MERCHANT_ID}/interruptions`, 'Interrupções');
    // Obter catalog ID do primeiro catálogo
    console.log('\n3️⃣ Testando com catalog ID real...');
    const catalogs = await getCatalogs(token, REAL_MERCHANT_ID);
    if (catalogs && catalogs.length > 0) {
        const catalogId = catalogs[0].catalogId;
        console.log(`   📋 Usando catalog ID: ${catalogId}`);
        // Testar sellable items com catalog ID real
        await testEndpoint(token, `/catalog/v1.0/merchants/${REAL_MERCHANT_ID}/catalogs/${catalogId}/sellableItems`, 'Sellable Items');
        // Testar produtos com paginação correta
        await testEndpoint(token, `/catalog/v1.0/merchants/${REAL_MERCHANT_ID}/products?page=0&size=5`, 'Produtos (v1.0)');
        await testEndpoint(token, `/catalog/v2.0/merchants/${REAL_MERCHANT_ID}/products?page=0&size=5`, 'Produtos (v2.0)');
    }
    // Testar eventos de pedidos
    console.log('\n4️⃣ Testando eventos de pedidos...');
    await testEndpoint(token, `/events/v1.0/events:polling?types=ORDER_PLACED&merchantId=${REAL_MERCHANT_ID}`, 'Eventos polling');
    // Testar outros endpoints de order
    console.log('\n5️⃣ Testando outros endpoints de order...');
    await testEndpoint(token, `/order/v1.0/orders/test-order-id`, 'Order específico (teste)');
    console.log('\n🎉 Teste finalizado!');
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
async function getCatalogs(token, merchantId) {
    try {
        const response = await fetch(`https://merchant-api.ifood.com.br/catalog/v1.0/merchants/${merchantId}/catalogs`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
        if (response.ok) {
            return await response.json();
        }
        return null;
    }
    catch (error) {
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
            console.log(`   ✅ ${type}`);
            console.log(`      Endpoint: ${endpoint}`);
            console.log(`      Status: ${status} ${statusText}`);
            if (Array.isArray(data)) {
                console.log(`      Dados: ${data.length} items encontrados`);
                if (data.length > 0) {
                    const sample = data[0];
                    const sampleKeys = Object.keys(sample).slice(0, 4);
                    console.log(`      Campos: [${sampleKeys.join(', ')}]`);
                }
            }
            else if (typeof data === 'object') {
                const keys = Object.keys(data);
                console.log(`      Dados: Objeto com ${keys.length} campos`);
                console.log(`      Campos: [${keys.slice(0, 4).join(', ')}]`);
            }
            console.log('');
        }
        else if (status === 404) {
            console.log(`   ❌ ${type} - 404 Not Found`);
        }
        else if (status === 403) {
            console.log(`   ⚠️  ${type} - 403 Forbidden`);
        }
        else if (status === 400) {
            const errorText = await response.text();
            console.log(`   ❌ ${type} - 400 Bad Request`);
            console.log(`      Erro: ${errorText.substring(0, 100)}...`);
        }
        else {
            const errorText = await response.text();
            console.log(`   ❌ ${type} - ${status} ${statusText}`);
            console.log(`      Erro: ${errorText.substring(0, 100)}...`);
        }
    }
    catch (error) {
        console.log(`   ❌ ${type} - Erro: ${error.message}`);
    }
}
// Executar apenas se chamado diretamente
if (require.main === module) {
    testUpdatedEndpoints().then(() => {
        console.log('\n✅ Teste finalizado');
        process.exit(0);
    }).catch(error => {
        console.error('❌ Falha no teste:', error);
        process.exit(1);
    });
}
