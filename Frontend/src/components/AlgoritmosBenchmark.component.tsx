import React, { useEffect, useState } from 'react';
import { apiRequest } from '../services/api.service';

interface PuntoBenchmark {
  n: number;
  on: {
    busqueda_ms: number;
    busqueda_ops: number;
    suma_ms: number;
    conteo_clientes_ms: number;
    dedup_hash_ms: number;
    dedup_hash_ops: number;
  };
  onlogn: {
    merge_sort_ms: number;
    merge_sort_ops: number;
  };
  on2: {
    bubble_sort_ms: number;
    bubble_sort_ops: number;
    dedup_ingenuo_ms: number;
    dedup_ingenuo_ops: number;
  };
  optimizacion: {
    aceleracion_ordenamiento_x: number;
    reduccion_ops_ordenamiento_pct: number;
    aceleracion_dedup_x: number;
    reduccion_ops_dedup_pct: number;
  };
}

interface BenchmarkResponse {
  registros_reales_bd: number;
  ejecutado_en: string;
  puntos: PuntoBenchmark[];
  resumen_optimizacion: {
    caso_1_ordenamiento: {
      antes: string;
      despues: string;
      n_maximo: number;
      mejora_velocidad: string;
      reduccion_operaciones: string;
      conclusion: string;
    };
    caso_2_duplicados: {
      antes: string;
      despues: string;
      n_maximo: number;
      mejora_velocidad: string;
      reduccion_operaciones: string;
      conclusion: string;
    };
  };
}

interface PatronesResponse {
  metricas_globales: {
    total_operaciones_analizadas: number;
    total_ventas: number;
    ticket_promedio: number;
    clientes_activos: number;
    tiempo_suma_on_ms: number;
    tiempo_conteo_clientes_on_ms: number;
  };
  ranking_items: {
    algoritmo: string;
    tiempo_ms: number;
    comparaciones: number;
    items: Array<{ item_id: number; nombre: string; categoria: string; unidades_vendidas: number; ingresos: number }>;
  };
  top_clientes: Array<{ usuario_id: number; nombre: string; cantidad: number; total_gastado: number }>;
  patrones: {
    horarios: Array<{ hora: number; operaciones: number; ventas: number }>;
    horas_pico: Array<{ hora: number; operaciones: number; ventas: number }>;
    rangos_monto: { bajo_lt_25k: number; medio_25k_60k: number; alto_60k_120k: number; muy_alto_gt_120k: number };
    por_canal: Array<{ canal: string; total_pedidos: number; total_ventas: number; anulados: number }>;
    por_metodo_pago: Array<{ metodo: string; operaciones: number; total: number }>;
  };
}

function fmtCOP(v: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v || 0);
}

export const AlgoritmosBenchmark: React.FC = () => {
  const [benchmark, setBenchmark] = useState<BenchmarkResponse | null>(null);
  const [patrones, setPatrones] = useState<PatronesResponse | null>(null);
  const [cargandoBench, setCargandoBench] = useState(false);
  const [algoritmoSel, setAlgoritmoSel] = useState('comparar_ordenamiento');
  const [resultadoAlgo, setResultadoAlgo] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function ejecutarBenchmark(tamanos = '100,300,600,1200,2000') {
    setCargandoBench(true);
    setError(null);
    try {
      const res = await apiRequest<BenchmarkResponse>(`/api/analitica/algoritmos/benchmark?tamanos=${tamanos}`);
      setBenchmark(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error ejecutando benchmark');
    } finally {
      setCargandoBench(false);
    }
  }

  async function cargarPatrones() {
    try {
      const res = await apiRequest<PatronesResponse>('/api/analitica/algoritmos/patrones');
      setPatrones(res);
    } catch {
      // ignore
    }
  }

  async function ejecutarAlgoritmoPuntual() {
    setError(null);
    try {
      const res = await apiRequest<unknown>('/api/analitica/algoritmos/ejecutar', {
        method: 'POST',
        body: { algoritmo: algoritmoSel, limite: 800 },
      });
      setResultadoAlgo(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error ejecutando algoritmo');
    }
  }

  useEffect(() => {
    ejecutarBenchmark();
    cargarPatrones();
  }, []);

  const maxTiempo = benchmark
    ? Math.max(
        0.5,
        ...benchmark.puntos.map((p) => Math.max(p.on2.bubble_sort_ms, p.onlogn.merge_sort_ms, p.on.busqueda_ms))
      )
    : 1;

  return (
    <section>
      <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>Algoritmos, Complejidad &amp; Análisis Experimental</h1>
          <p>
            Comparación experimental real entre <strong>O(n)</strong>, <strong>O(n log n)</strong> y{' '}
            <strong>O(n²)</strong> sobre datos del restaurante, documentación de optimizaciones críticas y análisis de
            patrones operativos.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button className="btn btn-accent" onClick={() => ejecutarBenchmark('100,300,600,1200,2000')} disabled={cargandoBench}>
            {cargandoBench ? 'Midiento complejidad…' : '▶ Ejecutar Benchmark (hasta N=2.000)'}
          </button>
          <button className="btn btn-ghost" onClick={() => ejecutarBenchmark('200,600,1200,2000,3000')} disabled={cargandoBench}>
            Escala Alta (N=3.000)
          </button>
        </div>
      </div>

      {error && (
        <div className="order-card-not-found" style={{ marginBottom: '1rem' }}>
          <span className="not-found-icon">⚠️</span>
          <div>{error}</div>
        </div>
      )}

      {/* Gráfica SVG comparativa de curvas O(n), O(n log n), O(n²) */}
      {benchmark && (
        <>
          <div className="trace-box" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginTop: 0 }}>
              Curva Experimental de Crecimiento de Tiempo (ms) — BD base: {benchmark.registros_reales_bd} operaciones
            </h3>
            <svg viewBox="0 0 820 250" style={{ width: '100%', height: 'auto', display: 'block' }}>
              <rect x="65" y="18" width="730" height="185" rx="6" fill="rgba(0,0,0,0.2)" stroke="var(--rule)" />
              {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                const y = 203 - pct * 185;
                return (
                  <g key={i}>
                    <line x1="65" y1={y} x2="795" y2={y} stroke="var(--rule)" strokeDasharray="3,4" />
                    <text x="58" y={y + 4} textAnchor="end" fontSize="10" fill="#A89078" fontFamily="var(--font-mono)">
                      {(pct * maxTiempo).toFixed(1)}ms
                    </text>
                  </g>
                );
              })}

              {/* O(n²) Bubble Sort */}
              <polyline
                fill="none"
                stroke="#ef4444"
                strokeWidth="3"
                points={benchmark.puntos
                  .map((p, i) => {
                    const x = 65 + (i / Math.max(1, benchmark.puntos.length - 1)) * 730;
                    const y = 203 - (p.on2.bubble_sort_ms / maxTiempo) * 185;
                    return `${x},${y}`;
                  })
                  .join(' ')}
              />
              {/* O(n log n) Merge Sort */}
              <polyline
                fill="none"
                stroke="#DDA15E"
                strokeWidth="3"
                points={benchmark.puntos
                  .map((p, i) => {
                    const x = 65 + (i / Math.max(1, benchmark.puntos.length - 1)) * 730;
                    const y = 203 - (p.onlogn.merge_sort_ms / maxTiempo) * 185;
                    return `${x},${y}`;
                  })
                  .join(' ')}
              />
              {/* O(n) Suma/Dedup */}
              <polyline
                fill="none"
                stroke="#5C7A5A"
                strokeWidth="3"
                points={benchmark.puntos
                  .map((p, i) => {
                    const x = 65 + (i / Math.max(1, benchmark.puntos.length - 1)) * 730;
                    const y = 203 - (p.on.dedup_hash_ms / maxTiempo) * 185;
                    return `${x},${y}`;
                  })
                  .join(' ')}
              />

              {benchmark.puntos.map((p, i) => {
                const x = 65 + (i / Math.max(1, benchmark.puntos.length - 1)) * 730;
                return (
                  <g key={p.n}>
                    <circle cx={x} cy={203 - (p.on2.bubble_sort_ms / maxTiempo) * 185} r="4.5" fill="#ef4444" />
                    <circle cx={x} cy={203 - (p.onlogn.merge_sort_ms / maxTiempo) * 185} r="4.5" fill="#DDA15E" />
                    <circle cx={x} cy={203 - (p.on.dedup_hash_ms / maxTiempo) * 185} r="4.5" fill="#5C7A5A" />
                    <text x={x} y="226" textAnchor="middle" fontSize="11" fill="#F4E9D8" fontFamily="var(--font-mono)">
                      N={p.n}
                    </text>
                  </g>
                );
              })}

              {/* Leyenda */}
              <g transform="translate(80, 30)">
                <rect width="12" height="12" rx="2" fill="#ef4444" />
                <text x="18" y="10" fontSize="11" fill="#F4E9D8">O(n²) Bubble Sort</text>
                <rect x="145" width="12" height="12" rx="2" fill="#DDA15E" />
                <text x="163" y="10" fontSize="11" fill="#F4E9D8">O(n log n) Merge Sort</text>
                <rect x="320" width="12" height="12" rx="2" fill="#5C7A5A" />
                <text x="338" y="10" fontSize="11" fill="#F4E9D8">O(n) Hash Set / Lineal</text>
              </g>
            </svg>
          </div>

          {/* Tabla detallada del benchmark */}
          <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
            <table className="bigo-table">
              <thead>
                <tr>
                  <th>Tamaño N</th>
                  <th>O(n) Búsqueda / Dedup</th>
                  <th>O(n log n) Merge Sort</th>
                  <th>O(n²) Bubble Sort</th>
                  <th>O(n²) Dedup Ingenuo</th>
                  <th>Mejora Orden.</th>
                  <th>Mejora Dedup</th>
                </tr>
              </thead>
              <tbody>
                {benchmark.puntos.map((p) => (
                  <tr key={p.n}>
                    <td><strong>{p.n.toLocaleString('es-CO')}</strong></td>
                    <td className="tag-green">
                      {p.on.dedup_hash_ms} ms
                      <div style={{ fontSize: '0.7rem', color: '#A89078' }}>{p.on.dedup_hash_ops.toLocaleString()} ops</div>
                    </td>
                    <td className="tag-orange">
                      {p.onlogn.merge_sort_ms} ms
                      <div style={{ fontSize: '0.7rem', color: '#A89078' }}>{p.onlogn.merge_sort_ops.toLocaleString()} ops</div>
                    </td>
                    <td className="tag-red">
                      {p.on2.bubble_sort_ms} ms
                      <div style={{ fontSize: '0.7rem', color: '#A89078' }}>{p.on2.bubble_sort_ops.toLocaleString()} ops</div>
                    </td>
                    <td className="tag-red">
                      {p.on2.dedup_ingenuo_ms} ms
                      <div style={{ fontSize: '0.7rem', color: '#A89078' }}>{p.on2.dedup_ingenuo_ops.toLocaleString()} ops</div>
                    </td>
                    <td className="tag-green">
                      <strong>{p.optimizacion.aceleracion_ordenamiento_x}x</strong> ({p.optimizacion.reduccion_ops_ordenamiento_pct}%↓)
                    </td>
                    <td className="tag-green">
                      <strong>{p.optimizacion.aceleracion_dedup_x}x</strong> ({p.optimizacion.reduccion_ops_dedup_pct}%↓)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Documentación de optimizaciones */}
          <div className="grid-two" style={{ marginBottom: '1.75rem' }}>
            <div className="bigo-card">
              <div className="bigo-card-head">
                <span className="complexity-badge badge-logarithmic">OPTIMIZACIÓN #1</span>
                <h3>{benchmark.resumen_optimizacion.caso_1_ordenamiento.antes} → {benchmark.resumen_optimizacion.caso_1_ordenamiento.despues}</h3>
              </div>
              <p className="bigo-card-desc">{benchmark.resumen_optimizacion.caso_1_ordenamiento.conclusion}</p>
              <div className="bigo-card-footer">
                <span>Velocidad (N={benchmark.resumen_optimizacion.caso_1_ordenamiento.n_maximo}): <strong>{benchmark.resumen_optimizacion.caso_1_ordenamiento.mejora_velocidad}</strong></span>
                <span><strong>{benchmark.resumen_optimizacion.caso_1_ordenamiento.reduccion_operaciones}</strong></span>
              </div>
            </div>

            <div className="bigo-card">
              <div className="bigo-card-head">
                <span className="complexity-badge badge-constant">OPTIMIZACIÓN #2</span>
                <h3>{benchmark.resumen_optimizacion.caso_2_duplicados.antes} → {benchmark.resumen_optimizacion.caso_2_duplicados.despues}</h3>
              </div>
              <p className="bigo-card-desc">{benchmark.resumen_optimizacion.caso_2_duplicados.conclusion}</p>
              <div className="bigo-card-footer">
                <span>Velocidad (N={benchmark.resumen_optimizacion.caso_2_duplicados.n_maximo}): <strong>{benchmark.resumen_optimizacion.caso_2_duplicados.mejora_velocidad}</strong></span>
                <span><strong>{benchmark.resumen_optimizacion.caso_2_duplicados.reduccion_operaciones}</strong></span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Ejecutor interactivo puntual */}
      <div className="trace-box" style={{ marginBottom: '1.75rem' }}>
        <h3 style={{ marginTop: 0 }}>Laboratorio Interactivo de Algoritmos sobre Datos Reales</h3>
        <div className="form-row" style={{ marginBottom: '0.75rem' }}>
          <select value={algoritmoSel} onChange={(e) => setAlgoritmoSel(e.target.value)}>
            <option value="comparar_ordenamiento">Comparar Bubble Sort O(n²) vs Merge Sort por Fecha O(n log n)</option>
            <option value="comparar_duplicados">Comparar Detección Duplicados O(n²) vs Hash Set O(n)</option>
            <option value="busqueda_lineal">Búsqueda Lineal de Operación por ID O(n)</option>
            <option value="suma_ventas">Suma Total de Ventas O(n)</option>
            <option value="conteo_clientes">Conteo de Pedidos por Cliente O(n)</option>
            <option value="normalizar_strings">Normalizar y Unificar Strings O(n)</option>
          </select>
          <button className="btn btn-accent" onClick={ejecutarAlgoritmoPuntual}>
            Ejecutar Algoritmo
          </button>
        </div>
        {resultadoAlgo !== null && (
          <pre
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--rule)',
              borderRadius: 8,
              padding: '0.85rem',
              overflowX: 'auto',
              fontSize: '0.76rem',
              maxHeight: '280px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {JSON.stringify(resultadoAlgo, null, 2)}
          </pre>
        )}
      </div>

      {/* Patrones sobre grandes volúmenes */}
      {patrones && (
        <div className="grid-two">
          <div>
            <h3 className="section-subtitle">Ranking de Ítems Más Vendidos</h3>
            <table className="bigo-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Ítem</th>
                  <th>Uds</th>
                  <th>Ingresos</th>
                </tr>
              </thead>
              <tbody>
                {patrones.ranking_items.items.map((it, idx) => (
                  <tr key={it.item_id}>
                    <td>#{idx + 1}</td>
                    <td>{it.nombre}</td>
                    <td className="tag-orange">{it.unidades_vendidas}</td>
                    <td>{fmtCOP(it.ingresos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="section-subtitle">Patrones de Horarios (0–23h) &amp; Montos</h3>
            <div className="trace-box" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4, marginBottom: '1rem' }}>
              {patrones.patrones.horarios.map((h) => {
                const maxH = Math.max(1, ...patrones.patrones.horarios.map((x) => x.operaciones));
                const intensity = h.operaciones / maxH;
                return (
                  <div
                    key={h.hora}
                    title={`${h.hora}:00h — ${h.operaciones} ops · ${fmtCOP(h.ventas)}`}
                    style={{
                      aspectRatio: '1',
                      borderRadius: 4,
                      background: `rgba(221, 161, 94, ${0.08 + intensity * 0.85})`,
                      border: '1px solid var(--rule)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.65rem',
                    }}
                  >
                    {h.hora}
                  </div>
                );
              })}
            </div>
            <div className="stat-grid">
              <div className="stat"><span className="stat-label">&lt; $25k</span><span className="stat-value">{patrones.patrones.rangos_monto.bajo_lt_25k}</span></div>
              <div className="stat"><span className="stat-label">$25k–$60k</span><span className="stat-value">{patrones.patrones.rangos_monto.medio_25k_60k}</span></div>
              <div className="stat"><span className="stat-label">$60k–$120k</span><span className="stat-value">{patrones.patrones.rangos_monto.alto_60k_120k}</span></div>
              <div className="stat"><span className="stat-label">&gt; $120k</span><span className="stat-value highlight-rust">{patrones.patrones.rangos_monto.muy_alto_gt_120k}</span></div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

