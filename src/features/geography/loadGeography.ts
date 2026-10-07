import type { Commune, GeographyDataset } from './types'

export type GeographyLoadErrorCode =
  | 'NETWORK'
  | 'INVALID_SCHEMA'
  | 'DUPLICATE_ID'
  | 'UNKNOWN_TERRITORY'

export class GeographyLoadError extends Error {
  public readonly code: GeographyLoadErrorCode

  constructor(
    code: GeographyLoadErrorCode,
    message: string,
  ) {
    super(message)
    this.code = code
    this.name = 'GeographyLoadError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRequiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new GeographyLoadError('INVALID_SCHEMA', `Champ obligatoire invalide : ${key}.`)
  }
  return value
}

export function conferenceForRegion(regionId: string): string {
  switch (regionId) {
    case '53': // Bretagne
    case '52': // Pays de la Loire
    case '28': // Normandie
    case '24': // Centre-Val de Loire
    case '01': // Guadeloupe
    case '02': // Martinique
    case '03': // Guyane
      return 'CONF_OUEST'
    case '32': // Hauts-de-France
    case '44': // Grand Est
    case '11': // Île-de-France
      return 'CONF_NORD'
    case '75': // Nouvelle-Aquitaine
    case '76': // Occitanie
      return 'CONF_SUD_OUEST'
    case '84': // Auvergne-Rhône-Alpes
    case '27': // Bourgogne-Franche-Comté
    case '93': // PACA
    case '94': // Corse
    case '04': // La Réunion
    case '06': // Mayotte
      return 'CONF_SUD_EST'
    default:
      return 'CONF_NORD'
  }
}

function parseCommune(value: unknown): Commune {
  if (!isRecord(value)) {
    throw new GeographyLoadError('INVALID_SCHEMA', 'Entrée de commune invalide.')
  }

  const id = readRequiredString(value, 'id')
  const population = value.population
  if (!Number.isInteger(population) || (population as number) < 1_000) {
    throw new GeographyLoadError('INVALID_SCHEMA', `Population invalide pour la commune ${id}.`)
  }

  const departmentId = typeof value.departmentId === 'string' ? value.departmentId : ''
  const regionId = typeof value.regionId === 'string' ? value.regionId : ''
  const zoneId = typeof value.zoneId === 'string' ? value.zoneId : ''
  if (!departmentId || !regionId || !zoneId) {
    throw new GeographyLoadError('UNKNOWN_TERRITORY', `Territoire manquant pour la commune ${id}.`)
  }

  const conferenceId =
    typeof value.conferenceId === 'string' && value.conferenceId
      ? value.conferenceId
      : conferenceForRegion(regionId)

  return Object.freeze({
    id,
    name: readRequiredString(value, 'name'),
    population: population as number,
    departmentId,
    regionId,
    zoneId,
    conferenceId,
    coordinates:
      Array.isArray(value.coordinates) && value.coordinates.length === 2
        ? ([Number(value.coordinates[0]), Number(value.coordinates[1])] as const)
        : undefined,
  })
}

export function parseGeography(value: unknown): GeographyDataset {
  if (!isRecord(value) || !Array.isArray(value.communes)) {
    throw new GeographyLoadError('INVALID_SCHEMA', 'Référentiel géographique invalide.')
  }

  const communes = value.communes.map(parseCommune).sort((left, right) => left.id.localeCompare(right.id))
  const identifiers = new Set<string>()
  for (const commune of communes) {
    if (identifiers.has(commune.id)) {
      throw new GeographyLoadError('DUPLICATE_ID', `Identifiant de commune dupliqué : ${commune.id}.`)
    }
    identifiers.add(commune.id)
  }

  return Object.freeze({
    version: readRequiredString(value, 'version'),
    sourceLabel: readRequiredString(value, 'sourceLabel'),
    sourceUrl: readRequiredString(value, 'sourceUrl'),
    communes: Object.freeze(communes),
  })
}

let cachedDatasetPromise: Promise<GeographyDataset> | null = null

export function clearGeographyCache(): void {
  cachedDatasetPromise = null
}

export async function loadGeography(): Promise<GeographyDataset> {
  if (!cachedDatasetPromise) {
    cachedDatasetPromise = (async () => {
      let response: Response
      try {
        response = await fetch('/data/communes.json')
      } catch {
        throw new GeographyLoadError('NETWORK', 'Impossible de charger le référentiel géographique.')
      }

      if (!response.ok) {
        throw new GeographyLoadError('NETWORK', `Chargement impossible (${response.status}).`)
      }

      return parseGeography(await response.json())
    })().catch((err) => {
      cachedDatasetPromise = null
      throw err
    })
  }

  return cachedDatasetPromise
}

