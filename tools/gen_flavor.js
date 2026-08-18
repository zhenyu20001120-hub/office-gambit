// 生成「卡片潜台词 / 内心独白」flavor 字段，并重新生成 web/cards.js 与 docs/cards.js。
//
// 设计约束：
//   - 只读 design/cards/cards.json，按 category 建中文职场潜台词词池（12~20 条/类）。
//   - 用确定性种子（以 card.id 做 FNV-1a 哈希）把词池分配到每张卡，绝不手写 256 条。
//   - 把 flavor 写回 cards.json；再按现有 convert_to_web.js 的同款归一化重生成 cards.js，
//     并要求 web/cards.js 与 docs/cards.js 字节一致（同一份内容写两份）。
//
// 用法：node tools/gen_flavor.js

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WEB = path.join(ROOT, "web");
const DOCS = path.join(ROOT, "docs");
const CARDS_JSON = path.join(ROOT, "design", "cards", "cards.json");

// FNV-1a 32-bit（与 web 端一致），用于对 card.id 做确定性哈希选词。
function fnv1a(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// 各 category 的中文职场潜台词词池（内心独白腔，像真人心里嘀咕）。
const POOLS = {
  "背锅": [
    "锅又不是我一个人的，怎么每次都精准落我头上。",
    "先认了也行，反正记仇的本子我也有一本。",
    "把证据留好，今天这口锅我不一定背到底。",
    "领导要的是有人扛，不是真相。",
    "背完这回，下回是不是就轮不到我了？",
    "我比谁都清楚，这雷原本该炸在谁身上。",
    "认怂能换几天太平，值。",
    "把锅背圆了，也是一种本事。",
    "他们挑我，是因为我最好捏。",
    "这口锅，背了是人情，背错了是傻子。",
    "先让上面看见我在扛，别的慢慢说。",
    "锅底朝下，迟早有人要来翻。",
    "我闭嘴，是因为开口只会更惨。",
    "这事烂尾，最后还得有人出来顶。",
  ],
  "站队": [
    "队站错了，比不站更惨。",
    "谁都不得罪，最后谁都不保你。",
    "先看看风向，再决定往哪边倒。",
    "站队不是选好人，是选活路。",
    "跟对人，比干对事重要。",
    "我现在站这头，是为了将来能换头。",
    "明面上一团和气，心里早分了阵营。",
    "别急，让子弹先飞一会儿。",
    "这水太浑，先缩着。",
    "站得近的，未必是盟友。",
    "谁给资源，我就靠近谁。",
    "今天站你，明天未必。",
    "队形站乱了，第一个被清的就是我。",
    "观望也是一种表态。",
  ],
  "竞品": [
    "对手的报价，怎么每次都比我们好看。",
    "这单要是丢了，年底绩效别想了。",
    "抢人家的客户，心里也得有点数。",
    "竞品那套打法，学不学得来另说。",
    "别小看对面，人家也在盯我们。",
    "价格战打到底，谁先眨眼谁输。",
    "挖墙脚这活，脏但有用。",
    "对手的软肋，总藏在他最得意的地方。",
    "这一仗不是为了赢，是为了别输太难看。",
    "信息差，就是利润率。",
    "正面刚不过，就抄他后路。",
    "竞品松一口气，我们就少睡一晚。",
  ],
  "绩效": [
    "数字不会骗人，但会要人命。",
    "这个月又得找补，不然排名又掉。",
    "KPI 是个无底洞，填不满的。",
    "做得好是应该，做得差全是你的锅。",
    "先把眼前这摊填平，再想别的。",
    "别人看的是结果，只有我自己知道多狼狈。",
    "绩效面谈前三天的胃，已经先垮了。",
    "冲一波数据，至少面上过得去。",
    "排名这种事，往前一名要脱层皮。",
    "达标了也没人夸，不达标全公司都看见。",
    "我把活干漂亮，他们把功劳写自己名下。",
    "这季度再垫底，谈话名单就轮到我了。",
  ],
  "汇报": [
    "怎么讲，比讲了什么更要紧。",
    "汇报是门手艺，水分要恰到好处。",
    "把难听的话包一层糖，领导才咽得下。",
    "今天这场汇报，是表演不是交底。",
    "先说结论，再说苦劳，最后才轮到问题。",
    "报喜不报忧，是活下来的基本功。",
    "PPT 做得越漂亮，漏洞越好藏。",
    "谁先开口，谁就先被盯着。",
    "我的汇报，是写给能决定我年终的人看的。",
    "把进度说慢点，留点余地好翻身。",
    "台上一分钟，台下我排练了三晚。",
    "说少了显得没干，说多了显得要功。",
  ],
  "团建": [
    "团建是下班后的第二班，没人乐意。",
    "酒桌上的话，比工位上的真。",
    "不去了显得不合群，去了又浪费一晚。",
    "敬酒顺序错了，比不喝还得罪人。",
    "团建才是真正的摸底局。",
    "人在酒局，心在微信回工作。",
    "这种热闹，撑满两小时就是胜利。",
    "谁掏心掏肺，谁就先被拿住。",
    "聚餐是假，站队是真。",
    "我举杯，但不打算交心。",
    "假装熟络，是成年人的必修课。",
    "散场才松口气，明天还得照常演。",
  ],
  "反腐": [
    "这摊水，碰了谁都脏。",
    "查别人之前，先想想自己干不干净。",
    "举报是刀，握刀的人也危险。",
    "风声紧的时候，连呼吸都要轻点。",
    "有人想借反腐的名义，清掉不对付的人。",
    "账面上干净，桌底下未必。",
    "我装没看见，是因为真看见过会出事。",
    "查出来是功，查不出是祸。",
    "这把火，别烧到自己身上。",
    "谁先动手，谁就先暴露在灯光下。",
    "反腐这局，站错了就是陪葬。",
    "有些事，烂在肚子里最安全。",
  ],
  "晋升": [
    "那个坑位，盯的人不止我一个。",
    "晋升是排位赛，前面的人不退就轮不到我。",
    "资历够了，缺的只是一句上面愿意说的话。",
    "竞聘稿背得再熟，不如一杯酒到位。",
    "升上去是另一个坑，但总比原地强。",
    "这次没我，明年是不是也轮不到？",
    "别人升职靠业绩，我升职靠没人比得上我肯熬。",
    "提名只是开始，站队才是关键。",
    "上面的位子空出来，底下早就暗流涌动了。",
    "我比对手多一样东西：肯背没人要的锅。",
    "晋升答辩，考的是情商不是能力。",
    "熬了这么久，临门一脚不能软。",
  ],
  "客户": [
    "客户的心情，比天气还难预测。",
    "这单要是黄了，我这个月白干。",
    "先哄住，再谈条件。",
    "客户要的不是最好的，是最懂他的。",
    "关系到位了，合同自然来。",
    "他说的'再考虑'，意思就是'在比价'。",
    "维护老客户比开发新客户省心，但更费心。",
    "酒桌上签的字，比会议室里管用。",
    "客户翻脸比翻书快，得留一手。",
    "把客户伺候舒服了，KPI 自己会动。",
    "这人难缠，但单子大，值。",
    "承诺得留余地，不然兑现时是自己跪。",
  ],
  "舆情": [
    "一条热搜，能把半年口碑冲没。",
    "舆情这东西，捂不如导。",
    "现在全网都在看，错一个字就完。",
    "删帖是下策，引导才是上策。",
    "这风口浪尖，谁发声谁挨打。",
    "别急着回应，让子弹再飞一会儿。",
    "舆情是面镜子，照的全是平时攒的雷。",
    "我写的那句公关稿，改了八遍。",
    "热度过去前，先把自己摘干净。",
    "声量越大，越不能露怯。",
    "这把火，得用别的火盖过去。",
    "沉默不是没事，是等一个能翻盘的角度。",
  ],
  "加班": [
    "又是一晚，家里的灯早灭了。",
    "加班不是努力，是没人替你扛。",
    "这活今天不交，明天就有人替我交。",
    "凌晨的办公室，只剩我和心跳。",
    "别人准点走是本事，我留下来是保命。",
    "加班费没有，黑眼圈管够。",
    "撑过这阵，应该就好点了吧……大概。",
    "活是干不完的，命是自己的。",
    "我多熬一小时，别人就少一个借口。",
    "周末的公司，安静得像另一个世界。",
    "连续熬了几天，镜子里的自己有点陌生。",
    "这班加得值不值，月底见分晓。",
  ],
  "会议": [
    "又是三小时的会，结论还是没有。",
    "会开得越多，事办得越少。",
    "坐哪儿，比说什么更能表态。",
    "会上不说话，比说错话安全。",
    "这场会，前半小时都在等人。",
    "议题是幌子，博弈才是真的。",
    "我记的纪要，和我心里记的，不是一回事。",
    "谁先离场，谁就先输。",
    "会议室的空调，吹得人犯困也清醒。",
    "真正拍板的，从来不在会议记录里。",
    "这会开完，活更重了。",
    "我带了两套说法，看风向再递。",
  ],
};

// 兜底词池：遇到未知 category 也能落一条，不空着。
const FALLBACK = [
  "这事没那么简单，先看看再说。",
  "表面平静，底下全是算计。",
  "我在场，就得留个心眼。",
  "话不能说过头，留三分余地。",
  "今天这步，得想好退路。",
];

function assignFlavor(card) {
  const pool = POOLS[card.category] || FALLBACK;
  const idx = fnv1a(card.id) % pool.length;
  return pool[idx];
}

// ---- 重生成 cards.js（严格复刻 convert_to_web.js 的归一化，并新增 flavor） ----
function buildCardsJs(data) {
  const FACTIONS = ["FV_A", "FV_B", "FV_C", "FV_D"];
  const cards = [];
  for (const c of data.cards || []) {
    const norm = {
      id: c.id,
      title: c.title || "",
      tier: c.tier || "any",
      category: c.category || "",
      text: c.text || "",
      flavor: c.flavor || "",
      tags: c.tags || [],
      choices: [],
    };
    for (const ch of c.choices || []) {
      const eff = ch.effects || {};
      const pl = eff.player || {};
      norm.choices.push({
        id: ch.id,
        label: ch.label || "",
        arch: ch.arch || "hedge",
        player: {
          influence: Number(pl.influence || 0),
          stress: Number(pl.stress || 0),
          cash: Number(pl.cash || 0),
          performance: Number(pl.performance || 0),
          network: Number(pl.network || 0),
        },
        faction_trust: Object.fromEntries(
          FACTIONS.map((f) => [f, Number((eff.faction_trust || {})[f] || 0)])
        ),
      });
    }
    if (c.reigns && c.reigns.left && c.reigns.right) {
      norm.reigns = { left: c.reigns.left, right: c.reigns.right };
    } else {
      norm.reigns = null;
    }
    cards.push(norm);
  }
  const meta = data.meta || {};
  return (
    "// 自动生成自 design/cards/cards.json —— 已按 cards_data.load_cards 归一化。\n" +
    "// CARDS 直接供 game.js 消费（choice 已展平为 player{influence,stress,cash} / faction_trust{FV_A..FV_D}，并含 flavor 潜台词）。\n" +
    "const CARDS = " + JSON.stringify(cards, null, 2) + ";\n" +
    "const CARD_META = " + JSON.stringify(meta, null, 2) + ";\n"
  );
}

function main() {
  const data = JSON.parse(fs.readFileSync(CARDS_JSON, "utf8"));
  let covered = 0;
  for (const c of data.cards || []) {
    c.flavor = assignFlavor(c);
    covered++;
  }
  // 写回 cards.json（保留结构，仅增 flavor 字段）
  fs.writeFileSync(CARDS_JSON, JSON.stringify(data, null, 2) + "\n", "utf8");

  const out = buildCardsJs(data);
  if (!fs.existsSync(WEB)) fs.mkdirSync(WEB, { recursive: true });
  if (!fs.existsSync(DOCS)) fs.mkdirSync(DOCS, { recursive: true });
  // 同一份内容写两份 → web/cards.js 与 docs/cards.js 字节一致
  fs.writeFileSync(path.join(WEB, "cards.js"), out, "utf8");
  fs.writeFileSync(path.join(DOCS, "cards.js"), out, "utf8");

  console.log(`flavor 已分配：${covered} 张`);
  console.log(`已写出 web/cards.js 与 docs/cards.js（字节一致）`);
}

main();
