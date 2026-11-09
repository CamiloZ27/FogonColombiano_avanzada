import React, { useState, useEffect, ChangeEvent, FormEvent } from 'react';
import {
  CrearTransaccionConUsuarioDTO,
  FormTransaccionUsuarioState,
  MensajeEstado
} from '../types/transaccion.types';
import {
  calcularHMACSHA256,
  obtenerTextoCanonico,
  CLAVE_SECRETA_DEFAULT,
} from '../utils/crypto.util';
import {
  SoportePagoRestaurante,
  DatosSoportePago,
} from './SoportePagoRestaurante.component';

const ESTADO_INICIAL: FormTransaccionUsuarioState = {
  usuario_nombre: 'Carlos Pérez',
  usuario_email: 'carlos@fogoncolombiano.com',
  valor: '45000',
  fecha_txn: new Date().toISOString().slice(0, 19),
  estado: 'completada',
  metodo_pago: 'Tarjeta',
  hash: '',
  alterarHash: false,
};

export const FormularioTransaccionUsuario: React.FC = () => {
  const [formData, setFormData] = useState<FormTransaccionUsuarioState>(ESTADO_INICIAL);
  const [hashCalculado, setHashCalculado] = useState<string>('');
  const [cargando, setCargando] = useState<boolean>(false);
  const [simulandoRafaga, setSimulandoRafaga] = useState<boolean>(false);
  const [mensaje, setMensaje] = useState<MensajeEstado>({ texto: '', tipo: '' });
  const [soportePago, setSoportePago] = useState<DatosSoportePago | null>(null);
  const [ultimoSoporte, setUltimoSoporte] = useState<DatosSoportePago | null>(null);

  // Calcular el hash en tiempo real cada vez que cambien los datos de la transacción (Slide 14 a 19)
  useEffect(() => {
    let activo = true;

    async function actualizarHash() {
      const email = formData.usuario_email.trim();
      const val = Number(formData.valor) || 0;
      const fecha = formData.fecha_txn || new Date().toISOString();
      const metodo = formData.metodo_pago || 'Tarjeta';

      if (!email || val <= 0) {
        setHashCalculado('');
        return;
      }

      const textoCanonico = obtenerTextoCanonico({
        user: email,
        date: fecha,
        value: val,
        paymentMethod: metodo,
      });

      // Cálculo local en tiempo real con Web Crypto
      const hashLocal = await calcularHMACSHA256(textoCanonico, CLAVE_SECRETA_DEFAULT);
      if (activo) {
        setHashCalculado(hashLocal);
      }

      // Sincronización directa con el backend para garantizar 100% coincidencia
      try {
        const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
        const res = await fetch(`${backendUrl}/api/transacciones/generar-hash`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: email,
            date: fecha,
            value: val,
            paymentMethod: metodo,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (activo && data.hash) {
            setHashCalculado(data.hash);
          }
        }
      } catch {
        // En caso de que no haya conexión previa, mantiene el hash local
      }
    }

    actualizarHash();

    return () => {
      activo = false;
    };
  }, [formData.usuario_email, formData.valor, formData.fecha_txn, formData.metodo_pago]);

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const { checked } = e.target as HTMLInputElement;
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const enviarPeticion = async (payload: CrearTransaccionConUsuarioDTO) => {
    const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
    const response = await fetch(`${backendUrl}/api/transacciones`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    return { status: response.status, ok: response.ok, data };
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCargando(true);
    setMensaje({ texto: '', tipo: '' });

    const fechaEnvio = formData.fecha_txn || new Date().toISOString();
    let hashParaEnviar = hashCalculado;

    if (!formData.alterarHash) {
      if (!hashParaEnviar) {
        const textoCanonico = obtenerTextoCanonico({
          user: formData.usuario_email.trim(),
          date: fechaEnvio,
          value: Number(formData.valor),
          paymentMethod: formData.metodo_pago,
        });
        hashParaEnviar = await calcularHMACSHA256(textoCanonico, CLAVE_SECRETA_DEFAULT);
      }
    } else {
      hashParaEnviar = '0000deadbeef' + (hashCalculado || 'abcdef1234567890').slice(12);
    }

    const payload: CrearTransaccionConUsuarioDTO = {
      // Formato oficial de la especificación Appresso (Slide 40)
      user: formData.usuario_email.trim(),
      date: fechaEnvio,
      value: Number(formData.valor),
      paymentMethod: formData.metodo_pago,
      hash: hashParaEnviar,

      // Alias en español para compatibilidad
      usuario_nombre: formData.usuario_nombre,
      usuario_email: formData.usuario_email.trim(),
      valor: Number(formData.valor),
      fecha_txn: fechaEnvio,
      estado: 'completada',
      metodo_pago: formData.metodo_pago,
    };

    try {
      const { ok, status, data } = await enviarPeticion(payload);

      if (!ok) {
        if (status === 401) {
          setMensaje({
            tipo: 'error',
            texto: '❌ Rechazado (401 Unauthorized): ' + (data.error || 'Hash inválido'),
            detalle: 'El servidor comparó el hash recibido con el hash esperado y no coinciden. Detección de alteración de datos exitosa (Slide 16 y 18).',
          });
        } else {
          setMensaje({
            tipo: 'error',
            texto: data.error || 'Error al procesar la solicitud',
          });
        }
        return;
      }

      const datosComprobante: DatosSoportePago = {
        idTransaccion: data.transaccion?.id || Date.now(),
        clienteNombre: formData.usuario_nombre || 'Cliente General',
        clienteEmail: formData.usuario_email.trim(),
        valorTotal: Number(formData.valor),
        metodoPago: formData.metodo_pago,
        fecha: fechaEnvio,
        hash: hashParaEnviar,
        estado: 'completada',
        esAnomalia: Boolean(data.es_anomalia),
      };

      setSoportePago(datosComprobante);
      setUltimoSoporte(datosComprobante);

      if (data.es_anomalia && data.anomalia) {
        setMensaje({
          tipo: 'alerta',
          texto: '⚠️ ¡ANOMALÍA DETECTADA POR VENTANA DESLIZANTE!',
          detalle: `Se detectaron ${data.anomalia.cantidad_transacciones} transacciones dentro de la ventana de ${data.anomalia.ventana_segundos}s para el usuario "${formData.usuario_email}". Tipo: ${data.anomalia.tipo} (Nivel: ${data.anomalia.nivel}).`,
          anomalia: data.anomalia,
        });
      } else {
        setMensaje({
          tipo: 'exito',
          texto: '✅ Transacción procesada correctamente (Comportamiento normal)',
          detalle: `Transacción #${data.transaccion?.id || ''} guardada. Se ha generado el soporte oficial de pago.`,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido al conectar con el backend';
      setMensaje({ texto: errorMessage, tipo: 'error' });
    } finally {
      setCargando(false);
    }
  };

  /**
   * Simula 3 transacciones consecutivas en menos de 3 segundos para el mismo usuario
   * (Caso de uso principal de Slide 36, 39, 41 y 42).
   */
  const handleSimularRafaga = async () => {
    setSimulandoRafaga(true);
    setMensaje({
      tipo: 'alerta',
      texto: '⏳ Disparando ráfaga de 3 transacciones consecutivas dentro de 3 segundos...',
    });

    try {
      const email = formData.usuario_email.trim() || 'fraude@test.com';
      const valor = Number(formData.valor) || 30000;
      const metodo = formData.metodo_pago || 'Tarjeta';

      const resultados = [];

      for (let i = 1; i <= 3; i++) {
        const ahora = new Date();
        const fechaISO = ahora.toISOString();

        const textoCanonico = obtenerTextoCanonico({
          user: email,
          date: fechaISO,
          value: valor,
          paymentMethod: metodo,
        });
        const hash = await calcularHMACSHA256(textoCanonico, CLAVE_SECRETA_DEFAULT);

        const payload: CrearTransaccionConUsuarioDTO = {
          user: email,
          date: fechaISO,
          value: valor,
          paymentMethod: metodo,
          hash,
          usuario_nombre: formData.usuario_nombre || 'Usuario Prueba',
          usuario_email: email,
          valor,
          fecha_txn: fechaISO,
          estado: 'completada',
          metodo_pago: metodo,
        };

        const res = await enviarPeticion(payload);
        resultados.push(res);

        // Pequeña pausa de 200ms entre transacciones para simular ráfaga real dentro de la misma ventana de 3s
        await new Promise((r) => setTimeout(r, 200));
      }

      const ultimaRespuesta = resultados[resultados.length - 1];
      if (ultimaRespuesta && ultimaRespuesta.data?.es_anomalia) {
        setMensaje({
          tipo: 'alerta',
          texto: '🚨 ¡ANOMALÍA DETECTADA CON ÉXITO: POSIBLE_FRAUDE!',
          detalle: `Se enviaron 3 transacciones para ${email} en < 2 segundos. La ventana deslizante detectó ${ultimaRespuesta.data.anomalia?.cantidad_transacciones} transacciones activas y registró la anomalía automáticamente.`,
          anomalia: ultimaRespuesta.data.anomalia,
        });
      } else {
        setMensaje({
          tipo: 'exito',
          texto: 'Las 3 transacciones fueron registradas. Revisa el dashboard de anomalías.',
        });
      }
    } catch (err) {
      setMensaje({
        tipo: 'error',
        texto: err instanceof Error ? err.message : 'Error ejecutando ráfaga',
      });
    } finally {
      setSimulandoRafaga(false);
    }
  };

  return (
    <div className="trace-box" style={{ maxWidth: '780px', margin: '0 auto' }}>
      <div className="panel-heading" style={{ marginBottom: '1.2rem' }}>
        <h2 className="formulario-titulo" style={{ margin: 0 }}>
          Registro de Transacciones con Detección de Anomalías
        </h2>
      </div>

      {mensaje.texto && (
        <div
          className={`mensaje ${
            mensaje.tipo === 'exito'
              ? 'mensaje-exito'
              : mensaje.tipo === 'alerta'
              ? 'order-card-not-found'
              : 'mensaje-error'
          }`}
          style={{
            marginBottom: '1.25rem',
            padding: '1rem',
            borderRadius: '8px',
            backgroundColor:
              mensaje.tipo === 'alerta' ? 'rgba(217, 119, 6, 0.15)' : undefined,
            border:
              mensaje.tipo === 'alerta' ? '1px solid #d97706' : undefined,
          }}
        >
          <strong>{mensaje.texto}</strong>
          {mensaje.detalle && (
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.88rem' }}>{mensaje.detalle}</p>
          )}
          {ultimoSoporte && (
            <div style={{ marginTop: '0.8rem' }}>
              <button
                type="button"
                onClick={() => setSoportePago(ultimoSoporte)}
                className="btn btn-accent"
                style={{
                  fontSize: '0.84rem',
                  padding: '0.45rem 1rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                🧾 Ver Soporte de Pago / Factura Oficial
              </button>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1.2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="formulario-campo" style={{ display: 'grid', gap: '0.4rem' }}>
            <label htmlFor="usuario_nombre">Nombre del Cliente *</label>
            <input
              id="usuario_nombre"
              type="text"
              name="usuario_nombre"
              value={formData.usuario_nombre}
              onChange={handleChange}
              required
              className="formulario-input"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '0.75rem',
                border: '1px solid #d6b477',
                borderRadius: '8px',
                backgroundColor: '#fffdf8',
                color: '#4a2412',
              }}
            />
          </div>

          <div className="formulario-campo" style={{ display: 'grid', gap: '0.4rem' }}>
            <label htmlFor="usuario_email">Correo Electrónico (user) *</label>
            <input
              id="usuario_email"
              type="email"
              name="usuario_email"
              value={formData.usuario_email}
              onChange={handleChange}
              required
              className="formulario-input"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '0.75rem',
                border: '1px solid #d6b477',
                borderRadius: '8px',
                backgroundColor: '#fffdf8',
                color: '#4a2412',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          <div className="formulario-campo" style={{ display: 'grid', gap: '0.4rem' }}>
            <label htmlFor="valor">Monto / Valor ($ COP) *</label>
            <input
              id="valor"
              type="number"
              step="100"
              name="valor"
              value={formData.valor}
              onChange={handleChange}
              required
              className="formulario-input"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '0.75rem',
                border: '1px solid #d6b477',
                borderRadius: '8px',
                backgroundColor: '#fffdf8',
                color: '#4a2412',
              }}
            />
          </div>

          <div className="formulario-campo" style={{ display: 'grid', gap: '0.4rem' }}>
            <label htmlFor="fecha_txn">Fecha y Hora (date) *</label>
            <input
              id="fecha_txn"
              type="datetime-local"
              name="fecha_txn"
              value={formData.fecha_txn.slice(0, 16)}
              onChange={handleChange}
              required
              className="formulario-input"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '0.75rem',
                border: '1px solid #d6b477',
                borderRadius: '8px',
                backgroundColor: '#fffdf8',
                color: '#4a2412',
              }}
            />
          </div>

          <div className="formulario-campo" style={{ display: 'grid', gap: '0.4rem' }}>
            <label htmlFor="metodo_pago">Método de Pago</label>
            <select
              id="metodo_pago"
              name="metodo_pago"
              value={formData.metodo_pago}
              onChange={handleChange}
              className="formulario-input"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '0.75rem',
                border: '1px solid #d6b477',
                borderRadius: '8px',
                backgroundColor: '#fffdf8',
                color: '#4a2412',
              }}
            >
              <option value="Tarjeta">Tarjeta</option>
              <option value="tarjeta_credito">Tarjeta de Crédito</option>
              <option value="tarjeta_debito">Tarjeta de Débito</option>
              <option value="transferencia">Transferencia Bancaria</option>
              <option value="nequi">Nequi</option>
              <option value="daviplata">Daviplata</option>
              <option value="efectivo">Efectivo</option>
            </select>
          </div>
        </div>

        {/* Panel de Criptografía & Hash en Tiempo Real (Slide 14 a 19) */}
        <div
          style={{
            padding: '1rem',
            borderRadius: '8px',
            backgroundColor: '#f8f4eb',
            border: '1px dashed #d6b477',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: '#4a2412', fontSize: '0.92rem' }}>
              🔐 Hash Criptográfico Calculado (HMAC-SHA256):
            </span>
            <span
              style={{
                fontSize: '0.78rem',
                padding: '2px 8px',
                borderRadius: '4px',
                backgroundColor: formData.alterarHash ? '#ef4444' : '#10b981',
                color: '#fff',
                fontWeight: 600,
              }}
            >
              {formData.alterarHash ? 'HASH ALTERADO (TEST)' : 'INTEGRIDAD VÁLIDA'}
            </span>
          </div>

          <div
            style={{
              marginTop: '0.4rem',
              fontFamily: 'monospace',
              fontSize: '0.82rem',
              wordBreak: 'break-all',
              backgroundColor: '#fff',
              padding: '0.6rem',
              borderRadius: '6px',
              border: '1px solid #e0d5c1',
              color: formData.alterarHash ? '#dc2626' : '#2b5329',
            }}
          >
            {formData.alterarHash
              ? '0000deadbeef' + hashCalculado.slice(12) + ' (Simulación de datos alterados)'
              : hashCalculado || 'Completando datos para generar hash...'}
          </div>

          <div style={{ marginTop: '0.6rem' }}>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.86rem',
                cursor: 'pointer',
                color: '#8b4513',
              }}
            >
              <input
                type="checkbox"
                name="alterarHash"
                checked={formData.alterarHash}
                onChange={handleChange}
              />
              <strong>Simular alteración de datos / Hash no coincidente</strong> (para probar el rechazo 401 de Slide 16 y 18)
            </label>
          </div>
        </div>

        {/* Botones de acción */}
        <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          <button
            type="submit"
            disabled={cargando || simulandoRafaga}
            className="btn btn-accent"
            style={{ flex: 1, minWidth: '220px', padding: '0.8rem' }}
          >
            {cargando ? 'Procesando...' : 'Enviar Transacción'}
          </button>

          <button
            type="button"
            disabled={cargando || simulandoRafaga}
            onClick={handleSimularRafaga}
            className="btn btn-ghost"
            style={{
              padding: '0.8rem 1.2rem',
              border: '1px solid #d97706',
              color: '#d97706',
              fontWeight: 600,
            }}
            title="Envía 3 transacciones seguidas para el usuario para disparar la alerta de ventana deslizante"
          >
            {simulandoRafaga ? 'Enviando ráfaga...' : '⚡ Probar Ráfaga (< 3s)'}
          </button>
        </div>
      </form>

      {/* Modal con el Soporte Oficial de Pago para Restaurante */}
      {soportePago && (
        <SoportePagoRestaurante
          datos={soportePago}
          onCerrar={() => setSoportePago(null)}
        />
      )}
    </div>
  );
};
