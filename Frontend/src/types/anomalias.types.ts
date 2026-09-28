export type Periodo = "day" | "week" | "month";

export type TipoAnomalia =
  | "multiples_transacciones"
  | "monto_atipico"
  | "frecuencia_alta"
  | "usuario_recurrente";

export type NivelAnomalia = "bajo" | "medio" | "alto" | "critico";

export type EstadoAnomalia = "abierta" | "revisada" | "descartada";

// Espejo exacto de ResumenGeneral en el backend (dashboard.repository.ts)
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

export interface CasoRecurrente {
  tipo: TipoAnomalia;
  total: number;
}

export interface UsuarioRecurrente {
  usuario_id: number;
  nombre: string;
  email: string;
  total_anomalias: number;
}

export interface NivelConteo {
  nivel: NivelAnomalia;
  total: number;
}

export interface PuntoTendencia {
  marca_tiempo: string; // ISO date string
  total: number;
}

export interface HoraConteo {
  hora: number; // 0-23
  total: number;
}

export interface MetodoPagoConteo {
  metodo_pago: string;
  total: number;
}

export interface AnomaliaReciente {
  id: number;
  tipo: TipoAnomalia;
  nivel: NivelAnomalia;
  estado: EstadoAnomalia;
  fecha_creacion: string;
  transaccion_id: number;
  valor: string;
  metodo_pago: string;
  usuario_id: number;
  nombre: string;
}

export interface LineaTiempoAnomalia {
  anomalia_id: number;
  tipo: TipoAnomalia;
  nivel: NivelAnomalia;
  estado: EstadoAnomalia;
  cantidad_transacciones: number;
  ventana_segundos: number;
  anomalia_fecha_creacion: string;
  transaccion_id: number;
  valor: string;
  metodo_pago: string;
  transaccion_estado: string;
  fecha_txn: string;
  usuario_id: number;
  nombre: string;
  email: string;
}

export interface TransaccionVentana {
  id: number;
  usuario_id: number;
  valor: string;
  fecha_txn: string;
  estado: string;
  metodo_pago: string;
}

export interface VentanaDeAnomalia {
  anomalia: { id: number; transaccion_id: number; ventana_segundos: number; cantidad_transacciones: number };
  transaccionDisparadora: TransaccionVentana;
  transaccionesEnVentana: TransaccionVentana[];
}
