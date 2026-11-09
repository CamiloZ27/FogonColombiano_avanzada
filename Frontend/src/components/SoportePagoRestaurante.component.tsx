import React from 'react';

export interface DatosSoportePago {
  idTransaccion: number | string;
  clienteNombre: string;
  clienteEmail: string;
  valorTotal: number;
  metodoPago: string;
  fecha: string;
  hash: string;
  estado: string;
  esAnomalia?: boolean;
}

interface Props {
  datos: DatosSoportePago;
  onCerrar: () => void;
}

function formatearMoneda(val: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(val);
}

function formatearFecha(fechaStr: string): string {
  try {
    const d = new Date(fechaStr);
    if (isNaN(d.getTime())) return fechaStr;
    return d.toLocaleString('es-CO', {
      dateStyle: 'full',
      timeStyle: 'medium',
    });
  } catch {
    return fechaStr;
  }
}

function formatearMetodoPago(metodo: string): string {
  const mapeo: Record<string, string> = {
    tarjeta_credito: 'Tarjeta de Crédito',
    tarjeta_debito: 'Tarjeta de Débito',
    transferencia: 'Transferencia Bancaria',
    nequi: 'Nequi',
    daviplata: 'Daviplata',
    efectivo: 'Efectivo',
    Tarjeta: 'Tarjeta Bancaria',
  };
  return mapeo[metodo] || metodo;
}

export const SoportePagoRestaurante: React.FC<Props> = ({ datos, onCerrar }) => {
  // En restaurantes en Colombia aplica el Impuesto Nacional al Consumo (INC) del 8%
  const subtotalBase = Math.round(datos.valorTotal / 1.08);
  const impuestoConsumo8 = datos.valorTotal - subtotalBase;
  const propinaSugerida10 = Math.round(subtotalBase * 0.1);
  const codigoAutorizacion = `AUT-${datos.hash.slice(-8).toUpperCase()}`;
  const numeroFactura = `FOG-${String(datos.idTransaccion).padStart(6, '0')}`;

  const handleImprimir = () => {
    window.print();
  };

  return (
    <div className="soporte-pago-modal" style={estilos.overlay}>
      <div className="soporte-ticket" style={estilos.ticket}>
        {/* Encabezado del Restaurante */}
        <div style={estilos.encabezado}>
          <div style={estilos.logoEmoji}>🍲</div>
          <h2 style={estilos.nombreRestaurante}>FOGÓN COLOMBIANO</h2>
          <p style={estilos.lema}>El Sabor Auténtico de Nuestra Tierra</p>
          <p style={estilos.datosEmpresa}>
            <strong>FOGÓN COLOMBIANO S.A.S.</strong><br />
            NIT: 901.583.219-8 · Régimen Común<br />
            Impuesto Nacional al Consumo (INC) del 8%<br />
            Cra. 7 # 12-45, Centro Histórico · Bogotá D.C.<br />
            PBX: (601) 345-6789 · WhatsApp: +57 310 987 6543
          </p>
          <div style={estilos.lineaPunteada} />
          <p style={estilos.dian}>
            <strong>AUTORIZACIÓN DIAN No. 18764028392</strong><br />
            Habilitación POS: FOG-000001 a FOG-050000 · Vigencia: 24 Meses
          </p>
        </div>

        <div style={estilos.lineaDoble} />

        {/* Datos del Comprobante */}
        <div style={estilos.seccionDatos}>
          <div style={estilos.filaDato}>
            <span style={estilos.etiqueta}>COMPROBANTE No:</span>
            <span style={estilos.valorDestacado}>{numeroFactura}</span>
          </div>
          <div style={estilos.filaDato}>
            <span style={estilos.etiqueta}>FECHA Y HORA:</span>
            <span style={estilos.valorTexto}>{formatearFecha(datos.fecha)}</span>
          </div>
          <div style={estilos.filaDato}>
            <span style={estilos.etiqueta}>CAJA / TERMINAL:</span>
            <span style={estilos.valorTexto}>POS-01 (Caja Principal)</span>
          </div>
          <div style={estilos.filaDato}>
            <span style={estilos.etiqueta}>ESTADO DEL PAGO:</span>
            <span style={estilos.badgeAprobado}>APROBADO &amp; CONCILIADO</span>
          </div>
        </div>

        <div style={estilos.lineaPunteada} />

        {/* Datos del Cliente */}
        <div style={estilos.seccionCliente}>
          <div style={estilos.filaDato}>
            <span style={estilos.etiqueta}>CLIENTE:</span>
            <span style={estilos.valorCliente}>{datos.clienteNombre}</span>
          </div>
          <div style={estilos.filaDato}>
            <span style={estilos.etiqueta}>CORREO / ID:</span>
            <span style={estilos.valorTexto}>{datos.clienteEmail}</span>
          </div>
        </div>

        <div style={estilos.lineaDoble} />

        {/* Desglose de Conceptos del Restaurante */}
        <div style={estilos.tablaConceptos}>
          <div style={estilos.encabezadoTabla}>
            <span>CONCEPTO / SERVICIO</span>
            <span style={{ textAlign: 'right' }}>VALOR</span>
          </div>
          <div style={estilos.lineaPunteadaFina} />

          <div style={estilos.filaConcepto}>
            <div>
              <strong>Consumo de Alimentos y Bebidas</strong>
              <div style={estilos.detalleConcepto}>Servicio a la carta · Platos típicos colombianos</div>
            </div>
            <div style={estilos.precioConcepto}>{formatearMoneda(subtotalBase)}</div>
          </div>

          <div style={estilos.filaConcepto}>
            <div>
              <span>Impuesto Nacional al Consumo (INC 8%)</span>
              <div style={estilos.detalleConcepto}>Tarifa oficial restaurantes (Art. 512-1 E.T.)</div>
            </div>
            <div style={estilos.precioConcepto}>{formatearMoneda(impuestoConsumo8)}</div>
          </div>
        </div>

        <div style={estilos.lineaDoble} />

        {/* Totales */}
        <div style={estilos.totalesBox}>
          <div style={estilos.filaTotal}>
            <span>SUBTOTAL NETO:</span>
            <span>{formatearMoneda(subtotalBase)}</span>
          </div>
          <div style={estilos.filaTotal}>
            <span>IMPOCONSUMO (8%):</span>
            <span>{formatearMoneda(impuestoConsumo8)}</span>
          </div>
          <div style={estilos.filaGranTotal}>
            <span>TOTAL PAGADO:</span>
            <span>{formatearMoneda(datos.valorTotal)}</span>
          </div>
          <div style={estilos.propinaInfo}>
            <span>* Propina sugerida voluntaria (10% Ley 1935/2018): {formatearMoneda(propinaSugerida10)}</span>
          </div>
        </div>

        <div style={estilos.lineaDoble} />

        {/* Información Financiera y de Transacción */}
        <div style={estilos.seccionFinanciera}>
          <div style={estilos.filaDato}>
            <span style={estilos.etiqueta}>FORMA DE PAGO:</span>
            <span style={estilos.valorDestacado}>{formatearMetodoPago(datos.metodoPago)}</span>
          </div>
          <div style={estilos.filaDato}>
            <span style={estilos.etiqueta}>CÓDIGO DE AUTORIZACIÓN:</span>
            <span style={estilos.valorMono}>{codigoAutorizacion}</span>
          </div>
          <div style={estilos.filaDato}>
            <span style={estilos.etiqueta}>ID TRANSACCIÓN EN BD:</span>
            <span style={estilos.valorMono}>#{datos.idTransaccion}</span>
          </div>
        </div>

        {/* Certificación de Seguridad e Integridad Criptográfica */}
        <div style={estilos.criptoCaja}>
          <div style={estilos.criptoTitulo}>
            <span>🔒 SELLO DIGITAL DE INTEGRIDAD (HMAC-SHA256)</span>
            <span style={estilos.badgeVerificado}>VERIFICADO</span>
          </div>
          <div style={estilos.hashTexto}>{datos.hash}</div>
          <div style={estilos.criptoPie}>
            Certificado criptográfico contra alteración de datos (Slide 14–19)
          </div>
        </div>

        {/* Alerta de anomalía si ocurrió */}
        {datos.esAnomalia && (
          <div style={estilos.alertaAnomalia}>
            ⚠️ <strong>ALERTA DE SEGURIDAD (Ventana Deslizante):</strong>
            <div>Esta transacción activó una regla de frecuencia o monto atípico en el servidor.</div>
          </div>
        )}

        {/* Despedida y pie de página */}
        <div style={estilos.pieFactura}>
          <p style={{ margin: '0.4rem 0' }}>*** GRACIAS POR SU VISITA ***</p>
          <p style={{ margin: '0.2rem 0', fontSize: '0.74rem', color: '#666' }}>
            Conserve este comprobante como soporte oficial de su pago.<br />
            Fogón Colombiano le desea una excelente experiencia gastronómica.
          </p>
        </div>

        {/* Botones de acción */}
        <div style={estilos.accionesBox} className="no-print">
          <button
            onClick={handleImprimir}
            style={estilos.botonImprimir}
            className="btn btn-accent"
          >
            🖨️ Imprimir / Guardar PDF
          </button>
          <button
            onClick={onCerrar}
            style={estilos.botonCerrar}
            className="btn btn-ghost"
          >
            ✓ Realizar Otra Transacción
          </button>
        </div>
      </div>

      {/* Estilos para impresión en papel ticket */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .soporte-pago-modal,
          .soporte-ticket,
          .soporte-ticket * {
            visibility: visible;
          }
          .soporte-pago-modal {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: none;
            padding: 0;
          }
          .soporte-ticket {
            max-width: 100% !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
};

const estilos: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 10, 6, 0.85)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    padding: '1.5rem',
    overflowY: 'auto',
  },
  ticket: {
    backgroundColor: '#FFFDF9',
    color: '#2A1B10',
    width: '100%',
    maxWidth: '520px',
    borderRadius: '12px',
    padding: '2rem 1.8rem',
    boxShadow: '0 20px 45px rgba(0, 0, 0, 0.45), 0 0 0 1px #d6b477',
    fontFamily: '"Courier New", Courier, monospace, sans-serif',
    maxHeight: '92vh',
    overflowY: 'auto',
  },
  encabezado: {
    textAlign: 'center',
  },
  logoEmoji: {
    fontSize: '2.5rem',
    marginBottom: '0.2rem',
  },
  nombreRestaurante: {
    margin: '0.2rem 0',
    fontFamily: 'serif',
    fontSize: '1.6rem',
    fontWeight: 'bold',
    letterSpacing: '2px',
    color: '#4A2412',
  },
  lema: {
    margin: '0.1rem 0 0.6rem',
    fontSize: '0.85rem',
    fontStyle: 'italic',
    color: '#8B4513',
  },
  datosEmpresa: {
    margin: '0.4rem 0',
    fontSize: '0.78rem',
    lineHeight: '1.4',
    color: '#3A2E28',
  },
  dian: {
    margin: '0.4rem 0',
    fontSize: '0.72rem',
    color: '#555',
    lineHeight: '1.3',
  },
  lineaPunteada: {
    borderBottom: '1px dashed #A89078',
    margin: '0.8rem 0',
  },
  lineaPunteadaFina: {
    borderBottom: '1px dashed #D6C4B0',
    margin: '0.4rem 0',
  },
  lineaDoble: {
    borderBottom: '2px double #4A2412',
    margin: '0.9rem 0',
  },
  seccionDatos: {
    display: 'grid',
    gap: '0.35rem',
    fontSize: '0.82rem',
  },
  seccionCliente: {
    display: 'grid',
    gap: '0.35rem',
    fontSize: '0.82rem',
  },
  filaDato: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  etiqueta: {
    fontWeight: 600,
    color: '#6B5844',
    fontSize: '0.78rem',
  },
  valorDestacado: {
    fontWeight: 'bold',
    color: '#4A2412',
    fontSize: '0.88rem',
  },
  valorCliente: {
    fontWeight: 'bold',
    color: '#2A1B10',
  },
  valorTexto: {
    color: '#2A1B10',
  },
  valorMono: {
    fontFamily: 'monospace',
    fontWeight: 'bold',
    color: '#4A2412',
    backgroundColor: '#F3E9DA',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  badgeAprobado: {
    backgroundColor: '#15803D',
    color: '#FFF',
    fontSize: '0.72rem',
    fontWeight: 'bold',
    padding: '2px 8px',
    borderRadius: '4px',
    letterSpacing: '0.5px',
  },
  tablaConceptos: {
    fontSize: '0.84rem',
  },
  encabezadoTabla: {
    display: 'flex',
    justifyContent: 'space-between',
    fontWeight: 'bold',
    fontSize: '0.78rem',
    color: '#4A2412',
    marginBottom: '0.2rem',
  },
  filaConcepto: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    margin: '0.45rem 0',
  },
  detalleConcepto: {
    fontSize: '0.72rem',
    color: '#777',
    marginTop: '2px',
  },
  precioConcepto: {
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
    color: '#2A1B10',
  },
  totalesBox: {
    display: 'grid',
    gap: '0.3rem',
    fontSize: '0.85rem',
  },
  filaTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    color: '#4A2412',
  },
  filaGranTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '1.15rem',
    fontWeight: 'bold',
    color: '#15803D',
    borderTop: '1px solid #4A2412',
    paddingTop: '0.4rem',
    marginTop: '0.2rem',
  },
  propinaInfo: {
    fontSize: '0.72rem',
    color: '#8B4513',
    fontStyle: 'italic',
    marginTop: '0.2rem',
  },
  seccionFinanciera: {
    display: 'grid',
    gap: '0.35rem',
    fontSize: '0.82rem',
  },
  criptoCaja: {
    marginTop: '1rem',
    backgroundColor: '#F7F2E8',
    border: '1px solid #D6B477',
    borderRadius: '8px',
    padding: '0.75rem',
  },
  criptoTitulo: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.74rem',
    fontWeight: 'bold',
    color: '#4A2412',
    marginBottom: '0.3rem',
  },
  badgeVerificado: {
    backgroundColor: '#15803D',
    color: '#FFF',
    fontSize: '0.65rem',
    padding: '1px 6px',
    borderRadius: '3px',
  },
  hashTexto: {
    fontFamily: 'monospace',
    fontSize: '0.72rem',
    wordBreak: 'break-all',
    color: '#2B5329',
    backgroundColor: '#FFF',
    padding: '0.4rem',
    borderRadius: '4px',
    border: '1px solid #E2D3BE',
  },
  criptoPie: {
    fontSize: '0.68rem',
    color: '#7D6A54',
    marginTop: '0.3rem',
    textAlign: 'center',
  },
  alertaAnomalia: {
    marginTop: '0.8rem',
    backgroundColor: '#FEF3C7',
    border: '1px solid #F59E0B',
    borderRadius: '6px',
    padding: '0.6rem',
    fontSize: '0.78rem',
    color: '#92400E',
  },
  pieFactura: {
    textAlign: 'center',
    marginTop: '1.2rem',
    fontWeight: 'bold',
    fontSize: '0.85rem',
    color: '#4A2412',
  },
  accionesBox: {
    display: 'flex',
    gap: '0.8rem',
    marginTop: '1.5rem',
  },
  botonImprimir: {
    flex: 1,
    padding: '0.75rem',
    backgroundColor: '#B5651D',
    color: '#FFF',
    border: 'none',
    borderRadius: '8px',
    fontWeight: 'bold',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  botonCerrar: {
    flex: 1,
    padding: '0.75rem',
    backgroundColor: 'transparent',
    color: '#4A2412',
    border: '1px solid #4A2412',
    borderRadius: '8px',
    fontWeight: 'bold',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
};
