"use strict";
/**
 * Teste com o formato exato encontrado na documentação
 * POST /oauth/token
 * Host: api.ifood.com.br
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.testCorrectFormat = testCorrectFormat;
require("dotenv/config.js");
async function testCorrectFormat() {
    console.log('🎯 Testando formato exato da documentação...\n');
    const CLIENT_ID = process.env.IFOOD_CLIENT_ID;
    const CLIENT_SECRET = process.env.IFOOD_CLIENT_SECRET;
    if (!CLIENT_ID || !CLIENT_SECRET) {
        console.log('❌ Credenciais não encontradas');
        return;
    }
    console.log('📋 Usando formato da documentação:');
    console.log('   POST /oauth/token');
    console.log('   Host: api.ifood.com.br');
    console.log('   Content-Type: application/x-www-form-urlencoded');
    console.log('   grant_type=client_credentials&client_id=...&client_secret=...\n');
    // Testando com diferentes combinações de URL
    const urlsToTest = [
        'https://api.ifood.com.br/oauth/token',
        'https://api.ifood.com.br/v1.0/oauth/token',
        'https://api.ifood.com.br/authentication/v1.0/oauth/token',
        'https://merchant-api.ifood.com.br/oauth/token',
        'https://merchant-api.ifood.com.br/v1.0/oauth/token'
    ];
    for (const url of urlsToTest) {
        await testURL(url, CLIENT_ID, CLIENT_SECRET);
    }
}
async function testURL(url, clientId, clientSecret) {
    console.log(`🔗 Testando: ${url}`);
    try {
        // Usando exatamente o formato da documentação (snake_case)
        const body = new URLSearchParams({
            'grant_type': 'client_credentials',
            'client_id': clientId,
            'client_secret': clientSecret
        });
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: body.toString()
        });
        console.log(`   Status: ${response.status} ${response.statusText}`);
        if (response.ok) {
            const data = await response.json();
            console.log('   ✅ SUCESSO!');
            console.log(`   Access Token: ${data.access_token?.substring(0, 20) || data.accessToken?.substring(0, 20)}...`);
            console.log(`   Token Type: ${data.token_type || data.tokenType}`);
            console.log(`   Expires In: ${data.expires_in || data.expiresIn} segundos`);
            // Se deu certo, salvar as configurações
            console.log('\n🎉 ENCONTROU A URL CORRETA!');
            console.log(`   URL correta: ${url}`);
            return true;
        }
        else {
            const errorText = await response.text();
            console.log(`   ❌ Erro: ${errorText.substring(0, 100)}...`);
        }
    }
    catch (error) {
        if (error.message.includes('ENOTFOUND') || error.message.includes('certificate')) {
            console.log('   ❌ URL não existe ou problema de SSL');
        }
        else {
            console.log(`   ❌ Erro: ${error.message}`);
        }
    }
    console.log(''); // linha em branco
    return false;
}
// Executar apenas se chamado diretamente
if (require.main === module) {
    testCorrectFormat().then(() => {
        console.log('✅ Teste concluído');
        process.exit(0);
    }).catch(error => {
        console.error('❌ Falha no teste:', error);
        process.exit(1);
    });
}
