"""Ajoute crans[].horizon {annee, estime, justif} depuis data/sourcing/horizons.json (gain plein après 2027)."""
import json
d = json.load(open("data/postes.json"))
P = {p["id"]: p for p in d["postes"]}
h = json.load(open("data/sourcing/horizons.json"))["depenses"]
n = 0
for pid, crans in h.items():
    for niv, v in crans.items():
        c = P[pid]["crans"][int(niv) - 1]
        assert c["niveau"] == int(niv)
        c["horizon"] = v; n += 1
json.dump(d, open("data/postes.json", "w"), ensure_ascii=False, indent=2)
print(n, "crans avec horizon")
