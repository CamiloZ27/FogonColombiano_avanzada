import { pool } from '../db/pool';

export interface CambioLimpieza {
  campo: string;
  antes: unknown;
  despues: unknown;
  regla: string;
}

export interface ProblemaCalidad {
  indice: number;
  registro: Record<string, unknown>;
  tipo: 'invalido' | 'duplicado' | 'limpiado';
  motivos: string[];
  cambios?: CambioLimpieza[];
}

export interface ResultadoLimpiezaLote<T> {
  modulo: string;
  total_registros: number;
  registros_validos: number;
  registros_limpiados: number;
  duplicados_detectados: number;
  registros_rechazados: number;
  puntaje_calidad: number;
  datos_limpios: T[];
  problemas: ProblemaCalidad[];
}

// ── Utilidades de normalización de strings y valores ─────────────────────────

/**
 * Normaliza un string para comparación/unificación (sin tildes, minúsculas, espacios colapsados).
 * Complejidad: O(L) donde L es la longitud del texto.
 */
export function normalizarTextoClave(texto: unknown): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s&_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Formatea un nombre propio o categoría a Title Case limpio (sin espacios dobles ni caracteres basura).
 */
export function limpiarNombreLegible(texto: unknown): string {
  const limpio = String(texto ?? '')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!limpio) return '';

  const conectores = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'con', 'en', 'a', 'al']);
  return limpio
    .split(' ')
    .map((palabra, idx) => {
      const lower = palabra.toLowerCase();
      if (idx > 0 && conectores.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

export function normalizarEmail(email: unknown): string {
  return String(email ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

export function esEmailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/**
 * Limpia precios mal escritos (ej: "$ 38.000", "38,000 COP", "COP 45000.50") -> número válido.
 */
export function limpiarPrecio(raw: unknown): { valor: number | null; fueCorregido: boolean } {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? { valor: Math.round(raw * 100) / 100, fueCorregido: false } : { valor: null, fueCorregido: false };
  }
  const strOriginal = String(raw ?? '').trim();
  if (!strOriginal) return { valor: null, fueCorregido: false };

  // Quitar símbolos de moneda, letras y espacios
  let limpio = strOriginal.replace(/(cop|usd|\$|\s)/gi, '');

  // Formato colombiano de miles con punto: "38.000" o "1.250.000"
  if (/^\d{1,3}(\.\d{3})+$/.test(limpio)) {
    limpio = limpio.replace(/\./g, '');
  } else if (/^\d{1,3}(,\d{3})+$/.test(limpio)) {
    limpio = limpio.replace(/,/g, '');
  } else if (/^\d+,\d{1,2}$/.test(limpio)) {
    limpio = limpio.replace(',', '.');
  }

  const numero = Number(limpio);
  if (!Number.isFinite(numero)) {
    return { valor: null, fueCorregido: false };
  }

  const redondeado = Math.round(numero * 100) / 100;
  return {
    valor: redondeado,
    fueCorregido: strOriginal !== String(redondeado),
  };
}

const CANALES_ALIAS: Record<string, 'presencial' | 'web' | 'app' | 'domicilio'> = {
  presencial: 'presencial',
  local: 'presencial',
  mesa: 'presencial',
  restaurante: 'presencial',
  salon: 'presencial',
  web: 'web',
  pagina: 'web',
  online: 'web',
  app: 'app',
  movil: 'app',
  aplicacion: 'app',
  domicilio: 'domicilio',
  delivery: 'domicilio',
  envio: 'domicilio',
};

export function normalizarCanal(raw: unknown): 'presencial' | 'web' | 'app' | 'domicilio' | null {
  const clave = normalizarTextoClave(raw);
  return CANALES_ALIAS[clave] ?? null;
}

const METODOS_PAGO_ALIAS: Record<string, string> = {
  efectivo: 'efectivo',
  cash: 'efectivo',
  tarjeta: 'tarjeta_credito',
  'tarjeta de credito': 'tarjeta_credito',
  tarjeta_credito: 'tarjeta_credito',
  credito: 'tarjeta_credito',
  'tarjeta de debito': 'tarjeta_debito',
  tarjeta_debito: 'tarjeta_debito',
  debito: 'tarjeta_debito',
  transferencia: 'transferencia',
  'transferencia bancaria': 'transferencia',
  pse: 'transferencia',
  nequi: 'nequi',
  daviplata: 'daviplata',
};

export function normalizarMetodoPago(raw: unknown): string {
  const clave = normalizarTextoClave(raw);
  return METODOS_PAGO_ALIAS[clave] ?? (clave || 'efectivo');
}

// ── Validadores y limpiadores por módulo ─────────────────────────────────────

export function limpiarLoteItems(registros: Record<string, unknown>[]): ResultadoLimpiezaLote<{
  nombre: string;
  nombre_normalizado: string;
  categoria: string;
  categoria_normalizada: string;
  precio: number;
  stock: number;
}> {
  const vistos = new Set<string>();
  const datosLimpios: {
    nombre: string;
    nombre_normalizado: string;
    categoria: string;
    categoria_normalizada: string;
    precio: number;
    stock: number;
  }[] = [];
  const problemas: ProblemaCalidad[] = [];
  let limpiados = 0;
  let duplicados = 0;
  let rechazados = 0;

  registros.forEach((reg, idx) => {
    const motivos: string[] = [];
    const cambios: CambioLimpieza[] = [];

    const nombreLimpio = limpiarNombreLegible(reg.nombre);
    const nombreNorm = normalizarTextoClave(nombreLimpio);
    if (!nombreLimpio || nombreLimpio.length < 2) {
      motivos.push('Nombre de ítem vacío o demasiado corto');
    } else if (nombreLimpio !== String(reg.nombre ?? '')) {
      cambios.push({ campo: 'nombre', antes: reg.nombre, despues: nombreLimpio, regla: 'Normalización de texto / Title Case' });
    }

    const catLimpia = limpiarNombreLegible(reg.categoria || 'General');
    const catNorm = normalizarTextoClave(catLimpia);
    if (catLimpia !== String(reg.categoria ?? '')) {
      cambios.push({ campo: 'categoria', antes: reg.categoria, despues: catLimpia, regla: 'Unificación de categoría' });
    }

    const { valor: precio, fueCorregido } = limpiarPrecio(reg.precio);
    if (precio === null || precio <= 0) {
      motivos.push(`Precio inválido (${String(reg.precio)}): debe ser numérico mayor a 0`);
    } else if (fueCorregido) {
      cambios.push({ campo: 'precio', antes: reg.precio, despues: precio, regla: 'Limpieza de formato monetario' });
    }

    const stockNum = Number(reg.stock ?? 20);
    const stock = Number.isFinite(stockNum) && stockNum >= 0 ? Math.floor(stockNum) : -1;
    if (stock < 0) {
      motivos.push(`Stock inválido (${String(reg.stock)}): debe ser >= 0`);
    }

    if (motivos.length > 0) {
      rechazados++;
      problemas.push({ indice: idx, registro: reg, tipo: 'invalido', motivos });
      return;
    }

    if (vistos.has(nombreNorm)) {
      duplicados++;
      problemas.push({
        indice: idx,
        registro: reg,
        tipo: 'duplicado',
        motivos: [`Ítem duplicado detectado al normalizar clave '${nombreNorm}'`],
      });
      return;
    }

    vistos.add(nombreNorm);
    if (cambios.length > 0) {
      limpiados++;
      problemas.push({ indice: idx, registro: reg, tipo: 'limpiado', motivos: ['Registro corregido automáticamente'], cambios });
    }

    datosLimpios.push({
      nombre: nombreLimpio,
      nombre_normalizado: nombreNorm,
      categoria: catLimpia,
      categoria_normalizada: catNorm,
      precio: precio!,
      stock,
    });
  });

  const total = registros.length;
  const puntaje = total > 0 ? Math.round(((datosLimpios.length - limpiados * 0.25) / total) * 10000) / 100 : 100;

  return {
    modulo: 'items',
    total_registros: total,
    registros_validos: datosLimpios.length,
    registros_limpiados: limpiados,
    duplicados_detectados: duplicados,
    registros_rechazados: rechazados,
    puntaje_calidad: Math.max(0, Math.min(100, puntaje)),
    datos_limpios: datosLimpios,
    problemas,
  };
}

export function limpiarLoteUsuarios(registros: Record<string, unknown>[]): ResultadoLimpiezaLote<{
  nombre: string;
  email: string;
  telefono: string;
}> {
  const emailsVistos = new Set<string>();
  const nombresVistos = new Set<string>();
  const datosLimpios: { nombre: string; email: string; telefono: string }[] = [];
  const problemas: ProblemaCalidad[] = [];
  let limpiados = 0;
  let duplicados = 0;
  let rechazados = 0;

  registros.forEach((reg, idx) => {
    const motivos: string[] = [];
    const cambios: CambioLimpieza[] = [];

    const nombre = limpiarNombreLegible(reg.nombre);
    const email = normalizarEmail(reg.email);
    const telefono = String(reg.telefono ?? '').replace(/[^\d+]/g, '');

    if (!nombre || nombre.length < 2) motivos.push('Nombre de usuario vacío o inválido');
    if (!esEmailValido(email)) motivos.push(`Correo electrónico inválido (${String(reg.email)})`);

    if (nombre && nombre !== String(reg.nombre ?? '')) {
      cambios.push({ campo: 'nombre', antes: reg.nombre, despues: nombre, regla: 'Normalización de espacios y mayúsculas' });
    }
    if (email && email !== String(reg.email ?? '')) {
      cambios.push({ campo: 'email', antes: reg.email, despues: email, regla: 'Normalización de correo a minúsculas' });
    }

    if (motivos.length > 0) {
      rechazados++;
      problemas.push({ indice: idx, registro: reg, tipo: 'invalido', motivos });
      return;
    }

    const claveNombre = normalizarTextoClave(nombre);
    if (emailsVistos.has(email) || nombresVistos.has(claveNombre)) {
      duplicados++;
      problemas.push({
        indice: idx,
        registro: reg,
        tipo: 'duplicado',
        motivos: [emailsVistos.has(email) ? `Correo duplicado: ${email}` : `Posible cliente duplicado por nombre: ${nombre}`],
      });
      return;
    }

    emailsVistos.add(email);
    nombresVistos.add(claveNombre);

    if (cambios.length > 0) {
      limpiados++;
      problemas.push({ indice: idx, registro: reg, tipo: 'limpiado', motivos: ['Datos normalizados'], cambios });
    }

    datosLimpios.push({ nombre, email, telefono });
  });

  const total = registros.length;
  const puntaje = total > 0 ? Math.round(((datosLimpios.length - limpiados * 0.25) / total) * 10000) / 100 : 100;

  return {
    modulo: 'usuarios',
    total_registros: total,
    registros_validos: datosLimpios.length,
    registros_limpiados: limpiados,
    duplicados_detectados: duplicados,
    registros_rechazados: rechazados,
    puntaje_calidad: Math.max(0, Math.min(100, puntaje)),
    datos_limpios: datosLimpios,
    problemas,
  };
}

export function limpiarLoteOperaciones(registros: Record<string, unknown>[]): ResultadoLimpiezaLote<{
  usuario_email: string;
  canal: 'presencial' | 'web' | 'app' | 'domicilio';
  metodo_pago: string;
  valor: number;
  fecha: string;
}> {
  const vistos = new Set<string>();
  const datosLimpios: {
    usuario_email: string;
    canal: 'presencial' | 'web' | 'app' | 'domicilio';
    metodo_pago: string;
    valor: number;
    fecha: string;
  }[] = [];
  const problemas: ProblemaCalidad[] = [];
  let limpiados = 0;
  let duplicados = 0;
  let rechazados = 0;

  registros.forEach((reg, idx) => {
    const motivos: string[] = [];
    const cambios: CambioLimpieza[] = [];

    const email = normalizarEmail(reg.usuario_email || reg.email || reg.user);
    if (!esEmailValido(email)) motivos.push(`Email de operación inválido (${String(reg.usuario_email ?? reg.email)})`);

    const canal = normalizarCanal(reg.canal ?? 'presencial');
    if (!canal) motivos.push(`Canal no reconocido (${String(reg.canal)})`);
    else if (canal !== reg.canal) {
      cambios.push({ campo: 'canal', antes: reg.canal, despues: canal, regla: 'Unificación de canal operativo' });
    }

    const metodo = normalizarMetodoPago(reg.metodo_pago ?? 'efectivo');
    if (metodo !== reg.metodo_pago) {
      cambios.push({ campo: 'metodo_pago', antes: reg.metodo_pago, despues: metodo, regla: 'Normalización de método de pago' });
    }

    const { valor, fueCorregido } = limpiarPrecio(reg.valor ?? reg.monto);
    if (valor === null || valor <= 0) {
      motivos.push(`Monto inválido (${String(reg.valor ?? reg.monto)})`);
    } else if (fueCorregido) {
      cambios.push({ campo: 'valor', antes: reg.valor ?? reg.monto, despues: valor, regla: 'Limpieza numérica de monto' });
    }

    const fechaRaw = reg.fecha ? new Date(String(reg.fecha)) : new Date();
    if (Number.isNaN(fechaRaw.getTime())) {
      motivos.push(`Fecha inválida (${String(reg.fecha)})`);
    }

    if (motivos.length > 0) {
      rechazados++;
      problemas.push({ indice: idx, registro: reg, tipo: 'invalido', motivos });
      return;
    }

    const fechaIso = fechaRaw.toISOString();
    const claveDedup = `${email}|${valor}|${fechaIso.slice(0, 16)}|${metodo}`;
    if (vistos.has(claveDedup)) {
      duplicados++;
      problemas.push({ indice: idx, registro: reg, tipo: 'duplicado', motivos: ['Operación duplicada detectada (mismo usuario/monto/minuto/método)'] });
      return;
    }

    vistos.add(claveDedup);
    if (cambios.length > 0) {
      limpiados++;
      problemas.push({ indice: idx, registro: reg, tipo: 'limpiado', motivos: ['Operación normalizada'], cambios });
    }

    datosLimpios.push({ usuario_email: email, canal: canal!, metodo_pago: metodo, valor: valor!, fecha: fechaIso });
  });

  const total = registros.length;
  const puntaje = total > 0 ? Math.round(((datosLimpios.length - limpiados * 0.25) / total) * 10000) / 100 : 100;

  return {
    modulo: 'operaciones',
    total_registros: total,
    registros_validos: datosLimpios.length,
    registros_limpiados: limpiados,
    duplicados_detectados: duplicados,
    registros_rechazados: rechazados,
    puntaje_calidad: Math.max(0, Math.min(100, puntaje)),
    datos_limpios: datosLimpios,
    problemas,
  };
}

// ── Auditoría de calidad sobre la Base de Datos real ─────────────────────────

export async function ejecutarAuditoriaCalidadBD(ejecutadoPorId?: number) {
  const [usuariosRes, categoriasRes, itemsRes, pedidosRes, facturasRes, pagosRes, txnsRes] = await Promise.all([
    pool.query(`SELECT id, nombre, email, estado, password_hash, rol_id FROM usuarios`),
    pool.query(`SELECT id, nombre, nombre_normalizado FROM categorias`),
    pool.query(`SELECT id, nombre, nombre_normalizado, precio, stock, categoria_id FROM items`),
    pool.query(`SELECT id, canal, estado, subtotal, usuario_id FROM pedidos`),
    pool.query(`SELECT id, numero_consecutivo, subtotal, impuesto, descuento, total, hash_actual FROM facturas`),
    pool.query(`SELECT id, factura_id, monto, metodo_pago, comprobante_hash, hash_actual FROM pagos`),
    pool.query(`SELECT id, valor, metodo_pago, estado, hash FROM transacciones`),
  ]);

  const hallazgos: Array<{ modulo: string; tipo: string; severidad: 'baja' | 'media' | 'alta'; detalle: string; id?: number }> = [];
  let totalRegistros = 0;
  let limpiosAuto = 0;
  let duplicados = 0;
  let invalidos = 0;

  // 1. Usuarios: duplicados por nombre normalizado o emails sin normalizar
  const nombresUsuario = new Map<string, number>();
  for (const u of usuariosRes.rows) {
    totalRegistros++;
    const emailNorm = normalizarEmail(u.email);
    const nomNorm = normalizarTextoClave(u.nombre);
    if (emailNorm !== u.email) {
      limpiosAuto++;
      await pool.query(`UPDATE usuarios SET email = $2 WHERE id = $1`, [u.id, emailNorm]);
      hallazgos.push({ modulo: 'usuarios', tipo: 'normalizado', severidad: 'baja', id: u.id, detalle: `Email normalizado a '${emailNorm}'` });
    }
    if (nombresUsuario.has(nomNorm)) {
      duplicados++;
      hallazgos.push({ modulo: 'usuarios', tipo: 'duplicado', severidad: 'media', id: u.id, detalle: `Posible usuario duplicado por nombre: '${u.nombre}' (similar a #${nombresUsuario.get(nomNorm)})` });
    } else {
      nombresUsuario.set(nomNorm, u.id);
    }
    if (!u.rol_id) {
      invalidos++;
      hallazgos.push({ modulo: 'usuarios', tipo: 'sin_rol', severidad: 'alta', id: u.id, detalle: `Usuario '${u.email}' sin rol RBAC asignado` });
    }
  }

  // 2. Categorías: consistencia de normalización
  for (const c of categoriasRes.rows) {
    totalRegistros++;
    const norm = normalizarTextoClave(c.nombre);
    if (c.nombre_normalizado !== norm) {
      limpiosAuto++;
      hallazgos.push({ modulo: 'categorias', tipo: 'inconsistencia', severidad: 'baja', id: c.id, detalle: `Categoría '${c.nombre}' desincronizada con nombre_normalizado` });
    }
  }

  // 3. Ítems: duplicados por nombre normalizado, stock bajo o precios inconsistentes
  const itemsVistos = new Map<string, number>();
  for (const it of itemsRes.rows) {
    totalRegistros++;
    const norm = normalizarTextoClave(it.nombre);
    if (itemsVistos.has(norm)) {
      duplicados++;
      hallazgos.push({ modulo: 'items', tipo: 'duplicado', severidad: 'alta', id: it.id, detalle: `Ítem duplicado '${it.nombre}' (clave '${norm}' ya usada en #${itemsVistos.get(norm)})` });
    } else {
      itemsVistos.set(norm, it.id);
    }
    if (Number(it.precio) <= 0) {
      invalidos++;
      hallazgos.push({ modulo: 'items', tipo: 'precio_invalido', severidad: 'alta', id: it.id, detalle: `Ítem '${it.nombre}' tiene precio <= 0` });
    }
    if (Number(it.stock) === 0) {
      hallazgos.push({ modulo: 'items', tipo: 'sin_stock', severidad: 'media', id: it.id, detalle: `Ítem '${it.nombre}' agotado (stock = 0)` });
    }
  }

  // 4. Pedidos
  for (const p of pedidosRes.rows) {
    totalRegistros++;
    if (Number(p.subtotal) <= 0 && p.estado !== 'anulado') {
      invalidos++;
      hallazgos.push({ modulo: 'pedidos', tipo: 'monto_cero', severidad: 'media', id: p.id, detalle: `Pedido #${p.id} activo con subtotal 0` });
    }
  }

  // 5. Facturas: cuadre aritmético (subtotal + impuesto - descuento = total)
  for (const f of facturasRes.rows) {
    totalRegistros++;
    const esperado = Math.round((Number(f.subtotal) + Number(f.impuesto) - Number(f.descuento)) * 100) / 100;
    const real = Math.round(Number(f.total) * 100) / 100;
    if (Math.abs(esperado - real) > 1) {
      invalidos++;
      hallazgos.push({
        modulo: 'facturas',
        tipo: 'descuadre_totales',
        severidad: 'alta',
        id: f.id,
        detalle: `Factura ${f.numero_consecutivo}: total=${real} no coincide con subtotal+impuesto-descuento=${esperado}`,
      });
    }
  }

  // 6. Pagos: método normalizado y comprobante
  for (const pg of pagosRes.rows) {
    totalRegistros++;
    const metodoNorm = normalizarMetodoPago(pg.metodo_pago);
    if (metodoNorm !== pg.metodo_pago) {
      limpiosAuto++;
      await pool.query(`UPDATE pagos SET metodo_pago = $2 WHERE id = $1`, [pg.id, metodoNorm]);
      hallazgos.push({ modulo: 'pagos', tipo: 'normalizado', severidad: 'baja', id: pg.id, detalle: `Pago #${pg.id}: método '${pg.metodo_pago}' unificado a '${metodoNorm}'` });
    }
    if (!pg.comprobante_hash && pg.metodo_pago !== 'efectivo') {
      hallazgos.push({ modulo: 'pagos', tipo: 'sin_comprobante', severidad: 'media', id: pg.id, detalle: `Pago #${pg.id} (${pg.metodo_pago}) sin comprobante adjunto` });
    }
  }

  // 7. Transacciones: métodos inconsistentes (ej. 'Tarjeta' vs 'tarjeta_credito')
  let txnMetodosInconsistentes = 0;
  for (const t of txnsRes.rows) {
    totalRegistros++;
    if (Number(t.valor) <= 0) {
      invalidos++;
      hallazgos.push({ modulo: 'transacciones', tipo: 'valor_invalido', severidad: 'alta', id: t.id, detalle: `Transacción #${t.id} con valor <= 0` });
    }
    const metNorm = normalizarMetodoPago(t.metodo_pago);
    if (t.metodo_pago && metNorm !== t.metodo_pago) {
      txnMetodosInconsistentes++;
    }
  }
  if (txnMetodosInconsistentes > 0) {
    limpiosAuto += txnMetodosInconsistentes;
    hallazgos.push({
      modulo: 'transacciones',
      tipo: 'metodos_inconsistentes',
      severidad: 'baja',
      detalle: `${txnMetodosInconsistentes} transacciones con denominación heterogénea de método de pago (normalizables en analítica)`,
    });
  }

  const validos = Math.max(0, totalRegistros - invalidos - duplicados);
  const puntaje =
    totalRegistros > 0
      ? Math.max(0, Math.min(100, Math.round(((validos - duplicados * 0.5) / totalRegistros) * 10000) / 100))
      : 100;

  const resumen = {
    conteo_por_modulo: {
      usuarios: usuariosRes.rows.length,
      categorias: categoriasRes.rows.length,
      items: itemsRes.rows.length,
      pedidos: pedidosRes.rows.length,
      facturas: facturasRes.rows.length,
      pagos: pagosRes.rows.length,
      transacciones: txnsRes.rows.length,
    },
    hallazgos: hallazgos.slice(0, 100),
    total_hallazgos: hallazgos.length,
  };

  const inserted = await pool.query(
    `INSERT INTO reportes_calidad
       (modulo, ejecutado_por, total_registros, registros_validos, registros_limpiados, duplicados_detectados, registros_rechazados, puntaje_calidad, resumen_json)
     VALUES ('sistema_completo', $1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     RETURNING *`,
    [ejecutadoPorId ?? null, totalRegistros, validos, limpiosAuto, duplicados, invalidos, puntaje, JSON.stringify(resumen)]
  );

  return {
    reporte: inserted.rows[0],
    ...resumen,
  };
}

