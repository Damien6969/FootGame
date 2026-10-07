import { describe, expect, it } from 'vitest'
import {
  getClubNameForCommune,
  createClubFromCommune,
  buildClubsFromCommunes,
  generateFusionClubName,
  generateMultiCommuneFusionName,
} from './clubGenerator'
import type { Commune } from '../geography/types'

const fakeCommune: Commune = {
  id: '01004',
  name: 'Ambérieu-en-Bugey',
  population: 14854,
  departmentId: '01',
  regionId: '84',
  zoneId: 'SUD_EST',
  conferenceId: 'CONF_SUD_EST',
}

const marseille: Commune = {
  id: '13055',
  name: 'Marseille',
  population: 873076,
  departmentId: '13',
  regionId: '93',
  zoneId: 'SUD_EST',
  conferenceId: 'CONF_SUD_EST',
}

const nantes: Commune = {
  id: '44109',
  name: 'Nantes',
  population: 323204,
  departmentId: '44',
  regionId: '52',
  zoneId: 'OUEST',
  conferenceId: 'CONF_OUEST',
}

const paris: Commune = {
  id: '75056',
  name: 'Paris',
  population: 2100000,
  departmentId: '75',
  regionId: '11',
  zoneId: 'ILE_DE_FRANCE',
  conferenceId: 'CONF_NORD',
}

describe('clubGenerator', () => {
  it('generates generic club names derived purely from commune names without real club overrides like PSG', () => {
    const clubParis = getClubNameForCommune(paris)
    expect(clubParis.name).not.toBe('Paris Saint-Germain')
    expect(clubParis.name).toContain('Paris')
    expect(clubParis.name).toMatch(/^(FC|AS|US|Olympique|SC|Stade|RC|CS|ES|AC|Entente|Paris)/)

    const clubMarseille = getClubNameForCommune(marseille)
    expect(clubMarseille.name).toContain('Marseille')
  })

  it('generates a realistic French football club name deterministically', () => {
    const club1 = getClubNameForCommune(fakeCommune)
    const club2 = getClubNameForCommune(fakeCommune)
    expect(club1.name).toBe(club2.name)
    expect(club1.name).toMatch(/^(FC|AS|US|Olympique|SC|Stade|RC|CS|ES|AC|Entente|Ambérieu) /)
  })

  it('creates a Club entity with variable strength initialized by population', () => {
    const bounds = { min: 1000, max: 2000000 }
    const club = createClubFromCommune(fakeCommune, bounds)

    expect(club.id).toBe('01004')
    expect(club.communeId).toBe('01004')
    expect(club.communeName).toBe('Ambérieu-en-Bugey')
    expect(club.population).toBe(14854)
    expect(club.strength).toBeGreaterThan(1)
    expect(club.strength).toBeLessThan(30)
    expect(typeof club.strength).toBe('number')
  })

  it('supports generating multiple distinct clubs for a single commune in the future', () => {
    const club0 = createClubFromCommune(marseille, undefined, 0)
    const club1 = createClubFromCommune(marseille, undefined, 1)

    expect(club0.id).toBe('13055')
    expect(club1.id).toBe('13055-2')
    expect(club0.communeId).toBe('13055')
    expect(club1.communeId).toBe('13055')
    expect(club0.name).not.toBe(club1.name)
  })

  it('builds a collection of clubs from communes with same length', () => {
    const clubs = buildClubsFromCommunes([fakeCommune, marseille, nantes])
    expect(clubs).toHaveLength(3)
    expect(clubs[0].name).toBeTruthy()
    expect(clubs[1].name).toContain('Marseille')
    expect(clubs[2].name).toContain('Nantes')
  })

  it('keeps large city name if partner has less than 50% of its population', () => {
    const marseilleClub = {
      name: 'FC Marseille',
      shortName: 'FC Marseille',
      communeName: 'Marseille',
      population: 870000,
    }
    const allauchClub = {
      name: 'US Allauch',
      shortName: 'Allauch',
      communeName: 'Allauch',
      population: 21000, // 21k < 50% of 870k (2.4%)
    }

    const { name } = generateFusionClubName(marseilleClub, allauchClub, 2)
    expect(name).toBe('FC Marseille') // Preserves big city name
  })

  it('uses sigle or Entente/Union for cities close in population (>= 50%)', () => {
    // Si le grand club a un sigle (AS Cannes → AS), le sigle est conservé
    const cannesClub = {
      name: 'AS Cannes',
      shortName: 'AS Cannes',
      communeName: 'Cannes',
      population: 74000,
    }
    const antibesClub = {
      name: 'FC Antibes',
      shortName: 'Antibes',
      communeName: 'Antibes',
      population: 73000, // 73k >= 50% of 74k (98.6%)
    }

    const { name } = generateFusionClubName(cannesClub, antibesClub, 2)
    // Amélioration 2 : le sigle "AS" du club initiateur est conservé
    expect(name).toBe('AS Cannes-Antibes')
  })

  it('keeps a dominant city name when reaching 3 or more communes', () => {
    const lyonClub = {
      name: 'FC Lyon',
      shortName: 'Lyon',
      communeName: 'Lyon',
      population: 520000,
    }
    const otherClub = {
      name: 'US Bron',
      shortName: 'Bron',
      communeName: 'Bron',
      population: 40000,
    }

    for (const count of [3, 4, 7]) {
      expect(generateFusionClubName(lyonClub, otherClub, count)).toEqual({
        name: 'FC Lyon', shortName: 'Lyon',
      })
    }

    // Avec département spécifié (dept 01 / Ain) : conventions avec département
    const belleyClub = {
      name: 'FC Belley',
      shortName: 'Belley',
      communeName: 'Belley',
      population: 9000,
      departmentId: '01',
    }
    const virieuClub = {
      name: 'FC Virieu',
      shortName: 'Virieu',
      communeName: 'Virieu',
      population: 3000,
      departmentId: '01',
    }
    const { name: nameWithDept } = generateFusionClubName(belleyClub, virieuClub, 3)
    expect(nameWithDept).toBe('FC Belley')

    // Le mode sans populations conserve aussi la ville de base comme référence.
    const { name: legacyName } = generateFusionClubName(['Lyon', 'Bron', 'Villeurbanne'], 'Lyon', 3)
    expect(legacyName).toContain('Lyon')
    expect(legacyName).not.toContain('Grand')
  })

  it('offers more club styles at creation while retaining the commune and deterministic names', () => {
    const names = Array.from({ length: 300 }, (_, index) => {
      const name = getClubNameForCommune(marseille, index)
      expect(name.name).toContain('Marseille')
      expect(name.shortName).toContain('Marseille')
      expect(getClubNameForCommune(marseille, index)).toEqual(name)
      return name.name
    })
    for (const style of ['Olympique', 'Racing', 'Sporting', 'Étoile', 'Avenir', 'Athlétic']) {
      expect(names.some((name) => name.startsWith(style))).toBe(true)
    }
  })

  it.each([
    ['Olympique de Cannes', 'Olympique de Cannes-Antibes', 'O. Cannes-Antibes'],
    ['Racing Cannes', 'Racing Cannes-Antibes', 'RC Cannes-Antibes'],
    ['Sporting Cannes', 'Sporting Cannes-Antibes', 'SC Cannes-Antibes'],
    ['Cannes FC', 'Cannes-Antibes FC', 'Cannes-Antibes FC'],
  ])('preserves the initiator style %s for a balanced fusion', (original, name, shortName) => {
    expect(generateFusionClubName({
      name: original, shortName: original, communeName: 'Cannes', population: 74000,
    }, {
      name: 'FC Antibes', shortName: 'Antibes', communeName: 'Antibes', population: 73000,
    }, 2)).toEqual({ name, shortName })
  })

  it('varies small-initiator fusion styles and keeps the base city first', () => {
    const names = Array.from({ length: 150 }, (_, index) => {
      const city = `Village-${index}`
      const lead = { name: `US ${city}`, shortName: city, communeName: city, population: 5000 }
      const absorbed = { name: 'FC Lyon', shortName: 'Lyon', communeName: 'Lyon', population: 520000 }
      const result = generateFusionClubName(lead, absorbed, 2)
      expect(result.name).toContain(`${city} / Lyon`)
      expect(generateFusionClubName(lead, absorbed, 2)).toEqual(result)
      return result.name
    })
    for (const style of ['Entente', 'Union', 'Alliance', 'Olympique', 'Racing', 'Sporting']) {
      expect(names.some((name) => name.startsWith(style))).toBe(true)
    }
  })

  it('offers city, department name and department code variants for balanced multi-commune fusions', () => {
    const names = Array.from({ length: 150 }, (_, index) => {
      const lead = { name: `FC Belley ${index}`, shortName: 'Belley', communeName: 'Belley', population: 9000, departmentId: '01' }
      const result = generateMultiCommuneFusionName(lead)
      expect(generateMultiCommuneFusionName(lead)).toEqual(result)
      expect(result.name).toMatch(/Belley|Ain|01/)
      expect(result.name).not.toMatch(/Grand|Bassin|Pays/)
      expect(result.name).not.toMatch(/\b(?:de |d')01\b/)
      return result.name
    })
    expect(names.some((name) => name.includes('Belley') && !name.includes('01'))).toBe(true)
    expect(names.some((name) => name.includes('Belley') && name.includes('01'))).toBe(true)
    expect(names.some((name) => name.includes('Ain'))).toBe(true)
    expect(names.some((name) => name.startsWith('Olympique'))).toBe(true)
    expect(new Set(names).size).toBeGreaterThan(12)
  })

  it('does not reset the name when a club already has 3 or more communes and merges again to 4+', () => {
    const fusedClub = {
      name: 'Alliance Belley',
      shortName: 'Alliance Belley',
      communeName: 'Belley',
      population: 30000,
      communeNames: ['Belley', 'Virieu', 'Culoz'],
      fusionCount: 3,
    }
    const fourthClub = {
      name: 'FC Seyssel',
      shortName: 'Seyssel',
      communeName: 'Seyssel',
      population: 3000,
    }

    const { name, shortName } = generateFusionClubName(fusedClub, fourthClub, 4)
    expect(name).toBe('Alliance Belley')
    expect(shortName).toBe('Alliance Belley')
  })

  it('preserves user custom name when fusing', () => {
    const customClub = {
      name: 'Mon Super Club FC',
      shortName: 'Mon Super Club',
      communeName: 'Belley',
      population: 30000,
      isCustomName: true,
      communeNames: ['Belley', 'Virieu'],
      fusionCount: 2,
    }
    const newClub = {
      name: 'FC Culoz',
      shortName: 'Culoz',
      communeName: 'Culoz',
      population: 3000,
    }

    const { name, shortName } = generateFusionClubName(customClub, newClub, 3)
    expect(name).toBe('Mon Super Club FC')
    expect(shortName).toBe('Mon Super Club')
  })

  it('keeps both names with initiator first when a small club initiates fusion with a larger city', () => {
    const saintVitClub = {
      name: 'US Saint-Vit',
      shortName: 'Saint-Vit',
      communeName: 'Saint-Vit',
      population: 4900,
    }
    const besanconClub = {
      name: 'Racing Besançon',
      shortName: 'Besançon',
      communeName: 'Besançon',
      population: 118000,
    }

    const { name, shortName } = generateFusionClubName(saintVitClub, besanconClub, 2)
    // Amélioration 1 : "Saint-Vit" contient un tiret → séparateur ' / ' pour distinguer les deux villes
    expect(name).toContain('Saint-Vit / Besançon')
    expect(shortName).toContain('Saint-Vit / Besançon')
  })

  it('uses territorial naming at the exact 50% boundary for a balanced multi-commune fusion', () => {
    const result = generateFusionClubName({
      name: 'FC Belley', shortName: 'Belley historique', communeName: 'Belley', population: 9000, departmentId: '01',
    }, {
      name: 'FC Culoz', shortName: 'Culoz', communeName: 'Culoz', population: 4500,
    }, 3)
    expect(result.name).toMatch(/Belley|Ain|01/)
    expect(result.shortName).toBeTruthy()
    expect(result.shortName).not.toBe('Belley historique')
  })

  it('keeps long commune names intact and abbreviates only the short name', () => {
    expect(generateFusionClubName({
      name: 'Olympique de Bagnols-sur-Cèze', shortName: 'O. Bagnols', communeName: 'Bagnols-sur-Cèze', population: 20000,
    }, {
      name: 'FC Saint-Privat-des-Vieux', shortName: 'Saint-Privat', communeName: 'Saint-Privat-des-Vieux', population: 12000,
    }, 2)).toEqual({
      name: 'Olympique de Bagnols-sur-Cèze / Saint-Privat-des-Vieux',
      shortName: 'O. Bagnols / Saint-Privat',
    })
  })
})
