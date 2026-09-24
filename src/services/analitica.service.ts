import { Pedido } from '../types/pedidos.types';
import { ComparativaBigOResult, MetricaBusqueda, PasoTraza } from '../types/operaciones.types';

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

export function analizarComparativaBigO(pedidos: Pedido[], idBuscar: number): ComparativaBigOResult {
  const total = pedidos.length;

  if (total === 0) {
    const metricaVacia = (nombre: string, notacion: string): MetricaBusqueda => ({
      nombre,
      notacion,
      operaciones: 0,
      tiempoMs: 0,
      encontrado: false,
      complejidadTeorica: { mejor: notacion, promedio: notacion, peor: notacion, espacio: "O(1)" },
      explicacion: "No hay elementos en el dataset.",
      trazas: []
    });

    return {
      idBuscado: idBuscar,
      totalElementos: 0,
      pedido: null,
      metricaConstante: metricaVacia("Acceso Directo por Hash Map", "O(1)"),
      metricaBinaria: metricaVacia("Búsqueda Binaria", "O(log n)"),
      metricaLineal: metricaVacia("Búsqueda Lineal", "O(n)")
    };
  }

  // 1. Preparar mapa Hash para O(1)
  const mapa = new Map<number, Pedido>();
  for (const p of pedidos) {
    mapa.set(p.id_pedido, p);
  }

  // 2. Preparar arreglo ordenado para O(log n)
  const pedidosOrdenados = [...pedidos].sort((a, b) => a.id_pedido - b.id_pedido);

  // --- Ejecutar O(1): Acceso Directo / Hash ---
  const inicioHash = performance.now();
  const pedidoHash = mapa.get(idBuscar) ?? null;
  const tiempoHash = performance.now() - inicioHash;

  const metricaConstante: MetricaBusqueda = {
    nombre: "Acceso Directo por Hash Map",
    notacion: "O(1)",
    operaciones: 1,
    tiempoMs: tiempoHash,
    encontrado: pedidoHash !== null,
    complejidadTeorica: {
      mejor: "O(1)",
      promedio: "O(1)",
      peor: "O(1)",
      espacio: "O(n) tabla hash"
    },
    explicacion: `Calcula directamente la posición de memoria a través de la función hash de la clave ${idBuscar}. Acceso instantáneo en tiempo constante.`,
    trazas: [
      {
        paso: 1,
        descripcion: `Lookup directo de clave hash ${idBuscar} en tabla de ${total} registros. Resultado: ${pedidoHash ? "Encontrado" : "No existe"}.`
      }
    ]
  };

  // --- Ejecutar O(log n): Búsqueda Binaria ---
  let izq = 0;
  let der = pedidosOrdenados.length - 1;
  let opsBin = 0;
  const trazasBin: PasoTraza[] = [];
  let pedidoBin: Pedido | null = null;
  const inicioBin = performance.now();

  while (izq <= der) {
    opsBin++;
    const medio = Math.floor((izq + der) / 2);
    const actual = pedidosOrdenados[medio];
    if (!actual) break;

    trazasBin.push({
      paso: opsBin,
      descripcion: `Paso ${opsBin}: Rango evaluado [índice ${izq} .. ${der}]. Centro índice ${medio} (ID: ${actual.id_pedido}).`,
      rango: [izq, der],
      indiceEvaluado: medio
    });

    if (actual.id_pedido === idBuscar) {
      pedidoBin = actual;
      break;
    } else if (actual.id_pedido < idBuscar) {
      izq = medio + 1;
    } else {
      der = medio - 1;
    }
  }
  const tiempoBin = performance.now() - inicioBin;
  const maxOpsBinEsperadas = Math.ceil(Math.log2(Math.max(total, 1))) + 1;

  const metricaBinaria: MetricaBusqueda = {
    nombre: "Búsqueda Binaria (Bisección)",
    notacion: "O(log n)",
    operaciones: opsBin,
    tiempoMs: tiempoBin,
    encontrado: pedidoBin !== null,
    complejidadTeorica: {
      mejor: "O(1) (si el centro coincide)",
      promedio: `O(log n) ≈ ${Math.ceil(Math.log2(Math.max(total, 2)))} ops`,
      peor: `O(log n) ≈ ${maxOpsBinEsperadas} ops`,
      espacio: "O(1) auxiliar (requiere orden previo)"
    },
    explicacion: `Divide recursivamente el espacio ordenado a la mitad en cada iteración. Para ${total} pedidos, solo requiere a lo sumo ⌈log₂(${total})⌉ = ${Math.ceil(Math.log2(Math.max(total, 2)))} comparaciones.`,
    trazas: trazasBin
  };

  // --- Ejecutar O(n): Búsqueda Lineal ---
  let opsLin = 0;
  let pedidoLin: Pedido | null = null;
  const trazasLin: PasoTraza[] = [];
  const inicioLin = performance.now();

  for (let i = 0; i < pedidos.length; i++) {
    opsLin++;
    const actual = pedidos[i];
    if (actual && actual.id_pedido === idBuscar) {
      pedidoLin = actual;
      if (trazasLin.length < 4 || i === pedidos.length - 1) {
        trazasLin.push({
          paso: opsLin,
          descripcion: `Índice ${i}: ¡ID ${actual.id_pedido} coincide con el objetivo! Deteniendo búsqueda.`,
          indiceEvaluado: i
        });
      }
      break;
    }
    if (i < 3) {
      trazasLin.push({
        paso: opsLin,
        descripcion: `Índice ${i}: ID ${actual?.id_pedido} ≠ ${idBuscar}. Avanzando al siguiente elemento...`,
        indiceEvaluado: i
      });
    }
  }
  const tiempoLin = performance.now() - inicioLin;

  if (opsLin > 4 && pedidoLin === null) {
    trazasLin.push({
      paso: opsLin,
      descripcion: `Se completaron los ${total} pasos secuenciales sin encontrar el ID ${idBuscar}.`
    });
  } else if (opsLin > 5 && pedidoLin !== null && trazasLin.length <= 4) {
    trazasLin.push({
      paso: opsLin,
      descripcion: `Se recorrieron ${opsLin} elementos secuencialmente hasta hallar la coincidencia.`
    });
  }

  const metricaLineal: MetricaBusqueda = {
    nombre: "Búsqueda Lineal (Secuencial)",
    notacion: "O(n)",
    operaciones: opsLin,
    tiempoMs: tiempoLin,
    encontrado: pedidoLin !== null,
    complejidadTeorica: {
      mejor: "O(1) (primer elemento)",
      promedio: `O(n / 2) ≈ ${Math.round(total / 2)} ops`,
      peor: `O(n) = ${total} ops`,
      espacio: "O(1) auxiliar"
    },
    explicacion: `Evalúa elemento por elemento desde el inicio. En el peor caso (último elemento o inexistente) debe inspeccionar los ${total} pedidos uno por uno.`,
    trazas: trazasLin
  };

  return {
    idBuscado: idBuscar,
    totalElementos: total,
    pedido: pedidoHash ?? pedidoBin ?? pedidoLin,
    metricaConstante,
    metricaBinaria,
    metricaLineal
  };
}