"use strict";
/**
 * Script para configurar dados de teste no Firestore
 * Execute com: npm run setup:test-data
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEST_USER_DATA = exports.TEST_STORE_DATA = void 0;
exports.setupTestData = setupTestData;
require("dotenv/config.js");
const firebase_1 = __importDefault(require("../firebase"));
const firestore_1 = require("firebase/firestore");
const db = (0, firestore_1.getFirestore)(firebase_1.default);
// Dados de teste para uma loja
const TEST_STORE_DATA = {
    _id: 'test-store-001',
    code: 'TEST001',
    cnpj: '12345678000199',
    name: 'Loja de Teste iFood',
    description: 'Loja para testes de integração com iFood',
    ifoodMerchantId: process.env.IFOOD_TEST_MERCHANT_ID || 'test-merchant-id',
    wabaEnvironments: {
        wabaAccessToken: process.env.WHATSAPP_ACCESS_TOKEN || 'test-token',
        wabaPhoneNumber: process.env.WHATSAPP_PHONE_NUMBER || '+5511999999999',
        wabaPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || 'test-phone-id',
        wabaBusinessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || 'test-business-id'
    },
    flowId: 1,
    address: {
        street: 'Rua de Teste',
        number: '123',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01234-567',
        latitude: -23.5505,
        longitude: -46.6333
    },
    deliveryMaxRadiusKm: 5,
    deliveryPrice: 5.0,
    deliveryTime: 30,
    productionTime: 20,
    rowTime: 10,
    openAt: { hour: 9, minute: 0 },
    closeAt: { hour: 22, minute: 0 },
    categories: [], // Será preenchido pela API iFood
    menu: [], // Será preenchido pela API iFood
    slug: 'loja-teste-ifood'
};
exports.TEST_STORE_DATA = TEST_STORE_DATA;
// Dados de teste para um usuário
const TEST_USER_DATA = {
    _id: 'test-user-001',
    phoneNumber: '+5511999999999',
    name: 'Usuário Teste',
    address: {
        street: 'Rua do Cliente',
        number: '456',
        neighborhood: 'Vila Teste',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01234-567',
        latitude: -23.5505,
        longitude: -46.6333
    }
};
exports.TEST_USER_DATA = TEST_USER_DATA;
async function setupTestData() {
    console.log('🛠️ Configurando dados de teste no Firestore...\n');
    try {
        // 1. Criar loja de teste
        console.log('1️⃣ Criando loja de teste...');
        const storeRef = (0, firestore_1.doc)(db, 'Stores', TEST_STORE_DATA._id);
        await (0, firestore_1.setDoc)(storeRef, TEST_STORE_DATA);
        console.log('✅ Loja de teste criada:', TEST_STORE_DATA.name);
        // 2. Criar usuário de teste
        console.log('\n2️⃣ Criando usuário de teste...');
        const userRef = (0, firestore_1.doc)(db, 'Users', TEST_USER_DATA._id);
        await (0, firestore_1.setDoc)(userRef, TEST_USER_DATA);
        console.log('✅ Usuário de teste criado:', TEST_USER_DATA.name);
        console.log('\n📋 Resumo dos dados de teste:');
        console.log('Store ID:', TEST_STORE_DATA._id);
        console.log('iFood Merchant ID:', TEST_STORE_DATA.ifoodMerchantId);
        console.log('WhatsApp Phone ID:', TEST_STORE_DATA.wabaEnvironments.wabaPhoneNumberId);
        console.log('Test Phone Number:', TEST_USER_DATA.phoneNumber);
        console.log('\n🎉 Dados de teste configurados com sucesso!');
    }
    catch (error) {
        console.error('❌ Erro ao configurar dados de teste:', error);
        process.exit(1);
    }
}
// Executar apenas se chamado diretamente
if (require.main === module) {
    setupTestData().then(() => {
        console.log('\n✅ Configuração concluída');
        process.exit(0);
    }).catch(error => {
        console.error('❌ Falha na configuração:', error);
        process.exit(1);
    });
}
