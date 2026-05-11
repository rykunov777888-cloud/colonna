import { useMemo, useState, useCallback, useEffect } from "react";
import { runTrussCalculation, getDefaultMinThickness } from "./calc/truss/engine";
import { useBuilding, type Building } from "./building/context";
import { useBuildingResults, type TrussResult } from "./building/results";
import { useRoofTotalLoad_kPa } from "./building/loadPropagation";
import { SyncedNumField, SyncedSelectField } from "./building/SyncedField";
import { PricesBlock } from "./building/PricesBlock";
import {
  TRUSS_SECTIONS,
  TRUSS_SECTION_LABELS,
  TRUSS_SECTION_SHORT,
  type TrussInput,
  type TrussOutput,
  type TrussSection,
} from "./calc/truss/types";
import { searchSettlements, getSettlementClimateById } from "./types/climate";
import structuresJson from "./data/structures/structures.json";

interface StructureRow {
  id: string;
  kPa: number;
}
const STRUCTURES = structuresJson as StructureRow[];

function lookupStructure(id: string): StructureRow | undefined {
  return STRUCTURES.find((s) => s.id === id);
}

const DEFAULT_INPUT: TrussInput = {
  height_m: 12,
  span_m: 24,
  length_m: 30,
  framePitch_m: 6,
  purlinPitch_mm: 0,
  roofSlope_deg: 6,
  responsibilityCoeff: 1,
  terrainType: "B",
  w0_kPa: 0.3,
  Sg_kPa: 1.2,
  roofStructure: "наше 250 мм",
  roofLoad_kPa: 0.24,
  loadAddition_pct: 15,
  maxUtilization: 0.85,
  minThickness_mm: getDefaultMinThickness(),
  maxWidth_mm: { VP: 500, NP: 500 },
  minWidth_mm: { ORb: 80, OR: 80, RR: 60 },
};

export function TrussApp() {
  const { building, setBuilding } = useBuilding();
  const initialRoof = lookupStructure(building.roofStructure);
  const [input, setInput] = useState<TrussInput>(() => ({
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
  }));
  const [activeSection, setActiveSection] = useState<TrussSection>("VP");
  const [cityQuery, setCityQuery] = useState(building.city);
  const [showCityMatches, setShowCityMatches] = useState(false);
  const { setResult } = useBuildingResults();

  // Auto-recompute on every input change — no «Рассчитать» button needed.
  const { out, error } = useMemo<{ out: TrussOutput | null; error: string | null }>(() => {
    try {
      return { out: runTrussCalculation(input), error: null };
    } catch (e) {
      return { out: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [input]);

  // Publish truss selection into shared results bus for the Summary tab.
  useEffect(() => {
    if (!out) {
      setResult("truss", null);
      return;
    }
    const n_trusses = Math.max(2, Math.floor(input.length_m / input.framePitch_m) + 1);
    const sections = TRUSS_SECTIONS.flatMap((sec) => {
      const r = out.sections[sec];
      const sel = r.selected;
      if (!sel) return [];
      return [{
        section: TRUSS_SECTION_SHORT[sec],
        profile: sel.profile.name,
        steel: "С345", // truss tubes are typically С345
        totalMass_kg: sel.totalMass_kg * n_trusses,
      }];
    });
    const totalMass = out.totalMass_kg * n_trusses;
    const totalCost = totalMass * building.priceC345_rubKg;
    const payload: TrussResult = {
      sections,
      totalMass_kg: totalMass,
      totalCost_rub: totalCost,
      unitMass_kg_per_m2: out.unitMass_kg_per_m2,
      n_trusses,
      reactions: {
        V_perm_kN: out.loads.roof_kN_per_m * input.span_m / 2,
        V_snow_kN: out.loads.snow_kN_per_m * input.span_m / 2,
        V_wind_kN: out.loads.wind_kN_per_m * input.span_m / 2,
        H_kN: 0, // horizontal not computed here; placeholder
      },
    };
    setResult("truss", payload);
  }, [out, input.length_m, input.framePitch_m, input.span_m, building.priceC345_rubKg, setResult]);

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
      // Auto-propagation: roof load = panel + purlin self-weight + beam-cell self-weight.
      roofLoad_kPa: roofLoad.total_kPa > 0 ? roofLoad.total_kPa : cur.roofLoad_kPa,
      responsibilityCoeff: building.responsibilityCoeff,
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

  const handleCitySelect = useCallback((id: string) => {
    const s = getSettlementClimateById(id);
    if (!s) return;
    const label = `${s.settlement} (${s.region})`;
    setShowCityMatches(false);
    const patch: Partial<Building> = { city: label };
    if (s.terrain.defaultType) patch.terrainType = s.terrain.defaultType as Building["terrainType"];
    if (typeof s.wind.w0Kpa === "number") patch.w0_kPa = s.wind.w0Kpa;
    if (typeof s.snow.sgKpa === "number") patch.Sg_kPa = s.snow.sgKpa;
    setBuilding(patch);
  }, [setBuilding]);



  const upd = (patch: Partial<TrussInput>) =>
    setInput((p) => ({ ...p, ...patch }));

  const updMinThick = (sec: TrussSection, v: number) =>
    setInput((p) => ({ ...p, minThickness_mm: { ...p.minThickness_mm, [sec]: v } }));
  const updMaxWidth = (k: "VP" | "NP", v: number) =>
    setInput((p) => ({ ...p, maxWidth_mm: { ...p.maxWidth_mm, [k]: v } }));
  const updMinWidth = (k: "ORb" | "OR" | "RR", v: number) =>
    setInput((p) => ({ ...p, minWidth_mm: { ...p.minWidth_mm, [k]: v } }));

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Калькулятор стальной фермы покрытия</h1>
      <p style={{ color: "#666", fontSize: 13, marginTop: 0 }}>
        Подбор сечений 5 элементов фермы (ВП, НП, ОРб, ОР, РР) по СП 16.13330. Каталог 579 трубных профилей с исключением нестандартных толщин.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Column 1: geometry */}
        <fieldset style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <legend style={{ fontWeight: 600 }}>Геометрия фермы</legend>
          <SyncedNumField label="Пролёт, м (18–30)" value={input.span_m} onChange={(v) => updSynced("span_m", v)} />
          <SyncedNumField label="Длина здания, м" value={input.length_m} onChange={(v) => updSynced("length_m", v)} />
          <SyncedNumField label="Высота до низа фермы, м" value={input.height_m} onChange={(v) => updSynced("height_m", v)} />
          <SyncedNumField label="Уклон кровли, °" value={input.roofSlope_deg} onChange={(v) => updSynced("roofSlope_deg", v)} />
          <SyncedNumField label="Шаг рам, м" value={input.framePitch_m} onChange={(v) => updSynced("framePitch_m", v)} />
          <Field
            label="Шаг прогонов, мм (0 = без прогонов)"
            value={input.purlinPitch_mm}
            onChange={(v) => upd({ purlinPitch_mm: v })}
            step={100}
          />
          <SyncedNumField
            label="γₙ (коэф. ответственности)"
            value={input.responsibilityCoeff}
            onChange={(v) => updSynced("responsibilityCoeff", v)}
            step={0.05}
          />
        </fieldset>

        {/* Column 2: loads */}
        <fieldset style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <legend style={{ fontWeight: 600 }}>Климат и нагрузки</legend>
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
          <Field
            label="Нагрузка от кровли, кПа"
            value={input.roofLoad_kPa}
            onChange={(v) => upd({ roofLoad_kPa: v })}
            step={0.01}
          />
          {(roofLoad.purlin_kPa > 0 || roofLoad.beamCell_kPa > 0) && (
            <div style={{ fontSize: 11, color: "#0369a1", marginTop: -4, marginBottom: 6 }}>
              🔗 авто: {roofLoad.structure_kPa.toFixed(3)} (покрытие)
              {roofLoad.purlin_kPa > 0 && ` + ${roofLoad.purlin_kPa.toFixed(3)} (прогоны)`}
              {roofLoad.beamCell_kPa > 0 && ` + ${roofLoad.beamCell_kPa.toFixed(3)} (балка покр.)`}
              {" = "}
              <b>{roofLoad.total_kPa.toFixed(3)} кПа</b>
            </div>
          )}
          <Field
            label="Надбавка к нагрузке, %"
            value={input.loadAddition_pct}
            onChange={(v) => upd({ loadAddition_pct: v })}
          />
        </fieldset>

        {/* Column 3: constraints */}
        <fieldset style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <legend style={{ fontWeight: 600 }}>Ограничения сечений</legend>
          <Field
            label="Макс. к-т использования"
            value={input.maxUtilization}
            onChange={(v) => upd({ maxUtilization: v })}
            step={0.05}
          />
          <div style={{ fontSize: 12, color: "#666", marginTop: 8, marginBottom: 4 }}>Мин. толщина стенки, мм</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {TRUSS_SECTIONS.map((s) => (
              <Field
                key={s}
                label={`${TRUSS_SECTION_SHORT[s]}`}
                value={input.minThickness_mm[s]}
                onChange={(v) => updMinThick(s, v)}
                step={0.5}
              />
            ))}
          </div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 8, marginBottom: 4 }}>
            Макс. ширина пояса, мм
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <Field label="ВП" value={input.maxWidth_mm.VP} onChange={(v) => updMaxWidth("VP", v)} step={10} />
            <Field label="НП" value={input.maxWidth_mm.NP} onChange={(v) => updMaxWidth("NP", v)} step={10} />
          </div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 8, marginBottom: 4 }}>
            Мин. ширина раскоса, мм
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            <Field label="ОРб" value={input.minWidth_mm.ORb} onChange={(v) => updMinWidth("ORb", v)} step={10} />
            <Field label="ОР" value={input.minWidth_mm.OR} onChange={(v) => updMinWidth("OR", v)} step={10} />
            <Field label="РР" value={input.minWidth_mm.RR} onChange={(v) => updMinWidth("RR", v)} step={10} />
          </div>
        </fieldset>
      </div>

      <div style={{ marginBottom: 16 }}>
        <PricesBlock />
      </div>



      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: 8, marginBottom: 16, color: "#991b1b" }}>
          Ошибка: {error}
        </div>
      )}

      {out && (
        <div>
          {/* Sticky summary */}
          <div style={{ display: "flex", gap: 16, padding: "12px 16px", background: "#f1f5f9", borderRadius: 6, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
            <Stat label="Общая масса фермы, кг" value={out.totalMass_kg.toFixed(1)} />
            <Stat label="Удельная масса, кг/м²" value={out.unitMass_kg_per_m2.toFixed(2)} />
            <Stat label="Снег, кН/м" value={out.loads.snow_kN_per_m.toFixed(2)} />
            <Stat label="Ветер, кН/м" value={out.loads.wind_kN_per_m.toFixed(2)} />
            <Stat label="Кровля, кН/м" value={out.loads.roof_kN_per_m.toFixed(2)} />
          </div>

          {out.warnings.length > 0 && (
            <div style={{ background: "#fef3c7", border: "1px solid #fde68a", padding: 8, marginBottom: 12, color: "#92400e", fontSize: 13 }}>
              {out.warnings.map((w, i) => (
                <div key={i}>⚠ {w}</div>
              ))}
            </div>
          )}

          {/* 5 cards summary */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 16 }}>
            {TRUSS_SECTIONS.map((sec) => {
              const r = out.sections[sec];
              const sel = r.selected;
              const isActive = activeSection === sec;
              return (
                <button
                  key={sec}
                  onClick={() => setActiveSection(sec)}
                  style={{
                    background: isActive ? "#0369a1" : "white",
                    color: isActive ? "white" : "#0f172a",
                    border: isActive ? "1px solid #0369a1" : "1px solid #cbd5e1",
                    borderRadius: 6,
                    padding: 10,
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 11, opacity: 0.7 }}>{TRUSS_SECTION_LABELS[sec]}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{TRUSS_SECTION_SHORT[sec]}</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    {sel ? sel.profile.name : <span style={{ color: "#dc2626" }}>не подобрано</span>}
                  </div>
                  {sel && (
                    <div style={{ fontSize: 11, marginTop: 2, opacity: 0.85 }}>
                      {sel.totalMass_kg.toFixed(0)} кг · K={sel.maxUtilization.toFixed(2)}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Detail of active section */}
          <SectionDetail result={out.sections[activeSection]} />
        </div>
      )}
    </div>
  );
}

function SectionDetail({
  result,
}: {
  result: TrussOutput["sections"][TrussSection];
}) {
  const sec = result.section;
  const f = result.forces;
  const checkNames =
    result.candidates.length > 0 ? Object.keys(result.candidates[0].checks) : [];

  return (
    <div>
      <h2 style={{ fontSize: 16, marginBottom: 8 }}>
        {TRUSS_SECTION_LABELS[sec]} ({TRUSS_SECTION_SHORT[sec]}) — детали
      </h2>
      <div style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap", fontSize: 13 }}>
        <span><b>N</b> = {f.N_kN.toFixed(1)} кН</span>
        {sec === "VP" && (
          <>
            <span><b>M</b> = {f.M_kNm.toFixed(2)} кН·м</span>
            <span><b>Q</b> = {f.Q_kN.toFixed(1)} кН</span>
          </>
        )}
        {(sec === "ORb" || sec === "OR" || sec === "RR") && (
          <>
            <span><b>N+</b> = {(f.Np_kN ?? 0).toFixed(1)} кН</span>
            <span><b>N−</b> = {(f.Nm_kN ?? 0).toFixed(1)} кН</span>
          </>
        )}
        <span><b>lefx</b> = {result.lefx_m.toFixed(2)} м</span>
        <span><b>lefy</b> = {result.lefy_m.toFixed(2)} м</span>
        <span><b>длина элемента</b> = {result.member_length_m.toFixed(2)} м</span>
      </div>

      {result.candidates.length === 0 ? (
        <div style={{ color: "#dc2626", padding: 16, background: "#fef2f2", borderRadius: 6 }}>
          Нет проходящих профилей. Попробуйте увеличить макс. ширину или снизить ограничения.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
            <thead>
              <tr style={{ background: "#f1f5f9" }}>
                <th style={th}>#</th>
                <th style={th}>Профиль</th>
                <th style={th}>Ry, МПа</th>
                <th style={th}>λx</th>
                <th style={th}>λy</th>
                {checkNames.map((n) => (
                  <th key={n} style={th}>
                    {n}
                  </th>
                ))}
                <th style={th}>K макс</th>
                <th style={th}>Лимит</th>
                <th style={th}>Масса, кг</th>
              </tr>
            </thead>
            <tbody>
              {result.candidates.map((c, i) => (
                <tr
                  key={c.profile.name + i}
                  style={{
                    background: i === 0 ? "#dcfce7" : c.maxUtilization > 0.95 ? "#fef2f2" : undefined,
                  }}
                >
                  <td style={td}>{i + 1}</td>
                  <td style={{ ...td, fontWeight: i === 0 ? 600 : 400 }}>{c.profile.name}</td>
                  <td style={td}>{c.Ry_MPa.toFixed(0)}</td>
                  <td style={td}>{c.lambda_x.toFixed(0)}</td>
                  <td style={td}>{c.lambda_y.toFixed(0)}</td>
                  {checkNames.map((n) => (
                    <td key={n} style={td}>
                      {(c.checks[n] ?? 0).toFixed(3)}
                    </td>
                  ))}
                  <td style={{ ...td, fontWeight: 600 }}>{c.maxUtilization.toFixed(3)}</td>
                  <td style={td}>{c.limitingCheck}</td>
                  <td style={td}>{c.totalMass_kg.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid #e2e8f0", textAlign: "left", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "4px 8px", borderBottom: "1px solid #f1f5f9" };

function Field({
  label,
  value,
  onChange,
  step = 1,
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
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#888" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
