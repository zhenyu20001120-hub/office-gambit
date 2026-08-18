import sys
sys.path.insert(0, "src")
import engine, tuning_data

def play(difficulty, seed):
    st = engine.setup_world(difficulty=difficulty, seed=seed)
    ctrl = engine.RandomController()
    day_max = tuning_data.TUNING["DAY_MAX"]
    assembly_days = set(tuning_data.TUNING["ASSEMBLY_DAYS"])
    for day in range(1, day_max + 1):
        st.day = day
        engine.phase_morning(st, ctrl)
        engine.phase_day_cards(st, ctrl)
        engine.phase_noon(st, ctrl)
        engine.phase_night(st, ctrl)
        engine.phase_settle(st, ctrl)
        if day in assembly_days:
            engine.phase_assembly(st, ctrl)
        if len(st.alive_actors()) <= 1:
            st.ended_early = True
            break
    return st

def measure(num, difficulty, seed0):
    crashes = 0; stot = 0; salive = 0; ft_nonzero = 0; ft_peak = 0.0
    for i in range(num):
        try:
            st = play(difficulty, seed0 + i)
        except Exception:
            crashes += 1
            continue
        for a in st.actors:
            if a.tier == "senior":
                stot += 1
                if a.alive:
                    salive += 1
        mx = max(abs(v) for v in st.faction_trust.values())
        if mx > 0.5:
            ft_nonzero += 1
        ft_peak = max(ft_peak, mx)
    rate = (1 - salive / stot) if stot else 0
    print(f"[{difficulty}] crashes={crashes} senior_elim_rate={rate:.3f} ft_nonzero_games={ft_nonzero}/{num} ft_peak={ft_peak:.1f}")

for d in ("easy", "medium", "hard"):
    measure(150, d, 1)
