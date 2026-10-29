import { Request, Response } from 'express';
import { createHmac ,timingSafeEqual } from 'crypto';
import { pool } from '../db/pool';
import { detectarYRegistrarAnomalia } from '../repositories/slidingWindow.repository';
import { logger } from '../utils/logger';


const MI_TOKEN_HASH = process.env.APP_API_TOKEN as string; 


function generarHashTransaccion(payload: Record<string, unknown>): string {
  const texto = [
    payload.user ?? '',
    payload.date ?? '',
    Number(payload.value ?? 0),
    payload.paymentMethod ?? '',
  ].join('|');

  console.log(texto);
  console.log(MI_TOKEN_HASH);
  console.log(createHmac('sha256', MI_TOKEN_HASH).update(texto).digest('hex'))
  

  return createHmac('sha256', MI_TOKEN_HASH).update(texto).digest('hex');
  
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

    logger.info('Transacciones consultadas correctamente', {
      total: result.rowCount,
      filtros: { usuario_id, usuario_email, estado, limite, offset }
    });

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
    const { 
      hash,
      ...datospeticion
    } = req.body;

    const{
      user,
      date,
      value,
      paymentMethod,
    } =datospeticion

    
    if (!hash) {
      return res.status(401).json({
        error: 'Hash inválido: el valor del hash no coincide con los datos de la transacción.'
      });
    }
    
    const hashEsperado = generarHashTransaccion(datospeticion).trim();

    const esValido = timingSafeEqual(Buffer.from(hash), Buffer.from(hashEsperado));

    if (!esValido) {
      logger.warn('Hash inválido para la transacción recibida', {
        hashRecibido: hash
      });
      return res.status(401).json({
        error: 'Hash inválido: el valor del hash no coincide con los datos de la transacción.'
      });
    } 
    
    logger.info('Datos recibidos para registrar transacción', {
      user,
      date,
      value,
      paymentMethod,
      hash: 'validado'
    });

    // Validación de datos obligatorios
    if (!user|| !value || !date) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    // Iniciar transacción de base de datos
    await client.query('BEGIN');

    // 1. Verificar si el usuario ya existe por email o crear uno nuevo
    let usuarioId: number;

    const existeUsuario = await client.query(
      `SELECT id FROM usuarios WHERE email = $1`,
      [user]
    );

    if (existeUsuario.rows.length > 0) {
      usuarioId = existeUsuario.rows[0].id;
    } else {
      const nuevoUsuario = await client.query(
        `INSERT INTO usuarios (nombre, email, fecha_creacion, fecha_actualizacion)
         VALUES ($1, $2, NOW(), NOW())
         RETURNING id`,
        [user, user]
      );
      usuarioId = nuevoUsuario.rows[0].id;
    }

    // 2. Insertar la Transacción vinculada al usuario_id
    const nuevaTransaccion = await client.query(
      `INSERT INTO transacciones 
        (usuario_id, valor, fecha_txn, estado, hash, metodo_pago, fecha_creacion, fecha_actualizacion)
       VALUES 
        ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [usuarioId, value, date, hash || null, paymentMethod || null]
    );

    // Confirmar la transacción
    await client.query('COMMIT');

    logger.info('Transacción insertada en base de datos', {
      transaccion: nuevaTransaccion.rows[0]
    });

    let anomalia = null;
    let advertencia: string | null = null;
    try {
      anomalia = await detectarYRegistrarAnomalia(
        usuarioId,
        nuevaTransaccion.rows[0].id,
        Number(nuevaTransaccion.rows[0].valor),
        date
      );
    } catch (error) {
      logger.error('Error al detectar anomalías', { error, transaccionId: nuevaTransaccion.rows[0].id });
      advertencia = 'La transacción se guardó, pero no se pudo evaluar la detección de anomalías.';
    }

    return res.status(201).json({
      mensaje: 'Usuario y transacción procesados correctamente',
      transaccion: nuevaTransaccion.rows[0],
      usuario_id: usuarioId,
      anomalia,
      advertencia
    });

  } catch (error) {
    // Si algo falla, revertimos todos los cambios
    await client.query('ROLLBACK');
    logger.error('Error al procesar la transacción', { error, usuario_email: req.body?.usuario_email });
    return res.status(500).json({ error: 'Error interno al guardar los datos' });
  } finally {
    client.release();
  }
}