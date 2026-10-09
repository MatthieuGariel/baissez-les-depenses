const FAISA = { 1: 'Faisable', 2: 'Risqué', 3: 'Bloqué / très contestable' };
const COL = { 1: '#1b8a4a', 2: '#d08a00', 3: '#c0392b' };
const fmt = n => n.toLocaleString('fr-FR', { maximumFractionDigits: Math.abs(n) < 1 ? 2 : 1 });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let data, rec = [], state = {}, rstate = {};
const RLAB = ['Baisse forte', 'Baisse moyenne', 'Baisse légère', 'Aucun changement', 'Hausse légère', 'Hausse moyenne', 'Hausse forte'];
const rLabel = n => RLAB[n + 3];
const nHausse = r => Math.min(3, (r.crans_hausse || []).length), nBaisse = r => Math.min(3, (r.crans_baisse || []).length);
const clampR = (r, v) => Math.max(-nBaisse(r), Math.min(nHausse(r), Math.trunc(+v) || 0));

// Poste en lecture seule : pas de curseur (la dette est un effet calculé).
const isRO = p => p.id === 'dette' || !!p.lecture_seule;
const nCrans = p => p.crans.length;
const labels = p => (data.meta.crans_labels || ['Aucune', 'Légère', 'Moyenne', 'Forte', 'Rupture']).slice(0, nCrans(p) + 1);

// URL hash = scénario partageable : #retraites=2&ue=1&r_tva=-1 (clampé au nombre de crans ; recettes préfixées r_, de -3 à +3)
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  for (const [k, v] of p) {
    if (k.startsWith('r_')) {
      const r = rec.find(x => x.id === k.slice(2));
      if (r) rstate[r.id] = clampR(r, v);
      continue;
    }
    const poste = data.postes.find(x => x.id === k);
    if (poste && !isRO(poste)) state[k] = Math.max(0, Math.min(nCrans(poste), Math.floor(+v) || 0));
  }
}
function writeHash() {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) if (v) p.set(k, v);
  for (const [k, v] of Object.entries(rstate)) if (v) p.set('r_' + k, v);
  history.replaceState(null, '', '#' + p.toString());
}

const list = (titre, arr) => arr.length ? `<strong>${titre}</strong><ul>${arr.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : '';

function detail(poste, n) {
  if (!n) return '<p class="muted">Pas de baisse.</p>';
  const c = poste.crans[n - 1];
  const src = [...(c.sources || []), poste.source_montant, ...(poste.sources || [])]
    .filter(s => s && s.url).filter((s, i, a) => a.findIndex(x => x.url === s.url) === i)
    .map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.titre)}</a></li>`).join('');
  return `<p><strong>${esc(c.mesure)}</strong><br>
    <span class="gain">−${fmt(c.gain_mds)} Md€</span>
    <span class="badge f${c.faisabilite}">${FAISA[c.faisabilite]}</span>
    ${c.non_verifie ? '<span class="badge nv">Chiffrage non vérifié</span>' : ''}</p>
    ${list('Arguments', c.arguments)}
    ${list('Obstacles juridiques / UE / politiques', c.obstacles)}
    <strong>Sources</strong><ul>${src}</ul>`;
}

function detailR(r, n) {
  if (!n) return '<p class="muted">Aucun changement.</p>';
  const c = n < 0 ? r.crans_baisse[-n - 1] : r.crans_hausse[n - 1];
  const v = n < 0 ? c.cout_mds : c.gain_mds;
  const src = [...(c.sources || []), r.source_montant, ...(r.sources || [])]
    .filter(s => s && s.url).filter((s, i, a) => a.findIndex(x => x.url === s.url) === i)
    .map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.titre)}</a></li>`).join('');
  return `<p><strong>${rLabel(n)} : ${esc(c.mesure)}</strong><br>
    <span class="gain">${n < 0 ? `−${fmt(v)} Md€ de recettes (coût)` : `+${fmt(v)} Md€ de recettes (gain)`}</span>
    <span class="badge f${c.faisabilite}">${FAISA[c.faisabilite]}</span>
    ${c.non_verifie ? '<span class="badge nv">Chiffrage non vérifié</span>' : ''}</p>
    ${list('Arguments', c.arguments || [])}
    ${list('Obstacles juridiques / UE / politiques', c.obstacles || [])}
    ${c.notes ? `<p class="muted">${esc(c.notes)}</p>` : ''}
    <strong>Sources</strong><ul>${src}</ul>`;
}

function cardR(r) {
  const v = rstate[r.id] || 0;
  return `<section class="card" id="r_${r.id}">
      <div class="head"><h2>${esc(r.nom)}</h2><span class="muted">${fmt(r.montant_mds)} Md€ (${r.annee_montant})</span></div>
      <input type="range" min="-3" max="3" step="1" value="${v}" data-rid="${r.id}" aria-label="Niveau de variation ${esc(r.nom)}" aria-valuetext="${rLabel(v)}">
      <div class="ticks r3"><span>Baisse forte</span><span>Aucun changement</span><span>Hausse forte</span></div>
      <div class="detail">${detailR(r, v)}</div>
    </section>`;
}

function card(p) {
  const head = `<div class="head"><h2>${esc(p.nom)}</h2><span class="muted">${esc(p.bloc)} · ${fmt(p.montant_mds)} Md€</span></div>`;
  if (isRO(p)) {
    const m = data.meta;
    return `<section class="card readonly" id="${p.id}">${head}
      <p><strong id="dette-effet"></strong></p>
      <p class="muted">Pas de curseur : la charge de la dette ne se vote pas. Elle baisse mécaniquement quand le déficit se réduit (moins d'emprunts à émettre). Effet estimé = économies choisies × taux marginal de la dette (${fmt(m.taux_marginal_dette * 100)} %${m.taux_marginal_dette_provisoire ? ', valeur provisoire' : ''}).</p>
    </section>`;
  }
  const n = nCrans(p);
  return `<section class="card" id="${p.id}">${head}
      <input type="range" min="0" max="${n}" step="1" value="${state[p.id] || 0}" data-id="${p.id}" aria-label="Niveau de baisse ${esc(p.nom)}">
      <div class="ticks">${labels(p).map(c => `<span>${c}</span>`).join('')}</div>
      <div class="detail">${detail(p, state[p.id] || 0)}</div>
    </section>`;
}

function render() {
  const rm = document.getElementById('recettes-liste');
  rm.innerHTML = rec.map(cardR).join('');
  rm.addEventListener('input', e => {
    const id = e.target.dataset.rid; if (!id) return;
    const r = rec.find(x => x.id === id);
    rstate[id] = clampR(r, e.target.value);
    e.target.setAttribute('aria-valuetext', rLabel(rstate[id]));
    e.target.closest('.card').querySelector('.detail').innerHTML = detailR(r, rstate[id]);
    update();
  });
  const main = document.getElementById('postes');
  main.innerHTML = data.postes.map(card).join('');
  main.addEventListener('input', e => {
    const id = e.target.dataset.id; if (!id) return;
    state[id] = +e.target.value;
    const p = data.postes.find(x => x.id === id);
    e.target.closest('.card').querySelector('.detail').innerHTML = detail(p, state[id]);
    update();
  });
}

// Scénario courant : crans choisis triés par gain décroissant, économies, intérêts évités.
function scenario() {
  const rows = data.postes.filter(p => !isRO(p) && state[p.id])
    .map(p => ({ p, c: p.crans[state[p.id] - 1] })).sort((a, b) => b.c.gain_mds - a.c.gain_mds);
  const eco = rows.reduce((s, r) => s + r.c.gain_mds, 0);
  const rrows = rec.filter(r => rstate[r.id]).map(r => {
    const n = rstate[r.id], c = n < 0 ? r.crans_baisse[-n - 1] : r.crans_hausse[n - 1];
    return { r, n, c, v: n < 0 ? c.cout_mds : c.gain_mds };
  });
  const hausses = rrows.filter(x => x.n > 0), baisses = rrows.filter(x => x.n < 0);
  const plus = hausses.reduce((s, x) => s + x.v, 0), moins = baisses.reduce((s, x) => s + x.v, 0);
  // effet net sur le déficit (Md€, positif = déficit réduit), hors intérêts évités
  return { rows, eco, interets: eco * data.meta.taux_marginal_dette, chosen: [...rows.map(r => r.c), ...hausses.map(x => x.c)], hausses, baisses, plus, moins, net: eco + plus - moins };
}

// Baisse d'impôts possible. total = économies + intérêts évités (Md€).
// parts[0] : déficit > seuil ; parts[1] : entre seuil et 0 % ; parts[2] : excédent.
function taxRoom(total) {
  const m = data.meta, [p0, p1, p2] = m.regle_impots.parts;
  const seuilMds = m.pib_mds * m.regle_impots.seuil_pct / 100;
  const toSeuil = Math.max(0, m.deficit_mds - seuilMds);
  const z0 = Math.min(total, toSeuil);
  const z1 = Math.max(0, Math.min(total, m.deficit_mds) - toSeuil);
  const z2 = Math.max(0, total - m.deficit_mds);
  return { room: z0 * p0 + z1 * p1 + z2 * p2, manque: Math.max(0, toSeuil - total), defPct: (m.deficit_mds - total) / m.pib_mds * 100 };
}

function update() {
  const sc = scenario(), m = data.meta;
  const def = m.deficit_mds, netPct = Math.abs(sc.net) / def * 100;
  const netTxt = `${sc.net > 0 ? '−' : sc.net < 0 ? '+' : ''}${fmt(Math.abs(sc.net))} Md€`;
  document.getElementById('sumline').textContent = `Net : ${netTxt} (${fmt(netPct)} %)`;
  document.getElementById('bilanlist').innerHTML =
    `<li>Économies sur les dépenses : <strong>${fmt(sc.eco)} Md€</strong></li>` +
    (sc.plus ? `<li>Recettes en plus : <strong>${fmt(sc.plus)} Md€</strong></li>` : '') +
    (sc.moins ? `<li>Baisses d'impôts : <strong>−${fmt(sc.moins)} Md€</strong></li>` : '') +
    `<li>Effet net sur le déficit : <strong>${netTxt}</strong> (${fmt(netPct)} % du déficit)</li>` +
    (sc.plus || sc.moins ? '<li class="muted">Barre : hachures colorées = recettes en plus ; hachures grises = baisses d’impôts (soustraites).</li>' : '');
  document.getElementById('pct').textContent = `${fmt(Math.max(0, Math.min(100, sc.net / def * 100)))} % du déficit comblé`;
  document.getElementById('risk').textContent = riskSummary(sc.chosen);
  // barre empilée : dépenses (aplats) + hausses de recettes (hachures) ; baisses d'impôts soustraites (hachures rouges)
  const gross = sc.eco + sc.plus, D = Math.max(def, gross);
  const seg = (nom, v, f, cls, sign) => `<span class="seg ${cls}" role="button" tabindex="0" data-info="${esc(nom)} : ${sign}${fmt(v)} Md€ · ${FAISA[f]}" title="${esc(nom)} : ${sign}${fmt(v)} Md€" style="width:${v / D * 100}%;--c:${COL[f]}"></span>`;
  const items = [
    ...sc.rows.map(r => ({ v: r.c.gain_mds, h: seg(r.p.nom, r.c.gain_mds, r.c.faisabilite, '', '−') })),
    ...sc.hausses.map(x => ({ v: x.v, h: seg(x.r.nom + ' (recette)', x.v, x.c.faisabilite, 'rec', '+') }))].sort((a, b) => b.v - a.v);
  const negW = Math.min(sc.moins, gross);
  document.getElementById('stack').innerHTML = items.map(i => i.h).join('') +
    (sc.moins ? `<span class="seg neg" role="button" tabindex="0" data-info="Baisses d'impôts : −${fmt(sc.moins)} Md€ (soustraits du total)" title="Baisses d'impôts : −${fmt(sc.moins)} Md€" style="left:${(gross - negW) / D * 100}%;width:${negW / D * 100}%"></span>` : '');
  document.getElementById('stackinfo').textContent = items.length ? 'Touchez un segment pour le détail.' : '';
  // effet induit sur la dette
  const txt = `+ ${fmt(sc.interets)} Md€ d'intérêts évités`;
  document.getElementById('interets').textContent = sc.eco ? txt : '';
  const de = document.getElementById('dette-effet'); if (de) de.textContent = txt;
  // baisse d'impôts
  const t = taxRoom(sc.eco + sc.interets), seuil = m.regle_impots.seuil_pct;
  const tw = document.getElementById('taxwarn');
  tw.textContent = sc.moins > t.room + 0.05 ? `⚠ Vos baisses d'impôts (${fmt(sc.moins)} Md€) dépassent ce que vos économies permettent (${fmt(t.room)} Md€) : il manque ${fmt(sc.moins - t.room)} Md€ de coupes` : '';
  document.getElementById('taxline').textContent = `Baisse d'impôts possible : ${fmt(t.room)} Md€`;
  document.getElementById('taxfill').style.width = Math.min(100, t.room / m.deficit_mds * 100) + '%';
  document.getElementById('taxtxt').textContent = (t.manque > 0
    ? `Pour baisser les impôts, il faut d'abord ramener le déficit sous ${seuil} % du PIB (encore ${fmt(t.manque)} Md€ d'économies). `
    : `Déficit sous le seuil de ${seuil} % du PIB. `) + `Déficit après économies : ${fmt(t.defPct)} % du PIB.`;
  writeHash();
}

const stackEl = document.getElementById('stack');
stackEl.addEventListener('click', e => {
  const i = e.target.dataset && e.target.dataset.info;
  if (i) document.getElementById('stackinfo').textContent = i;
});
stackEl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.target.click(); } });

// Résumé de la crédibilité juridique du scénario.
// chosen = liste des crans retenus ({gain_mds, faisabilite: 1|2|3}).
function riskSummary(chosen) {
  const bloque = chosen.filter(c => c.faisabilite === 3).reduce((s, c) => s + c.gain_mds, 0);
  const risque = chosen.filter(c => c.faisabilite === 2).reduce((s, c) => s + c.gain_mds, 0);
  if (!bloque && !risque) return chosen.length ? 'Scénario juridiquement solide' : '';
  return `dont ${fmt(risque)} Md€ risqués, ${fmt(bloque)} Md€ bloqués`;
}

// Image 1200x630 du scénario (format OG), générée côté client
function scenarioImage() {
  const W = 1200, H = 630, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d'), sc = scenario(), m = data.meta;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const fg = dark ? '#eee' : '#1a1a1a', mu = dark ? '#aaa' : '#666';
  g.fillStyle = dark ? '#141414' : '#fafaf7'; g.fillRect(0, 0, W, H);
  g.fillStyle = fg; g.font = 'bold 48px system-ui,sans-serif';
  g.fillText(sc.net >= 0 ? `Mon budget : déficit réduit de ${fmt(sc.net)} Md€` : `Mon budget : déficit alourdi de ${fmt(-sc.net)} Md€`, 60, 80);
  g.font = '24px system-ui,sans-serif'; g.fillStyle = mu;
  const parts = [`Dépenses −${fmt(sc.eco)}`];
  if (sc.plus) parts.push(`Recettes +${fmt(sc.plus)}`);
  if (sc.moins) parts.push(`Baisses d'impôts −${fmt(sc.moins)}`);
  g.fillText(`${parts.join(' · ')} Md€ · ${fmt(Math.abs(sc.net) / m.deficit_mds * 100)} % du déficit`, 60, 120);
  g.fillText(`+ ${fmt(sc.interets)} Md€ d'intérêts évités`, 60, 150);
  const all = [
    ...sc.rows.map(r => ({ nom: r.p.nom, v: r.c.gain_mds, f: r.c.faisabilite, k: 'd' })),
    ...sc.hausses.map(x => ({ nom: x.r.nom + ' (recette)', v: x.v, f: x.c.faisabilite, k: 'r' })),
    ...sc.baisses.map(x => ({ nom: x.r.nom + ' (baisse)', v: x.v, f: x.c.faisabilite, k: 'b' }))].sort((a, b) => b.v - a.v);
  const rows = all.slice(0, 8), max = Math.max(1, ...rows.map(r => r.v));
  if (!rows.length) g.fillText('Aucune mesure choisie pour le moment.', 60, 215);
  rows.forEach((r, i) => {
    const y = 170 + i * 42;
    g.fillStyle = fg; g.font = '22px system-ui,sans-serif';
    g.fillText(r.nom.slice(0, 36), 60, y + 24);
    g.fillStyle = r.k === 'b' ? '#888' : COL[r.f];
    g.fillRect(560, y + 6, Math.max(4, 470 * r.v / max), 24);
    if (r.k !== 'd') { // hachures : recette (+) / baisse d'impôts (−)
      g.save(); g.beginPath(); g.rect(560, y + 6, Math.max(4, 470 * r.v / max), 24); g.clip();
      g.strokeStyle = dark ? '#141414' : '#fafaf7'; g.lineWidth = 3;
      for (let x = 540; x < 1040; x += 10) { g.beginPath(); g.moveTo(x, y + 30); g.lineTo(x + 24, y + 6); g.stroke(); }
      g.restore();
    }
    g.fillStyle = fg; g.fillText((r.k === 'b' ? '−' : r.k === 'r' ? '+' : '−') + fmt(r.v), 1050, y + 24);
  });
  [1, 2, 3].forEach((f, i) => {
    g.fillStyle = COL[f]; g.fillRect(60 + i * 280, H - 92, 18, 18);
    g.fillStyle = mu; g.font = '20px system-ui,sans-serif'; g.fillText(FAISA[f], 86 + i * 280, H - 76);
  });
  g.fillStyle = dark ? '#7da2ff' : '#1f4fd1'; g.font = 'bold 26px system-ui,sans-serif';
  g.fillText('Faites le vôtre, chaque mesure est sourcée → ' + location.host, 60, H - 30);
  return new Promise(r => c.toBlob(r, 'image/png'));
}

let shareFile = null, shareUrl = null;
const dlg = document.getElementById('preview');
document.getElementById('share').onclick = async () => {
  shareFile = new File([await scenarioImage()], 'mon-budget.png', { type: 'image/png' });
  if (shareUrl) URL.revokeObjectURL(shareUrl);
  shareUrl = URL.createObjectURL(shareFile);
  document.getElementById('previewimg').src = shareUrl;
  document.getElementById('doshare').textContent = 'Partager / Télécharger';
  dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
};
document.getElementById('close').onclick = () => dlg.close ? dlg.close() : dlg.removeAttribute('open');
document.getElementById('doshare').onclick = async () => {
  const sc = scenario(), txt = `Mon budget : déficit ${sc.net >= 0 ? 'réduit' : 'alourdi'} de ${fmt(Math.abs(sc.net))} Md€ (−${fmt(sc.eco)} dépenses${sc.plus ? `, +${fmt(sc.plus)} recettes` : ''}${sc.moins ? `, −${fmt(sc.moins)} d'impôts` : ''}), mesures sourcées`;
  if (navigator.canShare && navigator.canShare({ files: [shareFile] }))
    return navigator.share({ text: `${txt} ${location.href}`, files: [shareFile] }).catch(() => {});
  const a = Object.assign(document.createElement('a'), { href: shareUrl, download: shareFile.name });
  a.click();
  await navigator.clipboard.writeText(`${txt} ${location.href}`).catch(() => {});
  document.getElementById('doshare').textContent = 'Image téléchargée + lien copié ✓';
};

document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => document.getElementById(b.dataset.go).scrollIntoView({ behavior: 'smooth' }));
// bilan détaillé : ouvert sur grand écran, replié sur mobile
if (matchMedia('(min-width:700px)').matches) document.getElementById('bilan').open = true;

Promise.all([
  fetch('data/postes.json').then(r => r.json()),
  fetch('data/recettes.json').then(r => r.json()).then(d => d.recettes).catch(() => [])
]).then(([d, r]) => {
  data = d; rec = r;
  document.getElementById('total').textContent = fmt(d.meta.depenses_totales_mds) + ' Md€';
  document.getElementById('deficit').textContent = fmt(d.meta.deficit_mds) + ' Md€' + (d.meta.deficit_pct_pib ? ', ' + fmt(d.meta.deficit_pct_pib) + ' % du PIB' : '') + ' (' + d.meta.annee_reference + ')';
  if (d.meta.derive_2027) document.getElementById('derive').innerHTML = '↗ ' + esc(d.meta.derive_2027.texte) + ` <a href="${esc(d.meta.derive_2027.source.url)}" target="_blank" rel="noopener">source</a>`;
  document.getElementById('statut').textContent = document.getElementById('statut2').textContent = '⚠ ' + d.meta.statut;
  if (!rec.length) document.getElementById('recettes-titre').parentNode.querySelectorAll('#recettes-titre,.sectsub,.jump').forEach(e => e.hidden = true);
  readHash(); render(); update();
});
