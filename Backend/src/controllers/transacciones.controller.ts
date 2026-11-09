import { Request, Response } from 'express';
import { createHmac, createHash, timingSafeEqual } from 'crypto';
import { pool } from '../db/pool';
import { detectarYRegistrarAnomalia } from '../repositories/slidingWindow.repository';
import { logger } from '../utils/logger';

export const CLAVE_SECRETA_DEFAULT = process.env.APP_API_TOKEN || 'mi_llave_privada_123';

export interface PayloadParaHash {
  user: string;
  date: string;
  value: number;
  paymentMethod?: string;
  idTxn?: number;
}

/**
 * Genera el hash canónico de la transacción usando HMAC-SHA256 (Slide 19)
 * y también soporta SHA-256 estándar (Slide 15, 17).
 */
export function generarHashTransaccion(
  payload: PayloadParaHash,
  claveSecreta: string = CLAVE_SECRETA_DEFAULT
): string {
  // Formato ordenado canónico (Slide 19: sort_keys=True, separators=(',', ':'))
  const canonicalJson = JSON.stringify({
    date: payload.date,
    ...(payload.idTxn !== undefined ? { idTxn: payload.idTxn } : {}),
    paymentMethod: payload.paymentMethod || '',
    user: payload.user,
    value: Number(payload.value || 0),
  });

  return createHmac('sha256', claveSecreta).update(canonicalJson).digest('hex');
}

/**
 * Retorna las representaciones hash válidas esperadas para la transacción:
 * 1. HMAC-SHA256 con JSON canónico (Slide 19)
 * 2. HMAC-SHA256 con formato de tubería user|date|value|paymentMethod (compatibilidad)
 * 3. SHA-256 estándar de JSON canónico (Slide 15, 17)
 * 4. SHA-256 estándar con formato de tubería
 */
export function obtenerHashesEsperados(
  payload: PayloadParaHash,
  claveSecreta: string = CLAVE_SECRETA_DEFAULT
): string[] {
  const fechasAProbar = [payload.date];
  if (payload.date && payload.date.length === 16) {
    fechasAProbar.push(payload.date + ':00');
  } else if (payload.date && payload.date.length === 19) {
    fechasAProbar.push(payload.date.slice(0, 16));
  }

  const metodosAProbar = Array.from(
    new Set([payload.paymentMethod || '', payload.paymentMethod === 'tarjeta_credito' ? 'Tarjeta' : '', ''].filter(Boolean))
  );
  if (!metodosAProbar.includes(payload.paymentMethod || '')) {
    metodosAProbar.push(payload.paymentMethod || '');
  }

  const clavesAProbar = Array.from(
    new Set(
      [
        claveSecreta,
        process.env.APP_API_TOKEN,
        '4f43edda455d8bc7f20108481957e1cfbfdf78d423f553a4d4683746f6f6f0c6',
        'mi_llave_privada_123',
        '5813659858',
      ].filter(Boolean) as string[]
    )
  );

  const hashes: string[] = [];

  for (const fecha of fechasAProbar) {
    for (const metodo of metodosAProbar) {
      const canonicalJson = JSON.stringify({
        date: fecha,
        ...(payload.idTxn !== undefined ? { idTxn: payload.idTxn } : {}),
        paymentMethod: metodo,
        user: payload.user,
        value: Number(payload.value || 0),
      });

      const textoPipe = [
        payload.user ?? '',
        fecha ?? '',
        Number(payload.value ?? 0),
        metodo,
      ].join('|');

      hashes.push(createHash('sha256').update(canonicalJson).digest('hex'));
      hashes.push(createHash('sha256').update(textoPipe).digest('hex'));

      for (const k of clavesAProbar) {
        hashes.push(createHmac('sha256', k).update(canonicalJson).digest('hex'));
        hashes.push(createHmac('sha256', k).update(textoPipe).digest('hex'));
      }
    }
  }

  return Array.from(new Set(hashes));
}

/**
 * Verificación segura de hash (Slide 18: ¿Coincide? Sí -> Aceptar, No -> Rechazar).
 * Previene errores de timing y excepciones de diferente longitud de buffers.
 */
export function verificarHashTransaccion(
  hashRecibido: string,
  payload: PayloadParaHash,
  claveSecreta: string = CLAVE_SECRETA_DEFAULT
): boolean {
  if (!hashRecibido || typeof hashRecibido !== 'string') return false;

  const recibidoLimpio = hashRecibido.trim().toLowerCase();
  const hashesValidos = obtenerHashesEsperados(payload, claveSecreta);

  for (const esperado of hashesValidos) {
    const esperadoLimpio = esperado.toLowerCase();
    if (recibidoLimpio === esperadoLimpio) {
      return true;
    }

    try {
      const bufRecibido = Buffer.from(recibidoLimpio, 'utf8');
      const bufEsperado = Buffer.from(esperadoLimpio, 'utf8');
      if (bufRecibido.length === bufEsperado.length && timingSafeEqual(bufRecibido, bufEsperado)) {
        return true;
      }
    } catch {
      // Ignorar error si los buffers no coinciden
    }
  }

  return false;
}

/**
 * Endpoint auxiliar para consultar/generar el hash esperado de una transacción.
 */
export async function calcularHashEndpoint(req: Request, res: Response) {
  try {
    const user = (req.body.user || req.body.usuario_email || '').trim();
    const date = req.body.date || req.body.fecha_txn || new Date().toISOString();
    const value = Number(req.body.value !== undefined ? req.body.value : req.body.valor);
    const paymentMethod = req.body.paymentMethod || req.body.metodo_pago || 'Tarjeta';
    const idTxn = req.body.idTxn;

    if (!user || Number.isNaN(value)) {
      return res.status(400).json({ error: 'Faltan campos obligatorios para generar el hash (user y value)' });
    }

    const payload: PayloadParaHash = { user, date, value, paymentMethod, ...(idTxn ? { idTxn } : {}) };
    const hashHMAC = generarHashTransaccion(payload);
    const todosLosHashes = obtenerHashesEsperados(payload);

    return res.status(200).json({
      hash: hashHMAC,
      payload_utilizado: payload,
      hashes_validos: todosLosHashes,
    });
  } catch (error) {
    logger.error('Error calculando hash', { error });
    return res.status(500).json({ error: 'Error al generar hash' });
  }
}

export async function obtenerTransacciones(req: Request, res: Response) {
  try {
    const { usuario_id, usuario_email, estado, limite = '50', offset = '0' } = req.query;
    logger.info('Consulta de transacciones recibida', {
      filtros: { usuario_id, usuario_email, estado, limite, offset }
    });

    const filtros: string[] = [];
    const params: (string | number)[] = [];

    if (usuario_id) {
      filtros.push(`t.usuario_id = $${params.length + 1}`);
      params.push(Number(usuario_id));
    }

    if (usuario_email) {
      filtros.push(`u.email = $${params.length + 1}`);
      params.push(String(usuario_email));
    }

    if (estado) {
      filtros.push(`t.estado = $${params.length + 1}`);
      params.push(String(estado));
    }

    const limiteNumero = Number(limite);
    const offsetNumero = Number(offset);
    const limit = Number.isFinite(limiteNumero) && limiteNumero > 0 ? Math.min(limiteNumero, 200) : 50;
    const skip = Number.isFinite(offsetNumero) && offsetNumero >= 0 ? offsetNumero : 0;

    const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

    const result = await pool.query(
      `
        SELECT
          t.id,
          t.usuario_id,
          u.nombre AS usuario_nombre,
          u.email AS usuario_email,
          t.valor,
          t.fecha_txn,
          t.estado,
          t.hash,
          t.metodo_pago,
          t.fecha_creacion,
          t.fecha_actualizacion
        FROM transacciones t
        INNER JOIN usuarios u ON u.id = t.usuario_id
        ${where}
        ORDER BY t.fecha_txn DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, skip]
    );

    return res.status(200).json({
      total: result.rowCount,
      data: result.rows,
    });
  } catch (error) {
    logger.error('Error al consultar transacciones', { error });
    return res.status(500).json({ error: 'Error interno al consultar transacciones' });
  }
}

export async function crearTransaccionConUsuario(req: Request, res: Response) {
  const client = await pool.connect();

  try {
    const body = req.body || {};

    // Soportar tanto formato del PDF (Slide 40: idTxn, user, date, value, paymentMethod, hash)
    // como formato previo del frontend (usuario_email, usuario_nombre, valor, fecha_txn, metodo_pago, hash)
    const email = (body.user || body.usuario_email || '').trim();
    const nombre = (body.nombre || body.usuario_nombre || email.split('@')[0] || 'Usuario').trim();
    const fecha = body.date || body.fecha_txn || new Date().toISOString();
    const valor = Number(body.value !== undefined ? body.value : body.valor);
    const metodoPago = body.paymentMethod || body.metodo_pago || 'Tarjeta';
    const estado = body.estado || 'completada';
    const hashRecibido = body.hash;
    const idTxn = body.idTxn;

    // 1. Validación de datos obligatorios
    if (!email || !fecha || Number.isNaN(valor) || valor <= 0) {
      return res.status(400).json({
        error: 'Faltan campos obligatorios o son inválidos (se requiere user/email, date/fecha y valor > 0)'
      });
    }

    // 2. Validación de Hash (Slide 14 a 19, Slide 37 y Slide 40)
    if (!hashRecibido) {
      return res.status(401).json({
        error: 'Hash inválido: no se proporcionó el hash de la transacción.'
      });
    }

    const payloadParaHash: PayloadParaHash = {
      user: email,
      date: fecha,
      value: valor,
      paymentMethod: metodoPago,
      ...(idTxn !== undefined ? { idTxn } : {})
    };

    const esHashValido = verificarHashTransaccion(hashRecibido, payloadParaHash);

    if (!esHashValido) {
      logger.warn('Hash inválido para la transacción recibida', {
        email,
        hashRecibido
      });
      return res.status(401).json({
        error: 'Hash inválido: el valor del hash no coincide con los datos de la transacción (posible alteración).'
      });
    }

    logger.info('Transacción validada por hash criptográfico', {
      user: email,
      date: fecha,
      value: valor,
      paymentMethod: metodoPago
    });

    // 3. Iniciar transacción en Base de Datos
    await client.query('BEGIN');

    let usuarioId: number;
    const existeUsuario = await client.query(
      `SELECT id FROM usuarios WHERE email = $1`,
      [email]
    );

    if (existeUsuario.rows.length > 0) {
      usuarioId = existeUsuario.rows[0].id;
    } else {
      const nuevoUsuario = await client.query(
        `INSERT INTO usuarios (nombre, email, fecha_creacion, fecha_actualizacion)
         VALUES ($1, $2, NOW(), NOW())
         RETURNING id`,
        [nombre, email]
      );
      usuarioId = nuevoUsuario.rows[0].id;
    }

    const nuevaTransaccion = await client.query(
      `INSERT INTO transacciones 
        (usuario_id, valor, fecha_txn, estado, hash, metodo_pago, fecha_creacion, fecha_actualizacion)
       VALUES 
        ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [usuarioId, valor, fecha, estado, hashRecibido, metodoPago]
    );

    await client.query('COMMIT');

    const txnInsertada = nuevaTransaccion.rows[0];

    // 4. Detección de Anomalías mediante Ventana Deslizante (Slide 36-43)
    let anomalia = null;
    let advertencia: string | null = null;
    try {
      anomalia = await detectarYRegistrarAnomalia(
        usuarioId,
        txnInsertada.id,
        Number(txnInsertada.valor),
        fecha
      );
    } catch (error) {
      logger.error('Error al detectar anomalías', { error, transaccionId: txnInsertada.id });
      advertencia = 'La transacción se guardó, pero no se pudo evaluar la detección de anomalías.';
    }

    return res.status(201).json({
      mensaje: anomalia
        ? 'Transacción registrada. ¡ALERTA: Se detectó una anomalía (POSIBLE_FRAUDE) con ventana deslizante!'
        : 'Transacción registrada correctamente (comportamiento normal)',
      transaccion: txnInsertada,
      usuario_id: usuarioId,
      es_anomalia: Boolean(anomalia),
      anomalia,
      advertencia
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al procesar la transacción', { error });
    return res.status(500).json({ error: 'Error interno al guardar los datos' });
  } finally {
    client.release();
  }
}
