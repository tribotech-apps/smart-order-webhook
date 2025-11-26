import { Router, Request, Response } from 'express';
import { ifoodApi } from '../services/ifood/ifoodApiService';
import { IFoodCategory, IFoodApiResponse, CreateCategoryRequest, CreateCategoryResponse, IFoodCategoryItemsResponse } from '../types/IFood';

const router = Router({ mergeParams: true });

// GET /merchants/{merchantId}/catalogs/{catalogId}/categories
router.get('/', async (req: Request, res: Response) => {
  try {
    const { merchantId, catalogId } = req.params;
    
    console.log(`Listing categories for merchant: ${merchantId}, catalog: ${catalogId}`);
    
    const categories: IFoodApiResponse<IFoodCategory[]> = await ifoodApi.get(
      'catalog',
      `/merchants/${merchantId}/catalogs/${catalogId}/categories`
    );
    
    res.json(categories);
  } catch (error: any) {
    console.error('Error listing categories:', error.message);
    res.status(500).json({
      error: 'Failed to list categories',
      message: error.message
    });
  }
});

// POST /merchants/{merchantId}/catalogs/{catalogId}/categories
router.post('/', async (req: Request, res: Response) => {
  try {
    const { merchantId, catalogId } = req.params;
    const categoryData: CreateCategoryRequest = req.body;
    
    console.log(`Creating category for merchant: ${merchantId}, catalog: ${catalogId}`, categoryData);
    
    const newCategory: CreateCategoryResponse = await ifoodApi.post(
      'catalog',
      `/merchants/${merchantId}/catalogs/${catalogId}/categories`,
      categoryData
    );
    
    res.status(201).json(newCategory);
  } catch (error: any) {
    console.error('Error creating category:', error.message);
    res.status(500).json({
      error: 'Failed to create category',
      message: error.message
    });
  }
});

// GET /merchants/{merchantId}/categories/{categoryId}/items
router.get('/:categoryId/items', async (req: Request, res: Response) => {
  try {
    const { merchantId, categoryId } = req.params;
    
    console.log(`Listing items for merchant: ${merchantId}, category: ${categoryId}`);
    
    const categoryItems: IFoodCategoryItemsResponse = await ifoodApi.get(
      'catalog',
      `/merchants/${merchantId}/categories/${categoryId}/items`
    );
    
    res.json(categoryItems);
  } catch (error: any) {
    console.error('Error listing category items:', error.message);
    res.status(500).json({
      error: 'Failed to list category items',
      message: error.message
    });
  }
});

export default router;