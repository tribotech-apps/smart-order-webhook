import { diagnostics, DiagnosticCategory } from './diagnosticsService';

/**
 * Wrapper para capturar erros em funções assíncronas automaticamente
 */
export function withDiagnostics<T extends any[], R>(
  category: DiagnosticCategory,
  action: string,
  fn: (...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R> => {
    const startTime = Date.now();

    try {
      const result = await fn(...args);
      const executionTime = Date.now() - startTime;

      diagnostics.debug(`${action} executado com sucesso`, {
        category,
        action,
        executionTime
      });

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;

      diagnostics.error(`Erro ao executar ${action}`, error, {
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
export function withDiagnosticsSync<T extends any[], R>(
  category: DiagnosticCategory,
  action: string,
  fn: (...args: T) => R
) {
  return (...args: T): R => {
    const startTime = Date.now();

    try {
      const result = fn(...args);
      const executionTime = Date.now() - startTime;

      diagnostics.debug(`${action} executado com sucesso`, {
        category,
        action,
        executionTime
      });

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;

      diagnostics.error(`Erro ao executar ${action}`, error, {
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
export function DiagnosticMethod(category: DiagnosticCategory, action?: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const actionName = action || `${target.constructor.name}.${propertyName}`;

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();

      try {
        const result = await method.apply(this, args);
        const executionTime = Date.now() - startTime;

        diagnostics.debug(`${actionName} executado com sucesso`, {
          category,
          action: actionName,
          executionTime
        });

        return result;
      } catch (error) {
        const executionTime = Date.now() - startTime;

        diagnostics.error(`Erro ao executar ${actionName}`, error, {
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
export class PerformanceMonitor {
  private static timers: Map<string, number> = new Map();

  static start(label: string): void {
    this.timers.set(label, Date.now());
  }

  static end(label: string, category: DiagnosticCategory, action: string, additionalData?: any): number {
    const startTime = this.timers.get(label);
    if (!startTime) {
      diagnostics.warn(`Timer '${label}' não encontrado`, {
        category,
        action: 'performance_timer_not_found',
        details: { label }
      });
      return 0;
    }

    const executionTime = Date.now() - startTime;
    this.timers.delete(label);

    diagnostics.info(`Performance: ${label}`, {
      category,
      action,
      executionTime,
      details: additionalData
    });

    return executionTime;
  }
}

export default {
  withDiagnostics,
  withDiagnosticsSync,
  DiagnosticMethod,
  PerformanceMonitor
};
