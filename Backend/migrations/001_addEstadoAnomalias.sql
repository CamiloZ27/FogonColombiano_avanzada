-- Migración: agrega estado de gestión a la tabla anomalias.
-- El esquema original (usuarios / transacciones / anomalias) no tenía
-- forma de distinguir "Anomalías abiertas / revisadas / descartadas",
-- que el dashboard pide explícitamente. Este campo lo resuelve.

ALTER TABLE anomalias
  ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'abierta';

ALTER TABLE anomalias
  ADD CONSTRAINT chk_anomalias_estado
  CHECK (estado IN ('abierta', 'revisada', 'descartada'));

-- Índices para que las agregaciones del dashboard no hagan full scan
CREATE INDEX IF NOT EXISTS idx_anomalias_fecha_creacion ON anomalias (fecha_creacion);
CREATE INDEX IF NOT EXISTS idx_anomalias_estado ON anomalias (estado);
CREATE INDEX IF NOT EXISTS idx_anomalias_nivel ON anomalias (nivel);
CREATE INDEX IF NOT EXISTS idx_anomalias_tipo ON anomalias (tipo);
CREATE INDEX IF NOT EXISTS idx_transacciones_usuario_fecha ON transacciones (usuario_id, fecha_txn);
CREATE INDEX IF NOT EXISTS idx_transacciones_fecha_txn ON transacciones (fecha_txn);
