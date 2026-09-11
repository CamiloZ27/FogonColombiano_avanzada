import { Pedido } from '../types/pedidos.types';

export function buscarConstante(pedidos: Pedido[], indice: number) {
  const inicio = performance.now();
  let operaciones = 1;

  const pedido = pedidos[indice];

  if (!pedido) {
    return { pedido: null, operaciones, tiempo: performance.now() - inicio };
  }

  return { pedido, operaciones, tiempo: performance.now() - inicio };
}

export function buscarLineal(pedidos: Pedido[], idBuscar: number) {
  const inicio = performance.now();
  let operaciones = 0;

  for (let i = 0; i < pedidos.length; i++) {
    operaciones++;
    const pedidoActual = pedidos[i];

    if (pedidoActual && pedidoActual.id_pedido === idBuscar) {
      return { pedido: pedidoActual, operaciones, tiempo: performance.now() - inicio };
    }
  }

  return { pedido: null, operaciones, tiempo: performance.now() - inicio };
}

export function buscarBinaria(pedidos: Pedido[], idBuscar: number) {
  if (!pedidos || pedidos.length === 0) return { pedido: null, operaciones: 0, tiempo: 0 };

  let operaciones = 0;
  let izq = 0;
  let der = pedidos.length - 1;
  const inicio = performance.now();

  while (izq <= der) {
    operaciones++;
    const medio = Math.floor((izq + der) / 2);

    const pedidoActual = pedidos[medio];
    if (!pedidoActual) break;

    if (pedidoActual.id_pedido === idBuscar) {
      return { pedido: pedidoActual, operaciones, tiempo: performance.now() - inicio };
    } else if (pedidoActual.id_pedido < idBuscar) {
      izq = medio + 1;
    } else {
      der = medio - 1;
    }
  }
  return { pedido: null, operaciones, tiempo: performance.now() - inicio };
}

export function sumarProductos(pedidos: Pedido[], indice: number = 0): number {
  if (!pedidos || pedidos.length === 0) return 0;
  if (indice >= pedidos.length) return 0;

  const pedidoActual = pedidos[indice];
  if (!pedidoActual) return 0;

  return pedidoActual.cant_productos + sumarProductos(pedidos, indice + 1);
}

export function regresionLineal(diasHistoricos: number[], ventasHistoricas: number[], diaAPredecir: number): number {
  if (!diasHistoricos || !ventasHistoricas) throw new Error("Los arreglos de datos no pueden ser nulos.");
  if (diasHistoricos.length === 0) return 0;
  if (diasHistoricos.length !== ventasHistoricas.length) {
    throw new Error("Discrepancia de datos: Los días y las ventas deben tener la misma longitud.");
  }

  const n = diasHistoricos.length;
  const sumX = diasHistoricos.reduce((a, b) => a + b, 0);
  const sumY = ventasHistoricas.reduce((a, b) => a + b, 0);

  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    const dia = diasHistoricos[i] ?? 0;
    const venta = ventasHistoricas[i] ?? 0;

    sumXY += dia * venta;
    sumXX += dia ** 2;
  }

  const divisor = (n * sumXX - sumX ** 2);
  if (divisor === 0) throw new Error("No hay suficiente varianza en los días para calcular la regresión.");

  const m = (n * sumXY - sumX * sumY) / divisor;
  const b = (sumY - m * sumX) / n;

  return m * diaAPredecir + b;
}

export function calcularSemanaFidelizacion(metaProductos: number, a1: number, d: number): number {
  // Fórmula: an = a1 + (n - 1)d
  // Despejamos n: n = ((an - a1) / d) + 1
  const n = ((metaProductos - a1) / d) + 1;
  return Math.floor(n);
}