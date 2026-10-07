/** Réglages du mercato : notes sportives sur 30 et probabilités par intersaison. */
export const TRANSFER_BALANCE = {
  standoutGap: 4,
  aspirationGap: 3,
  longLoanSeasons: 3,
  veteranAge: 30,
  departureChance: { AMBITION: .20, BLOCKED: .35, LONG_LOAN: .45, VETERAN: .60, DEVELOPMENT: .10, DYNAMICS: .40 },
  geography: { localRating: 10, regionalRating: 18, conferenceRating: 24, localRadiusKm: 50 },
  candidateShortlist: 3,
  championPoachUpgradeMin: 1.5,
  championPoachChance: 0.45,
  conferenceChampionPoachChance: 0.25,
} as const
