import { useMemo, useState, useCallback, useEffect } from "react";
import { runCalculation, computeMu } from "./calc/engine";
import { useBuilding, type Building } from "./building/context";
import { useBuildingResults, type ColumnResultByType, type ResultItem } from "./building/results";
import { useRoofTotalLoad_kPa } from "./building/loadPropagation";
import { SyncedNumField, SyncedSelectField } from "./building/SyncedField";
import { PricesBlock } from "./building/PricesBlock";
import { Collapsible } from "./building/Collapsible";
import type {
  CalculationInput,
  CalculationOutput,
  ColumnType,
  CraneCapacity,
  SpanCount,
  TerrainType,
} from "./calc/types";
import {
  searchSettlements,
  getSettlementClimateById,
} from "./types/climate";
import structuresJson from "./data/structures/structures.json";
import cranesJson from "./data/cranes/cranes.json";

const COLUMN_TYPES: ColumnType[] = ["edge", "fachwerk", "middle"];
const COLUMN_LABELS: Record<ColumnType, string> = {
  edge: "Крайняя",
  fachwerk: "Фахверковая",
  middle: "Средняя",
};
type Results = Record<ColumnType, CalculationOutput>;

interface StructureRow {
  id: string;
  kPa: number;
}
interface CraneRow {
  capacity: string;
  span_m: number;
  base_mm: number;
  gauge_mm: number;
  wheelLoad_kN: number;
  trolleyMass_t: number;
  craneMass_t: number;
}

const STRUCTURES = structuresJson as StructureRow[];
const CRANES = cranesJson as CraneRow[];

const CRANE_CAPACITIES: CraneCapacity[] = [
  "5", "8", "10", "12.5", "16", "16/3.2", "20/5", "32/5", "50/12.5",
];
const CRANE_SPANS = [12, 18, 24, 30, 36];

function lookupCrane(capacity: string, span_m: number): CraneRow | undefined {
  return CRANES.find((c) => c.capacity === capacity && c.span_m === span_m);
}

function lookupStructure(id: string): StructureRow | undefined {
  return STRUCTURES.find((s) => s.id === id);
}

const DEFAULT_INPUT: CalculationInput = {
  height_m: 11.5,
  span_m: 40,
  length_m: 80,
  framePitch_m: 6,
  fachverkPitch_m: 6,
  roofSlope_deg: 6,
  roofType: "gable",
  spanCount: "single",
  perimeterTies: false,
  columnType: "fachwerk",
  responsibilityCoeff: 1,
  terrainType: "B",
  w0_kPa: 0.6,
  Sg_kPa: 1.7,
  roofStructure: "профлист",
  roofLoad_kPa: 0.105,
  wallStructure: "профлист",
  wallLoad_kPa: 0.105,
  loadAddition_pct: 15,
  overheadCrane: {
    enabled: false,
    capacity: "5",
    span_m: 12,
    count: "one",
    singleSpan: true,
    railLevel_m: 3.5,
    wheelLoad_kN: 50,
    base_m: 3.7,
    gauge_m: 4.7,
  },
  suspendedCrane: {
    enabled: false,
    capacity_t: 2,
    singleSpan: true,
  },
  prices: {
    "С255Б": 148.8,
    "С355Б": 155.88,
    "С245": 130.2,
    "С345": 141,
  },
};

export function ColumnApp() {
  const { building, setBuilding } = useBuilding();
  const initialRoof = lookupStructure(building.roofStructure);
  const [input, setInput] = useState<CalculationInput>(() => ({
    ...DEFAULT_INPUT,
    span_m: building.span_m,
    length_m: building.length_m,
    height_m: building.height_m,
    roofSlope_deg: building.roofSlope_deg,
    framePitch_m: building.framePitch_m,
    w0_kPa: building.w0_kPa,
    Sg_kPa: building.Sg_kPa,
    terrainType: building.terrainType,
    roofStructure: building.roofStructure,
    roofLoad_kPa: initialRoof?.kPa ?? DEFAULT_INPUT.roofLoad_kPa,
    responsibilityCoeff: building.responsibilityCoeff,
    prices: {
      "С255Б": building.priceC255B_rubKg,
      "С355Б": building.priceC355B_rubKg,
      "С245": building.priceC245_rubKg,
      "С345": building.priceC345_rubKg,
    },
  }));
  const [activeTab, setActiveTab] = useState<ColumnType>("edge");
  const [cityQuery, setCityQuery] = useState(building.city);
  const [showCityMatches, setShowCityMatches] = useState(false);
  const { setResult } = useBuildingResults();

  // Auto-recompute results on every input change — no «Рассчитать» button needed.
  const { results, error } = useMemo<{ results: Results | null; error: string | null }>(() => {
    try {
      const out: Partial<Results> = {};
      for (const ct of COLUMN_TYPES) {
        out[ct] = runCalculation({ ...input, columnType: ct });
      }
      return { results: out as Results, error: null };
    } catch (e) {
      return { results: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [input]);

  // Publish current column selection into the shared results bus for the Summary tab.
  useEffect(() => {
    if (!results) {
      setResult("column", null);
      return;
    }
    const n_frames = Math.max(2, Math.floor(input.length_m / input.framePitch_m) + 1);
    const fachverkPerGable = Math.max(
      0,
      Math.round(input.span_m / input.fachverkPitch_m) - 1,
    );
    const counts: Record<ColumnType, number> = {
      edge: 2 * n_frames,
      middle: input.spanCount === "multi" ? n_frames : 0,
      fachwerk: 2 * fachverkPerGable,
    };
    const buildItem = (ct: ColumnType): ResultItem | null => {
      if (counts[ct] === 0) return null;
      const r = results[ct].results[0];
      if (!r) return null;
      return {
        profile: r.profileName,
        steel: r.steel,
        massPerPiece_kg: r.totalMass_kg,
        count: counts[ct],
        totalMass_kg: r.totalMass_kg * counts[ct],
        // engine's cost_rub is in тыс. руб per single column; convert to руб × count.
        cost_rub: r.cost_rub * 1000 * counts[ct],
      };
    };
    const payload: ColumnResultByType = {
      edge: buildItem("edge"),
      middle: buildItem("middle"),
      fachwerk: buildItem("fachwerk"),
    };
    setResult("column", payload);
  }, [
    results,
    input.length_m,
    input.span_m,
    input.framePitch_m,
    input.fachverkPitch_m,
    input.spanCount,
    setResult,
  ]);

  // Pull updates from BuildingContext when other tabs change shared fields.
  // Roof load includes self-weight of purlins / beam-cell (auto-propagation).
  const roofLoad = useRoofTotalLoad_kPa();
  useEffect(() => {
    setInput((cur) => ({
      ...cur,
      span_m: building.span_m,
      length_m: building.length_m,
      height_m: building.height_m,
      roofSlope_deg: building.roofSlope_deg,
      framePitch_m: building.framePitch_m,
      w0_kPa: building.w0_kPa,
      Sg_kPa: building.Sg_kPa,
      terrainType: building.terrainType,
      roofStructure: building.roofStructure,
      roofType: building.roofShape === "gable" ? "gable" : "single_slope",
      roofLoad_kPa: roofLoad.total_kPa > 0 ? roofLoad.total_kPa : cur.roofLoad_kPa,
      responsibilityCoeff: building.responsibilityCoeff,
      prices: {
        "С255Б": building.priceC255B_rubKg,
        "С355Б": building.priceC355B_rubKg,
        "С245": building.priceC245_rubKg,
        "С345": building.priceC345_rubKg,
      },
    }));
    setCityQuery(building.city);
  }, [building, roofLoad.total_kPa]);

  const updSynced = <K extends keyof Building>(key: K, value: Building[K]) => {
    setBuilding({ [key]: value } as Partial<Building>);
  };

  const cityMatches = useMemo(() => {
    if (!showCityMatches || cityQuery.length < 2) return [];
    return searchSettlements(cityQuery).slice(0, 10);
  }, [cityQuery, showCityMatches]);

  const handleCitySelect = useCallback(
    (id: string) => {
      const s = getSettlementClimateById(id);
      if (!s) return;
      const label = `${s.settlement} (${s.region})`;
      setShowCityMatches(false);
      const patch: Partial<Building> = { city: label };
      if (s.terrain.defaultType) patch.terrainType = s.terrain.defaultType as Building["terrainType"];
      if (typeof s.wind.w0Kpa === "number") patch.w0_kPa = s.wind.w0Kpa;
      if (typeof s.snow.sgKpa === "number") patch.Sg_kPa = s.snow.sgKpa;
      setBuilding(patch);
    },
    [setBuilding],
  );

  const upd = (patch: Partial<CalculationInput>) =>
    setInput((p) => ({ ...p, ...patch }));

  const setWallStructure = (id: string) => {
    const s = lookupStructure(id);
    upd({
      wallStructure: id,
      wallLoad_kPa: s ? s.kPa : input.wallLoad_kPa,
    });
  };

  const setOverhead = (
    patch: Partial<CalculationInput["overheadCrane"]>,
  ) => {
    setInput((p) => {
      const next = { ...p.overheadCrane, ...patch };
      // Re-lookup catalog when (capacity, span) changes.
      if (
        patch.capacity !== undefined ||
        patch.span_m !== undefined
      ) {
        const r = lookupCrane(next.capacity, next.span_m);
        if (r) {
          next.wheelLoad_kN = r.wheelLoad_kN;
          next.base_m = r.base_mm / 1000;
          next.gauge_m = r.gauge_mm / 1000;
        }
      }
      return { ...p, overheadCrane: next };
    });
  };
  const setSuspended = (
    patch: Partial<CalculationInput["suspendedCrane"]>,
  ) =>
    setInput((p) => ({
      ...p,
      suspendedCrane: { ...p.suspendedCrane, ...patch },
    }));

  const muByType: Record<ColumnType, number> = {
    edge: computeMu({ ...input, columnType: "edge" }),
    fachwerk: computeMu({ ...input, columnType: "fachwerk" }),
    middle: computeMu({ ...input, columnType: "middle" }),
  };

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>
        Калькулятор стальных колонн промышленных зданий
      </h1>
      <p style={{ color: "#666", fontSize: 13, marginTop: 0 }}>
        Подбор профиля по СП 16.13330 / СП 20.13330. 208 профилей × 4 марки стали × 0–4 распорки.
      </p>

      <div style={{ marginBottom: 16 }}>
       <Collapsible title="📥 Исходные данные" storageKey="column-inputs" defaultOpen={true}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Column 1: building geometry */}
        <fieldset style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <legend style={{ fontWeight: 600 }}>Геометрия здания</legend>
          <SyncedNumField label="Пролёт, м" value={input.span_m} onChange={(v) => updSynced("span_m", v)} />
          <SyncedNumField label="Длина, м" value={input.length_m} onChange={(v) => updSynced("length_m", v)} />
          <SyncedNumField label="Высота, м" value={input.height_m} onChange={(v) => updSynced("height_m", v)} />
          <SyncedNumField label="Уклон кровли, °" value={input.roofSlope_deg} onChange={(v) => updSynced("roofSlope_deg", v)} />
          <SyncedNumField label="Шаг рам, м" value={input.framePitch_m} onChange={(v) => updSynced("framePitch_m", v)} />
          <Field label="Шаг стоек фахверка, м" value={input.fachverkPitch_m} onChange={(v) => upd({ fachverkPitch_m: v })} />
          <SelectField
            label="Кол-во пролётов"
            value={input.spanCount}
            options={[
              ["single", "Один"],
              ["multi", "Более одного"],
            ]}
            onChange={(v) => upd({ spanCount: v as SpanCount })}
          />
          <SyncedSelectField
            label="Кровля"
            value={building.roofShape}
            options={[
              ["gable", "Двускатная"],
              ["monoslope", "Односкатная"],
            ]}
            onChange={(v) => updSynced("roofShape", v as Building["roofShape"])}
          />
          <CheckField
            label="Связи по периметру"
            checked={input.perimeterTies}
            onChange={(v) => upd({ perimeterTies: v })}
          />
        </fieldset>

        {/* Column 2: loads */}
        <fieldset style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <legend style={{ fontWeight: 600 }}>Нагрузки</legend>
          <div title="Синхронизировано со всеми вкладками" style={{ marginBottom: 6, background: "#fef9c3", border: "1px dashed #eab308", borderRadius: 4, padding: "4px 6px" }}>
            <label style={{ fontSize: 13, display: "block" }}>
              <span style={{ color: "#92400e", marginRight: 4 }}>🔗</span>
              Город (автозаполнение w₀, Sg)
            </label>
            <input
              style={{ width: "100%", padding: 4, boxSizing: "border-box" }}
              value={cityQuery}
              onChange={(e) => {
                setCityQuery(e.target.value);
                setShowCityMatches(true);
              }}
              onFocus={() => setShowCityMatches(true)}
              onBlur={() => {
                setBuilding({ city: cityQuery });
                window.setTimeout(() => setShowCityMatches(false), 150);
              }}
              placeholder="Введите название..."
            />
            {cityMatches.length > 0 && (
              <div style={{ border: "1px solid #ddd", maxHeight: 200, overflow: "auto", background: "white" }}>
                {cityMatches.map((s) => (
                  <div
                    key={s.id}
                    style={{ padding: "4px 8px", cursor: "pointer", fontSize: 13 }}
                    onMouseDown={(e) => { e.preventDefault(); handleCitySelect(s.id); }}
                    onMouseOver={(e) => (e.currentTarget.style.background = "#eef")}
                    onMouseOut={(e) => (e.currentTarget.style.background = "")}
                  >
                    {s.settlement} — {s.region}{" "}
                    <span style={{ color: "#999" }}>
                      (w₀={s.wind.w0Kpa ?? "—"}, Sg={s.snow.sgKpa ?? "—"})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <SyncedSelectField
            label="Тип местности"
            value={input.terrainType}
            options={[
              ["A", "A — открытая"],
              ["B", "B — город/лес"],
              ["C", "C — плотная застройка"],
            ]}
            onChange={(v) => updSynced("terrainType", v as Building["terrainType"])}
          />
          <SyncedNumField label="w₀ (ветер), кПа" value={input.w0_kPa} onChange={(v) => updSynced("w0_kPa", v)} step={0.01} />
          <SyncedNumField label="Sg (снег), кПа" value={input.Sg_kPa} onChange={(v) => updSynced("Sg_kPa", v)} step={0.01} />
          <SyncedSelectField
            label="Конструкция покрытия"
            value={input.roofStructure}
            options={STRUCTURES.map((s) => [s.id, `${s.id} (${s.kPa.toFixed(3)} кПа)`])}
            onChange={(v) => updSynced("roofStructure", v)}
          />
          <Field label="Нагрузка от кровли, кПа" value={input.roofLoad_kPa} onChange={(v) => upd({ roofLoad_kPa: v })} step={0.001} />
          {(roofLoad.purlin_kPa > 0 || roofLoad.beamCell_kPa > 0) && (
            <div style={{ fontSize: 11, color: "#0369a1", marginTop: -4, marginBottom: 6 }}>
              🔗 авто: {roofLoad.structure_kPa.toFixed(3)} (покрытие)
              {roofLoad.purlin_kPa > 0 && ` + ${roofLoad.purlin_kPa.toFixed(3)} (прогоны)`}
              {roofLoad.beamCell_kPa > 0 && ` + ${roofLoad.beamCell_kPa.toFixed(3)} (балка покр.)`}
              {" = "}
              <b>{roofLoad.total_kPa.toFixed(3)} кПа</b>
            </div>
          )}
          <SelectField
            label="Конструкция ограждения"
            value={input.wallStructure}
            options={STRUCTURES.map((s) => [s.id, `${s.id} (${s.kPa.toFixed(3)} кПа)`])}
            onChange={setWallStructure}
          />
          <Field label="Нагрузка от ограждения, кПа" value={input.wallLoad_kPa} onChange={(v) => upd({ wallLoad_kPa: v })} step={0.001} />
          <SyncedNumField label="Ур. ответственности γₙ" value={input.responsibilityCoeff} onChange={(v) => updSynced("responsibilityCoeff", v)} step={0.05} />
        </fieldset>

        {/* Column 3: column & economy */}
        <fieldset style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <legend style={{ fontWeight: 600 }}>Колонна и экономика</legend>
          <div style={{ marginBottom: 6, fontSize: 12, color: "#475569" }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>μ по типу колонны (авто):</div>
            <div>Крайняя: <b>{muByType.edge.toFixed(2)}</b></div>
            <div>Фахверковая: <b>{muByType.fachwerk.toFixed(2)}</b></div>
            <div>Средняя: <b>{muByType.middle.toFixed(2)}</b></div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
              Считается по связям / кол-ву пролётов
            </div>
          </div>
          <Field label="Надбавка, %" value={input.loadAddition_pct} onChange={(v) => upd({ loadAddition_pct: v })} />
        </fieldset>
      </div>

      {/* Synced prices block (visible in every tab) */}
      <div style={{ marginBottom: 16 }}>
        <PricesBlock />
      </div>

      {/* Cranes row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <fieldset style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <legend style={{ fontWeight: 600 }}>Кран опорный (по ГОСТ)</legend>
          <CheckField
            label="Есть"
            checked={input.overheadCrane.enabled}
            onChange={(v) => setOverhead({ enabled: v })}
          />
          {input.overheadCrane.enabled && (
            <>
              <SelectField
                label="Грузоподъёмность, т"
                value={input.overheadCrane.capacity}
                options={CRANE_CAPACITIES.map((c) => [c, c])}
                onChange={(v) => setOverhead({ capacity: v as CraneCapacity })}
              />
              <SelectField
                label="Пролёт крана (каталог), м"
                value={String(input.overheadCrane.span_m)}
                options={CRANE_SPANS.map((s) => [String(s), String(s)])}
                onChange={(v) => setOverhead({ span_m: Number(v) })}
              />
              <SelectField
                label="Кол-во кранов в пролёте"
                value={input.overheadCrane.count}
                options={[
                  ["one", "Один"],
                  ["two", "Два"],
                ]}
                onChange={(v) =>
                  setOverhead({ count: v as "one" | "two" })
                }
              />
              <CheckField
                label="Только в одном пролёте"
                checked={input.overheadCrane.singleSpan}
                onChange={(v) => setOverhead({ singleSpan: v })}
              />
              <Field
                label="Отметка верха рельса, м"
                value={input.overheadCrane.railLevel_m}
                onChange={(v) => setOverhead({ railLevel_m: v })}
                step={0.1}
              />
              <ReadOnlyField label="Нагрузка на колесо, кН" value={input.overheadCrane.wheelLoad_kN.toFixed(0)} />
              <ReadOnlyField label="База, м" value={input.overheadCrane.base_m.toFixed(2)} />
              <ReadOnlyField label="Габарит, м" value={input.overheadCrane.gauge_m.toFixed(2)} />
            </>
          )}
        </fieldset>
        <fieldset style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <legend style={{ fontWeight: 600 }}>Кран подвесной</legend>
          <CheckField
            label="Есть"
            checked={input.suspendedCrane.enabled}
            onChange={(v) => setSuspended({ enabled: v })}
          />
          {input.suspendedCrane.enabled && (
            <>
              <Field
                label="Грузоподъёмность, т"
                value={input.suspendedCrane.capacity_t}
                onChange={(v) => setSuspended({ capacity_t: v })}
                step={0.5}
              />
              <CheckField
                label="Только в одном пролёте"
                checked={input.suspendedCrane.singleSpan}
                onChange={(v) => setSuspended({ singleSpan: v })}
              />
            </>
          )}
        </fieldset>
      </div>
       </Collapsible>
      </div>

      {/* Auto-propagation info banner */}
      <LoadPropagationBanner />

      {error && <div style={{ color: "red", marginBottom: 12 }}>{error}</div>}

      {results && (() => {
        const result = results[activeTab];
        return (
        <>
          <div style={{ display: "flex", gap: 4, marginBottom: 12, borderBottom: "2px solid #cbd5e1" }}>
            {COLUMN_TYPES.map((ct) => {
              const isActive = activeTab === ct;
              const r = results[ct];
              const top = r.results[0];
              return (
                <button
                  key={ct}
                  onClick={() => setActiveTab(ct)}
                  style={{
                    padding: "8px 16px",
                    fontSize: 14,
                    fontWeight: isActive ? 600 : 400,
                    background: isActive ? "#2563eb" : "#f1f5f9",
                    color: isActive ? "#fff" : "#334155",
                    border: "none",
                    borderTopLeftRadius: 6,
                    borderTopRightRadius: 6,
                    cursor: "pointer",
                    minWidth: 200,
                    textAlign: "left",
                  }}
                >
                  <div>{COLUMN_LABELS[ct]}</div>
                  <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.85, marginTop: 2 }}>
                    N={r.N_kN.toFixed(1)} кН · M={r.M_kNm.toFixed(1)} кН·м
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.85 }}>
                    {top ? `топ: ${top.profileName} / ${top.steel} / ${top.struts} расп. (${top.maxUtilization.toFixed(2)})` : "нет подходящих"}
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 24, marginBottom: 12, flexWrap: "wrap" }}>
            <Stat label="N (осевая)" value={`${result.N_kN.toFixed(1)} кН`} />
            <Stat label="M (момент)" value={`${result.M_kNm.toFixed(1)} кН·м`} />
            <Stat label="μ" value={result.mu.toFixed(2)} />
            <Stat label="Снег расч." value={`${result.snowLoad_kPa.toFixed(3)} кПа`} />
            <Stat label="Ветер давл." value={`${result.windPressure_kPa.toFixed(3)} кПа`} />
            <Stat label="Ветер отс." value={`${result.windSuction_kPa.toFixed(3)} кПа`} />
            <Stat label="Sверт" value={`${result.tributaryArea_m2.toFixed(1)} м²`} />
            <Stat label="Sстен" value={`${result.wallArea_m2.toFixed(1)} м²`} />
          </div>

          <h2 style={{ fontSize: 16 }}>
            {COLUMN_LABELS[activeTab]} — подходящие профили ({result.results.length} из 2080 вариантов)
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                borderCollapse: "collapse",
                fontSize: 12,
                width: "100%",
              }}
            >
              <thead>
                <tr style={{ background: "#f1f5f9" }}>
                  {[
                    "№",
                    "Профиль",
                    "Сталь",
                    "Распорки",
                    "К-т исп",
                    "ПС",
                    "по σ",
                    "по σ уст X",
                    "по σ уст Y",
                    "по гибк X",
                    "по гибк Y",
                    "Масса 1 п.м, кг",
                    "Масса колонны, кг",
                    "Масса с расп., кг",
                    "Стоимость, т.р.",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "4px 6px",
                        borderBottom: "2px solid #94a3b8",
                        textAlign: "left",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.results.map((r) => (
                  <tr
                    key={`${r.profileName}-${r.steel}-${r.struts}`}
                    style={{
                      borderBottom: "1px solid #e2e8f0",
                      background: r.maxUtilization > 0.95 ? "#fef2f2" : undefined,
                    }}
                  >
                    <td style={TD}>{r.rank}</td>
                    <td style={{ ...TD, fontWeight: 600 }}>{r.profileName}</td>
                    <td style={TD}>{r.steel}</td>
                    <td style={TD}>{r.struts}</td>
                    <td style={{ ...TD, fontWeight: 600 }}>{r.maxUtilization.toFixed(3)}</td>
                    <td style={TD}>{r.limitingCheck}</td>
                    <td style={TD}>{r.utilizationSigma.toFixed(3)}</td>
                    <td style={TD}>{r.utilizationStabX.toFixed(3)}</td>
                    <td style={TD}>{r.utilizationStabY.toFixed(3)}</td>
                    <td style={TD}>{r.utilizationSlendX.toFixed(3)}</td>
                    <td style={TD}>{r.utilizationSlendY.toFixed(3)}</td>
                    <td style={TD}>{r.mass_per_m.toFixed(1)}</td>
                    <td style={TD}>{r.columnMass_kg.toFixed(1)}</td>
                    <td style={TD}>{r.totalMass_kg.toFixed(1)}</td>
                    <td style={TD}>{r.cost_rub.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
        );
      })()}
    </div>
  );
}

const TD: React.CSSProperties = { padding: "3px 6px", whiteSpace: "nowrap" };

/** Compact info banner showing auto-propagated loads from other tabs. */
function LoadPropagationBanner() {
  const { results } = useBuildingResults();
  const roofLoad = useRoofTotalLoad_kPa();
  const hasRoof = roofLoad.purlin_kPa > 0 || roofLoad.beamCell_kPa > 0;
  const hasTruss = !!results.truss?.reactions;
  const hasCrane = !!results.craneBeam;
  if (!hasRoof && !hasTruss && !hasCrane) return null;
  const rx = results.truss?.reactions;
  return (
    <div
      style={{
        marginBottom: 12,
        padding: "8px 12px",
        background: "#eff6ff",
        border: "1px dashed #3b82f6",
        borderRadius: 6,
        fontSize: 12,
        color: "#1e40af",
        lineHeight: 1.6,
      }}
    >
      <b>🔗 Автопередача нагрузок</b>
      {hasRoof && (
        <div>
          Кровля → {roofLoad.structure_kPa.toFixed(3)}
          {roofLoad.purlin_kPa > 0 && ` + ${roofLoad.purlin_kPa.toFixed(3)} (прогоны)`}
          {roofLoad.beamCell_kPa > 0 && ` + ${roofLoad.beamCell_kPa.toFixed(3)} (балка покр.)`}
          {" = "}<b>{roofLoad.total_kPa.toFixed(3)} кПа</b> → нагрузка от кровли
        </div>
      )}
      {hasTruss && rx && (
        <div>
          Ферма (реакции на опоры) → V<sub>пост</sub> = {rx.V_perm_kN.toFixed(1)} кН,
          V<sub>снег</sub> = {rx.V_snow_kN.toFixed(1)} кН,
          V<sub>ветер</sub> = {rx.V_wind_kN.toFixed(1)} кН
        </div>
      )}
      {hasCrane && (
        <div>
          Подкрановая балка → {results.craneBeam!.profile} ({results.craneBeam!.steel})
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div style={{ marginBottom: 6 }}>
      <label style={{ fontSize: 13, display: "block" }}>{label}</label>
      <input
        type="number"
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", padding: 4, boxSizing: "border-box" }}
      />
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div style={{ marginBottom: 6 }}>
      <label style={{ fontSize: 13, display: "block" }}>{label}</label>
      <input
        type="text"
        readOnly
        value={value}
        style={{
          width: "100%",
          padding: 4,
          boxSizing: "border-box",
          background: "#f8fafc",
          color: "#475569",
        }}
      />
      {hint && (
        <div style={{ fontSize: 11, color: "#888" }}>{hint}</div>
      )}
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ marginBottom: 6 }}>
      <label style={{ fontSize: 13, display: "block" }}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", padding: 4, boxSizing: "border-box" }}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ marginBottom: 6 }}>
      <label style={{ fontSize: 13 }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          style={{ marginRight: 6 }}
        />
        {label}
      </label>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#888" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

import { TrussApp } from "./TrussApp";
import { PurlinApp } from "./PurlinApp";
import { BeamCellApp } from "./BeamCellApp";
import { WindowRiegelApp } from "./WindowRiegelApp";
import { CraneBeamApp } from "./CraneBeamApp";
import { SummaryApp } from "./SummaryApp";

type Mode = "column" | "truss" | "purlins" | "beamCell" | "windowRiegel" | "craneBeam" | "summary";

export function App() {
  const [mode, setMode] = useState<Mode>("column");
  const labelOf = (m: Mode) =>
    m === "column"
      ? "Колонна"
      : m === "truss"
      ? "Ферма"
      : m === "purlins"
      ? "Прогоны"
      : m === "beamCell"
      ? "Балка покрытия"
      : m === "windowRiegel"
      ? "Оконные ригели"
      : m === "craneBeam"
      ? "Подкрановая балка"
      : "Сводка";
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 1400, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: "2px solid #e2e8f0", flexWrap: "wrap" }}>
        {(["column", "truss", "purlins", "beamCell", "windowRiegel", "craneBeam", "summary"] as const).map((m) => {
          const isActive = mode === m;
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: "10px 24px",
                fontSize: 15,
                fontWeight: 600,
                background: isActive ? "#0369a1" : "transparent",
                color: isActive ? "white" : "#475569",
                border: "none",
                borderRadius: "6px 6px 0 0",
                cursor: "pointer",
                marginBottom: -2,
                borderBottom: isActive ? "2px solid #0369a1" : "2px solid transparent",
              }}
            >
              {labelOf(m)}
            </button>
          );
        })}
      </div>
      <BuildingSummaryBanner />
      {mode === "column" && <ColumnApp />}
      {mode === "truss" && <TrussApp />}
      {mode === "purlins" && <PurlinApp />}
      {mode === "beamCell" && <BeamCellApp />}
      {mode === "windowRiegel" && <WindowRiegelApp />}
      {mode === "craneBeam" && <CraneBeamApp />}
      {mode === "summary" && <SummaryApp />}
    </div>
  );
}

function BuildingSummaryBanner() {
  const { building } = useBuilding();
  return (
    <div
      title="Эти параметры синхронизированы между всеми вкладками. Жёлтые поля внутри вкладок изменяют их сразу везде."
      style={{
        marginBottom: 12,
        padding: "8px 12px",
        background: "#fef9c3",
        border: "1px dashed #eab308",
        borderRadius: 6,
        fontSize: 12,
        color: "#78350f",
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        alignItems: "center",
      }}
    >
      <span style={{ fontWeight: 600 }}>🔗 Здание (общее):</span>
      {building.city && <span>город <b>{building.city}</b></span>}
      <span>пролёт <b>{building.span_m}</b> м</span>
      <span>длина <b>{building.length_m}</b> м</span>
      <span>высота <b>{building.height_m}</b> м</span>
      <span>уклон <b>{building.roofSlope_deg}°</b></span>
      <span>шаг рам <b>{building.framePitch_m}</b> м</span>
      <span>w₀ <b>{building.w0_kPa}</b> кПа</span>
      <span>Sg <b>{building.Sg_kPa}</b> кПа</span>
      <span>местн. <b>{building.terrainType}</b></span>
      <span>покр. <b>{building.roofStructure}</b></span>
      <span>γₙ <b>{building.responsibilityCoeff}</b></span>
    </div>
  );
}
