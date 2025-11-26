import { Router, Request, Response } from 'express';
import { ifoodApi } from '../services/ifood/ifoodApiService';
import { IFoodCatalog, IFoodApiResponse } from '../types/IFood';

const router = Router({ mergeParams: true });

// GET /merchants/{merchantId}/catalogs
router.get('/', async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;
    
    console.log(`Listing catalogs for merchant: ${merchantId}`);
    
    const catalogs: IFoodApiResponse<IFoodCatalog[]> = await ifoodApi.get(
      'catalog',
      `/merchants/${merchantId}/catalogs`
    );
    
    res.json(catalogs);
  } catch (error: any) {
    console.error('Error listing catalogs:', error.message);
    res.status(500).json({
      error: 'Failed to list catalogs',
      message: error.message
    });
  }
});

export default router;