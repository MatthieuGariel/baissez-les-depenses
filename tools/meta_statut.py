"""Met à jour le bandeau de statut affiché en bas de page."""
import json
d = json.load(open("data/postes.json"))
d["meta"]["statut"] = "v0.6 — base : déficit 2026 révisé (5,4 % du PIB). Gains cumulatifs. Badge « non vérifié » = ordre de grandeur calculé, formule dans le JSON."
json.dump(d, open("data/postes.json", "w"), ensure_ascii=False, indent=2)
