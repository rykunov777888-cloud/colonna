import { HyperFormula } from 'hyperformula';
import { craneWorkbook } from './workbook.generated';
import type { CraneCalculationResult, CraneCalculatorInputs, CraneCheckValue } from './types';

type SheetData = Record<string, (string | number | boolean | null)[][]>;

const SUMMARY_SHEET = 'Сводка';
const LICENSE_KEY = 'gpl-v3';

export const craneOptions = craneWorkbook.options;

export const defaultCraneInputs = craneWorkbook.defaultScenario.inputs as CraneCalculatorInputs;

const inputCells: Record<keyof CraneCalculatorInputs, string> = craneWorkbook.inputCells;

const outputLabels = {
  dimensions: [
    'h - высота профиля, мм',
    'b - ширина полки, мм',
    's - толщина стенки, мм',
    't - толщина полки, мм',
    'hw - высота стенки, мм',
    'bw - свес полки, мм',
    'r - радиус сопряжения, мм',
  ],
  geometry: [
    'A - площадь сечения, см2',
    'Масса - погонная масса профиля, кг/м',
    'Ix - момент инерции относительно оси x, см4',
    'Wx - момент сопротивления относительно оси x, см3',
    'Sx - статический момент относительно оси x, см3',
    'ix - радиус инерции относительно оси x, см',
    'Iy - момент инерции относительно оси y, см4',
    'Wy - момент сопротивления относительно оси y, см3',
    'Sy - статический момент относительно оси y, см3',
    'iy - радиус инерции относительно оси y, см',
    'It - момент инерции при кручении, см4',
    'Iw - секториальный момент инерции, см6',
    'w - секториальная характеристика, см2',
    'If - момент инерции полки, см4',
    'I1f - расчетная характеристика полки, см4',
  ],
  strength: [
    'σ от Mx+My - нормальные напряжения от двух моментов, МПа',
    'σ от M+N - нормальные напряжения от момента и N+, МПа',
    'Проверка (41) - прочность по моменту',
    'Проверка (42) - прочность по поперечной силе на опоре',
    'lef (49) - расчетная длина приложения нагрузки, см',
    'σloc,y (47) - местное напряжение, МПа',
    'τxy (44 прим.) - касательное напряжение, МПа',
    'Проверка (44) - совместное действие момента и поперечной силы',
  ],
  crane78: [
    'σloc,x (67) - местное напряжение по x, МПа',
    'τloc,xy (67) - местное касательное напряжение, МПа',
    'a - шаг/длина участка проверки стенки, м',
    'σfy (67) - напряжение в поясе, МПа',
    'σx1 - напряжение в стенке 1, МПа',
    'σx2 - напряжение в стенке 2, МПа',
    'Проверка стенок (63)',
    'τxy (67) - касательное напряжение стенки, МПа',
    'τf,xy (67) - касательное напряжение пояса, МПа',
    'Проверка стенок (64)',
    'Проверка стенок (65)',
    'Проверка стенок (66)',
    'Проверка усталости стенки (173)',
  ],
  globalStability: [
    'α (Ж4) - коэффициент общей устойчивости',
    'ψ (табл. Ж.1) - коэффициент формы',
    'φ1 - промежуточный коэффициент устойчивости',
    'φb (Ж.1 и Ж.2) - коэффициент устойчивости балки',
    'Проверка (70) - общая устойчивость при изгибе',
  ],
  localStability: [
    'σx1 - напряжение в стенке 1, МПа',
    'σx2 - напряжение в стенке 2, МПа',
    'σloc,y (47) - местное напряжение, МПа',
    'τxy (67) - касательное напряжение, МПа',
    'λw прив - приведенная гибкость стенки',
    'δ - коэффициент для местной устойчивости',
    'c cr - расчетный размер отсека стенки',
    'c1 - коэффициент/размер c1',
    'c2 - коэффициент/размер c2',
    'μ - коэффициент закрепления отсека',
    'λd прив - приведенная гибкость отсека',
    'σcr (81) - критическое нормальное напряжение, МПа',
    'σloc,cr (82) - критическое местное напряжение, МПа',
    'τcr (83) - критическое касательное напряжение, МПа',
    'Проверка (80) - местная устойчивость стенки',
  ],
  deflections: [
    'fв - вертикальный прогиб, м',
    'fг - горизонтальный прогиб, м',
    'fв,lim - предельный вертикальный прогиб, м',
    'fг,lim - предельный горизонтальный прогиб, м',
    'Проверка по II группе предельных состояний',
  ],
};

function colToIndex(col: string): number {
  return col.split('').reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function address(cell: string, sheet: number) {
  const match = /^([A-Z]+)(\d+)$/.exec(cell);
  if (!match) throw new Error(`Unsupported cell address: ${cell}`);
  return { sheet, col: colToIndex(match[1]), row: Number(match[2]) - 1 };
}

function normalizeCellValue(value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object' && 'value' in value) return String((value as { value: string }).value);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function cellValue(hf: HyperFormula, sheet: number, cell: string): string | number | null {
  return normalizeCellValue(hf.getCellValue(address(cell, sheet)));
}

function rangeValues(hf: HyperFormula, sheet: number, cells: string[], labels: string[]): CraneCheckValue[] {
  return cells.map((cell, index) => ({ label: labels[index] ?? cell, value: cellValue(hf, sheet, cell) }));
}

function buildEngine(inputs: CraneCalculatorInputs): { hf: HyperFormula; summarySheet: number } {
  const hf = HyperFormula.buildFromSheets(craneWorkbook.sheets as unknown as SheetData, { licenseKey: LICENSE_KEY, useArrayArithmetic: true });
  const summarySheet = hf.getSheetId(SUMMARY_SHEET);
  if (summarySheet === undefined) throw new Error('Лист "Сводка" не найден в сгенерированной книге.');

  for (const [key, cell] of Object.entries(inputCells) as [keyof CraneCalculatorInputs, string][]) {
    hf.setCellContents(address(cell, summarySheet), [[inputs[key] as string | number]]);
  }

  return { hf, summarySheet };
}

export function calculateCraneBeam(inputs: CraneCalculatorInputs): CraneCalculationResult {
  const { hf, summarySheet } = buildEngine(inputs);

  const profile = cellValue(hf, summarySheet, 'B85');
  const utilizationPercent = numberOrNull(cellValue(hf, summarySheet, 'C85'));
  const weightKg = numberOrNull(cellValue(hf, summarySheet, 'B86'));

  return {
    profile: profile === null ? null : String(profile),
    utilizationPercent,
    weightKg,
    wheelLoadKn: numberOrNull(cellValue(hf, summarySheet, 'B3')),
    trolleyMassT: numberOrNull(cellValue(hf, summarySheet, 'B5')),
    craneBaseMm: numberOrNull(cellValue(hf, summarySheet, 'B6')),
    craneGaugeMm: numberOrNull(cellValue(hf, summarySheet, 'B7')),
    railFootWidthM: numberOrNull(cellValue(hf, summarySheet, 'B14')),
    railHeightM: numberOrNull(cellValue(hf, summarySheet, 'B15')),
    ribStepSelectedM: numberOrNull(cellValue(hf, summarySheet, 'D19')),
    dimensions: rangeValues(hf, summarySheet, ['A92', 'B92', 'C92', 'D92', 'E92', 'F92', 'G92'], outputLabels.dimensions),
    geometry: rangeValues(hf, summarySheet, ['A96', 'B96', 'C96', 'D96', 'E96', 'F96', 'G96', 'H96', 'I96', 'J96', 'K96', 'L96', 'M96', 'N96', 'O96'], outputLabels.geometry),
    strength: rangeValues(hf, summarySheet, ['A102', 'B102', 'C102', 'D102', 'A105', 'B105', 'C105', 'D105'], outputLabels.strength),
    crane78: rangeValues(hf, summarySheet, ['A111', 'B111', 'C111', 'D111', 'E111', 'F111', 'G111', 'A115', 'B115', 'C115', 'D115', 'E115', 'H121'], outputLabels.crane78),
    globalStability: rangeValues(hf, summarySheet, ['A125', 'B125', 'C125', 'D125', 'E125'], outputLabels.globalStability),
    localStability: rangeValues(hf, summarySheet, ['A128', 'B128', 'C128', 'D128', 'E128', 'F128', 'G128', 'H128', 'I128', 'J128', 'K128', 'L128', 'M128', 'N128', 'O128'], outputLabels.localStability),
    deflections: rangeValues(hf, summarySheet, ['A131', 'B131', 'C131', 'D131', 'E131'], outputLabels.deflections),
    warnings: [],
  };
}

export { craneWorkbook };
