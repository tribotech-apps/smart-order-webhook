"use strict";
/**
 * Script para testar diferentes métodos de autenticação iFood
 * Execute com: npm run test:ifood-auth
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.testIFoodAuthentication = testIFoodAuthentication;
require("dotenv/config.js");
async function testIFoodAuthentication() {
    console.log('🔐 Testando métodos de autenticação iFood...\n');
    const CLIENT_ID = process.env.IFOOD_CLIENT_ID;
    const CLIENT_SECRET = process.env.IFOOD_CLIENT_SECRET;
    const USERNAME = process.env.IFOOD_USERNAME;
    const PASSWORD = process.env.IFOOD_PASSWORD;
    const AUTH_URL = 'https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token';
    if (!CLIENT_ID || !CLIENT_SECRET) {
        console.log('❌ CLIENT_ID e CLIENT_SECRET são obrigatórios');
        return;
    }
    console.log('📋 Configuração encontrada:');
    console.log(`   CLIENT_ID: ${CLIENT_ID.substring(0, 8)}...`);
    console.log(`   CLIENT_SECRET: ${CLIENT_SECRET.substring(0, 8)}...`);
    console.log(`   USERNAME: ${USERNAME ? '✓ Configurado' : '❌ Não configurado'}`);
    console.log(`   PASSWORD: ${PASSWORD ? '✓ Configurado' : '❌ Não configurado'}\n`);
    // Teste 1: Client Credentials
    console.log('1️⃣ Testando Client Credentials Grant...');
    await testAuthMethod('client_credentials', {
        grantType: 'client_credentials',
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET
    });
    // Teste 2: Password Grant (se disponível)
    if (USERNAME && PASSWORD) {
        console.log('\n2️⃣ Testando Resource Owner Password Grant...');
        await testAuthMethod('password', {
            grantType: 'password',
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            username: USERNAME,
            password: PASSWORD
        });
    }
    else {
        console.log('\n2️⃣ Pulando teste Password Grant (credenciais não configuradas)');
    }
    console.log('\n📝 Para configurar credenciais de usuário (se necessário):');
    console.log('   Adicione ao arquivo .env:');
    console.log('   IFOOD_USERNAME=seu_usuario');
    console.log('   IFOOD_PASSWORD=sua_senha');
}
async function testAuthMethod(methodName, params) {
    try {
        const body = new URLSearchParams(params);
        console.log(`   Enviando requisição ${methodName}...`);
        console.log(`   Parâmetros: ${body.toString().replace(/clientSecret=[^&]+/, 'clientSecret=***').replace(/password=[^&]+/, 'password=***')}`);
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
            console.log(`   ✅ ${methodName} funcionou!`);
            console.log(`   Token tipo: ${data.token_type || data.tokenType}`);
            console.log(`   Expira em: ${data.expires_in || data.expiresIn} segundos`);
            return true;
        }
        else {
            const errorText = await response.text();
            console.log(`   ❌ ${methodName} falhou:`);
            console.log(`   Status: ${response.status} ${response.statusText}`);
            console.log(`   Erro: ${errorText}`);
            return false;
        }
    }
    catch (error) {
        console.log(`   ❌ Erro na requisição ${methodName}:`, error);
        return false;
    }
}
// Executar apenas se chamado diretamente
if (require.main === module) {
    testIFoodAuthentication().then(() => {
        console.log('\n✅ Teste de autenticação concluído');
        process.exit(0);
    }).catch(error => {
        console.error('❌ Falha no teste:', error);
        process.exit(1);
    });
}
