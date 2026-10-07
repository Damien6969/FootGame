import data from './data/identities.json'
import { PERSON_IDENTITY_CONFIG as config } from '../../config/personIdentity'

export interface GeneratePersonNameOptions {
  rng?: () => number
  birthDepartmentId?: string
  birthRegionId?: string
  birthYear?: number
}
export interface GeneratedPersonName {
  firstName: string
  lastName: string
  nationality: string
  secondNationality?: string
}
type NameWeight = Readonly<{ name: string; weight: number }>
type Catalog = {
  cohorts: number[]
  names: string[]
  pools: Record<string, string>
  countries: Record<string, { firstNames: string[]; lastNames: string[] }>
  regionalSurnames: Record<string, string[]>
  commonFrenchSurnames: string[]
}
const catalog: Catalog = data
const departmentRegions: Record<string, string> = {}
for (const [region, departments] of Object.entries({
  '11': '75 77 78 91 92 93 94 95', '24': '18 28 36 37 41 45',
  '27': '21 25 39 58 70 71 89 90', '28': '14 27 50 61 76',
  '32': '02 59 60 62 80', '44': '08 10 51 52 54 55 57 67 68 88',
  '52': '44 49 53 72 85', '53': '22 29 35 56',
  '75': '16 17 19 23 24 33 40 47 64 79 86 87',
  '76': '09 11 12 30 31 32 34 46 48 65 66 81 82',
  '84': '01 03 07 15 26 38 42 43 63 69 73 74',
  '93': '04 05 06 13 83 84', '94': '2A 2B',
  '01': '971', '02': '972', '03': '973', '04': '974', '06': '976',
})) for (const department of departments.split(' ')) departmentRegions[department] = region

function regionFor(options: GeneratePersonNameOptions): string {
  return options.birthRegionId ?? departmentRegions[options.birthDepartmentId?.toUpperCase() ?? ''] ?? 'FR'
}
const distributions = new Map<string, readonly NameWeight[]>()
function distributionKey(options: GeneratePersonNameOptions): string {
  const year = Number.isFinite(options.birthYear) ? options.birthYear! : 2000
  const cohort = catalog.cohorts.findLast(c => year >= c) ?? catalog.cohorts[0]
  const key = `${regionFor(options)}:${cohort}`
  return catalog.pools[key] ? key : `FR:${cohort}`
}
/** Effectifs de naissances masculines, arrondis par l’INSEE ; aucun lien avec la nationalité. */
export function getFirstNameDistribution(options: GeneratePersonNameOptions = {}): readonly NameWeight[] {
  const key = distributionKey(options)
  let pool = distributions.get(key)
  if (!pool) {
    pool = catalog.pools[key].split(',').map(entry => {
      const [index, weight] = entry.split('.').map(value => parseInt(value, 36))
      return { name: catalog.names[index], weight }
    })
    distributions.set(key, pool)
  }
  return pool
}
const cumulativePools = new Map<readonly NameWeight[], { cumulative: number[]; total: number }>()
function weightedFirstName(options: GeneratePersonNameOptions, rng: () => number): string {
  // Un peu de diffusion nationale, sans effacer les particularités régionales.
  const pool = getFirstNameDistribution(rng() < config.nationalFirstNameMix ? { ...options, birthRegionId: 'FR' } : options)
  let compiled = cumulativePools.get(pool)
  if (!compiled) {
    let total = 0
    const cumulative = pool.map(n => total += n.weight)
    compiled = { cumulative, total }
    cumulativePools.set(pool, compiled)
  }
  const target = rng() * compiled.total
  let low = 0, high = pool.length - 1
  while (low < high) {
    const mid = (low + high) >>> 1
    if (compiled.cumulative[mid] <= target) low = mid + 1
    else high = mid
  }
  return pool[low].name
}
function sample(items: readonly string[], rng: () => number): string {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]
}
function familyCountry(region: string, frenchOnly: boolean, rng: () => number): string {
  const multipliers = config.regionalCountryMultipliers[region] ?? {}
  const entries = Object.entries(config.familyCountryWeights)
    .filter(([country]) => frenchOnly || country !== 'FR')
    .map(([country, weight]) => [country, weight * (multipliers[country] ?? 1)] as const)
  let target = rng() * entries.reduce((sum, [, weight]) => sum + weight, 0)
  for (const [country, weight] of entries) {
    target -= weight
    if (target < 0) return country
  }
  return entries.at(-1)![0]
}
function localSurnames(options: GeneratePersonNameOptions): readonly string[] | undefined {
  const department = options.birthDepartmentId?.toUpperCase()
  const region = regionFor(options)
  if (region === '94') return catalog.regionalSurnames.CORSE
  if (region === '53') return catalog.regionalSurnames.BRETON
  if (department === '64') return catalog.regionalSurnames.BASQUE
  if (['67', '68', '57'].includes(department ?? '')) return catalog.regionalSurnames.ALSACE
  if (region === '76') return catalog.regionalSurnames.OCCITAN
  return undefined
}
/** Une identité fictive est tirée d’abord ; on ne déduit jamais la citoyenneté d’un nom. */
export function generatePersonName(options: GeneratePersonNameOptions = {}): GeneratedPersonName {
  const rng = options.rng ?? Math.random
  const citizenship = rng()
  const frenchOnly = citizenship < config.frenchOnlyShare
  const dual = !frenchOnly && citizenship < config.frenchOnlyShare + config.dualNationalityShare
  const country = familyCountry(regionFor(options), frenchOnly, rng)
  const profile = catalog.countries[country]
  const firstName = frenchOnly || (dual && rng() < config.frenchFirstNameShareForDual)
    ? weightedFirstName(options, rng)
    : sample(profile.firstNames, rng)
  const regional = country === 'FR' ? localSurnames(options) : undefined
  const surnamePool = regional && rng() < config.regionalSurnameShare ? regional
    : country === 'FR' && rng() < config.commonFrenchSurnameShare ? catalog.commonFrenchSurnames
    : profile.lastNames
  const lastName = sample(surnamePool, rng)
  return {
    firstName, lastName,
    nationality: frenchOnly || dual ? 'FR' : country,
    ...(dual ? { secondNationality: country } : {}),
  }
}
