export interface Cliente {
  id: number;
  nombre: string;
  pedido: string[];
  llegada: string; // hora de llegada, formato HH:MM:SS
}