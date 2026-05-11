import { useMemo, useState } from "react";
import {
  calculateWindowRiegel,
  defaultWindowRiegelInputs,
  findClimateSettlement,
  windowRiegelClimateSettlements,
  windowRiegelOptions,
} from "./calc/windowRiegel/engine";
import type {
  WindowRiegelInputs,
  WindowRiegelOption,
} from "./calc/windowRiegel/types";

function fmt(n: number | null | undefined, digits = 3): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}
function fmtKg(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(2)} кг`;
}

const WINDOW_TYPE_LABELS: Record<number, string> = {
  1: "Тип 1 (без стоек)",
  2: "Тип 2 (2 стойки)",
  3: "Тип 3 (2 стойки)",
  4: "Тип 4 (1 стойка)",
  5: "Тип 5 (2 стойки)",
};

export function WindowRiegelApp() {
  const [inputs, setInputs] = useState<WindowRiegelInputs>(defaultWindowRiegelInputs);
  const result = useMemo(() => {
    try {
      return calculateWindowRiegel(inputs);
    } catch (e) {
      return null;
    }
  }, [inputs]);

  const upd = <K extends keyof WindowRiegelInputs>(k: K, v: WindowRiegelInputs[K]) =>
    setInputs((cur) => ({ ...cur, [k]: v }));

  const setCity = (city: string) => {
    const climate = findClimateSettlement(city);
    setInputs((cur) => ({
      ...cur,
      city,
      windLoadKpa: typeof climate?.w0Kpa === "number" ? climate.w0Kpa : cur.windLoadKpa,
    }));
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Оконные ригели</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {/* Column 1: Geometry */}
        <fieldset style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <legend style={{ fontWeight: 600 }}>Геометрия здания и окна</legend>
          <div style={{ marginBottom: 6 }}>
            <label style={{ fontSize: 13, display: "block" }}>Город (автозаполнение w₀)</label>
            <input
              list="window-riegel-cities"
              value={inputs.city}
              onChange={(e) => setCity(e.target.value)}
              style={{ width: "100%", padding: 4, boxSizing: "border-box" }}
            />
            <datalist id="window-riegel-cities">
              {windowRiegelClimateSettlements.slice(0, 500).map((s) => (
                <option key={s.id} value={s.settlement}>
                  {s.region}
                </option>
              ))}
            </datalist>
          </div>
          <NumField label="Высота окна, м" value={inputs.windowHeightM} step={0.1} onChange={(v) => upd("windowHeightM", v)} />
          <NumField label="Шаг рам, м" value={inputs.frameStepM} step={0.5} onChange={(v) => upd("frameStepM", v)} />
          <SelField
            label="Тип окна"
            value={String(inputs.windowType)}
            options={windowRiegelOptions.windowTypes.map((t) => [String(t), WINDOW_TYPE_LABELS[t] ?? `Тип ${t}`])}
            onChange={(v) => upd("windowType", Number(v))}
          />
          <NumField label="Высота здания, м" value={inputs.buildingHeightM} step={0.5} onChange={(v) => upd("buildingHeightM", v)} />
          <NumField label="Пролёт здания, м" value={inputs.buildingSpanM} step={1} onChange={(v) => upd("buildingSpanM", v)} />
          <NumField label="Длина здания, м" value={inputs.buildingLengthM} step={1} onChange={(v) => upd("buildingLengthM", v)} />
        </fieldset>

        {/* Column 2: Wind & loads */}
        <fieldset style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <legend style={{ fontWeight: 600 }}>Ветер и нагрузки</legend>
          <SelField
            label="Тип местности"
            value={String(inputs.terrainType)}
            options={windowRiegelOptions.terrainTypes.map((t) => [String(t), String(t)])}
            onChange={(v) => upd("terrainType", v)}
          />
          <NumField label="Ветровая нагрузка w₀, кПа" value={inputs.windLoadKpa} step={0.01} onChange={(v) => upd("windLoadKpa", v)} />
          <SelField
            label="Уровень ответственности"
            value={String(inputs.responsibilityLevel)}
            options={windowRiegelOptions.responsibilityLevels.map((r) => [String(r), String(r)])}
            onChange={(v) => upd("responsibilityLevel", Number(v))}
          />
          <SelField
            label="Конструкция окна"
            value={String(inputs.windowConstruction)}
            options={windowRiegelOptions.windowConstructions.map((w) => [String(w), String(w)])}
            onChange={(v) => upd("windowConstruction", v)}
          />
          <NumField label="Макс. K-т использования" value={inputs.maxUtilization} step={0.01} onChange={(v) => upd("maxUtilization", v)} />
        </fieldset>

        {/* Column 3: Calculated loads */}
        <fieldset style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
          <legend style={{ fontWeight: 600 }}>Расчётные нагрузки и длины</legend>
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
            <div>Вертикальная нагрузка: <b>{fmt(result?.verticalLoadKpa)} кПа</b></div>
            <div>Горизонтальная нагрузка: <b>{fmt(result?.horizontalLoadKpa)} кПа</b></div>
            <div>Эфф. ветер w₀: <b>{fmt(result?.effectiveWindLoadKpa, 2)} кПа</b></div>
            <div>Длина из плоскости: <b>{fmt(result?.outOfPlaneLengthM, 2)} м</b></div>
            <div>Длина в плоскости: <b>{fmt(result?.inPlaneLengthM, 2)} м</b></div>
            {result?.climateSettlement && (
              <div style={{ marginTop: 6, color: "#080" }}>
                Климат: {result.climateSettlement.settlement} — w₀ {fmt(result.climateSettlement.w0Kpa, 2)} кПа
              </div>
            )}
            {result?.warnings.map((w, i) => (
              <div key={i} style={{ color: "#a16207", marginTop: 4 }}>⚠ {w}</div>
            ))}
          </div>
        </fieldset>
      </div>

      <hr style={{ margin: "20px 0" }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <RiegelTable
          title="Нижний ригель (для типов 1–5) и верхний (для типов 2–5)"
          rows={result?.lowerAndUpperProfiles ?? []}
        />
        <RiegelTable
          title="Верхний ригель для типа 1 (более жёсткий)"
          rows={result?.upperType1Profiles ?? []}
        />
      </div>
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

function RiegelTable({ title, rows }: { title: string; rows: WindowRiegelOption[] }) {
  return (
    <div>
      <h4 style={{ margin: "0 0 6px 0", fontSize: 14 }}>{title}</h4>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={th}>№</th>
            <th style={th}>Профиль</th>
            <th style={th}>Сталь</th>
            <th style={th}>Масса 1 ригеля</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td style={td} colSpan={4}>Нет данных</td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i} style={i === 0 ? { background: "#fffbeb" } : undefined}>
                <td style={td}>{r.number}{i === 0 ? " ★" : ""}</td>
                <td style={td}>{r.profile ?? "—"}</td>
                <td style={td}>{r.steel ?? "—"}</td>
                <td style={td}>{fmtKg(r.weightKg)}</td>
              </tr>
            ))
          )}
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
