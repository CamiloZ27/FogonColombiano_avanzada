export type Periodo = 'day' | 'week' | 'month';

export type TipoAnomalia =
  | 'multiples_transacciones'
  | 'monto_atipico'
  | 'frecuencia_alta'
  | 'usuario_recurrente';

export type NivelAnomalia = 'bajo' | 'medio' | 'alto' | 'critico';

export type EstadoAnomalia = 'abierta' | 'revisada' | 'descartada';

export interface Transaccion {
  id: number;
  usuario_id: number;
  valor: string; // numeric de Postgres llega como string
  fecha_txn: Date;
  estado: string;
  hash: string;
  metodo_pago: string;
  fecha_creacion: Date;
  fecha_actualizacion: Date;
}

export interface Anomalia {
  id: number;
  transaccion_id: number;
  tipo: TipoAnomalia;
  nivel: NivelAnomalia;
  cantidad_transacciones: number;
  ventana_segundos: number;
  estado: EstadoAnomalia;
  fecha_creacion: Date;
  fecha_actualizacion: Date;
}

export interface ResultadoDeteccion {
  esAnomalia: boolean;
  tipo?: TipoAnomalia;
  nivel?: NivelAnomalia;
  cantidadTransacciones: number;
  ventanaSegundos: number;
  detalle: {
    promedioHistorico: number | null;
    desviacionHistorica: number | null;
    valorActual: number;
  };
}

export interface ResumenGeneral {
  totalTransacciones: number;
  totalAnomalias: number;
  porcentajeAnomalias: number;
  usuariosAfectados: number;
  valorTotalSospechoso: number;
  promedioTransaccionesPorUsuario: number;
  anomaliasNuevas: number;
  anomaliasAbiertas: number;
  anomaliasRevisadas: number;
  anomaliasDescartadas: number;
}
