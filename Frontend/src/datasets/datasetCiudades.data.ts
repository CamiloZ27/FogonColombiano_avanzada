import { Grafo } from "../structures/grafo.structure";

/**
 * Red de ciudades que cubre Fogon Colombiano con sus entregas.
 * Las distancias son aproximadas, en kilómetros por carretera.
 */
export function ConstruirGrafoCiudades(): Grafo {
  const graph = new Grafo();

  graph.addEdge("Medellín", "Bogotá", 415);
  graph.addEdge("Medellín", "Pereira", 140);
  graph.addEdge("Medellín", "Cartagena", 640);
  graph.addEdge("Bogotá", "Bucaramanga", 380);
  graph.addEdge("Bogotá", "Cali", 460);
  graph.addEdge("Pereira", "Cali", 190);
  graph.addEdge("Bucaramanga", "Cartagena", 560);

  return graph;
}

export const CITY_NAMES = [
  "Medellín",
  "Bogotá",
  "Pereira",
  "Cartagena",
  "Bucaramanga",
  "Cali",
];
