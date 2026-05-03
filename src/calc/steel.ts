import type { SteelGrade, ProfileData } from "./types";

function maxThickness(p: ProfileData): number {
  const s = p.s_mm ?? 0;
  const t = p.t_mm ?? 0;
  return Math.max(s, t);
}

export function getRy(steel: SteelGrade, profile: ProfileData): number {
  const t = maxThickness(profile);

  if (steel === "С245") return 240;
  if (steel === "С345") return 340;

  if (steel === "С255Б") {
    let base: number;
    if (t <= 10) base = 255;
    else if (t <= 20) base = 245;
    else if (t <= 40) base = 235;
    else if (t <= 60) base = 235;
    else if (t <= 80) base = 225;
    else base = 215;
    return base / 1.025;
  }

  if (steel === "С355Б") {
    let base: number;
    if (t <= 20) base = 355;
    else if (t <= 40) base = 345;
    else if (t <= 60) base = 340;
    else if (t <= 80) base = 325;
    else if (t <= 100) base = 315;
    else base = 295;
    return base / 1.025;
  }

  throw new Error(`Unknown steel: ${steel}`);
}

export function steelsForCategory(
  cat: ProfileData["category"],
): SteelGrade[] {
  if (cat === "square_tube" || cat === "rect_tube") return ["С245", "С345"];
  return ["С255Б", "С355Б"];
}

export function pricePerKg(
  steel: SteelGrade,
  prices: Record<SteelGrade, number>,
): number {
  return prices[steel];
}
