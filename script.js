// Etat global
let currentRemorque = '';
let currentNiveau = '';
let currentZone = '';
const defauts = []; // {prenom, rame, remorque, niveau, zone, commentaire, photos: [name], photoFiles: [File]}

// Init
document.addEventListener('DOMContentLoaded', () => {
  // Rendre les <area> responsives
  if (typeof imageMapResize === 'function') {
    imageMapResize();
  }
  // Construire l'overlay du schéma TGV
  setupSchemaOverlay();

  // Rebuild overlays au resize
  window.addEventListener('resize', debounce(() => {
    setupSchemaOverlay();
    if (!document.getElementById('planSalle').classList.contains('hidden')) {
      setupPlanOverlay();
    }
  }, 120));
});

/* ========= Sélection schéma / remorque / niveau ========= */

function selectRemorque(remorque) {
  currentRemorque = remorque;

  if (remorque.startsWith('M')) {
    // Motrice : pas de salle haute/basse, on ouvre directement le commentaire
    currentNiveau = '';
    document.getElementById('niveauSelection').classList.add('hidden');
    document.getElementById('planSalle').classList.add('hidden');
    ouvrirCommentaire('Motrice');
    return;
  }
  document.getElementById('niveauSelection').classList.remove('hidden');
}

function selectNiveau(niveau) {
  currentNiveau = niveau;

  // Extérieur: bulle directe toutes remorques
  if (niveau === 'exterieur') {
    ouvrirCommentaire('Extérieur');
    return;
  }

  // R4 spécifique: "haut" = R4.jpg, "bas" non applicable
  if (currentRemorque === 'R4') {
    if (niveau === 'haut') {
      chargerPlan('R4', 'haut');
    } else if (niveau === 'bas') {
      alert('Salle basse non applicable pour R4.');
    }
    return;
  }

  // R1,R2,R3,R5,R6,R7,R8
  if (niveau === 'haut' || niveau === 'bas') {
    chargerPlan(currentRemorque, niveau);
  }
}

/* ========= Chargement plan + overlay ========= */

function chargerPlan(remorque, niveau) {
  const img = document.getElementById('planImage');
  const titre = document.getElementById('titrePlan');
  const planSalle = document.getElementById('planSalle');

  let src = '';
  let mapId = '';

  if (remorque === 'R4' && niveau === 'haut') {
    src = `plans/R4.jpg`;
    mapId = 'map-R4-haut';
    titre.textContent = 'R4 - Salle (consommation)';
  } else {
    src = `plans/${remorque}_${niveau}.jpg`;
    mapId = `map-${remorque}-${niveau}`;
    titre.textContent = `${remorque} - Salle ${niveau}`;
  }

  img.src = src;
  img.useMap = `#${mapId}`;
  planSalle.classList.remove('hidden');

  img.onload = () => {
    setupPlanOverlay();
    if (typeof imageMapResize === 'function') {
      imageMapResize();
    }
  };
}

/* ========= Commentaires ========= */

function ouvrirCommentaire(zone) {
  currentZone = zone;
  document.getElementById('zoneTitre').textContent = [currentRemorque, currentNiveau, zone].filter(Boolean).join(' - ');
  document.getElementById('commentaireModal').classList.remove('hidden');
}

function fermerCommentaire() {
  document.getElementById('photo').value = '';
  document.getElementById('commentaireModal').classList.add('hidden');
}

/* ========= Nommage des photos =========
   Format : Prénom - R1 - salle haute - 20-10-2026 14h32m05.jpg
   (les motrices M1/M2 n'ont pas de salle : Prénom - M1 - date.jpg)
*/

const nomsPhotosUtilises = new Set();

function nettoyerNom(txt) {
  // Retire les caractères interdits dans un nom de fichier
  return String(txt).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
}

function libelleSalle(niveau) {
  if (niveau === 'haut') return 'salle haute';
  if (niveau === 'bas') return 'salle basse';
  if (niveau === 'exterieur') return 'exterieur';
  return '';
}

function formatDateHeure(d) {
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}h${p(d.getMinutes())}m${p(d.getSeconds())}`;
}

function extensionFichier(file) {
  const m = /\.([a-z0-9]+)$/i.exec(file.name || '');
  let ext = m ? m[1].toLowerCase() : '';
  if (!ext) {
    ext = ((file.type || '').split('/')[1] || 'jpg').toLowerCase();
  }
  return ext === 'jpeg' ? 'jpg' : ext;
}

function construireNomPhoto(file, prenom, remorque, niveau) {
  // Date : celle de la photo si dispo, sinon maintenant
  const quand = file.lastModified ? new Date(file.lastModified) : new Date();
  const parties = [
    nettoyerNom(prenom) || 'Sans-prenom',
    remorque,
    libelleSalle(niveau),
    formatDateHeure(quand)
  ].filter(Boolean);
  const base = parties.join(' - ');
  const ext = extensionFichier(file);

  // Évite les doublons (plusieurs photos à la même seconde)
  let nom = `${base}.${ext}`;
  let i = 2;
  while (nomsPhotosUtilises.has(nom.toLowerCase())) {
    nom = `${base} (${i}).${ext}`;
    i++;
  }
  nomsPhotosUtilises.add(nom.toLowerCase());
  return nom;
}

function enregistrerDefaut() {
  const prenom = document.getElementById('prenom').value || '';
  const rame = document.getElementById('rame').value || '';
  const commentaire = document.getElementById('commentaire').value || '';
  const fileInput = document.getElementById('photo');

  // Renomme chaque photo selon le format voulu
  const photoFiles = Array.from(fileInput.files || []).map(f => {
    const nouveauNom = construireNomPhoto(f, prenom, currentRemorque, currentNiveau);
    return new File([f], nouveauNom, { type: f.type, lastModified: f.lastModified });
  });
  const photos = photoFiles.map(f => f.name);

  const defaut = {
    prenom, rame,
    remorque: currentRemorque,
    niveau: currentNiveau,
    zone: currentZone,
    commentaire,
    photos,
    photoFiles
  };
  defauts.push(defaut);

  // Ajout au tableau
  const tbody = document.querySelector('#defautTable tbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${escapeHtml(prenom)}</td>
    <td>${escapeHtml(rame)}</td>
    <td>${escapeHtml(currentRemorque)}</td>
    <td>${escapeHtml(currentNiveau)}</td>
    <td>${escapeHtml(currentZone)}</td>
    <td class="comment-text">${escapeHtml(commentaire)}</td>
    <td>${photos.length ? photos.map(p => escapeHtml(p)).join('<br>') : '-'}</td>
    <td>
      <button class="edit-btn" title="Modifier">✏️</button>
      <button class="delete-btn" title="Supprimer">🗑️</button>
    </td>
  `;

  tr.querySelector('.delete-btn').addEventListener('click', () => {
    tr.remove();
    // Retire aussi du tableau pour que l'export ne contienne plus ce défaut
    const idx = defauts.indexOf(defaut);
    if (idx !== -1) defauts.splice(idx, 1);
    photos.forEach(n => nomsPhotosUtilises.delete(n.toLowerCase()));
  });

  tr.querySelector('.edit-btn').addEventListener('click', () => {
    const cell = tr.querySelector('.comment-text');
    const newText = prompt("Modifier le commentaire :", cell.textContent);
    if (newText !== null && newText.trim() !== "") {
      cell.textContent = newText.trim();
      defaut.commentaire = newText.trim();
    }
  });

  tbody.appendChild(tr);

  document.getElementById('commentaire').value = '';
  fermerCommentaire();
  document.getElementById('historique').classList.remove('hidden');
}

/* ========= Export ZIP (XLSX + photos/) ========= */

async function exportXlsx() {
  if (!defauts.length) {
    alert('Aucune remarque à exporter.');
    return;
  }

  // 1) Générer XLSX
  const data = [
    ['Prénom','Rame','Remorque','Niveau','Zone','Commentaire','Photos']
  ];
  defauts.forEach(d => {
    data.push([
      d.prenom,
      d.rame,
      d.remorque,
      d.niveau,
      d.zone,
      d.commentaire,
      (d.photos || []).join(', ')
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Remarques');

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const xlsxName = `Inspection_TGV_${dateStr}.xlsx`;
  const xlsxArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

  // 2) Créer le ZIP
  const zip = new JSZip();
  zip.file(xlsxName, xlsxArray);

  // 3) Ajouter photos/
  const photosFolder = zip.folder("photos");
  for (const d of defauts) {
    if (d.photoFiles && d.photoFiles.length) {
      for (const file of d.photoFiles) {
        const buf = await file.arrayBuffer();
        photosFolder.file(file.name, buf);
      }
    }
  }

  // 4) Télécharger le ZIP
  const zipBlob = await zip.generateAsync({ type: "blob" });
  saveAs(zipBlob, `Inspection_TGV_${dateStr}.zip`);
}

/* ========= Overlays (surbrillances) =========
   Génère des formes SVG par-dessus les images, à partir des <area> de la map
*/

function setupSchemaOverlay() {
  const img = document.getElementById('trainImage');
  const map = document.getElementById('train-map');
  const svg = document.getElementById('schemaOverlay');
  if (!img || !map || !svg) return;
  buildOverlayFromMap(img, map, svg);
}

function setupPlanOverlay() {
  const img = document.getElementById('planImage');
  const useMap = (img.useMap || '').replace('#','');
  const map = document.getElementById(useMap);
  const svg = document.getElementById('planOverlay');
  if (!img || !map || !svg) return;
  buildOverlayFromMap(img, map, svg);
}

function buildOverlayFromMap(img, mapEl, svgEl) {
  // Clear
  while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

  // Dimensions affichées
  const dw = img.clientWidth;
  const dh = img.clientHeight;

  // Taille originale
  const nw = img.naturalWidth || dw;
  const nh = img.naturalHeight || dh;

  const sx = dw / nw;
  const sy = dh / nh;

  svgEl.setAttribute('viewBox', `0 0 ${dw} ${dh}`);
  svgEl.setAttribute('width', dw);
  svgEl.setAttribute('height', dh);

  const areas = Array.from(mapEl.querySelectorAll('area'));
  areas.forEach(a => {
    const shape = (a.getAttribute('shape') || 'rect').toLowerCase();
    const coords = (a.getAttribute('coords') || '').split(',').map(v => Number(v.trim())).filter(v => !isNaN(v));
    if (!coords.length) return;

    if (shape === 'rect' || shape === '0' || shape === 'rectangle') {
      let [x1,y1,x2,y2] = coords;
      const minX = Math.min(x1,x2) * sx;
      const minY = Math.min(y1,y2) * sy;
      const w = Math.abs(x2 - x1) * sx;
      const h = Math.abs(y2 - y1) * sy;
      const r = document.createElementNS('http://www.w3.org/2000/svg','rect');
      r.setAttribute('x', minX);
      r.setAttribute('y', minY);
      r.setAttribute('width', w);
      r.setAttribute('height', h);
      r.setAttribute('class','hl');
      svgEl.appendChild(r);
    } else if (shape === 'poly' || shape === 'polygon') {
      const pts = [];
      for (let i=0;i<coords.length;i+=2) {
        pts.push(`${coords[i]*sx},${coords[i+1]*sy}`);
      }
      const p = document.createElementNS('http://www.w3.org/2000/svg','polygon');
      p.setAttribute('points', pts.join(' '));
      p.setAttribute('class','hl');
      svgEl.appendChild(p);
    } else if (shape === 'circle') {
      const [cx,cy,r0] = coords;
      const c = document.createElementNS('http://www.w3.org/2000/svg','circle');
      c.setAttribute('cx', cx*sx);
      c.setAttribute('cy', cy*sy);
      c.setAttribute('r', r0*((sx+sy)/2));
      c.setAttribute('class','hl');
      svgEl.appendChild(c);
    }
  });
}

/* ========= Utilitaires ========= */

function debounce(fn, delay=150){
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), delay);
  };
}

function escapeHtml(str){
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

document.querySelectorAll('.delete-btn').forEach(btn => {
  btn.addEventListener('click', function () {
    const comment = this.closest('.commentaire');
    // Supprimer le commentaire du DOM
    comment.remove();
    // Optionnel : supprimer côté serveur si nécessaire
  });
});

document.querySelectorAll('.edit-btn').forEach(btn => {
  btn.addEventListener('click', function () {
    const commentText = this.closest('.commentaire').querySelector('.comment-text');
    const newText = prompt("Modifier le commentaire :", commentText.textContent);
    if (newText !== null) {
      commentText.textContent = newText;
      // Optionnel : mettre à jour côté serveur
    }
  });
});