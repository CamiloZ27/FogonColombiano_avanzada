import { Request, Response, Router } from 'express';
import { pool } from '../db/pool';
import {
  autenticarJWT,
  registrarAuditoria,
  requerirPermiso,
  requerirRol,
} from '../middleware/auth.middleware';
import { esEmailValido, limpiarNombreLegible, normalizarEmail } from '../services/calidad.service';
import { CODIGOS_ROLES_VALIDOS, RolCodigo } from '../types/rbac.types';
import { hashPassword, protegerDatoSensible } from '../utils/crypto.util';

export const adminRouter = Router();

// Todas las rutas de administración exigen autenticación JWT Bearer
adminRouter.use(autenticarJWT);

// =============================================================================
// 1. ROLES PREDEFINIDOS RBAC (SOLO LECTURA — NO EDITABLES)
// =============================================================================

adminRouter.get('/roles', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.codigo, r.nombre, r.descripcion, r.permisos,
              r.nivel_acceso, r.es_sistema, r.editable,
              COUNT(u.id)::int AS usuarios_asignados
         FROM roles r
         LEFT JOIN usuarios u ON u.rol_id = r.id
        GROUP BY r.id
        ORDER BY r.nivel_acceso DESC`
    );
    return res.json({
      politica: 'Los roles del sistema son predefinidos e inmutables (editable = false). Solo se pueden asignar a usuarios desde Administración.',
      roles: rows,
    });
  } catch (err) {
    console.error('[admin/roles]', err);
    return res.status(500).json({ error: 'Error consultando roles predefinidos.' });
  }
});

// Bloqueo explícito de mutaciones sobre roles predefinidos
const rechazarMutacionRoles = (_req: Request, res: Response) =>
  res.status(403).json({
    error: 'Operación no permitida: los roles del sistema son predefinidos y no son editables ni eliminables.',
  });

adminRouter.post('/roles', rechazarMutacionRoles);
adminRouter.put('/roles/:id', rechazarMutacionRoles);
adminRouter.patch('/roles/:id', rechazarMutacionRoles);
adminRouter.delete('/roles/:id', rechazarMutacionRoles);

// =============================================================================
// 2. CRUD DE USUARIOS + ASIGNACIÓN DE ROLES + HASHING BCRYPT DE DATOS SENSIBLES
// =============================================================================

adminRouter.get('/usuarios', requerirPermiso('usuarios:ver'), async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.nombre, u.email, u.estado, u.ultimo_login,
              u.documento_enmascarado, u.telefono_enmascarado,
              (u.password_hash IS NOT NULL) AS tiene_password_bcrypt,
              (u.documento_hash IS NOT NULL) AS tiene_documento_bcrypt,
              (u.telefono_hash IS NOT NULL) AS tiene_telefono_bcrypt,
              (u.pin_autorizacion_hash IS NOT NULL) AS tiene_pin_bcrypt,
              r.id AS rol_id, r.codigo AS rol, r.nombre AS rol_nombre,
              u.fecha_creacion, u.fecha_actualizacion
         FROM usuarios u
         LEFT JOIN roles r ON r.id = u.rol_id
        ORDER BY u.id ASC`
    );
    return res.json({ total: rows.length, usuarios: rows });
  } catch (err) {
    console.error('[admin/usuarios GET]', err);
    return res.status(500).json({ error: 'Error consultando usuarios.' });
  }
});

adminRouter.post('/usuarios', requerirPermiso('usuarios:crud'), async (req: Request, res: Response) => {
  try {
    const nombre = limpiarNombreLegible(req.body?.nombre);
    const email = normalizarEmail(req.body?.email);
    const password = String(req.body?.password ?? '');
    const rolCodigo = String(req.body?.rol ?? 'cliente') as RolCodigo;
    const documento = String(req.body?.documento ?? '').trim();
    const telefono = String(req.body?.telefono ?? '').trim();
    const pin = String(req.body?.pin_autorizacion ?? '').trim();

    if (!nombre || !esEmailValido(email) || password.length < 6) {
      return res.status(400).json({
        error: 'Datos inválidos: se requiere nombre, email válido y contraseña de mínimo 6 caracteres.',
      });
    }
    if (!CODIGOS_ROLES_VALIDOS.includes(rolCodigo)) {
      return res.status(400).json({
        error: `Rol inválido '${rolCodigo}'. Roles predefinidos válidos: ${CODIGOS_ROLES_VALIDOS.join(', ')}`,
      });
    }

    const existe = await pool.query(`SELECT id FROM usuarios WHERE LOWER(email) = $1`, [email]);
    if (existe.rows.length > 0) {
      return res.status(409).json({ error: `Ya existe un usuario con el correo '${email}'.` });
    }

    const rolRes = await pool.query<{ id: number }>(`SELECT id FROM roles WHERE codigo = $1`, [rolCodigo]);
    const rolId = rolRes.rows[0]?.id;
    if (!rolId) return res.status(400).json({ error: 'Rol no encontrado en BD.' });

    const cfgRounds = await pool.query(`SELECT valor FROM configuracion_sistema WHERE clave = 'bcrypt_salt_rounds'`);
    const rounds = Math.min(12, Math.max(8, Number(cfgRounds.rows[0]?.valor ?? 10)));

    const passwordHash = await hashPassword(password, rounds);
    const docProt = await protegerDatoSensible(documento, 4, rounds);
    const telProt = await protegerDatoSensible(telefono, 4, rounds);
    const pinProt = await protegerDatoSensible(pin, 2, rounds);

    const { rows } = await pool.query(
      `INSERT INTO usuarios
         (nombre, email, password_hash, rol_id, documento_hash, documento_enmascarado,
          telefono_hash, telefono_enmascarado, pin_autorizacion_hash, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'activo')
       RETURNING id, nombre, email, estado, documento_enmascarado, telefono_enmascarado, fecha_creacion`,
      [nombre, email, passwordHash, rolId, docProt.hash, docProt.enmascarado, telProt.hash, telProt.enmascarado, pinProt.hash]
    );

    await registrarAuditoria(req, 'CREAR_USUARIO', `/api/admin/usuarios/${rows[0].id}`, { email, rol: rolCodigo });

    return res.status(201).json({
      mensaje: 'Usuario creado correctamente.',
      usuario: { ...rows[0], rol: rolCodigo },
    });
  } catch (err) {
    console.error('[admin/usuarios POST]', err);
    return res.status(500).json({ error: 'Error interno al crear usuario.' });
  }
});

adminRouter.put('/usuarios/:id', requerirPermiso('usuarios:crud'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID de usuario inválido.' });

    const actualRes = await pool.query(
      `SELECT u.*, r.codigo AS rol_codigo FROM usuarios u LEFT JOIN roles r ON r.id = u.rol_id WHERE u.id = $1`,
      [id]
    );
    const actual = actualRes.rows[0];
    if (!actual) return res.status(404).json({ error: 'Usuario no encontrado.' });

    const nombre = req.body?.nombre ? limpiarNombreLegible(req.body.nombre) : actual.nombre;
    const estado = req.body?.estado ?? actual.estado;
    if (!['activo', 'inactivo', 'bloqueado'].includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido (activo | inactivo | bloqueado).' });
    }

    let rolId = actual.rol_id;
    let nuevoRolCodigo = actual.rol_codigo;
    if (req.body?.rol && req.body.rol !== actual.rol_codigo) {
      if (!CODIGOS_ROLES_VALIDOS.includes(req.body.rol)) {
        return res.status(400).json({ error: `Rol '${req.body.rol}' no pertenece a los roles predefinidos.` });
      }
      if (actual.rol_codigo === 'admin' && req.body.rol !== 'admin') {
        const admins = await pool.query(
          `SELECT COUNT(*)::int AS n FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE r.codigo = 'admin' AND u.estado = 'activo'`
        );
        if (admins.rows[0].n <= 1) {
          return res.status(400).json({ error: 'No se puede degradar al único administrador activo del sistema.' });
        }
      }
      const rRow = await pool.query(`SELECT id FROM roles WHERE codigo = $1`, [req.body.rol]);
      rolId = rRow.rows[0]?.id;
      nuevoRolCodigo = req.body.rol;
    }

    let passwordHash = actual.password_hash;
    if (req.body?.password && String(req.body.password).length >= 6) {
      passwordHash = await hashPassword(String(req.body.password));
    }

    let docHash = actual.documento_hash;
    let docMask = actual.documento_enmascarado;
    if (req.body?.documento && String(req.body.documento).trim()) {
      const p = await protegerDatoSensible(String(req.body.documento), 4);
      docHash = p.hash;
      docMask = p.enmascarado;
    }

    let telHash = actual.telefono_hash;
    let telMask = actual.telefono_enmascarado;
    if (req.body?.telefono && String(req.body.telefono).trim()) {
      const p = await protegerDatoSensible(String(req.body.telefono), 4);
      telHash = p.hash;
      telMask = p.enmascarado;
    }

    let pinHash = actual.pin_autorizacion_hash;
    if (req.body?.pin_autorizacion && String(req.body.pin_autorizacion).trim()) {
      const p = await protegerDatoSensible(String(req.body.pin_autorizacion), 2);
      pinHash = p.hash;
    }

    const { rows } = await pool.query(
      `UPDATE usuarios
          SET nombre = $2,
              estado = $3,
              rol_id = $4,
              password_hash = $5,
              documento_hash = $6,
              documento_enmascarado = $7,
              telefono_hash = $8,
              telefono_enmascarado = $9,
              pin_autorizacion_hash = $10,
              fecha_actualizacion = NOW()
        WHERE id = $1
        RETURNING id, nombre, email, estado, documento_enmascarado, telefono_enmascarado`,
      [id, nombre, estado, rolId, passwordHash, docHash, docMask, telHash, telMask, pinHash]
    );

    await registrarAuditoria(req, 'ACTUALIZAR_USUARIO', `/api/admin/usuarios/${id}`, {
      rol_anterior: actual.rol_codigo,
      rol_nuevo: nuevoRolCodigo,
      estado,
    });

    return res.json({ mensaje: 'Usuario actualizado correctamente.', usuario: { ...rows[0], rol: nuevoRolCodigo } });
  } catch (err) {
    console.error('[admin/usuarios PUT]', err);
    return res.status(500).json({ error: 'Error interno al actualizar usuario.' });
  }
});

adminRouter.patch('/usuarios/:id/rol', requerirRol('admin'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const rolCodigo = String(req.body?.rol ?? '') as RolCodigo;
    if (!Number.isInteger(id) || !CODIGOS_ROLES_VALIDOS.includes(rolCodigo)) {
      return res.status(400).json({
        error: `Parámetros inválidos. Roles predefinidos permitidos: ${CODIGOS_ROLES_VALIDOS.join(', ')}`,
      });
    }

    const actualRes = await pool.query(
      `SELECT u.id, u.email, r.codigo AS rol_actual FROM usuarios u LEFT JOIN roles r ON r.id = u.rol_id WHERE u.id = $1`,
      [id]
    );
    if (actualRes.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });

    if (actualRes.rows[0].rol_actual === 'admin' && rolCodigo !== 'admin') {
      const admins = await pool.query(
        `SELECT COUNT(*)::int AS n FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE r.codigo = 'admin' AND u.estado = 'activo'`
      );
      if (admins.rows[0].n <= 1) {
        return res.status(400).json({ error: 'Debe existir al menos un usuario con rol Administrador activo.' });
      }
    }

    const rolRes = await pool.query(`SELECT id, nombre FROM roles WHERE codigo = $1`, [rolCodigo]);
    await pool.query(`UPDATE usuarios SET rol_id = $2, fecha_actualizacion = NOW() WHERE id = $1`, [id, rolRes.rows[0].id]);

    await registrarAuditoria(req, 'ASIGNAR_ROL_RBAC', `/api/admin/usuarios/${id}/rol`, {
      rol_anterior: actualRes.rows[0].rol_actual,
      rol_nuevo: rolCodigo,
    });

    return res.json({
      mensaje: `Rol actualizado a '${rolRes.rows[0].nombre}' (${rolCodigo}).`,
      usuario_id: id,
      rol: rolCodigo,
    });
  } catch (err) {
    console.error('[admin/usuarios PATCH rol]', err);
    return res.status(500).json({ error: 'Error al asignar rol.' });
  }
});

adminRouter.delete('/usuarios/:id', requerirRol('admin'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
    if (id === req.usuario!.id) {
      return res.status(400).json({ error: 'No puede desactivar su propia cuenta administradora activa.' });
    }

    const { rows } = await pool.query(
      `UPDATE usuarios SET estado = 'inactivo', fecha_actualizacion = NOW() WHERE id = $1 RETURNING id, email, estado`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });

    await registrarAuditoria(req, 'DESACTIVAR_USUARIO', `/api/admin/usuarios/${id}`, { email: rows[0].email });
    return res.json({ mensaje: 'Usuario desactivado correctamente.', usuario: rows[0] });
  } catch (err) {
    console.error('[admin/usuarios DELETE]', err);
    return res.status(500).json({ error: 'Error desactivando usuario.' });
  }
});

// =============================================================================
// 3. CONFIGURACIÓN GLOBAL DEL SISTEMA Y AUDITORÍA
// =============================================================================

adminRouter.get('/configuracion', requerirRol('admin', 'gerente'), async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM configuracion_sistema ORDER BY clave ASC`);
    return res.json({ configuracion: rows });
  } catch (err) {
    console.error('[admin/configuracion GET]', err);
    return res.status(500).json({ error: 'Error consultando configuración.' });
  }
});

adminRouter.put('/configuracion/:clave', requerirRol('admin'), async (req: Request, res: Response) => {
  try {
    const clave = String(req.params.clave);
    const valor = String(req.body?.valor ?? '');

    const { rows } = await pool.query(`SELECT * FROM configuracion_sistema WHERE clave = $1`, [clave]);
    if (rows.length === 0) return res.status(404).json({ error: `Parámetro '${clave}' no existe.` });

    const tipo = rows[0].tipo;
    if (tipo === 'number' && Number.isNaN(Number(valor))) {
      return res.status(400).json({ error: `El parámetro '${clave}' requiere un valor numérico.` });
    }
    if (tipo === 'boolean' && !['true', 'false'].includes(valor.toLowerCase())) {
      return res.status(400).json({ error: `El parámetro '${clave}' requiere 'true' o 'false'.` });
    }

    const upd = await pool.query(
      `UPDATE configuracion_sistema
          SET valor = $2, actualizado_por = $3, fecha_actualizacion = NOW()
        WHERE clave = $1
        RETURNING *`,
      [clave, valor, req.usuario!.id]
    );

    await registrarAuditoria(req, 'ACTUALIZAR_CONFIG', `/api/admin/configuracion/${clave}`, {
      valor_anterior: rows[0].valor,
      valor_nuevo: valor,
    });

    return res.json({ mensaje: 'Parámetro actualizado.', parametro: upd.rows[0] });
  } catch (err) {
    console.error('[admin/configuracion PUT]', err);
    return res.status(500).json({ error: 'Error actualizando configuración.' });
  }
});

adminRouter.get('/auditoria', requerirRol('admin', 'gerente'), async (req: Request, res: Response) => {
  try {
    const limite = Math.min(200, Math.max(10, Number(req.query.limite) || 50));
    const { rows } = await pool.query(
      `SELECT a.id, a.accion, a.recurso, a.detalle, a.ip, a.fecha_creacion,
              u.nombre AS usuario_nombre, u.email AS usuario_email, r.codigo AS rol
         FROM auditoria_seguridad a
         LEFT JOIN usuarios u ON u.id = a.usuario_id
         LEFT JOIN roles r ON r.id = u.rol_id
        ORDER BY a.fecha_creacion DESC
        LIMIT $1`,
      [limite]
    );
    return res.json({ total: rows.length, eventos: rows });
  } catch (err) {
    console.error('[admin/auditoria]', err);
    return res.status(500).json({ error: 'Error consultando auditoría.' });
  }
});

