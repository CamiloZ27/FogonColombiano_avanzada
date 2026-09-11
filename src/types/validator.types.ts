import { Pedido } from "./pedidos.types";

export interface DatoInvalido {
  item: any;
  motivo: string;
}

export interface ReporteValidacion {
  total: number;
  validos: Pedido[];
  invalidos: DatoInvalido[];
}
