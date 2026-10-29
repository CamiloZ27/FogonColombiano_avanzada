/**
 * usePrediccionVentas — Red Neuronal Multicapa (MLP) implementada en TypeScript puro.
 *
 * Arquitectura:
 *   Entrada: ventana de WINDOW_SIZE días  →  Capa oculta: 16 neuronas (ReLU)
 *   →  Capa oculta: 8 neuronas (ReLU)  →  Salida: 1 valor (lineal)
 *
 * Sin dependencias externas. Funciona en cualquier browser moderno.
 * Si el backend devuelve pocos datos, se completa automáticamente con el
 * dataset de demostración (generarDatosDemostracion).
 */
import { useState, useCallback } from 'react';
import type {
  EstadoEntrenamiento,
  PuntoGrafica,
  PuntoPrediccion,
  PuntoSerie,
  ResumenVentas,
} from '../types/prediccion.types';

// ─── Hiperparámetros ───────────────────────────────────────────────────────────
const API_BASE       = 'http://localhost:4000/api';
const WINDOW_SIZE    = 7;      // días de historia → 1 predicción
const DIAS_PREDICCION = 14;    // cuántos días hacia adelante predecir
const LEARNING_RATE  = 0.005;
const EPOCHS         = 400;
const H1             = 16;     // neuronas capa oculta 1
const H2             = 8;      // neuronas capa oculta 2
const MIN_PUNTOS     = 30;     // mínimo para entrenar la RN (sino fallback lineal)

// ─── Dataset de demostración ──────────────────────────────────────────────────
/**
 * Genera una serie temporal sintética de 90 días que imita un restaurante
 * colombiano real: picos de fin de semana, quincenas y tendencia alcista suave.
 * Se usa cuando el backend devuelve menos de MIN_PUNTOS registros.
 */
function generarDatosDemostracion(diasTotal = 90): PuntoSerie[] {
  // PRNG determinista con semilla para resultados reproducibles entre renders
  let seed = 42;
  function rng(): number {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  }
  function rngRango(min: number, max: number) { return min + rng() * (max - min); }

  const hoy  = new Date();
  const serie: PuntoSerie[] = [];

  // Valores base por día de la semana (0=Domingo, 6=Sábado) en COP
  const BASE_DIA = [520000, 310000, 285000, 310000, 380000, 480000, 550000];
  const VARIANZA = [ 80000,  50000,  45000,  50000,  60000,  75000,  90000];

  for (let i = diasTotal - 1; i >= 0; i--) {
    const fecha = new Date(hoy);
    fecha.setDate(hoy.getDate() - i);
    const dow   = fecha.getDay();

    // Índice de progreso (0..1) para simular tendencia de crecimiento ~25 %
    const progreso = (diasTotal - 1 - i) / (diasTotal - 1);
    const tendencia = 1 + progreso * 0.25;

    // Efecto quincena: días ~15 y ~30 de cada mes tienen pico +20 %
    const dia = fecha.getDate();
    const quincena = (dia >= 14 && dia <= 16) || (dia >= 28 && dia <= 31) ? 1.20 : 1.0;

    // Ruido gaussiano aproximado (suma de 4 uniformes)
    const ruido = ((rng() + rng() + rng() + rng()) / 4 - 0.5) * 2;

    // Total del día
    const base    = BASE_DIA[dow]! * tendencia * quincena;
    const varianza = VARIANZA[dow]!;
    const total   = Math.max(80000, Math.round(base + ruido * varianza));

    // Número de transacciones aproximado según día
    const cantBase = [22, 14, 12, 14, 18, 22, 26][dow]!;
    const cantidad = Math.max(3, Math.round(cantBase * tendencia + ruido * 4));

    serie.push({
      fecha: fecha.toISOString().slice(0, 10),
      total,
      cantidad,
    });
  }

  return serie;
}

/**
 * Combina la serie real del backend con el dataset de demostración.
 * Los datos reales tienen prioridad: si ya existe una fecha, no se sobrescribe.
 */
function combinarConDemostracion(real: PuntoSerie[], diasTotal = 90): PuntoSerie[] {
  const demo   = generarDatosDemostracion(diasTotal);
  const porFecha = new Map<string, PuntoSerie>(real.map(p => [p.fecha, p]));
  // Rellenar huecos con datos de demo
  for (const punto of demo) {
    if (!porFecha.has(punto.fecha)) {
      porFecha.set(punto.fecha, punto);
    }
  }
  return [...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ─── Utilidades matemáticas ───────────────────────────────────────────────────

function relu(x: number) { return Math.max(0, x); }
function reluDerivada(x: number) { return x > 0 ? 1 : 0; }

/** Inicializa una matriz [filas][cols] con pesos He init. */
function matrizAleatoria(filas: number, cols: number): number[][] {
  const escala = Math.sqrt(2 / filas);
  return Array.from({ length: filas }, () =>
    Array.from({ length: cols }, () => (Math.random() * 2 - 1) * escala)
  );
}

/** Producto punto vector × matriz → vector */
function matMul(v: number[], W: number[][]): number[] {
  return W[0]?.map((_, j) =>
    v.reduce((s, vi, i) => s + vi * (W[i]?.[j] ?? 0), 0)
  ) ?? [];
}

// ─── Red Neuronal ─────────────────────────────────────────────────────────────

interface RedNeuronal {
  W1: number[][];  // [WINDOW_SIZE, H1]
  b1: number[];   // [H1]
  W2: number[][];  // [H1, H2]
  b2: number[];    // [H2]
  W3: number[][];  // [H2, 1]
  b3: number[];    // [1]
}

function crearRed(): RedNeuronal {
  return {
    W1: matrizAleatoria(WINDOW_SIZE, H1), b1: new Array(H1).fill(0),
    W2: matrizAleatoria(H1, H2),          b2: new Array(H2).fill(0),
    W3: matrizAleatoria(H2, 1),           b3: [0],
  };
}

function forward(red: RedNeuronal, x: number[]) {
  const z1 = matMul(x, red.W1).map((v, i) => 
    v + (red.b1[i] ?? 0));
  const a1 = z1.map(relu);
  const z2 = matMul(a1, red.W2).map((v, i) => 
    v + (red.b2[i] ?? 0));
  const a2 = z2.map(relu);
  const z3 = matMul(a2, red.W3).map((v, i) => 
    v + (red.b3[i] ?? 0));
  const pred = z3[0] ?? 0;
  return { pred, a1, a2, z1, z2 };
}

function backward(
  red: RedNeuronal,
  x: number[], pred: number, objetivo: number,
  a1: number[], a2: number[], z1: number[], z2: number[]
) {
  const lr    = LEARNING_RATE;
  const error = pred - objetivo;

  const dW3 = a2.map(v => [v * error]);
  const db3 = [error];
  const dA2 = red.W3.map(row => (row[0] ?? 0) * error);

  const dZ2 = dA2.map((g, i) => g * reluDerivada(z2[i] ?? 0));
  const dW2 = a1.map(v => dZ2.map(g => v * g));
  const db2 = dZ2;
  const dA1 = dZ2.reduce<number[]>(
    (acc, g, j) => acc.map((v, i) => v + (red.W2[i]?.[j] ?? 0) * g),
    new Array(H1).fill(0)
  );

  const dZ1 = dA1.map((g, i) => g * reluDerivada(z1[i] ?? 0));
  const dW1 = x.map(v => dZ1.map(g => v * g));
  const db1 = dZ1;

  for (let i = 0; i < H2; i++) {
    const fila = red.W3[i] ??= [0];
    fila[0] = (fila[0] ?? 0) - lr * (dW3[i]?.[0] ?? 0);
  }

  red.b3[0] = (red.b3[0] ?? 0) - lr * (db3[0] ?? 0);

  for (let i = 0; i < H1; i++) {
    const fila = red.W2[i] ??= new Array(H2).fill(0);
    for (let j = 0; j < H2; j++) {
      fila[j] = (fila[j] ?? 0) - lr * (dW2[i]?.[j] ?? 0);
    }
  }

  red.b2 = red.b2.map((valor, j) => (valor ?? 0) - lr * (db2[j] ?? 0));

  for (let i = 0; i < WINDOW_SIZE; i++) {
    const fila = red.W1[i] ??= new Array(H1).fill(0);
    for (let j = 0; j < H1; j++) {
      fila[j] = (fila[j] ?? 0) - lr * (dW1[i]?.[j] ?? 0);
    }
  }

  red.b1 = red.b1.map((valor, j) => (valor ?? 0) - lr * (db1[j] ?? 0));
}

// ─── Normalización Min-Max ────────────────────────────────────────────────────

function minMax(datos: number[]) {
  return { min: Math.min(...datos), max: Math.max(...datos) };
}
function normalizar(v: number, min: number, max: number) {
  return max === min ? 0 : (v - min) / (max - min);
}
function desnormalizar(v: number, min: number, max: number) {
  return v * (max - min) + min;
}

function construirVentanas(serie: number[], windowSize: number) {
  const X: number[][] = [], Y: number[] = [];
  for (let i = windowSize; i < serie.length; i++) {
    X.push(serie.slice(i - windowSize, i));
    Y.push(serie[i] ?? 0);
  }
  return { X, Y };
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(fecha + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function usePrediccionVentas() {
  const [estado,      setEstado]      = useState<EstadoEntrenamiento>('idle');
  const [progreso,    setProgreso]    = useState(0);
  const [graficaDatos,setGraficaDatos]= useState<PuntoGrafica[]>([]);
  const [resumen,     setResumen]     = useState<ResumenVentas | null>(null);
  const [errorMsg,    setErrorMsg]    = useState('');
  const [mse,         setMse]         = useState<number | null>(null);
  const [fuenteDatos, setFuenteDatos] = useState<'backend' | 'demo' | 'mixto'>('backend');

  const entrenarYPredecir = useCallback(async (diasHistoria = 90) => {
    setEstado('cargando');
    setProgreso(0);
    setErrorMsg('');
    setMse(null);

    try {
      // 1. Intentar cargar del backend
      let serieReal: PuntoSerie[] = [];
      let resumenData: ResumenVentas = {
        totalHistorico: 0, promedioSemanal: 0,
        mejorDia: null, transaccionesUltimos30: 0,
      };

      try {
        const [serieResp, resumenResp] = await Promise.all([
          fetch(`${API_BASE}/prediccion/series-diarias?dias=${diasHistoria}`),
          fetch(`${API_BASE}/prediccion/resumen`),
        ]);
        if (serieResp.ok)   serieReal    = await serieResp.json();
        if (resumenResp.ok) resumenData  = await resumenResp.json();
      } catch {
        // Backend no disponible — usaremos solo demo
      }

      // 2. Completar con dataset de demostración si hay pocos datos reales
      let serie: PuntoSerie[];
      if (serieReal.length === 0) {
        serie = generarDatosDemostracion(diasHistoria);
        setFuenteDatos('demo');
      } else if (serieReal.length < MIN_PUNTOS) {
        serie = combinarConDemostracion(serieReal, diasHistoria);
        setFuenteDatos('mixto');
      } else {
        serie = serieReal;
        setFuenteDatos('backend');
      }

      // Calcular resumen desde la serie si el backend no lo dio
      if (resumenData.totalHistorico === 0 && serie.length > 0) {
        const totales = serie.map(p => p.total ?? 0);
        const mejorIdx = totales.indexOf(Math.max(...totales));
        const mejorPunto = serie[mejorIdx];
        const mejorTotal = totales[mejorIdx];
        const ultimos30 = serie.slice(-30);
        resumenData = {
          totalHistorico: totales.reduce((a, b) => a + b, 0),
          promedioSemanal: totales.slice(-7).reduce((a, b) => a + b, 0) / 7,
          mejorDia: mejorPunto && mejorTotal !== undefined
            ? { fecha: mejorPunto.fecha, total: mejorTotal }
            : null,
          transaccionesUltimos30: ultimos30.reduce((a, p) => a + p.cantidad, 0),
        };
      }
      setResumen(resumenData);

      // 3. Normalizar
      const valores = serie.map(p => p.total ?? 0);
      const { min, max } = minMax(valores);
      const valoresNorm = valores.map(v => normalizar(v, min, max));
      const { X, Y } = construirVentanas(valoresNorm, WINDOW_SIZE);

      // 4. Entrenar
      setEstado('entrenando');
      const red = crearRed();
      const BATCH = 25;

      for (let e = 0; e < EPOCHS; e += BATCH) {
        await new Promise<void>(resolve => setTimeout(() => {
          for (let b = e; b < Math.min(e + BATCH, EPOCHS); b++) {
            const idx = X.map((_, i) => i).sort(() => Math.random() - 0.5);
            for (const i of idx) {
              const { pred, a1, a2, z1, z2 } = forward(red, X[i]!);
              backward(red, X[i]!, pred, Y[i]!, a1, a2, z1, z2);
            }
          }
          resolve();
        }, 0));
        setProgreso(Math.round(((e + BATCH) / EPOCHS) * 100));
      }

      // 5. MSE
      let sumError = 0;
      for (let i = 0; i < X.length; i++) {
        const { pred } = forward(red, X[i]!);
        sumError += (pred - Y[i]!) ** 2;
      }
      setMse(sumError / X.length);

      // 6. Predecir días futuros
      let ventanaActual = valoresNorm.slice(-WINDOW_SIZE);
      const predicciones: PuntoPrediccion[] = [];
      const ultimoPunto = serie[serie.length - 1];
      if (!ultimoPunto) throw new Error('No hay datos disponibles para generar predicciones.');
      const ultimaFecha = ultimoPunto.fecha;

      for (let d = 1; d <= DIAS_PREDICCION; d++) {
        const { pred } = forward(red, ventanaActual);
        const predClamped = Math.max(0, Math.min(1, pred));
        ventanaActual = [...ventanaActual.slice(1), predClamped];
        predicciones.push({
          fecha: sumarDias(ultimaFecha, d),
          total: Math.round(desnormalizar(predClamped, min, max)),
          esPrediccion: true,
        });
      }

      // 7. Armar gráfica (últimos 30 días + predicciones)
      const historico = serie.slice(-30).map(p => ({ ...p, esPrediccion: false as const }));
      setGraficaDatos([...historico, ...predicciones]);
      setEstado('listo');
      setProgreso(100);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setErrorMsg(msg);
      setEstado('error');
    }
  }, []);

  return { estado, progreso, graficaDatos, resumen, errorMsg, mse, fuenteDatos, entrenarYPredecir };
}

// ─── Fallback: regresión lineal simple ───────────────────────────────────────

export function regresionLineal(serie: PuntoSerie[]): PuntoPrediccion[] {
  const n = serie.length;
  if (n === 0) return [];
  const x = serie.map((_, i) => i);
  const y = serie.map(p => p.total ?? 0);
  const sumX  = x.reduce((a, b) => a + b, 0);
  const sumY  = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((s, xi, i) => s + xi * (y[i] ?? 0), 0);
  const sumX2 = x.reduce((s, xi) => s + xi * xi, 0);
  const slope     = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX ** 2);
  const intercept = (sumY - slope * sumX) / n;
  const ultimoPunto = serie[n - 1];
  if (!ultimoPunto) return [];
  const ultimaFecha = ultimoPunto.fecha;
  return Array.from({ length: DIAS_PREDICCION }, (_, d) => ({
    fecha: (() => {
      const dt = new Date(ultimaFecha + 'T12:00:00');
      dt.setDate(dt.getDate() + d + 1);
      return dt.toISOString().slice(0, 10);
    })(),
    total: Math.max(0, Math.round(slope * (n + d) + intercept)),
    esPrediccion: true as const,
  }));
}
