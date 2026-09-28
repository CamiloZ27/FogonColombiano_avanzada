import 'dotenv/config';
import { Pool } from 'pg';
 
/**
 * Pool de conexiones a PostgreSQL, usando la cadena completa DATABASE_URL
 * definida en Backend/.env (ej: postgresql://usuario:pass@host:5432/nombre_bd)
 */
if (!process.env.DATABASE_URL) {
  throw new Error(
    'Falta DATABASE_URL en el .env del Backend. Revisa que el archivo exista y que dotenv se cargue antes de este módulo.'
  );
}
 
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});
 
pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err);
});
 