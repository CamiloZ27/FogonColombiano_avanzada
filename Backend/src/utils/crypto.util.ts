import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { UsuarioAutenticado } from '../types/rbac.types';

export const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);
export const JWT_SECRET = process.env.JWT_SECRET || 'fogon_colombiano_jwt_secret_2026_seguro';
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';
export const CHAIN_HMAC_SECRET =
  process.env.CHAIN_HMAC_SECRET || process.env.APP_API_TOKEN || 'fogon_colombiano_hmac_integridad_2026';

// ── 1. Hashing de contraseñas y datos sensibles con bcrypt ───────────────────

export async function hashPassword(plainPassword: string, rounds: number = BCRYPT_SALT_ROUNDS): Promise<string> {
  return bcrypt.hash(plainPassword, rounds);
}

export async function verifyPassword(plainPassword: string, hash: string | null | undefined): Promise<boolean> {
  if (!plainPassword || !hash) return false;
  return bcrypt.compare(plainPassword, hash);
}

/**
 * Hashea un dato sensible (documento de identidad, teléfono, PIN de autorización)
 * utilizando bcrypt y genera su representación enmascarada segura para UI.
 */
export async function protegerDatoSensible(
  valorClaro: string | null | undefined,
  visibleFinal: number = 4,
  rounds: number = BCRYPT_SALT_ROUNDS
): Promise<{ hash: string | null; enmascarado: string | null }> {
  const limpio = (valorClaro ?? '').trim();
  if (!limpio) {
    return { hash: null, enmascarado: null };
  }
  const hash = await bcrypt.hash(limpio, rounds);
  const cola = limpio.slice(-Math.min(visibleFinal, limpio.length));
  const asteriscos = '*'.repeat(Math.max(4, limpio.length - cola.length));
  return {
    hash,
    enmascarado: `${asteriscos}${cola}`,
  };
}

export async function verificarDatoSensible(
  valorClaro: string,
  hashAlmacenado: string | null | undefined
): Promise<boolean> {
  if (!valorClaro || !hashAlmacenado) return false;
  return bcrypt.compare(valorClaro.trim(), hashAlmacenado);
}

// ── 2. JWT Bearer Token ──────────────────────────────────────────────────────

export function firmarTokenJWT(usuario: UsuarioAutenticado): string {
  const payload = {
    sub: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    rol: usuario.rol,
    rol_nombre: usuario.rol_nombre,
    permisos: usuario.permisos,
    estado: usuario.estado,
  };
  const options: SignOptions = {
    expiresIn: JWT_EXPIRES_IN as SignOptions['expiresIn'],
    issuer: 'fogon-colombiano-api',
  };
  return jwt.sign(payload, JWT_SECRET, options);
}

export function verificarTokenJWT(token: string): UsuarioAutenticado | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'fogon-colombiano-api',
    }) as jwt.JwtPayload;

    if (!decoded || typeof decoded.sub !== 'number') {
      return null;
    }

    return {
      id: decoded.sub,
      email: String(decoded.email),
      nombre: String(decoded.nombre),
      rol: decoded.rol,
      rol_nombre: String(decoded.rol_nombre || decoded.rol),
      permisos: Array.isArray(decoded.permisos) ? decoded.permisos : [],
      estado: String(decoded.estado || 'activo'),
    };
  } catch {
    return null;
  }
}

// ── 3. Hash Encadenado (Integridad Criptográfica) ────────────────────────────

export function calcularSHA256(contenido: string): string {
  return createHash('sha256').update(contenido, 'utf8').digest('hex');
}

export function serializarCanonico(obj: Record<string, unknown>): string {
  const ordenado: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    ordenado[key] = obj[key];
  }
  return JSON.stringify(ordenado);
}

export function calcularHashEncadenado(
  hashAnterior: string,
  payload: Record<string, unknown>,
  secreto: string = CHAIN_HMAC_SECRET
): string {
  const canonico = serializarCanonico(payload);
  return createHmac('sha256', secreto)
    .update(`${hashAnterior}|${canonico}`)
    .digest('hex');
}

export function compararHashesSeguros(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a.trim().toLowerCase(), 'utf8');
  const bufB = Buffer.from(b.trim().toLowerCase(), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

