"""情况牌引擎：加载 cards.json（外部优先 -> 内嵌），按 category/tier 加权抽牌。仅标准库。

合并了原计划的 cards.py（loader）与 draw 逻辑，采用扁平模块布局以适配本工程脚手架。
"""
import assets_data
import tuning_data
import _embed_cards  # 内嵌兜底（base64），防止 _MEIPASS 读取失败导致崩溃
from state import GameState, clamp

_CARDS_CACHE = None
_CARDS_META = None

CATEGORY_ICONS = {
    "背锅": "🪨", "站队": "🚩", "竞品": "⚔️", "绩效": "📊", "汇报": "📋",
    "团建": "🍻", "反腐": "🔍", "晋升": "📈", "客户": "🤝", "舆情": "📣",
    "加班": "🌙", "会议": "🗓️",
}
CATEGORY_ORDER = ["背锅", "站队", "竞品", "绩效", "汇报", "团建",
                 "反腐", "晋升", "客户", "舆情", "加班", "会议"]


def load_cards():
    global _CARDS_CACHE, _CARDS_META
    if _CARDS_CACHE is not None:
        return _CARDS_CACHE, _CARDS_META
    try:
        data = assets_data.load_json_asset("cards.json", "design/cards")
    except Exception as _e:  # 终极兜底：_MEIPASS 读取失败（PermissionError 等）时回退内嵌
        data = _embed_cards.DATA
    meta = data.get("meta", {})
    cards = []
    for c in data.get("cards", []):
        norm = {
            "id": c.get("id"),
            "title": c.get("title", ""),
            "tier": c.get("tier", "any"),
            "category": c.get("category", ""),
            "text": c.get("text", ""),
            "tags": c.get("tags", []),
            "choices": [],
        }
        for ch in c.get("choices", []):
            eff = ch.get("effects", {})
            pl = eff.get("player", {})
            norm["choices"].append({
                "id": ch.get("id"),
                "label": ch.get("label", ""),
                "arch": ch.get("arch", "hedge"),
                "player": {
                    "influence": int(pl.get("influence", 0)),
                    "stress": int(pl.get("stress", 0)),
                    "cash": int(pl.get("cash", 0)),
                },
                "faction_trust": {f: int(eff.get("faction_trust", {}).get(f, 0)) for f in tuning_data.FACTIONS},
            })
        cards.append(norm)
    _CARDS_CACHE = cards
    _CARDS_META = meta
    return cards, meta


def card_count():
    cards, _ = load_cards()
    return len(cards)


def _day_curve_weights(day):
    for bucket in tuning_data.TUNING["DAY_CURVE"]:
        if day in bucket.get("days", []):
            return bucket.get("w", {})
    return {}


def _situation_match(state: GameState, card) -> float:
    cd = tuning_data.TUNING["CARD_DRAW"]
    score = 0.0
    player = state.player()
    lead = None
    lv = -1e9
    for f in tuning_data.FACTIONS:
        v = state.faction_trust.get(f, 0.0)
        if v > lv:
            lv, lead = v, f
    if lead:
        for ch in card["choices"]:
            if ch["faction_trust"].get(lead, 0) >= 2:
                score += cd["SIT_MATCH_FACTION_TRUST"]
                break
    if player.stress >= tuning_data.TUNING["DERIVED"]["stress_high"] and card["category"] in ("加班", "团建"):
        score += cd["SIT_STRESS_CAT"]
    if state.chaos >= 60 and card["category"] in ("反腐", "舆情", "会议"):
        score += cd["SIT_CHAOS_CAT"]
    if any(cl.get("stability", 100) <= 30 for cl in state.clients) and card["category"] in ("客户", "竞品"):
        score += cd["SIT_CLIENT_CAT"]
    return clamp(score, 0.0, cd["SIT_CAP"])


def _tier_weight(card, player_tier) -> float:
    tw = tuning_data.TUNING["CARD_DRAW"]["TIER_W"]
    if card["tier"] == player_tier:
        return tw["match"]
    if card["tier"] == "any":
        return tw["any"]
    return tw["other"]


def _roulette(state: GameState, weights):
    items = list(weights.items())
    total = sum(w for _, w in items)
    if total <= 0:
        return state.rng.choice(items)[0]
    r = state.rng.random() * total
    acc = 0.0
    for key, w in items:
        acc += w
        if r <= acc:
            return key
    return items[-1][0]


def draw_day_cards(state: GameState, day: int, n: int):
    """抽 n 张情况牌，保证来自 n 个不同 category（轮盘赌 + 类内加权）。"""
    cards, _ = load_cards()
    curve = _day_curve_weights(day)
    cat_scale = tuning_data.TUNING["CARD_DRAW"]["CAT_W_SCALE"]
    sit_scale = tuning_data.TUNING["CARD_DRAW"]["SIT_W_SCALE"]

    by_cat = {cat: [] for cat in CATEGORY_ORDER}
    for c in cards:
        by_cat.setdefault(c["category"], []).append(c)

    player_tier = state.player().tier
    drawn = []
    used_cats = set()

    for _ in range(n):
        avail = [cat for cat in CATEGORY_ORDER
                 if cat not in used_cats and any(c["id"] not in state.used_cards for c in by_cat.get(cat, []))]
        if not avail:
            break
        cat_extra = 0.0
        for cat in avail:
            for c in by_cat[cat]:
                if c["id"] not in state.used_cards:
                    cat_extra = max(cat_extra, _situation_match(state, c))
                    break
        cat_w = {cat: (1.0 + cat_scale * curve.get(cat, 0.0)) for cat in avail}
        chosen_cat = _roulette(state, cat_w)
        pool = [c for c in by_cat[chosen_cat] if c["id"] not in state.used_cards]
        card_w = {}
        for c in pool:
            w = _tier_weight(c, player_tier) * (1.0 + sit_scale * _situation_match(state, c))
            card_w[c["id"]] = max(0.001, w)
        chosen = _roulette(state, card_w)
        for c in pool:
            if c["id"] == chosen:
                drawn.append(c)
                state.used_cards.add(c["id"])
                used_cats.add(chosen_cat)
                break
    return drawn


def choice_summary(ch) -> str:
    pl = ch["player"]
    parts = []
    if pl["influence"]:
        parts.append(f"声望{pl['influence']:+d}")
    if pl["stress"]:
        parts.append(f"压力{pl['stress']:+d}")
    if pl["cash"]:
        parts.append(f"预算{pl['cash']:+d}")
    return " ".join(parts) if parts else "无变化"
