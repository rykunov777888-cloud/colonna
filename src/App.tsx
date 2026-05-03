import { useMemo, useState, useCallback } from "react";
import { runCalculation } from "./calc/engine";
import type {
  CalculationInput,
  CalculationOutput,
  ColumnType,
  RoofType,
  SpanCount,
} from "./calc/types";
import type { TerrainType } from "./calc/types";
import {
  searchSettlements,
  getSettlementClimateById,
} from "./types/climate";

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
  roofLoad_kPa: 0.105,
  wallLoad_kPa: 0.105,
  loadAddition_pct: 15,
  mu: 0.7,
  crane: {
    enabled: false,
    type: "overhead",
    capacity_t: 5,
    span_m: 42,
    count: "one",
    singleSpan: true,
    railLevel_m: 3.5,
    wheelLoad_kN: 0,
    trolleyMass_t: 0,
    base_m: 0,
    clearance_m: 0,
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
  const [result, setResult] = useState<CalculationOutput | null>(null);
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
      const r = runCalculation(input);
      setResult(r);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const upd = (patch: Partial<CalculationInput>) =>
    setInput((p) => ({ ...p, ...patch }));

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
          <Field label="Нагрузка от кровли, кПа" value={input.roofLoad_kPa} onChange={(v) => upd({ roofLoad_kPa: v })} step={0.001} />
          <Field label="Нагрузка от ограждения, кПа" value={input.wallLoad_kPa} onChange={(v) => upd({ wallLoad_kPa: v })} step={0.001} />
          <Field label="Ур. ответственности γₙ" value={input.responsibilityCoeff} onChange={(v) => upd({ responsibilityCoeff: v })} step={0.05} />
        </fieldset>

        {/* Column 3: column & economy */}
        <fieldset style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <legend style={{ fontWeight: 600 }}>Колонна и экономика</legend>
          <SelectField
            label="Тип колонны"
            value={input.columnType}
            options={[
              ["fachwerk", "Фахверковая"],
              ["edge", "Крайняя"],
              ["middle", "Средняя"],
            ]}
            onChange={(v) => upd({ columnType: v as ColumnType })}
          />
          <Field label="μ (к-т расч. длины)" value={input.mu} onChange={(v) => upd({ mu: v })} step={0.05} />
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

      {result && (
        <>
          <div style={{ display: "flex", gap: 24, marginBottom: 12, flexWrap: "wrap" }}>
            <Stat label="N (осевая)" value={`${result.N_kN.toFixed(1)} кН`} />
            <Stat label="M (момент)" value={`${result.M_kNm.toFixed(1)} кН·м`} />
            <Stat label="Снег расч." value={`${result.snowLoad_kPa.toFixed(3)} кПа`} />
            <Stat label="Ветер давл." value={`${result.windPressure_kPa.toFixed(3)} кПа`} />
            <Stat label="Ветер отс." value={`${result.windSuction_kPa.toFixed(3)} кПа`} />
            <Stat label="Sверт" value={`${result.tributaryArea_m2.toFixed(1)} м²`} />
            <Stat label="Sстен" value={`${result.wallArea_m2.toFixed(1)} м²`} />
          </div>

          <h2 style={{ fontSize: 16 }}>
            Подходящие профили ({result.results.length} из 2080 вариантов)
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
      )}
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
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        style={{ width: "100%", padding: 4, boxSizing: "border-box" }}
      />
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
        style={{ width: "100%", padding: 4 }}
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
    <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ fontSize: 12, color: "#666" }}>{label}:</span>{" "}
      <span style={{ fontWeight: 600, fontSize: 14 }}>{value}</span>
    </div>
  );
}
