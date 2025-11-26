import { ifoodApi } from './ifoodApiService';
import {
  mapIFoodMerchantToStore,
  mapIFoodCategoriesToStoreCategories,
  validateIFoodStore,
  IFoodStore
} from './ifoodDataMappers';
import {
  IFoodMerchant,
  IFoodCategory,
  IFoodApiResponse
} from '../../types/IFood';
import { diagnostics, DiagnosticCategory } from '../diagnosticsService';

export class IFoodMerchantService {

  /**
   * Busca dados de um merchant específico
   */
  async getMerchant(merchantId: string): Promise<IFoodMerchant | null> {
    try {
      diagnostics.info('Fetching iFood merchant data', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_get_merchant',
        details: { merchantId }
      });

      const merchant = await ifoodApi.get<IFoodMerchant>('merchant', `/merchants/${merchantId}`);

      if (!merchant) {
        diagnostics.warn('Merchant not found', {
          category: DiagnosticCategory.EXTERNAL_API,
          action: 'ifood_merchant_not_found',
          details: { merchantId }
        });
        return null;
      }

      diagnostics.info('Merchant data fetched successfully', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_merchant_success',
        details: {
          merchantId,
          merchantName: merchant.name,
          status: merchant.status,
          isOpen: merchant.availability?.isOpen
        }
      });

      return merchant;
    } catch (error: any) {
      diagnostics.error('Error fetching merchant data', error, {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_merchant_error',
        details: { merchantId }
      });
      return null;
    }
  }

  /**
   * Busca lista de merchants (se disponível na API)
   */
  async getMerchants(): Promise<IFoodMerchant[]> {
    try {
      diagnostics.info('Fetching iFood merchants list', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_get_merchants'
      });

      const response = await ifoodApi.get<IFoodApiResponse<IFoodMerchant[]>>('merchant', '/merchants');

      const merchants = response.data || [];

      diagnostics.info('Merchants list fetched successfully', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_merchants_success',
        details: { count: merchants.length }
      });

      return merchants;
    } catch (error: any) {
      diagnostics.error('Error fetching merchants list', error, {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_merchants_error'
      });
      return [];
    }
  }

  /**
   * Busca categorias de um merchant
   */
  async getMerchantCategories(merchantId: string, catalogId: string): Promise<IFoodCategory[]> {
    try {
      diagnostics.info('Fetching merchant categories', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_get_categories',
        details: { merchantId, catalogId }
      });

      const categories = await ifoodApi.get<IFoodCategory[]>('catalog', `/merchants/${merchantId}/catalogs/${catalogId}/categories`);

      diagnostics.info('Categories fetched successfully', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_categories_success',
        details: {
          merchantId,
          count: categories?.length || 0
        }
      });

      return categories || [];
    } catch (error: any) {
      diagnostics.error('Error fetching merchant categories', error, {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_categories_error',
        details: { merchantId }
      });
      return [];
    }
  }

  /**
   * Busca dados completos da loja (merchant + categorias)
   */
  async getCompleteStore(merchantId: string, catalogId: string): Promise<IFoodStore | null> {
    try {
      diagnostics.info('Fetching complete store data', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_get_complete_store',
        details: { merchantId, catalogId }
      });

      // Buscar dados do merchant e categorias em paralelo
      const [merchant, categories] = await Promise.all([
        this.getMerchant(merchantId),
        this.getMerchantCategories(merchantId, catalogId)
      ]);

      if (!merchant) {
        return null;
      }

      // Converter para formato do sistema
      const store = mapIFoodMerchantToStore(merchant);
      store.categories = mapIFoodCategoriesToStoreCategories(categories);

      // Validar dados convertidos
      if (!validateIFoodStore(store)) {
        diagnostics.error('Invalid store data after conversion', new Error('Store validation failed'), {
          category: DiagnosticCategory.EXTERNAL_API,
          action: 'ifood_store_validation_error',
          details: { merchantId, storeName: store.name }
        });
        return null;
      }

      diagnostics.info('Complete store data fetched and converted successfully', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_complete_store_success',
        details: {
          merchantId,
          storeName: store.name,
          categoriesCount: store.categories.length,
          isOpen: store.isOpen
        }
      });

      return store;
    } catch (error: any) {
      diagnostics.error('Error fetching complete store data', error, {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_complete_store_error',
        details: { merchantId }
      });
      return null;
    }
  }

  /**
   * Verifica status de funcionamento de um merchant
   */
  async getMerchantStatus(merchantId: string): Promise<{
    isOpen: boolean;
    status: string;
    unavailabilityReasons?: string[];
  } | null> {
    try {
      diagnostics.info('Fetching merchant status', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_get_status',
        details: { merchantId }
      });

      const status = await ifoodApi.get<any>('merchant', `/merchants/${merchantId}/status`);

      if (!status) {
        return null;
      }

      diagnostics.info('Merchant status fetched successfully', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_status_success',
        details: { merchantId, available: status.available }
      });

      return {
        isOpen: status.available || false,
        status: status.operation || 'UNKNOWN',
        unavailabilityReasons: status.unavailabilityReasons || []
      };
    } catch (error: any) {
      diagnostics.error('Error fetching merchant status from iFood API', error, {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_status_error',
        details: {
          merchantId,
          endpoint: `/merchant/v1.0/merchants/${merchantId}/status`,
          errorMessage: error.message,
          errorStack: error.stack
        }
      });
      // Retornar null para indicar falha da API iFood
      return null;
    }
  }

  /**
   * Cache simples para dados da loja (para evitar muitas chamadas à API)
   */
  private storeCache = new Map<string, { store: IFoodStore; timestamp: number }>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

  /**
   * Busca dados da loja com cache
   */
  async getStoreWithCache(merchantId: string, catalogId: string): Promise<IFoodStore | null> {
    const now = Date.now();
    const cached = this.storeCache.get(merchantId);

    // Verifica se há cache válido
    if (cached && (now - cached.timestamp) < this.CACHE_DURATION) {
      diagnostics.debug('Using cached store data', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_store_cache_hit',
        details: { merchantId, catalogId }
      });
      return cached.store;
    }

    // Busca dados frescos
    const store = await this.getCompleteStore(merchantId, catalogId);

    if (store) {
      // Atualiza cache
      this.storeCache.set(merchantId, {
        store,
        timestamp: now
      });

      diagnostics.debug('Store data cached', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_store_cached',
        details: { merchantId }
      });
    }

    return store;
  }

  /**
   * Limpa cache de uma loja específica
   */
  clearStoreCache(merchantId: string): void {
    this.storeCache.delete(merchantId);
    diagnostics.debug('Store cache cleared', {
      category: DiagnosticCategory.EXTERNAL_API,
      action: 'ifood_store_cache_cleared',
      details: { merchantId }
    });
  }

  /**
   * Limpa todo o cache
   */
  clearAllCache(): void {
    this.storeCache.clear();
    diagnostics.debug('All store cache cleared', {
      category: DiagnosticCategory.EXTERNAL_API,
      action: 'ifood_all_cache_cleared'
    });
  }
}

// Instância singleton
export const ifoodMerchantService = new IFoodMerchantService();