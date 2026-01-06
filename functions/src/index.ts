import * as functions from 'firebase-functions';
import * as functionsV1 from 'firebase-functions/v1';

import express, { Request, Response } from 'express';
import cors from 'cors';
import logger from 'morgan';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import * as admin from 'firebase-admin';
import { diagnostics, diagnosticsMiddleware, DiagnosticCategory } from './services/diagnosticsService';

// Initialize Firebase Admin
try {
  admin.initializeApp();
  diagnostics.info('Firebase Admin initialized successfully', {
    category: DiagnosticCategory.AUTHENTICATION,
    action: 'firebase_init',
    details: { service: 'firebase-admin' }
  });

  // Test Firestore connection
  admin.firestore().settings({ ignoreUndefinedProperties: true });
  diagnostics.info('Firestore configured successfully', {
    category: DiagnosticCategory.DATABASE,
    action: 'firestore_config',
    details: { ignoreUndefinedProperties: true }
  });
} catch (error) {
  diagnostics.critical('Error initializing Firebase Admin', error, {
    category: DiagnosticCategory.AUTHENTICATION,
    action: 'firebase_init_error'
  });
}

import botsSellerRouter from './routes/bots/sellerFlows';
import paymentsRouter from './routes/bots/payments';
import botMessagesRouter from './routes/bots/messages';
import storeRouter from './routes/bots/store';
import notificationsRouter from './routes/bots/notifications';
import workflowRouter from './routes/bots/workflow';
import diagnosticsRouter from './routes/diagnostics';
import deviceTokensRouter from './routes/deviceTokens';

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(diagnosticsMiddleware); // Middleware de diagnósticos
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());

// Routes
app.use('/whatsapp/messages', botsSellerRouter);
app.use('/whatsapp/bot', botMessagesRouter);
app.use('/payments', paymentsRouter);
app.use('/stores', storeRouter);
app.use('/notifications', notificationsRouter);
app.use('/workflow', workflowRouter);
app.use('/diagnostics', diagnosticsRouter); // Nova rota de diagnósticos
app.use('/device-token', deviceTokensRouter);

// Health Check Route
app.get('/health', async (req: Request, res: Response) => {
  try {
    const healthReport = await diagnostics.generateHealthReport();
    diagnostics.info('Health check solicitado', {
      category: DiagnosticCategory.PERFORMANCE,
      action: 'health_check'
    });
    res.json(healthReport);
  } catch (error) {
    diagnostics.error('Erro no health check', error, {
      category: DiagnosticCategory.PERFORMANCE,
      action: 'health_check_error'
    });
    res.status(500).json({ error: 'Health check failed' });
  }
});

// Test Route
app.get('/', (req: Request, res: Response) => {
  diagnostics.info('Rota de teste acessada', {
    category: DiagnosticCategory.WEBHOOK,
    action: 'test_route'
  });
  res.send('Hello, World!');
});

// Global Error Handler
app.use((error: any, req: Request, res: Response, next: any) => {
  diagnostics.error('Erro global capturado', error, {
    category: DiagnosticCategory.WEBHOOK,
    action: 'global_error_handler',
    details: {
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent')
    }
  });

  res.status(500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Tente novamente mais tarde'
  });
});

// Export as Firebase Function with runtime options
exports.talkCommerceWhatsappWebhook = functions.https.onRequest({
  memory: '1GiB',
  timeoutSeconds: 540,
  minInstances: 1,
  maxInstances: 10,
  concurrency: 80
}, app);



export const deleteExpiredConversations = functionsV1.pubsub
  .schedule('1 0 * * *') // Agendamento para rodar todos os dias às 00:00:01
  .timeZone('America/Sao_Paulo')
  .onRun(async (context) => {
    const now = new Date();
    const minutesAgo = new Date(now.getTime() - 10 * 60 * 1000); // 5 minutos atrás

    // Define o início e fim do dia anterior
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0); // Início do dia de ontem

    const endOfYesterday = new Date(yesterday);
    endOfYesterday.setHours(23, 59, 59, 999); // Final do dia de ontem

    const db = admin.firestore();

    try {
      const conversationsRef = db.collection('Conversations');
      const querySnapshot = await conversationsRef
        .where('date', '>=', yesterday) // Conversas de ontem
        .where('date', '<=', endOfYesterday) // Até o final de ontem
        .where('date', '<=', minutesAgo) // Com mais de 5 minutos de idle
        .get();

      if (querySnapshot.empty) {
        console.log('Nenhuma conversa de ontem com idle > 5 minutos encontrada.');
        return null;
      }

      // Apagar cada documento encontrado
      const batch = db.batch();
      querySnapshot.forEach((doc: { ref: any; }) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      console.log(`${querySnapshot.size} conversas de ontem com idle > 5 min foram apagadas.`);
    } catch (error) {
      console.error('Erro ao apagar conversas antigas:', error);
    }

    return null;
  });

// // Export alert processor function
// export { processOrderAlert } from './processOrderAlert';

// Export overdue orders checker function
// export { checkOverdueOrders } from './checkOverdueOrders';
