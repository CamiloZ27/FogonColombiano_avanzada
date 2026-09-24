import { FormEvent, useState } from "react";
import {
  obtenerDatasetArchivo,
  obtenerDatasetGenerado,
  obtenerDatasetManual,
} from "../datasets/dataset.provider";
import { analizarComparativaBigO } from "../services/analitica.service";
import { ComparativaBigOResult, PropsBusqueda } from "../types/operaciones.types";
import { EstadoPedido, Pedido, TipoPedido } from "../types/pedidos.types";

type TipoFuenteDataset = "manual" | "archivo" | "masivo_100" | "masivo_1000" | "masivo_10000" | "masivo_50000";

export function BusquedaDePedidos({ onLog }: PropsBusqueda) {
  const [fuente, setFuente] = useState<TipoFuenteDataset>("manual");
  const [pedidos, setPedidos] = useState<Pedido[]>(() => obtenerDatasetManual().validos);
  const [idInput, setIdInput] = useState<string>("105");
  const [mostrarTrazas, setMostrarTrazas] = useState(true);

  // Estado del formulario de creación manual
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [nuevoId, setNuevoId] = useState<string>("");
  const [nuevoCliente, setNuevoCliente] = useState<string>("");
  const [nuevoTipo, setNuevoTipo] = useState<TipoPedido>("Local");
  const [nuevaCant, setNuevaCant] = useState<number>(2);
  const [nuevoEstado, setNuevoEstado] = useState<EstadoPedido>("Solicitado");
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);

  // Estado del resultado de análisis Big O
  const [resultado, setResultado] = useState<ComparativaBigOResult | null>(() => {
    const iniciales = obtenerDatasetManual().validos;
    if (iniciales.length > 0) {
      const inicialId = iniciales[Math.floor(iniciales.length / 2)]?.id_pedido ?? 105;
      return analizarComparativaBigO(iniciales, inicialId);
    }
    return null;
  });

  function cambiarFuente(nuevaFuente: TipoFuenteDataset) {
    setFuente(nuevaFuente);
    setMensajeExito(null);

    let nuevos: Pedido[] = [];
    if (nuevaFuente === "manual") nuevos = obtenerDatasetManual().validos;
    else if (nuevaFuente === "archivo") nuevos = obtenerDatasetArchivo().validos;
    else if (nuevaFuente === "masivo_100") nuevos = obtenerDatasetGenerado(100).validos;
    else if (nuevaFuente === "masivo_1000") nuevos = obtenerDatasetGenerado(1000).validos;
    else if (nuevaFuente === "masivo_10000") nuevos = obtenerDatasetGenerado(10000).validos;
    else if (nuevaFuente === "masivo_50000") nuevos = obtenerDatasetGenerado(50000).validos;

    setPedidos(nuevos);

    if (nuevos.length > 0) {
      const idObjetivo = nuevos[Math.floor(nuevos.length / 2)]?.id_pedido ?? 1;
      setIdInput(idObjetivo.toString());
      const res = analizarComparativaBigO(nuevos, idObjetivo);
      setResultado(res);
    }
  }

  function ejecutarBusquedaConLista(idABuscar: number, lista: Pedido[]) {
    if (lista.length === 0) return;
    const res = analizarComparativaBigO(lista, idABuscar);
    setResultado(res);

    const estadoTexto = res.pedido
      ? `Encontrado (${res.pedido.cliente})`
      : "No encontrado";

    onLog({
      tipo: "busqueda_pedido",
      detalle: `ID #${idABuscar} [${estadoTexto}] en N=${res.totalElementos} pedidos | O(1): ${res.metricaConstante.operaciones} op | O(log n): ${res.metricaBinaria.operaciones} ops | O(n): ${res.metricaLineal.operaciones} ops`,
    });
  }

  function ejecutarBusqueda(idABuscar: number) {
    ejecutarBusquedaConLista(idABuscar, pedidos);
  }

  function handleSubmitBusqueda(e: FormEvent) {
    e.preventDefault();
    const idNum = parseInt(idInput, 10);
    if (isNaN(idNum)) return;
    ejecutarBusqueda(idNum);
  }

  function buscarEscenario(tipo: "primero" | "medio" | "ultimo" | "inexistente") {
    if (pedidos.length === 0) return;

    let idObjetivo = 0;
    if (tipo === "primero") {
      idObjetivo = pedidos[0]?.id_pedido ?? 1;
    } else if (tipo === "medio") {
      const idx = Math.floor(pedidos.length / 2);
      idObjetivo = pedidos[idx]?.id_pedido ?? 1;
    } else if (tipo === "ultimo") {
      idObjetivo = pedidos[pedidos.length - 1]?.id_pedido ?? 1;
    } else if (tipo === "inexistente") {
      const maxId = pedidos.reduce((max, p) => Math.max(max, p.id_pedido), 0);
      idObjetivo = maxId + 999;
    }

    setIdInput(idObjetivo.toString());
    ejecutarBusqueda(idObjetivo);
  }

  function abrirFormularioToggle() {
    if (!mostrarFormulario) {
      const maxActual = pedidos.reduce((max, p) => Math.max(max, p.id_pedido), 0);
      setNuevoId((maxActual + 1).toString());
    }
    setMostrarFormulario(!mostrarFormulario);
  }

  function handleCrearPedido(e: FormEvent) {
    e.preventDefault();
    const idNum = parseInt(nuevoId, 10);
    if (isNaN(idNum) || idNum <= 0) {
      alert("El ID del pedido debe ser un número entero positivo.");
      return;
    }
    if (!nuevoCliente.trim()) {
      alert("Por favor ingrese el nombre del cliente.");
      return;
    }
    if (nuevaCant <= 0) {
      alert("La cantidad de platos debe ser mayor a 0.");
      return;
    }

    const existe = pedidos.some((p) => p.id_pedido === idNum);
    if (existe) {
      alert(`Ya existe un pedido con el ID #${idNum}. Por favor utilice un ID diferente.`);
      return;
    }

    const nuevoPedido: Pedido = {
      id_pedido: idNum,
      cliente: nuevoCliente.trim(),
      tipo: nuevoTipo,
      cant_productos: nuevaCant,
      estado: nuevoEstado,
    };

    const listaActualizada = [...pedidos, nuevoPedido];
    setPedidos(listaActualizada);

    // Búsqueda inmediata Big O sobre el nuevo pedido
    setIdInput(idNum.toString());
    const res = analizarComparativaBigO(listaActualizada, idNum);
    setResultado(res);

    // Registro de auditoría en la pila
    onLog({
      tipo: "cliente_agregado",
      detalle: `Pedido #${nuevoPedido.id_pedido} creado manualmente: ${nuevoPedido.cliente} (${nuevoPedido.tipo}, ${nuevoPedido.cant_productos} platos)`
    });
    onLog({
      tipo: "busqueda_pedido",
      detalle: `Análisis Big O en nuevo pedido #${idNum} (N=${listaActualizada.length}) | O(1): 1 op | O(log n): ${res.metricaBinaria.operaciones} ops | O(n): ${res.metricaLineal.operaciones} ops`
    });

    setMensajeExito(`¡Pedido #${idNum} añadido con éxito! Análisis Big O aplicado instantáneamente sobre N = ${listaActualizada.length} pedidos.`);
    setTimeout(() => setMensajeExito(null), 6000);

    // Preparar siguiente ID sugerido
    setNuevoCliente("");
    setNuevaCant(2);
    setNuevoId((idNum + 1).toString());
  }

  const maxOpsVisual = resultado
    ? Math.max(resultado.metricaLineal.operaciones, resultado.metricaBinaria.operaciones, 1)
    : 1;

  return (
    <section>
      <div className="panel-heading">
        <h1>Búsqueda de Pedidos &amp; Análisis Big O</h1>
        <p>
          Añade pedidos manualmente al restaurante o carga datasets simulados para comprobar en tiempo real
          la eficiencia algorítmica entre <strong>O(1)</strong>, <strong>O(log n)</strong> y <strong>O(n)</strong>.
        </p>
      </div>

      {/* Barra superior con selector de dataset y contador N */}
      <div className="dataset-picker-bar">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="select-dataset">Catálogo activo de pedidos</label>
          <select
            id="select-dataset"
            value={fuente}
            onChange={(e) => cambiarFuente(e.target.value as TipoFuenteDataset)}
          >
            <option value="manual">Manual (10 pedidos típicos)</option>
            <option value="archivo">Archivo JSON (pedidos.json)</option>
            <option value="masivo_100">Simulación: 100 pedidos</option>
            <option value="masivo_1000">Simulación: 1.000 pedidos</option>
            <option value="masivo_10000">Simulación: 10.000 pedidos</option>
            <option value="masivo_50000">Simulación: 50.000 pedidos (Escala Big O)</option>
          </select>
        </div>

        <div className="dataset-meta-badge">
          <span className="meta-label">Total Pedidos en Memoria (N):</span>
          <span className="meta-value">{pedidos.length.toLocaleString("es-CO")}</span>
        </div>
      </div>

      {/* Botón y Panel para Añadir Pedidos Manualmente */}
      <div className="add-order-box">
        <div className="add-order-top-row">
          <div>
            <h2 className="add-order-title">Gestión Manual de Pedidos</h2>
            <p className="add-order-subtitle">
              Agrega un pedido con datos personalizados; el motor Big O lo integrará inmediatamente a la colección.
            </p>
          </div>
          <button
            type="button"
            className={`btn ${mostrarFormulario ? "btn-ghost" : "btn-accent"}`}
            onClick={abrirFormularioToggle}
          >
            {mostrarFormulario ? "Cerrar formulario" : "Añadir Nuevo Pedido"}
          </button>
        </div>

        {mensajeExito && (
          <div className="alert-success">
            <span>{mensajeExito}</span>
          </div>
        )}

        {mostrarFormulario && (
          <form className="add-order-form" onSubmit={handleCrearPedido}>
            <div className="form-grid-inputs">
              <div className="field">
                <label htmlFor="input-id">ID del Pedido</label>
                <input
                  id="input-id"
                  type="number"
                  min={1}
                  value={nuevoId}
                  onChange={(e) => setNuevoId(e.target.value)}
                  required
                />
              </div>

              <div className="field" style={{ flex: 2 }}>
                <label htmlFor="input-cliente">Nombre del Cliente</label>
                <input
                  id="input-cliente"
                  type="text"
                  placeholder="Ej. Sofía Vergara, Familia Gómez..."
                  value={nuevoCliente}
                  onChange={(e) => setNuevoCliente(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="select-tipo">Tipo</label>
                <select
                  id="select-tipo"
                  value={nuevoTipo}
                  onChange={(e) => setNuevoTipo(e.target.value as TipoPedido)}
                >
                  <option value="Local">Local</option>
                  <option value="Domicilio">Domicilio</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="input-cant">Cantidad de Platos</label>
                <input
                  id="input-cant"
                  type="number"
                  min={1}
                  value={nuevaCant}
                  onChange={(e) => setNuevaCant(Number(e.target.value))}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="select-estado">Estado</label>
                <select
                  id="select-estado"
                  value={nuevoEstado}
                  onChange={(e) => setNuevoEstado(e.target.value as EstadoPedido)}
                >
                  <option value="Solicitado">Solicitado</option>
                  <option value="En Proceso">En Proceso</option>
                  <option value="Entregado">Entregado</option>
                </select>
              </div>
            </div>

            <div className="form-actions">
              <button className="btn btn-accent" type="submit">
                Guardar Pedido y Aplicar Big O
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Chips de pedidos disponibles cuando la lista es accesible (N <= 30) */}
      {pedidos.length > 0 && pedidos.length <= 30 && (
        <div className="chips-section">
          <span className="chips-title">Pedidos en el catálogo (haz clic para buscar directamente):</span>
          <div className="chips-wrapper">
            {pedidos.map((p) => (
              <button
                key={p.id_pedido}
                type="button"
                className={`order-chip ${idInput === p.id_pedido.toString() ? "active" : ""}`}
                onClick={() => {
                  setIdInput(p.id_pedido.toString());
                  ejecutarBusqueda(p.id_pedido);
                }}
              >
                <strong>#{p.id_pedido}</strong> {p.cliente}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Formulario de búsqueda interactiva */}
      <h2 className="section-subtitle" style={{ marginTop: "1.5rem" }}>
        Búsqueda y Análisis Asintótico
      </h2>
      <form className="form-row" onSubmit={handleSubmitBusqueda}>
        <input
          type="number"
          placeholder="Ingrese ID del pedido a buscar (ej. 101, 105...)"
          value={idInput}
          onChange={(e) => setIdInput(e.target.value)}
          required
        />
        <button className="btn btn-accent" type="submit">
          Ejecutar Análisis Big O
        </button>
      </form>

      {/* Botones de Escenarios de Prueba Didácticos */}
      <div className="scenarios-container">
        <span className="scenarios-title">Casos de prueba preconfigurados:</span>
        <div className="scenarios-buttons">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => buscarEscenario("primero")}
            title="Mejor caso para búsqueda lineal: se encuentra en la 1ra comparación"
          >
            Primer pedido (Mejor caso O(n))
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => buscarEscenario("medio")}
            title="Mejor caso para búsqueda binaria: coincide con el elemento central"
          >
             Pedido central (Mejor caso O(log n))
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => buscarEscenario("ultimo")}
            title="Peor caso para búsqueda lineal: debe recorrer todo el arreglo (N comparaciones)"
          >
             Último pedido (Peor caso O(n))
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => buscarEscenario("inexistente")}
            title="ID que no existe en el catálogo"
          >
             ID Inexistente (Peor caso global)
          </button>
        </div>
      </div>

      {resultado && (
        <div className="bigo-results-wrapper">
          {/* Tarjeta del Pedido Encontrado o Estado */}
          <div className="order-found-banner">
            {resultado.pedido ? (
              <div className="order-card-ticket">
                <div className="order-ticket-header">
                  <span className="order-badge-id">Pedido #{resultado.pedido.id_pedido}</span>
                  <span className={`order-status-badge status-${resultado.pedido.estado.toLowerCase().replace(" ", "-")}`}>
                    {resultado.pedido.estado}
                  </span>
                </div>
                <div className="order-ticket-body">
                  <div className="order-info-item">
                    <span className="label">Cliente:</span>
                    <span className="val">{resultado.pedido.cliente}</span>
                  </div>
                  <div className="order-info-item">
                    <span className="label">Tipo de Entrega:</span>
                    <span className="val">{resultado.pedido.tipo}</span>
                  </div>
                  <div className="order-info-item">
                    <span className="label">Cantidad de Platos:</span>
                    <span className="val">{resultado.pedido.cant_productos}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="order-card-not-found">
                <span className="not-found-icon">⚠️</span>
                <div>
                  <strong>Pedido #{resultado.idBuscado} no encontrado</strong>
                  <p>Ningún registro en el catálogo de {resultado.totalElementos} pedidos coincide con este identificador.</p>
                </div>
              </div>
            )}
          </div>

          {/* Tarjetas comparativas de métricas Big O */}
          <h2 className="section-subtitle">Métricas Computacionales Comparativas</h2>
          <div className="bigo-cards-grid">
            {/* O(1) */}
            <div className="bigo-card card-constant">
              <div className="bigo-card-head">
                <span className="complexity-badge badge-constant">O(1)</span>
                <h3>{resultado.metricaConstante.nombre}</h3>
              </div>
              <div className="bigo-card-stats">
                <div className="stat-unit">
                  <span className="stat-label">Operaciones</span>
                  <span className="stat-value highlight-accent">{resultado.metricaConstante.operaciones} op</span>
                </div>
                <div className="stat-unit">
                  <span className="stat-label">Tiempo medido</span>
                  <span className="stat-value">{resultado.metricaConstante.tiempoMs.toFixed(4)} ms</span>
                </div>
              </div>
              <p className="bigo-card-desc">{resultado.metricaConstante.explicacion}</p>
              <div className="bigo-card-footer">
                <span>Peor caso: <strong>{resultado.metricaConstante.complejidadTeorica.peor}</strong></span>
                <span>Espacio: <strong>{resultado.metricaConstante.complejidadTeorica.espacio}</strong></span>
              </div>
            </div>

            {/* O(log n) */}
            <div className="bigo-card card-logarithmic">
              <div className="bigo-card-head">
                <span className="complexity-badge badge-logarithmic">O(log n)</span>
                <h3>{resultado.metricaBinaria.nombre}</h3>
              </div>
              <div className="bigo-card-stats">
                <div className="stat-unit">
                  <span className="stat-label">Operaciones</span>
                  <span className="stat-value highlight-sage">{resultado.metricaBinaria.operaciones} ops</span>
                </div>
                <div className="stat-unit">
                  <span className="stat-label">Tiempo medido</span>
                  <span className="stat-value">{resultado.metricaBinaria.tiempoMs.toFixed(4)} ms</span>
                </div>
              </div>
              <p className="bigo-card-desc">{resultado.metricaBinaria.explicacion}</p>
              <div className="bigo-card-footer">
                <span>Peor caso: <strong>{resultado.metricaBinaria.complejidadTeorica.peor}</strong></span>
                <span>Espacio: <strong>{resultado.metricaBinaria.complejidadTeorica.espacio}</strong></span>
              </div>
            </div>

            {/* O(n) */}
            <div className="bigo-card card-linear">
              <div className="bigo-card-head">
                <span className="complexity-badge badge-linear">O(n)</span>
                <h3>{resultado.metricaLineal.nombre}</h3>
              </div>
              <div className="bigo-card-stats">
                <div className="stat-unit">
                  <span className="stat-label">Operaciones</span>
                  <span className="stat-value highlight-rust">{resultado.metricaLineal.operaciones} ops</span>
                </div>
                <div className="stat-unit">
                  <span className="stat-label">Tiempo medido</span>
                  <span className="stat-value">{resultado.metricaLineal.tiempoMs.toFixed(4)} ms</span>
                </div>
              </div>
              <p className="bigo-card-desc">{resultado.metricaLineal.explicacion}</p>
              <div className="bigo-card-footer">
                <span>Peor caso: <strong>{resultado.metricaLineal.complejidadTeorica.peor}</strong></span>
                <span>Espacio: <strong>{resultado.metricaLineal.complejidadTeorica.espacio}</strong></span>
              </div>
            </div>
          </div>

          {/* Gráfico de barras de carga computacional */}
          <div className="efficiency-comparison-box">
            <h3 className="box-title">Comparativa de Operaciones Realizadas (Menos es mejor)</h3>
            <div className="bar-row">
              <span className="bar-label">O(1) Hash Map</span>
              <div className="bar-track">
                <div
                  className="bar-fill bar-fill-accent"
                  style={{
                    width: `${Math.max(
                      (resultado.metricaConstante.operaciones / maxOpsVisual) * 100,
                      2
                    )}%`,
                  }}
                />
              </div>
              <span className="bar-value">{resultado.metricaConstante.operaciones} op</span>
            </div>

            <div className="bar-row">
              <span className="bar-label">O(log n) Binaria</span>
              <div className="bar-track">
                <div
                  className="bar-fill bar-fill-sage"
                  style={{
                    width: `${Math.max(
                      (resultado.metricaBinaria.operaciones / maxOpsVisual) * 100,
                      2
                    )}%`,
                  }}
                />
              </div>
              <span className="bar-value">{resultado.metricaBinaria.operaciones} ops</span>
            </div>

            <div className="bar-row">
              <span className="bar-label">O(n) Lineal</span>
              <div className="bar-track">
                <div
                  className="bar-fill bar-fill-rust"
                  style={{
                    width: `${Math.max(
                      (resultado.metricaLineal.operaciones / maxOpsVisual) * 100,
                      2
                    )}%`,
                  }}
                />
              </div>
              <span className="bar-value">{resultado.metricaLineal.operaciones} ops</span>
            </div>

            <p className="box-note">
              Para <strong>N = {resultado.totalElementos.toLocaleString("es-CO")}</strong> pedidos, la
              búsqueda binaria resolvió en <strong>{resultado.metricaBinaria.operaciones}</strong> pasos,
              mientras que la lineal requirió <strong>{resultado.metricaLineal.operaciones}</strong> pasos{" "}
              {resultado.metricaLineal.operaciones > resultado.metricaBinaria.operaciones && (
                <>(un ahorro de {Math.round(
                  (1 - resultado.metricaBinaria.operaciones / resultado.metricaLineal.operaciones) * 100
                )}% de comparaciones)</>
              )}
              .
            </p>
          </div>

          {/* Traza detallada de ejecución / Bisección */}
          <div className="trace-box">
            <div className="trace-header">
              <h3>Traza de Búsqueda Binaria (Bisección paso a paso)</h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setMostrarTrazas(!mostrarTrazas)}
              >
                {mostrarTrazas ? "Ocultar trazas" : "Ver trazas"}
              </button>
            </div>

            {mostrarTrazas && (
              <div className="trace-list">
                {resultado.metricaBinaria.trazas.map((traza) => (
                  <div className="trace-item" key={traza.paso}>
                    <span className="trace-step">Paso {traza.paso}</span>
                    <span className="trace-desc">{traza.descripcion}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tabla Teórica Big O */}
          <div className="table-responsive" style={{ marginTop: "2rem" }}>
            <h3 className="box-title">Matriz Teórica de Complejidad Asintótica</h3>
            <table className="bigo-table">
              <thead>
                <tr>
                  <th>Algoritmo</th>
                  <th>Estructura</th>
                  <th>Mejor Caso (Ω)</th>
                  <th>Caso Promedio (Θ)</th>
                  <th>Peor Caso (O)</th>
                  <th>Memoria Auxiliar</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Acceso Hash / Directo</strong></td>
                  <td>Hash Map / Clave</td>
                  <td><span className="tag-green">O(1)</span></td>
                  <td><span className="tag-green">O(1)</span></td>
                  <td><span className="tag-green">O(1)</span></td>
                  <td>O(n) en memoria</td>
                </tr>
                <tr>
                  <td><strong>Búsqueda Binaria</strong></td>
                  <td>Arreglo Ordenado</td>
                  <td><span className="tag-green">O(1)</span> (centro)</td>
                  <td><span className="tag-blue">O(log n)</span></td>
                  <td><span className="tag-blue">O(log n)</span></td>
                  <td>O(1)</td>
                </tr>
                <tr>
                  <td><strong>Búsqueda Lineal</strong></td>
                  <td>Arreglo / Lista</td>
                  <td><span className="tag-green">O(1)</span> (inicio)</td>
                  <td><span className="tag-orange">O(n / 2)</span></td>
                  <td><span className="tag-red">O(n)</span></td>
                  <td>O(1)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
