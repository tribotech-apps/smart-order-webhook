"use strict";
/**
 * Teste da API iFood usando o merchant ID REAL encontrado
 * Merchant ID: 681ebe9f-f255-4b08-a400-7ec13c699726
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.testWithRealMerchant = testWithRealMerchant;
require("dotenv/config.js");
async function testWithRealMerchant() {
    console.log('🎯 Testando API iFood com merchant ID REAL...\n');
    const CLIENT_ID = process.env.IFOOD_CLIENT_ID;
    const CLIENT_SECRET = process.env.IFOOD_CLIENT_SECRET;
    if (!CLIENT_ID || !CLIENT_SECRET) {
        console.log('❌ Credenciais não encontradas no .env');
        return;
    }
    // Merchant ID real encontrado no token
    const REAL_MERCHANT_ID = '681ebe9f-f255-4b08-a400-7ec13c699726';
    console.log('📋 Dados do teste:');
    console.log(`   CLIENT_ID: ${CLIENT_ID.substring(0, 8)}...`);
    console.log(`   MERCHANT_ID: ${REAL_MERCHANT_ID}`);
    console.log('');
    try {
        // 1. Obter token
        console.log('1️⃣ Obtendo token de acesso...');
        const token = await getAccessToken(CLIENT_ID, CLIENT_SECRET);
        if (!token)
            return;
        // 2. Testar dados do merchant
        console.log('\n2️⃣ Testando dados do merchant...');
        await testMerchantData(token, REAL_MERCHANT_ID);
        // 3. Testar categorias
        console.log('\n3️⃣ Testando categorias...');
        await testCategories(token, REAL_MERCHANT_ID);
        // 4. Testar pedidos
        console.log('\n4️⃣ Testando pedidos...');
        await testOrders(token, REAL_MERCHANT_ID);
        console.log('\n🎉 Teste completo finalizado!');
    }
    catch (error) {
        console.log(`❌ Erro no teste: ${error.message}`);
    }
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
            console.log(`   ✅ Token obtido (expira em ${data.expiresIn}s)`);
            return data.accessToken;
        }
        else {
            const errorText = await response.text();
            console.log(`   ❌ Erro: ${response.status} - ${errorText}`);
            return null;
        }
    }
    catch (error) {
        console.log(`   ❌ Erro na requisição: ${error.message}`);
        return null;
    }
}
async function testMerchantData(token, merchantId) {
    try {
        const response = await fetch(`https://merchant-api.ifood.com.br/merchant/v1.0/merchants/${merchantId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
        console.log(`   Status: ${response.status} ${response.statusText}`);
        if (response.ok) {
            const data = await response.json();
            console.log('   ✅ Merchant encontrado:');
            console.log(`      Nome: ${data.name || 'N/A'}`);
            console.log(`      Tipo: ${data.type || 'N/A'}`);
            console.log(`      Status: ${data.status || 'N/A'}`);
            console.log(`      Endereço: ${data.address?.streetName || 'N/A'}`);
        }
        else {
            const errorText = await response.text();
            console.log(`   ❌ Erro: ${errorText.substring(0, 200)}...`);
        }
    }
    catch (error) {
        console.log(`   ❌ Erro: ${error.message}`);
    }
}
async function testCategories(token, merchantId) {
    try {
        const response = await fetch(`https://merchant-api.ifood.com.br/catalog/v1.0/merchants/${merchantId}/categories`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
        console.log(`   Status: ${response.status} ${response.statusText}`);
        if (response.ok) {
            const data = await response.json();
            console.log('   ✅ Categorias encontradas:');
            console.log(`      Total: ${Array.isArray(data) ? data.length : 'N/A'}`);
            if (Array.isArray(data) && data.length > 0) {
                data.slice(0, 3).forEach((cat, index) => {
                    console.log(`      ${index + 1}. ${cat.name || cat.id} (${cat.status || 'N/A'})`);
                });
            }
        }
        else {
            const errorText = await response.text();
            console.log(`   ❌ Erro: ${errorText.substring(0, 200)}...`);
        }
    }
    catch (error) {
        console.log(`   ❌ Erro: ${error.message}`);
    }
}
async function testOrders(token, merchantId) {
    try {
        // Buscar pedidos dos últimos 7 dias
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 7);
        const url = `https://merchant-api.ifood.com.br/order/v1.0/orders?merchantId=${merchantId}&createdAt.from=${fromDate.toISOString()}&size=10`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
        console.log(`   Status: ${response.status} ${response.statusText}`);
        if (response.ok) {
            const data = await response.json();
            console.log('   ✅ Pedidos encontrados:');
            console.log(`      Total: ${data?.length || 'N/A'}`);
            if (Array.isArray(data) && data.length > 0) {
                data.slice(0, 3).forEach((order, index) => {
                    console.log(`      ${index + 1}. ${order.id} - ${order.status} (${order.createdAt})`);
                });
            }
        }
        else {
            const errorText = await response.text();
            console.log(`   ❌ Erro: ${errorText.substring(0, 200)}...`);
        }
    }
    catch (error) {
        console.log(`   ❌ Erro: ${error.message}`);
    }
}
// Executar apenas se chamado diretamente
if (require.main === module) {
    testWithRealMerchant().then(() => {
        console.log('\n✅ Teste finalizado');
        process.exit(0);
    }).catch(error => {
        console.error('❌ Falha no teste:', error);
        process.exit(1);
    });
}
