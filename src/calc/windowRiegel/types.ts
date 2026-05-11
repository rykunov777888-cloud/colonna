export interface WindowRiegelInputs {
  city: string;
  responsibilityLevel: string | number;
  windowHeightM: number;
  frameStepM: number;
  windowType: number;
  buildingHeightM: number;
  buildingSpanM: number;
  buildingLengthM: number;
  terrainType: string;
  windLoadKpa: number;
  windStandard: string;
  windowConstruction: string;
  maxUtilization: number;
}

export interface WindowRiegelOption {
  number: number;
  profile: string | null;
  steel: string | null;
  weightKg: number | null;
}

export interface ClimateSettlement {
  id: string;
  country: string;
  region: string;
  settlement: string;
  settlementType?: string | null;
  snowRegion: string | null;
  sgKpa: number | null;
  snowStatus: string | null;
  windRegion: string | null;
  w0Kpa: number | null;
  windStatus: string | null;
  inSP131?: boolean;
  sourceList?: string;
}

export interface WindowRiegelResult {
  verticalLoadKpa: number | null;
  horizontalLoadKpa: number | null;
  outOfPlaneLengthM: number | null;
  inPlaneLengthM: number | null;
  effectiveWindLoadKpa: number;
  climateSettlement: ClimateSettlement | null;
  lowerAndUpperProfiles: WindowRiegelOption[];
  upperType1Profiles: WindowRiegelOption[];
  warnings: string[];
}
