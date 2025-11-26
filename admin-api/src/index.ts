import express, { Request, Response } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes
import catalogRoutes from './routes/catalog';
import categoriesRoutes from './routes/categories';
import itemsRoutes from './routes/items';
import optionsRoutes from './routes/options';
import imageRoutes from './routes/images';

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
}));
app.use(express.json());
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());

// Routes for iFood catalog management
app.use('/api/merchants/:merchantId/catalogs', catalogRoutes);
app.use('/api/merchants/:merchantId/catalogs/:catalogId/categories', categoriesRoutes);
app.use('/api/merchants/:merchantId/categories', categoriesRoutes); // For items listing by category
app.use('/api/merchants/:merchantId/items', itemsRoutes);
app.use('/api/merchants/:merchantId/options', optionsRoutes);
app.use('/api/merchants/:merchantId/image', imageRoutes);

// Health Check Route
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'admin-api'
  });
});

// Test Route
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'iFood Admin API',
    version: '1.0.0',
    endpoints: [
      'GET /api/merchants/{merchantId}/catalogs',
      'GET /api/merchants/{merchantId}/catalogs/{catalogId}/categories',
      'POST /api/merchants/{merchantId}/catalogs/{catalogId}/categories',
      'GET /api/merchants/{merchantId}/categories/{categoryId}/items',
      'PUT /api/merchants/{merchantId}/items',
      'PATCH /api/merchants/{merchantId}/items/price',
      'PATCH /api/merchants/{merchantId}/items/status',
      'PATCH /api/merchants/{merchantId}/options/price',
      'PATCH /api/merchants/{merchantId}/options/status',
      'POST /api/merchants/{merchantId}/image/upload'
    ]
  });
});

// Global Error Handler
app.use((error: any, req: Request, res: Response, next: any) => {
  console.error('Global error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Admin API server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});