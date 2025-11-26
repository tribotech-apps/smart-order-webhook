"use strict";
/**
 * Script para implementar o fluxo completo de autenticação iFood OAuth 2.0
 * Execute com: npm run ifood:auth-flow
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ifoodAuthFlow = ifoodAuthFlow;
exports.getAccessToken = getAccessToken;
require("dotenv/config.js");
const CLIENT_ID = process.env.IFOOD_CLIENT_ID;
const CLIENT_SECRET = process.env.IFOOD_CLIENT_SECRET;
const BASE_URL = 'https://merchant-api.ifood.com.br';
async function ifoodAuthFlow() {
    console.log('🔐 Iniciando fluxo de autenticação iFood OAuth 2.0...\n');
    if (!CLIENT_ID || !CLIENT_SECRET) {
        console.log('❌ CLIENT_ID e CLIENT_SECRET são obrigatórios');
        return;
    }
    try {
        // Passo 1: Obter código de vínculo
        console.log('1️⃣ Obtendo código de vínculo...');
        const linkingData = await getLinkingCode();
        if (!linkingData) {
            console.log('❌ Falha ao obter código de vínculo');
            return;
        }
        console.log('✅ Código de vínculo obtido com sucesso!');
        console.log(`📋 Código de vínculo: ${linkingData.linkingCode}`);
        console.log(`🔗 URL para autorização: ${linkingData.userAuthorizationUrlTemplate.replace('{userAuthorizationCode}', linkingData.linkingCode)}`);
        console.log(`⏰ Expira em: ${linkingData.expiresAt}`);
        // Armazenar o verificador para uso posterior
        console.log(`\n🔐 IMPORTANTE: Salve este código verificador: ${linkingData.linkingCodeVerifier}`);
        console.log('\n📝 PRÓXIMOS PASSOS:');
        console.log('1. Acesse o Portal do Parceiro iFood');
        console.log('2. Insira o código de vínculo acima');
        console.log('3. Após autorização, você receberá um código de autorização');
        console.log('4. Execute: npm run ifood:get-token [AUTHORIZATION_CODE]');
        // Salvar dados para próximo passo
        const authData = {
            linkingCodeVerifier: linkingData.linkingCodeVerifier,
            linkingCode: linkingData.linkingCode,
            expiresAt: linkingData.expiresAt
        };
        require('fs').writeFileSync('.ifood-auth-temp.json', JSON.stringify(authData, null, 2));
        console.log('\n💾 Dados salvos em .ifood-auth-temp.json');
    }
    catch (error) {
        console.error('❌ Erro no fluxo de autenticação:', error);
    }
}
async function getLinkingCode() {
    try {
        const response = await fetch(`${BASE_URL}/authentication/v1.0/oauth/userCode`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'accept': 'application/json'
            },
            body: new URLSearchParams({
                clientId: CLIENT_ID,
                clientSecret: CLIENT_SECRET
            })
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.log(`❌ Erro na requisição: ${response.status} ${response.statusText}`);
            console.log(`❌ Resposta: ${errorText}`);
            return null;
        }
        return await response.json();
    }
    catch (error) {
        console.error('❌ Erro ao obter código de vínculo:', error);
        return null;
    }
}
async function getAccessToken(authorizationCode) {
    console.log('🔑 Obtendo token de acesso...\n');
    try {
        // Carregar dados salvos
        const authDataFile = '.ifood-auth-temp.json';
        if (!require('fs').existsSync(authDataFile)) {
            console.log('❌ Arquivo de dados de autenticação não encontrado. Execute primeiro: npm run ifood:auth-flow');
            return;
        }
        const authData = JSON.parse(require('fs').readFileSync(authDataFile, 'utf8'));
        console.log('2️⃣ Solicitando token de acesso...');
        const response = await fetch(`${BASE_URL}/authentication/v1.0/oauth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'accept': 'application/json'
            },
            body: new URLSearchParams({
                grantType: 'authorization_code',
                clientId: CLIENT_ID,
                clientSecret: CLIENT_SECRET,
                authorizationCode: authorizationCode,
                authorizationCodeVerifier: authData.linkingCodeVerifier
            })
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.log(`❌ Erro na requisição: ${response.status} ${response.statusText}`);
            console.log(`❌ Resposta: ${errorText}`);
            return;
        }
        const tokenData = await response.json();
        console.log('✅ Token de acesso obtido com sucesso!');
        console.log(`🔑 Access Token: ${tokenData.accessToken.substring(0, 20)}...`);
        console.log(`🔄 Refresh Token: ${tokenData.refreshToken.substring(0, 20)}...`);
        console.log(`⏰ Expira em: ${tokenData.expiresIn} segundos`);
        // Salvar tokens no .env
        console.log('\n💾 Adicionando tokens ao arquivo .env...');
        const envContent = require('fs').readFileSync('.env', 'utf8');
        const newEnvContent = envContent +
            `\n# iFood API Tokens (gerados automaticamente)\n` +
            `IFOOD_ACCESS_TOKEN=${tokenData.accessToken}\n` +
            `IFOOD_REFRESH_TOKEN=${tokenData.refreshToken}\n` +
            `IFOOD_TOKEN_EXPIRES_IN=${tokenData.expiresIn}\n` +
            `IFOOD_TOKEN_OBTAINED_AT=${Date.now()}\n`;
        require('fs').writeFileSync('.env', newEnvContent);
        // Limpar arquivo temporário
        require('fs').unlinkSync(authDataFile);
        console.log('✅ Tokens salvos no arquivo .env');
        console.log('\n🎉 Autenticação concluída! Agora você pode testar a API:');
        console.log('npm run test:ifood');
    }
    catch (error) {
        console.error('❌ Erro ao obter token:', error);
    }
}
// Verificar argumentos da linha de comando
const args = process.argv.slice(2);
if (args.length > 0 && args[0]) {
    // Se um código de autorização foi fornecido, obter token
    getAccessToken(args[0]);
}
else {
    // Caso contrário, iniciar fluxo de autenticação
    ifoodAuthFlow();
}
