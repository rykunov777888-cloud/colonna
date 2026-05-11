import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

/**
 * Сворачиваемый блок с заголовком. Состояние «раскрыт/свёрнут»
 * сохраняется в localStorage по ключу `storageKey`, чтобы пережить
 * перезагрузку и переключение вкладок.
 */
export function Collapsible({
  title,
  storageKey,
  defaultOpen = true,
  children,
  headerStyle,
  containerStyle,
  rightHeader,
}: {
  title: ReactNode;
  storageKey: string;
  defaultOpen?: boolean;
  children: ReactNode;
  headerStyle?: CSSProperties;
  containerStyle?: CSSProperties;
  rightHeader?: ReactNode;
}) {
  const fullKey = `colonna:collapsible:${storageKey}`;
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultOpen;
    const v = window.localStorage.getItem(fullKey);
    if (v == null) return defaultOpen;
    return v === "1";
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(fullKey, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [open, fullKey]);

  return (
    <div
      style={{
        border: "1px solid #ccc",
        borderRadius: 6,
        ...containerStyle,
      }}
    >
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          background: "#f8fafc",
          borderBottom: open ? "1px solid #e2e8f0" : "none",
          borderTopLeftRadius: 6,
          borderTopRightRadius: 6,
          borderBottomLeftRadius: open ? 0 : 6,
          borderBottomRightRadius: open ? 0 : 6,
          cursor: "pointer",
          fontWeight: 600,
          fontSize: 13,
          color: "#0f172a",
          userSelect: "none",
          ...headerStyle,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            aria-hidden
            style={{
              display: "inline-block",
              transform: open ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.15s",
              fontSize: 10,
              color: "#475569",
            }}
          >
            ▶
          </span>
          {title}
        </span>
        {rightHeader && (
          <span
            onClick={(e) => e.stopPropagation()}
            style={{ fontWeight: 400, fontSize: 12, color: "#64748b" }}
          >
            {rightHeader}
          </span>
        )}
      </div>
      {open && <div style={{ padding: 12 }}>{children}</div>}
    </div>
  );
}
