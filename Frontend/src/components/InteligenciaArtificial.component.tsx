import React, { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../services/api.service';

interface ModeloInfoDisco {
  nombre: string;
  guardado_en_disco: boolean;
  ruta: string | null;
  entrenado_en: string | null;
  muestras_originales: number;
  muestras_con_aumento: number;
  metricas: Record<string, number> | null;
}

interface PerfilUsuarioEstadistico {
  usuario_id: number;
  nombre: string;
  email: string;
  rol: string;
  total_operaciones: number;
  anulaciones: number;
  tasa_anulaciones_pct: number;
  descuento_maximo_pct: number;
  descuentos_abusivos: number;
  estadisticas_monto: {
    media: number;
    mediana: number;
    q1: number;
    q2: number;
    q3: number;
    iqr: number;
    limite_atipico_superior: number;
    valores_atipicos: number;
    max_zscore: number;
  };
  score_anomalia: number;
  nivel_alerta: 'normal' | 'precaucion' | 'sospechoso' | 'critico';
  motivos_alerta: string[];
}

interface RegresionSSResponse {
  herramienta: string;
  dias_analizados: number;
  ecuacion_ventas: { pendiente_m: number; intercepto_b: number; r2: number; tendencia: string };
  ecuacion_demanda: { pendiente_m: number; intercepto_b: number; r2: number };
  predicciones: Array<{ fecha: string; ventas_estimadas: number; demanda_pedidos_estimada: number }>;
}

function fmtCOP(v: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v || 0);
}

export const InteligenciaArtificial: React.FC = () => {
  const { tienePermiso } = useAuth();
  const puedeEntrenar = tienePermiso('ia:entrenar');

  const [tab, setTab] = useState<'keras' | 'estadistica' | 'regresion'>('keras');
  const [modelos, setModelos] = useState<ModeloInfoDisco[]>([]);
  const [perfiles, setPerfiles] = useState<PerfilUsuarioEstadistico[]>([]);
  const [globalesSS, setGlobalesSS] = useState<{
    media_global: number;
    mediana_global: number;
    q1_global: number;
    q3_global: number;
    iqr_global: number;
    limite_atipico_global: number;
  } | null>(null);
  const [regresionSS, setRegresionSS] = useState<RegresionSSResponse | null>(null);

  const [entrenando, setEntrenando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form clasificador de fraude Keras
  const [monto, setMonto] = useState('240000');
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 16));
  const [metodo, setMetodo] = useState('tarjeta_credito');
  const [canal, setCanal] = useState('web');
  const [firmaValida, setFirmaValida] = useState(true);
  const [frecuencia, setFrecuencia] = useState('4');
  const [promedioUsr, setPromedioUsr] = useState('42000');
  const [descuentoPct, setDescuentoPct] = useState('25');
  const [resultadoFraude, setResultadoFraude] = useState<{
    clasificacion: 'normal' | 'fraudulenta';
    probabilidad_fraude: number;
    nivel_riesgo: string;
    factores_detectados: string[];
  } | null>(null);
  const [resultadoMonto, setResultadoMonto] = useState<{
    monto_esperado_cop: number;
    monto_real_cop: number | null;
    desviacion_pct: number | null;
    alerta_desviacion: boolean;
  } | null>(null);

  async function cargarTodo() {
    setError(null);
    try {
      const [estRes, ssRes, regRes] = await Promise.all([
        apiRequest<{ modelos: ModeloInfoDisco[] }>('/api/analitica/ia/estado'),
        apiRequest<{
          perfiles: PerfilUsuarioEstadistico[];
          estadisticas_globales: NonNullable<typeof globalesSS>;
        }>('/api/analitica/ia/estadisticas-usuarios'),
        apiRequest<RegresionSSResponse>('/api/analitica/ia/regresion-demanda?dias=90&futuro=14'),
      ]);
      setModelos(estRes.modelos);
      setPerfiles(ssRes.perfiles);
      setGlobalesSS(ssRes.estadisticas_globales);
      setRegresionSS(regRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando módulo de IA');
    }
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  async function entrenarTodosLosModelos() {
    setEntrenando(true);
    setMensaje(null);
    setError(null);
    try {
      const res = await apiRequest<{
        mensaje: string;
        estado_modelos: { modelos: ModeloInfoDisco[] };
      }>('/api/analitica/ia/entrenar-todo', {
        method: 'POST',
        body: { epochs: 35, dias: 90 },
      });
      setModelos(res.estado_modelos.modelos);
      setMensaje(res.mensaje);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error entrenando modelos Keras/TensorFlow');
    } finally {
      setEntrenando(false);
    }
  }

  async function evaluarOperacionIA(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const fechaObj = new Date(fecha);
      const [fraude, montoEsp] = await Promise.all([
        apiRequest<NonNullable<typeof resultadoFraude>>('/api/analitica/ia/clasificar-fraude', {
          method: 'POST',
          body: {
            monto: Number(monto),
            fecha: fechaObj.toISOString(),
            metodo_pago: metodo,
            firma_valida: firmaValida,
            frecuencia_ventana: Number(frecuencia),
            promedio_usuario: Number(promedioUsr),
            descuento_pct: Number(descuentoPct),
            canal,
          },
        }),
        apiRequest<NonNullable<typeof resultadoMonto>>('/api/analitica/ia/predecir-monto', {
          method: 'POST',
          body: {
            promedio_usuario: Number(promedioUsr),
            hora: fechaObj.getHours(),
            dia_semana: fechaObj.getDay(),
            canal,
            metodo_pago: metodo,
            cantidad_items: 2,
            monto_real: Number(monto),
          },
        }),
      ]);
      setResultadoFraude(fraude);
      setResultadoMonto(montoEsp);
      cargarTodo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error evaluando operación');
    }
  }

  const NOMBRES_MODELO: Record<string, string> = {
    'fraud-classifier': 'Clasificador de Fraude',
    'amount-regressor': 'Estimación de Monto Esperado',
    'demand-predictor': 'Pronóstico de Demanda',
  };

  return (
    <section>
      <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>Inteligencia Artificial &amp; Análisis Predictivo</h1>
          <p>
            Clasificación automática de operaciones (<strong>normal vs fraudulenta</strong>), estimación de monto
            esperado, detección de anomalías por usuario y pronóstico de demanda.
          </p>
        </div>
        {puedeEntrenar && (
          <button className="btn btn-accent" onClick={entrenarTodosLosModelos} disabled={entrenando}>
            {entrenando ? 'Actualizando modelos…' : 'Actualizar Modelos Predictivos'}
          </button>
        )}
      </div>

      <div className="scenarios-buttons" style={{ marginBottom: '1.5rem' }}>
        <button className={`modal-filter-btn ${tab === 'keras' ? 'active' : ''}`} onClick={() => setTab('keras')}>
          Detección de Fraude &amp; Monto
        </button>
        <button className={`modal-filter-btn ${tab === 'estadistica' ? 'active' : ''}`} onClick={() => setTab('estadistica')}>
          Anomalías por Usuario
        </button>
        <button className={`modal-filter-btn ${tab === 'regresion' ? 'active' : ''}`} onClick={() => setTab('regresion')}>
          Tendencia de Demanda
        </button>
      </div>

      {mensaje && <div className="alert-success" style={{ marginBottom: '1rem' }}>{mensaje}</div>}
      {error && (
        <div className="order-card-not-found" style={{ marginBottom: '1rem' }}>
          <span className="not-found-icon">⚠️</span>
          <div>{error}</div>
        </div>
      )}

      {/* TAB 1: FRAUDE Y MONTO ESPERADO */}
      {tab === 'keras' && (
        <>
          <div className="bigo-cards-grid" style={{ marginBottom: '1.5rem' }}>
            {modelos.map((m) => (
              <div className="bigo-card" key={m.nombre}>
                <div className="bigo-card-head">
                  <span className={`complexity-badge ${m.guardado_en_disco ? 'badge-logarithmic' : 'badge-linear'}`}>
                    {m.guardado_en_disco ? 'ACTIVO' : 'PENDIENTE'}
                  </span>
                  <h3>{NOMBRES_MODELO[m.nombre] ?? m.nombre}</h3>
                </div>
                <p className="bigo-card-desc">
                  {m.entrenado_en
                    ? `Última actualización: ${new Date(m.entrenado_en).toLocaleString('es-CO')}`
                    : 'Pendiente de entrenamiento inicial.'}
                </p>
                <div className="bigo-card-footer" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.2rem' }}>
                  <span>Registros analizados: <strong>{m.muestras_con_aumento}</strong></span>
                  {m.metricas && (
                    <span>
                      Precisión / Métricas:{' '}
                      <strong>
                        {Object.entries(m.metricas)
                          .map(([k, v]) => `${k}=${v}`)
                          .join(' · ')}
                      </strong>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="add-order-box">
            <h2 className="add-order-title">Evaluador de Operaciones Sospechosas</h2>
            <p className="add-order-subtitle">
              Analiza una operación en tiempo real para clasificarla como normal o fraudulenta y estimar su monto esperado.
            </p>
            <form className="add-order-form" onSubmit={evaluarOperacionIA}>
              <div className="form-grid-inputs">
                <div className="field">
                  <label>Monto (COP)</label>
                  <input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} required />
                </div>
                <div className="field">
                  <label>Promedio histórico usuario</label>
                  <input type="number" value={promedioUsr} onChange={(e) => setPromedioUsr(e.target.value)} required />
                </div>
                <div className="field">
                  <label>Fecha y hora</label>
                  <input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
                </div>
                <div className="field">
                  <label>Método de pago</label>
                  <select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                    <option value="efectivo">Efectivo</option>
                    <option value="tarjeta_debito">Tarjeta Débito</option>
                    <option value="tarjeta_credito">Tarjeta Crédito</option>
                    <option value="nequi">Nequi</option>
                    <option value="daviplata">Daviplata</option>
                    <option value="transferencia">Transferencia</option>
                  </select>
                </div>
                <div className="field">
                  <label>Canal</label>
                  <select value={canal} onChange={(e) => setCanal(e.target.value)}>
                    <option value="presencial">Presencial</option>
                    <option value="web">Web</option>
                    <option value="app">App</option>
                    <option value="domicilio">Domicilio</option>
                  </select>
                </div>
                <div className="field">
                  <label>Frecuencia reciente</label>
                  <input type="number" min={1} value={frecuencia} onChange={(e) => setFrecuencia(e.target.value)} />
                </div>
                <div className="field">
                  <label>Descuento aplicado (%)</label>
                  <input type="number" min={0} max={90} value={descuentoPct} onChange={(e) => setDescuentoPct(e.target.value)} />
                </div>
                <div className="field">
                  <label>Validación de firma</label>
                  <select value={firmaValida ? '1' : '0'} onChange={(e) => setFirmaValida(e.target.value === '1')}>
                    <option value="1">Válida</option>
                    <option value="0">Inválida / Alterada</option>
                  </select>
                </div>
              </div>
              <div className="form-actions" style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <button className="btn btn-accent" type="submit">
                  Evaluar Operación
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setMonto('38000');
                    setFrecuencia('1');
                    setDescuentoPct('0');
                    setFirmaValida(true);
                    setCanal('presencial');
                  }}
                >
                  Cargar Caso Normal
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ color: '#ef4444' }}
                  onClick={() => {
                    setMonto('390000');
                    setFrecuencia('6');
                    setDescuentoPct('45');
                    setFirmaValida(false);
                    setCanal('web');
                  }}
                >
                  Cargar Caso Fraudulento
                </button>
              </div>
            </form>

            {resultadoFraude && (
              <div className="grid-two" style={{ marginTop: '1.25rem' }}>
                <div
                  className="bigo-card"
                  style={{
                    borderColor: resultadoFraude.clasificacion === 'fraudulenta' ? '#ef4444' : 'var(--sage)',
                  }}
                >
                  <div className="bigo-card-head">
                    <span
                      className={`complexity-badge ${
                        resultadoFraude.clasificacion === 'fraudulenta' ? 'badge-linear' : 'badge-logarithmic'
                      }`}
                    >
                      {resultadoFraude.clasificacion.toUpperCase()}
                    </span>
                    <h3>Veredicto de Clasificación</h3>
                  </div>
                  <div className="bigo-card-stats">
                    <div className="stat-unit">
                      <span className="stat-label">Probabilidad fraude</span>
                      <span className="stat-value">{(resultadoFraude.probabilidad_fraude * 100).toFixed(2)}%</span>
                    </div>
                    <div className="stat-unit">
                      <span className="stat-label">Nivel riesgo</span>
                      <span className="stat-value" style={{ textTransform: 'uppercase' }}>{resultadoFraude.nivel_riesgo}</span>
                    </div>
                  </div>
                  <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem', fontSize: '0.82rem', color: '#E4D3B8' }}>
                    {resultadoFraude.factores_detectados.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>

                {resultadoMonto && (
                  <div className="bigo-card">
                    <div className="bigo-card-head">
                      <span className="complexity-badge badge-constant">ESTIMACIÓN</span>
                      <h3>Monto Esperado vs Real</h3>
                    </div>
                    <div className="bigo-card-stats">
                      <div className="stat-unit">
                        <span className="stat-label">Monto esperado</span>
                        <span className="stat-value highlight-accent">{fmtCOP(resultadoMonto.monto_esperado_cop)}</span>
                      </div>
                      <div className="stat-unit">
                        <span className="stat-label">Desviación</span>
                        <span className={`stat-value ${resultadoMonto.alerta_desviacion ? 'highlight-rust' : 'highlight-sage'}`}>
                          {resultadoMonto.desviacion_pct !== null ? `${resultadoMonto.desviacion_pct > 0 ? '+' : ''}${resultadoMonto.desviacion_pct}%` : '—'}
                        </span>
                      </div>
                    </div>
                    <p className="bigo-card-desc">
                      {resultadoMonto.alerta_desviacion
                        ? '⚠️ Desviación significativa respecto al monto esperado por el patrón del usuario, canal y hora.'
                        : '✅ El monto se mantiene dentro de la banda esperada por la red de regresión.'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* TAB 2: SIMPLE STATISTICS — ANOMALÍAS POR USUARIO */}
      {tab === 'estadistica' && (
        <>
          {globalesSS && (
            <div className="trace-box" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginTop: 0 }}>Cuartiles Globales de Consumo</h3>
              <div className="stat-grid">
                <div className="stat"><span className="stat-label">Media</span><span className="stat-value">{fmtCOP(globalesSS.media_global)}</span></div>
                <div className="stat"><span className="stat-label">Q1 (25%)</span><span className="stat-value">{fmtCOP(globalesSS.q1_global)}</span></div>
                <div className="stat"><span className="stat-label">Mediana Q2</span><span className="stat-value">{fmtCOP(globalesSS.mediana_global)}</span></div>
                <div className="stat"><span className="stat-label">Q3 (75%)</span><span className="stat-value">{fmtCOP(globalesSS.q3_global)}</span></div>
                <div className="stat"><span className="stat-label">IQR (Q3-Q1)</span><span className="stat-value highlight-accent">{fmtCOP(globalesSS.iqr_global)}</span></div>
                <div className="stat"><span className="stat-label">Límite Tukey</span><span className="stat-value highlight-rust">{fmtCOP(globalesSS.limite_atipico_global)}</span></div>
              </div>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table className="bigo-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Cuartiles (Q1 / Med / Q3)</th>
                  <th>Atípicos / Z-max</th>
                  <th>Anulaciones</th>
                  <th>Desc. Máx</th>
                  <th>Score &amp; Alerta</th>
                </tr>
              </thead>
              <tbody>
                {perfiles.map((p) => (
                  <tr key={p.usuario_id}>
                    <td>
                      <strong>{p.nombre}</strong>
                      <div style={{ fontSize: '0.73rem', color: '#A89078' }}>{p.total_operaciones} txns · {p.rol}</div>
                    </td>
                    <td style={{ fontSize: '0.76rem', fontFamily: 'var(--font-mono)' }}>
                      {fmtCOP(p.estadisticas_monto.q1)} / {fmtCOP(p.estadisticas_monto.mediana)} / {fmtCOP(p.estadisticas_monto.q3)}
                    </td>
                    <td>
                      {p.estadisticas_monto.valores_atipicos} <small style={{ color: '#A89078' }}>(Z={p.estadisticas_monto.max_zscore})</small>
                    </td>
                    <td>
                      {p.anulaciones} ({p.tasa_anulaciones_pct}%)
                    </td>
                    <td className={p.descuentos_abusivos > 0 ? 'tag-red' : ''}>{p.descuento_maximo_pct}%</td>
                    <td>
                      <span
                        className={`order-status-badge ${
                          p.nivel_alerta === 'critico' || p.nivel_alerta === 'sospechoso'
                            ? 'status-solicitado'
                            : p.nivel_alerta === 'precaucion'
                            ? 'status-en-proceso'
                            : 'status-entregado'
                        }`}
                      >
                        {p.score_anomalia}/100 · {p.nivel_alerta.toUpperCase()}
                      </span>
                      <div style={{ fontSize: '0.72rem', color: '#C9AD8F', marginTop: 3 }}>
                        {p.motivos_alerta[0]}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* TAB 3: REGRESIÓN LINEAL SIMPLE DE DEMANDA */}
      {tab === 'regresion' && regresionSS && (
        <>
          <div className="trace-box" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginTop: 0 }}>{regresionSS.herramienta}</h3>
            <div className="stat-grid">
              <div className="stat">
                <span className="stat-label">Ecuación Ventas</span>
                <span className="stat-value" style={{ fontSize: '0.92rem', fontFamily: 'var(--font-mono)' }}>
                  y = {regresionSS.ecuacion_ventas.pendiente_m}x + {regresionSS.ecuacion_ventas.intercepto_b}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">R² Ventas</span>
                <span className="stat-value highlight-accent">{regresionSS.ecuacion_ventas.r2}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Tendencia</span>
                <span className="stat-value highlight-sage" style={{ textTransform: 'uppercase' }}>
                  {regresionSS.ecuacion_ventas.tendencia}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Pendiente Pedidos/día</span>
                <span className="stat-value">{regresionSS.ecuacion_demanda.pendiente_m}</span>
              </div>
            </div>
          </div>

          <table className="bigo-table">
            <thead>
              <tr>
                <th>Día</th>
                <th>Fecha</th>
                <th>Ventas Estimadas (COP)</th>
                <th>Demanda Estimada (Pedidos)</th>
              </tr>
            </thead>
            <tbody>
              {regresionSS.predicciones.map((p, i) => (
                <tr key={p.fecha}>
                  <td>+{i + 1}d</td>
                  <td>{p.fecha}</td>
                  <td className="tag-orange">{fmtCOP(p.ventas_estimadas)}</td>
                  <td className="tag-green">{p.demanda_pedidos_estimada} pedidos</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
};

