import { useEffect, useMemo, useRef, useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ThemeToggle } from "./components/ThemeToggle.component";
import { Cola } from "./structures/cola.structure";
import { Pila } from "./structures/pila.structure";
import { ConstruirGrafoCiudades } from "./datasets/datasetCiudades.data";
import { Cliente } from "./types/clientes.types";
import { LogOperaciones, Vista } from "./types/operaciones.types";
import { LoginScreen } from "./components/Login.component";
import { PanelEjecutivo } from "./components/PanelEjecutivo.component";
import { OperacionRestaurante } from "./components/OperacionRestaurante.component";
import { IntegridadCalidad } from "./components/IntegridadCalidad.component";
import { AlgoritmosBenchmark } from "./components/AlgoritmosBenchmark.component";
import { InteligenciaArtificial } from "./components/InteligenciaArtificial.component";
import { AdministracionRBAC } from "./components/AdministracionRBAC.component";
import { ColaDeClientes } from "./components/colaCliente.component";
import { PilaDeOperaciones } from "./components/operaciones.component";
import { PlaneadorDeRutas } from "./components/rutas.component";
import { BusquedaDePedidos } from "./components/busquedaPedidos.component";
import { AnomaliasDashboard } from "./components/anomalias.component";
import { FormularioTransaccionUsuario } from "./components/formularioTransaccion.components";
import { PrediccionVentas } from "./components/prediccionVentas.component";

type ViewType =
  | "panel"
  | "operacion"
  | "integridad"
  | "algoritmos"
  | "ia"
  | "admin"
  | Vista
  | "anomalias"
  | "transaccion"
  | "prediccion";

interface NavItemDef {
  id: ViewType;
  label: string;
  grupo: "Plataforma Integral" | "Operación & Estructuras" | "Analítica, Seguridad e IA";
  permiso?: string;
  roles?: string[];
}

const NAV_ITEMS: NavItemDef[] = [
  { id: "panel", label: "Panel Ejecutivo", grupo: "Plataforma Integral", permiso: "panel:ver" },
  { id: "operacion", label: "Operación & POS", grupo: "Plataforma Integral", permiso: "catalogo:ver" },
  { id: "admin", label: "Administración", grupo: "Plataforma Integral", roles: ["admin", "gerente"] },

  { id: "cola", label: "Cola de clientes", grupo: "Operación & Estructuras", permiso: "pedidos:ver" },
  { id: "operaciones", label: "Operaciones recientes", grupo: "Operación & Estructuras", permiso: "pedidos:ver" },
  { id: "rutas", label: "Rutas & entregas", grupo: "Operación & Estructuras", permiso: "pedidos:ver" },
  { id: "transaccion", label: "Registro de transacciones", grupo: "Operación & Estructuras", permiso: "transacciones:crear" },

  { id: "algoritmos", label: "Algoritmos & Benchmark", grupo: "Analítica, Seguridad e IA", permiso: "algoritmos:ver" },
  { id: "busqueda", label: "Búsqueda de pedidos", grupo: "Analítica, Seguridad e IA", permiso: "algoritmos:ver" },
  { id: "integridad", label: "Integridad & Calidad", grupo: "Analítica, Seguridad e IA", permiso: "integridad:ver" },
  { id: "anomalias", label: "Anomalías", grupo: "Analítica, Seguridad e IA", permiso: "anomalias:ver" },
  { id: "ia", label: "Inteligencia Artificial", grupo: "Analítica, Seguridad e IA", permiso: "ia:ver" },
  { id: "prediccion", label: "Predicción de ventas", grupo: "Analítica, Seguridad e IA", permiso: "ia:ver" },
];

function now(): string {
  return new Date().toLocaleTimeString("es-CO", { hour12: false });
}

function AppShellAutenticada() {
  const { usuario, cargando, logout, tienePermiso } = useAuth();

  const queueRef = useRef(new Cola<Cliente>());
  const stackRef = useRef(new Pila<LogOperaciones>());
  const graphRef = useRef(ConstruirGrafoCiudades());

  const [nextClientId, setNextClientId] = useState(1);
  const [nextLogId, setNextLogId] = useState(1);
  const [tick, setTick] = useState(0);
  const bumpTick = () => setTick((t) => t + 1);

  const itemsVisibles = useMemo(() => {
    if (!usuario) return [];
    return NAV_ITEMS.filter((item) => {
      if (item.roles && !item.roles.includes(usuario.rol)) return false;
      if (item.permiso && !tienePermiso(item.permiso)) return false;
      return true;
    });
  }, [usuario, tienePermiso]);

  const [view, setView] = useState<ViewType>("panel");

  useEffect(() => {
    const primero = itemsVisibles[0];
    if (primero && !itemsVisibles.some((i) => i.id === view)) {
      setView(primero.id);
    }
  }, [itemsVisibles, view]);

  function log(entry: Omit<LogOperaciones, "id" | "hora">) {
    stackRef.current.push({ ...entry, id: nextLogId, hora: now() });
    setNextLogId((id) => id + 1);
    bumpTick();
  }

  if (cargando) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div className="empty-state">Verificando sesión…</div>
      </div>
    );
  }

  if (!usuario) {
    return <LoginScreen />;
  }

  const grupos = ["Plataforma Integral", "Operación & Estructuras", "Analítica, Seguridad e IA"] as const;

  return (
    <div className="app-shell">
      <aside className="sidebar" style={{ gap: "1.4rem" }}>
        <div className="brand">
          <span className="brand-mark">Fogón Colombiano</span>
          <span className="brand-tag">El sabor original</span>
          <div style={{ marginTop: "0.45rem" }}>
            <ThemeToggle />
          </div>
        </div>

        {/* Perfil de usuario autenticado + Rol RBAC */}
        <div
          style={{
            padding: "0.75rem 0.85rem",
            borderRadius: 10,
            background: "rgba(244, 233, 216, 0.05)",
            border: "1px solid var(--rule)",
            display: "grid",
            gap: "0.3rem",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: "0.86rem", color: "var(--paper)" }}>{usuario.nombre}</div>
          <div style={{ fontSize: "0.72rem", color: "#A89078", fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>
            {usuario.email}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.25rem" }}>
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 999,
                background: "rgba(181,101,29,0.28)",
                color: "var(--accent-soft)",
              }}
            >
              🛡️ {usuario.rol_nombre}
            </span>
            <button
              type="button"
              onClick={logout}
              className="btn btn-ghost btn-sm"
              style={{ padding: "0.2rem 0.55rem", fontSize: "0.72rem" }}
            >
              Salir
            </button>
          </div>
        </div>

        <nav className="nav" style={{ gap: "0.25rem", overflowY: "auto" }}>
          {grupos.map((grupo) => {
            const lista = itemsVisibles.filter((i) => i.grupo === grupo);
            if (lista.length === 0) return null;
            return (
              <div key={grupo} style={{ marginBottom: "0.65rem" }}>
                <div
                  style={{
                    fontSize: "0.68rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#8E7860",
                    padding: "0.35rem 0.7rem",
                    fontWeight: 700,
                  }}
                >
                  {grupo}
                </div>
                {lista.map((item) => (
                  <button
                    key={item.id}
                    className={`nav-item ${view === item.id ? "active" : ""}`}
                    onClick={() => setView(item.id)}
                    style={{ width: "100%", padding: "0.58rem 0.8rem", fontSize: "0.88rem" }}
                  >
                    {item.label}
                    {item.id === "cola" && <span className="nav-count">{queueRef.current.size}</span>}
                    {item.id === "operaciones" && <span className="nav-count">{stackRef.current.size}</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          Fogón Colombiano · Sistema de gestión
        </div>
      </aside>

      <main className="main">
        {view === "panel" && <PanelEjecutivo />}
        {view === "operacion" && <OperacionRestaurante />}
        {view === "integridad" && <IntegridadCalidad />}
        {view === "algoritmos" && <AlgoritmosBenchmark />}
        {view === "ia" && <InteligenciaArtificial />}
        {view === "admin" && <AdministracionRBAC />}
        {view === "cola" && (
          <ColaDeClientes
            queue={queueRef.current}
            nextId={nextClientId}
            onNextIdChange={setNextClientId}
            onLog={log}
            refreshTick={tick}
            bumpTick={bumpTick}
          />
        )}
        {view === "operaciones" && <PilaDeOperaciones stack={stackRef.current} refreshTick={tick} />}
        {view === "rutas" && <PlaneadorDeRutas graph={graphRef.current} onLog={log} />}
        {view === "busqueda" && <BusquedaDePedidos onLog={log} />}
        {view === "anomalias" && <AnomaliasDashboard />}
        {view === "transaccion" && <FormularioTransaccionUsuario />}
        {view === "prediccion" && <PrediccionVentas />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppShellAutenticada />
      </AuthProvider>
    </ThemeProvider>
  );
}
