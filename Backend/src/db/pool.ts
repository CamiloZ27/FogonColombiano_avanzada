import dotenv from 'dotenv';
import path from 'path';
import { Pool } from 'pg';

// Cargar .env tanto si se ejecuta desde la raíz como desde Backend
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'Backend/.env') });
dotenv.config();

/**
 * Pool de conexiones a PostgreSQL, usando la cadena completa DATABASE_URL
 * definida en Backend/.env (ej: postgresql://usuario:pass@host:5432/nombre_bd)
 */
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:581321@localhost:5432/fogonColombiano';

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err);
});
