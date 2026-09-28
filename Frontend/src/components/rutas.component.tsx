import { useMemo, useState } from "react";
import { Grafo } from "../structures/grafo.structure";
import { estimateFuel } from "../structures/combustible.structure";
import { LogOperaciones } from "../types/operaciones.types";

interface Props {
  graph: Grafo;
  onLog: (log: Omit<LogOperaciones, "id" | "hora">) => void;
}

export function PlaneadorDeRutas({ graph, onLog }: Props) {
  const cities = graph.nodes;
  const [origen, setOrigen] = useState(cities[0]);
  const [destino, setDestino] = useState(cities[1] ?? cities[0]);
  const [kmPorLitro, setKmPorLitro] = useState(38); // rendimiento típico de una moto de reparto
  const [precioLitro, setPrecioLitro] = useState(16000); // COP por litro

  const [resultado, setResultado] = useState<{ path: string[]; km: number } | null>(null);
  const [sinRuta, setSinRuta] = useState(false);

  const fuel = useMemo(() => {
    if (!resultado) return null;
    try {
      return estimateFuel(resultado.km, kmPorLitro, precioLitro);
    } catch {
      return null;
    }
  }, [resultado, kmPorLitro, precioLitro]);

  function calcularRuta() {
    if (!origen || !destino) return;

    if (origen === destino) {
      setResultado({ path: [origen], km: 0 });
      setSinRuta(false);
      return;
    }
    const ruta = graph.shortestPath(origen, destino);
    if (!ruta) {
      setResultado(null);
      setSinRuta(true);
      return;
    }
    setResultado(ruta);
    setSinRuta(false);
    onLog({
      tipo: "ruta_calculada",
      detalle: `${ruta.path.join(" → ")} (${ruta.km} km)`,
    });
  }

  return (
    <section>
      <div className="panel-heading">
        <h1>Rutas &amp; entregas</h1>
        <p>
          Las ciudades se representan como un grafo ponderado. Dijkstra encuentra la ruta más
          corta entre origen y destino, y con esa distancia se estima el gasto de gasolina.
        </p>
      </div>

      <div className="form-row">
        <select value={origen} onChange={(e) => setOrigen(e.target.value)}>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={destino} onChange={(e) => setDestino(e.target.value)}>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button className="btn btn-accent" onClick={calcularRuta}>
          Calcular ruta más corta
        </button>
      </div>

      {sinRuta && <p className="no-route">No existe una ruta conocida entre esas dos ciudades.</p>}

      {resultado && (
        <div className="route-result">
          <div className="route-path">
            {resultado.path.map((stop, i) => (
              <span key={stop} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span className="stop">{stop}</span>
                {i < resultado.path.length - 1 && <span className="arrow">→</span>}
              </span>
            ))}
          </div>

          <div className="stat-grid">
            <div className="stat">
              <span className="stat-label">Distancia total</span>
              <span className="stat-value">{resultado.km} km</span>
            </div>
            <div className="stat">
              <span className="stat-label">Litros estimados</span>
              <span className="stat-value">{fuel ? fuel.liters.toFixed(2) : "—"}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Costo estimado</span>
              <span className="stat-value">
                {fuel ? fuel.cost.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }) : "—"}
              </span>
            </div>
          </div>

          <div className="fuel-inputs">
            <div className="field">
              <label htmlFor="kml">Rendimiento (km/l)</label>
              <input
                id="kml"
                type="number"
                min={1}
                value={kmPorLitro}
                onChange={(e) => setKmPorLitro(Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="precio">Precio por litro (COP)</label>
              <input
                id="precio"
                type="number"
                min={0}
                value={precioLitro}
                onChange={(e) => setPrecioLitro(Number(e.target.value))}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
