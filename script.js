// ========= État global =========
let currentRemorque = '';
let currentNiveau = '';
let currentZone = '';
const defauts = []; // {id, prenom, rame, remorque, niveau, zone, commentaire, photos: [name], photoFiles: [File]}
let db = null;      // IndexedDB

// ========= IndexedDB - Stockage des images =========

async function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('InspectionTGV_DB', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('photos')) {
        db.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function sauvegarderPhoto(file, defautId) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['photos'], 'readwrite');
    const store = transaction.objectStore('photos');

    const photoData = {
      defautId: defautId,
      name: file.name,
      type: file.type,
      file: file
    };

    const request = store.add(photoData);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function recupererPhotos(defautId) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['photos'], 'readonly');
    const store = transaction.objectStore('photos');
    const request = store.getAll();

    request.onsuccess = () => {
      const allPhotos = request.result;
      const defautPhotos = allPhotos.filter(p => p.defautId === defautId);
      resolve(defautPhotos);
    };
    request.onerror = () => reject(request.error);
  });
}

async function supprimerPhotos(defautId) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['photos'], 'readwrite');
    const store = transaction.objectStore('photos');
    const request = store.getAll();

    request.onsuccess = () => {
      const allPhotos = request.result;
      const photosASupprimer = allPhotos.filter(p => p.defautId === defautId);
      photosASupprimer.forEach(photo => {
        store.delete(photo.id);
      });
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

// ========= LocalStorage - Défauts + prénom/rame =========

async function chargerDefautsDepuisStorage() {
  const saved = localStorage.getItem('defautsTGV');
  if (!saved) return;

  try {
    const data = JSON.parse(saved);
    for (const d of data) {
      const photos = await recupererPhotos(d.id);
      const photoFiles = photos.map(p => p.file);

      const defautComplet = {
        ...d,
        photoFiles
      };

      defauts.push(defautComplet);
      ajouterLigneTableau({
        ...d,
        photos: photos.map(p => p.name)
      });
    }
    if (defauts.length > 0) {
      document.getElementById('historique').classList.remove('hidden');
    }
  } catch (e) {
    console.error('Erreur lors du chargement des défauts :', e);
  }
}

function sauvegarderDefautsStorage() {
  const dataToSave = defauts.map(d => ({
    id: d.id,
    prenom: d.prenom,
    rame: d.rame,
    remorque: d.remorque,
    niveau: d.niveau,
    zone: d.zone,
    commentaire: d.commentaire,
    photos: d.photos
  }));
  localStorage.setItem('defautsTGV', JSON.stringify(dataToSave));
}

function ajouterLigneTableau(defaut) {
  const tbody = document.querySelector('#defautTable tbody');
  const tr = document.createElement('tr');
  tr.setAttribute('data-defaut-id', defaut.id);

  tr.innerHTML = `
    <td>${escapeHtml(defaut.prenom)}</td>
    <td>${escapeHtml(defaut.rame)}</td>
    <td>${escapeHtml(defaut.remorque)}</td>
    <td>${escapeHtml(defaut.niveau)}</td>
    <td>${escapeHtml(defaut.zone)}</td>
    <td class="comment-text">${escapeHtml(defaut.commentaire)}</td>
    <td>${defaut.photos && defaut.photos.length ? defaut.photos.map(p=>escapeHtml(p)).join(', ') : '-'}</td>
    <td>
      <button class="edit-btn" title="Modifier">✏️</button>
      <button class="delete-btn" title="Supprimer">🗑️</button>
    </td>
  `;

  tr.querySelector('.delete-btn').addEventListener('click', async () => {
    const index = Array.from(tbody.children).indexOf(tr);
    const defautId = defauts[index].id;

    tr.remove();
    await supprimerPhotos(defautId);
    defauts.splice(index, 1);
    sauvegarderDefautsStorage();

    if (!defauts.length) {
      document.getElementById('historique').classList.add('hidden');
    }
  });

  tr.querySelector('.edit-btn').addEventListener('click', () => {
    const cell = tr.querySelector('.comment-text');
    const index = Array.from(tbody.children).indexOf(tr);
    const newText = prompt("Modifier le commentaire :", cell.textContent);
    if (newText !== null && newText.trim() !== "") {
      cell.textContent = newText.trim();
      defauts[index].commentaire = newText.trim();
      sauvegarderDefautsStorage();
    }
  });

  tbody.appendChild(tr);
}

async function effacerToutesLesDonnees() {
  if (!confirm('Voulez-vous vraiment effacer tous les commentaires, photos, prénom et rame ?')) return;

  // Défauts
  localStorage.removeItem('defautsTGV');
  defauts.length = 0;
  document.querySelector('#defautTable tbody').innerHTML = '';
  document.getElementById('historique').classList.add('hidden');

  // Photos
  if (db) {
    const transaction = db.transaction(['photos'], 'readwrite');
    const store = transaction.objectStore('photos');
    store.clear();
  }

  // Prénom + rame
  localStorage.removeItem('tgv_prenom');
  localStorage.removeItem('tgv_rame');
  document.getElementById('prenom').value = '';
  document.getElementById('rame').value = '';
}

// ========= Initialisation =========

document.addEventListener('DOMContentLoaded', async () => {
  // IndexedDB
  db = await initIndexedDB();

  // Charger les défauts
  await chargerDefautsDepuisStorage();

  // Restaurer prénom et rame
  const savedPrenom = localStorage.getItem('tgv_prenom') || '';
  const savedRame   = localStorage.getItem('tgv_rame')   || '';
  document.getElementById('prenom').value = savedPrenom;
  document.getElementById('rame').value   = savedRame;

  // Sauvegarde auto prénom / rame
  document.getElementById('prenom').addEventListener('input', (e) => {
    localStorage.setItem('tgv_prenom', e.target.value);
  });
  document.getElementById('rame').addEventListener('input', (e) => {
    localStorage.setItem('tgv_rame', e.target.value);
  });

  // Image map responsive
  if (typeof imageMapResize === 'function') {
    imageMapResize();
  }

  setupSchemaOverlay();

  window.addEventListener('resize', debounce(() => {
    setupSchemaOverlay();
    if (!document.getElementById('planSalle').classList.contains('hidden')) {
      setupPlanOverlay();
    }
  }, 120));
});

// ========= Sélection schéma / remorque / niveau =========

function selectRemorque(remorque) {
  currentRemorque = remorque;

  // Si c'est une motrice (M1 ou M2)
  if (remorque.startsWith('M')) {
    alert(`Zone technique : ${remorque}`);
    ouvrirCommentaireMotrice(remorque);
    return;
  }
  
  // Pour les remorques normales
  document.getElementById('niveauSelection').classList.remove('hidden');
}


function ouvrirCommentaireMotrice(motrice) {
  currentRemorque = motrice;
  currentNiveau = 'motrice'; // Niveau spécial pour les motrices
  
  // Modifier le titre de la modale
  document.getElementById('zoneTitre').textContent = `${motrice} - Sélectionnez une zone`;
  
  // Créer/afficher le sélecteur de zone motrice
  let selectZone = document.getElementById('zoneMotriceSelect');
  if (!selectZone) {
    selectZone = document.createElement('select');
    selectZone.id = 'zoneMotriceSelect';
    selectZone.style.cssText = 'width: 100%; padding: 10px; margin-bottom: 15px; font-size: 16px; border: 2px solid #ddd; border-radius: 5px;';
    selectZone.innerHTML = `
      <option value="">-- Choisir une zone --</option>
      <option value="Extérieur">Extérieur</option>
      <option value="Local technique">Local technique</option>
      <option value="Cabine de conduite">Cabine de conduite</option>
    `;
    
    // Insérer le select avant le commentaire
    const form = document.querySelector('#commentaireModal .commentaire-form');
    form.insertBefore(selectZone, form.firstChild);
  }
  
  // Réinitialiser la sélection
  selectZone.value = '';
  selectZone.onchange = function() {
    currentZone = this.value;
    if (currentZone) {
      document.getElementById('zoneTitre').textContent = `${motrice} - ${currentZone}`;
    }
  };
  
  // Afficher la modale
  document.getElementById('commentaireModal').classList.remove('hidden');
}


function selectNiveau(niveau) {
  currentNiveau = niveau;

  if (niveau === 'exterieur') {
    ouvrirCommentaire('Extérieur');
    return;
  }

  if (currentRemorque === 'R4') {
    if (niveau === 'haut') {
      ouvrirCommentaireAvecListe('R4', 'haut');
    } else if (niveau === 'bas') {
      alert('Salle basse non applicable pour R4.');
    }
    return;
  }

  if (niveau === 'haut' || niveau === 'bas') {
    chargerPlan(currentRemorque, niveau);
  }
}


// ========= Chargement plan + overlay =========

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

// ========= Commentaires =========

function ouvrirCommentaire(zone) {
  currentZone = zone;
  
  // Si c'est depuis un plan (R1-R3, R5-R8), ouvrir avec liste déroulante
  if (currentRemorque && currentNiveau && !currentRemorque.startsWith('M')) {
    ouvrirCommentaireAvecListe(currentRemorque, currentNiveau, zone);
  } else {
    // Sinon ouverture simple (extérieur)
    document.getElementById('zoneTitre').textContent = `${currentRemorque} - ${currentNiveau} - ${zone}`;
    document.getElementById('commentaireModal').classList.remove('hidden');
  }
}


function fermerCommentaire() {
  document.getElementById('photo').value = '';
  document.getElementById('commentaire').value = '';
  
  // Supprimer le select de zone motrice s'il existe
  const selectZone = document.getElementById('zoneMotriceSelect');
  if (selectZone) {
    selectZone.remove();
  }
  
  document.getElementById('commentaireModal').classList.add('hidden');
}


async function enregistrerDefaut() {
  const prenom = document.getElementById('prenom').value || '';
  const rame = document.getElementById('rame').value || '';
  const commentaire = document.getElementById('commentaire').value || '';
  const fileInput = document.getElementById('photo');
  const photoFiles = Array.from(fileInput.files || []);
  const photos = photoFiles.map(f => f.name);

  // Vérification pour les motrices
  if (currentRemorque.startsWith('M') && !currentZone) {
    alert('Veuillez sélectionner une zone de la motrice');
    return;
  }

  const defautId = Date.now() + Math.random();

  const nouveauDefaut = {
    id: defautId,
    prenom,
    rame,
    remorque: currentRemorque,
    niveau: currentNiveau,
    zone: currentZone,
    commentaire,
    photos,
    photoFiles
  };

  for (const file of photoFiles) {
    await sauvegarderPhoto(file, defautId);
  }

  defauts.push(nouveauDefaut);
  ajouterLigneTableau(nouveauDefaut);
  sauvegarderDefautsStorage();

  fermerCommentaire();
  document.getElementById('historique').classList.remove('hidden');
}

function ouvrirCommentaireAvecListe(remorque, niveau, zonePreSelectionnee = '') {
  currentRemorque = remorque;
  currentNiveau = niveau;
  
  let options = [];
  let noteInfo = '';
  
  // Définir les options selon la remorque et le niveau
  if (remorque === 'R4' && niveau === 'haut') {
    options = [
      'Espace bar',
      'Office ASCT',
      'Rangée droite',
      'Face droite',
      'Rangée gauche',
      'Face gauche'
    ];
    noteInfo = '💡 Note : Gauche et droite dans le sens d\'entrée dans la salle';
  } else if (niveau === 'bas') {
    options = [
      'Rangée gauche',
      'Face gauche',
      'Rangée droite',
      'Face droite',
      'Plateforme basse',
      'WC',
      'Espace bagages'
    ];
    noteInfo = '💡 Note : Gauche et droite dans le sens d\'entrée dans la salle basse';
  } else if (niveau === 'haut') {
    options = [
      'Rangée gauche',
      'Face gauche',
      'Rangée droite',
      'Face droite',
      'Plateforme haute',
      'WC',
      'Espace bagages'
    ];
    noteInfo = '💡 Note : Gauche et droite dans le sens d\'entrée dans la salle haute';
  }
  
  // Modifier le titre
  document.getElementById('zoneTitre').textContent = `${remorque} - ${niveau.charAt(0).toUpperCase() + niveau.slice(1)} - Sélectionnez une zone`;
  
  // Créer/afficher la note d'information
  let noteDiv = document.getElementById('noteInfoZone');
  if (!noteDiv && noteInfo) {
    noteDiv = document.createElement('div');
    noteDiv.id = 'noteInfoZone';
    noteDiv.style.cssText = 'background: #e3f2fd; padding: 10px; margin-bottom: 15px; border-left: 4px solid #2196F3; border-radius: 4px; font-size: 14px; color: #1976d2;';
    noteDiv.textContent = noteInfo;
    
    const form = document.querySelector('#commentaireModal .commentaire-form');
    form.insertBefore(noteDiv, form.firstChild);
  } else if (noteDiv) {
    noteDiv.textContent = noteInfo;
  }
  
  // Créer/afficher le sélecteur de zone
  let selectZone = document.getElementById('zoneSelect');
  if (!selectZone) {
    selectZone = document.createElement('select');
    selectZone.id = 'zoneSelect';
    selectZone.style.cssText = 'width: 100%; padding: 10px; margin-bottom: 15px; font-size: 16px; border: 2px solid #ddd; border-radius: 5px;';
    
    const form = document.querySelector('#commentaireModal .commentaire-form');
    // Insérer après la note
    const noteElement = document.getElementById('noteInfoZone');
    if (noteElement) {
      noteElement.after(selectZone);
    } else {
      form.insertBefore(selectZone, form.firstChild);
    }
  }
  
  // Remplir les options
  selectZone.innerHTML = '<option value="">-- Choisir une zone --</option>';
  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt;
    option.textContent = opt;
    selectZone.appendChild(option);
  });
  
  // Pré-sélectionner si zone cliquée sur le plan
  if (zonePreSelectionnee) {
    // Essayer de trouver une correspondance (approximative si nécessaire)
    const optionTrouvee = options.find(opt => 
      opt.toLowerCase().includes(zonePreSelectionnee.toLowerCase()) ||
      zonePreSelectionnee.toLowerCase().includes(opt.toLowerCase())
    );
    if (optionTrouvee) {
      selectZone.value = optionTrouvee;
      currentZone = optionTrouvee;
      document.getElementById('zoneTitre').textContent = `${remorque} - ${niveau.charAt(0).toUpperCase() + niveau.slice(1)} - ${optionTrouvee}`;
    }
  }
  
  // Gérer le changement de sélection
  selectZone.onchange = function() {
    currentZone = this.value;
    if (currentZone) {
      document.getElementById('zoneTitre').textContent = `${remorque} - ${niveau.charAt(0).toUpperCase() + niveau.slice(1)} - ${currentZone}`;
    } else {
      document.getElementById('zoneTitre').textContent = `${remorque} - ${niveau.charAt(0).toUpperCase() + niveau.slice(1)} - Sélectionnez une zone`;
    }
  };
  
  // Afficher la modale
  document.getElementById('commentaireModal').classList.remove('hidden');
}

// ========= Export ZIP (XLSX + photos/) =========

async function exportXlsx() {
  if (!defauts.length) {
    alert('Aucune remarque à exporter.');
    return;
  }

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
  const date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const heure = `${String(now.getHours()).padStart(2,'0')}h${String(now.getMinutes()).padStart(2,'0')}`;

  const xlsxName = `Inspection_TGV_${date}_${heure}.xlsx`;
  const xlsxArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

  const zip = new JSZip();
  zip.file(xlsxName, xlsxArray);

  const photosFolder = zip.folder("photos");
  for (const d of defauts) {
    if (d.photoFiles && d.photoFiles.length) {
      for (const file of d.photoFiles) {
        const buf = await file.arrayBuffer();
        photosFolder.file(file.name, buf);
      }
    }
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  saveAs(zipBlob, `Inspection_TGV_${date}_${heure}.zip`);
}


// ========= Overlays (surbrillances) =========

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
  while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

  const dw = img.clientWidth;
  const dh = img.clientHeight;

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
    const coords = (a.getAttribute('coords') || '')
      .split(',')
      .map(v => Number(v.trim()))
      .filter(v => !isNaN(v));
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

// ========= Utilitaires =========

function debounce(fn, delay=150) {
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


// ========= Ouvrir la checklist =========
function ouvrirChecklist() {
  window.open('checklist.html', '_blank');
}

