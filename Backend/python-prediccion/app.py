"""
app.py — Microservicio FastAPI para predicción de ventas.

Puerto por defecto : 5001  (configurable con la variable PORT en .env)
CORS               : abierto a cualquier origen (mismo patrón que el backend Express)

Endpoints:
  GET  /                   → health check
  GET  /predecir?dias=90   → entrena el modelo y devuelve predicciones
  GET  /series-diarias?dias=90  → solo la serie histórica (sin modelo)
  GET  /resumen            → estadísticas rápidas

Respuesta de /predecir:
  {
    "historico":    [{ fecha, total, cantidad }],      ← últimos 30 días
    "predicciones": [{ fecha, total, esPrediccion }],  ← próximos 14 días
    "resumen": {
      totalHistorico, promedioSemanal,
      transaccionesUltimos30, mejorDia
    },
    "modelo": {
      tipo, mse, r2, iteraciones, fuente_datos
    }
  }
"""

import os
from fastapi            import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv             import load_dotenv

from dataset import obtener_serie, obtener_resumen_desde_bd, calcular_resumen_local
from modelo  import entrenar_y_predecir

load_dotenv()

PORT = int(os.getenv("PORT", 5001))

# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title       = "Fogón Colombiano — Predicción de Ventas",
    description = "Microservicio Python con red neuronal MLP (scikit-learn) "
                  "para predicción de ventas del restaurante.",
    version     = "1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/", tags=["health"])
def health():
    return {"status": "ok", "servicio": "prediccion-ventas-mlp"}


@app.get("/series-diarias", tags=["datos"])
def series_diarias(dias: int = Query(default=90, ge=14, le=365)):
    """Devuelve la serie histórica diaria (con relleno de demo si hace falta)."""
    serie, fuente = obtener_serie(dias)
    return {
        "fuente":  fuente,
        "puntos":  len(serie),
        "serie":   [p.to_dict() for p in serie],
    }


@app.get("/resumen", tags=["datos"])
def resumen():
    """Estadísticas rápidas de ventas desde PostgreSQL."""
    datos = obtener_resumen_desde_bd()
    if not datos:
        raise HTTPException(status_code=503, detail="BD no disponible")
    return datos


@app.get("/predecir", tags=["modelo"])
def predecir(
    dias:     int = Query(default=90,   ge=14, le=365,  description="Días de historia"),
    max_iter: int = Query(default=1000, ge=100, le=5000, description="Iteraciones del solver"),
):
    """
    Endpoint principal: carga datos, entrena el MLP y devuelve predicciones.

    - `dias`     : cuántos días de historia usar para entrenar.
    - `max_iter` : iteraciones máximas del Adam optimizer (más = más preciso, más lento).
    """
    # 1. Datos
    serie, fuente = obtener_serie(dias)
    if len(serie) < 4:
        raise HTTPException(
            status_code=422,
            detail="No hay suficientes datos para entrenar el modelo (mínimo 4 días).",
        )

    # 2. Resumen estadístico
    resumen_datos = obtener_resumen_desde_bd()
    if not resumen_datos:
        resumen_datos = calcular_resumen_local(serie)

    # 3. Entrenar y predecir
    valores = [p.total  for p in serie]
    fechas  = [p.fecha  for p in serie]
    resultado = entrenar_y_predecir(valores, fechas, max_iter=max_iter)

    # 4. Respuesta — solo los últimos 30 días históricos para la gráfica
    historico = serie[-30:]

    return {
        "historico":    [p.to_dict() for p in historico],
        "predicciones": [p.to_dict() for p in resultado.predicciones],
        "resumen":      resumen_datos,
        "modelo": {
            "tipo":        resultado.modelo_tipo,
            "mse":         round(resultado.mse_train, 2),
            "r2":          round(resultado.r2_train,  4),
            "iteraciones": resultado.n_iter,
            "fuente_datos": fuente,
            "dias_entrenamiento": len(serie),
        },
    }


# ─── Punto de entrada ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=PORT, reload=True)

