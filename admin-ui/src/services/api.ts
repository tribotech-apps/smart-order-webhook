import axios from 'axios';
import {
  IFoodCatalog,
  IFoodCategory,
  IFoodCategoryItemsResponse,
  CreateCategoryRequest,
  CreateCompleteItemRequest,
  UpdateItemPriceRequest,
  UpdateItemStatusRequest,
  UpdateOptionPriceRequest,
  UpdateOptionStatusRequest,
  ImageUploadResponse
} from '../types/IFood';

const API_BASE_URL = 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// API service class
export class IFoodAdminAPI {
  
  // Catalog endpoints
  static async getCatalogs(merchantId: string): Promise<IFoodCatalog[]> {
    const response = await api.get(`/merchants/${merchantId}/catalogs`);
    return response.data;
  }

  // Category endpoints
  static async getCategories(merchantId: string, catalogId: string): Promise<IFoodCategory[]> {
    const response = await api.get(`/merchants/${merchantId}/catalogs/${catalogId}/categories`);
    return response.data;
  }

  static async createCategory(
    merchantId: string, 
    catalogId: string, 
    categoryData: CreateCategoryRequest
  ): Promise<IFoodCategory> {
    const response = await api.post(`/merchants/${merchantId}/catalogs/${catalogId}/categories`, categoryData);
    return response.data;
  }

  static async getCategoryItems(merchantId: string, categoryId: string): Promise<IFoodCategoryItemsResponse> {
    const response = await api.get(`/merchants/${merchantId}/categories/${categoryId}/items`);
    return response.data;
  }

  // Item endpoints
  static async createCompleteItem(
    merchantId: string, 
    itemData: CreateCompleteItemRequest
  ): Promise<any> {
    const response = await api.put(`/merchants/${merchantId}/items`, itemData);
    return response.data;
  }

  static async updateItemPrice(
    merchantId: string, 
    priceData: UpdateItemPriceRequest
  ): Promise<any> {
    const response = await api.patch(`/merchants/${merchantId}/items/price`, priceData);
    return response.data;
  }

  static async updateItemStatus(
    merchantId: string, 
    statusData: UpdateItemStatusRequest
  ): Promise<any> {
    const response = await api.patch(`/merchants/${merchantId}/items/status`, statusData);
    return response.data;
  }

  // Option endpoints
  static async updateOptionPrice(
    merchantId: string, 
    priceData: UpdateOptionPriceRequest
  ): Promise<any> {
    const response = await api.patch(`/merchants/${merchantId}/options/price`, priceData);
    return response.data;
  }

  static async updateOptionStatus(
    merchantId: string, 
    statusData: UpdateOptionStatusRequest
  ): Promise<any> {
    const response = await api.patch(`/merchants/${merchantId}/options/status`, statusData);
    return response.data;
  }

  // Image upload
  static async uploadImage(merchantId: string, imageFile: File): Promise<ImageUploadResponse> {
    const formData = new FormData();
    formData.append('image', imageFile);

    const response = await api.post(`/merchants/${merchantId}/image/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  // Health check
  static async healthCheck(): Promise<any> {
    const response = await api.get('/health');
    return response.data;
  }
}

export default api;