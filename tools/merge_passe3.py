"""Fusionne data/sourcing/passe3.json (corrections ciblées) dans data/postes.json."""
import json
d = json.load(open("data/postes.json"))
idx = {p["id"]: i for i, p in enumerate(d["postes"])}
for p in json.load(open("data/sourcing/passe3.json")):
    assert len(p["crans"]) == 3 and all(isinstance(c["gain_mds"], (int, float)) for c in p["crans"])
    d["postes"][idx[p["id"]]] = p
    print(p["id"], p["montant_mds"], [(c["gain_mds"], c["faisabilite"], c.get("non_verifie")) for c in p["crans"]])

# Allègements : chiffrages Cour de mai 2025, possible recoupement avec la réforme LFSS 2026
ae = d["postes"][idx["aides_entreprises"]]
for c in ae["crans"][1:]:
    c["non_verifie"] = True
    c["notes"] = (c.get("notes") or "") + " | Chiffrage Cour des comptes antérieur à la réforme des allègements LFSS 2026 : additivité non garantie."
json.dump(d, open("data/postes.json", "w"), ensure_ascii=False, indent=2)
