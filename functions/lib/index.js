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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkOverdueOrders = exports.processOrderAlert = void 0;
const functions = __importStar(require("firebase-functions"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const body_parser_1 = __importDefault(require("body-parser"));
const admin = __importStar(require("firebase-admin"));
const diagnosticsService_1 = require("./services/diagnosticsService");
// Initialize Firebase Admin
try {
    admin.initializeApp();
    diagnosticsService_1.diagnostics.info('Firebase Admin initialized successfully', {
        category: diagnosticsService_1.DiagnosticCategory.AUTHENTICATION,
        action: 'firebase_init',
        details: { service: 'firebase-admin' }
    });
    // Test Firestore connection
    admin.firestore().settings({ ignoreUndefinedProperties: true });
    diagnosticsService_1.diagnostics.info('Firestore configured successfully', {
        category: diagnosticsService_1.DiagnosticCategory.DATABASE,
        action: 'firestore_config',
        details: { ignoreUndefinedProperties: true }
    });
}
catch (error) {
    diagnosticsService_1.diagnostics.critical('Error initializing Firebase Admin', error, {
        category: diagnosticsService_1.DiagnosticCategory.AUTHENTICATION,
        action: 'firebase_init_error'
    });
}
const sellerFlows_1 = __importDefault(require("./routes/bots/sellerFlows"));
const payments_1 = __importDefault(require("./routes/bots/payments"));
const messages_1 = __importDefault(require("./routes/bots/messages"));
const store_1 = __importDefault(require("./routes/bots/store"));
const notifications_1 = __importDefault(require("./routes/bots/notifications"));
const workflow_1 = __importDefault(require("./routes/bots/workflow"));
const diagnostics_1 = __importDefault(require("./routes/diagnostics"));
const deviceTokens_1 = __importDefault(require("./routes/deviceTokens"));
const app = (0, express_1.default)();
// Middlewares
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(diagnosticsService_1.diagnosticsMiddleware); // Middleware de diagnósticos
app.use((0, morgan_1.default)('dev'));
app.use(body_parser_1.default.json());
app.use(body_parser_1.default.urlencoded({ extended: false }));
app.use((0, cookie_parser_1.default)());
// Routes
app.use('/whatsapp/messages', sellerFlows_1.default);
app.use('/whatsapp/bot', messages_1.default);
app.use('/payments', payments_1.default);
app.use('/stores', store_1.default);
app.use('/notifications', notifications_1.default);
app.use('/workflow', workflow_1.default);
app.use('/diagnostics', diagnostics_1.default); // Nova rota de diagnósticos
app.use('/device-token', deviceTokens_1.default);
// Health Check Route
app.get('/health', async (req, res) => {
    try {
        const healthReport = await diagnosticsService_1.diagnostics.generateHealthReport();
        diagnosticsService_1.diagnostics.info('Health check solicitado', {
            category: diagnosticsService_1.DiagnosticCategory.PERFORMANCE,
            action: 'health_check'
        });
        res.json(healthReport);
    }
    catch (error) {
        diagnosticsService_1.diagnostics.error('Erro no health check', error, {
            category: diagnosticsService_1.DiagnosticCategory.PERFORMANCE,
            action: 'health_check_error'
        });
        res.status(500).json({ error: 'Health check failed' });
    }
});
// Test Route
app.get('/', (req, res) => {
    diagnosticsService_1.diagnostics.info('Rota de teste acessada', {
        category: diagnosticsService_1.DiagnosticCategory.WEBHOOK,
        action: 'test_route'
    });
    res.send('Hello, World!');
});
// Global Error Handler
app.use((error, req, res, next) => {
    diagnosticsService_1.diagnostics.error('Erro global capturado', error, {
        category: diagnosticsService_1.DiagnosticCategory.WEBHOOK,
        action: 'global_error_handler',
        details: {
            method: req.method,
            url: req.url,
            userAgent: req.get('User-Agent')
        }
    });
    res.status(500).json({
        error: 'Erro interno do servidor',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Tente novamente mais tarde'
    });
});
// Export as Firebase Function with runtime options
exports.talkCommerceWhatsappWebhook = functions.https.onRequest({
    memory: '1GiB',
    timeoutSeconds: 540,
    minInstances: 1,
    maxInstances: 10,
    concurrency: 80
}, app);
// Export alert processor function
var processOrderAlert_1 = require("./processOrderAlert");
Object.defineProperty(exports, "processOrderAlert", { enumerable: true, get: function () { return processOrderAlert_1.processOrderAlert; } });
// Export overdue orders checker function
var checkOverdueOrders_1 = require("./checkOverdueOrders");
Object.defineProperty(exports, "checkOverdueOrders", { enumerable: true, get: function () { return checkOverdueOrders_1.checkOverdueOrders; } });
