export type EstadoTransaccion = 'completada' | 'pendiente' | 'fallida';

export type MetodoPago = 
  | 'tarjeta_credito' 
  | 'tarjeta_debito' 
  | 'transferencia' 
  | 'nequi' 
  | 'daviplata' 
  | 'efectivo'
  | 'Tarjeta';

// DTO para la petición enviada desde React (Slide 40 y compatibilidad)
export interface CrearTransaccionConUsuarioDTO {
  // Formato Slide 40
  user?: string;
  date?: string;
  value?: number;
  paymentMethod?: string;
  idTxn?: number;

  // Formato con alias en español
  usuario_nombre?: string;
  usuario_email?: string;
  valor?: number;
  fecha_txn?: string;
  estado?: EstadoTransaccion;
  metodo_pago?: string;

  hash: string;
}

// Estado local para el formulario en React
export interface FormTransaccionUsuarioState {
  usuario_nombre: string;
  usuario_email: string;
  valor: string;
  fecha_txn: string;
  estado: EstadoTransaccion;
  metodo_pago: string;
  hash: string;
  alterarHash: boolean;
}

export interface MensajeEstado {
  texto: string;
  tipo: 'exito' | 'error' | 'alerta' | '';
  detalle?: string;
  anomalia?: {
    tipo: string;
    nivel: string;
    cantidad_transacciones: number;
    ventana_segundos: number;
  } | null;
}
