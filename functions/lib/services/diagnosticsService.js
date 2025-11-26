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
exports.diagnosticsMiddleware = exports.diagnostics = exports.DiagnosticCategory = exports.DiagnosticLevel = void 0;
const logging_1 = require("@google-cloud/logging");
const error_reporting_1 = require("@google-cloud/error-reporting");
const winston = __importStar(require("winston"));
const functions = __importStar(require("firebase-functions"));
// Configuração do Google Cloud Logging
const logging = new logging_1.Logging();
// Configuração do Error Reporting
const errors = new error_reporting_1.ErrorReporting();
// Configuração do Winston Logger
const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json()),
    defaultMeta: {
        service: 'talk-commerce-webhook',
        environment: process.env.NODE_ENV || 'development'
    },
    transports: [
        // Console transport para desenvolvimento
        new winston.transports.Console({
            format: winston.format.combine(winston.format.colorize(), winston.format.simple())
        })
    ]
});
// Se estiver em produção, adicionar transports do Google Cloud
if (process.env.NODE_ENV === 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.json()
    }));
}
var DiagnosticLevel;
(function (DiagnosticLevel) {
    DiagnosticLevel["DEBUG"] = "debug";
    DiagnosticLevel["INFO"] = "info";
    DiagnosticLevel["WARN"] = "warn";
    DiagnosticLevel["ERROR"] = "error";
    DiagnosticLevel["CRITICAL"] = "critical";
})(DiagnosticLevel || (exports.DiagnosticLevel = DiagnosticLevel = {}));
var DiagnosticCategory;
(function (DiagnosticCategory) {
    DiagnosticCategory["WEBHOOK"] = "webhook";
    DiagnosticCategory["FLOWS"] = "flows";
    DiagnosticCategory["PAYMENT"] = "payment";
    DiagnosticCategory["DATABASE"] = "database";
    DiagnosticCategory["EXTERNAL_API"] = "external_api";
    DiagnosticCategory["AUTHENTICATION"] = "authentication";
    DiagnosticCategory["PERFORMANCE"] = "performance";
})(DiagnosticCategory || (exports.DiagnosticCategory = DiagnosticCategory = {}));
class DiagnosticsService {
    /**
     * Log de depuração para desenvolvimento
     */
    debug(message, data) {
        this.log(DiagnosticLevel.DEBUG, message, data);
    }
    /**
     * Log de informações gerais
     */
    info(message, data) {
        this.log(DiagnosticLevel.INFO, message, data);
    }
    /**
     * Log de avisos
     */
    warn(message, data) {
        this.log(DiagnosticLevel.WARN, message, data);
    }
    /**
     * Log de erros
     */
    error(message, error, data) {
        this.log(DiagnosticLevel.ERROR, message, data, error);
        // Reportar erro para o Google Cloud Error Reporting
        if (error && process.env.NODE_ENV === 'production') {
            errors.report(error);
        }
    }
    /**
     * Log de erros críticos
     */
    critical(message, error, data) {
        this.log(DiagnosticLevel.CRITICAL, message, data, error);
        // Reportar erro crítico
        if (error && process.env.NODE_ENV === 'production') {
            errors.report(error);
        }
        // Enviar alerta imediato para administradores
        this.sendCriticalAlert(message, error, data);
    }
    /**
     * Método principal de logging
     */
    log(level, message, data, error) {
        const logData = {
            timestamp: new Date().toISOString(),
            level,
            message,
            category: data?.category,
            action: data?.action,
            userId: data?.userId,
            storeId: data?.storeId,
            conversationId: data?.conversationId,
            flowToken: data?.flowToken,
            phoneNumber: data?.phoneNumber ? this.maskPhoneNumber(data.phoneNumber) : undefined,
            executionTime: data?.executionTime,
            details: data?.details,
            metadata: data?.metadata,
            error: error ? {
                name: error.name,
                message: error.message,
                stack: error.stack
            } : undefined
        };
        // Log no Winston
        logger.log(level, message, logData);
        // Log no Firebase Functions (aparece no console do Firebase)
        if (level === DiagnosticLevel.ERROR || level === DiagnosticLevel.CRITICAL) {
            functions.logger.error(message, logData);
        }
        else if (level === DiagnosticLevel.WARN) {
            functions.logger.warn(message, logData);
        }
        else {
            functions.logger.info(message, logData);
        }
    }
    /**
     * Mascarar número de telefone para privacidade
     */
    maskPhoneNumber(phoneNumber) {
        if (phoneNumber.length <= 4)
            return phoneNumber;
        return phoneNumber.substring(0, 4) + '*'.repeat(phoneNumber.length - 4);
    }
    /**
     * Enviar alerta crítico para administradores
     */
    async sendCriticalAlert(message, error, data) {
        try {
            // Aqui você pode implementar notificação via:
            // - Email
            // - Slack
            // - Telegram
            // - SMS
            // - WhatsApp para admins
            const alertData = {
                timestamp: new Date().toISOString(),
                service: 'talk-commerce-webhook',
                message,
                error: error ? error.message : undefined,
                category: data?.category,
                storeId: data?.storeId,
                environment: process.env.NODE_ENV
            };
            // Por enquanto, apenas log o alerta crítico
            console.error('🚨 CRITICAL ALERT:', alertData);
            // TODO: Implementar notificação real para administradores
        }
        catch (alertError) {
            console.error('Erro ao enviar alerta crítico:', alertError);
        }
    }
    /**
     * Medir tempo de execução de uma função
     */
    async measureExecutionTime(category, action, fn, additionalData) {
        const startTime = Date.now();
        try {
            const result = await fn();
            const executionTime = Date.now() - startTime;
            this.info(`${action} executado com sucesso`, {
                category,
                action,
                executionTime,
                ...additionalData
            });
            return result;
        }
        catch (error) {
            const executionTime = Date.now() - startTime;
            this.error(`Erro ao executar ${action}`, error, {
                category,
                action,
                executionTime,
                ...additionalData
            });
            throw error;
        }
    }
    /**
     * Log específico para webhook do WhatsApp
     */
    webhookReceived(phoneNumberId, messageType, flowToken) {
        this.info('Webhook recebido do WhatsApp', {
            category: DiagnosticCategory.WEBHOOK,
            action: 'webhook_received',
            details: { phoneNumberId, messageType },
            flowToken,
            metadata: { timestamp: Date.now() }
        });
    }
    /**
     * Log específico para flows
     */
    flowProcessed(screen, action, flowToken, success, executionTime) {
        const level = success ? DiagnosticLevel.INFO : DiagnosticLevel.ERROR;
        const message = `Flow ${screen} - ${action} ${success ? 'processado' : 'falhou'}`;
        this.log(level, message, {
            category: DiagnosticCategory.FLOWS,
            action: 'flow_processed',
            flowToken,
            executionTime,
            details: { screen, action, success }
        });
    }
    /**
     * Log específico para pagamentos
     */
    paymentProcessed(paymentMethod, amount, success, orderId) {
        const level = success ? DiagnosticLevel.INFO : DiagnosticLevel.ERROR;
        const message = `Pagamento ${paymentMethod} ${success ? 'processado' : 'falhou'}: R$ ${amount}`;
        this.log(level, message, {
            category: DiagnosticCategory.PAYMENT,
            action: 'payment_processed',
            details: { paymentMethod, amount, success, orderId }
        });
    }
    /**
     * Log específico para operações de banco de dados
     */
    databaseOperation(operation, collection, success, executionTime) {
        const level = success ? DiagnosticLevel.DEBUG : DiagnosticLevel.ERROR;
        const message = `Operação DB ${operation} em ${collection} ${success ? 'concluída' : 'falhou'}`;
        this.log(level, message, {
            category: DiagnosticCategory.DATABASE,
            action: 'database_operation',
            executionTime,
            details: { operation, collection, success }
        });
    }
    /**
     * Log para APIs externas
     */
    externalApiCall(api, endpoint, method, statusCode, executionTime) {
        const success = statusCode ? statusCode >= 200 && statusCode < 300 : false;
        const level = success ? DiagnosticLevel.DEBUG : DiagnosticLevel.WARN;
        const message = `API ${api} ${method} ${endpoint} - Status: ${statusCode}`;
        this.log(level, message, {
            category: DiagnosticCategory.EXTERNAL_API,
            action: 'external_api_call',
            executionTime,
            details: { api, endpoint, method, statusCode, success }
        });
    }
    /**
     * Relatório de saúde do sistema
     */
    async generateHealthReport() {
        return {
            timestamp: new Date().toISOString(),
            service: 'talk-commerce-webhook',
            environment: process.env.NODE_ENV,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: require('../../package.json').version,
            nodejs: process.version
        };
    }
}
// Instância singleton
exports.diagnostics = new DiagnosticsService();
// Middleware Express para logging automático
const diagnosticsMiddleware = (req, res, next) => {
    const startTime = Date.now();
    // Capturar informações da requisição
    exports.diagnostics.debug('Requisição recebida', {
        category: DiagnosticCategory.WEBHOOK,
        action: 'request_received',
        details: {
            method: req.method,
            url: req.url,
            userAgent: req.get('User-Agent'),
            ip: req.ip
        }
    });
    // Interceptar resposta
    const originalSend = res.send;
    res.send = function (data) {
        const executionTime = Date.now() - startTime;
        exports.diagnostics.debug('Requisição finalizada', {
            category: DiagnosticCategory.WEBHOOK,
            action: 'request_completed',
            executionTime,
            details: {
                method: req.method,
                url: req.url,
                statusCode: res.statusCode,
                responseSize: typeof data === 'string' ? data.length : JSON.stringify(data).length
            }
        });
        return originalSend.call(this, data);
    };
    next();
};
exports.diagnosticsMiddleware = diagnosticsMiddleware;
exports.default = exports.diagnostics;
