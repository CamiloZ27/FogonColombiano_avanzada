import React, { FormEvent, useEffect, useState } from 'react';
import { RolCodigo, useAuth } from '../context/AuthContext';
import { apiRequest } from '../services/api.service';

interface RolSistema {
  id: number;
  codigo: RolCodigo;
  nombre: string;
  descripcion: string;
  permisos: string[];
  nivel_acceso: number;
  es_sistema: boolean;
  editable: boolean;
  usuarios_asignados: number;
}

interface UsuarioAdmin {
  id: number;
  nombre: string;
  email: string;
  estado: string;
  rol: RolCodigo;
  rol_nombre: string;
  documento_enmascarado: string | null;
  telefono_enmascarado: string | null;
  tiene_password_bcrypt: boolean;
  tiene_documento_bcrypt: boolean;
  tiene_telefono_bcrypt: boolean;
  tiene_pin_bcrypt: boolean;
  ultimo_login: string | null;
}

interface ParametroSistema {
  clave: string;
  valor: string;
  tipo: string;
  descripcion: string;
}

interface EventoAuditoria {
  id: number;
  accion: string;
  recurso: string;
  usuario_nombre: string | null;
  rol: string | null;
  detalle: Record<string, unknown>;
  ip: string;
  fecha_creacion: string;
}

export const AdministracionRBAC: React.FC = () => {
  const { usuario, tieneRol } = useAuth();
  const esAdmin = tieneRol('admin');

  const [tab, setTab] = useState<'usuarios' | 'roles' | 'config' | 'auditoria'>('usuarios');
  const [roles, setRoles] = useState<RolSistema[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [config, setConfig] = useState<ParametroSistema[]>([]);
  const [auditoria, setAuditoria] = useState<EventoAuditoria[]>([]);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Formulario nuevo usuario
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rolNuevo, setRolNuevo] = useState<RolCodigo>('cocinero');
  const [documento, setDocumento] = useState('');
  const [telefono, setTelefono] = useState('');
  const [pin, setPin] = useState('');

  // Verificador bcrypt en vivo
  const [campoVerif, setCampoVerif] = useState<'documento' | 'telefono' | 'pin'>('documento');
  const [valorVerif, setValorVerif] = useState('');
  const [resVerif, setResVerif] = useState<string | null>(null);

  async function cargarTodo() {
    setError(null);
    try {
      const [rRes, uRes, cRes, aRes] = await Promise.all([
        apiRequest<{ roles: RolSistema[] }>('/api/admin/roles'),
        apiRequest<{ usuarios: UsuarioAdmin[] }>('/api/admin/usuarios'),
        apiRequest<{ configuracion: ParametroSistema[] }>('/api/admin/configuracion'),
        apiRequest<{ eventos: EventoAuditoria[] }>('/api/admin/auditoria?limite=40'),
      ]);
      setRoles(rRes.roles);
      setUsuarios(uRes.usuarios);
      setConfig(cRes.configuracion);
      setAuditoria(aRes.eventos);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando administración RBAC');
    }
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  async function handleCrearUsuario(e: FormEvent) {
    e.preventDefault();
    setMensaje(null);
    setError(null);
    try {
      const res = await apiRequest<{ mensaje: string }>('/api/admin/usuarios', {
        method: 'POST',
        body: {
          nombre,
          email,
          password,
          rol: rolNuevo,
          documento,
          telefono,
          pin_autorizacion: pin,
        },
      });
      setMensaje(res.mensaje);
      setNombre('');
      setEmail('');
      setPassword('');
      setDocumento('');
      setTelefono('');
      setPin('');
      cargarTodo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creando usuario');
    }
  }

  async function cambiarRolUsuario(userId: number, nuevoRol: RolCodigo) {
    setMensaje(null);
    setError(null);
    try {
      const res = await apiRequest<{ mensaje: string }>(`/api/admin/usuarios/${userId}/rol`, {
        method: 'PATCH',
        body: { rol: nuevoRol },
      });
      setMensaje(res.mensaje);
      cargarTodo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cambiando rol');
    }
  }

  async function toggleEstadoUsuario(u: UsuarioAdmin) {
    setMensaje(null);
    setError(null);
    const nuevoEstado = u.estado === 'activo' ? 'inactivo' : 'activo';
    try {
      await apiRequest(`/api/admin/usuarios/${u.id}`, {
        method: 'PUT',
        body: { estado: nuevoEstado },
      });
      setMensaje(`Estado de ${u.email} cambiado a '${nuevoEstado}'.`);
      cargarTodo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error actualizando estado');
    }
  }

  async function guardarParametro(clave: string, valor: string) {
    setMensaje(null);
    setError(null);
    try {
      await apiRequest(`/api/admin/configuracion/${clave}`, {
        method: 'PUT',
        body: { valor },
      });
      setMensaje(`Parámetro '${clave}' actualizado a '${valor}'.`);
      cargarTodo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando parámetro');
    }
  }

  async function probarBcrypt(e: FormEvent) {
    e.preventDefault();
    setResVerif(null);
    try {
      const r = await apiRequest<{ coincide: boolean; metodo: string }>('/api/auth/verificar-dato-sensible', {
        method: 'POST',
        body: { campo: campoVerif, valor: valorVerif },
      });
      setResVerif(
        r.coincide
          ? `✅ Coincidencia verificada mediante ${r.metodo} contra el hash almacenado.`
          : `❌ El valor ingresado NO coincide con el hash bcrypt registrado para tu cuenta.`
      );
    } catch (err) {
      setResVerif(err instanceof Error ? err.message : 'Error verificando');
    }
  }

  return (
    <section>
      <div className="panel-heading">
        <h1>Administración · Seguridad &amp; RBAC</h1>
        <p>
          Gestión de usuarios con hashing <strong>bcrypt</strong> (contraseñas y datos sensibles), asignación de{' '}
          <strong>roles predefinidos no editables</strong>, parámetros globales del sistema y auditoría de acceso.
        </p>
      </div>

      <div className="scenarios-buttons" style={{ marginBottom: '1.5rem' }}>
        <button className={`modal-filter-btn ${tab === 'usuarios' ? 'active' : ''}`} onClick={() => setTab('usuarios')}>
          Usuarios &amp; Asignación de Roles ({usuarios.length})
        </button>
        <button className={`modal-filter-btn ${tab === 'roles' ? 'active' : ''}`} onClick={() => setTab('roles')}>
          Roles Predefinidos (Inmutables · {roles.length})
        </button>
        <button className={`modal-filter-btn ${tab === 'config' ? 'active' : ''}`} onClick={() => setTab('config')}>
          Configuración Global
        </button>
        <button className={`modal-filter-btn ${tab === 'auditoria' ? 'active' : ''}`} onClick={() => setTab('auditoria')}>
          Auditoría de Seguridad ({auditoria.length})
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

      {/* TAB 1: USUARIOS + ASIGNACIÓN DE ROLES */}
      {tab === 'usuarios' && (
        <>
          {esAdmin && (
            <div className="add-order-box" style={{ marginBottom: '1.5rem' }}>
              <h2 className="add-order-title">Crear Usuario con Protección bcrypt</h2>
              <p className="add-order-subtitle">
                Contraseña, documento, teléfono y PIN de autorización se hashean con <code>bcrypt</code> antes de guardarse en PostgreSQL.
              </p>
              <form className="add-order-form" onSubmit={handleCrearUsuario}>
                <div className="form-grid-inputs">
                  <div className="field">
                    <label>Nombre *</label>
                    <input value={nombre} onChange={(e) => setNombre(e.target.value)} required placeholder="Ej. Camilo Zuleta" />
                  </div>
                  <div className="field">
                    <label>Correo *</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="usuario@fogon.co" />
                  </div>
                  <div className="field">
                    <label>Contraseña (bcrypt) *</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="Min. 6 caracteres" />
                  </div>
                  <div className="field">
                    <label>Rol Predefinido *</label>
                    <select value={rolNuevo} onChange={(e) => setRolNuevo(e.target.value as RolCodigo)}>
                      {roles.map((r) => (
                        <option key={r.codigo} value={r.codigo}>
                          {r.nombre} ({r.codigo})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Documento sensible (bcrypt)</label>
                    <input value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="CC / NIT" />
                  </div>
                  <div className="field">
                    <label>Teléfono sensible (bcrypt)</label>
                    <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="310..." />
                  </div>
                  <div className="field">
                    <label>PIN autorización (bcrypt)</label>
                    <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="4 dígitos" />
                  </div>
                </div>
                <div className="form-actions">
                  <button className="btn btn-accent" type="submit">
                    Crear Usuario Protegido
                  </button>
                </div>
              </form>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table className="bigo-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol Predefinido (RBAC)</th>
                  <th>Datos Sensibles (bcrypt)</th>
                  <th>Estado</th>
                  {esAdmin && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.nombre}</strong>
                      <div style={{ fontSize: '0.76rem', color: '#C9AD8F', fontFamily: 'var(--font-mono)' }}>{u.email}</div>
                    </td>
                    <td>
                      {esAdmin ? (
                        <select
                          value={u.rol}
                          onChange={(e) => cambiarRolUsuario(u.id, e.target.value as RolCodigo)}
                          style={{
                            background: 'var(--bg)',
                            color: 'var(--accent-soft)',
                            border: '1px solid var(--rule)',
                            borderRadius: 6,
                            padding: '0.35rem 0.5rem',
                            fontSize: '0.82rem',
                          }}
                        >
                          {roles.map((r) => (
                            <option key={r.codigo} value={r.codigo}>
                              {r.nombre}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="tag-orange">{u.rol_nombre}</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.76rem', fontFamily: 'var(--font-mono)' }}>
                      <div>🔑 Pass: {u.tiene_password_bcrypt ? 'bcrypt OK' : 'sin hash'}</div>
                      <div>🪪 Doc: {u.documento_enmascarado ?? '—'} {u.tiene_documento_bcrypt ? '(bcrypt)' : ''}</div>
                      <div>📱 Tel: {u.telefono_enmascarado ?? '—'} {u.tiene_telefono_bcrypt ? '(bcrypt)' : ''}</div>
                    </td>
                    <td>
                      <span className={`order-status-badge ${u.estado === 'activo' ? 'status-entregado' : 'status-solicitado'}`}>
                        {u.estado}
                      </span>
                    </td>
                    {esAdmin && (
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={u.id === usuario?.id}
                          onClick={() => toggleEstadoUsuario(u)}
                        >
                          {u.estado === 'activo' ? 'Desactivar' : 'Reactivar'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Verificador en vivo de dato sensible bcrypt */}
          <div className="trace-box" style={{ marginTop: '1.5rem' }}>
            <h3 style={{ marginTop: 0 }}>Verificación en Vivo de Datos Sensibles (bcrypt.compare)</h3>
            <p style={{ fontSize: '0.84rem', color: '#C9AD8F' }}>
              Comprueba que tus datos sensibles (documento, teléfono o PIN) no se guardan en texto plano, sino verificables vía hash bcrypt.
            </p>
            <form onSubmit={probarBcrypt} className="form-row" style={{ marginBottom: '0.5rem' }}>
              <select value={campoVerif} onChange={(e) => setCampoVerif(e.target.value as 'documento' | 'telefono' | 'pin')}>
                <option value="documento">Documento (demo admin: 1010001001)</option>
                <option value="telefono">Teléfono (demo admin: 3101110001)</option>
                <option value="pin">PIN Autorización (demo admin: 9999)</option>
              </select>
              <input
                value={valorVerif}
                onChange={(e) => setValorVerif(e.target.value)}
                placeholder="Valor en texto claro a verificar"
                required
              />
              <button className="btn btn-accent" type="submit">
                Verificar Hash bcrypt
              </button>
            </form>
            {resVerif && <div style={{ fontSize: '0.86rem', marginTop: '0.5rem' }}>{resVerif}</div>}
          </div>
        </>
      )}

      {/* TAB 2: ROLES PREDEFINIDOS INMUTABLES */}
      {tab === 'roles' && (
        <div>
          <div className="order-card-not-found" style={{ marginBottom: '1.25rem', borderColor: 'var(--accent-soft)' }}>
            <span className="not-found-icon">🔒</span>
            <div>
              <strong>Política RBAC de Roles Inmutables</strong>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.84rem' }}>
                Los 6 roles están protegidos tanto en la API (HTTP 403) como mediante un trigger de PostgreSQL
                (<code>trg_roles_inmutables</code>). No pueden ser editados, renombrados ni eliminados.
              </p>
            </div>
          </div>

          <div className="bigo-cards-grid">
            {roles.map((r) => (
              <div className="bigo-card" key={r.codigo}>
                <div className="bigo-card-head">
                  <span className="complexity-badge badge-constant">🔒 NO EDITABLE</span>
                  <h3>
                    {r.nombre}{' '}
                    <small style={{ color: '#A89078', fontFamily: 'var(--font-mono)' }}>({r.codigo})</small>
                  </h3>
                </div>
                <p className="bigo-card-desc">{r.descripcion}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.8rem' }}>
                  {r.permisos.map((p) => (
                    <span
                      key={p}
                      style={{
                        fontSize: '0.7rem',
                        fontFamily: 'var(--font-mono)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: 'rgba(244,233,216,0.08)',
                        color: '#E4D3B8',
                      }}
                    >
                      {p}
                    </span>
                  ))}
                </div>
                <div className="bigo-card-footer">
                  <span>
                    Nivel acceso: <strong>{r.nivel_acceso}</strong>
                  </span>
                  <span>
                    Usuarios asignados: <strong>{r.usuarios_asignados}</strong>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: CONFIGURACIÓN GLOBAL */}
      {tab === 'config' && (
        <div className="trace-box">
          <h3 style={{ marginTop: 0 }}>Parámetros de Seguridad, Facturación, Ventana Deslizante e IA</h3>
          <table className="bigo-table">
            <thead>
              <tr>
                <th>Parámetro</th>
                <th>Descripción</th>
                <th>Valor actual</th>
                {esAdmin && <th>Guardar</th>}
              </tr>
            </thead>
            <tbody>
              {config.map((cfg) => (
                <FilaConfig key={cfg.clave} cfg={cfg} editable={esAdmin} onSave={guardarParametro} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: AUDITORÍA DE SEGURIDAD */}
      {tab === 'auditoria' && (
        <div style={{ overflowX: 'auto' }}>
          <table className="bigo-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Acción</th>
                <th>Recurso</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {auditoria.map((ev) => (
                <tr key={ev.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                    {new Date(ev.fecha_creacion).toLocaleString('es-CO')}
                  </td>
                  <td>{ev.usuario_nombre ?? 'Sistema'}</td>
                  <td>
                    <span className="tag-orange">{ev.rol ?? '—'}</span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{ev.accion}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{ev.recurso}</td>
                  <td style={{ fontSize: '0.76rem', color: '#C9AD8F' }}>{JSON.stringify(ev.detalle)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

const FilaConfig: React.FC<{
  cfg: ParametroSistema;
  editable: boolean;
  onSave: (clave: string, valor: string) => void;
}> = ({ cfg, editable, onSave }) => {
  const [val, setVal] = useState(cfg.valor);
  useEffect(() => setVal(cfg.valor), [cfg.valor]);

  return (
    <tr>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{cfg.clave}</td>
      <td style={{ fontSize: '0.82rem', color: '#C9AD8F' }}>{cfg.descripcion}</td>
      <td>
        {editable ? (
          cfg.tipo === 'boolean' ? (
            <select
              value={val}
              onChange={(e) => setVal(e.target.value)}
              style={{ background: 'var(--bg)', color: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 6, padding: '0.35rem' }}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : (
            <input
              value={val}
              onChange={(e) => setVal(e.target.value)}
              style={{
                width: '100px',
                background: 'var(--bg)',
                color: 'var(--paper)',
                border: '1px solid var(--rule)',
                borderRadius: 6,
                padding: '0.35rem 0.5rem',
              }}
            />
          )
        ) : (
          <strong>{cfg.valor}</strong>
        )}
      </td>
      {editable && (
        <td>
          <button className="btn btn-accent btn-sm" onClick={() => onSave(cfg.clave, val)}>
            Aplicar
          </button>
        </td>
      )}
    </tr>
  );
};

