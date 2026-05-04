import { useMemo, useState, useCallback } from "react";
import { runPurlinCalculation, getCassetteHeightFilter } from "./calc/purlin/engine";
import type {
  PurlinInput,
  PurlinOutput,
  SteelGrade,
  LstkProfileType,
  SnowDriftMode,
  RoofShape,
} from "./calc/purlin/types";
import type { TerrainType } from "./calc/types";
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
  const [input, setInput] = useState<PurlinInput>(DEFAULT_INPUT);
  const [out, setOut] = useState<PurlinOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cityQuery, setCityQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [maxUtilFixed, setMaxUtilFixed] = useState<boolean>(false);
  const [maxUtilValue, setMaxUtilValue] = useState<number>(0.85);

  const cityMatches = useMemo(() => {
    if (cityQuery.length < 2) return [];
    return searchSettlements(cityQuery).slice(0, 10);
  }, [cityQuery]);

  const handleCitySelect = useCallback((id: string) => {
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
  }, []);

  const handleCalc = () => {
    setError(null);
    try {
      const eff: PurlinInput = {
        ...input,
        maxUtilization: maxUtilFixed ? maxUtilValue : "default",
      };
      const r = runPurlinCalculation(eff);
      setOut(r);
    } catch (e) {
      setOut(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const upd = (patch: Partial<PurlinInput>) => setInput((p) => ({ ...p, ...patch }));

  const setRoofStructure = (id: string) => {
    const s = lookupStructure(id);
    upd({
      roofStructure: id,
      roofLoad_kPa: s ? s.kPa : input.roofLoad_kPa,
      cassetteHeightFilter_mm: getCassetteHeightFilter(id),
    });
  };

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Калькулятор прогонов покрытия (ЛСТК)</h1>
      <p style={{ color: "#666", fontSize: 13, marginTop: 0 }}>
        Подбор лёгких стальных тонкостенных профилей (2ТПС, 2ПС, Z) под профлист/сэндвич-панели. Каталог 100 профилей × 2 марки стали (МП350, МП390).
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
          <Field label="Пролёт, м" value={input.span_m} onChange={(v) => upd({ span_m: v })} />
          <Field label="Длина здания, м" value={input.length_m} onChange={(v) => upd({ length_m: v })} />
          <Field label="Высота до низа фермы, м" value={input.height_m} onChange={(v) => upd({ height_m: v })} />
          <Field label="Уклон кровли, °" value={input.roofSlope_deg} onChange={(v) => upd({ roofSlope_deg: v })} />
          <Field label="Шаг рам / пролёт прогона, м" value={input.framePitch_m} onChange={(v) => upd({ framePitch_m: v })} />
          <Field
            label="γₙ (коэф. ответственности)"
            value={input.gamma_n}
            onChange={(v) => upd({ gamma_n: v })}
            step={0.05}
          />
        </fieldset>

        {/* Column 2: loads */}
        <fieldset style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <legend style={{ fontWeight: 600 }}>Климат и нагрузки</legend>
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
            {selectedCity && <div style={{ fontSize: 12, color: "#080" }}>Выбран: {selectedCity}</div>}
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
          <Field label="Sg (снег), кПа" value={input.Sg_kPa} onChange={(v) => upd({ Sg_kPa: v })} step={0.05} />
          <SelectField
            label="Конструкция покрытия"
            value={input.roofStructure}
            options={STRUCTURES.map((s) => [s.id, `${s.id} (${s.kPa.toFixed(3)} кПа)`])}
            onChange={setRoofStructure}
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

      <button
        onClick={handleCalc}
        style={{
          padding: "8px 18px",
          fontSize: 15,
          background: "#0c4a6e",
          color: "white",
          border: 0,
          borderRadius: 6,
          cursor: "pointer",
        }}
      >
        Рассчитать
      </button>

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

          <h2 style={{ fontSize: 18, marginBottom: 6 }}>Топ-10 по массе на здание</h2>
          <div style={{ overflow: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
              <thead style={{ background: "#f1f5f9" }}>
                <tr>
                  <th style={th}>#</th>
                  <th style={th}>Сталь</th>
                  <th style={th}>Профиль</th>
                  <th style={th}>Шаг, мм</th>
                  <th style={th}>K</th>
                  <th style={th}>Кол-во</th>
                  <th style={th}>Масса/м, кг</th>
                  <th style={th}>Масса на здание, кг</th>
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
                    <td style={td}>{c.massPerBuilding_kg.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
