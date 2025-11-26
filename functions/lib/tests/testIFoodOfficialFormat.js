"use strict";
/**
 * Teste usando formato OFICIAL da documentação iFood
 * POST /oauth/token
 * Host: api.ifood.com.br
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.testOfficialFormat = testOfficialFormat;
require("dotenv/config.js");
async function testOfficialFormat() {
    console.log('🎯 Testando formato OFICIAL da documentação iFood...\n');
    const CLIENT_ID = process.env.IFOOD_CLIENT_ID;
    const CLIENT_SECRET = process.env.IFOOD_CLIENT_SECRET;
    if (!CLIENT_ID || !CLIENT_SECRET) {
        console.log('❌ Credenciais não encontradas no .env');
        return;
    }
    console.log('📋 Formato oficial da documentação:');
    console.log('   POST /oauth/token');
    console.log('   Host: api.ifood.com.br');
    console.log('   Content-Type: application/x-www-form-urlencoded');
    console.log('   grant_type=client_credentials&client_id=...&client_secret=...\n');
    const url = 'https://api.ifood.com.br/oauth/token';
    console.log(`🔗 Testando: ${url}`);
    try {
        // Usando exatamente o formato da documentação oficial
        const body = new URLSearchParams({
            'grant_type': 'client_credentials',
            'client_id': CLIENT_ID,
            'client_secret': CLIENT_SECRET
        });
        console.log('📤 Enviando requisição...');
        console.log(`   Body: ${body.toString().replace(/client_secret=[^&]+/, 'client_secret=***')}`);
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: body.toString()
        });
        console.log(`📥 Status: ${response.status} ${response.statusText}`);
        if (response.ok) {
            const data = await response.json();
            console.log('\n✅ SUCESSO! Token obtido:');
            console.log(`   Access Token: ${data.access_token?.substring(0, 30)}...`);
            console.log(`   Token Type: ${data.token_type}`);
            console.log(`   Expires In: ${data.expires_in} segundos`);
            // Testar uma chamada com o token
            await testApiWithToken(data.access_token);
            return data.access_token;
        }
        else {
            const errorText = await response.text();
            console.log(`\n❌ Erro: ${response.status} ${response.statusText}`);
            console.log(`   Detalhes: ${errorText}`);
            try {
                const errorData = JSON.parse(errorText);
                if (errorData.error?.message) {
                    console.log(`   Mensagem: ${errorData.error.message}`);
                }
            }
            catch (e) {
                // Ignorar se não for JSON válido
            }
        }
    }
    catch (error) {
        console.log(`❌ Erro na requisição: ${error.message}`);
    }
    return null;
}
async function testApiWithToken(accessToken) {
    console.log('\n2️⃣ Testando chamada da API com o token...');
    try {
        const response = await fetch('https://merchant-api.ifood.com.br/merchant/v1.0/merchants', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });
        console.log(`   Status: ${response.status} ${response.statusText}`);
        if (response.ok) {
            const data = await response.json();
            console.log('   ✅ API funcionando!');
            console.log(`   Merchants encontrados: ${Array.isArray(data) ? data.length : 'N/A'}`);
            if (Array.isArray(data) && data.length > 0) {
                console.log(`   Primeiro merchant: ${data[0]?.name || data[0]?.id}`);
            }
        }
        else {
            const errorText = await response.text();
            console.log(`   ❌ Erro na API: ${errorText.substring(0, 200)}...`);
        }
    }
    catch (error) {
        console.log(`   ❌ Erro: ${error.message}`);
    }
}
// Executar apenas se chamado diretamente
if (require.main === module) {
    testOfficialFormat().then((token) => {
        if (token) {
            console.log('\n🎉 Teste bem-sucedido! Token obtido.');
            console.log('💡 Para usar em produção, adicione ao .env:');
            console.log(`   IFOOD_ACCESS_TOKEN=${token.substring(0, 30)}...`);
        }
        else {
            console.log('\n❌ Teste falhou. Verifique suas credenciais.');
        }
        console.log('\n✅ Teste concluído');
        process.exit(0);
    }).catch(error => {
        console.error('❌ Falha no teste:', error);
        process.exit(1);
    });
}
