import { Router, Request, Response } from 'express';
import { ifoodApi } from '../services/ifood/ifoodApiService';
import { UpdateOptionPriceRequest, UpdateOptionStatusRequest } from '../types/IFood';

const router = Router({ mergeParams: true });

// PATCH /merchants/{merchantId}/options/price
router.patch('/price', async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;
    const priceData: UpdateOptionPriceRequest = req.body;
    
    console.log(`Updating option price for merchant: ${merchantId}`, {
      optionId: priceData.optionId,
      price: priceData.price
    });
    
    const result = await ifoodApi.patch(
      'catalog',
      `/merchants/${merchantId}/options/price`,
      priceData
    );
    
    res.json(result);
  } catch (error: any) {
    console.error('Error updating option price:', error.message);
    res.status(500).json({
      error: 'Failed to update option price',
      message: error.message
    });
  }
});

// PATCH /merchants/{merchantId}/options/status
router.patch('/status', async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;
    const statusData: UpdateOptionStatusRequest = req.body;
    
    console.log(`Updating option status for merchant: ${merchantId}`, {
      optionId: statusData.optionId,
      status: statusData.status
    });
    
    const result = await ifoodApi.patch(
      'catalog',
      `/merchants/${merchantId}/options/status`,
      statusData
    );
    
    res.json(result);
  } catch (error: any) {
    console.error('Error updating option status:', error.message);
    res.status(500).json({
      error: 'Failed to update option status',
      message: error.message
    });
  }
});

export default router;