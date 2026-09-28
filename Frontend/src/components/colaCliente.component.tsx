import { FormEvent, useState } from "react";
import { ComidaTipica } from "../datasets/datasetComidas.data";
import { Cliente } from "../types/clientes.types";
import { PropsColas } from "../types/operaciones.types";
import { ModalCartaComidas } from "./modalCartaComidas.component";

function now(): string {
  return new Date().toLocaleTimeString("es-CO", { hour12: false });
}

export function ColaDeClientes({ queue, nextId, onNextIdChange, onLog, refreshTick, bumpTick }: PropsColas) {
  const [nombre, setNombre] = useState("");
  const [platosSeleccionados, setPlatosSeleccionados] = useState<ComidaTipica[]>([]);
  const [ultimoAtendido, setUltimoAtendido] = useState<Cliente | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const clientes = queue.toArray();

  function agregarCliente(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || platosSeleccionados.length === 0) return;

    const client: Cliente = {
      id: nextId,
      nombre: nombre.trim(),
      pedido: platosSeleccionados.map((plato) => plato.nombre),
      llegada: now(),
    };

    queue.enqueue(client);
    onLog({ tipo: "cliente_agregado", detalle: `${client.nombre} — ${client.pedido.join(", ")}` });
    onNextIdChange(nextId + 1);
    setNombre("");
    setPlatosSeleccionados([]);
    bumpTick();
  }

  function atenderSiguiente() {
    const atendido = queue.dequeue();
    if (!atendido) return;
    setUltimoAtendido(atendido);
    onLog({ tipo: "cliente_atendido", detalle: `${atendido.nombre} — ${atendido.pedido.join(", ")}` });
    bumpTick();
  }

  function handleSelectFromModal(comida: ComidaTipica) {
    setPlatosSeleccionados((platos) => [...platos, comida]);
  }

  function quitarPlato(indice: number) {
    setPlatosSeleccionados((platos) => platos.filter((_, i) => i !== indice));
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
            <span>{platosSeleccionados.length > 0 ? "Agregar otro plato" : "Seleccionar platos"}</span>
          </button>

          <button
            className="btn btn-accent"
            type="submit"
            disabled={!nombre.trim() || platosSeleccionados.length === 0}
          >
            Agregar a la fila
          </button>
        </div>

        {platosSeleccionados.length > 0 ? (
          <div className="selected-dish-preview">
            <div className="preview-dish-details">
              <span className="preview-dish-name">Platos de la orden ({platosSeleccionados.length})</span>
              <div className="form-row">
                {platosSeleccionados.map((plato, indice) => (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    key={`${plato.id}-${indice}`}
                    onClick={() => quitarPlato(indice)}
                    title="Quitar plato"
                  >
                    {plato.nombre} ×
                  </button>
                ))}
              </div>
            </div>
            <span className="btn-dish-change-tag" onClick={() => setIsModalOpen(true)}>
              🍽️ Agregar otro
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
            <em>{ultimoAtendido.pedido.join(", ")}</em>)
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
            <div className="ticket-order">{c.pedido.join(", ")}</div>
          </div>
        ))}
      </div>

      {/* Modal con imágenes de la Carta de Comidas */}
      <ModalCartaComidas
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelectComida={handleSelectFromModal}
        comidasSeleccionadas={platosSeleccionados}
      />
    </section>
  );
}
