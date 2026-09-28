import { Request, Response } from 'express';
import { pool } from '../db/pool';
import { detectarYRegistrarAnomalia } from '../repositories/slidingWindow.repository';


const TOKEN_PROGRAMADO = process.env.APP_API_TOKEN || "5813659858";

export async function crearTransaccionConUsuario(req: Request, res: Response) {
  // 1. Obtener el token enviado en la cabecera HTTP 'x-api-token' o 'authorization'
  const tokenEnviado = req.headers['x-api-token'] || req.body.token;

  console.log("Token recibido en Backend:", tokenEnviado);
  console.log("Token esperado en Backend:", TOKEN_PROGRAMADO);
  // 2. VALIDACIÓN ESTRICTA: Si no coincide con el hash programado, rechazar inmediatamente
  if (!tokenEnviado || tokenEnviado !== TOKEN_PROGRAMADO) {
    return res.status(401).json({ 
      error: 'Acceso no autorizado: El token/hash enviado es inválido o no existe.' 
    });
  }
  const client = await pool.connect();

  try {
    

    const { 
      usuario_nombre, 
      usuario_email, 
      valor, 
      fecha_txn, 
      estado, 
      metodo_pago, 
      hash 
    } = req.body;

    // Validación de datos obligatorios
    if (!usuario_nombre || !usuario_email || !valor || !fecha_txn || !estado) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    // Iniciar transacción de base de datos
    await client.query('BEGIN');

    // 1. Verificar si el usuario ya existe por email o crear uno nuevo
    let usuarioId: number;

    const existeUsuario = await client.query(
      `SELECT id FROM usuarios WHERE email = $1`,
      [usuario_email]
    );

    if (existeUsuario.rows.length > 0) {
      usuarioId = existeUsuario.rows[0].id;
    } else {
      const nuevoUsuario = await client.query(
        `INSERT INTO usuarios (nombre, email, fecha_creacion, fecha_actualizacion)
         VALUES ($1, $2, NOW(), NOW())
         RETURNING id`,
        [usuario_nombre, usuario_email]
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
      [usuarioId, valor, fecha_txn, estado, hash || null, metodo_pago || null]
    );

    // Confirmar la transacción
    await client.query('COMMIT');

    let anomalia = null;
    let advertencia: string | null = null;
    try {
      anomalia = await detectarYRegistrarAnomalia(
        usuarioId,
        nuevaTransaccion.rows[0].id,
        Number(nuevaTransaccion.rows[0].valor),
        fecha_txn
      );
    } catch (error) {
      console.error('Error al detectar anomalías:', error);
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
    console.error('Error al procesar la transacción:', error);
    return res.status(500).json({ error: 'Error interno al guardar los datos' });
  } finally {
    client.release();
  }
}