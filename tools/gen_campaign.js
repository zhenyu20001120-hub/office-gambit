// 生成《职场营销博弈》372 张嵌套卡：60 大事件 / 240 小事件 / 72 随机事件。
// 读取 tools/campaign_source.js 的可见文案，按 convert_to_web.js 同款归一化逻辑把选项
// 展平为 player{influence,stress,cash,performance,network} / faction_trust{FV_A..FV_D}，
// 并为每卡计算 reigns{left,right} 与 flavor。最终写：
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
  return {
    id: spec.id,
    label: spec.label,
    arch: spec.arch || "hedge",
    player,
    faction_trust,
    tags: genTags(category, spec.arch, spec.lean),
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
const LEFT_ARCH = ["hedge", "shield", "obey", "dodge"];
const RIGHT_ARCH = ["invest", "betray", "expose", "risk"];

function autoMinorChoices(majorId, idx, category, lean) {
  const pool = CAT_LABELS[category] || GENERIC;
  const rng = rngFor(majorId, "minor", idx);
  const la = [LEFT_ARCH[ri(rng, 0, 3)], LEFT_ARCH[ri(rng, 0, 3)]];
  const ra = [RIGHT_ARCH[ri(rng, 0, 3)], RIGHT_ARCH[ri(rng, 0, 3)]];
  const ids = [`m_${majorId}_${idx}a`, `m_${majorId}_${idx}b`, `m_${majorId}_${idx}c`, `m_${majorId}_${idx}d`];
  const specs = [
    { id: ids[0], label: pool.left[0], arch: la[0], side: "left", lean },
    { id: ids[1], label: pool.left[1 % pool.left.length], arch: la[1], side: "left", lean: null },
    { id: ids[2], label: pool.right[0], arch: ra[0], side: "right", lean: null },
    { id: ids[3], label: pool.right[1 % pool.right.length], arch: ra[1], side: "right", lean },
  ];
  return specs.map((s) => normalizeChoice(s, ids[0].replace(/[a-d]$/, ""), category));
}

// ---- 主流程 ----
function build() {
  const majors = [];
  const minors = [];
  const randoms = [];

  for (const m of MAJORS) {
    const majorChoices = m.choices.map((c) => normalizeChoice(c, m.id, m.cat));
    const left = m.choices.find((c) => c.side === "left");
    const right = m.choices.find((c) => c.side === "right");
    const majorCard = {
      kind: "major",
      id: m.id,
      title: m.title,
      tier: "any",
      category: m.cat,
      text: m.text,
      flavor: m.flavor || "",
      tags: [m.cat],
      choices: majorChoices,
      reigns: { left: left ? left.id : majorChoices[0].id, right: right ? right.id : majorChoices[majorChoices.length - 1].id },
    };
    majors.push(majorCard);

    m.minors.forEach((mn, i) => {
      const lean = FACTIONS[i % 4]; // 四张小事件分别偏四个派系，保证正负分布
      const mchoices = autoMinorChoices(m.id, i + 1, mn.cat || m.cat, lean);
      minors.push({
        kind: "minor",
        id: `m_${m.id}_${i + 1}`,
        majorId: m.id,
        title: mn.title,
        tier: "any",
        category: mn.cat || m.cat,
        text: mn.text,
        flavor: mn.flavor || "",
        tags: [mn.cat || m.cat],
        choices: mchoices,
        reigns: { left: mchoices[0].id, right: mchoices[2].id },
      });
    });
  }

  for (const r of RANDOMS) {
    const rchoices = r.choices.map((c) => normalizeChoice(c, r.id, r.cat));
    const left = r.choices.find((c) => c.side === "left");
    const right = r.choices.find((c) => c.side === "right");
    randoms.push({
      kind: "random",
      id: r.id,
      title: r.title,
      tier: "any",
      category: r.cat,
      text: r.text,
      flavor: r.flavor || "",
      tags: [r.cat],
      choices: rchoices,
      reigns: { left: left ? left.id : rchoices[0].id, right: right ? right.id : rchoices[rchoices.length - 1].id },
    });
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
    assert(c.reigns && c.reigns.left && c.reigns.right, c.id + " 缺 reigns");
    assert(typeof c.flavor === "string" && c.flavor.length > 0, c.id + " 缺 flavor");
    for (const ch of c.choices) {
      assert(ch.player && typeof ch.player.performance === "number", c.id + " 缺 performance");
      assert(ch.player && typeof ch.player.network === "number", c.id + " 缺 network");
      assert(ch.faction_trust && typeof ch.faction_trust.FV_A === "number", c.id + " 缺 faction_trust");
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
    "// 每卡 choice 已展平为 player{influence,stress,cash,performance,network} / faction_trust{FV_A..FV_D}，且含 reigns{left,right} 与 flavor。\n";
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
