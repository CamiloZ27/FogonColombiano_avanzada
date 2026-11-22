import React, { useEffect, useState } from 'react';
import { apiRequest } from '../services/api.service';

interface PanelData {
  kpis: {
    usuarios_activos: number;
    items_catalogo: number;
    items_stock_bajo: number;
    total_pedidos: number;
    pedidos_anulados: number;
    total_facturas: number;
    ventas_facturadas: number;
    pagos_aprobados: number;
    pagos_fraudulentos_ia: number;
    total_transacciones: number;
    ventas_transacciones: number;
    alertas_abiertas: number;
  };
  ultimo_reporte_calidad: {
    puntaje_calidad: string | number;
    total_registros: number;
    duplicados_detectados: number;
    registros_rechazados: number;
    fecha_creacion: string;
  } | null;
  integridad: {
    integra_global: boolean;
    facturas_bloques: number;
    facturas_alteradas: number;
    pagos_bloques: number;
    pagos_alterados: number;
  };
  patrones: {
    por_canal: Array<{ canal: string; total_pedidos: number; total_ventas: number; anulados: number }>;
    por_metodo_pago: Array<{ metodo: string; operaciones: number; total: number }>;
    horas_pico: Array<{ hora: number; operaciones: number; ventas: number }>;
  };
  top_items: Array<{ item_id: number; nombre: string; categoria: string; unidades_vendidas: number; ingresos: number }>;
  modelos_ia: {
    framework: string;
    modelos: Array<{
      nombre: string;
      guardado_en_disco: boolean;
      entrenado_en: string | null;
      metricas: Record<string, number> | null;
    }>;
  };
}

function fmtCOP(v: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v || 0);
}

export const PanelEjecutivo: React.FC = () => {
  const [data, setData] = useState<PanelData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const res = await apiRequest<PanelData>('/api/analitica/panel-ejecutivo');
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando panel ejecutivo');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  if (cargando && !data) return <div className="empty-state">Cargando panel ejecutivo unificado…</div>;

  return (
    <section>
      <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1>Panel Ejecutivo Unificado</h1>
          <p>
            Resumen en tiempo real de ventas, canales operativos, alertas de anomalías/IA, calidad de datos e
            integridad criptográfica encadenada.
          </p>
        </div>
        <button className="btn btn-ghost" onClick={cargar} disabled={cargando}>
          {cargando ? 'Actualizando…' : '↻ Actualizar métricas'}
        </button>
      </div>

      {error && (
        <div className="order-card-not-found" style={{ marginBottom: '1.25rem' }}>
          <span className="not-found-icon">⚠️</span>
          <div>{error}</div>
        </div>
      )}

      {data && (
        <>
          {/* KPIs principales */}
          <div className="trace-box" style={{ marginBottom: '1.5rem' }}>
            <div className="stat-grid">
              <div className="stat">
                <span className="stat-label">Ventas facturadas</span>
                <span className="stat-value highlight-accent">{fmtCOP(data.kpis.ventas_facturadas)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Volumen transacciones</span>
                <span className="stat-value">{fmtCOP(data.kpis.ventas_transacciones)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Pedidos (Anulados)</span>
                <span className="stat-value">
                  {data.kpis.total_pedidos}{' '}
                  <small style={{ color: '#DDA15E', fontSize: '0.78rem' }}>({data.kpis.pedidos_anulados})</small>
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Facturas / Pagos</span>
                <span className="stat-value">
                  {data.kpis.total_facturas} / {data.kpis.pagos_aprobados}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Alertas abiertas</span>
                <span className="stat-value highlight-rust">{data.kpis.alertas_abiertas}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Pagos fraude IA</span>
                <span className="stat-value highlight-rust">{data.kpis.pagos_fraudulentos_ia}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Ítems (Stock bajo)</span>
                <span className="stat-value">
                  {data.kpis.items_catalogo}{' '}
                  <small style={{ color: data.kpis.items_stock_bajo > 0 ? '#ef4444' : '#5C7A5A', fontSize: '0.78rem' }}>
                    ({data.kpis.items_stock_bajo} bajo)
                  </small>
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Usuarios activos</span>
                <span className="stat-value highlight-sage">{data.kpis.usuarios_activos}</span>
              </div>
            </div>
          </div>

          {/* Semáforo de Integridad, Calidad e IA */}
          <div className="bigo-cards-grid" style={{ marginBottom: '1.75rem' }}>
            <div className="bigo-card" style={{ borderColor: data.integridad.integra_global ? 'var(--sage)' : 'var(--rust)' }}>
              <div className="bigo-card-head">
                <span className={`complexity-badge ${data.integridad.integra_global ? 'badge-logarithmic' : 'badge-linear'}`}>
                  {data.integridad.integra_global ? 'ÍNTEGRA' : 'ALTERADA'}
                </span>
                <h3>Integridad de Registros</h3>
              </div>
              <p className="bigo-card-desc">
                Facturas verificadas: <strong>{data.integridad.facturas_bloques}</strong> (alteradas:{' '}
                {data.integridad.facturas_alteradas}) · Pagos verificados:{' '}
                <strong>{data.integridad.pagos_bloques}</strong> (alterados: {data.integridad.pagos_alterados}).
              </p>
            </div>

            <div className="bigo-card">
              <div className="bigo-card-head">
                <span className="complexity-badge badge-constant">
                  {data.ultimo_reporte_calidad ? `${Number(data.ultimo_reporte_calidad.puntaje_calidad).toFixed(1)}%` : 'N/A'}
                </span>
                <h3>Calidad de Datos</h3>
              </div>
              <p className="bigo-card-desc">
                {data.ultimo_reporte_calidad
                  ? `Última auditoría: ${data.ultimo_reporte_calidad.total_registros} registros · ${data.ultimo_reporte_calidad.duplicados_detectados} duplicados · ${data.ultimo_reporte_calidad.registros_rechazados} inválidos.`
                  : 'Aún no se ha ejecutado una auditoría desde Integridad & Calidad.'}
              </p>
            </div>

            <div className="bigo-card">
              <div className="bigo-card-head">
                <span className="complexity-badge badge-logarithmic">ACTIVO</span>
                <h3>Análisis Inteligente</h3>
              </div>
              <p className="bigo-card-desc">
                {data.modelos_ia.modelos.filter((m) => m.guardado_en_disco).length} / {data.modelos_ia.modelos.length}{' '}
                modelos predictivos entrenados (fraude, monto esperado y demanda).
              </p>
            </div>
          </div>

          {/* Ranking de ítems más vendidos y canales */}
          <div className="grid-two">
            <div>
              <h3 className="section-subtitle">Platos Más Vendidos</h3>
              <table className="bigo-table">
                <thead>
                  <tr>
                    <th>Plato</th>
                    <th>Unidades</th>
                    <th>Ingresos</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_items.map((it) => (
                    <tr key={it.item_id}>
                      <td>
                        <strong>{it.nombre}</strong>
                        <div style={{ fontSize: '0.75rem', color: '#A89078' }}>{it.categoria}</div>
                      </td>
                      <td className="tag-orange">{it.unidades_vendidas}</td>
                      <td>{fmtCOP(it.ingresos)}</td>
                    </tr>
                  ))}
                  {data.top_items.length === 0 && (
                    <tr>
                      <td colSpan={3}>Sin ventas registradas por ítem todavía.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="section-subtitle">Operación por Canal</h3>
              <div className="efficiency-comparison-box">
                {data.patrones.por_canal.map((c) => {
                  const max = Math.max(1, ...data.patrones.por_canal.map((x) => x.total_pedidos));
                  return (
                    <div className="bar-row" key={c.canal}>
                      <span className="bar-label" style={{ textTransform: 'capitalize' }}>
                        {c.canal}
                      </span>
                      <div className="bar-track">
                        <div className="bar-fill bar-fill-accent" style={{ width: `${(c.total_pedidos / max) * 100}%` }} />
                      </div>
                      <span className="bar-value">
                        {c.total_pedidos} ({fmtCOP(c.total_ventas)})
                      </span>
                    </div>
                  );
                })}
                {data.patrones.por_canal.length === 0 && <p className="box-note">Sin pedidos por canal aún.</p>}
              </div>

              <h3 className="section-subtitle">Horas Pico Detectadas</h3>
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                {data.patrones.horas_pico.map((h) => (
                  <div key={h.hora} className="dataset-meta-badge">
                    <span className="meta-label">{String(h.hora).padStart(2, '0')}:00h</span>
                    <span className="meta-value" style={{ fontSize: '0.95rem' }}>
                      {h.operaciones} ops · {fmtCOP(h.ventas)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
};

