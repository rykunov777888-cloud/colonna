import { useMemo, useState, useCallback } from "react";
import { runCalculation, computeMu } from "./calc/engine";
import type {
  CalculationInput,
  CalculationOutput,
  ColumnType,
  CraneCapacity,
  RoofType,
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

export function App() {
  const [input, setInput] = useState<CalculationInput>(DEFAULT_INPUT);
  const [results, setResults] = useState<Results | null>(null);
  const [activeTab, setActiveTab] = useState<ColumnType>("edge");
  const [error, setError] = useState<string | null>(null);
  const [cityQuery, setCityQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState("");

  const cityMatches = useMemo(() => {
    if (cityQuery.length < 2) return [];
    return searchSettlements(cityQuery).slice(0, 10);
  }, [cityQuery]);

  const handleCitySelect = useCallback(
    (id: string) => {
      const s = getSettlementClimateById(id);
      if (!s) return;
      setSelectedCity(`${s.settlement} (${s.region})`);
      setCityQuery("");
      setInput((prev) => ({
        ...prev,
        w0_kPa: s.wind.w0Kpa ?? prev.w0_kPa,
        Sg_kPa: s.snow.sgKpa ?? prev.Sg_kPa,
        terrainType: s.terrain.defaultType ?? prev.terrainType,
      }));
    },
    [],
  );

  const handleCalc = () => {
    setError(null);
    try {
      const out: Partial<Results> = {};
      for (const ct of COLUMN_TYPES) {
        out[ct] = runCalculation({ ...input, columnType: ct });
      }
      setResults(out as Results);
    } catch (e) {
      setResults(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const upd = (patch: Partial<CalculationInput>) =>
    setInput((p) => ({ ...p, ...patch }));

  const setRoofStructure = (id: string) => {
    const s = lookupStructure(id);
    upd({
      roofStructure: id,
      roofLoad_kPa: s ? s.kPa : input.roofLoad_kPa,
    });
  };
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
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 1400, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>
        Калькулятор стальных колонн промышленных зданий
      </h1>
      <p style={{ color: "#666", fontSize: 13, marginTop: 0 }}>
        Подбор профиля по СП 16.13330 / СП 20.13330. 208 профилей × 4 марки стали × 0–4 распорки.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Column 1: building geometry */}
        <fieldset style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <legend style={{ fontWeight: 600 }}>Геометрия здания</legend>
          <Field label="Пролёт, м" value={input.span_m} onChange={(v) => upd({ span_m: v })} />
          <Field label="Длина, м" value={input.length_m} onChange={(v) => upd({ length_m: v })} />
          <Field label="Высота, м" value={input.height_m} onChange={(v) => upd({ height_m: v })} />
          <Field label="Уклон кровли, °" value={input.roofSlope_deg} onChange={(v) => upd({ roofSlope_deg: v })} />
          <Field label="Шаг рам, м" value={input.framePitch_m} onChange={(v) => upd({ framePitch_m: v })} />
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
          <SelectField
            label="Кровля"
            value={input.roofType}
            options={[
              ["gable", "Двускатная"],
              ["single_slope", "Односкатная"],
            ]}
            onChange={(v) => upd({ roofType: v as RoofType })}
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
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 13, display: "block" }}>Город (автозаполнение w₀, Sg)</label>
            <input
              style={{ width: "100%", padding: 4, boxSizing: "border-box" }}
              value={cityQuery}
              onChange={(e) => setCityQuery(e.target.value)}
              placeholder="Введите название..."
            />
            {cityMatches.length > 0 && (
              <div style={{ border: "1px solid #ddd", maxHeight: 200, overflow: "auto" }}>
                {cityMatches.map((s) => (
                  <div
                    key={s.id}
                    style={{ padding: "4px 8px", cursor: "pointer", fontSize: 13 }}
                    onClick={() => handleCitySelect(s.id)}
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
            {selectedCity && (
              <div style={{ fontSize: 12, color: "#080" }}>Выбран: {selectedCity}</div>
            )}
          </div>
          <SelectField
            label="Тип местности"
            value={input.terrainType}
            options={[
              ["A", "A — открытая"],
              ["B", "B — город/лес"],
              ["C", "C — плотная застройка"],
            ]}
            onChange={(v) => upd({ terrainType: v as TerrainType })}
          />
          <Field label="w₀ (ветер), кПа" value={input.w0_kPa} onChange={(v) => upd({ w0_kPa: v })} step={0.01} />
          <Field label="Sg (снег), кПа" value={input.Sg_kPa} onChange={(v) => upd({ Sg_kPa: v })} step={0.01} />
          <SelectField
            label="Конструкция покрытия"
            value={input.roofStructure}
            options={STRUCTURES.map((s) => [s.id, `${s.id} (${s.kPa.toFixed(3)} кПа)`])}
            onChange={setRoofStructure}
          />
          <Field label="Нагрузка от кровли, кПа" value={input.roofLoad_kPa} onChange={(v) => upd({ roofLoad_kPa: v })} step={0.001} />
          <SelectField
            label="Конструкция ограждения"
            value={input.wallStructure}
            options={STRUCTURES.map((s) => [s.id, `${s.id} (${s.kPa.toFixed(3)} кПа)`])}
            onChange={setWallStructure}
          />
          <Field label="Нагрузка от ограждения, кПа" value={input.wallLoad_kPa} onChange={(v) => upd({ wallLoad_kPa: v })} step={0.001} />
          <Field label="Ур. ответственности γₙ" value={input.responsibilityCoeff} onChange={(v) => upd({ responsibilityCoeff: v })} step={0.05} />
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
          <hr style={{ margin: "8px 0" }} />
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Цены стали, руб/кг</div>
          {(["С255Б", "С355Б", "С245", "С345"] as const).map((s) => (
            <Field
              key={s}
              label={s}
              value={input.prices[s]}
              onChange={(v) =>
                upd({ prices: { ...input.prices, [s]: v } })
              }
              step={0.1}
            />
          ))}
        </fieldset>
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

      <button
        onClick={handleCalc}
        style={{
          padding: "10px 32px",
          fontSize: 16,
          fontWeight: 600,
          background: "#2563eb",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          marginBottom: 16,
        }}
      >
        Рассчитать
      </button>

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
