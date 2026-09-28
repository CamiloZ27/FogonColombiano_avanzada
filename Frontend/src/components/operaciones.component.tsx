
import { LogOperaciones, PropsPilas } from "../types/operaciones.types";

const LABELS: Record<LogOperaciones["tipo"], string> = {
  cliente_agregado: "Cliente agregado a la fila",
  cliente_atendido: "Cliente atendido",
  ruta_calculada: "Ruta calculada",
  busqueda_pedido: "Búsqueda Big O",
};

export function PilaDeOperaciones({ stack, refreshTick }: PropsPilas) {
  const operaciones = stack.toArray(); // la más reciente primero

  return (
    <section>
      <div className="panel-heading">
        <h1>Operaciones recientes</h1>
        <p>
          Cada acción del sistema se apila (LIFO). La operación en la cima es siempre la más
          reciente, útil para auditar o deshacer el último movimiento.
        </p>
      </div>

      <div className="receipt-stack" key={refreshTick}>
        {operaciones.length === 0 && <div className="empty-state">Aún no se han registrado operaciones.</div>}
        {operaciones.map((op, i) => (
          <div className={`receipt ${i === 0 ? "top" : ""}`} key={op.id}>
            <span className="receipt-detail">
              <strong>{LABELS[op.tipo]}</strong> — {op.detalle}
            </span>
            <span className="receipt-time">{op.hora}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
