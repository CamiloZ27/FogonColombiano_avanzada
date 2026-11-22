import React, { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../services/api.service';

interface CuentaDemo {
  nombre: string;
  email: string;
  rol: string;
}

const ETIQUETA_ROL: Record<string, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  jefe_cocina: 'Jefe de Cocina',
  cocinero: 'Cocinero',
  cajero: 'Cajero / POS',
  cliente: 'Cliente',
};

export const LoginScreen: React.FC = () => {
  const { login, register } = useAuth();
  const [modo, setModo] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('admin@fogoncolombiano.com');
  const [password, setPassword] = useState('Fogon2026*');
  const [nombre, setNombre] = useState('');
  const [documento, setDocumento] = useState('');
  const [telefono, setTelefono] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [cuentasDemo, setCuentasDemo] = useState<CuentaDemo[]>([]);
  const [passDemo, setPassDemo] = useState('Fogon2026*');

  useEffect(() => {
    apiRequest<{ password_demo: string; cuentas: CuentaDemo[] }>('/api/auth/demo-cuentas', { auth: false })
      .then((res) => {
        setCuentasDemo(res.cuentas);
        setPassDemo(res.password_demo);
      })
      .catch(() => {
        // Silencioso si el backend aún no arranca
      });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      if (modo === 'login') {
        await login(email, password);
      } else {
        await register({ nombre, email, password, documento, telefono });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de autenticación');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
        background:
          'radial-gradient(circle at top right, rgba(181, 101, 29, 0.22), transparent 55%), var(--bg)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '940px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.75rem',
          alignItems: 'stretch',
        }}
      >
        {/* Columna izquierda: formulario de acceso */}
        <div className="trace-box" style={{ padding: '2rem', margin: 0 }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <div className="brand-mark" style={{ fontSize: '2rem' }}>
              Fogón Colombiano
            </div>
            <div className="brand-tag">Plataforma Operativa, Analítica e IA</div>
            <div
              style={{
                marginTop: '0.75rem',
                display: 'inline-flex',
                gap: '0.4rem',
                flexWrap: 'wrap',
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <span className="tag-green" style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(92,122,90,0.2)' }}>
                🔐 bcrypt
              </span>
              <span className="tag-orange" style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(221,161,94,0.16)' }}>
                🎫 JWT Bearer
              </span>
              <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(244,233,216,0.1)', color: 'var(--paper)' }}>
                🛡️ RBAC Inmutable
              </span>
            </div>
          </div>

          <div className="scenarios-buttons" style={{ marginBottom: '1.25rem' }}>
            <button
              type="button"
              className={`modal-filter-btn ${modo === 'login' ? 'active' : ''}`}
              onClick={() => {
                setModo('login');
                setError(null);
              }}
            >
              Iniciar Sesión
            </button>
            <button
              type="button"
              className={`modal-filter-btn ${modo === 'register' ? 'active' : ''}`}
              onClick={() => {
                setModo('register');
                setError(null);
                setEmail('');
                setPassword('');
              }}
            >
              Registro Cliente
            </button>
          </div>

          {error && (
            <div className="order-card-not-found" style={{ marginBottom: '1rem', padding: '0.8rem' }}>
              <span className="not-found-icon">⚠️</span>
              <div style={{ fontSize: '0.86rem' }}>{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.9rem' }}>
            {modo === 'register' && (
              <div className="field">
                <label htmlFor="reg-nombre">Nombre completo *</label>
                <input
                  id="reg-nombre"
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. María Fernanda Gómez"
                  required
                />
              </div>
            )}

            <div className="field">
              <label htmlFor="auth-email">Correo electrónico *</label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@fogoncolombiano.com"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="auth-pass">Contraseña (protegida con bcrypt) *</label>
              <input
                id="auth-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
                minLength={6}
              />
            </div>

            {modo === 'register' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="field">
                  <label htmlFor="reg-doc">Documento (hash bcrypt)</label>
                  <input
                    id="reg-doc"
                    type="text"
                    value={documento}
                    onChange={(e) => setDocumento(e.target.value)}
                    placeholder="Cédula / ID"
                  />
                </div>
                <div className="field">
                  <label htmlFor="reg-tel">Teléfono (hash bcrypt)</label>
                  <input
                    id="reg-tel"
                    type="text"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder="310 000 0000"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-accent"
              disabled={enviando}
              style={{ marginTop: '0.5rem', padding: '0.85rem' }}
            >
              {enviando
                ? 'Validando credenciales...'
                : modo === 'login'
                ? 'Ingresar con JWT Bearer'
                : 'Crear cuenta Cliente'}
            </button>
          </form>
        </div>

        {/* Columna derecha: accesos rápidos para probar cada rol predefinido */}
        <div className="trace-box" style={{ padding: '2rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: '0 0 0.35rem', fontFamily: 'var(--font-display)', fontSize: '1.35rem' }}>
              Roles Predefinidos RBAC
            </h2>
            <p style={{ margin: 0, fontSize: '0.84rem', color: '#C9AD8F', lineHeight: 1.5 }}>
              Haz clic en cualquier cuenta de demostración para cargar sus credenciales y verificar el control de
              acceso basado en roles no editables. Contraseña demo:{' '}
              <code style={{ color: 'var(--accent-soft)' }}>{passDemo}</code>
            </p>
          </div>

          <div style={{ display: 'grid', gap: '0.55rem' }}>
            {cuentasDemo.map((c) => (
              <button
                key={c.email}
                type="button"
                onClick={() => {
                  setModo('login');
                  setEmail(c.email);
                  setPassword(passDemo);
                  setError(null);
                }}
                style={{
                  textAlign: 'left',
                  padding: '0.7rem 0.9rem',
                  borderRadius: 10,
                  border: email === c.email ? '1px solid var(--accent-soft)' : '1px solid var(--rule)',
                  background: email === c.email ? 'rgba(181,101,29,0.2)' : 'rgba(255,255,255,0.02)',
                  color: 'var(--paper)',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{c.nombre}</div>
                  <div style={{ fontSize: '0.76rem', color: '#C9AD8F', fontFamily: 'var(--font-mono)' }}>
                    {c.email}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '3px 9px',
                    borderRadius: 999,
                    background: 'rgba(221, 161, 94, 0.18)',
                    color: 'var(--accent-soft)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ETIQUETA_ROL[c.rol] ?? c.rol}
                </span>
              </button>
            ))}
          </div>

          <div style={{ marginTop: 'auto', fontSize: '0.76rem', color: '#A89078', borderTop: '1px solid var(--rule)', paddingTop: '0.8rem' }}>
            Todas las contraseñas, documentos, teléfonos y PINes se almacenan exclusivamente con hash <strong>bcrypt</strong>.
            Cada petición autenticada viaja con <code>Authorization: Bearer &lt;JWT&gt;</code>.
          </div>
        </div>
      </div>
    </div>
  );
};

