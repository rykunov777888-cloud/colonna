import { useMemo, useState, useEffect } from "react";
import { calculate, defaultInputs } from "./calc/beamCell/engine";
import { useBuilding, type Building } from "./building/context";
import { SyncedNumField } from "./building/SyncedField";
import type {
  CalculatorInputs,
  MemberSolution,
  Prices,
  Steel,
} from "./calc/beamCell/types";

const STEELS: readonly Steel[] = ["C245", "C345"];

function fmtKg(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return "—";
  return `${v.toFixed(1)} кг`;
}
function fmtRub(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return "—";
  return `${(v / 1000).toFixed(2)} тыс. ₽`;
}
function fmtN(v: number | undefined, digits = 2): string {
  if (v === undefined || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

function solutionText(s: MemberSolution): string {
  if (s.status === "OK") return s.profile ?? "—";
  if (s.status === "SKIPPED") return "—";
  return "нет решения";
}

export function BeamCellApp() {
  const { building, setBuilding } = useBuilding();
  // Lock to "балка покрытия" mode — only ГБ is calculated
  const [inputs, setInputs] = useState<CalculatorInputs>(() => ({
    ...defaultInputs,
    floorType: "балка покрытия",
    mainBeamSpan: building.span_m,
    mainBeamStep: building.framePitch_m,
  }));

  useEffect(() => {
    setInputs((cur) => ({
      ...cur,
      mainBeamSpan: building.span_m,
      mainBeamStep: building.framePitch_m,
    }));
  }, [building.span_m, building.framePitch_m]);

  const updSynced = <K extends keyof Building>(key: K, value: number) => {
    setBuilding({ [key]: value } as Partial<Building>);
  };

  const result = useMemo(() => calculate(inputs), [inputs]);
  const upd = <K extends keyof CalculatorInputs>(k: K, v: CalculatorInputs[K]) =>
    setInputs((cur) => ({ ...cur, [k]: v }));
  const updPrice = (k: keyof Prices, v: number) =>
    setInputs((cur) => ({ ...cur, prices: { ...cur.prices, [k]: v } }));

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Балка покрытия</h2>
      <p style={{ color: "#666", marginTop: 0, fontSize: 13 }}>
        Подбор главной балки (ГБ) покрытия — прокатный двутавр по сортаменту, с учётом снеговой
        нагрузки и собственного веса. Расчёт по СП 16.13330.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {/* Column 1: Geometry */}
        <fieldset style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <legend style={{ fontWeight: 600 }}>Геометрия</legend>
          <NumField label="Вдоль ГБ, м" value={inputs.lengthAlongMain} step={0.5} onChange={(v) => upd("lengthAlongMain", v)} />
          <NumField label="Поперёк ГБ, м" value={inputs.widthAcrossMain} step={0.5} onChange={(v) => upd("widthAcrossMain", v)} />
          <SyncedNumField label="Пролёт ГБ (= пролёт здания), м" value={inputs.mainBeamSpan} step={0.5} onChange={(v) => updSynced("span_m", v)} />
          <SyncedNumField label="Шаг ГБ (= шаг рам), м" value={inputs.mainBeamStep} step={0.5} onChange={(v) => updSynced("framePitch_m", v)} />
        </fieldset>

        {/* Column 2: Loads */}
        <fieldset style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <legend style={{ fontWeight: 600 }}>Нагрузка</legend>
          <NumField
            label="Снеговая + кровля, кг/м²"
            value={inputs.floorLoadKgM2}
            step={5}
            onChange={(v) => upd("floorLoadKgM2", v)}
          />
          <div style={{ fontSize: 12, color: "#666", marginTop: 8, lineHeight: 1.6 }}>
            <div>q расчётная = <b>{fmtN(result.qMain)} кН/м²</b></div>
            <div style={{ marginTop: 6, color: "#a16207" }}>
              ВБ (второстепенные балки) и колонны в этом режиме не считаются.
            </div>
          </div>
        </fieldset>

        {/* Column 3: Steel & price */}
        <fieldset style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <legend style={{ fontWeight: 600 }}>Сталь и цены</legend>
          <SelField
            label="Сталь ГБ (для итога ★)"
            value={inputs.acceptedMainSteel}
            options={STEELS.map((s) => [s, s])}
            onChange={(v) => upd("acceptedMainSteel", v as Steel)}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
            <NumField label="Двутавр С245, ₽/кг" value={inputs.prices.ibeamC245} step={0.5} onChange={(v) => updPrice("ibeamC245", v)} />
            <NumField label="Двутавр С345, ₽/кг" value={inputs.prices.ibeamC345} step={0.5} onChange={(v) => updPrice("ibeamC345", v)} />
          </div>
        </fieldset>
      </div>

      <hr style={{ margin: "20px 0" }} />

      <h3 style={{ marginTop: 0 }}>Подобранная балка покрытия (ГБ)</h3>

      <ResultTable
        rows={[result.main.C245, result.main.C345]}
        accepted={inputs.acceptedMainSteel}
      />

      {result.warnings.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: "#a16207" }}>
          {result.warnings.map((w, i) => (
            <div key={i}>⚠ {w}</div>
          ))}
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid #e2e8f0",
  textAlign: "left",
  whiteSpace: "nowrap",
  background: "#f8fafc",
  fontSize: 12,
};
const td: React.CSSProperties = {
  padding: "4px 8px",
  borderBottom: "1px solid #f1f5f9",
  fontSize: 13,
};

function ResultTable({
  rows,
  accepted,
}: {
  rows: MemberSolution[];
  accepted: Steel;
}) {
  return (
    <div>
      <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 800 }}>
        <thead>
          <tr>
            <th style={th}>Сталь</th>
            <th style={th}>Профиль</th>
            <th style={th}>Масса 1 балки</th>
            <th style={th}>Стоимость 1 балки</th>
            <th style={th}>K (использование)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isAccepted = r.material === accepted;
            return (
              <tr key={r.material} style={isAccepted ? { background: "#fffbeb" } : undefined}>
                <td style={td}>
                  <b>{r.material}</b>
                  {isAccepted ? " ★" : ""}
                </td>
                <td style={td}>{solutionText(r)}</td>
                <td style={td}>{fmtKg(r.weightKg)}</td>
                <td style={td}>{fmtRub(r.costRub)}</td>
                <td style={td}>{r.utilization === undefined ? "—" : r.utilization.toFixed(3)}</td>
              </tr>
            );
          })}
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
