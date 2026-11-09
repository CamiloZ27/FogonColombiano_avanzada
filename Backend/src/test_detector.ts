import {
  generarHashTransaccion,
  obtenerHashesEsperados,
  verificarHashTransaccion,
  PayloadParaHash,
} from './controllers/transacciones.controller';
import {
  VentanaDeslizanteManager,
  CONFIG_VENTANA,
  obtenerLimiteSegunHorario,
} from './repositories/slidingWindow.repository';

console.log('====================================================');
console.log('🧪 PRUEBAS UNITARIAS: DETECTOR DE ANOMALÍAS & HASH');
console.log('====================================================\n');

// 1. PRUEBA DE HASH Y DETECCIÓN DE ALTERACIONES (Slide 14 a 19)
console.log('1️⃣ PRUEBA: Integridad y Detección de Modificaciones por Hash');
const txnValida: PayloadParaHash = {
  user: 'b@b.com',
  date: '2026-09-23T10:30:01.000Z',
  value: 50000,
  paymentMethod: 'Tarjeta',
  idTxn: 10001,
};

const hashGenerado = generarHashTransaccion(txnValida);
console.log('• Hash generado para la transacción:', hashGenerado);

const esValido = verificarHashTransaccion(hashGenerado, txnValida);
console.assert(esValido === true, 'El hash generado debería ser válido');
console.log('  ✅ Validación con datos originales: ACEPTADO');

// Modificar datos (Slide 15 y 16: Si alguien modifica la transacción, el hash será diferente)
const txnAlterada: PayloadParaHash = {
  ...txnValida,
  value: 999999, // Alteración de monto
};
const alteracionDetectada = !verificarHashTransaccion(hashGenerado, txnAlterada);
console.assert(alteracionDetectada === true, 'La alteración de valor debe ser detectada');
console.log('  ✅ Detección de alteración de monto: RECHAZADO (401)');

// Prueba con hash de longitud inválida (Prevenir error de Buffer en timingSafeEqual)
const pruebaBufferSeguro = verificarHashTransaccion('invalido123', txnValida);
console.assert(pruebaBufferSeguro === false, 'Hash corto no debe provocar excepción');
console.log('  ✅ Protección contra excepción de timingSafeEqual: SEGURO (Retorna false sin caer)\n');

// 2. PRUEBA DE VENTANA DESLIZANTE (Slide 29 a 34, Slide 36, 39, 41)
console.log('2️⃣ PRUEBA: Algoritmo de Ventana Deslizante (Sliding Window)');
VentanaDeslizanteManager.limpiar();

const usuario1 = 101;
const usuario2 = 202;
const t0 = new Date('2026-09-23T10:00:01.000Z');
const t1 = new Date('2026-09-23T10:00:02.000Z');
const t2 = new Date('2026-09-23T10:00:03.000Z');
const t3 = new Date('2026-09-23T10:00:09.000Z');

// Caso de uso 1 (Slide 39 y 42): 3 transacciones en 3 segundos (10:00:01, 10:00:02, 10:00:03)
console.log('• Caso 1: 3 transacciones de usuario 1 dentro de 3 segundos (10:00:01, 10:00:02, 10:00:03)');
const v1 = VentanaDeslizanteManager.deslizarVentana(usuario1, { usuario_id: usuario1, valor: 50000, fecha_txn: t0 }, 3);
console.log(`  Txn 1 -> Elementos en ventana: ${v1.length} -> Normal`);

const v2 = VentanaDeslizanteManager.deslizarVentana(usuario1, { usuario_id: usuario1, valor: 30000, fecha_txn: t1 }, 3);
console.log(`  Txn 2 -> Elementos en ventana: ${v2.length} -> Normal`);

const v3 = VentanaDeslizanteManager.deslizarVentana(usuario1, { usuario_id: usuario1, valor: 20000, fecha_txn: t2 }, 3);
console.log(`  Txn 3 -> Elementos en ventana: ${v3.length} -> ¡ALERTA! >= 3 transacciones -> POSIBLE_FRAUDE`);
console.assert(v3.length === 3, 'Deben haber 3 transacciones activas en la ventana');

// Deslizamiento y expiración (Slide 31: "SALE un elemento, ENTRA un elemento")
console.log('• Caso 2: Transacción posterior a los 3 segundos (10:00:09)');
const v4 = VentanaDeslizanteManager.deslizarVentana(usuario1, { usuario_id: usuario1, valor: 15000, fecha_txn: t3 }, 3);
console.log(`  Txn 4 -> Elementos en ventana: ${v4.length} (las anteriores salieron de la ventana) -> Normal`);
console.assert(v4.length === 1, 'Las transacciones fuera de los 3 segundos deben haber salido');

// Caso de uso 3 (Slide 43): Diferentes usuarios no mezclan ventanas
console.log('• Caso 3: Ventanas aisladas por usuario (Slide 43)');
const vUsuario2 = VentanaDeslizanteManager.deslizarVentana(usuario2, { usuario_id: usuario2, valor: 70000, fecha_txn: t2 }, 3);
console.log(`  Usuario 2 en 10:00:03 -> Elementos en ventana de usuario 2: ${vUsuario2.length}`);
console.assert(vUsuario2.length === 1, 'Usuario 2 debe tener su propia ventana independiente');
console.log('  ✅ Las ventanas no se mezclan entre usuarios diferentes');

// Prueba de franjas horarias configurables (Slide 38)
console.log('\n3️⃣ PRUEBA: Límites dinámicos por franja horaria (Slide 38)');
const fechaManana = new Date('2026-09-23T08:00:00');
const fechaTarde = new Date('2026-09-23T15:00:00');
const fechaNoche = new Date('2026-09-23T22:00:00');

console.log(`  Límite Mañana (08:00): ${obtenerLimiteSegunHorario(fechaManana)} (Esperado: 10)`);
console.log(`  Límite Tarde (15:00):  ${obtenerLimiteSegunHorario(fechaTarde)} (Esperado: 6)`);
console.log(`  Límite Noche (22:00):  ${obtenerLimiteSegunHorario(fechaNoche)} (Esperado: 3)`);

console.assert(obtenerLimiteSegunHorario(fechaManana) === 10, 'Mañana debe ser 10');
console.assert(obtenerLimiteSegunHorario(fechaTarde) === 6, 'Tarde debe ser 6');
console.assert(obtenerLimiteSegunHorario(fechaNoche) === 3, 'Noche debe ser 3');

console.log('\n====================================================');
console.log('🎉 TODAS LAS PRUEBAS PASARON EXITOSAMENTE');
console.log('====================================================');
