"""Corrections éditoriales appliquées après fusion de la passe 2 (voir commit)."""
import json, re
d = json.load(open("data/postes.json"))
P = {p["id"]: p for p in d["postes"]}

# Défense cran 1 : « moitié de la surmarche » = hypothèse, pas un chiffrage officiel
P["defense"]["crans"][0]["non_verifie"] = True

# Retraites cran 3 : âge légal validé par CC 2023-849 DC → obstacle politique, pas constitutionnel
P["retraites"]["crans"][2]["faisabilite"] = 2

# Aides entreprises crans 2-3 : hausses de TVA = recettes, pas baisse de dépense
for c in P["aides_entreprises"]["crans"][1:]:
    c["non_verifie"] = True
    c["obstacles"].insert(0, "Attention : hausse de TVA = hausse d'impôt pour les consommateurs, pas une baisse de dépense. À remplacer par une suppression d'aide chiffrée.")

# Masse salariale : retirer les ~59,23 Md€ de titre 2 déjà comptés dans « education »
m = P["masse_salariale_etat"]
m["montant_mds"] = round(m["montant_mds"] - 59.23, 2)
m["nom"] = "Masse salariale de l'État (hors CAS Pensions, hors Enseignement scolaire)"

# EUR-Lex : liens canoniques lisibles en navigateur
s = json.dumps(d, ensure_ascii=False, indent=2)
s = re.sub(r"https://publications\.europa\.eu/resource/celex/(\w+)",
           r"https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:\1", s)
open("data/postes.json", "w").write(s)

# Minima sociaux : crans non cumulatifs (0,5 puis 0,4) → cran 2 = fraude + gel
d = json.load(open("data/postes.json"))
c = next(p for p in d["postes"] if p["id"] == "minima_sociaux")["crans"]
if c[1]["gain_mds"] < c[0]["gain_mds"]:
    c[1]["mesure"] = "Cran 1 + " + c[1]["mesure"][0].lower() + c[1]["mesure"][1:]
    c[1]["gain_mds"] = round(c[0]["gain_mds"] + c[1]["gain_mds"], 2)
    c[1]["non_verifie"] = True
d["meta"]["statut"] = "v0.3 — 2e passe de vérification. Gains cumulatifs (chaque cran inclut les précédents). Badge « non vérifié » = ordre de grandeur calculé, formule dans le JSON."
json.dump(d, open("data/postes.json", "w"), ensure_ascii=False, indent=2)
