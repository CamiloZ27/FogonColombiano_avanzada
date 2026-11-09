/**
 * Utilidades criptográficas para generar y verificar hashes en el cliente
 * basadas en las diapositivas 14 a 19 y 40 (SHA-256 y HMAC-SHA-256).
 */

export const CLAVE_SECRETA_DEFAULT = 'mi_llave_privada_123';

export interface ParametrosHash {
  user: string;
  date: string;
  value: number;
  paymentMethod?: string;
  idTxn?: number;
}

/**
 * Genera la cadena canónica ordenada de la transacción (Slide 19).
 */
export function obtenerTextoCanonico(p: ParametrosHash): string {
  return JSON.stringify({
    date: p.date,
    ...(p.idTxn !== undefined ? { idTxn: p.idTxn } : {}),
    paymentMethod: p.paymentMethod || '',
    user: p.user,
    value: Number(p.value || 0),
  });
}

/**
 * Calcula HMAC-SHA256 en el navegador usando la Web Crypto API (Slide 19).
 */
export async function calcularHMACSHA256(
  texto: string,
  clave: string = CLAVE_SECRETA_DEFAULT
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(clave);
  const messageData = encoder.encode(texto);

  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await window.crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Calcula SHA-256 puro en el navegador (Slide 15 y 17).
 */
export async function calcularSHA256(texto: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(texto);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
