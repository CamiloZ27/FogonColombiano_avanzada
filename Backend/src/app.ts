import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth.routes';
import { adminRouter } from './routes/admin.routes';
import { operacionRouter } from './routes/operacion.routes';
import { analiticaRouter } from './routes/analiticaAvanzada.routes';
import { dashboardRouter } from './routes/dashboard.routes';
import transaccionesRoutes from './routes/transacciones.routes';
import { prediccionRouter } from './routes/prediccion.routes';

export const app = express();

// 1. Configuración de CORS unificada con soporte Bearer Token
app.use(
  cors({
    origin: '*',
    allowedHeaders: ['Content-Type', 'x-api-token', 'authorization', 'Authorization'],
  })
);

// 2. Middlewares de parseo (límite ampliado a 5MB para comprobantes de pago)
app.use(express.json({ strict: false, limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// 3. Healthcheck público
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    sistema: 'Fogón Colombiano — Plataforma Integral',
    seguridad: 'bcrypt + JWT Bearer + RBAC Inmutable',
    ia: 'Simple Statistics + TensorFlow.js/Keras',
    timestamp: new Date().toISOString(),
  });
});

// 4. Rutas Unificadas
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/operacion', operacionRouter);
app.use('/api/analitica', analiticaRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/transacciones', transaccionesRoutes);
app.use('/api/prediccion', prediccionRouter);
