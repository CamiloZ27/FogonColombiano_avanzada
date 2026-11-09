import { pool } from '../db/pool';
import {
  Anomalia,
  NivelAnomalia,
  ResultadoDeteccion,
  Transaccion,
} from '../types/anomalias.types';

/**
 * Configuración de la Ventana Deslizante (Slide 36, 37, 38, 39)
 */
export const CONFIG_VENTANA = {
  segundos: 3, // Ventana por defecto: 3 segundos (configurable, Slide 36 y 39)
  transaccionesParaAlerta: 3, // Regla principal: 3 o más transacciones en la ventana = anomalía (Slide 39)
  usarLimiteHorario: false, // Activable para límites dinámicos según franja horaria (Slide 38)
  desviacionesParaAlerta: 3, // Atípico frente a comportamiento normal
  historialSegundos: 30 * 24 * 60 * 60, // 30 días para calcular promedio/desviación
};

/**
 * Slide 38: Límites configurables según la franja horaria:
 * • Por la mañana (05:00:01 a 12:00:00) -> límite de 10
 * • Por la tarde-noche (12:00:01 a 20:00:00) -> límite de 6
 * • Por la noche-madrugada (20:00:01 a 05:00:00) -> límite de 3
 */
export function obtenerLimiteSegunHorario(fecha: Date = new Date()): number {
  const hora = fecha.getHours();
  const minutos = fecha.getMinutes();
  const segundos = fecha.getSeconds();
  const tiempoEnSegundos = hora * 3600 + minutos * 60 + segundos;

  // 05:00:01 (18001s) a 12:00:00 (43200s)
  if (tiempoEnSegundos > 5 * 3600 && tiempoEnSegundos <= 12 * 3600) {
    return 10;
  }
  // 12:00:01 (43201s) a 20:00:00 (72000s)
  if (tiempoEnSegundos > 12 * 3600 && tiempoEnSegundos <= 20 * 3600) {
    return 6;
  }
  // 20:00:01 a 05:00:00
  return 3;
}

export interface TransaccionVentanaItem {
  id?: number;
  usuario_id: number;
  valor: number;
  fecha_txn: Date;
}

/**
 * Implementación de la estructura de datos de Ventana Deslizante (Sliding Window):
 * Slides 29-34, Slide 41 y Slide 43:
 * 1. Cada usuario tiene su propia ventana independiente (Slide 43: Usuario 1 -> [T1], Usuario 2 -> [T2]).
 * 2. ENTRA el nuevo elemento.
 * 3. SALEN los elementos que caen fuera de los X segundos (Slide 31: "SALE un elemento, ENTRA un elemento").
 * 4. Se cuentan los elementos vigentes dentro de la ventana.
 */
export class VentanaDeslizanteManager {
  private static ventanasPorUsuario: Map<number, TransaccionVentanaItem[]> = new Map();

  public static deslizarVentana(
    usuarioId: number,
    nuevaTxn: TransaccionVentanaItem,
    ventanaSegundos: number = CONFIG_VENTANA.segundos
  ): TransaccionVentanaItem[] {
    let ventana = this.ventanasPorUsuario.get(usuarioId);
    if (!ventana) {
      ventana = [];
      this.ventanasPorUsuario.set(usuarioId, ventana);
    }

    // ENTRA nuevo elemento
    ventana.push(nuevaTxn);

    // Ordenar cronológicamente (Slide 37)
    ventana.sort((a, b) => a.fecha_txn.getTime() - b.fecha_txn.getTime());

    // SALEN los elementos fuera de la ventana de X segundos
    const tiempoMaximo = nuevaTxn.fecha_txn.getTime();
    const tiempoMinimo = tiempoMaximo - ventanaSegundos * 1000;

    while (ventana.length > 0 && ventana[0].fecha_txn.getTime() < tiempoMinimo) {
      ventana.shift();
    }

    return [...ventana];
  }

  public static obtenerVentana(usuarioId: number): TransaccionVentanaItem[] {
    return this.ventanasPorUsuario.get(usuarioId) ?? [];
  }

  public static limpiar(): void {
    this.ventanasPorUsuario.clear();
  }
}

/**
 * Trae las transacciones del usuario dentro de la ventana deslizante
 * desde la base de datos (últimos N segundos respecto a la fecha dada).
 */
export async function obtenerTransaccionesEnVentana(
  usuarioId: number,
  ventanaSegundos: number = CONFIG_VENTANA.segundos,
  fechaReferencia: Date | string = new Date()
): Promise<Transaccion[]> {
  const ref = typeof fechaReferencia === 'string' ? new Date(fechaReferencia) : fechaReferencia;
  const { rows } = await pool.query<Transaccion>(
    `SELECT *
       FROM transacciones
      WHERE usuario_id = $1
        AND fecha_txn >= $3::timestamp - ($2 * INTERVAL '1 second')
        AND fecha_txn <= $3::timestamp
      ORDER BY fecha_txn ASC`,
    [usuarioId, ventanaSegundos, ref]
  );
  return rows;
}

/**
 * Estadísticas históricas del usuario (promedio y desviación estándar del monto).
 */
async function obtenerEstadisticasHistoricas(
  usuarioId: number,
  historialSegundos: number
): Promise<{ promedio: number | null; desviacion: number | null; n: number }> {
  const { rows } = await pool.query<{
    promedio: string | null;
    desviacion: string | null;
    n: string;
  }>(
    `SELECT AVG(valor)::numeric AS promedio,
            STDDEV(valor)::numeric AS desviacion,
            COUNT(*) AS n
       FROM transacciones
      WHERE usuario_id = $1
        AND fecha_txn >= NOW() - ($2 * INTERVAL '1 second')`,
    [usuarioId, historialSegundos]
  );

  const fila = rows[0];
  return {
    promedio: fila?.promedio !== null ? Number(fila.promedio) : null,
    desviacion: fila?.desviacion !== null ? Number(fila.desviacion) : null,
    n: Number(fila?.n ?? 0),
  };
}

/**
 * Evalúa una transacción contra la ventana deslizante del usuario (Slide 41).
 */
export async function evaluarTransaccion(
  usuarioId: number,
  valorTransaccionActual: number,
  ventanaSegundos: number = CONFIG_VENTANA.segundos,
  fechaReferencia: Date | string = new Date(),
  transaccionId?: number
): Promise<ResultadoDeteccion> {
  const fechaRef = typeof fechaReferencia === 'string' ? new Date(fechaReferencia) : fechaReferencia;

  // 1. Deslizar ventana en memoria (Slide 29, 31, 41, 43)
  const itemActual: TransaccionVentanaItem = {
    id: transaccionId,
    usuario_id: usuarioId,
    valor: valorTransaccionActual,
    fecha_txn: fechaRef,
  };
  const ventanaEnMemoria = VentanaDeslizanteManager.deslizarVentana(
    usuarioId,
    itemActual,
    ventanaSegundos
  );

  // 2. Transacciones en ventana persistidas en BD
  const transaccionesEnVentana = await obtenerTransaccionesEnVentana(
    usuarioId,
    ventanaSegundos,
    fechaRef
  );

  // Considerar el recuento consolidado (memoria y BD)
  const cantidadEnVentana = Math.max(transaccionesEnVentana.length, ventanaEnMemoria.length);

  const { promedio, desviacion } = await obtenerEstadisticasHistoricas(
    usuarioId,
    CONFIG_VENTANA.historialSegundos
  );

  const resultado: ResultadoDeteccion = {
    esAnomalia: false,
    cantidadTransacciones: cantidadEnVentana,
    ventanaSegundos,
    detalle: {
      promedioHistorico: promedio,
      desviacionHistorica: desviacion,
      valorActual: valorTransaccionActual,
    },
  };

  // Determinar umbral de alerta (Slide 38 o Slide 39)
  const umbralAlerta = CONFIG_VENTANA.usarLimiteHorario
    ? obtenerLimiteSegunHorario(fechaRef)
    : CONFIG_VENTANA.transaccionesParaAlerta;

  // Regla 1 (Slide 36 y 39): Múltiples transacciones dentro de la ventana de X segundos
  if (cantidadEnVentana >= umbralAlerta) {
    resultado.esAnomalia = true;
    resultado.tipo = 'multiples_transacciones'; // O 'POSIBLE_FRAUDE'
    resultado.nivel = calcularNivelPorFrecuencia(cantidadEnVentana, umbralAlerta);
    return resultado;
  }

  // Regla 2: Monto atípico frente al historial del usuario
  if (promedio !== null && desviacion !== null && desviacion > 0) {
    const umbral = promedio + CONFIG_VENTANA.desviacionesParaAlerta * desviacion;
    if (valorTransaccionActual > umbral) {
      resultado.esAnomalia = true;
      resultado.tipo = 'monto_atipico';
      resultado.nivel = calcularNivelPorMonto(valorTransaccionActual, umbral);
      return resultado;
    }
  }

  return resultado;
}

function calcularNivelPorFrecuencia(cantidad: number, umbral: number = 3): NivelAnomalia {
  if (cantidad >= umbral * 3) return 'critico';
  if (cantidad >= umbral * 2) return 'alto';
  return 'medio';
}

function calcularNivelPorMonto(valor: number, umbral: number): NivelAnomalia {
  const proporcion = valor / umbral;
  if (proporcion >= 3) return 'critico';
  if (proporcion >= 2) return 'alto';
  return 'medio';
}

/**
 * Inserta la anomalía detectada en la base de datos asociada a la transacción que la disparó.
 */
export async function registrarAnomalia(
  transaccionId: number,
  resultado: ResultadoDeteccion
): Promise<Anomalia> {
  if (!resultado.esAnomalia || !resultado.tipo || !resultado.nivel) {
    throw new Error('registrarAnomalia() requiere un ResultadoDeteccion con esAnomalia = true');
  }

  const { rows } = await pool.query<Anomalia>(
    `INSERT INTO anomalias
        (transaccion_id, tipo, nivel, cantidad_transacciones, ventana_segundos, estado, fecha_creacion, fecha_actualizacion)
     VALUES ($1, $2, $3, $4, $5, 'abierta', NOW(), NOW())
     RETURNING *`,
    [
      transaccionId,
      resultado.tipo,
      resultado.nivel,
      resultado.cantidadTransacciones,
      resultado.ventanaSegundos,
    ]
  );
  return rows[0];
}

/**
 * Punto de entrada único para evaluar y registrar anomalía si aplica.
 */
export async function detectarYRegistrarAnomalia(
  usuarioId: number,
  transaccionId: number,
  valorTransaccion: number,
  fechaReferencia: Date | string = new Date(),
  ventanaSegundos: number = CONFIG_VENTANA.segundos
): Promise<Anomalia | null> {
  const resultado = await evaluarTransaccion(
    usuarioId,
    valorTransaccion,
    ventanaSegundos,
    fechaReferencia,
    transaccionId
  );
  if (!resultado.esAnomalia) return null;
  return registrarAnomalia(transaccionId, resultado);
}

/**
 * Para el punto "Visualización de la ventana deslizante" del dashboard:
 * Reconstruye qué transacciones cayeron dentro de la ventana que disparó la anomalía.
 */
export async function obtenerVentanaDeAnomalia(anomaliaId: number): Promise<{
  anomalia: Anomalia;
  transaccionDisparadora: Transaccion;
  transaccionesEnVentana: Transaccion[];
}> {
  const { rows: anomaliaRows } = await pool.query<Anomalia>(
    `SELECT * FROM anomalias WHERE id = $1`,
    [anomaliaId]
  );
  const anomalia = anomaliaRows[0];
  if (!anomalia) throw new Error(`Anomalía ${anomaliaId} no encontrada`);

  const { rows: txnRows } = await pool.query<Transaccion>(
    `SELECT * FROM transacciones WHERE id = $1`,
    [anomalia.transaccion_id]
  );
  const transaccionDisparadora = txnRows[0];
  if (!transaccionDisparadora) {
    throw new Error(`Transacción ${anomalia.transaccion_id} no encontrada`);
  }

  const { rows: ventanaRows } = await pool.query<Transaccion>(
    `SELECT *
       FROM transacciones
      WHERE usuario_id = $1
        AND fecha_txn >= $2::timestamp - ($3 * INTERVAL '1 second')
        AND fecha_txn <= $2::timestamp
      ORDER BY fecha_txn ASC`,
    [transaccionDisparadora.usuario_id, transaccionDisparadora.fecha_txn, anomalia.ventana_segundos]
  );

  return {
    anomalia,
    transaccionDisparadora,
    transaccionesEnVentana: ventanaRows,
  };
}
