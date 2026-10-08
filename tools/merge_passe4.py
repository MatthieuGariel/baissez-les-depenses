"""Fusionne data/sourcing/passe4/groupe*.json dans data/postes.json + garde-fous."""
import json, glob
d = json.load(open("data/postes.json"))
idx = {p["id"]: i for i, p in enumerate(d["postes"])}
for f in sorted(glob.glob("data/sourcing/passe4/groupe*.json")):
    for p in json.load(open(f)):
        g = [c["gain_mds"] for c in p["crans"]]
        assert len(g) == 3 and g == sorted(g), (p["id"], g)
        d["postes"][idx[p["id"]]] = p
        print(p["id"], p["montant_mds"], [(c["gain_mds"], c["faisabilite"], "NV" if c.get("non_verifie") else "ok") for c in p["crans"]])
P = {p["id"]: p for p in d["postes"]}
# Double compte possible avec le décret 2026-858 déjà en vigueur
P["ondam_ville"]["crans"][2]["non_verifie"] = True
# Allègements : chiffrages Cour antérieurs à la réforme LFSS 2026, additivité non garantie
for c in P["aides_entreprises"]["crans"][1:]:
    c["non_verifie"] = True
d["meta"]["statut"] = "v0.4 — 4 passes de vérification. Gains cumulatifs (chaque cran inclut les précédents). Badge « non vérifié » = ordre de grandeur calculé à partir de chiffres officiels, formule dans le JSON."
json.dump(d, open("data/postes.json", "w"), ensure_ascii=False, indent=2)
cr = [c for p in d["postes"] for c in p["crans"]]
print("non_verifie", sum(bool(c.get("non_verifie")) for c in cr), "/ 60")
D = d["meta"]["deficit_mds"]
for name, r in [("faisable", lambda c: c["faisabilite"] == 1), ("faisable+risque", lambda c: c["faisabilite"] <= 2), ("max", lambda c: True)]:
    g = sum(([c for c in p["crans"] if r(c) and c["gain_mds"] > 0] or [{"gain_mds": 0}])[-1]["gain_mds"] for p in d["postes"])
    print(name, round(g, 1), round(g / D * 100), "%")
