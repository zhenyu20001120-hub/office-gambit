"""存档：GameState <-> JSON。默认位于 用户文档/职场营销博弈/saves 或 exe 同目录 saves/。仅标准库。"""
import json
import os
import sys

from state import Actor, GameState
import tuning_data

SAVE_DIR = None


def _default_save_dir():
    if getattr(sys, "frozen", False):
        base = os.path.dirname(os.path.abspath(sys.executable))
    else:
        base = os.path.expanduser("~/Documents")
    d = os.path.join(base, "职场营销博弈", "saves")
    try:
        os.makedirs(d, exist_ok=True)
    except OSError:
        d = os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), "saves")
        os.makedirs(d, exist_ok=True)
    return d


def save_game(state: GameState, path=None):
    if path is None:
        global SAVE_DIR
        SAVE_DIR = SAVE_DIR or _default_save_dir()
        path = os.path.join(SAVE_DIR, f"save_D{state.day}.json")
    data = {
        "version": 1,
        "difficulty": state.difficulty,
        "num_actors": state.num_actors,
        "day": state.day,
        "phase": state.phase,
        "chaos": state.chaos,
        "faction_trust": state.faction_trust,
        "clients": state.clients,
        "clients_taken": state.clients_taken,
        "clients_lost": state.clients_lost,
        "used_cards": list(state.used_cards),
        "observer": state.observer,
        "log": state.log[-200:],
        "actors": [],
    }
    for a in state.actors:
        data["actors"].append({
            "idx": a.idx, "name": a.name, "is_player": a.is_player, "tier": a.tier,
            "faction": a.faction, "personality": a.personality,
            "influence": a.influence, "stress": a.stress, "cash": a.cash,
            "alive": a.alive, "out_day": a.out_day, "out_cause": a.out_cause,
            "trust": a.trust, "belief": a.belief, "betrayals": a.betrayals,
            "actions": a.actions, "influence_zero_days": a.influence_zero_days,
            "motivation": a.motivation,
        })
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return path


def load_game(path):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    state = GameState(None, data.get("difficulty", "medium"), data.get("num_actors", 9))
    state.day = data.get("day", 1)
    state.phase = data.get("phase", "morning")
    state.chaos = data.get("chaos", 0.0)
    state.faction_trust = data.get("faction_trust", state.faction_trust)
    state.clients = data.get("clients", [])
    state.clients_taken = data.get("clients_taken", {f: 0 for f in tuning_data.FACTIONS})
    state.clients_lost = data.get("clients_lost", {f: 0 for f in tuning_data.FACTIONS})
    state.used_cards = set(data.get("used_cards", []))
    state.observer = data.get("observer", False)
    state.log = data.get("log", [])
    state.actors = []
    for ad in data.get("actors", []):
        a = Actor(
            idx=ad["idx"], name=ad["name"], is_player=ad.get("is_player", False),
            tier=ad.get("tier", "employee"), faction=ad.get("faction", "FV_A"),
            personality=ad.get("personality", {}),
            influence=ad.get("influence", 25), stress=ad.get("stress", 10),
            cash=ad.get("cash", 20), alive=ad.get("alive", True),
            out_day=ad.get("out_day"), out_cause=ad.get("out_cause"),
            trust=ad.get("trust", {}), belief=ad.get("belief", {}),
            betrayals=ad.get("betrayals", 0), actions=ad.get("actions", 0),
            influence_zero_days=ad.get("influence_zero_days", 0),
            motivation=ad.get("motivation", ""),
        )
        state.actors.append(a)
    state._diff = tuning_data.diff(state.difficulty)
    return state
