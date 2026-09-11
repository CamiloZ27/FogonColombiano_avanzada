import {
  obtenerDatasetGenerado,
  obtenerDatasetManual,
  obtenerDatasetArchivo
} from './datasets/dataset.provider';

import {
  buscarBinaria, buscarLineal, buscarConstante,
  sumarProductos, calcularSemanaFidelizacion, regresionLineal
} from './services/analitica.service';

import { ReporteValidacion } from './types/validator.types';

function analizarDataset(nombreOrigen: string, reporte: ReporteValidacion) {
  console.log(`\n___________________________________________`);
  console.log(`Análisis Dataset: ${nombreOrigen}`);
  console.log(`___________________________________________`);

  // Reporte retornado luego de sanitizar
  console.log(`Reporte de sanitización:`);
  console.log(`  - Total   : ${reporte.total}`);
  console.log(`  - Válidos : ${reporte.validos.length}`);
  console.log(`  - Inválido: ${reporte.invalidos.length}`);

  if (reporte.invalidos.length > 0) {
    console.log(`\nPedidos Rechazados:`);
    reporte.invalidos.slice(0, 5).forEach((fallo, index) => {
      console.log(`    [Pedido ${index + 1}]: ${JSON.stringify(fallo.item)}`);
      console.log(`    Motivo: ${fallo.motivo}\n`);
    });
  }
  console.log(`___________________________________________`);

  const dataset = reporte.validos;

  if (dataset.length === 0) {
    console.log("Dataset sin datos válidos. Saltando análisis matemático...\n");
    return;
  }

  // 1. Búsquedas Big O
  const indiceObjetivo = dataset.length - 1;
  const pedidoPrueba = dataset[indiceObjetivo];

  if (pedidoPrueba) {
    const idPrueba = pedidoPrueba.id_pedido;
    console.log(`Búsqueda de prueba (ID: ${idPrueba}):`);
    const resPosicion = buscarConstante(dataset, indiceObjetivo);
    console.log(`  O(1)     - Posición : ${resPosicion.operaciones} op. | Tiempo: ${resPosicion.tiempo.toFixed(5)} ms`);
    const resBinaria = buscarBinaria(dataset, idPrueba);
    console.log(`  O(log n) - Binaria  : ${resBinaria.operaciones} op. | Tiempo: ${resBinaria.tiempo.toFixed(5)} ms`);
    const resLineal = buscarLineal(dataset, idPrueba);
    console.log(`  O(n)     - Lineal   : ${resLineal.operaciones} op. | Tiempo: ${resLineal.tiempo.toFixed(5)} ms`);
  }

  // 2. Recursividad
  const subsetRecursivo = dataset.slice(0, 1000);
  console.log(`\nTotal productos (Recursividad - máx 1000 pedidos): ${sumarProductos(subsetRecursivo)}`);

  // 3. Fidelización
  console.log(`\nFidelización o descuento para cliente`);
  const metas = [42, 72, 120];
  for (const meta of metas) {
    const semana = calcularSemanaFidelizacion(meta, 2, 2);
    console.log(`  Meta de ${meta} productos alcanzable en la semana: ${semana}`);
  }

  // 4. Proyección de ventas
  console.log(`\nProyección de ventas`);
  const ventasHistoricas = dataset.slice(0, 5).map(p => p.cant_productos);

  if (ventasHistoricas.length === 5) {
    const dias = [1, 2, 3, 4, 5];
    const diaActual = 5;
    const diasFuturosAPredecir = [2, 5, 7];

    console.log(`  Histórico base extraído: [${ventasHistoricas.join(', ')}] productos.`);
    for (const diaFuturo of diasFuturosAPredecir) {
      const diaPrediccion = diaActual + diaFuturo;
      try {
        const estimacion = regresionLineal(dias, ventasHistoricas, diaPrediccion);
        console.log(`  Ventas estimadas en ${diaFuturo} días (Día ${diaPrediccion}): ${estimacion.toFixed(1)} platos`);
      } catch (e) {
        if (e instanceof Error) console.log(`  [Aviso]: ${e.message}`);
      }
    }
  } else {
    console.log(`  * No hay suficientes datos (mínimo 5) para la tendencia de este dataset.`);
  }
}

function iniciarSistema() {
  console.log("-__ INICIANDO SISTEMA 'EL FOGÓN COLOMBIANO' __-\n");

  // analizarDataset("MANUAL (Código Directo)", obtenerDatasetManual());
  // analizarDataset("ARCHIVO (pedidos.json)", obtenerDatasetArchivo());
  analizarDataset("MASIVO (Autogenerado)", obtenerDatasetGenerado(1000));

  console.log("\n=== Análisis finalizado ===");
}

iniciarSistema();
