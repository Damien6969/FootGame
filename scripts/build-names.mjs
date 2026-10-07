// npm run build:names — données locales, aucune requête réseau pendant le jeu.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import AdmZip from 'adm-zip'
import { parse } from 'csv-parse'
import { fr, de, es, it, pt_PT, pl, tr, vi } from '@faker-js/faker'

const source = 'https://www.insee.fr/fr/statistiques/fichier/8595130/prenoms-2025-reg_csv.zip'
const cache = new URL('../data/names-sources/', import.meta.url)
await mkdir(cache, { recursive: true })
const zipPath = new URL('prenoms-2025-reg_csv.zip', cache)
let bytes
try { bytes = await readFile(zipPath) } catch {
  const response = await fetch(source)
  if (!response.ok) throw new Error(`INSEE : ${response.status}`)
  bytes = Buffer.from(await response.arrayBuffer())
  await writeFile(zipPath, bytes)
}
const cohorts = [1900, 1970, 1990, 2000, 2010, 2020]
const counts = new Map()
const csv = new AdmZip(bytes).getEntry('prenoms-2025-reg.csv').getData()
const parser = Readable.from([csv]).pipe(parse({ columns: true, delimiter: ';', skip_empty_lines: true, bom: true }))
for await (const row of parser) {
  const year = Number(row.periode), weight = Number(row.valeur)
  if (row.sexe !== '1' || !Number.isFinite(year) || year < 1900 || year > 2025 || weight <= 0 || row.prenom.startsWith('_')) continue
  const cohort = cohorts.findLast(c => year >= c)
  const name = row.prenom.toLocaleLowerCase('fr').replace(/(^|[- '\u2019])\p{L}/gu, c => c.toLocaleUpperCase('fr'))
  for (const region of [row.reg, 'FR']) {
    const key = `${region}:${cohort}`
    if (!counts.has(key)) counts.set(key, new Map())
    const pool = counts.get(key)
    pool.set(name, (pool.get(name) ?? 0) + weight)
  }
}
const names = [], indexes = new Map(), pools = {}, coverage = {}
for (const [key, pool] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
  const sorted = [...pool].sort(([a, x], [b, y]) => y - x || a.localeCompare(b, 'fr'))
  const total = sorted.reduce((sum, [, w]) => sum + w, 0)
  const targetCoverage = key.startsWith('FR:') ? .98 : .90
  let retainedWeight = 0, limit = 0
  while (limit < sorted.length && retainedWeight / total < targetCoverage) retainedWeight += sorted[limit++][1]
  const retained = sorted.slice(0, limit)
  coverage[key] = Number((retained.reduce((sum, [, w]) => sum + w, 0) / total).toFixed(4))
  pools[key] = retained.map(([name, weight]) => {
    if (!indexes.has(name)) { indexes.set(name, names.length); names.push(name) }
    // Encodage compact sans perte des indices et effectifs ; décodage à la demande.
    return `${indexes.get(name).toString(36)}.${weight.toString(36)}`
  }).join(',')
}
const regionalSurnames = JSON.parse(await readFile(new URL('data/regional-surnames.json', import.meta.url), 'utf8'))
const countries = JSON.parse(await readFile(new URL('data/country-names.json', import.meta.url), 'utf8'))
for (const [country, locale] of Object.entries({ FR: fr, DE: de, ES: es, IT: it, PT: pt_PT, PL: pl, TR: tr, VN: vi })) {
  const clean = list => [...new Set(list)].filter(n => n.trim().length > 1)
  countries[country] = {
    firstNames: clean(locale.person.first_name.male ?? locale.person.first_name.generic),
    lastNames: clean(locale.person.last_name.male ?? locale.person.last_name.generic),
  }
}
countries.FR.lastNames = [...new Set([...countries.FR.lastNames, ...Object.values(regionalSurnames).flat()])]
const output = {
  metadata: { source, sha256: createHash('sha256').update(bytes).digest('hex'), sourceEndYear: 2025, sex: 'male', regionalCoverageTarget: .90, nationalCoverageTarget: .98, coverage },
  cohorts, names, pools, countries, regionalSurnames,
  commonFrenchSurnames: [...new Set([...fr.person.last_name.generic, ...regionalSurnames.STANDARD])],
}
await mkdir(new URL('../src/features/persons/data/', import.meta.url), { recursive: true })
await writeFile(new URL('../src/features/persons/data/identities.json', import.meta.url), JSON.stringify(output))
await mkdir(new URL('../public/flags/', import.meta.url), { recursive: true })
for (const country of Object.keys(countries)) {
  await copyFile(new URL(`../node_modules/flag-icons/flags/4x3/${country.toLowerCase()}.svg`, import.meta.url), new URL(`../public/flags/${country.toLowerCase()}.svg`, import.meta.url))
}
for (const [pkg, name] of [['@faker-js/faker', 'faker'], ['flag-icons', 'flag-icons']]) {
  await copyFile(new URL(`../node_modules/${pkg}/LICENSE`, import.meta.url), new URL(`../public/flags/LICENSE-${name}.txt`, import.meta.url))
}
console.log(`${names.length} prénoms INSEE, ${Object.values(countries).reduce((sum, c) => sum + c.lastNames.length, 0)} entrées de patronymes, ${Object.keys(pools).length} distributions. Taille : ${JSON.stringify(output).length} caractères.`)
