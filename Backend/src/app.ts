import express from 'express';
import cors from 'cors';
import { dashboardRouter } from './routes/dashboard.routes';
import transaccionesRoutes from './routes/transacciones.routes';

export const app = express();

// 1. Configuración de CORS
app.use(cors({
  origin: '*',
  allowedHeaders: ['Content-Type', 'x-api-token', 'authorization']
}));

// 2. Middlewares para parsear el cuerpo de la petición (DEBEN IR ANTES DE LAS RUTAS)
app.use(express.json({ strict: false }));
app.use(express.urlencoded({ extended: true }));

// 3. Definición de Rutas
app.use('/api/dashboard', dashboardRouter);
app.use('/api/transacciones', transaccionesRoutes);