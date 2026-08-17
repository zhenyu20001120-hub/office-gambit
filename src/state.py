"""游戏状态与实体定义：Actor / GameState / 阶段枚举 / 资源裁剪。仅标准库。"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import tuning_data

PHASES = ["morning", "day_cards", "noon_talk", "night", "settle", "assembly"]
PHASE_LABELS = {
    "morning": "晨会", "day_cards": "白天·情况牌", "noon_talk": "午间密谈",
    "night": "夜间行动", "settle": "日结", "assembly": "联席会议",
}


def clamp(v, lo, hi):
    return lo if v < lo else (hi if v > hi else v)


@dataclass
class Actor:
    idx: int
    name: str
    is_player: bool = False
    tier: str = "employee"
    faction: str = "FV_A"
    personality: Dict[str, float] = field(default_factory=dict)
    influence: float = 25.0
    stress: float = 10.0
    cash: float = 20.0
    alive: bool = True
    out_day: Optional[int] = None
    out_cause: Optional[str] = None
    trust: Dict[int, float] = field(default_factory=dict)
    belief: Dict[int, List[float]] = field(default_factory=dict)
    betrayals: int = 0
    actions: int = 0
    influence_zero_days: int = 0
    motivation: str = ""
    revealed: bool = False
    ability_cd: Dict[str, int] = field(default_factory=dict)

    @property
    def faction_alias(self):
        return tuning_data.faction_alias(self.faction)

    def vote_weight(self):
        return tuning_data.TUNING["TIER_MODS"][self.tier]["vote_weight"]


class GameState:
    def __init__(self, rng, difficulty="medium", num_actors=9):
        self.rng = rng
        self.difficulty = difficulty
        self.num_actors = num_actors
        self.actors: List[Actor] = []
        self.day = 1
        self.phase = "morning"
        self.faction_trust: Dict[str, float] = {f: 0.0 for f in tuning_data.FACTIONS}
        self.chaos = 0.0
        self.clients: List[Dict[str, object]] = []
        self.log: List[str] = []
        self.used_cards: set = set()
        self.assembly = {"accused": None, "deflect": False, "bribes": 0, "player_bribed": set()}
        self.result = None
        self.observer = False
        self.ended_early = False
        self.clients_taken = {f: 0 for f in tuning_data.FACTIONS}
        self.clients_lost = {f: 0 for f in tuning_data.FACTIONS}
        self._diff = tuning_data.diff(difficulty)

    def clamp_actor(self, a: Actor):
        r = tuning_data.TUNING["RESOURCES"]
        a.influence = clamp(a.influence, r["influence"]["min"], r["influence"]["max"])
        a.stress = clamp(a.stress, r["stress"]["min"], r["stress"]["max"])
        a.cash = clamp(a.cash, r["cash"]["min"], r["cash"]["max"])

    def alive_actors(self):
        return [a for a in self.actors if a.alive]

    def player(self):
        return self.actors[0]

    def faction_members(self, fkey, alive_only=True):
        return [a for a in self.actors if a.faction == fkey and (a.alive or not alive_only)]

    def power_score(self, fkey):
        tw = tuning_data.TUNING["TIER_WEIGHT_FOR_POWER"]
        score = 0.0
        seats = 0
        for a in self.actors:
            if a.faction == fkey and a.alive:
                score += a.influence * tw.get(a.tier, 1.0)
                if a.tier == "senior":
                    seats += 1
        return score + 10.0 * seats

    def log_msg(self, msg: str):
        self.log.append(msg)

    def ensure_belief(self, i: Actor, j: Actor):
        if j.idx not in i.belief:
            i.belief[j.idx] = [0.25, 0.25, 0.25, 0.25]

    def ensure_trust(self, i: Actor, j: Actor):
        if j.idx not in i.trust:
            i.trust[j.idx] = 0.0

    def rival_faction(self, a: Actor):
        best, bestv = None, -1e9
        for f in tuning_data.FACTIONS:
            if f == a.faction:
                continue
            v = self.faction_trust.get(f, 0.0)
            if v > bestv:
                bestv, best = v, f
        return best or "FV_B"
