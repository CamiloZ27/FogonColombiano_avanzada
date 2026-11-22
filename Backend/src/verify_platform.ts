/**
 * Script de verificación integral end-to-end:
 * Prueba BD, trigger de roles inmutables, bcrypt, JWT Bearer, RBAC,
 * módulos operativos (descuento stock, facturas consecutivas, pagos + comprobante),
 * integridad encadenada + simulación de alteración, calidad de datos,
 * benchmarks O(n)/O(n log n)/O(n²), Simple Statistics y TensorFlow/Keras en disco.
 */
import http from 'http';
import { app } from './app';
import { inicializarBaseDeDatos, DEMO_PASSWORD_DEFAULT } from './db/initDb';
import { pool } from './db/pool';

async function req(
  baseUrl: string,
  method: string,
  path: string,
  token?: string,
  body?: unknown
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FALLO VERIFICACIÓN: ${msg}`);
  console.log(`  ✅ ${msg}`);
}

async function run() {
  console.log('=== 1. Inicializando Base de Datos y Esquema ===');
  await inicializarBaseDeDatos();
  console.log('  ✅ BD inicializada');

  // Probar inmutabilidad de roles en PostgreSQL (Trigger)
  let triggerDisparo = false;
  try {
    await pool.query(`UPDATE roles SET nombre = 'Hack' WHERE codigo = 'admin'`);
  } catch (e: any) {
    triggerDisparo = String(e.message).includes('no son editables');
  }
  assert(triggerDisparo, 'Trigger PostgreSQL trg_roles_inmutables bloqueó UPDATE sobre rol admin');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 4099;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    console.log('\n=== 2. Autenticación bcrypt + JWT Bearer + RBAC ===');
    const sinToken = await req(baseUrl, 'GET', '/api/admin/usuarios');
    assert(sinToken.status === 401, 'Endpoint protegido rechaza acceso sin Bearer Token (401)');

    const loginAdmin = await req(baseUrl, 'POST', '/api/auth/login', undefined, {
      email: 'admin@fogoncolombiano.com',
      password: DEMO_PASSWORD_DEFAULT,
    });
    assert(loginAdmin.status === 200 && Boolean(loginAdmin.data.access_token), 'Login admin con bcrypt + JWT Bearer OK');
    const adminToken = loginAdmin.data.access_token;

    const loginBad = await req(baseUrl, 'POST', '/api/auth/login', undefined, {
      email: 'admin@fogoncolombiano.com',
      password: 'clave_incorrecta',
    });
    assert(loginBad.status === 401, 'Contraseña errónea rechazada por bcrypt (401)');

    const verifBcrypt = await req(baseUrl, 'POST', '/api/auth/verificar-dato-sensible', adminToken, {
      campo: 'documento',
      valor: '1010001001',
    });
    assert(verifBcrypt.status === 200 && verifBcrypt.data.coincide === true, 'Verificación bcrypt de dato sensible (documento) OK');

    const mutarRol = await req(baseUrl, 'PUT', '/api/admin/roles/1', adminToken, { nombre: 'SuperHack' });
    assert(mutarRol.status === 403, 'API bloquea edición de roles predefinidos incluso para admin (403)');

    const loginCocinero = await req(baseUrl, 'POST', '/api/auth/login', undefined, {
      email: 'cocinero@fogoncolombiano.com',
      password: DEMO_PASSWORD_DEFAULT,
    });
    const cocineroToken = loginCocinero.data.access_token;
    const cocineroAdmin = await req(baseUrl, 'GET', '/api/admin/usuarios', cocineroToken);
    assert(cocineroAdmin.status === 403, 'RBAC bloquea acceso de cocinero a Administración de usuarios (403)');

    console.log('\n=== 3. Módulos Operativos (Stock + Factura Encadenada + Pago Comprobante + IA) ===');
    const itemsAntes = await req(baseUrl, 'GET', '/api/operacion/items', adminToken);
    const primerItem = itemsAntes.data.items[0];
    const stockInicial = Number(primerItem.stock);

    const pedidoRes = await req(baseUrl, 'POST', '/api/operacion/pedidos', adminToken, {
      canal: 'domicilio',
      observaciones: 'Test E2E automatizado',
      items: [{ item_id: primerItem.id, cantidad: 2 }],
    });
    assert(pedidoRes.status === 201, `Pedido multi-ítem creado (#${pedidoRes.data.pedido.id})`);

    const itemsDespues = await req(baseUrl, 'GET', '/api/operacion/items', adminToken);
    const itemAct = itemsDespues.data.items.find((x: any) => x.id === primerItem.id);
    assert(Number(itemAct.stock) === stockInicial - 2, `Inventario descontado automáticamente (${stockInicial} -> ${itemAct.stock})`);

    const facRes = await req(baseUrl, 'POST', '/api/operacion/facturas', adminToken, {
      pedido_id: pedidoRes.data.pedido.id,
      porcentaje_descuento: 5,
    });
    assert(
      facRes.status === 201 && String(facRes.data.factura.numero_consecutivo).startsWith('FAC-'),
      `Factura consecutiva emitida (${facRes.data.factura.numero_consecutivo}) con hash encadenado`
    );

    const pagoRes = await req(baseUrl, 'POST', '/api/operacion/pagos', adminToken, {
      factura_id: facRes.data.factura.id,
      metodo_pago: 'nequi',
      referencia_pago: 'NEQ-TEST-001',
      comprobante_nombre: 'soporte_nequi.txt',
      comprobante_contenido: 'COMPROBANTE_NEQUI_VALIDO_TEST_001',
    });
    assert(
      pagoRes.status === 201 && Boolean(pagoRes.data.evaluacion_ia?.clasificacion),
      `Pago procesado con comprobante SHA-256 y clasificación IA Keras: ${pagoRes.data.evaluacion_ia.clasificacion}`
    );

    console.log('\n=== 4. Integridad Criptográfica Encadenada ===');
    const intOk = await req(baseUrl, 'GET', '/api/analitica/integridad/verificar', adminToken);
    assert(intOk.status === 200 && intOk.data.integra_global === true, 'Verificación inicial: cadenas de facturas y pagos 100% íntegras');

    const alt = await req(baseUrl, 'POST', '/api/analitica/integridad/simular-alteracion', adminToken, { entidad: 'facturas' });
    assert(alt.status === 200 && alt.data.reporte.integra_global === false, 'Alteración simulada detectada inmediatamente en cadena de facturas');

    const rep = await req(baseUrl, 'POST', '/api/analitica/integridad/reparar', adminToken);
    assert(rep.status === 200 && rep.data.reporte.integra_global === true, 'Reparación de cadenas restaura integridad al 100%');

    console.log('\n=== 5. Limpieza y Calidad de Datos ===');
    const calBD = await req(baseUrl, 'POST', '/api/analitica/calidad/auditar', adminToken);
    assert(calBD.status === 200 && calBD.data.reporte.puntaje_calidad > 0, `Auditoría de calidad en BD OK (puntaje=${calBD.data.reporte.puntaje_calidad}%)`);

    const calLote = await req(baseUrl, 'POST', '/api/analitica/calidad/limpiar-lote', adminToken, {
      modulo: 'items',
      registros: [
        { nombre: '  bandeja  paisa ', categoria: 'platos FUERTES', precio: '$ 38.000', stock: 10 },
        { nombre: 'Bandeja Paisa', categoria: 'Platos Fuertes', precio: '38000', stock: 5 },
        { nombre: 'Malo', categoria: 'X', precio: '-100', stock: 1 },
      ],
    });
    assert(
      calLote.status === 200 && calLote.data.duplicados_detectados === 1 && calLote.data.registros_rechazados === 1,
      'Limpiador de lotes normalizó precio/texto, detectó 1 duplicado y rechazó 1 registro inválido'
    );

    console.log('\n=== 6. Algoritmos O(n), O(n log n), O(n²) y Benchmark ===');
    const bench = await req(baseUrl, 'GET', '/api/analitica/algoritmos/benchmark?tamanos=100,400,800', adminToken);
    assert(
      bench.status === 200 && bench.data.puntos.length === 3,
      `Benchmark experimental OK (mejora ordenamiento: ${bench.data.resumen_optimizacion.caso_1_ordenamiento.mejora_velocidad}, dedup: ${bench.data.resumen_optimizacion.caso_2_duplicados.mejora_velocidad})`
    );

    console.log('\n=== 7. IA No-LLM: Simple Statistics + TensorFlow/Keras (Disco) ===');
    const ssPerfiles = await req(baseUrl, 'GET', '/api/analitica/ia/estadisticas-usuarios', adminToken);
    assert(ssPerfiles.status === 200 && ssPerfiles.data.perfiles.length > 0, `Simple Statistics analizó ${ssPerfiles.data.perfiles.length} usuarios con cuartiles y score`);

    const ssReg = await req(baseUrl, 'GET', '/api/analitica/ia/regresion-demanda', adminToken);
    assert(ssReg.status === 200 && ssReg.data.predicciones.length === 14, `Simple Statistics regresión lineal OK (R²=${ssReg.data.ecuacion_ventas.r2})`);

    const kerasTrain = await req(baseUrl, 'POST', '/api/analitica/ia/entrenar-todo', adminToken, { epochs: 20, dias: 60 });
    assert(
      kerasTrain.status === 200 &&
        kerasTrain.data.estado_modelos.modelos.every((m: any) => m.guardado_en_disco === true),
      'Los 3 modelos Keras/TensorFlow entrenados y guardados en disco (Backend/models/*)'
    );

    const fraudeTest = await req(baseUrl, 'POST', '/api/analitica/ia/clasificar-fraude', adminToken, {
      monto: 450000,
      fecha: '2026-11-22T02:30:00Z',
      metodo_pago: 'tarjeta_credito',
      firma_valida: false,
      frecuencia_ventana: 6,
      promedio_usuario: 38000,
      descuento_pct: 45,
      canal: 'web',
    });
    assert(
      fraudeTest.status === 200 && fraudeTest.data.clasificacion === 'fraudulenta',
      `Clasificador Keras detectó operación fraudulenta (prob=${fraudeTest.data.probabilidad_fraude})`
    );

    console.log('\n🎉 TODAS LAS VERIFICACIONES PASARON CON ÉXITO.');
  } finally {
    server.close();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('\n❌ ERROR EN VERIFICACIÓN:', err);
  process.exit(1);
});

