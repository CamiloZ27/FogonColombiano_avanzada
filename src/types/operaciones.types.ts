import { Cola } from "../structures/cola.structure";
import { Pila } from "../structures/pila.structure";
import { Cliente } from "./clientes.types";

import { Pedido } from "./pedidos.types";

export type TipoOperacion =
  | "cliente_agregado"
  | "cliente_atendido"
  | "ruta_calculada"
  | "busqueda_pedido";

export type Vista = "cola" | "operaciones" | "rutas" | "busqueda";

export interface Edge {
  to: string;
  km: number;
}

export interface DijkstraResult {
  /** Distancia mínima desde el origen a cada nodo alcanzable. */
  distances: Map<string, number>;
  /** Nodo previo en el camino más corto, para reconstruir la ruta. */
  previous: Map<string, string | null>;
}

export interface LogOperaciones {
  id: number;
  tipo: TipoOperacion;
  detalle: string;
  hora: string;
}

export interface PropsColas {
  queue: Cola<Cliente>;
  nextId: number;
  onNextIdChange: (id: number) => void;
  onLog: (log: Omit<LogOperaciones, "id" | "hora">) => void;
  refreshTick: number;
  bumpTick: () => void;
}

export interface PropsPilas {
  stack: Pila<LogOperaciones>;
  refreshTick: number;
}

export interface PasoTraza {
  paso: number;
  descripcion: string;
  rango?: [number, number];
  indiceEvaluado?: number;
}

export interface MetricaBusqueda {
  nombre: string;
  notacion: string;
  operaciones: number;
  tiempoMs: number;
  encontrado: boolean;
  complejidadTeorica: {
    mejor: string;
    promedio: string;
    peor: string;
    espacio: string;
  };
  explicacion: string;
  trazas: PasoTraza[];
}

export interface ComparativaBigOResult {
  idBuscado: number;
  totalElementos: number;
  pedido: Pedido | null;
  metricaConstante: MetricaBusqueda;
  metricaBinaria: MetricaBusqueda;
  metricaLineal: MetricaBusqueda;
}

export interface PropsBusqueda {
  onLog: (log: Omit<LogOperaciones, "id" | "hora">) => void;
}
