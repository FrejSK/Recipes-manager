export type UnitCode =
  | 'g' | 'kg' | 'ml' | 'dl' | 'l' | 'ks'
  | 'PL' | 'CL' | 'KL'
  | 'salka' | 'hrncek' | 'balenie' | 'platok' | 'strucik' | 'stipka' | 'hrst' | 'konzerva';

export type UnitForms = { one: string; few: string; many: string; fraction: string };
export type UnitKind = 'metric' | 'measure' | 'piece';
export type UnitInfo = { forms: UnitForms; kind: UnitKind; scalable: boolean };

const same = (s: string): UnitForms => ({ one: s, few: s, many: s, fraction: s });
const forms = (one: string, few: string, many: string, fraction: string): UnitForms => ({ one, few, many, fraction });

export const UNITS: Record<UnitCode, UnitInfo> = {
  g: { forms: same('g'), kind: 'metric', scalable: true },
  kg: { forms: same('kg'), kind: 'metric', scalable: true },
  ml: { forms: same('ml'), kind: 'metric', scalable: true },
  dl: { forms: same('dl'), kind: 'metric', scalable: true },
  l: { forms: same('l'), kind: 'metric', scalable: true },
  ks: { forms: same('ks'), kind: 'piece', scalable: true },
  PL: { forms: same('PL'), kind: 'measure', scalable: true },
  CL: { forms: same('ČL'), kind: 'measure', scalable: true },
  KL: { forms: same('KL'), kind: 'measure', scalable: true },
  salka: { forms: forms('šálka', 'šálky', 'šálok', 'šálky'), kind: 'measure', scalable: true },
  hrncek: { forms: forms('hrnček', 'hrnčeky', 'hrnčekov', 'hrnčeka'), kind: 'measure', scalable: true },
  balenie: { forms: forms('balenie', 'balenia', 'balení', 'balenia'), kind: 'piece', scalable: true },
  platok: { forms: forms('plátok', 'plátky', 'plátkov', 'plátku'), kind: 'piece', scalable: true },
  strucik: { forms: forms('strúčik', 'strúčiky', 'strúčikov', 'strúčika'), kind: 'piece', scalable: true },
  stipka: { forms: forms('štipka', 'štipky', 'štipiek', 'štipky'), kind: 'piece', scalable: false },
  hrst: { forms: forms('hrsť', 'hrste', 'hrstí', 'hrste'), kind: 'piece', scalable: true },
  konzerva: { forms: forms('konzerva', 'konzervy', 'konzerv', 'konzervy'), kind: 'piece', scalable: true },
};

export const UNIT_CODES = Object.keys(UNITS) as readonly UnitCode[];

export function unitLabel(code: UnitCode, value: number): string {
  const f = UNITS[code].forms;
  if (!Number.isInteger(value)) return f.fraction;
  if (value === 1) return f.one;
  if (value >= 2 && value <= 4) return f.few;
  return f.many;
}
