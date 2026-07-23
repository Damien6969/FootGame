const assert = require('assert');
const { MatchEngine, simulateMatch } = require('./match-engine');

function run(seed, duration = 20) { return simulateMatch({ seed, duration, fixedDt: 1 / 60 }); }
const a = run(77), b = run(77);
assert.deepStrictEqual(a.score, b.score, 'same seed must produce the same score');
assert.deepStrictEqual(a.evenements, b.evenements, 'same seed must produce the same events');

const visible = new MatchEngine({ seed: 91, duration: 12 });
while (!visible.isFinished()) visible.step(visible.fixedDt);
const headless = run(91, 12);
assert.deepStrictEqual(visible.getResult().score, headless.score, 'visible stepping and headless stepping must match');

const m = new MatchEngine({ seed: 4, duration: 3 });
while (!m.isFinished()) {
  m.step();
  for (const p of m.players) {
    assert(p.energyCurrent >= .25 && p.energyCurrent <= 1, 'energy bounds');
    Object.values(p.attributes).forEach(v => assert(v >= 0 && v <= 100, 'attribute bounds'));
  }
}
assert(m.eventHistory.filter(e => e.type === 'MATCH_END').length === 1, 'match ends once');

const active = run(12, 30);
const activeEvents = active.evenements.map(e => e.type);
assert(activeEvents.includes('BALL_CARRY_START'), 'a carrier can progress without an immediate pass or shot');
assert(activeEvents.includes('DRIBBLE_ATTEMPT'), 'dribble attempts are emitted');
assert(activeEvents.some(type => type === 'DRIBBLE_SUCCESS' || type === 'DRIBBLE_FAILED'), 'a dribble has a concrete outcome');
assert(!/document|canvas|requestAnimationFrame|performance\.now|Math\.random/.test(require('fs').readFileSync('match-engine.js', 'utf8')), 'engine has no DOM or non-deterministic random dependency');
for (const player of active.statistiques.individuelles) {
  assert(player.distanceConduite >= 0, 'carry distance is valid');
  assert(player.dribblesReussis <= player.dribblesTentes, 'dribble stats remain coherent');
}
assert(active.evenements.every(e => e.type !== 'SHOT_BLOCKED' || e.team), 'blocked shots retain the defending team');

for (let seed = 1; seed <= 100; seed++) {
  const result = run(seed, 8);
  assert(result.evenements.some(e => e.type === 'MATCH_END'), 'headless match terminates');
}
const energyEngine = new MatchEngine({ seed: 33, duration: 10 });
const openingEnergy = energyEngine.players.map(p => p.energyCurrent);
assert(openingEnergy.every(e => e === 1), 'energy starts at one');
for (let i = 0; i < 180; i++) energyEngine.step();
const beforeKickoff = energyEngine.players.map(p => p.energyCurrent);
energyEngine.kickoff('red');
assert.deepStrictEqual(energyEngine.players.map(p => p.energyCurrent), beforeKickoff, 'kickoff never resets energy');
assert(energyEngine.players.filter(p => !p.keeper).every(p => p.role), 'each field player receives a stable role');
const rolesA = new MatchEngine({ seed: 5 }).players.map(p => p.role);
const rolesB = new MatchEngine({ seed: 5 }).players.map(p => p.role);
assert.deepStrictEqual(rolesA, rolesB, 'role assignment is deterministic');
const halves = new MatchEngine({ seed: 44, duration: 12 });
while (!halves.halfTimeDone) halves.step();
const scoreAtHalf = { ...halves.score }, rolesAtHalf = halves.players.map(p => p.role), energyAtHalf = halves.players.map(p => p.energyCurrent);
assert(halves.eventHistory.some(e => e.type === 'HALF_TIME'), 'match emits a deterministic half-time event');
for (let i = 0; i < 240; i++) halves.step();
assert.deepStrictEqual(halves.score, scoreAtHalf, 'half-time itself does not reset score');
assert.deepStrictEqual(halves.players.map(p => p.role), rolesAtHalf, 'half-time preserves roles');
assert(halves.players.some((p,i) => p.energyCurrent >= energyAtHalf[i]) && halves.players.every(p => p.energyCurrent <= 1), 'half-time recovery occurs once and remains bounded');
const energetic = new MatchEngine({ seed: 8, teams: { blue: [{ enduranceStat: 100 }, { enduranceStat: 100 }, { enduranceStat: 100 }, { enduranceStat: 100 }, { enduranceStat: 100 }] } });
const tired = new MatchEngine({ seed: 8, teams: { blue: [{ enduranceStat: 0 }, { enduranceStat: 0 }, { enduranceStat: 0 }, { enduranceStat: 0 }, { enduranceStat: 0 }] } });
const hi = energetic.players.find(p => p.team === 'blue' && !p.keeper), lo = tired.players.find(p => p.team === 'blue' && !p.keeper);
energetic.applyEnergyCost(hi, 'SPRINT', 1, 8); tired.applyEnergyCost(lo, 'SPRINT', 1, 8);
assert(hi.energyCurrent > lo.energyCurrent && hi.energyCurrent < 1, 'endurance slows, but does not eliminate, fatigue');
const costs = new MatchEngine({ seed: 19 });
const attacker = costs.players.find(p => p.team === 'blue' && !p.keeper), defender = costs.players.find(p => p.team === 'red' && !p.keeper);
const beforeDribble = attacker.energyCurrent; costs.emit('DRIBBLE_ATTEMPT', { team: attacker.team, player: attacker.name }); const afterDribble = attacker.energyCurrent;
costs.emit('DRIBBLE_ATTEMPT', { team: attacker.team, player: attacker.name });
assert(afterDribble < beforeDribble && attacker.matchStats.nombreEffortsIntenses === 2, 'each dribble attempt has one punctual energy cost');
const beforeShot = attacker.energyCurrent; costs.emit('SHOT', { team: attacker.team, player: attacker.name }); assert(attacker.energyCurrent < beforeShot, 'a shot has a punctual energy cost');
const beforeTackle = defender.energyCurrent; costs.emit('TACKLE_WON', { team: defender.team, player: defender.name }); assert(defender.energyCurrent < beforeTackle && costs.eventHistory.some(e => e.type === 'TACKLE_ATTEMPT'), 'a tackle has one punctual energy cost and attempt event');
const roleVariant = new MatchEngine({ seed: 5, teams: { blue: [{}, { defense: 10, vitesse: 98, technique: 95, tir: 95 }, { defense: 98, enduranceStat: 98 }, { vision: 99, passe: 99 }, { technique: 99, passe: 99, vision: 99, vitesse: 20 }] } });
assert.notDeepStrictEqual(roleVariant.players.filter(p => p.team === 'blue').map(p => p.role), rolesA.slice(0, 5), 'team attributes change role distribution');
assert(roleVariant.players.some(p => ['AILIER_DEBORDEUR', 'MILIEU_RECUPERATEUR', 'ATTAQUANT_PIVOT'].includes(p.role)), 'winger, ball-winner, or pivot roles are assignable');
console.log('match-engine tests passed');
