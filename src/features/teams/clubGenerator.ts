import type { Commune } from '../geography/types'
import type { Club } from './types'
import { computeStrength } from '../match/simulateMatch'
import { getDepartmentName } from '../geography/territoryLabels'

type NamingPattern =
  | 'FC_PREFIX'
  | 'AS_PREFIX'
  | 'US_PREFIX'
  | 'OLYMPIQUE'
  | 'CITY_FC'
  | 'SC_PREFIX'
  | 'STADE'
  | 'RC_PREFIX'
  | 'CS_PREFIX'
  | 'ES_PREFIX'
  | 'AC_PREFIX'
  | 'ENTENTE'
  | 'UNION'
  | 'ALLIANCE'
  | 'RACING'
  | 'SPORTING'
  | 'ETOILE'
  | 'AVENIR'
  | 'ATHLETIC'
  | 'CLUB_OLYMPIQUE'

// Weighted distribution for French football club conventions (100 entries)
const PATTERN_DISTRIBUTION: readonly NamingPattern[] = [
  ...Array(20).fill('FC_PREFIX'),
  ...Array(16).fill('AS_PREFIX'),
  ...Array(12).fill('US_PREFIX'),
  ...Array(12).fill('OLYMPIQUE'),
  ...Array(8).fill('CITY_FC'),
  ...Array(5).fill('SC_PREFIX'),
  ...Array(5).fill('STADE'),
  ...Array(4).fill('RC_PREFIX'),
  ...Array(2).fill('CS_PREFIX'),
  ...Array(2).fill('ES_PREFIX'),
  ...Array(2).fill('AC_PREFIX'),
  ...Array(3).fill('RACING'),
  ...Array(3).fill('SPORTING'),
  ...Array(2).fill('ETOILE'),
  ...Array(2).fill('AVENIR'),
  ...Array(1).fill('ATHLETIC'),
  ...Array(1).fill('CLUB_OLYMPIQUE'),
]

function hashString(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i)
  }
  return Math.abs(hash)
}

function startsWithVowelOrMuteH(name: string): boolean {
  return /^[aeiouyéèêëàâîïôùûh]/i.test(name)
}

export function getClubNameForCommune(
  commune: Commune,
  clubIndex = 0,
): { name: string; shortName: string } {
  const hash = hashString(`${commune.id}:${commune.name}:${clubIndex}`)
  const patternIndex = (hash + clubIndex * 37) % PATTERN_DISTRIBUTION.length
  const pattern = PATTERN_DISTRIBUTION[patternIndex]
  return formatClubName(pattern, commune.name)
}

function formatClubName(
  pattern: NamingPattern,
  cName: string,
  usePreposition = true,
): { name: string; shortName: string } {
  const elision = usePreposition ? (startsWithVowelOrMuteH(cName) ? "d'" : 'de ') : ''

  switch (pattern) {
    case 'FC_PREFIX':
      return { name: `FC ${cName}`, shortName: `FC ${cName}` }
    case 'AS_PREFIX':
      return { name: `AS ${cName}`, shortName: `AS ${cName}` }
    case 'US_PREFIX':
      return { name: `US ${cName}`, shortName: `US ${cName}` }
    case 'OLYMPIQUE':
      return { name: `Olympique ${elision}${cName}`, shortName: `O. ${cName}` }
    case 'CITY_FC':
      return { name: `${cName} FC`, shortName: `${cName} FC` }
    case 'SC_PREFIX':
      return { name: `SC ${cName}`, shortName: `SC ${cName}` }
    case 'STADE':
      return { name: `Stade ${elision}${cName}`, shortName: `Stade ${cName}` }
    case 'RC_PREFIX':
      return { name: `RC ${cName}`, shortName: `RC ${cName}` }
    case 'CS_PREFIX':
      return { name: `CS ${cName}`, shortName: `CS ${cName}` }
    case 'ES_PREFIX':
      return { name: `ES ${cName}`, shortName: `ES ${cName}` }
    case 'AC_PREFIX':
      return { name: `AC ${cName}`, shortName: `AC ${cName}` }
    case 'ENTENTE':
      return { name: `Entente ${cName}`, shortName: `Entente ${cName}` }
    case 'UNION':
      return { name: `Union ${cName}`, shortName: `Union ${cName}` }
    case 'ALLIANCE':
      return { name: `Alliance ${cName}`, shortName: `Alliance ${cName}` }
    case 'RACING':
      return { name: `Racing ${cName}`, shortName: `RC ${cName}` }
    case 'SPORTING':
      return { name: `Sporting ${cName}`, shortName: `SC ${cName}` }
    case 'ETOILE':
      return { name: `Étoile ${elision}${cName}`, shortName: `ES ${cName}` }
    case 'AVENIR':
      return { name: `Avenir ${elision}${cName}`, shortName: `AS ${cName}` }
    case 'ATHLETIC':
      return { name: `Athlétic Club ${elision}${cName}`, shortName: `AC ${cName}` }
    case 'CLUB_OLYMPIQUE':
      return { name: `Club olympique ${elision}${cName}`, shortName: `CO ${cName}` }
    default:
      return { name: `FC ${cName}`, shortName: `FC ${cName}` }
  }
}

export function createClubFromCommune(
  commune: Commune,
  bounds: { min: number; max: number } = { min: 1000, max: 2150000 },
  clubIndex = 0,
): Club {
  const { name, shortName } = getClubNameForCommune(commune, clubIndex)
  const rawStrength = computeStrength(commune.population, bounds.min, bounds.max)
  const strength = Number(rawStrength.toFixed(1))
  const id = clubIndex === 0 ? commune.id : `${commune.id}-${clubIndex + 1}`

  return Object.freeze({
    id,
    name,
    shortName,
    communeId: commune.id,
    communeName: commune.name,
    communeIds: [commune.id],
    communeNames: [commune.name],
    departmentId: commune.departmentId,
    regionId: commune.regionId,
    zoneId: commune.zoneId,
    conferenceId: commune.conferenceId,
    population: commune.population,
    strength,
    coordinates: commune.coordinates,
  })
}

export type FusionClubNamingInput = {
  name: string
  shortName: string
  communeName: string
  population: number
  departmentId?: string
  communeNames?: readonly string[]
  fusionCount?: number
  isCustomName?: boolean
}

// ----- Fusion naming helpers -----

/** Sigles extraits du club initiateur et conservés lors des fusions à taille comparable */
const FUSION_SIGLES = ['FC', 'AS', 'US', 'RC', 'SC', 'ES', 'CS', 'AC'] as const

/** Styles partagés par les fusions à deux villes et les alliances territoriales. */
const FUSION_PATTERN_POOL: readonly NamingPattern[] = [
  'ENTENTE', 'UNION', 'ALLIANCE', 'OLYMPIQUE', 'RACING', 'SPORTING',
  'STADE', 'ETOILE', 'AVENIR', 'CLUB_OLYMPIQUE', 'FC_PREFIX', 'US_PREFIX', 'AS_PREFIX',
]

/** Reconnaît le style du club initiateur, y compris Olympique, Racing et les suffixes. */
function extractNamingPattern(clubName: string): NamingPattern | null {
  for (const sigle of FUSION_SIGLES) {
    if (clubName.startsWith(`${sigle} `)) return `${sigle}_PREFIX` as NamingPattern
  }
  if (clubName.endsWith(' FC')) return 'CITY_FC'
  const wordPatterns: readonly [string, NamingPattern][] = [
    ['Olympique ', 'OLYMPIQUE'], ['Racing ', 'RACING'], ['Sporting ', 'SPORTING'],
    ['Stade ', 'STADE'], ['Étoile ', 'ETOILE'], ['Avenir ', 'AVENIR'],
    ['Athlétic Club ', 'ATHLETIC'], ['Club olympique ', 'CLUB_OLYMPIQUE'],
    ['Entente ', 'ENTENTE'], ['Union ', 'UNION'], ['Alliance ', 'ALLIANCE'],
  ]
  for (const [prefix, pattern] of wordPatterns) {
    if (clubName.startsWith(prefix)) return pattern
  }
  return null
}

/**
 * Amélioration 1 — Séparateur visuel entre les communes :
 * Si l'une des deux communes contient déjà un tiret dans son nom,
 * on utilise ' / ' pour éviter des noms illisibles comme
 * "Entente Bagnols-sur-Cèze-Saint-Privat-des-Vieux".
 */
function fusionSeparator(a: string, b: string): string {
  return a.includes('-') || b.includes('-') ? ' / ' : '-'
}

/**
 * Amélioration 3 — Troncature intelligente du nom d'une commune :
 * "Bagnols-sur-Cèze" → "Bagnols", "Saint-Maur-des-Fossés" → "Saint-Maur",
 * "Saint-Brieuc" → "Saint-Brieuc" (2 parties max → conservé).
 * Coupe avant la première préposition/article rencontrée.
 */
function shortenCommuneName(name: string): string {
  const PREPS = ['sur', 'sous', 'les', 'en', 'de', 'du', 'des', 'la', 'le', 'lès', 'près', 'et', 'au', 'aux']
  const parts = name.split('-')
  if (parts.length <= 2) return name
  for (let i = 1; i < parts.length; i++) {
    if (PREPS.includes(parts[i].toLowerCase())) {
      return parts.slice(0, i).join('-')
    }
  }
  return parts.slice(0, 2).join('-')
}

/**
 * Construit le nom complet + le shortName pour une fusion à deux communes.
 * - Applique le bon séparateur (tiret ou ' / ')
 * - Tronque le shortName si le nom complet dépasse 40 caractères
 */
function buildFusionName(
  pattern: NamingPattern,
  communeA: string,
  communeB: string,
): { name: string; shortName: string } {
  const sep = fusionSeparator(communeA, communeB)
  const full = formatClubName(pattern, `${communeA}${sep}${communeB}`)
  const shortA = shortenCommuneName(communeA)
  const shortB = shortenCommuneName(communeB)
  const short = formatClubName(pattern, `${shortA}${sep}${shortB}`)
  return { name: full.name, shortName: full.name.length > 40 ? short.shortName : full.shortName }
}

/**
 * Alliance équilibrée : ville de base, ville + numéro, département ou numéro seul.
 * Le style et la référence géographique varient sans imposer un nom de bassin à 3 communes.
 */
export function generateMultiCommuneFusionName(
  leadClub: FusionClubNamingInput,
): { name: string; shortName: string } {
  const cName = leadClub.communeName
  const shortCity = shortenCommuneName(cName)
  const deptId = leadClub.departmentId
  const deptName = getDepartmentName(deptId)
  const places = [{ full: cName, short: shortCity, usePreposition: true }]
  if (deptId) {
    places.push({ full: `${cName} ${deptId}`, short: `${shortCity} ${deptId}`, usePreposition: true })
    places.push({ full: deptId, short: deptId, usePreposition: false })
  }
  if (deptName) places.push({ full: deptName, short: deptName, usePreposition: false })

  const styles = [extractNamingPattern(leadClub.name) ?? 'FC_PREFIX', ...FUSION_PATTERN_POOL]
  const hash = hashString(`${cName}:${deptId ?? ''}:${leadClub.name}`)
  const pattern = styles[hash % styles.length]
  const place = places[Math.floor(hash / styles.length) % places.length]
  const full = formatClubName(pattern, place.full, place.usePreposition)
  const short = formatClubName(pattern, place.short, place.usePreposition)
  return { name: full.name, shortName: full.name.length > 40 ? short.shortName : full.shortName }
}

// ----- Public API -----

export function generateFusionClubName(
  leadOrCommunes: FusionClubNamingInput | readonly string[],
  absorbedOrPrimary: FusionClubNamingInput | string,
  totalCommunesCount?: number,
): { name: string; shortName: string } {
  // Mode compatibilité avec tableau de noms de communes (appels legacy)
  if (Array.isArray(leadOrCommunes)) {
    const communeNames = leadOrCommunes
    const primaryName = absorbedOrPrimary as string
    if (communeNames.length >= 3) {
      const pattern = FUSION_PATTERN_POOL[hashString(communeNames.join(':')) % FUSION_PATTERN_POOL.length]
      return formatClubName(pattern, primaryName)
    }
    const [a, b] = communeNames
    return buildFusionName('ENTENTE', a, b ?? '')
  }

  const leadClub = leadOrCommunes as FusionClubNamingInput
  const absorbedClub = absorbedOrPrimary as FusionClubNamingInput
  const count = totalCommunesCount ?? 2

  // RÈGLE 1 : Si le nom du club a déjà été modifié / personnalisé par l'utilisateur : NE JAMAIS L'ÉCRASER
  if (leadClub.isCustomName) {
    return {
      name: leadClub.name,
      shortName: leadClub.shortName,
    }
  }

  // RÈGLE 2 : Si le club initiateur compte DÉJÀ 3 équipes ou plus (communeNames.length >= 3 ou fusionCount >= 3)
  // et qu'il passe à 4 équipes ou plus : NE PAS RÉINITIALISER le nom, conserver le nom existant.
  const wasAlreadyMultiCommunes =
    (leadClub.communeNames && leadClub.communeNames.length >= 3) ||
    (leadClub.fusionCount !== undefined && leadClub.fusionCount >= 3)

  if (wasAlreadyMultiCommunes && count >= 4) {
    return {
      name: leadClub.name,
      shortName: leadClub.shortName,
    }
  }

  // RÈGLE 3 : La dominance prime sur le nombre de communes de l'alliance.
  // Conserver le seuil historique de 50 %, même lorsque le partenaire est déjà une fusion.
  if (absorbedClub.population < 0.5 * leadClub.population) {
    return { name: leadClub.name, shortName: leadClub.shortName }
  }

  // RÈGLE 4 : Alliance sans partenaire mineur : varier les références géographiques à 3+.
  if (count >= 3) {
    return generateMultiCommuneFusionName(leadClub)
  }

  const fallbackPattern = FUSION_PATTERN_POOL[
    hashString(`${leadClub.communeName}:${absorbedClub.communeName}:${leadClub.name}`) % FUSION_PATTERN_POOL.length
  ]

  // RÈGLE 5 : Petit club initiateur vers une plus grande ville partenaire :
  // On garde TOUJOURS les deux noms avec l'initiateur en premier.
  // Le style varie sans reprendre automatiquement celui du partenaire.
  if (leadClub.population < absorbedClub.population) {
    return buildFusionName(fallbackPattern, leadClub.communeName, absorbedClub.communeName)
  }

  // RÈGLE 6 : Tailles comparables (partenaire >= 50% de l'initiateur) :
  // Conserver aussi les styles écrits en toutes lettres et le suffixe FC.
  const pattern = extractNamingPattern(leadClub.name) ?? fallbackPattern
  return buildFusionName(pattern, leadClub.communeName, absorbedClub.communeName)
}


export function buildClubsFromCommunes(
  communes: readonly Commune[],
  bounds?: { min: number; max: number },
): readonly Club[] {
  const minPop = bounds?.min ?? (communes.length ? Math.min(...communes.map((c) => c.population)) : 1000)
  const maxPop = bounds?.max ?? (communes.length ? Math.max(...communes.map((c) => c.population)) : 2150000)
  const popBounds = { min: minPop, max: maxPop }

  return Object.freeze(communes.map((commune) => createClubFromCommune(commune, popBounds, 0)))
}
