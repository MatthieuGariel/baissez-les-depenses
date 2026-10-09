"""Remplace les paramètres macro provisoires de meta par les valeurs de data/sourcing/macro.json."""
import json
d = json.load(open("data/postes.json"))
m = d["meta"]
m["pib_mds"] = 2991.1  # PIB nominal 2025, Insee Première n° 2105 (cf. macro.json)
m.pop("pib_mds_provisoire", None)
m["pib_source"] = {"titre": "Insee Première n° 2105 — comptes nationaux 2025", "annee": 2025}
# Taux marginal : aucun chiffrage officiel « économie → intérêts évités » ; hypothèse = taux de marché 10 ans
# retenu par le RAA 2026 pour fin 2026 (3,9 %), fourchette 3,5-4,8 % selon macro.json.
m["taux_marginal_dette"] = 0.039
m["taux_marginal_dette_provisoire"] = True
m["taux_marginal_note"] = "Hypothèse : taux 10 ans fin 2026 du RAA 2026 (3,9 %). Effet à 1 an d'une économie pérenne ; s'accumule ensuite."
json.dump(d, open("data/postes.json", "w"), ensure_ascii=False, indent=2)
print(m["pib_mds"], m["taux_marginal_dette"], round(m["pib_mds"] * 0.03, 1))
