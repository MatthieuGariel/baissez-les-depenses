const FAISA = { 1: 'Faisable', 2: 'Risqué', 3: 'Bloqué / très contestable' };
const COL = { 1: '#1b8a4a', 2: '#d08a00', 3: '#c0392b' };
const fmt = n => n.toLocaleString('fr-FR', { maximumFractionDigits: Math.abs(n) < 1 ? 2 : 1 });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let data, state = {};

// Poste en lecture seule : pas de curseur (la dette est un effet calculé).
const isRO = p => p.id === 'dette' || !!p.lecture_seule;
const nCrans = p => p.crans.length;
const labels = p => (data.meta.crans_labels || ['Aucune', 'Légère', 'Moyenne', 'Forte', 'Rupture']).slice(0, nCrans(p) + 1);

// URL hash = scénario partageable : #retraites=2&ue=1 (clampé au nombre de crans du poste)
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  for (const [k, v] of p) {
    const poste = data.postes.find(x => x.id === k);
    if (poste && !isRO(poste)) state[k] = Math.max(0, Math.min(nCrans(poste), Math.floor(+v) || 0));
  }
}
function writeHash() {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) if (v) p.set(k, v);
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
  return { rows, eco, interets: eco * data.meta.taux_marginal_dette, chosen: rows.map(r => r.c) };
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
  document.getElementById('eco').textContent = fmt(sc.eco);
  document.getElementById('pct').textContent = `${fmt(Math.min(100, sc.eco / m.deficit_mds * 100))} % du déficit comblé`;
  document.getElementById('risk').textContent = riskSummary(sc.chosen);
  // barre empilée : un segment par poste choisi
  document.getElementById('stack').innerHTML = sc.rows.map(r =>
    `<span class="seg" role="button" tabindex="0" data-info="${esc(r.p.nom)} : −${fmt(r.c.gain_mds)} Md€ · ${FAISA[r.c.faisabilite]}" title="${esc(r.p.nom)} : −${fmt(r.c.gain_mds)} Md€" style="width:${r.c.gain_mds / m.deficit_mds * 100}%;background:${COL[r.c.faisabilite]}"></span>`).join('');
  document.getElementById('stackinfo').textContent = sc.rows.length ? 'Touchez une couleur pour le détail.' : '';
  // effet induit sur la dette
  const txt = `+ ${fmt(sc.interets)} Md€ d'intérêts évités`;
  document.getElementById('interets').textContent = sc.eco ? txt : '';
  const de = document.getElementById('dette-effet'); if (de) de.textContent = txt;
  // baisse d'impôts
  const t = taxRoom(sc.eco + sc.interets), seuil = m.regle_impots.seuil_pct;
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
  g.fillText('Mon budget : −' + fmt(sc.eco) + ' Md€', 60, 80);
  g.font = '26px system-ui,sans-serif'; g.fillStyle = mu;
  g.fillText(`${fmt(Math.min(100, sc.eco / m.deficit_mds * 100))} % du déficit comblé · + ${fmt(sc.interets)} Md€ d'intérêts évités`, 60, 125);
  const rows = sc.rows.slice(0, 9), max = Math.max(1, ...rows.map(r => r.c.gain_mds));
  if (!rows.length) g.fillText('Aucune baisse choisie pour le moment.', 60, 210);
  rows.forEach((r, i) => {
    const y = 160 + i * 42;
    g.fillStyle = fg; g.font = '22px system-ui,sans-serif';
    g.fillText(r.p.nom.slice(0, 36), 60, y + 24);
    g.fillStyle = COL[r.c.faisabilite];
    g.fillRect(560, y + 6, Math.max(4, 470 * r.c.gain_mds / max), 24);
    g.fillStyle = fg; g.fillText('−' + fmt(r.c.gain_mds), 1050, y + 24);
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
  const txt = `Mon budget : −${document.getElementById('eco').textContent} Md€ de dépenses, mesures sourcées`;
  if (navigator.canShare && navigator.canShare({ files: [shareFile] }))
    return navigator.share({ text: `${txt} ${location.href}`, files: [shareFile] }).catch(() => {});
  const a = Object.assign(document.createElement('a'), { href: shareUrl, download: shareFile.name });
  a.click();
  await navigator.clipboard.writeText(`${txt} ${location.href}`).catch(() => {});
  document.getElementById('doshare').textContent = 'Image téléchargée + lien copié ✓';
};

fetch('data/postes.json').then(r => r.json()).then(d => {
  data = d;
  document.getElementById('total').textContent = fmt(d.meta.depenses_totales_mds) + ' Md€';
  document.getElementById('deficit').textContent = fmt(d.meta.deficit_mds) + ' Md€ (' + d.meta.annee_reference + ')';
  document.getElementById('statut').textContent = document.getElementById('statut2').textContent = '⚠ ' + d.meta.statut;
  readHash(); render(); update();
});
