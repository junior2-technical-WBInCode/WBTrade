/**
 * WB TRADE PARTNERS — rank labels (PLAN_03)
 */

export const RANK_LABELS: Record<string, string> = {
  AKTYWNY_PARTNER: 'Aktywny Partner',
  AMBASADOR: 'Ambasador',
  LIDER_ZESPOLU: 'Lider Zespołu',
  MENEDZER: 'Menedżer',
  DYREKTOR_REGIONALNY: 'Dyrektor Regionalny',
  DYREKTOR_KRAJOWY: 'Dyrektor Krajowy',
  DYREKTOR_GENERALNY: 'Dyrektor Generalny',
};

export const RANK_ORDER = [
  'AKTYWNY_PARTNER',
  'AMBASADOR',
  'LIDER_ZESPOLU',
  'MENEDZER',
  'DYREKTOR_REGIONALNY',
  'DYREKTOR_KRAJOWY',
  'DYREKTOR_GENERALNY',
] as const;
