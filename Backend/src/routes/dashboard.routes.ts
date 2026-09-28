import { Router, Request, Response } from 'express';
import {
  obtenerResumenGeneral,
  obtenerCasosMasRecurrentes,
  obtenerUsuariosRecurrentes,
  obtenerAnomaliasPorNivel,
  obtenerTendenciaTemporal,
  obtenerDistribucionPorHora,
  obtenerDistribucionMetodoPago,
  obtenerAnomaliasRecientes,
  obtenerLineaDeTiempoAnomalia,
  actualizarEstadoAnomalia,
} from '../repositories/dashboard.repository';
import { obtenerVentanaDeAnomalia } from '../repositories/slidingWindow.repository';
import { Periodo, EstadoAnomalia } from '../types/anomalias.types';

export const dashboardRouter = Router();

const PERIODOS_VALIDOS: Periodo[] = ['day', 'week', 'month'];
const ESTADOS_VALIDOS: EstadoAnomalia[] = ['abierta', 'revisada', 'descartada'];

/**
 * Lee ?periodo= de la query string y lo valida. Si falta o es inválido,
 * responde el error directamente y devuelve null para que el handler corte.
 */
function leerPeriodo(req: Request, res: Response): Periodo | null {
  const periodo = (req.query.periodo as string) ?? 'day';
  if (!PERIODOS_VALIDOS.includes(periodo as Periodo)) {
    res.status(400).json({ error: `periodo inválido: ${periodo}. Usa day | week | month.` });
    return null;
  }
  return periodo as Periodo;
}

function leerLimite(req: Request, valorPorDefecto: number): number {
  const limite = Number(req.query.limite);
  return Number.isFinite(limite) && limite > 0 ? limite : valorPorDefecto;
}

/** Envuelve un handler async para no repetir try/catch en cada ruta. */
function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => {
    fn(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Error interno consultando el dashboard de anomalías' });
    });
  };
}

dashboardRouter.get(
  '/resumen',
  asyncHandler(async (req, res) => {
    const periodo = leerPeriodo(req, res);
    if (!periodo) return;
    res.json(await obtenerResumenGeneral(periodo));
  })
);

dashboardRouter.get(
  '/casos-recurrentes',
  asyncHandler(async (req, res) => {
    const periodo = leerPeriodo(req, res);
    if (!periodo) return;
    res.json(await obtenerCasosMasRecurrentes(periodo, leerLimite(req, 5)));
  })
);

dashboardRouter.get(
  '/usuarios-recurrentes',
  asyncHandler(async (req, res) => {
    const periodo = leerPeriodo(req, res);
    if (!periodo) return;
    res.json(await obtenerUsuariosRecurrentes(periodo, leerLimite(req, 5)));
  })
);

dashboardRouter.get(
  '/niveles',
  asyncHandler(async (req, res) => {
    const periodo = leerPeriodo(req, res);
    if (!periodo) return;
    res.json(await obtenerAnomaliasPorNivel(periodo));
  })
);

dashboardRouter.get(
  '/tendencia',
  asyncHandler(async (req, res) => {
    const periodo = leerPeriodo(req, res);
    if (!periodo) return;
    res.json(await obtenerTendenciaTemporal(periodo));
  })
);

dashboardRouter.get(
  '/distribucion-hora',
  asyncHandler(async (req, res) => {
    const periodo = leerPeriodo(req, res);
    if (!periodo) return;
    res.json(await obtenerDistribucionPorHora(periodo));
  })
);

dashboardRouter.get(
  '/metodos-pago',
  asyncHandler(async (req, res) => {
    const periodo = leerPeriodo(req, res);
    if (!periodo) return;
    res.json(await obtenerDistribucionMetodoPago(periodo));
  })
);

dashboardRouter.get(
  '/recientes',
  asyncHandler(async (req, res) => {
    const periodo = leerPeriodo(req, res);
    if (!periodo) return;
    res.json(await obtenerAnomaliasRecientes(periodo, leerLimite(req, 20)));
  })
);

dashboardRouter.get(
  '/anomalia/:id/timeline',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'id inválido' });
      return;
    }
    const resultado = await obtenerLineaDeTiempoAnomalia(id);
    if (!resultado) {
      res.status(404).json({ error: `Anomalía ${id} no encontrada` });
      return;
    }
    res.json(resultado);
  })
);

dashboardRouter.get(
  '/anomalia/:id/ventana',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'id inválido' });
      return;
    }
    res.json(await obtenerVentanaDeAnomalia(id));
  })
);

dashboardRouter.patch(
  '/anomalia/:id/estado',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const estado = req.body?.estado as EstadoAnomalia;
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'id inválido' });
      return;
    }
    if (!ESTADOS_VALIDOS.includes(estado)) {
      res.status(400).json({ error: `estado inválido: ${estado}. Usa abierta | revisada | descartada.` });
      return;
    }
    const actualizado = await actualizarEstadoAnomalia(id, estado);
    if (!actualizado) {
      res.status(404).json({ error: `Anomalía ${id} no encontrada` });
      return;
    }
    res.json(actualizado);
  })
);
