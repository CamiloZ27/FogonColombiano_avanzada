import * as tf from '@tensorflow/tfjs';
import fs from 'fs';
import path from 'path';
import { pool } from '../db/pool';

const MODELS_DIR = path.resolve(__dirname, '../../models');

// ── Persistencia de modelos Keras/TensorFlow en disco (IOHandler Node fs) ────

function crearFileSystemIOHandler(modelDir: string): tf.io.IOHandler {
  return {
    async save(modelArtifacts: tf.io.ModelArtifacts): Promise<tf.io.SaveResult> {
      fs.mkdirSync(modelDir, { recursive: true });
      const weightsFile = 'weights.bin';
      const weightData = modelArtifacts.weightData;
      let weightBytes = 0;

      if (weightData) {
        let buffer: Buffer;
        if (Array.isArray(weightData)) {
          buffer = Buffer.concat(weightData.map((ab) => Buffer.from(ab)));
        } else {
          buffer = Buffer.from(weightData);
        }
        fs.writeFileSync(path.join(modelDir, weightsFile), buffer);
        weightBytes = buffer.byteLength;
      }

      const modelJson = {
        format: modelArtifacts.format ?? 'layers-model',
        generatedBy: modelArtifacts.generatedBy ?? 'TensorFlow.js Keras Layers',
        convertedBy: modelArtifacts.convertedBy ?? null,
        modelTopology: modelArtifacts.modelTopology,
        weightsManifest: [
          {
            paths: [weightsFile],
            weights: modelArtifacts.weightSpecs ?? [],
          },
        ],
      };

      fs.writeFileSync(path.join(modelDir, 'model.json'), JSON.stringify(modelJson, null, 2), 'utf8');

      return {
        modelArtifactsInfo: {
          dateSaved: new Date(),
          modelTopologyType: 'JSON',
          weightDataBytes: weightBytes,
        },
      };
    },

    async load(): Promise<tf.io.ModelArtifacts> {
      const jsonPath = path.join(modelDir, 'model.json');
      if (!fs.existsSync(jsonPath)) {
        throw new Error(`Modelo no encontrado en disco: ${jsonPath}`);
      }
      const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      const manifest = parsed.weightsManifest?.[0];
      const weightsPath = path.join(modelDir, manifest?.paths?.[0] || 'weights.bin');
      const buf = fs.readFileSync(weightsPath);
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

      return {
        format: parsed.format,
        generatedBy: parsed.generatedBy,
        convertedBy: parsed.convertedBy,
        modelTopology: parsed.modelTopology,
        weightSpecs: manifest?.weights ?? [],
        weightData: ab,
      };
    },
  };
}

interface ScalerMeta {
  min: number[];
  max: number[];
  trainedAt: string;
  samplesOriginal: number;
  samplesAugmented: number;
  metrics: Record<string, number>;
}

function guardarMeta(modelDir: string, meta: ScalerMeta) {
  fs.mkdirSync(modelDir, { recursive: true });
  fs.writeFileSync(path.join(modelDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
}

function cargarMeta(modelDir: string): ScalerMeta | null {
  const p = path.join(modelDir, 'meta.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8')) as ScalerMeta;
}

/**
 * Normalización Min-Max con tensores de TensorFlow.
 */
function normalizarMatrizTF(datos: number[][]): {
  tensorNorm: tf.Tensor2D;
  min: number[];
  max: number[];
} {
  const tensor = tf.tensor2d(datos);
  const minT = tensor.min(0);
  const maxT = tensor.max(0);
  const rango = maxT.sub(minT).add(tf.scalar(1e-6));
  const tensorNorm = tensor.sub(minT).div(rango) as tf.Tensor2D;

  const min = Array.from(minT.dataSync());
  const max = Array.from(maxT.dataSync());

  tensor.dispose();
  minT.dispose();
  maxT.dispose();
  rango.dispose();

  return { tensorNorm, min, max };
}

function normalizarVectorConScaler(vector: number[], min: number[], max: number[]): number[] {
  return vector.map((v, i) => {
    const den = (max[i] ?? 1) - (min[i] ?? 0) + 1e-6;
    const norm = (v - (min[i] ?? 0)) / den;
    return Math.max(0, Math.min(1.5, norm));
  });
}

// ── Codificación de variables categóricas ────────────────────────────────────

const METODOS_CODE: Record<string, number> = {
  efectivo: 0.1,
  tarjeta_debito: 0.3,
  tarjeta_credito: 0.5,
  tarjeta: 0.5,
  transferencia: 0.7,
  nequi: 0.85,
  daviplata: 1.0,
};

const CANALES_CODE: Record<string, number> = {
  presencial: 0.1,
  web: 0.4,
  app: 0.7,
  domicilio: 1.0,
};

function codificarMetodo(m?: string): number {
  return METODOS_CODE[(m ?? 'efectivo').toLowerCase()] ?? 0.5;
}

function codificarCanal(c?: string): number {
  return CANALES_CODE[(c ?? 'presencial').toLowerCase()] ?? 0.1;
}

// ── Cache en memoria de modelos cargados ─────────────────────────────────────

let fraudModelCache: tf.LayersModel | null = null;
let fraudMetaCache: ScalerMeta | null = null;

let amountModelCache: tf.LayersModel | null = null;
let amountMetaCache: ScalerMeta | null = null;

let demandModelCache: tf.LayersModel | null = null;
let demandMetaCache: ScalerMeta | null = null;

// =============================================================================
// MODELO 1: CLASIFICADOR DE OPERACIONES (NORMAL vs FRAUDULENTA) — KERAS/TF
// Entrada: monto, hora, dia_semana, metodo_pago, firma_valida, frecuencia,
//          ratio_monto_usuario, descuento_pct, canal
// =============================================================================

export interface EntradaClasificadorFraude {
  monto: number;
  fecha: string | Date;
  metodo_pago: string;
  firma_valida: boolean;
  frecuencia_ventana: number;
  promedio_usuario?: number;
  descuento_pct?: number;
  canal?: string;
}

function vectorizarOperacionFraude(e: EntradaClasificadorFraude): number[] {
  const f = typeof e.fecha === 'string' ? new Date(e.fecha) : e.fecha;
  const hora = Number.isNaN(f.getTime()) ? 12 : f.getHours();
  const diaSemana = Number.isNaN(f.getTime()) ? 3 : f.getDay();
  const prom = e.promedio_usuario && e.promedio_usuario > 0 ? e.promedio_usuario : 40000;
  const ratioMonto = e.monto / prom;

  return [
    Number(e.monto || 0),
    hora,
    diaSemana,
    codificarMetodo(e.metodo_pago),
    e.firma_valida ? 1 : 0,
    Number(e.frecuencia_ventana || 1),
    ratioMonto,
    Number(e.descuento_pct || 0),
    codificarCanal(e.canal),
  ];
}

export async function entrenarClasificadorFraude(epochs: number = 35) {
  // 1. Extraer datos reales de transacciones y anomalías de PostgreSQL
  const { rows } = await pool.query(
    `SELECT t.id, t.usuario_id, t.valor::float AS valor, t.fecha_txn,
            COALESCE(t.metodo_pago, 'efectivo') AS metodo_pago,
            COALESCE(t.canal, 'presencial') AS canal,
            COALESCE(t.descuento, 0)::float AS descuento,
            CASE WHEN t.hash IS NOT NULL AND length(t.hash) >= 10 THEN 1 ELSE 0 END AS firma_ok,
            (SELECT AVG(t2.valor)::float FROM transacciones t2 WHERE t2.usuario_id = t.usuario_id) AS prom_usuario,
            (SELECT COALESCE(MAX(a.cantidad_transacciones), 1) FROM anomalias a WHERE a.transaccion_id = t.id) AS freq,
            EXISTS(SELECT 1 FROM anomalias a WHERE a.transaccion_id = t.id) AS es_anomalia
       FROM transacciones t
      ORDER BY t.fecha_txn DESC
      LIMIT 1200`
  );

  const X: number[][] = [];
  const y: number[] = [];

  for (const r of rows) {
    const val = Number(r.valor);
    const prom = Number(r.prom_usuario || 40000);
    const descPct = val > 0 ? (Number(r.descuento || 0) / val) * 100 : 0;
    const vec = vectorizarOperacionFraude({
      monto: val,
      fecha: r.fecha_txn,
      metodo_pago: r.metodo_pago,
      firma_valida: Boolean(r.firma_ok),
      frecuencia_ventana: Number(r.freq || 1),
      promedio_usuario: prom,
      descuento_pct: descPct,
      canal: r.canal,
    });
    X.push(vec);
    y.push(r.es_anomalia ? 1 : 0);
  }

  const samplesOriginal = X.length;

  // 2. Aumento de datos (Data Augmentation) para balancear patrones normales y fraudulentos
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  // Muestras sintéticas normales (comportamiento legítimo de restaurante)
  for (let i = 0; i < 180; i++) {
    const monto = 14000 + rand() * 72000;
    const hora = rand() < 0.55 ? 11 + Math.floor(rand() * 4) : 18 + Math.floor(rand() * 4);
    const dia = Math.floor(rand() * 7);
    const metodos = ['efectivo', 'tarjeta_debito', 'tarjeta_credito', 'nequi', 'daviplata'];
    const canales = ['presencial', 'web', 'app', 'domicilio'];
    X.push([
      monto,
      hora,
      dia,
      codificarMetodo(metodos[i % metodos.length]),
      1, // firma válida
      1 + (rand() < 0.12 ? 1 : 0), // 1-2 txn en ventana
      0.5 + rand() * 1.1, // ratio normal
      rand() < 0.2 ? rand() * 10 : 0, // descuento 0-10%
      codificarCanal(canales[i % canales.length]),
    ]);
    y.push(0);
  }

  // Muestras sintéticas fraudulentas (ráfagas, firma falsa, montos extremos, descuentos abusivos, madrugada)
  for (let i = 0; i < 180; i++) {
    const tipo = i % 4;
    const monto = tipo === 0 ? 180000 + rand() * 450000 : 25000 + rand() * 120000;
    const hora = tipo === 1 ? Math.floor(rand() * 5) : 10 + Math.floor(rand() * 13);
    const dia = Math.floor(rand() * 7);
    const firmaValida = tipo === 2 ? 0 : rand() < 0.25 ? 0 : 1;
    const freq = tipo === 1 ? 3 + Math.floor(rand() * 6) : rand() < 0.4 ? 3 + Math.floor(rand() * 4) : 1;
    const ratio = tipo === 0 ? 3.2 + rand() * 5.0 : 1.0 + rand() * 2.5;
    const descPct = tipo === 3 ? 25 + rand() * 55 : rand() * 20;

    X.push([
      monto,
      hora,
      dia,
      codificarMetodo(rand() < 0.65 ? 'tarjeta_credito' : 'nequi'),
      firmaValida,
      freq,
      ratio,
      descPct,
      codificarCanal(rand() < 0.6 ? 'web' : 'domicilio'),
    ]);
    y.push(1);
  }

  // 3. Normalización con TensorFlow + ruido gaussiano leve (data augmentation)
  const { tensorNorm, min, max } = normalizarMatrizTF(X);
  const ruido = tf.randomNormal(tensorNorm.shape, 0, 0.015);
  const xAug = tensorNorm.add(ruido).clipByValue(0, 1.2) as tf.Tensor2D;
  const xTotal = tf.concat([tensorNorm, xAug], 0);
  const yBase = tf.tensor2d(y, [y.length, 1]);
  const yTotal = tf.concat([yBase, yBase], 0);

  // 4. Definición de red Keras Sequential
  const model = tf.sequential({
    layers: [
      tf.layers.dense({ inputShape: [9], units: 32, activation: 'relu' }),
      tf.layers.dropout({ rate: 0.2 }),
      tf.layers.dense({ units: 16, activation: 'relu' }),
      tf.layers.dense({ units: 8, activation: 'relu' }),
      tf.layers.dense({ units: 1, activation: 'sigmoid' }),
    ],
  });

  model.compile({
    optimizer: tf.train.adam(0.01),
    loss: 'binaryCrossentropy',
    metrics: ['accuracy'],
  });

  const history = await model.fit(xTotal, yTotal, {
    epochs,
    batchSize: 32,
    validationSplit: 0.2,
    shuffle: true,
    verbose: 0,
  });

  const lossFinal = Number(history.history.loss[history.history.loss.length - 1] ?? 0);
  const accFinal = Number(history.history.acc?.[history.history.acc.length - 1] ?? 0);
  const valAccFinal = Number(history.history.val_acc?.[history.history.val_acc.length - 1] ?? accFinal);

  // 5. Guardar modelo Keras + scaler en disco
  const modelDir = path.join(MODELS_DIR, 'fraud-classifier');
  await model.save(crearFileSystemIOHandler(modelDir));
  const meta: ScalerMeta = {
    min,
    max,
    trainedAt: new Date().toISOString(),
    samplesOriginal,
    samplesAugmented: X.length * 2,
    metrics: {
      loss: Number(lossFinal.toFixed(4)),
      accuracy: Number(accFinal.toFixed(4)),
      val_accuracy: Number(valAccFinal.toFixed(4)),
      epochs,
    },
  };
  guardarMeta(modelDir, meta);

  if (fraudModelCache) fraudModelCache.dispose();
  fraudModelCache = model;
  fraudMetaCache = meta;

  tensorNorm.dispose();
  ruido.dispose();
  xAug.dispose();
  xTotal.dispose();
  yBase.dispose();
  yTotal.dispose();

  return {
    modelo: 'fraud-classifier (Keras Sequential: 9→32→16→8→1 sigmoid)',
    guardado_en: 'Backend/models/fraud-classifier/model.json',
    ...meta,
  };
}

async function asegurarModeloFraude(): Promise<{ model: tf.LayersModel; meta: ScalerMeta }> {
  if (fraudModelCache && fraudMetaCache) {
    return { model: fraudModelCache, meta: fraudMetaCache };
  }
  const modelDir = path.join(MODELS_DIR, 'fraud-classifier');
  const metaDisk = cargarMeta(modelDir);
  if (metaDisk && fs.existsSync(path.join(modelDir, 'model.json'))) {
    fraudModelCache = await tf.loadLayersModel(crearFileSystemIOHandler(modelDir));
    fraudMetaCache = metaDisk;
    return { model: fraudModelCache, meta: fraudMetaCache };
  }
  await entrenarClasificadorFraude(30);
  return { model: fraudModelCache!, meta: fraudMetaCache! };
}

export async function clasificarOperacionFraude(entrada: EntradaClasificadorFraude) {
  const { model, meta } = await asegurarModeloFraude();
  const vector = vectorizarOperacionFraude(entrada);
  const norm = normalizarVectorConScaler(vector, meta.min, meta.max);

  const inputT = tf.tensor2d([norm]);
  const predT = model.predict(inputT) as tf.Tensor;
  const prob = Number((await predT.data())[0] ?? 0);
  inputT.dispose();
  predT.dispose();

  const umbralRes = await pool.query(`SELECT valor FROM configuracion_sistema WHERE clave = 'umbral_fraude_ia'`).catch(() => ({ rows: [] }));
  const umbral = Number(umbralRes.rows[0]?.valor ?? 0.65);

  const factores: string[] = [];
  if (!entrada.firma_valida) factores.push('Firma/hash criptográfico inválido o ausente');
  if (entrada.frecuencia_ventana >= 3) factores.push(`Alta frecuencia de operaciones (${entrada.frecuencia_ventana} en ventana)`);
  if ((entrada.descuento_pct ?? 0) > 15) factores.push(`Descuento elevado (${entrada.descuento_pct}%)`);
  if (entrada.promedio_usuario && entrada.monto > entrada.promedio_usuario * 2.5) {
    factores.push(`Monto ${(entrada.monto / entrada.promedio_usuario).toFixed(1)}x por encima del promedio del usuario`);
  }
  const hora = new Date(entrada.fecha).getHours();
  if (hora >= 0 && hora <= 5) factores.push(`Operación en horario inusual de madrugada (${hora}:00h)`);

  const clasificacion: 'normal' | 'fraudulenta' = prob >= umbral ? 'fraudulenta' : 'normal';

  return {
    clasificacion,
    probabilidad_fraude: Number(prob.toFixed(4)),
    umbral_decision: umbral,
    nivel_riesgo: prob >= 0.85 ? 'critico' : prob >= umbral ? 'alto' : prob >= 0.35 ? 'medio' : 'bajo',
    factores_detectados: factores.length > 0 ? factores : ['Patrón compatible con operación normal del restaurante'],
    modelo_entrenado_en: meta.trainedAt,
  };
}

// =============================================================================
// MODELO 2: REGRESIÓN DE MONTO ESPERADO — KERAS/TF
// =============================================================================

export interface EntradaMontoEsperado {
  promedio_usuario: number;
  hora: number;
  dia_semana: number;
  canal: string;
  metodo_pago: string;
  cantidad_items: number;
}

export async function entrenarRegresorMontoEsperado(epochs: number = 35) {
  const { rows } = await pool.query(
    `SELECT t.valor::float AS valor, t.fecha_txn,
            COALESCE(t.canal, 'presencial') AS canal,
            COALESCE(t.metodo_pago, 'efectivo') AS metodo_pago,
            (SELECT AVG(t2.valor)::float FROM transacciones t2 WHERE t2.usuario_id = t.usuario_id) AS prom_usuario
       FROM transacciones t
      WHERE t.estado = 'completada'
      ORDER BY t.fecha_txn DESC
      LIMIT 800`
  );

  const X: number[][] = [];
  const y: number[] = [];

  for (const r of rows) {
    const f = new Date(r.fecha_txn);
    const val = Number(r.valor);
    const prom = Number(r.prom_usuario || 40000);
    const estItems = Math.max(1, Math.round(val / 28000));
    X.push([prom, f.getHours(), f.getDay(), codificarCanal(r.canal), codificarMetodo(r.metodo_pago), estItems]);
    y.push(val);
  }

  const samplesOriginal = X.length;
  // Data augmentation sintética para robustez
  let seed = 101;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < 160; i++) {
    const prom = 25000 + rand() * 55000;
    const hora = 11 + Math.floor(rand() * 11);
    const dia = Math.floor(rand() * 7);
    const cant = 1 + Math.floor(rand() * 5);
    const finSemana = dia === 0 || dia === 6 ? 1.15 : 1.0;
    const esperado = (prom * 0.45 + cant * 24000) * finSemana * (0.9 + rand() * 0.2);
    X.push([prom, hora, dia, rand(), rand(), cant]);
    y.push(esperado);
  }

  const { tensorNorm, min, max } = normalizarMatrizTF(X);
  const yMax = Math.max(1, ...y);
  const yNorm = y.map((v) => v / yMax);

  const xTensor = tensorNorm;
  const yTensor = tf.tensor2d(yNorm, [yNorm.length, 1]);

  const model = tf.sequential({
    layers: [
      tf.layers.dense({ inputShape: [6], units: 32, activation: 'relu' }),
      tf.layers.dense({ units: 16, activation: 'relu' }),
      tf.layers.dense({ units: 1, activation: 'linear' }),
    ],
  });

  model.compile({
    optimizer: tf.train.adam(0.01),
    loss: 'meanSquaredError',
    metrics: ['mae'],
  });

  const hist = await model.fit(xTensor, yTensor, {
    epochs,
    batchSize: 32,
    validationSplit: 0.2,
    shuffle: true,
    verbose: 0,
  });

  const mseFinal = Number(hist.history.loss[hist.history.loss.length - 1] ?? 0);
  const maeFinal = Number(hist.history.mae?.[hist.history.mae.length - 1] ?? 0);

  const modelDir = path.join(MODELS_DIR, 'amount-regressor');
  await model.save(crearFileSystemIOHandler(modelDir));
  const meta: ScalerMeta = {
    min: [...min, 0],
    max: [...max, yMax],
    trainedAt: new Date().toISOString(),
    samplesOriginal,
    samplesAugmented: X.length,
    metrics: {
      mse_norm: Number(mseFinal.toFixed(5)),
      mae_cop: Math.round(maeFinal * yMax),
      epochs,
    },
  };
  guardarMeta(modelDir, meta);

  if (amountModelCache) amountModelCache.dispose();
  amountModelCache = model;
  amountMetaCache = meta;

  xTensor.dispose();
  yTensor.dispose();

  return {
    modelo: 'amount-regressor (Keras Sequential: 6→32→16→1 linear)',
    guardado_en: 'Backend/models/amount-regressor/model.json',
    ...meta,
  };
}

export async function predecirMontoEsperado(entrada: EntradaMontoEsperado, montoReal?: number) {
  const modelDir = path.join(MODELS_DIR, 'amount-regressor');
  if (!amountModelCache || !amountMetaCache) {
    const metaDisk = cargarMeta(modelDir);
    if (metaDisk && fs.existsSync(path.join(modelDir, 'model.json'))) {
      amountModelCache = await tf.loadLayersModel(crearFileSystemIOHandler(modelDir));
      amountMetaCache = metaDisk;
    } else {
      await entrenarRegresorMontoEsperado(30);
    }
  }

  const meta = amountMetaCache!;
  const xMin = meta.min.slice(0, 6);
  const xMax = meta.max.slice(0, 6);
  const yMax = meta.max[6] ?? 100000;

  const vec = [
    entrada.promedio_usuario || 40000,
    entrada.hora,
    entrada.dia_semana,
    codificarCanal(entrada.canal),
    codificarMetodo(entrada.metodo_pago),
    Math.max(1, entrada.cantidad_items || 1),
  ];
  const norm = normalizarVectorConScaler(vec, xMin, xMax);
  const t = tf.tensor2d([norm]);
  const out = amountModelCache!.predict(t) as tf.Tensor;
  const predNorm = Number((await out.data())[0] ?? 0);
  t.dispose();
  out.dispose();

  const montoEsperado = Math.max(5000, Math.round(predNorm * yMax));
  const desviacionPct =
    montoReal !== undefined && montoEsperado > 0
      ? Number((((montoReal - montoEsperado) / montoEsperado) * 100).toFixed(2))
      : null;

  return {
    monto_esperado_cop: montoEsperado,
    monto_real_cop: montoReal ?? null,
    desviacion_pct: desviacionPct,
    alerta_desviacion: desviacionPct !== null && Math.abs(desviacionPct) > 75,
    modelo_entrenado_en: meta.trainedAt,
  };
}

// =============================================================================
// MODELO 3: PREDICCIÓN DE DEMANDA / VENTAS DIARIAS — KERAS/TF
// =============================================================================

const DEMAND_WINDOW = 7;

async function obtenerSerieVentasDiarias(dias: number = 90) {
  const { rows } = await pool.query<{ fecha: string; total: string; cantidad: string }>(
    `SELECT DATE(fecha_txn)::text AS fecha,
            SUM(valor)::numeric AS total,
            COUNT(*)::int AS cantidad
       FROM transacciones
      WHERE estado = 'completada'
        AND fecha_txn >= NOW() - ($1 * INTERVAL '1 day')
      GROUP BY DATE(fecha_txn)
      ORDER BY fecha ASC`,
    [dias]
  );

  const real = rows.map((r) => ({ fecha: r.fecha, total: Number(r.total), cantidad: Number(r.cantidad) }));
  if (real.length >= 21) return { serie: real, fuente: 'backend' as const };

  // Completar con serie sintética realista si hay menos de 21 días en BD
  const hoy = new Date();
  const baseDia = [310000, 290000, 315000, 385000, 490000, 560000, 530000];
  const mapaReal = new Map(real.map((r) => [r.fecha, r]));
  const completa: Array<{ fecha: string; total: number; cantidad: number }> = [];

  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    if (mapaReal.has(iso)) {
      completa.push(mapaReal.get(iso)!);
    } else {
      const dow = (d.getDay() + 6) % 7;
      const tendencia = 1 + ((dias - i) / dias) * 0.22;
      const ruido = 0.92 + ((i * 37) % 17) * 0.01;
      const total = Math.round(baseDia[dow] * tendencia * ruido);
      completa.push({ fecha: iso, total, cantidad: Math.max(5, Math.round(total / 26000)) });
    }
  }

  return { serie: completa, fuente: real.length > 0 ? ('mixto' as const) : ('demo' as const) };
}

export async function entrenarYPredecirDemandaKeras(diasHistoria: number = 90, epochs: number = 45, diasFuturo: number = 14) {
  const { serie, fuente } = await obtenerSerieVentasDiarias(diasHistoria);
  const valores = serie.map((s) => s.total);
  const minVal = Math.min(...valores);
  const maxVal = Math.max(...valores);
  const rango = Math.max(1, maxVal - minVal);
  const norm = valores.map((v) => (v - minVal) / rango);

  const X: number[][] = [];
  const y: number[] = [];
  for (let i = DEMAND_WINDOW; i < norm.length; i++) {
    X.push(norm.slice(i - DEMAND_WINDOW, i));
    y.push(norm[i]);
  }

  // Aumento de datos con perturbaciones suaves para mejorar generalización
  const xBase = tf.tensor2d(X);
  const yBase = tf.tensor2d(y, [y.length, 1]);
  const xNoise = xBase.add(tf.randomNormal(xBase.shape, 0, 0.02)).clipByValue(0, 1) as tf.Tensor2D;
  const xTrain = tf.concat([xBase, xNoise], 0);
  const yTrain = tf.concat([yBase, yBase], 0);

  const model = tf.sequential({
    layers: [
      tf.layers.dense({ inputShape: [DEMAND_WINDOW], units: 32, activation: 'relu' }),
      tf.layers.dense({ units: 16, activation: 'relu' }),
      tf.layers.dense({ units: 1, activation: 'linear' }),
    ],
  });

  model.compile({
    optimizer: tf.train.adam(0.012),
    loss: 'meanSquaredError',
    metrics: ['mae'],
  });

  await model.fit(xTrain, yTrain, {
    epochs,
    batchSize: 16,
    shuffle: true,
    verbose: 0,
  });

  // Métricas en escala original COP
  const predTrainT = model.predict(xBase) as tf.Tensor;
  const predNormArr = Array.from(predTrainT.dataSync());
  const predOrig = predNormArr.map((p) => p * rango + minVal);
  const yOrig = y.map((v) => v * rango + minVal);

  const mseOrig = predOrig.reduce((acc, p, idx) => acc + (p - yOrig[idx]) ** 2, 0) / Math.max(1, yOrig.length);
  const maeOrig = predOrig.reduce((acc, p, idx) => acc + Math.abs(p - yOrig[idx]), 0) / Math.max(1, yOrig.length);
  const mediaY = yOrig.reduce((a, b) => a + b, 0) / Math.max(1, yOrig.length);
  const ssRes = yOrig.reduce((acc, v, idx) => acc + (v - predOrig[idx]) ** 2, 0);
  const ssTot = yOrig.reduce((acc, v) => acc + (v - mediaY) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  // Predicción iterativa próximos N días
  let ventana = norm.slice(-DEMAND_WINDOW);
  const ultimaFecha = new Date(serie[serie.length - 1].fecha + 'T12:00:00Z');
  const ticketProm =
    serie.reduce((a, b) => a + b.total, 0) / Math.max(1, serie.reduce((a, b) => a + b.cantidad, 0));
  const predicciones = [];

  for (let d = 1; d <= diasFuturo; d++) {
    const tIn = tf.tensor2d([ventana]);
    const tOut = model.predict(tIn) as tf.Tensor;
    const yPredNorm = Math.max(0, Math.min(1.25, Number(tOut.dataSync()[0] ?? 0.5)));
    tIn.dispose();
    tOut.dispose();

    const totalCop = Math.max(0, Math.round(yPredNorm * rango + minVal));
    const fechaPred = new Date(ultimaFecha);
    fechaPred.setUTCDate(ultimaFecha.getUTCDate() + d);

    predicciones.push({
      fecha: fechaPred.toISOString().slice(0, 10),
      total: totalCop,
      demanda_estimada_pedidos: Math.max(1, Math.round(totalCop / Math.max(15000, ticketProm))),
      esPrediccion: true,
    });
    ventana = [...ventana.slice(1), yPredNorm];
  }

  // Guardar modelo en disco
  const modelDir = path.join(MODELS_DIR, 'demand-predictor');
  await model.save(crearFileSystemIOHandler(modelDir));
  const meta: ScalerMeta = {
    min: [minVal],
    max: [maxVal],
    trainedAt: new Date().toISOString(),
    samplesOriginal: X.length,
    samplesAugmented: X.length * 2,
    metrics: {
      mse: Math.round(mseOrig),
      mae: Math.round(maeOrig),
      r2: Number(r2.toFixed(4)),
      epochs,
    },
  };
  guardarMeta(modelDir, meta);

  if (demandModelCache) demandModelCache.dispose();
  demandModelCache = model;
  demandMetaCache = meta;

  xBase.dispose();
  yBase.dispose();
  xNoise.dispose();
  xTrain.dispose();
  yTrain.dispose();
  predTrainT.dispose();

  const totalHistorico = serie.reduce((a, b) => a + b.total, 0);
  const promSemanal = serie.slice(-7).reduce((a, b) => a + b.total, 0) / Math.min(7, serie.length);
  const txUlt30 = serie.slice(-30).reduce((a, b) => a + b.cantidad, 0);
  const mejorDia = serie.reduce((best, cur) => (cur.total > best.total ? cur : best), serie[0]);

  return {
    historico: serie.slice(-30),
    predicciones,
    resumen: {
      totalHistorico,
      promedioSemanal: Math.round(promSemanal),
      transaccionesUltimos30: txUlt30,
      mejorDia: mejorDia ? { fecha: mejorDia.fecha, total: mejorDia.total } : null,
    },
    modelo: {
      tipo: 'keras_tensorflow_sequential',
      arquitectura: 'Dense(32, ReLU) → Dense(16, ReLU) → Dense(1, Linear)',
      mse: Math.round(mseOrig),
      mae: Math.round(maeOrig),
      r2: Number(r2.toFixed(4)),
      iteraciones: epochs,
      fuente_datos: fuente,
      dias_entrenamiento: serie.length,
      guardado_en: 'Backend/models/demand-predictor/model.json',
      entrenado_en: meta.trainedAt,
    },
  };
}

export function obtenerEstadoModelosDisco() {
  const listar = (nombre: string) => {
    const dir = path.join(MODELS_DIR, nombre);
    const existe = fs.existsSync(path.join(dir, 'model.json'));
    const meta = cargarMeta(dir);
    return {
      nombre,
      guardado_en_disco: existe,
      ruta: existe ? `Backend/models/${nombre}/model.json` : null,
      entrenado_en: meta?.trainedAt ?? null,
      muestras_originales: meta?.samplesOriginal ?? 0,
      muestras_con_aumento: meta?.samplesAugmented ?? 0,
      metricas: meta?.metrics ?? null,
    };
  };

  return {
    framework: 'TensorFlow.js + Keras Layers API + Simple Statistics',
    modelos: [
      listar('fraud-classifier'),
      listar('amount-regressor'),
      listar('demand-predictor'),
    ],
  };
}

