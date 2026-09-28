import { useEffect, useState } from "react";
import * as analitica from "../services/anomalias.service";
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

const ETIQUETA_PERIODO: Record<Periodo, string> = {
  day: "Hoy",
  week: "Esta semana",
  month: "Este mes",
};

const ETIQUETA_TIPO: Record<string, string> = {
  multiples_transacciones: "Múltiples transacciones",
  monto_atipico: "Monto atípico",
  frecuencia_alta: "Frecuencia alta",
  usuario_recurrente: "Usuario recurrente",
};

function formatoMoneda(valor: number | string) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(
    Number(valor)
  );
}

function formatoFechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}

function barraColorPorNivel(nivel: string) {
  if (nivel === "bajo") return "bar-fill-sage";
  if (nivel === "critico") return "bar-fill-rust";
  return "bar-fill-accent"; // medio, alto
}

export function AnomaliasDashboard() {
  const [periodo, setPeriodo] = useState<Periodo>("day");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [resumen, setResumen] = useState<ResumenGeneral | null>(null);
  const [casos, setCasos] = useState<CasoRecurrente[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioRecurrente[]>([]);
  const [niveles, setNiveles] = useState<NivelConteo[]>([]);
  const [tendencia, setTendencia] = useState<PuntoTendencia[]>([]);
  const [horas, setHoras] = useState<HoraConteo[]>([]);
  const [metodos, setMetodos] = useState<MetodoPagoConteo[]>([]);
  const [recientes, setRecientes] = useState<AnomaliaReciente[]>([]);

  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<LineaTiempoAnomalia | null>(null);
  const [ventana, setVentana] = useState<VentanaDeAnomalia | null>(null);

  useEffect(() => {
    setCargando(true);
    setError(null);
    Promise.all([
      analitica.obtenerResumenGeneral(periodo),
      analitica.obtenerCasosMasRecurrentes(periodo),
      analitica.obtenerUsuariosRecurrentes(periodo),
      analitica.obtenerAnomaliasPorNivel(periodo),
      analitica.obtenerTendenciaTemporal(periodo),
      analitica.obtenerDistribucionPorHora(periodo),
      analitica.obtenerDistribucionMetodoPago(periodo),
      analitica.obtenerAnomaliasRecientes(periodo),
    ])
      .then(([r, c, u, n, t, h, m, rec]) => {
        setResumen(r);
        setCasos(c);
        setUsuarios(u);
        setNiveles(n);
        setTendencia(t);
        setHoras(h);
        setMetodos(m);
        setRecientes(rec);
      })
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [periodo]);

  function abrirDetalle(id: number) {
    setDetalleId(id);
    setDetalle(null);
    setVentana(null);
    Promise.all([analitica.obtenerLineaDeTiempo(id), analitica.obtenerVentanaDeslizante(id)]).then(
      ([lt, vd]) => {
        setDetalle(lt);
        setVentana(vd);
      }
    );
  }

  async function cambiarEstado(id: number, estado: EstadoAnomalia) {
    await analitica.actualizarEstadoAnomalia(id, estado);
    setRecientes((prev) => prev.map((a) => (a.id === id ? { ...a, estado } : a)));
    if (detalle && detalle.anomalia_id === id) setDetalle({ ...detalle, estado });
  }

  const maxTendencia = Math.max(1, ...tendencia.map((p) => p.total));
  const maxHora = Math.max(1, ...horas.map((h) => h.total));

  return (
    <section>
      <div className="panel-heading">
        <h1>Detección de anomalías</h1>
        <p>Monitoreo de transacciones sospechosas mediante ventana deslizante: frecuencia y monto atípico por usuario.</p>
      </div>

      <div className="scenarios-buttons" style={{ marginBottom: "1.75rem" }}>
        {(Object.keys(ETIQUETA_PERIODO) as Periodo[]).map((p) => (
          <button
            key={p}
            className={`modal-filter-btn ${periodo === p ? "active" : ""}`}
            onClick={() => setPeriodo(p)}
          >
            {ETIQUETA_PERIODO[p]} {p === "day" ? "" : ""}
          </button>
        ))}
      </div>

      {error && <div className="order-card-not-found">
        <span className="not-found-icon">⚠️</span>
        <div><strong>No se pudo cargar el dashboard.</strong><p>{error}</p></div>
      </div>}

      {cargando && !resumen && <div className="empty-state">Cargando datos de {ETIQUETA_PERIODO[periodo].toLowerCase()}…</div>}

      {resumen && (
        <div className="trace-box">
          <div className="stat-grid">
            <div className="stat"><span className="stat-label">Total transacciones</span><span className="stat-value">{resumen.totalTransacciones}</span></div>
            <div className="stat"><span className="stat-label">Total anomalías</span><span className="stat-value">{resumen.totalAnomalias}</span></div>
            <div className="stat"><span className="stat-label">% con anomalías</span><span className="stat-value">{resumen.porcentajeAnomalias.toFixed(1)}%</span></div>
            <div className="stat"><span className="stat-label">Usuarios afectados</span><span className="stat-value">{resumen.usuariosAfectados}</span></div>
            <div className="stat"><span className="stat-label">Valor sospechoso</span><span className="stat-value">{formatoMoneda(resumen.valorTotalSospechoso)}</span></div>
            <div className="stat"><span className="stat-label">Prom. txn / usuario</span><span className="stat-value">{resumen.promedioTransaccionesPorUsuario.toFixed(1)}</span></div>
            <div className="stat"><span className="stat-label">Abiertas</span><span className="stat-value highlight-accent">{resumen.anomaliasAbiertas}</span></div>
            <div className="stat"><span className="stat-label">Revisadas</span><span className="stat-value highlight-sage">{resumen.anomaliasRevisadas}</span></div>
            <div className="stat"><span className="stat-label">Descartadas</span><span className="stat-value" style={{ color: "#7d6a54" }}>{resumen.anomaliasDescartadas}</span></div>
          </div>
        </div>
      )}

      <div className="grid-two" style={{ marginTop: "2rem" }}>
        <div>
          <h3 className="section-subtitle">Casos más recurrentes</h3>
          <table className="bigo-table">
            <thead><tr><th>Tipo</th><th>Casos</th></tr></thead>
            <tbody>
              {casos.map((c) => (
                <tr key={c.tipo}><td>{ETIQUETA_TIPO[c.tipo] ?? c.tipo}</td><td className="tag-orange">{c.total}</td></tr>
              ))}
              {casos.length === 0 && !cargando && <tr><td colSpan={2}>Sin casos en este periodo.</td></tr>}
            </tbody>
          </table>
        </div>
        <div>
          <h3 className="section-subtitle">Usuarios recurrentes</h3>
          <table className="bigo-table">
            <thead><tr><th>Usuario</th><th>Anomalías</th></tr></thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.usuario_id}><td>{u.nombre}</td><td className="tag-red">{u.total_anomalias}</td></tr>
              ))}
              {usuarios.length === 0 && !cargando && <tr><td colSpan={2}>Sin usuarios recurrentes.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <h3 className="section-subtitle">Anomalías por nivel</h3>
      <div className="efficiency-comparison-box">
        {niveles.map((n) => {
          const max = Math.max(1, ...niveles.map((x) => x.total));
          return (
            <div className="bar-row" key={n.nivel}>
              <span className="bar-label">{n.nivel}</span>
              <div className="bar-track">
                <div className={`bar-fill ${barraColorPorNivel(n.nivel)}`} style={{ width: `${(n.total / max) * 100}%` }} />
              </div>
              <span className="bar-value">{n.total}</span>
            </div>
          );
        })}
        {niveles.length === 0 && !cargando && <p className="box-note">Sin anomalías registradas en este periodo.</p>}
      </div>

      <div className="grid-two">
        <div>
          <h3 className="section-subtitle">Evolución temporal</h3>
          <div className="trace-box" style={{ overflowX: "auto" }}>
            <svg viewBox={`0 0 ${Math.max(tendencia.length * 28, 280)} 140`} width="100%" height="140">
              {tendencia.map((p, i) => {
                const alto = (p.total / maxTendencia) * 100;
                return (
                  <g key={p.marca_tiempo} transform={`translate(${i * 28}, 0)`}>
                    <rect x={4} y={120 - alto} width={16} height={alto} rx={3} fill="var(--accent-soft)" />
                    <text x={12} y={135} fontSize="8" fill="#7d6a54" textAnchor="middle">
                      {new Date(p.marca_tiempo).toLocaleString("es-CO", periodo === "day" ? { hour: "2-digit" } : { day: "2-digit", month: "2-digit" })}
                    </text>
                  </g>
                );
              })}
            </svg>
            {tendencia.length === 0 && !cargando && <p className="box-note">Sin datos suficientes para graficar la tendencia.</p>}
          </div>
        </div>
        <div>
          <h3 className="section-subtitle">Distribución por hora</h3>
          <div className="trace-box" style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 4 }}>
            {Array.from({ length: 24 }, (_, hora) => {
              const registro = horas.find((h) => h.hora === hora);
              const total = registro?.total ?? 0;
              const intensidad = total / maxHora;
              return (
                <div
                  key={hora}
                  title={`${hora}:00 · ${total} anomalías`}
                  style={{
                    aspectRatio: "1",
                    borderRadius: 4,
                    background: `rgba(221, 161, 94, ${0.08 + intensidad * 0.85})`,
                    border: "1px solid var(--rule)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.62rem",
                    color: "#F4E9D8",
                  }}
                >
                  {hora}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <h3 className="section-subtitle">Métodos de pago</h3>
      <div className="efficiency-comparison-box">
        {metodos.map((m) => {
          const max = Math.max(1, ...metodos.map((x) => x.total));
          return (
            <div className="bar-row" key={m.metodo_pago}>
              <span className="bar-label">{m.metodo_pago}</span>
              <div className="bar-track">
                <div className="bar-fill bar-fill-accent" style={{ width: `${(m.total / max) * 100}%` }} />
              </div>
              <span className="bar-value">{m.total}</span>
            </div>
          );
        })}
        {metodos.length === 0 && !cargando && <p className="box-note">Sin transacciones sospechosas por método de pago.</p>}
      </div>

      <h3 className="section-subtitle">Anomalías recientes</h3>
      <table className="bigo-table">
        <thead>
          <tr><th>Fecha</th><th>Usuario</th><th>Tipo</th><th>Nivel</th><th>Estado</th><th>Valor</th><th></th></tr>
        </thead>
        <tbody>
          {recientes.map((a) => (
            <tr key={a.id}>
              <td>{formatoFechaHora(a.fecha_creacion)}</td>
              <td>{a.nombre}</td>
              <td>{ETIQUETA_TIPO[a.tipo] ?? a.tipo}</td>
              <td>{a.nivel}</td>
              <td>
                <span className={`order-status-badge status-${a.estado === "revisada" ? "entregado" : a.estado === "descartada" ? "en-proceso" : "solicitado"}`}>
                  {a.estado}
                </span>
              </td>
              <td>{formatoMoneda(a.valor)}</td>
              <td><button className="btn btn-ghost btn-sm" onClick={() => abrirDetalle(a.id)}>Ver detalle</button></td>
            </tr>
          ))}
          {recientes.length === 0 && !cargando && <tr><td colSpan={7}>No hay anomalías en este periodo.</td></tr>}
        </tbody>
      </table>

      {detalleId && (
        <div className="modal-backdrop" onClick={() => setDetalleId(null)}>
          <div className="modal-container" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="modal-kicker">Anomalía #{detalleId}</span>
                <h2 className="modal-title">Línea de tiempo</h2>
                {detalle && <p className="modal-subtitle">{detalle.nombre} · {ETIQUETA_TIPO[detalle.tipo] ?? detalle.tipo} · nivel {detalle.nivel}</p>}
              </div>
              <button className="modal-close-btn" onClick={() => setDetalleId(null)}>×</button>
            </div>

            <div style={{ padding: "1.5rem 1.75rem", overflowY: "auto" }}>
              {!detalle && <div className="empty-state">Cargando…</div>}

              {detalle && (
                <>
                  <div className="stat-grid" style={{ marginBottom: "1.5rem" }}>
                    <div className="stat"><span className="stat-label">Transacción</span><span className="stat-value">#{detalle.transaccion_id}</span></div>
                    <div className="stat"><span className="stat-label">Valor</span><span className="stat-value">{formatoMoneda(detalle.valor)}</span></div>
                    <div className="stat"><span className="stat-label">Método</span><span className="stat-value">{detalle.metodo_pago}</span></div>
                    <div className="stat"><span className="stat-label">Ventana</span><span className="stat-value">{detalle.ventana_segundos}s</span></div>
                  </div>

                  <h3 className="section-subtitle" style={{ marginTop: 0 }}>Ventana deslizante ({detalle.cantidad_transacciones} transacciones)</h3>
                  <div className="receipt-stack">
                    {ventana?.transaccionesEnVentana.map((t) => (
                      <div key={t.id} className={`receipt ${t.id === detalle.transaccion_id ? "top" : ""}`}>
                        <span className="receipt-detail">#{t.id} · {formatoMoneda(t.valor)} · {t.metodo_pago}</span>
                        <span className="receipt-time">{formatoFechaHora(t.fecha_txn)}</span>
                      </div>
                    ))}
                    {!ventana && <div className="empty-state">Cargando ventana…</div>}
                  </div>

                  <div className="form-actions" style={{ marginTop: "1.5rem" }}>
                    <button className="btn btn-ghost" onClick={() => cambiarEstado(detalleId, "descartada")}>Descartar</button>
                    <button className="btn btn-accent" style={{ marginLeft: "0.6rem" }} onClick={() => cambiarEstado(detalleId, "revisada")}>Marcar revisada</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
