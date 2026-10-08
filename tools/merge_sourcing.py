"""Fusionne data/sourcing/groupe*.json dans data/postes.json (remplace les postes par id)."""
import json, glob
base = json.load(open("data/postes.json"))
idx = {p["id"]: i for i, p in enumerate(base["postes"])}
for f in sorted(glob.glob("data/sourcing/groupe*.json")):
    d = json.load(open(f))
    postes = d["postes"] if isinstance(d, dict) else d
    if isinstance(d, dict) and "meta" in d:
        m = d["meta"]
        for k in ("depenses_totales_mds", "deficit_mds", "annee_reference"):
            if isinstance(m.get(k), (int, float)): base["meta"][k] = m[k]
        base["meta"]["sources_meta"] = m.get("sources", [])
    for p in postes:
        assert p["id"] in idx, (f, p["id"])
        assert len(p["crans"]) == 3 and all(isinstance(c["gain_mds"], (int, float)) for c in p["crans"]), p["id"]
        base["postes"][idx[p["id"]]] = p
        print(f, p["id"], p["montant_mds"], [c["gain_mds"] for c in p["crans"]],
              "non_verifie:", sum(bool(c.get("non_verifie")) for c in p["crans"]))
base["meta"]["statut"] = "v0.2 — montants des postes sourcés (1re passe automatique). Les crans marqués « non vérifié » n'ont pas de chiffrage officiel trouvé."
json.dump(base, open("data/postes.json", "w"), ensure_ascii=False, indent=2)
print("meta", base["meta"]["depenses_totales_mds"], base["meta"]["deficit_mds"], base["meta"]["annee_reference"])
