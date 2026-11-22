import fs from 'fs';
import path from 'path';
import { pool } from './pool';
import { ROLES_SISTEMA } from '../types/rbac.types';
import { hashPassword, protegerDatoSensible } from '../utils/crypto.util';
import {
  calcularHashComprobante,
  generarHashFactura,
  generarHashPago,
  generarHashPedido,
  obtenerUltimoHashFactura,
  obtenerUltimoHashPago,
} from '../services/integridad.service';
import { normalizarTextoClave } from '../services/calidad.service';

const CATEGORIAS_SEED = [
  { nombre: 'Platos Fuertes', descripcion: 'Platos típicos tradicionales colombianos de fondo' },
  { nombre: 'Sopas Tradicionales', descripcion: 'Caldos y sopas artesanales del fogón' },
  { nombre: 'Antojos & Amasijos', descripcion: 'Entradas, arepas y amasijos recién hechos' },
  { nombre: 'Postres', descripcion: 'Dulces típicos y postres artesanales' },
  { nombre: 'Bebidas Típicas', descripcion: 'Jugos naturales, limonadas y bebidas tradicionales' },
];

const ITEMS_SEED = [
  { codigo: 'FOG-001', categoria: 'Platos Fuertes', nombre: 'Bandeja Paisa Tradicional', precio: 38000, stock: 45, tiempo: 15, desc: 'Frijoles cargamanto, arroz, chicharrón, carne molida, huevo, tajada, chorizo, arepa y aguacate.' },
  { codigo: 'FOG-002', categoria: 'Platos Fuertes', nombre: 'Lechona Tolimense Especial', precio: 30000, stock: 35, tiempo: 10, desc: 'Cerdo horneado a la leña relleno de arvejas y carne magra con cuero crocante y arepa.' },
  { codigo: 'FOG-003', categoria: 'Platos Fuertes', nombre: 'Cazuela de Mariscos del Caribe', precio: 45000, stock: 25, tiempo: 18, desc: 'Camarones, calamares, pulpo y pescado en reducción de leche de coco con arroz con coco y patacones.' },
  { codigo: 'FOG-004', categoria: 'Platos Fuertes', nombre: 'Sobrebarriga en Salsa Criolla', precio: 36000, stock: 30, tiempo: 14, desc: 'Sobrebarriga tierna bañada en hogao tradicional con papa criolla y yuca al vapor.' },
  { codigo: 'FOG-005', categoria: 'Platos Fuertes', nombre: 'Tamal Tolimense Especial', precio: 22000, stock: 40, tiempo: 8, desc: 'Masa de maíz y arroz en hoja de plátano con cerdo, pollo, huevo y chocolate espumoso.' },
  { codigo: 'FOG-006', categoria: 'Sopas Tradicionales', nombre: 'Ajiaco Santafereño', precio: 32000, stock: 38, tiempo: 12, desc: 'Tres papas, pollo desmechado, mazorca, guascas, crema de leche, alcaparras y aguacate.' },
  { codigo: 'FOG-007', categoria: 'Sopas Tradicionales', nombre: 'Sancocho Trifásico Campesino', precio: 35000, stock: 30, tiempo: 15, desc: 'Res, cerdo y pollo cocinados lentamente con yuca, plátano verde, mazorca y cilantro.' },
  { codigo: 'FOG-008', categoria: 'Antojos & Amasijos', nombre: 'Arepa de Choclo con Queso Campesino', precio: 14000, stock: 60, tiempo: 8, desc: 'Arepa dulce de maíz tierno a la plancha con queso campesino fresco y mantequilla.' },
  { codigo: 'FOG-009', categoria: 'Antojos & Amasijos', nombre: 'Trío de Empanadas Colombianas con Ají', precio: 12000, stock: 80, tiempo: 6, desc: 'Tres empanadas crocantes de maíz con papa criolla y carne desmechada más ají casero.' },
  { codigo: 'FOG-010', categoria: 'Postres', nombre: 'Brevas Caladas con Arequipe', precio: 11000, stock: 40, tiempo: 5, desc: 'Brevas en almíbar de panela y clavos rellenas de arequipe artesanal con queso fresco.' },
  { codigo: 'FOG-011', categoria: 'Bebidas Típicas', nombre: 'Limonada de Coco Natural', precio: 12000, stock: 70, tiempo: 4, desc: 'Limonada cremosa preparada con leche de coco fresca y hielo frappé.' },
  { codigo: 'FOG-012', categoria: 'Bebidas Típicas', nombre: 'Jugo de Lulo en Agua', precio: 9000, stock: 75, tiempo: 4, desc: 'Jugo natural de lulo colombiano recién preparado.' },
];

const CONFIG_DEFAULT = [
  { clave: 'impuesto_inc_porcentaje', valor: '8', tipo: 'number', descripcion: 'Impuesto Nacional al Consumo (INC %) aplicado a facturas de restaurante' },
  { clave: 'descuento_maximo_sin_alerta', valor: '15', tipo: 'number', descripcion: 'Porcentaje máximo de descuento permitido antes de generar alerta de abuso' },
  { clave: 'ventana_deslizante_segundos', valor: '3', tipo: 'number', descripcion: 'Duración de la ventana deslizante (segundos) para detección de ráfagas' },
  { clave: 'ventana_deslizante_limite_txn', valor: '3', tipo: 'number', descripcion: 'Número mínimo de transacciones en ventana para disparar alerta' },
  { clave: 'ventana_usar_limite_horario', valor: 'false', tipo: 'boolean', descripcion: 'Habilitar umbrales dinámicos de ventana según franja horaria' },
  { clave: 'umbral_fraude_ia', valor: '0.65', tipo: 'number', descripcion: 'Umbral de probabilidad (0 a 1) del clasificador Keras para marcar operación fraudulenta' },
  { clave: 'bcrypt_salt_rounds', valor: '10', tipo: 'number', descripcion: 'Factor de costo (rondas de sal) para hashing bcrypt de contraseñas y datos sensibles' },
];

export const CUENTAS_DEMO = [
  { nombre: 'Administrador Fogón', email: 'admin@fogoncolombiano.com', rol: 'admin', doc: '1010001001', tel: '3101110001', pin: '9999' },
  { nombre: 'Laura Gerente General', email: 'gerente@fogoncolombiano.com', rol: 'gerente', doc: '1010002002', tel: '3101110002', pin: '8888' },
  { nombre: 'Chef Mateo Jefe de Cocina', email: 'chef@fogoncolombiano.com', rol: 'jefe_cocina', doc: '1010003003', tel: '3101110003', pin: '7777' },
  { nombre: 'Andrés Cocinero Parrilla', email: 'cocinero@fogoncolombiano.com', rol: 'cocinero', doc: '1010004004', tel: '3101110004', pin: null },
  { nombre: 'Sofía Cajera POS', email: 'cajero@fogoncolombiano.com', rol: 'cajero', doc: '1010005005', tel: '3101110005', pin: '5555' },
  { nombre: 'Carlos Pérez Cliente', email: 'cliente@fogoncolombiano.com', rol: 'cliente', doc: '1010006006', tel: '3101110006', pin: null },
];

export const DEMO_PASSWORD_DEFAULT = 'Fogon2026*';

/**
 * Inicializa idempotentemente la base de datos:
 * 1. Crea/actualiza todas las tablas y triggers (roles inmutables).
 * 2. Inserta los 6 roles RBAC predefinidos del sistema.
 * 3. Inserta configuración global del sistema.
 * 4. Crea las cuentas demo con bcrypt real (contraseña + documento + teléfono + PIN).
 * 5. Asigna rol 'cliente' a usuarios legacy que aún no tengan rol.
 * 6. Siembra categorías, ítems con stock y operaciones iniciales encadenadas si está vacío.
 */
export async function inicializarBaseDeDatos(): Promise<void> {
  // 1. Asegurar esquema base (usuarios/transacciones/anomalias) + migración 003
  const migrationPath = path.resolve(__dirname, '../../migrations/003_full_platform_rbac.sql');
  const schemaBaseSql = `
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(150) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      estado VARCHAR(50) DEFAULT 'activo',
      fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS transacciones (
      id SERIAL PRIMARY KEY,
      usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      valor NUMERIC(12, 2) NOT NULL,
      fecha_txn TIMESTAMP NOT NULL,
      estado VARCHAR(50) NOT NULL,
      hash VARCHAR(255),
      metodo_pago VARCHAR(50),
      fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS anomalias (
      id SERIAL PRIMARY KEY,
      transaccion_id INT NOT NULL REFERENCES transacciones(id) ON DELETE CASCADE,
      tipo VARCHAR(100) NOT NULL,
      nivel VARCHAR(50),
      cantidad_transacciones INT,
      ventana_segundos INT,
      estado VARCHAR(20) NOT NULL DEFAULT 'abierta',
      fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await pool.query(schemaBaseSql);

  if (fs.existsSync(migrationPath)) {
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    await pool.query(migrationSql);
  }

  // 2. Insertar roles predefinidos inmutables (solo INSERT ... ON CONFLICT DO NOTHING)
  for (const rol of ROLES_SISTEMA) {
    await pool.query(
      `INSERT INTO roles (codigo, nombre, descripcion, permisos, nivel_acceso, es_sistema, editable)
       VALUES ($1, $2, $3, $4::jsonb, $5, TRUE, FALSE)
       ON CONFLICT (codigo) DO NOTHING`,
      [rol.codigo, rol.nombre, rol.descripcion, JSON.stringify(rol.permisos), rol.nivel_acceso]
    );
  }

  const rolesRes = await pool.query<{ id: number; codigo: string }>(`SELECT id, codigo FROM roles`);
  const mapaRoles = new Map(rolesRes.rows.map((r) => [r.codigo, r.id]));

  // 3. Configuración inicial del sistema
  for (const cfg of CONFIG_DEFAULT) {
    await pool.query(
      `INSERT INTO configuracion_sistema (clave, valor, tipo, descripcion)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (clave) DO NOTHING`,
      [cfg.clave, cfg.valor, cfg.tipo, cfg.descripcion]
    );
  }

  // 4. Sembrar cuentas demo por cada rol con bcrypt
  const passHashDemo = await hashPassword(DEMO_PASSWORD_DEFAULT);
  for (const c of CUENTAS_DEMO) {
    const rolId = mapaRoles.get(c.rol);
    const existe = await pool.query(`SELECT id, password_hash, rol_id FROM usuarios WHERE email = $1`, [c.email]);
    if (existe.rows.length === 0) {
      const docProt = await protegerDatoSensible(c.doc, 4);
      const telProt = await protegerDatoSensible(c.tel, 4);
      const pinProt = c.pin ? await protegerDatoSensible(c.pin, 2) : { hash: null };

      await pool.query(
        `INSERT INTO usuarios
           (nombre, email, password_hash, rol_id, documento_hash, documento_enmascarado,
            telefono_hash, telefono_enmascarado, pin_autorizacion_hash, estado)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'activo')`,
        [
          c.nombre,
          c.email,
          passHashDemo,
          rolId,
          docProt.hash,
          docProt.enmascarado,
          telProt.hash,
          telProt.enmascarado,
          pinProt.hash,
        ]
      );
    } else if (!existe.rows[0].password_hash || !existe.rows[0].rol_id) {
      await pool.query(
        `UPDATE usuarios
            SET password_hash = COALESCE(password_hash, $2),
                rol_id = COALESCE(rol_id, $3)
          WHERE id = $1`,
        [existe.rows[0].id, passHashDemo, rolId]
      );
    }
  }

  // 5. Asignar rol 'cliente' y contraseña por defecto a usuarios legacy sin rol/password
  const rolClienteId = mapaRoles.get('cliente');
  if (rolClienteId) {
    await pool.query(
      `UPDATE usuarios
          SET rol_id = COALESCE(rol_id, $1),
              password_hash = COALESCE(password_hash, $2)
        WHERE rol_id IS NULL OR password_hash IS NULL`,
      [rolClienteId, passHashDemo]
    );
  }

  // 6. Categorías e Ítems iniciales del catálogo Fogón Colombiano
  for (const cat of CATEGORIAS_SEED) {
    const norm = normalizarTextoClave(cat.nombre);
    await pool.query(
      `INSERT INTO categorias (nombre, nombre_normalizado, descripcion)
       VALUES ($1, $2, $3)
       ON CONFLICT (nombre_normalizado) DO NOTHING`,
      [cat.nombre, norm, cat.descripcion]
    );
  }

  const catsRes = await pool.query<{ id: number; nombre_normalizado: string }>(
    `SELECT id, nombre_normalizado FROM categorias`
  );
  const mapaCats = new Map(catsRes.rows.map((c) => [c.nombre_normalizado, c.id]));

  for (const it of ITEMS_SEED) {
    const catId = mapaCats.get(normalizarTextoClave(it.categoria));
    if (!catId) continue;
    await pool.query(
      `INSERT INTO items (categoria_id, codigo, nombre, nombre_normalizado, descripcion, precio, stock, tiempo_preparacion_min)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (codigo) DO NOTHING`,
      [catId, it.codigo, it.nombre, normalizarTextoClave(it.nombre), it.desc, it.precio, it.stock, it.tiempo]
    );
  }

  // 7. Si no hay pedidos/facturas/pagos aún, sembrar 6 operaciones completas con hash encadenado real
  const countPed = await pool.query<{ n: string }>(`SELECT COUNT(*) AS n FROM pedidos`);
  if (Number(countPed.rows[0]?.n ?? 0) === 0) {
    await sembrarOperacionesEncadenadasIniciales();
  }
}

async function sembrarOperacionesEncadenadasIniciales(): Promise<void> {
  const [usersRes, itemsRes] = await Promise.all([
    pool.query<{ id: number; email: string }>(`SELECT id, email FROM usuarios ORDER BY id ASC LIMIT 10`),
    pool.query<{ id: number; precio: string }>(`SELECT id, precio FROM items ORDER BY id ASC LIMIT 12`),
  ]);
  if (usersRes.rows.length === 0 || itemsRes.rows.length < 4) return;

  const canales: Array<'presencial' | 'web' | 'app' | 'domicilio'> = ['presencial', 'web', 'app', 'domicilio'];
  const metodos = ['efectivo', 'tarjeta_credito', 'nequi', 'daviplata', 'transferencia'];
  const cajeroId = usersRes.rows.find((u) => u.email.includes('cajero'))?.id ?? usersRes.rows[0].id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (let i = 0; i < 8; i++) {
      const cliente = usersRes.rows[(i + 2) % usersRes.rows.length];
      const itemA = itemsRes.rows[i % itemsRes.rows.length];
      const itemB = itemsRes.rows[(i + 3) % itemsRes.rows.length];
      const cantA = (i % 2) + 1;
      const cantB = 1;
      const subA = Number(itemA.precio) * cantA;
      const subB = Number(itemB.precio) * cantB;
      const subtotal = subA + subB;
      const canal = canales[i % canales.length];
      const esAnulado = i === 7; // 1 pedido anulado de ejemplo para analítica de anulaciones
      const fecha = new Date(Date.now() - (8 - i) * 3600 * 1000 * 5);

      const hashPedido = generarHashPedido({
        usuario_id: cliente.id,
        canal,
        subtotal,
        fecha_pedido: fecha,
      });

      const pedIns = await client.query(
        `INSERT INTO pedidos (usuario_id, atendido_por, canal, estado, subtotal, observaciones, motivo_anulacion, hash_integridad, fecha_pedido)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          cliente.id,
          cajeroId,
          canal,
          esAnulado ? 'anulado' : 'entregado',
          subtotal,
          `Pedido inicial de demostración #${i + 1}`,
          esAnulado ? 'Cancelación solicitada antes de despacho' : null,
          hashPedido,
          fecha,
        ]
      );
      const pedidoId = pedIns.rows[0].id;

      await client.query(
        `INSERT INTO pedido_items (pedido_id, item_id, cantidad, precio_unitario, subtotal)
         VALUES ($1, $2, $3, $4, $5), ($1, $6, $7, $8, $9)`,
        [pedidoId, itemA.id, cantA, Number(itemA.precio), subA, itemB.id, cantB, Number(itemB.precio), subB]
      );

      if (esAnulado) continue;

      const pctImp = 8;
      const pctDesc = i === 5 ? 22 : i % 3 === 0 ? 5 : 0; // i=5 simula un descuento elevado > 15%
      const impuesto = Math.round(subtotal * (pctImp / 100));
      const descuento = Math.round(subtotal * (pctDesc / 100));
      const total = Math.max(0, subtotal + impuesto - descuento);
      const consecutivo = `FAC-${String(i + 1).padStart(6, '0')}`;
      const hashAntFac = await obtenerUltimoHashFactura(client);
      const hashActFac = generarHashFactura(hashAntFac, {
        numero_consecutivo: consecutivo,
        pedido_id: pedidoId,
        usuario_id: cliente.id,
        subtotal,
        impuesto,
        descuento,
        total,
        fecha_emision: fecha.toISOString(),
      });

      const facIns = await client.query(
        `INSERT INTO facturas
           (numero_consecutivo, pedido_id, usuario_id, emitida_por, subtotal, porcentaje_impuesto,
            impuesto, porcentaje_descuento, descuento, total, estado, hash_anterior, hash_actual, fecha_emision)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pagada', $11, $12, $13)
         RETURNING id`,
        [
          consecutivo,
          pedidoId,
          cliente.id,
          cajeroId,
          subtotal,
          pctImp,
          impuesto,
          pctDesc,
          descuento,
          total,
          hashAntFac,
          hashActFac,
          fecha,
        ]
      );
      const facturaId = facIns.rows[0].id;

      const metodo = metodos[i % metodos.length];
      const referencia = `REF-${consecutivo}`;
      const comprobanteTexto = `COMPROBANTE_OFICIAL|${consecutivo}|${metodo}|${total}|${fecha.toISOString()}`;
      const comprobanteHash = calcularHashComprobante(comprobanteTexto, referencia);
      const hashAntPago = await obtenerUltimoHashPago(client);
      const hashActPago = generarHashPago(hashAntPago, {
        factura_id: facturaId,
        usuario_id: cliente.id,
        monto: total,
        metodo_pago: metodo,
        referencia_pago: referencia,
        comprobante_hash: comprobanteHash,
        fecha_pago: fecha.toISOString(),
      });

      await client.query(
        `INSERT INTO pagos
           (factura_id, usuario_id, procesado_por, monto, metodo_pago, referencia_pago,
            comprobante_nombre, comprobante_mime, comprobante_contenido, comprobante_hash,
            estado, hash_anterior, hash_actual, clasificacion_ia, score_fraude_ia, fecha_pago)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'text/plain', $8, $9, 'aprobado', $10, $11, 'normal', 0.08, $12)`,
        [
          facturaId,
          cliente.id,
          cajeroId,
          total,
          metodo,
          referencia,
          `comprobante_${consecutivo}.txt`,
          comprobanteTexto,
          comprobanteHash,
          hashAntPago,
          hashActPago,
          fecha,
        ]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[initDb] Error sembrando operaciones encadenadas:', err);
  } finally {
    client.release();
  }
}

