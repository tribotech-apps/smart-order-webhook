import { Logging } from '@google-cloud/logging';
import { ErrorReporting } from '@google-cloud/error-reporting';
import * as winston from 'winston';
import * as functions from 'firebase-functions';

// Configuração do Google Cloud Logging
const logging = new Logging();

// Configuração do Error Reporting
const errors = new ErrorReporting();

// Configuração do Winston Logger
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'talk-commerce-webhook',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console transport para desenvolvimento
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Se estiver em produção, adicionar transports do Google Cloud
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.json()
  }));
}

export enum DiagnosticLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export enum DiagnosticCategory {
  WEBHOOK = 'webhook',
  FLOWS = 'flows',
  PAYMENT = 'payment',
  DATABASE = 'database',
  EXTERNAL_API = 'external_api',
  AUTHENTICATION = 'authentication',
  PERFORMANCE = 'performance'
}

export interface DiagnosticData {
  category: DiagnosticCategory;
  action: string;
  details?: any;
  userId?: string;
  storeId?: string;
  conversationId?: string;
  flowToken?: string;
  phoneNumber?: string;
  executionTime?: number;
  metadata?: Record<string, any>;
}

class DiagnosticsService {

  /**
   * Log de depuração para desenvolvimento
   */
  debug(message: string, data?: DiagnosticData) {
    this.log(DiagnosticLevel.DEBUG, message, data);
  }

  /**
   * Log de informações gerais
   */
  info(message: string, data?: DiagnosticData) {
    this.log(DiagnosticLevel.INFO, message, data);
  }

  /**
   * Log de avisos
   */
  warn(message: string, data?: DiagnosticData) {
    this.log(DiagnosticLevel.WARN, message, data);
  }

  /**
   * Log de erros
   */
  error(message: string, error?: Error | any, data?: DiagnosticData) {
    this.log(DiagnosticLevel.ERROR, message, data, error);

    // Reportar erro para o Google Cloud Error Reporting
    if (error && process.env.NODE_ENV === 'production') {
      errors.report(error);
    }
  }

  /**
   * Log de erros críticos
   */
  critical(message: string, error?: Error | any, data?: DiagnosticData) {
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
  private log(level: DiagnosticLevel, message: string, data?: DiagnosticData, error?: Error | any) {
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
    } else if (level === DiagnosticLevel.WARN) {
      functions.logger.warn(message, logData);
    } else {
      functions.logger.info(message, logData);
    }
  }

  /**
   * Mascarar número de telefone para privacidade
   */
  private maskPhoneNumber(phoneNumber: string): string {
    if (phoneNumber.length <= 4) return phoneNumber;
    return phoneNumber.substring(0, 4) + '*'.repeat(phoneNumber.length - 4);
  }

  /**
   * Enviar alerta crítico para administradores
   */
  private async sendCriticalAlert(message: string, error?: Error | any, data?: DiagnosticData) {
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
    } catch (alertError) {
      console.error('Erro ao enviar alerta crítico:', alertError);
    }
  }

  /**
   * Medir tempo de execução de uma função
   */
  async measureExecutionTime<T>(
    category: DiagnosticCategory,
    action: string,
    fn: () => Promise<T>,
    additionalData?: Partial<DiagnosticData>
  ): Promise<T> {
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
    } catch (error) {
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
  webhookReceived(phoneNumberId: string, messageType: string, flowToken?: string) {
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
  flowProcessed(screen: string, action: string, flowToken: string, success: boolean, executionTime?: number) {
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
  paymentProcessed(paymentMethod: string, amount: number, success: boolean, orderId?: string) {
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
  databaseOperation(operation: string, collection: string, success: boolean, executionTime?: number) {
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
  externalApiCall(api: string, endpoint: string, method: string, statusCode?: number, executionTime?: number) {
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
  async generateHealthReport(): Promise<any> {
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
export const diagnostics = new DiagnosticsService();

// Middleware Express para logging automático
export const diagnosticsMiddleware = (req: any, res: any, next: any) => {
  const startTime = Date.now();

  // Capturar informações da requisição
  diagnostics.debug('Requisição recebida', {
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
  res.send = function (data: any) {
    const executionTime = Date.now() - startTime;

    diagnostics.debug('Requisição finalizada', {
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

export default diagnostics;
