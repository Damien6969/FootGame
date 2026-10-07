import { beforeEach, expect, it } from 'vitest'
import fixture from '../../test/fixtures/communes.fixture.json'
import { parseGeography } from '../geography/loadGeography'
import { buildClubsFromCommunes } from '../teams/clubGenerator'
import { cupRepository, type CupSession } from './cupRepository'

beforeEach(async () => { await cupRepository.clearAll(); localStorage.clear() })
const club = buildClubsFromCommunes(parseGeography(fixture).communes)[0]
const session: CupSession = { id: 'active', seed: 'test', datasetVersion: 'test', activeTeamIds: [club.id],
  roundNumber: 1, round: { matches: [], byeTeamIds: [club.id] }, results: {}, history: [],
  clubs: [{ ...club, identity: { primaryColor: '#123456', secondaryColor: '#ffffff', logo: '/club-logos/etoile.svg' } }] }

it('includes identities in career exports and restores them', async () => {
  await cupRepository.save(session)
  const backup = await cupRepository.exportBackup()
  await cupRepository.clearAll()
  await cupRepository.importBackup(backup)
  expect((await cupRepository.load())?.clubs?.[0].identity).toEqual(session.clubs![0].identity)
})

it('rejects a malformed identity before replacing the current career', async () => {
  await cupRepository.save(session)
  const backup = await cupRepository.exportBackup()
  const invalid = { ...backup, session: { ...session, clubs: [{ ...club, identity: { primaryColor: 'bad', secondaryColor: '#ffffff' } }] } }
  await expect(cupRepository.importBackup(invalid)).rejects.toThrow(/identity/)
  expect((await cupRepository.load())?.clubs?.[0].identity).toEqual(session.clubs![0].identity)
})
