import { FormEvent, useState } from "react";
import { COMIDAS_TIPICAS, ComidaTipica } from "../datasets/datasetComidas.data";
import { Cliente } from "../types/clientes.types";
import { PropsColas } from "../types/operaciones.types";
import { ModalCartaComidas } from "./modalCartaComidas.component";

function now(): string {
  return new Date().toLocaleTimeString("es-CO", { hour12: false });
}

export function ColaDeClientes({ queue, nextId, onNextIdChange, onLog, refreshTick, bumpTick }: PropsColas) {
  const [nombre, setNombre] = useState("");
  // Plato seleccionado mediante el modal ilustrado
  const [platoSeleccionado, setPlatoSeleccionado] = useState<ComidaTipica | null>(null);
  const [ultimoAtendido, setUltimoAtendido] = useState<Cliente | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const clientes = queue.toArray();

  function agregarCliente(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !platoSeleccionado) return;

    const client: Cliente = {
      id: nextId,
      nombre: nombre.trim(),
      pedido: platoSeleccionado.nombre,
      llegada: now(),
    };

    queue.enqueue(client);
    onLog({ tipo: "cliente_agregado", detalle: `${client.nombre} — ${client.pedido}` });
    onNextIdChange(nextId + 1);
    setNombre("");
    bumpTick();
  }

  function atenderSiguiente() {
    const atendido = queue.dequeue();
    if (!atendido) return;
    setUltimoAtendido(atendido);
    onLog({ tipo: "cliente_atendido", detalle: `${atendido.nombre} — ${atendido.pedido}` });
    bumpTick();
  }

  function handleSelectFromModal(comida: ComidaTipica) {
    setPlatoSeleccionado(comida);
  }

  return (
    <section>
      <div className="panel-heading">
        <h1>Cola de clientes</h1>
        <p>
          Los clientes se atienden en estricto orden de llegada (FIFO). El primero de la fila
          es siempre el siguiente en recibir su comida típica del fogón.
        </p>
      </div>

      {/* Formulario que utiliza exclusivamente el modal ilustrado para la selección del plato */}
      <form className="order-form-container" onSubmit={agregarCliente}>
        <div className="form-row" style={{ alignItems: "center" }}>
          <input
            placeholder="Nombre del cliente"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            style={{ flex: 1.5, minWidth: "220px" }}
          />

          <button
            type="button"
            className="btn btn-menu-illustrated"
            onClick={() => setIsModalOpen(true)}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <span>🍽️</span>
            <span>{platoSeleccionado ? "Cambiar Plato (Ver Carta)" : "Seleccionar Plato (Ver Carta)"}</span>
          </button>

          <button
            className="btn btn-accent"
            type="submit"
            disabled={!nombre.trim() || !platoSeleccionado}
          >
            Agregar a la fila
          </button>
        </div>

        {/* Tarjeta del plato seleccionado mediante el modal */}
        {platoSeleccionado ? (
          <div className="selected-dish-preview" onClick={() => setIsModalOpen(true)} style={{ cursor: "pointer" }}>
            <div className="preview-img-container">
              <img
                src={platoSeleccionado.imagen}
                alt={platoSeleccionado.nombre}
                className="preview-mini-thumb"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const img = e.currentTarget as HTMLImageElement;
                  // 3-level fallback: imagen → imagenSecundaria → svgFallback
                  if (!img.dataset.triedSecondary && platoSeleccionado.imagenSecundaria) {
                    img.dataset.triedSecondary = "1";
                    img.src = platoSeleccionado.imagenSecundaria;
                  } else if (!img.dataset.triedSvg) {
                    img.dataset.triedSvg = "1";
                    img.src = platoSeleccionado.svgFallback;
                  }
                }}
              />
            </div>
            <div className="preview-dish-details">
              <span className="preview-dish-name">
                {platoSeleccionado.nombre} —{" "}
                <strong style={{ color: "var(--accent-soft)" }}>
                  {platoSeleccionado.precio.toLocaleString("es-CO", {
                    style: "currency",
                    currency: "COP",
                    maximumFractionDigits: 0,
                  })}
                </strong>
              </span>
              <span className="preview-dish-desc">{platoSeleccionado.descripcion}</span>
            </div>
            <span className="btn-dish-change-tag">
              🔄 Cambiar en carta
            </span>
          </div>
        ) : (
          <div className="no-dish-selected-alert" onClick={() => setIsModalOpen(true)}>
            <span>⚠️ Aún no has seleccionado un plato. Haz clic aquí para <strong>abrir la carta de platos</strong>.</span>
          </div>
        )}
      </form>

      {/* Controles de atención y estado del último atendido */}
      <div className="form-row" style={{ marginTop: "1rem" }}>
        <button className="btn btn-ghost" onClick={atenderSiguiente} disabled={clientes.length === 0}>
          Atender siguiente (FIFO)
        </button>
        {ultimoAtendido && (
          <span style={{ color: "#C9AD8F", fontSize: "0.85rem", alignSelf: "center" }}>
            Último atendido: <strong style={{ color: "var(--accent-soft)" }}>{ultimoAtendido.nombre}</strong> (
            <em>{ultimoAtendido.pedido}</em>)
          </span>
        )}
      </div>

      {/* Riel de tickets (FIFO Queue) */}
      <div className="ticket-rail" key={refreshTick}>
        {clientes.length === 0 && <div className="empty-state">No hay clientes en la fila.</div>}
        {clientes.map((c, i) => (
          <div className={`ticket ${i === 0 ? "ticket-next" : ""}`} key={c.id}>
            <div className="ticket-head">
              <span>Turno #{c.id}</span>
              <span>{c.llegada}</span>
            </div>
            <div className="ticket-name">{c.nombre}</div>
            <div className="ticket-order">{c.pedido}</div>
          </div>
        ))}
      </div>

      {/* Modal con imágenes de la Carta de Comidas */}
      <ModalCartaComidas
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelectComida={handleSelectFromModal}
        comidaSeleccionada={platoSeleccionado} 
      />
    </section>
  );
}
