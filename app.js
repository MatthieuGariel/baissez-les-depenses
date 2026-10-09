'use strict';
/* Baissez les dépenses — jeu « ministre du Budget ». Vanilla, sans dépendance. */
const FAISA = { 1: 'Faisable', 2: 'Risqué', 3: 'Bloqué / très contestable' };
const FCOL = { light: { 1: '#17803f', 2: '#a85f00', 3: '#c0392b' }, dark: { 1: '#3ecf7b', 2: '#f0a93b', 3: '#ff7a6d' } };
const RLAB = ['Baisse forte', 'Baisse moyenne', 'Baisse légère', 'Aucun changement', 'Hausse légère', 'Hausse moyenne', 'Hausse forte'];
const CATS = ['Social', 'État', 'Collectivités', 'International', 'Impôts'];
const fmt = n => n.toLocaleString('fr-FR', { maximumFractionDigits: Math.abs(n) < 1 ? 2 : 1 });
const fmtPct = n => fmt(Math.abs(n) < 0.05 ? 0 : Math.round(n * 10) / 10);
/* Solde public lisible : « déficit 5,4 % », « équilibre », « excédent 0,2 % » (jamais de déficit négatif). */
const soldeTxt = pct => Math.abs(pct) < 0.05 ? 'équilibre' : pct > 0 ? `déficit ${fmtPct(pct)} %` : `excédent ${fmtPct(-pct)} %`;
const trajTxt = (pct0, pct) => `Déficit ${fmt(pct0)} % → ${soldeTxt(pct)} du PIB`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = id => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isDark = () => matchMedia('(prefers-color-scheme: dark)').matches;

let data, meta, cards = [], leaves = [], byKey = {}, cardOf = {};
let st = {};                 // scénario : clé -> niveau (poste : 0..n ; impôt : -3..+3)
let curCat = CATS[0], openKey = null, presets = [];
const secOpen = {};          // état des sections repliables (mémorisé entre deux rendus)

/* ---------- Données : cartes (catégorie) et feuilles (contrôles) ---------- */
const isRO = p => p.id === 'dette' || !!p.lecture_seule;
function catOf(p) {
  if (p.id === 'ue' || p.id === 'aide_developpement') return 'International';
  if (/^S[ée]curit/i.test(p.bloc) || p.id === 'minima_sociaux') return 'Social';
  if (/^Collectiv/i.test(p.bloc)) return 'Collectivités';
  return 'État';
}
const nCap = a => Math.min(3, (a || []).length);
function leafR(r, lev, parent) {
  const src = lev || r;
  return { key: 'r_' + (lev ? parent.id + '.' + lev.id : r.id), k: 'r', nom: src.nom || r.nom, ref: src, parent: lev ? parent : null,
    montant: src.montant_mds ?? src.rendement_mds ?? src.cout_niche_mds ?? (parent || r).montant_mds, type: src.type, desc: src.description, annee: src.annee_montant || (parent || r).annee_montant,
    hausse: src.crans_hausse || [], baisse: src.crans_baisse || [], nH: nCap(src.crans_hausse), nB: nCap(src.crans_baisse) };
}
function buildItems() {
  cards = []; leaves = []; byKey = {}; cardOf = {};
  for (const p of data.postes) {
    if (isRO(p)) continue;
    const it = { key: p.id, k: 'd', nom: p.nom, cat: catOf(p), ref: p, montant: p.montant_mds, annee: p.annee_montant, bloc: p.bloc, n: p.crans.length };
    cards.push(it); leaves.push(it); byKey[it.key] = it; cardOf[it.key] = it.key;
  }
  for (const r of rec) {
    if (Array.isArray(r.leviers) && r.leviers.length) {
      const g = { key: 'r_' + r.id, k: 'g', nom: r.nom, cat: 'Impôts', ref: r, montant: r.montant_mds, annee: r.annee_montant, leaves: [] };
      for (const lev of r.leviers) { const l = leafR(r, lev, r); g.leaves.push(l); leaves.push(l); byKey[l.key] = l; cardOf[l.key] = g.key; }
      cards.push(g);
    } else {
      const l = leafR(r); l.cat = 'Impôts'; cards.push(l); leaves.push(l); byKey[l.key] = l; cardOf[l.key] = l.key;
    }
  }
}
const labelsD = () => (meta.crans_labels || ['Aucune', 'Légère', 'Moyenne', 'Forte', 'Rupture']);
const lvlLabel = (it, v) => it.k === 'd' ? (labelsD()[v] || `Niveau ${v}`) : RLAB[v + 3];
const clampLv = (it, v) => it.k === 'd'
  ? Math.max(0, Math.min(it.n, Math.floor(+v) || 0))
  : Math.max(-it.nB, Math.min(it.nH, Math.trunc(+v) || 0));
// Cran retenu pour un niveau : { c, val (Md€), eff (effet sur le déficit, + = déficit réduit), t: d|h|b }
function pick(it, v) {
  if (!v) return null;
  if (it.k === 'd') { const c = it.ref.crans[v - 1]; return c && { c, val: c.gain_mds, eff: c.gain_mds, t: 'd' }; }
  if (v < 0) { const c = it.baisse[-v - 1]; return c && { c, val: c.cout_mds, eff: -c.cout_mds, t: 'b' }; }
  const c = it.hausse[v - 1]; return c && { c, val: c.gain_mds, eff: c.gain_mds, t: 'h' };
}

/* ---------- URL = scénario partageable (#retraites=2&r_tva=-1&r_ir.bareme=1) ---------- */
function readHash() {
  for (const [k, v] of new URLSearchParams(location.hash.slice(1))) {
    const it = byKey[k]; if (it) st[k] = clampLv(it, v);
  }
}
function writeHash() {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(st)) if (v) p.set(k, v);
  const h = p.toString();
  history.replaceState(null, '', location.pathname + location.search + (h ? '#' + h : ''));
}

/* ---------- Calcul du scénario ---------- */
function scenario(S = st) {
  const rows = [], hausses = [], baisses = [];
  for (const it of leaves) {
    const v = S[it.key]; if (!v) continue;
    const x = pick(it, v); if (!x) continue;
    (x.t === 'd' ? rows : x.t === 'h' ? hausses : baisses).push({ it, n: v, c: x.c, v: x.val, t: x.t });
  }
  rows.sort((a, b) => b.v - a.v);
  const sum = a => a.reduce((s, x) => s + x.v, 0);
  const eco = sum(rows), plus = sum(hausses), moins = sum(baisses), net = eco + plus - moins;
  const chosen = [...rows, ...hausses, ...baisses];
  const blocked = chosen.filter(x => x.c.faisabilite === 3);
  return { rows, hausses, baisses, eco, plus, moins, net, interets: eco * meta.taux_marginal_dette, chosen, blocked,
    resid: meta.deficit_mds - net, pct: (meta.deficit_mds - net) / meta.pib_mds * 100 };
}
// Baisse d'impôts permise par les économies (règle des paliers). total = économies + intérêts évités.
function taxRoom(total) {
  const [p0, p1, p2] = meta.regle_impots.parts;
  const toSeuil = Math.max(0, meta.deficit_mds - meta.pib_mds * meta.regle_impots.seuil_pct / 100);
  const z0 = Math.min(total, toSeuil), z1 = Math.max(0, Math.min(total, meta.deficit_mds) - toSeuil), z2 = Math.max(0, total - meta.deficit_mds);
  return { room: z0 * p0 + z1 * p1 + z2 * p2, manque: Math.max(0, toSeuil - total), defPct: (meta.deficit_mds - total) / meta.pib_mds * 100 };
}
function riskSummary(chosen) {
  const f = n => chosen.filter(x => x.c.faisabilite === n && x.t !== 'b').reduce((s, x) => s + x.v, 0);
  const bloque = f(3), risque = f(2);
  if (!bloque && !risque) return chosen.length ? 'Scénario juridiquement solide' : '';
  return `dont ${fmt(risque)} Md€ risqués, ${fmt(bloque)} Md€ bloqués`;
}

/* ---------- Scénarios tout faits (calculés depuis les données) ---------- */
function buildPresets() {
  const mk = maxF => {
    const S = {};
    for (const it of leaves) if (it.k === 'd') {
      let n = 0; for (const c of it.ref.crans) { if (maxF && c.faisabilite > maxF) break; n++; } if (n) S[it.key] = n;
    }
    return S;
  };
  presets = [
    { nom: 'Faisable', desc: 'Dépenses seulement, mesures de loi ordinaire ou de budget', c: 'var(--f1)', S: mk(1) },
    { nom: 'Faisable + risqué', desc: 'Accepte le risque juridique ou politique, sans mesure bloquée', c: 'var(--f2)', S: mk(2) },
    { nom: 'Rupture totale', desc: 'Tous les niveaux maximum, y compris les mesures bloquées', c: 'var(--f3)', S: mk(0) }
  ];
  for (const p of presets) p.sc = scenario(p.S);
}
const presetsHTML = () => presets.map((p, i) =>
  `<button type="button" class="preset" data-preset="${i}" style="--c:${p.c}"><b>${esc(p.nom)}</b><span>${esc(p.desc)}</span>` +
  `<span><span class="n">−${fmt(p.sc.net)} Md€</span> · ${trajTxt(meta.deficit_pct_pib || meta.deficit_mds / meta.pib_mds * 100, p.sc.pct)}${p.sc.blocked.length ? ` · ${p.sc.blocked.length} bloquée${p.sc.blocked.length > 1 ? 's' : ''}` : ''}</span></button>`).join('');
function applyPreset(i) {
  st = { ...presets[i].S };
  openKey = null; renderPanel(); update();
  $('sheet').close && $('sheet').open && $('sheet').close();
  startApp(); toast(`Scénario « ${presets[i].nom} » chargé`);
  window.scrollTo(0, 0);
}

/* ---------- Rendu : détail d'un niveau ---------- */
const list = a => (a || []);
const lis = a => `<ul>${list(a).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
function sec(key, titre, body) { return `<details class="sec" data-sec="${key}"${secOpen[key] ? ' open' : ''}><summary>${titre}</summary>${body}</details>`; }
function sourcesOf(it, c) {
  const par = it.parent || {};
  return [...list(c.sources), it.ref.source_montant, ...list(it.ref.sources), par.source_montant].filter(s => s && s.url)
    .filter((s, i, a) => a.findIndex(x => x.url === s.url) === i);
}
function detailHTML(it, v) {
  const x = pick(it, v);
  if (!x) return `<p class="muted">${it.k === 'd' ? 'Aucune baisse sur ce poste.' : 'Aucun changement.'}</p>`;
  const c = x.c, sign = x.t === 'h' ? '+' : '−', what = x.t === 'd' ? 'de dépenses' : 'de recettes';
  const src = sourcesOf(it, c);
  const args = list(c.arguments), obs = list(c.obstacles);
  return `<div class="mesure"><p class="mtxt">${esc(lvlLabel(it, v))} : ${esc(c.mesure)}</p>
      <div class="gainbig ${x.t}">${sign}${fmt(x.val)}<small> Md€ ${what} / an</small></div>
      <div class="badges"><span class="badge f${c.faisabilite}">${FAISA[c.faisabilite]}</span>
      ${c.non_verifie ? '<span class="badge nv" title="Ordre de grandeur calculé, formule dans la source de données">Chiffrage non vérifié</span>' : ''}
      ${c.horizon ? `<span class="badge hz" title="${esc(c.horizon.justif || '')}">Gain plein en ${c.horizon.annee}${c.horizon.estime ? ' (estimé)' : ''}</span>` : ''}</div></div>
    ${args.length ? sec('args', 'Pourquoi c’est possible', lis(args)) : ''}
    ${obs.length ? sec('obs', 'Ce qui bloque', lis(obs)) : ''}
    ${sec('src', `Sources (${src.length})`, (c.notes ? `<p>${esc(c.notes)}</p>` : '') + `<ul>${src.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.titre)}</a></li>`).join('')}</ul>`)}`;
}

/* ---------- Rendu : contrôle segmenté ---------- */
function segHTML(it) {
  const cur = st[it.key] || 0;
  const btn = (v, cls, l, g, fa, aria) => `<button type="button" role="radio" class="${cls}" data-v="${v}" data-fc="${fa}" aria-checked="${v === cur}" tabindex="${v === cur ? 0 : -1}" aria-label="${esc(aria)}"><span class="l">${l}</span><span class="g">${g}</span></button>`;
  if (it.k === 'd') {
    const b = [btn(0, 'f0', labelsD()[0], '0', 0, `${labelsD()[0]}, aucune baisse`)];
    it.ref.crans.forEach((c, i) => b.push(btn(i + 1, 'f' + c.faisabilite, esc(labelsD()[i + 1] || 'N' + (i + 1)), '−' + fmt(c.gain_mds), c.faisabilite,
      `${labelsD()[i + 1]}, ${fmt(c.gain_mds)} milliards d'euros d'économie, ${FAISA[c.faisabilite]}`)));
    return `<div class="seg" role="radiogroup" aria-label="Niveau de baisse : ${esc(it.nom)}">${b.join('')}</div>`;
  }
  const b = [];
  for (let v = -it.nB; v <= it.nH; v++) {
    if (!v) { b.push(btn(0, 'zero', '0', '·', 0, 'Aucun changement')); continue; }
    const x = pick(it, v), isCut = v < 0;
    b.push(btn(v, isCut ? 'cut' : 'raise', (isCut ? '−' : '+') + Math.abs(v), fmt(x.val), x.c.faisabilite,
      `${RLAB[v + 3]}, ${fmt(x.val)} milliards d'euros de recettes ${isCut ? 'en moins' : 'en plus'}, ${FAISA[x.c.faisabilite]}`));
  }
  return `<div class="seg tax" role="radiogroup" aria-label="Variation : ${esc(it.nom)}">${b.join('')}</div>`;
}
const legendHTML = k => `<div class="legend">${k === 'd' ? '' : '<span><i style="background:var(--cut)"></i>Baisse</span><span><i style="background:var(--raise)"></i>Hausse</span>'}<span><i style="background:var(--f1)"></i>Faisable</span><span><i style="background:var(--f2)"></i>Risqué</span><span><i style="background:var(--f3)"></i>Bloqué</span>${k === 'd' ? '' : '<span>(trait du bas = faisabilité)</span>'}</div>`;

function leafBlock(it, withHead) {
  const v = st[it.key] || 0;
  return `<div class="lev" data-leaf="${esc(it.key)}">${withHead ? `<div class="lev-h"><b>${esc(it.nom)}</b><span class="muted">${it.type === 'mesure' ? 'réforme' : (it.type === 'niche' ? 'niche · ' : '') + fmt(it.montant) + ' Md€'}</span></div>${it.desc ? `<p class="lev-d muted">${esc(it.desc)}</p>` : ''}` : ''}${segHTML(it)}<div class="detail">${detailHTML(it, v)}</div></div>`;
}
function bodyHTML(card) {
  if (card.k !== 'g') return leafBlock(card, false) + legendHTML(card.k);
  const nonAdd = card.leaves.some(l => l.type === 'mesure');
  return legendHTML('r') + (nonAdd ? '<p class="note">Certains leviers de cet impôt se recoupent (barème, tranches, contributions) : leurs effets s’additionnent ici en première approximation.</p>' : '')
    + card.leaves.map(l => leafBlock(l, true)).join('');
}

/* ---------- Rendu : cartes repliées ---------- */
function resHTML(card) {
  if (card.k === 'g') {
    const act = card.leaves.filter(l => st[l.key]);
    if (!act.length) return '<span class="res"><span class="lv">Inchangé</span></span>';
    const eff = act.reduce((s, l) => s + pick(l, st[l.key]).eff, 0);
    return `<span class="res ${eff >= 0 ? 'h' : 'b'}"><b>${eff >= 0 ? '+' : '−'}${fmt(Math.abs(eff))} Md€</b><span class="lv">${act.length} levier${act.length > 1 ? 's' : ''}</span></span>`;
  }
  const v = st[card.key] || 0, x = pick(card, v);
  if (!x) return `<span class="res"><span class="lv">${card.k === 'd' ? 'Aucune' : 'Inchangé'}</span></span>`;
  return `<span class="res ${x.t}"><b>${x.t === 'h' ? '+' : '−'}${fmt(x.val)} Md€</b><span class="lv">${esc(lvlLabel(card, v))}</span></span>`;
}
const isOn = card => card.k === 'g' ? card.leaves.some(l => st[l.key]) : !!st[card.key];
function cardHTML(c) {
  const meta2 = c.k === 'd' ? `${esc(c.bloc)} · ${fmt(c.montant)} Md€` : `${fmt(c.montant)} Md€ (${c.annee})${c.k === 'g' ? ` · ${c.leaves.length} leviers` : ''}`;
  const open = openKey === c.key;
  return `<article class="card" data-card="${esc(c.key)}" data-on="${isOn(c) ? 1 : 0}">
    <button type="button" class="chead" aria-expanded="${open}" aria-controls="b_${esc(c.key)}"><span class="t"><span class="nm">${esc(c.nom)}</span><span class="mt">${meta2}</span></span>${resHTML(c)}<span class="caret" aria-hidden="true"></span></button>
    <div class="cbody" id="b_${esc(c.key)}"${open ? '' : ' hidden'}>${open ? bodyHTML(c) : ''}</div></article>`;
}
function renderTabs() {
  $('tabs').innerHTML = CATS.map(cat => `<button type="button" role="tab" class="tab" id="tab_${cat}" data-cat="${cat}" aria-selected="${cat === curCat}" tabindex="${cat === curCat ? 0 : -1}">${cat}<span class="n" hidden></span></button>`).join('');
  updateTabs();
}
function updateTabs() {
  const cnt = {}; for (const l of leaves) if (st[l.key]) { const c = byKey[l.key] && cardOf[l.key]; const card = cards.find(x => x.key === c); cnt[card.cat] = (cnt[card.cat] || 0) + 1; }
  document.querySelectorAll('#tabs .tab').forEach(t => { const n = cnt[t.dataset.cat] || 0, b = t.querySelector('.n'); b.hidden = !n; b.textContent = n; });
}
const HINTS = {
  Impôts: 'Chaque curseur va de −3 (baisse d’impôt) à +3 (hausse). Le trait coloré du bas indique la faisabilité. Une baisse d’impôt n’est « finançable » que par des économies (voir le bilan).',
  Social: 'Retraites, santé, famille, chômage, minima : l’essentiel de la dépense publique.',
  'État': 'Fonctionnement, opérateurs, défense, aides aux entreprises.',
  'Collectivités': 'Communes, départements, régions.',
  International: 'Contribution à l’UE et aide au développement.'
};
function renderPanel() {
  const p = $('panel');
  p.setAttribute('aria-labelledby', 'tab_' + curCat);
  p.innerHTML = `<p class="hint">${HINTS[curCat]}</p>` + cards.filter(c => c.cat === curCat).map(cardHTML).join('');
  document.querySelectorAll('#tabs .tab').forEach(t => { const s = t.dataset.cat === curCat; t.setAttribute('aria-selected', s); t.tabIndex = s ? 0 : -1; });
}

/* ---------- Interactions du panneau ---------- */
function setLevel(key, v) {
  const it = byKey[key]; v = clampLv(it, v);
  if (st[key] === v || (!st[key] && !v)) return;
  if (v) st[key] = v; else delete st[key];
  const blk = document.querySelector(`[data-leaf="${CSS.escape(key)}"]`);
  if (blk) {
    blk.querySelectorAll('.seg button').forEach(b => { const on = +b.dataset.v === v; b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; });
    blk.querySelector('.detail').innerHTML = detailHTML(it, v);
  }
  const card = cards.find(c => c.key === cardOf[key]), el = document.querySelector(`[data-card="${CSS.escape(card.key)}"]`);
  if (el) { el.dataset.on = isOn(card) ? 1 : 0; el.querySelector('.res').outerHTML = resHTML(card); }
  update();
}
function toggleCard(key) {
  const prev = openKey; openKey = prev === key ? null : key;
  const close = k => { const e = document.querySelector(`[data-card="${CSS.escape(k)}"]`); if (!e) return; e.querySelector('.chead').setAttribute('aria-expanded', false); const b = e.querySelector('.cbody'); b.hidden = true; b.innerHTML = ''; };
  if (prev) close(prev);
  if (openKey) {
    const e = document.querySelector(`[data-card="${CSS.escape(key)}"]`), b = e.querySelector('.cbody');
    b.innerHTML = bodyHTML(cards.find(c => c.key === key)); b.hidden = false; e.querySelector('.chead').setAttribute('aria-expanded', true);
    requestAnimationFrame(() => { const r = e.getBoundingClientRect(); if (r.top < 60 || r.bottom > innerHeight - 110) e.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' }); });
  }
}
$('panel').addEventListener('click', e => {
  const h = e.target.closest('.chead'); if (h) return toggleCard(h.closest('.card').dataset.card);
  const b = e.target.closest('.seg button'); if (b) setLevel(b.closest('.lev').dataset.leaf, +b.dataset.v);
});
$('panel').addEventListener('keydown', e => {
  const b = e.target.closest('.seg button'); if (!b || !/^Arrow/.test(e.key)) return;
  e.preventDefault();
  const all = [...b.parentNode.children], i = all.indexOf(b) + (/Right|Down/.test(e.key) ? 1 : -1), n = all[Math.max(0, Math.min(all.length - 1, i))];
  n.focus(); setLevel(b.closest('.lev').dataset.leaf, +n.dataset.v);
});
$('panel').addEventListener('toggle', e => { if (e.target.dataset && e.target.dataset.sec) secOpen[e.target.dataset.sec] = e.target.open; }, true);
$('tabs').addEventListener('click', e => {
  const t = e.target.closest('.tab'); if (!t || t.dataset.cat === curCat) return;
  curCat = t.dataset.cat; openKey = null; renderPanel(); t.scrollIntoView({ inline: 'center', block: 'nearest' });
});
$('tabs').addEventListener('keydown', e => {
  if (!/^Arrow(Left|Right)$/.test(e.key)) return;
  const i = CATS.indexOf(curCat) + (e.key === 'ArrowRight' ? 1 : -1); if (i < 0 || i >= CATS.length) return;
  e.preventDefault(); curCat = CATS[i]; openKey = null; renderPanel(); $('tab_' + curCat).focus();
});

/* ---------- Barre de résultat, jauge, feedback ---------- */
let shown = 0, raf = 0, prevPct = null, toastT = 0;
function setBig(target, instant) {
  cancelAnimationFrame(raf);
  const from = shown, t0 = performance.now(), dur = (reduced || instant) ? 0 : 500, sign = '';
  const step = now => {
    const k = dur ? Math.min(1, (now - t0) / dur) : 1;
    shown = from + (target - from) * (1 - Math.pow(1 - k, 3));
    $('bignum').textContent = sign + fmt(Math.abs(shown));
    if (k < 1) raf = requestAnimationFrame(step);
  };
  step(t0);
}
function toast(msg, action) {
  const t = $('toast'); t.textContent = msg; t.classList.toggle('act', !!action);
  if (action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = action.label; b.onclick = () => { t.classList.remove('show'); action.run(); }; t.append(' ', b); }
  t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), action ? 6000 : 2300);
}
/* Remise à zéro en deux temps : 1er clic arme (4 s), 2e clic confirme ; « Annuler » restaure. */
let resetArmed = null;
function askReset(btn) {
  if (!Object.values(st).some(Boolean)) return;
  if (resetArmed !== btn) {
    disarmReset(); resetArmed = btn; btn.dataset.label = btn.textContent;
    btn.textContent = 'Confirmer ?'; btn.setAttribute('aria-label', 'Confirmer la remise à zéro'); btn.classList.add('armed');
    btn._t = setTimeout(disarmReset, 4000); return;
  }
  disarmReset();
  const prev = { ...st };
  st = {}; openKey = null; renderPanel(); update();
  toast('Budget remis à zéro.', { label: 'Annuler', run: () => { st = prev; renderPanel(); update(); toast('Scénario restauré'); } });
}
function disarmReset() {
  if (!resetArmed) return;
  clearTimeout(resetArmed._t); resetArmed.textContent = resetArmed.dataset.label; resetArmed.removeAttribute('aria-label'); resetArmed.classList.remove('armed'); resetArmed = null;
}
$('reset-top').onclick = e => askReset(e.currentTarget);
function celebrate(msg) {
  toast(msg);
  const b = $('bar'); b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse');
}
function update(initial) {
  const rt = $('reset-top'); if (rt) rt.disabled = !Object.values(st).some(Boolean);
  const sc = scenario(), seuil = meta.regle_impots.seuil_pct, def = meta.deficit_mds;
  const pct0 = meta.deficit_pct_pib || def / meta.pib_mds * 100;
  // Solde final : « 92,4 Md€ de déficit » / « 6,2 Md€ d'excédent », effort en 2e ligne.
  const surplus = sc.resid < -0.05, eq = Math.abs(sc.resid) <= 0.05;
  setBig(Math.abs(sc.resid), initial);
  $('bar-l1').textContent = eq ? 'à l’équilibre' : surplus ? 'd’excédent' : 'de déficit';
  $('bar-l2').textContent = (eq ? 'solde 0 %' : `${fmtPct(Math.abs(sc.pct))} % du PIB`) +
    (sc.net > 0.05 ? ` · −${fmt(sc.net)} Md€` : sc.net < -0.05 ? ` · +${fmt(-sc.net)} Md€` : '');
  $('bar-l2').title = trajTxt(pct0, sc.pct) + ` (au départ : ${fmt(def)} Md€ de déficit)`;
  $('bar').classList.toggle('surplus', surplus);
  placeGauge(sc.pct, pct0, seuil);
  $('gauge').setAttribute('aria-label', `Déficit à ${fmtPct(sc.pct)} % du PIB. Paliers : ${seuil} % et 0 %.`);
  const cb = $('chip-block'); cb.hidden = !sc.blocked.length;
  cb.textContent = `${sc.blocked.length} bloquée${sc.blocked.length > 1 ? 's' : ''}`;
  cb.title = 'Mesures dont la faisabilité est notée « bloquée » (obstacle constitutionnel ou européen probable)';
  const t = taxRoom(sc.eco + sc.interets), bw = $('bar-warn');
  bw.hidden = !(sc.moins > t.room + 0.05);
  bw.textContent = `Impôts : il manque ${fmt(sc.moins - t.room)} Md€ d’économies`;
  $('barmain').setAttribute('aria-label', `Résultat : ${sc.net > 0 ? 'déficit réduit' : sc.net < 0 ? 'déficit alourdi' : 'aucun effet'} de ${fmt(Math.abs(sc.net))} milliards d’euros, déficit à ${fmtPct(sc.pct)} % du PIB. Ouvrir le bilan détaillé.`);
  // paliers franchis (vers le bas uniquement)
  if (prevPct != null && !initial) {
    if (prevPct > 0 && sc.pct <= 0) celebrate('Déficit comblé !');
    else if (prevPct > seuil && sc.pct <= seuil) celebrate(`Sous ${seuil} % !`);
  }
  prevPct = sc.pct;
  updateTabs(); writeHash();
  if ($('sheet').open) renderSheet();
}

/* ---------- Bilan détaillé (feuille) ---------- */
function renderSheet() {
  const sc = scenario(), def = meta.deficit_mds, seuil = meta.regle_impots.seuil_pct;
  const netTxt = `${sc.net > 0.05 ? '−' : sc.net < -0.05 ? '+' : ''}${fmt(Math.abs(sc.net))} Md€`;
  const t = taxRoom(sc.eco + sc.interets), D = Math.max(def, sc.eco + sc.plus);
  const seg = (nom, v, fa, cls, sign) => `<span class="seg1 ${cls}" role="button" tabindex="0" data-info="${esc(nom)} : ${sign}${fmt(v)} Md€ · ${FAISA[fa]}" title="${esc(nom)}" style="width:${v / D * 100}%;--c:var(--f${fa})"></span>`;
  const items = [...sc.rows.map(x => ({ v: x.v, h: seg(x.it.nom, x.v, x.c.faisabilite, '', '−') })),
    ...sc.hausses.map(x => ({ v: x.v, h: seg(x.it.nom + ' (recette)', x.v, x.c.faisabilite, 'rec', '+') }))].sort((a, b) => b.v - a.v);
  const gross = sc.eco + sc.plus, negW = Math.min(sc.moins, gross);
  const neg = sc.moins ? `<span class="seg1 neg" role="button" tabindex="0" data-info="Baisses d’impôts : −${fmt(sc.moins)} Md€ (soustraits du total)" style="left:${(gross - negW) / D * 100}%;width:${negW / D * 100}%;height:100%"></span>` : '';
  $('sheet-body').innerHTML = `
    <ul class="bilan">
      <li><span>Économies sur les dépenses</span><b>${fmt(sc.eco)} Md€</b></li>
      ${sc.plus ? `<li><span>Recettes en plus</span><b>+${fmt(sc.plus)} Md€</b></li>` : ''}
      ${sc.moins ? `<li><span>Baisses d’impôts</span><b>−${fmt(sc.moins)} Md€</b></li>` : ''}
      <li class="tot"><span>Effet net sur le déficit</span><b>${netTxt} (${fmt(Math.abs(sc.net) / def * 100)} %)</b></li>
      <li><span>Déficit résiduel</span><b>${fmtPct(sc.pct)} % du PIB</b></li>
      <li><span>Intérêts évités (bonus, hors jauge)</span><b>+${fmt(sc.interets)} Md€</b></li>
    </ul>
    <p class="muted" style="font-size:.82rem;margin:4px 0">Intérêts évités = économies × taux marginal de la dette (${fmt(meta.taux_marginal_dette * 100)} %${meta.taux_marginal_dette_provisoire ? ', valeur provisoire' : ''}), effet à un an.</p>
    <div class="block"><h3>Crédibilité juridique</h3>
      <p style="margin:0">${sc.blocked.length ? `<b>${sc.blocked.length} mesure${sc.blocked.length > 1 ? 's' : ''} bloquée${sc.blocked.length > 1 ? 's' : ''}</b> · ` : ''}${esc(riskSummary(sc.chosen) || 'Aucune mesure choisie.')}</p></div>
    <div class="block"><h3>Règle des baisses d’impôts</h3>
      <div style="display:flex;justify-content:space-between;gap:8px"><span>Baisse d’impôts possible</span><b>${fmt(t.room)} Md€</b></div>
      <div class="taxbar"><div style="width:${Math.min(100, t.room / def * 100)}%"></div></div>
      <p class="muted" style="font-size:.85rem;margin:0">${t.manque > 0 ? `Pour baisser les impôts, il faut d’abord ramener le déficit sous ${seuil} % du PIB (encore ${fmt(t.manque)} Md€ d’économies). ` : `Déficit sous le seuil de ${seuil} % du PIB. `}Déficit après économies et intérêts évités : ${fmtPct(t.defPct)} % du PIB.</p>
      ${sc.moins > t.room + 0.05 ? `<p class="warn" role="alert">⚠ Vos baisses d’impôts (${fmt(sc.moins)} Md€) dépassent ce que vos économies permettent (${fmt(t.room)} Md€) : il manque ${fmt(sc.moins - t.room)} Md€ de coupes.</p>` : ''}</div>
    ${items.length || neg ? `<div class="block"><h3>Poids de chaque mesure</h3><div class="stack" id="stack" aria-label="Contribution de chaque mesure">${items.map(i => i.h).join('')}${neg}</div><p class="muted stackinfo" id="stackinfo" aria-live="polite">Touchez un segment pour le détail. Aplat : économie · hachures : recette en plus · gris : baisse d’impôt.</p></div>` : ''}
    <div class="block" id="sheet-presets"><h3>Scénarios tout faits</h3><div class="presets">${presetsHTML()}</div></div>
    <div class="actions"><button type="button" class="btn sec" id="reset">Tout remettre à zéro</button></div>
    <p class="warn">⚠ ${esc(meta.statut)}</p>`;
}
$('sheet-body').addEventListener('click', e => {
  const p = e.target.closest('[data-preset]'); if (p) return applyPreset(+p.dataset.preset);
  const rb = e.target.closest('#reset'); if (rb) return askReset(rb);
  const i = e.target.dataset && e.target.dataset.info; if (i) $('stackinfo').textContent = i;
});
$('sheet-body').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.info) { e.preventDefault(); e.target.click(); } });
function openSheet(toPresets) {
  renderSheet(); const s = $('sheet'); s.showModal ? s.showModal() : s.setAttribute('open', '');
  if (toPresets) $('sheet-presets').scrollIntoView({ block: 'start' }); else s.scrollTop = 0;
}
$('barmain').onclick = () => openSheet(false);
$('open-presets').onclick = () => openSheet(true);
$('sheet-close').onclick = () => $('sheet').close();
$('sheet').addEventListener('click', e => { if (e.target === $('sheet')) $('sheet').close(); });

/* ---------- Image de partage (1200x630) ---------- */
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function scenarioImage() {
  const W = 1200, H = 630, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), sc = scenario(), dark = isDark(), F = FCOL[dark ? 'dark' : 'light'];
  const fg = dark ? '#eef0f4' : '#16181d', mu = dark ? '#a2a8b3' : '#5b6068', line = dark ? '#2c313b' : '#e2e0d8', acc = dark ? '#8fb0ff' : '#1f4fd1';
  const grd = g.createLinearGradient(0, 0, W, H);
  grd.addColorStop(0, dark ? '#10131a' : '#fbfaf6'); grd.addColorStop(1, dark ? '#171b26' : '#ecebe4');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.fillStyle = acc; g.fillRect(0, 0, 14, H);
  const sans = 'system-ui,-apple-system,"Segoe UI",sans-serif', seuil = meta.regle_impots.seuil_pct, def = meta.deficit_mds;
  g.textBaseline = 'alphabetic';
  g.fillStyle = acc; g.font = `700 24px ${sans}`; g.fillText('MINISTRE DU BUDGET · MON SCÉNARIO', 60, 62);
  g.fillStyle = fg; g.font = `800 112px ${sans}`;
  const big = fmt(Math.abs(sc.resid)) + ' Md€';
  g.fillText(big, 56, 175);
  const bw = g.measureText(big).width;
  g.fillStyle = mu; g.font = `600 30px ${sans}`;
  g.fillText(Math.abs(sc.resid) <= 0.05 ? 'à l’équilibre' : sc.resid < 0 ? 'd’excédent' : 'de déficit', 70 + bw, 175);
  g.fillText(trajTxt(meta.deficit_pct_pib || def / meta.pib_mds * 100, sc.pct) + (sc.net > 0.05 ? ` · effort ${fmt(sc.net)} Md€` : ''), 60, 218);
  if (sc.pct <= seuil) { // pastille « sous 3 % »
    const t = sc.pct < -0.05 ? 'Excédent' : sc.pct <= 0.05 ? 'Équilibre' : `Sous ${seuil} % du PIB`;
    g.font = `800 28px ${sans}`; const tw = g.measureText(t).width + 40;
    g.fillStyle = F[1]; rr(g, W - 60 - tw, 110, tw, 52, 26); g.fill();
    g.fillStyle = dark ? '#0b0d12' : '#fff'; g.fillText(t, W - 40 - tw, 146);
  }
  // jauge à deux côtés, même axe que la barre du site (gPos) : déficit à gauche, 0, excédent à droite
  const gx = 60, gw = 1080, gy = 252, gh = 30, pct0 = meta.deficit_pct_pib || def / meta.pib_mds * 100;
  const X = p => gx + gw * gPos(p, pct0) / 100, z = X(0), x = X(sc.pct), mx = X(seuil);
  g.fillStyle = line; rr(g, gx, gy, gw, gh, 15); g.fill();
  g.fillStyle = F[1] + '38'; rr(g, z, gy, gx + gw - z, gh, 15); g.fill(); // zone excédent
  if (Math.abs(x - z) > 1) { g.fillStyle = sc.pct <= seuil ? F[1] : sc.pct <= seuil + 1 ? F[2] : F[3]; rr(g, Math.min(x, z), gy, Math.max(30, Math.abs(z - x)), gh, 15); g.fill(); }
  g.fillStyle = fg; g.globalAlpha = .5; g.fillRect(mx - 2, gy - 6, 4, gh + 12); g.globalAlpha = 1;
  g.fillRect(z - 2, gy - 10, 4, gh + 20);
  g.beginPath(); g.arc(x, gy + gh / 2, 16, 0, 7); g.fillStyle = dark ? '#10131a' : '#fbfaf6'; g.fill(); g.lineWidth = 6; g.strokeStyle = fg; g.stroke();
  g.font = `600 20px ${sans}`; g.fillStyle = mu; g.textAlign = 'left'; g.fillText(`déficit ${fmt(pct0)} %`, gx, gy + gh + 30);
  g.fillStyle = fg; g.textAlign = 'center'; g.fillText(`${seuil} %`, mx, gy + gh + 30);
  g.font = `800 20px ${sans}`; g.fillText('0', z, gy + gh + 30);
  g.font = `600 20px ${sans}`; g.fillStyle = F[1]; g.textAlign = 'right'; g.fillText('excédent', gx + gw, gy + gh + 30); g.textAlign = 'left';
  // mesures principales
  const all = [...sc.rows.map(x => ({ nom: x.it.nom, v: x.v, f: x.c.faisabilite, k: 'd' })),
    ...sc.hausses.map(x => ({ nom: x.it.nom + ' (recette)', v: x.v, f: x.c.faisabilite, k: 'r' })),
    ...sc.baisses.map(x => ({ nom: x.it.nom + ' (baisse)', v: x.v, f: x.c.faisabilite, k: 'b' }))].sort((a, b) => b.v - a.v);
  const rows = all.slice(0, 5), max = Math.max(1, ...rows.map(r => r.v));
  g.font = `22px ${sans}`;
  if (!rows.length) { g.fillStyle = mu; g.fillText('Aucune mesure choisie pour le moment.', 60, 400); }
  rows.forEach((r, i) => {
    const y = 350 + i * 40;
    g.fillStyle = fg; g.font = `600 22px ${sans}`; g.fillText(r.nom.length > 36 ? r.nom.slice(0, 35) + '…' : r.nom, 60, y + 22);
    const w = Math.max(6, 460 * r.v / max);
    g.fillStyle = r.k === 'b' ? '#888' : F[r.f]; rr(g, 520, y + 2, w, 26, 6); g.fill();
    if (r.k !== 'd') {
      g.save(); rr(g, 520, y + 2, w, 26, 6); g.clip(); g.strokeStyle = dark ? '#171b26' : '#fbfaf6'; g.lineWidth = 3;
      for (let x = 500; x < 520 + w; x += 10) { g.beginPath(); g.moveTo(x, y + 28); g.lineTo(x + 24, y + 2); g.stroke(); }
      g.restore();
    }
    g.fillStyle = fg; g.font = `700 22px ${sans}`; g.fillText((r.k === 'r' ? '+' : '−') + fmt(r.v) + ' Md€', 520 + w + 14, y + 22);
  });
  // légende + appel
  [1, 2, 3].forEach((f, i) => {
    g.fillStyle = F[f]; rr(g, 60 + i * 270, H - 78, 20, 20, 5); g.fill();
    g.fillStyle = mu; g.font = `20px ${sans}`; g.fillText(FAISA[f], 90 + i * 270, H - 61);
  });
  if (sc.blocked.length) { g.fillStyle = F[3]; g.font = `700 20px ${sans}`; g.textAlign = 'right'; g.fillText(`${sc.blocked.length} mesure${sc.blocked.length > 1 ? 's' : ''} bloquée${sc.blocked.length > 1 ? 's' : ''}`, W - 60, H - 61); g.textAlign = 'left'; }
  g.fillStyle = acc; g.font = `800 28px ${sans}`;
  g.fillText('Et vous, vous feriez quoi ? → ' + location.host + location.pathname.replace(/\/$/, ''), 60, H - 20);
  return new Promise(r => c.toBlob(r, 'image/png'));
}
let shareFile = null, shareUrl = null;
const dlg = $('preview');
$('share').onclick = async () => {
  shareFile = new File([await scenarioImage()], 'mon-budget.png', { type: 'image/png' });
  if (shareUrl) URL.revokeObjectURL(shareUrl);
  shareUrl = URL.createObjectURL(shareFile);
  $('previewimg').src = shareUrl;
  $('doshare').textContent = 'Partager / Télécharger';
  dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
};
$('close').onclick = () => dlg.close ? dlg.close() : dlg.removeAttribute('open');
$('doshare').onclick = async () => {
  const sc = scenario(), txt = `Ministre du Budget : ${sc.net >= 0 ? `${fmt(sc.net)} Md€ d’effort` : `${fmt(-sc.net)} Md€ de dérapage`}, ${soldeTxt(sc.pct)} du PIB à l’arrivée. Et vous ?`;
  if (navigator.canShare && navigator.canShare({ files: [shareFile] }))
    return navigator.share({ text: `${txt} ${location.href}`, files: [shareFile] }).catch(() => {});
  const a = Object.assign(document.createElement('a'), { href: shareUrl, download: shareFile.name });
  a.click();
  await navigator.clipboard.writeText(`${txt} ${location.href}`).catch(() => {});
  $('doshare').textContent = 'Image téléchargée + lien copié ✓';
};

/* ---------- Démarrage ---------- */
function startApp() {
  $('intro').hidden = true; $('app').hidden = false; $('bar').hidden = false;
}
function setupIntro() {
  const pct0 = meta.deficit_pct_pib || meta.deficit_mds / meta.pib_mds * 100, seuil = meta.regle_impots.seuil_pct;
  $('i-year').textContent = String(meta.annee_reference).replace(/\s*révisé/, '');
  $('i-def').textContent = fmt(meta.deficit_mds) + ' Md€';
  $('i-pct').textContent = `(${fmt(pct0)} % du PIB)`;
  $('i-need').textContent = fmt(Math.round(meta.deficit_mds - meta.pib_mds * seuil / 100)) + ' Md€';
  // même axe que la barre du bas : déficit de départ à gauche, 0, excédent à droite
  const im = gPos(seuil, pct0), iz = gPos(0, pct0);
  $('i-mark').style.left = im + '%'; $('i-mlab').style.left = im + '%'; $('i-mlab').textContent = seuil + ' %';
  $('i-zero').style.left = iz + '%'; $('i-0lab').style.left = iz + '%';
  $('i-surplus').style.left = iz + '%'; $('i-surplus').style.width = (100 - iz) + '%';
  $('i-fill').style.left = '0%'; $('i-fill').style.width = iz + '%'; $('i-pin').style.left = '0%';
  $('i-top').textContent = 'déficit ' + fmt(pct0) + ' %';
  if (meta.derive_2027) $('i-derive').innerHTML = esc(meta.derive_2027.texte) + ` <a href="${esc(meta.derive_2027.source.url)}" target="_blank" rel="noopener">source</a>`;
  $('i-presets').innerHTML = presetsHTML();
  $('i-presets').addEventListener('click', e => { const p = e.target.closest('[data-preset]'); if (p) applyPreset(+p.dataset.preset); });
  $('start').onclick = () => { startApp(); window.scrollTo(0, 0); };
  $('show-presets').onclick = e => {
    const open = $('i-presets').hidden; $('i-presets').hidden = !open; e.currentTarget.setAttribute('aria-expanded', open);
    if (open) $('i-presets').scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  };
}
// g-mark de la barre
/* Jauge à deux côtés, en % du PIB : déficit de départ à gauche, 0 au milieu-droit, excédent à droite. */
const G_SURPLUS = 1.5; // % du PIB affiché côté excédent (au-delà, la pastille reste en butée)
const gPos = (p, pct0) => (pct0 - Math.max(-G_SURPLUS, Math.min(pct0, p))) / (pct0 + G_SURPLUS) * 100;
function setupBar() {
  const seuil = meta.regle_impots.seuil_pct, pct0 = meta.deficit_pct_pib || meta.deficit_mds / meta.pib_mds * 100;
  const m = gPos(seuil, pct0), z = gPos(0, pct0);
  $('g-mark').style.left = m + '%'; $('g-mlab').style.left = m + '%'; $('g-mlab').textContent = seuil + ' %';
  $('g-zero').style.left = z + '%'; $('g-0lab').style.left = z + '%';
  $('g-surplus').style.left = z + '%'; $('g-surplus').style.width = (100 - z) + '%';
  $('g-top').textContent = 'déficit ' + fmt(pct0) + ' %';
}
function placeGauge(pct, pct0, seuil) {
  const z = gPos(0, pct0), x = gPos(pct, pct0), f = $('g-fill');
  // la barre part de 0 : vers la gauche tant qu'il reste un déficit, vers la droite en excédent
  f.style.left = Math.min(x, z) + '%'; f.style.width = Math.abs(z - x) + '%';
  f.className = 'g-fill' + (pct < 0 ? ' ok sur' : pct <= seuil ? ' ok' : pct <= seuil + 1 ? ' mid' : '');
  $('g-pin').style.left = x + '%';
}

const getJSON = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });
let rec = [];
Promise.all([
  getJSON('data/postes.json'),
  // sous-leviers d'impôts si le fichier existe, sinon recettes.json, sinon pas de recettes
  getJSON('data/recettes_leviers.json').catch(() => getJSON('data/recettes.json')).then(d => d.recettes || d).catch(() => [])
]).then(([d, r]) => {
  data = d; meta = d.meta; rec = Array.isArray(r) ? r : [];
  if (!rec.length) CATS.splice(CATS.indexOf('Impôts'), 1);
  buildItems(); buildPresets();
  $('tagline').textContent = `Dépenses publiques (APU) : ${fmt(meta.depenses_totales_mds)} Md€ · Déficit ${meta.annee_reference} : ${fmt(meta.deficit_mds)} Md€`;
  $('statut').textContent = '⚠ ' + meta.statut;
  readHash();
  setupIntro(); setupBar(); renderTabs(); renderPanel(); update(true);
  document.body.classList.remove('boot');
  if (Object.values(st).some(Boolean)) startApp(); else $('intro').hidden = false;
}).catch(err => {
  document.body.classList.remove('boot');
  document.body.insertAdjacentHTML('afterbegin', `<p style="padding:24px">Impossible de charger les données (${esc(err.message)}). Les fichiers sont dans <a href="data/postes.json">data/postes.json</a>.</p>`);
});
