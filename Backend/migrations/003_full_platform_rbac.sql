-- =============================================================================
-- Migración 003: Plataforma Integral + RBAC Inmutable + Bcrypt + Integridad
-- Encadenada + Calidad de Datos + Módulos Operativos (Idempotente)
-- =============================================================================

CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(40) NOT NULL UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT NOT NULL,
    permisos JSONB NOT NULL DEFAULT '[]'::jsonb,
    nivel_acceso INT NOT NULL DEFAULT 1,
    es_sistema BOOLEAN NOT NULL DEFAULT TRUE,
    editable BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION prevenir_modificacion_roles_sistema()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.es_sistema = TRUE OR OLD.editable = FALSE THEN
        RAISE EXCEPTION 'Operación denegada: los roles predefinidos del sistema (%) no son editables ni eliminables.', OLD.codigo;
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_roles_inmutables ON roles;
CREATE TRIGGER trg_roles_inmutables
    BEFORE UPDATE OR DELETE ON roles
    FOR EACH ROW
    EXECUTE FUNCTION prevenir_modificacion_roles_sistema();

-- Extender usuarios existentes sin perder datos
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol_id INT REFERENCES roles(id) ON DELETE RESTRICT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS documento_hash VARCHAR(255);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS documento_enmascarado VARCHAR(40);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono_hash VARCHAR(255);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono_enmascarado VARCHAR(40);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pin_autorizacion_hash VARCHAR(255);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_login TIMESTAMP;

CREATE TABLE IF NOT EXISTS configuracion_sistema (
    clave VARCHAR(80) PRIMARY KEY,
    valor TEXT NOT NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('number', 'boolean', 'string')),
    descripcion TEXT NOT NULL,
    actualizado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categorias (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL UNIQUE,
    nombre_normalizado VARCHAR(120) NOT NULL UNIQUE,
    descripcion TEXT DEFAULT '',
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    categoria_id INT NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
    codigo VARCHAR(60) UNIQUE,
    nombre VARCHAR(180) NOT NULL,
    nombre_normalizado VARCHAR(180) NOT NULL,
    descripcion TEXT DEFAULT '',
    precio NUMERIC(12, 2) NOT NULL CHECK (precio > 0),
    stock INT NOT NULL DEFAULT 50 CHECK (stock >= 0),
    stock_minimo INT NOT NULL DEFAULT 5 CHECK (stock_minimo >= 0),
    tiempo_preparacion_min INT DEFAULT 12,
    imagen_url TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pedidos (
    id SERIAL PRIMARY KEY,
    usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    atendido_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
    canal VARCHAR(30) NOT NULL DEFAULT 'presencial'
        CHECK (canal IN ('presencial', 'web', 'app', 'domicilio')),
    estado VARCHAR(30) NOT NULL DEFAULT 'solicitado'
        CHECK (estado IN ('solicitado', 'en_proceso', 'listo', 'entregado', 'anulado')),
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    observaciones TEXT DEFAULT '',
    motivo_anulacion TEXT,
    hash_integridad VARCHAR(128),
    fecha_pedido TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pedido_items (
    id SERIAL PRIMARY KEY,
    pedido_id INT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    item_id INT NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    cantidad INT NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC(12, 2) NOT NULL CHECK (precio_unitario >= 0),
    subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0)
);

CREATE TABLE IF NOT EXISTS facturas (
    id SERIAL PRIMARY KEY,
    numero_consecutivo VARCHAR(30) NOT NULL UNIQUE,
    pedido_id INT REFERENCES pedidos(id) ON DELETE SET NULL,
    usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    emitida_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
    subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
    porcentaje_impuesto NUMERIC(5, 2) NOT NULL DEFAULT 8.00,
    impuesto NUMERIC(12, 2) NOT NULL DEFAULT 0,
    porcentaje_descuento NUMERIC(5, 2) NOT NULL DEFAULT 0,
    descuento NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total NUMERIC(12, 2) NOT NULL CHECK (total >= 0),
    estado VARCHAR(30) NOT NULL DEFAULT 'emitida'
        CHECK (estado IN ('emitida', 'pagada', 'anulada')),
    hash_anterior VARCHAR(128) NOT NULL,
    hash_actual VARCHAR(128) NOT NULL,
    fecha_emision TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pagos (
    id SERIAL PRIMARY KEY,
    factura_id INT NOT NULL REFERENCES facturas(id) ON DELETE RESTRICT,
    usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    procesado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
    monto NUMERIC(12, 2) NOT NULL CHECK (monto > 0),
    metodo_pago VARCHAR(50) NOT NULL,
    referencia_pago VARCHAR(120),
    comprobante_nombre VARCHAR(255),
    comprobante_mime VARCHAR(80),
    comprobante_contenido TEXT,
    comprobante_hash VARCHAR(128),
    estado VARCHAR(30) NOT NULL DEFAULT 'aprobado'
        CHECK (estado IN ('aprobado', 'pendiente', 'rechazado', 'anulado')),
    hash_anterior VARCHAR(128) NOT NULL,
    hash_actual VARCHAR(128) NOT NULL,
    clasificacion_ia VARCHAR(30) DEFAULT 'normal'
        CHECK (clasificacion_ia IN ('normal', 'fraudulenta')),
    score_fraude_ia NUMERIC(6, 4) DEFAULT 0,
    fecha_pago TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Extender transacciones y anomalias existentes
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS canal VARCHAR(30) DEFAULT 'presencial';
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS descuento NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS clasificacion_ia VARCHAR(30) DEFAULT 'normal';
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS score_fraude_ia NUMERIC(6, 4) DEFAULT 0;
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS factura_id INT REFERENCES facturas(id) ON DELETE SET NULL;
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS pago_id INT REFERENCES pagos(id) ON DELETE SET NULL;

ALTER TABLE anomalias ADD COLUMN IF NOT EXISTS origen VARCHAR(40) DEFAULT 'ventana_deslizante';
ALTER TABLE anomalias ADD COLUMN IF NOT EXISTS detalle TEXT;

CREATE TABLE IF NOT EXISTS reportes_calidad (
    id SERIAL PRIMARY KEY,
    modulo VARCHAR(60) NOT NULL,
    ejecutado_por INT REFERENCES usuarios(id) ON DELETE SET NULL,
    total_registros INT NOT NULL,
    registros_validos INT NOT NULL,
    registros_limpiados INT NOT NULL,
    duplicados_detectados INT NOT NULL,
    registros_rechazados INT NOT NULL,
    puntaje_calidad NUMERIC(5, 2) NOT NULL,
    resumen_json JSONB NOT NULL,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auditoria_seguridad (
    id SERIAL PRIMARY KEY,
    usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
    accion VARCHAR(120) NOT NULL,
    recurso VARCHAR(120) NOT NULL,
    detalle JSONB,
    ip VARCHAR(64),
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios (rol_id);
CREATE INDEX IF NOT EXISTS idx_items_categoria ON items (categoria_id);
CREATE INDEX IF NOT EXISTS idx_items_nombre_norm ON items (nombre_normalizado);
CREATE INDEX IF NOT EXISTS idx_pedidos_usuario ON pedidos (usuario_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_canal ON pedidos (canal);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos (estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_fecha ON pedidos (fecha_pedido);
CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido ON pedido_items (pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_items_item ON pedido_items (item_id);
CREATE INDEX IF NOT EXISTS idx_facturas_usuario ON facturas (usuario_id);
CREATE INDEX IF NOT EXISTS idx_facturas_fecha ON facturas (fecha_emision);
CREATE INDEX IF NOT EXISTS idx_pagos_factura ON pagos (factura_id);
CREATE INDEX IF NOT EXISTS idx_pagos_usuario ON pagos (usuario_id);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON pagos (fecha_pago);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria_seguridad (fecha_creacion DESC);

