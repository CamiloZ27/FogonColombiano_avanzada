# Microservicio de Predicción de Ventas — Python

Red neuronal **MLP (Perceptrón Multicapa)** con `scikit-learn` para predecir
las ventas del restaurante Fogón Colombiano a 14 días.

## Arquitectura del modelo

```
Entrada (7 días) → Capa 1 (64 neuronas, ReLU)
                 → Capa 2 (32 neuronas, ReLU)
                 → Capa 3 (16 neuronas, ReLU)
                 → Salida (1 valor, lineal)

Optimizer  : Adam (adaptativo)
Regulariz. : L2 alpha=1e-4
Early stop : 30 iteraciones sin mejora
Normaliz.  : MinMaxScaler [0.05, 0.95]
```

## Instalación

> Requiere Python 3.10 o superior.

```bash
# 1. Entra al directorio del microservicio
cd Backend/python-prediccion

# 2. Crea un entorno virtual (recomendado)
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac / Linux

# 3. Instala dependencias
pip install -r requirements.txt

# 4. Crea el archivo .env (copia el ejemplo)
copy .env.example .env
```

## Configuración (`.env`)

```env
DATABASE_URL=postgresql://postgres:581321@localhost:5432/fogonColombiano
PORT=5001
```

## Ejecución

```bash
# Modo desarrollo (con hot-reload)
python app.py

# O directamente con uvicorn
uvicorn app:app --host 0.0.0.0 --port 5001 --reload
```

El servidor queda disponible en **http://localhost:5001**

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/` | Health check |
| `GET` | `/predecir?dias=90&max_iter=1000` | **Entrena + predice** (endpoint principal) |
| `GET` | `/series-diarias?dias=90` | Solo la serie histórica |
| `GET` | `/resumen` | Estadísticas rápidas desde la BD |

### Respuesta de `/predecir`

```json
{
  "historico":    [{ "fecha": "2024-10-01", "total": 420000, "cantidad": 18 }],
  "predicciones": [{ "fecha": "2024-11-06", "total": 510000, "esPrediccion": true }],
  "resumen": {
    "totalHistorico": 38500000,
    "promedioSemanal": 1200000,
    "transaccionesUltimos30": 540,
    "mejorDia": { "fecha": "2024-10-26", "total": 850000 }
  },
  "modelo": {
    "tipo": "mlp_sklearn",
    "mse": 12500000.00,
    "r2": 0.8742,
    "iteraciones": 347,
    "fuente_datos": "demo",
    "dias_entrenamiento": 90
  }
}
```

## Fuentes de datos

El microservicio funciona aunque la BD esté vacía:

| Situación | `fuente_datos` |
|-----------|---------------|
| BD con ≥ 30 días de datos | `"backend"` |
| BD con pocos datos (< 30) | `"mixto"` — rellena con dataset sintético |
| BD vacía o no disponible  | `"demo"` — 100% dataset sintético |

## Docs interactiva

FastAPI genera documentación automática en:
- **Swagger UI**: http://localhost:5001/docs
- **ReDoc**:      http://localhost:5001/redoc

## Estructura de archivos

```
python-prediccion/
├── app.py           ← FastAPI: rutas y servidor
├── modelo.py        ← MLPRegressor: entrenamiento y predicción
├── dataset.py       ← PostgreSQL + dataset de demostración
├── requirements.txt ← Dependencias pip
├── .env             ← Variables de entorno (no subir a git)
└── .env.example     ← Plantilla de .env
```

