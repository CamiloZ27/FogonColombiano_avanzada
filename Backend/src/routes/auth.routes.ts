import { Request, Response, Router } from 'express';
import { pool } from '../db/pool';
import { CUENTAS_DEMO, DEMO_PASSWORD_DEFAULT } from '../db/initDb';
import { autenticarJWT, registrarAuditoria } from '../middleware/auth.middleware';
import { esEmailValido, limpiarNombreLegible, normalizarEmail } from '../services/calidad.service';
import { obtenerDefinicionRol, RolCodigo, UsuarioAutenticado } from '../types/rbac.types';
import {
  firmarTokenJWT,
  hashPassword,
  protegerDatoSensible,
  verificarDatoSensible,
  verifyPassword,
} from '../utils/crypto.util';

export const authRouter = Router();

/**
 * POST /api/auth/login
 * Autentica con email + password verificada con bcrypt y emite JWT Bearer Token.
 */
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const email = normalizarEmail(req.body?.email);
    const password = String(req.body?.password ?? '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Debe proporcionar correo electrónico y contraseña.' });
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.nombre, u.email, u.password_hash, u.estado,
              u.documento_enmascarado, u.telefono_enmascarado,
              COALESCE(r.codigo, 'cliente') AS rol_codigo,
              COALESCE(r.nombre, 'Cliente') AS rol_nombre
         FROM usuarios u
         LEFT JOIN roles r ON r.id = u.rol_id
        WHERE LOWER(u.email) = $1`,
      [email]
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }
    if (user.estado !== 'activo') {
      return res.status(403).json({ error: `La cuenta se encuentra en estado '${user.estado}'. Contacte al administrador.` });
    }

    const valida = await verifyPassword(password, user.password_hash);
    if (!valida) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    await pool.query(`UPDATE usuarios SET ultimo_login = NOW(), fecha_actualizacion = NOW() WHERE id = $1`, [user.id]);

    const rolCodigo = user.rol_codigo as RolCodigo;
    const defRol = obtenerDefinicionRol(rolCodigo);
    const usuarioAutenticado: UsuarioAutenticado = {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      rol: rolCodigo,
      rol_nombre: user.rol_nombre,
      permisos: defRol ? [...defRol.permisos] : [],
      estado: user.estado,
    };

    const token = firmarTokenJWT(usuarioAutenticado);
    req.usuario = usuarioAutenticado;
    await registrarAuditoria(req, 'LOGIN_EXITOSO', '/api/auth/login', { rol: rolCodigo });

    return res.json({
      token_type: 'Bearer',
      access_token: token,
      usuario: {
        ...usuarioAutenticado,
        documento_enmascarado: user.documento_enmascarado,
        telefono_enmascarado: user.telefono_enmascarado,
      },
    });
  } catch (err) {
    console.error('[auth/login]', err);
    return res.status(500).json({ error: 'Error interno al iniciar sesión.' });
  }
});

/**
 * POST /api/auth/register
 * Registro público de nuevos clientes (siempre asigna el rol predefinido 'cliente').
 * Aplica bcrypt a la contraseña y a los datos sensibles (documento y teléfono).
 */
authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const nombre = limpiarNombreLegible(req.body?.nombre);
    const email = normalizarEmail(req.body?.email);
    const password = String(req.body?.password ?? '');
    const documento = String(req.body?.documento ?? '').trim();
    const telefono = String(req.body?.telefono ?? '').trim();

    if (!nombre || nombre.length < 2) {
      return res.status(400).json({ error: 'El nombre debe tener al menos 2 caracteres.' });
    }
    if (!esEmailValido(email)) {
      return res.status(400).json({ error: 'Formato de correo electrónico inválido.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    const existe = await pool.query(`SELECT id FROM usuarios WHERE LOWER(email) = $1`, [email]);
    if (existe.rows.length > 0) {
      return res.status(409).json({ error: 'Ya existe una cuenta registrada con ese correo electrónico.' });
    }

    const rolRes = await pool.query<{ id: number; codigo: RolCodigo; nombre: string }>(
      `SELECT id, codigo, nombre FROM roles WHERE codigo = 'cliente'`
    );
    const rolCliente = rolRes.rows[0];
    if (!rolCliente) {
      return res.status(500).json({ error: 'Rol predefinido cliente no inicializado.' });
    }

    const cfgRounds = await pool.query(`SELECT valor FROM configuracion_sistema WHERE clave = 'bcrypt_salt_rounds'`);
    const rounds = Math.min(12, Math.max(8, Number(cfgRounds.rows[0]?.valor ?? 10)));

    const passwordHash = await hashPassword(password, rounds);
    const docProt = await protegerDatoSensible(documento, 4, rounds);
    const telProt = await protegerDatoSensible(telefono, 4, rounds);

    const inserted = await pool.query(
      `INSERT INTO usuarios
         (nombre, email, password_hash, rol_id, documento_hash, documento_enmascarado,
          telefono_hash, telefono_enmascarado, estado, ultimo_login)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'activo', NOW())
       RETURNING id, nombre, email, estado, documento_enmascarado, telefono_enmascarado`,
      [nombre, email, passwordHash, rolCliente.id, docProt.hash, docProt.enmascarado, telProt.hash, telProt.enmascarado]
    );

    const u = inserted.rows[0];
    const defRol = obtenerDefinicionRol('cliente')!;
    const usuarioAutenticado: UsuarioAutenticado = {
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      rol: 'cliente',
      rol_nombre: rolCliente.nombre,
      permisos: [...defRol.permisos],
      estado: u.estado,
    };

    const token = firmarTokenJWT(usuarioAutenticado);
    req.usuario = usuarioAutenticado;
    await registrarAuditoria(req, 'REGISTRO_CLIENTE', '/api/auth/register', { email });

    return res.status(201).json({
      token_type: 'Bearer',
      access_token: token,
      usuario: {
        ...usuarioAutenticado,
        documento_enmascarado: u.documento_enmascarado,
        telefono_enmascarado: u.telefono_enmascarado,
      },
    });
  } catch (err) {
    console.error('[auth/register]', err);
    return res.status(500).json({ error: 'Error interno al registrar usuario.' });
  }
});

/**
 * GET /api/auth/me
 * Devuelve el perfil autenticado actual validado por JWT Bearer Token.
 */
authRouter.get('/me', autenticarJWT, async (req: Request, res: Response) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre, u.email, u.estado, u.ultimo_login,
            u.documento_enmascarado, u.telefono_enmascarado,
            (u.documento_hash IS NOT NULL) AS tiene_documento_bcrypt,
            (u.telefono_hash IS NOT NULL) AS tiene_telefono_bcrypt,
            (u.pin_autorizacion_hash IS NOT NULL) AS tiene_pin_bcrypt
       FROM usuarios u
      WHERE u.id = $1`,
    [req.usuario!.id]
  );

  return res.json({
    usuario: {
      ...req.usuario,
      ...rows[0],
    },
  });
});

/**
 * PUT /api/auth/cambiar-password
 */
authRouter.put('/cambiar-password', autenticarJWT, async (req: Request, res: Response) => {
  try {
    const actual = String(req.body?.password_actual ?? '');
    const nueva = String(req.body?.password_nueva ?? '');
    if (nueva.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener mínimo 6 caracteres.' });
    }

    const { rows } = await pool.query(`SELECT password_hash FROM usuarios WHERE id = $1`, [req.usuario!.id]);
    const ok = await verifyPassword(actual, rows[0]?.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'La contraseña actual es incorrecta.' });
    }

    const nuevoHash = await hashPassword(nueva);
    await pool.query(`UPDATE usuarios SET password_hash = $2, fecha_actualizacion = NOW() WHERE id = $1`, [
      req.usuario!.id,
      nuevoHash,
    ]);
    await registrarAuditoria(req, 'CAMBIO_PASSWORD', '/api/auth/cambiar-password', {});
    return res.json({ mensaje: 'Contraseña actualizada correctamente con hash bcrypt.' });
  } catch (err) {
    console.error('[auth/cambiar-password]', err);
    return res.status(500).json({ error: 'Error al actualizar contraseña.' });
  }
});

/**
 * POST /api/auth/verificar-dato-sensible
 * Verifica documento, teléfono o PIN contra el hash bcrypt almacenado (sin exponer texto plano).
 */
authRouter.post('/verificar-dato-sensible', autenticarJWT, async (req: Request, res: Response) => {
  try {
    const campo = String(req.body?.campo ?? '');
    const valor = String(req.body?.valor ?? '');
    const mapaCol: Record<string, string> = {
      documento: 'documento_hash',
      telefono: 'telefono_hash',
      pin: 'pin_autorizacion_hash',
    };
    const columna = mapaCol[campo];
    if (!columna || !valor) {
      return res.status(400).json({ error: 'Indique campo (documento | telefono | pin) y valor a verificar.' });
    }

    const { rows } = await pool.query(`SELECT ${columna} AS hash FROM usuarios WHERE id = $1`, [req.usuario!.id]);
    const coincide = await verificarDatoSensible(valor, rows[0]?.hash);
    return res.json({ campo, coincide, metodo: 'bcrypt.compare' });
  } catch (err) {
    console.error('[auth/verificar-dato-sensible]', err);
    return res.status(500).json({ error: 'Error verificando dato sensible.' });
  }
});

/**
 * GET /api/auth/demo-cuentas
 * Lista de cuentas demo disponibles para probar los 6 roles RBAC en la pantalla de Login.
 */
authRouter.get('/demo-cuentas', (_req: Request, res: Response) => {
  return res.json({
    password_demo: DEMO_PASSWORD_DEFAULT,
    cuentas: CUENTAS_DEMO.map((c) => ({
      nombre: c.nombre,
      email: c.email,
      rol: c.rol,
    })),
  });
});

