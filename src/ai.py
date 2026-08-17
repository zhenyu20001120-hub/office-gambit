"""启发式 AI：性格 5 维向量 + 效用函数 + 派系偏好 + belief/trust 更新 + 随机扰动。

公式严格依据 gdd 系统⑤ 5.3.2 / 5.3.3 / 5.3.6。仅标准库（扁平模块布局）。
"""
from typing import Dict, List, Optional, Tuple

import tuning_data as config
from state import Actor, GameState, clamp

FIDX = {f: i for i, f in enumerate(config.FACTIONS)}


def _w_inf(a: Actor):
    return 0.6 + 0.9 * a.personality.get("ambition", 0.5)


def _w_str(a: Actor):
    sp = 1 + 1.5 * (a.stress / 100.0)
    return -(0.5 + 1.2 * (1 - a.personality.get("risk_appetite", 0.5))) * sp


def _w_cash(a: Actor):
    greed = 1.0 if a.faction == "FV_D" else 0.0
    return 0.3 + 0.5 * (1 - a.personality.get("ambition", 0.5)) + 0.4 * greed


def _tag_goal_bonus(a: Actor, ch) -> float:
    spec = config.TUNING["TAG_GOAL_BONUS"].get(a.faction, {})
    bonus = 0.0
    if ch["arch"] in spec.get("arch", []):
        bonus += 1.0
    for t in spec.get("tags", []):
        if t in ch.get("tags", []):
            bonus += 1.0
    return bonus


def _goal_align(a: Actor, ch, state: GameState) -> float:
    ft = ch["faction_trust"]
    mine = ft.get(a.faction, 0)
    rival_val = max((ft.get(f, 0) for f in config.FACTIONS if f != a.faction), default=0)
    base = 3.0 * mine - 1.5 * rival_val + 2.5 * _tag_goal_bonus(a, ch)
    agg = state._diff["ai_aggressiveness"]
    return base * (0.6 + 0.8 * agg)


def _reciprocity(a: Actor, ch, state: GameState) -> float:
    total = 0.0
    for j in state.actors:
        if j.idx == a.idx or not j.alive:
            continue
        t = a.trust.get(j.idx, 0.0) / 100.0
        if t == 0:
            continue
        b = a.belief.get(j.idx, [0.25, 0.25, 0.25, 0.25])
        wsum = sum(b)
        if wsum > 0:
            expected = sum(bk * ch["faction_trust"].get(config.FACTIONS[k], 0) for k, bk in enumerate(b)) / wsum
        else:
            expected = ch["faction_trust"].get(j.faction, 0) * 0.25
        total += t * expected
    return total


def _concealment(a: Actor, ch) -> float:
    exposure = abs(ch["faction_trust"].get(a.faction, 0)) / 10.0
    return -(1 - a.personality.get("guile", 0.5)) * exposure


def _suspicion(a: Actor, state: GameState) -> float:
    fi = FIDX[a.faction]
    mx = 0.0
    for j in state.actors:
        if j.idx == a.idx or not j.alive:
            continue
        b = j.belief.get(a.idx, [0.25] * 4)
        if fi < len(b):
            mx = max(mx, b[fi])
    return mx


def _risk(a: Actor, ch, state: GameState) -> float:
    pl = ch["player"]
    base = (1 - a.personality.get("risk_appetite", 0.5)) * (abs(pl["stress"]) + max(0, -pl["cash"])) / 10.0
    return base + 0.5 * _suspicion(a, state)


def compute_utility(a: Actor, ch, state: GameState):
    W = config.TUNING["AI_WEIGHTS"]
    pl = ch["player"]
    u_inf = _w_inf(a) * pl["influence"]
    u_str = _w_str(a) * pl["stress"]
    u_cash = _w_cash(a) * pl["cash"]
    u_goal = W["ALPHA"] * _goal_align(a, ch, state)
    u_rec = W["BETA"] * _reciprocity(a, ch, state)
    u_con = W["GAMMA"] * _concealment(a, ch)
    u_risk = W["DELTA"] * _risk(a, ch, state)
    tau = 0.8 * state._diff["tau_temperature"] * (0.5 + a.personality.get("risk_appetite", 0.5))
    eps = state.rng.uniform(-tau, tau)
    u = u_inf + u_str + u_cash + u_goal + u_rec + u_con - u_risk + eps
    if a.cash + pl["cash"] < config.TUNING["RESOURCES"]["CASH_FLOOR"]:
        u -= 50
    if a.stress + pl["stress"] >= config.TUNING["RESOURCES"]["STRESS_BREAK"]:
        u -= 80
    return u, {"inf": u_inf, "str": u_str, "cash": u_cash, "goal": u_goal,
               "rec": u_rec, "con": u_con, "risk": u_risk}


def _personality_tiebreak(a: Actor, options: List[dict]) -> dict:
    best = options[0]
    best_key = (a.personality.get("ambition", 0.5) * best["player"]["influence"]
                - a.personality.get("empathy", 0.5) * best["player"]["stress"]
                - (1 - a.personality.get("risk_appetite", 0.5)) * best["player"]["stress"])
    for ch in options[1:]:
        key = (a.personality.get("ambition", 0.5) * ch["player"]["influence"]
               - a.personality.get("empathy", 0.5) * ch["player"]["stress"]
               - (1 - a.personality.get("risk_appetite", 0.5)) * ch["player"]["stress"])
        if key > best_key:
            best, best_key = ch, key
    return best


def ai_choose(a: Actor, card: dict, state: GameState):
    scored = []
    for idx, ch in enumerate(card["choices"]):
        u, comp = compute_utility(a, ch, state)
        scored.append((u, idx, ch, comp))
    scored.sort(key=lambda x: -x[0])
    top_u = scored[0][0]
    top = [s for s in scored if top_u - s[0] < 0.5]
    if len(top) == 1:
        chosen = top[0]
    else:
        chosen = [s for s in scored if s[2] is _personality_tiebreak(a, [s[2] for s in top])][0]
    comp = chosen[3]
    return chosen[1], _motivation_hint(comp, a)


def _motivation_hint(comp, a: Actor) -> str:
    items = sorted(comp.items(), key=lambda x: -abs(x[1]))
    topk, topv = items[0]
    if topk == "goal" and abs(topv) > 1.0:
        return "似乎更在意派系利益"
    if topk == "cash" and abs(topv) > 1.0:
        return "更在意可动用预算"
    if topk == "str" and topv < -1.0:
        return "在极力规避压力"
    if topk == "inf" and topv > 1.0:
        return "野心勃勃想抢声望"
    if topk == "rec" and abs(topv) > 1.0:
        return "在权衡人情与报复"
    return "态度模糊，难以捉摸"


def update_belief_trust(state: GameState, observer: Actor, actor: Actor, ch: dict):
    state.ensure_trust(observer, actor)
    state.ensure_belief(observer, actor)
    ft = ch["faction_trust"]
    mine = ft.get(observer.faction, 0)
    rival = state.rival_faction(observer)
    riv_v = ft.get(rival, 0)
    d_trust = 1.2 * mine - 0.5 * max(0, riv_v)
    if ch["arch"] == "shield":
        d_trust += 0.8
    observer.trust[actor.idx] = clamp(observer.trust[actor.idx] + clamp(d_trust, -12, 12), -100, 100)

    cred = {"employee": 0.8, "mid": 1.0, "senior": 1.2}[observer.tier]
    b = observer.belief[actor.idx]
    updated = []
    for k, f in enumerate(config.FACTIONS):
        ev = ft.get(f, 0)
        likelihood = max(0.01, 1.0 + 0.25 * ev * cred)
        updated.append(b[k] * likelihood)
    s = sum(updated) or 1.0
    observer.belief[actor.idx] = [clamp(x / s, 0.0, 1.0) for x in updated]


def ai_vote_score(a: Actor, target: Actor, state: GameState) -> float:
    fi = FIDX[a.faction]
    b = a.belief.get(target.idx, [0.25] * 4)
    rival = state.rival_faction(a)
    rival_i = FIDX[rival]
    score = 2.2 * b[rival_i]
    score -= 1.8 * (a.trust.get(target.idx, 0.0) / 100.0)
    tw = config.TUNING["TIER_MODS"][target.tier]["vote_weight"]
    threat = (target.influence / 100.0) * tw * (1 + state._diff["ai_aggressiveness"])
    score += 1.2 * threat
    if b[fi] == max(b) and b[fi] > 0.4:
        score -= 2.5
    if target.is_player and a.idx in state.assembly["player_bribed"]:
        score -= 1.0 * max(1, state.assembly["bribes"])
    if state.assembly["accused"] == target.idx:
        score += 0.6
    if target.is_player:
        score += state._diff["player_focus_bias"]
    score += state.rng.uniform(-0.6, 0.6)
    return score


def ai_vote(a: Actor, candidates: List[Actor], state: GameState) -> Optional[int]:
    best, best_s = None, -1e9
    for t in candidates:
        if t.idx == a.idx:
            continue
        s = ai_vote_score(a, t, state)
        if s > best_s:
            best_s, best = s, t.idx
    return best


def ai_night(a: Actor, state: GameState) -> Optional[str]:
    rival = state.rival_faction(a)
    candidates = [j for j in state.actors if j.alive and j.faction != a.faction and j.idx != a.idx]
    if not candidates:
        return None
    candidates.sort(key=lambda j: (a.belief.get(j.idx, [0.25] * 4)[FIDX[rival]], j.influence),
                    reverse=True)
    target = candidates[0]
    roll = state.rng.random()
    if a.tier == "senior" and roll < 0.6:
        b = a.belief.setdefault(target.idx, [0.25] * 4)
        b[FIDX[target.faction]] = clamp(b[FIDX[target.faction]] + 0.3, 0.0, 1.0)
        s = sum(b) or 1.0
        a.belief[target.idx] = [x / s for x in b]
        return f"{a.name} 在夜间调取了 {target.name} 的背景资料。"
    else:
        target.stress = clamp(target.stress + 2.0, 0, 100)
        a.trust[target.idx] = clamp(a.trust.get(target.idx, 0.0) - 3.0, -100, 100)
        return f"{a.name} 夜里给 {target.name} 悄悄施了压。"
