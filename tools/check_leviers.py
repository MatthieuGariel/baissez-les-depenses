"""Contrôle et publie data/sourcing/recettes_leviers.json → data/recettes_leviers.json.
Règles : gains/coûts croissants, faisabilité non décroissante (crans cumulatifs), sources ouvertes."""
import json, sys
src = json.load(open("data/sourcing/recettes_leviers.json"))
errs, fixes = [], 0
for r in src["recettes"]:
    for l in r.get("leviers", []):
        for sens, k in (("crans_hausse", "gain_mds"), ("crans_baisse", "cout_mds")):
            cs = l.get(sens) or []
            vals = [c[k] for c in cs]
            if vals != sorted(vals): errs.append(f"{r['id']}.{l['id']} {sens} non croissant {vals}")
            worst = 1
            for c in cs:
                if c["faisabilite"] < worst:
                    c["faisabilite"] = worst; fixes += 1
                    c["notes"] = (c.get("notes") or "") + " | Faisabilité relevée : le cran inclut le précédent."
                worst = max(worst, c["faisabilite"])
                for s in c.get("sources", []):
                    if s.get("ouverte") is not True: errs.append(f"{r['id']}.{l['id']} source non ouverte {s.get('url')}")
print("faisabilités relevées :", fixes)
print("\n".join(errs) or "aucune erreur")
if errs: sys.exit(1)
json.dump(src, open("data/recettes_leviers.json", "w"), ensure_ascii=False, indent=2)
print("publié : data/recettes_leviers.json")
