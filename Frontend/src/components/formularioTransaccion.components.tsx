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
import { getAuthToken } from '../services/api.service';

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
        const token = getAuthToken();
        const res = await fetch(`${backendUrl}/api/transacciones/generar-hash`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
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
    const token = getAuthToken();
    const response = await fetch(`${backendUrl}/api/transacciones`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
    <section>
      <div className="panel-heading">
        <h1>Registro de Transacciones</h1>
        <p>Registra pagos directos, genera comprobante oficial y evalúa automáticamente posibles anomalías.</p>
      </div>

      <div className="add-order-box">
        {mensaje.texto && (
          <div
            className={`mensaje ${
              mensaje.tipo === 'exito'
                ? 'alert-success'
                : mensaje.tipo === 'alerta'
                ? 'order-card-not-found'
                : 'order-card-not-found'
            }`}
            style={{
              marginBottom: '1.25rem',
              marginTop: 0,
              borderColor: mensaje.tipo === 'alerta' ? '#d97706' : undefined,
            }}
          >
            <div>
              <strong>{mensaje.texto}</strong>
              {mensaje.detalle && (
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.84rem' }}>{mensaje.detalle}</p>
              )}
              {ultimoSoporte && (
                <div style={{ marginTop: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={() => setSoportePago(ultimoSoporte)}
                    className="btn btn-accent btn-sm"
                  >
                    🧾 Ver Soporte de Pago
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="add-order-form" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none', display: 'grid', gap: '1.1rem' }}>
          <div className="form-grid-inputs">
            <div className="field">
              <label htmlFor="usuario_nombre">Nombre del Cliente *</label>
              <input
                id="usuario_nombre"
                type="text"
                name="usuario_nombre"
                value={formData.usuario_nombre}
                onChange={handleChange}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="usuario_email">Correo Electrónico *</label>
              <input
                id="usuario_email"
                type="email"
                name="usuario_email"
                value={formData.usuario_email}
                onChange={handleChange}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="valor">Monto ($ COP) *</label>
              <input
                id="valor"
                type="number"
                step="100"
                name="valor"
                value={formData.valor}
                onChange={handleChange}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="fecha_txn">Fecha y Hora *</label>
              <input
                id="fecha_txn"
                type="datetime-local"
                name="fecha_txn"
                value={formData.fecha_txn.slice(0, 16)}
                onChange={handleChange}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="metodo_pago">Método de Pago</label>
              <select
                id="metodo_pago"
                name="metodo_pago"
                value={formData.metodo_pago}
                onChange={handleChange}
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

          <div
            style={{
              padding: '0.9rem 1rem',
              borderRadius: '8px',
              backgroundColor: 'var(--bg)',
              border: '1px dashed var(--rule)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, color: 'var(--paper)', fontSize: '0.86rem' }}>
                Código de verificación de integridad
              </span>
              <span
                className={`order-status-badge ${formData.alterarHash ? 'status-solicitado' : 'status-entregado'}`}
              >
                {formData.alterarHash ? 'Alterado (Prueba)' : 'Válido'}
              </span>
            </div>

            <div
              style={{
                marginTop: '0.45rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.76rem',
                wordBreak: 'break-all',
                color: formData.alterarHash ? '#f18f82' : '#8cb88a',
              }}
            >
              {formData.alterarHash
                ? '0000deadbeef' + hashCalculado.slice(12)
                : hashCalculado || 'Completa los datos para generar el código...'}
            </div>

            <div style={{ marginTop: '0.6rem' }}>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  color: '#C9AD8F',
                }}
              >
                <input
                  type="checkbox"
                  name="alterarHash"
                  checked={formData.alterarHash}
                  onChange={handleChange}
                />
                Simular alteración de datos en la transacción
              </label>
            </div>
          </div>

          <div className="form-actions" style={{ marginTop: 0 }}>
            <button
              type="button"
              disabled={cargando || simulandoRafaga}
              onClick={handleSimularRafaga}
              className="btn btn-ghost"
            >
              {simulandoRafaga ? 'Enviando ráfaga...' : '⚡ Probar Ráfaga (< 3s)'}
            </button>
            <button
              type="submit"
              disabled={cargando || simulandoRafaga}
              className="btn btn-accent"
            >
              {cargando ? 'Procesando...' : 'Enviar Transacción'}
            </button>
          </div>
        </form>
      </div>

      {/* Modal con el Soporte Oficial de Pago para Restaurante */}
      {soportePago && (
        <SoportePagoRestaurante
          datos={soportePago}
          onCerrar={() => setSoportePago(null)}
        />
      )}
    </section>
  );
};
