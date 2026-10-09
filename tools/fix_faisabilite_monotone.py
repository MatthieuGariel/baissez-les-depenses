"""Crans cumulatifs : la faisabilité d'un cran ne peut pas être meilleure que celle du cran précédent."""
import json
d = json.load(open("data/postes.json"))
for p in d["postes"]:
    worst = 1
    for c in p["crans"]:
        if c["faisabilite"] < worst:
            print(p["id"], c["niveau"], c["faisabilite"], "->", worst)
            c["notes"] = (c.get("notes") or "") + f" | Faisabilité relevée à {worst} : le cran inclut le cran précédent."
            c["faisabilite"] = worst
        worst = max(worst, c["faisabilite"])
json.dump(d, open("data/postes.json", "w"), ensure_ascii=False, indent=2)
