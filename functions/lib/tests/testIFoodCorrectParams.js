"use strict";
/**
 * Teste com parâmetros corretos baseado nos erros 400 Bad Request
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.testCorrectParams = testCorrectParams;
require("dotenv/config.js");
async function testCorrectParams() {
    console.log('🔧 Testando endpoints com parâmetros corretos...\n');
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
    // Testar produtos com paginação
    console.log('\n2️⃣ Testando produtos com paginação...');
    const productEndpoints = [
        `/catalog/v1.0/merchants/${REAL_MERCHANT_ID}/products?page=0&size=10`,
        `/catalog/v2.0/merchants/${REAL_MERCHANT_ID}/products?page=0&size=10`,
        `/catalog/v1.0/merchants/${REAL_MERCHANT_ID}/products?offset=0&limit=10`,
        `/catalog/v2.0/merchants/${REAL_MERCHANT_ID}/products?offset=0&limit=10`
    ];
    for (const endpoint of productEndpoints) {
        await testEndpoint(token, endpoint, 'Produtos');
    }
    // Testar sellable items com diferentes catalog IDs
    console.log('\n3️⃣ Testando sellable items...');
    // Primeiro, tentar descobrir catalog IDs válidos
    await testEndpoint(token, `/catalog/v1.0/merchants/${REAL_MERCHANT_ID}/catalogs`, 'Catálogos');
    const sellableEndpoints = [
        `/catalog/v1.0/merchants/${REAL_MERCHANT_ID}/catalogs/1/sellableItems?page=0&size=10`,
        `/catalog/v1.0/merchants/${REAL_MERCHANT_ID}/catalogs/0/sellableItems?page=0&size=10`,
        `/catalog/v1.0/merchants/${REAL_MERCHANT_ID}/catalogs/${REAL_MERCHANT_ID}/sellableItems?page=0&size=10`
    ];
    for (const endpoint of sellableEndpoints) {
        await testEndpoint(token, endpoint, 'Sellable Items');
    }
    // Testar orders com diferentes formatos de data
    console.log('\n4️⃣ Testando orders com parâmetros de data...');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayISO = yesterday.toISOString();
    const orderEndpoints = [
        `/order/v1.0/orders?merchantId=${REAL_MERCHANT_ID}&page=0&size=5`,
        `/order/v1.0/orders?merchantId=${REAL_MERCHANT_ID}&createdAt.from=${yesterdayISO}&size=5`,
        `/order/v1.0/orders?merchantId=${REAL_MERCHANT_ID}&offset=0&limit=5`,
        `/events/v1.0/events:polling?types=ORDER_PLACED,ORDER_CANCELLED&merchantId=${REAL_MERCHANT_ID}`
    ];
    for (const endpoint of orderEndpoints) {
        await testEndpoint(token, endpoint, 'Orders');
    }
    // Testar diferentes endpoints que podem existir
    console.log('\n5️⃣ Testando outros endpoints...');
    const otherEndpoints = [
        `/merchant/v1.0/merchants/${REAL_MERCHANT_ID}/status`,
        `/merchant/v1.0/merchants/${REAL_MERCHANT_ID}/interruptions`,
        `/merchant/v1.0/merchants`,
        `/catalog/v1.0/merchants/${REAL_MERCHANT_ID}/modifiers`,
        `/catalog/v1.0/merchants/${REAL_MERCHANT_ID}/groups`
    ];
    for (const endpoint of otherEndpoints) {
        await testEndpoint(token, endpoint, 'Outros');
    }
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
            console.log(`   ✅ ${endpoint}`);
            console.log(`      Status: ${status} ${statusText}`);
            if (Array.isArray(data)) {
                console.log(`      Dados: ${data.length} items encontrados`);
                if (data.length > 0) {
                    const sample = data[0];
                    const sampleKeys = Object.keys(sample).slice(0, 4);
                    console.log(`      Amostra: {${sampleKeys.join(', ')}}`);
                }
            }
            else if (typeof data === 'object') {
                const keys = Object.keys(data);
                console.log(`      Dados: Objeto com ${keys.length} campos`);
                console.log(`      Campos: {${keys.slice(0, 4).join(', ')}}`);
            }
            console.log('');
        }
        else if (status === 404) {
            console.log(`   ❌ ${endpoint} - 404 Not Found`);
        }
        else if (status === 403) {
            console.log(`   ⚠️  ${endpoint} - 403 Forbidden`);
        }
        else if (status === 400) {
            const errorText = await response.text();
            console.log(`   ❌ ${endpoint} - 400 Bad Request`);
            console.log(`      Erro: ${errorText.substring(0, 150)}...`);
        }
        else {
            const errorText = await response.text();
            console.log(`   ❌ ${endpoint} - ${status} ${statusText}`);
            console.log(`      Erro: ${errorText.substring(0, 100)}...`);
        }
    }
    catch (error) {
        console.log(`   ❌ ${endpoint} - Erro: ${error.message}`);
    }
}
// Executar apenas se chamado diretamente
if (require.main === module) {
    testCorrectParams().then(() => {
        console.log('\n✅ Teste finalizado');
        process.exit(0);
    }).catch(error => {
        console.error('❌ Falha no teste:', error);
        process.exit(1);
    });
}
