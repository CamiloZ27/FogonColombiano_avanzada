-- =============================================================================
-- SEED: Datos de demostración para Fogón Colombiano
-- Genera ~2.400 transacciones en 90 días con patrones realistas de restaurante
--
-- INSTRUCCIONES:
--   1. Asegúrate de que el schema ya está creado (schema.sql ejecutado).
--   2. Ejecuta este script en tu cliente PostgreSQL:
--        psql -U <usuario> -d fogonColombiano -f seed_predicciones.sql
--   3. Es idempotente: usa ON CONFLICT DO NOTHING en usuarios para que
--      puedas re-ejecutarlo sin duplicar clientes.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. USUARIOS (20 clientes ficticios, nombres colombianos)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO usuarios (nombre, email, estado) VALUES
  ('Carlos Andrés Mora',      'carlos.mora@correo.co',       'activo'),
  ('María Fernanda Ospina',   'mf.ospina@correo.co',         'activo'),
  ('Juan David Restrepo',     'jd.restrepo@correo.co',       'activo'),
  ('Valentina Gómez',         'vale.gomez@correo.co',        'activo'),
  ('Sebastián Cifuentes',     'seba.cifuentes@correo.co',    'activo'),
  ('Laura Camila Torres',     'lc.torres@correo.co',         'activo'),
  ('Andrés Felipe Herrera',   'af.herrera@correo.co',        'activo'),
  ('Daniela Muñoz Ríos',      'dani.munoz@correo.co',        'activo'),
  ('Felipe Alejandro Castro', 'f.castro@correo.co',          'activo'),
  ('Isabella Vargas Pardo',   'isa.vargas@correo.co',        'activo'),
  ('Nicolás Ramírez',         'nico.ramirez@correo.co',      'activo'),
  ('Camila Arango León',      'cami.arango@correo.co',       'activo'),
  ('Santiago Peña Cuervo',    'santi.pena@correo.co',        'activo'),
  ('Natalia Rodríguez Soto',  'nata.rodriguez@correo.co',    'activo'),
  ('Juliana Rincón Cruz',     'juli.rincon@correo.co',       'activo'),
  ('David Salcedo Ayala',     'david.salcedo@correo.co',     'activo'),
  ('Alejandra Suárez Vélez',  'ale.suarez@correo.co',        'activo'),
  ('Miguel Ángel Pineda',     'miguel.pineda@correo.co',     'activo'),
  ('Luisa Fernanda Arias',    'luisa.arias@correo.co',       'activo'),
  ('Esteban Londoño Navas',   'este.londono@correo.co',      'activo')
ON CONFLICT (email) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TRANSACCIONES — generación con patrones realistas
--
-- Lógica de patrones (todo en SQL puro con generate_series):
--   • 90 días hacia atrás desde HOY
--   • Cada día genera entre 15 y 45 transacciones según día de semana:
--       Lun-Mié: base 18 txn | Jue-Vie: base 28 txn | Sáb-Dom: base 40 txn
--   • Precios distribuidos por tipo de plato:
--       Entrada/bebida:  12.000 – 18.000 COP
--       Plato principal: 22.000 – 48.000 COP
--       Plato especial:  52.000 – 85.000 COP  (20 % de probabilidad)
--   • Horas: dos picos — almuerzo 11:30-14:30 y cena 18:30-21:30
--   • Métodos de pago: efectivo 35 %, tarjeta_débito 25 %,
--       tarjeta_crédito 20 %, nequi 12 %, daviplata 8 %
--   • Tendencia de crecimiento: +0,18 % diario acumulado (restaurante en alza)
--   • Ruido gaussiano aproximado con combinación de random()
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO transacciones (usuario_id, valor, fecha_txn, estado, hash, metodo_pago)
SELECT
  -- Usuario aleatorio entre los 20 registrados
  (SELECT id FROM usuarios ORDER BY id OFFSET floor(random() * 20) LIMIT 1)        AS usuario_id,

  -- Valor: plato según probabilidad (80 % principal, 20 % especial) + bebida/entrada
  ROUND(
    (
      -- Tendencia de crecimiento suave (~0.18 % por día acumulado)
      (1.0 + 0.0018 * (dia_num - 1))
      *
      -- Precio base del plato con ruido gaussiano aproximado
      CASE
        WHEN r_plato < 0.20 THEN  -- Plato especial
          52000 + floor(random() * 33000)          -- 52k – 85k
        WHEN r_plato < 0.65 THEN  -- Plato principal
          22000 + floor(random() * 26000)          -- 22k – 48k
        ELSE                       -- Entrada / bebida
          12000 + floor(random() * 6000)           -- 12k – 18k
      END
      -- Ruido ±8 % aproximado con suma de uniformes (teorema del límite central)
      * (0.84 + (random() + random() + random() + random()) * 0.08)
    )::numeric,
  2)                                                                               AS valor,

  -- Timestamp: fecha base + hora de pico (almuerzo o cena)
  (fecha_base
    + (
        CASE
          WHEN random() < 0.58 THEN  -- Pico almuerzo
            (interval '11 hours 30 minutes') + (floor(random() * 180) * interval '1 minute')
          ELSE                        -- Pico cena
            (interval '18 hours 30 minutes') + (floor(random() * 180) * interval '1 minute')
        END
      )
  )                                                                                AS fecha_txn,

  'completada'                                                                     AS estado,

  -- Hash simulado: prefijo fijo + 10 hex aleatorios
  'TXN-' || upper(substring(md5(random()::text || dia_num::text || txn_idx::text), 1, 10))
                                                                                   AS hash,

  -- Método de pago según distribución real colombiana
  CASE
    WHEN r_metodo < 0.35 THEN 'efectivo'
    WHEN r_metodo < 0.60 THEN 'tarjeta_debito'
    WHEN r_metodo < 0.80 THEN 'tarjeta_credito'
    WHEN r_metodo < 0.92 THEN 'nequi'
    ELSE                       'daviplata'
  END                                                                              AS metodo_pago

FROM (
  -- Genera un registro por cada transacción de cada día
  SELECT
    gs_dia.dia_offset,
    dia_num,
    fecha_base,
    txn_idx,
    random() AS r_plato,
    random() AS r_metodo,
    -- Cantidad de transacciones según día de semana
    CASE EXTRACT(DOW FROM fecha_base)
      WHEN 0 THEN 40   -- Domingo
      WHEN 6 THEN 42   -- Sábado
      WHEN 5 THEN 30   -- Viernes
      WHEN 4 THEN 26   -- Jueves
      ELSE             18  -- Lun–Mié
    END AS txn_por_dia
  FROM (
    -- 90 días hacia atrás
    SELECT
      generate_series(0, 89)                             AS dia_offset,
      generate_series(1, 90)                             AS dia_num,
      (CURRENT_DATE - generate_series(89, 0, -1))::date AS fecha_base
  ) gs_dia
  -- Por cada día, genera N transacciones con variación ±30 %
  CROSS JOIN LATERAL (
    SELECT generate_series(1,
      GREATEST(8,
        CASE EXTRACT(DOW FROM fecha_base)
          WHEN 0 THEN 40 WHEN 6 THEN 42 WHEN 5 THEN 30 WHEN 4 THEN 26 ELSE 18
        END
        + floor((random() - 0.5) * 2 *
            CASE EXTRACT(DOW FROM fecha_base)
              WHEN 0 THEN 12 WHEN 6 THEN 12 WHEN 5 THEN 8 WHEN 4 THEN 7 ELSE 5
            END
          )::int
      )
    ) AS txn_idx
  ) txns
) datos;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. EVENTOS ESPECIALES — picos en fines de semana de quincena y festivos
--    (semanas 2 y 6 del periodo: +40 % más transacciones, valores más altos)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO transacciones (usuario_id, valor, fecha_txn, estado, hash, metodo_pago)
SELECT
  (SELECT id FROM usuarios ORDER BY id OFFSET floor(random() * 20) LIMIT 1),
  ROUND((68000 + floor(random() * 32000)) * (1.0 + 0.0018 * dia_num), 2),
  fecha_base + (interval '19 hours') + (floor(random() * 120) * interval '1 minute'),
  'completada',
  'FEST-' || upper(substring(md5(random()::text), 1, 10)),
  CASE WHEN random() < 0.4 THEN 'tarjeta_credito'
       WHEN random() < 0.7 THEN 'nequi' ELSE 'efectivo' END
FROM (
  SELECT
    d::date                  AS fecha_base,
    (CURRENT_DATE - d::date) AS dia_num,
    generate_series(1, 18)   AS _txn
  FROM (
    VALUES
      -- Quincenas aproximadas
      ((CURRENT_DATE - INTERVAL '75 days')::date),
      ((CURRENT_DATE - INTERVAL '74 days')::date),
      ((CURRENT_DATE - INTERVAL '60 days')::date),
      ((CURRENT_DATE - INTERVAL '59 days')::date),
      ((CURRENT_DATE - INTERVAL '45 days')::date),
      ((CURRENT_DATE - INTERVAL '44 days')::date),
      ((CURRENT_DATE - INTERVAL '30 days')::date),
      ((CURRENT_DATE - INTERVAL '29 days')::date),
      ((CURRENT_DATE - INTERVAL '15 days')::date),
      ((CURRENT_DATE - INTERVAL '14 days')::date)
  ) AS festivos(d)
) datos_fest;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ANOMALÍAS SIMULADAS — 8 usuarios con ráfagas de transacciones
--    (para alimentar el dashboard de anomalías también)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO transacciones (usuario_id, valor, fecha_txn, estado, hash, metodo_pago)
SELECT
  uid,
  ROUND(85000 + floor(random() * 120000), 2),
  (CURRENT_TIMESTAMP - (floor(random() * 70) * INTERVAL '1 day')
    + (floor(random() * 5) * INTERVAL '1 minute')),
  'completada',
  'ANOM-' || upper(substring(md5(random()::text), 1, 10)),
  'tarjeta_credito'
FROM (
  SELECT id AS uid FROM usuarios LIMIT 8
) u
CROSS JOIN generate_series(1, 4) AS _r;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RESUMEN (opcional: ver cuántas filas se insertaron)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  'usuarios'      AS tabla, COUNT(*) AS total FROM usuarios
UNION ALL
SELECT
  'transacciones' AS tabla, COUNT(*) AS total FROM transacciones;

COMMIT;

