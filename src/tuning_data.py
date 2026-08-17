"""全局配置：加载 config/tuning.json（外部优先 -> 内嵌 -> 开发态）。仅标准库。"""
import assets_data
import _embed_tuning  # 内嵌兜底（base64），防止 _MEIPASS 读取失败导致崩溃

FACTIONS = ["FV_A", "FV_B", "FV_C", "FV_D"]
TIERS = ["employee", "mid", "senior"]

_DEFAULTS = {
    "DAY_MAX": 12,
    "CARDS_PER_DAY_BASE": 3,
    "CARDS_PER_DAY_RAMP": {"1": 2, "2": 2},
    "ASSEMBLY_DAYS": [3, 6, 9, 12],
    "NUM_ACTORS": 9,
    "NUM_ACTORS_MIN": 7,
    "DIFFICULTY": {
        "easy": {"ai_aggressiveness": 0.35, "tau_temperature": 1.4, "player_focus_bias": 0.0,
                 "intel_accuracy": 0.90, "dd_false_positive": 0.0, "player_penalty_scale": 0.80,
                 "ai_gain_scale": 0.95, "player_start_offset": {"influence": 5, "cash": 10, "stress": 0},
                 "client_start_stability": 70, "goal_threshold": "easy", "bribe_cap": 3},
        "medium": {"ai_aggressiveness": 0.60, "tau_temperature": 1.0, "player_focus_bias": 0.15,
                   "intel_accuracy": 0.75, "dd_false_positive": 0.05, "player_penalty_scale": 1.00,
                   "ai_gain_scale": 1.00, "player_start_offset": {"influence": 0, "cash": 0, "stress": 0},
                   "client_start_stability": 60, "goal_threshold": "medium", "bribe_cap": 2},
        "hard": {"ai_aggressiveness": 0.85, "tau_temperature": 0.6, "player_focus_bias": 0.35,
                 "intel_accuracy": 0.60, "dd_false_positive": 0.15, "player_penalty_scale": 1.15,
                 "ai_gain_scale": 1.10, "player_start_offset": {"influence": -8, "cash": -10, "stress": 8},
                 "client_start_stability": 50, "goal_threshold": "hard", "bribe_cap": 1},
    },
    "AI_WEIGHTS": {"ALPHA": 1.0, "BETA": 0.8, "GAMMA": 0.7, "DELTA": 0.9},
    "FACTION_BASELINE": {
        "FV_A": {"ambition": 0.80, "loyalty": 0.35, "risk_appetite": 0.75, "empathy": 0.30, "guile": 0.55},
        "FV_B": {"ambition": 0.45, "loyalty": 0.80, "risk_appetite": 0.30, "empathy": 0.65, "guile": 0.35},
        "FV_C": {"ambition": 0.90, "loyalty": 0.40, "risk_appetite": 0.65, "empathy": 0.35, "guile": 0.85},
        "FV_D": {"ambition": 0.25, "loyalty": 0.60, "risk_appetite": 0.15, "empathy": 0.75, "guile": 0.40},
    },
}

try:
    TUNING = assets_data.load_json_asset("tuning.json", "config")
except Exception as e:  # pragma: no cover - 极端兜底
    TUNING = _embed_tuning.DATA  # 优先用内嵌完整数据，而非残缺 _DEFAULTS
    TUNING["_load_error"] = str(e)

# 合并兜底：保证关键键存在（不覆盖已加载的值）
for k, v in _DEFAULTS.items():
    TUNING.setdefault(k, v)


def diff(name):
    d = TUNING["DIFFICULTY"]
    return d.get(name) or d.get("medium") or d.get("easy") or next(iter(d.values()))


def faction_alias(fkey):
    return TUNING["FACTIONS"].get(fkey, {}).get("alias", fkey)


def faction_color(fkey):
    return TUNING["FACTIONS"].get(fkey, {}).get("color", "#888888")


def faction_goal(fkey):
    return TUNING["FACTIONS"].get(fkey, {}).get("goal", "")
