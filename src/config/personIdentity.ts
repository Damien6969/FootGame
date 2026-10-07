/** Réglages narratifs du jeu, pas des statistiques démographiques mesurées. */
export const PERSON_IDENTITY_CONFIG = {
  frenchOnlyShare: 0.86,
  dualNationalityShare: 0.12,
  frenchFirstNameShareForDual: 0.60,
  nationalFirstNameMix: 0.20,
  regionalSurnameShare: 0.25,
  commonFrenchSurnameShare: 0.80,
  familyCountryWeights: {
    FR: 70, DZ: 8, MA: 6, TN: 3, PT: 4, IT: 3, ES: 3, DE: 2,
    PL: 2, TR: 2, SN: 3, CM: 2, CI: 2, VN: 1,
  } as Readonly<Record<string, number>>,
  regionalCountryMultipliers: {
    '44': { DE: 5, PL: 1.5 },
    '76': { ES: 5 },
    '75': { ES: 2 },
    '93': { IT: 3, DZ: 1.5, TN: 1.5 },
    '94': { IT: 5 },
    '84': { IT: 2 },
    '11': { PT: 2, SN: 1.5, CM: 1.5, CI: 1.5 },
  } as Readonly<Record<string, Readonly<Record<string, number>>>>,
} as const
