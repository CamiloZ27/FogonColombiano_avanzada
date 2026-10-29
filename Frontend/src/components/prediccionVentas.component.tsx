import React, { useState } from 'react';
import { usePrediccionVentas } from '../hooks/usePrediccionVentas';
import type { PuntoGrafica } from '../types/prediccion.types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCOP(v: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(v);
}

function formatFecha(f: string): string {
  return new Date(f + 'T12:00:00').toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatFechaCorta(f: string): string {
  return new Date(f + 'T12:00:00').toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
  });
}

// ─── Gráfica SVG con lenguaje visual del proyecto ────────────────────────────

const CHART_W = 900;
const CHART_H = 280;
const PAD = { top: 24, right: 24, bottom: 48, left: 80 };

function GraficaSVG({ datos }: { datos: PuntoGrafica[] }) {
  if (datos.length === 0) return null;

  const valores  = datos.map(p => p.total);
  const maxVal   = Math.max(...valores) * 1.12 || 1;
  const W        = CHART_W - PAD.left - PAD.right;
  const H        = CHART_H - PAD.top  - PAD.bottom;

  const px = (i: number) => PAD.left + (i / Math.max(datos.length - 1, 1)) * W;
  const py = (v: number) => PAD.top  + H - (v / maxVal) * H;

  const historicos   = datos.filter(p => !p.esPrediccion);
  const predicciones = datos.filter(p =>  p.esPrediccion);
  const offsetPred   = historicos.length - 1;

  const ptHist = historicos.map((p, i) => `${px(i)},${py(p.total)}`).join(' ');
  const ptPred = predicciones.map((p, i) => `${px(offsetPred + i)},${py(p.total)}`).join(' ');

  // Grid lines (4 niveles)
  const gridLines = [0, 0.33, 0.66, 1].map(pct => ({
    y:     py(pct * maxVal),
    label: formatCOP(Math.round(pct * maxVal)),
  }));

  // Etiquetas eje X cada ~5 puntos
  const step = Math.max(1, Math.floor(datos.length / 7));
  const etX  = datos
    .map((p, i) => ({ i, label: formatFechaCorta(p.fecha), pred: !!p.esPrediccion }))
    .filter((_, i) => i % step === 0 || i === datos.length - 1);

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
    >
      {/* Fondo */}
      <rect
        x={PAD.left} y={PAD.top} width={W} height={H}
        fill="var(--surface)" rx="6"
        stroke="var(--rule)" strokeWidth="1"
      />

      {/* Grid horizontal */}
      {gridLines.map((g, i) => (
        <g key={i}>
          <line
            x1={PAD.left} y1={g.y} x2={PAD.left + W} y2={g.y}
            stroke="var(--rule)" strokeDasharray="4,4" strokeWidth="1"
          />
          <text x={PAD.left - 8} y={g.y + 4}
            textAnchor="end" fontSize="11" fill="var(--text-muted)"
            fontFamily="var(--font-mono, monospace)"
          >
            {g.label}
          </text>
        </g>
      ))}

      {/* Área histórica */}
      {historicos.length > 1 && (
        <polygon
          points={`${px(0)},${py(0)} ${ptHist} ${px(historicos.length - 1)},${py(0)}`}
          fill="var(--accent-soft)" fillOpacity="0.35"
        />
      )}

      {/* Área predicción */}
      {predicciones.length > 1 && (
        <polygon
          points={`${px(offsetPred)},${py(0)} ${ptPred} ${px(offsetPred + predicciones.length - 1)},${py(0)}`}
          fill="#3b82f6" fillOpacity="0.12"
        />
      )}

      {/* Línea histórica */}
      {historicos.length > 1 && (
        <polyline
          points={ptHist}
          fill="none" stroke="var(--accent)" strokeWidth="2.5"
          strokeLinejoin="round" strokeLinecap="round"
        />
      )}

      {/* Línea predicción */}
      {predicciones.length > 1 && (
        <polyline
          points={`${px(offsetPred)},${py(historicos.at(-1)?.total ?? 0)} ${ptPred}`}
          fill="none" stroke="#3b82f6" strokeWidth="2.5"
          strokeDasharray="8,5" strokeLinejoin="round" strokeLinecap="round"
        />
      )}

      {/* Separador histórico / predicción */}
      {historicos.length > 0 && predicciones.length > 0 && (
        <line
          x1={px(offsetPred)} y1={PAD.top}
          x2={px(offsetPred)} y2={PAD.top + H}
          stroke="#3b82f6" strokeDasharray="5,3" strokeWidth="1.5" strokeOpacity="0.55"
        />
      )}

      {/* Puntos históricos */}
      {historicos.map((p, i) => (
        <circle key={i} cx={px(i)} cy={py(p.total)} r="4"
          fill="var(--accent)" stroke="var(--surface)" strokeWidth="1.5">
          <title>{p.fecha}: {formatCOP(p.total)}</title>
        </circle>
      ))}

      {/* Puntos predicción */}
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
        <text x="104" y="9.5" fontSize="11" fill="var(--text-muted)">Predicción (RN)</text>
      </g>

      {/* Etiquetas eje X */}
      {etX.map(({ i, label, pred }) => (
        <text key={i}
          x={px(i)} y={PAD.top + H + 18}
          textAnchor="middle" fontSize="11"
          fill={pred ? '#3b82f6' : 'var(--text-muted)'}
          fontWeight={pred ? '600' : '400'}
        >
          {label}
        </text>
      ))}
    </svg>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export const PrediccionVentas: React.FC = () => {
  const { estado, progreso, graficaDatos, resumen, errorMsg, mse, fuenteDatos, entrenarYPredecir } =
    usePrediccionVentas();
  const [diasHistoria, setDiasHistoria] = useState(90);

  const predicciones = graficaDatos.filter(p => p.esPrediccion);
  const maxPred      = Math.max(1, ...predicciones.map(p => p.total));
  const entrenando   = estado === 'entrenando' || estado === 'cargando';

  return (
    <section>
      {/* Encabezado */}
      <div className="panel-heading">
        <h1>Predicción de ventas</h1>
        <p>
          Red neuronal MLP (Perceptrón Multicapa) entrenada en el navegador con
          datos históricos de transacciones. Sin dependencias externas.
        </p>
        {fuenteDatos === 'demo' && (
          <span style={{
            display: 'inline-block', marginTop: '0.5rem',
            fontSize: '0.78rem', fontWeight: 600, padding: '3px 10px',
            borderRadius: '12px', background: 'var(--accent-soft)',
            color: 'var(--text-muted)',
          }}>
            📊 Usando dataset de demostración (sin datos reales en BD)
          </span>
        )}
        {fuenteDatos === 'mixto' && (
          <span style={{
            display: 'inline-block', marginTop: '0.5rem',
            fontSize: '0.78rem', fontWeight: 600, padding: '3px 10px',
            borderRadius: '12px', background: 'var(--accent-soft)',
            color: 'var(--text-muted)',
          }}>
            🔀 Datos reales + demostración combinados
          </span>
        )}
        {fuenteDatos === 'backend' && estado === 'listo' && (
          <span style={{
            display: 'inline-block', marginTop: '0.5rem',
            fontSize: '0.78rem', fontWeight: 600, padding: '3px 10px',
            borderRadius: '12px', background: '#d1fae5',
            color: '#065f46',
          }}>
            ✅ Datos reales del backend
          </span>
        )}
      </div>

      {/* Controles */}
      <div className="scenarios-buttons" style={{ marginBottom: '1.75rem', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        {([30, 60, 90, 180, 365] as const).map(d => (
          <button
            key={d}
            className={`modal-filter-btn ${diasHistoria === d ? 'active' : ''}`}
            onClick={() => setDiasHistoria(d)}
            disabled={entrenando}
          >
            {d === 365 ? '1 año' : `${d} días`}
          </button>
        ))}

        <button
          className={`btn ${estado === 'listo' ? 'btn-ghost' : 'btn-accent'}`}
          onClick={() => entrenarYPredecir(diasHistoria)}
          disabled={entrenando}
          style={{ marginLeft: 'auto' }}
        >
          {estado === 'cargando'   ? '⏳ Cargando datos...'
          : estado === 'entrenando' ? '🔄 Entrenando...'
          : estado === 'listo'      ? '🔁 Reentrenar'
          :                          '▶ Entrenar y predecir'}
        </button>

        {mse !== null && (
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            MSE: <strong style={{ fontFamily: 'var(--font-mono, monospace)' }}>{mse.toFixed(5)}</strong>
          </span>
        )}
      </div>

      {/* Barra de progreso */}
      {entrenando && (
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
            {estado === 'cargando'
              ? 'Cargando datos del servidor...'
              : `Entrenando red neuronal — ${progreso}% completado`}
          </p>
          <div className="bar-track" style={{ height: '10px', borderRadius: '5px' }}>
            <div
              className="bar-fill bar-fill-accent"
              style={{
                width: `${estado === 'cargando' ? 12 : progreso}%`,
                height: '100%',
                borderRadius: '5px',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {estado === 'error' && (
        <div className="order-card-not-found">
          <span className="not-found-icon">⚠️</span>
          <div>
            <strong>No se pudo ejecutar el modelo.</strong>
            <p>{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Tarjetas de resumen */}
      {resumen && (
        <div className="trace-box" style={{ marginBottom: '2rem' }}>
          <div className="stat-grid">
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

      {/* Tabla de predicciones */}
      {predicciones.length > 0 && (
        <>
          <h3 className="section-subtitle">Predicciones detalladas — próximos 14 días</h3>

          {/* Barras visuales */}
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
                    <div
                      className="bar-fill bar-fill-accent"
                      style={{ width: `${(p.total / maxPred) * 100}%` }}
                    />
                  </div>
                  <span className="bar-value">{formatCOP(p.total)}</span>
                  <span style={{
                    marginLeft: '0.5rem',
                    fontSize: '0.8rem',
                    color: delta >= 0 ? 'var(--sage)' : 'var(--rust, #c0392b)',
                    fontWeight: 600,
                    minWidth: '80px',
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
                <th>#</th>
                <th>Fecha</th>
                <th>Ventas estimadas</th>
                <th>Variación</th>
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

      {/* Estado inicial vacío */}
      {estado === 'idle' && (
        <div className="empty-state" style={{ flexDirection: 'column', gap: '0.5rem', padding: '3rem' }}>
          <span style={{ fontSize: '2.5rem' }}>🧠</span>
          <span>
            Selecciona el periodo de historia y presiona{' '}
            <strong>Entrenar y predecir</strong> para ejecutar la red neuronal.
          </span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            El entrenamiento ocurre completamente en tu navegador — sin enviar datos a terceros.
          </span>
        </div>
      )}
    </section>
  );
};
