import { createContext, useContext, useEffect, useState, useRef } from "react";
import type { ReactNode } from "react";

/**
 * Общие параметры здания, синхронизируемые между вкладками калькулятора.
 * Каждая вкладка может игнорировать любое поле — оно не обязано присутствовать
 * во всех расчётах.
 */
export interface Building {
  span_m: number;          // Пролёт здания, м
  length_m: number;        // Длина здания, м
  height_m: number;        // Высота здания (до низа фермы), м
  roofSlope_deg: number;   // Уклон кровли, °
  framePitch_m: number;    // Шаг рам, м
  w0_kPa: number;          // Нормативное ветровое давление w₀, кПа
  Sg_kPa: number;          // Снеговая нагрузка Sg, кПа
}

const DEFAULT_BUILDING: Building = {
  span_m: 24,
  length_m: 72,
  height_m: 12,
  roofSlope_deg: 5,
  framePitch_m: 6,
  w0_kPa: 0.38,
  Sg_kPa: 2.45,
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

/**
 * Хук для двусторонней синхронизации поля локального стейта с контекстом здания.
 *
 * При монтировании и при каждом изменении building[key] обновляет локальный стейт
 * через onLocalChange(newValue). При изменении локального значения через возвращаемый
 * setSynced — обновляет контекст.
 *
 * Используется в калькуляторах, у которых уже есть `setInput()` для всего объекта.
 */
export function useBuildingSync<K extends keyof Building>(
  key: K,
  localValue: number,
  onLocalChange: (v: number) => void,
) {
  const { building, setBuilding } = useBuilding();
  const lastFromContext = useRef<number>(building[key]);

  useEffect(() => {
    if (building[key] !== lastFromContext.current) {
      lastFromContext.current = building[key];
      if (building[key] !== localValue) {
        onLocalChange(building[key]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building[key]]);

  // On initial mount — push context value into local state
  useEffect(() => {
    if (building[key] !== localValue) {
      onLocalChange(building[key]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (v: number) => {
    onLocalChange(v);
    setBuilding({ [key]: v } as Partial<Building>);
    lastFromContext.current = v;
  };
}
