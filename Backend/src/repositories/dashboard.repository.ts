import { pool } from '../db/pool';
import { Periodo, ResumenGeneral } from '../types/anomalias.types';

function validarPeriodo(periodo: Periodo): Periodo {
  if (!['day', 'week', 'month'].includes(periodo)) {
    throw new Error(`Periodo inválido: ${periodo}`);
  }
  return periodo;
}

// ── 1. Resumen general (tarjetas superiores del dashboard) ─────────────

export async function obtenerResumenGeneral(periodo: Periodo): Promise<ResumenGeneral> {
  validarPeriodo(periodo);

  const { rows } = await pool.query(
    `WITH rango AS (
       SELECT date_trunc($1, NOW()) AS inicio
     ),
     txn_periodo AS (
       SELECT t.*
       FROM transacciones t
       CROSS JOIN rango
       WHERE t.fecha_txn >= rango.inicio
     ),
     anom_periodo AS (
       SELECT a.*, t.usuario_id, t.valor
       FROM anomalias a
       JOIN transacciones t ON t.id = a.transaccion_id
       CROSS JOIN rango
       WHERE a.fecha_creacion >= rango.inicio
     )
     SELECT
       (SELECT COUNT(*) FROM txn_periodo)                                    AS total_transacciones,
       (SELECT COUNT(*) FROM anom_periodo)                                   AS total_anomalias,
       (SELECT COUNT(DISTINCT usuario_id) FROM anom_periodo)                 AS usuarios_afectados,
       (SELECT COALESCE(SUM(valor), 0) FROM anom_periodo)                    AS valor_total_sospechoso,
       (SELECT COUNT(*) FROM anom_periodo WHERE estado = 'abierta')          AS anomalias_abiertas,
       (SELECT COUNT(*) FROM anom_periodo WHERE estado = 'revisada')         AS anomalias_revisadas,
       (SELECT COUNT(*) FROM anom_periodo WHERE estado = 'descartada')       AS anomalias_descartadas,
       (SELECT COUNT(*) FROM txn_periodo)::float
         / NULLIF((SELECT COUNT(DISTINCT usuario_id) FROM txn_periodo), 0)   AS promedio_transacciones_por_usuario`,
    [periodo]
  );

  const r = rows[0];
  const totalTransacciones = Number(r.total_transacciones);
  const totalAnomalias = Number(r.total_anomalias);

  return {
    totalTransacciones,
    totalAnomalias,
    porcentajeAnomalias: totalTransacciones > 0 ? (totalAnomalias / totalTransacciones) * 100 : 0,
    usuariosAfectados: Number(r.usuarios_afectados),
    valorTotalSospechoso: Number(r.valor_total_sospechoso),
    promedioTransaccionesPorUsuario: Number(r.promedio_transacciones_por_usuario ?? 0),
    anomaliasNuevas: totalAnomalias,
    anomaliasAbiertas: Number(r.anomalias_abiertas ?? 0),
    anomaliasRevisadas: Number(r.anomalias_revisadas ?? 0),
    anomaliasDescartadas: Number(r.anomalias_descartadas ?? 0),
  };
}

// ── 2. Casos más recurrentes (por tipo de anomalía) ─────────────────────

export async function obtenerCasosMasRecurrentes(periodo: Periodo, limite = 5) {
  validarPeriodo(periodo);
  const { rows } = await pool.query(
    `SELECT tipo, COUNT(*) AS total
       FROM anomalias
      WHERE fecha_creacion >= date_trunc($1, NOW())
      GROUP BY tipo
      ORDER BY total DESC
      LIMIT $2`,
    [periodo, limite]
  );
  return rows;
}

// ── 3. Usuarios recurrentes (más anomalías asociadas) ───────────────────

export async function obtenerUsuariosRecurrentes(periodo: Periodo, limite = 5) {
  validarPeriodo(periodo);
  const { rows } = await pool.query(
    `SELECT u.id AS usuario_id, u.nombre, u.email, COUNT(a.id) AS total_anomalias
       FROM anomalias a
       JOIN transacciones t ON t.id = a.transaccion_id
       JOIN usuarios u ON u.id = t.usuario_id
      WHERE a.fecha_creacion >= date_trunc($1, NOW())
      GROUP BY u.id, u.nombre, u.email
      ORDER BY total_anomalias DESC
      LIMIT $2`,
    [periodo, limite]
  );
  return rows;
}

// ── 4. Anomalías por nivel ───────────────────────────────────────────────

export async function obtenerAnomaliasPorNivel(periodo: Periodo) {
  validarPeriodo(periodo);
  const { rows } = await pool.query(
    `SELECT nivel, COUNT(*) AS total
       FROM anomalias
      WHERE fecha_creacion >= date_trunc($1, NOW())
      GROUP BY nivel
      ORDER BY total DESC`,
    [periodo]
  );
  return rows;
}

// ── 5. Evolución temporal ───────────────────────────────────────────────

export async function obtenerTendenciaTemporal(periodo: Periodo) {
  validarPeriodo(periodo);
  const unidadAgrupacion = periodo === 'day' ? 'hour' : 'day';

  const { rows } = await pool.query(
    `SELECT date_trunc($2, fecha_creacion) AS marca_tiempo, COUNT(*) AS total
       FROM anomalias
      WHERE fecha_creacion >= date_trunc($1, NOW())
      GROUP BY marca_tiempo
      ORDER BY marca_tiempo ASC`,
    [periodo, unidadAgrupacion]
  );
  return rows;
}

// ── 6. Distribución por hora del día (0-23h) ────────────────────────────

export async function obtenerDistribucionPorHora(periodo: Periodo) {
  validarPeriodo(periodo);
  const { rows } = await pool.query(
    `SELECT EXTRACT(HOUR FROM fecha_creacion)::int AS hora, COUNT(*) AS total
       FROM anomalias
      WHERE fecha_creacion >= date_trunc($1, NOW())
      GROUP BY hora
      ORDER BY hora ASC`,
    [periodo]
  );
  return rows;
}

// ── 7. Métodos de pago involucrados en anomalías ─────────────────────────

export async function obtenerDistribucionMetodoPago(periodo: Periodo) {
  validarPeriodo(periodo);
  const { rows } = await pool.query(
    `SELECT t.metodo_pago, COUNT(a.id) AS total
       FROM anomalias a
       JOIN transacciones t ON t.id = a.transaccion_id
      WHERE a.fecha_creacion >= date_trunc($1, NOW())
      GROUP BY t.metodo_pago
      ORDER BY total DESC`,
    [periodo]
  );
  return rows;
}

// ── 8. Línea de tiempo de una anomalía puntual ───────────────────────────

export async function obtenerLineaDeTiempoAnomalia(anomaliaId: number) {
  const { rows } = await pool.query(
    `SELECT
        a.id             AS anomalia_id,
        a.tipo,
        a.nivel,
        a.cantidad_transacciones,
        a.ventana_segundos,
        a.fecha_creacion AS anomalia_fecha_creacion,
        t.id             AS transaccion_id,
        t.valor,
        t.metodo_pago,
        t.estado         AS transaccion_estado,
        t.fecha_txn,
        u.id             AS usuario_id,
        u.nombre,
        u.email
     FROM anomalias a
     JOIN transacciones t ON t.id = a.transaccion_id
     JOIN usuarios u ON u.id = t.usuario_id
    WHERE a.id = $1`,
    [anomaliaId]
  );
  return rows[0] ?? null;
}

// ── 9. Cambiar estado de gestión de una anomalía ─────────────────────────

export async function actualizarEstadoAnomalia(
  anomaliaId: number,
  nuevoEstado: 'abierta' | 'revisada' | 'descartada'
) {
  const { rows } = await pool.query(
    `UPDATE anomalias
        SET estado = $2,
            fecha_actualizacion = NOW()
      WHERE id = $1
      RETURNING *`,
    [anomaliaId, nuevoEstado]
  );
  return rows[0] ?? null;
}

// ── 10. Listado de anomalías recientes ──────────────────────────────────

export async function obtenerAnomaliasRecientes(periodo: Periodo, limite = 20) {
  validarPeriodo(periodo);
  const { rows } = await pool.query(
    `SELECT
        a.id, a.tipo, a.nivel, a.fecha_creacion,
        t.id AS transaccion_id, t.valor, t.metodo_pago,
        u.id AS usuario_id, u.nombre
     FROM anomalias a
     JOIN transacciones t ON t.id = a.transaccion_id
     JOIN usuarios u ON u.id = t.usuario_id
    WHERE a.fecha_creacion >= date_trunc($1, NOW())
    ORDER BY a.fecha_creacion DESC
    LIMIT $2`,
    [periodo, limite]
  );
  return rows;
}