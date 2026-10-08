"""Corrections éditoriales après la passe 4."""
import json
d = json.load(open("data/postes.json"))
P = {p["id"]: p for p in d["postes"]}

# Chômage cran 1 : l'ancien cran (0,6 Md€ PLFSS « futures négociations ») recoupait les ruptures
# conventionnelles déjà réformées (loi du 2 juin 2026) et n'était pas inclus dans le cran 2.
# Nouveau cran 1 = première brique du cran 2 (CAE note 90), ce qui rend les crans cumulatifs.
c1, c2, c3 = P["chomage"]["crans"]
cae, ce = c2["sources"][0], next(s for s in c2["sources"] if "434920" in s["url"])
c1.update({
    "mesure": "Durée d'affiliation minimale portée de 6 à 8 mois travaillés sur 24 pour ouvrir des droits",
    "gain_mds": 0.45,
    "faisabilite": 1,
    "arguments": [
        "CAE (avril 2026), tableau 1 : 446 M€ d'économies par an (modèle comptable ; 511 M€ en modèle simulé)",
        "Précédent : le décret de 2019 avait déjà porté l'affiliation de 4 à 6 mois",
        "Mesure distincte des ruptures conventionnelles, déjà réformées par la loi du 2 juin 2026 et donc hors simulateur",
    ],
    "obstacles": [
        "Le CAE juge ce durcissement peu efficace : pas d'effet emploi attendu, publics précaires pénalisés",
        "Gouvernance paritaire : le décret ne peut se substituer aux partenaires sociaux qu'en cas d'échec de la négociation (art. L. 5422-20 du code du travail, Conseil d'État n° 434920 du 25/11/2020)",
    ],
    "sources": [cae, ce],
    "non_verifie": False,
    "notes": "Chiffrage officiel CAE, modèle comptable. Remplace l'ancien cran (0,6 Md€ PLFSS 2026, mesure non spécifiée, recoupement probable avec les ruptures conventionnelles).",
})
if not c2["mesure"].startswith("Cran 1"):
    c2["mesure"] = "Cran 1 + plafonnement de l'allocation mensuelle à 2 500 € (au lieu de 8 826 €)"
json.dump(d, open("data/postes.json", "w"), ensure_ascii=False, indent=2)
print([(c["gain_mds"], c["mesure"][:70]) for c in P["chomage"]["crans"]])
