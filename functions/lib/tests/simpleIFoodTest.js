"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config.js");
const ifoodApiService_1 = require("../services/ifood/ifoodApiService");
async function testSimpleAPICalls() {
    console.log('🧪 Testing simple iFood API calls...\n');
    try {
        // Test 1: Get token
        console.log('1️⃣ Testing authentication...');
        const token = await ifoodApiService_1.ifoodApi.getAccessToken();
        console.log('✅ Token obtained:', token.substring(0, 20) + '...');
        // Test 2: Simple API call to check if API is working
        console.log('\n2️⃣ Testing basic API call...');
        const response = await ifoodApiService_1.ifoodApi.get('merchant', '/merchants/681ebe9f-f255-4b08-a400-7ec13c699726/status');
        console.log('✅ API call successful:', response);
    }
    catch (error) {
        console.error('❌ Error:', error);
    }
}
if (require.main === module) {
    testSimpleAPICalls();
}
