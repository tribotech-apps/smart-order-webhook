import { ifoodApi } from './ifoodApiService';
import { 
  mapIFoodMenuItemsToStoreMenuItems,
  filterAvailableMenuItems,
  groupMenuItemsByCategory,
  IFoodStoreMenuItem
} from './ifoodDataMappers';
import { 
  IFoodMenuItem, 
  IFoodCategory,
  IFoodApiResponse 
} from '../../types/IFood';
import { diagnostics, DiagnosticCategory } from '../diagnosticsService';

export class IFoodMenuService {

  /**
   * Busca todas as categorias de um merchant
   */
  async getCategories(merchantId: string): Promise<IFoodCategory[]> {
    try {
      diagnostics.info('Fetching menu categories', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_get_menu_categories',
        details: { merchantId }
      });

      const categories = await ifoodApi.get<IFoodCategory[]>('catalog', `/merchants/${merchantId}/categories`);
      
      const availableCategories = categories?.filter(cat => cat.status === 'AVAILABLE') || [];
      
      diagnostics.info('Menu categories fetched successfully', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_menu_categories_success',
        details: { 
          merchantId, 
          totalCategories: categories?.length || 0,
          availableCategories: availableCategories.length
        }
      });

      return availableCategories;
    } catch (error: any) {
      diagnostics.error('Error fetching menu categories', error, {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_menu_categories_error',
        details: { merchantId }
      });
      return [];
    }
  }

  /**
   * Busca todos os itens do menu de um merchant
   */
  async getMenuItems(merchantId: string): Promise<IFoodMenuItem[]> {
    try {
      diagnostics.info('Fetching all menu items', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_get_menu_items',
        details: { merchantId }
      });

      const items = await ifoodApi.get<IFoodMenuItem[]>('catalog', `/merchants/${merchantId}/items`);
      
      const availableItems = items?.filter(item => item.status === 'AVAILABLE') || [];
      
      diagnostics.info('Menu items fetched successfully', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_menu_items_success',
        details: { 
          merchantId, 
          totalItems: items?.length || 0,
          availableItems: availableItems.length
        }
      });

      return availableItems;
    } catch (error: any) {
      diagnostics.error('Error fetching menu items', error, {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_menu_items_error',
        details: { merchantId }
      });
      return [];
    }
  }

  /**
   * Busca itens de uma categoria específica
   */
  async getCategoryItems(merchantId: string, catalogId: string, categoryId: string): Promise<IFoodMenuItem[]> {
    try {
      diagnostics.info('Fetching category items', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_get_category_items',
        details: { merchantId, catalogId, categoryId }
      });

      const items = await ifoodApi.get<IFoodMenuItem[]>('catalog', `/merchants/${merchantId}/catalogs/${catalogId}/categories/${categoryId}/items`);
      
      const availableItems = items?.filter(item => item.status === 'AVAILABLE') || [];
      
      diagnostics.info('Category items fetched successfully', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_category_items_success',
        details: { 
          merchantId, 
          catalogId,
          categoryId,
          totalItems: items?.length || 0,
          availableItems: availableItems.length
        }
      });

      return availableItems;
    } catch (error: any) {
      diagnostics.error('Error fetching category items', error, {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_category_items_error',
        details: { merchantId, catalogId, categoryId }
      });
      return [];
    }
  }

  /**
   * Busca um item específico do menu
   */
  async getMenuItem(merchantId: string, catalogId: string, itemId: string): Promise<IFoodMenuItem | null> {
    try {
      diagnostics.info('Fetching menu item', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_get_menu_item',
        details: { merchantId, catalogId, itemId }
      });

      const item = await ifoodApi.get<IFoodMenuItem>('catalog', `/merchants/${merchantId}/catalogs/${catalogId}/items/${itemId}`);
      
      if (!item || item.status !== 'AVAILABLE') {
        diagnostics.warn('Menu item not available', {
          category: DiagnosticCategory.EXTERNAL_API,
          action: 'ifood_menu_item_unavailable',
          details: { merchantId, catalogId, itemId, status: item?.status }
        });
        return null;
      }

      diagnostics.info('Menu item fetched successfully', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_menu_item_success',
        details: { 
          merchantId, 
          catalogId,
          itemId,
          itemName: item.name,
          price: item.price?.value
        }
      });

      return item;
    } catch (error: any) {
      diagnostics.error('Error fetching menu item', error, {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_menu_item_error',
        details: { merchantId, catalogId, itemId }
      });
      return null;
    }
  }

  /**
   * Busca menu completo organizado por categorias (formato usado no WhatsApp Flow)
   */
  async getCompleteMenu(merchantId: string, catalogId: string): Promise<{
    categories: IFoodCategory[];
    menuByCategory: Record<number, IFoodStoreMenuItem[]>;
    allItems: IFoodStoreMenuItem[];
  }> {
    try {
      diagnostics.info('Fetching complete menu', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_get_complete_menu',
        details: { merchantId, catalogId }
      });

      // Buscar categorias e itens em paralelo
      const [categories, allMenuItems] = await Promise.all([
        this.getCategories(merchantId),
        this.getMenuItems(merchantId)
      ]);

      // Converter itens para formato do sistema
      const convertedItems: IFoodStoreMenuItem[] = [];
      
      for (const category of categories) {
        const categoryItems = allMenuItems.filter(item => {
          // Assumindo que o item tem uma referência à categoria
          // A estrutura exata pode variar dependendo da API do iFood
          return item.classification === category.id || 
                 item.template === category.id ||
                 // Fallback: buscar itens desta categoria especificamente
                 false;
        });

        const convertedCategoryItems = mapIFoodMenuItemsToStoreMenuItems(
          categoryItems, 
          parseInt(category.id)
        );
        
        convertedItems.push(...convertedCategoryItems);
      }

      // Se não conseguiu associar itens às categorias, buscar por categoria
      if (convertedItems.length === 0) {
        for (const category of categories) {
          const categoryItems = await this.getCategoryItems(merchantId, catalogId, category.id);
          const convertedCategoryItems = mapIFoodMenuItemsToStoreMenuItems(
            categoryItems, 
            parseInt(category.id)
          );
          convertedItems.push(...convertedCategoryItems);
        }
      }

      // Filtrar apenas itens disponíveis
      const availableItems = filterAvailableMenuItems(convertedItems);
      
      // Agrupar por categoria
      const menuByCategory = groupMenuItemsByCategory(availableItems);

      diagnostics.info('Complete menu fetched and organized successfully', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_complete_menu_success',
        details: { 
          merchantId, 
          categoriesCount: categories.length,
          totalItems: availableItems.length,
          categoriesWithItems: Object.keys(menuByCategory).length
        }
      });

      return {
        categories,
        menuByCategory,
        allItems: availableItems
      };
    } catch (error: any) {
      diagnostics.error('Error fetching complete menu', error, {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_complete_menu_error',
        details: { merchantId }
      });
      
      return {
        categories: [],
        menuByCategory: {},
        allItems: []
      };
    }
  }

  /**
   * Busca produtos por categoria (compatível com a função atual getProductsByCategory)
   */
  async getProductsByCategory(merchantId: string, catalogId: string, categoryId: number): Promise<IFoodStoreMenuItem[]> {
    try {
      const categoryItems = await this.getCategoryItems(merchantId, catalogId, categoryId.toString());
      const convertedItems = mapIFoodMenuItemsToStoreMenuItems(categoryItems, categoryId);
      return filterAvailableMenuItems(convertedItems);
    } catch (error: any) {
      diagnostics.error('Error fetching products by category', error, {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_products_by_category_error',
        details: { merchantId, catalogId, categoryId }
      });
      return [];
    }
  }

  /**
   * Busca um produto específico pelo ID (compatível com a busca atual de produtos)
   */
  async getProductById(merchantId: string, catalogId: string, productId: number): Promise<IFoodStoreMenuItem | null> {
    try {
      const item = await this.getMenuItem(merchantId, catalogId, productId.toString());
      
      if (!item) {
        return null;
      }

      // Converter para formato do sistema - precisamos descobrir a categoria
      // Se não soubermos a categoria, usamos 0 como padrão
      const convertedItems = mapIFoodMenuItemsToStoreMenuItems([item], 0);
      return convertedItems[0] || null;
    } catch (error: any) {
      diagnostics.error('Error fetching product by ID', error, {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_product_by_id_error',
        details: { merchantId, catalogId, productId }
      });
      return null;
    }
  }

  /**
   * Cache para menu completo (para evitar muitas chamadas à API)
   */
  private menuCache = new Map<string, { 
    menu: {
      categories: IFoodCategory[];
      menuByCategory: Record<number, IFoodStoreMenuItem[]>;
      allItems: IFoodStoreMenuItem[];
    };
    timestamp: number;
  }>();
  
  private readonly MENU_CACHE_DURATION = 10 * 60 * 1000; // 10 minutos

  /**
   * Busca menu completo com cache
   */
  async getCompleteMenuWithCache(merchantId: string, catalogId: string) {
    const now = Date.now();
    const cached = this.menuCache.get(merchantId);

    // Verifica se há cache válido
    if (cached && (now - cached.timestamp) < this.MENU_CACHE_DURATION) {
      diagnostics.debug('Using cached menu data', {
        category: DiagnosticCategory.EXTERNAL_API,
        action: 'ifood_menu_cache_hit',
        details: { merchantId }
      });
      return cached.menu;
    }

    // Busca dados frescos
    const menu = await this.getCompleteMenu(merchantId, catalogId);
    
    // Atualiza cache
    this.menuCache.set(merchantId, {
      menu,
      timestamp: now
    });
    
    diagnostics.debug('Menu data cached', {
      category: DiagnosticCategory.EXTERNAL_API,
      action: 'ifood_menu_cached',
      details: { merchantId }
    });

    return menu;
  }

  /**
   * Limpa cache do menu
   */
  clearMenuCache(merchantId: string): void {
    this.menuCache.delete(merchantId);
    diagnostics.debug('Menu cache cleared', {
      category: DiagnosticCategory.EXTERNAL_API,
      action: 'ifood_menu_cache_cleared',
      details: { merchantId }
    });
  }

  /**
   * Limpa todo o cache de menus
   */
  clearAllMenuCache(): void {
    this.menuCache.clear();
    diagnostics.debug('All menu cache cleared', {
      category: DiagnosticCategory.EXTERNAL_API,
      action: 'ifood_all_menu_cache_cleared'
    });
  }
}

// Instância singleton
export const ifoodMenuService = new IFoodMenuService();