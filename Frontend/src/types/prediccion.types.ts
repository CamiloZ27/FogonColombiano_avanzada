/** Punto de la serie temporal que viene del backend */
export interface PuntoSerie {
  fecha: string;   // 'YYYY-MM-DD'
  total: number;
  cantidad: number;
}

/** Punto de predicción generado por la RN en el frontend */
export interface PuntoPrediccion {
  fecha: string;   // 'YYYY-MM-DD'
  total: number;
  esPrediccion: true;
}

/** Punto unificado para la gráfica (histórico + predicción) */
export type PuntoGrafica =
  | (PuntoSerie & { esPrediccion?: false })
  | PuntoPrediccion;

/** Estado del proceso de entrenamiento */
export type EstadoEntrenamiento =
  | 'idle'
  | 'cargando'
  | 'entrenando'
  | 'listo'
  | 'error';

export interface ResumenVentas {
  totalHistorico: number;
  promedioSemanal: number;
  mejorDia: { fecha: string; total: number } | null;
  transaccionesUltimos30: number;
}

