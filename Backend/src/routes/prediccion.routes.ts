import { Router, Request, Response } from 'express';
import { obtenerSeriesDiarias, obtenerResumenVentas } from '../repositories/prediccion.repository';

export const prediccionRouter = Router();

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
 * Devuelve la serie temporal de ventas día a día para entrenar la RN en el frontend.
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
 * Estadísticas rápidas de ventas (sin IA).
 */
prediccionRouter.get(
  '/resumen',
  asyncHandler(async (_req, res) => {
    const resumen = await obtenerResumenVentas();
    res.json(resumen);
  })
);

