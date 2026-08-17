// 《职场营销博弈》牌库构建脚本（内容工具，非游戏实现代码）
// 输入：_cards_source.mjs（策划授权的中文文本 + 选项原型）
// 输出：cards.json（256 张情况牌，机器可读，工程直接消费）
// 运行：node design/cards/_build_cards.mjs
import { SOURCE } from './_cards_source.mjs';
import { writeFileSync } from 'node:fs';

const F = ['FV_A', 'FV_B', 'FV_C', 'FV_D'];

// 选项原型基线（效用骨架）：inf=声望 str=压力 cash=现金；ft=对派系角色的信任影响
// 角色 own=本卡语境的"己方/主张方" rival=对立方 ally=可结盟方 third=第三方
const ARCH = {
  obey:    { label: '服从上意', inf: 2, str: 3, cash: 0, ft: { own: 2, rival: -1 } },
  grind:   { label: '硬扛硬做', inf: 3, str: 5, cash: 0, ft: { own: 2, third: 1 } },
  betray:  { label: '背刺踩人', inf: 5, str: 4, cash: 1, ft: { own: 3, rival: -6 } },
  ally:    { label: '结盟交换', inf: 3, str: 2, cash: 1, ft: { own: 2, ally: 4 } },
  expose:  { label: '揭发摊牌', inf: 4, str: 5, cash: 0, ft: { own: 3, rival: -7 } },
  self:    { label: '自保推责', inf: -1, str: -3, cash: 1, ft: { own: -1, rival: 1 } },
  hedge:   { label: '观望模糊', inf: 0, str: -1, cash: 0, ft: { own: 1, rival: 1 } },
  dodge:   { label: '走流程回避', inf: -1, str: 1, cash: 0, ft: { own: 1, ally: -1 } },
  invest:  { label: '花钱办事', inf: 3, str: -1, cash: -5, ft: { own: 3, rival: -1 } },
  risk:    { label: '赌一把', inf: 6, str: 6, cash: -2, ft: { own: 4, rival: -3 } },
  shield:  { label: '护人担责', inf: 1, str: 6, cash: 0, ft: { ally: 5, own: 1 } },
  leak:    { label: '放话泄底', inf: 2, str: 4, cash: 0, ft: { rival: -5, third: 2 } },
  bow:     { label: '服软道歉', inf: -2, str: -2, cash: 0, ft: { own: 1, rival: 2 } },
  cashin:  { label: '落袋变现', inf: 0, str: 3, cash: 6, ft: { own: -1, third: 2 } },
};
const BASELINE_ARCH = new Set(['hedge', 'dodge']); // 保底选项：三项 |Δ| 必 ≤2

const CATEGORY_ORDER = ['背锅', '站队', '竞品', '绩效', '汇报', '团建', '反腐', '晋升', '客户', '舆情', '加班', '会议'];

// tier 复核：以下牌情境对三档角色同样成立，统一放宽为 any（平衡 tier 分布，避免 mid 过载）
const TIER_ANY = new Set([
  '谁动了排期', '双签风险',
  '数据修饰', '跨部门互评', '认领难指标', '打分的交易',
  '三页还是三十页', '红色的数字', '领导改稿', '来源模糊化', '归因的写法', '纪要谁写',
  '谁买单', '家属日', '酒量与信任', '批斗会', '生日会的座次', '户外拓展的意外', '团队口号',
  '匿名帖', '谣言的源头', '删帖', '行业群传闻',
  '周末的电话', '家庭与截止日', '加班记录', '通宵后的汇报', '无效会议',
  '主位', '迟到的高层', '议程被改', '会中私聊', '拉长的会议', '决议的模糊化', '会后会', '提问的顺序',
]);
// 允许触达 ±9~10 的高烈度原型；其余原型上限 ±8，控制"极端选项"占比 ≤5%
const EXTREME_ARCH = new Set(['risk', 'expose', 'invest', 'cashin']);

// ---- 确定性伪随机（保证每次构建结果一致，便于工程 diff）----
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const jit = (r, span) => Math.round((r() * 2 - 1) * span);

// ---- 主构建 ----
const cards = [];
let gi = 0;
const dupCheck = new Map();
const ftRunning = { FV_A: 0, FV_B: 0, FV_C: 0, FV_D: 0 };

for (const cat of CATEGORY_ORDER) {
  const list = SOURCE[cat];
  if (!list) throw new Error(`缺少 category: ${cat}`);
  for (const [title, tier, text, tags, choices] of list) {
    gi += 1;
    const id = 'C' + String(gi).padStart(3, '0');
    if (dupCheck.has(title)) throw new Error(`标题重复: ${title} (${id} / ${dupCheck.get(title)})`);
    dupCheck.set(title, id);
    if (choices.length < 4) throw new Error(`${id} 选项不足 4 个`);

    const cr = rng(hash(id + '|card'));
    const intensity = [0.8, 1.0, 1.25][Math.floor(cr() * 3)]; // 烈度分层

    const built = choices.map((c, ci) => {
      const [label, archKey] = c;
      const a = ARCH[archKey];
      if (!a) throw new Error(`${id} 未知原型: ${archKey}`);
      const r = rng(hash(`${id}|${ci}|${archKey}`));
      const low = BASELINE_ARCH.has(archKey);
      const sc = low ? 1 : intensity;
      let inf = Math.round(a.inf * sc) + jit(r, low ? 1 : 2);
      let str = Math.round(a.str * sc) + jit(r, low ? 1 : 2);
      let cash = Math.round(a.cash * sc) + (a.cash === 0 ? jit(r, low ? 1 : 1) : jit(r, 2));
      const lim = low ? 2 : (EXTREME_ARCH.has(archKey) ? 10 : 8);
      inf = clamp(inf, -lim, lim); str = clamp(str, -lim, lim); cash = clamp(cash, -lim, lim);
      if (inf === 0 && str === 0 && cash === 0) str = low ? -1 : 1;

      // 先以"角色"记账（own/rival/ally/third），稍后统一映射到具体派系
      const ftRole = {};
      for (const [role, val] of Object.entries(a.ft)) {
        const v = clamp(Math.round(val * sc) + jit(r, 1), -10, 10);
        if (v !== 0) ftRole[role] = v;
      }
      if (Object.keys(ftRole).length === 0) ftRole.own = 1;
      // 30% 概率追加一条第三方涟漪，制造更立体的派系连带
      if (r() < 0.3 && !('third' in ftRole)) ftRole.third = clamp(jit(r, 2) || 1, -3, 3);

      return { id: 'abcdefgh'[ci], label: label.trim(), arch: archKey, effects: { player: { influence: inf, stress: str, cash }, ftRole } };
    });

    // 派系映射：在 24 种角色→派系排列中选一种，使全库四家 faction_trust 累计和最均衡
    {
      const contribRole = { own: 0, rival: 0, ally: 0, third: 0 };
      for (const b of built) for (const [role, v] of Object.entries(b.effects.ftRole)) contribRole[role] += v;
      const ROLES = ['own', 'rival', 'ally', 'third'];
      let bestPerm = null, bestCost = Infinity;
      const permute = (arr, cur = []) => {
        if (!arr.length) {
          const cand = {}; ROLES.forEach((rl, i) => cand[rl] = cur[i]);
          let cost = 0;
          for (const f of F) { const s = ftRunning[f] + (contribRole[ROLES[cur.indexOf(f)]] || 0); cost += s * s; }
          if (cost < bestCost) { bestCost = cost; bestPerm = cand; }
          return;
        }
        for (let i = 0; i < arr.length; i++) permute([...arr.slice(0, i), ...arr.slice(i + 1)], [...cur, arr[i]]);
      };
      permute(F);
      for (const b of built) {
        const ft = {};
        for (const [role, v] of Object.entries(b.effects.ftRole)) ft[bestPerm[role]] = v;
        b.effects.faction_trust = ft;
        delete b.effects.ftRole;
      }
      for (const rl of ROLES) ftRunning[bestPerm[rl]] += contribRole[rl];
    }

    // 约束 1：至少一个保底选项（三项 |Δ| ≤ 2）
    const hasBaseline = built.some(b => Math.abs(b.effects.player.influence) <= 2 && Math.abs(b.effects.player.stress) <= 2 && Math.abs(b.effects.player.cash) <= 2);
    if (!hasBaseline) {
      const t = built.map((b, i) => [i, Math.abs(b.effects.player.influence) + Math.abs(b.effects.player.stress) + Math.abs(b.effects.player.cash)]).sort((x, y) => x[1] - y[1])[0][0];
      const p = built[t].effects.player;
      p.influence = clamp(p.influence, -2, 2); p.stress = clamp(p.stress, -2, 2); p.cash = clamp(p.cash, -2, 2);
    }

    // 约束 2：消除牌内帕累托支配（防主导策略）
    const better = (a, b) => a.influence >= b.influence && a.stress <= b.stress && a.cash >= b.cash &&
      (a.influence > b.influence || a.stress < b.stress || a.cash > b.cash);
    for (let guard = 0; guard < 8; guard++) {
      let fixed = false;
      for (const b of built) {
        const p = b.effects.player;
        if (built.filter(o => o !== b).every(o => better(p, o.effects.player))) {
          if (p.stress < 10) p.stress += 2; else p.influence -= 1;
          fixed = true;
        }
      }
      if (!fixed) break;
    }

    cards.push({ id, title, tier: TIER_ANY.has(title) ? 'any' : tier, category: cat, text, tags, choices: built });
  }
}

if (cards.length !== 256) throw new Error(`卡牌总数 ${cards.length} != 256`);

// ---- 统计与自检 ----
const catCount = {}; const tierCount = {}; const ftSum = { FV_A: 0, FV_B: 0, FV_C: 0, FV_D: 0 };
let choiceTotal = 0, extremes = 0;
for (const c of cards) {
  catCount[c.category] = (catCount[c.category] || 0) + 1;
  tierCount[c.tier] = (tierCount[c.tier] || 0) + 1;
  for (const ch of c.choices) {
    choiceTotal++;
    const p = ch.effects.player;
    if (Math.abs(p.influence) >= 9 || Math.abs(p.stress) >= 9 || Math.abs(p.cash) >= 9) extremes++;
    for (const [f, v] of Object.entries(ch.effects.faction_trust)) ftSum[f] += v;
  }
}

const meta = {
  schema_version: '1.0',
  project: '职场营销博弈 (Office Marketing Gambit)',
  doc_owner: 'design-strategist 文策渊',
  generated_at: new Date().toISOString().slice(0, 10),
  card_count: cards.length,
  id_range: 'C001-C256',
  choice_count: choiceTotal,
  tiers: ['employee', 'mid', 'senior', 'any'],
  tier_distribution: tierCount,
  categories: CATEGORY_ORDER,
  category_distribution: catCount,
  factions: {
    FV_A: { name: '华锐-西盟合资', alias: '锐盟', goal: '吞并份额' },
    FV_B: { name: '中衡-明德合资', alias: '衡明', goal: '守住客户' },
    FV_C: { name: '星海-科盛合资', alias: '星海', goal: '上位夺权' },
    FV_D: { name: '长盛-合安合资', alias: '长安', goal: '平稳落地' },
    _note: '中文命名待主理人拍板：美术圣经使用 赤霄(FV_A)/苍澜(FV_B)/紫宸(FV_C)/鎏金汇(FV_D)，映射见 design/concept/game-concept.md §6.1。FV_A~FV_D 代号稳定，改名不影响本文件的 faction_trust 键。',
  },
  effects: {
    player_resources: {
      influence: '声望 0-100，公开影响力；卡牌 Δ 范围 -10..10',
      stress: '压力 0-100，100 崩溃出局；卡牌 Δ 范围 -10..10',
      cash: '现金/可动用预算（万元），可负至 -30；卡牌 Δ 范围 -10..10',
    },
    faction_trust: '写入全局 faction_trust[FV_x]，同时作为 AI belief 更新的证据向量；范围 -10..10',
    note: '数值对“执行该选项的角色”生效；引擎需再乘 tier 适配、性格与难度系数（见 gdd-core 系统④/⑦）',
  },
  choice_archetypes: Object.fromEntries(Object.entries(ARCH).map(([k, v]) => [k, v.label])),
  invariants: [
    '每张牌 ≥4 个选项，且至少 1 个保底选项（三项 |Δ| ≤ 2）',
    '牌内不存在帕累托支配选项（构建时已强制消除）',
    'id 唯一且稳定；title 全库不重复',
    'faction_trust 四家总和偏差需 ≤8%（见 build_stats）',
  ],
  build_stats: { faction_trust_sum: ftSum, extreme_choice_count: extremes },
  consumer_hint: 'PyInstaller 打包时以 --add-data 方式内嵌；运行时优先读取 exe 同目录的外部 cards.json 以便热更',
};

writeFileSync(new URL('./cards.json', import.meta.url), JSON.stringify({ meta, cards }, null, 1), 'utf8');
console.log('cards:', cards.length, 'choices:', choiceTotal);
console.log('category:', JSON.stringify(catCount));
console.log('tier:', JSON.stringify(tierCount));
console.log('faction_trust_sum:', JSON.stringify(ftSum), 'extremes:', extremes);
