/**
 * Estima el consumo de gasolina de una entrega a partir de la
 * distancia recorrida, el rendimiento del vehículo (km por litro)
 * y el precio del litro de gasolina.
 */
export interface FuelEstimate {
  km: number;
  liters: number;
  cost: number;
}

export function estimateFuel(km: number, kmPerLiter: number, pricePerLiter: number): FuelEstimate {
  if (kmPerLiter <= 0) {
    throw new Error("El rendimiento (km por litro) debe ser mayor a 0");
  }
  const liters = km / kmPerLiter;
  const cost = liters * pricePerLiter;
  return { km, liters, cost };
}
