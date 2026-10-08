const CRANS = ['Aucune', 'Légère', 'Moyenne', 'Maximale'];
const FAISA = { 1: 'Faisable', 2: 'Risqué', 3: 'Bloqué / très contestable' };
const fmt = n => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let data, state = {};

// URL hash = scénario partageable : #retraites=2&ue=1
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  for (const [k, v] of p) state[k] = Math.max(0, Math.min(3, +v || 0));
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
  const src = [poste.source_montant, ...poste.sources]
    .map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.titre)}</a></li>`).join('');
  return `<p><strong>${esc(c.mesure)}</strong><br>
    <span class="gain">−${fmt(c.gain_mds)} Md€</span>
    <span class="badge f${c.faisabilite}">${FAISA[c.faisabilite]}</span></p>
    ${list('Pourquoi c\'est faisable', c.arguments)}
    ${list('Obstacles juridiques / UE / politiques', c.obstacles)}
    <strong>Sources</strong><ul>${src}</ul>`;
}

function render() {
  const main = document.getElementById('postes');
  main.innerHTML = data.postes.map(p => `
    <section class="card" id="${p.id}">
      <div class="head"><h2>${esc(p.nom)}</h2><span class="muted">${esc(p.bloc)} · ${fmt(p.montant_mds)} Md€</span></div>
      <input type="range" min="0" max="3" step="1" value="${state[p.id] || 0}" data-id="${p.id}" aria-label="Niveau de baisse ${esc(p.nom)}">
      <div class="ticks">${CRANS.map(c => `<span>${c}</span>`).join('')}</div>
      <div class="detail">${detail(p, state[p.id] || 0)}</div>
    </section>`).join('');
  main.addEventListener('input', e => {
    const id = e.target.dataset.id; if (!id) return;
    state[id] = +e.target.value;
    const p = data.postes.find(x => x.id === id);
    e.target.closest('.card').querySelector('.detail').innerHTML = detail(p, state[id]);
    update();
  });
}

function update() {
  const chosen = data.postes.filter(p => state[p.id]).map(p => p.crans[state[p.id] - 1]);
  const eco = chosen.reduce((s, c) => s + c.gain_mds, 0);
  document.getElementById('eco').textContent = fmt(eco);
  const pct = Math.min(100, eco / data.meta.deficit_mds * 100);
  document.getElementById('fill').style.width = pct + '%';
  document.getElementById('pct').textContent = `${fmt(pct)} % du déficit comblé`;
  document.getElementById('risk').textContent = riskSummary(chosen);
  writeHash();
}

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
  const g = c.getContext('2d');
  g.fillStyle = '#fafaf7'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#1a1a1a'; g.font = 'bold 44px system-ui,sans-serif';
  g.fillText('Mon budget : −' + document.getElementById('eco').textContent + ' Md€', 60, 100);
  g.font = '28px system-ui,sans-serif'; g.fillStyle = '#666';
  g.fillText(document.getElementById('pct').textContent + ' · ' + document.getElementById('risk').textContent, 60, 150);
  const rows = data.postes.filter(p => state[p.id])
    .map(p => ({ p, c: p.crans[state[p.id] - 1] })).sort((a, b) => b.c.gain_mds - a.c.gain_mds).slice(0, 8);
  const max = Math.max(1, ...rows.map(r => r.c.gain_mds));
  const col = { 1: '#1b8a4a', 2: '#d08a00', 3: '#c0392b' };
  rows.forEach((r, i) => {
    const y = 200 + i * 48;
    g.fillStyle = '#1a1a1a'; g.font = '24px system-ui,sans-serif';
    g.fillText(r.p.nom.slice(0, 34), 60, y + 26);
    g.fillStyle = col[r.c.faisabilite];
    g.fillRect(560, y + 6, Math.max(4, 480 * r.c.gain_mds / max), 26);
    g.fillStyle = '#1a1a1a'; g.fillText('−' + fmt(r.c.gain_mds), 1060, y + 26);
  });
  g.fillStyle = '#1f4fd1'; g.font = 'bold 26px system-ui,sans-serif';
  g.fillText('Faites le vôtre, chaque mesure est sourcée → ' + location.host, 60, H - 40);
  return new Promise(r => c.toBlob(r, 'image/png'));
}

document.getElementById('share').onclick = async () => {
  const btn = document.getElementById('share');
  const txt = `Mon budget : −${document.getElementById('eco').textContent} Md€ de dépenses, mesures sourcées`;
  const file = new File([await scenarioImage()], 'mon-budget.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] }))
    return navigator.share({ text: `${txt} ${location.href}`, files: [file] }).catch(() => {});
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: file.name });
  a.click();
  await navigator.clipboard.writeText(`${txt} ${location.href}`).catch(() => {});
  btn.textContent = 'Image téléchargée + lien copié ✓';
};

fetch('data/postes.json').then(r => r.json()).then(d => {
  data = d;
  document.getElementById('total').textContent = fmt(d.meta.depenses_totales_mds) + ' Md€';
  document.getElementById('deficit').textContent = fmt(d.meta.deficit_mds) + ' Md€ (' + d.meta.annee_reference + ')';
  document.getElementById('statut').textContent = '⚠ ' + d.meta.statut;
  readHash(); render(); update();
});
