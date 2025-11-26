"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ifoodApi = exports.IFoodApiService = void 0;
require("dotenv/config.js");
const diagnosticsService_1 = require("../diagnosticsService");
class IFoodApiService {
    constructor() {
        this.config = {
            baseUrls: {
                authentication: 'https://merchant-api.ifood.com.br/authentication/v1.0',
                merchant: 'https://merchant-api.ifood.com.br/merchant/v1.0',
                order: 'https://merchant-api.ifood.com.br/order/v1.0',
                catalog: 'https://merchant-api.ifood.com.br/catalog/v2.0',
                logistics: 'https://merchant-api.ifood.com.br/logistics/v1.0',
                shipping: 'https://merchant-api.ifood.com.br/shipping/v1.0',
                financial: 'https://merchant-api.ifood.com.br/financial/v2.0',
                events: 'https://merchant-api.ifood.com.br/events/v1.0'
            }
        };
        diagnosticsService_1.diagnostics.info('iFood API Service initialized', {
            category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
            action: 'ifood_service_init',
            details: {
                baseUrls: Object.keys(this.config.baseUrls)
            }
        });
    }
    /**
     * Obtém um token de acesso válido
     */
    async getAccessToken() {
        // Usar token direto do .env
        const directToken = process.env.IFOOD_ACCESS_TOKEN;
        if (!directToken) {
            throw new Error('IFOOD_ACCESS_TOKEN not found in environment variables');
        }
        diagnosticsService_1.diagnostics.debug('Using token from environment', {
            category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
            action: 'ifood_token_from_env'
        });
        return directToken;
    }
    /**
     * Faz uma requisição autenticada para a API do iFood
     */
    async request(service, endpoint, options = {}) {
        const token = await this.getAccessToken();
        const baseUrl = this.config.baseUrls[service];
        const url = `${baseUrl}${endpoint}`;
        const startTime = Date.now();
        try {
            diagnosticsService_1.diagnostics.debug('Making iFood API request', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_api_request',
                details: {
                    method: options.method || 'GET',
                    endpoint,
                    hasBody: !!options.body
                }
            });
            const response = await fetch(url, {
                ...options,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    ...options.headers
                }
            });
            const executionTime = Date.now() - startTime;
            diagnosticsService_1.diagnostics.info('iFood API request made', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_api_request_made',
                executionTime,
                details: {
                    endpoint,
                    status: response,
                    statusText: response.statusText
                }
            });
            if (!response.ok) {
                const errorText = await response.text();
                // Se for erro 401, marca como falha de autenticação sem retry
                if (response.status === 401) {
                    diagnosticsService_1.diagnostics.error('iFood authentication failed - no retry', {
                        category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                        action: 'ifood_auth_failed',
                        executionTime,
                        details: { endpoint, error: errorText }
                    });
                }
                diagnosticsService_1.diagnostics.error('iFood API request failed', new Error(`HTTP ${response.status}: ${errorText}`), {
                    category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                    action: 'ifood_api_error',
                    executionTime,
                    details: {
                        endpoint,
                        status: response.status,
                        statusText: response.statusText,
                        errorText
                    }
                });
                throw new Error(`iFood API request failed: ${response.status} ${response.statusText} - ${errorText}`);
            }
            const data = await response.json();
            diagnosticsService_1.diagnostics.info('iFood API request successful', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_api_success',
                executionTime,
                details: {
                    endpoint,
                    status: response.status,
                    dataKeys: Object.keys(data || {})
                }
            });
            return data;
        }
        catch (error) {
            const executionTime = Date.now() - startTime;
            diagnosticsService_1.diagnostics.error('Error making iFood API request', error, {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_api_request_error',
                executionTime,
                details: { endpoint, url }
            });
            throw error;
        }
    }
    /**
     * Métodos de conveniência para diferentes tipos de requisição
     */
    async get(service, endpoint) {
        console.log('VAI CHAMAR A API', endpoint);
        diagnosticsService_1.diagnostics.info('VAI CHAMAR A API', {
            category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
            action: 'ifood_categories_success',
            details: {
                endpoint
            }
        });
        return this.request(service, endpoint, { method: 'GET' });
    }
    async post(service, endpoint, data) {
        return this.request(service, endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
    async put(service, endpoint, data) {
        return this.request(service, endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }
    async patch(service, endpoint, data) {
        return this.request(service, endpoint, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    }
    async delete(service, endpoint) {
        return this.request(service, endpoint, { method: 'DELETE' });
    }
}
exports.IFoodApiService = IFoodApiService;
// Instância singleton para uso em toda a aplicação
exports.ifoodApi = new IFoodApiService();
