import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../services/api.service';

interface BloqueIntegridad {
  id: number;
  referencia: string;
  valido: boolean;
  enlace_previo_valido: boolean;
  hash_contenido_valido: boolean;
  comprobante_valido?: boolean;
  hash_anterior: string;
  hash_actual: string;
  motivos: string[];
  fecha: string;
  monto: number;
}

interface ReporteIntegridad {
  integra_global: boolean;
  verificado_en: string;
  facturas: {
    integra: boolean;
    total_bloques: number;
    bloques_validos: number;
    bloques_alterados: number;
    bloques: BloqueIntegridad[];
  };
  pagos: {
    integra: boolean;
    total_bloques: number;
    bloques_validos: number;
    bloques_alterados: number;
    bloques: BloqueIntegridad[];
  };
  pedidos: {
    total: number;
    validos: number;
    alterados: number;
    integra: boolean;
  };
}

interface ReporteCalidadHistorico {
  id: number;
  modulo: string;
  total_registros: number;
  registros_validos: number;
  registros_limpiados: number;
  duplicados_detectados: number;
  registros_rechazados: number;
  puntaje_calidad: number;
  fecha_creacion: string;
}

const LOTE_SUCIO_ITEMS = [
  { nombre: '  bandeja   paisa tradicional ', categoria: 'platos   FUERTES', precio: '$ 38.000', stock: 25 },
  { nombre: 'Bandeja Paisa Tradicional', categoria: 'Platos Fuertes', precio: '38000', stock: 10 },
  { nombre: 'ajiaco santafereño', categoria: 'SOPAS tradicionales', precio: '32,000 COP', stock: 18 },
  { nombre: 'Empanada Corrupta', categoria: 'Antojos', precio: '-5000', stock: 10 },
  { nombre: '', categoria: 'Postres', precio: '12000', stock: 5 },
  { nombre: 'limonada de COCO natural', categoria: 'bebidas típicas', precio: '12.000', stock: 40 },
];

export const IntegridadCalidad: React.FC = () => {
  const { tieneRol, tienePermiso } = useAuth();
  const puedeSimular = tieneRol('admin', 'gerente');
  const puedeAuditarCalidad = tienePermiso('calidad:ejecutar');

  const [tab, setTab] = useState<'integridad' | 'calidad'>('integridad');
  const [integridad, setIntegridad] = useState<ReporteIntegridad | null>(null);
  const [reportesCalidad, setReportesCalidad] = useState<ReporteCalidadHistorico[]>([]);
  const [auditoriaActual, setAuditoriaActual] = useState<{
    reporte: ReporteCalidadHistorico;
    hallazgos: Array<{ modulo: string; tipo: string; severidad: string; detalle: string }>;
  } | null>(null);

  const [loteJson, setLoteJson] = useState(() => JSON.stringify(LOTE_SUCIO_ITEMS, null, 2));
  const [moduloLote, setModuloLote] = useState<'items' | 'usuarios' | 'operaciones'>('items');
  const [resultadoLote, setResultadoLote] = useState<{
    total_registros: number;
    registros_validos: number;
    registros_limpiados: number;
    duplicados_detectados: number;
    registros_rechazados: number;
    puntaje_calidad: number;
    problemas: Array<{ indice: number; tipo: string; motivos: string[]; cambios?: Array<{ campo: string; antes: unknown; despues: unknown; regla: string }> }>;
  } | null>(null);

  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cargarIntegridad() {
    setError(null);
    try {
      const res = await apiRequest<ReporteIntegridad>('/api/analitica/integridad/verificar');
      setIntegridad(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error verificando integridad');
    }
  }

  async function cargarReportesCalidad() {
    if (!tienePermiso('calidad:ver')) return;
    try {
      const res = await apiRequest<{ reportes: ReporteCalidadHistorico[] }>('/api/analitica/calidad/reportes');
      setReportesCalidad(res.reportes);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    cargarIntegridad();
    cargarReportesCalidad();
  }, []);

  async function simularAlteracion(entidad: 'facturas' | 'pagos') {
    setMensaje(null);
    setError(null);
    try {
      const res = await apiRequest<{ mensaje: string; reporte: ReporteIntegridad }>(
        '/api/analitica/integridad/simular-alteracion',
        { method: 'POST', body: { entidad } }
      );
      setMensaje(res.mensaje);
      setIntegridad(res.reporte);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error simulando alteración');
    }
  }

  async function repararCadenas() {
    setMensaje(null);
    setError(null);
    try {
      const res = await apiRequest<{ mensaje: string; reporte: ReporteIntegridad }>(
        '/api/analitica/integridad/reparar',
        { method: 'POST' }
      );
      setMensaje(res.mensaje);
      setIntegridad(res.reporte);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error reparando cadenas');
    }
  }

  async function ejecutarAuditoriaBD() {
    setMensaje(null);
    setError(null);
    try {
      const res = await apiRequest<{
        reporte: ReporteCalidadHistorico;
        hallazgos: Array<{ modulo: string; tipo: string; severidad: string; detalle: string }>;
      }>('/api/analitica/calidad/auditar', { method: 'POST' });
      setAuditoriaActual(res);
      setMensaje(`Auditoría completada. Puntaje global de calidad: ${res.reporte.puntaje_calidad}%.`);
      cargarReportesCalidad();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error ejecutando auditoría');
    }
  }

  async function limpiarLoteInteractivo() {
    setMensaje(null);
    setError(null);
    try {
      const registros = JSON.parse(loteJson);
      const res = await apiRequest<typeof resultadoLote>('/api/analitica/calidad/limpiar-lote', {
        method: 'POST',
        body: { modulo: moduloLote, registros },
      });
      setResultadoLote(res);
      setMensaje(`Lote procesado: ${res?.registros_validos} válidos, ${res?.registros_limpiados} corregidos, ${res?.duplicados_detectados} duplicados, ${res?.registros_rechazados} rechazados.`);
      cargarReportesCalidad();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'JSON inválido o error en limpieza');
    }
  }

  return (
    <section>
      <div className="panel-heading">
        <h1>Integridad &amp; Calidad de Datos</h1>
        <p>
          Verificación de integridad encadenada de facturas, pagos y comprobantes, junto con validación, normalización
          automática y reporte de calidad de datos.
        </p>
      </div>

      <div className="scenarios-buttons" style={{ marginBottom: '1.5rem' }}>
        <button className={`modal-filter-btn ${tab === 'integridad' ? 'active' : ''}`} onClick={() => setTab('integridad')}>
          🔗 Integridad de Registros
        </button>
        <button className={`modal-filter-btn ${tab === 'calidad' ? 'active' : ''}`} onClick={() => setTab('calidad')}>
          🧹 Limpieza &amp; Calidad de Datos
        </button>
      </div>

      {mensaje && (
        <div className="alert-success" style={{ marginBottom: '1rem' }}>
          {mensaje}
        </div>
      )}
      {error && (
        <div className="order-card-not-found" style={{ marginBottom: '1rem' }}>
          <span className="not-found-icon">⚠️</span>
          <div>{error}</div>
        </div>
      )}

      {/* TAB INTEGRIDAD */}
      {tab === 'integridad' && integridad && (
        <>
          <div className="trace-box" style={{ marginBottom: '1.5rem', borderColor: integridad.integra_global ? 'var(--sage)' : 'var(--rust)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem' }}>
              <div>
                <h2 style={{ margin: 0, color: integridad.integra_global ? 'var(--sage)' : '#ef4444' }}>
                  {integridad.integra_global
                    ? '✅ CADENA CRIPTOGRÁFICA 100% ÍNTEGRA'
                    : '🚨 ALTERACIÓN DETECTADA EN LA CADENA DE INTEGRIDAD'}
                </h2>
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.84rem', color: '#C9AD8F' }}>
                  Verificado en {new Date(integridad.verificado_en).toLocaleString('es-CO')} · Facturas válidas:{' '}
                  {integridad.facturas.bloques_validos}/{integridad.facturas.total_bloques} · Pagos válidos:{' '}
                  {integridad.pagos.bloques_validos}/{integridad.pagos.total_bloques} · Pedidos íntegros:{' '}
                  {integridad.pedidos.validos}/{integridad.pedidos.total}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="btn btn-accent btn-sm" onClick={cargarIntegridad}>
                  🔍 Re-verificar Cadena
                </button>
                {puedeSimular && (
                  <>
                    <button className="btn btn-ghost btn-sm" style={{ color: '#f59e0b' }} onClick={() => simularAlteracion('facturas')}>
                      🧪 Alterar Factura (Demo)
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ color: '#f59e0b' }} onClick={() => simularAlteracion('pagos')}>
                      🧪 Alterar Comprobante (Demo)
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--sage)' }} onClick={repararCadenas}>
                      🛠️ Reparar Cadenas
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <h3 className="section-subtitle">Cadena de Facturas ({integridad.facturas.total_bloques} bloques)</h3>
          <div style={{ overflowX: 'auto', marginBottom: '1.75rem' }}>
            <table className="bigo-table">
              <thead>
                <tr>
                  <th>Bloque</th>
                  <th>Estado</th>
                  <th>Monto</th>
                  <th>Hash Anterior → Hash Actual</th>
                  <th>Diagnóstico</th>
                </tr>
              </thead>
              <tbody>
                {integridad.facturas.bloques.map((b) => (
                  <tr key={b.id} style={{ background: b.valido ? undefined : 'rgba(166,61,46,0.18)' }}>
                    <td>
                      <strong>{b.referencia}</strong>
                    </td>
                    <td>
                      <span className={`order-status-badge ${b.valido ? 'status-entregado' : 'status-solicitado'}`}>
                        {b.valido ? 'VÁLIDO' : 'ALTERADO'}
                      </span>
                    </td>
                    <td>${b.monto.toLocaleString('es-CO')}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                      <div>Prev: {b.hash_anterior.slice(0, 16)}…</div>
                      <div style={{ color: b.valido ? 'var(--sage)' : '#ef4444' }}>Act: {b.hash_actual.slice(0, 18)}…</div>
                    </td>
                    <td style={{ fontSize: '0.78rem' }}>
                      {b.motivos.length > 0 ? b.motivos.join(' | ') : 'Sello HMAC y encadenamiento verificados'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="section-subtitle">Cadena de Pagos &amp; Comprobantes ({integridad.pagos.total_bloques} bloques)</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="bigo-table">
              <thead>
                <tr>
                  <th>Bloque</th>
                  <th>Integridad / Comprobante</th>
                  <th>Monto</th>
                  <th>Hash Actual</th>
                  <th>Diagnóstico</th>
                </tr>
              </thead>
              <tbody>
                {integridad.pagos.bloques.map((b) => (
                  <tr key={b.id} style={{ background: b.valido ? undefined : 'rgba(166,61,46,0.18)' }}>
                    <td>
                      <strong>{b.referencia}</strong>
                    </td>
                    <td>
                      <span className={`order-status-badge ${b.valido ? 'status-entregado' : 'status-solicitado'}`}>
                        {b.valido ? 'ÍNTEGRO' : 'CORRUPTO'}
                      </span>
                      <div style={{ fontSize: '0.72rem', marginTop: 3 }}>
                        Comprobante: {b.comprobante_valido ? '✅ Verificado' : '❌ Alterado'}
                      </div>
                    </td>
                    <td>${b.monto.toLocaleString('es-CO')}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>{b.hash_actual.slice(0, 18)}…</td>
                    <td style={{ fontSize: '0.78rem' }}>
                      {b.motivos.length > 0 ? b.motivos.join(' | ') : 'Pago y comprobante íntegros'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* TAB CALIDAD DE DATOS */}
      {tab === 'calidad' && (
        <>
          <div className="add-order-box" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 className="add-order-title">Auditoría Automática de Calidad</h2>
                <p className="add-order-subtitle">
                  Inspecciona usuarios, categorías, ítems, pedidos, facturas, pagos y transacciones en busca de
                  duplicados, descuadres aritméticos o datos sin normalizar.
                </p>
              </div>
              {puedeAuditarCalidad && (
                <button className="btn btn-accent" onClick={ejecutarAuditoriaBD}>
                  🧹 Ejecutar Auditoría
                </button>
              )}
            </div>

            {auditoriaActual && (
              <div style={{ marginTop: '1rem' }}>
                <div className="stat-grid" style={{ marginBottom: '1rem' }}>
                  <div className="stat">
                    <span className="stat-label">Puntaje Calidad</span>
                    <span className="stat-value highlight-sage">{auditoriaActual.reporte.puntaje_calidad}%</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Inspeccionados</span>
                    <span className="stat-value">{auditoriaActual.reporte.total_registros}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Normalizados</span>
                    <span className="stat-value highlight-accent">{auditoriaActual.reporte.registros_limpiados}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Duplicados</span>
                    <span className="stat-value highlight-rust">{auditoriaActual.reporte.duplicados_detectados}</span>
                  </div>
                </div>
                {auditoriaActual.hallazgos.length > 0 && (
                  <table className="bigo-table">
                    <thead>
                      <tr>
                        <th>Módulo</th>
                        <th>Tipo</th>
                        <th>Severidad</th>
                        <th>Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditoriaActual.hallazgos.slice(0, 15).map((h, i) => (
                        <tr key={i}>
                          <td>{h.modulo}</td>
                          <td>{h.tipo}</td>
                          <td className={h.severidad === 'alta' ? 'tag-red' : 'tag-orange'}>{h.severidad}</td>
                          <td style={{ fontSize: '0.82rem' }}>{h.detalle}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          {/* Limpiador interactivo de lotes sucios */}
          {puedeAuditarCalidad && (
            <div className="trace-box" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginTop: 0 }}>Limpiador Interactivo de Lotes con Datos Sucios</h3>
              <p style={{ fontSize: '0.84rem', color: '#C9AD8F' }}>
                Prueba la sanitización automática de precios mal escritos (<code>"$ 38.000"</code>), categorías
                inconsistentes, ítems duplicados y registros corruptos.
              </p>
              <div className="form-row" style={{ marginBottom: '0.75rem' }}>
                <select value={moduloLote} onChange={(e) => setModuloLote(e.target.value as 'items' | 'usuarios' | 'operaciones')}>
                  <option value="items">Módulo: Ítems y Categorías</option>
                  <option value="usuarios">Módulo: Usuarios / Clientes</option>
                  <option value="operaciones">Módulo: Operaciones / Pagos</option>
                </select>
                <button className="btn btn-accent" onClick={limpiarLoteInteractivo}>
                  Validar y Limpiar Lote
                </button>
              </div>
              <textarea
                rows={8}
                value={loteJson}
                onChange={(e) => setLoteJson(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg)',
                  color: 'var(--paper)',
                  border: '1px solid var(--rule)',
                  borderRadius: 8,
                  padding: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.78rem',
                }}
              />

              {resultadoLote && (
                <div style={{ marginTop: '1rem' }}>
                  <div className="stat-grid" style={{ marginBottom: '0.9rem' }}>
                    <div className="stat"><span className="stat-label">Puntaje</span><span className="stat-value highlight-accent">{resultadoLote.puntaje_calidad}%</span></div>
                    <div className="stat"><span className="stat-label">Válidos</span><span className="stat-value highlight-sage">{resultadoLote.registros_validos}</span></div>
                    <div className="stat"><span className="stat-label">Limpiados</span><span className="stat-value">{resultadoLote.registros_limpiados}</span></div>
                    <div className="stat"><span className="stat-label">Duplicados</span><span className="stat-value highlight-rust">{resultadoLote.duplicados_detectados}</span></div>
                    <div className="stat"><span className="stat-label">Rechazados</span><span className="stat-value highlight-rust">{resultadoLote.registros_rechazados}</span></div>
                  </div>
                  <table className="bigo-table">
                    <thead>
                      <tr>
                        <th>Fila</th>
                        <th>Clasificación</th>
                        <th>Detalle / Transformaciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultadoLote.problemas.map((p, i) => (
                        <tr key={i}>
                          <td>#{p.indice + 1}</td>
                          <td className={p.tipo === 'limpiado' ? 'tag-green' : 'tag-red'}>{p.tipo}</td>
                          <td style={{ fontSize: '0.8rem' }}>
                            <div>{p.motivos.join('; ')}</div>
                            {p.cambios?.map((c, j) => (
                              <div key={j} style={{ color: '#DDA15E', fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}>
                                • {c.campo}: "{String(c.antes)}" → "{String(c.despues)}" ({c.regla})
                              </div>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Historial de reportes */}
          <h3 className="section-subtitle">Historial de Reportes de Calidad</h3>
          <table className="bigo-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Módulo</th>
                <th>Total</th>
                <th>Válidos</th>
                <th>Limpiados</th>
                <th>Duplicados</th>
                <th>Rechazados</th>
                <th>Puntaje</th>
              </tr>
            </thead>
            <tbody>
              {reportesCalidad.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontSize: '0.78rem' }}>{new Date(r.fecha_creacion).toLocaleString('es-CO')}</td>
                  <td>{r.modulo}</td>
                  <td>{r.total_registros}</td>
                  <td>{r.registros_validos}</td>
                  <td>{r.registros_limpiados}</td>
                  <td>{r.duplicados_detectados}</td>
                  <td>{r.registros_rechazados}</td>
                  <td className="tag-green">{Number(r.puntaje_calidad).toFixed(1)}%</td>
                </tr>
              ))}
              {reportesCalidad.length === 0 && (
                <tr>
                  <td colSpan={8}>Sin reportes registrados aún. Ejecuta una auditoría arriba.</td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
};

