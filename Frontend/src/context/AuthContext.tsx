import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  apiRequest,
  getAuthToken,
  registerUnauthorizedHandler,
  setAuthToken,
} from '../services/api.service';

export type RolCodigo =
  | 'admin'
  | 'gerente'
  | 'jefe_cocina'
  | 'cocinero'
  | 'cajero'
  | 'cliente';

export interface UsuarioSesion {
  id: number;
  nombre: string;
  email: string;
  rol: RolCodigo;
  rol_nombre: string;
  permisos: string[];
  estado: string;
  documento_enmascarado?: string | null;
  telefono_enmascarado?: string | null;
}

interface AuthContextValue {
  usuario: UsuarioSesion | null;
  token: string | null;
  cargando: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: {
    nombre: string;
    email: string;
    password: string;
    documento?: string;
    telefono?: string;
  }) => Promise<void>;
  logout: () => void;
  tienePermiso: (permiso: string) => boolean;
  tieneRol: (...roles: RolCodigo[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [token, setToken] = useState<string | null>(() => getAuthToken());
  const [cargando, setCargando] = useState<boolean>(true);

  const logout = useCallback(() => {
    setAuthToken(null);
    setToken(null);
    setUsuario(null);
  }, []);

  useEffect(() => {
    registerUnauthorizedHandler(() => {
      logout();
    });
  }, [logout]);

  useEffect(() => {
    async function validarSesion() {
      const existing = getAuthToken();
      if (!existing) {
        setCargando(false);
        return;
      }
      try {
        const res = await apiRequest<{ usuario: UsuarioSesion }>('/api/auth/me');
        setUsuario(res.usuario);
        setToken(existing);
      } catch {
        setAuthToken(null);
        setToken(null);
        setUsuario(null);
      } finally {
        setCargando(false);
      }
    }
    validarSesion();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiRequest<{ access_token: string; usuario: UsuarioSesion }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });
    setAuthToken(res.access_token);
    setToken(res.access_token);
    setUsuario(res.usuario);
  }, []);

  const register = useCallback(
    async (payload: {
      nombre: string;
      email: string;
      password: string;
      documento?: string;
      telefono?: string;
    }) => {
      const res = await apiRequest<{ access_token: string; usuario: UsuarioSesion }>('/api/auth/register', {
        method: 'POST',
        body: payload,
        auth: false,
      });
      setAuthToken(res.access_token);
      setToken(res.access_token);
      setUsuario(res.usuario);
    },
    []
  );

  const tienePermiso = useCallback(
    (permiso: string) => Boolean(usuario?.permisos.includes(permiso)),
    [usuario]
  );

  const tieneRol = useCallback(
    (...roles: RolCodigo[]) => Boolean(usuario && roles.includes(usuario.rol)),
    [usuario]
  );

  return (
    <AuthContext.Provider
      value={{ usuario, token, cargando, login, register, logout, tienePermiso, tieneRol }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

