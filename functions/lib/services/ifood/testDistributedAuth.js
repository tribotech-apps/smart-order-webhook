"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.distributedAuthTester = exports.IFoodDistributedAuthTester = void 0;
exports.generateAuthUrl = generateAuthUrl;
exports.testAuthCode = testAuthCode;
exports.explainFlow = explainFlow;
const ifoodApiService_1 = require("./ifoodApiService");
/**
 * Teste específico para aplicações distribuídas do iFood
 */
class IFoodDistributedAuthTester {
    /**
     * Gera URL de autorização para teste
     */
    generateTestAuthUrl() {
        const redirectUri = 'http://localhost:3000/callback'; // URL de teste local
        const state = 'test-' + Date.now(); // Estado único para o teste
        const authUrl = ifoodApiService_1.ifoodApi.generateAuthorizationUrl(redirectUri, state);
        console.log('🔗 Authorization URL generated:');
        console.log(authUrl);
        console.log('\n📋 Steps to test:');
        console.log('1. Copy the URL above and open it in your browser');
        console.log('2. Login with your iFood merchant account');
        console.log('3. Authorize the application');
        console.log('4. Copy the authorization code from the callback URL');
        console.log('5. Use the code with testWithAuthorizationCode() method');
        return authUrl;
    }
    /**
     * Testa troca de código de autorização por token
     */
    async testWithAuthorizationCode(authorizationCode) {
        try {
            console.log('🔐 Testing authorization code exchange...');
            const redirectUri = 'http://localhost:3000/callback';
            const tokenResponse = await ifoodApiService_1.ifoodApi.exchangeCodeForToken(authorizationCode, redirectUri);
            console.log('✅ Authorization successful!');
            console.log('Access token obtained:', tokenResponse.access_token.substring(0, 20) + '...');
            console.log('Token type:', tokenResponse.token_type);
            console.log('Expires in:', tokenResponse.expires_in, 'seconds');
            console.log('Has refresh token:', !!tokenResponse.refresh_token);
            // Teste uma chamada à API
            await this.testApiCall();
            return true;
        }
        catch (error) {
            console.error('❌ Authorization failed:', error);
            return false;
        }
    }
    /**
     * Testa chamada à API após autorização
     */
    async testApiCall() {
        try {
            console.log('\n🧪 Testing API call with obtained token...');
            // Tenta buscar informações do merchant (assumindo que temos acesso)
            const response = await ifoodApiService_1.ifoodApi.get('/merchant/v1.0/merchants');
            console.log('✅ API call successful!');
            console.log('Response type:', typeof response);
            console.log('Response keys:', Object.keys(response || {}));
            if (Array.isArray(response)) {
                console.log('Found', response.length, 'merchants');
            }
            else if (response && typeof response === 'object') {
                console.log('Response data:', JSON.stringify(response, null, 2));
            }
        }
        catch (error) {
            console.error('❌ API call failed:', error);
        }
    }
    /**
     * Testa com tokens salvos (simulando retorno de sessão)
     */
    async testWithSavedTokens(accessToken, refreshToken, expiresIn) {
        try {
            console.log('🔄 Testing with saved tokens...');
            ifoodApiService_1.ifoodApi.setTokens(accessToken, refreshToken, expiresIn);
            const tokenInfo = ifoodApiService_1.ifoodApi.getTokenInfo();
            console.log('Token info:', tokenInfo);
            await this.testApiCall();
            return true;
        }
        catch (error) {
            console.error('❌ Saved tokens test failed:', error);
            return false;
        }
    }
    /**
     * Simulação de fluxo completo para aplicação distribuída
     */
    async simulateDistributedFlow() {
        console.log('🚀 Simulating distributed application flow...\n');
        console.log('📋 Distributed App Flow Steps:');
        console.log('1. Generate authorization URL');
        console.log('2. Redirect merchant to iFood authorization');
        console.log('3. Merchant authorizes application');
        console.log('4. iFood redirects back with authorization code');
        console.log('5. Exchange code for access token');
        console.log('6. Store tokens for future use');
        console.log('7. Use refresh token when access token expires\n');
        // Passo 1: Gerar URL de autorização
        const authUrl = this.generateTestAuthUrl();
        console.log('\n💡 Implementation Tips:');
        console.log('- Store access_token and refresh_token securely');
        console.log('- Each merchant needs to authorize individually');
        console.log('- Use refresh_token to renew access_token automatically');
        console.log('- Implement proper error handling for expired tokens');
        console.log('- Consider implementing webhook for token expiration notifications');
    }
    /**
     * Explicação detalhada do fluxo distribuído
     */
    explainDistributedFlow() {
        console.log('📚 iFood Distributed Application Flow Explanation:\n');
        console.log('🏪 What is a Distributed Application?');
        console.log('- Your app serves multiple merchants');
        console.log('- Each merchant must authorize your app individually');
        console.log('- Each merchant has their own tokens');
        console.log('- You need to store tokens per merchant\n');
        console.log('🔐 Authorization Flow:');
        console.log('1. Merchant visits your app');
        console.log('2. App redirects merchant to iFood authorization URL');
        console.log('3. Merchant logs in and authorizes your app');
        console.log('4. iFood redirects back with authorization code');
        console.log('5. App exchanges code for access + refresh tokens');
        console.log('6. App stores tokens linked to merchant ID\n');
        console.log('🔄 Token Management:');
        console.log('- Access tokens expire (usually in 1 hour)');
        console.log('- Use refresh token to get new access token');
        console.log('- Refresh tokens have longer expiration');
        console.log('- Handle cases where refresh token also expires\n');
        console.log('💾 Storage Recommendations:');
        console.log('- Store tokens in secure database');
        console.log('- Encrypt sensitive token data');
        console.log('- Associate tokens with merchant/store ID');
        console.log('- Implement token cleanup for expired/revoked tokens\n');
        console.log('🛠️ Implementation Example:');
        console.log(`
// 1. Generate auth URL
const authUrl = ifoodApi.generateAuthorizationUrl(
  'https://yourapp.com/ifood/callback',
  'merchant-123'
);

// 2. In callback handler
const tokenResponse = await ifoodApi.exchangeCodeForToken(
  authorizationCode,
  'https://yourapp.com/ifood/callback'
);

// 3. Store tokens per merchant
await storeTokensForMerchant(merchantId, {
  accessToken: tokenResponse.access_token,
  refreshToken: tokenResponse.refresh_token,
  expiresAt: Date.now() + (tokenResponse.expires_in * 1000)
});

// 4. Use tokens for API calls
const tokens = await getTokensForMerchant(merchantId);
ifoodApi.setTokens(tokens.accessToken, tokens.refreshToken);
const orders = await ifoodOrderService.getMerchantOrders(merchantId);
    `);
    }
}
exports.IFoodDistributedAuthTester = IFoodDistributedAuthTester;
// Instância para uso direto
exports.distributedAuthTester = new IFoodDistributedAuthTester();
// Funções de conveniência
async function generateAuthUrl() {
    exports.distributedAuthTester.generateTestAuthUrl();
}
async function testAuthCode(code) {
    await exports.distributedAuthTester.testWithAuthorizationCode(code);
}
async function explainFlow() {
    exports.distributedAuthTester.explainDistributedFlow();
}
