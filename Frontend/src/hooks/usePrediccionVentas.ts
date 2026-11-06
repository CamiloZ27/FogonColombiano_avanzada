/**
 * usePrediccionVentas — Hook que consume el microservicio Python de predicción.
 *
 * El entrenamiento ya no ocurre en el browser: ahora lo hace el backend Python
 * con scikit-learn MLPRegressor (capas 64→32→16, Adam, early stopping).
 *
 * Microservicio: http://localhost:5001
 * Endpoint principal: GET /predecir?dias=90
 */
import { useState, useCallback } from 'react';
import type {
  EstadoEntrenamiento,
  PuntoGrafica,
  PuntoSerie,
  ResumenVentas,
} from '../types/prediccion.types';

// ─── Configuración ─────────────────────────────────────────────────────────────
const PYTHON_API = 'http://localhost:5001';

// ─── Tipos de respuesta del microservicio ─────────────────────────────────────

interface RespuestaPrediccion {
  historico:    PuntoSerie[];
  predicciones: { fecha: string; total: number; esPrediccion: true }[];
  resumen:      ResumenVentas;
  modelo: {
    tipo:               string;
    mse:                number;
    r2:                 number;
    iteraciones:        number;
    fuente_datos:       'backend' | 'mixto' | 'demo';
    dias_entrenamiento: number;
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePrediccionVentas() {
  const [estado,       setEstado]       = useState<EstadoEntrenamiento>('idle');
  const [graficaDatos, setGraficaDatos] = useState<PuntoGrafica[]>([]);
  const [resumen,      setResumen]      = useState<ResumenVentas | null>(null);
  const [errorMsg,     setErrorMsg]     = useState('');
  const [mse,          setMse]          = useState<number | null>(null);
  const [r2,           setR2]           = useState<number | null>(null);
  const [modeloInfo,   setModeloInfo]   = useState<RespuestaPrediccion['modelo'] | null>(null);

  const entrenarYPredecir = useCallback(async (
    diasHistoria = 90,
    maxIter      = 1000,
  ) => {
    setEstado('cargando');
    setErrorMsg('');
    setMse(null);
    setR2(null);
    setModeloInfo(null);

    try {
      // El microservicio Python hace TODO: cargar datos, entrenar y predecir
      setEstado('entrenando');

      const resp = await fetch(
        `${PYTHON_API}/predecir?dias=${diasHistoria}&max_iter=${maxIter}`,
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(err.detail ?? `Error ${resp.status} del microservicio`);
      }

      const data: RespuestaPrediccion = await resp.json();

      // Montar datos para la gráfica
      const historico: PuntoGrafica[] = data.historico.map(p => ({
        ...p,
        esPrediccion: false as const,
      }));
      const predicciones: PuntoGrafica[] = data.predicciones.map(p => ({
        ...p,
        esPrediccion: true  as const,
      }));

      setGraficaDatos([...historico, ...predicciones]);
      setResumen(data.resumen);
      setMse(data.modelo.mse);
      setR2(data.modelo.r2);
      setModeloInfo(data.modelo);
      setEstado('listo');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setErrorMsg(
        msg.includes('fetch') || msg.includes('Failed')
          ? 'No se pudo conectar al microservicio Python. ¿Está corriendo en el puerto 5001?'
          : msg,
      );
      setEstado('error');
    }
  }, []);

  // Fuente de datos (viene del microservicio)
  const fuenteDatos = modeloInfo?.fuente_datos ?? 'backend';

  return {
    estado,
    graficaDatos,
    resumen,
    errorMsg,
    mse,
    r2,
    modeloInfo,
    fuenteDatos,
    // progreso queda en 0/100 — el MLP de sklearn no reporta progreso por iteración;
    // se expone para que el componente no rompa si lo usa.
    progreso: estado === 'listo' ? 100 : 0,
    entrenarYPredecir,
  };
}
