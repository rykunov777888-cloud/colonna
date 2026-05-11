import { useBuilding } from "./context";
import { SyncedNumField } from "./SyncedField";
import { Collapsible } from "./Collapsible";

/**
 * Единый блок цен стали — отображается во всех вкладках калькулятора.
 *
 * Все цены синхронизированы через BuildingContext. Используется
 * вкладкой как источник руб/кг для подсчёта экономики (или просто для
 * визуального удобства, если расчёт пока внутри Excel-снимка).
 * Сворачиваемый, состояние сохраняется в localStorage.
 */
export function PricesBlock() {
  const { building, setBuilding } = useBuilding();
  return (
    <Collapsible
      title="💰 Цены стали, руб/кг"
      storageKey="prices"
      defaultOpen={false}
      rightHeader={
        <span>
          С255Б <b>{building.priceC255B_rubKg}</b> · С355Б <b>{building.priceC355B_rubKg}</b> · С245 <b>{building.priceC245_rubKg}</b> · С345 <b>{building.priceC345_rubKg}</b> · МП350 <b>{building.priceMP350_rubKg}</b> · МП390 <b>{building.priceMP390_rubKg}</b>
        </span>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <SyncedNumField
          label="С255Б"
          value={building.priceC255B_rubKg}
          onChange={(v) => setBuilding({ priceC255B_rubKg: v })}
          step={0.1}
        />
        <SyncedNumField
          label="С355Б"
          value={building.priceC355B_rubKg}
          onChange={(v) => setBuilding({ priceC355B_rubKg: v })}
          step={0.1}
        />
        <SyncedNumField
          label="С245 (двутавр)"
          value={building.priceC245_rubKg}
          onChange={(v) => setBuilding({ priceC245_rubKg: v })}
          step={0.1}
        />
        <SyncedNumField
          label="С345 (двутавр)"
          value={building.priceC345_rubKg}
          onChange={(v) => setBuilding({ priceC345_rubKg: v })}
          step={0.1}
        />
        <SyncedNumField
          label="ЛСТК МП350"
          value={building.priceMP350_rubKg}
          onChange={(v) => setBuilding({ priceMP350_rubKg: v })}
          step={0.1}
        />
        <SyncedNumField
          label="ЛСТК МП390"
          value={building.priceMP390_rubKg}
          onChange={(v) => setBuilding({ priceMP390_rubKg: v })}
          step={0.1}
        />
      </div>
    </Collapsible>
  );
}
