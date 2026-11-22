import { NextFunction, Request, Response } from 'express';
import { pool } from '../db/pool';
import {
  obtenerDefinicionRol,
  PermisoCodigo,
  RolCodigo,
  UsuarioAutenticado,
} from '../types/rbac.types';
import { verificarTokenJWT } from '../utils/crypto.util';

/**
 * Extrae el token Bearer del header Authorization.
 */
function extraerBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  const partes = header.trim().split(/\s+/);
  if (partes.length !== 2 || partes[0].toLowerCase() !== 'bearer') return null;
  return partes[1] || null;
}

/**
 * Carga el estado actual del usuario y su rol predefinido desde BD para evitar
 * el uso de tokens de usuarios desactivados o con rol cambiado.
 */
async function cargarUsuarioActual(userId: number): Promise<UsuarioAutenticado | null> {
  const { rows } = await pool.query<{
    id: number;
    nombre: string;
    email: string;
    estado: string;
    rol_codigo: RolCodigo | null;
    rol_nombre: string | null;
  }>(
    `SELECT u.id, u.nombre, u.email, u.estado,
            r.codigo AS rol_codigo, r.nombre AS rol_nombre
       FROM usuarios u
       LEFT JOIN roles r ON r.id = u.rol_id
      WHERE u.id = $1`,
    [userId]
  );

  const fila = rows[0];
  if (!fila || fila.estado !== 'activo') return null;

  const codigoRol: RolCodigo = fila.rol_codigo ?? 'cliente';
  const defRol = obtenerDefinicionRol(codigoRol);

  return {
    id: fila.id,
    nombre: fila.nombre,
    email: fila.email,
    estado: fila.estado,
    rol: codigoRol,
    rol_nombre: fila.rol_nombre ?? defRol?.nombre ?? 'Cliente',
    permisos: defRol ? [...defRol.permisos] : [],
  };
}

/**
 * Middleware obligatorio de autenticación JWT con Bearer Token.
 */
export async function autenticarJWT(req: Request, res: Response, next: NextFunction) {
  try {
    const token = extraerBearerToken(req);
    if (!token) {
      return res.status(401).json({
        error: 'Autenticación requerida: proporcione un Bearer Token en el encabezado Authorization.',
      });
    }

    const payload = verificarTokenJWT(token);
    if (!payload) {
      return res.status(401).json({
        error: 'Token JWT inválido o expirado. Inicie sesión nuevamente.',
      });
    }

    const usuarioActual = await cargarUsuarioActual(payload.id);
    if (!usuarioActual) {
      return res.status(401).json({
        error: 'Usuario inactivo, bloqueado o inexistente.',
      });
    }

    req.usuario = usuarioActual;
    return next();
  } catch (error) {
    console.error('[auth.middleware] Error validando JWT:', error);
    return res.status(500).json({ error: 'Error interno al verificar autenticación' });
  }
}

/**
 * Middleware opcional: si viene Bearer token válido adjunta req.usuario; si no, continúa.
 */
export async function autenticarOpcional(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extraerBearerToken(req);
    if (token) {
      const payload = verificarTokenJWT(token);
      if (payload) {
        const usuarioActual = await cargarUsuarioActual(payload.id);
        if (usuarioActual) {
          req.usuario = usuarioActual;
        }
      }
    }
  } catch {
    // Silencioso en modo opcional
  }
  return next();
}

/**
 * Middleware RBAC por lista de roles predefinidos permitidos.
 */
export function requerirRol(...rolesPermitidos: RolCodigo[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.usuario) {
      return res.status(401).json({ error: 'No autenticado.' });
    }
    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({
        error: `Acceso denegado (RBAC). Su rol '${req.usuario.rol_nombre}' no tiene autorización. Se requiere: ${rolesPermitidos.join(', ')}.`,
      });
    }
    return next();
  };
}

/**
 * Middleware RBAC por permiso granular definido en los roles predefinidos.
 */
export function requerirPermiso(...permisosRequeridos: PermisoCodigo[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.usuario) {
      return res.status(401).json({ error: 'No autenticado.' });
    }
    const tieneTodos = permisosRequeridos.every((p) => req.usuario!.permisos.includes(p));
    if (!tieneTodos) {
      return res.status(403).json({
        error: `Acceso denegado (RBAC). Su rol '${req.usuario.rol_nombre}' carece de los permisos: ${permisosRequeridos.join(', ')}.`,
      });
    }
    return next();
  };
}

/**
 * Registra un evento en la tabla de auditoría de seguridad.
 */
export async function registrarAuditoria(
  req: Request,
  accion: string,
  recurso: string,
  detalle?: Record<string, unknown>
): Promise<void> {
  try {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      'local';
    await pool.query(
      `INSERT INTO auditoria_seguridad (usuario_id, accion, recurso, detalle, ip)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [req.usuario?.id ?? null, accion, recurso, JSON.stringify(detalle ?? {}), ip]
    );
  } catch (err) {
    console.warn('[auditoria] No se pudo escribir registro de auditoría:', err);
  }
}

