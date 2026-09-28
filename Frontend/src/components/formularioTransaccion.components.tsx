import React, { useState, ChangeEvent, FormEvent } from 'react';
import { 
  CrearTransaccionConUsuarioDTO, 
  FormTransaccionUsuarioState, 
  MensajeEstado 
} from '../types/transaccion.types';

const ESTADO_INICIAL: FormTransaccionUsuarioState = {
  usuario_nombre: '',
  usuario_email: '',
  valor: '',
  fecha_txn: new Date().toISOString().slice(0, 16),
  estado: 'pendiente',
  metodo_pago: 'tarjeta_credito',
  hash: '',
};

const MI_TOKEN_HASH = "5813659858";

export const FormularioTransaccionUsuario: React.FC = () => {
  const [formData, setFormData] = useState<FormTransaccionUsuarioState>(ESTADO_INICIAL);
  const [cargando, setCargando] = useState<boolean>(false);
  const [mensaje, setMensaje] = useState<MensajeEstado>({ texto: '', tipo: '' });

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCargando(true);
    setMensaje({ texto: '', tipo: '' });

    const hashIngresado = formData.hash.trim();
    if (hashIngresado !== MI_TOKEN_HASH) {
      setMensaje({ texto: 'El token ingresado no es válido.', tipo: 'error' });
      setCargando(false);
      return;
    }

    const payload: CrearTransaccionConUsuarioDTO = {
      usuario_nombre: formData.usuario_nombre,
      usuario_email: formData.usuario_email,
      valor: Number(formData.valor),
      fecha_txn: formData.fecha_txn,
      // El estado no lo elige el cliente: enviar el formulario registra la transacción como completada.
      estado: 'completada',
      metodo_pago: formData.metodo_pago,
      hash: hashIngresado,
    };

    try {
      const response = await fetch('http://localhost:4000/api/transacciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', "x-api-token": MI_TOKEN_HASH },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al procesar la solicitud');
      }

      setMensaje({ texto: '¡Usuario y Transacción guardados con éxito!', tipo: 'exito' });
      setFormData(ESTADO_INICIAL);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      setMensaje({ texto: errorMessage, tipo: 'error' });
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="trace-box">

      <h2 className="formulario-titulo">Registrar Transacción y Usuario</h2>

      {mensaje.texto && (
        <div className={`mensaje ${mensaje.tipo === 'exito' ? 'mensaje-exito' : 'mensaje-error'}`}>
          {mensaje.texto}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
        <h3 className="formulario-subtitulo">Datos del Usuario</h3>
        <div className="formulario-campo" style={{ display: 'grid', gap: '0.4rem' }}>
          <label htmlFor="usuario_nombre">Nombre completo *</label>
          <input
            id="usuario_nombre"
            type="text"
            name="usuario_nombre"
            value={formData.usuario_nombre}
            onChange={handleChange}
            required
            className="formulario-input"
            style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem 0.9rem', border: '1px solid #d6b477', borderRadius: '8px', backgroundColor: '#fffdf8', color: '#4a2412', fontSize: '1rem' }}
          />
        </div>

        <div className="formulario-campo" style={{ display: 'grid', gap: '0.4rem' }}>
          <label htmlFor="usuario_email">Correo electrónico *</label>
          <input
            id="usuario_email"
            type="email"
            name="usuario_email"
            value={formData.usuario_email}
            onChange={handleChange}
            required
            className="formulario-input"
            style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem 0.9rem', border: '1px solid #d6b477', borderRadius: '8px', backgroundColor: '#fffdf8', color: '#4a2412', fontSize: '1rem' }}
          />
        </div>

        <h3 className="formulario-subtitulo">Datos de la Transacción</h3>
        <div className="formulario-campo" style={{ display: 'grid', gap: '0.4rem' }}>
          <label htmlFor="valor">Valor ($) *</label>
          <input
            id="valor"
            type="number"
            step="0.01"
            name="valor"
            value={formData.valor}
            onChange={handleChange}
            required
            className="formulario-input"
            style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem 0.9rem', border: '1px solid #d6b477', borderRadius: '8px', backgroundColor: '#fffdf8', color: '#4a2412', fontSize: '1rem' }}
          />
        </div>

        <div className="formulario-campo" style={{ display: 'grid', gap: '0.4rem' }}>
          <label htmlFor="fecha_txn">Fecha y Hora *</label>
          <input
            id="fecha_txn"
            type="datetime-local"
            name="fecha_txn"
            value={formData.fecha_txn}
            onChange={handleChange}
            required
            className="formulario-input"
            style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem 0.9rem', border: '1px solid #d6b477', borderRadius: '8px', backgroundColor: '#fffdf8', color: '#4a2412', fontSize: '1rem' }}
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
            style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem 0.9rem', border: '1px solid #d6b477', borderRadius: '8px', backgroundColor: '#fffdf8', color: '#4a2412', fontSize: '1rem' }}
          >
            <option value="tarjeta_credito">Tarjeta de Crédito</option>
            <option value="tarjeta_debito">Tarjeta de Débito</option>
            <option value="transferencia">Transferencia</option>
            <option value="nequi">Nequi</option>
            <option value="daviplata">Daviplata</option>
            <option value="efectivo">Efectivo</option>
          </select>
        </div>

        <div className="formulario-campo" style={{ display: 'grid', gap: '0.4rem' }}>
          <label htmlFor="hash">Hash / Referencia</label>
          <input
            id="hash"
            type="text"
            name="hash"
            value={formData.hash}
            onChange={handleChange}
            className="formulario-input"
            style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem 0.9rem', border: '1px solid #d6b477', borderRadius: '8px', backgroundColor: '#fffdf8', color: '#4a2412', fontSize: '1rem' }}
          />
        </div>

        <button
          type="submit"
          disabled={cargando}
          className="btn btn-accent"
        >
          {cargando ? 'Procesando...' : 'Crear Usuario y Transacción'}
        </button>
      </form>
    </div>
  );
};