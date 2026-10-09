# Baissez les dépenses — règles du projet

Simulateur citoyen de baisse des dépenses publiques françaises (APU). Site statique, zéro dépendance.
En ligne : https://matthieugariel.github.io/baissez-les-depenses/ (GitHub Pages, branche `main`, racine).

## Fichiers
- `data/postes.json` : la donnée, source de vérité. `meta` (totaux, déficit, échelles) + `postes[]`.
- `index.html`, `app.js`, `style.css` : UI. `llms.txt` : description pour agents. `DIFFUSION.md` : kit de diffusion (chiffres à recalculer si les données changent).
- `data/sourcing/passeN/` : sorties brutes des agents de vérification (jamais éditées à la main).
- `tools/` : scripts Python de fusion et de correction.

## Schéma d'un poste
`{id, nom, bloc, montant_mds, annee_montant, source_montant{titre,url}, crans[], sources[]}`
Cran : `{niveau, mesure, gain_mds (nombre, Md€), faisabilite (1|2|3), arguments[], obstacles[], sources[{titre,url,ouverte}], non_verifie (bool), notes}`

## Règles éditoriales (non négociables)
- **Aucune URL inventée.** Seulement des documents réellement ouverts ; chaque source porte `"ouverte": true`.
- Crans **cumulatifs** (cran n inclut cran n-1), gains **croissants** et faisabilité **jamais meilleure** que celle du cran précédent.
- Le nombre de crans par poste n'est pas figé à 3 : le code doit lire `crans.length`.
- Postes de dépense : uniquement des **baisses de dépenses** (pas de hausse d'impôt/TVA déguisée).
- Pas de double compte entre postes (ex. masse salariale = hors Enseignement scolaire).
- Faisabilité : 1 = loi ordinaire/décret ; 2 = risque juridique ou politique fort ; 3 = obstacle constitutionnel ou UE probable.
- Décision du Conseil constitutionnel : numéro + URL conseil-constitutionnel.fr ouverte.
- Pas de chiffrage officiel → ordre de grandeur calculé, formule dans `notes`, `non_verifie: true`.

## Pipeline de données (ordre de rejeu)
`merge_sourcing.py` → `fixes_passe2.py` → `merge_passe3.py` → `merge_passe4.py` → `fixes_passe4.py` → `meta_macro.py` → `merge_passe5.py` → `meta_2026.py` → `merge_horizons.py` → `fix_faisabilite_monotone.py`
Toute nouvelle correction = nouveau script dans `tools/`, jamais d'édition manuelle muette de `postes.json`.

## Environnement
- Python : `.venv/` local, dépendances dans `requirements.txt` (jamais d'install globale).
- Test local : `python3 -m http.server 8000` (config `.claude/launch.json`, nom `site`). Ajouter `?v=N` à l'URL pour casser le cache navigateur.
- Déploiement : `git push` sur `main` (SSH, clé `~/.ssh/id_ed25519_github`). Pages republie en ~1 min.

## Commits
Messages en français, terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
