import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import routes from './routes';
import webhookRoutes from './routes/webhookRoutes';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { errorHandler } from './middlewares/errorHandler';
import { verifyPayment } from './controllers/paymentController';

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || true }));
app.use(morgan('dev'));

// capture the raw body for webhook signature verification
app.use(
  express.json({
    limit: '2mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

const limiter = rateLimit({ windowMs: 60 * 1000, max: 100 });
app.use(limiter);

app.use('/api', routes);
app.use('/webhook', webhookRoutes);
app.get('/verify-payment', verifyPayment);

app.get('/health', (req, res) => res.json({ ok: true }));

app.use(errorHandler as any);

export default app;
