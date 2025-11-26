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
exports.processOrderAlert = void 0;
const functions = __importStar(require("firebase-functions"));
const orderAlertScheduler_1 = require("./services/orderAlertScheduler");
/**
 * Cloud Function que processa alertas agendados pelo Cloud Tasks
 */
exports.processOrderAlert = functions.https.onRequest(async (req, res) => {
    try {
        console.log('🔔 Processing order alert:', req.body);
        const { type, orderId, stageId, storeId } = req.body;
        if (!type || !orderId || !stageId || !storeId) {
            console.error('❌ Missing required parameters:', { type, orderId, stageId, storeId });
            res.status(400).send('Missing required parameters');
            return;
        }
        if (type === 'warning') {
            await orderAlertScheduler_1.OrderAlertScheduler.sendWarningAlert(orderId, stageId, storeId);
            console.log(`✅ Warning alert sent for order ${orderId}`);
        }
        else if (type === 'overdue') {
            await orderAlertScheduler_1.OrderAlertScheduler.sendOverdueAlert(orderId, stageId, storeId);
            console.log(`✅ Overdue alert sent for order ${orderId}`);
        }
        else {
            console.error('❌ Invalid alert type:', type);
            res.status(400).send('Invalid alert type');
            return;
        }
        res.status(200).send('Alert processed successfully');
    }
    catch (error) {
        console.error('💥 Error processing order alert:', error);
        res.status(500).send('Internal server error');
    }
});
