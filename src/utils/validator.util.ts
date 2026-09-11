import { Pedido, TipoPedido, EstadoPedido } from '../types/pedidos.types';
import { DatoInvalido, ReporteValidacion } from '../types/validator.types';

export function validarPedido(raw: any): { valido: boolean; pedido?: Pedido; motivo?: string } {
  // Validar que el objeto existe
  if (!raw || typeof raw !== 'object') {
    return { valido: false, motivo: "El registro es nulo o no es un objeto válido" };
  }

  // 2. Extraer y sanitizar la data
  const idSanitizado = Number(raw.id_pedido);
  const clienteSanitizado = String(raw.cliente ?? '').trim();
  const tipoSanitizado = String(raw.tipo ?? '').trim() as TipoPedido;
  const cantProductosSanitizado = Number(raw.cant_productos);
  const estadoSanitizado = String(raw.estado ?? '').trim() as EstadoPedido;

  // 3. Validación de tipos
  if (isNaN(idSanitizado) || idSanitizado < 0) {
    return { valido: false, motivo: `ID inválido (${raw.id_pedido}): Debe ser un número positivo` };
  }

  if (clienteSanitizado === '') {
    return { valido: false, motivo: `Cliente inválido (${raw.cliente}): Debe ser un texto no vacío` };
  }

  const tiposValidos: TipoPedido[] = ['Local', 'Domicilio'];
  if (!tiposValidos.includes(tipoSanitizado)) {
    return { valido: false, motivo: `Tipo inválido ('${raw.tipo}'): Solo se permite 'Local' o 'Domicilio'` };
  }

  if (isNaN(cantProductosSanitizado) || cantProductosSanitizado <= 0) {
    return { valido: false, motivo: `Cantidad inválida (${raw.cant_productos}): Debe ser mayor a 0` };
  }

  const estadosValidos: EstadoPedido[] = ['Solicitado', 'En Proceso', 'Entregado'];
  if (!estadosValidos.includes(estadoSanitizado)) {
    return { valido: false, motivo: `Estado inválido ('${raw.estado}'): Valores permitidos 'Solicitado', 'En Proceso' o 'Entregado'` };
  }

  return {
    valido: true,
    pedido: {
      id_pedido: idSanitizado,
      cliente: clienteSanitizado,
      tipo: tipoSanitizado,
      cant_productos: cantProductosSanitizado,
      estado: estadoSanitizado
    }
  };
}


export function sanitizarDataset(rawData: any[]): ReporteValidacion {
  if (!Array.isArray(rawData)) return { total: 0, validos: [], invalidos: [] };

  const validos: Pedido[] = [];
  const invalidos: DatoInvalido[] = [];

  for (const item of rawData) {
    const resultado = validarPedido(item);
    if (resultado.valido && resultado.pedido) {
      validos.push(resultado.pedido);
    } else {
      invalidos.push({
        item,
        motivo: resultado.motivo || "Datos corruptos o formato no reconocido"
      });
    }
  }

  return { total: rawData.length, validos, invalidos };
}
