/**
 * usePrediccionVentas — Hook unificado que consume el motor Keras/TensorFlow
 * integrado en el backend Express (GET /api/prediccion/predecir con JWT Bearer).
 */
import { useState, useCallback } from 'react';
import { apiRequest } from '../services/api.service';
import type {
  EstadoEntrenamiento,
  PuntoGrafica,
  PuntoSerie,
  ResumenVentas,
} from '../types/prediccion.types';

interface RespuestaPrediccion {
  historico: PuntoSerie[];
  predicciones: { fecha: string; total: number; esPrediccion: true }[];
  resumen: ResumenVentas;
  modelo: {
    tipo: string;
    arquitectura?: string;
    mse: number;
    mae?: number;
    r2: number;
    iteraciones: number;
    fuente_datos: 'backend' | 'mixto' | 'demo';
    dias_entrenamiento: number;
    guardado_en?: string;
  };
}

export function usePrediccionVentas() {
  const [estado, setEstado] = useState<EstadoEntrenamiento>('idle');
  const [graficaDatos, setGraficaDatos] = useState<PuntoGrafica[]>([]);
  const [resumen, setResumen] = useState<ResumenVentas | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [mse, setMse] = useState<number | null>(null);
  const [r2, setR2] = useState<number | null>(null);
  const [modeloInfo, setModeloInfo] = useState<RespuestaPrediccion['modelo'] | null>(null);

  const entrenarYPredecir = useCallback(async (diasHistoria = 90, epochs = 40) => {
    setEstado('cargando');
    setErrorMsg('');
    setMse(null);
    setR2(null);
    setModeloInfo(null);

    try {
      setEstado('entrenando');
      const epochsAjustado = epochs > 80 ? 45 : Math.max(15, epochs);
      const data = await apiRequest<RespuestaPrediccion>(
        `/api/prediccion/predecir?dias=${diasHistoria}&epochs=${epochsAjustado}`
      );

      const historico: PuntoGrafica[] = data.historico.map((p) => ({
        ...p,
        esPrediccion: false as const,
      }));
      const predicciones: PuntoGrafica[] = data.predicciones.map((p) => ({
        ...p,
        esPrediccion: true as const,
      }));

      setGraficaDatos([...historico, ...predicciones]);
      setResumen(data.resumen);
      setMse(data.modelo.mse);
      setR2(data.modelo.r2);
      setModeloInfo(data.modelo);
      setEstado('listo');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setErrorMsg(msg);
      setEstado('error');
    }
  }, []);

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
    progreso: estado === 'listo' ? 100 : 0,
    entrenarYPredecir,
  };
}
