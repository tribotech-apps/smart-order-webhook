import { Router, Request, Response } from 'express';
import { ifoodApi } from '../services/ifood/ifoodApiService';
import { CreateCompleteItemRequest, UpdateItemPriceRequest, UpdateItemStatusRequest } from '../types/IFood';

const router = Router({ mergeParams: true });

// PUT /merchants/{merchantId}/items - Create/Edit Complete Item
router.put('/', async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;
    const completeItemData: CreateCompleteItemRequest = req.body;
    
    console.log(`Creating/updating complete item for merchant: ${merchantId}`, {
      itemId: completeItemData.item?.id,
      productsCount: completeItemData.products?.length || 0,
      optionGroupsCount: completeItemData.optionGroups?.length || 0,
      optionsCount: completeItemData.options?.length || 0
    });
    
    const result = await ifoodApi.put(
      'catalog',
      `/merchants/${merchantId}/items`,
      completeItemData
    );
    
    res.json(result);
  } catch (error: any) {
    console.error('Error creating/updating complete item:', error.message);
    res.status(500).json({
      error: 'Failed to create/update complete item',
      message: error.message
    });
  }
});

// PATCH /merchants/{merchantId}/items/price
router.patch('/price', async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;
    const priceData: UpdateItemPriceRequest = req.body;
    
    console.log(`Updating item price for merchant: ${merchantId}`, {
      itemId: priceData.itemId,
      price: priceData.price
    });
    
    const result = await ifoodApi.patch(
      'catalog',
      `/merchants/${merchantId}/items/price`,
      priceData
    );
    
    res.json(result);
  } catch (error: any) {
    console.error('Error updating item price:', error.message);
    res.status(500).json({
      error: 'Failed to update item price',
      message: error.message
    });
  }
});

// PATCH /merchants/{merchantId}/items/status
router.patch('/status', async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;
    const statusData: UpdateItemStatusRequest = req.body;
    
    console.log(`Updating item status for merchant: ${merchantId}`, {
      itemId: statusData.itemId,
      status: statusData.status
    });
    
    const result = await ifoodApi.patch(
      'catalog',
      `/merchants/${merchantId}/items/status`,
      statusData
    );
    
    res.json(result);
  } catch (error: any) {
    console.error('Error updating item status:', error.message);
    res.status(500).json({
      error: 'Failed to update item status',
      message: error.message
    });
  }
});

export default router;