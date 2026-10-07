import { expect, it } from 'vitest'
import { computeEffectiveStrength, computeStrength, simulateMatch } from '../match/simulateMatch'
import { executeInterseasonTransition } from '../teams/interseasonEngine'
import { computePersonTrophyRecord } from '../persons/personSelectors'
import { advancePersonsSeason } from '../persons/personGenerator'
import { applyRostersStrengthToClubs, assignSeasonRostersAndLoans, selectClubStarters } from '../persons/rosterAndLoans'
import { getClubActiveStarters } from '../persons/personSelectors'
import type { Person } from '../persons/types'
import type { Club } from '../teams/types'
import type { Commune } from '../geography/types'
import type { CupSession, SeasonArchive } from '../storage/cupRepository'

const communes: Commune[] = [['a',10000],['b',60000],['c',80000]].map(([id,population])=>({id:String(id),name:String(id),population:Number(population),departmentId:'01',regionId:'84',conferenceId:'CONF_SUD_EST',zoneId:'ZONE_SUD_EST'}))
const archive: SeasonArchive = {year:2026,seed:'test',completedAt:'2026-01-01',datasetVersion:'test',nationalChampionId:'none',conferenceChampions:{},finalFourTeamIds:[],totalMatches:0,teamPerformances:{},history:[]}
const player: Person = {id:'p',firstName:'A',lastName:'B',age:25,nationality:'FR',birthCommuneId:'a',birthCommuneName:'a',birthDepartmentId:'01',currentClubId:'a',parentClubId:'a',primaryRole:'PLAYER',position:'ATTACKER',attack:20,defense:10,careerYears:5}
const match = {id:'final',homeTeamId:'a',awayTeamId:'b'}
const result = {matchId:'final',homeScore:1,awayScore:0,winnerId:'a',events:[{sequence:1,teamId:'a',kind:'GOAL' as const,actorId:'p'}]}
const session: CupSession = {id:'active',seed:'test',seasonYear:2026,datasetVersion:'test',activeTeamIds:['a'],roundNumber:14,round:{matches:[match],byeTeamIds:[]},results:{final:result},history:[{...match,roundNumber:14,result}],championId:'a'}

it('uses the territorial base to apply player influence once during a match',()=>{
  const starters={attacker:{id:'p',attack:30,defense:20},defender:{id:'q',attack:20,defense:30}}
  const strength=computeEffectiveStrength(10,starters)
  const actual=simulateMatch({matchId:'test',rootSeed:'test',home:{id:'a',population:10000,baseStrength:10,strength},away:{id:'b',population:10000,strength:10},homeStarters:starters,populationBounds:{min:1000,max:2150000}})
  expect(actual.homeEffectiveStrength).toBe(strength)
})

it('removes a commune at its third secession without restoring another commune lost population',()=>{
  const strength=computeStrength(84000,1000,2150000)
  const club: Club={...communes[0],id:'a',name:'Alliance',shortName:'Alliance',communeId:'a',communeName:'a',communeIds:['a','b','c'],communeNames:['a','b','c'],population:84000,strength,baseStrength:strength,isFusion:true,secessionCounts:{b:2,c:1}}
  const transition=executeInterseasonTransition([club],archive,communes,{seed:'probe-15',maxFusions:0})
  const after=transition.nextClubs.find(c=>c.id==='a')!
  expect(transition.report.secessions.find(s=>s.communeId==='b')?.isCompleteWithdrawal).toBe(true)
  expect(after.communeIds).toEqual(['a','c'])
  expect(after.population).toBe(63600)
  expect(after.baseStrength).toBeCloseTo(computeStrength(63600,1000,2150000),1)
})

it('counts a final only once in a player season statistics',()=>{
  const season=computePersonTrophyRecord(player,[],session).seasons[0]
  expect(season.matchesPlayed).toBe(1)
  expect(season.goals).toBe(1)
  expect(season.shots).toBe(1)
})

it('keeps previous secession steps when an alliance absorbs another club',()=>{
  const alliance: Club={...communes[0],id:'a',name:'Alliance',shortName:'Alliance',communeId:'a',communeName:'a',communeIds:['a','b'],communeNames:['a','b'],population:29200,strength:12,isFusion:true,secessionCounts:{b:2}}
  const neighbor: Club={...communes[2],id:'c',name:'C',shortName:'C',communeId:'c',communeName:'c',communeIds:['c'],communeNames:['c'],strength:12}
  const transition=executeInterseasonTransition([alliance,neighbor],archive,communes,{seed:'fusion-counter',maxFusions:1,minRegenerationPopulation:1000000})
  expect(transition.report.fusions).toHaveLength(1)
  expect(transition.nextClubs.find(c=>c.id==='a')?.secessionCounts?.b).toBe(2)
})

it('archives matches for a player at the club even without an assigned position',()=>{
  const perf={teamId:'a',roundReached:14,stageLabel:'Champion',isNationalChampion:true,isConferenceChampion:false,matchesWon:1,matchesPlayed:1}
  const completed={...archive,history:session.history,teamPerformances:{a:perf}}
  const next=advancePersonsSeason({persons:[player],clubs:[],communes:[],seasonYear:2027,seed:'test',previousSeasonArchive:completed,newRecruitsCount:0,assignRostersAndLoans:false})
  expect(next[0].careerHistory?.[0].matchesPlayed).toBe(1)
})

it('keeps an unloaned surplus player at the club with zero participation in active and archived seasons',()=>{
  const club: Club={...communes[0],id:'a',name:'A',shortName:'A',communeId:'a',communeName:'a',communeIds:['a'],communeNames:['a'],strength:10}
  const reserve={...player,id:'reserve',attack:1,defense:1}
  const roster=assignSeasonRostersAndLoans({persons:[player,{...player,id:'def',position:'DEFENDER',attack:10,defense:25},reserve],clubs:[club],seed:'full'})
  const actual=roster.find(p=>p.id==='reserve')!
  expect(actual.currentClubId).toBe('a')
  expect(actual.assignedPosition).toBeUndefined()
  expect(applyRostersStrengthToClubs([club],roster)[0].strength).toBe(applyRostersStrengthToClubs([club],roster.filter(p=>p.id!=='reserve'))[0].strength)
  const active=computePersonTrophyRecord(actual,[],{...session,persons:roster}).seasons[0]
  expect(active.matchesPlayed).toBe(0)
  const perf={teamId:'a',roundReached:14,stageLabel:'Champion',isNationalChampion:true,isConferenceChampion:false,matchesWon:1,matchesPlayed:1}
  const completed={...archive,persons:roster,history:session.history,teamPerformances:{a:perf}}
  const next=advancePersonsSeason({persons:roster,clubs:[club],communes,seasonYear:2027,seed:'full',previousSeasonArchive:completed,newRecruitsCount:0,assignRostersAndLoans:false})
  const record=next.find(p=>p.id==='reserve')!.careerHistory![0]
  expect(record.clubId).toBe('a')
  expect(record.matchesPlayed).toBe(0)
  expect(record.isStarter).toBe(false)
  const enriched=computePersonTrophyRecord(next.find(p=>p.id==='reserve')!,[completed])
  expect(enriched.seasons[0].matchesPlayed).toBe(0)
  expect(enriched.nationalTitles).toBe(0)
})

it('recovers old season participation at the former club even after retirement',()=>{
  const retired: Person={...player,isRetired:true,currentClubId:null,careerHistory:[{year:2026,clubId:'a',role:'PLAYER',age:25,attack:20,defense:10}]}
  const completed={...archive,history:session.history,teamPerformances:{a:{teamId:'a',roundReached:14,stageLabel:'Champion',isNationalChampion:true,isConferenceChampion:false,matchesWon:1,matchesPlayed:1}}}
  expect(computePersonTrophyRecord(retired,[completed]).seasons[0].matchesPlayed).toBe(1)
})

it('uses the same optimal pair in selection and match lookup',()=>{
  const roster: Person[]=[{...player,id:'weak',attack:5,defense:1},{...player,id:'strong',attack:29,defense:10},{...player,id:'def',position:'DEFENDER',attack:1,defense:29}]
  const selected=selectClubStarters(roster)
  const matchPair=getClubActiveStarters(roster,'a')
  expect(matchPair.attacker?.id).toBe(selected.attacker?.id)
  expect(matchPair.defender?.id).toBe(selected.defender?.id)
})

it('deduplicates the archived final when saving individual career statistics',()=>{
  const completed={...archive,persons:[player],history:[...session.history,...session.history],teamPerformances:{a:{teamId:'a',roundReached:14,stageLabel:'Champion',isNationalChampion:true,isConferenceChampion:false,matchesWon:1,matchesPlayed:1}}}
  const next=advancePersonsSeason({persons:[player],clubs:[],communes:[],seasonYear:2027,seed:'test',previousSeasonArchive:completed,newRecruitsCount:0,assignRostersAndLoans:false})
  expect(next[0].careerHistory?.[0].goals).toBe(1)
  expect(computePersonTrophyRecord(player,[completed]).seasons[0].matchesPlayed).toBe(1)
})
