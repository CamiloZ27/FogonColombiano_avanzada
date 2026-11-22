import { Request, Response, Router } from 'express';
import { pool } from '../db/pool';
import {
  autenticarJWT,
  registrarAuditoria,
  requerirPermiso,
} from '../middleware/auth.middleware';
import {
  limpiarNombreLegible,
  limpiarPrecio,
  normalizarCanal,
  normalizarMetodoPago,
  normalizarTextoClave,
} from '../services/calidad.service';
import {
  calcularHashComprobante,
  generarHashFactura,
  generarHashPago,
  generarHashPedido,
  obtenerUltimoHashFactura,
  obtenerUltimoHashPago,
} from '../services/integridad.service';
import { clasificarOperacionFraude } from '../services/iaKeras.service';
import { detectarYRegistrarAnomalia } from '../repositories/slidingWindow.repository';

export const operacionRouter = Router();

// Todas las rutas operativas requieren JWT Bearer Token
operacionRouter.use(autenticarJWT);

// =============================================================================
// 1. CRUD DE CATEGORÍAS
// =============================================================================

operacionRouter.get('/categorias', requerirPermiso('catalogo:ver'), async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, COUNT(i.id)::int AS total_items
         FROM categorias c
         LEFT JOIN items i ON i.categoria_id = c.id
        GROUP BY c.id
        ORDER BY c.nombre ASC`
    );
    return res.json({ total: rows.length, categorias: rows });
  } catch (err) {
    console.error('[operacion/categorias GET]', err);
    return res.status(500).json({ error: 'Error listando categorías.' });
  }
});

operacionRouter.post('/categorias', requerirPermiso('catalogo:crud'), async (req: Request, res: Response) => {
  try {
    const nombre = limpiarNombreLegible(req.body?.nombre);
    const descripcion = String(req.body?.descripcion ?? '').trim();
    if (!nombre || nombre.length < 2) {
      return res.status(400).json({ error: 'El nombre de la categoría debe tener mínimo 2 caracteres.' });
    }
    const norm = normalizarTextoClave(nombre);
    const existe = await pool.query(`SELECT id, nombre FROM categorias WHERE nombre_normalizado = $1`, [norm]);
    if (existe.rows.length > 0) {
      return res.status(409).json({
        error: `Ya existe una categoría equivalente ('${existe.rows[0].nombre}'). Limpieza automática previno duplicado.`,
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO categorias (nombre, nombre_normalizado, descripcion)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [nombre, norm, descripcion]
    );
    await registrarAuditoria(req, 'CREAR_CATEGORIA', `/api/operacion/categorias/${rows[0].id}`, { nombre });
    return res.status(201).json({ categoria: rows[0] });
  } catch (err) {
    console.error('[operacion/categorias POST]', err);
    return res.status(500).json({ error: 'Error creando categoría.' });
  }
});

operacionRouter.put('/categorias/:id', requerirPermiso('catalogo:crud'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });

    const nombre = limpiarNombreLegible(req.body?.nombre);
    const descripcion = String(req.body?.descripcion ?? '').trim();
    const activa = req.body?.activa !== undefined ? Boolean(req.body.activa) : true;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido.' });

    const norm = normalizarTextoClave(nombre);
    const dup = await pool.query(`SELECT id FROM categorias WHERE nombre_normalizado = $1 AND id <> $2`, [norm, id]);
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: 'Ya existe otra categoría con un nombre equivalente.' });
    }

    const { rows } = await pool.query(
      `UPDATE categorias
          SET nombre = $2, nombre_normalizado = $3, descripcion = $4, activa = $5, fecha_actualizacion = NOW()
        WHERE id = $1
        RETURNING *`,
      [id, nombre, norm, descripcion, activa]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Categoría no encontrada.' });
    return res.json({ categoria: rows[0] });
  } catch (err) {
    console.error('[operacion/categorias PUT]', err);
    return res.status(500).json({ error: 'Error actualizando categoría.' });
  }
});

operacionRouter.delete('/categorias/:id', requerirPermiso('catalogo:crud'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const items = await pool.query(`SELECT COUNT(*)::int AS n FROM items WHERE categoria_id = $1`, [id]);
    if (items.rows[0].n > 0) {
      return res.status(409).json({ error: 'No se puede eliminar la categoría porque tiene ítems asociados.' });
    }
    const { rows } = await pool.query(`DELETE FROM categorias WHERE id = $1 RETURNING id, nombre`, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Categoría no encontrada.' });
    return res.json({ mensaje: 'Categoría eliminada.', categoria: rows[0] });
  } catch (err) {
    console.error('[operacion/categorias DELETE]', err);
    return res.status(500).json({ error: 'Error eliminando categoría.' });
  }
});

// =============================================================================
// 2. CRUD DE ÍTEMS / PRODUCTOS CON INVENTARIO
// =============================================================================

operacionRouter.get('/items', requerirPermiso('catalogo:ver'), async (req: Request, res: Response) => {
  try {
    const soloActivos = req.query.activos === 'true';
    const { rows } = await pool.query(
      `SELECT i.*, c.nombre AS categoria_nombre
         FROM items i
         JOIN categorias c ON c.id = i.categoria_id
        ${soloActivos ? 'WHERE i.activo = TRUE' : ''}
        ORDER BY c.nombre ASC, i.nombre ASC`
    );
    return res.json({
      total: rows.length,
      items: rows.map((r) => ({ ...r, precio: Number(r.precio) })),
    });
  } catch (err) {
    console.error('[operacion/items GET]', err);
    return res.status(500).json({ error: 'Error consultando ítems.' });
  }
});

operacionRouter.post('/items', requerirPermiso('catalogo:crud'), async (req: Request, res: Response) => {
  try {
    const categoriaId = Number(req.body?.categoria_id);
    const nombre = limpiarNombreLegible(req.body?.nombre);
    const descripcion = String(req.body?.descripcion ?? '').trim();
    const { valor: precio, fueCorregido } = limpiarPrecio(req.body?.precio);
    const stock = Math.max(0, Math.floor(Number(req.body?.stock ?? 20)));
    const stockMinimo = Math.max(0, Math.floor(Number(req.body?.stock_minimo ?? 5)));
    const tiempoPrep = Math.max(1, Math.floor(Number(req.body?.tiempo_preparacion_min ?? 12)));

    if (!Number.isInteger(categoriaId) || !nombre || precio === null || precio <= 0) {
      return res.status(400).json({
        error: 'Campos inválidos: se requiere categoria_id, nombre y precio numérico > 0.',
      });
    }

    const norm = normalizarTextoClave(nombre);
    const dup = await pool.query(`SELECT id, nombre FROM items WHERE nombre_normalizado = $1`, [norm]);
    if (dup.rows.length > 0) {
      return res.status(409).json({
        error: `Ítem duplicado detectado: ya existe '${dup.rows[0].nombre}'.`,
      });
    }

    const codigo =
      String(req.body?.codigo ?? '').trim().toUpperCase() ||
      `FOG-${String(Date.now()).slice(-5)}`;

    const { rows } = await pool.query(
      `INSERT INTO items
         (categoria_id, codigo, nombre, nombre_normalizado, descripcion, precio, stock, stock_minimo, tiempo_preparacion_min)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [categoriaId, codigo, nombre, norm, descripcion, precio, stock, stockMinimo, tiempoPrep]
    );

    await registrarAuditoria(req, 'CREAR_ITEM', `/api/operacion/items/${rows[0].id}`, { nombre, precio, stock });

    return res.status(201).json({
      mensaje: fueCorregido ? 'Ítem creado (precio sanitizado automáticamente).' : 'Ítem creado correctamente.',
      item: { ...rows[0], precio: Number(rows[0].precio) },
    });
  } catch (err) {
    console.error('[operacion/items POST]', err);
    return res.status(500).json({ error: 'Error creando ítem.' });
  }
});

operacionRouter.put('/items/:id', requerirPermiso('catalogo:crud'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });

    const actualRes = await pool.query(`SELECT * FROM items WHERE id = $1`, [id]);
    const actual = actualRes.rows[0];
    if (!actual) return res.status(404).json({ error: 'Ítem no encontrado.' });

    const nombre = req.body?.nombre ? limpiarNombreLegible(req.body.nombre) : actual.nombre;
    const norm = normalizarTextoClave(nombre);
    const { valor: precioLimpio } =
      req.body?.precio !== undefined ? limpiarPrecio(req.body.precio) : { valor: Number(actual.precio) };
    if (precioLimpio === null || precioLimpio <= 0) {
      return res.status(400).json({ error: 'Precio inválido.' });
    }

    const categoriaId = req.body?.categoria_id ? Number(req.body.categoria_id) : actual.categoria_id;
    const stock = req.body?.stock !== undefined ? Math.max(0, Math.floor(Number(req.body.stock))) : actual.stock;
    const descripcion = req.body?.descripcion !== undefined ? String(req.body.descripcion).trim() : actual.descripcion;
    const activo = req.body?.activo !== undefined ? Boolean(req.body.activo) : actual.activo;

    const { rows } = await pool.query(
      `UPDATE items
          SET categoria_id = $2, nombre = $3, nombre_normalizado = $4, descripcion = $5,
              precio = $6, stock = $7, activo = $8, fecha_actualizacion = NOW()
        WHERE id = $1
        RETURNING *`,
      [id, categoriaId, nombre, norm, descripcion, precioLimpio, stock, activo]
    );

    return res.json({ item: { ...rows[0], precio: Number(rows[0].precio) } });
  } catch (err) {
    console.error('[operacion/items PUT]', err);
    return res.status(500).json({ error: 'Error actualizando ítem.' });
  }
});

operacionRouter.delete('/items/:id', requerirPermiso('catalogo:crud'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await pool.query(
      `UPDATE items SET activo = FALSE, fecha_actualizacion = NOW() WHERE id = $1 RETURNING id, nombre, activo`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Ítem no encontrado.' });
    return res.json({ mensaje: 'Ítem desactivado del catálogo.', item: rows[0] });
  } catch (err) {
    console.error('[operacion/items DELETE]', err);
    return res.status(500).json({ error: 'Error desactivando ítem.' });
  }
});

// =============================================================================
// 3. PEDIDOS MULTI-ÍTEM CON CANAL, ESTADO Y DESCUENTO AUTOMÁTICO DE INVENTARIO
// =============================================================================

operacionRouter.get('/pedidos', requerirPermiso('pedidos:ver'), async (req: Request, res: Response) => {
  try {
    const esCliente = req.usuario!.rol === 'cliente';
    const params: unknown[] = [];
    const where = esCliente ? 'WHERE p.usuario_id = $1' : '';
    if (esCliente) params.push(req.usuario!.id);

    const { rows } = await pool.query(
      `SELECT p.*, u.nombre AS cliente_nombre, u.email AS cliente_email,
              emp.nombre AS atendido_por_nombre,
              f.id AS factura_id, f.numero_consecutivo AS factura_numero,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', pi.id,
                    'item_id', pi.item_id,
                    'nombre', i.nombre,
                    'cantidad', pi.cantidad,
                    'precio_unitario', pi.precio_unitario::float,
                    'subtotal', pi.subtotal::float
                  )
                ) FILTER (WHERE pi.id IS NOT NULL),
                '[]'::json
              ) AS items
         FROM pedidos p
         JOIN usuarios u ON u.id = p.usuario_id
         LEFT JOIN usuarios emp ON emp.id = p.atendido_por
         LEFT JOIN facturas f ON f.pedido_id = p.id
         LEFT JOIN pedido_items pi ON pi.pedido_id = p.id
         LEFT JOIN items i ON i.id = pi.item_id
        ${where}
        GROUP BY p.id, u.nombre, u.email, emp.nombre, f.id, f.numero_consecutivo
        ORDER BY p.fecha_pedido DESC
        LIMIT 100`,
      params
    );

    return res.json({
      total: rows.length,
      pedidos: rows.map((r) => ({ ...r, subtotal: Number(r.subtotal) })),
    });
  } catch (err) {
    console.error('[operacion/pedidos GET]', err);
    return res.status(500).json({ error: 'Error consultando pedidos.' });
  }
});

operacionRouter.post('/pedidos', requerirPermiso('pedidos:crear'), async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const canalNorm = normalizarCanal(req.body?.canal ?? 'presencial');
    if (!canalNorm) {
      return res.status(400).json({ error: 'Canal inválido. Use: presencial | web | app | domicilio.' });
    }

    const itemsReq: Array<{ item_id: number; cantidad: number }> = Array.isArray(req.body?.items)
      ? req.body.items
      : [];
    if (itemsReq.length === 0) {
      return res.status(400).json({ error: 'Un pedido debe incluir al menos un ítem.' });
    }

    // Cliente solo puede crear pedidos para sí mismo; personal puede elegir usuario_id
    const clienteId =
      req.usuario!.rol === 'cliente'
        ? req.usuario!.id
        : Number(req.body?.usuario_id || req.usuario!.id);

    const observaciones = String(req.body?.observaciones ?? '').trim();

    await client.query('BEGIN');

    // Validar stock y descontar inventario atómicamente con bloqueo FOR UPDATE
    let subtotalPedido = 0;
    const lineasPreparadas: Array<{ item_id: number; nombre: string; cantidad: number; precio: number; subtotal: number }> = [];

    for (const linea of itemsReq) {
      const itemId = Number(linea.item_id);
      const cantidad = Math.floor(Number(linea.cantidad));
      if (!Number.isInteger(itemId) || !Number.isInteger(cantidad) || cantidad <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Cada línea del pedido requiere item_id y cantidad > 0.' });
      }

      const itemRes = await client.query(
        `SELECT id, nombre, precio, stock, activo FROM items WHERE id = $1 FOR UPDATE`,
        [itemId]
      );
      const item = itemRes.rows[0];
      if (!item || !item.activo) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `El ítem #${itemId} no existe o está inactivo.` });
      }
      if (Number(item.stock) < cantidad) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Stock insuficiente para '${item.nombre}'. Disponible: ${item.stock}, solicitado: ${cantidad}.`,
        });
      }

      const precio = Number(item.precio);
      const subLinea = Math.round(precio * cantidad * 100) / 100;
      subtotalPedido += subLinea;

      // Descontar inventario
      await client.query(`UPDATE items SET stock = stock - $2, fecha_actualizacion = NOW() WHERE id = $1`, [
        itemId,
        cantidad,
      ]);

      lineasPreparadas.push({ item_id: itemId, nombre: item.nombre, cantidad, precio, subtotal: subLinea });
    }

    const fechaPedido = new Date();
    const hashIntegridad = generarHashPedido({
      usuario_id: clienteId,
      canal: canalNorm,
      subtotal: subtotalPedido,
      fecha_pedido: fechaPedido,
    });

    const pedIns = await client.query(
      `INSERT INTO pedidos (usuario_id, atendido_por, canal, estado, subtotal, observaciones, hash_integridad, fecha_pedido)
       VALUES ($1, $2, $3, 'solicitado', $4, $5, $6, $7)
       RETURNING *`,
      [clienteId, req.usuario!.id, canalNorm, subtotalPedido, observaciones, hashIntegridad, fechaPedido]
    );
    const pedido = pedIns.rows[0];

    for (const l of lineasPreparadas) {
      await client.query(
        `INSERT INTO pedido_items (pedido_id, item_id, cantidad, precio_unitario, subtotal)
         VALUES ($1, $2, $3, $4, $5)`,
        [pedido.id, l.item_id, l.cantidad, l.precio, l.subtotal]
      );
    }

    await client.query('COMMIT');
    await registrarAuditoria(req, 'CREAR_PEDIDO', `/api/operacion/pedidos/${pedido.id}`, {
      canal: canalNorm,
      subtotal: subtotalPedido,
      items: lineasPreparadas.length,
    });

    return res.status(201).json({
      mensaje: 'Pedido creado e inventario descontado correctamente.',
      pedido: { ...pedido, subtotal: Number(pedido.subtotal), items: lineasPreparadas },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[operacion/pedidos POST]', err);
    return res.status(500).json({ error: 'Error interno al crear pedido.' });
  } finally {
    client.release();
  }
});

operacionRouter.patch('/pedidos/:id/estado', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    const nuevoEstado = String(req.body?.estado ?? '');
    const motivo = String(req.body?.motivo_anulacion ?? '').trim();
    const estadosValidos = ['solicitado', 'en_proceso', 'listo', 'entregado', 'anulado'];
    if (!Number.isInteger(id) || !estadosValidos.includes(nuevoEstado)) {
      return res.status(400).json({ error: `Estado inválido. Use: ${estadosValidos.join(' | ')}` });
    }

    if (nuevoEstado === 'anulado' && !req.usuario!.permisos.includes('pedidos:anular')) {
      return res.status(403).json({ error: 'Su rol no tiene permiso para anular pedidos.' });
    }
    if (
      nuevoEstado !== 'anulado' &&
      !req.usuario!.permisos.includes('pedidos:cocina') &&
      !req.usuario!.permisos.includes('pedidos:crear')
    ) {
      return res.status(403).json({ error: 'Su rol no tiene permiso para cambiar el estado operativo del pedido.' });
    }

    await client.query('BEGIN');
    const pedRes = await client.query(`SELECT * FROM pedidos WHERE id = $1 FOR UPDATE`, [id]);
    const pedido = pedRes.rows[0];
    if (!pedido) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }

    // Si pasa a 'anulado' y no lo estaba, devolver stock al inventario
    if (nuevoEstado === 'anulado' && pedido.estado !== 'anulado') {
      const lineas = await client.query(`SELECT item_id, cantidad FROM pedido_items WHERE pedido_id = $1`, [id]);
      for (const l of lineas.rows) {
        await client.query(`UPDATE items SET stock = stock + $2, fecha_actualizacion = NOW() WHERE id = $1`, [
          l.item_id,
          l.cantidad,
        ]);
      }
    }

    const upd = await client.query(
      `UPDATE pedidos
          SET estado = $2,
              motivo_anulacion = CASE WHEN $2 = 'anulado' THEN COALESCE(NULLIF($3, ''), 'Anulado por operador') ELSE motivo_anulacion END,
              fecha_actualizacion = NOW()
        WHERE id = $1
        RETURNING *`,
      [id, nuevoEstado, motivo]
    );

    await client.query('COMMIT');
    await registrarAuditoria(req, 'CAMBIAR_ESTADO_PEDIDO', `/api/operacion/pedidos/${id}/estado`, {
      anterior: pedido.estado,
      nuevo: nuevoEstado,
    });

    return res.json({
      mensaje:
        nuevoEstado === 'anulado'
          ? 'Pedido anulado y stock restaurado al inventario.'
          : `Estado del pedido #${id} actualizado a '${nuevoEstado}'.`,
      pedido: upd.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[operacion/pedidos PATCH estado]', err);
    return res.status(500).json({ error: 'Error cambiando estado del pedido.' });
  } finally {
    client.release();
  }
});

// =============================================================================
// 4. FACTURACIÓN CON CONSECUTIVO, IMPUESTOS, DESCUENTOS Y HASH ENCADENADO
// =============================================================================

operacionRouter.get('/facturas', requerirPermiso('facturas:ver'), async (req: Request, res: Response) => {
  try {
    const esCliente = req.usuario!.rol === 'cliente';
    const params: unknown[] = [];
    const where = esCliente ? 'WHERE f.usuario_id = $1' : '';
    if (esCliente) params.push(req.usuario!.id);

    const { rows } = await pool.query(
      `SELECT f.*, u.nombre AS cliente_nombre, u.email AS cliente_email,
              em.nombre AS emitida_por_nombre, p.canal AS pedido_canal
         FROM facturas f
         JOIN usuarios u ON u.id = f.usuario_id
         LEFT JOIN usuarios em ON em.id = f.emitida_por
         LEFT JOIN pedidos p ON p.id = f.pedido_id
        ${where}
        ORDER BY f.id DESC
        LIMIT 100`,
      params
    );

    return res.json({
      total: rows.length,
      facturas: rows.map((f) => ({
        ...f,
        subtotal: Number(f.subtotal),
        impuesto: Number(f.impuesto),
        descuento: Number(f.descuento),
        total: Number(f.total),
      })),
    });
  } catch (err) {
    console.error('[operacion/facturas GET]', err);
    return res.status(500).json({ error: 'Error consultando facturas.' });
  }
});

operacionRouter.post('/facturas', requerirPermiso('facturas:crear'), async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const pedidoId = req.body?.pedido_id ? Number(req.body.pedido_id) : null;
    const pctDescuento = Math.max(0, Math.min(90, Number(req.body?.porcentaje_descuento ?? 0)));

    await client.query('BEGIN');

    // Obtener parámetros de configuración (INC y alerta de descuento)
    const cfgRes = await client.query(
      `SELECT clave, valor FROM configuracion_sistema
        WHERE clave IN ('impuesto_inc_porcentaje', 'descuento_maximo_sin_alerta')`
    );
    const cfg = new Map(cfgRes.rows.map((r) => [r.clave, Number(r.valor)]));
    const pctImpuesto = req.body?.porcentaje_impuesto !== undefined
      ? Math.max(0, Math.min(30, Number(req.body.porcentaje_impuesto)))
      : (cfg.get('impuesto_inc_porcentaje') ?? 8);
    const maxDescSinAlerta = cfg.get('descuento_maximo_sin_alerta') ?? 15;

    let usuarioId = Number(req.body?.usuario_id || req.usuario!.id);
    let subtotal = Number(req.body?.subtotal ?? 0);

    if (pedidoId) {
      const pedRes = await client.query(`SELECT * FROM pedidos WHERE id = $1`, [pedidoId]);
      const ped = pedRes.rows[0];
      if (!ped) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `Pedido #${pedidoId} no encontrado.` });
      }
      if (ped.estado === 'anulado') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'No se puede facturar un pedido anulado.' });
      }
      const facDup = await client.query(`SELECT numero_consecutivo FROM facturas WHERE pedido_id = $1`, [pedidoId]);
      if (facDup.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `El pedido #${pedidoId} ya fue facturado (${facDup.rows[0].numero_consecutivo}).` });
      }
      usuarioId = Number(ped.usuario_id);
      subtotal = Number(ped.subtotal);
    }

    if (!Number.isFinite(subtotal) || subtotal <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Subtotal inválido o pedido vacío.' });
    }

    // Bloqueo para consecutivo y cadena de hash estrictamente secuencial
    await client.query(`LOCK TABLE facturas IN EXCLUSIVE MODE`);
    const lastRes = await client.query<{ id: number; hash_actual: string }>(
      `SELECT id, hash_actual FROM facturas ORDER BY id DESC LIMIT 1`
    );
    const siguienteNum = (lastRes.rows[0]?.id ?? 0) + 1;
    const numeroConsecutivo = `FAC-${String(siguienteNum).padStart(6, '0')}`;
    const hashAnterior = await obtenerUltimoHashFactura(client);

    const impuesto = Math.round(subtotal * (pctImpuesto / 100));
    const descuento = Math.round(subtotal * (pctDescuento / 100));
    const total = Math.max(0, Math.round((subtotal + impuesto - descuento) * 100) / 100);
    const fechaEmision = new Date();

    const hashActual = generarHashFactura(hashAnterior, {
      numero_consecutivo: numeroConsecutivo,
      pedido_id: pedidoId,
      usuario_id: usuarioId,
      subtotal,
      impuesto,
      descuento,
      total,
      fecha_emision: fechaEmision.toISOString(),
    });

    const facIns = await client.query(
      `INSERT INTO facturas
         (numero_consecutivo, pedido_id, usuario_id, emitida_por, subtotal, porcentaje_impuesto,
          impuesto, porcentaje_descuento, descuento, total, estado, hash_anterior, hash_actual, fecha_emision)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'emitida', $11, $12, $13)
       RETURNING *`,
      [
        numeroConsecutivo,
        pedidoId,
        usuarioId,
        req.usuario!.id,
        subtotal,
        pctImpuesto,
        impuesto,
        pctDescuento,
        descuento,
        total,
        hashAnterior,
        hashActual,
        fechaEmision,
      ]
    );

    await client.query('COMMIT');

    const alertaDescuento = pctDescuento > maxDescSinAlerta;
    await registrarAuditoria(req, 'EMITIR_FACTURA', `/api/operacion/facturas/${facIns.rows[0].id}`, {
      numero_consecutivo: numeroConsecutivo,
      total,
      alerta_descuento_abusivo: alertaDescuento,
    });

    return res.status(201).json({
      mensaje: alertaDescuento
        ? `Factura ${numeroConsecutivo} emitida con hash encadenado. ⚠️ Alerta: descuento (${pctDescuento}%) excede el umbral permitido (${maxDescSinAlerta}%).`
        : `Factura ${numeroConsecutivo} emitida con sello de integridad encadenado.`,
      alerta_descuento: alertaDescuento,
      factura: facIns.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[operacion/facturas POST]', err);
    return res.status(500).json({ error: 'Error generando factura.' });
  } finally {
    client.release();
  }
});

// =============================================================================
// 5. PAGOS CON COMPROBANTE ADJUNTO + HASH ENCADENADO + CLASIFICACIÓN IA FRAUDE
// =============================================================================

operacionRouter.get('/pagos', requerirPermiso('pagos:ver'), async (req: Request, res: Response) => {
  try {
    const esCliente = req.usuario!.rol === 'cliente';
    const params: unknown[] = [];
    const where = esCliente ? 'WHERE pg.usuario_id = $1' : '';
    if (esCliente) params.push(req.usuario!.id);

    const { rows } = await pool.query(
      `SELECT pg.id, pg.factura_id, f.numero_consecutivo, pg.usuario_id,
              u.nombre AS cliente_nombre, pg.monto::float AS monto, pg.metodo_pago,
              pg.referencia_pago, pg.comprobante_nombre, pg.comprobante_mime, pg.comprobante_hash,
              pg.estado, pg.hash_anterior, pg.hash_actual,
              pg.clasificacion_ia, pg.score_fraude_ia::float AS score_fraude_ia,
              pg.fecha_pago
         FROM pagos pg
         JOIN facturas f ON f.id = pg.factura_id
         JOIN usuarios u ON u.id = pg.usuario_id
        ${where}
        ORDER BY pg.id DESC
        LIMIT 100`,
      params
    );

    return res.json({ total: rows.length, pagos: rows });
  } catch (err) {
    console.error('[operacion/pagos GET]', err);
    return res.status(500).json({ error: 'Error consultando pagos.' });
  }
});

operacionRouter.post('/pagos', requerirPermiso('pagos:crear'), async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const facturaId = Number(req.body?.factura_id);
    const metodoPago = normalizarMetodoPago(req.body?.metodo_pago ?? 'efectivo');
    const referencia = String(req.body?.referencia_pago ?? `REF-${Date.now()}`).trim();
    const comprobanteNombre = String(req.body?.comprobante_nombre ?? '').trim() || null;
    const comprobanteMime = String(req.body?.comprobante_mime ?? 'text/plain').trim();
    const comprobanteContenido = String(req.body?.comprobante_contenido ?? '').trim() || null;

    if (!Number.isInteger(facturaId)) {
      return res.status(400).json({ error: 'Se requiere factura_id válido.' });
    }

    await client.query('BEGIN');
    await client.query(`LOCK TABLE pagos IN EXCLUSIVE MODE`);

    const facRes = await client.query(
      `SELECT f.*, COALESCE(p.canal, 'presencial') AS canal
         FROM facturas f
         LEFT JOIN pedidos p ON p.id = f.pedido_id
        WHERE f.id = $1`,
      [facturaId]
    );
    const factura = facRes.rows[0];
    if (!factura) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: `Factura #${facturaId} no encontrada.` });
    }
    if (req.usuario!.rol === 'cliente' && Number(factura.usuario_id) !== req.usuario!.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Solo puede pagar sus propias facturas.' });
    }
    if (factura.estado === 'pagada') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `La factura ${factura.numero_consecutivo} ya se encuentra pagada.` });
    }

    const monto = req.body?.monto !== undefined ? Number(req.body.monto) : Number(factura.total);
    if (!Number.isFinite(monto) || monto <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Monto de pago inválido.' });
    }

    // Calcular SHA-256 del comprobante y hash encadenado del pago
    const comprobanteHash = calcularHashComprobante(comprobanteContenido, referencia);
    const hashAnterior = await obtenerUltimoHashPago(client);
    const fechaPago = new Date();
    const hashActual = generarHashPago(hashAnterior, {
      factura_id: facturaId,
      usuario_id: Number(factura.usuario_id),
      monto,
      metodo_pago: metodoPago,
      referencia_pago: referencia,
      comprobante_hash: comprobanteHash,
      fecha_pago: fechaPago.toISOString(),
    });

    // Evaluar riesgo con el clasificador de fraude Keras/TensorFlow
    const promRes = await client.query<{ prom: string | null }>(
      `SELECT AVG(valor)::numeric AS prom FROM transacciones WHERE usuario_id = $1`,
      [factura.usuario_id]
    );
    const promUsuario = Number(promRes.rows[0]?.prom ?? 40000);
    const evalIA = await clasificarOperacionFraude({
      monto,
      fecha: fechaPago,
      metodo_pago: metodoPago,
      firma_valida: true,
      frecuencia_ventana: 1,
      promedio_usuario: promUsuario,
      descuento_pct: Number(factura.porcentaje_descuento || 0),
      canal: factura.canal,
    });

    const pagoIns = await client.query(
      `INSERT INTO pagos
         (factura_id, usuario_id, procesado_por, monto, metodo_pago, referencia_pago,
          comprobante_nombre, comprobante_mime, comprobante_contenido, comprobante_hash,
          estado, hash_anterior, hash_actual, clasificacion_ia, score_fraude_ia, fecha_pago)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'aprobado', $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        facturaId,
        factura.usuario_id,
        req.usuario!.id,
        monto,
        metodoPago,
        referencia,
        comprobanteNombre ?? `comprobante_${factura.numero_consecutivo}.txt`,
        comprobanteMime,
        comprobanteContenido ?? `PAGO|${factura.numero_consecutivo}|${metodoPago}|${referencia}|${monto}`,
        comprobanteHash,
        hashAnterior,
        hashActual,
        evalIA.clasificacion,
        evalIA.probabilidad_fraude,
        fechaPago,
      ]
    );
    const pago = pagoIns.rows[0];

    // Marcar factura como pagada y registrar en transacciones para analítica unificada
    await client.query(`UPDATE facturas SET estado = 'pagada', fecha_actualizacion = NOW() WHERE id = $1`, [facturaId]);

    const txnIns = await client.query(
      `INSERT INTO transacciones
         (usuario_id, valor, fecha_txn, estado, hash, metodo_pago, canal, descuento,
          clasificacion_ia, score_fraude_ia, factura_id, pago_id)
       VALUES ($1, $2, $3, 'completada', $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        factura.usuario_id,
        monto,
        fechaPago,
        hashActual,
        metodoPago,
        factura.canal,
        Number(factura.descuento || 0),
        evalIA.clasificacion,
        evalIA.probabilidad_fraude,
        facturaId,
        pago.id,
      ]
    );
    const txnId = txnIns.rows[0].id;

    // Si Keras clasificó como fraudulenta, registrar alerta en tabla anomalias
    if (evalIA.clasificacion === 'fraudulenta') {
      await client.query(
        `INSERT INTO anomalias (transaccion_id, tipo, nivel, cantidad_transacciones, ventana_segundos, estado, origen, detalle)
         VALUES ($1, 'POSIBLE_FRAUDE', $2, 1, 0, 'abierta', 'keras_fraude', $3)`,
        [txnId, evalIA.nivel_riesgo === 'critico' ? 'critico' : 'alto', evalIA.factores_detectados.join('; ')]
      );
    }

    await client.query('COMMIT');

    // También evaluar ventana deslizante
    const anomVentana = await detectarYRegistrarAnomalia(Number(factura.usuario_id), txnId, monto, fechaPago).catch(() => null);

    await registrarAuditoria(req, 'PROCESAR_PAGO', `/api/operacion/pagos/${pago.id}`, {
      factura: factura.numero_consecutivo,
      monto,
      metodo: metodoPago,
      clasificacion_ia: evalIA.clasificacion,
    });

    return res.status(201).json({
      mensaje:
        evalIA.clasificacion === 'fraudulenta'
          ? 'Pago registrado. ⚠️ Alerta: operación marcada como sospechosa para revisión.'
          : 'Pago procesado y factura conciliada correctamente.',
      pago,
      evaluacion_ia: evalIA,
      anomalia_ventana: anomVentana,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[operacion/pagos POST]', err);
    return res.status(500).json({ error: 'Error procesando pago.' });
  } finally {
    client.release();
  }
});

