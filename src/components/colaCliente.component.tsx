import { FormEvent, useState } from "react";
import { Cliente } from "../types/clientes.types";
import { PropsColas } from "../types/operaciones.types";

function now(): string {
  return new Date().toLocaleTimeString("es-CO", { hour12: false });
}

export function ColaDeClientes({ queue, nextId, onNextIdChange, onLog, refreshTick, bumpTick }: PropsColas) {
  const [nombre, setNombre] = useState("");
  const [pedido, setPedido] = useState("");
  const [ultimoAtendido, setUltimoAtendido] = useState<Cliente | null>(null);

  const clientes = queue.toArray();

  function agregarCliente(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !pedido.trim()) return;

    const client: Cliente = { id: nextId, nombre: nombre.trim(), pedido: pedido.trim(), llegada: now() };
    queue.enqueue(client);
    onLog({ tipo: "cliente_agregado", detalle: `${client.nombre} — ${client.pedido}` });
    onNextIdChange(nextId + 1);
    setNombre("");
    setPedido("");
    bumpTick();
  }

  function atenderSiguiente() {
    const atendido = queue.dequeue();
    if (!atendido) return;
    setUltimoAtendido(atendido);
    onLog({ tipo: "cliente_atendido", detalle: `${atendido.nombre} — ${atendido.pedido}` });
    bumpTick();
  }

  return (
    <section>
      <div className="panel-heading" >
        <h1>Cola de clientes </h1>
        <p>
          Los clientes se atienden en el orden en que llegan(FIFO).El primero de la fila es
          siempre el siguiente en ser atendido.
        </p>
      </div>

      < form className="form-row" onSubmit={agregarCliente} >
        <input
          placeholder="Nombre del cliente"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)
          }
        />
        < input
          placeholder="Pedido"
          value={pedido}
          onChange={(e) => setPedido(e.target.value)}
        />
        < button className="btn btn-accent" type="submit" >
          Agregar a la fila
        </button>
      </form>

      < div className="form-row" style={{ marginTop: "-0.9rem" }}>
        <button className="btn btn-ghost" onClick={atenderSiguiente} disabled={clientes.length === 0} >
          Atender siguiente
        </button>
        {
          ultimoAtendido && (
            <span style={{ color: "#C9AD8F", fontSize: "0.85rem", alignSelf: "center" }}>
              Último atendido: <strong style={{ color: "var(--accent-soft)" }}> {ultimoAtendido.nombre} </strong>
            </span>
          )
        }
      </div>

      < div className="ticket-rail" key={refreshTick} >
        {clientes.length === 0 && <div className="empty-state"> No hay clientes en la fila.</div>}
        {
          clientes.map((c, i) => (
            <div className={`ticket ${i === 0 ? "ticket-next" : ""}`} key={c.id} >
              <div className="ticket-head" >
                <span>Turno #{c.id} </span>
                < span > {c.llegada} </span>
              </div>
              < div className="ticket-name" > {c.nombre} </div>
              < div className="ticket-order" > {c.pedido} </div>
            </div>
          ))}
      </div>
    </section>
  );
}
