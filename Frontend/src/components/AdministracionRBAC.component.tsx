import React, { FormEvent, useEffect, useState } from 'react';
import { RolCodigo, useAuth } from '../context/AuthContext';
import { apiRequest } from '../services/api.service';
import { PasswordInput } from './PasswordInput.component';

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

const ETIQUETAS_CONFIG: Record<string, string> = {
  impuesto_inc_porcentaje: 'Impuesto al consumo (%)',
  descuento_maximo_sin_alerta: 'Descuento máximo sin alerta (%)',
  ventana_deslizante_segundos: 'Ventana de monitoreo (segundos)',
  ventana_deslizante_limite_txn: 'Límite de operaciones por ventana',
  ventana_usar_limite_horario: 'Usar límites según horario',
  umbral_fraude_ia: 'Sensibilidad de alerta automática (0 a 1)',
};

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
      setConfig(cRes.configuracion.filter((c) => c.clave !== 'bcrypt_salt_rounds'));
      setAuditoria(aRes.eventos);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando administración');
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
      setMensaje('Parámetro actualizado correctamente.');
      cargarTodo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando parámetro');
    }
  }

  return (
    <section>
      <div className="panel-heading">
        <h1>Administración</h1>
        <p>
          Gestión de usuarios, asignación de roles predefinidos, configuración general del restaurante y registro de
          actividad.
        </p>
      </div>

      <div className="scenarios-buttons" style={{ marginBottom: '1.5rem' }}>
        <button className={`modal-filter-btn ${tab === 'usuarios' ? 'active' : ''}`} onClick={() => setTab('usuarios')}>
          Usuarios ({usuarios.length})
        </button>
        <button className={`modal-filter-btn ${tab === 'roles' ? 'active' : ''}`} onClick={() => setTab('roles')}>
          Roles del Sistema ({roles.length})
        </button>
        <button className={`modal-filter-btn ${tab === 'config' ? 'active' : ''}`} onClick={() => setTab('config')}>
          Configuración
        </button>
        <button className={`modal-filter-btn ${tab === 'auditoria' ? 'active' : ''}`} onClick={() => setTab('auditoria')}>
          Registro de Actividad ({auditoria.length})
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
              <h2 className="add-order-title">Nuevo Usuario</h2>
              <form className="add-order-form" onSubmit={handleCrearUsuario}>
                <div className="form-grid-inputs">
                  <div className="field">
                    <label>Nombre completo *</label>
                    <input value={nombre} onChange={(e) => setNombre(e.target.value)} required placeholder="Ej. Camilo Zuleta" />
                  </div>
                  <div className="field">
                    <label>Correo electrónico *</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="usuario@fogon.co" />
                  </div>
                  <div className="field">
                    <label>Contraseña *</label>
                    <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="Mínimo 6 caracteres" />
                  </div>
                  <div className="field">
                    <label>Rol *</label>
                    <select value={rolNuevo} onChange={(e) => setRolNuevo(e.target.value as RolCodigo)}>
                      {roles.map((r) => (
                        <option key={r.codigo} value={r.codigo}>
                          {r.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Documento de identidad</label>
                    <input value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="CC / NIT" />
                  </div>
                  <div className="field">
                    <label>Teléfono</label>
                    <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="310..." />
                  </div>
                  <div className="field">
                    <label>PIN de autorización</label>
                    <PasswordInput value={pin} onChange={(e) => setPin(e.target.value)} placeholder="4 dígitos" />
                  </div>
                </div>
                <div className="form-actions">
                  <button className="btn btn-accent" type="submit">
                    Crear Usuario
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
                  <th>Rol</th>
                  <th>Datos registrados</th>
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
                    <td style={{ fontSize: '0.78rem', color: '#C9AD8F' }}>
                      <div>Doc: {u.documento_enmascarado ?? '—'}</div>
                      <div>Tel: {u.telefono_enmascarado ?? '—'}</div>
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
        </>
      )}

      {/* TAB 2: ROLES PREDEFINIDOS INMUTABLES */}
      {tab === 'roles' && (
        <div>
          <div className="order-card-not-found" style={{ marginBottom: '1.25rem', borderColor: 'var(--accent-soft)' }}>
            <span className="not-found-icon">🔒</span>
            <div>
              <strong>Roles Predefinidos del Sistema</strong>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.84rem' }}>
                Estos roles vienen configurados de fábrica y no pueden ser editados ni eliminados. Puedes asignarlos a
                cualquier usuario desde la pestaña Usuarios.
              </p>
            </div>
          </div>

          <div className="bigo-cards-grid">
            {roles.map((r) => (
              <div className="bigo-card" key={r.codigo}>
                <div className="bigo-card-head">
                  <span className="complexity-badge badge-constant">🔒 PREDEFINIDO</span>
                  <h3>{r.nombre}</h3>
                </div>
                <p className="bigo-card-desc">{r.descripcion}</p>
                <div className="bigo-card-footer">
                  <span>
                    Permisos activos: <strong>{r.permisos.length}</strong>
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

      {/* TAB 3: CONFIGURACIÓN */}
      {tab === 'config' && (
        <div className="trace-box">
          <h3 style={{ marginTop: 0 }}>Parámetros Generales del Restaurante</h3>
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

      {/* TAB 4: REGISTRO DE ACTIVIDAD */}
      {tab === 'auditoria' && (
        <div style={{ overflowX: 'auto' }}>
          <table className="bigo-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Acción</th>
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
                  <td style={{ fontSize: '0.82rem' }}>{ev.accion.replace(/_/g, ' ')}</td>
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
      <td><strong>{ETIQUETAS_CONFIG[cfg.clave] ?? cfg.clave}</strong></td>
      <td style={{ fontSize: '0.82rem', color: '#C9AD8F' }}>{cfg.descripcion}</td>
      <td>
        {editable ? (
          cfg.tipo === 'boolean' ? (
            <select
              value={val}
              onChange={(e) => setVal(e.target.value)}
              style={{ background: 'var(--bg)', color: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 6, padding: '0.35rem' }}
            >
              <option value="true">Activado</option>
              <option value="false">Desactivado</option>
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
