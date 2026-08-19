import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import productRoutes from './routes/productRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import serviceRoutes from './routes/serviceRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import statsRoutes from './routes/statsRoutes.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import promoRoutes from './routes/promoRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import courseRoutes from './routes/courseRoutes.js';
import storyRoutes from './routes/storyRoutes.js';
import lookbookRoutes from './routes/lookbookRoutes.js';
import mediaRoutes from './routes/mediaRoutes.js';
import faqRoutes from './routes/faqRoutes.js';
import settingRoutes from './routes/settingRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { globalLimiter } from './middlewares/rateLimitMiddleware.js';

const app = express();

// Security HTTP Headers
app.use(helmet());

// Apply global rate limiting to all requests
app.use(globalLimiter);

// CORS configuration
const allowedOrigins = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
  : ['http://localhost:3000', 'http://localhost:80'];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Default body parser limit
app.use(express.json({ limit: '2mb' }));

// Serve uploaded files statically
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

// Health check
app.get('/', (req, res) => {
  res.send('Toto Barbershop Secure API is running');
});

// API Routes
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/promo', promoRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/lookbooks', lookbookRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/faqs', faqRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/messages', messageRoutes);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

export { app };

const PORT = process.env.PORT || 5000;
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`🔒 Server is running securely on port ${PORT}`);
  });
}
