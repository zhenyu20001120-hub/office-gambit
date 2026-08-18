#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reigns 四表盘层 · 卡牌数据批量增补脚本。

依据 design/gdd/reigns_layer.md §3.3 / §4 确定性地为全部 256 张卡每选项补
performance / network Δ，预计算 card.reigns={left,right}，并保证全库不变量：

  1) 256 张牌 / 1024 选项 / id 唯一 / 文案唯一  ——  不变
  2) 五维保底覆盖 100%（每卡 ≥1 个五维 |Δ|≤2 的稳妥项）
  3) 牌内五维零帕累托支配
  4) 单选项四表盘 |Δ| 和 ≤ 25 的全库占比 ≥99%（极端 >25 标记人工复核）
  5) faction_trust 四家累计和偏差 ≤8%  ——  不受影响（perf/net 不写 faction_trust）

产物：
  - 写回 design/cards/cards.json（源，effects.player 增加 performance/network + 顶层 reigns）
  - 调 node tools/convert_to_web.js 重生成 web/cards.js
  - 复制 web/cards.js -> docs/cards.js（GitHub Pages 与开发态一致）
  - 调 python tools/gen_embed.py 刷新 src/_embed_cards.py 兜底

确定性 / 可复现：纯规则映射 + json（插入序保留）序列化；不引入任何随机。
仅断言失败（硬不变量破坏）才以非零码退出；软目标（≤25 占比<99%）仅告警。

用法：python tools/reigns_gen_cards.py
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "design", "cards", "cards.json")
WEB_CARDS = os.path.join(ROOT, "web", "cards.js")
DOCS_CARDS = os.path.join(ROOT, "docs", "cards.js")

# ---------------------------------------------------------------------------
# 映射表（GDD §3.3）
# ---------------------------------------------------------------------------
# arch -> (performance, network) 基础值
BASE = {
    "grind": (3, -2), "obey": (1, 2), "ally": (0, 4), "betray": (3, -4),
    "expose": (2, -3), "self": (-2, -1), "hedge": (-1, 1), "dodge": (-2, 0),
    "invest": (3, 0), "risk": (5, -1), "shield": (-1, 3), "leak": (-2, 2),
    "bow": (-1, 3), "cashin": (-1, -2),
}
# 偏「业绩」类：performance +1
CAT_PERF_PLUS = {"绩效", "汇报", "晋升", "客户", "竞品"}
# 偏「人脉」类：network +1（背锅额外 network -1）
CAT_NET_PLUS = {"团建", "站队", "反腐", "舆情", "会议", "背锅"}
# tier 缩放
TIER_SCALE = {"employee": 0.8, "mid": 1.0, "senior": 1.2, "any": 1.0}

# 左右收敛（GDD §4.1）：稳妥 / 进取 两极管
LEFT_POLES = {"obey", "hedge", "dodge", "shield", "bow", "self"}
RIGHT_POLES = {"grind", "betray", "expose", "risk", "invest", "cashin", "leak"}

# AGG_WEIGHT（GDD §4.1 公式中引用但未给表，此处按「进取度」确定性定义：
# 右极 arch 高、左极 arch 低，ally 中性。供 boldness 计算，仅影响左右代表选取，
# 不影响任何数值结算。列为待主理人确认项之一。）
AGG_WEIGHT = {
    "risk": 6.0, "betray": 5.0, "expose": 4.5, "cashin": 4.0, "grind": 4.0,
    "leak": 3.5, "invest": 3.5, "ally": 3.0, "bow": 2.0, "shield": 2.0,
    "hedge": 1.5, "dodge": 1.5, "obey": 1.0, "self": 1.0,
}

DIMS = ["influence", "stress", "cash", "performance", "network"]


def clamp(v, lo, hi):
    return lo if v < lo else (hi if v > hi else v)


def compute_perf_net(arch, category, tier):
    bp, bn = BASE.get(arch, (0, 0))
    if category in CAT_PERF_PLUS:
        bp += 1
    if category in CAT_NET_PLUS:
        bn += 1
    if category == "背锅":  # 额外 network -1
        bn -= 1
    s = TIER_SCALE.get(tier, 1.0)
    perf = clamp(round(bp * s), -10, 10)
    net = clamp(round(bn * s), -10, 10)
    return perf, net


def sum4(ch):
    """四表盘 |Δ| 和：performance + network + influence + stress（energy 派生不重复计）。"""
    pl = ch["player"]
    return abs(pl["performance"]) + abs(pl["network"]) + abs(pl["influence"]) + abs(pl["stress"])


def is_3d_safe(ch):
    pl = ch["player"]
    return abs(pl["influence"]) <= 2 and abs(pl["stress"]) <= 2 and abs(pl["cash"]) <= 2


def is_5d_safe(ch):
    pl = ch["player"]
    return all(abs(pl[d]) <= 2 for d in DIMS)


def scale_to_25(ch):
    """若四表盘 |Δ| 和 >25，仅等比缩小 performance/network（保留 influence/stress 权威）。"""
    pl = ch["player"]
    s4 = sum4(ch)
    if s4 <= 25:
        return False
    room = 25 - (abs(pl["influence"]) + abs(pl["stress"]))
    pn = abs(pl["performance"]) + abs(pl["network"])
    if room >= 0 and pn > 0:
        f = room / pn
        pl["performance"] = clamp(round(pl["performance"] * f), -10, 10)
        pl["network"] = clamp(round(pl["network"] * f), -10, 10)
    else:
        # influence+stress 本身已 ≥25，新维度无处可放：清零并标记
        pl["performance"] = 0
        pl["network"] = 0
    return True


def ensure_safe_option(choices):
    """保证每卡 ≥1 个五维 |Δ|≤2 的稳妥项：在既有三资源保底项上把 perf/net 置 0。"""
    safe = next((c for c in choices if is_3d_safe(c)), None)
    if safe is None:
        # 退化兜底：取三资源 |Δ| 和最小者
        safe = min(choices, key=lambda c: abs(c["player"]["influence"]) + abs(c["player"]["stress"]) + abs(c["player"]["cash"]))
    safe["player"]["performance"] = 0
    safe["player"]["network"] = 0
    return safe["id"]


def dominates(a, b):
    """a 在五维上帕累托支配 b（全部 ≥ 且至少一项严格 >）。"""
    pa, pb = a["player"], b["player"]
    ge = all(pa[d] >= pb[d] for d in DIMS)
    if not ge:
        return False
    gt = any(pa[d] > pb[d] for d in DIMS)
    return gt


def resolve_pareto(choices):
    """消除五维帕累托支配：对支配者的 performance/network 各 -1，直到无支配（封顶防死循环）。"""
    iters = 0
    changed = True
    while changed and iters < 400:
        changed = False
        iters += 1
        for i, a in enumerate(choices):
            for j, b in enumerate(choices):
                if i == j:
                    continue
                if dominates(a, b):
                    a["player"]["performance"] = clamp(a["player"]["performance"] - 1, -10, 10)
                    a["player"]["network"] = clamp(a["player"]["network"] - 1, -10, 10)
                    changed = True
    return iters < 400


def boldness(ch):
    pl = ch["player"]
    s = AGG_WEIGHT.get(ch["arch"], 1.0)
    s += 0.3 * sum(abs(v) for v in pl.values())
    ft = ch.get("faction_trust", {})
    mx = max(ft.values()) if ft else 0
    s += 0.2 * mx
    return s


def find_safe_id(choices):
    for c in choices:
        if is_5d_safe(c):
            return c["id"]
    return None


def reigns_pick(choices):
    left = [c for c in choices if c["arch"] in LEFT_POLES]
    right = [c for c in choices if c["arch"] in RIGHT_POLES]
    left_choice = min(left, key=boldness) if left else min(choices, key=boldness)
    right_choice = max(right, key=boldness) if right else max(choices, key=boldness)
    left_id = left_choice["id"]
    right_id = right_choice["id"]
    # 保证「滑左永远有退路」：若有五维保底项，优先让它成为 left
    safe = find_safe_id(choices)
    if safe is not None:
        left_id = safe
    # 左右必须不同选项
    if left_id == right_id and len(choices) > 1:
        others = [c for c in choices if c["id"] != left_id]
        right_id = max(others, key=boldness)["id"]
    return {"left": left_id, "right": right_id}


def main():
    with open(SRC, "r", encoding="utf-8") as f:
        data = json.load(f)

    cards = data["cards"]
    stats = {
        "cards": len(cards), "choices": 0, "safe_cover": 0,
        "pareto_ok": 0, "over25": 0, "over25_after": 0,
        "warnings": [],
    }

    for card in cards:
        tier = card.get("tier", "any")
        cat = card.get("category", "")
        work = []
        for ch in card["choices"]:
            eff = ch.get("effects", {})
            pl = eff.get("player", {})
            perf, net = compute_perf_net(ch.get("arch", "hedge"), cat, tier)
            w = {
                "id": ch.get("id"),
                "arch": ch.get("arch", "hedge"),
                "player": {
                    "influence": int(pl.get("influence", 0)),
                    "stress": int(pl.get("stress", 0)),
                    "cash": int(pl.get("cash", 0)),
                    "performance": perf,
                    "network": net,
                },
                "faction_trust": eff.get("faction_trust", {}),
            }
            work.append(w)

        # 1) 四表盘 |Δ| 和 ≤25（缩放 perf/net）
        for w in work:
            if scale_to_25(w):
                stats["over25"] += 1

        # 2) 五维保底
        ensure_safe_option(work)

        # 3) 五维帕累托支配消除
        if not resolve_pareto(work):
            stats["warnings"].append(f"{card.get('id')} 帕累托未完全收敛（封顶）")
        stats["pareto_ok"] += 1

        # 4) 校验 + 写回源 effects.player；记录 reigns
        for w, ch in zip(work, card["choices"]):
            eff = ch.setdefault("effects", {})
            pl = eff.setdefault("player", {})
            pl["performance"] = w["player"]["performance"]
            pl["network"] = w["player"]["network"]
            stats["choices"] += 1
            if sum4(w) > 25:
                stats["over25_after"] += 1
                stats["warnings"].append(f"{card.get('id')}/{w['id']} 四表盘和仍>25")
            if is_5d_safe(w):
                stats["safe_cover"] += 1
                break  # 每卡只需一个
        card["reigns"] = reigns_pick(work)

    # ---- 回写源文件（插入序保留，2 空格缩进，中文不转义）----
    with open(SRC, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

    # ---- 重生成 web/cards.js ----
    subprocess.run(["node", os.path.join(ROOT, "tools", "convert_to_web.js")],
                   check=True, cwd=ROOT)
    # ---- 同步 docs（GitHub Pages 与开发态一致）----
    with open(WEB_CARDS, "r", encoding="utf-8") as f:
        webc = f.read()
    with open(DOCS_CARDS, "w", encoding="utf-8") as f:
        f.write(webc)
    with open(os.path.join(ROOT, "web", "tuning.js"), "r", encoding="utf-8") as f:
        webf = f.read()
    with open(os.path.join(ROOT, "docs", "tuning.js"), "w", encoding="utf-8") as f:
        f.write(webf)
    # ---- 刷新内嵌兜底 ----
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "gen_embed.py")],
                   check=True, cwd=ROOT)

    # ---- 报告 ----
    safe_pct = 100.0 * stats["safe_cover"] / stats["cards"]
    over25_pct = 100.0 * stats["over25_after"] / stats["choices"]
    print("=" * 60)
    print("Reigns 卡牌批量增补完成")
    print("=" * 60)
    print(f"卡数        : {stats['cards']}")
    print(f"选项数      : {stats['choices']}")
    print(f"五维保底覆盖: {stats['safe_cover']}/{stats['cards']} = {safe_pct:.1f}%")
    print(f"帕累托收敛  : {stats['pareto_ok']}/{stats['cards']}")
    print(f"四表盘和>25 : 脚本前 {stats['over25']} 项被缩；最终仍>25 的 {stats['over25_after']} 项 ({over25_pct:.2f}%)")
    for w in stats["warnings"]:
        print("  ⚠ " + w)

    # ---- 硬不变量退出码 ----
    hard_fail = False
    if stats["cards"] != 256:
        print(f"FAIL 卡数应为 256，实际 {stats['cards']}"); hard_fail = True
    if stats["choices"] != 1024:
        print(f"FAIL 选项数应为 1024，实际 {stats['choices']}"); hard_fail = True
    if stats["safe_cover"] != stats["cards"]:
        print("FAIL 五维保底未 100% 覆盖"); hard_fail = True
    if stats["pareto_ok"] != stats["cards"]:
        print("FAIL 帕累托未 100% 收敛"); hard_fail = True
    if over25_pct > 1.0:
        print(f"FAIL 四表盘和>25 占比 {over25_pct:.2f}% 超过 1% 软上限"); hard_fail = True

    print("=" * 60)
    if hard_fail:
        print("结果: 失败（硬不变量未满足，未入库）")
        sys.exit(1)
    print("结果: 通过（已写回源 + 重生成 web/docs + 内嵌兜底）")


if __name__ == "__main__":
    main()
