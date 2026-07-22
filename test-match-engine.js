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
console.log('match-engine tests passed');
