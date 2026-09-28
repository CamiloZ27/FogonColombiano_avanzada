CREATE DATABASE fogonColombiano;

-- 1. Tabla: usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    estado VARCHAR(50) DEFAULT 'activo',
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla: transacciones
CREATE TABLE IF NOT EXISTS transacciones (
    id SERIAL PRIMARY KEY,
    usuario_id INT NOT NULL,
    valor NUMERIC(12, 2) NOT NULL,
    fecha_txn TIMESTAMP NOT NULL,
    estado VARCHAR(50) NOT NULL,
    hash VARCHAR(255),
    metodo_pago VARCHAR(50),
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_transacciones_usuario 
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- 3. Tabla: anomalias
CREATE TABLE IF NOT EXISTS anomalias (
    id SERIAL PRIMARY KEY,
    transaccion_id INT NOT NULL,
    tipo VARCHAR(100) NOT NULL,
    nivel VARCHAR(50),
    cantidad_transacciones INT,
    ventana_segundos INT,
    estado VARCHAR(20) NOT NULL DEFAULT 'abierta'
        CHECK (estado IN ('abierta', 'revisada', 'descartada')),
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_anomalias_transaccion 
        FOREIGN KEY (transaccion_id) REFERENCES transacciones(id) ON DELETE CASCADE
);

-- Índices utilizados por el dashboard y la detección de anomalías
CREATE INDEX IF NOT EXISTS idx_anomalias_fecha_creacion ON anomalias (fecha_creacion);
CREATE INDEX IF NOT EXISTS idx_anomalias_estado ON anomalias (estado);
CREATE INDEX IF NOT EXISTS idx_anomalias_nivel ON anomalias (nivel);
CREATE INDEX IF NOT EXISTS idx_anomalias_tipo ON anomalias (tipo);
CREATE INDEX IF NOT EXISTS idx_transacciones_usuario_fecha ON transacciones (usuario_id, fecha_txn);
CREATE INDEX IF NOT EXISTS idx_transacciones_fecha_txn ON transacciones (fecha_txn);