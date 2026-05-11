import { HyperFormula } from 'hyperformula';
import { climateSettlements } from '../../data/climate/settlements.generated';
import { windowRiegelWorkbook } from './workbook.generated';
import type { ClimateSettlement, WindowRiegelInputs, WindowRiegelOption, WindowRiegelResult } from './types';

type SheetData = Record<string, (string | number | boolean | null)[][]>;

const SUMMARY_SHEET = 'Лист1';
const CALCULATION_SHEET = 'Расчет';
const LICENSE_KEY = 'gpl-v3';
const SP20_WIND_STANDARD = 'по СП 20.13330.20ХХ';

export const windowRiegelOptions = windowRiegelWorkbook.options;
export const defaultWindowRiegelInputs = {
  ...(windowRiegelWorkbook.defaultScenario.inputs as WindowRiegelInputs),
  windStandard: SP20_WIND_STANDARD,
};
export const windowRiegelClimateSettlements = climateSettlements;

const inputCells: Record<keyof WindowRiegelInputs, string> = windowRiegelWorkbook.inputCells;

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
  if (typeof value === 'object') return String((value as { value?: string }).value ?? '#ERROR');
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeSettlementName(value: string): string {
  return value.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

export function findClimateSettlement(city: string): ClimateSettlement | null {
  const normalized = normalizeSettlementName(city);
  const matches = climateSettlements.filter((item) => normalizeSettlementName(item.settlement) === normalized);
  return matches.find((item) => normalizeSettlementName(item.region).startsWith('г.'))
    ?? matches.find((item) => item.sourceList === 'base-205')
    ?? matches[0]
    ?? null;
}

function cellValue(hf: HyperFormula, sheet: number, cell: string): string | number | null {
  return normalizeCellValue(hf.getCellValue(address(cell, sheet)));
}

function buildEngine(inputs: WindowRiegelInputs): { hf: HyperFormula; summarySheet: number } {
  const hf = HyperFormula.buildFromSheets(windowRiegelWorkbook.sheets as unknown as SheetData, { licenseKey: LICENSE_KEY, useArrayArithmetic: true });
  const summarySheet = hf.getSheetId(SUMMARY_SHEET);
  if (summarySheet === undefined) throw new Error('Лист "Лист1" не найден в сгенерированной книге.');

  for (const [key, cell] of Object.entries(inputCells) as [keyof WindowRiegelInputs, string][]) {
    hf.setCellContents(address(cell, summarySheet), [[inputs[key] as string | number]]);
  }

  return { hf, summarySheet };
}

function readOptionRows(hf: HyperFormula, sheet: number, startRow: number): WindowRiegelOption[] {
  return Array.from({ length: 10 }, (_, index) => {
    const row = startRow + index;
    const profile = cellValue(hf, sheet, `B${row}`);
    const steel = cellValue(hf, sheet, `C${row}`);
    return {
      number: index + 1,
      profile: profile === null ? null : String(profile),
      steel: steel === null ? null : String(steel),
      weightKg: numberOrNull(cellValue(hf, sheet, `D${row}`)),
    };
  });
}

export function calculateWindowRiegel(inputs: WindowRiegelInputs): WindowRiegelResult {
  const climateSettlement = findClimateSettlement(inputs.city);
  const effectiveInputs = {
    ...inputs,
    windLoadKpa: typeof climateSettlement?.w0Kpa === 'number' ? climateSettlement.w0Kpa : inputs.windLoadKpa,
    windStandard: SP20_WIND_STANDARD,
  };
  const { hf, summarySheet } = buildEngine(effectiveInputs);
  const calculationSheet = hf.getSheetId(CALCULATION_SHEET);
  if (calculationSheet === undefined) throw new Error('Лист "Расчет" не найден в сгенерированной книге.');

  return {
    verticalLoadKpa: numberOrNull(cellValue(hf, calculationSheet, 'D8')),
    horizontalLoadKpa: numberOrNull(cellValue(hf, calculationSheet, 'D9')),
    outOfPlaneLengthM: numberOrNull(cellValue(hf, calculationSheet, 'D17')),
    inPlaneLengthM: numberOrNull(cellValue(hf, calculationSheet, 'D18')),
    effectiveWindLoadKpa: effectiveInputs.windLoadKpa,
    climateSettlement,
    lowerAndUpperProfiles: readOptionRows(hf, summarySheet, 24),
    upperType1Profiles: readOptionRows(hf, summarySheet, 37),
    warnings: climateSettlement ? [] : ['Город не найден в справочнике климата; ветровая нагрузка задается вручную.'],
  };
}

export { windowRiegelWorkbook };
