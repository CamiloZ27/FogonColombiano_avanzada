import type {
  AnomaliaReciente,
  CasoRecurrente,
  EstadoAnomalia,
  HoraConteo,
  LineaTiempoAnomalia,
  MetodoPagoConteo,
  NivelConteo,
  Periodo,
  PuntoTendencia,
  ResumenGeneral,
  UsuarioRecurrente,
  VentanaDeAnomalia,
} from "../types/anomalias.types";

// Ajusta VITE_API_BASE_URL en tu .env si el backend no vive en /api
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/dashboard";
const MI_TOKEN_HASH = "5813659858";

function obtenerHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return {
    "x-api-token": MI_TOKEN_HASH,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function obtenerJSON<T>(ruta: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${ruta}`, {
    method: "GET",
    headers: obtenerHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Error ${res.status} al consultar ${ruta}`);
  }
  return res.json() as Promise<T>;
}

export function obtenerResumenGeneral(periodo: Periodo) {
  return obtenerJSON<ResumenGeneral>(`/resumen?periodo=${periodo}`);
}

export function obtenerCasosMasRecurrentes(periodo: Periodo, limite = 5) {
  return obtenerJSON<CasoRecurrente[]>(`/casos-recurrentes?periodo=${periodo}&limite=${limite}`);
}

export function obtenerUsuariosRecurrentes(periodo: Periodo, limite = 5) {
  return obtenerJSON<UsuarioRecurrente[]>(`/usuarios-recurrentes?periodo=${periodo}&limite=${limite}`);
}

export function obtenerAnomaliasPorNivel(periodo: Periodo) {
  return obtenerJSON<NivelConteo[]>(`/niveles?periodo=${periodo}`);
}

export function obtenerTendenciaTemporal(periodo: Periodo) {
  return obtenerJSON<PuntoTendencia[]>(`/tendencia?periodo=${periodo}`);
}

export function obtenerDistribucionPorHora(periodo: Periodo) {
  return obtenerJSON<HoraConteo[]>(`/distribucion-hora?periodo=${periodo}`);
}

export function obtenerDistribucionMetodoPago(periodo: Periodo) {
  return obtenerJSON<MetodoPagoConteo[]>(`/metodos-pago?periodo=${periodo}`);
}

export function obtenerAnomaliasRecientes(periodo: Periodo, limite = 20) {
  return obtenerJSON<AnomaliaReciente[]>(`/recientes?periodo=${periodo}&limite=${limite}`);
}

export function obtenerLineaDeTiempo(anomaliaId: number) {
  return obtenerJSON<LineaTiempoAnomalia>(`/anomalia/${anomaliaId}/timeline`);
}

export function obtenerVentanaDeslizante(anomaliaId: number) {
  return obtenerJSON<VentanaDeAnomalia>(`/anomalia/${anomaliaId}/ventana`);
}

export async function actualizarEstadoAnomalia(anomaliaId: number, estado: EstadoAnomalia) {
  const res = await fetch(`${BASE_URL}/anomalia/${anomaliaId}/estado`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...obtenerHeaders() },
    body: JSON.stringify({ estado }),
  });
  if (!res.ok) throw new Error(`Error ${res.status} al actualizar estado`);
  return res.json();
}
