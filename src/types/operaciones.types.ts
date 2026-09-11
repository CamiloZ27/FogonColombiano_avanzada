import { Cola } from "../structures/cola.structure";
import { Pila } from "../structures/pila.structure";
import { Cliente } from "./clientes.types";

export type TipoOperacion = "cliente_agregado" | "cliente_atendido" | "ruta_calculada";

export type Vista = "cola" | "operaciones" | "rutas";

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