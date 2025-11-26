"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkOverdueOrders = void 0;
const functions = __importStar(require("firebase-functions"));
const overdueOrdersChecker_1 = require("./services/overdueOrdersChecker");
/**
 * Cloud Function que é executada a cada minuto via Cloud Scheduler
 * para verificar pedidos em atraso e enviar alertas via WhatsApp
 */
exports.checkOverdueOrders = functions.https.onRequest(async (req, res) => {
    console.log(`🕐 [SCHEDULER] checkOverdueOrders triggered at ${new Date().toISOString()}`);
    try {
        // Verificar se é uma chamada do Cloud Scheduler
        const userAgent = req.get('User-Agent');
        const authHeader = req.get('Authorization');
        console.log(`📋 [SCHEDULER] Request details:`);
        console.log(`   - Method: ${req.method}`);
        console.log(`   - User-Agent: ${userAgent}`);
        console.log(`   - Has Authorization: ${!!authHeader}`);
        // Permitir chamadas do Cloud Scheduler ou para testes locais
        const isCloudScheduler = userAgent?.includes('Google-Cloud-Scheduler') ||
            authHeader?.includes('Bearer') ||
            req.method === 'GET'; // Para testes manuais
        if (!isCloudScheduler && process.env.NODE_ENV === 'production') {
            console.log(`🚫 [SCHEDULER] Unauthorized request rejected`);
            res.status(401).send('Unauthorized');
            return;
        }
        console.log(`✅ [SCHEDULER] Request authorized, starting overdue check`);
        // Executar verificação de pedidos em atraso
        await overdueOrdersChecker_1.OverdueOrdersChecker.checkOverdueOrders();
        console.log(`✅ [SCHEDULER] Overdue orders check completed successfully`);
        res.status(200).json({
            success: true,
            message: 'Overdue orders check completed',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error(`💥 [SCHEDULER] Error during overdue check:`, error);
        console.error(`💥 [SCHEDULER] Error details:`, {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});
