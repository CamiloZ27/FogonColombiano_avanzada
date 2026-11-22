import React, { FormEvent, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const LoginScreen: React.FC = () => {
  const { login, register } = useAuth();
  const [modo, setModo] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [documento, setDocumento] = useState('');
  const [telefono, setTelefono] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

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
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
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
      <div className="trace-box" style={{ width: '100%', maxWidth: '460px', padding: '2rem 2.25rem', margin: 0 }}>
        <div style={{ marginBottom: '1.6rem', textAlign: 'center' }}>
          <div className="brand-mark" style={{ fontSize: '2.1rem' }}>
            Fogón Colombiano
          </div>
          <div className="brand-tag">El sabor original</div>
        </div>

        <div className="scenarios-buttons" style={{ marginBottom: '1.35rem', justifyContent: 'center' }}>
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
            }}
          >
            Registro de Clientes
          </button>
        </div>

        {error && (
          <div className="order-card-not-found" style={{ marginBottom: '1rem', padding: '0.8rem' }}>
            <span className="not-found-icon">⚠️</span>
            <div style={{ fontSize: '0.86rem' }}>{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.95rem' }}>
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
              placeholder="correo@ejemplo.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="auth-pass">Contraseña *</label>
            <input
              id="auth-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={6}
            />
          </div>

          {modo === 'register' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
              <div className="field">
                <label htmlFor="reg-doc">Documento de identidad</label>
                <input
                  id="reg-doc"
                  type="text"
                  value={documento}
                  onChange={(e) => setDocumento(e.target.value)}
                  placeholder="Cédula / ID"
                />
              </div>
              <div className="field">
                <label htmlFor="reg-tel">Teléfono</label>
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
            style={{ marginTop: '0.45rem', padding: '0.85rem' }}
          >
            {enviando
              ? 'Ingresando...'
              : modo === 'login'
              ? 'Ingresar'
              : 'Crear cuenta'}
          </button>
        </form>
      </div>
    </div>
  );
};
