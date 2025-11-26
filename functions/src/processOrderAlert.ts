import * as functions from 'firebase-functions';
import { OrderAlertScheduler } from './services/orderAlertScheduler';

/**
 * Cloud Function que processa alertas agendados pelo Cloud Tasks
 */
export const processOrderAlert = functions.https.onRequest(async (req, res) => {
  try {
    console.log('🔔 Processing order alert:', req.body);
    
    const { type, orderId, stageId, storeId } = req.body;
    
    if (!type || !orderId || !stageId || !storeId) {
      console.error('❌ Missing required parameters:', { type, orderId, stageId, storeId });
      res.status(400).send('Missing required parameters');
      return;
    }
    
    if (type === 'warning') {
      await OrderAlertScheduler.sendWarningAlert(orderId, stageId, storeId);
      console.log(`✅ Warning alert sent for order ${orderId}`);
    } else if (type === 'overdue') {
      await OrderAlertScheduler.sendOverdueAlert(orderId, stageId, storeId);
      console.log(`✅ Overdue alert sent for order ${orderId}`);
    } else {
      console.error('❌ Invalid alert type:', type);
      res.status(400).send('Invalid alert type');
      return;
    }
    
    res.status(200).send('Alert processed successfully');
    
  } catch (error) {
    console.error('💥 Error processing order alert:', error);
    res.status(500).send('Internal server error');
  }
});