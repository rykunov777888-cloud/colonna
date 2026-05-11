import { useMemo, useState } from "react";
import { PricesBlock } from "./building/PricesBlock";
import {
  calculateCraneBeam,
  craneOptions,
  defaultCraneInputs,
} from "./calc/craneBeam/engine";
import type {
  CraneCalculationResult,
  CraneCalculatorInputs,
  CraneCheckValue,
} from "./calc/craneBeam/types";

function fmt(n: number | string | null | undefined, digits = 3): string {
  if (n === null || n === undefined) return "—";
  if (typeof n === "number") return Number.isFinite(n) ? n.toFixed(digits) : "—";
  return String(n);
}

function fmtN(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export function CraneBeamApp() {
  const [inputs, setInputs] = useState<CraneCalculatorInputs>(defaultCraneInputs);
  const [result, setResult] = useState<CraneCalculationResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upd = <K extends keyof CraneCalculatorInputs>(k: K, v: CraneCalculatorInputs[K]) =>
    setInputs((cur) => ({ ...cur, [k]: v }));

  const handleCalc = async () => {
    setCalculating(true);
    setError(null);
    // defer to next tick so UI shows "calculating"
    await new Promise((r) => setTimeout(r, 0));
    try {
      const r = calculateCraneBeam(inputs);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setCalculating(false);
    }
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Подкрановая балка</h2>
      <p style={{ color: "#666", marginTop: 0, fontSize: 13 }}>
        Расчёт по СП 16.13330 + СП 35.13330. Подбор сечения, проверка прочности / общей и местной
        устойчивости / усталости (7К–8К) / прогибов. Расчёт занимает ~3–10 секунд.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {/* Column 1: Crane */}
        <fieldset style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <legend style={{ fontWeight: 600 }}>Кран</legend>
          <SelField
            label="Грузоподъёмность, т"
            value={String(inputs.capacity)}
            options={craneOptions.capacities.map((c) => [String(c), String(c)])}
            onChange={(v) => upd("capacity", isFinite(Number(v)) ? Number(v) : v)}
          />
          <SelField
            label="Пролёт крана, м"
            value={String(inputs.craneSpan)}
            options={craneOptions.craneSpans.map((c) => [String(c), `${c} м`])}
            onChange={(v) => upd("craneSpan", Number(v))}
          />
          <NumField label="Число колёс одной стороны" value={inputs.wheelCount} step={1} onChange={(v) => upd("wheelCount", v)} />
          <SelField
            label="Тип подвеса"
            value={String(inputs.suspensionType)}
            options={craneOptions.suspensionTypes.map((t) => [String(t), String(t)])}
            onChange={(v) => upd("suspensionType", v)}
          />
          <SelField
            label="Группа режима работы"
            value={String(inputs.workGroup)}
            options={craneOptions.workGroups.map((g) => [String(g), String(g)])}
            onChange={(v) => upd("workGroup", v)}
          />
          <SelField
            label="Число кранов в пролёте"
            value={String(inputs.craneCount)}
            options={craneOptions.craneCounts.map((c) => [String(c), String(c)])}
            onChange={(v) => upd("craneCount", v)}
          />
          <SelField
            label="Рельс"
            value={String(inputs.rail)}
            options={craneOptions.rails.map((r) => [String(r), String(r)])}
            onChange={(v) => upd("rail", v)}
          />
        </fieldset>

        {/* Column 2: Beam geometry */}
        <fieldset style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <legend style={{ fontWeight: 600 }}>Балка</legend>
          <NumField label="Пролёт балки, м" value={inputs.beamSpan} step={0.5} onChange={(v) => upd("beamSpan", v)} />
          <SelField
            label="Тормозная конструкция"
            value={String(inputs.brakeStructure)}
            options={craneOptions.brakeStructures.map((b) => [String(b), String(b)])}
            onChange={(v) => upd("brakeStructure", v)}
          />
          <NumField label="Шаг рёбер, м (0 = авто)" value={inputs.ribStep} step={0.1} onChange={(v) => upd("ribStep", v)} />
          <SelField
            label="Расчёт на усталость"
            value={String(inputs.fatigueCalculation)}
            options={craneOptions.fatigueOptions.map((f) => [String(f), String(f)])}
            onChange={(v) => upd("fatigueCalculation", v)}
          />
        </fieldset>

        {/* Column 3: Factors */}
        <fieldset style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <legend style={{ fontWeight: 600 }}>Коэффициенты</legend>
          <NumField label="γf (нагрузка)" value={inputs.gammaF} step={0.05} onChange={(v) => upd("gammaF", v)} />
          <NumField label="γd (динамика)" value={inputs.gammaDynamic} step={0.05} onChange={(v) => upd("gammaDynamic", v)} />
          <NumField label="γc (условия работы)" value={inputs.gammaC} step={0.05} onChange={(v) => upd("gammaC", v)} />
          <NumField label="kсв (учёт собств.массы)" value={inputs.selfWeightFactor} step={0.01} onChange={(v) => upd("selfWeightFactor", v)} />
          <button
            onClick={handleCalc}
            disabled={calculating}
            style={{
              marginTop: 12,
              padding: "10px 24px",
              fontSize: 14,
              fontWeight: 600,
              background: calculating ? "#94a3b8" : "#0369a1",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: calculating ? "wait" : "pointer",
              width: "100%",
            }}
          >
            {calculating ? "Расчёт..." : "Рассчитать"}
          </button>
        </fieldset>
      </div>

      <div style={{ marginTop: 12 }}>
        <PricesBlock />
      </div>

      {error && (
        <div style={{ color: "#dc2626", marginTop: 12, padding: 8, background: "#fef2f2", borderRadius: 6 }}>
          Ошибка: {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 20 }}>
          <fieldset style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
            <legend style={{ fontWeight: 600 }}>Подобранное сечение</legend>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              <Stat label="Профиль" value={result.profile ?? "—"} />
              <Stat label="K (Iпр+IIпр), %" value={fmtN(result.utilizationPercent, 2)} />
              <Stat label="Масса, кг" value={fmtN(result.weightKg, 1)} />
              <Stat label="Шаг рёбер, м" value={fmtN(result.ribStepSelectedM, 2)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
              <Stat label="Нагрузка от колеса, кН" value={fmtN(result.wheelLoadKn, 2)} />
              <Stat label="Масса тележки, т" value={fmtN(result.trolleyMassT, 2)} />
              <Stat label="База крана, мм" value={fmtN(result.craneBaseMm, 0)} />
              <Stat label="Колея крана, мм" value={fmtN(result.craneGaugeMm, 0)} />
              <Stat label="Ширина подошвы рельса, м" value={fmtN(result.railFootWidthM, 3)} />
              <Stat label="Высота рельса, м" value={fmtN(result.railHeightM, 3)} />
            </div>
          </fieldset>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <CheckTable title="Размеры профиля" rows={result.dimensions} />
            <CheckTable title="Прочность" rows={result.strength} />
            <CheckTable title="Геометрические характеристики" rows={result.geometry} />
            <CheckTable title="Общая устойчивость" rows={result.globalStability} />
            <CheckTable title="Усталость и проверки 7К–8К" rows={result.crane78} />
            <CheckTable title="Местная устойчивость стенки" rows={result.localStability} />
            <CheckTable title="Прогибы (II пр. сост.)" rows={result.deflections} />
          </div>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "4px 8px",
  borderBottom: "1px solid #e2e8f0",
  background: "#f8fafc",
  fontSize: 12,
  textAlign: "left",
};
const td: React.CSSProperties = {
  padding: "3px 8px",
  borderBottom: "1px solid #f1f5f9",
  fontSize: 12,
};

function CheckTable({ title, rows }: { title: string; rows: CraneCheckValue[] }) {
  return (
    <div>
      <h4 style={{ margin: "0 0 6px 0", fontSize: 14 }}>{title}</h4>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={th}>Параметр</th>
            <th style={{ ...th, textAlign: "right" }}>Значение</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={td}>{r.label}</td>
              <td style={{ ...td, textAlign: "right", fontFamily: "monospace" }}>
                {typeof r.value === "number" ? fmt(r.value, 4) : (r.value ?? "—")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NumField({
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

function SelField({
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
