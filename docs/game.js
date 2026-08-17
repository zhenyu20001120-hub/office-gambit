/* =====================================================================
 * 《职场营销博弈》Office Marketing Gambit —— 浏览器版引擎与 UI
 * ---------------------------------------------------------------------
 * 纯原生 JS（无框架 / 无 CDN）。忠实移植：
 *   src/state.py      -> Actor / GameState / clamp
 *   src/cards_data.py -> 抽牌算法（轮盘赌 + 类内加权 + 局势匹配）
 *   src/ai.py         -> 启发式 AI（效用函数 + belief/trust 更新）
 *   src/engine.py     -> 12 天六阶段主循环 / 联席会议 / 终局判定
 *   src/ui_app.py     -> 屏幕流参考（此处用原生 DOM 异步重建）
 *
 * 数据来自同目录 <script src> 引入的：
 *   tuning.js  (const TUNING)   由 config/tuning.json 生成
 *   cards.js   (const CARDS / const CARD_META) 由 design/cards/cards.json 归一化生成
 *
 * 引擎函数全部 async，以便浏览器端用 Promise 等待玩家输入；
 * 无头（RandomController）模式下控制器返回普通值，await 同样可用。
 * ===================================================================== */

/* ============================ 1. 常量 ============================ */
const FACTIONS = ["FV_A", "FV_B", "FV_C", "FV_D"];
const TIERS = ["employee", "mid", "senior"];
const FIDX = { FV_A: 0, FV_B: 1, FV_C: 2, FV_D: 3 };
const TIER_LABEL = { employee: "员工", mid: "中层", senior: "高层" };

const PHASES = ["morning", "day_cards", "noon_talk", "night", "settle", "assembly"];
const PHASE_LABELS = {
  morning: "晨会", day_cards: "白天·情况牌", noon_talk: "午间密谈",
  night: "夜间行动", settle: "日结", assembly: "联席会议",
};

const CATEGORY_ICONS = {
  "背锅": "🪨", "站队": "🚩", "竞品": "⚔️", "绩效": "📊", "汇报": "📋",
  "团建": "🍻", "反腐": "🔍", "晋升": "📈", "客户": "🤝", "舆情": "📣",
  "加班": "🌙", "会议": "🗓️",
};
const CATEGORY_ORDER = ["背锅", "站队", "竞品", "绩效", "汇报", "团建",
  "反腐", "晋升", "客户", "舆情", "加班", "会议"];

const _CONFLICT_ARCH = new Set(["betray", "expose", "leak", "risk"]);
const _STABLE_ARCH = new Set(["invest", "cashin", "shield", "ally"]);
const _RATING_TITLES = {
  S: "《新任大区总的第一杯茶》",
  A: "《赢了公司，输了自己》",
  "A-": "《功成，然后住院》",
  B: "《活着就是胜利》",
  "B-": "《你的名字留在了功劳簿上》",
  C: "《我拿到了钱，公司没了》",
  D: "《优化名单第一行》",
};

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥"];

// 派生常量（与 engine.py 中 D = TUNING["DERIVED"] 等价）
const DERIVED = TUNING.DERIVED;

/* ============================ 2. 工具函数 ============================ */
function clamp(v, lo, hi) {
  v = Number(v);
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}
function range(n) { const a = []; for (let i = 0; i < n; i++) a.push(i); return a; }
function factionAlias(f) { return (TUNING.FACTIONS[f] || {}).alias || f; }
function factionColor(f) { return (TUNING.FACTIONS[f] || {}).color || "#888888"; }
function factionGoal(f) { return (TUNING.FACTIONS[f] || {}).goal || ""; }
function diff(name) {
  const d = TUNING.DIFFICULTY;
  return d[name] || d.medium || d.easy || Object.values(d)[0];
}
function choiceSummary(ch) {
  const pl = ch.player;
  const parts = [];
  if (pl.influence) parts.push(`声望${pl.influence >= 0 ? "+" : ""}${pl.influence}`);
  if (pl.stress) parts.push(`压力${pl.stress >= 0 ? "+" : ""}${pl.stress}`);
  if (pl.cash) parts.push(`预算${pl.cash >= 0 ? "+" : ""}${pl.cash}`);
  return parts.length ? parts.join(" ") : "无变化";
}

/* ============================ 3. 随机数（MT19937，对齐 CPython random） ============================ */
class RNG {
  constructor(seed) { this.mt = new Array(624); this.gaussNext = null; this.seed(seed); }
  seed(seed) {
    if (seed === null || seed === undefined) seed = (Date.now() >>> 0) ^ Math.floor(Math.random() * 0xffffffff);
    const s = seed >>> 0;
    this.mt[0] = s >>> 0;
    for (let i = 1; i < 624; i++) {
      const prev = this.mt[i - 1];
      const big = (BigInt(1812433253) * BigInt(prev ^ (prev >>> 30)) + BigInt(i)) & 0xFFFFFFFFn;
      this.mt[i] = Number(big);
    }
    this.index = 624;
    this.gaussNext = null;
  }
  _gen() {
    const N = 624, M = 397, UPPER = 0x80000000, LOWER = 0x7fffffff;
    const mag01 = [0, 0x9908b0df];
    if (this.index >= N) {
      for (let i = 0; i < N - M; i++) {
        const y = (this.mt[i] & UPPER) | (this.mt[i + 1] & LOWER);
        this.mt[i] = ((this.mt[i + M] ^ (y >>> 1)) ^ mag01[y & 1]) >>> 0;
      }
      for (let i = N - M; i < N - 1; i++) {
        const y = (this.mt[i] & UPPER) | (this.mt[i + 1] & LOWER);
        this.mt[i] = ((this.mt[i + (M - N)] ^ (y >>> 1)) ^ mag01[y & 1]) >>> 0;
      }
      const y = (this.mt[N - 1] & UPPER) | (this.mt[0] & LOWER);
      this.mt[N - 1] = ((this.mt[M - 1] ^ (y >>> 1)) ^ mag01[y & 1]) >>> 0;
      this.index = 0;
    }
    let y = this.mt[this.index++];
    y ^= (y >>> 11);
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= (y >>> 18);
    return y >>> 0;
  }
  random() {
    const a = this._gen() >>> 5;
    const b = this._gen() >>> 6;
    return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0);
  }
  uniform(a, b) { return a + (b - a) * this.random(); }
  randrange(n) { return Math.floor(this.random() * n); }
  choice(seq) { return seq[this.randrange(seq.length)]; }
  shuffle(seq) {
    for (let i = seq.length - 1; i > 0; i--) {
      const j = this.randrange(i + 1);
      const t = seq[i]; seq[i] = seq[j]; seq[j] = t;
    }
    return seq;
  }
  gauss(mu, sigma) {
    if (this.gaussNext !== null) {
      const z = this.gaussNext; this.gaussNext = null;
      return mu + z * sigma;
    }
    let x1, x2, r2;
    do {
      x1 = this.random() * 2 - 1;
      x2 = this.random() * 2 - 1;
      r2 = x1 * x1 + x2 * x2;
    } while (r2 >= 1.0 || r2 === 0.0);
    const f = Math.sqrt(-2.0 * Math.log(r2) / r2);
    const z0 = x1 * f, z1 = x2 * f;
    this.gaussNext = z1;
    return mu + z0 * sigma;
  }
}

/* ============================ 4. 状态：Actor / GameState ============================ */
class Actor {
  constructor(idx, name, opts = {}) {
    this.idx = idx;
    this.name = name;
    this.isPlayer = !!opts.isPlayer;
    this.tier = opts.tier || "employee";
    this.faction = opts.faction || "FV_A";
    this.personality = opts.personality || {};
    this.influence = 25.0;
    this.stress = 10.0;
    this.cash = 20.0;
    this.alive = true;
    this.outDay = null;
    this.outCause = null;
    this.trust = {};       // idx -> [-100,100]，本角色对他人信任
    this.belief = {};      // idx -> [p_FV_A, p_FV_B, p_FV_C, p_FV_D]
    this.betrayals = 0;
    this.actions = 0;
    this.influenceZeroDays = 0;
    this.motivation = "";
    this.revealed = false;
    this.abilityCd = {};
  }
  get factionAlias() { return factionAlias(this.faction); }
  voteWeight() { return TUNING.TIER_MODS[this.tier].vote_weight; }
}

class GameState {
  constructor(rng, difficulty = "medium", numActors = 9) {
    this.rng = rng;
    this.difficulty = difficulty;
    this.numActors = numActors;
    this.actors = [];
    this.day = 1;
    this.phase = "morning";
    this.factionTrust = { FV_A: 0, FV_B: 0, FV_C: 0, FV_D: 0 };
    this.chaos = 0.0;
    this.clients = [];
    this.log = [];
    this.usedCards = new Set();
    this.assembly = { accused: null, deflect: false, bribes: 0, playerBribed: [], defend: false };
    this.result = null;
    this.observer = false;
    this.endedEarly = false;
    this.clientsTaken = { FV_A: 0, FV_B: 0, FV_C: 0, FV_D: 0 };
    this.clientsLost = { FV_A: 0, FV_B: 0, FV_C: 0, FV_D: 0 };
    this._diff = diff(difficulty);
  }
  clampActor(a) {
    const r = TUNING.RESOURCES;
    a.influence = clamp(a.influence, r.influence.min, r.influence.max);
    a.stress = clamp(a.stress, r.stress.min, r.stress.max);
    a.cash = clamp(a.cash, r.cash.min, r.cash.max);
  }
  aliveActors() { return this.actors.filter((a) => a.alive); }
  player() { return this.actors[0]; }
  factionMembers(fkey, aliveOnly = true) {
    return this.actors.filter((a) => a.faction === fkey && (a.alive || !aliveOnly));
  }
  powerScore(fkey) {
    const tw = TUNING.TIER_WEIGHT_FOR_POWER;
    let score = 0.0, seats = 0;
    for (const a of this.actors) {
      if (a.faction === fkey && a.alive) {
        score += a.influence * (tw[a.tier] || 1.0);
        if (a.tier === "senior") seats += 1;
      }
    }
    return score + 10.0 * seats;
  }
  logMsg(m) { this.log.push(m); }
  ensureBelief(i, j) { if (!i.belief[j.idx]) i.belief[j.idx] = [0.25, 0.25, 0.25, 0.25]; }
  ensureTrust(i, j) { if (i.trust[j.idx] === undefined) i.trust[j.idx] = 0.0; }
  rivalFaction(a) {
    let best = null, bestv = -1e9;
    for (const f of FACTIONS) {
      if (f === a.faction) continue;
      const v = this.factionTrust[f] || 0;
      if (v > bestv) { bestv = v; best = f; }
    }
    return best || "FV_B";
  }
}

/* ============================ 5. 世界初始化 ============================ */
function tierDistribution(n) {
  const senior = 2;
  const mid = Math.max(2, Math.round(0.34 * n));
  let employee = n - senior - mid;
  if (employee < 2) { employee = 2; }
  let m2 = Math.max(1, n - senior - employee);
  return { senior, mid: m2, employee };
}
function factionCounts(n) {
  const counts = [2, 2, 2, 2];
  const s = counts.reduce((a, b) => a + b, 0);
  if (n >= s) {
    const extra = n - s;
    for (let k = 0; k < extra; k++) counts[k % 4] += 1;
  } else {
    while (counts.reduce((a, b) => a + b, 0) > n) {
      counts[counts.indexOf(Math.max(...counts))] -= 1;
    }
  }
  return counts;
}
function makePersonality(rng, faction) {
  const base = TUNING.FACTION_BASELINE[faction] || {};
  const p = {};
  for (const dim of ["ambition", "loyalty", "risk_appetite", "empathy", "guile"]) {
    const v = (base[dim] !== undefined ? base[dim] : 0.5) + rng.gauss(0, 0.15);
    p[dim] = clamp(v, 0.05, 0.95);
  }
  return p;
}
function setupWorld(difficulty = "medium", numActors = 9, playerTier = null, seed = null) {
  const rng = new RNG(seed);
  const d = diff(difficulty);
  const state = new GameState(rng, difficulty, numActors);
  state._diff = d;

  const names = ["你", "周明远", "林晚", "赵承宇", "苏蔓", "陈屿", "韩立", "顾岚", "沈舟",
    "白露", "江涛", "方知", "叶蓁", "罗成", "唐婉", "宋扬", "陆鸣", "许清"];
  const dist = tierDistribution(numActors);
  const ptier = playerTier || rng.choice(["employee", "mid", "senior"]);
  dist[ptier] = Math.max(0, dist[ptier] - 1);
  const tierList = [];
  for (const t of TIERS) for (let c = 0; c < dist[t]; c++) tierList.push(t);
  rng.shuffle(tierList);

  const counts = factionCounts(numActors);
  const facList = [];
  FACTIONS.forEach((f, k) => { for (let c = 0; c < counts[k]; c++) facList.push(f); });
  rng.shuffle(facList);

  const player = new Actor(0, names[0], { isPlayer: true, tier: ptier });
  player.personality = makePersonality(rng, facList[0]);
  player.faction = facList[0];
  initActorResources(player, d, true, rng);
  state.actors.push(player);

  for (let i = 1; i < numActors; i++) {
    const a = new Actor(i, names[i], { tier: tierList[i - 1] });
    a.personality = makePersonality(rng, facList[i]);
    a.faction = facList[i];
    initActorResources(a, d, false, rng);
    state.actors.push(a);
  }

  for (const a of state.actors) {
    for (const j of state.actors) {
      a.trust[j.idx] = a.faction === j.faction ? 8.0 : 0.0;
      a.belief[j.idx] = [0.25, 0.25, 0.25, 0.25];
    }
  }

  const cfac = [];
  for (const f of FACTIONS) cfac.push(f, f);
  for (const f of cfac) state.clients.push({ owner: f, stability: Number(d.client_start_stability) });
  return state;
}
function initActorResources(a, d, isPlayer, rng) {
  const base = TUNING.INIT_RESOURCES[a.tier];
  if (isPlayer) {
    const off = d.player_start_offset || {};
    a.influence = clamp(base.influence + (off.influence || 0), 0, 100);
    a.stress = clamp(base.stress + (off.stress || 0), 0, 100);
    a.cash = clamp(base.cash + (off.cash || 0), -30, 300);
  } else {
    a.influence = clamp(Math.round(base.influence * rng.uniform(0.9, 1.1)), 0, 100);
    a.stress = clamp(Math.round(base.stress * rng.uniform(0.9, 1.1)), 0, 100);
    a.cash = clamp(Math.round(base.cash * rng.uniform(0.9, 1.1)), -30, 300);
  }
}

/* ============================ 6. 抽牌算法（cards_data.py） ============================ */
function loadCards() { return [CARDS, CARD_META]; }
function dayCurveWeights(day) {
  for (const bucket of TUNING.DAY_CURVE) {
    if ((bucket.days || []).includes(day)) return bucket.w || {};
  }
  return {};
}
function situationMatch(state, card) {
  const cd = TUNING.CARD_DRAW;
  let score = 0.0;
  const player = state.player();
  let lead = null, lv = -1e9;
  for (const f of FACTIONS) {
    const v = state.factionTrust[f] || 0;
    if (v > lv) { lv = v; lead = f; }
  }
  if (lead) {
    for (const ch of card.choices) {
      if ((ch.faction_trust[lead] || 0) >= 2) { score += cd.SIT_MATCH_FACTION_TRUST; break; }
    }
  }
  if (player.stress >= DERIVED.stress_high && ["加班", "团建"].includes(card.category)) score += cd.SIT_STRESS_CAT;
  if (state.chaos >= 60 && ["反腐", "舆情", "会议"].includes(card.category)) score += cd.SIT_CHAOS_CAT;
  if (state.clients.some((cl) => (cl.stability || 100) <= 30) && ["客户", "竞品"].includes(card.category)) score += cd.SIT_CLIENT_CAT;
  return clamp(score, 0.0, cd.SIT_CAP);
}
function tierWeight(card, playerTier) {
  const tw = TUNING.CARD_DRAW.TIER_W;
  if (card.tier === playerTier) return tw.match;
  if (card.tier === "any") return tw.any;
  return tw.other;
}
function roulette(state, weights) {
  const items = Object.entries(weights);
  const total = items.reduce((a, [, w]) => a + w, 0);
  if (total <= 0) return state.rng.choice(items)[0];
  let r = state.rng.random() * total, acc = 0.0;
  for (const [k, w] of items) { acc += w; if (r <= acc) return k; }
  return items[items.length - 1][0];
}
function drawDayCards(state, day, n) {
  const [cards] = loadCards();
  const curve = dayCurveWeights(day);
  const catScale = TUNING.CARD_DRAW.CAT_W_SCALE;
  const sitScale = TUNING.CARD_DRAW.SIT_W_SCALE;

  const byCat = {};
  for (const c of CATEGORY_ORDER) byCat[c] = [];
  for (const c of cards) byCat[c.category] = byCat[c.category] || [];
  for (const c of cards) byCat[c.category].push(c);

  const playerTier = state.player().tier;
  const drawn = [];
  const usedCats = new Set();

  for (let _ = 0; _ < n; _++) {
    const avail = CATEGORY_ORDER.filter(
      (cat) => !usedCats.has(cat) && byCat[cat].some((c) => !state.usedCards.has(c.id))
    );
    if (!avail.length) break;
    let catExtra = 0.0;
    for (const cat of avail) {
      for (const c of byCat[cat]) {
        if (!state.usedCards.has(c.id)) { catExtra = Math.max(catExtra, situationMatch(state, c)); break; }
      }
    }
    const catW = {};
    // 注意括号：curve 里没有的类目权重应为基准 1.0（对齐 cards_data.py 的 curve.get(cat, 0.0)），
    // 若写成 1.0 + catScale * curve[cat] || 0.0 会因 NaN 短路成 0，导致非当日曲线类目永远抽不到。
    for (const cat of avail) catW[cat] = 1.0 + catScale * (curve[cat] || 0.0);
    const chosenCat = roulette(state, catW);
    const pool = byCat[chosenCat].filter((c) => !state.usedCards.has(c.id));
    const cardW = {};
    for (const c of pool) {
      const w = tierWeight(c, playerTier) * (1.0 + sitScale * situationMatch(state, c));
      cardW[c.id] = Math.max(0.001, w);
    }
    const chosen = roulette(state, cardW);
    for (const c of pool) {
      if (c.id === chosen) {
        drawn.push(c);
        state.usedCards.add(c.id);
        usedCats.add(chosenCat);
        break;
      }
    }
  }
  return drawn;
}

/* ============================ 7. 启发式 AI（ai.py） ============================ */
function wInf(a) { return 0.6 + 0.9 * (a.personality.ambition ?? 0.5); }
function wStr(a) {
  const sp = 1 + 1.5 * (a.stress / 100.0);
  return -(0.5 + 1.2 * (1 - (a.personality.risk_appetite ?? 0.5))) * sp;
}
function wCash(a) {
  const greed = a.faction === "FV_D" ? 1.0 : 0.0;
  return 0.3 + 0.5 * (1 - (a.personality.ambition ?? 0.5)) + 0.4 * greed;
}
function tagGoalBonus(a, ch) {
  const spec = TUNING.TAG_GOAL_BONUS[a.faction] || {};
  let bonus = 0.0;
  if ((spec.arch || []).includes(ch.arch)) bonus += 1.0;
  for (const t of (spec.tags || [])) if ((ch.tags || []).includes(t)) bonus += 1.0;
  return bonus;
}
function goalAlign(a, ch, state) {
  const ft = ch.faction_trust;
  const mine = ft[a.faction] || 0;
  let rivalVal = 0;
  for (const f of FACTIONS) if (f !== a.faction) rivalVal = Math.max(rivalVal, ft[f] || 0);
  const base = 3.0 * mine - 1.5 * rivalVal + 2.5 * tagGoalBonus(a, ch);
  const agg = state._diff.ai_aggressiveness;
  return base * (0.6 + 0.8 * agg);
}
function reciprocity(a, ch, state) {
  let total = 0.0;
  for (const j of state.actors) {
    if (j.idx === a.idx || !j.alive) continue;
    const t = (a.trust[j.idx] || 0) / 100.0;
    if (t === 0) continue;
    const b = a.belief[j.idx] || [0.25, 0.25, 0.25, 0.25];
    const wsum = b.reduce((x, y) => x + y, 0);
    let expected;
    if (wsum > 0) {
      expected = b.reduce((s, bk, k) => s + bk * (ch.faction_trust[FACTIONS[k]] || 0), 0) / wsum;
    } else {
      expected = (ch.faction_trust[j.faction] || 0) * 0.25;
    }
    total += t * expected;
  }
  return total;
}
function concealment(a, ch) {
  const exposure = Math.abs(ch.faction_trust[a.faction] || 0) / 10.0;
  return -(1 - (a.personality.guile ?? 0.5)) * exposure;
}
function suspicion(a, state) {
  const fi = FIDX[a.faction];
  let mx = 0.0;
  for (const j of state.actors) {
    if (j.idx === a.idx || !j.alive) continue;
    const b = j.belief[a.idx] || [0.25, 0.25, 0.25, 0.25];
    if (fi < b.length) mx = Math.max(mx, b[fi]);
  }
  return mx;
}
function riskFn(a, ch, state) {
  const pl = ch.player;
  const base = (1 - (a.personality.risk_appetite ?? 0.5)) * (Math.abs(pl.stress) + Math.max(0, -pl.cash)) / 10.0;
  return base + 0.5 * suspicion(a, state);
}
function computeUtility(a, ch, state) {
  const W = TUNING.AI_WEIGHTS;
  const pl = ch.player;
  const uInf = wInf(a) * pl.influence;
  const uStr = wStr(a) * pl.stress;
  const uCash = wCash(a) * pl.cash;
  const uGoal = W.ALPHA * goalAlign(a, ch, state);
  const uRec = W.BETA * reciprocity(a, ch, state);
  const uCon = W.GAMMA * concealment(a, ch);
  const uRisk = W.DELTA * riskFn(a, ch, state);
  const tau = 0.8 * state._diff.tau_temperature * (0.5 + (a.personality.risk_appetite ?? 0.5));
  const eps = state.rng.uniform(-tau, tau);
  let u = uInf + uStr + uCash + uGoal + uRec + uCon - uRisk + eps;
  if (a.cash + pl.cash < TUNING.RESOURCES.CASH_FLOOR) u -= 50;
  if (a.stress + pl.stress >= TUNING.RESOURCES.STRESS_BREAK) u -= 80;
  return [u, { inf: uInf, str: uStr, cash: uCash, goal: uGoal, rec: uRec, con: uCon, risk: uRisk }];
}
function personalityTiebreak(a, options) {
  let best = options[0];
  let bestKey = (a.personality.ambition ?? 0.5) * best.player.influence
    - (a.personality.empathy ?? 0.5) * best.player.stress
    - (1 - (a.personality.risk_appetite ?? 0.5)) * best.player.stress;
  for (const ch of options.slice(1)) {
    const key = (a.personality.ambition ?? 0.5) * ch.player.influence
      - (a.personality.empathy ?? 0.5) * ch.player.stress
      - (1 - (a.personality.risk_appetite ?? 0.5)) * ch.player.stress;
    if (key > bestKey) { best = ch; bestKey = key; }
  }
  return best;
}
function aiChoose(a, card, state) {
  const scored = card.choices.map((ch, idx) => {
    const [u, comp] = computeUtility(a, ch, state);
    return [u, idx, ch, comp];
  });
  scored.sort((x, y) => y[0] - x[0]);
  const topU = scored[0][0];
  const top = scored.filter((s) => topU - s[0] < 0.5);
  let chosen;
  if (top.length === 1) chosen = top[0];
  else chosen = scored.find((s) => s[2] === personalityTiebreak(a, top.map((s) => s[2])));
  const comp = chosen[3];
  return [chosen[1], motivationHint(comp, a)];
}
function motivationHint(comp, a) {
  const items = Object.entries(comp).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
  const [topk, topv] = items[0];
  if (topk === "goal" && Math.abs(topv) > 1.0) return "似乎更在意派系利益";
  if (topk === "cash" && Math.abs(topv) > 1.0) return "更在意可动用预算";
  if (topk === "str" && topv < -1.0) return "在极力规避压力";
  if (topk === "inf" && topv > 1.0) return "野心勃勃想抢声望";
  if (topk === "rec" && Math.abs(topv) > 1.0) return "在权衡人情与报复";
  return "态度模糊，难以捉摸";
}
function updateBeliefTrust(state, observer, actor, ch) {
  state.ensureTrust(observer, actor);
  state.ensureBelief(observer, actor);
  const ft = ch.faction_trust;
  const mine = ft[observer.faction] || 0;
  const rival = state.rivalFaction(observer);
  const rivV = ft[rival] || 0;
  let dTrust = 1.2 * mine - 0.5 * Math.max(0, rivV);
  if (ch.arch === "shield") dTrust += 0.8;
  observer.trust[actor.idx] = clamp((observer.trust[actor.idx] || 0) + clamp(dTrust, -12, 12), -100, 100);

  const cred = { employee: 0.8, mid: 1.0, senior: 1.2 }[observer.tier];
  const b = observer.belief[actor.idx];
  const updated = FACTIONS.map((f, k) => {
    const ev = ft[f] || 0;
    const likelihood = Math.max(0.01, 1.0 + 0.25 * ev * cred);
    return b[k] * likelihood;
  });
  const s = updated.reduce((a, c) => a + c, 0) || 1.0;
  observer.belief[actor.idx] = updated.map((x) => clamp(x / s, 0.0, 1.0));
}
function aiVoteScore(a, target, state) {
  const fi = FIDX[a.faction];
  const b = a.belief[target.idx] || [0.25, 0.25, 0.25, 0.25];
  const rival = state.rivalFaction(a);
  const rivalI = FIDX[rival];
  let score = 2.2 * (b[rivalI] || 0);
  score -= 1.8 * ((a.trust[target.idx] || 0) / 100.0);
  const tw = TUNING.TIER_MODS[target.tier].vote_weight;
  const threat = (target.influence / 100.0) * tw * (1 + state._diff.ai_aggressiveness);
  score += 1.2 * threat;
  if (b[fi] === Math.max(...b) && b[fi] > 0.4) score -= 2.5;
  // playerBribed 是被买票者的 idx 数组，必须用 includes 判成员（`in` 只查数组下标，会让买票完全失效）
  if (target.isPlayer && (state.assembly.playerBribed || []).includes(a.idx)) score -= 1.0 * Math.max(1, state.assembly.bribes);
  if (state.assembly.accused === target.idx) score += 0.6;
  if (target.isPlayer) score += state._diff.player_focus_bias;
  score += state.rng.uniform(-0.6, 0.6);
  return score;
}
function aiVote(a, candidates, state) {
  let best = null, bestS = -1e9;
  for (const t of candidates) {
    if (t.idx === a.idx) continue;
    const s = aiVoteScore(a, t, state);
    if (s > bestS) { bestS = s; best = t.idx; }
  }
  return best;
}
function aiNight(a, state) {
  const rival = state.rivalFaction(a);
  const candidates = state.actors.filter((j) => j.alive && j.faction !== a.faction && j.idx !== a.idx);
  if (!candidates.length) return null;
  // 按「a 自己认为对方属于头号对手派系的概率」降序，再按声望降序（对齐 ai.py 的 sort key）
  const bel4 = (j) => (a.belief[j.idx] || [0.25, 0.25, 0.25, 0.25])[FIDX[rival]];
  candidates.sort((x, y) => (bel4(y) - bel4(x)) || (y.influence - x.influence));
  const target = candidates[0];
  const roll = state.rng.random();
  if (a.tier === "senior" && roll < 0.6) {
    // 调阅背景：更新的是「a 对 target 的信念」，不是 target 对自己的信念
    const bel = a.belief[target.idx] || [0.25, 0.25, 0.25, 0.25];
    bel[FIDX[target.faction]] = clamp(bel[FIDX[target.faction]] + 0.3, 0.0, 1.0);
    const ss = bel.reduce((x, y) => x + y, 0) || 1.0;
    a.belief[target.idx] = bel.map((x) => x / ss);
    return `${a.name} 在夜间调取了 ${target.name} 的背景资料。`;
  } else {
    target.stress = clamp(target.stress + 2.0, 0, 100);
    a.trust[target.idx] = clamp((a.trust[target.idx] || 0) - 3.0, -100, 100);
    return `${a.name} 夜里给 ${target.name} 悄悄施了压。`;
  }
}

/* ============================ 8. 引擎主循环（engine.py） ============================ */
function applyChoice(state, actor, ch, isPlayer) {
  const tm = TUNING.TIER_MODS[actor.tier];
  const pl = ch.player;
  if (isPlayer) {
    const pscale = state._diff.player_penalty_scale;
    const sgn = (v) => (v < 0 ? v * pscale : v);
    var adj = sgn;
  } else {
    const gscale = state._diff.ai_gain_scale;
    const sgn = (v) => (v > 0 ? v * gscale : v);
    var adj = sgn;
  }
  let dInf = adj(pl.influence * tm.influence_gain);
  let dStr = adj(pl.stress * tm.stress_gain);
  let dCash = adj(pl.cash);

  if (actor.influence >= DERIVED.influence_high) dInf *= 0.7;
  if (actor.influence <= DERIVED.influence_low) dStr *= 0.8;
  if (actor.stress >= DERIVED.stress_high) dInf *= 0.8;

  const c12 = DERIVED.single_card_net_clamp;
  dInf = clamp(dInf, -c12, c12);
  dStr = clamp(dStr, -c12, c12);
  dCash = clamp(dCash, -c12, c12);

  actor.influence += dInf;
  actor.stress += dStr;
  actor.cash += dCash;
  state.clampActor(actor);
}
function applyClientEffects(state, actor, ch) {
  const arch = ch.arch;
  if (["invest", "cashin"].includes(arch)) boostClient(state, actor.faction, 6);
  else if (["shield", "ally"].includes(arch)) boostClient(state, actor.faction, 3);
  else if (["betray", "expose", "risk"].includes(arch)) attackClient(state, actor);
}
function boostClient(state, faction, amount) {
  const mine = state.clients.filter((c) => c.owner === faction);
  if (!mine.length) return;
  let target = mine[0];
  for (const c of mine) if (c.stability < target.stability) target = c;
  target.stability = clamp(target.stability + amount, 0, 100);
}
function attackClient(state, actor) {
  const enemies = state.clients.filter((c) => c.owner !== actor.faction);
  if (!enemies.length) return;
  let target = enemies[0];
  for (const c of enemies) if (c.stability < target.stability) target = c;
  target.stability = clamp(target.stability - 6, 0, 100);
  if (target.stability <= 20) {
    const old = target.owner;
    target.owner = actor.faction;
    target.stability = 40.0;
    state.clientsTaken[actor.faction] = (state.clientsTaken[actor.faction] || 0) + 1;
    state.clientsLost[old] = (state.clientsLost[old] || 0) + 1;
  }
}
async function resolveCard(state, card, controller) {
  const player = state.player();
  const choiceOf = {};

  if (player.alive) {
    let idx = await controller.pickCard(state, card);
    if (player.stress >= DERIVED.stress_high &&
      state.rng.random() < (player.stress - DERIVED.stress_high) / 100.0) {
      idx = state.rng.randrange(card.choices.length);
      state.logMsg(`【失态】你压力过载，选择失控为「${card.choices[idx].label}」。`);
    }
    choiceOf[player.idx] = card.choices[idx];
    applyChoice(state, player, choiceOf[player.idx], true);
    player.actions += 1;
    if (["betray", "expose"].includes(card.choices[idx].arch)) player.betrayals += 1;
  } else {
    state.logMsg(`（你已出局，旁观）${card.title} 在场上继续发酵。`);
  }

  for (const a of state.aliveActors()) {
    if (a.isPlayer) continue;
    const [cidx, hint] = aiChoose(a, card, state);
    const ch = card.choices[cidx];
    choiceOf[a.idx] = ch;
    a.motivation = hint;
    applyChoice(state, a, ch, false);
    a.actions += 1;
  }

  for (const obs of state.aliveActors()) {
    for (const act of state.aliveActors()) {
      if (act.idx === obs.idx) continue;
      const ch = choiceOf[act.idx];
      if (ch) updateBeliefTrust(state, obs, act, ch);
    }
  }

  const hasConflict = Object.values(choiceOf).some((ch) => _CONFLICT_ARCH.has(ch.arch));
  const hasLeak = Object.values(choiceOf).some((ch) => ch.arch === "leak");
  if (hasConflict) state.chaos = clamp(state.chaos + TUNING.CHAOS.backstab, 0, 100);
  if (hasLeak) state.chaos = clamp(state.chaos + TUNING.CHAOS.report * 0.5, 0, 100);
  for (const [act, ch] of Object.entries(choiceOf)) applyClientEffects(state, state.actors[Number(act)], ch);

  if (controller.afterCard) await controller.afterCard(state, card, choiceOf);
}
async function phaseMorning(state, controller) {
  await controller.showInfo(state, "morning",
    `第 ${state.day} 天 · 晨会：昨日全局冲突度 ${state.chaos.toFixed(0)}，` +
    `你的声望 ${state.player().influence.toFixed(0)} / 压力 ${state.player().stress.toFixed(0)}。`);
  state.logMsg(`[D${state.day}] 晨会：冲突度 ${state.chaos.toFixed(0)}`);
}
async function phaseDayCards(state, controller) {
  const ramp = TUNING.CARDS_PER_DAY_RAMP[String(state.day)] || TUNING.CARDS_PER_DAY_BASE;
  const n = state.day > 2 ? TUNING.CARDS_PER_DAY_BASE : ramp;
  const drawn = drawDayCards(state, state.day, n);
  for (const card of drawn) {
    state.logMsg(`[D${state.day}] 情况牌《${card.title}》（${card.category}）`);
    await resolveCard(state, card, controller);
  }
}
async function phaseNoon(state, controller) {
  if (!state.player().alive) return;
  const target = await controller.noonTalk(state);
  if (target !== null && target !== undefined && target >= 0 && target < state.actors.length && state.actors[target].alive) {
    state.logMsg(`[D${state.day}] 你与 ${state.actors[target].name} 进行了午间密谈。`);
  }
}
async function phaseNight(state, controller) {
  const player = state.player();
  if (player.alive) {
    const act = await controller.nightAction(state);
    if (act) {
      const [ability, target] = act;
      if (target >= 0 && target < state.actors.length && state.actors[target].alive) {
        state.logMsg(`[D${state.day}] 你使用了「${ability}」于 ${state.actors[target].name}。`);
      }
    }
  }
  for (const a of state.aliveActors()) {
    if (a.isPlayer) continue;
    const desc = aiNight(a, state);
    if (desc) state.logMsg(desc);
  }
}
async function phaseSettle(state, controller) {
  const D = DERIVED;
  const R = TUNING.RESOURCES;
  for (const a of state.aliveActors()) {
    a.stress = clamp(a.stress + TUNING.RESOURCE_NATURAL.stress_per_day, 0, 100);
    if (a.tier === "mid") a.stress = clamp(a.stress + TUNING.RESOURCE_NATURAL.mid_extra_stress, 0, 100);
    if (a.cash < 0) a.stress = clamp(a.stress + D.cash_negative_stress, 0, 100);
    if (a.influence > 100) {
      const overflow = a.influence - 100;
      a.influence = 100;
      a.cash = clamp(a.cash + overflow * D.influence_overflow_to_cash, R.cash.min, R.cash.max);
    }
    if (a.stress >= D.stress_critical) a.influence = clamp(a.influence - 2, 0, 100);
    if (a.influence <= 0) a.influenceZeroDays += 1;
    else a.influenceZeroDays = 0;
    state.clampActor(a);
  }
  for (const a of state.aliveActors()) {
    if (a.stress >= R.STRESS_BREAK) eliminate(state, a, "长期病假（压力崩溃）");
  }
  for (const a of state.aliveActors()) {
    if (a.influenceZeroDays >= R.INFLUENCE_ZERO_GRACE) eliminate(state, a, "边缘化调岗（声望清零）");
  }
  if (state.player().alive && state.player().cash <= R.CASH_FLOOR && TUNING.ASSEMBLY_DAYS.includes(state.day)) {
    if (state.rng.random() < 0.6) eliminate(state, state.player(), "审计约谈（资金穿底）");
  }
  state.chaos = clamp(state.chaos - TUNING.CHAOS.daily_decay, 0, 100);
  await controller.showInfo(state, "settle",
    `第 ${state.day} 天 · 日结：你的声望 ${state.player().influence.toFixed(0)} / ` +
    `压力 ${state.player().stress.toFixed(0)} / 预算 ${state.player().cash.toFixed(0)} 万。`);
}
async function phaseAssembly(state, controller) {
  state.assembly = { accused: null, deflect: false, bribes: 0, playerBribed: [], defend: false };
  const alive = state.aliveActors();
  if (alive.length <= 1) return;
  if (state.player().alive) {
    const [tmpl, tgt] = await controller.assemblySpeech(state);
    if (tmpl === "accuse" && tgt !== null && tgt !== undefined) {
      state.assembly.accused = tgt;
      for (const a of alive) a.trust[tgt] = clamp((a.trust[tgt] || 0) - TUNING.SPEECH_TEMPLATES.accuse.trust_target, -100, 100);
      state.logMsg(`[D${state.day}] 你在联席会议上指认了 ${state.actors[tgt].name}。`);
    } else if (tmpl === "defend") {
      state.assembly.defend = true;
      state.logMsg(`[D${state.day}] 你在联席会议上自辩。`);
    } else if (tmpl === "deflect") {
      state.assembly.deflect = true;
      state.logMsg(`[D${state.day}] 你把议题引向别处，转移了话题。`);
    }
    const nb = await controller.assemblyBribe(state);
    const cap = state._diff.bribe_cap;
    const nbb = clamp(nb || 0, 0, cap);
    const cost = nbb * TUNING.PRICES.buy_vote;
    if (nbb > 0 && state.player().cash >= cost) {
      state.player().cash -= cost;
      state.assembly.bribes = nbb;
      const ais = alive.filter((a) => !a.isPlayer);
      state.rng.shuffle(ais);
      state.assembly.playerBribed = ais.slice(0, nbb).map((a) => a.idx);
      state.logMsg(`[D${state.day}] 你花费 ${cost} 万可动用预算买下 ${nbb} 张票。`);
    }
  }
  const votes = {};
  for (const a of alive) votes[a.idx] = 0.0;
  for (const a of alive) {
    let tgt;
    if (a.isPlayer) tgt = state.player().alive ? await controller.assemblyVote(state, alive) : null;
    else tgt = aiVote(a, alive, state);
    if (tgt !== null && tgt !== undefined) {
      let w = a.voteWeight();
      if (a.isPlayer && state.assembly.defend) w *= TUNING.SPEECH_TEMPLATES.defend.self_vote_mult;
      votes[tgt] = (votes[tgt] || 0) + w;
    }
  }
  let best = null, bestV = -1.0;
  for (const a of alive) {
    const v = votes[a.idx] || 0;
    if (v > bestV) { bestV = v; best = a; }
  }
  if (best === null || alive.length <= 1) return;
  const ties = alive.filter((a) => Math.abs((votes[a.idx] || 0) - bestV) < 1e-6);
  if (ties.length > 1) {
    ties.sort((a, b) => (b.influence - a.influence) || (state.rng.random() - state.rng.random()));
    best = ties[0];
  }
  eliminate(state, best, "优化名单（联席会议投票出局）");
  state.chaos = clamp(state.chaos + TUNING.CHAOS.vote_out, 0, 100);
  state.logMsg(`[D${state.day}] 联席会议：${best.name} 被投出局（${bestV.toFixed(1)} 票）。`);
}
function eliminate(state, actor, cause) {
  actor.alive = false;
  actor.outDay = state.day;
  actor.outCause = cause;
  state.logMsg(`  ⚠ ${actor.name} 出局：${cause}（第 ${state.day} 天）`);
  if (actor.isPlayer) state.observer = true;
}
function evaluateGoal(state, fkey) {
  const th = TUNING.GOAL_THRESHOLDS[fkey][state._diff.goal_threshold];
  const members = state.factionMembers(fkey, true);
  const hasMember = members.length > 0;
  if (fkey === "FV_A") {
    const taken = state.clientsTaken[fkey] || 0;
    if (taken >= th.full) return "full";
    if (taken >= th.bare) return "bare";
    if (taken === 0 && (state.clientsLost[fkey] || 0) > 0) return "disaster";
    return "fail";
  }
  if (fkey === "FV_B") {
    const lost = state.clientsLost[fkey] || 0;
    const mine = state.clients.filter((c) => c.owner === fkey);
    const avgStab = mine.length ? mine.reduce((s, c) => s + c.stability, 0) / mine.length : 0;
    if (lost <= th.full_lost && avgStab >= th.full_stab) return "full";
    if (lost <= th.bare_lost) return "bare";
    if (lost >= 3) return "disaster";
    return "fail";
  }
  if (fkey === "FV_C") {
    const ps = state.powerScore(fkey);
    if (ps >= th.full) return "full";
    if (ps >= th.bare) return "bare";
    if (!hasMember) return "disaster";
    return "fail";
  }
  if (fkey === "FV_D") {
    const p = state.player();
    let rep;
    if (p.faction === fkey && p.alive) rep = p.stress;
    else rep = members.length ? members.reduce((s, m) => s + m.stress, 0) / members.length : 100;
    if (!hasMember) return state.chaos >= 70 ? "disaster" : "fail";
    if (rep <= th.full_stress && state.chaos <= th.full_chaos) return "full";
    if (rep <= th.bare_stress) return "bare";
    return "fail";
  }
  return "fail";
}
function evaluateSubGoal(state, fkey) {
  const p = state.player();
  if (fkey === "FV_A") return state.actors.some((a) => !a.alive && a.outDay !== null && a.outDay < 12 && a.faction !== p.faction);
  if (fkey === "FV_B") return p.influence >= 55;
  if (fkey === "FV_C") return p.betrayals >= 3;
  if (fkey === "FV_D") return p.cash >= 60 && p.outCause !== "审计约谈（资金穿底）";
  return false;
}
function finalJudge(state) {
  const p = state.player();
  const fkey = p.faction;
  const factionTier = evaluateGoal(state, fkey);
  const subOk = evaluateSubGoal(state, fkey);
  const alive = p.alive;

  let rating;
  if (!alive) {
    if (p.outCause && p.outCause.includes("压力") && factionTier === "full") rating = "A-";
    else if (factionTier === "full") rating = "B-";
    else rating = "D";
  } else {
    if (factionTier === "full" && subOk) rating = "S";
    else if (factionTier === "full") rating = "A";
    else if (factionTier === "bare") rating = "B";
    else if (factionTier === "fail" && subOk) rating = "C";
    else rating = "D";
  }

  let outcome;
  if (!alive) outcome = "observer";
  else if (["full", "bare"].includes(factionTier)) outcome = "win";
  else outcome = "lose";

  const reveal = state.actors.map((a) => ({
    name: a.name, isPlayer: a.isPlayer, faction: a.faction, factionAlias: a.factionAlias,
    tier: a.tier, alive: a.alive, outDay: a.outDay, outCause: a.outCause,
    goal: factionGoal(a.faction), influence: Math.round(a.influence),
    stress: Math.round(a.stress), cash: Math.round(a.cash),
  }));

  const result = {
    day: state.day, outcome, rating, title: _RATING_TITLES[rating] || "未知结局",
    playerAlive: alive, observer: state.observer, faction: fkey, factionAlias: factionAlias(fkey),
    factionTier, subOk, difficulty: state.difficulty, numActors: state.numActors,
    playerTier: p.tier, chaos: Math.round(state.chaos), powerScore: Math.round(state.powerScore(fkey)),
    clientsTaken: state.clientsTaken[fkey] || 0, clientsLost: state.clientsLost[fkey] || 0,
    reveal, log: state.log.slice(-60),
  };
  state.result = result;
  return result;
}

/* ============================ 9. 控制器（玩家输入接口） ============================ */
class Controller {
  showInfo() {}
  pickCard() { return 0; }
  noonTalk() { return null; }
  nightAction() { return null; }
  assemblySpeech() { return ["deflect", null]; }
  assemblyBribe() { return 0; }
  assemblyVote() { return null; }
  afterCard() {}
  gameOver() {}
}
class RandomController extends Controller {
  pickCard(state, card) {
    const p = state.player();
    const floor = TUNING.RESOURCES.CASH_FLOOR;
    const valid = card.choices.map((ch, i) => i).filter((i) => p.cash + card.choices[i].player.cash >= floor);
    if (valid.length) return state.rng.choice(valid);
    return state.rng.randrange(card.choices.length);
  }
  noonTalk(state) {
    if (state.rng.random() < 0.5) return null;
    const alive = state.aliveActors().filter((a) => !a.isPlayer).map((a) => a.idx);
    return alive.length ? state.rng.choice(alive) : null;
  }
  nightAction(state) {
    if (state.rng.random() < 0.5) return null;
    const alive = state.aliveActors().filter((a) => !a.isPlayer).map((a) => a.idx);
    if (!alive.length) return null;
    return [state.rng.choice(["施压", "调阅背景", "挪预算"]), state.rng.choice(alive)];
  }
  assemblySpeech(state) {
    const tmpl = state.rng.choice(["accuse", "defend", "deflect"]);
    if (tmpl === "accuse") {
      const alive = state.aliveActors().filter((a) => !a.isPlayer).map((a) => a.idx);
      return [tmpl, alive.length ? state.rng.choice(alive) : null];
    }
    return [tmpl, null];
  }
  assemblyBribe(state) {
    if (state.rng.random() < 0.4) return state.rng.randint ? state.rng.randint(0, state._diff.bribe_cap) : state.rng.randrange(state._diff.bribe_cap + 1);
    return 0;
  }
  assemblyVote(state, candidates) {
    const alive = candidates.filter((a) => !a.isPlayer).map((a) => a.idx);
    return alive.length ? state.rng.choice(alive) : null;
  }
}

async function runGame(difficulty = "medium", numActors = 9, playerTier = null, controller = null, seed = null) {
  const state = setupWorld(difficulty, numActors, playerTier, seed);
  const ctrl = controller || new RandomController();
  const dayMax = TUNING.DAY_MAX;
  const assemblyDays = new Set(TUNING.ASSEMBLY_DAYS);

  for (let day = 1; day <= dayMax; day++) {
    state.day = day;
    await phaseMorning(state, ctrl);
    await phaseDayCards(state, ctrl);
    await phaseNoon(state, ctrl);
    await phaseNight(state, ctrl);
    await phaseSettle(state, ctrl);
    if (assemblyDays.has(day)) await phaseAssembly(state, ctrl);
    const alive = state.aliveActors();
    if (alive.length <= 1) { state.endedEarly = true; break; }
  }
  const result = finalJudge(state);
  ctrl.gameOver(state, result);
  return result;
}
async function runHeadless(numGames = 50, difficulty = "medium", numActors = 9, playerTier = null, seed = null) {
  let crashes = 0;
  const outcomes = { win: 0, lose: 0, observer: 0 };
  const ratings = {};
  const examples = [];
  for (let i = 0; i < numGames; i++) {
    const gseed = seed !== null && seed !== undefined ? seed + i : null;
    try {
      const res = await runGame(difficulty, numActors, playerTier, new RandomController(), gseed);
      outcomes[res.outcome] = (outcomes[res.outcome] || 0) + 1;
      ratings[res.rating] = (ratings[res.rating] || 0) + 1;
      if (i < 5) examples.push(res);
    } catch (e) {
      crashes += 1;
      examples.push({ error: String((e && e.stack) || e) });
    }
  }
  return { numGames, crashes, outcomes, ratings, examples };
}

/* ============================ 10. 浏览器 UI（仅浏览器执行） ============================ */
let DOM = null;
let STATE = null;
let CURRENT_CONTROLLER = null;

function h(tag, attrs, children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined) continue;
      if (k === "class") el.className = v;
      else if (k === "style") el.setAttribute("style", v);
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
  }
  if (children !== null && children !== undefined) {
    const list = Array.isArray(children) ? children : [children];
    for (const c of list) {
      if (c === null || c === undefined) continue;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
  }
  return el;
}
function clearStage() { if (DOM && DOM.stage) DOM.stage.innerHTML = ""; }
function present(node, autoMs) {
  clearStage();
  if (DOM && DOM.stage) DOM.stage.appendChild(node);
  renderTop(STATE);
  renderRoster(STATE);
  // 仅视口行为：新面板出现时回到顶部（桌面 stage 自身滚动；移动端整页滚动）
  if (DOM && DOM.stage) DOM.stage.scrollTop = 0;
  if (typeof window !== "undefined" && window.scrollTo) window.scrollTo(0, 0);
  if (autoMs && node._finish) setTimeout(() => { if (node._finish) node._finish(); }, autoMs);
}
function pickFromPanel({ title, desc, options, autoMs }) {
  const node = h("div", { class: "panel" }, [
    h("h2", { class: "panel-title" }, title),
    desc ? h("p", { class: "panel-desc" }, desc) : null,
  ]);
  const wrap = h("div", { class: "options" });
  options.forEach((o) => {
    const btn = h("button", { class: "opt-btn" + (o.danger ? " danger" : "") }, [
      h("span", { class: "opt-label" }, o.label),
      o.sub ? h("span", { class: "opt-sub" }, o.sub) : null,
    ]);
    btn.addEventListener("click", () => { if (node._finish) node._finish(o.value); });
    wrap.appendChild(btn);
  });
  node.appendChild(wrap);
  return new Promise((resolve) => {
    node._finish = (v) => resolve(v);
    present(node, autoMs);
  });
}
function silhouetteSVG(tier, color) {
  const c = color || "#8A8478";
  const sc = tier === "senior" ? 1.25 : tier === "mid" ? 1.0 : 0.82;
  const hr = (6.5 * sc).toFixed(1);
  const hy = (15 - (sc - 1) * 4).toFixed(1);
  return `<svg viewBox="0 0 48 56" width="40" height="46" aria-hidden="true">
    <circle cx="24" cy="${hy}" r="${hr}" fill="${c}"/>
    <path d="M ${(10 - (sc - 1) * 4).toFixed(1)} 54 Q 24 ${(30 - (sc - 1) * 4).toFixed(1)} ${(38 + (sc - 1) * 4).toFixed(1)} 54 Z" fill="${c}"/>
  </svg>`;
}
function renderTop(state) {
  if (!DOM || !state) return;
  const p = state.player();
  DOM.dayLabel.textContent = `第 ${state.day} 天 · ${PHASE_LABELS[state.phase] || ""}`;
  DOM.goalLabel.innerHTML = `你的派系：<b style="color:${factionColor(p.faction)}">${p.factionAlias}</b>（${factionGoal(p.faction)}） · 混沌 ${state.chaos.toFixed(0)}`;
  const bars = [
    { key: "influence", label: "声望", color: "#E8C070", val: p.influence, lo: 0, hi: 100 },
    { key: "stress", label: "压力", color: "#D6453D", val: p.stress, lo: 0, hi: 100 },
    { key: "cash", label: "可动用预算", color: "#5E92D8", val: p.cash, lo: -30, hi: 300 },
  ];
  for (const b of bars) {
    const frac = clamp((b.val - b.lo) / (b.hi - b.lo), 0, 1);
    DOM["bar_" + b.key].style.width = (frac * 100).toFixed(1) + "%";
    DOM["bar_" + b.key].style.background = b.color;
    DOM["val_" + b.key].textContent = b.val.toFixed(0);
  }
  const avgStab = state.clients.length ? state.clients.reduce((s, c) => s + c.stability, 0) / state.clients.length : 0;
  DOM.metaLine.textContent = `客户稳定均值 ${avgStab.toFixed(0)}%　|　在场 ${state.aliveActors().length}/${state.numActors} 人`;
  // 压力偏色噪点覆盖层
  if (DOM.stressOverlay) {
    const op = clamp((p.stress - 70) / 30, 0, 1) * 0.55;
    DOM.stressOverlay.style.opacity = String(op);
  }
}
function renderRoster(state) {
  if (!DOM || !DOM.roster || !state) return;
  const p = state.player();
  DOM.roster.innerHTML = "";
  DOM.roster.appendChild(h("div", { class: "roster-head" }, "在场人物"));
  for (const a of state.actors) {
    const row = h("div", { class: "actor-row" + (a.alive ? "" : " dead") });
    const silColor = a.isPlayer ? factionColor(a.faction) : "#8A8478";
    row.appendChild(h("div", { class: "sil sil-" + a.tier, html: silhouetteSVG(a.tier, silColor) }));
    let facText, facColor;
    if (a.isPlayer) { facText = a.factionAlias + "（你）"; facColor = factionColor(a.faction); }
    else if (a.revealed || (STATE && STATE.result)) { facText = a.factionAlias; facColor = factionColor(a.faction); }
    else { facText = "？ ？ ？"; facColor = "#6E665A"; }
    const info = h("div", { class: "actor-info" }, [
      h("div", { class: "actor-name" }, a.name + (a.isPlayer ? "（你）" : "")),
      h("div", { class: "actor-status" }, a.alive ? TIER_LABEL[a.tier] : `D${a.outDay}出局`),
      h("div", { class: "actor-fac" + (a.isPlayer || a.revealed || (STATE && STATE.result) ? "" : " watermark"), style: `color:${facColor}` }, facText),
    ]);
    row.appendChild(info);
    const tval = a.isPlayer ? 100 : (p.trust[a.idx] || 0);
    const pct = clamp((tval + 100) / 200, 0, 1) * 100;
    const bar = h("div", { class: "mini-bar" }, h("div", { class: "mini-fill", style: `width:${pct.toFixed(0)}%` }));
    row.appendChild(bar);
    DOM.roster.appendChild(row);
  }
}
function renderLog(state) {
  if (!DOM || !DOM.log) return;
  DOM.log.innerHTML = "";
  const lines = (state.log || []).slice(-40);
  for (const m of lines) DOM.log.appendChild(h("div", { class: "log-line" }, m));
  DOM.log.scrollTop = DOM.log.scrollHeight;
}

class GUIController extends Controller {
  showInfo(state, phase, text) {
    STATE = state; state.phase = phase;
    renderLog(state);
    const node = h("div", { class: "panel" }, [
      h("h2", { class: "panel-title" }, PHASE_LABELS[phase] || phase),
      h("p", { class: "panel-desc" }, text),
    ]);
    const btn = h("button", { class: "continue-btn" }, "继续 ▶");
    node.appendChild(btn);
    return new Promise((resolve) => {
      node._finish = () => resolve(null);
      btn.addEventListener("click", () => { if (node._finish) node._finish(); });
      present(node, state.observer ? 700 : 0);
    });
  }
  pickCard(state, card) {
    STATE = state; state.phase = "day_cards"; renderLog(state);
    const node = h("div", { class: "card" }, [
      h("div", { class: "card-head" }, [
        h("span", { class: "card-cat-icon" }, CATEGORY_ICONS[card.category] || "📄"),
        h("span", { class: "card-cat" }, card.category),
      ]),
      h("h2", { class: "card-title" }, card.title),
      h("p", { class: "card-text" }, card.text),
    ]);
    const opts = h("div", { class: "options" });
    card.choices.forEach((ch, i) => {
      const danger = _CONFLICT_ARCH.has(ch.arch);
      const btn = h("button", { class: "opt-btn" + (danger ? " danger" : "") }, [
        h("span", { class: "opt-num" }, CIRCLED[i] || String(i + 1)),
        h("span", { class: "opt-label" }, ch.label),
        h("span", { class: "opt-eff" }, choiceSummary(ch)),
      ]);
      btn.addEventListener("click", () => { if (node._finish) node._finish(i); });
      opts.appendChild(btn);
    });
    node.appendChild(opts);
    return new Promise((resolve) => {
      node._finish = (v) => resolve(v);
      present(node);
    });
  }
  afterCard(state, card, choiceOf) {
    STATE = state; renderLog(state);
    const node = h("div", { class: "panel" }, [
      h("h2", { class: "panel-title" }, "公开结算"),
      h("p", { class: "panel-desc" }, `《${card.title}》的结果：`),
    ]);
    const list = h("div", { class: "settle-list" });
    state.aliveActors().forEach((a) => {
      const ch = choiceOf[a.idx];
      if (!ch) return;
      const s = `${a.isPlayer ? "你" : a.name}：${ch.label}（${choiceSummary(ch)}）`;
      list.appendChild(h("div", { class: "settle-row" + (a.isPlayer ? " me" : "") }, s));
    });
    node.appendChild(list);
    node.appendChild(h("p", { class: "panel-desc" }, `当前冲突度：${state.chaos.toFixed(0)}`));
    const btn = h("button", { class: "continue-btn" }, "继续 ▶");
    node.appendChild(btn);
    return new Promise((resolve) => {
      node._finish = () => resolve(null);
      btn.addEventListener("click", () => { if (node._finish) node._finish(); });
      present(node, state.observer ? 900 : 1500);
    });
  }
  async noonTalk(state) {
    STATE = state; state.phase = "noon_talk"; renderLog(state);
    if (!state.player().alive) return null;
    const others = state.aliveActors().filter((a) => !a.isPlayer);
    const target = await pickFromPanel({
      title: "午间密谈",
      desc: "选择一位同事私聊（或跳过）：",
      options: others.map((a) => ({ label: `${a.name}（${TIER_LABEL[a.tier]}）`, value: a.idx }))
        .concat([{ label: "跳过密谈", value: null }]),
    });
    if (target === null || target === undefined) {
      state.logMsg(`[D${state.day}] 你跳过了午间密谈。`); renderLog(state); return null;
    }
    const t = state.actors[target];
    const stance = await pickFromPanel({
      title: "午间密谈 · 话题",
      desc: `你与 ${t.name} 私下交谈，想……`,
      options: [
        { label: "套近乎（增进彼此信任）", value: "warm" },
        { label: "试探派系（获取情报，略有风险）", value: "probe" },
        { label: "释放假消息（扰乱对方判断）", value: "fake" },
      ],
    });
    if (stance === "warm") {
      state.player().trust[target] = clamp((state.player().trust[target] || 0) + 5, -100, 100);
      t.trust[0] = clamp((t.trust[0] || 0) + 3, -100, 100);
      state.logMsg(`[D${state.day}] 你与 ${t.name} 推心置腹，关系近了些。`);
    } else if (stance === "probe") {
      nudgeBelief(state.player(), t, state._diff.intel_accuracy);
      t.trust[0] = clamp((t.trust[0] || 0) - 1, -100, 100);
      state.logMsg(`[D${state.day}] 你试探了 ${t.name} 的底细，对方有所察觉。`);
    } else if (stance === "fake") {
      nudgeBelief(state.player(), t, state._diff.intel_accuracy);
      t.trust[0] = clamp((t.trust[0] || 0) - 3, -100, 100);
      state.chaos = clamp(state.chaos + 1, 0, 100);
      state.logMsg(`[D${state.day}] 你给 ${t.name} 放了点烟雾弹。`);
    }
    renderLog(state); renderRoster(state);
    return target;
  }
  async nightAction(state) {
    STATE = state; state.phase = "night"; renderLog(state);
    if (!state.player().alive) return null;
    const p = state.player();
    const abilities = nightAbilities(p.tier);
    const ability = await pickFromPanel({
      title: "夜间行动",
      desc: `（${TIER_LABEL[p.tier]}）选择一项夜间能力：`,
      options: abilities.map((a) => ({ label: a.label, value: a.id, sub: a.desc })),
    });
    if (!ability) return null;
    const others = state.aliveActors().filter((a) => !a.isPlayer);
    const target = await pickFromPanel({
      title: "夜间行动 · 目标",
      desc: `对谁使用「${abilityLabel(ability)}」？（或跳过）`,
      options: others.map((a) => ({ label: `对 ${a.name}`, value: a.idx }))
        .concat([{ label: "跳过", value: null }]),
    });
    if (target === null || target === undefined) return null;
    const t = state.actors[target];
    applyNightAbility(p, ability, t, state);
    renderLog(state); renderRoster(state);
    return [ability, target];
  }
  async assemblySpeech(state) {
    STATE = state; state.phase = "assembly"; renderLog(state);
    if (!state.player().alive) return ["deflect", null];
    const others = state.aliveActors().filter((a) => !a.isPlayer);
    const t = await pickFromPanel({
      title: "联席会议 · 发言",
      desc: "你要如何表态？",
      options: [
        { label: "指认某人", value: "accuse" },
        { label: "自辩", value: "defend" },
        { label: "转移话题", value: "deflect" },
      ],
    });
    if (t === "accuse") {
      const tgt = await pickFromPanel({
        title: "指认谁？",
        desc: "把矛头指向谁？",
        options: others.map((a) => ({ label: a.name, value: a.idx }))
          .concat([{ label: "算了，不指认", value: null }]),
      });
      if (tgt === null || tgt === undefined) return ["deflect", null];
      return ["accuse", tgt];
    }
    return [t, null];
  }
  async assemblyBribe(state) {
    STATE = state; renderLog(state);
    if (!state.player().alive) return 0;
    const cap = state._diff.bribe_cap;
    const cost = TUNING.PRICES.buy_vote;
    const p = state.player();
    const n = await pickFromPanel({
      title: "买票",
      desc: `${cost} 万/票，上限 ${cap} 票，你现有 ${p.cash.toFixed(0)} 万。购买几张票以降低自己被投出的概率？`,
      options: range(cap + 1).map((k) => ({ label: `买 ${k} 票` + (k ? `（花 ${k * cost} 万）` : ""), value: k })),
    });
    return n || 0;
  }
  async assemblyVote(state, candidates) {
    STATE = state; renderLog(state);
    if (!state.player().alive) return null;
    const t = await pickFromPanel({
      title: "联席会议 · 投票",
      desc: "把票投给谁？（或弃票）",
      options: candidates.filter((a) => !a.isPlayer).map((a) => ({
        label: `${a.name}（${TIER_LABEL[a.tier]}·声望${a.influence.toFixed(0)}）`, value: a.idx,
      })).concat([{ label: "弃票", value: null }]),
    });
    return t;
  }
  gameOver(state, result) {
    STATE = state; state.result = result;
    showEndScreen(result);
  }
}
function nudgeBelief(obs, tgt, accuracy) {
  const b = obs.belief[tgt.idx] || [0.25, 0.25, 0.25, 0.25];
  const fi = FIDX[tgt.faction];
  const boost = 0.3 * (accuracy !== undefined ? accuracy : 0.75);
  for (let k = 0; k < 4; k++) b[k] *= (k === fi ? (1 + boost) : (1 - boost * 0.5));
  const s = b.reduce((x, y) => x + y, 0) || 1;
  obs.belief[tgt.idx] = b.map((x) => clamp(x / s, 0, 1));
}
function nightAbilities(tier) {
  if (tier === "employee") return [
    { id: "打探消息", label: "打探消息", desc: "旁敲侧击，套取口风" },
    { id: "施压", label: "施压", desc: "给对方悄悄加压" },
  ];
  if (tier === "mid") return [
    { id: "施压", label: "施压", desc: "给对方悄悄加压" },
    { id: "调阅背景", label: "调阅背景", desc: "翻查对方底细" },
  ];
  return [
    { id: "调阅背景", label: "调阅背景", desc: "翻查对方底细" },
    { id: "挪预算", label: "挪预算", desc: "暗中调度资源" },
  ];
}
function abilityLabel(id) {
  const all = [].concat(...["employee", "mid", "senior"].map(nightAbilities));
  const f = all.find((a) => a.id === id);
  return f ? f.label : id;
}
function applyNightAbility(player, ability, t, state) {
  if (ability === "施压") {
    t.stress = clamp(t.stress + 3, 0, 100);
    player.trust[t.idx] = clamp((player.trust[t.idx] || 0) - 2, -100, 100);
    state.logMsg(`[D${state.day}] 你夜里给 ${t.name} 施了压。`);
  } else if (ability === "调阅背景") {
    nudgeBelief(player, t, state._diff.intel_accuracy);
    state.logMsg(`[D${state.day}] 你调阅了 ${t.name} 的背景资料。`);
  } else if (ability === "挪预算") {
    player.cash = clamp(player.cash + 6, -30, 300);
    t.cash = clamp(t.cash - 6, -30, 300);
    state.logMsg(`[D${state.day}] 你挪了点预算，${t.name} 那儿少了些。`);
  } else if (ability === "打探消息") {
    nudgeBelief(player, t, state._diff.intel_accuracy * 0.6);
    state.logMsg(`[D${state.day}] 你向 ${t.name} 打探到一些口风。`);
  }
}
function showEndScreen(result) {
  if (!DOM) return;
  DOM.game.hidden = true;
  DOM.end.hidden = false;
  DOM.end.innerHTML = "";
  if (typeof window !== "undefined" && window.scrollTo) window.scrollTo(0, 0);
  const outcomeText = { win: "胜利", lose: "失败", observer: "旁观结局" }[result.outcome] || result.outcome;
  const outcomeColor = { win: "#E8C070", lose: "#D6453D", observer: "#B8A988" }[result.outcome] || "#F0E6D2";

  const titleEl = h("h1", { class: "end-title", style: `color:${outcomeColor}` }, result.title);
  const sub = h("div", { class: "end-sub" },
    `结局：${outcomeText}　评级：${result.rating}　派系目标：${result.factionAlias}/${result.factionTier}　副目标：${result.subOk ? "达成" : "未达成"}`);
  const stats = h("div", { class: "end-stats" }, [
    statLine("难度", result.difficulty),
    statLine("你的档位", TIER_LABEL[result.playerTier] || result.playerTier),
    statLine("权力分", String(result.powerScore)),
    statLine("夺客户", String(result.clientsTaken)),
    statLine("失客户", String(result.clientsLost)),
    statLine("最终冲突度", String(result.chaos)),
  ]);
  const table = h("div", { class: "reveal-table" });
  table.appendChild(h("div", { class: "reveal-row head" }, [
    h("span", {}, "姓名"), h("span", {}, "派系"), h("span", {}, "档位"),
    h("span", {}, "状态"), h("span", {}, "声望"), h("span", {}, "压力"), h("span", {}, "预算"),
  ]));
  for (const r of result.reveal) {
    const status = r.alive ? "存活" : `D${r.outDay}出局`;
    const col = r.isPlayer ? "#F0E6D2" : factionColor(r.faction);
    table.appendChild(h("div", { class: "reveal-row" + (r.isPlayer ? " me" : "") }, [
      h("span", { style: `color:${col}` }, r.name + (r.isPlayer ? "（你）" : "")),
      h("span", { style: `color:${factionColor(r.faction)}` }, r.factionAlias),
      h("span", {}, TIER_LABEL[r.tier] || r.tier),
      h("span", {}, status),
      h("span", {}, String(r.influence)),
      h("span", {}, String(r.stress)),
      h("span", {}, String(r.cash)),
    ]));
  }
  const restart = h("button", { class: "continue-btn big" }, "重新开始");
  restart.addEventListener("click", () => { DOM.end.hidden = true; DOM.start.hidden = false; DOM.game.hidden = true; });

  DOM.end.appendChild(titleEl);
  DOM.end.appendChild(sub);
  DOM.end.appendChild(stats);
  DOM.end.appendChild(h("h3", { class: "reveal-h" }, "终局揭示"));
  DOM.end.appendChild(table);
  DOM.end.appendChild(restart);
}
function statLine(k, v) { return h("div", { class: "stat-line" }, [h("span", { class: "stat-k" }, k + "："), h("span", { class: "stat-v" }, v)]); }

/* ============================ 11. 启动 / 绑定 ============================ */
function initApp() {
  DOM = {
    start: document.getElementById("start-screen"),
    game: document.getElementById("game-screen"),
    end: document.getElementById("end-screen"),
    stage: document.getElementById("stage"),
    roster: document.getElementById("roster"),
    log: document.getElementById("log"),
    dayLabel: document.getElementById("day-label"),
    goalLabel: document.getElementById("goal-label"),
    metaLine: document.getElementById("meta-line"),
    stressOverlay: document.getElementById("stress-overlay"),
    bar_influence: document.getElementById("bar-influence"),
    bar_stress: document.getElementById("bar-stress"),
    bar_cash: document.getElementById("bar-cash"),
    val_influence: document.getElementById("val-influence"),
    val_stress: document.getElementById("val-stress"),
    val_cash: document.getElementById("val-cash"),
  };
  const startBtn = document.getElementById("start-btn");
  if (startBtn) startBtn.addEventListener("click", onStart);
  // 键盘 1-6 选择当前焦点选项（无障碍）
  document.addEventListener("keydown", (e) => {
    if (!DOM || DOM.game.hidden) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 6) {
      const opts = DOM.stage.querySelectorAll(".opt-btn");
      if (opts[n - 1]) { e.preventDefault(); opts[n - 1].click(); }
    }
  });
}
function onStart() {
  const diffSel = document.querySelector('input[name="difficulty"]:checked');
  const tierSel = document.querySelector('input[name="tier"]:checked');
  const seedInput = document.getElementById("seed-input");
  const difficulty = diffSel ? diffSel.value : "medium";
  const playerTier = tierSel ? tierSel.value : null;
  let seed = null;
  if (seedInput && seedInput.value.trim() !== "") {
    const s = parseInt(seedInput.value.trim(), 10);
    if (!isNaN(s)) seed = s >>> 0;
  }
  if (seed === null) seed = (Date.now() >>> 0) ^ Math.floor(Math.random() * 0xffffffff);

  DOM.start.hidden = true;
  DOM.end.hidden = true;
  DOM.game.hidden = false;
  if (typeof window !== "undefined" && window.scrollTo) window.scrollTo(0, 0);
  CURRENT_CONTROLLER = new GUIController();
  runGame(difficulty, TUNING.NUM_ACTORS, playerTier, CURRENT_CONTROLLER, seed)
    .catch((err) => {
      console.error(err);
      alert("运行出错：" + (err && err.message ? err.message : err));
    });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initApp);
  else initApp();
}

/* ============================ 12. Node 无头导出 ============================ */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    RNG, Actor, GameState, setupWorld, runGame, runHeadless, RandomController,
    Controller, evaluateGoal, evaluateSubGoal, finalJudge, TUNING, CARDS, CARD_META,
  };
}
