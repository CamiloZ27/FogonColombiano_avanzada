import { PoolClient } from 'pg';
import { pool } from '../db/pool';
import {
  calcularHashEncadenado,
  calcularSHA256,
  compararHashesSeguros,
} from '../utils/crypto.util';

export const HASH_GENESIS = 'GENESIS_FOGON_COLOMBIANO_2026';

export interface PayloadFacturaHash {
  numero_consecutivo: string;
  pedido_id: number | null;
  usuario_id: number;
  subtotal: number;
  impuesto: number;
  descuento: number;
  total: number;
  fecha_emision: string;
}

export interface PayloadPagoHash {
  factura_id: number;
  usuario_id: number;
  monto: number;
  metodo_pago: string;
  referencia_pago: string;
  comprobante_hash: string;
  fecha_pago: string;
}

export function normalizarFechaIsoHash(fecha: Date | string): string {
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha;
  // Precisión a segundos en UTC para evitar discrepancias de microsegundos en PostgreSQL
  return d.toISOString().slice(0, 19) + 'Z';
}

export function generarHashFactura(hashAnterior: string, p: PayloadFacturaHash): string {
  return calcularHashEncadenado(hashAnterior, {
    descuento: Number(Number(p.descuento).toFixed(2)),
    fecha_emision: normalizarFechaIsoHash(p.fecha_emision),
    impuesto: Number(Number(p.impuesto).toFixed(2)),
    numero_consecutivo: p.numero_consecutivo,
    pedido_id: p.pedido_id ?? 0,
    subtotal: Number(Number(p.subtotal).toFixed(2)),
    total: Number(Number(p.total).toFixed(2)),
    usuario_id: Number(p.usuario_id),
  });
}

export function generarHashPago(hashAnterior: string, p: PayloadPagoHash): string {
  return calcularHashEncadenado(hashAnterior, {
    comprobante_hash: p.comprobante_hash || 'SIN_COMPROBANTE',
    factura_id: Number(p.factura_id),
    fecha_pago: normalizarFechaIsoHash(p.fecha_pago),
    metodo_pago: p.metodo_pago,
    monto: Number(Number(p.monto).toFixed(2)),
    referencia_pago: p.referencia_pago || '',
    usuario_id: Number(p.usuario_id),
  });
}

export function generarHashPedido(p: {
  usuario_id: number;
  canal: string;
  subtotal: number;
  fecha_pedido: Date | string;
}): string {
  return calcularHashEncadenado('PEDIDO', {
    canal: p.canal,
    fecha_pedido: normalizarFechaIsoHash(p.fecha_pedido),
    subtotal: Number(Number(p.subtotal).toFixed(2)),
    usuario_id: Number(p.usuario_id),
  });
}

export function calcularHashComprobante(contenido?: string | null, referencia?: string | null): string {
  const base = (contenido && contenido.trim()) || (referencia && referencia.trim()) || 'EFECTIVO_CAJA';
  return calcularSHA256(base);
}

export async function obtenerUltimoHashFactura(client?: PoolClient): Promise<string> {
  const runner = client ?? pool;
  const { rows } = await runner.query<{ hash_actual: string }>(
    `SELECT hash_actual FROM facturas ORDER BY id DESC LIMIT 1`
  );
  return rows[0]?.hash_actual ?? HASH_GENESIS;
}

export async function obtenerUltimoHashPago(client?: PoolClient): Promise<string> {
  const runner = client ?? pool;
  const { rows } = await runner.query<{ hash_actual: string }>(
    `SELECT hash_actual FROM pagos ORDER BY id DESC LIMIT 1`
  );
  return rows[0]?.hash_actual ?? HASH_GENESIS;
}

export interface ResultadoBloqueIntegridad {
  id: number;
  referencia: string;
  valido: boolean;
  enlace_previo_valido: boolean;
  hash_contenido_valido: boolean;
  comprobante_valido?: boolean;
  hash_anterior: string;
  hash_esperado_anterior: string;
  hash_actual: string;
  hash_recalculado: string;
  motivos: string[];
  fecha: string;
  monto: number;
}

export interface ReporteCadenaIntegridad {
  entidad: 'facturas' | 'pagos';
  integra: boolean;
  total_bloques: number;
  bloques_validos: number;
  bloques_alterados: number;
  primer_bloque_corrupto_id: number | null;
  bloques: ResultadoBloqueIntegridad[];
}

/**
 * Recorre TODA la cadena de facturas desde el bloque génesis y detecta cualquier
 * alteración en montos, impuestos, descuentos, consecutivos o eslabones previos.
 */
export async function verificarCadenaFacturas(): Promise<ReporteCadenaIntegridad> {
  const { rows } = await pool.query(
    `SELECT id, numero_consecutivo, pedido_id, usuario_id, subtotal, impuesto,
            descuento, total, hash_anterior, hash_actual, fecha_emision
       FROM facturas
      ORDER BY id ASC`
  );

  let hashEsperadoPrevio = HASH_GENESIS;
  let validos = 0;
  let alterados = 0;
  let primerCorrupto: number | null = null;
  const bloques: ResultadoBloqueIntegridad[] = [];

  for (const row of rows) {
    const enlaceValido = compararHashesSeguros(row.hash_anterior, hashEsperadoPrevio);
    const hashRecalculado = generarHashFactura(row.hash_anterior, {
      numero_consecutivo: row.numero_consecutivo,
      pedido_id: row.pedido_id,
      usuario_id: Number(row.usuario_id),
      subtotal: Number(row.subtotal),
      impuesto: Number(row.impuesto),
      descuento: Number(row.descuento),
      total: Number(row.total),
      fecha_emision: row.fecha_emision,
    });
    const hashContenidoValido = compararHashesSeguros(row.hash_actual, hashRecalculado);
    const motivos: string[] = [];

    if (!enlaceValido) {
      motivos.push('Ruptura de encadenamiento: hash_anterior no coincide con el bloque precedente');
    }
    if (!hashContenidoValido) {
      motivos.push('Alteración detectada: los datos de la factura no coinciden con su sello HMAC-SHA256');
    }

    const valido = enlaceValido && hashContenidoValido;
    if (valido) validos++;
    else {
      alterados++;
      if (primerCorrupto === null) primerCorrupto = row.id;
    }

    bloques.push({
      id: row.id,
      referencia: row.numero_consecutivo,
      valido,
      enlace_previo_valido: enlaceValido,
      hash_contenido_valido: hashContenidoValido,
      hash_anterior: row.hash_anterior,
      hash_esperado_anterior: hashEsperadoPrevio,
      hash_actual: row.hash_actual,
      hash_recalculado: hashRecalculado,
      motivos,
      fecha: normalizarFechaIsoHash(row.fecha_emision),
      monto: Number(row.total),
    });

    hashEsperadoPrevio = row.hash_actual;
  }

  return {
    entidad: 'facturas',
    integra: alterados === 0,
    total_bloques: rows.length,
    bloques_validos: validos,
    bloques_alterados: alterados,
    primer_bloque_corrupto_id: primerCorrupto,
    bloques,
  };
}

/**
 * Recorre TODA la cadena de pagos y valida además que el hash del comprobante
 * corresponda al archivo/referencia almacenada.
 */
export async function verificarCadenaPagos(): Promise<ReporteCadenaIntegridad> {
  const { rows } = await pool.query(
    `SELECT id, factura_id, usuario_id, monto, metodo_pago, referencia_pago,
            comprobante_contenido, comprobante_hash, hash_anterior, hash_actual, fecha_pago
       FROM pagos
      ORDER BY id ASC`
  );

  let hashEsperadoPrevio = HASH_GENESIS;
  let validos = 0;
  let alterados = 0;
  let primerCorrupto: number | null = null;
  const bloques: ResultadoBloqueIntegridad[] = [];

  for (const row of rows) {
    const enlaceValido = compararHashesSeguros(row.hash_anterior, hashEsperadoPrevio);
    const hashComprobanteCalculado = calcularHashComprobante(row.comprobante_contenido, row.referencia_pago);
    const comprobanteValido = !row.comprobante_hash
      ? true
      : compararHashesSeguros(row.comprobante_hash, hashComprobanteCalculado);

    const hashRecalculado = generarHashPago(row.hash_anterior, {
      factura_id: Number(row.factura_id),
      usuario_id: Number(row.usuario_id),
      monto: Number(row.monto),
      metodo_pago: row.metodo_pago,
      referencia_pago: row.referencia_pago || '',
      comprobante_hash: row.comprobante_hash || 'SIN_COMPROBANTE',
      fecha_pago: row.fecha_pago,
    });
    const hashContenidoValido = compararHashesSeguros(row.hash_actual, hashRecalculado);

    const motivos: string[] = [];
    if (!enlaceValido) {
      motivos.push('Ruptura de encadenamiento: hash_anterior no coincide con el pago previo');
    }
    if (!hashContenidoValido) {
      motivos.push('Alteración detectada: los datos del pago fueron modificados respecto al hash encadenado');
    }
    if (!comprobanteValido) {
      motivos.push('Comprobante fraudulento o modificado: el SHA-256 del comprobante no coincide');
    }

    const valido = enlaceValido && hashContenidoValido && comprobanteValido;
    if (valido) validos++;
    else {
      alterados++;
      if (primerCorrupto === null) primerCorrupto = row.id;
    }

    bloques.push({
      id: row.id,
      referencia: `PAGO-${String(row.id).padStart(6, '0')} (Fac #${row.factura_id})`,
      valido,
      enlace_previo_valido: enlaceValido,
      hash_contenido_valido: hashContenidoValido,
      comprobante_valido: comprobanteValido,
      hash_anterior: row.hash_anterior,
      hash_esperado_anterior: hashEsperadoPrevio,
      hash_actual: row.hash_actual,
      hash_recalculado: hashRecalculado,
      motivos,
      fecha: normalizarFechaIsoHash(row.fecha_pago),
      monto: Number(row.monto),
    });

    hashEsperadoPrevio = row.hash_actual;
  }

  return {
    entidad: 'pagos',
    integra: alterados === 0,
    total_bloques: rows.length,
    bloques_validos: validos,
    bloques_alterados: alterados,
    primer_bloque_corrupto_id: primerCorrupto,
    bloques,
  };
}

export async function verificarIntegridadCompleta() {
  const [facturas, pagos, pedidosRes] = await Promise.all([
    verificarCadenaFacturas(),
    verificarCadenaPagos(),
    pool.query(`SELECT id, usuario_id, canal, subtotal, fecha_pedido, hash_integridad FROM pedidos ORDER BY id ASC`),
  ]);

  let pedidosValidos = 0;
  let pedidosAlterados = 0;
  for (const p of pedidosRes.rows) {
    if (!p.hash_integridad) {
      pedidosValidos++;
      continue;
    }
    const esperado = generarHashPedido({
      usuario_id: Number(p.usuario_id),
      canal: p.canal,
      subtotal: Number(p.subtotal),
      fecha_pedido: p.fecha_pedido,
    });
    if (compararHashesSeguros(p.hash_integridad, esperado)) pedidosValidos++;
    else pedidosAlterados++;
  }

  return {
    integra_global: facturas.integra && pagos.integra && pedidosAlterados === 0,
    verificado_en: new Date().toISOString(),
    facturas,
    pagos,
    pedidos: {
      total: pedidosRes.rows.length,
      validos: pedidosValidos,
      alterados: pedidosAlterados,
      integra: pedidosAlterados === 0,
    },
  };
}

/**
 * Recalcula y re-encadena limpiamente las cadenas (útil tras probar una simulación de alteración).
 */
export async function repararCadenasIntegridad() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: facs } = await client.query(
      `SELECT id, numero_consecutivo, pedido_id, usuario_id, subtotal, impuesto, descuento, total, fecha_emision
         FROM facturas ORDER BY id ASC`
    );
    let prevFac = HASH_GENESIS;
    for (const f of facs) {
      const nuevoHash = generarHashFactura(prevFac, {
        numero_consecutivo: f.numero_consecutivo,
        pedido_id: f.pedido_id,
        usuario_id: Number(f.usuario_id),
        subtotal: Number(f.subtotal),
        impuesto: Number(f.impuesto),
        descuento: Number(f.descuento),
        total: Number(f.total),
        fecha_emision: f.fecha_emision,
      });
      await client.query(`UPDATE facturas SET hash_anterior = $2, hash_actual = $3 WHERE id = $1`, [
        f.id,
        prevFac,
        nuevoHash,
      ]);
      prevFac = nuevoHash;
    }

    const { rows: pags } = await client.query(
      `SELECT id, factura_id, usuario_id, monto, metodo_pago, referencia_pago, comprobante_contenido, fecha_pago
         FROM pagos ORDER BY id ASC`
    );
    let prevPag = HASH_GENESIS;
    for (const p of pags) {
      const compHash = calcularHashComprobante(p.comprobante_contenido, p.referencia_pago);
      const nuevoHash = generarHashPago(prevPag, {
        factura_id: Number(p.factura_id),
        usuario_id: Number(p.usuario_id),
        monto: Number(p.monto),
        metodo_pago: p.metodo_pago,
        referencia_pago: p.referencia_pago || '',
        comprobante_hash: compHash,
        fecha_pago: p.fecha_pago,
      });
      await client.query(
        `UPDATE pagos SET comprobante_hash = $2, hash_anterior = $3, hash_actual = $4 WHERE id = $1`,
        [p.id, compHash, prevPag, nuevoHash]
      );
      prevPag = nuevoHash;
    }

    await client.query('COMMIT');
    return { facturas_reparadas: facs.length, pagos_reparados: pags.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

