import React, { useState } from 'react';
import { usePrediccionVentas } from '../hooks/usePrediccionVentas';
import type { PuntoGrafica } from '../types/prediccion.types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCOP(v: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  }).format(v);
}
function formatFecha(f: string): string {
  return new Date(f + 'T12:00:00').toLocaleDateString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}
function formatFechaCorta(f: string): string {
  return new Date(f + 'T12:00:00').toLocaleDateString('es-CO', {
    day: '2-digit', month: '2-digit',
  });
}

// ─── Gráfica SVG ──────────────────────────────────────────────────────────────

const CHART_W = 900;
const CHART_H = 280;
const PAD     = { top: 24, right: 24, bottom: 48, left: 80 };

function GraficaSVG({ datos }: { datos: PuntoGrafica[] }) {
  if (datos.length === 0) return null;

  const valores = datos.map(p => p.total);
  const maxVal  = Math.max(...valores) * 1.12 || 1;
  const W = CHART_W - PAD.left - PAD.right;
  const H = CHART_H - PAD.top  - PAD.bottom;

  const px = (i: number) => PAD.left + (i / Math.max(datos.length - 1, 1)) * W;
  const py = (v: number) => PAD.top  + H - (v / maxVal) * H;

  const historicos   = datos.filter(p => !p.esPrediccion);
  const predicciones = datos.filter(p =>  p.esPrediccion);
  const offsetPred   = historicos.length - 1;

  const ptHist = historicos.map((p, i) => `${px(i)},${py(p.total)}`).join(' ');
  const ptPred = predicciones.map((p, i) => `${px(offsetPred + i)},${py(p.total)}`).join(' ');

  const gridLines = [0, 0.33, 0.66, 1].map(pct => ({
    y: py(pct * maxVal), label: formatCOP(Math.round(pct * maxVal)),
  }));

  const step = Math.max(1, Math.floor(datos.length / 7));
  const etX  = datos
    .map((p, i) => ({ i, label: formatFechaCorta(p.fecha), pred: !!p.esPrediccion }))
    .filter((_, i) => i % step === 0 || i === datos.length - 1);

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}>
      <rect x={PAD.left} y={PAD.top} width={W} height={H}
        fill="var(--surface)" rx="6" stroke="var(--rule)" strokeWidth="1" />

      {gridLines.map((g, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={g.y} x2={PAD.left + W} y2={g.y}
            stroke="var(--rule)" strokeDasharray="4,4" strokeWidth="1" />
          <text x={PAD.left - 8} y={g.y + 4}
            textAnchor="end" fontSize="11" fill="var(--text-muted)"
            fontFamily="var(--font-mono, monospace)">{g.label}</text>
        </g>
      ))}

      {historicos.length > 1 && (
        <polygon
          points={`${px(0)},${py(0)} ${ptHist} ${px(historicos.length - 1)},${py(0)}`}
          fill="var(--accent-soft)" fillOpacity="0.35" />
      )}
      {predicciones.length > 1 && (
        <polygon
          points={`${px(offsetPred)},${py(0)} ${ptPred} ${px(offsetPred + predicciones.length - 1)},${py(0)}`}
          fill="#3b82f6" fillOpacity="0.12" />
      )}
      {historicos.length > 1 && (
        <polyline points={ptHist} fill="none" stroke="var(--accent)" strokeWidth="2.5"
          strokeLinejoin="round" strokeLinecap="round" />
      )}
      {predicciones.length > 1 && (
        <polyline
          points={`${px(offsetPred)},${py(historicos.at(-1)?.total ?? 0)} ${ptPred}`}
          fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeDasharray="8,5"
          strokeLinejoin="round" strokeLinecap="round" />
      )}
      {historicos.length > 0 && predicciones.length > 0 && (
        <line x1={px(offsetPred)} y1={PAD.top} x2={px(offsetPred)} y2={PAD.top + H}
          stroke="#3b82f6" strokeDasharray="5,3" strokeWidth="1.5" strokeOpacity="0.55" />
      )}
      {historicos.map((p, i) => (
        <circle key={i} cx={px(i)} cy={py(p.total)} r="4"
          fill="var(--accent)" stroke="var(--surface)" strokeWidth="1.5">
          <title>{p.fecha}: {formatCOP(p.total)}</title>
        </circle>
      ))}
      {predicciones.map((p, i) => (
        <circle key={i} cx={px(offsetPred + i)} cy={py(p.total)} r="4"
          fill="#3b82f6" stroke="var(--surface)" strokeWidth="1.5">
          <title>{p.fecha} (predicción): {formatCOP(p.total)}</title>
        </circle>
      ))}

      {/* Leyenda */}
      <g transform={`translate(${PAD.left + 8}, ${PAD.top + 8})`}>
        <rect width="11" height="11" rx="2" fill="var(--accent)" />
        <text x="16" y="9.5" fontSize="11" fill="var(--text-muted)">Histórico</text>
        <rect x="88" width="11" height="11" rx="2" fill="#3b82f6" />
        <text x="104" y="9.5" fontSize="11" fill="var(--text-muted)">Predicción MLP (Python)</text>
      </g>

      {/* Etiquetas X */}
      {etX.map(({ i, label, pred }) => (
        <text key={i} x={px(i)} y={PAD.top + H + 18}
          textAnchor="middle" fontSize="11"
          fill={pred ? '#3b82f6' : 'var(--text-muted)'}
          fontWeight={pred ? '600' : '400'}>{label}</text>
      ))}
    </svg>
  );
}

// ─── Badge de fuente de datos ─────────────────────────────────────────────────

function BadgeFuente({ fuente, listo }: { fuente: string; listo: boolean }) {
  if (!listo) return null;
  const configs: Record<string, { bg: string; color: string; texto: string }> = {
    demo:    { bg: 'var(--accent-soft)', color: 'var(--text-muted)', texto: '📊 Dataset de demostración' },
    mixto:   { bg: 'var(--accent-soft)', color: 'var(--text-muted)', texto: '🔀 Datos reales + demostración' },
    backend: { bg: '#d1fae5',            color: '#065f46',            texto: '✅ Datos reales del backend' },
  };
  const cfg = configs[fuente] ?? configs.demo;
  return (
    <span style={{
      display: 'inline-block', marginTop: '0.5rem',
      fontSize: '0.78rem', fontWeight: 600, padding: '3px 10px',
      borderRadius: '12px', background: cfg.bg, color: cfg.color,
    }}>{cfg.texto}</span>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export const PrediccionVentas: React.FC = () => {
  const {
    estado, graficaDatos, resumen, errorMsg,
    mse, r2, modeloInfo, fuenteDatos, entrenarYPredecir,
  } = usePrediccionVentas();

  const [diasHistoria, setDiasHistoria] = useState(90);
  const [maxIter,      setMaxIter]      = useState(1000);

  const predicciones = graficaDatos.filter(p => p.esPrediccion);
  const maxPred      = Math.max(1, ...predicciones.map(p => p.total));
  const entrenando   = estado === 'entrenando' || estado === 'cargando';

  return (
    <section>
      {/* Encabezado */}
      <div className="panel-heading">
        <h1>Predicción de ventas</h1>
        <p>
          Microservicio Python · Red neuronal MLP scikit-learn (capas 64→32→16,
          Adam optimizer, early stopping). El entrenamiento ocurre en el servidor.
        </p>
        <BadgeFuente fuente={fuenteDatos} listo={estado === 'listo'} />
      </div>

      {/* Controles */}
      <div className="scenarios-buttons"
        style={{ marginBottom: '1.75rem', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>

        {/* Días de historia */}
        {([30, 60, 90, 180, 365] as const).map(d => (
          <button key={d}
            className={`modal-filter-btn ${diasHistoria === d ? 'active' : ''}`}
            onClick={() => setDiasHistoria(d)} disabled={entrenando}>
            {d === 365 ? '1 año' : `${d} días`}
          </button>
        ))}

        {/* Selector iteraciones */}
        <select
          value={maxIter}
          onChange={e => setMaxIter(Number(e.target.value))}
          disabled={entrenando}
          style={{
            padding: '0.35rem 0.6rem', borderRadius: '8px',
            border: '1px solid var(--rule)', background: 'var(--surface)',
            color: 'var(--text)', fontSize: '0.85rem', cursor: 'pointer',
          }}
        >
          <option value={300}>300 iter (rápido)</option>
          <option value={1000}>1 000 iter</option>
          <option value={3000}>3 000 iter (preciso)</option>
          <option value={5000}>5 000 iter (máx)</option>
        </select>

        <button
          className={`btn ${estado === 'listo' ? 'btn-ghost' : 'btn-accent'}`}
          onClick={() => entrenarYPredecir(diasHistoria, maxIter)}
          disabled={entrenando}
          style={{ marginLeft: 'auto' }}
        >
          {entrenando ? '🔄 Entrenando en Python...' : estado === 'listo' ? '🔁 Reentrenar' : '▶ Entrenar y predecir'}
        </button>
      </div>

      {/* Spinner de entrenamiento */}
      {entrenando && (
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
            {estado === 'cargando'
              ? 'Conectando con el microservicio Python...'
              : 'Entrenando red neuronal MLP en el servidor Python...'}
          </p>
          <div className="bar-track" style={{ height: '10px', borderRadius: '5px' }}>
            {/* Barra animada indeterminada */}
            <div className="bar-fill bar-fill-accent"
              style={{
                width: '45%', height: '100%', borderRadius: '5px',
                animation: 'pulse 1.4s ease-in-out infinite',
              }} />
          </div>
          <style>{`@keyframes pulse{0%,100%{opacity:.6}50%{opacity:1}}`}</style>
        </div>
      )}

      {/* Error */}
      {estado === 'error' && (
        <div className="order-card-not-found">
          <span className="not-found-icon">⚠️</span>
          <div>
            <strong>Error en el microservicio</strong>
            <p>{errorMsg}</p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
              Verifica que el servidor Python esté corriendo:&nbsp;
              <code style={{ background: 'var(--surface)', padding: '1px 6px', borderRadius: '4px' }}>
                cd Backend/python-prediccion &amp;&amp; python app.py
              </code>
            </p>
          </div>
        </div>
      )}

      {/* Métricas del modelo */}
      {modeloInfo && (
        <div className="trace-box" style={{ marginBottom: '2rem' }}>
          <div className="stat-grid">
            {resumen && (
              <>
                <div className="stat">
                  <span className="stat-label">Total histórico</span>
                  <span className="stat-value">{formatCOP(resumen.totalHistorico)}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Promedio semanal</span>
                  <span className="stat-value">{formatCOP(resumen.promedioSemanal)}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Tx. últimos 30 días</span>
                  <span className="stat-value highlight-accent">{resumen.transaccionesUltimos30}</span>
                </div>
                {resumen.mejorDia && (
                  <div className="stat">
                    <span className="stat-label">Mejor día</span>
                    <span className="stat-value">{formatFecha(resumen.mejorDia.fecha)}</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {formatCOP(resumen.mejorDia.total)}
                    </span>
                  </div>
                )}
              </>
            )}

            {/* Métricas del modelo */}
            <div className="stat">
              <span className="stat-label">Modelo</span>
              <span className="stat-value" style={{ fontSize: '0.9rem' }}>
                {modeloInfo.tipo === 'mlp_sklearn' ? 'MLP (64→32→16)' : 'Reg. lineal'}
              </span>
            </div>
            {mse !== null && (
              <div className="stat">
                <span className="stat-label">MSE entrenamiento</span>
                <span className="stat-value" style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.9rem' }}>
                  {mse.toLocaleString('es-CO')}
                </span>
              </div>
            )}
            {r2 !== null && (
              <div className="stat">
                <span className="stat-label">R² (bondad de ajuste)</span>
                <span className={`stat-value ${r2 >= 0.7 ? 'highlight-sage' : 'highlight-accent'}`}>
                  {r2.toFixed(4)}
                </span>
              </div>
            )}
            <div className="stat">
              <span className="stat-label">Iteraciones / Días datos</span>
              <span className="stat-value" style={{ fontSize: '0.9rem' }}>
                {modeloInfo.iteraciones} / {modeloInfo.dias_entrenamiento}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Gráfica */}
      {graficaDatos.length > 0 && (
        <>
          <h3 className="section-subtitle">
            Histórico de ventas + predicción próximos 14 días
          </h3>
          <div className="trace-box" style={{ overflowX: 'auto', marginBottom: '2rem' }}>
            <GraficaSVG datos={graficaDatos} />
          </div>
        </>
      )}

      {/* Barras de predicción */}
      {predicciones.length > 0 && (
        <>
          <h3 className="section-subtitle">Predicciones detalladas — próximos 14 días</h3>
          <div className="efficiency-comparison-box" style={{ marginBottom: '1.5rem' }}>
            {predicciones.map((p, i) => {
              const prev  = i === 0
                ? (graficaDatos.find(d => !d.esPrediccion)?.total ?? p.total)
                : (predicciones[i - 1]?.total ?? p.total);
              const delta = p.total - prev;
              return (
                <div className="bar-row" key={p.fecha}>
                  <span className="bar-label" style={{ minWidth: '60px', fontSize: '0.8rem' }}>
                    {formatFechaCorta(p.fecha)}
                  </span>
                  <div className="bar-track">
                    <div className="bar-fill bar-fill-accent"
                      style={{ width: `${(p.total / maxPred) * 100}%` }} />
                  </div>
                  <span className="bar-value">{formatCOP(p.total)}</span>
                  <span style={{
                    marginLeft: '0.5rem', fontSize: '0.8rem',
                    color: delta >= 0 ? 'var(--sage)' : 'var(--rust, #c0392b)',
                    fontWeight: 600, minWidth: '80px',
                  }}>
                    {delta >= 0 ? '▲' : '▼'} {formatCOP(Math.abs(delta))}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Tabla detallada */}
          <table className="bigo-table">
            <thead>
              <tr>
                <th>#</th><th>Fecha</th><th>Ventas estimadas</th><th>Variación</th>
              </tr>
            </thead>
            <tbody>
              {predicciones.map((p, i) => {
                const prev  = i === 0
                  ? (graficaDatos.find(d => !d.esPrediccion)?.total ?? p.total)
                  : (predicciones[i - 1]?.total ?? p.total);
                const delta = p.total - prev;
                return (
                  <tr key={p.fecha}>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>+{i + 1}d</td>
                    <td>{formatFecha(p.fecha)}</td>
                    <td className="tag-orange">{formatCOP(p.total)}</td>
                    <td>
                      <span style={{
                        color: delta >= 0 ? 'var(--sage)' : 'var(--rust, #c0392b)',
                        fontWeight: 600,
                      }}>
                        {delta >= 0 ? '▲' : '▼'} {formatCOP(Math.abs(delta))}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {/* Estado idle */}
      {estado === 'idle' && (
        <div className="empty-state" style={{ flexDirection: 'column', gap: '0.5rem', padding: '3rem' }}>
          <span style={{ fontSize: '2.5rem' }}>🐍</span>
          <span>
            Selecciona los parámetros y presiona{' '}
            <strong>Entrenar y predecir</strong> para ejecutar el microservicio Python.
          </span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Asegúrate de que el microservicio está corriendo en el puerto&nbsp;
            <code style={{ background: 'var(--surface)', padding: '1px 6px', borderRadius: '4px' }}>5001</code>
          </span>
        </div>
      )}
    </section>
  );
};
