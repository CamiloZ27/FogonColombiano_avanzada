import { Pedido } from '../types/pedidos.types';

export function generarDatasetSimulado(cantidad: number): Pedido[] {
  const data: Pedido[] = [];
  for (let i = 1; i <= cantidad; i++) {
    data.push({
      id_pedido: i,
      cliente: `Cliente_${i}`,
      tipo: i % 2 === 0 ? 'Local' : 'Domicilio',
      cant_productos: Math.floor(Math.random() * 5) + 1,
      estado: 'Entregado'
    });
  }
  return data;
}
