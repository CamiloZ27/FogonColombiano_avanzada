import * as fs from 'fs';
import * as path from 'path';
import { sanitizarDataset } from '../utils/validator.util';
import { pedidosManualesCrudos } from './datasetManual.data'
import { ReporteValidacion } from '../types/validator.types';

export function obtenerDatasetGenerado(cantidad: number): ReporteValidacion {
  const rawData: any[] = [];
  for (let i = 1; i <= cantidad; i++) {
    rawData.push({
      id_pedido: i,
      cliente: `Cliente_Auto_${i}`,
      tipo: i % 2 === 0 ? 'Local' : 'Domicilio',
      cant_productos: Math.floor(Math.random() * 5) + 1,
      estado: 'Entregado'
    });
  }

  // Se inyecta datos malos intencionalmente para verla en el reporte
  rawData.push({ id_pedido: "9999", cliente: null, tipo: "Ovni" });
  rawData.push({ id_pedido: "12412312", cliente: 'TEST', tipo: "Ovni" });
  rawData.push({ id_pedido: "12314123", cliente: 'TEST 2', tipo: "Local", cant_productos: -500, estado: "En Proceso" });
  rawData.push({ id_pedido: "12314123", cliente: 'TEST 3', tipo: "Local", cant_productos: 500, estado: "No existe" });
  rawData.push(null);

  return sanitizarDataset(rawData);
}

export function obtenerDatasetManual(): ReporteValidacion {
  return sanitizarDataset(pedidosManualesCrudos);
}

export function obtenerDatasetArchivo(): ReporteValidacion {
  try {
    const rutaArchivo = path.join(__dirname, 'datasetFile.data.json');
    const archivoCrudo = fs.readFileSync(rutaArchivo, 'utf-8');
    const rawData = JSON.parse(archivoCrudo);
    return sanitizarDataset(rawData);
  } catch (error) {
    console.log(error)
    return { total: 0, validos: [], invalidos: [] };
  }
}
