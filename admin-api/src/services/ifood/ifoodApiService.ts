import 'dotenv/config';

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

    console.log('iFood API Service initialized');
  }

  public async getAccessToken(): Promise<string> {
    const directToken = process.env.IFOOD_ACCESS_TOKEN;

    if (!directToken) {
      throw new Error('IFOOD_ACCESS_TOKEN not found in environment variables');
    }

    console.log('Using token from environment');
    return directToken;
  }

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
      console.log(`Making iFood API request: ${options.method || 'GET'} ${endpoint}`);

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

      console.log(`iFood API request completed in ${executionTime}ms: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`iFood API request failed: ${response.status} ${response.statusText} - ${errorText}`);
        throw new Error(`iFood API request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      console.log(`iFood API request successful: ${endpoint}`);

      return data;
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      console.error(`Error making iFood API request to ${endpoint}:`, error.message);
      throw error;
    }
  }

  public async get<T = any>(service: keyof IFoodApiConfig['baseUrls'], endpoint: string): Promise<T> {
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

  public async uploadImage(service: keyof IFoodApiConfig['baseUrls'], endpoint: string, formData: FormData): Promise<any> {
    const token = await this.getAccessToken();
    const baseUrl = this.config.baseUrls[service];
    const url = `${baseUrl}${endpoint}`;

    try {
      console.log(`Uploading image to iFood API: ${endpoint}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`iFood image upload failed: ${response.status} ${response.statusText} - ${errorText}`);
        throw new Error(`iFood image upload failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      console.log(`iFood image upload successful: ${endpoint}`);

      return data;
    } catch (error: any) {
      console.error(`Error uploading image to iFood API:`, error.message);
      throw error;
    }
  }
}

export const ifoodApi = new IFoodApiService();