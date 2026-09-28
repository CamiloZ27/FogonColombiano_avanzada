export type TipoPedido = 'Local' | 'Domicilio';
export type EstadoPedido = 'Solicitado' | 'En Proceso' | 'Entregado';

export interface Pedido {
  id_pedido: number;
  cliente: string;
  tipo: TipoPedido;
  cant_productos: number;
  estado: EstadoPedido;
}

