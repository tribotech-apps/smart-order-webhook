import { Router } from 'express';
import { insertStore } from '../../controllers/storeController';

const router: Router = Router();

// Iniciar fluxo de vendas
router.post('/insertSampleStore', insertStore);

export default router;
