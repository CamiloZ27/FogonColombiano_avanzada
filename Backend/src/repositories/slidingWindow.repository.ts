import { pool } from '../db/pool';
import {
  Anomalia,
  NivelAnomalia,
  ResultadoDeteccion,
  Transaccion,
} from '../types/anomalias.types';

/**
 * Umbrales de la ventana deslizante. Ajusta según tu criterio de negocio
 * o mueve esto a variables de entorno / tabla de configuración.
 */
const CONFIG_VENTANA = {
  segundos: 300, // ventana de 5 minutos
  transaccionesParaAlerta: 3, // desde esta cantidad en la ventana = sospechoso
  desviacionesParaAlerta: 3, // valor > promedio + 3 * desviación = atípico
  historialSegundos: 30 * 24 * 60 * 60, // 30 días para calcular promedio/desviación
};

/**
 * Trae las transacciones del usuario dentro de la ventana deslizante
 * (últimos N segundos, ordenadas de la más reciente a la más antigua).
 */
export async function obtenerTransaccionesEnVentana(
  usuarioId: number,
  ventanaSegundos: number = CONFIG_VENTANA.segundos,
  fechaReferencia: Date | string = new Date()
): Promise<Transaccion[]> {
  const { rows } = await pool.query<Transaccion>(
    `SELECT *
       FROM transacciones
      WHERE usuario_id = $1
        AND fecha_txn BETWEEN $3::timestamp - ($2 * INTERVAL '1 second') AND $3::timestamp
      ORDER BY fecha_txn DESC`,
    [usuarioId, ventanaSegundos, fechaReferencia]
  );
  return rows;
}

/**
 * Estadísticas históricas del usuario (promedio y desviación estándar del
 * monto) para poder detectar montos atípicos frente a su comportamiento normal.
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
 * Evalúa una transacción recién creada contra la ventana deslizante del
 * usuario y decide si constituye una anomalía. NO inserta nada todavía:
 * solo calcula. Llama a registrarAnomalia() con el resultado si aplica.
 */
export async function evaluarTransaccion(
  usuarioId: number,
  valorTransaccionActual: number,
  ventanaSegundos: number = CONFIG_VENTANA.segundos,
  fechaReferencia: Date | string = new Date()
): Promise<ResultadoDeteccion> {
  const transaccionesEnVentana = await obtenerTransaccionesEnVentana(
    usuarioId,
    ventanaSegundos,
    fechaReferencia
  );
  const cantidadEnVentana = transaccionesEnVentana.length;

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

  // Regla 1: demasiadas transacciones en poco tiempo
  if (cantidadEnVentana >= CONFIG_VENTANA.transaccionesParaAlerta) {
    resultado.esAnomalia = true;
    resultado.tipo = 'frecuencia_alta';
    resultado.nivel = calcularNivelPorFrecuencia(cantidadEnVentana);
    return resultado;
  }

  // Regla 2: monto atípico frente al historial del usuario
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

function calcularNivelPorFrecuencia(cantidad: number): NivelAnomalia {
  if (cantidad >= CONFIG_VENTANA.transaccionesParaAlerta * 3) return 'critico';
  if (cantidad >= CONFIG_VENTANA.transaccionesParaAlerta * 2) return 'alto';
  return 'medio';
}

function calcularNivelPorMonto(valor: number, umbral: number): NivelAnomalia {
  const proporcion = valor / umbral;
  if (proporcion >= 3) return 'critico';
  if (proporcion >= 2) return 'alto';
  return 'medio';
}

/**
 * Inserta la anomalía detectada, asociada a la transacción que la disparó.
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
 * Punto de entrada único: úsalo justo después de insertar la transacción
 * en tu controlador/servicio de pagos.
 *   const txn = await crearTransaccion(...)
 *   await detectarYRegistrarAnomalia(txn.usuario_id, txn.id, Number(txn.valor))
 */
export async function detectarYRegistrarAnomalia(
  usuarioId: number,
  transaccionId: number,
  valorTransaccion: number,
  fechaReferencia: Date | string = new Date()
): Promise<Anomalia | null> {
  const resultado = await evaluarTransaccion(
    usuarioId,
    valorTransaccion,
    CONFIG_VENTANA.segundos,
    fechaReferencia
  );
  if (!resultado.esAnomalia) return null;
  return registrarAnomalia(transaccionId, resultado);
}

/**
 * Para el punto "Visualización de la ventana deslizante" del dashboard:
 * dado el id de una anomalía, reconstruye qué transacciones cayeron dentro
 * de la ventana que la disparó (mismo usuario, mismo rango de tiempo).
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
        AND fecha_txn BETWEEN $2::timestamp - ($3 * INTERVAL '1 second') AND $2::timestamp
      ORDER BY fecha_txn ASC`,
    [transaccionDisparadora.usuario_id, transaccionDisparadora.fecha_txn, anomalia.ventana_segundos]
  );

  return {
    anomalia,
    transaccionDisparadora,
    transaccionesEnVentana: ventanaRows,
  };
}
