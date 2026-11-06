"""
modelo.py — Red Neuronal MLP para predicción de series temporales.

Usa scikit-learn MLPRegressor, que implementa un Perceptrón Multicapa
completo con backpropagation, regularización L2 y múltiples solvers.

Arquitectura elegida:
  Entrada  : WINDOW_SIZE (7) valores normalizados
  Capa 1   : 64 neuronas, ReLU
  Capa 2   : 32 neuronas, ReLU
  Capa 3   : 16 neuronas, ReLU
  Salida   : 1 valor (lineal)

Comparado con la versión TypeScript:
  ✅ Regularización L2 integrada (evita overfitting)
  ✅ Adam optimizer (más estable que SGD manual)
  ✅ Early stopping automático
  ✅ Warm start para reentrenamiento incremental
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

import numpy as np
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing   import MinMaxScaler

WINDOW_SIZE     = 7    # días de historia → 1 predicción
DIAS_PREDICCION = 14   # días a predecir hacia el futuro


# ─── Tipos de respuesta ────────────────────────────────────────────────────────

@dataclass
class PuntoPrediccion:
    fecha:        str
    total:        float
    esPrediccion: bool = True

    def to_dict(self) -> dict:
        return {"fecha": self.fecha, "total": self.total, "esPrediccion": self.esPrediccion}


@dataclass
class ResultadoModelo:
    predicciones:   list[PuntoPrediccion]
    mse_train:      float
    r2_train:       float
    n_iter:         int
    modelo_tipo:    str           # 'mlp' | 'regresion_lineal'


# ─── Construcción de ventanas deslizantes ─────────────────────────────────────

def _construir_ventanas(serie_norm: np.ndarray, window: int):
    """X: (n_muestras, window)  |  y: (n_muestras,)"""
    X, y = [], []
    for i in range(window, len(serie_norm)):
        X.append(serie_norm[i - window : i])
        y.append(serie_norm[i])
    return np.array(X), np.array(y)


def _sumar_dias(fecha_iso: str, dias: int) -> str:
    """'YYYY-MM-DD' + N días → 'YYYY-MM-DD'"""
    from datetime import date, timedelta
    d = date.fromisoformat(fecha_iso)
    return (d + timedelta(days=dias)).isoformat()


# ─── Regresión lineal (fallback con pocos datos) ───────────────────────────────

def _predecir_lineal(serie_valores: list[float], ultima_fecha: str) -> ResultadoModelo:
    n    = len(serie_valores)
    x    = np.arange(n, dtype=float)
    y    = np.array(serie_valores, dtype=float)
    # Regresión mínimos cuadrados
    coef = np.polyfit(x, y, deg=1)
    pred_train = np.polyval(coef, x)
    mse  = float(np.mean((pred_train - y) ** 2))
    ss_res = np.sum((y - pred_train) ** 2)
    ss_tot = np.sum((y - y.mean()) ** 2)
    r2   = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0

    predicciones = [
        PuntoPrediccion(
            fecha = _sumar_dias(ultima_fecha, d + 1),
            total = max(0.0, round(float(np.polyval(coef, n + d)))),
        )
        for d in range(DIAS_PREDICCION)
    ]
    return ResultadoModelo(predicciones, mse, r2, n_iter=0, modelo_tipo="regresion_lineal")


# ─── Modelo MLP principal ─────────────────────────────────────────────────────

def entrenar_y_predecir(
    serie_valores: list[float],
    fechas:        list[str],
    max_iter:      int = 1000,
) -> ResultadoModelo:
    """
    Entrena la red neuronal con los valores históricos y devuelve
    las predicciones para los próximos DIAS_PREDICCION días.

    Parámetros:
        serie_valores: lista de totales diarios (ya ordenada por fecha).
        fechas:        lista de fechas ISO correspondientes.
        max_iter:      iteraciones máximas del solver Adam.

    Devuelve:
        ResultadoModelo con predicciones + métricas.
    """
    n = len(serie_valores)
    ultima_fecha = fechas[-1] if fechas else "2024-01-01"

    # Con muy pocos datos usamos regresión lineal
    if n < WINDOW_SIZE + 4:
        return _predecir_lineal(serie_valores, ultima_fecha)

    # 1. Normalización Min-Max
    datos_np = np.array(serie_valores, dtype=float).reshape(-1, 1)
    scaler   = MinMaxScaler(feature_range=(0.05, 0.95))
    datos_norm = scaler.fit_transform(datos_np).flatten()

    # 2. Ventanas deslizantes
    X, y = _construir_ventanas(datos_norm, WINDOW_SIZE)

    # 3. Definición del MLP
    mlp = MLPRegressor(
        hidden_layer_sizes   = (64, 32, 16),   # 3 capas ocultas
        activation           = "relu",
        solver               = "adam",
        alpha                = 1e-4,            # regularización L2
        learning_rate        = "adaptive",
        max_iter             = max_iter,
        tol                  = 1e-5,
        n_iter_no_change     = 30,              # early stopping
        random_state         = 42,
        verbose              = False,
    )
    mlp.fit(X, y)

    # 4. Métricas sobre el conjunto de entrenamiento
    pred_train = mlp.predict(X)
    mse_norm   = float(np.mean((pred_train - y) ** 2))

    # MSE en escala original (COP)
    pred_orig  = scaler.inverse_transform(pred_train.reshape(-1, 1)).flatten()
    y_orig     = scaler.inverse_transform(y.reshape(-1, 1)).flatten()
    mse_orig   = float(np.mean((pred_orig - y_orig) ** 2))

    ss_res = np.sum((y_orig - pred_orig) ** 2)
    ss_tot = np.sum((y_orig - y_orig.mean()) ** 2)
    r2     = float(1 - ss_res / ss_tot) if ss_tot > 0 else 0.0

    # 5. Predicción iterativa hacia el futuro
    ventana_actual = list(datos_norm[-WINDOW_SIZE:])
    predicciones   = []

    for d in range(1, DIAS_PREDICCION + 1):
        x_pred = np.array(ventana_actual).reshape(1, -1)
        y_norm = float(mlp.predict(x_pred)[0])
        y_norm = max(0.0, min(1.0, y_norm))      # clamp [0, 1]

        # Desnormalizar
        total_pred = float(
            scaler.inverse_transform([[y_norm]])[0][0]
        )
        total_pred = max(0.0, round(total_pred))

        predicciones.append(
            PuntoPrediccion(
                fecha = _sumar_dias(ultima_fecha, d),
                total = total_pred,
            )
        )
        # Avanzar ventana
        ventana_actual = ventana_actual[1:] + [y_norm]

    return ResultadoModelo(
        predicciones = predicciones,
        mse_train    = mse_orig,
        r2_train     = r2,
        n_iter       = mlp.n_iter_,
        modelo_tipo  = "mlp_sklearn",
    )

