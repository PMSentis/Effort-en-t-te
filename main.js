// main.js
// Prototype : chargement IFC + vue 3D (IfcViewerAPI) + calcul sismique très simplifié.

import { IfcViewerAPI } from "web-ifc-viewer";

// Numéro de version de l'appli (à incrémenter à chaque itération)
const APP_VERSION = "V1.1.2";

// --- ÉTAT GLOBAL SIMPLIFIÉ -------------------------------------------------

const state = {
  ifcLoaded: false,
  selectedFile: null,
  viewer: null,
  ifcModelID: null,
  // Dans une version ultérieure, ces deux tableaux viendront directement de l’IFC :
  mursPorteurs: [], // { id, nom, longueur, niveau, directionPortance }
  niveaux: [], // { id, z, masseApprox }
};

// --- SÉLECTION DES ÉLÉMENTS DU DOM ----------------------------------------

const fileInput = document.getElementById("ifc-file-input");
const tagEtat = document.querySelector(".tag");
const viewerContainer = document.getElementById("viewer-container");
const viewerOverlay = document.getElementById("viewer-overlay");

const agInput = document.getElementById("ag");
const qInput = document.getElementById("q");
const gammaIInput = document.getElementById("gammaI");
const mTotInput = document.getElementById("mTot");
const nbNiveauxInput = document.getElementById("nbNiveaux");
const dirSeismeSelect = document.getElementById("dirSeisme");

const btnReset = document.getElementById("btn-reset");
const btnCalcul = document.getElementById("btn-calcul");
const resultsDiv = document.getElementById("results");
const btnLoadIfc = document.getElementById("btn-load-ifc");
const versionLabel = document.getElementById("app-version");

if (versionLabel) {
  versionLabel.textContent = APP_VERSION;
}
console.log("Efforts en tête de mur - version", APP_VERSION);

// --- INITIALISATION DE LA VUE 3D (IfcViewerAPI) -----------------------------

function initIfcViewer() {
  const viewer = new IfcViewerAPI({
    container: viewerContainer,
    backgroundColor: 0x020617,
  });

  viewer.axes.setAxes();
  viewer.grid.setGrid();

  state.viewer = viewer;
}

initIfcViewer();

// --- GESTION DU FICHIER IFC ------------------------------------------------

// Étape 1 : l’utilisateur choisit un fichier (mais on ne charge pas encore le modèle)
fileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0] || null;
  state.selectedFile = file;

  if (!file) {
    updateTagEtEtat("IFC non chargé", "ko");
    viewerOverlay.querySelector("span").textContent =
      "Sélectionne un fichier IFC puis clique sur « Charger le modèle ».";
    return;
  }

  updateTagEtEtat(`Fichier sélectionné : ${file.name}`, "loading");
  viewerOverlay.querySelector("span").textContent =
    "Fichier sélectionné. Clique sur « Charger le modèle » pour l’afficher.";
});

// Étape 2 : clic sur le bouton pour réellement charger et afficher le modèle
btnLoadIfc.addEventListener("click", async () => {
  const file = state.selectedFile;
  if (!file) {
    alert("Aucun fichier IFC sélectionné. Choisis un fichier avant de charger.");
    return;
  }

  updateTagEtEtat("Chargement IFC…", "loading");
  viewerOverlay.querySelector("span").textContent =
    "Chargement du fichier IFC…";

  try {
    if (!state.viewer) {
      initIfcViewer();
    }

    // Optionnel : configuration du chemin des fichiers WASM si nécessaire
    // (utile sur GitHub Pages / CDN)
    // state.viewer.IFC.setWasmPath("https://cdn.jsdelivr.net/npm/web-ifc@0.0.47/");

    // Nettoie un éventuel modèle précédent
    if (state.ifcModelID !== null) {
      await state.viewer.IFC.loader.ifcManager.close(state.ifcModelID);
      state.ifcModelID = null;
    }

    const url = URL.createObjectURL(file);
    const model = await state.viewer.IFC.loadIfcUrl(url);

    state.ifcLoaded = true;
    state.ifcModelID = model.modelID;

    // Pour l’instant, on laisse des données de murs fictives.
    // Étape suivante : remplacer ceci par l’extraction réelle des murs depuis l’IFC.
    state.niveaux = [
      { id: 1, z: 0.0, masseApprox: parseFloat(mTotInput.value || "200") },
    ];
    state.mursPorteurs = [
      {
        id: 1,
        nom: "Mur longitudinal 1",
        longueur: 8.0,
        niveau: 1,
        directionPortance: "x",
      },
      {
        id: 2,
        nom: "Mur longitudinal 2",
        longueur: 8.0,
        niveau: 1,
        directionPortance: "x",
      },
      {
        id: 3,
        nom: "Mur pignon",
        longueur: 6.0,
        niveau: 1,
        directionPortance: "y",
      },
    ];

    updateTagEtEtat(`IFC chargé : ${file.name}`, "ok");
    viewerOverlay.querySelector("span").textContent =
      "Modèle affiché. Étape suivante : extraction automatique des murs / charpente.";

    btnCalcul.disabled = false;
    renderResumeInitial();
  } catch (e) {
    console.error(e);
    alert(
      "Erreur lors du chargement de l’IFC. Vérifie l’URL (GitHub Pages / hébergement) et consulte la console du navigateur pour le détail."
    );
    updateTagEtEtat("Erreur de chargement IFC", "ko");
    viewerOverlay.querySelector("span").textContent =
      "Échec du chargement. Vérifie l’hébergement et le fichier IFC.";
  }
});

function updateTagEtEtat(texte, etat) {
  const dot = tagEtat.querySelector(".tag-dot");
  const spanTexte = tagEtat.childNodes[1];

  spanTexte.textContent = ` ${texte}`;

  if (etat === "ok") {
    dot.style.background =
      "radial-gradient(circle at 30% 20%, #22c55e, #16a34a)";
    dot.style.boxShadow = "0 0 10px rgba(34,197,94,0.9)";
  } else if (etat === "loading") {
    dot.style.background =
      "radial-gradient(circle at 30% 20%, #facc15, #eab308)";
    dot.style.boxShadow = "0 0 10px rgba(250,204,21,0.9)";
  } else {
    dot.style.background =
      "radial-gradient(circle at 30% 20%, #ef4444, #b91c1c)";
    dot.style.boxShadow = "0 0 10px rgba(239,68,68,0.9)";
  }
}

// --- CALCUL SISMlQUE SIMPLIFIÉ ---------------------------------------------
// Modèle : méthode statique équivalente TRÈS simplifiée.
// - F_base = (a_g * gamma_I / q) * m_totale
// - Répartition uniforme par niveau
// - Répartition par mur selon la longueur totale de murs dans la direction étudiée.

btnCalcul.addEventListener("click", () => {
  if (!state.ifcLoaded) return;

  const ag = parseFloat(agInput.value || "0");
  const q = parseFloat(qInput.value || "1");
  const gammaI = parseFloat(gammaIInput.value || "1");
  const mTot = parseFloat(mTotInput.value || "0");
  const nbNiveaux = Math.max(
    1,
    parseInt(nbNiveauxInput.value || `${state.niveaux.length}`, 10)
  );
  const dirSeisme = dirSeismeSelect.value; // "x" ou "y"

  if (!ag || !q || !mTot) {
    alert(
      "Merci de renseigner au minimum a_g, q et la masse totale pour lancer le calcul."
    );
    return;
  }

  // Effort de base global (en kN si m_tot en tonnes et a_g en m/s² approximée /g)
  const Fbase = (ag * gammaI * mTot) / q;

  // Répartition par niveau (ici uniforme)
  const FparNiveau = [];
  for (let i = 0; i < nbNiveaux; i++) {
    FparNiveau.push({
      niveau: i + 1,
      F: Fbase / nbNiveaux,
    });
  }

  // Répartition par mur dans la direction étudiée
  const mursDansDirection = state.mursPorteurs.filter(
    (m) => m.directionPortance === dirSeisme
  );

  const longueurTotale = mursDansDirection.reduce(
    (acc, m) => acc + (m.longueur || 0),
    0
  );

  const effortsParMur = mursDansDirection.map((m) => {
    const ratio = longueurTotale > 0 ? m.longueur / longueurTotale : 0;
    // On suppose que tous les niveaux ont des murs alignés pour simplifier :
    const Fmur = Fbase * ratio;
    return {
      ...m,
      F_tete: Fmur,
      ratio,
    };
  });

  renderResultats({
    ag,
    q,
    gammaI,
    mTot,
    nbNiveaux,
    dirSeisme,
    Fbase,
    FparNiveau,
    effortsParMur,
  });
});

function renderResumeInitial() {
  resultsDiv.innerHTML = `
    <h3>Modèle IFC chargé (donnée fictive pour l’instant)</h3>
    <p>Nombre de murs porteurs identifiés (placeholder) : <strong>${
      state.mursPorteurs.length
    }</strong></p>
    <p style="margin-top: 0.25rem; font-size: 0.72rem; color: #9ca3af;">
      Le calcul utilisera pour l’instant une répartition uniforme de la masse et
      des efforts. L’étape suivante consistera à remplacer ces données par
      l’extraction réelle depuis l’IFC (longueurs, niveaux, directions porteuses).
    </p>
  `;
}

function renderResultats(data) {
  const {
    ag,
    q,
    gammaI,
    mTot,
    nbNiveaux,
    dirSeisme,
    Fbase,
    FparNiveau,
    effortsParMur,
  } = data;

  const directionLabel =
    dirSeisme === "x" ? "X (longitudinale)" : "Y (transversale)";

  let tableNiveaux = "";
  if (FparNiveau.length) {
    tableNiveaux = `
      <table>
        <thead>
          <tr>
            <th>Niveau</th>
            <th>Effort sismique \(F\) [kN]</th>
          </tr>
        </thead>
        <tbody>
          ${FparNiveau
            .map(
              (niv) => `
            <tr>
              <td>${niv.niveau}</td>
              <td>${niv.F.toFixed(1)}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  let tableMurs = "";
  if (effortsParMur.length) {
    tableMurs = `
      <table style="margin-top: 0.7rem;">
        <thead>
          <tr>
            <th>Mur porteur</th>
            <th>Longueur [m]</th>
            <th>Part de rigidité approx.</th>
            <th>Effort en tête \(F_{tête}\) [kN]</th>
          </tr>
        </thead>
        <tbody>
          ${effortsParMur
            .map(
              (m) => `
            <tr>
              <td>${m.nom}</td>
              <td>${m.longueur.toFixed(2)}</td>
              <td>${(m.ratio * 100).toFixed(1)} %</td>
              <td>${m.F_tete.toFixed(1)}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;
  } else {
    tableMurs = `
      <p style="margin-top: 0.4rem; font-size: 0.72rem; color: #f97316;">
        Aucun mur porteur n’est encore défini dans la direction étudiée.
        Dès que l’IFC sera réellement parsé, cette liste sera remplie automatiquement
        (longueurs, niveaux, sens porteur).
      </p>
    `;
  }

  resultsDiv.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; margin-bottom:0.2rem;">
      <h3>Résumé du calcul sismique simplifié</h3>
      <span class="pill">Direction étudiée : ${directionLabel}</span>
    </div>

    <p>
      Effort sismique global à la base :
      <strong>F<sub>base</sub> = ${Fbase.toFixed(1)} kN</strong>
    </p>

    <p style="margin-top:0.25rem; font-size:0.75rem; color:#9ca3af;">
      Hypothèses : \(F_{base} = (a_g \\cdot \\gamma_I / q) \\cdot m_{totale}\),
      distribution uniforme sur <strong>${nbNiveaux}</strong> niveau(x).
      Modèle de répartition à affiner (spectre, formes modales, rigidités réelles
      par mur / portique, etc.).
    </p>

    <div style="margin-top:0.55rem;">
      <h3>Répartition par niveaux</h3>
      ${tableNiveaux}
    </div>

    <div style="margin-top:0.75rem;">
      <h3>Efforts en tête de mur (approximation)</h3>
      ${tableMurs}
    </div>
  `;
}

// --- RÉINITIALISATION ------------------------------------------------------

btnReset.addEventListener("click", () => {
  agInput.value = "3.0";
  qInput.value = "3.0";
  gammaIInput.value = "1.0";
  mTotInput.value = "200";
  nbNiveauxInput.value = "1";
  dirSeismeSelect.value = "x";

  state.ifcLoaded = false;
  state.mursPorteurs = [];
  state.niveaux = [];
  btnCalcul.disabled = true;

  fileInput.value = "";
  updateTagEtEtat("IFC non chargé", "ko");
  viewerOverlay.querySelector("span").textContent =
    "Sélectionne un fichier IFC pour initialiser la vue 3D et les calculs.";
  renderResultatsInitial();
});

function renderResultatsInitial() {
  resultsDiv.innerHTML = `
    <h3>En attente de modèle IFC…</h3>
    <p>
      Une fois l’IFC chargé, cette zone affichera :
    </p>
    <ul style="margin: 0.35rem 0 0.1rem; padding-left: 1.1rem; font-size: 0.72rem; color: #9ca3af;">
      <li>l’effort sismique global \(F_{base}\)</li>
      <li>la répartition simplifiée par niveau</li>
      <li>un tableau d’efforts en tête de mur (par mur porteur identifié)</li>
    </ul>
    <p style="margin-top: 0.35rem; font-size: 0.7rem; color: #6b7280;">
      Pour l’instant, la répartition se fait avec un modèle très simplifié
      (masse globale + répartition uniforme). On pourra ensuite brancher
      l’extraction réelle des longueurs de murs et des directions porteuses
      à partir de l’IFC, ainsi qu’une méthode sismique conforme à l’Eurocode 8
      ou à la réglementation locale.
    </p>
  `;
}

// Affichage initial au chargement de la page
renderResultatsInitial();

