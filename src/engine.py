"""主引擎：12 天 × 6 阶段主循环、情况牌结算、联席会议串票与出局、终局判定、观察者快进。

仅依赖标准库（扁平模块布局）。设计依据 gdd 系统①~⑦ 与 ADR-002。
"""
import random
from typing import Dict, List, Optional

import cards_data as cardmod
import tuning_data as config
import ai as aimod
from state import Actor, GameState, PHASES, clamp

_CONFLICT_ARCH = {"betray", "expose", "leak", "risk"}
_STABLE_ARCH = {"invest", "cashin", "shield", "ally"}
_RATING_TITLES = {
    "S": "《新任大区总的第一杯茶》",
    "A": "《赢了公司，输了自己》",
    "A-": "《功成，然后住院》",
    "B": "《活着就是胜利》",
    "B-": "《你的名字留在了功劳簿上》",
    "C": "《我拿到了钱，公司没了》",
    "D": "《优化名单第一行》",
}


def _tier_distribution(n: int):
    senior = 2
    mid = max(2, round(0.34 * n))
    employee = n - senior - mid
    if employee < 2:
        employee = 2
        mid = max(1, n - senior - employee)
    return {"senior": senior, "mid": mid, "employee": employee}


def _faction_counts(n: int):
    counts = [2, 2, 2, 2]
    s = sum(counts)
    if n >= s:
        extra = n - s
        for k in range(extra):
            counts[k % 4] += 1
    else:
        while sum(counts) > n:
            counts[counts.index(max(counts))] -= 1
    return counts


def _make_personality(rng, faction):
    base = config.TUNING["FACTION_BASELINE"].get(faction, {})
    p = {}
    for dim in ("ambition", "loyalty", "risk_appetite", "empathy", "guile"):
        v = base.get(dim, 0.5) + rng.gauss(0, 0.15)
        p[dim] = clamp(v, 0.05, 0.95)
    return p


def setup_world(difficulty="medium", num_actors=9, player_tier=None, seed=None):
    rng = random.Random(seed)
    d = config.diff(difficulty)
    state = GameState(rng, difficulty, num_actors)
    state._diff = d

    names = ["你", "周明远", "林晚", "赵承宇", "苏蔓", "陈屿", "韩立", "顾岚", "沈舟",
             "白露", "江涛", "方知", "叶蓁", "罗成", "唐婉", "宋扬", "陆鸣", "许清"]
    dist = _tier_distribution(num_actors)
    ptier = player_tier or rng.choice(["employee", "mid", "senior"])
    dist[ptier] = max(0, dist[ptier] - 1)
    tier_list = []
    for t, c in dist.items():
        tier_list += [t] * c
    rng.shuffle(tier_list)

    counts = _faction_counts(num_actors)
    fac_list = []
    for f, c in zip(config.FACTIONS, counts):
        fac_list += [f] * c
    rng.shuffle(fac_list)

    player = Actor(idx=0, name=names[0], is_player=True, tier=ptier)
    player.personality = _make_personality(rng, fac_list[0])
    player.faction = fac_list[0]
    _init_actor_resources(player, d, True, difficulty)
    state.actors.append(player)

    for i in range(1, num_actors):
        a = Actor(idx=i, name=names[i], tier=tier_list[i - 1])
        a.personality = _make_personality(rng, fac_list[i])
        a.faction = fac_list[i]
        _init_actor_resources(a, d, False, difficulty)
        state.actors.append(a)

    for a in state.actors:
        for j in state.actors:
            a.trust[j.idx] = 8.0 if a.faction == j.faction else 0.0
            a.belief[j.idx] = [0.25, 0.25, 0.25, 0.25]

    cfac = []
    for f in config.FACTIONS:
        cfac += [f, f]
    for k, f in enumerate(cfac):
        state.clients.append({"owner": f, "stability": float(d["client_start_stability"])})
    return state


def _init_actor_resources(a: Actor, d, is_player, difficulty="medium"):
    base = config.TUNING["INIT_RESOURCES"][a.tier]
    rm = config.TUNING["REIGN_METERS"]
    if is_player:
        off = d["player_start_offset"]
        a.influence = clamp(base["influence"] + off.get("influence", 0), 0, 100)
        a.stress = clamp(base["stress"] + off.get("stress", 0), 0, 100)
        a.cash = clamp(base["cash"] + off.get("cash", 0), -30, 300)
        # Reigns：业绩/人脉 50 基线 + 难度 offset（easy +3 / medium 0 / hard -3）
        roff = config.TUNING.get("PLAYER_START_OFFSET_REIGN", {}).get(difficulty, 0)
        a.performance = clamp(rm["performance"]["init"] + roff, rm["performance"]["min"], rm["performance"]["max"])
        a.network = clamp(rm["network"]["init"] + roff, rm["network"]["min"], rm["network"]["max"])
    else:
        a.influence = clamp(round(base["influence"] * random.uniform(0.9, 1.1)), 0, 100)
        a.stress = clamp(round(base["stress"] * random.uniform(0.9, 1.1)), 0, 100)
        a.cash = clamp(round(base["cash"] * random.uniform(0.9, 1.1)), -30, 300)
        # Reigns：AI 持数值仅用于投票威胁拟真（不触危机），50 ± 10 个体随机
        a.performance = clamp(round(rm["performance"]["init"] + random.uniform(-10, 10)), rm["performance"]["min"], rm["performance"]["max"])
        a.network = clamp(round(rm["network"]["init"] + random.uniform(-10, 10)), rm["network"]["min"], rm["network"]["max"])


def apply_choice(state: GameState, actor: Actor, ch: dict, is_player: bool):
    tm = config.TUNING["TIER_MODS"][actor.tier]
    pl = ch["player"]
    D = config.TUNING["DERIVED"]
    if is_player:
        pscale = state._diff["player_penalty_scale"]
        sgn = lambda v: v * pscale if v < 0 else v
    else:
        gscale = state._diff["ai_gain_scale"]
        sgn = lambda v: v * gscale if v > 0 else v

    dinf = sgn(pl["influence"] * tm["influence_gain"])
    dstr = sgn(pl["stress"] * tm["stress_gain"])
    dcash = sgn(pl["cash"])

    if actor.influence >= D["influence_high"]:
        dinf *= 0.7
    if actor.influence <= D["influence_low"]:
        dstr *= 0.8
    if actor.stress >= D["stress_high"]:
        dinf *= 0.8

    c12 = D["single_card_net_clamp"]
    dinf = clamp(dinf, -c12, c12)
    dstr = clamp(dstr, -c12, c12)
    dcash = clamp(dcash, -c12, c12)

    # Reigns：业绩 / 人脉 同样走 tier 缩放（接现有 tm 思路）
    dperf = sgn(pl.get("performance", 0) * tm["influence_gain"])
    dnet = sgn(pl.get("network", 0) * tm["influence_gain"])
    if actor.influence >= D["influence_high"]:
        dperf *= 0.7
        dnet *= 0.7
    if actor.stress >= D["stress_high"]:
        dperf *= 0.8
        dnet *= 0.8
    # 软重置后「2 天增益衰减 ×0.7」防再触
    rsm = config.TUNING["REIGN_SOFT_RESET"]
    if actor.reign_debuff_days.get("performance", 0) > 0:
        dperf *= rsm["debuff_gain_mult"]
    if actor.reign_debuff_days.get("network", 0) > 0:
        dnet *= rsm["debuff_gain_mult"]
    dperf = clamp(dperf, -c12, c12)
    dnet = clamp(dnet, -c12, c12)

    actor.influence += dinf
    actor.stress += dstr
    actor.cash += dcash
    actor.performance += dperf
    actor.network += dnet
    state.clamp_actor(actor)


# ---- Reigns 触边危机（reigns_layer.md §5）----
# 危机 id 与 GDD §5 一一对应：①业绩致命 ②业绩满 ③人脉空 ④人脉满
# ⑤声望空(启动慢性) ⑥声望满 ⑦精力致命 ⑧精力满
def _reign_fatal(state, actor, meter_name, cause, crisis_id):
    actor.alive = False
    actor.out_day = state.day
    actor.out_cause = cause
    state.observer = True
    state.ended_early = True
    state.end_meter = {
        "type": "fatal", "meter": meter_name, "crisis": crisis_id,
        "cause": cause, "day": state.day,
    }


def _reign_soft(state, actor, mkey, mname, crisis_id):
    R = config.TUNING["RESOURCES"]
    RS = config.TUNING["REIGN_SOFT_RESET"]
    setattr(actor, mkey, 50)
    actor.cash = clamp(actor.cash - RS["cash_penalty"], R["cash"]["min"], R["cash"]["max"])
    actor.reign_debuff_days[mkey] = RS["debuff_days"]  # 2 天增益衰减 ×0.7
    if mkey == "influence":
        actor.chronic_influence = True  # 启动慢性边缘化追踪
    if state.end_meter is None:
        state.end_meter = {"type": "soft", "meters": [], "crises": [], "day": state.day}
    state.end_meter["meters"].append(mname)
    state.end_meter["crises"].append(crisis_id)


def check_edges(state):
    """Reigns 触边检查（§5.1）：每次选项后 / 日结后 / 联席会议后各跑一次。
    致命（performance==0 或 stress==100）→ 终局并记 end_meter；
    软重置（业绩/人脉/声望/精力 触 0 或 100）→ 该表盘回 50 + 预算扣罚 + 2 天增益衰减；
    软重置后再查一次，最多迭代 3 次，仍命中按致命处理。
    返回本回合触发的危机事件列表（供 UI 展示）。
    """
    p = state.player()
    if not p.alive:
        return []
    RM = config.TUNING["REIGN_METERS"]
    R = config.TUNING["RESOURCES"]
    # 1) 致命优先
    if p.performance <= RM["performance"]["min"]:
        _reign_fatal(state, p, "业绩", "优化名单（业绩触底被辞退）", "①")
        return [state.end_meter]
    if p.stress >= R["STRESS_BREAK"]:  # energy == 0，复用 stress=100 崩溃
        _reign_fatal(state, p, "精力", "长期病假（精力崩溃）", "⑦")
        return [state.end_meter]
    # 2) 软重置（按 业绩>人脉>声望>精力 顺序）
    meters = [
        ("performance", "业绩", "②"), ("network", "人脉", "③"),
        ("influence", "声望", "⑤"), ("stress", "精力", "⑧"),
    ]
    triggered = []
    for _ in range(3):
        hit = False
        for mkey, mname, cid in meters:
            v = getattr(p, mkey)
            if v <= 0 or v >= 100:
                # 已在上文按致命处理的组合不再软重置（冗余保险）
                if mkey == "performance" and v <= 0:
                    continue
                if mkey == "stress" and v >= 100:
                    continue
                _reign_soft(state, p, mkey, mname, cid)
                hit = True
                triggered.append({"meter": mname, "crisis": cid})
        if not hit:
            break
    else:
        # 三次迭代仍命中 → 系统性崩溃，按致命处理
        _reign_fatal(state, p, "声望", "表盘系统性触边出局", "⚠")
        return [state.end_meter]
    state.clamp_actor(p)
    return triggered


def apply_client_effects(state: GameState, actor: Actor, ch: dict):
    arch = ch["arch"]
    if arch in ("invest", "cashin"):
        _boost_client(state, actor.faction, 6)
    elif arch in ("shield", "ally"):
        _boost_client(state, actor.faction, 3)
    elif arch in ("betray", "expose", "risk"):
        _attack_client(state, actor)


def _boost_client(state, faction, amount):
    mine = [c for c in state.clients if c["owner"] == faction]
    if not mine:
        return
    target = min(mine, key=lambda c: c["stability"])
    target["stability"] = clamp(target["stability"] + amount, 0, 100)


def _attack_client(state, actor):
    enemies = [c for c in state.clients if c["owner"] != actor.faction]
    if not enemies:
        return
    target = min(enemies, key=lambda c: c["stability"])
    target["stability"] = clamp(target["stability"] - 6, 0, 100)
    if target["stability"] <= 20:
        old = target["owner"]
        target["owner"] = actor.faction
        target["stability"] = 40.0
        state.clients_taken[actor.faction] += 1
        state.clients_lost[old] += 1


def resolve_card(state: GameState, card: dict, controller):
    player = state.player()
    choice_of: Dict[int, dict] = {}

    if player.alive:
        idx = controller.pick_card(state, card)
        if player.stress >= config.TUNING["DERIVED"]["stress_high"] and \
                state.rng.random() < (player.stress - config.TUNING["DERIVED"]["stress_high"]) / 100.0:
            idx = state.rng.randrange(len(card["choices"]))
            state.log_msg(f"【失态】你压力过载，选择失控为「{card['choices'][idx]['label']}」。")
        choice_of[player.idx] = card["choices"][idx]
        apply_choice(state, player, choice_of[player.idx], True)
        player.actions += 1
        if card["choices"][idx]["arch"] in ("betray", "expose"):
            player.betrayals += 1
    else:
        state.log_msg(f"（你已出局，旁观）{card['title']} 在场上继续发酵。")

    for a in state.alive_actors():
        if a.is_player:
            continue
        cidx, hint = aimod.ai_choose(a, card, state)
        ch = card["choices"][cidx]
        choice_of[a.idx] = ch
        a.motivation = hint
        apply_choice(state, a, ch, False)
        a.actions += 1

    # 修复1：把本张牌上所有角色所选选项的派系信任增量，按全场均值累加到全局 faction_trust。
    # 此前该增量从未写入，导致 faction_trust 恒为 0 —— rival_faction 僵死、派系动态失效。
    ch_list = [ch for ch in choice_of.values() if ch]
    if ch_list:
        for f in config.FACTIONS:
            mean = sum(ch["faction_trust"].get(f, 0) for ch in ch_list) / len(ch_list)
            state.faction_trust[f] = clamp(state.faction_trust[f] + mean, -100, 100)

    for obs in state.alive_actors():
        for act in state.alive_actors():
            if act.idx == obs.idx:
                continue
            ch = choice_of.get(act.idx)
            if ch:
                aimod.update_belief_trust(state, obs, act, ch)

    has_conflict = any(ch["arch"] in _CONFLICT_ARCH for ch in choice_of.values())
    has_leak = any(ch["arch"] == "leak" for ch in choice_of.values())
    if has_conflict:
        state.chaos = clamp(state.chaos + config.TUNING["CHAOS"]["backstab"], 0, 100)
    if has_leak:
        state.chaos = clamp(state.chaos + config.TUNING["CHAOS"]["report"] * 0.5, 0, 100)
    for act, ch in choice_of.items():
        apply_client_effects(state, state.actors[act], ch)


def phase_morning(state: GameState, controller):
    controller.show_info(state, "morning",
                         f"第 {state.day} 天 · 晨会：昨日全局冲突度 {state.chaos:.0f}，"
                         f"你的声望 {state.player().influence:.0f} / 压力 {state.player().stress:.0f}。")
    state.log_msg(f"[D{state.day}] 晨会：冲突度 {state.chaos:.0f}")


def phase_day_cards(state: GameState, controller):
    ramp = config.TUNING["CARDS_PER_DAY_RAMP"].get(str(state.day), config.TUNING["CARDS_PER_DAY_BASE"])
    n = config.TUNING["CARDS_PER_DAY_BASE"] if state.day > 2 else ramp
    drawn = cardmod.draw_day_cards(state, state.day, n)
    for card in drawn:
        state.log_msg(f"[D{state.day}] 情况牌《{card['title']}》（{card['category']}）")
        resolve_card(state, card, controller)


def phase_noon(state: GameState, controller):
    if not state.player().alive:
        return
    target = controller.noon_talk(state)
    if target is not None and 0 <= target < len(state.actors) and state.actors[target].alive:
        state.log_msg(f"[D{state.day}] 你与 {state.actors[target].name} 进行了午间密谈。")


def phase_night(state: GameState, controller):
    player = state.player()
    if player.alive:
        act = controller.night_action(state)
        if act:
            ability, target = act
            if 0 <= target < len(state.actors) and state.actors[target].alive:
                state.log_msg(f"[D{state.day}] 你使用了「{ability}」于 {state.actors[target].name}。")
    for a in state.alive_actors():
        if a.is_player:
            continue
        desc = aimod.ai_night(a, state)
        if desc:
            state.log_msg(desc)


def phase_settle(state: GameState, controller):
    D = config.TUNING["DERIVED"]
    R = config.TUNING["RESOURCES"]
    for a in state.alive_actors():
        a.stress = clamp(a.stress + config.TUNING["RESOURCE_NATURAL"]["stress_per_day"], 0, 100)
        if a.tier == "mid":
            a.stress = clamp(a.stress + config.TUNING["RESOURCE_NATURAL"]["mid_extra_stress"], 0, 100)
        if a.cash < 0:
            a.stress = clamp(a.stress + D["cash_negative_stress"], 0, 100)
        if a.influence > 100:
            overflow = a.influence - 100
            a.influence = 100
            a.cash = clamp(a.cash + overflow * D["influence_overflow_to_cash"], R["cash"]["min"], R["cash"]["max"])
        if a.stress >= D["stress_critical"]:
            a.influence = clamp(a.influence - 2, 0, 100)
        if a.influence <= 0:
            a.influence_zero_days += 1
        else:
            a.influence_zero_days = 0
        state.clamp_actor(a)

    for a in state.alive_actors():
        if a.stress >= R["STRESS_BREAK"]:
            _eliminate(state, a, "长期病假（压力崩溃）")
    for a in state.alive_actors():
        if a.influence_zero_days >= R["INFLUENCE_ZERO_GRACE"]:
            _eliminate(state, a, "边缘化调岗（声望清零）")
    if state.player().alive and state.player().cash <= R["CASH_FLOOR"] and state.day in config.TUNING["ASSEMBLY_DAYS"]:
        if state.rng.random() < 0.6:
            _eliminate(state, state.player(), "审计约谈（资金穿底）")

    state.chaos = clamp(state.chaos - config.TUNING["CHAOS"]["daily_decay"], 0, 100)
    controller.show_info(state, "settle",
                         f"第 {state.day} 天 · 日结：你的声望 {state.player().influence:.0f} / "
                         f"压力 {state.player().stress:.0f} / 预算 {state.player().cash:.0f} 万。")


def phase_assembly(state: GameState, controller):
    state.assembly = {"accused": None, "deflect": False, "bribes": 0, "player_bribed": set(), "defend": False}
    alive = state.alive_actors()
    if len(alive) <= 1:
        return
    if state.player().alive:
        tmpl, tgt = controller.assembly_speech(state)
        if tmpl == "accuse" and tgt is not None:
            state.assembly["accused"] = tgt
            for a in alive:
                a.trust[tgt] = clamp(a.trust.get(tgt, 0) - config.TUNING["SPEECH_TEMPLATES"]["accuse"]["trust_target"], -100, 100)
            state.log_msg(f"[D{state.day}] 你在联席会议上指认了 {state.actors[tgt].name}。")
        elif tmpl == "defend":
            state.assembly["defend"] = True
            state.log_msg(f"[D{state.day}] 你在联席会议上自辩。")
        elif tmpl == "deflect":
            state.assembly["deflect"] = True
            state.log_msg(f"[D{state.day}] 你把议题引向别处，转移了话题。")
        nb = controller.assembly_bribe(state)
        cap = state._diff["bribe_cap"]
        nb = clamp(nb, 0, cap)
        cost = nb * config.TUNING["PRICES"]["buy_vote"]
        if nb > 0 and state.player().cash >= cost:
            state.player().cash -= cost
            state.assembly["bribes"] = nb
            ais = [a for a in alive if not a.is_player]
            state.rng.shuffle(ais)
            state.assembly["player_bribed"] = set(a.idx for a in ais[:nb])
            state.log_msg(f"[D{state.day}] 你花费 {cost} 万可动用预算买下 {nb} 张票。")

    votes = {a.idx: 0.0 for a in alive}
    for a in alive:
        if a.is_player:
            tgt = controller.assembly_vote(state, alive) if state.player().alive else None
        else:
            tgt = aimod.ai_vote(a, alive, state)
        if tgt is not None:
            w = a.vote_weight()
            if a.is_player and state.assembly["defend"]:
                w *= config.TUNING["SPEECH_TEMPLATES"]["defend"]["self_vote_mult"]
            votes[tgt] = votes.get(tgt, 0.0) + w

    best, best_v = None, -1.0
    for a in alive:
        v = votes.get(a.idx, 0.0)
        if v > best_v:
            best_v, best = v, a
    if best is None or len(alive) <= 1:
        return
    ties = [a for a in alive if abs(votes.get(a.idx, 0.0) - best_v) < 1e-6]
    if len(ties) > 1:
        ties.sort(key=lambda a: (a.influence, state.rng.random()))
        best = ties[0]
    _eliminate(state, best, "优化名单（联席会议投票出局）")
    state.chaos = clamp(state.chaos + config.TUNING["CHAOS"]["vote_out"], 0, 100)
    state.log_msg(f"[D{state.day}] 联席会议：{best.name} 被投出局（{best_v:.1f} 票）。")


def _eliminate(state: GameState, actor: Actor, cause: str):
    actor.alive = False
    actor.out_day = state.day
    actor.out_cause = cause
    state.log_msg(f"  ⚠ {actor.name} 出局：{cause}（第 {state.day} 天）")
    if actor.is_player:
        state.observer = True


def evaluate_goal(state: GameState, fkey: str):
    th = config.TUNING["GOAL_THRESHOLDS"][fkey][state._diff["goal_threshold"]]
    members = state.faction_members(fkey, alive_only=True)
    has_member = len(members) > 0
    if fkey == "FV_A":
        taken = state.clients_taken.get(fkey, 0)
        if taken >= th["full"]:
            return "full"
        if taken >= th["bare"]:
            return "bare"
        if taken == 0 and state.clients_lost.get(fkey, 0) > 0:
            return "disaster"
        return "fail"
    if fkey == "FV_B":
        lost = state.clients_lost.get(fkey, 0)
        mine = [c for c in state.clients if c["owner"] == fkey]
        avg_stab = sum(c["stability"] for c in mine) / len(mine) if mine else 0
        if lost <= th["full_lost"] and avg_stab >= th["full_stab"]:
            return "full"
        if lost <= th["bare_lost"]:
            return "bare"
        if lost >= 3:
            return "disaster"
        return "fail"
    if fkey == "FV_C":
        ps = state.power_score(fkey)
        if ps >= th["full"]:
            return "full"
        if ps >= th["bare"]:
            return "bare"
        if not has_member:
            return "disaster"
        return "fail"
    if fkey == "FV_D":
        rep = state.player().stress if (state.player().faction == fkey and state.player().alive) \
            else (sum(m.stress for m in members) / len(members) if members else 100)
        if not has_member:
            return "disaster" if state.chaos >= 70 else "fail"
        if rep <= th["full_stress"] and state.chaos <= th["full_chaos"]:
            return "full"
        if rep <= th["bare_stress"]:
            return "bare"
        return "fail"
    return "fail"


def evaluate_sub_goal(state: GameState, fkey: str):
    p = state.player()
    if fkey == "FV_A":
        return any(a.out_day is not None and a.out_day < 12 and a.faction != p.faction
                   for a in state.actors if not a.alive)
    if fkey == "FV_B":
        return p.influence >= 55
    if fkey == "FV_C":
        return p.betrayals >= 3
    if fkey == "FV_D":
        return p.cash >= 60 and p.out_cause != "审计约谈（资金穿底）"
    return False


def final_judge(state: GameState):
    p = state.player()
    fkey = p.faction
    faction_tier = evaluate_goal(state, fkey)
    sub_ok = evaluate_sub_goal(state, fkey)
    alive = p.alive

    if not alive:
        if p.out_cause and "压力" in p.out_cause and faction_tier == "full":
            rating = "A-"
        elif faction_tier == "full":
            rating = "B-"
        else:
            rating = "D"
    else:
        if faction_tier == "full" and sub_ok:
            rating = "S"
        elif faction_tier == "full":
            rating = "A"
        elif faction_tier == "bare":
            rating = "B"
        elif faction_tier == "fail" and sub_ok:
            rating = "C"
        else:
            rating = "D"

    if not alive:
        outcome = "observer"
    elif faction_tier in ("full", "bare"):
        outcome = "win"
    else:
        outcome = "lose"

    reveal = []
    for a in state.actors:
        reveal.append({
            "name": a.name, "is_player": a.is_player, "faction": a.faction,
            "faction_alias": a.faction_alias, "tier": a.tier, "alive": a.alive,
            "out_day": a.out_day, "out_cause": a.out_cause,
            "goal": config.faction_goal(a.faction),
            "influence": round(a.influence), "stress": round(a.stress), "cash": round(a.cash),
        })

    result = {
        "day": state.day,
        "outcome": outcome,
        "rating": rating,
        "title": _RATING_TITLES.get(rating, "未知结局"),
        "player_alive": alive,
        "observer": state.observer,
        "faction": fkey,
        "faction_alias": config.faction_alias(fkey),
        "faction_tier": faction_tier,
        "sub_ok": sub_ok,
        "difficulty": state.difficulty,
        "num_actors": state.num_actors,
        "player_tier": p.tier,
        "chaos": round(state.chaos),
        "power_score": round(state.power_score(fkey)),
        "clients_taken": state.clients_taken.get(fkey, 0),
        "clients_lost": state.clients_lost.get(fkey, 0),
        "reveal": reveal,
        "log": state.log[-60:],
    }
    state.result = result
    return result


class Controller:
    """玩家决策接口。GUI 在 ui_app.py 中覆写；headless 使用 RandomController。"""
    def show_info(self, state, phase, text):
        pass
    def pick_card(self, state, card):
        return 0
    def noon_talk(self, state):
        return None
    def night_action(self, state):
        return None
    def assembly_speech(self, state):
        return ("deflect", None)
    def assembly_bribe(self, state):
        return 0
    def assembly_vote(self, state, candidates):
        return None
    def game_over(self, state, result):
        pass


class RandomController(Controller):
    def pick_card(self, state, card):
        p = state.player()
        floor = config.TUNING["RESOURCES"]["CASH_FLOOR"]
        valid = [i for i, ch in enumerate(card["choices"])
                 if p.cash + ch["player"]["cash"] >= floor]
        if valid:
            return state.rng.choice(valid)
        return state.rng.randrange(len(card["choices"]))

    def noon_talk(self, state):
        if state.rng.random() < 0.5:
            return None
        alive = [a.idx for a in state.alive_actors() if not a.is_player]
        return state.rng.choice(alive) if alive else None

    def night_action(self, state):
        if state.rng.random() < 0.5:
            return None
        alive = [a.idx for a in state.alive_actors() if not a.is_player]
        if not alive:
            return None
        return (state.rng.choice(["施压", "调阅背景", "挪预算"]), state.rng.choice(alive))

    def assembly_speech(self, state):
        tmpl = state.rng.choice(["accuse", "defend", "deflect"])
        if tmpl == "accuse":
            alive = [a.idx for a in state.alive_actors() if not a.is_player]
            return (tmpl, state.rng.choice(alive) if alive else None)
        return (tmpl, None)

    def assembly_bribe(self, state):
        if state.rng.random() < 0.4:
            return state.rng.randint(0, state._diff["bribe_cap"])
        return 0

    def assembly_vote(self, state, candidates):
        alive = [a.idx for a in candidates if not a.is_player]
        return state.rng.choice(alive) if alive else None


def run_game(difficulty="medium", num_actors=9, player_tier=None,
             controller=None, seed=None):
    state = setup_world(difficulty=difficulty, num_actors=num_actors,
                        player_tier=player_tier, seed=seed)
    ctrl = controller or RandomController()
    day_max = config.TUNING["DAY_MAX"]
    assembly_days = set(config.TUNING["ASSEMBLY_DAYS"])

    for day in range(1, day_max + 1):
        state.day = day
        phase_morning(state, ctrl)
        phase_day_cards(state, ctrl)
        phase_noon(state, ctrl)
        phase_night(state, ctrl)
        phase_settle(state, ctrl)
        if day in assembly_days:
            phase_assembly(state, ctrl)
        alive = state.alive_actors()
        if len(alive) <= 1:
            state.ended_early = True
            break

    result = final_judge(state)
    ctrl.game_over(state, result)
    return result


def run_headless(num_games=50, difficulty="medium", num_actors=9,
                 player_tier=None, seed=None):
    crashes = 0
    outcomes = {"win": 0, "lose": 0, "observer": 0}
    ratings = {}
    examples = []
    for i in range(num_games):
        gseed = (seed + i) if seed is not None else None
        try:
            res = run_game(difficulty=difficulty, num_actors=num_actors,
                           player_tier=player_tier, seed=gseed)
            outcomes[res["outcome"]] = outcomes.get(res["outcome"], 0) + 1
            ratings[res["rating"]] = ratings.get(res["rating"], 0) + 1
            if i < 5:
                examples.append(res)
        except Exception as e:  # pragma: no cover
            crashes += 1
            import traceback
            examples.append({"error": str(e), "trace": traceback.format_exc()})
    return {
        "num_games": num_games, "crashes": crashes, "outcomes": outcomes,
        "ratings": ratings, "examples": examples,
    }
