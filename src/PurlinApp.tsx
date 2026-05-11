import { useMemo, useState, useCallback, useEffect } from "react";
import { runPurlinCalculation, getCassetteHeightFilter } from "./calc/purlin/engine";
import { useBuilding, type Building } from "./building/context";
import { useBuildingResults, type ResultItem } from "./building/results";
import { SyncedNumField, SyncedSelectField } from "./building/SyncedField";
import { PricesBlock } from "./building/PricesBlock";
import {
  selectRolledTop10,
  type RolledCandidate,
  type RolledPrices,
} from "./calc/purlin/rolled";
import type {
  PurlinInput,
  PurlinOutput,
  SteelGrade,
  LstkProfileType,
  SnowDriftMode,
  RoofShape,
} from "./calc/purlin/types";
import { searchSettlements, getSettlementClimateById } from "./types/climate";
import structuresJson from "./data/structures/structures.json";

interface StructureRow {
  id: string;
  kPa: number;
}
const STRUCTURES = structuresJson as StructureRow[];
const lookupStructure = (id: string) => STRUCTURES.find((s) => s.id === id);

const DEFAULT_INPUT: PurlinInput = {
  gamma_n: 1,
  roofShape: "gable",
  span_m: 24,
  length_m: 60,
  height_m: 12,
  roofSlope_deg: 6,
  framePitch_m: 6,
  terrainType: "B",
  w0_kPa: 0.6,
  Sg_kPa: 2.45,
  roofStructure: "С-П 150 мм",
  roofLoad_kPa: 0.32028,
  snowDrift: "none",
  drift_dropHeight_m: 4.5,
  drift_existingSize_m: 9.5,
  maxStep_mm: 1500,
  minStep_mm: 500,
  snowGuardPurlin: false,
  fencePurlin: false,
  maxUtilization: "default",
  cassetteHeightFilter_mm: getCassetteHeightFilter("С-П 150 мм"),
};

const TYPE_LABELS: Record<LstkProfileType, string> = {
  "2TPS": "2ТПС",
  "2PS": "2ПС",
  "Z": "Z",
};
const GRADE_LABELS: Record<SteelGrade, string> = { MP350: "МП350", MP390: "МП390" };

export function PurlinApp() {
  const { building, setBuilding } = useBuilding();
  const initialRoof = lookupStructure(building.roofStructure);
  const [input, setInput] = useState<PurlinInput>(() => ({
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
    gamma_n: building.responsibilityCoeff,
    cassetteHeightFilter_mm: getCassetteHeightFilter(building.roofStructure),
  }));
  const { setResult } = useBuildingResults();
  const [cityQuery, setCityQuery] = useState(building.city);
  const [showCityMatches, setShowCityMatches] = useState(false);
  const [maxUtilFixed, setMaxUtilFixed] = useState<boolean>(false);
  const [maxUtilValue, setMaxUtilValue] = useState<number>(0.85);
  const [rolledMaxK, setRolledMaxK] = useState<number>(0.8);
  // Prices for rolled-section selection are mapped from the synced building-level
  // prices block (С255Б / С355Б / С245 / С345). Channels reuse C245/C345 like tubes.
  const rolledPrices: RolledPrices = {
    beam_C255B: building.priceC255B_rubKg,
    beam_C355B: building.priceC355B_rubKg,
    tube_C245: building.priceC245_rubKg,
    tube_C345: building.priceC345_rubKg,
    channel_C245: building.priceC245_rubKg,
    channel_C345: building.priceC345_rubKg,
  };

  useEffect(() => {
    const roof = lookupStructure(building.roofStructure);
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
      roofLoad_kPa: roof ? roof.kPa : cur.roofLoad_kPa,
      cassetteHeightFilter_mm: getCassetteHeightFilter(building.roofStructure),
      gamma_n: building.responsibilityCoeff,
    }));
    setCityQuery(building.city);
  }, [building]);

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

  // Auto-recompute on every input/option change — no «Рассчитать» button needed.
  const { out, rolledTop10, error } = useMemo<{
    out: PurlinOutput | null;
    rolledTop10: RolledCandidate[];
    error: string | null;
  }>(() => {
    try {
      const eff: PurlinInput = {
        ...input,
        maxUtilization: maxUtilFixed ? maxUtilValue : "default",
      };
      const r = runPurlinCalculation(eff);
      // SLS load (II ПС) for deflection, per Excel F11+F13 = 0.5·1.1·Sg·cosα·γn + roofLoad/1.2·γn
      const cosA = Math.cos((eff.roofSlope_deg * Math.PI) / 180);
      const q_SLS_kPa =
        0.5 * 1.1 * eff.Sg_kPa * cosA * eff.gamma_n + (eff.roofLoad_kPa / 1.2) * eff.gamma_n;
      // Axial wind on facade transferred to purlin (Excel D18) — placeholder; default ≈ 29.65 kN.
      const N_axial_kN = 29.65;
      const rolled = selectRolledTop10(
        {
          ...eff,
          minStep_mm: 1500,
          maxStep_mm: 1500,
          N_axial_kN_externalOverride: N_axial_kN,
          rolledMaxK,
          rolledPrices,
        },
        r.q_total_kPa,
        q_SLS_kPa,
      );
      return { out: r, rolledTop10: rolled, error: null };
    } catch (e) {
      return { out: null, rolledTop10: [], error: e instanceof Error ? e.message : String(e) };
    }
  }, [input, maxUtilFixed, maxUtilValue, rolledMaxK, rolledPrices]);

  // Publish ЛСТК top-1 selection to shared results bus for the Summary tab.
  useEffect(() => {
    if (!out || out.top10.length === 0) {
      setResult("purlin", null);
      return;
    }
    const top = out.top10[0];
    const isMP390 = top.profile.Ry_MPa >= 380;
    const steelLabel = isMP390 ? "МП390" : "МП350";
    const pricePerKg = isMP390 ? building.priceMP390_rubKg : building.priceMP350_rubKg;
    const item: ResultItem = {
      profile: top.profile.name,
      steel: steelLabel,
      totalMass_kg: top.massPerBuilding_kg,
      cost_rub: top.massPerBuilding_kg * pricePerKg,
    };
    setResult("purlin", item);
  }, [out, building.priceMP350_rubKg, building.priceMP390_rubKg, setResult]);

  const upd = (patch: Partial<PurlinInput>) => setInput((p) => ({ ...p, ...patch }));

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Калькулятор прогонов покрытия</h1>
      <p style={{ color: "#666", fontSize: 13, marginTop: 0 }}>
        Два каталога рядом: ЛСТК (2ТПС/2ПС/Z, МП350/МП390) и прокатные трубы (кв./пр., С245/С345). Шаг прокатных прогонов фиксирован 1500&nbsp;мм.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Column 1: geometry */}
        <fieldset style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <legend style={{ fontWeight: 600 }}>Геометрия здания</legend>
          <SelectField
            label="Тип кровли"
            value={input.roofShape}
            options={[
              ["gable", "двускатная"],
              ["monoslope", "односкатная"],
            ]}
            onChange={(v) => upd({ roofShape: v as RoofShape })}
          />
          <SyncedNumField label="Пролёт, м" value={input.span_m} onChange={(v) => updSynced("span_m", v)} />
          <SyncedNumField label="Длина здания, м" value={input.length_m} onChange={(v) => updSynced("length_m", v)} />
          <SyncedNumField label="Высота до низа фермы, м" value={input.height_m} onChange={(v) => updSynced("height_m", v)} />
          <SyncedNumField label="Уклон кровли, °" value={input.roofSlope_deg} onChange={(v) => updSynced("roofSlope_deg", v)} />
          <SyncedNumField label="Шаг рам / пролёт прогона, м" value={input.framePitch_m} onChange={(v) => updSynced("framePitch_m", v)} />
          <SyncedNumField
            label="γₙ (коэф. ответственности)"
            value={input.gamma_n}
            onChange={(v) => setBuilding({ responsibilityCoeff: v })}
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
          <SyncedNumField label="Sg (снег), кПа" value={input.Sg_kPa} onChange={(v) => updSynced("Sg_kPa", v)} step={0.05} />
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
            step={0.001}
          />
        </fieldset>

        {/* Column 3: snow drift + step constraints */}
        <fieldset style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <legend style={{ fontWeight: 600 }}>Снеговой мешок и параметры подбора</legend>
          <SelectField
            label="Снеговой мешок"
            value={input.snowDrift}
            options={[
              ["none", "нет"],
              ["along", "вдоль здания"],
              ["across", "поперёк здания"],
            ]}
            onChange={(v) => upd({ snowDrift: v as SnowDriftMode })}
          />
          {input.snowDrift !== "none" && (
            <>
              <Field
                label="Высота перепада, м"
                value={input.drift_dropHeight_m}
                onChange={(v) => upd({ drift_dropHeight_m: v })}
                step={0.5}
              />
              <Field
                label="Размер существующего здания, м"
                value={input.drift_existingSize_m}
                onChange={(v) => upd({ drift_existingSize_m: v })}
                step={0.5}
              />
            </>
          )}
          <Field
            label="Мин. шаг прогонов, мм"
            value={input.minStep_mm}
            onChange={(v) => upd({ minStep_mm: v })}
            step={5}
          />
          <Field
            label="Макс. шаг прогонов, мм"
            value={input.maxStep_mm}
            onChange={(v) => upd({ maxStep_mm: v })}
            step={5}
          />
          <SelectField
            label="Прогон под снегозадержание"
            value={input.snowGuardPurlin ? "yes" : "no"}
            options={[
              ["no", "нет"],
              ["yes", "да"],
            ]}
            onChange={(v) => upd({ snowGuardPurlin: v === "yes" })}
          />
          <SelectField
            label="Прогон под ограждение"
            value={input.fencePurlin ? "yes" : "no"}
            options={[
              ["no", "нет"],
              ["yes", "да"],
            ]}
            onChange={(v) => upd({ fencePurlin: v === "yes" })}
          />
          <div style={{ marginBottom: 6 }}>
            <label style={{ fontSize: 13, display: "block" }}>
              <input
                type="checkbox"
                checked={maxUtilFixed}
                onChange={(e) => setMaxUtilFixed(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              Фикс. макс. к-т исп. (иначе по умолчанию: 0.85/0.87/0.90 по толщине)
            </label>
            {maxUtilFixed && (
              <input
                type="number"
                step={0.01}
                min={0.1}
                max={1}
                value={maxUtilValue}
                onChange={(e) => setMaxUtilValue(Number(e.target.value))}
                style={{ width: "100%", padding: 4, boxSizing: "border-box" }}
              />
            )}
          </div>
        </fieldset>
      </div>

      <div style={{ marginBottom: 16 }}>
        <PricesBlock />
      </div>

      {error && (
        <div style={{ marginTop: 12, color: "#b91c1c", fontSize: 14 }}>
          Ошибка: {error}
        </div>
      )}

      {out && (
        <div style={{ marginTop: 18 }}>
          <h2 style={{ fontSize: 18, marginBottom: 6 }}>Нагрузки</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 12,
              padding: 10,
              background: "#f8fafc",
              borderRadius: 6,
              marginBottom: 16,
            }}
          >
            <Stat label="q снег, кПа" value={out.q_snow_kPa.toFixed(4)} />
            <Stat label="q ветер (FGH+), кПа" value={out.q_windRoof_kPa.toFixed(4)} />
            <Stat label="q покрытие, кПа" value={out.q_roof_kPa.toFixed(4)} />
            <Stat label="q итог, кПа" value={out.q_total_kPa.toFixed(4)} />
            <Stat label="μ₂" value={out.mu2.toFixed(3)} />
          </div>

          <h2 style={{ fontSize: 18, marginBottom: 6 }}>Подобранные сечения по типам и маркам стали</h2>
          <div style={{ overflow: "auto", marginBottom: 16 }}>
            <table style={{ borderCollapse: "collapse", fontSize: 13, minWidth: 880 }}>
              <thead style={{ background: "#f1f5f9" }}>
                <tr>
                  <th style={th}>Сталь</th>
                  <th style={th}>Тип</th>
                  <th style={th}>Профиль</th>
                  <th style={th}>Шаг, мм</th>
                  <th style={th}>М_расч, кН·м</th>
                  <th style={th}>М_пред, кН·м</th>
                  <th style={th}>K</th>
                  <th style={th}>Кол-во</th>
                  <th style={th}>Масса/м, кг</th>
                  <th style={th}>Масса на 1 шаг, кг</th>
                  <th style={th}>Масса на здание, кг</th>
                </tr>
              </thead>
              <tbody>
                {out.sections.map((s) => {
                  const c = s.best;
                  const key = `${s.grade}-${s.type}`;
                  if (!c) {
                    return (
                      <tr key={key}>
                        <td style={td}>{GRADE_LABELS[s.grade]}</td>
                        <td style={td}>{TYPE_LABELS[s.type]}</td>
                        <td style={td} colSpan={9}>
                          <span style={{ color: "#999" }}>нет подходящего профиля</span>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr
                      key={key}
                      style={{ background: c.K > 0.95 ? "#fef2f2" : undefined }}
                    >
                      <td style={td}>{GRADE_LABELS[s.grade]}</td>
                      <td style={td}>{TYPE_LABELS[s.type]}</td>
                      <td style={td}>{c.profile.name}</td>
                      <td style={td}>{c.spacing_mm}</td>
                      <td style={td}>{c.M_design_kNm.toFixed(2)}</td>
                      <td style={td}>{c.M_pred_eff_kNm.toFixed(2)}</td>
                      <td style={td}>{c.K.toFixed(3)}</td>
                      <td style={td}>{c.nPurlins}</td>
                      <td style={td}>{c.profile.mass_kg_per_m.toFixed(3)}</td>
                      <td style={td}>{c.massPerFrameStep_kg.toFixed(2)}</td>
                      <td style={td}>{c.massPerBuilding_kg.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              alignItems: "start",
            }}
          >
            <div style={{ overflow: "auto" }}>
              <h2 style={{ fontSize: 17, marginBottom: 6 }}>
                Топ-10 ЛСТК (по массе на здание)
              </h2>
              <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 540 }}>
                <thead style={{ background: "#f1f5f9" }}>
                  <tr>
                    <th style={th}>#</th>
                    <th style={th}>Сталь</th>
                    <th style={th}>Профиль</th>
                    <th style={th}>Шаг, мм</th>
                    <th style={th}>K</th>
                    <th style={th}>Кол-во</th>
                    <th style={th}>Масса/м, кг</th>
                    <th style={th}>Масса, кг</th>
                  </tr>
                </thead>
                <tbody>
                  {out.top10.map((c, i) => (
                    <tr
                      key={i}
                      style={{ background: c.K > 0.95 ? "#fef2f2" : undefined }}
                    >
                      <td style={td}>{i + 1}</td>
                      <td style={td}>{c.profile.Ry_MPa === 350 ? "МП350" : "МП390"}</td>
                      <td style={td}>{c.profile.name}</td>
                      <td style={td}>{c.spacing_mm}</td>
                      <td style={td}>{c.K.toFixed(3)}</td>
                      <td style={td}>{c.nPurlins}</td>
                      <td style={td}>{c.profile.mass_kg_per_m.toFixed(3)}</td>
                      <td style={td}>{c.massPerBuilding_kg.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ overflow: "auto" }}>
              <h2 style={{ fontSize: 17, marginBottom: 6 }}>
                Топ-10 прокатных труб (по стоимости, шаг 1500&nbsp;мм)
              </h2>
              {rolledTop10.length === 0 ? (
                <div style={{ color: "#999", fontSize: 13, padding: 8 }}>
                  Нет подходящих прокатных профилей при K&nbsp;≤&nbsp;{rolledMaxK.toFixed(2)}.
                </div>
              ) : (
                <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 540 }}>
                  <thead style={{ background: "#f1f5f9" }}>
                    <tr>
                      <th style={th}>#</th>
                      <th style={th}>Сталь</th>
                      <th style={th}>Профиль</th>
                      <th style={th}>Шаг, мм</th>
                      <th style={th}>K</th>
                      <th style={th}>Масса/м, кг</th>
                      <th style={th}>Масса, кг</th>
                      <th style={th}>₽ за шаг, тыс.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rolledTop10.map((c, i) => (
                      <tr
                        key={i}
                        style={{ background: c.K > 0.95 ? "#fef2f2" : undefined }}
                      >
                        <td style={td}>{i + 1}</td>
                        <td style={td}>{c.steel}</td>
                        <td style={td}>{c.profile.name}</td>
                        <td style={td}>{c.spacing_mm}</td>
                        <td style={td}>{c.K.toFixed(3)}</td>
                        <td style={td}>{c.profile.mass_kg_per_m.toFixed(2)}</td>
                        <td style={td}>{c.massPerBuilding_kg.toFixed(0)}</td>
                        <td style={td}>{c.costPerFrameStep_kRub.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
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
