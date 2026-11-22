import { performance } from 'perf_hooks';
import { pool } from '../db/pool';
import { normalizarMetodoPago, normalizarTextoClave } from './calidad.service';

export interface OperacionBase {
  id: number;
  usuario_id: number;
  usuario_nombre: string;
  monto: number;
  fecha: number; // timestamp ms
  fecha_iso: string;
  canal: string;
  metodo_pago: string;
  origen: 'transaccion' | 'factura' | 'pedido';
}

// =============================================================================
// 1. ALGORITMOS O(n) — Tiempo Lineal
// =============================================================================

/** Búsqueda lineal de un pedido, factura o transacción por ID — O(n) */
export function busquedaLinealPorId<T extends { id: number }>(datos: T[], idObjetivo: number) {
  const inicio = performance.now();
  let comparaciones = 0;
  let encontrado: T | null = null;

  for (let i = 0; i < datos.length; i++) {
    comparaciones++;
    if (datos[i].id === idObjetivo) {
      encontrado = datos[i];
      break;
    }
  }

  return {
    algoritmo: 'Búsqueda Lineal por ID',
    complejidad: 'O(n)',
    n: datos.length,
    comparaciones,
    tiempo_ms: Number((performance.now() - inicio).toFixed(4)),
    encontrado,
  };
}

/** Suma de ventas en un único recorrido — O(n) */
export function sumaVentasLineal(datos: OperacionBase[]) {
  const inicio = performance.now();
  let suma = 0;
  let operaciones = 0;

  for (let i = 0; i < datos.length; i++) {
    suma += datos[i].monto;
    operaciones++;
  }

  return {
    algoritmo: 'Suma de Ventas',
    complejidad: 'O(n)',
    n: datos.length,
    operaciones,
    tiempo_ms: Number((performance.now() - inicio).toFixed(4)),
    total_ventas: Math.round(suma * 100) / 100,
    ticket_promedio: datos.length > 0 ? Math.round((suma / datos.length) * 100) / 100 : 0,
  };
}

/** Conteo de pedidos/operaciones por cliente usando tabla Hash — O(n) */
export function conteoOperacionesPorCliente(datos: OperacionBase[]) {
  const inicio = performance.now();
  const mapa = new Map<number, { usuario_id: number; nombre: string; cantidad: number; total_gastado: number }>();
  let operaciones = 0;

  for (let i = 0; i < datos.length; i++) {
    operaciones++;
    const op = datos[i];
    const actual = mapa.get(op.usuario_id);
    if (actual) {
      actual.cantidad++;
      actual.total_gastado += op.monto;
    } else {
      mapa.set(op.usuario_id, {
        usuario_id: op.usuario_id,
        nombre: op.usuario_nombre,
        cantidad: 1,
        total_gastado: op.monto,
      });
    }
  }

  return {
    algoritmo: 'Conteo de Pedidos por Cliente (Hash Map)',
    complejidad: 'O(n)',
    n: datos.length,
    operaciones,
    tiempo_ms: Number((performance.now() - inicio).toFixed(4)),
    clientes_unicos: mapa.size,
    conteo: Array.from(mapa.values()),
  };
}

/** Normalización y unificación de strings en una sola pasada — O(n) */
export function normalizarYUnificarStrings(textos: string[]) {
  const inicio = performance.now();
  const unificados = new Map<string, { clave: string; original_representativo: string; ocurrencias: number }>();
  let operaciones = 0;

  for (let i = 0; i < textos.length; i++) {
    operaciones++;
    const clave = normalizarTextoClave(textos[i]);
    if (!clave) continue;
    const prev = unificados.get(clave);
    if (prev) prev.ocurrencias++;
    else unificados.set(clave, { clave, original_representativo: textos[i].trim(), ocurrencias: 1 });
  }

  return {
    algoritmo: 'Normalización y Unificación de Strings',
    complejidad: 'O(n)',
    n: textos.length,
    operaciones,
    tiempo_ms: Number((performance.now() - inicio).toFixed(4)),
    unicos: unificados.size,
    duplicados_absorbidos: Math.max(0, textos.length - unificados.size),
    resultados: Array.from(unificados.values()),
  };
}

/** Detección optimizada de operaciones/registros duplicados con Hash Set — O(n) */
export function detectarDuplicadosOptimizado(datos: OperacionBase[]) {
  const inicio = performance.now();
  const vistos = new Set<string>();
  let comparaciones = 0;
  let duplicados = 0;

  for (let i = 0; i < datos.length; i++) {
    comparaciones++;
    const d = datos[i];
    const firma = `${d.usuario_id}|${Math.round(d.monto)}|${Math.floor(d.fecha / 60000)}`;
    if (vistos.has(firma)) duplicados++;
    else vistos.add(firma);
  }

  return {
    algoritmo: 'Detección de Duplicados Optimizada (Hash Set)',
    complejidad: 'O(n)',
    n: datos.length,
    operaciones: comparaciones,
    duplicados_encontrados: duplicados,
    tiempo_ms: Number((performance.now() - inicio).toFixed(4)),
  };
}

// =============================================================================
// 2. ALGORITMOS O(n²) — Tiempo Cuadrático (Baseline sin optimizar)
// =============================================================================

/** Ordenamiento simple por Burbuja (Bubble Sort) por fecha — O(n²) */
export function ordenamientoSimpleBurbuja(datos: OperacionBase[], criterio: 'fecha' | 'monto' = 'fecha') {
  const arr = [...datos];
  const n = arr.length;
  const inicio = performance.now();
  let comparaciones = 0;
  let intercambios = 0;

  for (let i = 0; i < n - 1; i++) {
    let huboCambio = false;
    for (let j = 0; j < n - i - 1; j++) {
      comparaciones++;
      const a = criterio === 'fecha' ? arr[j].fecha : arr[j].monto;
      const b = criterio === 'fecha' ? arr[j + 1].fecha : arr[j + 1].monto;
      if (a > b) {
        const tmp = arr[j];
        arr[j] = arr[j + 1];
        arr[j + 1] = tmp;
        intercambios++;
        huboCambio = true;
      }
    }
    if (!huboCambio) break;
  }

  return {
    algoritmo: `Ordenamiento Simple (Bubble Sort por ${criterio})`,
    complejidad: 'O(n²)',
    n,
    comparaciones,
    intercambios,
    operaciones: comparaciones + intercambios,
    tiempo_ms: Number((performance.now() - inicio).toFixed(4)),
    resultado: arr,
  };
}

/** Detección ingenua de operaciones duplicadas por doble ciclo — O(n²) */
export function detectarDuplicadosIngenuo(datos: OperacionBase[]) {
  const inicio = performance.now();
  const n = datos.length;
  let comparaciones = 0;
  let paresDuplicados = 0;

  for (let i = 0; i < n; i++) {
    const a = datos[i];
    const minA = Math.floor(a.fecha / 60000);
    for (let j = i + 1; j < n; j++) {
      comparaciones++;
      const b = datos[j];
      if (a.usuario_id === b.usuario_id && Math.round(a.monto) === Math.round(b.monto) && minA === Math.floor(b.fecha / 60000)) {
        paresDuplicados++;
      }
    }
  }

  return {
    algoritmo: 'Detección Ingenua de Duplicados (Doble Ciclo)',
    complejidad: 'O(n²)',
    n,
    operaciones: comparaciones,
    duplicados_encontrados: paresDuplicados,
    tiempo_ms: Number((performance.now() - inicio).toFixed(4)),
  };
}

// =============================================================================
// 3. ALGORITMOS O(n log n) — Divide y Vencerás Optimizado
// =============================================================================

/** Merge Sort genuino por fecha o monto — O(n log n) garantizado */
export function ordenamientoMergeSort<T>(
  datos: T[],
  selector: (item: T) => number,
  descendente: boolean = false
): { resultado: T[]; comparaciones: number; tiempo_ms: number } {
  const inicio = performance.now();
  let comparaciones = 0;

  function merge(izq: T[], der: T[]): T[] {
    const res: T[] = [];
    let i = 0;
    let j = 0;
    while (i < izq.length && j < der.length) {
      comparaciones++;
      const cond = descendente
        ? selector(izq[i]) >= selector(der[j])
        : selector(izq[i]) <= selector(der[j]);
      if (cond) res.push(izq[i++]);
      else res.push(der[j++]);
    }
    while (i < izq.length) res.push(izq[i++]);
    while (j < der.length) res.push(der[j++]);
    return res;
  }

  function sort(arr: T[]): T[] {
    if (arr.length <= 1) return arr;
    const mid = Math.floor(arr.length / 2);
    return merge(sort(arr.slice(0, mid)), sort(arr.slice(mid)));
  }

  const resultado = sort([...datos]);
  return {
    resultado,
    comparaciones,
    tiempo_ms: Number((performance.now() - inicio).toFixed(4)),
  };
}

export function ordenamientoPorFechaMergeSort(datos: OperacionBase[]) {
  const res = ordenamientoMergeSort(datos, (d) => d.fecha, false);
  return {
    algoritmo: 'Ordenamiento por Fecha (Merge Sort)',
    complejidad: 'O(n log n)',
    n: datos.length,
    comparaciones: res.comparaciones,
    operaciones: res.comparaciones,
    tiempo_ms: res.tiempo_ms,
    resultado: res.resultado,
  };
}

// =============================================================================
// 4. CARGA DE DATOS REALES + BENCHMARK EXPERIMENTAL + ANÁLISIS DE PATRONES
// =============================================================================

export async function cargarOperacionesSistema(limite: number = 5000): Promise<OperacionBase[]> {
  const { rows } = await pool.query(
    `SELECT t.id, t.usuario_id, u.nombre AS usuario_nombre,
            t.valor::float AS monto, t.fecha_txn,
            COALESCE(t.canal, 'presencial') AS canal,
            COALESCE(t.metodo_pago, 'efectivo') AS metodo_pago
       FROM transacciones t
       JOIN usuarios u ON u.id = t.usuario_id
      ORDER BY t.id DESC
      LIMIT $1`,
    [limite]
  );

  return rows.map((r) => ({
    id: Number(r.id),
    usuario_id: Number(r.usuario_id),
    usuario_nombre: r.usuario_nombre,
    monto: Number(r.monto),
    fecha: new Date(r.fecha_txn).getTime(),
    fecha_iso: new Date(r.fecha_txn).toISOString(),
    canal: r.canal,
    metodo_pago: normalizarMetodoPago(r.metodo_pago),
    origen: 'transaccion',
  }));
}

function construirDatasetEscalado(base: OperacionBase[], tamanoObjetivo: number): OperacionBase[] {
  const resultado: OperacionBase[] = [];
  const ahora = Date.now();
  // Desordenar deterministicamente para medir caso real/promedio (no ya ordenado)
  for (let i = 0; i < tamanoObjetivo; i++) {
    if (base.length > 0) {
      const plantilla = base[i % base.length];
      // Mezcla determinística en timestamp para forzar trabajo real en algoritmos de ordenamiento
      const offsetMs = ((i * 2654435761) % 86400000) * 30;
      resultado.push({
        ...plantilla,
        id: i + 1,
        fecha: ahora - offsetMs,
        fecha_iso: new Date(ahora - offsetMs).toISOString(),
      });
    } else {
      const offsetMs = ((i * 2654435761) % 86400000) * 30;
      resultado.push({
        id: i + 1,
        usuario_id: (i % 25) + 1,
        usuario_nombre: `Cliente ${(i % 25) + 1}`,
        monto: 15000 + ((i * 7919) % 75000),
        fecha: ahora - offsetMs,
        fecha_iso: new Date(ahora - offsetMs).toISOString(),
        canal: ['presencial', 'web', 'app', 'domicilio'][i % 4],
        metodo_pago: ['efectivo', 'tarjeta_credito', 'nequi', 'daviplata'][i % 4],
        origen: 'transaccion',
      });
    }
  }
  return resultado;
}

/**
 * Ejecuta el estudio experimental comparando O(n), O(n log n) y O(n²)
 * para distintos tamaños N, midiendo tiempos reales, operaciones y factores de optimización.
 */
export async function ejecutarBenchmarkExperimental(tamanos: number[] = [100, 300, 600, 1200, 2000]) {
  const tamanosLimpios = tamanos
    .map((n) => Math.max(20, Math.min(3500, Math.floor(n))))
    .sort((a, b) => a - b);

  const operacionesReales = await cargarOperacionesSistema(3500);
  const puntosBenchmark = [];

  for (const n of tamanosLimpios) {
    const dataset = construirDatasetEscalado(operacionesReales, n);
    const idPeorCaso = dataset[dataset.length - 1]?.id ?? n;

    // O(n)
    const linBusqueda = busquedaLinealPorId(dataset, idPeorCaso);
    const linSuma = sumaVentasLineal(dataset);
    const linConteo = conteoOperacionesPorCliente(dataset);
    const linDedup = detectarDuplicadosOptimizado(dataset);

    // O(n log n)
    const nlognMerge = ordenamientoPorFechaMergeSort(dataset);

    // O(n²)
    const n2Burbuja = ordenamientoSimpleBurbuja(dataset, 'fecha');
    const n2Dedup = detectarDuplicadosIngenuo(dataset);

    const mejoraOrdenamiento =
      nlognMerge.tiempo_ms > 0 ? Number((n2Burbuja.tiempo_ms / nlognMerge.tiempo_ms).toFixed(2)) : 1;
    const mejoraDedup =
      linDedup.tiempo_ms > 0 ? Number((n2Dedup.tiempo_ms / linDedup.tiempo_ms).toFixed(2)) : 1;

    puntosBenchmark.push({
      n,
      on: {
        busqueda_ms: linBusqueda.tiempo_ms,
        busqueda_ops: linBusqueda.comparaciones,
        suma_ms: linSuma.tiempo_ms,
        conteo_clientes_ms: linConteo.tiempo_ms,
        dedup_hash_ms: linDedup.tiempo_ms,
        dedup_hash_ops: linDedup.operaciones,
      },
      onlogn: {
        merge_sort_ms: nlognMerge.tiempo_ms,
        merge_sort_ops: nlognMerge.comparaciones,
      },
      on2: {
        bubble_sort_ms: n2Burbuja.tiempo_ms,
        bubble_sort_ops: n2Burbuja.operaciones,
        dedup_ingenuo_ms: n2Dedup.tiempo_ms,
        dedup_ingenuo_ops: n2Dedup.operaciones,
      },
      optimizacion: {
        aceleracion_ordenamiento_x: mejoraOrdenamiento,
        reduccion_ops_ordenamiento_pct: Number(
          (((n2Burbuja.operaciones - nlognMerge.comparaciones) / Math.max(1, n2Burbuja.operaciones)) * 100).toFixed(2)
        ),
        aceleracion_dedup_x: mejoraDedup,
        reduccion_ops_dedup_pct: Number(
          (((n2Dedup.operaciones - linDedup.operaciones) / Math.max(1, n2Dedup.operaciones)) * 100).toFixed(2)
        ),
      },
    });
  }

  const ultimo = puntosBenchmark[puntosBenchmark.length - 1];

  return {
    registros_reales_bd: operacionesReales.length,
    ejecutado_en: new Date().toISOString(),
    puntos: puntosBenchmark,
    resumen_optimizacion: {
      caso_1_ordenamiento: {
        antes: 'Bubble Sort O(n²)',
        despues: 'Merge Sort O(n log n)',
        n_maximo: ultimo?.n ?? 0,
        mejora_velocidad: `${ultimo?.optimizacion.aceleracion_ordenamiento_x ?? 1}x más rápido`,
        reduccion_operaciones: `${ultimo?.optimizacion.reduccion_ops_ordenamiento_pct ?? 0}% menos operaciones`,
        conclusion: 'Al pasar de ordenamiento cuadrático a divide y vencerás (Merge Sort), el tiempo crece de forma cuasi-lineal y permite ordenar miles de facturas/pedidos en milisegundos.',
      },
      caso_2_duplicados: {
        antes: 'Comparación anidada O(n²)',
        despues: 'Indexación por Hash Set O(n)',
        n_maximo: ultimo?.n ?? 0,
        mejora_velocidad: `${ultimo?.optimizacion.aceleracion_dedup_x ?? 1}x más rápido`,
        reduccion_operaciones: `${ultimo?.optimizacion.reduccion_ops_dedup_pct ?? 0}% menos comparaciones`,
        conclusion: 'Reemplazar ciclos anidados por firmas normalizadas en Hash Set elimina cuellos de botella en limpieza de datos y detección de operaciones repetidas.',
      },
    },
  };
}

/**
 * Ejecuta los algoritmos operativos reales sobre los datos actuales en PostgreSQL:
 * ranking de ítems más vendidos (O(n) + O(k log k)), conteo por cliente,
 * análisis de patrones (horarios, montos, frecuencia, canal).
 */
export async function analizarPatronesYRankingSistema() {
  const [operaciones, itemsVendidosRes, pedidosCanalRes] = await Promise.all([
    cargarOperacionesSistema(5000),
    pool.query(
      `SELECT pi.item_id, i.nombre, c.nombre AS categoria,
              pi.cantidad, pi.subtotal::float AS subtotal
         FROM pedido_items pi
         JOIN items i ON i.id = pi.item_id
         JOIN categorias c ON c.id = i.categoria_id
         JOIN pedidos p ON p.id = pi.pedido_id
        WHERE p.estado <> 'anulado'`
    ),
    pool.query(
      `SELECT canal, COUNT(*)::int AS total_pedidos,
              COALESCE(SUM(subtotal), 0)::float AS total_ventas,
              COUNT(*) FILTER (WHERE estado = 'anulado')::int AS anulados
         FROM pedidos
        GROUP BY canal`
    ),
  ]);

  // 1. Suma de ventas O(n) y conteo por cliente O(n)
  const sumaVentas = sumaVentasLineal(operaciones);
  const conteoClientes = conteoOperacionesPorCliente(operaciones);
  const topClientesOrdenado = ordenamientoMergeSort(
    conteoClientes.conteo,
    (c) => c.total_gastado,
    true
  );

  // 2. Ranking de ítems más vendidos: agregación O(n) + Merge Sort O(k log k)
  const inicioRank = performance.now();
  const mapaItems = new Map<
    number,
    { item_id: number; nombre: string; categoria: string; unidades_vendidas: number; ingresos: number }
  >();
  for (const row of itemsVendidosRes.rows) {
    const id = Number(row.item_id);
    const prev = mapaItems.get(id);
    if (prev) {
      prev.unidades_vendidas += Number(row.cantidad);
      prev.ingresos += Number(row.subtotal);
    } else {
      mapaItems.set(id, {
        item_id: id,
        nombre: row.nombre,
        categoria: row.categoria,
        unidades_vendidas: Number(row.cantidad),
        ingresos: Number(row.subtotal),
      });
    }
  }
  const rankingOrdenado = ordenamientoMergeSort(
    Array.from(mapaItems.values()),
    (it) => it.unidades_vendidas,
    true
  );
  const tiempoRankingMs = Number((performance.now() - inicioRank).toFixed(4));

  // 3. Patrones por hora del día (0..23), rangos de monto y métodos de pago — O(n)
  const porHora = Array.from({ length: 24 }, (_, hora) => ({ hora, operaciones: 0, ventas: 0 }));
  const rangosMonto = {
    bajo_lt_25k: 0,
    medio_25k_60k: 0,
    alto_60k_120k: 0,
    muy_alto_gt_120k: 0,
  };
  const porMetodo = new Map<string, { metodo: string; operaciones: number; total: number }>();

  for (const op of operaciones) {
    const h = new Date(op.fecha).getHours();
    porHora[h].operaciones++;
    porHora[h].ventas += op.monto;

    if (op.monto < 25000) rangosMonto.bajo_lt_25k++;
    else if (op.monto < 60000) rangosMonto.medio_25k_60k++;
    else if (op.monto < 120000) rangosMonto.alto_60k_120k++;
    else rangosMonto.muy_alto_gt_120k++;

    const mp = porMetodo.get(op.metodo_pago);
    if (mp) {
      mp.operaciones++;
      mp.total += op.monto;
    } else {
      porMetodo.set(op.metodo_pago, { metodo: op.metodo_pago, operaciones: 1, total: op.monto });
    }
  }

  const horasOrdenadas = ordenamientoMergeSort(porHora, (x) => x.operaciones, true).resultado;

  return {
    metricas_globales: {
      total_operaciones_analizadas: operaciones.length,
      total_ventas: sumaVentas.total_ventas,
      ticket_promedio: sumaVentas.ticket_promedio,
      clientes_activos: conteoClientes.clientes_unicos,
      tiempo_suma_on_ms: sumaVentas.tiempo_ms,
      tiempo_conteo_clientes_on_ms: conteoClientes.tiempo_ms,
    },
    ranking_items: {
      algoritmo: 'Agregación Hash O(n) + Merge Sort O(k log k)',
      tiempo_ms: tiempoRankingMs,
      comparaciones: rankingOrdenado.comparaciones,
      items: rankingOrdenado.resultado.slice(0, 15),
    },
    top_clientes: topClientesOrdenado.resultado.slice(0, 10),
    patrones: {
      horarios: porHora,
      horas_pico: horasOrdenadas.slice(0, 3),
      rangos_monto: rangosMonto,
      por_canal: pedidosCanalRes.rows.map((r) => ({
        canal: r.canal,
        total_pedidos: Number(r.total_pedidos),
        total_ventas: Number(r.total_ventas),
        anulados: Number(r.anulados),
      })),
      por_metodo_pago: Array.from(porMetodo.values()).sort((a, b) => b.operaciones - a.operaciones),
    },
  };
}

