"""
dataset.py — Fuente de datos para el modelo de predicción.

Prioridad:
  1. Consulta a PostgreSQL (datos reales del restaurante).
  2. Si hay menos de MIN_PUNTOS días reales, se rellena con el dataset
     de demostración sintético (mismos patrones del seed SQL).
  3. Si la BD no responde, usa 100 % demo.
"""

from __future__ import annotations

import os
import math
import random
from datetime import date, timedelta
from typing import Optional

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")
MIN_PUNTOS   = 30   # días mínimos para usar solo datos reales


# ─── Tipos de datos simples ────────────────────────────────────────────────────

class PuntoSerie:
    def __init__(self, fecha: str, total: float, cantidad: int):
        self.fecha    = fecha
        self.total    = total
        self.cantidad = cantidad

    def to_dict(self) -> dict:
        return {"fecha": self.fecha, "total": self.total, "cantidad": self.cantidad}


# ─── 1. Consulta a PostgreSQL ─────────────────────────────────────────────────

def obtener_serie_desde_bd(dias: int = 90) -> list[PuntoSerie]:
    """Devuelve la serie diaria de ventas desde PostgreSQL."""
    if not DATABASE_URL:
        return []
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT
                DATE(fecha_txn)::text   AS fecha,
                SUM(valor)::float       AS total,
                COUNT(*)::int           AS cantidad
            FROM transacciones
            WHERE estado = 'completada'
              AND fecha_txn >= NOW() - (%s * INTERVAL '1 day')
            GROUP BY DATE(fecha_txn)
            ORDER BY fecha ASC
            """,
            (dias,),
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [PuntoSerie(r["fecha"], float(r["total"]), int(r["cantidad"])) for r in rows]
    except Exception as e:
        print(f"[dataset] BD no disponible: {e}")
        return []


def obtener_resumen_desde_bd() -> dict:
    """Resumen estadístico rápido de ventas."""
    if not DATABASE_URL:
        return {}
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(
            """
            SELECT
                COALESCE(SUM(valor), 0)::float                             AS total_historico,
                COALESCE(
                  (SELECT SUM(valor) / 7.0
                   FROM transacciones
                   WHERE estado = 'completada'
                     AND fecha_txn >= NOW() - INTERVAL '7 days'),
                  0
                )::float                                                   AS promedio_semanal,
                (SELECT COUNT(*)::int FROM transacciones
                 WHERE estado = 'completada'
                   AND fecha_txn >= NOW() - INTERVAL '30 days')            AS txn_30d
            FROM transacciones
            WHERE estado = 'completada'
            """
        )
        base = cur.fetchone()

        cur.execute(
            """
            SELECT DATE(fecha_txn)::text AS fecha, SUM(valor)::float AS total
            FROM transacciones
            WHERE estado = 'completada'
            GROUP BY DATE(fecha_txn)
            ORDER BY total DESC
            LIMIT 1
            """
        )
        mejor = cur.fetchone()
        cur.close()
        conn.close()

        return {
            "totalHistorico":        base["total_historico"] if base else 0,
            "promedioSemanal":       base["promedio_semanal"] if base else 0,
            "transaccionesUltimos30": base["txn_30d"] if base else 0,
            "mejorDia": {"fecha": mejor["fecha"], "total": mejor["total"]} if mejor else None,
        }
    except Exception as e:
        print(f"[dataset] Error al obtener resumen: {e}")
        return {}


# ─── 2. Dataset de demostración sintético ─────────────────────────────────────

def generar_demo(dias_total: int = 90) -> list[PuntoSerie]:
    """
    Genera una serie temporal sintética reproducible.
    Mismos patrones del seed SQL: picos fin de semana,
    quincenas y tendencia alcista ~25 %.
    """
    rng = random.Random(42)   # semilla fija → siempre igual

    # Ventas base por día de semana (0=Lun, 6=Dom) en COP
    BASE_DIA  = [310_000, 285_000, 310_000, 380_000, 480_000, 550_000, 520_000]
    VAR_DIA   = [ 50_000,  45_000,  50_000,  60_000,  75_000,  90_000,  80_000]

    hoy   = date.today()
    serie = []

    for i in range(dias_total - 1, -1, -1):
        dia_fecha = hoy - timedelta(days=i)
        dow       = dia_fecha.weekday()           # 0=Lun, 6=Dom
        progreso  = (dias_total - 1 - i) / max(dias_total - 1, 1)
        tendencia = 1 + progreso * 0.25

        d = dia_fecha.day
        quincena = 1.20 if (14 <= d <= 16) or (28 <= d <= 31) else 1.0

        # Ruido gaussiano aproximado (4 uniformes)
        ruido = sum(rng.random() for _ in range(4)) / 4 - 0.5

        base  = BASE_DIA[dow] * tendencia * quincena
        var   = VAR_DIA[dow]
        total = max(80_000, round(base + ruido * var * 2))

        cant_base = [14, 12, 14, 18, 22, 26, 22][dow]
        cantidad  = max(3, round(cant_base * tendencia + ruido * 4))

        serie.append(PuntoSerie(dia_fecha.isoformat(), float(total), cantidad))

    return serie


# ─── 3. Mezcla inteligente ────────────────────────────────────────────────────

def obtener_serie(dias: int = 90) -> tuple[list[PuntoSerie], str]:
    """
    Devuelve (serie, fuente) donde fuente ∈ {'backend', 'mixto', 'demo'}.
    """
    real = obtener_serie_desde_bd(dias)

    if len(real) == 0:
        return generar_demo(dias), "demo"

    if len(real) < MIN_PUNTOS:
        # Rellenar huecos con demo
        demo      = generar_demo(dias)
        por_fecha = {p.fecha: p for p in real}
        for p in demo:
            if p.fecha not in por_fecha:
                por_fecha[p.fecha] = p
        serie = sorted(por_fecha.values(), key=lambda x: x.fecha)
        return serie, "mixto"

    return real, "backend"


def calcular_resumen_local(serie: list[PuntoSerie]) -> dict:
    """Calcula estadísticas desde la serie (usado cuando la BD no responde)."""
    if not serie:
        return {"totalHistorico": 0, "promedioSemanal": 0,
                "transaccionesUltimos30": 0, "mejorDia": None}
    totales   = [p.total    for p in serie]
    cantidades = [p.cantidad for p in serie]
    idx_mejor = totales.index(max(totales))
    return {
        "totalHistorico":         sum(totales),
        "promedioSemanal":        sum(totales[-7:]) / min(7, len(totales)),
        "transaccionesUltimos30": sum(cantidades[-30:]),
        "mejorDia": {"fecha": serie[idx_mejor].fecha, "total": totales[idx_mejor]},
    }

