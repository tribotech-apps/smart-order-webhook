"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceMonitor = void 0;
exports.withDiagnostics = withDiagnostics;
exports.withDiagnosticsSync = withDiagnosticsSync;
exports.DiagnosticMethod = DiagnosticMethod;
const diagnosticsService_1 = require("./diagnosticsService");
/**
 * Wrapper para capturar erros em funções assíncronas automaticamente
 */
function withDiagnostics(category, action, fn) {
    return async (...args) => {
        const startTime = Date.now();
        try {
            const result = await fn(...args);
            const executionTime = Date.now() - startTime;
            diagnosticsService_1.diagnostics.debug(`${action} executado com sucesso`, {
                category,
                action,
                executionTime
            });
            return result;
        }
        catch (error) {
            const executionTime = Date.now() - startTime;
            diagnosticsService_1.diagnostics.error(`Erro ao executar ${action}`, error, {
                category,
                action,
                executionTime
            });
            throw error;
        }
    };
}
/**
 * Wrapper para capturar erros em funções síncronas
 */
function withDiagnosticsSync(category, action, fn) {
    return (...args) => {
        const startTime = Date.now();
        try {
            const result = fn(...args);
            const executionTime = Date.now() - startTime;
            diagnosticsService_1.diagnostics.debug(`${action} executado com sucesso`, {
                category,
                action,
                executionTime
            });
            return result;
        }
        catch (error) {
            const executionTime = Date.now() - startTime;
            diagnosticsService_1.diagnostics.error(`Erro ao executar ${action}`, error, {
                category,
                action,
                executionTime
            });
            throw error;
        }
    };
}
/**
 * Decorator para métodos de classe
 */
function DiagnosticMethod(category, action) {
    return function (target, propertyName, descriptor) {
        const method = descriptor.value;
        const actionName = action || `${target.constructor.name}.${propertyName}`;
        descriptor.value = async function (...args) {
            const startTime = Date.now();
            try {
                const result = await method.apply(this, args);
                const executionTime = Date.now() - startTime;
                diagnosticsService_1.diagnostics.debug(`${actionName} executado com sucesso`, {
                    category,
                    action: actionName,
                    executionTime
                });
                return result;
            }
            catch (error) {
                const executionTime = Date.now() - startTime;
                diagnosticsService_1.diagnostics.error(`Erro ao executar ${actionName}`, error, {
                    category,
                    action: actionName,
                    executionTime
                });
                throw error;
            }
        };
        return descriptor;
    };
}
/**
 * Utilitário para logs de performance
 */
class PerformanceMonitor {
    static start(label) {
        this.timers.set(label, Date.now());
    }
    static end(label, category, action, additionalData) {
        const startTime = this.timers.get(label);
        if (!startTime) {
            diagnosticsService_1.diagnostics.warn(`Timer '${label}' não encontrado`, {
                category,
                action: 'performance_timer_not_found',
                details: { label }
            });
            return 0;
        }
        const executionTime = Date.now() - startTime;
        this.timers.delete(label);
        diagnosticsService_1.diagnostics.info(`Performance: ${label}`, {
            category,
            action,
            executionTime,
            details: additionalData
        });
        return executionTime;
    }
}
exports.PerformanceMonitor = PerformanceMonitor;
PerformanceMonitor.timers = new Map();
exports.default = {
    withDiagnostics,
    withDiagnosticsSync,
    DiagnosticMethod,
    PerformanceMonitor
};
