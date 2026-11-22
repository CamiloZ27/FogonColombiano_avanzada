import React, { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../services/api.service';

interface Categoria {
  id: number;
  nombre: string;
  nombre_normalizado: string;
  descripcion: string;
  activa: boolean;
  total_items: number;
}

interface ItemCatalogo {
  id: number;
  categoria_id: number;
  categoria_nombre: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  precio: number;
  stock: number;
  stock_minimo: number;
  activo: boolean;
}

interface PedidoItem {
  id: number;
  item_id: number;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

interface Pedido {
  id: number;
  usuario_id: number;
  cliente_nombre: string;
  canal: 'presencial' | 'web' | 'app' | 'domicilio';
  estado: 'solicitado' | 'en_proceso' | 'listo' | 'entregado' | 'anulado';
  subtotal: number;
  observaciones: string;
  hash_integridad: string | null;
  factura_id: number | null;
  factura_numero: string | null;
  fecha_pedido: string;
  items: PedidoItem[];
}

interface Factura {
  id: number;
  numero_consecutivo: string;
  pedido_id: number | null;
  cliente_nombre: string;
  subtotal: number;
  porcentaje_impuesto: number;
  impuesto: number;
  porcentaje_descuento: number;
  descuento: number;
  total: number;
  estado: string;
  hash_anterior: string;
  hash_actual: string;
  fecha_emision: string;
}

interface Pago {
  id: number;
  factura_id: number;
  numero_consecutivo: string;
  cliente_nombre: string;
  monto: number;
  metodo_pago: string;
  referencia_pago: string;
  comprobante_nombre: string | null;
  comprobante_hash: string | null;
  estado: string;
  hash_anterior: string;
  hash_actual: string;
  clasificacion_ia: string;
  score_fraude_ia: number;
  fecha_pago: string;
}

function fmtCOP(v: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v || 0);
}

export const OperacionRestaurante: React.FC = () => {
  const { tienePermiso } = useAuth();
  const puedeCrudCatalogo = tienePermiso('catalogo:crud');
  const puedeCrearPedido = tienePermiso('pedidos:crear');
  const puedeCocina = tienePermiso('pedidos:cocina');
  const puedeAnular = tienePermiso('pedidos:anular');
  const puedeVerFacturas = tienePermiso('facturas:ver');
  const puedeCrearFacturas = tienePermiso('facturas:crear');
  const puedeVerPagos = tienePermiso('pagos:ver');
  const puedeCrearPagos = tienePermiso('pagos:crear');

  const [tab, setTab] = useState<'catalogo' | 'pedidos' | 'facturas' | 'pagos'>('pedidos');
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [items, setItems] = useState<ItemCatalogo[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Forms Categoría e Ítem
  const [catNombre, setCatNombre] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [itemCatId, setItemCatId] = useState('');
  const [itemNombre, setItemNombre] = useState('');
  const [itemPrecio, setItemPrecio] = useState('28000');
  const [itemStock, setItemStock] = useState('30');
  const [itemDesc, setItemDesc] = useState('');

  // Form Pedido multi-ítem
  const [canal, setCanal] = useState<'presencial' | 'web' | 'app' | 'domicilio'>('presencial');
  const [obsPedido, setObsPedido] = useState('');
  const [carrito, setCarrito] = useState<Array<{ item_id: number; nombre: string; precio: number; cantidad: number }>>([]);
  const [itemElegido, setItemElegido] = useState('');
  const [cantElegida, setCantElegida] = useState(1);

  // Form Factura
  const [pedidoAFacturar, setPedidoAFacturar] = useState('');
  const [descuentoPct, setDescuentoPct] = useState('0');

  // Form Pago con comprobante
  const [facturaAPagar, setFacturaAPagar] = useState('');
  const [metodoPago, setMetodoPago] = useState('nequi');
  const [refPago, setRefPago] = useState('');
  const [compNombre, setCompNombre] = useState('');
  const [compMime, setCompMime] = useState('text/plain');
  const [compContenido, setCompContenido] = useState('');

  async function cargarDatos() {
    setError(null);
    try {
      const promesas: Promise<unknown>[] = [
        apiRequest<{ categorias: Categoria[] }>('/api/operacion/categorias').then((r) => {
          setCategorias(r.categorias);
          if (!itemCatId && r.categorias[0]) setItemCatId(String(r.categorias[0].id));
        }),
        apiRequest<{ items: ItemCatalogo[] }>('/api/operacion/items').then((r) => {
          setItems(r.items);
          if (!itemElegido && r.items[0]) setItemElegido(String(r.items[0].id));
        }),
        apiRequest<{ pedidos: Pedido[] }>('/api/operacion/pedidos').then((r) => setPedidos(r.pedidos)),
      ];
      if (puedeVerFacturas) {
        promesas.push(apiRequest<{ facturas: Factura[] }>('/api/operacion/facturas').then((r) => setFacturas(r.facturas)));
      }
      if (puedeVerPagos) {
        promesas.push(apiRequest<{ pagos: Pago[] }>('/api/operacion/pagos').then((r) => setPagos(r.pagos)));
      }
      await Promise.all(promesas);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando módulos operativos');
    }
  }

  useEffect(() => {
    cargarDatos();
  }, []);

  async function handleCrearCategoria(e: FormEvent) {
    e.preventDefault();
    setMensaje(null);
    setError(null);
    try {
      await apiRequest('/api/operacion/categorias', {
        method: 'POST',
        body: { nombre: catNombre, descripcion: catDesc },
      });
      setMensaje('Categoría creada y normalizada.');
      setCatNombre('');
      setCatDesc('');
      cargarDatos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creando categoría');
    }
  }

  async function handleCrearItem(e: FormEvent) {
    e.preventDefault();
    setMensaje(null);
    setError(null);
    try {
      const r = await apiRequest<{ mensaje: string }>('/api/operacion/items', {
        method: 'POST',
        body: {
          categoria_id: Number(itemCatId),
          nombre: itemNombre,
          precio: itemPrecio,
          stock: Number(itemStock),
          descripcion: itemDesc,
        },
      });
      setMensaje(r.mensaje);
      setItemNombre('');
      setItemDesc('');
      cargarDatos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creando ítem');
    }
  }

  async function ajustarStock(item: ItemCatalogo, delta: number) {
    try {
      await apiRequest(`/api/operacion/items/${item.id}`, {
        method: 'PUT',
        body: { stock: Math.max(0, item.stock + delta) },
      });
      cargarDatos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error ajustando stock');
    }
  }

  function agregarAlCarrito() {
    const it = items.find((x) => x.id === Number(itemElegido));
    if (!it || cantElegida <= 0) return;
    setCarrito((prev) => {
      const idx = prev.findIndex((p) => p.item_id === it.id);
      if (idx >= 0) {
        const copia = [...prev];
        const actual = copia[idx];
        if (actual) {
          copia[idx] = { ...actual, cantidad: actual.cantidad + cantElegida };
        }
        return copia;
      }
      return [...prev, { item_id: it.id, nombre: it.nombre, precio: it.precio, cantidad: cantElegida }];
    });
  }

  async function handleCrearPedido(e: FormEvent) {
    e.preventDefault();
    if (carrito.length === 0) return;
    setMensaje(null);
    setError(null);
    try {
      const r = await apiRequest<{ mensaje: string }>('/api/operacion/pedidos', {
        method: 'POST',
        body: {
          canal,
          observaciones: obsPedido,
          items: carrito.map((c) => ({ item_id: c.item_id, cantidad: c.cantidad })),
        },
      });
      setMensaje(r.mensaje);
      setCarrito([]);
      setObsPedido('');
      cargarDatos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creando pedido');
    }
  }

  async function cambiarEstadoPedido(id: number, estado: Pedido['estado']) {
    setMensaje(null);
    setError(null);
    try {
      const r = await apiRequest<{ mensaje: string }>(`/api/operacion/pedidos/${id}/estado`, {
        method: 'PATCH',
        body: { estado },
      });
      setMensaje(r.mensaje);
      cargarDatos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cambiando estado');
    }
  }

  async function handleEmitirFactura(e: FormEvent) {
    e.preventDefault();
    setMensaje(null);
    setError(null);
    try {
      const r = await apiRequest<{ mensaje: string }>('/api/operacion/facturas', {
        method: 'POST',
        body: {
          pedido_id: Number(pedidoAFacturar),
          porcentaje_descuento: Number(descuentoPct),
        },
      });
      setMensaje(r.mensaje);
      setPedidoAFacturar('');
      setDescuentoPct('0');
      cargarDatos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error emitiendo factura');
    }
  }

  function handleArchivoComprobante(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompNombre(file.name);
    setCompMime(file.type || 'application/octet-stream');
    const reader = new FileReader();
    reader.onload = () => {
      setCompContenido(String(reader.result || ''));
    };
    reader.readAsDataURL(file);
  }

  async function handleProcesarPago(e: FormEvent) {
    e.preventDefault();
    setMensaje(null);
    setError(null);
    try {
      const r = await apiRequest<{ mensaje: string }>('/api/operacion/pagos', {
        method: 'POST',
        body: {
          factura_id: Number(facturaAPagar),
          metodo_pago: metodoPago,
          referencia_pago: refPago || `REF-${Date.now()}`,
          comprobante_nombre: compNombre || undefined,
          comprobante_mime: compMime,
          comprobante_contenido: compContenido || undefined,
        },
      });
      setMensaje(r.mensaje);
      setFacturaAPagar('');
      setRefPago('');
      setCompNombre('');
      setCompContenido('');
      cargarDatos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error procesando pago');
    }
  }

  const pedidosSinFactura = pedidos.filter((p) => !p.factura_id && p.estado !== 'anulado');
  const facturasPendientes = facturas.filter((f) => f.estado === 'emitida');

  return (
    <section>
      <div className="panel-heading">
        <h1>Módulos Operativos · Fogón Colombiano</h1>
        <p>
          Gestión integral persistida en PostgreSQL: categorías, ítems con inventario, pedidos multi-ítem por canal con
          descuento automático de stock, facturación consecutiva con hash encadenado y pagos con comprobante e IA.
        </p>
      </div>

      <div className="scenarios-buttons" style={{ marginBottom: '1.5rem' }}>
        <button className={`modal-filter-btn ${tab === 'pedidos' ? 'active' : ''}`} onClick={() => setTab('pedidos')}>
          Pedidos &amp; Cocina ({pedidos.length})
        </button>
        <button className={`modal-filter-btn ${tab === 'catalogo' ? 'active' : ''}`} onClick={() => setTab('catalogo')}>
          Categorías &amp; Inventario ({items.length})
        </button>
        {puedeVerFacturas && (
          <button className={`modal-filter-btn ${tab === 'facturas' ? 'active' : ''}`} onClick={() => setTab('facturas')}>
            Facturación Encadenada ({facturas.length})
          </button>
        )}
        {puedeVerPagos && (
          <button className={`modal-filter-btn ${tab === 'pagos' ? 'active' : ''}`} onClick={() => setTab('pagos')}>
            Pagos &amp; Comprobantes ({pagos.length})
          </button>
        )}
      </div>

      {mensaje && (
        <div className="alert-success" style={{ marginBottom: '1rem' }}>
          {mensaje}
        </div>
      )}
      {error && (
        <div className="order-card-not-found" style={{ marginBottom: '1rem' }}>
          <span className="not-found-icon">⚠️</span>
          <div>{error}</div>
        </div>
      )}

      {/* TAB PEDIDOS */}
      {tab === 'pedidos' && (
        <>
          {puedeCrearPedido && (
            <div className="add-order-box" style={{ marginBottom: '1.5rem' }}>
              <h2 className="add-order-title">Nuevo Pedido Multi-Ítem (Descuenta Inventario)</h2>
              <form className="add-order-form" onSubmit={handleCrearPedido}>
                <div className="form-grid-inputs">
                  <div className="field">
                    <label>Canal</label>
                    <select value={canal} onChange={(e) => setCanal(e.target.value as Pedido['canal'])}>
                      <option value="presencial">Presencial</option>
                      <option value="web">Web</option>
                      <option value="app">App móvil</option>
                      <option value="domicilio">Domicilio</option>
                    </select>
                  </div>
                  <div className="field" style={{ flex: 2 }}>
                    <label>Agregar Plato del Catálogo</label>
                    <select value={itemElegido} onChange={(e) => setItemElegido(e.target.value)}>
                      {items
                        .filter((i) => i.activo)
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.nombre} — {fmtCOP(i.precio)} (Stock: {i.stock})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Cantidad</label>
                    <input
                      type="number"
                      min={1}
                      value={cantElegida}
                      onChange={(e) => setCantElegida(Math.max(1, Number(e.target.value)))}
                    />
                  </div>
                  <div className="field" style={{ justifyContent: 'flex-end' }}>
                    <label>&nbsp;</label>
                    <button type="button" className="btn btn-ghost" onClick={agregarAlCarrito}>
                      + Añadir ítem
                    </button>
                  </div>
                </div>

                {carrito.length > 0 && (
                  <div style={{ margin: '0.8rem 0', padding: '0.8rem', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--rule)' }}>
                    <strong>Ítems del pedido:</strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                      {carrito.map((c) => (
                        <button
                          key={c.item_id}
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setCarrito((p) => p.filter((x) => x.item_id !== c.item_id))}
                        >
                          {c.cantidad}× {c.nombre} ({fmtCOP(c.precio * c.cantidad)}) ×
                        </button>
                      ))}
                    </div>
                    <div style={{ marginTop: '0.5rem', color: 'var(--accent-soft)', fontWeight: 700 }}>
                      Subtotal: {fmtCOP(carrito.reduce((s, x) => s + x.precio * x.cantidad, 0))}
                    </div>
                  </div>
                )}

                <div className="form-row" style={{ marginBottom: 0 }}>
                  <input
                    placeholder="Observaciones (ej. sin cebolla, mesa 4, dirección de entrega...)"
                    value={obsPedido}
                    onChange={(e) => setObsPedido(e.target.value)}
                  />
                  <button className="btn btn-accent" type="submit" disabled={carrito.length === 0}>
                    Confirmar Pedido y Descontar Stock
                  </button>
                </div>
              </form>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table className="bigo-table">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente / Canal</th>
                  <th>Ítems</th>
                  <th>Subtotal</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>#{p.id}</strong>
                      <div style={{ fontSize: '0.72rem', color: '#A89078' }}>
                        {new Date(p.fecha_pedido).toLocaleString('es-CO')}
                      </div>
                      {p.factura_numero && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--sage)' }}>{p.factura_numero}</div>
                      )}
                    </td>
                    <td>
                      <div>{p.cliente_nombre}</div>
                      <span className="tag-orange" style={{ fontSize: '0.74rem', textTransform: 'capitalize' }}>
                        {p.canal}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {p.items.map((it) => (
                        <div key={it.id}>
                          {it.cantidad}× {it.nombre}
                        </div>
                      ))}
                    </td>
                    <td>
                      <strong>{fmtCOP(p.subtotal)}</strong>
                    </td>
                    <td>
                      <span
                        className={`order-status-badge ${
                          p.estado === 'entregado'
                            ? 'status-entregado'
                            : p.estado === 'anulado'
                            ? 'status-solicitado'
                            : 'status-en-proceso'
                        }`}
                      >
                        {p.estado}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        {(puedeCocina || puedeCrearPedido) && p.estado === 'solicitado' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => cambiarEstadoPedido(p.id, 'en_proceso')}>
                            Preparar
                          </button>
                        )}
                        {(puedeCocina || puedeCrearPedido) && p.estado === 'en_proceso' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => cambiarEstadoPedido(p.id, 'listo')}>
                            Listo
                          </button>
                        )}
                        {(puedeCocina || puedeCrearPedido) && p.estado === 'listo' && (
                          <button className="btn btn-accent btn-sm" onClick={() => cambiarEstadoPedido(p.id, 'entregado')}>
                            Entregar
                          </button>
                        )}
                        {puedeAnular && p.estado !== 'anulado' && p.estado !== 'entregado' && (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: '#ef4444' }}
                            onClick={() => cambiarEstadoPedido(p.id, 'anulado')}
                          >
                            Anular
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* TAB CATÁLOGO & INVENTARIO */}
      {tab === 'catalogo' && (
        <>
          {puedeCrudCatalogo && (
            <div className="grid-two" style={{ marginBottom: '1.5rem' }}>
              <div className="add-order-box">
                <h2 className="add-order-title">Nueva Categoría</h2>
                <form className="add-order-form" onSubmit={handleCrearCategoria} style={{ display: 'grid', gap: '0.7rem' }}>
                  <input
                    placeholder="Nombre (se normaliza automáticamente)"
                    value={catNombre}
                    onChange={(e) => setCatNombre(e.target.value)}
                    required
                  />
                  <input
                    placeholder="Descripción breve"
                    value={catDesc}
                    onChange={(e) => setCatDesc(e.target.value)}
                  />
                  <button className="btn btn-accent" type="submit">
                    Guardar Categoría
                  </button>
                </form>
              </div>

              <div className="add-order-box">
                <h2 className="add-order-title">Nuevo Ítem / Plato</h2>
                <form className="add-order-form" onSubmit={handleCrearItem} style={{ display: 'grid', gap: '0.7rem' }}>
                  <select value={itemCatId} onChange={(e) => setItemCatId(e.target.value)} required>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="Nombre del plato o bebida"
                    value={itemNombre}
                    onChange={(e) => setItemNombre(e.target.value)}
                    required
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <input
                      placeholder="Precio (ej. 35000 o $ 35.000)"
                      value={itemPrecio}
                      onChange={(e) => setItemPrecio(e.target.value)}
                      required
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="Stock inicial"
                      value={itemStock}
                      onChange={(e) => setItemStock(e.target.value)}
                      required
                    />
                  </div>
                  <input
                    placeholder="Descripción"
                    value={itemDesc}
                    onChange={(e) => setItemDesc(e.target.value)}
                  />
                  <button className="btn btn-accent" type="submit">
                    Crear Ítem en Catálogo
                  </button>
                </form>
              </div>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table className="bigo-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Ítem</th>
                  <th>Categoría</th>
                  <th>Precio</th>
                  <th>Inventario</th>
                  {puedeCrudCatalogo && <th>Ajustar Stock</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{it.codigo}</td>
                    <td>
                      <strong>{it.nombre}</strong>
                      <div style={{ fontSize: '0.74rem', color: '#A89078' }}>{it.descripcion}</div>
                    </td>
                    <td>{it.categoria_nombre}</td>
                    <td className="tag-orange">{fmtCOP(it.precio)}</td>
                    <td>
                      <strong style={{ color: it.stock <= it.stock_minimo ? '#ef4444' : 'var(--sage)' }}>
                        {it.stock} uds
                      </strong>
                    </td>
                    {puedeCrudCatalogo && (
                      <td>
                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => ajustarStock(it, 10)}>
                            +10
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => ajustarStock(it, -1)}>
                            -1
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* TAB FACTURACIÓN */}
      {tab === 'facturas' && (
        <>
          {puedeCrearFacturas && (
            <div className="add-order-box" style={{ marginBottom: '1.5rem' }}>
              <h2 className="add-order-title">Emitir Factura Consecutiva con Hash Encadenado</h2>
              <form className="form-row" onSubmit={handleEmitirFactura} style={{ marginBottom: 0 }}>
                <select value={pedidoAFacturar} onChange={(e) => setPedidoAFacturar(e.target.value)} required>
                  <option value="">Selecciona un pedido pendiente de facturar...</option>
                  {pedidosSinFactura.map((p) => (
                    <option key={p.id} value={p.id}>
                      Pedido #{p.id} · {p.cliente_nombre} · {fmtCOP(p.subtotal)} ({p.canal})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  max={80}
                  value={descuentoPct}
                  onChange={(e) => setDescuentoPct(e.target.value)}
                  placeholder="Descuento %"
                  style={{ maxWidth: '150px' }}
                />
                <button className="btn btn-accent" type="submit" disabled={!pedidoAFacturar}>
                  Generar Factura + Sello Hash
                </button>
              </form>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table className="bigo-table">
              <thead>
                <tr>
                  <th>Consecutivo</th>
                  <th>Cliente</th>
                  <th>Subtotal / INC / Desc.</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th>Hash Encadenado (HMAC-SHA256)</th>
                </tr>
              </thead>
              <tbody>
                {facturas.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <strong>{f.numero_consecutivo}</strong>
                      <div style={{ fontSize: '0.72rem', color: '#A89078' }}>Pedido #{f.pedido_id ?? '—'}</div>
                    </td>
                    <td>{f.cliente_nombre}</td>
                    <td style={{ fontSize: '0.78rem' }}>
                      Sub: {fmtCOP(f.subtotal)}
                      <br />
                      INC ({f.porcentaje_impuesto}%): {fmtCOP(f.impuesto)}
                      <br />
                      Desc ({f.porcentaje_descuento}%): -{fmtCOP(f.descuento)}
                    </td>
                    <td className="tag-orange">
                      <strong>{fmtCOP(f.total)}</strong>
                    </td>
                    <td>
                      <span className={`order-status-badge ${f.estado === 'pagada' ? 'status-entregado' : 'status-en-proceso'}`}>
                        {f.estado}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', maxWidth: '210px', wordBreak: 'break-all' }}>
                      <div style={{ color: '#A89078' }}>Prev: {f.hash_anterior.slice(0, 14)}…</div>
                      <div style={{ color: 'var(--sage)' }}>Act: {f.hash_actual.slice(0, 18)}…</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* TAB PAGOS CON COMPROBANTE */}
      {tab === 'pagos' && (
        <>
          {puedeCrearPagos && (
            <div className="add-order-box" style={{ marginBottom: '1.5rem' }}>
              <h2 className="add-order-title">Procesar Pago con Comprobante + Evaluación IA Keras</h2>
              <form className="add-order-form" onSubmit={handleProcesarPago} style={{ display: 'grid', gap: '0.8rem' }}>
                <div className="form-grid-inputs">
                  <div className="field" style={{ flex: 2 }}>
                    <label>Factura pendiente</label>
                    <select value={facturaAPagar} onChange={(e) => setFacturaAPagar(e.target.value)} required>
                      <option value="">Selecciona factura...</option>
                      {facturasPendientes.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.numero_consecutivo} · {f.cliente_nombre} · {fmtCOP(f.total)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Método de pago</label>
                    <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
                      <option value="efectivo">Efectivo</option>
                      <option value="tarjeta_credito">Tarjeta de Crédito</option>
                      <option value="tarjeta_debito">Tarjeta de Débito</option>
                      <option value="nequi">Nequi</option>
                      <option value="daviplata">Daviplata</option>
                      <option value="transferencia">Transferencia Bancaria</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Referencia</label>
                    <input value={refPago} onChange={(e) => setRefPago(e.target.value)} placeholder="Ej. NEQ-984512" />
                  </div>
                </div>
                <div className="form-row" style={{ marginBottom: 0, alignItems: 'center' }}>
                  <input type="file" onChange={handleArchivoComprobante} accept="image/*,.pdf,.txt" />
                  <button className="btn btn-accent" type="submit" disabled={!facturaAPagar}>
                    Registrar Pago + Sellar Comprobante (SHA-256)
                  </button>
                </div>
                {compNombre && (
                  <small style={{ color: 'var(--accent-soft)' }}>
                    📎 Comprobante adjunto: <strong>{compNombre}</strong> (se sellará con SHA-256 en el servidor).
                  </small>
                )}
              </form>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table className="bigo-table">
              <thead>
                <tr>
                  <th>Pago / Factura</th>
                  <th>Método &amp; Monto</th>
                  <th>Comprobante (SHA-256)</th>
                  <th>Veredicto IA Keras</th>
                  <th>Hash Encadenado</th>
                </tr>
              </thead>
              <tbody>
                {pagos.map((pg) => (
                  <tr key={pg.id}>
                    <td>
                      <strong>PAGO #{pg.id}</strong>
                      <div style={{ fontSize: '0.75rem', color: '#C9AD8F' }}>{pg.numero_consecutivo} · {pg.cliente_nombre}</div>
                    </td>
                    <td>
                      <div className="tag-orange">{fmtCOP(pg.monto)}</div>
                      <div style={{ fontSize: '0.75rem', textTransform: 'capitalize' }}>{pg.metodo_pago}</div>
                    </td>
                    <td style={{ fontSize: '0.74rem', fontFamily: 'var(--font-mono)' }}>
                      <div>{pg.comprobante_nombre ?? 'Sin archivo'}</div>
                      <div style={{ color: '#A89078' }}>{pg.comprobante_hash ? pg.comprobante_hash.slice(0, 16) + '…' : '—'}</div>
                    </td>
                    <td>
                      <span
                        className={`order-status-badge ${
                          pg.clasificacion_ia === 'fraudulenta' ? 'status-solicitado' : 'status-entregado'
                        }`}
                      >
                        {pg.clasificacion_ia.toUpperCase()} ({(pg.score_fraude_ia * 100).toFixed(1)}%)
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>
                      {pg.hash_actual.slice(0, 18)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
};
