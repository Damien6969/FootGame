import { expect, it } from 'vitest'
import { rankPlayerPalmares, type PlayerPalmaresRecord } from './playerPalmaresSelectors'

function record(id: string, values: Partial<PlayerPalmaresRecord>): PlayerPalmaresRecord {
  return { person: { id, firstName: id, lastName: id }, rank: 99, nationalTitles: 0, ballonOrCount: 0,
    topScorerCount: 0, topStopsCount: 0, conferenceTitles: 0, regionTitles: 0, departmentTitles: 0,
    totalTitles: 0, ...values } as PlayerPalmaresRecord
}

it('ranks France, Ballon, equal Soulier/Bouclier, conference, region, department, then total', () => {
  const rows = [
    record('many-small', { departmentTitles: 99, totalTitles: 99 }),
    record('region', { regionTitles: 1 }), record('conference', { conferenceTitles: 1 }),
    record('bouclier', { topStopsCount: 2 }), record('soulier', { topScorerCount: 2 }),
    record('ballon', { ballonOrCount: 1 }), record('france', { nationalTitles: 1 }),
  ]
  expect(rankPlayerPalmares(rows).map(r => r.person.id)).toEqual([
    'france', 'ballon', 'bouclier', 'soulier', 'conference', 'region', 'many-small',
  ])
  expect(rows[0].rank).toBe(99)
  expect(rankPlayerPalmares(rows).map(r => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7])
})

it('uses total titles to break equal major titles and ignores old cached ranks', () => {
  expect(rankPlayerPalmares([
    record('A', { rank: 1, nationalTitles: 1, totalTitles: 2 }),
    record('B', { rank: 2, nationalTitles: 1, totalTitles: 3 }),
  ]).map(r => r.person.id)).toEqual(['B', 'A'])
})
