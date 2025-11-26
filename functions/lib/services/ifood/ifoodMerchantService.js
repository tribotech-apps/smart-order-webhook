"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ifoodMerchantService = exports.IFoodMerchantService = void 0;
const ifoodApiService_1 = require("./ifoodApiService");
const ifoodDataMappers_1 = require("./ifoodDataMappers");
const diagnosticsService_1 = require("../diagnosticsService");
class IFoodMerchantService {
    constructor() {
        /**
         * Cache simples para dados da loja (para evitar muitas chamadas à API)
         */
        this.storeCache = new Map();
        this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
    }
    /**
     * Busca dados de um merchant específico
     */
    async getMerchant(merchantId) {
        try {
            diagnosticsService_1.diagnostics.info('Fetching iFood merchant data', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_get_merchant',
                details: { merchantId }
            });
            const merchant = await ifoodApiService_1.ifoodApi.get('merchant', `/merchants/${merchantId}`);
            if (!merchant) {
                diagnosticsService_1.diagnostics.warn('Merchant not found', {
                    category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                    action: 'ifood_merchant_not_found',
                    details: { merchantId }
                });
                return null;
            }
            diagnosticsService_1.diagnostics.info('Merchant data fetched successfully', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_merchant_success',
                details: {
                    merchantId,
                    merchantName: merchant.name,
                    status: merchant.status,
                    isOpen: merchant.availability?.isOpen
                }
            });
            return merchant;
        }
        catch (error) {
            diagnosticsService_1.diagnostics.error('Error fetching merchant data', error, {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_merchant_error',
                details: { merchantId }
            });
            return null;
        }
    }
    /**
     * Busca lista de merchants (se disponível na API)
     */
    async getMerchants() {
        try {
            diagnosticsService_1.diagnostics.info('Fetching iFood merchants list', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_get_merchants'
            });
            const response = await ifoodApiService_1.ifoodApi.get('merchant', '/merchants');
            const merchants = response.data || [];
            diagnosticsService_1.diagnostics.info('Merchants list fetched successfully', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_merchants_success',
                details: { count: merchants.length }
            });
            return merchants;
        }
        catch (error) {
            diagnosticsService_1.diagnostics.error('Error fetching merchants list', error, {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_merchants_error'
            });
            return [];
        }
    }
    /**
     * Busca categorias de um merchant
     */
    async getMerchantCategories(merchantId, catalogId) {
        try {
            diagnosticsService_1.diagnostics.info('Fetching merchant categories', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_get_categories',
                details: { merchantId, catalogId }
            });
            const categories = await ifoodApiService_1.ifoodApi.get('catalog', `/merchants/${merchantId}/catalogs/${catalogId}/categories`);
            diagnosticsService_1.diagnostics.info('Categories fetched successfully', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_categories_success',
                details: {
                    merchantId,
                    count: categories?.length || 0
                }
            });
            return categories || [];
        }
        catch (error) {
            diagnosticsService_1.diagnostics.error('Error fetching merchant categories', error, {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_categories_error',
                details: { merchantId }
            });
            return [];
        }
    }
    /**
     * Busca dados completos da loja (merchant + categorias)
     */
    async getCompleteStore(merchantId, catalogId) {
        try {
            diagnosticsService_1.diagnostics.info('Fetching complete store data', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
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
            const store = (0, ifoodDataMappers_1.mapIFoodMerchantToStore)(merchant);
            store.categories = (0, ifoodDataMappers_1.mapIFoodCategoriesToStoreCategories)(categories);
            // Validar dados convertidos
            if (!(0, ifoodDataMappers_1.validateIFoodStore)(store)) {
                diagnosticsService_1.diagnostics.error('Invalid store data after conversion', new Error('Store validation failed'), {
                    category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                    action: 'ifood_store_validation_error',
                    details: { merchantId, storeName: store.name }
                });
                return null;
            }
            diagnosticsService_1.diagnostics.info('Complete store data fetched and converted successfully', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_complete_store_success',
                details: {
                    merchantId,
                    storeName: store.name,
                    categoriesCount: store.categories.length,
                    isOpen: store.isOpen
                }
            });
            return store;
        }
        catch (error) {
            diagnosticsService_1.diagnostics.error('Error fetching complete store data', error, {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_complete_store_error',
                details: { merchantId }
            });
            return null;
        }
    }
    /**
     * Verifica status de funcionamento de um merchant
     */
    async getMerchantStatus(merchantId) {
        try {
            diagnosticsService_1.diagnostics.info('Fetching merchant status', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_get_status',
                details: { merchantId }
            });
            const status = await ifoodApiService_1.ifoodApi.get('merchant', `/merchants/${merchantId}/status`);
            if (!status) {
                return null;
            }
            diagnosticsService_1.diagnostics.info('Merchant status fetched successfully', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_status_success',
                details: { merchantId, available: status.available }
            });
            return {
                isOpen: status.available || false,
                status: status.operation || 'UNKNOWN',
                unavailabilityReasons: status.unavailabilityReasons || []
            };
        }
        catch (error) {
            diagnosticsService_1.diagnostics.error('Error fetching merchant status from iFood API', error, {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
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
     * Busca dados da loja com cache
     */
    async getStoreWithCache(merchantId, catalogId) {
        const now = Date.now();
        const cached = this.storeCache.get(merchantId);
        // Verifica se há cache válido
        if (cached && (now - cached.timestamp) < this.CACHE_DURATION) {
            diagnosticsService_1.diagnostics.debug('Using cached store data', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
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
            diagnosticsService_1.diagnostics.debug('Store data cached', {
                category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
                action: 'ifood_store_cached',
                details: { merchantId }
            });
        }
        return store;
    }
    /**
     * Limpa cache de uma loja específica
     */
    clearStoreCache(merchantId) {
        this.storeCache.delete(merchantId);
        diagnosticsService_1.diagnostics.debug('Store cache cleared', {
            category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
            action: 'ifood_store_cache_cleared',
            details: { merchantId }
        });
    }
    /**
     * Limpa todo o cache
     */
    clearAllCache() {
        this.storeCache.clear();
        diagnosticsService_1.diagnostics.debug('All store cache cleared', {
            category: diagnosticsService_1.DiagnosticCategory.EXTERNAL_API,
            action: 'ifood_all_cache_cleared'
        });
    }
}
exports.IFoodMerchantService = IFoodMerchantService;
// Instância singleton
exports.ifoodMerchantService = new IFoodMerchantService();
