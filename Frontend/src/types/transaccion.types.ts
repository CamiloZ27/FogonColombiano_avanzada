export type EstadoTransaccion = 'completada' | 'pendiente' | 'fallida';

export type MetodoPago = 
  | 'tarjeta_credito' 
  | 'tarjeta_debito' 
  | 'transferencia' 
  | 'nequi' 
  | 'daviplata' 
  | 'efectivo';

// DTO para la petición enviada desde React
export interface CrearTransaccionConUsuarioDTO {
  // Datos del Usuario
  usuario_nombre: string;
  usuario_email: string;
  
  // Datos de la Transacción
  valor: number;
  fecha_txn: string;
  estado: EstadoTransaccion;
  metodo_pago?: MetodoPago;
  hash?: string;
}

// Estado local para el formulario en React
export interface FormTransaccionUsuarioState {
  usuario_nombre: string;
  usuario_email: string;
  valor: string;
  fecha_txn: string;
  estado: EstadoTransaccion;
  metodo_pago: MetodoPago;
  hash: string;
}

export interface MensajeEstado {
  texto: string;
  tipo: 'exito' | 'error' | '';
}