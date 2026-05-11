import { useBuilding } from "./context";
import { SyncedNumField } from "./SyncedField";

/**
 * Единый блок цен стали — отображается во всех вкладках калькулятора.
 *
 * Все 4 цены синхронизированы через BuildingContext. Используется
 * вкладкой как источник руб/кг для подсчёта экономики (или просто для
 * визуального удобства, если расчёт пока внутри Excel-снимка).
 */
export function PricesBlock() {
  const { building, setBuilding } = useBuilding();
  return (
    <fieldset style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}>
      <legend style={{ fontWeight: 600 }}>Цены стали, руб/кг</legend>
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
    </fieldset>
  );
}
