/**
 * Типы данных климатических параметров населённых пунктов.
 *
 * Используются модулем калькулятора НВФ для подбора нормативных
 * значений снеговой/ветровой/гололёдной/сейсмической нагрузки
 * по выбранному населённому пункту.
 *
 * Источник базовых значений — СП 20.13330.2016 (приложение К,
 * карты районирования) и СП 14.13330 (сейсмика).
 */

/** Статус достоверности отдельного климатического параметра. */
export type ClimateParameterStatus =
  /** Значение проверено вручную и совпадает с актуальным СП. */
  | "verified"
  /** Значение взято из приложения К СП 20.13330.2016. */
  | "from_sp20_appendix_k"
  /** Значение требует ручной проверки/уточнения. */
  | "requires_verification"
  /** Значение задано пользователем (ручной ввод). */
  | "manual"
  /** Параметр неприменим для данного населённого пункта. */
  | "not_applicable";

/** Тип местности по СП 20.13330.2016, табл. 11.2. */
export type TerrainType = "A" | "B" | "C";

/** Сводный статус достоверности всей записи населённого пункта. */
export type SettlementDataStatus =
  /** Все параметры проверены. */
  | "verified"
  /** Заполнена только часть параметров. */
  | "partial"
  /** Запись требует полной проверки. */
  | "requires_verification";

/** Снеговая климатическая нагрузка. */
export interface SnowClimateData {
  /** Снеговой район (I…VIII). */
  region: string | null;
  /** Нормативное значение веса снегового покрова Sg, кПа. */
  sgKpa: number | null;
  /** Источник данных. */
  source: string;
  /** Статус достоверности. */
  status: ClimateParameterStatus;
}

/** Ветровая климатическая нагрузка. */
export interface WindClimateData {
  /** Ветровой район (Ia, I…VII). */
  region: string | null;
  /** Нормативное значение ветрового давления w0, кПа. */
  w0Kpa: number | null;
  /** Источник данных. */
  source: string;
  /** Статус достоверности. */
  status: ClimateParameterStatus;
}

/** Гололёдная нагрузка. */
export interface IceClimateData {
  /** Гололёдный район (I…V). */
  region: string | null;
  /** Толщина стенки гололёда, мм. */
  iceThicknessMm: number | null;
  /** Источник данных. */
  source: string;
  /** Статус достоверности. */
  status: ClimateParameterStatus;
}

/** Сейсмическая характеристика площадки. */
export interface SeismicClimateData {
  /** Расчётная сейсмичность, баллы (по шкале MSK-64). */
  points: number | null;
  /** Источник данных. */
  source: string;
  /** Статус достоверности. */
  status: ClimateParameterStatus;
}

/** Параметры типа местности по умолчанию для населённого пункта. */
export interface TerrainClimateData {
  /** Тип местности по умолчанию (если задан). */
  defaultType: TerrainType | null;
  /** Допустимые типы местности для выбора пользователем. */
  allowedTypes: TerrainType[];
}

/**
 * Нормативная глубина сезонного промерзания грунтов dfn, м, по СП 22.13330
 * для четырёх категорий грунта. Расчётная глубина df зависит от типа здания
 * и режима эксплуатации, поэтому здесь не хранится.
 */
export interface FrostDepthData {
  /** Суглинки и глина, dfn, м. */
  loamy: number | null;
  /** Супесь, пески мелкие и пылеватые, dfn, м. */
  sandyFine: number | null;
  /** Пески гравелистые, крупные и средней крупности, dfn, м. */
  sandyCoarse: number | null;
  /** Крупнообломочные грунты, dfn, м. */
  coarseFragmental: number | null;
  /** Источник данных. */
  source: string;
  /** Статус достоверности. */
  status: ClimateParameterStatus;
}

/**
 * Климатические параметры холодного периода года по СП 131.13330
 * (адаптация СНиП 23-01-99, таблица 1).
 *
 * Все температурные значения — в °C.
 */
export interface ColdClimateData {
  /** Температура наиболее холодных суток с обеспеченностью 0,98, °C. */
  tempColdestDay098: number | null;
  /** Температура наиболее холодных суток с обеспеченностью 0,92, °C. */
  tempColdestDay092: number | null;
  /** Температура наиболее холодной пятидневки с обеспеченностью 0,98, °C. */
  tempColdest5days098: number | null;
  /** Температура наиболее холодной пятидневки с обеспеченностью 0,92, °C. */
  tempColdest5days092: number | null;
  /** Температура воздуха с обеспеченностью 0,94, °C. */
  temp094: number | null;
  /** Абсолютная минимальная температура воздуха, °C. */
  absMin: number | null;
  /** Средняя суточная амплитуда температуры воздуха наиболее холодного месяца, °C. */
  dailyAmplitude: number | null;
  /** Продолжительность периода со средней суточной T ≤ 0 °C, сут. */
  durationLe0: number | null;
  /** Средняя температура воздуха периода ≤ 0 °C, °C. */
  meanLe0: number | null;
  /** Продолжительность периода со средней суточной T ≤ 8 °C, сут. */
  durationLe8: number | null;
  /** Средняя температура воздуха периода ≤ 8 °C, °C. */
  meanLe8: number | null;
  /** Продолжительность периода со средней суточной T ≤ 10 °C, сут. */
  durationLe10: number | null;
  /** Средняя температура воздуха периода ≤ 10 °C, °C. */
  meanLe10: number | null;
  /** Средняя месячная относительная влажность воздуха наиболее холодного месяца, %. */
  humidityCold: number | null;
  /** Средняя месячная относительная влажность воздуха в 15 ч наиболее холодного месяца, %. */
  humidityCold15: number | null;
  /** Количество осадков за ноябрь–март, мм. */
  precipNovMar: number | null;
  /** Преобладающее направление ветра за декабрь–февраль (С/Ю/З/В/СЗ/...). */
  prevailingWindDecFeb: string | null;
  /** Максимальная из средних скоростей ветра по румбам за январь, м/с. */
  maxWindJan: number | null;
  /** Средняя скорость ветра за период со средней суточной T ≤ 8 °C, м/с. */
  meanWindLe8: number | null;
  /** Источник данных. */
  source: string;
  /** Статус достоверности. */
  status: ClimateParameterStatus;
}

/**
 * Климатические параметры тёплого периода года по СП 131.13330
 * (адаптация СНиП 23-01-99, таблица 2).
 */
export interface WarmClimateData {
  /** Барометрическое давление, гПа. */
  barometric: number | null;
  /** Температура воздуха с обеспеченностью 0,95, °C. */
  temp095: number | null;
  /** Температура воздуха с обеспеченностью 0,99, °C. */
  temp099: number | null;
  /** Средняя максимальная температура воздуха наиболее тёплого месяца, °C. */
  meanMaxTempWarmMonth: number | null;
  /** Абсолютная максимальная температура воздуха, °C. */
  absMax: number | null;
  /** Средняя суточная амплитуда температуры воздуха наиболее тёплого месяца, °C. */
  dailyAmplitude: number | null;
  /** Средняя месячная относительная влажность воздуха наиболее тёплого месяца, %. */
  humidityWarm: number | null;
  /** Средняя месячная относительная влажность воздуха в 15 ч наиболее тёплого месяца, %. */
  humidityWarm15: number | null;
  /** Количество осадков за апрель–октябрь, мм. */
  precipAprOct: number | null;
  /** Суточный максимум осадков, мм. */
  dailyMaxPrecip: number | null;
  /** Преобладающее направление ветра за июнь–август. */
  prevailingWindJunAug: string | null;
  /** Минимальная из средних скоростей ветра по румбам за июль, м/с. */
  minWindJul: number | null;
  /** Источник данных. */
  source: string;
  /** Статус достоверности. */
  status: ClimateParameterStatus;
}

/**
 * Среднемесячные температуры воздуха, °C: 12 значений (январь–декабрь)
 * + годовая средняя.
 */
export interface MonthlyTempsData {
  /** Массив из 12 значений (январь…декабрь), °C. Может быть null если данных нет. */
  byMonth: (number | null)[] | null;
  /** Среднегодовая температура воздуха, °C. */
  yearly: number | null;
  /** Источник данных. */
  source: string;
  /** Статус достоверности. */
  status: ClimateParameterStatus;
}

/** Полная запись климатических параметров населённого пункта. */
export interface SettlementClimateData {
  /** Идентификатор-slug на латинице, например "chelyabinsk". */
  id: string;
  /** Страна (по умолчанию "Россия"). */
  country: string;
  /** Регион/субъект РФ. */
  region: string;
  /** Название населённого пункта на русском. */
  settlement: string;
  /** Тип населённого пункта: город / посёлок / населённый пункт. */
  settlementType: string | null;

  /** Снеговая нагрузка. */
  snow: SnowClimateData;
  /** Ветровая нагрузка. */
  wind: WindClimateData;
  /** Гололёдная нагрузка. */
  ice: IceClimateData;
  /** Сейсмика. */
  seismic: SeismicClimateData;
  /** Тип местности. */
  terrain: TerrainClimateData;

  /** Глубина сезонного промерзания грунтов (опционально). */
  frostDepth?: FrostDepthData;
  /** Климатические параметры холодного периода года (СП 131.13330) (опционально). */
  coldPeriod?: ColdClimateData;
  /** Климатические параметры тёплого периода года (СП 131.13330) (опционально). */
  warmPeriod?: WarmClimateData;
  /** Среднемесячные и среднегодовая температуры воздуха (опционально). */
  monthlyTemps?: MonthlyTempsData;

  /** Разрешён ли ручной ввод климатических параметров пользователем. */
  manualAllowed: boolean;
  /** Разрешено ли экспертное переопределение значений. */
  expertOverrideAllowed: boolean;

  /** Сводный статус достоверности записи. */
  dataStatus: SettlementDataStatus;
  /** Произвольный комментарий. */
  comment: string;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*                          Справочники соответствий                          */
/* ────────────────────────────────────────────────────────────────────────── */

/** Соответствие снегового района и нормативного значения Sg, кПа. */
export const SNOW_REGION_TO_SG_KPA: Readonly<Record<string, number>> = {
  I: 0.5,
  II: 1.0,
  III: 1.5,
  IV: 2.0,
  V: 2.5,
  VI: 3.0,
  VII: 3.5,
  VIII: 4.0,
};

/** Соответствие ветрового района и нормативного значения w0, кПа. */
export const WIND_REGION_TO_W0_KPA: Readonly<Record<string, number>> = {
  Ia: 0.17,
  I: 0.23,
  II: 0.3,
  III: 0.38,
  IV: 0.48,
  V: 0.6,
  VI: 0.73,
  VII: 0.85,
};

/** Описания типов местности. */
export const TERRAIN_TYPE_DESCRIPTIONS: Readonly<Record<TerrainType, string>> = {
  A: "открытая местность (степи, лесостепи, пустыни, прибрежные зоны)",
  B: "городская / лесная местность с равномерным расположением препятствий",
  C: "плотная городская застройка со зданиями высотой более 25 м",
};

/* ────────────────────────────────────────────────────────────────────────── */
/*                              Утилиты доступа                               */
/* ────────────────────────────────────────────────────────────────────────── */

import settlementsRaw from "../data/regions/settlements-climate.json";

const settlements = settlementsRaw as readonly SettlementClimateData[];

/**
 * Получить запись климатических параметров по идентификатору населённого пункта.
 *
 * @param id Идентификатор-slug, например "chelyabinsk".
 * @returns Запись или undefined, если не найдена.
 */
export function getSettlementClimateById(
  id: string,
): SettlementClimateData | undefined {
  if (!id) return undefined;
  const target = id.trim().toLowerCase();
  return settlements.find((item) => item.id === target);
}

/**
 * Поиск населённых пунктов по подстроке (без учёта регистра).
 *
 * Поиск выполняется по полям settlement, region и id.
 * Пустой запрос возвращает пустой массив.
 *
 * @param query Поисковая строка.
 * @returns Список подходящих записей (макс. 50).
 */
export function searchSettlements(query: string): SettlementClimateData[] {
  if (!query) return [];
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return settlements
    .filter(
      (item) =>
        item.settlement.toLowerCase().includes(q) ||
        item.region.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q),
    )
    .slice(0, 50);
}

/**
 * Полный список загруженных населённых пунктов (для отладки/тестов).
 */
export function getAllSettlements(): readonly SettlementClimateData[] {
  return settlements;
}
