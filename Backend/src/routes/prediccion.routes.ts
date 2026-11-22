import { Router, Request, Response } from 'express';
import { autenticarJWT, requerirPermiso } from '../middleware/auth.middleware';
import { obtenerSeriesDiarias, obtenerResumenVentas } from '../repositories/prediccion.repository';
import { entrenarYPredecirDemandaKeras } from '../services/iaKeras.service';

export const prediccionRouter = Router();

prediccionRouter.use(autenticarJWT, requerirPermiso('ia:ver'));

function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => {
    fn(req, res).catch((err) => {
      console.error('[prediccion]', err);
      res.status(500).json({ error: 'Error consultando datos de predicción' });
    });
  };
}

/**
 * GET /api/prediccion/series-diarias?dias=90
 */
prediccionRouter.get(
  '/series-diarias',
  asyncHandler(async (req, res) => {
    const dias = Math.min(Math.max(Number(req.query.dias) || 90, 14), 365);
    const serie = await obtenerSeriesDiarias(dias);
    res.json(serie);
  })
);

/**
 * GET /api/prediccion/resumen
 */
prediccionRouter.get(
  '/resumen',
  asyncHandler(async (_req, res) => {
    const resumen = await obtenerResumenVentas();
    res.json(resumen);
  })
);

/**
 * GET /api/prediccion/predecir?dias=90&epochs=45
 * Entrena/predice ventas y demanda con Keras/TensorFlow unificado en el backend Node/TS.
 */
prediccionRouter.get(
  '/predecir',
  asyncHandler(async (req, res) => {
    const dias = Math.min(Math.max(Number(req.query.dias) || 90, 21), 365);
    const epochs = Math.min(Math.max(Number(req.query.epochs || req.query.max_iter) || 40, 15), 80);
    const resultado = await entrenarYPredecirDemandaKeras(dias, epochs, 14);
    res.json(resultado);
  })
);
