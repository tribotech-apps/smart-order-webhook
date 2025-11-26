"use strict";
/**
 * Teste para buscar horários de funcionamento na API iFood
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.testOperatingHours = testOperatingHours;
require("dotenv/config.js");
async function testOperatingHours() {
    console.log('🕒 Testando horários de funcionamento na API iFood...\n');
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
    // Testar diferentes endpoints para horários
    console.log('\n2️⃣ Testando endpoints de horários...');
    const hourEndpoints = [
        `/merchant/v1.0/merchants/${REAL_MERCHANT_ID}/opening-hours`,
        `/merchant/v1.0/merchants/${REAL_MERCHANT_ID}/schedule`,
        `/merchant/v1.0/merchants/${REAL_MERCHANT_ID}/hours`,
        `/merchant/v1.0/merchants/${REAL_MERCHANT_ID}/operating-hours`,
        `/merchant/v1.0/merchants/${REAL_MERCHANT_ID}/business-hours`,
        `/merchant/v1.0/merchants/${REAL_MERCHANT_ID}/availability`,
        `/merchant/v1.0/merchants/${REAL_MERCHANT_ID}/operation-hours`
    ];
    for (const endpoint of hourEndpoints) {
        await testEndpoint(token, endpoint, 'Horários');
    }
    // Testar merchant completo (pode ter horários nos dados)
    console.log('\n3️⃣ Verificando dados completos do merchant...');
    await testEndpoint(token, `/merchant/v1.0/merchants/${REAL_MERCHANT_ID}`, 'Merchant completo');
    // Testar status detalhado
    console.log('\n4️⃣ Verificando status detalhado...');
    await testEndpoint(token, `/merchant/v1.0/merchants/${REAL_MERCHANT_ID}/status`, 'Status detalhado');
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
            console.log(`   ✅ ${type}`);
            console.log(`      Endpoint: ${endpoint}`);
            console.log(`      Status: ${status} ${statusText}`);
            // Exibir dados relevantes para horários
            if (Array.isArray(data)) {
                console.log(`      Dados: ${data.length} items encontrados`);
                if (data.length > 0) {
                    const sample = data[0];
                    console.log(`      Amostra:`, JSON.stringify(sample, null, 2).substring(0, 300) + '...');
                }
            }
            else if (typeof data === 'object') {
                console.log(`      Dados: Objeto encontrado`);
                // Procurar por campos relacionados a horários
                const hourFields = Object.keys(data).filter(key => key.toLowerCase().includes('hour') ||
                    key.toLowerCase().includes('time') ||
                    key.toLowerCase().includes('schedule') ||
                    key.toLowerCase().includes('open') ||
                    key.toLowerCase().includes('close') ||
                    key.toLowerCase().includes('available') ||
                    key.toLowerCase().includes('operation'));
                if (hourFields.length > 0) {
                    console.log(`      Campos relacionados a horários: [${hourFields.join(', ')}]`);
                    hourFields.forEach(field => {
                        if (data[field]) {
                            console.log(`      ${field}:`, JSON.stringify(data[field], null, 2));
                        }
                    });
                }
                else {
                    const allFields = Object.keys(data);
                    console.log(`      Todos os campos: [${allFields.join(', ')}]`);
                    console.log(`      Dados completos:`, JSON.stringify(data, null, 2));
                }
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
            console.log(`      Erro: ${errorText.substring(0, 150)}...`);
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
    testOperatingHours().then(() => {
        console.log('\n✅ Teste finalizado');
        process.exit(0);
    }).catch(error => {
        console.error('❌ Falha no teste:', error);
        process.exit(1);
    });
}
