import { useRef, useState } from "react";
import { Cola } from "./structures/cola.structure";
import { Pila } from "./structures/pila.structure";
import { ConstruirGrafoCiudades } from "./datasets/datasetCiudades.data";
import { Cliente } from "./types/clientes.types";
import { LogOperaciones, Vista } from "./types/operaciones.types";
import { ColaDeClientes } from "./components/colaCliente.component";
import { PilaDeOperaciones } from "./components/operaciones.component";
import { PlaneadorDeRutas } from "./components/rutas.component";

function now(): string {
  return new Date().toLocaleTimeString("es-CO", { hour12: false });
}

export default function App() {
  const [view, setView] = useState<Vista>("cola");

  // Las estructuras de datos viven una sola vez por sesión, fuera del ciclo
  // de render de React; `tick` fuerza el re-render cuando cambian.
  const queueRef = useRef(new Cola<Cliente>());
  const stackRef = useRef(new Pila<LogOperaciones>());
  const graphRef = useRef(ConstruirGrafoCiudades());

  const [nextClientId, setNextClientId] = useState(1);
  const [nextLogId, setNextLogId] = useState(1);
  const [tick, setTick] = useState(0);
  const bumpTick = () => setTick((t) => t + 1);

  function log(entry: Omit<LogOperaciones, "id" | "hora">) {
    stackRef.current.push({ ...entry, id: nextLogId, hora: now() });
    setNextLogId((id) => id + 1);
    bumpTick();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">Fogón Colombiano</span>
          <span className="brand-tag">El sabor original</span>
        </div>

        <nav className="nav">
          <button className={`nav-item ${view === "cola" ? "active" : ""}`} onClick={() => setView("cola")}>
            Cola de clientes
            <span className="nav-count">{queueRef.current.size}</span>
          </button>
          <button
            className={`nav-item ${view === "operaciones" ? "active" : ""}`}
            onClick={() => setView("operaciones")}
          >
            Operaciones recientes
            <span className="nav-count">{stackRef.current.size}</span>
          </button>
          <button className={`nav-item ${view === "rutas" ? "active" : ""}`} onClick={() => setView("rutas")}>
            Rutas &amp; entregas
          </button>
        </nav>

        <p className="sidebar-foot">
          Pilas, colas y grafos (Dijkstra) trabajando juntos para atender clientes y planificar
          entregas.
        </p>
      </aside>

      <main className="main">
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
      </main>
    </div>
  );
}
