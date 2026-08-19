// 生成《职场营销博弈》372 张嵌套卡：60 大事件 / 240 小事件 / 72 随机事件。
// 读取 tools/campaign_source.js 的可见文案，按 convert_to_web.js 同款归一化逻辑把选项
// 展平为 player{influence,stress,cash,performance,network} / faction_trust{FV_A..FV_D}，
// 并为每卡计算 quadrants{sp,sa,rp,ra}（四象限：稳消/稳积/激消/激积）与 flavor、desc、consequence。最终写：
//   design/cards/campaign.json  （原始源，便于审阅）
//   web/cards.js  ==  docs/cards.js  （字节一致，CARDS 平铺 + CAMPAIGN 分组）
//
// 用法：node tools/gen_campaign.js
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WEB = path.join(ROOT, "web");
const DOCS = path.join(ROOT, "docs");
const { MAJORS, RANDOMS } = require("./campaign_source.js");

const FACTIONS = ["FV_A", "FV_B", "FV_C", "FV_D"];
const FACTION_TAG = { FV_A: "抢单", FV_B: "维稳", FV_C: "上位", FV_D: "降压" };

// ---- 四象限映射 / 富文案词池（依据 design/gdd/quadrant-system.md §A/§B） ----
// 规范位置顺序：索引 0=SP(稳消·左下) 1=SA(稳积·左上) 2=RP(激消·右下) 3=RA(激积·右上)
const POS_QUADRANT = ["stable_passive", "stable_active", "risky_passive", "risky_active"];
const POS_SHORT = { stable_passive: "sp", stable_active: "sa", risky_passive: "rp", risky_active: "ra" };
// 纵轴姿态集合：消极(P=收缩自保) / 积极(A=扩张联结)；SA 仅取温和扩张池，RA 取高险扩张池
const PASSIVE_ARR = ["hedge", "dodge", "obey", "self", "bow", "cashin"];
const ACTIVE_SA = ["ally", "shield", "leak", "grind"];
const ACTIVE_RA = ["invest", "betray", "expose", "risk"];
const ARCH_SET = {
  stable_passive: PASSIVE_ARR,
  stable_active: ACTIVE_SA,
  risky_passive: PASSIVE_ARR,
  risky_active: ACTIVE_RA,
};
function sideFor(q) { return (q === "stable_passive" || q === "stable_active") ? "left" : "right"; }
function pickFrom(arr, rng) { return arr[ri(rng, 0, arr.length - 1)]; }
// 尊重手写/对齐的 arch（在象限池内则保留）；否则按象限池确定性补位（解耦 side/arch，修复旧 2×left+2×right 填不满坑）
function resolveArch(q, specArch, rng) {
  const set = ARCH_SET[q];
  if (specArch && set.indexOf(specArch) >= 0) return specArch;
  return pickFrom(set, rng);
}

// QUAD_FRAME：desc 前缀（固定 4 条）
const QUAD_FRAME = {
  stable_passive: "你选择蛰伏守成",
  stable_active: "你选择稳健经营",
  risky_passive: "你选择险中求稳",
  risky_active: "你选择放手一搏",
};
// CAT_CONTEXT：每类目 1 条场景 clause（用于 desc 拼接；缺失则省略）
const CAT_CONTEXT = {
  "入职": "把入职流程走顺，不抢风头", "职场关系": "在午饭圈与工位边摸清水面下的边界",
  "站队": "在明暗两路里挑一条跟", "家庭": "在亲人关切和现实之间找平衡",
  "客户": "在单子和口碑之间做取舍", "审计": "在材料与口径之间周旋",
  "绩效": "在分数和坑位之间博弈", "危机": "在爆雷前把火按下去",
  "调动": "在留任与挪窝之间观望", "裁员": "在名单边缘给自己加权重",
  "空降": "在新老势力夹缝里找位置", "并购": "在整合浪潮里押注或自保",
  "年终奖": "在签字和争抢之间拿捏", "出差": "在驻点和家里之间两头顾",
  "反腐": "在清白和牵连之间划界", "背锅": "在甩锅与扛锅之间决断",
  "挖角": "在忠诚和身价之间衡量", "团建": "在合群和出头之间拿捏",
  "向上管理": "在顶撞和顺从之间找缝", "投诉": "在回应和冷处理之间选择",
  "供应链": "在交付和产能之间调度", "述职": "在讲完和抢镜之间取舍",
  "借调": "在历练和归处之间盘算", "师徒": "在体面和独立之间周旋",
  "离职": "在体面走和留遗产之间选", "审批": "在等批和硬推之间施压",
  "数据": "在口径和真相之间站队", "饭局": "在敬酒和套话之间游走",
  "举报": "在揭发和自保之间抉择", "期权": "在行权与观望之间下注",
  "瓶颈": "在熬和冲之间找突破口", "竞品": "在守价和应战之间布防",
  "汇报": "在试错和押注之间申报", "舆情": "在沉默和回应之间控场",
  "请假": "在硬请和忍着之间权衡", "偶遇": "在寒暄和套口风之间应变",
  "失误": "在认错和甩锅之间补救", "群聊": "在撤回和搅局之间收场",
  "加班": "在硬扛和揽活之间取舍", "八卦": "在听和传之间留个心眼",
  "送礼": "在随流和谋利之间拿捏", "误会": "在解释和对质之间了断",
  "聚餐": "在坐和撑场之间选位", "邮件": "在降温和回击之间落笔",
  "批评": "在认了和辩白之间收尾", "生日": "在低调与拉拢之间张罗",
  "培训": "在坐完和抢镜之间取舍", "投票": "在跟票和换人情之间盘算",
  "对账": "在挂账和硬查之间平账", "系统": "在摸索和催急之间提效",
  "体检": "在硬扛和养生之间妥协", "报销": "在重贴和施压之间拿回",
  "表扬": "在谦逊和邀功之间张弛", "表白": "在拒绝和回应之间留余地",
  "饭局2": "在配合和挑大梁之间掌勺",
};
// STAKES：每类目 1 条利害关系句（用于 card.text 扩写；兜底 GENERIC_STAKES）
const STAKES = {
  "入职": "这一步怎么走，基本定了你前半年是透明人还是靶子。",
  "站队": "站错一步，后面半年的资源都跟你无关。",
  "职场关系": "这桌谁带你，决定了半年后谁在关键时刻挺你。",
  "家庭": "家里支不支持，决定了你扛不扛得住前两年的折腾。",
  "客户": "这一单成不成，是你下季度话语权的底色。",
  "审计": "口径差一个字，锅就可能焊别人或自己身上。",
  "绩效": "数字背后是明年的坑位和票仓。",
  "危机": "这一晚兜不兜得住，决定你下周还在不在名单里。",
  "调动": "挪不挪，决定了你接下来贴的是谁的进度表。",
  "裁员": "这一轮活下来，才有资格谈下一轮。",
  "空降": "新老板来路不明，你头三个月站位是生死线。",
  "并购": "整合一旦落定，旧账新仇一起算。",
  "年终奖": "这一笔拿多少，写明了你在老板心里的排位。",
  "出差": "驻点表现，直接换算成回不回得去的筹码。",
  "反腐": "风头过了，被记的账不会自己消。",
  "背锅": "锅要么甩出去，要么焊死在自己背上。",
  "挖角": "这份 offer 是跳板还是陷阱，三个月后见分晓。",
  "团建": "合不合群，决定了有事时有没有人替你挡一句。",
  "向上管理": "顶一句和顺一句，差的是半年的信任余额。",
  "投诉": "回不回应，决定了这件事是过去还是被放大。",
  "供应链": "产能卡不卡脖子，看这一环谁说了算。",
  "述职": "讲没讲到位，决定了明年预算往谁那边倾斜。",
  "借调": "借出去容易，调回来难。",
  "师徒": "这层情分，是护身符也是枷锁。",
  "离职": "走得体不体面，决定了行业里还有没有人接你电话。",
  "审批": "卡一天，项目就慢一周，账算在谁头上。",
  "数据": "口径谁定，谁就掌握了叙事权。",
  "饭局": "酒桌上的每句闲话，都是明天的筹码。",
  "举报": "实名一出，就没有中间地带了。",
  "期权": "行权窗口一关，纸面富贵就成过眼云烟。",
  "瓶颈": "熬还是冲，决定了你是被沉淀还是被看见。",
  "竞品": "这一仗防守还是进攻，定了份额的走向。",
  "汇报": "报多大，决定了后面要交多大的账。",
  "舆情": "控不控得住，决定了事件是翻篇还是上热搜。",
  "请假": "请不请得动，照见你在组织里的分量。",
  "偶遇": "这一句寒暄，可能是情报也可能是埋雷。",
  "失误": "补不补得圆，决定了这是事故还是污点。",
  "群聊": "一句话发出去，就收不回语境了。",
  "加班": "揽不揽得动，决定了功劳簿上写谁的名。",
  "八卦": "听进去了，就等于站了队。",
  "送礼": "礼轻重之间，是人情也是把柄。",
  "误会": "解释不解释，决定了裂痕是缝上还是撕开。",
  "聚餐": "坐哪、走没走，别人都看在眼里。",
  "邮件": "落笔即留痕，措辞就是立场。",
  "批评": "认不认得巧，决定了印象是翻篇还是记账。",
  "生日": "谁到谁不到，是一张现成的站队表。",
  "培训": "抢不抢得着镜，决定了你被看见几次。",
  "投票": "这一票换的，不止是人情。",
  "对账": "账平不平，藏着谁动过手。",
  "系统": "卡不卡得住，暴露的是流程还是人。",
  "体检": "身体亮不亮灯，决定了你能熬几个夜。",
  "报销": "核不核得回，写明了规矩对谁松。",
  "表扬": "邀不邀得功，决定了下次资源往哪流。",
  "表白": "应不应对，改的是两人也改的是局。",
  "饭局2": "掌不掌得住勺，决定了这桌听谁的。",
};
const GENERIC_STAKES = "这一步怎么选，后面都有人记着。";

// consequence：Δ→文案（取 |Δ|>=2 前 2 强维 + 派系附注）
const TXT = {
  performance: (d) => d >= 3 ? "业绩有望往上走" : d >= 1 ? "业绩小幅提振" : d <= -3 ? "业绩明显吃紧" : "业绩略承压",
  network: (d) => d >= 3 ? "人脉更活络" : d >= 1 ? "人缘小好" : d <= -3 ? "人脉受损" : "人缘略凉",
  influence: (d) => d >= 3 ? "风评见涨" : d >= 1 ? "声望小升" : d <= -3 ? "口碑受挫" : "风评略损",
  energy: (d) => d >= 3 ? "能松一口气" : d >= 1 ? "压力略减" : d <= -3 ? "压力陡增" : "更累了些", // 入参 = -stress
  cash: (d) => d >= 3 ? "钱包回血" : d >= 1 ? "小有进账" : d <= -3 ? "要自掏腰包" : "小有贴补",
};
function describeConsequence(ch) {
  const dims = [
    ["performance", ch.player.performance],
    ["network", ch.player.network],
    ["influence", ch.player.influence],
    ["energy", -ch.player.stress],
    ["cash", ch.player.cash],
  ];
  const ranked = dims.filter(([, v]) => Math.abs(v) >= 2).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const parts = ranked.slice(0, 2).map(([k, v]) => TXT[k](v));
  const ft = ch.faction_trust;
  const best = Object.keys(ft).reduce((m, k) => (Math.abs(ft[k]) > Math.abs(ft[m]) ? k : m), "FV_A");
  if (Math.abs(ft[best]) >= 3) {
    parts.push(ft[best] >= 0 ? `（${FACTION_TAG[best]}派会更信你）` : `（${FACTION_TAG[best]}派会记你一笔）`);
  }
  return parts.join("，") + "。";
}
function genDesc(category, quadrant, label) {
  const frame = QUAD_FRAME[quadrant];
  const ctx = CAT_CONTEXT[category];
  return frame + "：" + label + (ctx ? "，" + ctx : "") + "。";
}
function shuffleIdx(n, rng) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

// ---- 确定性伪随机（mulberry32），保证数值可复现、web==docs ----
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rngFor(...strs) { return mulberry32(hashStr(strs.join("|"))); }
function ri(rng, lo, hi) { return Math.round(rng() * (hi - lo) + lo); }
function clampInt(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(v))); }

// ---- 选项数值生成 ----
function genPlayer(side, arch, rng) {
  let influence, stress, cash, performance, network;
  if (side === "left") {
    // 稳妥：低波动、偏正向、压力更低
    influence = ri(rng, 0, 3);
    stress = -ri(rng, 1, 4);
    cash = ri(rng, -1, 3);
    performance = ri(rng, 0, 3);
    network = ri(rng, 0, 3);
  } else {
    // 进取：高回报、高压力、幅度更大
    influence = ri(rng, 2, 5);
    stress = ri(rng, 1, 5);
    cash = ri(rng, -3, 4);
    performance = ri(rng, 2, 6);
    network = ri(rng, -2, 3);
  }
  // 行为原型微调
  const conflict = ["betray", "expose", "risk", "leak"].includes(arch);
  if (conflict) { stress -= ri(rng, 1, 3); network -= ri(rng, 1, 3); influence += ri(rng, 0, 2); }
  if (["shield", "ally"].includes(arch)) { network += ri(rng, 1, 3); stress += ri(rng, 0, 1); }
  if (arch === "invest") cash -= ri(rng, 2, 5);
  if (arch === "cashin") cash += ri(rng, 2, 5);
  if (["obey", "bow", "dodge", "hedge"].includes(arch)) { influence -= ri(rng, 0, 2); stress += ri(rng, 0, 2); }
  if (arch === "grind") { performance += ri(rng, 1, 3); stress += ri(rng, 0, 2); }
  if (arch === "self") { network -= ri(rng, 0, 2); stress -= ri(rng, 0, 2); }
  return {
    influence: clampInt(influence, -10, 10),
    stress: clampInt(stress, -10, 10),
    cash: clampInt(cash, -10, 10),
    performance: clampInt(performance, -10, 10),
    network: clampInt(network, -10, 10),
  };
}
function genFaction(lean, rng) {
  const ft = { FV_A: 0, FV_B: 0, FV_C: 0, FV_D: 0 };
  if (lean && FACTIONS.includes(lean)) {
    ft[lean] = ri(rng, 2, 6);
    // 随机一个对手派系给负向
    const others = FACTIONS.filter((f) => f !== lean);
    const neg = others[ri(rng, 0, others.length - 1)];
    ft[neg] = -ri(rng, 2, 5);
    // 其余小幅浮动，保证四派系有正有负
    for (const f of FACTIONS) if (f !== lean && f !== neg) ft[f] = ri(rng, -2, 2);
  } else {
    for (const f of FACTIONS) ft[f] = ri(rng, -2, 2);
  }
  return ft;
}
function genTags(category, arch, lean) {
  const t = [category, arch];
  if (lean && FACTION_TAG[lean]) t.push(FACTION_TAG[lean]);
  return t;
}
function normalizeChoice(spec, cardId, category) {
  const rng = rngFor(cardId, spec.id);
  const player = genPlayer(spec.side, spec.arch, rng);
  const faction_trust = genFaction(spec.lean, rng);
  const quadrant = spec.quadrant;
  const desc = genDesc(category, quadrant, spec.label);
  const consequence = describeConsequence({ player, faction_trust });
  return {
    id: spec.id,
    label: spec.label,
    arch: spec.arch || "hedge",
    side: spec.side,
    quadrant,
    player,
    faction_trust,
    tags: genTags(category, spec.arch, spec.lean),
    desc,
    consequence,
  };
}

// ---- 小事件（minor）选项自动生成：按类目池给真实感文案，左右分稳/进 ----
const CAT_LABELS = {
  "入职": { left: ["先记熟规矩", "跟着师傅学", "低调不抢戏", "把流程走顺"], right: ["主动露一手", "抢着接活", "私下探底细", "立个新人设"] },
  "站队": { left: ["含糊应一声", "两边都不得罪", "先看看风向", "装没听见"], right: ["明确站一边", "递话表忠心", "借机挖对方", "把水搅浑"] },
  "职场关系": { left: ["客气不深交", "带点零食破冰", "随大流混脸熟", "保持距离"], right: ["自己组局", "主动套近乎", "探对方底", "拉人入伙"] },
  "家庭": { left: ["报喜不报忧", "含糊带过", "听家里的", "先顾眼前"], right: ["立上进人设", "借势要支持", "留后路说法", "半真半假"] },
  "客户": { left: ["按流程稳推", "多跑两趟混脸熟", "先听客户说", "保守承诺"], right: ["让利抢单", "请客加深绑定", "硬刚竞品", "甩锅给内部"] },
  "审计": { left: ["全交材料不解释", "补正说明", "配合不主动", "等指示"], right: ["咬出前任", "暗示上司知情", "公开质疑口径", "甩锅链上游"] },
  "绩效": { left: ["接受结果", "请教改进点", "低调收尾", "认下差距"], right: ["甩数据争优", "质疑评分", "抢亮点", "倒逼资源"] },
  "危机": { left: ["连夜兜底", "拉人共担", "先保交付", "稳军心"], right: ["先斩后奏", "公开甩锅", "抢功立标", "越级上报"] },
  "调动": { left: ["按兵不动", "表忠留任", "观望风向", "装不知"], right: ["主动请缨", "放风抬价", "抢新位", "谋外部"] },
  "裁员": { left: ["装不知道", "多接核心活", "低调熬", "认命"], right: ["抢亮点自保", "联络猎头", "硬刚要补偿", "曝程序不公"] },
  "空降": { left: ["低调适应", "主动配合", "观察风向", "不抢戏"], right: ["冲前头当先锋", "摸底来路", "拉新靠山", "抢位"] },
  "并购": { left: ["不当回事", "安抚团队", "等官宣", "装傻"], right: ["押注红利", "结交对方", "抢整合位", "曝旧账"] },
  "年终奖": { left: ["默默签字", "客气谈期望", "认了", "等明年"], right: ["摆业绩硬要", "放风被挖", "争到底", "留痕自保"] },
  "出差": { left: ["服从安排", "安抚家里", "随遇而安", "少惹事"], right: ["借驻点立功", "谈补贴", "铺人脉", "谋调回"] },
  "反腐": { left: ["装傻配合", "主动交代", "撇清关联", "等风头"], right: ["咬上游", "保人换庇护", "反查线人", "曝黑幕"] },
  "背锅": { left: ["先认了再洗", "亮证据自清", "低调扛", "等机会"], right: ["甩回真凶", "拖人下水", "硬刚", "留痕自保"] },
  "挖角": { left: ["回绝专注", "拿offer当筹码", "稳住", "装没心动"], right: ["真跳竞品", "假装考虑套情报", "抬身价", "撬对方资源"] },
  "团建": { left: ["敷衍参加", "主动暖场", "不抢戏", "装合群"], right: ["比赛出风头", "挖对手组员", "抢镜", "借机站队"] },
  "向上管理": { left: ["认错谨言", "私下赔罪", "听话", "少说"], right: ["坚持专业", "绕开主管直陈", "抢功", "留痕防秋后"] },
  "投诉": { left: ["按口径闭嘴", "私聊安抚", "冷处理", "等指示"], right: ["公开回应", "甩销售承诺", "硬刚", "反查内部"] },
  "供应链": { left: ["找替代源", "拉人共担", "稳交付", "保守"], right: ["砸钱抢产能", "点名供应商", "挖渠道", "曝旧账"] },
  "述职": { left: ["稳稳讲完", "用故事拉近距离", "不炫技", "低调"], right: ["甩硬数据", "暗讽对手", "抢镜", "留一手"] },
  "借调": { left: ["当历练", "两边不深交", "低调", "等归处"], right: ["刷履历", "两头传话", "立新功", "谋实位"] },
  "师徒": { left: ["忍着体面", "恭顺准备", "不翻脸", "守旧情"], right: ["接独立项目", "揭旧账", "另立", "抢功"] },
  "离职": { left: ["照单收", "拉人分责", "体面走", "慢慢淡"], right: ["据为己有", "挖遗产", "另起炉灶", "撬客户"] },
  "审批": { left: ["耐心催办", "请人推", "等", "按规矩"], right: ["越级签", "晒卡点施压", "硬推", "曝猫腻"] },
  "数据": { left: ["服从口径", "协商折中", "不争", "等定"], right: ["推自己口径", "揭猫腻", "抢定义", "留痕"] },
  "饭局": { left: ["按吩咐办", "请教老手", "低调", "不抢话"], right: ["主动张罗", "借敬酒套话", "撑场", "探底"] },
  "举报": { left: ["装不知", "撇清关联", "配合", "等"], right: ["补刀实名", "递证据", "反咬", "搅局"] },
  "期权": { left: ["听HR观望", "咨询老员工", "保守", "等窗口"], right: ["行权落袋", "押注上市", "争更多", "杠杆"] },
  "瓶颈": { left: ["安稳熬", "拓宽人脉", "认命", "低调"], right: ["冲晋升", "谋外部", "抢项目", "转型"] },
  "竞品": { left: ["守价保利", "局部跟价", "不接招", "等"], right: ["全面应战", "挖渠道", "抢单", "曝对手"] },
  "汇报": { left: ["小步试错", "争取温和资源", "不硬刚", "稳妥"], right: ["大举押注", "挖老业务", "抢功", "留痕"] },
  "舆情": { left: ["静默等过", "私聊稳军心", "不回应", "等降温"], right: ["高调回应", "反查操纵", "硬刚", "导舆论"] },
  "请假": { left: ["忍着不去", "说明再请", "等", "低调"], right: ["找大主管批", "质疑动机", "硬请", "留痕"] },
  "偶遇": { left: ["点头走开", "自然招呼", "不深聊", "装没见"], right: ["一句汇报", "套口风", "递话", "记下来"] },
  "失误": { left: ["默默重写", "喊人恢复", "认错", "低调"], right: ["通宵补回", "赖系统bug", "抢功", "甩锅"] },
  "群聊": { left: ["秒撤回", "补表情", "不理", "装没发"], right: ["将错就错", "甩锅输入法", "搅局", "留痕"] },
  "加班": { left: ["默默留下", "协调改约", "硬扛", "等"], right: ["抢着揽", "借机要资源", "露脸", "问清谁派"] },
  "八卦": { left: ["装没听", "淡定离开", "不传", "装傻"], right: ["记下心里有数", "转述信得过的人", "反查来源", "搅局"] },
  "送礼": { left: ["随大流", "亲手写卡", "不送", "低调"], right: ["单独厚礼", "显清高", "借礼拉关系", "谋利"] },
  "误会": { left: ["不解释", "找他聊开", "等过去", "低调"], right: ["硬刚对质", "查造谣者", "借机立威", "留痕"] },
  "聚餐": { left: ["坐下不介意", "主动张罗", "随大流", "早走"], right: ["换热闹处", "抢着买单", "撑场", "探底"] },
  "邮件": { left: ["先安抚", "电话降温", "按规矩", "等"], right: ["强硬回击", "甩给上级", "抢白", "留痕"] },
  "批评": { left: ["低头认了", "会后补正", "不辩", "低调"], right: ["辩解原因", "暗示有人没配合", "抢功", "留痕"] },
  "生日": { left: ["道谢继续", "停下切蛋糕", "随份子", "低调"], right: ["请大家嗨", "多出表心意", "借机拉拢", "记谁没来"] },
  "培训": { left: ["安静坐完", "认真记", "听安排", "不抢"], right: ["提问抢镜", "拆台追问", "争名额", "露野心"] },
  "投票": { left: ["随大流", "投该得的", "弃权", "不掺和"], right: ["拿票换人情", "拉票", "谋利", "搅局"] },
  "对账": { left: ["挂账等", "重核一遍", "认了", "低调"], right: ["自掏补平", "疑心有人动", "硬查", "留痕"] },
  "系统": { left: ["慢慢摸索", "问同事", "等IT", "不急"], right: ["提优化", "催加急", "越级", "吐槽设计"] },
  "体检": { left: ["放一边", "约复查", "吃药硬扛", "不理"], right: ["立flag养生", "比谁更虚", "请假养", "借题"] },
  "报销": { left: ["按规矩重贴", "请教门道", "认核减", "低调"], right: ["找主管施压", "质疑双标", "自掏", "留痕"] },
  "表扬": { left: ["谦逊", "谢团队", "不骄", "低调"], right: ["邀功要资源", "暗讽脸红", "抢镜", "留痕"] },
  "家庭": { left: ["去公司会", "协调时间", "听家里", "让伴侣扛"], right: ["远程兼顾", "借题要支持", "硬请", "留痕"] },
  "表白": { left: ["婉拒", "说先做同事", "装傻", "保持距"], right: ["认真考虑", "借机拉拢", "回应", "留余地"] },
  "饭局2": { left: ["客气", "配合节奏", "不抢", "低调"], right: ["主动挑大梁", "摸清底", "撑场", "探底"] },
};
const GENERIC = { left: ["先稳一稳", "按规矩走", "低调处理", "再看看"], right: ["主动出击", "抢先一步", "硬刚到底", "借机谋利"] };

function autoMinorChoices(majorId, idx, category, lean) {
  const pool = CAT_LABELS[category] || GENERIC;
  const L = pool.left, R = pool.right;
  const rng = rngFor(majorId, "minor", idx);
  // 确定性洗牌取前 2：SP/SA 取 left 稳妥池，RP/RA 取 right 激进池
  const li = shuffleIdx(L.length, rng).slice(0, 2);
  const ri2 = shuffleIdx(R.length, rng).slice(0, 2);
  const labels = [L[li[0]], L[li[1]], R[ri2[0]], R[ri2[1]]];
  const ids = [`m_${majorId}_${idx}a`, `m_${majorId}_${idx}b`, `m_${majorId}_${idx}c`, `m_${majorId}_${idx}d`];
  // 按位置铺满 2×2：c1=SP / c2=SA / c3=RP / c4=RA（side 与 arch 解耦，arch 由象限池确定）
  return POS_QUADRANT.map((q, i) => ({
    id: ids[i],
    label: labels[i],
    arch: pickFrom(ARCH_SET[q], rng),
    side: sideFor(q),
    lean: (i === 0 || i === 3) ? lean : null,
  }));
}

// ---- 主流程 ----
// 把一张卡的原始 choices（源或自动生成）按位置铺满四象限：
//   c1=SP / c2=SA / c3=RP / c4=RA（side 由象限推导，arch 由 resolveArch 落池）。
// 生成 card.quadrants{sp,sa,rp,ra}（取代旧 reigns），并把 card.text 套 STAKES 利害关系句。
function finalizeCard(rawChoices, category, text, flavor, kind, extra) {
  const choices = [];
  const quadrants = {};
  rawChoices.slice(0, 4).forEach((rc, i) => {
    const Q = POS_QUADRANT[i];
    const side = sideFor(Q);
    const arch = resolveArch(Q, rc.arch, rngFor("arch", rc.id));
    const ch = normalizeChoice({ id: rc.id, label: rc.label, arch, side, lean: rc.lean, quadrant: Q }, rc.id, category);
    choices.push(ch);
    quadrants[POS_SHORT[Q]] = ch.id;
  });
  // 若源含 >4 选项，余下保留进 choices 但不进网格（无障碍「展开全部」可见）
  for (let i = 4; i < rawChoices.length; i++) {
    const rc = rawChoices[i];
    choices.push(normalizeChoice({ id: rc.id, label: rc.label, arch: rc.arch || "hedge", side: rc.side || "left", lean: rc.lean, quadrant: null }, rc.id, category));
  }
  return Object.assign({}, extra, {
    kind, category,
    text: text + (STAKES[category] ? " " + STAKES[category] : (GENERIC_STAKES ? " " + GENERIC_STAKES : "")),
    flavor: flavor || "",
    choices,
    quadrants,
  });
}

function build() {
  const majors = [];
  const minors = [];
  const randoms = [];

  for (const m of MAJORS) {
    majors.push(finalizeCard(
      m.choices, m.cat, m.text, m.flavor, "major",
      { id: m.id, title: m.title, tier: "any", tags: [m.cat] }
    ));

    m.minors.forEach((mn, i) => {
      const lean = FACTIONS[i % 4]; // 四张小事件分别偏四个派系，保证正负分布
      const raw = autoMinorChoices(m.id, i + 1, mn.cat || m.cat, lean);
      minors.push(finalizeCard(
        raw, mn.cat || m.cat, mn.text, mn.flavor, "minor",
        { id: `m_${m.id}_${i + 1}`, majorId: m.id, title: mn.title, tier: "any", tags: [mn.cat || m.cat] }
      ));
    });
  }

  for (const r of RANDOMS) {
    randoms.push(finalizeCard(
      r.choices, r.cat, r.text, r.flavor, "random",
      { id: r.id, title: r.title, tier: "any", tags: [r.cat] }
    ));
  }

  return { majors, minors, randoms };
}

function main() {
  const { majors, minors, randoms } = build();

  // 校验
  const assert = (cond, msg) => { if (!cond) { console.error("❌ " + msg); process.exit(1); } };
  assert(majors.length === 60, "majors != 60");
  assert(minors.length === 240, "minors != 240");
  assert(randoms.length === 72, "randoms != 72");
  for (const c of majors.concat(minors).concat(randoms)) {
    assert(c.choices.length >= 4, c.id + " 选项<4");
    assert(c.quadrants && c.quadrants.sp && c.quadrants.sa && c.quadrants.rp && c.quadrants.ra, c.id + " 缺 quadrants");
    assert(typeof c.flavor === "string" && c.flavor.length > 0, c.id + " 缺 flavor");
    // 跨象限一致性：前 4 选项必须恰好铺满 2×2，且 side 与 quadrant 自洽
    const qset = new Set(c.choices.slice(0, 4).map((ch) => ch.quadrant));
    assert(qset.size === 4, c.id + " 未铺满 2×2 象限（quadrant 集合=" + [...qset].join(",") + "）");
    for (const ch of c.choices.slice(0, 4)) {
      assert(ch.player && typeof ch.player.performance === "number", c.id + " 缺 performance");
      assert(ch.player && typeof ch.player.network === "number", c.id + " 缺 network");
      assert(ch.faction_trust && typeof ch.faction_trust.FV_A === "number", c.id + " 缺 faction_trust");
      assert(ch.desc && typeof ch.desc === "string" && ch.desc.length > 0, c.id + " 缺 desc");
      assert(ch.consequence && typeof ch.consequence === "string" && ch.consequence.length > 0, c.id + " 缺 consequence");
      const expectSide = (ch.quadrant === "stable_passive" || ch.quadrant === "stable_active") ? "left" : "right";
      assert(ch.side === expectSide, c.id + " " + ch.id + " 的 side(" + ch.side + ") 与 quadrant(" + ch.quadrant + ") 不自洽");
    }
  }
  // minor 归属正确
  const majorIds = new Set(majors.map((m) => m.id));
  for (const mn of minors) assert(majorIds.has(mn.majorId), mn.id + " 归属错误");

  const CAMPAIGN = { majors, minors, randoms };
  const CARDS = majors.concat(minors).concat(randoms);
  const meta = { generatedBy: "tools/gen_campaign.js", campaignStart: "2026-07", majors: 60, minors: 240, randoms: 72, total: 372 };

  // 写 design/cards/campaign.json（原始分组，便于审阅）
  if (!fs.existsSync(path.join(ROOT, "design", "cards"))) fs.mkdirSync(path.join(ROOT, "design", "cards"), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, "design", "cards", "campaign.json"),
    JSON.stringify({ meta, CAMPAIGN }, null, 2) + "\n",
    "utf8"
  );

  // 写 web/cards.js 与 docs/cards.js（字节一致）
  const header =
    "// 自动生成自 tools/campaign_source.js（经 tools/gen_campaign.js 归一化）。\n" +
    "// CARDS 平铺 372 张；CAMPAIGN 分组供引擎调度（major/minor/random，minor 含 majorId 归属）。\n" +
    "// 每卡 choice 已展平为 player{influence,stress,cash,performance,network} / faction_trust{FV_A..FV_D}，\n" +
    "// 并含 side(横轴 稳妥/激进) / quadrant(象限枚举) / desc(白话动作) / consequence(后果预览)；card 含 quadrants{sp,sa,rp,ra} 与 flavor。\n";
  const body =
    "const CARDS = " + JSON.stringify(CARDS, null, 2) + ";\n" +
    "const CAMPAIGN = " + JSON.stringify(CAMPAIGN, null, 2) + ";\n" +
    "const CARD_META = " + JSON.stringify(meta, null, 2) + ";\n";
  const out = header + body;

  if (!fs.existsSync(WEB)) fs.mkdirSync(WEB, { recursive: true });
  if (!fs.existsSync(DOCS)) fs.mkdirSync(DOCS, { recursive: true });
  fs.writeFileSync(path.join(WEB, "cards.js"), out, "utf8");
  fs.writeFileSync(path.join(DOCS, "cards.js"), out, "utf8"); // 同份内容 → 字节一致

  console.log(`✅ 生成完成：majors=${majors.length} minors=${minors.length} randoms=${randoms.length} 总计=${CARDS.length}`);
  console.log("✅ 已写出 design/cards/campaign.json、web/cards.js、docs/cards.js（web==docs 字节一致）");
}

main();
