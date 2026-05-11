export type CraneSuspensionType = 'гибкий' | 'жесткий';
export type CraneCount = 'один' | 'два';
export type CraneRail = 'Р50' | 'КР70';
export type CraneBrakeStructure = 'нет' | 'сплошной настил' | 'ферма';
export type FatigueOption = 'да' | 'нет';

export interface CraneCalculatorInputs {
  capacity: string | number;
  craneSpan: number;
  wheelCount: number;
  suspensionType: CraneSuspensionType | string;
  workGroup: string;
  craneCount: CraneCount | string;
  rail: CraneRail | string;
  beamSpan: number;
  brakeStructure: CraneBrakeStructure | string;
  ribStep: number;
  gammaF: number;
  gammaDynamic: number;
  gammaC: number;
  selfWeightFactor: number;
  fatigueCalculation: FatigueOption | string;
}

export interface CraneCheckValue {
  label: string;
  value: string | number | null;
}

export interface CraneCalculationResult {
  profile: string | null;
  utilizationPercent: number | null;
  weightKg: number | null;
  wheelLoadKn: number | null;
  trolleyMassT: number | null;
  craneBaseMm: number | null;
  craneGaugeMm: number | null;
  railFootWidthM: number | null;
  railHeightM: number | null;
  ribStepSelectedM: number | null;
  dimensions: CraneCheckValue[];
  geometry: CraneCheckValue[];
  strength: CraneCheckValue[];
  crane78: CraneCheckValue[];
  globalStability: CraneCheckValue[];
  localStability: CraneCheckValue[];
  deflections: CraneCheckValue[];
  warnings: string[];
}
