import { pool } from '../db/pool';

export interface PuntoSerie {
  fecha: string;        // 'YYYY-MM-DD'
  total: number;        // suma de valor ese día
  cantidad: number;     // número de transacciones ese día
}

/**
 * Devuelve la serie temporal diaria de ventas (últimos N días).
 * Incluye solo días con al menos 1 transacción completada.
 */
export async function obtenerSeriesDiarias(dias = 90): Promise<PuntoSerie[]> {
  const { rows } = await pool.query<{ fecha: string; total: string; cantidad: string }>(
    `SELECT
        DATE(fecha_txn)::text          AS fecha,
        SUM(valor)::numeric            AS total,
        COUNT(*)                       AS cantidad
      FROM transacciones
      WHERE estado = 'completada'
        AND fecha_txn >= NOW() - ($1 * INTERVAL '1 day')
      GROUP BY DATE(fecha_txn)
      ORDER BY fecha ASC`,
    [dias]
  );

  return rows.map((r) => ({
    fecha: r.fecha,
    total: Number(r.total),
    cantidad: Number(r.cantidad),
  }));
}

/**
 * Resumen estadístico básico de las ventas (para mostrar en el panel).
 */
export async function obtenerResumenVentas(): Promise<{
  totalHistorico: number;
  promedioSemanal: number;
  mejorDia: { fecha: string; total: number } | null;
  transaccionesUltimos30: number;
}> {
  const [resumen, mejorDia, recientes] = await Promise.all([
    pool.query<{ total_historico: string; promedio_7d: string }>(
      `SELECT
          SUM(valor)::numeric AS total_historico,
          (
            SELECT SUM(valor) / 7.0
            FROM transacciones
            WHERE estado = 'completada'
              AND fecha_txn >= NOW() - INTERVAL '7 days'
          )::numeric AS promedio_7d
        FROM transacciones
        WHERE estado = 'completada'`
    ),
    pool.query<{ fecha: string; total: string }>(
      `SELECT DATE(fecha_txn)::text AS fecha, SUM(valor)::numeric AS total
         FROM transacciones
        WHERE estado = 'completada'
        GROUP BY DATE(fecha_txn)
        ORDER BY total DESC
        LIMIT 1`
    ),
    pool.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM transacciones
        WHERE estado = 'completada'
          AND fecha_txn >= NOW() - INTERVAL '30 days'`
    ),
  ]);

  const fila = resumen.rows[0];
  const mejor = mejorDia.rows[0] ?? null;

  return {
    totalHistorico: Number(fila?.total_historico ?? 0),
    promedioSemanal: Number(fila?.promedio_7d ?? 0),
    mejorDia: mejor ? { fecha: mejor.fecha, total: Number(mejor.total) } : null,
    transaccionesUltimos30: Number(recientes.rows[0]?.n ?? 0),
  };
}

