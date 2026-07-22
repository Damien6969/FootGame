(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const W = 1280;
  const H = 720;
  const FIELD = { left: 88, right: 1192, top: 62, bottom: 658 };
  const GOAL = { top: 286, bottom: 434, depth: 44 };
  const TEAM = {
    blue: { main: '#2b9cff', light: '#75c6ff', dark: '#0b4173', name: 'AZUR', direction: 1 },
    red: { main: '#ff4f62', light: '#ff91a0', dark: '#7c1724', name: 'CARMIN', direction: -1 }
  };
  const NAMES = {
    blue: ['NOA', 'MILO', 'SACHA', 'ELIOTT', 'YANIS'],
    red: ['LÉO', 'NINO', 'TOM', 'AXEL', 'ENZO']
  };
  const NUMBERS = [1, 4, 8, 10, 11];
  const FORMATIONS = {
    blue: [[120, 360], [345, 230], [345, 490], [620, 285], [610, 440]],
    red: [[1160, 360], [935, 230], [935, 490], [660, 285], [670, 440]]
  };
  const PLAYER_ATTRIBUTES = {
    blue: [
      { pace: 61, passing: 68, technique: 52, vision: 64, shooting: 35, defending: 74, goalkeeping: 86, endurance: 78 },
      { pace: 76, passing: 72, technique: 70, vision: 62, shooting: 51, defending: 82, goalkeeping: 18, endurance: 84 },
      { pace: 69, passing: 86, technique: 82, vision: 91, shooting: 68, defending: 67, goalkeeping: 12, endurance: 88 },
      { pace: 83, passing: 78, technique: 88, vision: 79, shooting: 87, defending: 45, goalkeeping: 9, endurance: 79 },
      { pace: 90, passing: 71, technique: 84, vision: 68, shooting: 80, defending: 38, goalkeeping: 8, endurance: 73 }
    ],
    red: [
      { pace: 66, passing: 74, technique: 58, vision: 72, shooting: 32, defending: 71, goalkeeping: 89, endurance: 75 },
      { pace: 72, passing: 68, technique: 67, vision: 65, shooting: 47, defending: 86, goalkeeping: 14, endurance: 87 },
      { pace: 81, passing: 77, technique: 76, vision: 75, shooting: 62, defending: 72, goalkeeping: 10, endurance: 82 },
      { pace: 75, passing: 88, technique: 85, vision: 90, shooting: 74, defending: 56, goalkeeping: 11, endurance: 84 },
      { pace: 87, passing: 69, technique: 86, vision: 71, shooting: 89, defending: 34, goalkeeping: 7, endurance: 76 }
    ]
  };
  const POSITIONS = ['GARDIEN', 'DÉFENSEUR', 'MILIEU', 'ATTAQUANT', 'ATTAQUANT'];

  const ui = {
    scoreBlue: document.getElementById('scoreBlue'),
    scoreRed: document.getElementById('scoreRed'),
    clock: document.getElementById('matchClock'),
    state: document.getElementById('matchState'),
    pause: document.getElementById('pausePanel'),
    end: document.getElementById('endPanel'),
    event: document.getElementById('eventBanner'),
    eventTitle: document.getElementById('eventTitle'),
    eventSubtitle: document.getElementById('eventSubtitle'),
    powerWrap: document.getElementById('powerWrap'),
    powerFill: document.getElementById('powerFill'),
    liveAction: document.getElementById('liveAction'),
    shotsText: document.getElementById('shotsText'),
    passesText: document.getElementById('passesText'),
    possessionBlue: document.getElementById('possessionBlue'),
    possessionText: document.getElementById('possessionText'),
    sound: document.getElementById('soundButton'),
    debug: document.getElementById('debugButton'),
    debugFeed: document.getElementById('debugFeed'),
    debugLog: document.getElementById('debugLog'),
    speed: document.getElementById('speedButton'),
    pauseButton: document.getElementById('pauseButton'),
    endTitle: document.getElementById('endTitle'),
    endScore: document.getElementById('endScore'),
    statsButton: document.getElementById('statsButton'),
    statsPanel: document.getElementById('statsPanel'),
    closeStatsButton: document.getElementById('closeStatsButton'),
    panelScore: document.getElementById('panelScore'),
    panelPossession: document.getElementById('panelPossession'),
    panelShots: document.getElementById('panelShots'),
    playerDetail: document.getElementById('playerDetail'),
    teamTables: document.getElementById('teamTables')
  };

  const keys = new Set();
  const pressed = new Set();
  const particles = [];
  const trails = [];
  const debugFloats = [];
  const debugLogEntries = [];
  const crowdDots = Array.from({ length: 260 }, (_, i) => ({
    x: (i * 83.17) % W,
    y: i % 2 ? 18 + ((i * 37) % 34) : 670 + ((i * 19) % 38),
    a: .12 + ((i * 13) % 22) / 100
  }));

  let players = [];
  let selected = null;
  let ball;
  let score = { blue: 0, red: 0 };
  let stats = { blue: { shots: 0, passes: 0 }, red: { shots: 0, passes: 0 } };
  let matchTime = 180;
  let elapsed = 0;
  let lastTime = performance.now();
  let paused = false;
  let ended = false;
  let freezeTime = 1.25;
  let pendingKickoffTeam = null;
  let bannerTimer = 0;
  let shotCharge = 0;
  let charging = false;
  let shake = 0;
  let bluePossession = 0;
  let redPossession = 0;
  let soundEnabled = true;
  let simulationSpeed = 1;
  let debugEnabled = true;
  let statsSelectedPlayer = null;
  let lastStatsRender = 0;
  let audioContext = null;
  let touchVector = { x: 0, y: 0 };
  let mobileShootHeld = false;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const length = (x, y) => Math.hypot(x, y);
  const normalize = (x, y) => {
    const l = Math.hypot(x, y) || 1;
    return { x: x / l, y: y / l };
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  // Tirage gaussien : la compétence resserre l'exécution sans jamais supprimer l'erreur.
  function gaussian() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function sampleExecution(mean, deviationMinimum = 5, deviationMaximum = 28, skill = 50) {
    const deviation = lerp(deviationMaximum, deviationMinimum, clamp(skill, 0, 100) / 100);
    return { value: mean + gaussian() * deviation, variance: deviation };
  }
  const sigmoid = value => 1 / (1 + Math.exp(-value));
  const fatiguePenalty = p => (1 - p.energyCurrent) * 18;

  function makePlayer(team, index) {
    const [x, y] = FORMATIONS[team][index];
    return {
      team, index, name: NAMES[team][index], number: NUMBERS[index],
      keeper: index === 0, x, y, vx: 0, vy: 0, radius: index === 0 ? 19 : 17,
      enduranceStat: PLAYER_ATTRIBUTES[team][index].endurance, energyCurrent: 1, stamina: 1, tackleCooldown: 0, imbalance: 0, actionCooldown: .3 + index * .09,
      facingX: TEAM[team].direction, facingY: 0, hasBallTime: 0,
      targetX: x, targetY: y, sprinting: false,
      position: POSITIONS[index], attributes: { ...PLAYER_ATTRIBUTES[team][index] },
      matchStats: { goals: 0, assists: 0, shots: 0, shotsOnTarget: 0, shotsOffTarget: 0, shotsBlocked: 0, passesAttempted: 0, passesCompleted: 0, tackles: 0, tacklesWon: 0, saves: 0, savesParried: 0, losses: 0, interceptions: 0, failedControls: 0, touches: 0 }
    };
  }

  function resetMatch() {
    players = [];
    ['blue', 'red'].forEach(team => {
      for (let i = 0; i < 5; i++) players.push(makePlayer(team, i));
    });
    score = { blue: 0, red: 0 };
    stats = { blue: { shots: 0, passes: 0 }, red: { shots: 0, passes: 0 } };
    matchTime = 180;
    elapsed = 0;
    ended = false;
    paused = false;
    bluePossession = 0;
    redPossession = 0;
    pendingKickoffTeam = null;
    statsSelectedPlayer = null;
    particles.length = 0;
    trails.length = 0;
    debugFloats.length = 0;
    debugLogEntries.length = 0;
    renderDebugLog();
    ui.pause.hidden = true;
    ui.end.hidden = true;
    ui.pauseButton.textContent = 'Ⅱ';
    ui.pauseButton.setAttribute('aria-label', 'Mettre en pause');
    ui.state.textContent = 'SIMULATION IA';
    lastTime = performance.now();
    setupKickoff(Math.random() < .5 ? 'blue' : 'red', true);
    updateUI();
  }

  function setupKickoff(team, opening = false) {
    players.forEach(p => {
      const [x, y] = FORMATIONS[p.team][p.index];
      p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.hasBallTime = 0;
    });
    const kicker = players.find(p => p.team === team && p.index === 3);
    const support = players.find(p => p.team === team && p.index === 4);
    kicker.x = W / 2 - TEAM[team].direction * 15;
    kicker.y = H / 2;
    support.x = W / 2 - TEAM[team].direction * 80;
    support.y = H / 2 + 50;
    ball = {
      x: W / 2, y: H / 2, vx: 0, vy: 0, radius: 8, owner: kicker,
      pickupDelay: .25, lastTouch: team, passFrom: null,
      assistCandidate: null, lastShooter: null
    };
    kicker.matchStats.touches += 1;
    selected = null;
    freezeTime = opening ? 1.3 : 1.8;
    shotCharge = 0;
    charging = false;
    showBanner(opening ? "COUP D'ENVOI" : 'REPRISE DU JEU', `${TEAM[team].name} engage`, freezeTime);
  }

  function showBanner(title, subtitle, duration = 1.6) {
    ui.eventTitle.textContent = title;
    ui.eventSubtitle.textContent = subtitle;
    ui.event.classList.add('show');
    bannerTimer = duration;
  }

  function nearestPlayer(team, target, includeKeeper = true) {
    let nearest = null;
    let best = Infinity;
    for (const p of players) {
      if (p.team !== team || (!includeKeeper && p.keeper)) continue;
      const d = distance(p, target);
      if (d < best) { best = d; nearest = p; }
    }
    return nearest;
  }

  function switchPlayer() {
    if (ball.owner?.team === 'blue' && !ball.owner.keeper) {
      selected = ball.owner;
    } else {
      const candidates = players.filter(p => p.team === 'blue' && !p.keeper)
        .sort((a, b) => distance(a, ball) - distance(b, ball));
      const current = candidates.indexOf(selected);
      selected = candidates[(current + 1) % Math.min(3, candidates.length)] || candidates[0];
    }
    ui.playerName.textContent = selected.name;
  }

  function takeBall(player) {
    if (ball.pickupDelay > 0) return;
    const incomingPasser = ball.passFrom;
    const incomingShooter = ball.lastShooter;
    const ballSpeed = length(ball.vx, ball.vy);
    // Une réception est un geste distinct : une passe propre et lente reste très fiable.
    if (!player.keeper && incomingPasser && incomingPasser.team === player.team) {
      const pressure = Math.max(0, 90 - pressureOn(player));
      const receptionAngle = Math.max(0, -(normalize(ball.vx, ball.vy).x * player.facingX + normalize(ball.vx, ball.vy).y * player.facingY));
      const difficulty = Math.max(0, (ballSpeed - 210) / 7) + pressure * .45 + receptionAngle * 14;
      const mean = player.attributes.technique * .65 + player.attributes.passing * .15 + player.attributes.vision * .10 + player.energyCurrent * 10 - difficulty;
      const execution = sampleExecution(mean, 4, 20, player.attributes.technique);
      if (execution.value < 33) {
        player.matchStats.failedControls += 1;
        incomingPasser.matchStats.losses += 1;
        ball.passFrom = null; ball.assistCandidate = null; ball.pickupDelay = .14;
        ball.vx *= .72; ball.vy *= .72;
        emitDebug(player.x, player.y - 24, ['CONTRÔLE RATÉ', `technique ${player.attributes.technique} · difficulté ${Math.round(difficulty)} · variance ±${Math.round(execution.variance)}`, 'ballon repoussé'], '#ff8290', player.name);
        return;
      }
      if (execution.value < 49) { ball.x += ball.vx * .055; ball.y += ball.vy * .055; }
    }
    if (player.keeper && incomingShooter && incomingShooter.team !== player.team && ballSpeed > 120) {
      const positioning = 100 - Math.abs(player.y - H / 2) * .32;
      const needed = ballSpeed / 18 + Math.abs(ball.y - H / 2) * .18;
      const reaction = sampleExecution(player.attributes.goalkeeping * .70 + player.attributes.vision * .15 + player.attributes.pace * .10 + positioning - needed, 5, 24, player.attributes.goalkeeping);
      if (reaction.value < 35) return; // le ballon continue : but ou poteau possible
      player.matchStats.saves += 1;
      if (reaction.value < 62 || ballSpeed > 690) {
        player.matchStats.savesParried += 1;
        ball.owner = null; ball.passFrom = null; ball.lastShooter = null; ball.pickupDelay = .2;
        const away = normalize(player.x - ball.x, player.y - ball.y);
        ball.vx = away.x * 270; ball.vy = away.y * 270;
        emitDebug(player.x, player.y - 24, ['PARADE — BAL. REPOUSSÉ', `gardien ${player.attributes.goalkeeping} · opposition ${Math.round(needed)} · variance ±${Math.round(reaction.variance)}`], '#c7f33c', player.name);
        return;
      }
    }
    if (incomingPasser) {
      if (incomingPasser.team === player.team && incomingPasser !== player) {
        incomingPasser.matchStats.passesCompleted += 1;
        ball.assistCandidate = incomingPasser;
        emitDebug(player.x, player.y - player.radius - 8, [
          'PASSE RÉUSSIE',
          `réception par ${player.name}`,
          `passe ${incomingPasser.attributes.passing}`
        ], '#c7f33c', incomingPasser.name);
      } else if (incomingPasser.team !== player.team) {
        ball.assistCandidate = null;
        incomingPasser.matchStats.losses += 1;
        player.matchStats.interceptions += 1;
        emitDebug(player.x, player.y - player.radius - 8, [
          'PASSE ÉCHOUÉE',
          `interceptée par ${player.name}`,
          `passe ${incomingPasser.attributes.passing}`
        ], '#ff8290', incomingPasser.name);
      }
    }
    if (player.keeper && incomingShooter && incomingShooter.team !== player.team && ballSpeed > 120) {
      emitDebug(player.x, player.y - player.radius - 8, [
        'ARRÊT RÉUSSI',
        `gardien ${player.attributes.goalkeeping} vs tir ${incomingShooter.attributes.shooting}`,
        'ballon capté'
      ], '#c7f33c', player.name);
    } else if (incomingShooter && incomingShooter.team !== player.team && !player.keeper) {
      incomingShooter.matchStats.shotsBlocked += 1;
      emitDebug(player.x, player.y - player.radius - 8, [
        'TIR ÉCHOUÉ',
        `bloqué par ${player.name}`,
        `tir ${incomingShooter.attributes.shooting}`
      ], '#ff8290', incomingShooter.name);
    }
    ball.owner = player;
    ball.lastTouch = player.team;
    ball.passFrom = null;
    if (incomingShooter?.team !== player.team) ball.lastShooter = null;
    player.hasBallTime = 0;
    player.matchStats.touches += 1;
    playTone(190, .025, 'sine', .025);
  }

  function releaseBall(player, dx, dy, speed, type = 'pass', debugLines = null) {
    if (ball.owner !== player) return;
    const dir = normalize(dx || player.facingX, dy || player.facingY);
    ball.owner = null;
    ball.x = player.x + dir.x * (player.radius + 11);
    ball.y = player.y + dir.y * (player.radius + 11);
    ball.vx = dir.x * speed + player.vx * .35;
    ball.vy = dir.y * speed + player.vy * .35;
    ball.pickupDelay = type === 'shot' ? .18 : .1;
    ball.lastTouch = player.team;
    ball.passFrom = type === 'pass' ? player : null;
    if (type === 'shot') ball.lastShooter = player;
    player.actionCooldown = type === 'shot' ? .45 : .25;
    player.hasBallTime = 0;
    if (type === 'shot') {
      stats[player.team].shots += 1;
      player.matchStats.shots += 1;
      const targetY = player.y + dy / (Math.abs(dx) || 1) * Math.abs((player.team === 'blue' ? FIELD.right : FIELD.left) - player.x);
      if (targetY > GOAL.top + 8 && targetY < GOAL.bottom - 8) player.matchStats.shotsOnTarget += 1;
      else player.matchStats.shotsOffTarget += 1;
    } else {
      stats[player.team].passes += 1;
      player.matchStats.passesAttempted += 1;
    }
    emitKick(ball.x, ball.y, TEAM[player.team].light, type === 'shot' ? 9 : 5);
    playTone(type === 'shot' ? 95 : 145, type === 'shot' ? .08 : .045, 'triangle', type === 'shot' ? .09 : .055);
    if (type === 'shot') shake = Math.max(shake, 3.5);
    if (debugLines) emitDebug(player.x, player.y - player.radius - 8, debugLines, type === 'shot' ? '#ffd166' : TEAM[player.team].light, player.name);
  }

  function findPassTarget(player, direction) {
    const mates = players.filter(p => p.team === player.team && p !== player && !p.keeper);
    let best = null;
    let bestScore = -Infinity;
    for (const mate of mates) {
      const dx = mate.x - player.x;
      const dy = mate.y - player.y;
      const dist = Math.hypot(dx, dy);
      const dir = normalize(dx, dy);
      const alignment = dir.x * direction.x + dir.y * direction.y;
      const forward = dx * TEAM[player.team].direction / 300;
      const scoreValue = alignment * 2.2 + forward - dist / 1300;
      if (scoreValue > bestScore) { bestScore = scoreValue; best = mate; }
    }
    return bestScore > -.15 ? best : null;
  }

  function doPass(player) {
    if (ball.owner !== player || player.actionCooldown > 0) return;
    const input = getInputVector();
    const direction = length(input.x, input.y) > .1 ? normalize(input.x, input.y) : { x: player.facingX, y: player.facingY };
    const target = findPassTarget(player, direction);
    if (target) {
      const lead = .22;
      releaseBall(player, target.x + target.vx * lead - player.x, target.y + target.vy * lead - player.y, 520, 'pass');
    } else {
      releaseBall(player, direction.x, direction.y, 470, 'pass');
    }
  }

  function doShot(player, power = .62) {
    if (ball.owner !== player || player.actionCooldown > 0) return;
    const input = getInputVector();
    let dx = input.x;
    let dy = input.y;
    if (length(dx, dy) < .1) {
      const goalX = player.team === 'blue' ? FIELD.right + 25 : FIELD.left - 25;
      dx = goalX - player.x;
      dy = H / 2 - player.y + (Math.random() - .5) * 42;
    }
    releaseBall(player, dx, dy, 610 + power * 360, 'shot');
  }

  function getInputVector() {
    let x = touchVector.x;
    let y = touchVector.y;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
    if (Math.hypot(x, y) > 1) return normalize(x, y);
    return { x, y };
  }

  function updateHuman(player, dt) {
    const input = getInputVector();
    const moving = length(input.x, input.y) > .08;
    const wantsSprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    player.sprinting = moving && wantsSprint && player.stamina > .05;
    const maxSpeed = player.sprinting ? 260 : 205;
    const acceleration = ball.owner === player ? 930 : 1080;
    player.vx += input.x * acceleration * dt;
    player.vy += input.y * acceleration * dt;
    if (moving) {
      player.facingX = input.x;
      player.facingY = input.y;
    }
    const speed = length(player.vx, player.vy);
    if (speed > maxSpeed) {
      player.vx = player.vx / speed * maxSpeed;
      player.vy = player.vy / speed * maxSpeed;
    }
    if (player.sprinting) player.energyCurrent = Math.max(.25, player.energyCurrent - dt * .16);
    else player.energyCurrent = Math.min(1, player.energyCurrent + dt * .1);
    player.stamina = player.energyCurrent;

    if (pressed.has('KeyE')) doPass(player);
    const shootDown = keys.has('Space') || mobileShootHeld;
    if (shootDown && ball.owner === player) {
      charging = true;
      shotCharge = Math.min(1, shotCharge + dt * .72);
    } else if (charging) {
      doShot(player, shotCharge);
      charging = false;
      shotCharge = 0;
    }
  }

  function aiTarget(player) {
    const dir = TEAM[player.team].direction;
    const owner = ball.owner;
    const ownBall = owner?.team === player.team;
    const opponentBall = owner && owner.team !== player.team;
    const closestField = nearestPlayer(player.team, ball, false);

    if (player.keeper) {
      const goalX = player.team === 'blue' ? FIELD.left + 30 : FIELD.right - 30;
      const danger = player.team === 'blue' ? ball.x < FIELD.left + 260 : ball.x > FIELD.right - 260;
      const reactionRange = 115 + player.attributes.goalkeeping * .75;
      if (!owner && danger && distance(player, ball) < reactionRange) return { x: ball.x, y: ball.y };
      if (opponentBall && danger && distance(player, ball) < reactionRange * .72) return { x: ball.x, y: ball.y };
      return { x: goalX, y: clamp(ball.y, GOAL.top + 26, GOAL.bottom - 26) };
    }

    if (!owner && closestField === player) return { x: ball.x, y: ball.y };
    if (opponentBall && closestField === player) return { x: ball.x - dir * 8, y: ball.y };

    const [baseX, baseY] = FORMATIONS[player.team][player.index];
    let shiftX = (ball.x - W / 2) * .24;
    let shiftY = (ball.y - H / 2) * .16;
    if (ownBall) shiftX += dir * 55;
    if (owner === player) return { x: player.x + dir * 120, y: lerp(player.y, H / 2, .05) };
    return {
      x: clamp(baseX + shiftX, FIELD.left + 55, FIELD.right - 55),
      y: clamp(baseY + shiftY, FIELD.top + 42, FIELD.bottom - 42)
    };
  }

  function updateAI(player, dt) {
    const target = aiTarget(player);
    player.targetX = target.x;
    player.targetY = target.y;
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const d = Math.hypot(dx, dy);
    const chase = (!ball.owner && distance(player, ball) < 200) || (ball.owner?.team !== player.team && distance(player, ball) < 160);
    player.sprinting = chase;
    if (chase) player.energyCurrent = Math.max(.25, player.energyCurrent - dt * (0.075 - player.enduranceStat * .00045));
    else player.energyCurrent = Math.min(1, player.energyCurrent + dt * (.035 + player.enduranceStat * .00035));
    player.stamina = player.energyCurrent;
    if (d > 5) {
      const dir = normalize(dx, dy);
      const paceFactor = .72 + player.attributes.pace / 250;
      const fatigueFactor = .76 + player.energyCurrent * .24;
      const maxSpeed = (player.keeper ? 185 : chase ? 216 : 177) * paceFactor * fatigueFactor;
      const accel = (player.keeper ? 690 + player.attributes.goalkeeping * 1.1 : 570 + player.attributes.pace * 1.7) * fatigueFactor;
      player.vx += dir.x * accel * dt;
      player.vy += dir.y * accel * dt;
      const speed = length(player.vx, player.vy);
      if (speed > maxSpeed) {
        player.vx = player.vx / speed * maxSpeed;
        player.vy = player.vy / speed * maxSpeed;
      }
      player.facingX = dir.x;
      player.facingY = dir.y;
    }

    if (ball.owner === player) {
      player.hasBallTime += dt;
      const attackGoalX = player.team === 'blue' ? FIELD.right : FIELD.left;
      const goalDistance = Math.abs(attackGoalX - player.x);
      const central = Math.abs(player.y - H / 2) < 190;
      const shootingRange = 245 + player.attributes.shooting * 1.55;
      const chanceQuality = shotOpportunity(player);
      const decision = sampleExecution(player.attributes.vision * .45 + player.attributes.shooting * .25 + chanceQuality, 5, 16, player.attributes.vision).value;
      if (player.actionCooldown <= 0 && goalDistance < shootingRange && central && decision > 72) {
        doShotAI(player);
      } else if (player.actionCooldown <= 0 && (player.hasBallTime > 1.8 - player.attributes.passing * .009 || pressureOn(player) < 85)) {
        const targetMate = bestAIPass(player);
        if (targetMate) doPassAI(player, targetMate);
      }
    }
  }

  function pressureOn(player) {
    let best = Infinity;
    for (const p of players) if (p.team !== player.team) best = Math.min(best, distance(p, player));
    return best;
  }

  function defendersOnSegment(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y, span = Math.hypot(dx, dy) || 1;
    return players.filter(p => p.team !== from.team && !p.keeper).filter(p => {
      const t = clamp(((p.x - from.x) * dx + (p.y - from.y) * dy) / (span * span), 0, 1);
      return Math.hypot(p.x - (from.x + dx * t), p.y - (from.y + dy * t)) < 34 && t > .08 && t < .92;
    }).length;
  }

  function shotOpportunity(player) {
    const goalX = player.team === 'blue' ? FIELD.right : FIELD.left;
    const distanceToGoal = Math.abs(goalX - player.x);
    const angle = 100 - Math.abs(player.y - H / 2) * .42;
    const pressure = Math.max(0, 115 - pressureOn(player));
    const obstruction = defendersOnSegment(player, { x: goalX, y: H / 2 }) * 17;
    const passAdvantage = bestAIPass(player) ? 9 : 0;
    return angle * .32 + Math.max(0, 280 - distanceToGoal) * .22 - pressure * .32 - obstruction - passAdvantage;
  }

  function bestAIPass(player) {
    const dir = TEAM[player.team].direction;
    const candidates = players.filter(p => p.team === player.team && p !== player && !p.keeper);
    let best = null;
    let scoreValue = -Infinity;
    for (const mate of candidates) {
      const forward = (mate.x - player.x) * dir;
      const open = pressureOn(mate);
      const d = distance(player, mate);
      const interceptionRisk = defendersOnSegment(player, mate) * 18;
      const score = player.attributes.vision * .45 + open * .18 + forward * .03 - d * .035 - interceptionRisk + gaussian() * 3;
      if (score > scoreValue) { scoreValue = score; best = mate; }
    }
    return scoreValue > .3 ? best : null;
  }

  function doShotAI(player) {
    const goalX = player.team === 'blue' ? FIELD.right + 25 : FIELD.left - 25;
    const occasion = shotOpportunity(player);
    const quality = sampleExecution(player.attributes.shooting * .65 + player.attributes.technique * .25 + player.attributes.vision * .10 + occasion - fatiguePenalty(player), 7, 31, player.attributes.shooting);
    const inaccuracy = clamp(146 - quality.value, 18, 118);
    const targetY = H / 2 + gaussian() * inaccuracy * .55;
    const shotSpeed = 570 + clamp(quality.value, 20, 115) * 2.7;
    releaseBall(player, goalX - player.x, targetY - player.y, shotSpeed, 'shot', [
      'TIR EN COURS',
      `compétence ${Math.round(player.attributes.shooting)} · difficulté ${Math.round(-occasion)} · opposition ${Math.round(pressureOn(player))} · variance ±${Math.round(quality.variance)}`,
      `puissance ${Math.round(shotSpeed)}`
    ]);
  }

  function doPassAI(player, target) {
    const d = distance(player, target);
    const pressure = Math.max(0, 105 - pressureOn(player));
    const blockers = defendersOnSegment(player, target);
    const execution = sampleExecution(player.attributes.passing * .65 + player.attributes.technique * .25 + player.attributes.vision * .10 - pressure * .25 - d * .055 - fatiguePenalty(player), 5, 29, player.attributes.passing);
    const error = clamp(118 - execution.value + blockers * 13, 5, 92);
    const offsetX = gaussian() * error * .42;
    const offsetY = gaussian() * error * .42;
    const targetX = target.x + target.vx * .18 + offsetX;
    const targetY = target.y + target.vy * .18 + offsetY;
    const passSpeed = 390 + clamp(execution.value, 25, 110) * 1.55;
    releaseBall(player, targetX - player.x, targetY - player.y, passSpeed, 'pass', [
      'PASSE EN COURS',
      `compétence ${player.attributes.passing} · difficulté ${Math.round(d * .055)} · opposition ${blockers} · variance ±${Math.round(execution.variance)}`,
      `vers ${target.name}`
    ]);
  }

  function updatePlayers(dt) {
    for (const p of players) {
      p.actionCooldown = Math.max(0, p.actionCooldown - dt);
      p.tackleCooldown = Math.max(0, p.tackleCooldown - dt);
      p.imbalance = Math.max(0, p.imbalance - dt);
      updateAI(p, dt);

      const damping = Math.pow(.0018, dt);
      p.vx *= damping;
      p.vy *= damping;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const sidePad = p.keeper ? 9 : p.radius;
      p.x = clamp(p.x, FIELD.left + sidePad, FIELD.right - sidePad);
      p.y = clamp(p.y, FIELD.top + p.radius, FIELD.bottom - p.radius);
    }

    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i];
        const b = players[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || .01;
        const min = a.radius + b.radius - 2;
        if (d < min) {
          const overlap = (min - d) * .5;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * overlap; a.y -= ny * overlap;
          b.x += nx * overlap; b.y += ny * overlap;
          a.vx -= nx * 25; a.vy -= ny * 25;
          b.vx += nx * 25; b.vy += ny * 25;

          if (a.team !== b.team && ball.owner && (ball.owner === a || ball.owner === b)) {
            const owner = ball.owner;
            const challenger = owner === a ? b : a;
            const relative = length(challenger.vx - owner.vx, challenger.vy - owner.vy);
            if (challenger.tackleCooldown <= 0) {
              challenger.matchStats.tackles += 1;
              challenger.tackleCooldown = .62;
              const positional = clamp(35 - distance(challenger, owner) + relative * .04, -16, 20);
              const defender = sampleExecution(challenger.attributes.defending * .65 + challenger.attributes.pace * .15 + challenger.attributes.vision * .10 + positional - fatiguePenalty(challenger), 6, 22, challenger.attributes.defending);
              const carrier = sampleExecution(owner.attributes.technique * .55 + owner.attributes.pace * .20 + owner.attributes.vision * .10 + owner.energyCurrent * 10, 6, 22, owner.attributes.technique);
              const successChance = clamp(sigmoid((defender.value - carrier.value) / 15), .12, .82);
              const roll = Math.random();
              const tackleWon = roll < successChance;
              emitDebug(challenger.x, challenger.y - challenger.radius - 8, [
                tackleWon ? 'TACLE RÉUSSI' : 'TACLE ÉCHOUÉ',
                `compétence ${challenger.attributes.defending} · difficulté ${Math.round(-positional)} · opposition ${Math.round(carrier.value)} · variance ±${Math.round(defender.variance)}`,
                `probabilité ${Math.round(successChance * 100)} %`
              ], tackleWon ? '#c7f33c' : '#ff8290', challenger.name);
              if (tackleWon) {
                challenger.matchStats.tacklesWon += 1;
                ball.owner = null;
                ball.assistCandidate = null;
                ball.passFrom = null;
                ball.lastShooter = null;
                const away = normalize(owner.x - challenger.x, owner.y - challenger.y);
                ball.x = owner.x + away.x * 22;
                ball.y = owner.y + away.y * 22;
                ball.vx = away.x * 170 + owner.vx;
                ball.vy = away.y * 170 + owner.vy;
                ball.pickupDelay = .18;
                emitKick(ball.x, ball.y, '#ffffff', 4);
              } else {
                challenger.imbalance = .42;
                challenger.tackleCooldown = 1.05;
                challenger.vx *= .25; challenger.vy *= .25;
              }
            }
          }
        }
      }
    }
  }

  function updateBall(dt) {
    ball.pickupDelay = Math.max(0, ball.pickupDelay - dt);
    if (ball.owner) {
      const p = ball.owner;
      const facing = normalize(p.facingX || TEAM[p.team].direction, p.facingY);
      const speed = length(p.vx, p.vy);
      const bob = Math.sin(elapsed * 14) * Math.min(3, speed / 70);
      const targetX = p.x + facing.x * (p.radius + 9 + bob);
      const targetY = p.y + facing.y * (p.radius + 9 + bob);
      ball.x = lerp(ball.x, targetX, clamp(dt * 18, 0, 1));
      ball.y = lerp(ball.y, targetY, clamp(dt * 18, 0, 1));
      ball.vx = p.vx;
      ball.vy = p.vy;
      if (p.team === 'blue') bluePossession += dt; else redPossession += dt;
      return;
    }

    const speedBefore = length(ball.vx, ball.vy);
    if (speedBefore > 290 && Math.random() < dt * 28) trails.push({ x: ball.x, y: ball.y, life: .18, max: .18 });
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    const drag = Math.pow(.38, dt);
    ball.vx *= drag;
    ball.vy *= drag;
    if (length(ball.vx, ball.vy) < 5) { ball.vx *= .7; ball.vy *= .7; }

    if (ball.y - ball.radius < FIELD.top) {
      ball.y = FIELD.top + ball.radius;
      ball.vy = Math.abs(ball.vy) * .72;
      playTone(115, .025, 'sine', .02);
    }
    if (ball.y + ball.radius > FIELD.bottom) {
      ball.y = FIELD.bottom - ball.radius;
      ball.vy = -Math.abs(ball.vy) * .72;
      playTone(115, .025, 'sine', .02);
    }

    const inGoalMouth = ball.y > GOAL.top + 4 && ball.y < GOAL.bottom - 4;
    if (!inGoalMouth) {
      if (ball.x - ball.radius < FIELD.left) {
        ball.x = FIELD.left + ball.radius;
        ball.vx = Math.abs(ball.vx) * .72;
      }
      if (ball.x + ball.radius > FIELD.right) {
        ball.x = FIELD.right - ball.radius;
        ball.vx = -Math.abs(ball.vx) * .72;
      }
    }

    collidePost(FIELD.left, GOAL.top);
    collidePost(FIELD.left, GOAL.bottom);
    collidePost(FIELD.right, GOAL.top);
    collidePost(FIELD.right, GOAL.bottom);

    if (inGoalMouth && ball.x < FIELD.left - GOAL.depth * .55) scoreGoal('red');
    if (inGoalMouth && ball.x > FIELD.right + GOAL.depth * .55) scoreGoal('blue');

    if (ball.x < FIELD.left - GOAL.depth) { ball.x = FIELD.left - GOAL.depth; ball.vx = Math.abs(ball.vx) * .2; }
    if (ball.x > FIELD.right + GOAL.depth) { ball.x = FIELD.right + GOAL.depth; ball.vx = -Math.abs(ball.vx) * .2; }

    if (ball.pickupDelay <= 0) {
      const candidates = players.slice().sort((a, b) => distance(a, ball) - distance(b, ball));
      for (const p of candidates) {
        const pickupRange = p.radius + (p.keeper ? 7 + p.attributes.goalkeeping * .11 : 10);
        const controlLimit = p.keeper ? 530 + p.attributes.goalkeeping * 3 : 400 + p.attributes.passing * .8;
        if (distance(p, ball) < pickupRange && length(ball.vx, ball.vy) < controlLimit) {
          takeBall(p);
          break;
        }
      }
    }
  }

  function collidePost(x, y) {
    const dx = ball.x - x;
    const dy = ball.y - y;
    const d = Math.hypot(dx, dy) || 1;
    const min = ball.radius + 5;
    if (d < min) {
      const nx = dx / d;
      const ny = dy / d;
      ball.x = x + nx * min;
      ball.y = y + ny * min;
      const dot = ball.vx * nx + ball.vy * ny;
      ball.vx -= 1.72 * dot * nx;
      ball.vy -= 1.72 * dot * ny;
      shake = 5;
      emitKick(x, y, '#ffffff', 12);
      playTone(410, .08, 'square', .06);
    }
  }

  function scoreGoal(team) {
    if (freezeTime > 0 || pendingKickoffTeam) return;
    score[team] += 1;
    const scorer = ball.lastShooter?.team === team ? ball.lastShooter : null;
    const assister = scorer && ball.assistCandidate?.team === team && ball.assistCandidate !== scorer ? ball.assistCandidate : null;
    if (scorer) scorer.matchStats.goals += 1;
    if (assister) assister.matchStats.assists += 1;
    if (scorer) emitDebug(ball.x, ball.y - 22, ['TIR RÉUSSI — BUT', `tir ${scorer.attributes.shooting} · score ${score.blue} — ${score.red}`], TEAM[team].light, scorer.name);
    freezeTime = 2.5;
    pendingKickoffTeam = team === 'blue' ? 'red' : 'blue';
    ball.vx *= .1;
    ball.vy *= .1;
    shake = 9;
    emitGoal(ball.x, ball.y, TEAM[team].main);
    showBanner('BUUUUT !', `${scorer ? scorer.name : TEAM[team].name} marque — ${score.blue} : ${score.red}`, 2.25);
    playGoalSound();
    updateUI();
    if (!ui.statsPanel.hidden) renderStatsPanel();
  }

  function emitKick(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 35 + Math.random() * 80;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .28 + Math.random() * .2, max: .48, color, size: 1 + Math.random() * 3 });
    }
  }

  function emitGoal(x, y, color) {
    for (let i = 0; i < 70; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 270;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .7 + Math.random() * .8, max: 1.5, color: i % 3 ? color : '#ffffff', size: 2 + Math.random() * 5 });
    }
  }

  function updateEffects(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(.2, dt);
      p.vy *= Math.pow(.2, dt);
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = trails.length - 1; i >= 0; i--) {
      trails[i].life -= dt;
      if (trails[i].life <= 0) trails.splice(i, 1);
    }
    for (let i = debugFloats.length - 1; i >= 0; i--) {
      const float = debugFloats[i];
      float.life -= dt;
      float.y -= dt * 24;
      if (float.life <= 0) debugFloats.splice(i, 1);
    }
  }

  function emitDebug(x, y, lines, color, actor = 'SYSTÈME') {
    if (!debugEnabled) return;
    debugFloats.push({ x, y, lines, color, life: 1.35, max: 1.35 });
    if (debugFloats.length > 18) debugFloats.shift();
    debugLogEntries.unshift({ actor, lines, color, time: matchTime });
    if (debugLogEntries.length > 7) debugLogEntries.pop();
    renderDebugLog();
  }

  function renderDebugLog() {
    if (!ui.debugLog) return;
    if (!debugLogEntries.length) {
      ui.debugLog.innerHTML = '<p>En attente d\'une action…</p>';
      return;
    }
    ui.debugLog.innerHTML = debugLogEntries.map(entry => {
      const seconds = Math.max(0, Math.ceil(entry.time));
      const stamp = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
      return `<div class="debug-entry" style="--debug-color:${entry.color}"><time>${stamp}</time><strong>${entry.actor}</strong> — ${entry.lines.join(' · ')}</div>`;
    }).join('');
  }

  function update(dt) {
    if (paused || ended) return;
    elapsed += dt;
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) ui.event.classList.remove('show');
    }
    updateEffects(dt);
    shake = Math.max(0, shake - dt * 15);
    if (freezeTime > 0) {
      freezeTime -= dt;
      if (freezeTime <= 0 && pendingKickoffTeam && !ended) {
        const kickoffTeam = pendingKickoffTeam;
        pendingKickoffTeam = null;
        setupKickoff(kickoffTeam);
      }
      return;
    }

    matchTime = Math.max(0, matchTime - dt);
    if (matchTime <= 0) {
      endMatch();
      return;
    }
    updatePlayers(dt);
    updateBall(dt);
    updateUI();
    pressed.clear();
  }

  function endMatch() {
    ended = true;
    charging = false;
    ui.powerWrap.classList.remove('active');
    const winner = score.blue === score.red ? 'Match nul' : score.blue > score.red ? 'Victoire Azur' : 'Victoire Carmin';
    ui.endTitle.textContent = winner;
    ui.endScore.textContent = `Azur ${score.blue} — ${score.red} Carmin`;
    ui.end.hidden = false;
    ui.state.textContent = 'TERMINÉ';
    ui.liveAction.textContent = 'Coup de sifflet final';
    playGoalSound();
  }

  function updateUI() {
    ui.scoreBlue.textContent = score.blue;
    ui.scoreRed.textContent = score.red;
    const seconds = Math.ceil(matchTime);
    ui.clock.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    if (paused) ui.liveAction.textContent = 'Simulation en pause';
    else if (ball.owner) ui.liveAction.textContent = `${ball.owner.name} mène le jeu pour ${TEAM[ball.owner.team].name}`;
    else ui.liveAction.textContent = 'Ballon libre — duel en cours';
    ui.shotsText.textContent = `${stats.blue.shots} — ${stats.red.shots}`;
    ui.passesText.textContent = `${stats.blue.passes} — ${stats.red.passes}`;
    const total = bluePossession + redPossession;
    const bluePct = total ? Math.round(bluePossession / total * 100) : 50;
    ui.possessionBlue.style.width = `${bluePct}%`;
    ui.possessionText.textContent = `${bluePct} — ${100 - bluePct}`;
    ui.powerWrap.classList.toggle('active', charging);
    ui.powerWrap.setAttribute('aria-hidden', String(!charging));
    ui.powerFill.style.width = `${shotCharge * 100}%`;
    if (!ui.statsPanel.hidden && performance.now() - lastStatsRender > 300) renderStatsPanel();
  }

  function playerRating(player) {
    const s = player.matchStats;
    const missedPasses = s.passesAttempted - s.passesCompleted;
    const lostTackles = s.tackles - s.tacklesWon;
    const rating = 6 + s.goals * 1.05 + s.assists * .62 + s.saves * .16 + s.tacklesWon * .13 + s.passesCompleted * .018 - missedPasses * .025 - lostTackles * .035 - s.shotsOffTarget * .035 - s.losses * .045 - s.failedControls * .04;
    return clamp(rating, 5, 10).toFixed(1);
  }

  // Mode sans rendu, utilisable depuis la console : runBalanceSimulation(500).
  // Il est volontairement léger : il sert à comparer l'effet relatif des niveaux avant de régler le jeu affiché.
  window.runBalanceSimulation = function runBalanceSimulation(matches = 500, levelA = 55, levelB = 55) {
    const totals = { matches: 0, goals: 0, shots: 0, onTarget: 0, passes: 0, completed: 0, tackles: 0, tacklesWon: 0, saves: 0, losses: 0, favoriteWins: 0, draws: 0, underdogWins: 0 };
    for (let m = 0; m < Math.max(500, matches); m++) {
      let a = 0, b = 0;
      for (const [attack, defend, side] of [[levelA, levelB, 'a'], [levelB, levelA, 'b']]) {
        const attacks = Math.round(10 + gaussian() * 2.5);
        for (let i = 0; i < attacks; i++) {
          const finish = sampleExecution(attack * .72 - defend * .22 + 17, 8, 28, attack);
          totals.shots++; totals.passes += 3;
          totals.completed += clamp(Math.round(1.3 + sampleExecution(attack * .025, .08, .35, attack).value), 0, 3);
          totals.tackles++; totals.tacklesWon += sigmoid((defend - attack) / 16) > Math.random() ? 1 : 0;
          totals.losses += Math.random() < .16 ? 1 : 0;
          if (finish.value > 53) { totals.onTarget++; if (finish.value > 73 + gaussian() * 7) { side === 'a' ? a++ : b++; } else totals.saves++; }
        }
      }
      totals.matches++; totals.goals += a + b;
      if (a === b) totals.draws++; else if ((levelA >= levelB && a > b) || (levelB > levelA && b > a)) totals.favoriteWins++; else totals.underdogWins++;
    }
    const rate = value => +(value / totals.matches).toFixed(2);
    const report = { levels: { a: levelA, b: levelB }, matches: totals.matches, goalsPerMatch: rate(totals.goals), shotsPerMatch: rate(totals.shots), shotsOnTargetPerMatch: rate(totals.onTarget), passSuccessRate: +(totals.completed / totals.passes * 100).toFixed(1), tackleSuccessRate: +(totals.tacklesWon / totals.tackles * 100).toFixed(1), savesPerMatch: rate(totals.saves), lossesPerMatch: rate(totals.losses), favoriteWinRate: +(totals.favoriteWins / totals.matches * 100).toFixed(1), drawRate: +(totals.draws / totals.matches * 100).toFixed(1), underdogWinRate: +(totals.underdogWins / totals.matches * 100).toFixed(1) };
    console.table(report); return report;
  };
  window.runBalanceSuite = function runBalanceSuite(matches = 500) {
    return {
      faibleVsMoyen: window.runBalanceSimulation(matches, 42, 60),
      moyenVsMoyen: window.runBalanceSimulation(matches, 60, 60),
      fortVsMoyen: window.runBalanceSimulation(matches, 78, 60)
    };
  };

  function renderStatsPanel() {
    if (!players.length) return;
    lastStatsRender = performance.now();
    statsSelectedPlayer ||= players.find(p => p.team === 'blue' && p.index === 3) || players[0];
    const total = bluePossession + redPossession;
    const bluePct = total ? Math.round(bluePossession / total * 100) : 50;
    ui.panelScore.textContent = `${score.blue} — ${score.red}`;
    ui.panelPossession.textContent = `${bluePct} — ${100 - bluePct}`;
    ui.panelShots.textContent = `${stats.blue.shots} — ${stats.red.shots}`;

    const player = statsSelectedPlayer;
    const s = player.matchStats;
    const attributeLabels = {
      pace: 'VITESSE', passing: 'PASSE', technique: 'TECHNIQUE', vision: 'VISION', shooting: 'TIR',
      defending: 'DÉFENSE', goalkeeping: 'GARDIEN', endurance: 'ENDURANCE'
    };
    const attributes = Object.entries(player.attributes)
      .filter(([key]) => !player.keeper || key !== 'shooting')
      .map(([key, value]) => `<div class="attribute-row"><span>${attributeLabels[key]}</span><b>${value}</b><i style="--value:${value}%"></i></div>`)
      .join('');
    const matchLine = `${s.goals} but${s.goals !== 1 ? 's' : ''} · ${s.shotsOnTarget}/${s.shots} cadrés · ${s.shotsOffTarget} non cadré${s.shotsOffTarget !== 1 ? 's' : ''} · ${s.shotsBlocked} bloqué${s.shotsBlocked !== 1 ? 's' : ''} · ${s.passesCompleted}/${s.passesAttempted} passes · ${s.tacklesWon}/${s.tackles} tacles · ${s.losses} pertes · ${s.interceptions} interceptions · ${s.failedControls} contrôles ratés${player.keeper ? ` · ${s.saves} arrêt${s.saves !== 1 ? 's' : ''} (${s.savesParried} repoussée${s.savesParried !== 1 ? 's' : ''})` : ''}`;
    ui.playerDetail.innerHTML = `
      <div class="player-detail-head">
        <span class="detail-number" style="background:${TEAM[player.team].main}">${player.number}</span>
        <div><h3>${player.name}</h3><p>${player.position} · ${TEAM[player.team].name}</p></div>
        <div class="match-rating"><small>NOTE</small><strong>${playerRating(player)}</strong></div>
      </div>
      <p class="player-match-line">${matchLine}</p>
      <div class="attribute-grid">${attributes}</div>`;

    ui.teamTables.innerHTML = ['blue', 'red'].map(team => {
      const rows = players.filter(p => p.team === team).map(p => {
        const ps = p.matchStats;
        const key = `${p.team}-${p.index}`;
        const active = p === statsSelectedPlayer ? ' active' : '';
        return `<tr>
          <td><button class="player-select${active}" type="button" data-player-key="${key}">${p.number}. ${p.name}</button></td>
          <td><span class="rating-pill">${playerRating(p)}</span></td><td>${ps.goals}</td><td>${ps.assists}</td><td>${ps.shots}</td>
          <td>${ps.passesCompleted}/${ps.passesAttempted}</td><td>${ps.tacklesWon}/${ps.tackles}</td><td>${ps.saves}</td>
        </tr>`;
      }).join('');
      return `<section class="team-table-wrap">
        <h3 class="team-table-title"><i style="background:${TEAM[team].main}"></i>${TEAM[team].name}</h3>
        <table class="player-table"><thead><tr><th>Joueur</th><th>Note</th><th>B</th><th>PD</th><th>T</th><th>Passes</th><th>Tcl</th><th>Arr</th></tr></thead><tbody>${rows}</tbody></table>
      </section>`;
    }).join('');
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
    drawStadium();
    drawPitch();
    drawGoals();
    drawTrails();
    const ordered = players.slice().sort((a, b) => a.y - b.y);
    ordered.forEach(drawPlayerShadow);
    particles.forEach(drawParticle);
    ordered.forEach(drawPlayer);
    debugFloats.forEach(drawDebugFloat);
    drawBall();
    ctx.restore();
  }

  function drawStadium() {
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, '#07110e');
    gradient.addColorStop(.5, '#10231d');
    gradient.addColorStop(1, '#07110e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
    crowdDots.forEach(dot => {
      ctx.fillStyle = `rgba(207,240,227,${dot.a})`;
      ctx.fillRect(dot.x, dot.y, 2.4, 2.4);
    });
    ctx.fillStyle = 'rgba(199,243,60,.65)';
    for (let x = 75; x < W; x += 175) {
      ctx.fillRect(x, 48, 70, 2);
      ctx.fillRect(x + 40, 669, 70, 2);
    }
  }

  function drawPitch() {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.5)';
    ctx.shadowBlur = 28;
    ctx.fillStyle = '#17643d';
    ctx.fillRect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top);
    ctx.shadowBlur = 0;
    const stripeWidth = (FIELD.right - FIELD.left) / 10;
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.035)';
      ctx.fillRect(FIELD.left + i * stripeWidth, FIELD.top, stripeWidth, FIELD.bottom - FIELD.top);
    }
    const vignette = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, 700);
    vignette.addColorStop(0, 'rgba(55,154,93,.12)');
    vignette.addColorStop(1, 'rgba(0,18,10,.22)');
    ctx.fillStyle = vignette;
    ctx.fillRect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top);

    ctx.strokeStyle = 'rgba(227,255,239,.72)';
    ctx.lineWidth = 3;
    ctx.strokeRect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top);
    ctx.beginPath(); ctx.moveTo(W / 2, FIELD.top); ctx.lineTo(W / 2, FIELD.bottom); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 78, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(227,255,239,.85)';
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 4, 0, Math.PI * 2); ctx.fill();

    drawPenaltyBox(FIELD.left, 1);
    drawPenaltyBox(FIELD.right, -1);
    drawCorners();
    ctx.restore();
  }

  function drawPenaltyBox(x, direction) {
    const width = 170;
    const y = 218;
    const h = 284;
    ctx.strokeRect(direction > 0 ? x : x - width, y, width, h);
    const smallWidth = 66;
    ctx.strokeRect(direction > 0 ? x : x - smallWidth, GOAL.top - 36, smallWidth, (GOAL.bottom - GOAL.top) + 72);
    ctx.fillStyle = 'rgba(227,255,239,.85)';
    ctx.beginPath(); ctx.arc(x + direction * 120, H / 2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    const start = direction > 0 ? -1.02 : Math.PI - 1.02;
    const end = direction > 0 ? 1.02 : Math.PI + 1.02;
    ctx.arc(x + direction * 120, H / 2, 77, start, end);
    ctx.stroke();
  }

  function drawCorners() {
    const r = 18;
    const corners = [
      [FIELD.left, FIELD.top, 0, Math.PI / 2],
      [FIELD.right, FIELD.top, Math.PI / 2, Math.PI],
      [FIELD.left, FIELD.bottom, -Math.PI / 2, 0],
      [FIELD.right, FIELD.bottom, Math.PI, Math.PI * 1.5]
    ];
    corners.forEach(([x, y, a, b]) => { ctx.beginPath(); ctx.arc(x, y, r, a, b); ctx.stroke(); });
  }

  function drawGoals() {
    drawGoal(FIELD.left, -1);
    drawGoal(FIELD.right, 1);
  }

  function drawGoal(x, direction) {
    const back = x + direction * GOAL.depth;
    ctx.save();
    ctx.fillStyle = 'rgba(225,240,235,.055)';
    ctx.fillRect(Math.min(x, back), GOAL.top, GOAL.depth, GOAL.bottom - GOAL.top);
    ctx.strokeStyle = 'rgba(235,250,245,.35)';
    ctx.lineWidth = 1;
    for (let gy = GOAL.top; gy <= GOAL.bottom; gy += 15) {
      ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(back, gy); ctx.stroke();
    }
    for (let gx = Math.min(x, back); gx <= Math.max(x, back); gx += 11) {
      ctx.beginPath(); ctx.moveTo(gx, GOAL.top); ctx.lineTo(gx, GOAL.bottom); ctx.stroke();
    }
    ctx.strokeStyle = '#f1f7f4';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, GOAL.top); ctx.lineTo(back, GOAL.top); ctx.lineTo(back, GOAL.bottom); ctx.lineTo(x, GOAL.bottom);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayerShadow(p) {
    ctx.save();
    ctx.translate(p.x + 5, p.y + 9);
    ctx.scale(1, .45);
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.arc(0, 0, p.radius + 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawPlayer(p) {
    const colors = TEAM[p.team];
    const angle = Math.atan2(p.facingY, p.facingX);
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p === selected) {
      ctx.strokeStyle = '#d9ff5a';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, p.radius + 8 + Math.sin(elapsed * 5) * 1.5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#d9ff5a';
      ctx.beginPath(); ctx.moveTo(-6, -p.radius - 16); ctx.lineTo(6, -p.radius - 16); ctx.lineTo(0, -p.radius - 8); ctx.closePath(); ctx.fill();
    }
    ctx.rotate(angle);
    const bodyGradient = ctx.createRadialGradient(-6, -7, 2, 2, 3, p.radius + 6);
    bodyGradient.addColorStop(0, colors.light);
    bodyGradient.addColorStop(.55, p.keeper ? '#f3c84b' : colors.main);
    bodyGradient.addColorStop(1, p.keeper ? '#9c6d00' : colors.dark);
    ctx.fillStyle = bodyGradient;
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, p.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = p.keeper ? '#332a0a' : '#fff';
    ctx.font = `800 ${p.keeper ? 13 : 12}px Barlow Condensed`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.rotate(-angle);
    ctx.fillText(String(p.number), 0, 1);
    ctx.restore();

    ctx.save();
    ctx.font = '700 10px Barlow Condensed';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(241,250,247,.88)';
    ctx.fillText(p.name, p.x, p.y + p.radius + 17);
    if (p === selected) {
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillRect(p.x - 20, p.y + p.radius + 21, 40, 3);
      ctx.fillStyle = p.stamina > .25 ? '#c7f33c' : '#ffb53d';
      ctx.fillRect(p.x - 20, p.y + p.radius + 21, 40 * p.stamina, 3);
    }
    ctx.restore();
  }

  function drawBall() {
    ctx.save();
    ctx.translate(ball.x + 4, ball.y + 6);
    ctx.scale(1, .48);
    ctx.fillStyle = 'rgba(0,0,0,.34)';
    ctx.beginPath(); ctx.arc(0, 0, ball.radius + 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(ball.x, ball.y);
    const spin = elapsed * (length(ball.vx, ball.vy) / 35 + 1);
    ctx.rotate(spin);
    ctx.fillStyle = '#f7fbf9';
    ctx.strokeStyle = 'rgba(0,0,0,.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, ball.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1b2723';
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5 - Math.PI / 2;
      ctx.beginPath(); ctx.arc(Math.cos(a) * 4.6, Math.sin(a) * 4.6, 1.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawTrails() {
    trails.forEach(t => {
      ctx.fillStyle = `rgba(255,255,255,${t.life / t.max * .22})`;
      ctx.beginPath(); ctx.arc(t.x, t.y, ball.radius * (t.life / t.max), 0, Math.PI * 2); ctx.fill();
    });
  }

  function drawParticle(p) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    ctx.globalAlpha = 1;
  }

  function drawDebugFloat(float) {
    const alpha = clamp(float.life / float.max, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 11px Barlow Condensed';
    float.lines.forEach((line, index) => {
      const y = float.y - index * 13;
      const width = ctx.measureText(line).width + 10;
      ctx.fillStyle = 'rgba(3,13,10,.8)';
      ctx.fillRect(float.x - width / 2, y - 6, width, 12);
      ctx.fillStyle = index === float.lines.length - 1 ? float.color : '#f0faf6';
      ctx.fillText(line, float.x, y + .5);
    });
    ctx.restore();
  }

  function playTone(freq, duration, type = 'sine', volume = .04) {
    if (!soundEnabled) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
      osc.connect(gain).connect(audioContext.destination);
      osc.start();
      osc.stop(audioContext.currentTime + duration);
    } catch (_) { /* Le jeu reste jouable sans Web Audio. */ }
  }

  function playGoalSound() {
    [220, 330, 440, 660].forEach((freq, i) => window.setTimeout(() => playTone(freq, .18, 'sawtooth', .035), i * 90));
  }

  function togglePause(force) {
    if (ended) return;
    paused = typeof force === 'boolean' ? force : !paused;
    ui.pause.hidden = !paused;
    ui.pauseButton.textContent = paused ? '▶' : 'Ⅱ';
    ui.pauseButton.setAttribute('aria-label', paused ? 'Reprendre le match' : 'Mettre en pause');
    ui.state.textContent = paused ? 'PAUSE' : 'SIMULATION IA';
    updateUI();
  }

  function frame(now) {
    const dt = Math.min((now - lastTime) / 1000, .033);
    lastTime = now;
    const scaledDt = dt * simulationSpeed;
    const steps = Math.max(1, Math.ceil(scaledDt / .018));
    for (let i = 0; i < steps; i++) update(scaledDt / steps);
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener('keydown', event => {
    if (event.code === 'Escape' && !ui.statsPanel.hidden) {
      ui.statsPanel.hidden = true;
      ui.statsButton.setAttribute('aria-expanded', 'false');
    } else if (event.code === 'Escape' || event.code === 'KeyP') togglePause();
  });
  window.addEventListener('blur', () => { if (!ended) togglePause(true); });

  ui.pauseButton.addEventListener('click', () => togglePause());
  document.getElementById('resumeButton').addEventListener('click', () => togglePause(false));
  document.getElementById('restartButton').addEventListener('click', resetMatch);
  document.getElementById('playAgainButton').addEventListener('click', resetMatch);
  ui.sound.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    ui.sound.textContent = soundEnabled ? '♪' : '×';
    ui.sound.setAttribute('aria-label', soundEnabled ? 'Couper le son' : 'Activer le son');
  });
  ui.speed.addEventListener('click', () => {
    simulationSpeed = simulationSpeed === 1 ? 2 : simulationSpeed === 2 ? 4 : 1;
    ui.speed.textContent = `×${simulationSpeed}`;
    ui.speed.setAttribute('aria-label', `Vitesse de simulation multipliée par ${simulationSpeed}`);
  });
  ui.debug.addEventListener('click', () => {
    debugEnabled = !debugEnabled;
    if (!debugEnabled) debugFloats.length = 0;
    ui.debugFeed.hidden = !debugEnabled;
    ui.debug.setAttribute('aria-pressed', String(debugEnabled));
    ui.debug.setAttribute('aria-label', debugEnabled ? 'Masquer les valeurs de débogage' : 'Afficher les valeurs de débogage');
  });
  ui.statsButton.addEventListener('click', () => {
    const willOpen = ui.statsPanel.hidden;
    ui.statsPanel.hidden = !willOpen;
    ui.statsButton.setAttribute('aria-expanded', String(willOpen));
    if (willOpen) renderStatsPanel();
  });
  ui.closeStatsButton.addEventListener('click', () => {
    ui.statsPanel.hidden = true;
    ui.statsButton.setAttribute('aria-expanded', 'false');
  });
  ui.statsPanel.addEventListener('click', event => {
    if (event.target === ui.statsPanel) {
      ui.statsPanel.hidden = true;
      ui.statsButton.setAttribute('aria-expanded', 'false');
    }
  });
  ui.teamTables.addEventListener('click', event => {
    const button = event.target.closest('[data-player-key]');
    if (!button) return;
    const [team, index] = button.dataset.playerKey.split('-');
    statsSelectedPlayer = players.find(p => p.team === team && p.index === Number(index)) || statsSelectedPlayer;
    renderStatsPanel();
  });

  resetMatch();
  requestAnimationFrame(frame);
})();
