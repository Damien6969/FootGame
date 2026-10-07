import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'
import { parse } from 'csv-parse/sync'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDirectory = path.join(projectRoot, 'data', 'source')
const outputDirectory = path.join(projectRoot, 'public', 'data')

const zoneByRegion = new Map([
  ['11', 'ILE_DE_FRANCE'],
  ['24', 'CENTRE_OUEST'],
  ['27', 'EST'],
  ['28', 'NORD_OUEST'],
  ['32', 'NORD'],
  ['44', 'EST'],
  ['52', 'OUEST'],
  ['53', 'OUEST'],
  ['75', 'SUD_OUEST'],
  ['76', 'SUD_OUEST'],
  ['84', 'SUD_EST'],
  ['93', 'SUD_EST'],
  ['94', 'CORSE'],
  ['01', 'OUTRE_MER'],
  ['02', 'OUTRE_MER'],
  ['03', 'OUTRE_MER'],
  ['04', 'OUTRE_MER'],
  ['06', 'OUTRE_MER'],
])

const mayottePopulations = new Map([
  ['97601', 5192], ['97602', 13989], ['97603', 10282], ['97604', 6189],
  ['97605', 8295], ['97606', 8920], ['97607', 15848], ['97608', 17831],
  ['97609', 5507], ['97610', 32156], ['97611', 71437], ['97612', 7705],
  ['97613', 6432], ['97614', 10203], ['97615', 11442], ['97616', 11156],
  ['97617', 13934],
])

function readCsv(content, delimiter) {
  return parse(content, {
    bom: true,
    columns: true,
    delimiter,
    skip_empty_lines: true,
    trim: true,
  })
}

const populationZip = new AdmZip(path.join(sourceDirectory, 'population-2023-france-hors-mayotte.zip'))
const populationEntry = populationZip.getEntry('donnees_communes.csv')
if (!populationEntry) throw new Error('Le fichier donnees_communes.csv est absent de l’archive Insee.')

const populationRows = readCsv(populationEntry.getData().toString('utf8'), ';')
const populations = new Map(
  populationRows.map((row) => [String(row.COM), Number.parseInt(row.PMUN, 10)]),
)
for (const [id, population] of mayottePopulations) populations.set(id, population)

const communeRows = readCsv(
  fs.readFileSync(path.join(sourceDirectory, 'v_commune_2025.csv'), 'utf8'),
  ',',
)

// Insee population data details municipal arrondissements (ARM) for Paris, Marseille and Lyon.
// Aggregate their populations into their parent commune (COMPARENT) so Paris (75056), Marseille (13055) and Lyon (69123) are included.
for (const row of communeRows) {
  if (row.TYPECOM === 'ARM') {
    const armPop = populations.get(String(row.COM))
    if (Number.isInteger(armPop)) {
      const parentId = String(row.COMPARENT)
      populations.set(parentId, (populations.get(parentId) ?? 0) + armPop)
    }
  }
}

let coordsMap = new Map()
const coordsPath = path.join(sourceDirectory, 'communes-coords.json')
if (fs.existsSync(coordsPath)) {
  const coordsData = JSON.parse(fs.readFileSync(coordsPath, 'utf8'))
  coordsMap = new Map(Object.entries(coordsData))
}

const seen = new Set()
const communes = []
for (const row of communeRows) {
  if (row.TYPECOM !== 'COM') continue
  const id = String(row.COM)
  const population = populations.get(id)
  if (!Number.isInteger(population) || population < 1000) continue
  if (seen.has(id)) throw new Error(`Identifiant de commune dupliqué : ${id}.`)

  const zoneId = zoneByRegion.get(String(row.REG))
  if (!zoneId) throw new Error(`Région sans grande zone : ${row.REG} (${id}).`)
  seen.add(id)
  communes.push({
    id,
    name: String(row.NCCENR),
    population,
    departmentId: String(row.DEP),
    regionId: String(row.REG),
    zoneId,
    coordinates: coordsMap.get(id),
  })
}

communes.sort((left, right) => left.id.localeCompare(right.id))
if (communes.length < 9000 || communes.length > 11000) {
  throw new Error(`Nombre inattendu de communes retenues : ${communes.length}.`)
}

fs.mkdirSync(outputDirectory, { recursive: true })
fs.writeFileSync(
  path.join(outputDirectory, 'communes.json'),
  JSON.stringify({
    version: 'population-2023-cog-2025-mayotte-2017-v2',
    sourceLabel: 'Insee — populations de référence 2023, Mayotte 2017, COG 2025',
    sourceUrl: 'https://www.insee.fr/fr/statistiques/8680726',
    communes,
  }),
)

console.log(`${communes.length} communes de 1 000 habitants ou plus générées.`)
