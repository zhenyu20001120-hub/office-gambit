// 自动生成自 config/tuning.json —— 引擎全部数值外置，键名与 tuning.json 一致。
const TUNING = {
  "version": "1.0",
  "comment": "《职场营销博弈》全部平衡/数值外置于此。策划改数不改代码。所有键缺失时引擎有兜底默认值。",
  "DAY_MAX": 12,
  "CARDS_PER_DAY_BASE": 3,
  "CARDS_PER_DAY_RAMP": {
    "1": 2,
    "2": 2
  },
  "ASSEMBLY_DAYS": [
    3,
    6,
    9,
    12
  ],
  "NUM_ACTORS": 9,
  "NUM_ACTORS_MIN": 7,
  "FACTIONS": {
    "FV_A": {
      "alias": "锐盟",
      "name": "华锐-西盟合资",
      "goal": "吞并份额",
      "color": "#B23A2E",
      "light": "#E2705A",
      "deep": "#5E1A14",
      "accent": "#F2C4A8",
      "glyph": "flame"
    },
    "FV_B": {
      "alias": "衡明",
      "name": "中衡-明德合资",
      "goal": "守住客户",
      "color": "#2E5FB2",
      "light": "#5E92D8",
      "deep": "#142A52",
      "accent": "#AECBEA",
      "glyph": "wave"
    },
    "FV_C": {
      "alias": "星海",
      "name": "星海-科盛合资",
      "goal": "上位夺权",
      "color": "#7A3BA2",
      "light": "#A86ED0",
      "deep": "#321A4E",
      "accent": "#D8B8F0",
      "glyph": "diamond"
    },
    "FV_D": {
      "alias": "长安",
      "name": "长盛-合安合资",
      "goal": "平稳落地",
      "color": "#C8923A",
      "light": "#E8C070",
      "deep": "#5E4414",
      "accent": "#F5E0A0",
      "glyph": "coin"
    }
  },
  "RESOURCES": {
    "influence": {
      "min": 0,
      "max": 100
    },
    "stress": {
      "min": 0,
      "max": 100
    },
    "cash": {
      "min": -30,
      "max": 300
    },
    "CASH_FLOOR": -30,
    "STRESS_BREAK": 100,
    "INFLUENCE_ZERO_GRACE": 2
  },
  "INIT_RESOURCES": {
    "employee": {
      "influence": 25,
      "stress": 10,
      "cash": 20
    },
    "mid": {
      "influence": 45,
      "stress": 15,
      "cash": 45
    },
    "senior": {
      "influence": 65,
      "stress": 18,
      "cash": 80
    }
  },
  "RESOURCE_NATURAL": {
    "stress_per_day": -2,
    "mid_extra_stress": 1
  },
  "TIER_MODS": {
    "employee": {
      "influence_gain": 0.8,
      "stress_gain": 1.2,
      "vote_weight": 1,
      "passive_stress": 0,
      "vote_threat_weight": 1
    },
    "mid": {
      "influence_gain": 1,
      "stress_gain": 1,
      "vote_weight": 1.5,
      "passive_stress": 1,
      "vote_threat_weight": 0.7
    },
    "senior": {
      "influence_gain": 1.2,
      "stress_gain": 0.9,
      "vote_weight": 2,
      "passive_stress": 0,
      "vote_target_bonus": 0.1,
      "vote_threat_weight": 0.74
    }
  },
  "TIER_WEIGHT_FOR_POWER": {
    "employee": 1,
    "mid": 1.3,
    "senior": 1.6
  },
  "PRICES": {
    "buy_vote": 8,
    "buy_intel": 5,
    "pr_fire": 12,
    "entertain_client": 10,
    "stabilize": 8
  },
  "BRIBE_CAP": {
    "easy": 3,
    "medium": 2,
    "hard": 1
  },
  "DIFFICULTY": {
    "easy": {
      "ai_aggressiveness": 0.35,
      "tau_temperature": 1.4,
      "player_focus_bias": 0,
      "intel_accuracy": 0.9,
      "dd_false_positive": 0,
      "player_penalty_scale": 0.8,
      "ai_gain_scale": 0.95,
      "player_start_offset": {
        "influence": 5,
        "cash": 10,
        "stress": 0
      },
      "client_start_stability": 70,
      "goal_threshold": "easy",
      "bribe_cap": 3
    },
    "medium": {
      "ai_aggressiveness": 0.6,
      "tau_temperature": 1,
      "player_focus_bias": 0.15,
      "intel_accuracy": 0.75,
      "dd_false_positive": 0.05,
      "player_penalty_scale": 1,
      "ai_gain_scale": 1,
      "player_start_offset": {
        "influence": 0,
        "cash": 0,
        "stress": 0
      },
      "client_start_stability": 60,
      "goal_threshold": "medium",
      "bribe_cap": 2
    },
    "hard": {
      "ai_aggressiveness": 0.85,
      "tau_temperature": 0.6,
      "player_focus_bias": 0.35,
      "intel_accuracy": 0.6,
      "dd_false_positive": 0.15,
      "player_penalty_scale": 1.15,
      "ai_gain_scale": 1.1,
      "player_start_offset": {
        "influence": -8,
        "cash": -10,
        "stress": 8
      },
      "client_start_stability": 50,
      "goal_threshold": "hard",
      "bribe_cap": 1
    }
  },
  "AI_WEIGHTS": {
    "ALPHA": 1,
    "BETA": 0.8,
    "GAMMA": 0.7,
    "DELTA": 0.9
  },
  "FACTION_BASELINE": {
    "FV_A": {
      "ambition": 0.8,
      "loyalty": 0.35,
      "risk_appetite": 0.75,
      "empathy": 0.3,
      "guile": 0.55
    },
    "FV_B": {
      "ambition": 0.45,
      "loyalty": 0.8,
      "risk_appetite": 0.3,
      "empathy": 0.65,
      "guile": 0.35
    },
    "FV_C": {
      "ambition": 0.9,
      "loyalty": 0.4,
      "risk_appetite": 0.65,
      "empathy": 0.35,
      "guile": 0.85
    },
    "FV_D": {
      "ambition": 0.25,
      "loyalty": 0.6,
      "risk_appetite": 0.15,
      "empathy": 0.75,
      "guile": 0.4
    }
  },
  "TAG_GOAL_BONUS": {
    "FV_A": {
      "arch": [
        "betray",
        "expose",
        "risk",
        "invest"
      ],
      "tags": [
        "抢单",
        "打压",
        "客户"
      ]
    },
    "FV_B": {
      "arch": [
        "shield",
        "ally",
        "hedge",
        "dodge",
        "bow"
      ],
      "tags": [
        "维稳",
        "护人",
        "站队"
      ]
    },
    "FV_C": {
      "arch": [
        "betray",
        "expose",
        "risk",
        "grind"
      ],
      "tags": [
        "上位",
        "晋升",
        "汇报"
      ]
    },
    "FV_D": {
      "arch": [
        "hedge",
        "dodge",
        "bow",
        "obey",
        "self"
      ],
      "tags": [
        "降压",
        "模糊",
        "团建",
        "加班"
      ]
    }
  },
  "GOAL_THRESHOLDS": {
    "FV_A": {
      "easy": {
        "full": 2,
        "bare": 1
      },
      "medium": {
        "full": 3,
        "bare": 2
      },
      "hard": {
        "full": 4,
        "bare": 3
      }
    },
    "FV_B": {
      "easy": {
        "full_lost": 1,
        "bare_lost": 2,
        "full_stab": 55
      },
      "medium": {
        "full_lost": 0,
        "bare_lost": 1,
        "full_stab": 55
      },
      "hard": {
        "full_lost": 0,
        "bare_lost": 1,
        "full_stab": 65
      }
    },
    "FV_C": {
      "easy": {
        "full": 160,
        "bare": 150
      },
      "medium": {
        "full": 180,
        "bare": 150
      },
      "hard": {
        "full": 200,
        "bare": 165
      }
    },
    "FV_D": {
      "easy": {
        "full_stress": 60,
        "full_chaos": 55,
        "bare_stress": 65
      },
      "medium": {
        "full_stress": 50,
        "full_chaos": 45,
        "bare_stress": 65
      },
      "hard": {
        "full_stress": 40,
        "full_chaos": 35,
        "bare_stress": 65
      }
    }
  },
  "CLIENTS": {
    "count": 8,
    "start_stability": 60
  },
  "CHAOS": {
    "backstab": 4,
    "report": 6,
    "vote_out": 8,
    "rumor_burst": 5,
    "daily_decay": 2,
    "max": 100
  },
  "CARD_DRAW": {
    "TIER_W": {
      "match": 1.6,
      "any": 1.2,
      "other": 0.7
    },
    "CAT_W_SCALE": 0.5,
    "SIT_W_SCALE": 0.4,
    "FRESH_USED": 0.15,
    "SIT_MATCH_FACTION_TRUST": 0.4,
    "SIT_STRESS_CAT": 0.3,
    "SIT_CHAOS_CAT": 0.3,
    "SIT_CLIENT_CAT": 0.4,
    "SIT_CAP": 1
  },
  "DAY_CURVE": [
    {
      "days": [
        1,
        2
      ],
      "w": {
        "会议": 0.8,
        "汇报": 0.7,
        "团建": 0.6,
        "加班": 0.5
      }
    },
    {
      "days": [
        3,
        4,
        5
      ],
      "w": {
        "绩效": 0.8,
        "背锅": 0.7,
        "站队": 0.7,
        "客户": 0.6
      }
    },
    {
      "days": [
        6,
        7,
        8
      ],
      "w": {
        "竞品": 0.9,
        "站队": 0.8,
        "反腐": 0.7,
        "舆情": 0.7
      }
    },
    {
      "days": [
        9,
        10,
        11
      ],
      "w": {
        "晋升": 0.9,
        "反腐": 0.8,
        "客户": 0.8,
        "舆情": 0.6
      }
    },
    {
      "days": [
        12
      ],
      "w": {
        "会议": 1,
        "晋升": 0.8,
        "背锅": 0.6
      }
    }
  ],
  "DERIVED": {
    "stress_high": 70,
    "stress_critical": 90,
    "stress_relaxed": 0,
    "influence_high": 80,
    "influence_low": 20,
    "cash_negative_stress": 2,
    "cash_anticorruption_weight_bonus": 0.3,
    "influence_overflow_to_cash": 0.5,
    "single_card_net_clamp": 12
  },
  "SPEECH_TEMPLATES": {
    "accuse": {
      "label": "指认",
      "trust_target": -8,
      "belief_offset": 0.08
    },
    "defend": {
      "label": "自辩",
      "self_vote_mult": 0.85
    },
    "deflect": {
      "label": "转移话题",
      "vote_randomness": 0.2
    }
  },
  "REIGN_METERS": {
    "performance": {
      "min": 0,
      "max": 100,
      "init": 50
    },
    "network": {
      "min": 0,
      "max": 100,
      "init": 50
    }
  },
  "REIGN_SOFT_RESET": {
    "cash_penalty": 15,
    "debuff_days": 2,
    "debuff_gain_mult": 0.7
  },
  "ENERGY_DRIFT": {
    "start_day": 7,
    "stress_per_day": 1,
    "player_only": true
  },
  "REIGN_VOTE": {
    "threat_perf_w": 0.4,
    "threat_net_w": -0.3,
    "low_net_threshold": 20,
    "low_net_vote_bonus": 0.5,
    "low_net_trust_decay": 2,
    "low_net_belief_penalty": 0.1
  },
  "ASSEMBLY_REWARD": {
    "survive_perf": 5,
    "survive_influence": 5,
    "accused_net": -3,
    "accused_influence": -3,
    "defend_net": 2,
    "accused_streak_influence": -5,
    "accused_streak_net": -3
  },
  "PLAYER_START_OFFSET_REIGN": {
    "easy": 3,
    "medium": 0,
    "hard": -3
  }
};
