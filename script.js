// Etat global
let currentRemorque = '';
let currentNiveau = '';
let currentZone = '';
const defauts = []; // {prenom, rame, remorque, niveau, zone, commentaire, photos: [name], photoFiles: [File]}

// Init
document.addEventListener('DOMContentLoaded', () => {
  // Construire l'overlay du schéma TGV (et adapter ses zones cliquables à la taille affichée)
  setupSchemaOverlay();
  const schema = document.getElementById('trainImage');
  if (schema) schema.addEventListener('load', setupSchemaOverlay);

  // Rebuild overlays au resize
  window.addEventListener('resize', debounce(() => {
    setupSchemaOverlay();
    if (!document.getElementById('planSalle').classList.contains('hidden')) {
      setupPlanOverlay();
    }
  }, 120));
});

// Sauvegarde automatique : écouteur séparé pour que la restauration ne dépende
// de rien d'autre dans l'initialisation de la page
document.addEventListener('DOMContentLoaded', () => {
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
  restaurerSession();
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

  img.onload = setupPlanOverlay;
  // Si l'image est déjà chargée (même plan rouvert), on recalcule tout de suite
  if (img.complete && img.naturalWidth) setupPlanOverlay();
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

/* ========= Photos : compression =========
   Les photos de téléphone font 3 à 6 Mo. On les réduit à 3000 px max
   (plus grand côté) en JPEG qualité 88 % : assez pour zoomer sur un défaut,
   mais 4 à 6 fois plus léger. Si la compression ne fait pas gagner de place
   (ou échoue), la photo d'origine est conservée telle quelle.
*/

const PHOTO_MAX_COTE = 3000;
const PHOTO_QUALITE = 0.88;

async function chargerImage(file) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (e) { /* on tente la méthode classique */ }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
  });
}

async function compresserPhoto(file) {
  try {
    if (!file.type || !file.type.startsWith('image/')) return file;
    const img = await chargerImage(file);
    const w0 = img.naturalWidth || img.width;
    const h0 = img.naturalHeight || img.height;
    const ratio = Math.min(1, PHOTO_MAX_COTE / Math.max(w0, h0));
    const w = Math.round(w0 * ratio);
    const h = Math.round(h0 * ratio);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // fond blanc (au cas où PNG transparent)
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    if (img.close) img.close();

    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', PHOTO_QUALITE));
    canvas.width = canvas.height = 0; // libère la mémoire (important sur iPhone)

    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch (e) {
    console.warn('Compression impossible, photo conservée telle quelle', e);
    return file;
  }
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
  const parType = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' };
  if (parType[file.type]) return parType[file.type];
  const m = /\.([a-z0-9]+)$/i.exec(file.name || '');
  if (m) {
    const ext = m[1].toLowerCase();
    return ext === 'jpeg' ? 'jpg' : ext;
  }
  return 'jpg';
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

/* ========= Sauvegarde automatique (IndexedDB) =========
   Chaque défaut (avec ses photos) est gardé dans le navigateur : si Safari ou
   Chrome recharge la page, tout est restauré. Les erreurs de stockage ne
   bloquent jamais l'appli (elle fonctionne alors comme avant, en mémoire).
*/

const DB_NOM = 'inspection-tgv';
const DB_STORE = 'defauts';
let dbPromise = null;
let dernierId = 0;

function nouvelId() {
  dernierId = Math.max(Date.now(), dernierId + 1);
  return dernierId;
}

function ouvrirDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('IndexedDB indisponible'));
      const req = indexedDB.open(DB_NOM, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function dbOp(mode, fn) {
  try {
    const db = await ouvrirDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, mode);
      const req = fn(tx.objectStore(DB_STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('Sauvegarde automatique indisponible', e);
    return undefined;
  }
}

const sauvegarderDefaut = d => dbOp('readwrite', s => s.put(d));
const supprimerDefautDb = id => dbOp('readwrite', s => s.delete(id));
const viderDb = () => dbOp('readwrite', s => s.clear());
const chargerDefautsDb = () => dbOp('readonly', s => s.getAll());

function memoriserChamp(id) {
  const el = document.getElementById(id);
  if (!el) return;
  try {
    const v = localStorage.getItem('inspection-' + id);
    if (v) el.value = v;
  } catch (e) { /* ignore */ }
  el.addEventListener('input', () => {
    try { localStorage.setItem('inspection-' + id, el.value); } catch (e) { /* ignore */ }
  });
}

async function restaurerSession() {
  memoriserChamp('prenom');
  memoriserChamp('rame');

  const sauvegardes = (await chargerDefautsDb()) || [];
  sauvegardes.sort((x, y) => x.id - y.id);
  sauvegardes.forEach(d => {
    // Sécurité : s'assure que chaque photo est bien un File avec son nom
    d.photoFiles = (d.photoFiles || []).map((f, i) =>
      (f instanceof File) ? f : new File([f], d.photos[i], { type: f.type }));
    d.photos.forEach(n => nomsPhotosUtilises.add(n.toLowerCase()));
    dernierId = Math.max(dernierId, d.id);
    defauts.push(d);
    ajouterLigne(d);
  });
  if (defauts.length) {
    document.getElementById('historique').classList.remove('hidden');
  }
}

/* ========= Enregistrement d'un défaut ========= */

function ajouterLigne(defaut) {
  const tbody = document.querySelector('#defautTable tbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${escapeHtml(defaut.prenom)}</td>
    <td>${escapeHtml(defaut.rame)}</td>
    <td>${escapeHtml(defaut.remorque)}</td>
    <td>${escapeHtml(defaut.niveau)}</td>
    <td>${escapeHtml(defaut.zone)}</td>
    <td class="comment-text">${escapeHtml(defaut.commentaire)}</td>
    <td>${defaut.photos.length ? defaut.photos.map(p => escapeHtml(p)).join('<br>') : '-'}</td>
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
    defaut.photos.forEach(n => nomsPhotosUtilises.delete(n.toLowerCase()));
    supprimerDefautDb(defaut.id);
  });

  tr.querySelector('.edit-btn').addEventListener('click', () => {
    const cell = tr.querySelector('.comment-text');
    const newText = prompt("Modifier le commentaire :", cell.textContent);
    if (newText !== null && newText.trim() !== "") {
      cell.textContent = newText.trim();
      defaut.commentaire = newText.trim();
      sauvegarderDefaut(defaut);
    }
  });

  tbody.appendChild(tr);
}

let enregistrementEnCours = false;

async function enregistrerDefaut() {
  if (enregistrementEnCours) return;
  enregistrementEnCours = true;

  const btn = document.getElementById('btnEnregistrer');
  const texteBtn = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Enregistrement…'; }

  try {
    const prenom = document.getElementById('prenom').value || '';
    const rame = document.getElementById('rame').value || '';
    const commentaire = document.getElementById('commentaire').value || '';
    const remorque = currentRemorque;
    const niveau = currentNiveau;
    const zone = currentZone;
    const fichiers = Array.from(document.getElementById('photo').files || []);

    // Compresse puis renomme chaque photo (une par une pour ménager la mémoire)
    const photoFiles = [];
    for (const f of fichiers) {
      const reduit = await compresserPhoto(f);
      const nom = construireNomPhoto(reduit, prenom, remorque, niveau);
      photoFiles.push(new File([reduit], nom, { type: reduit.type, lastModified: f.lastModified }));
    }

    const defaut = {
      id: nouvelId(),
      prenom, rame, remorque, niveau, zone, commentaire,
      photos: photoFiles.map(f => f.name),
      photoFiles
    };
    defauts.push(defaut);
    ajouterLigne(defaut);
    await sauvegarderDefaut(defaut);

    document.getElementById('commentaire').value = '';
    fermerCommentaire();
    document.getElementById('historique').classList.remove('hidden');
  } finally {
    enregistrementEnCours = false;
    if (btn) { btn.disabled = false; btn.textContent = texteBtn; }
  }
}

/* ========= Export ZIP (XLSX + photos/) ========= */

let exportEnCours = false;

async function exportXlsx() {
  if (!defauts.length) {
    alert('Aucune remarque à exporter.');
    return;
  }
  if (exportEnCours) return;
  exportEnCours = true;

  const btn = document.getElementById('btnExport');
  const texteBtn = btn ? btn.textContent : '';
  if (btn) btn.disabled = true;
  const afficher = txt => { if (btn) btn.textContent = txt; };
  afficher('Export en cours…');

  let reussi = false;
  try {
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

    // 3) Ajouter photos/ (les JPEG sont déjà compressés : on les stocke tels quels)
    const photosFolder = zip.folder("photos");
    for (const d of defauts) {
      for (const file of (d.photoFiles || [])) {
        photosFolder.file(file.name, file);
      }
    }

    // 4) Générer et télécharger le ZIP
    const zipBlob = await zip.generateAsync(
      { type: "blob", compression: "STORE" },
      meta => afficher(`Export en cours… ${Math.round(meta.percent)} %`)
    );
    saveAs(zipBlob, `Inspection_TGV_${dateStr}.zip`);
    reussi = true;
  } catch (e) {
    console.error(e);
    alert("Erreur pendant l'export : " + (e && e.message ? e.message : e));
  } finally {
    exportEnCours = false;
    if (btn) { btn.disabled = false; btn.textContent = texteBtn; }
  }

  // 5) Proposer de repartir de zéro (la sauvegarde automatique serait sinon
  //    rechargée à la prochaine visite)
  if (reussi) {
    setTimeout(async () => {
      const ok = confirm(
        "Export terminé.\n\nLe ZIP est-il bien téléchargé ?\n" +
        "OK = effacer les défauts et repartir de zéro\n" +
        "Annuler = tout conserver"
      );
      if (ok) await viderInspection();
    }, 800);
  }
}

async function viderInspection() {
  defauts.length = 0;
  nomsPhotosUtilises.clear();
  document.querySelector('#defautTable tbody').innerHTML = '';
  document.getElementById('historique').classList.add('hidden');
  document.getElementById('rame').value = '';
  try { localStorage.removeItem('inspection-rame'); } catch (e) { /* ignore */ }
  await viderDb();
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

/* Les coordonnées écrites dans le HTML sont celles de l'image en taille réelle.
   On les mémorise (data-coords), puis on recalcule les coordonnées des <area>
   à la taille réellement affichée, pour que les zones cliquables collent à
   l'image sur téléphone, tablette et ordinateur. */
function coordsOrigine(area) {
  if (!area.dataset.coords) area.dataset.coords = area.getAttribute('coords') || '';
  return area.dataset.coords.split(',').map(v => Number(v.trim())).filter(v => !isNaN(v));
}

function appliquerEchelleZone(area, coords, shape, sx, sy) {
  const echelle = (shape === 'circle')
    ? coords.map((v, i) => v * (i === 2 ? (sx + sy) / 2 : (i % 2 === 0 ? sx : sy)))
    : coords.map((v, i) => v * (i % 2 === 0 ? sx : sy));
  area.setAttribute('coords', echelle.map(v => Math.round(v * 10) / 10).join(','));
}

function buildOverlayFromMap(img, mapEl, svgEl) {
  // Clear
  while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

  // Dimensions affichées
  const dw = img.clientWidth;
  const dh = img.clientHeight;
  if (!dw || !dh) return; // image masquée ou pas encore affichée

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
    const coords = coordsOrigine(a);
    if (!coords.length) return;
    appliquerEchelleZone(a, coords, shape, sx, sy);

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
