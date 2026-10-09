"""Ajoute le cran 4 « Rupture » (data/sourcing/passe5/) à chaque poste de dépense."""
import json, glob
d = json.load(open("data/postes.json"))
P = {p["id"]: p for p in d["postes"]}
for f in sorted(glob.glob("data/sourcing/passe5/groupe*.json")):
    for item in json.load(open(f)):
        p, c = P[item["id"]], item["cran"]
        assert c["niveau"] == 4 and c["gain_mds"] > p["crans"][2]["gain_mds"], (item["id"], c["gain_mds"])
        p["crans"] = p["crans"][:3] + [c]
        print(f"{item['id']:30} {p['crans'][2]['gain_mds']:>6} -> {c['gain_mds']:>6}  f{c['faisabilite']}  {'NV' if c.get('non_verifie') else 'ok'}")
print("postes sans cran 4 :", [i for i, p in P.items() if len(p["crans"]) < 4])
json.dump(d, open("data/postes.json", "w"), ensure_ascii=False, indent=2)
