import { Router, Request, Response } from 'express';
import { notificationService } from '../services/notificationService';
import { diagnostics, DiagnosticCategory } from '../services/diagnosticsService';

const router = Router();

// Device Token Registration Route
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, storeId, platform } = req.body;
    
    if (!token || !storeId || !platform) {
      res.status(400).json({ 
        error: 'Missing required fields: token, storeId, platform' 
      });
      return;
    }

    if (!['ios', 'android', 'web'].includes(platform)) {
      res.status(400).json({ 
        error: 'Platform must be ios, android, or web' 
      });
      return;
    }

    // Registro do token usando o NotificationService
    await notificationService.registerDeviceToken(token, storeId, platform);

    diagnostics.info('Device token registered', {
      category: DiagnosticCategory.AUTHENTICATION,
      action: 'device_token_register',
      details: { storeId, platform }
    });

    res.json({ success: true, message: 'Device token registered successfully' });
  } catch (error) {
    diagnostics.error('Error registering device token', error, {
      category: DiagnosticCategory.AUTHENTICATION,
      action: 'device_token_register_error'
    });
    res.status(500).json({ error: 'Failed to register device token' });
  }
});

// Device Token Unregistration Route
router.delete('/:token', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    
    if (!token) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }

    // Remoção do token usando o NotificationService
    await notificationService.unregisterDeviceToken(token);

    diagnostics.info('Device token unregistered', {
      category: DiagnosticCategory.AUTHENTICATION,
      action: 'device_token_unregister',
      details: { token: token.substring(0, 10) + '...' }
    });

    res.json({ success: true, message: 'Device token unregistered successfully' });
  } catch (error) {
    diagnostics.error('Error unregistering device token', error, {
      category: DiagnosticCategory.AUTHENTICATION,
      action: 'device_token_unregister_error'
    });
    res.status(500).json({ error: 'Failed to unregister device token' });
  }
});

export default router;