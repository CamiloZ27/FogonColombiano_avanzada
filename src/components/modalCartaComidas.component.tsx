import { useEffect, useState } from "react";
import { COMIDAS_TIPICAS, ComidaTipica } from "../datasets/datasetComidas.data";

interface PropsModalCarta {
  isOpen: boolean;
  onClose: () => void;
  onSelectComida: (comida: ComidaTipica) => void;
  comidaSeleccionada?: ComidaTipica | null;
}

type CategoriaFiltro = "Todas" | "Platos Fuertes" | "Sopas Tradicionales" | "Antojos & Amasijos" | "Postres";

export function ModalCartaComidas({
  isOpen,
  onClose,
  onSelectComida,
  comidaSeleccionada,
}: PropsModalCarta) {
  const [categoriaActiva, setCategoriaActiva] = useState<CategoriaFiltro>("Todas");

  // Cerrar modal al presionar la tecla Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Bloquear el scroll de fondo mientras el modal está abierto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const platosFiltrados =
    categoriaActiva === "Todas"
      ? COMIDAS_TIPICAS
      : COMIDAS_TIPICAS.filter((c) => c.categoria === categoriaActiva);

  function handleSeleccionar(plato: ComidaTipica) {
    onSelectComida(plato);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Encabezado del Modal */}
        <div className="modal-header">
          <div>
            <span className="modal-kicker">Fogón Colombiano • Especialidades de Nuestra Tierra</span>
            <h2 className="modal-title">Nuestra Carta de Comidas Típicas</h2>
            <p className="modal-subtitle">
              Haz clic sobre cualquier plato o en el botón <strong>&quot;Elegir este plato&quot;</strong> para agregarlo a tu orden.
            </p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Cerrar ventana">
            ✕
          </button>
        </div>

        {/* Barra de Filtros por Categoría */}
        <div className="modal-filters-bar">
          {(["Todas", "Platos Fuertes", "Sopas Tradicionales", "Antojos & Amasijos", "Postres"] as CategoriaFiltro[]).map(
            (cat) => (
              <button
                key={cat}
                type="button"
                className={`modal-filter-btn ${categoriaActiva === cat ? "active" : ""}`}
                onClick={() => setCategoriaActiva(cat)}
              >
                {cat === "Todas" ? "✨ Toda la Carta" : cat}
              </button>
            )
          )}
        </div>

        {/* Cuadrícula de Platos */}
        <div className="modal-dishes-grid">
          {platosFiltrados.map((plato) => {
            const isSelected = comidaSeleccionada?.id === plato.id;

            return (
              <div
                key={plato.id}
                className={`dish-card ${isSelected ? "dish-selected" : ""}`}
                onClick={() => handleSeleccionar(plato)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    handleSeleccionar(plato);
                  }
                }}
              >
                <div className="dish-img-wrap" style={{ background: plato.colorGradiente }}>
                  <img
                    src={plato.imagen}
                    alt={plato.nombre}
                    className="dish-img"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const img = e.currentTarget as HTMLImageElement;
                      // 3-level fallback: imagen → imagenSecundaria → svgFallback
                      if (!img.dataset.triedSecondary && plato.imagenSecundaria) {
                        img.dataset.triedSecondary = "1";
                        img.src = plato.imagenSecundaria;
                      } else if (!img.dataset.triedSvg) {
                        img.dataset.triedSvg = "1";
                        img.src = plato.svgFallback;
                      }
                    }}
                  />
                  <span className="dish-badge-time">⏱️ {plato.tiempoMin} min</span>
                  <span className="dish-badge-cat">{plato.categoria}</span>
                </div>

                <div className="dish-info">
                  <div className="dish-title-row">
                    <h3 className="dish-name">{plato.nombre}</h3>
                    <span className="dish-price">
                      {plato.precio.toLocaleString("es-CO", {
                        style: "currency",
                        currency: "COP",
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  </div>

                  <p className="dish-desc">{plato.descripcion}</p>

                  <div className="dish-select-action">
                    <button
                      type="button"
                      className={`btn btn-choose-dish ${isSelected ? "btn-accent" : "btn-accent-soft"}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSeleccionar(plato);
                      }}
                    >
                      {isSelected ? "✓ Seleccionado (Confirmar)" : "🍽️ Elegir este plato"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pie del Modal */}
        <div className="modal-footer">
          <span className="modal-footer-hint">
            💡 Al pulsar sobre un plato se seleccionará y se cerrará esta ventana automáticamente.
          </span>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Volver a la cola
          </button>
        </div>
      </div>
    </div>
  );
}
