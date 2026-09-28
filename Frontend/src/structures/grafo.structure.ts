/**
 * Grafo no dirigido y ponderado, representado como lista de adyacencia.
 * Cada arista guarda la distancia en kilómetros entre dos ciudades.
 */

import { DijkstraResult, Edge } from "../types/operaciones.types";

export class Grafo {
  private adjacency = new Map<string, Edge[]>();

  /** Registra un nodo (ciudad) aunque todavía no tenga conexiones. */
  addNode(node: string): void {
    if (!this.adjacency.has(node)) {
      this.adjacency.set(node, []);
    }
  }

  /** Conecta dos ciudades con una distancia en km (la conexión es bidireccional). */
  addEdge(a: string, b: string, km: number): void {
    this.addNode(a);
    this.addNode(b);
    this.adjacency.get(a)!.push({ to: b, km });
    this.adjacency.get(b)!.push({ to: a, km });
  }

  get nodes(): string[] {
    return [...this.adjacency.keys()];
  }

  neighbors(node: string): Edge[] {
    return this.adjacency.get(node) ?? [];
  }

  /**
   * Algoritmo de Dijkstra: calcula la distancia más corta desde `start`
   * hacia todas las demás ciudades del grafo.
   */
  dijkstra(start: string): DijkstraResult {
    const distances = new Map<string, number>();
    const previous = new Map<string, string | null>();
    const visited = new Set<string>();

    for (const node of this.nodes) {
      distances.set(node, Infinity);
      previous.set(node, null);
    }
    distances.set(start, 0);

    // Cola de prioridad simple: el grafo es pequeño, un arreglo basta.
    const pending = new Set(this.nodes);

    while (pending.size > 0) {
      let current: string | null = null;
      let currentDist = Infinity;
      for (const node of pending) {
        const d = distances.get(node)!;
        if (d < currentDist) {
          currentDist = d;
          current = node;
        }
      }

      if (current === null || currentDist === Infinity) break;

      pending.delete(current);
      visited.add(current);

      for (const edge of this.neighbors(current)) {
        if (visited.has(edge.to)) continue;
        const candidate = currentDist + edge.km;
        if (candidate < distances.get(edge.to)!) {
          distances.set(edge.to, candidate);
          previous.set(edge.to, current);
        }
      }
    }

    return { distances, previous };
  }

  /** Reconstruye la ruta más corta entre `start` y `end`, si existe. */
  shortestPath(start: string, end: string): { path: string[]; km: number } | null {
    const { distances, previous } = this.dijkstra(start);
    const totalKm = distances.get(end);

    if (totalKm === undefined || totalKm === Infinity) {
      return null;
    }

    const path: string[] = [];
    let step: string | null = end;
    while (step !== null) {
      path.unshift(step);
      step = previous.get(step) ?? null;
    }

    return { path, km: totalKm };
  }
}
