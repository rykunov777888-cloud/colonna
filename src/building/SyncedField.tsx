import type { ReactNode } from "react";

const SYNCED_BG = "#fef9c3";       // light yellow
const SYNCED_BORDER = "#eab308";   // amber-500
const SYNCED_BADGE = "🔗";

/**
 * Универсальная обёртка для синхронизированного поля.
 * Подсвечивает фон жёлтым, добавляет иконку 🔗 и tooltip.
 *
 * Используется внутри уже существующих Field/NumField компонентов — оборачивает
 * label + input как блок.
 */
export function SyncedField({
  label,
  children,
  hint = "Синхронизировано со всеми вкладками",
}: {
  label?: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div
      title={hint}
      style={{
        marginBottom: 6,
        padding: "4px 6px",
        background: SYNCED_BG,
        border: `1px dashed ${SYNCED_BORDER}`,
        borderRadius: 4,
      }}
    >
      {label && (
        <label style={{ fontSize: 13, display: "block" }}>
          <span style={{ color: "#92400e", marginRight: 4 }}>{SYNCED_BADGE}</span>
          {label}
        </label>
      )}
      {children}
    </div>
  );
}

export const SYNCED_FIELD_STYLE: React.CSSProperties = {
  background: SYNCED_BG,
  border: `1px dashed ${SYNCED_BORDER}`,
  borderRadius: 4,
  padding: "4px 6px",
  marginBottom: 6,
};

/** Inline numeric synced field (label + input together). */
export function SyncedNumField({
  label,
  value,
  onChange,
  step = 1,
  hint = "Синхронизировано со всеми вкладками",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  hint?: string;
}) {
  return (
    <div title={hint} style={SYNCED_FIELD_STYLE}>
      <label style={{ fontSize: 13, display: "block" }}>
        <span style={{ color: "#92400e", marginRight: 4 }}>{SYNCED_BADGE}</span>
        {label}
      </label>
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
