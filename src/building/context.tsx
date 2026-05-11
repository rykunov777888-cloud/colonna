import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

/**
 * Общие параметры здания, синхронизируемые между вкладками калькулятора.
 * Каждая вкладка может игнорировать любое поле — оно не обязано присутствовать
 * во всех расчётах.
 */
export type TerrainType = "A" | "B" | "C";
export type RoofShape = "gable" | "monoslope"; // Двускатная / Односкатная

export interface Building {
  span_m: number;            // Пролёт здания, м
  length_m: number;          // Длина здания, м
  height_m: number;          // Высота здания (до низа фермы), м
  roofSlope_deg: number;     // Уклон кровли, °
  framePitch_m: number;      // Шаг рам, м
  w0_kPa: number;            // Нормативное ветровое давление w₀, кПа
  Sg_kPa: number;            // Снеговая нагрузка Sg, кПа
  terrainType: TerrainType;  // Тип местности по СП 20
  roofStructure: string;     // Конструкция покрытия (id из structures.json)
  roofShape: RoofShape;      // Тип кровли (gable=двускатная / monoslope=односкатная)
  city: string;              // Выбранный город/поселение (текст в поле ввода)
  responsibilityCoeff: number; // γₙ — коэф. ответственности
  priceC255B_rubKg: number;  // Цена С255Б, руб/кг
  priceC355B_rubKg: number;  // Цена С355Б, руб/кг
  priceC245_rubKg: number;   // Цена С245 (двутавр), руб/кг
  priceC345_rubKg: number;   // Цена С345 (двутавр), руб/кг
  priceMP350_rubKg: number;  // Цена ЛСТК МП350, руб/кг
  priceMP390_rubKg: number;  // Цена ЛСТК МП390, руб/кг
}

const DEFAULT_BUILDING: Building = {
  span_m: 24,
  length_m: 72,
  height_m: 12,
  roofSlope_deg: 5,
  framePitch_m: 6,
  w0_kPa: 0.38,
  Sg_kPa: 2.45,
  terrainType: "B",
  roofStructure: "профлист",
  roofShape: "gable",
  city: "",
  responsibilityCoeff: 1,
  priceC255B_rubKg: 148.8,
  priceC355B_rubKg: 155.88,
  priceC245_rubKg: 130.2,
  priceC345_rubKg: 141,
  priceMP350_rubKg: 180,
  priceMP390_rubKg: 180,
};

const STORAGE_KEY = "colonna:building:v1";

function loadFromStorage(): Building {
  if (typeof window === "undefined") return DEFAULT_BUILDING;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BUILDING;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_BUILDING, ...parsed };
  } catch {
    return DEFAULT_BUILDING;
  }
}

interface BuildingContextValue {
  building: Building;
  setBuilding: (patch: Partial<Building>) => void;
}

const BuildingContext = createContext<BuildingContextValue | null>(null);

export function BuildingProvider({ children }: { children: ReactNode }) {
  const [building, setBuildingState] = useState<Building>(loadFromStorage);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(building));
    } catch {
      /* ignore quota errors */
    }
  }, [building]);

  const setBuilding = (patch: Partial<Building>) =>
    setBuildingState((cur) => ({ ...cur, ...patch }));

  return (
    <BuildingContext.Provider value={{ building, setBuilding }}>
      {children}
    </BuildingContext.Provider>
  );
}

export function useBuilding(): BuildingContextValue {
  const ctx = useContext(BuildingContext);
  if (!ctx) throw new Error("useBuilding must be used inside <BuildingProvider>");
  return ctx;
}


