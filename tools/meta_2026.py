"""Déficit de référence = 2026 révisé (PLF 2027 : 5,4 % du PIB), PIB 2026 RAA, dérive 2027 sans mesures."""
import json
d = json.load(open("data/postes.json"))
m = d["meta"]
PLF = "https://www.assemblee-nationale.fr/dyn/docs/PRJLANR5L17B3210.raw"
RAA = "https://www.tresor.economie.gouv.fr/Articles/b16f3103-ed47-4c37-9362-11ff01e12ae5/files/1d29351b-0187-4837-a3cd-e4ea7b0e4ce1"
m["pib_mds"] = 3049
m["pib_source"] = {"titre": "Rapport d'avancement annuel 2026, PIB nominal 2026", "url": RAA, "annee": 2026}
m["deficit_pct_pib"] = 5.4
m["deficit_mds"] = round(5.4 / 100 * m["pib_mds"], 1)  # ~164,6 Md€, calculé : non publié en euros
m["annee_reference"] = "2026 révisé"
m["deficit_source"] = {"titre": "PLF 2027 n° 3210, article liminaire : déficit 2026 révisé à 5,4 % du PIB", "url": PLF,
                       "notes": "Montant en Md€ calculé : 5,4 % × PIB 2026 (3 049 Md€, RAA 2026)."}
m["derive_2027"] = {"deficit_pct_pib": 6.4, "texte": "Sans aucune mesure, le déficit 2027 monterait à environ 6,4 % du PIB (PLF 2027).",
                    "source": {"titre": "PLF 2027 n° 3210, exposé des motifs", "url": PLF}}
m["statut"] = "v0.5 — base : déficit 2026 révisé (5,4 % du PIB). Gains cumulatifs. Badge « non vérifié » = ordre de grandeur calculé, formule dans le JSON."
json.dump(d, open("data/postes.json", "w"), ensure_ascii=False, indent=2)
print(m["deficit_mds"], m["pib_mds"], round(m["pib_mds"] * 0.03, 1))
