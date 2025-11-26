"use strict";
/**
 * Teste direto da API iFood para comparar com nossa implementação
 * Execute com: npm run test:ifood-direct
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.testIFoodDirect = testIFoodDirect;
require("dotenv/config.js");
async function testIFoodDirect() {
    console.log('🧪 Teste direto da API iFood...\n');
    const CLIENT_ID = process.env.IFOOD_CLIENT_ID;
    const CLIENT_SECRET = process.env.IFOOD_CLIENT_SECRET;
    if (!CLIENT_ID || !CLIENT_SECRET) {
        console.log('❌ Credenciais não encontradas');
        return;
    }
    console.log('📋 Credenciais encontradas:');
    console.log(`   CLIENT_ID: ${CLIENT_ID.substring(0, 8)}...`);
    console.log(`   CLIENT_SECRET: ${CLIENT_SECRET.substring(0, 8)}...\n`);
    // Teste 1: Exatamente como o cURL funciona
    console.log('1️⃣ Testando exatamente como o cURL...');
    const formData = new URLSearchParams();
    formData.append('grantType', 'client_credentials');
    formData.append('clientId', CLIENT_ID);
    formData.append('clientSecret', CLIENT_SECRET);
    console.log('📤 Enviando requisição...');
    console.log(`   URL: https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token`);
    console.log(`   Method: POST`);
    console.log(`   Content-Type: application/x-www-form-urlencoded`);
    console.log(`   Body: ${formData.toString().replace(/clientSecret=[^&]+/, 'clientSecret=***')}`);
    try {
        const response = await fetch('https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'accept': 'application/json'
            },
            body: formData.toString()
        });
        console.log(`📥 Resposta recebida: ${response.status} ${response.statusText}`);
        const responseText = await response.text();
        console.log(`📄 Conteúdo: ${responseText}`);
        if (response.ok) {
            const data = JSON.parse(responseText);
            console.log('\n✅ SUCESSO! Token obtido:');
            console.log(`   Access Token: ${data.accessToken?.substring(0, 20)}...`);
            console.log(`   Token Type: ${data.tokenType}`);
            console.log(`   Expires In: ${data.expiresIn} segundos`);
            // Teste 2: Fazer uma chamada para a API com o token
            console.log('\n2️⃣ Testando chamada à API com o token...');
            await testApiCall(data.accessToken);
        }
        else {
            console.log('\n❌ ERRO na autenticação');
            try {
                const errorData = JSON.parse(responseText);
                console.log(`   Erro: ${errorData.error?.message || responseText}`);
            }
            catch {
                console.log(`   Erro: ${responseText}`);
            }
        }
    }
    catch (error) {
        console.error('❌ Erro na requisição:', error);
    }
}
async function testApiCall(accessToken) {
    try {
        console.log('   Testando busca de merchants...');
        const response = await fetch('https://merchant-api.ifood.com.br/merchant/v1.0/merchants', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'accept': 'application/json'
            }
        });
        console.log(`   Resposta: ${response.status} ${response.statusText}`);
        if (response.ok) {
            const data = await response.json();
            console.log('   ✅ API funcionando! Dados recebidos:');
            console.log(`   Merchants encontrados: ${data?.length || 'N/A'}`);
            if (data?.length > 0) {
                console.log(`   Primeiro merchant: ${data[0]?.name || data[0]?.id}`);
            }
        }
        else {
            const errorText = await response.text();
            console.log(`   ❌ Erro na API: ${errorText}`);
        }
    }
    catch (error) {
        console.error('   ❌ Erro na chamada da API:', error);
    }
}
// Executar apenas se chamado diretamente
if (require.main === module) {
    testIFoodDirect().then(() => {
        console.log('\n✅ Teste direto concluído');
        process.exit(0);
    }).catch(error => {
        console.error('❌ Falha no teste:', error);
        process.exit(1);
    });
}
