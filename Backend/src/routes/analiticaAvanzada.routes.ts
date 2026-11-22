import { Request, Response, Router } from 'express';
import { pool } from '../db/pool';
import {
  autenticarJWT,
  registrarAuditoria,
  requerirPermiso,
  requerirRol,
} from '../middleware/auth.middleware';
import {
  analizarPatronesYRankingSistema,
  busquedaLinealPorId,
  cargarOperacionesSistema,
  conteoOperacionesPorCliente,
  detectarDuplicadosIngenuo,
  detectarDuplicadosOptimizado,
  ejecutarBenchmarkExperimental,
  normalizarYUnificarStrings,
  ordenamientoPorFechaMergeSort,
  ordenamientoSimpleBurbuja,
  sumaVentasLineal,
} from '../services/algoritmos.service';
import {
  ejecutarAuditoriaCalidadBD,
  limpiarLoteItems,
  limpiarLoteOperaciones,
  limpiarLoteUsuarios,
} from '../services/calidad.service';
import {
  analizarAnomaliasEstadisticasUsuarios,
  predecirDemandaSimpleStatistics,
} from '../services/estadistica.service';
import {
  clasificarOperacionFraude,
  entrenarClasificadorFraude,
  entrenarRegresorMontoEsperado,
  entrenarYPredecirDemandaKeras,
  obtenerEstadoModelosDisco,
  predecirMontoEsperado,
} from '../services/iaKeras.service';
import {
  repararCadenasIntegridad,
  verificarIntegridadCompleta,
} from '../services/integridad.service';

export const analiticaRouter = Router();

analiticaRouter.use(autenticarJWT);

// =============================================================================
// 1. PANEL EJECUTIVO UNIFICADO (Ventas, Alertas, Calidad, Integridad, IA)
// =============================================================================

analiticaRouter.get('/panel-ejecutivo', requerirPermiso('panel:ver'), async (_req: Request, res: Response) => {
  try {
    const [kpisRes, calidadRes, integridad, patrones, modelos] = await Promise.all([
      pool.query(`
        SELECT
          (SELECT COUNT(*)::int FROM usuarios WHERE estado = 'activo') AS usuarios_activos,
          (SELECT COUNT(*)::int FROM items WHERE activo = TRUE) AS items_catalogo,
          (SELECT COUNT(*)::int FROM items WHERE activo = TRUE AND stock <= stock_minimo) AS items_stock_bajo,
          (SELECT COUNT(*)::int FROM pedidos) AS total_pedidos,
          (SELECT COUNT(*)::int FROM pedidos WHERE estado = 'anulado') AS pedidos_anulados,
          (SELECT COUNT(*)::int FROM facturas) AS total_facturas,
          (SELECT COALESCE(SUM(total), 0)::float FROM facturas WHERE estado <> 'anulada') AS ventas_facturadas,
          (SELECT COUNT(*)::int FROM pagos WHERE estado = 'aprobado') AS pagos_aprobados,
          (SELECT COUNT(*)::int FROM pagos WHERE clasificacion_ia = 'fraudulenta') AS pagos_fraudulentos_ia,
          (SELECT COUNT(*)::int FROM transacciones) AS total_transacciones,
          (SELECT COALESCE(SUM(valor), 0)::float FROM transacciones WHERE estado = 'completada') AS ventas_transacciones,
          (SELECT COUNT(*)::int FROM anomalias WHERE estado = 'abierta') AS alertas_abiertas
      `),
      pool.query(`SELECT * FROM reportes_calidad ORDER BY fecha_creacion DESC LIMIT 1`),
      verificarIntegridadCompleta(),
      analizarPatronesYRankingSistema(),
      Promise.resolve(obtenerEstadoModelosDisco()),
    ]);

    return res.json({
      kpis: kpisRes.rows[0],
      ultimo_reporte_calidad: calidadRes.rows[0] ?? null,
      integridad: {
        integra_global: integridad.integra_global,
        facturas_bloques: integridad.facturas.total_bloques,
        facturas_alteradas: integridad.facturas.bloques_alterados,
        pagos_bloques: integridad.pagos.total_bloques,
        pagos_alterados: integridad.pagos.bloques_alterados,
      },
      patrones: patrones.patrones,
      top_items: patrones.ranking_items.items.slice(0, 5),
      modelos_ia: modelos,
    });
  } catch (err) {
    console.error('[analitica/panel-ejecutivo]', err);
    return res.status(500).json({ error: 'Error consultando panel ejecutivo.' });
  }
});

// =============================================================================
// 2. LIMPIEZA Y CALIDAD DE DATOS
// =============================================================================

analiticaRouter.get('/calidad/reportes', requerirPermiso('calidad:ver'), async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT rc.*, u.nombre AS ejecutado_por_nombre
         FROM reportes_calidad rc
         LEFT JOIN usuarios u ON u.id = rc.ejecutado_por
        ORDER BY rc.fecha_creacion DESC
        LIMIT 20`
    );
    return res.json({ reportes: rows });
  } catch (err) {
    console.error('[analitica/calidad/reportes]', err);
    return res.status(500).json({ error: 'Error consultando reportes de calidad.' });
  }
});

analiticaRouter.post('/calidad/auditar', requerirPermiso('calidad:ejecutar'), async (req: Request, res: Response) => {
  try {
    const resultado = await ejecutarAuditoriaCalidadBD(req.usuario?.id);
    await registrarAuditoria(req, 'AUDITORIA_CALIDAD_DATOS', '/api/analitica/calidad/auditar', {
      puntaje: resultado.reporte.puntaje_calidad,
    });
    return res.json(resultado);
  } catch (err) {
    console.error('[analitica/calidad/auditar]', err);
    return res.status(500).json({ error: 'Error ejecutando auditoría de calidad.' });
  }
});

analiticaRouter.post('/calidad/limpiar-lote', requerirPermiso('calidad:ejecutar'), async (req: Request, res: Response) => {
  try {
    const modulo = String(req.body?.modulo ?? 'items');
    const registros = Array.isArray(req.body?.registros) ? req.body.registros : [];

    let resultado;
    if (modulo === 'usuarios') resultado = limpiarLoteUsuarios(registros);
    else if (modulo === 'operaciones') resultado = limpiarLoteOperaciones(registros);
    else resultado = limpiarLoteItems(registros);

    await pool.query(
      `INSERT INTO reportes_calidad
         (modulo, ejecutado_por, total_registros, registros_validos, registros_limpiados,
          duplicados_detectados, registros_rechazados, puntaje_calidad, resumen_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        `lote_${modulo}`,
        req.usuario!.id,
        resultado.total_registros,
        resultado.registros_validos,
        resultado.registros_limpiados,
        resultado.duplicados_detectados,
        resultado.registros_rechazados,
        resultado.puntaje_calidad,
        JSON.stringify({ problemas: resultado.problemas.slice(0, 50) }),
      ]
    );

    return res.json(resultado);
  } catch (err) {
    console.error('[analitica/calidad/limpiar-lote]', err);
    return res.status(500).json({ error: 'Error limpiando lote de datos.' });
  }
});

// =============================================================================
// 3. INTEGRIDAD CRIPTOGRÁFICA (HASH ENCADENADO FACTURAS & PAGOS)
// =============================================================================

analiticaRouter.get('/integridad/verificar', requerirPermiso('integridad:ver'), async (_req: Request, res: Response) => {
  try {
    const reporte = await verificarIntegridadCompleta();
    return res.json(reporte);
  } catch (err) {
    console.error('[analitica/integridad/verificar]', err);
    return res.status(500).json({ error: 'Error verificando cadenas de integridad.' });
  }
});

analiticaRouter.post('/integridad/simular-alteracion', requerirRol('admin', 'gerente'), async (req: Request, res: Response) => {
  try {
    const entidad = req.body?.entidad === 'pagos' ? 'pagos' : 'facturas';
    if (entidad === 'facturas') {
      const target = await pool.query(`SELECT id, numero_consecutivo, total FROM facturas ORDER BY id ASC LIMIT 1`);
      if (target.rows.length === 0) return res.status(404).json({ error: 'No hay facturas para simular alteración.' });
      await pool.query(`UPDATE facturas SET total = total + 15000 WHERE id = $1`, [target.rows[0].id]);
      await registrarAuditoria(req, 'SIMULAR_ALTERACION_FACTURA', `/api/analitica/integridad/simular-alteracion`, {
        factura_id: target.rows[0].id,
      });
      return res.json({
        mensaje: `Alteración simulada en factura ${target.rows[0].numero_consecutivo} (+15.000 COP sin recalcular hash). Ejecute la verificación para detectarla.`,
        reporte: await verificarIntegridadCompleta(),
      });
    } else {
      const target = await pool.query(`SELECT id, monto FROM pagos ORDER BY id ASC LIMIT 1`);
      if (target.rows.length === 0) return res.status(404).json({ error: 'No hay pagos para simular alteración.' });
      await pool.query(
        `UPDATE pagos SET comprobante_contenido = COALESCE(comprobante_contenido, '') || '_ALTERADO' WHERE id = $1`,
        [target.rows[0].id]
      );
      await registrarAuditoria(req, 'SIMULAR_ALTERACION_PAGO', `/api/analitica/integridad/simular-alteracion`, {
        pago_id: target.rows[0].id,
      });
      return res.json({
        mensaje: `Alteración simulada en el comprobante del Pago #${target.rows[0].id}. Ejecute la verificación para detectarla.`,
        reporte: await verificarIntegridadCompleta(),
      });
    }
  } catch (err) {
    console.error('[analitica/integridad/simular-alteracion]', err);
    return res.status(500).json({ error: 'Error simulando alteración.' });
  }
});

analiticaRouter.post('/integridad/reparar', requerirRol('admin', 'gerente'), async (req: Request, res: Response) => {
  try {
    const resRep = await repararCadenasIntegridad();
    await registrarAuditoria(req, 'REPARAR_CADENAS_INTEGRIDAD', '/api/analitica/integridad/reparar', resRep);
    return res.json({
      mensaje: 'Cadenas de integridad recalculadas y selladas correctamente.',
      ...resRep,
      reporte: await verificarIntegridadCompleta(),
    });
  } catch (err) {
    console.error('[analitica/integridad/reparar]', err);
    return res.status(500).json({ error: 'Error reparando cadenas.' });
  }
});

// =============================================================================
// 4. ALGORITMOS O(n), O(n log n), O(n²), BENCHMARKS Y ANÁLISIS DE PATRONES
// =============================================================================

analiticaRouter.get('/algoritmos/benchmark', requerirPermiso('algoritmos:ver'), async (req: Request, res: Response) => {
  try {
    const raw = String(req.query.tamanos ?? '100,300,600,1200,2000');
    const tamanos = raw
      .split(',')
      .map((x) => Number(x.trim()))
      .filter((x) => Number.isFinite(x) && x > 0);

    const resultado = await ejecutarBenchmarkExperimental(tamanos.length > 0 ? tamanos : [100, 300, 600, 1200, 2000]);
    return res.json(resultado);
  } catch (err) {
    console.error('[analitica/algoritmos/benchmark]', err);
    return res.status(500).json({ error: 'Error ejecutando benchmark algorítmico.' });
  }
});

analiticaRouter.get('/algoritmos/patrones', requerirPermiso('algoritmos:ver'), async (_req: Request, res: Response) => {
  try {
    const resultado = await analizarPatronesYRankingSistema();
    return res.json(resultado);
  } catch (err) {
    console.error('[analitica/algoritmos/patrones]', err);
    return res.status(500).json({ error: 'Error analizando patrones operativos.' });
  }
});

analiticaRouter.post('/algoritmos/ejecutar', requerirPermiso('algoritmos:ver'), async (req: Request, res: Response) => {
  try {
    const algoritmo = String(req.body?.algoritmo ?? 'busqueda_lineal');
    const limite = Math.min(2500, Math.max(20, Number(req.body?.limite ?? 500)));
    const ops = await cargarOperacionesSistema(limite);

    if (algoritmo === 'busqueda_lineal') {
      const idBuscar = Number(req.body?.id ?? ops[Math.floor(ops.length / 2)]?.id ?? 1);
      return res.json(busquedaLinealPorId(ops, idBuscar));
    }
    if (algoritmo === 'suma_ventas') {
      return res.json(sumaVentasLineal(ops));
    }
    if (algoritmo === 'conteo_clientes') {
      return res.json(conteoOperacionesPorCliente(ops));
    }
    if (algoritmo === 'normalizar_strings') {
      const textos = Array.isArray(req.body?.textos)
        ? req.body.textos.map(String)
        : ['  Bandeja   Paisa ', 'bandeja paisa', 'BANDEJA PAÍSA', 'Ajiaco Santafereño', 'ajiaco santafereno', 'Empanadas con Ají'];
      return res.json(normalizarYUnificarStrings(textos));
    }
    if (algoritmo === 'comparar_ordenamiento') {
      const sub = ops.slice(0, Math.min(800, ops.length));
      const bubble = ordenamientoSimpleBurbuja(sub, 'fecha');
      const merge = ordenamientoPorFechaMergeSort(sub);
      return res.json({
        n: sub.length,
        bubble_sort: {
          algoritmo: bubble.algoritmo,
          complejidad: bubble.complejidad,
          operaciones: bubble.operaciones,
          comparaciones: bubble.comparaciones,
          intercambios: bubble.intercambios,
          tiempo_ms: bubble.tiempo_ms,
        },
        merge_sort: {
          algoritmo: merge.algoritmo,
          complejidad: merge.complejidad,
          operaciones: merge.operaciones,
          comparaciones: merge.comparaciones,
          tiempo_ms: merge.tiempo_ms,
        },
        muestra_ordenada: merge.resultado.slice(0, 10),
      });
    }
    if (algoritmo === 'comparar_duplicados') {
      const sub = ops.slice(0, Math.min(1200, ops.length));
      return res.json({
        n: sub.length,
        ingenuo_on2: detectarDuplicadosIngenuo(sub),
        optimizado_on: detectarDuplicadosOptimizado(sub),
      });
    }

    return res.status(400).json({ error: `Algoritmo '${algoritmo}' no soportado.` });
  } catch (err) {
    console.error('[analitica/algoritmos/ejecutar]', err);
    return res.status(500).json({ error: 'Error ejecutando algoritmo.' });
  }
});

// =============================================================================
// 5. INTELIGENCIA ARTIFICIAL NO-LLM (Simple Statistics + TensorFlow/Keras)
// =============================================================================

analiticaRouter.get('/ia/estado', requerirPermiso('ia:ver'), (_req: Request, res: Response) => {
  return res.json(obtenerEstadoModelosDisco());
});

analiticaRouter.get('/ia/estadisticas-usuarios', requerirPermiso('ia:ver'), async (_req: Request, res: Response) => {
  try {
    const resultado = await analizarAnomaliasEstadisticasUsuarios();
    return res.json(resultado);
  } catch (err) {
    console.error('[analitica/ia/estadisticas-usuarios]', err);
    return res.status(500).json({ error: 'Error calculando perfiles estadísticos con Simple Statistics.' });
  }
});

analiticaRouter.get('/ia/regresion-demanda', requerirPermiso('ia:ver'), async (req: Request, res: Response) => {
  try {
    const dias = Math.min(365, Math.max(14, Number(req.query.dias) || 90));
    const futuro = Math.min(30, Math.max(7, Number(req.query.futuro) || 14));
    const resultado = await predecirDemandaSimpleStatistics(dias, futuro);
    return res.json(resultado);
  } catch (err) {
    console.error('[analitica/ia/regresion-demanda]', err);
    return res.status(500).json({ error: 'Error ejecutando regresión lineal con Simple Statistics.' });
  }
});

analiticaRouter.post('/ia/entrenar-todo', requerirPermiso('ia:entrenar'), async (req: Request, res: Response) => {
  try {
    const epochs = Math.min(80, Math.max(15, Number(req.body?.epochs) || 35));
    const dias = Math.min(365, Math.max(30, Number(req.body?.dias) || 90));

    const fraude = await entrenarClasificadorFraude(epochs);
    const monto = await entrenarRegresorMontoEsperado(epochs);
    const demanda = await entrenarYPredecirDemandaKeras(dias, epochs, 14);

    await registrarAuditoria(req, 'ENTRENAR_MODELOS_KERAS', '/api/analitica/ia/entrenar-todo', {
      epochs,
      dias,
      acc_fraude: fraude.metrics.accuracy,
      r2_demanda: demanda.modelo.r2,
    });

    return res.json({
      mensaje: 'Los modelos predictivos fueron actualizados correctamente.',
      clasificador_fraude: fraude,
      regresor_monto: monto,
      predictor_demanda: demanda.modelo,
      estado_modelos: obtenerEstadoModelosDisco(),
    });
  } catch (err) {
    console.error('[analitica/ia/entrenar-todo]', err);
    return res.status(500).json({ error: 'Error entrenando modelos Keras/TensorFlow.' });
  }
});

analiticaRouter.post('/ia/clasificar-fraude', requerirPermiso('ia:ver'), async (req: Request, res: Response) => {
  try {
    const resultado = await clasificarOperacionFraude({
      monto: Number(req.body?.monto ?? 45000),
      fecha: req.body?.fecha || new Date().toISOString(),
      metodo_pago: String(req.body?.metodo_pago ?? 'tarjeta_credito'),
      firma_valida: req.body?.firma_valida !== false,
      frecuencia_ventana: Number(req.body?.frecuencia_ventana ?? 1),
      promedio_usuario: Number(req.body?.promedio_usuario ?? 40000),
      descuento_pct: Number(req.body?.descuento_pct ?? 0),
      canal: String(req.body?.canal ?? 'presencial'),
    });
    return res.json(resultado);
  } catch (err) {
    console.error('[analitica/ia/clasificar-fraude]', err);
    return res.status(500).json({ error: 'Error clasificando operación con modelo Keras.' });
  }
});

analiticaRouter.post('/ia/predecir-monto', requerirPermiso('ia:ver'), async (req: Request, res: Response) => {
  try {
    const montoReal = req.body?.monto_real !== undefined ? Number(req.body.monto_real) : undefined;
    const resultado = await predecirMontoEsperado(
      {
        promedio_usuario: Number(req.body?.promedio_usuario ?? 40000),
        hora: Number(req.body?.hora ?? new Date().getHours()),
        dia_semana: Number(req.body?.dia_semana ?? new Date().getDay()),
        canal: String(req.body?.canal ?? 'presencial'),
        metodo_pago: String(req.body?.metodo_pago ?? 'tarjeta_credito'),
        cantidad_items: Number(req.body?.cantidad_items ?? 2),
      },
      montoReal
    );
    return res.json(resultado);
  } catch (err) {
    console.error('[analitica/ia/predecir-monto]', err);
    return res.status(500).json({ error: 'Error prediciendo monto esperado.' });
  }
});

analiticaRouter.get('/ia/predecir-demanda', requerirPermiso('ia:ver'), async (req: Request, res: Response) => {
  try {
    const dias = Math.min(365, Math.max(21, Number(req.query.dias) || 90));
    const epochs = Math.min(80, Math.max(15, Number(req.query.epochs) || 40));
    const resultado = await entrenarYPredecirDemandaKeras(dias, epochs, 14);
    return res.json(resultado);
  } catch (err) {
    console.error('[analitica/ia/predecir-demanda]', err);
    return res.status(500).json({ error: 'Error prediciendo demanda con Keras/TensorFlow.' });
  }
});

