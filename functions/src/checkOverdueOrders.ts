import * as functions from 'firebase-functions';
import { OverdueOrdersChecker } from './services/overdueOrdersChecker';

/**
 * Cloud Function que é executada a cada minuto via Cloud Scheduler
 * para verificar pedidos em atraso e enviar alertas via WhatsApp
 */
export const checkOverdueOrders = functions.https.onRequest(async (req, res) => {
  console.log(`🕐 [SCHEDULER] checkOverdueOrders triggered at ${new Date().toISOString()}`);
  
  try {
    // Verificar se é uma chamada do Cloud Scheduler
    const userAgent = req.get('User-Agent');
    const authHeader = req.get('Authorization');
    
    console.log(`📋 [SCHEDULER] Request details:`);
    console.log(`   - Method: ${req.method}`);
    console.log(`   - User-Agent: ${userAgent}`);
    console.log(`   - Has Authorization: ${!!authHeader}`);
    
    // Permitir chamadas do Cloud Scheduler ou para testes locais
    const isCloudScheduler = userAgent?.includes('Google-Cloud-Scheduler') || 
                            authHeader?.includes('Bearer') ||
                            req.method === 'GET'; // Para testes manuais
    
    if (!isCloudScheduler && process.env.NODE_ENV === 'production') {
      console.log(`🚫 [SCHEDULER] Unauthorized request rejected`);
      res.status(401).send('Unauthorized');
      return;
    }

    console.log(`✅ [SCHEDULER] Request authorized, starting overdue check`);
    
    // Executar verificação de pedidos em atraso
    await OverdueOrdersChecker.checkOverdueOrders();
    
    console.log(`✅ [SCHEDULER] Overdue orders check completed successfully`);
    res.status(200).json({ 
      success: true, 
      message: 'Overdue orders check completed',
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error(`💥 [SCHEDULER] Error during overdue check:`, error);
    console.error(`💥 [SCHEDULER] Error details:`, {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});