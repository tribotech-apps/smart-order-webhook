import 'dotenv/config.js';
import { diagnostics, DiagnosticCategory } from '../diagnosticsService';

interface IFoodApiConfig {
  baseUrls: {
    authentication: string;
    merchant: string;
    order: string;
    catalog: string;
    logistics: string;
    shipping: string;
    financial: string;
    events: string;
  };
}

export class IFoodApiService {
  private config: IFoodApiConfig;

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

    diagnostics.info('iFood API Service initialized', {
      category: DiagnosticCategory.EXTERNAL_API,
      action: 'ifood_service_init',
      details: {
        baseUrls: Object.keys(this.config.baseUrls)
      }
    });
  }

  /**
   * Obtém um token de acesso válido
   */
  public async getAccessToken(): Promise<string> {
    // Usar token direto do .env
    const directToken = process.env.IFOOD_ACCESS_TOKEN;

    if (!directToken) {
      throw new Error('IFOOD_ACCESS_TOKEN not found in environment variables');
    }

    diagnostics.debug('Using token from environment', {
      category: DiagnosticCategory.EXTERNAL_API,
      action: 'ifood_token_from_env'
    });

    return directToken;
  }

  /**
   * Faz uma requisição autenticada para a API do iFood
   */
  public async request<T = any>(
    service: keyof IFoodApiConfig['baseUrls'],
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.getAccessToken();
    const baseUrl = this.config.baseUrls[service];
    const url = `${baseUrl}${endpoint}`;
    const startTime = Date.now();

    try {
      diagnostics.debug('Making iFood API request', {
        category: DiagnosticCategory.EXTERNAL_API,
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

      diagnostics.info('iFood API request made', {
        category: DiagnosticCategory.EXTERNAL_API,
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
          diagnostics.error('iFood authentication failed - no retry', {
            category: DiagnosticCategory.EXTERNAL_API,
            action: 'ifood_auth_failed',
            executionTime,
            details: { endpoint, error: errorText }
          });
        }

        diagnostics.error('iFood API request failed', new Error(`HTTP ${response.status}: ${errorText}`), {
          category: DiagnosticCategory.EXTERNAL_API,
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

      diagnostics.info('iFood API request successful', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_api_success',
        executionTime,
        details: {
          endpoint,
          status: response.status,
          dataKeys: Object.keys(data || {})
        }
      });

      return data;
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      diagnostics.error('Error making iFood API request', error, {
        category: DiagnosticCategory.EXTERNAL_API,
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
  public async get<T = any>(service: keyof IFoodApiConfig['baseUrls'], endpoint: string): Promise<T> {

    console.log('VAI CHAMAR A API', endpoint)

    diagnostics.info('VAI CHAMAR A API', {
      category: DiagnosticCategory.EXTERNAL_API,
      action: 'ifood_categories_success',
      details: {
        endpoint
      }
    });


    return this.request<T>(service, endpoint, { method: 'GET' });
  }

  public async post<T = any>(service: keyof IFoodApiConfig['baseUrls'], endpoint: string, data: any): Promise<T> {
    return this.request<T>(service, endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  public async put<T = any>(service: keyof IFoodApiConfig['baseUrls'], endpoint: string, data: any): Promise<T> {
    return this.request<T>(service, endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  public async patch<T = any>(service: keyof IFoodApiConfig['baseUrls'], endpoint: string, data: any): Promise<T> {
    return this.request<T>(service, endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  public async delete<T = any>(service: keyof IFoodApiConfig['baseUrls'], endpoint: string): Promise<T> {
    return this.request<T>(service, endpoint, { method: 'DELETE' });
  }
}

// Instância singleton para uso em toda a aplicação
export const ifoodApi = new IFoodApiService();