# Baissez les dépenses

Simulateur statique (HTML/CSS/JS, zéro dépendance). Données dans `data/postes.json`.

## Lancer en local
```bash
python3 -m http.server 8000
```
Puis http://localhost:8000

## Déployer
GitHub Pages / Netlify / Cloudflare Pages : servir le dossier tel quel.

## Contribuer aux données
Chaque poste : `montant_mds`, `source_montant`, 3 `crans` (mesure, gain_mds, faisabilite 1-3, arguments, obstacles), `sources`.
**v0.1 = ordres de grandeur. Chaque chiffre doit être vérifié contre la source avant diffusion.**
