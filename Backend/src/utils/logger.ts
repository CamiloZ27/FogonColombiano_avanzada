const isDev = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV !== 'production';

function formatearMeta(meta: unknown) {
  if (meta === undefined || meta === null) return '';
  if (typeof meta === 'string') return meta;
  return JSON.stringify(meta, null, 2);
}

function logWithLevel(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, meta?: unknown) {
  const timestamp = new Date().toISOString();
  const formatted = formatearMeta(meta);

  if (level === 'ERROR') {
    console.error(`[${timestamp}] [ERROR] ${message}`, formatted ? `\n${formatted}` : '');
    return;
  }

  if (level === 'WARN') {
    console.warn(`[${timestamp}] [WARN] ${message}`, formatted ? `\n${formatted}` : '');
    return;
  }

  if (level === 'DEBUG' && isDev) {
    console.log(`[${timestamp}] [DEBUG] ${message}`, formatted ? `\n${formatted}` : '');
    return;
  }

  console.log(`[${timestamp}] [INFO] ${message}`, formatted ? `\n${formatted}` : '');
}

export const logger = {
  info: (message: string, meta?: unknown) => logWithLevel('INFO', message, meta),
  warn: (message: string, meta?: unknown) => logWithLevel('WARN', message, meta),
  error: (message: string, meta?: unknown) => logWithLevel('ERROR', message, meta),
  debug: (message: string, meta?: unknown) => logWithLevel('DEBUG', message, meta)
};