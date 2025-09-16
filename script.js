let currentRemorque = '';
let currentNiveau = '';
let currentZone = '';
let defauts = [];

function selectRemorque(remorque) {
  currentRemorque = remorque;
  document.getElementById('niveauSelection').classList.remove('hidden');
}

function selectNiveau(niveau) {
  currentNiveau = niveau;

  if (niveau === 'haut') {
    document.getElementById('planSalle').classList.remove('hidden');
    document.getElementById('titrePlan').textContent = `${currentRemorque} - Salle haute`;
  } else {
    alert(`Affichage du plan pour ${currentRemorque} - ${niveau}`);
  }
}

function ouvrirCommentaire(zone) {
  currentZone = zone;
  document.getElementById('zoneTitre').textContent = `Défaut - ${zone}`;
  document.getElementById('commentaireModal').classList.remove('hidden');
}

function enregistrerDefaut() {
  const prenom = document.getElementById('prenom').value;
  const rame = document.getElementById('rame').value;
  const commentaire = document.getElementById('commentaire').value;

  defauts.push({ prenom, rame, remorque: currentRemorque, niveau: currentNiveau, zone: currentZone, commentaire });

  const row = document.createElement('tr');
  row.innerHTML = `<td>${prenom}</td><td>${rame}</td><td>${currentRemorque}</td><td>${currentNiveau}</td><td>${currentZone}</td><td>${commentaire}</td>`;
  document.querySelector('#defautTable tbody').appendChild(row);

  document.getElementById('commentaireModal').classList.add('hidden');
  document.getElementById('historique').classList.remove('hidden');
}