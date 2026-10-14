
import * as THREE from "three";

/* =========================================================
   ECOS DE VEYRA
   Mundo 3D, personagem, câmera, combate e interface
   ========================================================= */

const $ = (id) => document.getElementById(id);

const ui = {
  game: $("game"),
  gameInterface: $("gameInterface"),
  start: $("startScreen"),
  pause: $("pauseScreen"),
  inventory: $("inventoryScreen"),
  map: $("mapScreen"),
  skills: $("skillsScreen"),
  settings: $("settingsScreen"),
  dialogue: $("dialogueScreen"),
  ending: $("endScreen"),
  loading: $("loadingScreen"),
  mobile: $("mobileControls")
};

const state = {
  started: false,
  paused: false,
  dead: false,
  health: 100,
  maxHealth: 100,
  mana: 100,
  maxMana: 100,
  level: 1,
  xp: 0,
  xpNext: 100,
  gold: 0,
  skillPoints: 0,
  crystals: 0,
  kills: 0,
  selectedItem: null,
  inventory: [],
  skills: { strength: 0, vitality: 0, arcana: 0 },
  keys: new Set(),
  mobileMoves: new Set(),
  mouseDown: false,
  yaw: 0,
  pitch: 0.16,
  lastTime: 0,
  attackCooldown: 0,
  dodgeCooldown: 0,
  invulnerability: 0,
  playerSpeed: 5,
  settings: {
    sensitivity: 1,
    volume: 0.7,
    shadows: true,
    graphics: "medium"
  }
};

let scene;
let camera;
let renderer;
let clock;
let player;
let playerModel;
let playerParts = {};
let ground;
let worldGroup;
let enemies = [];
let collectibles = [];
let particles = [];
let npcs = [];
let boss = null;
let activeInteraction = null;
let currentDialogue = null;
let animationFrame = 0;
let saveExists = false;
let toastTimer = null;
let audioContext = null;

const WORLD = {
  size: 180,
  playerSpawn: new THREE.Vector3(0, 0, 12)
};

const MATERIALS = {};

function material(name, color, roughness = 0.7, metalness = 0) {
  if (!MATERIALS[name]) {
    MATERIALS[name] = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness
    });
  }

  return MATERIALS[name];
}

function makeStandardMaterials() {
  material("armor", 0x252d3b, 0.38, 0.72);
  material("armorLight", 0x596477, 0.32, 0.8);
  material("darkSteel", 0x111722, 0.32, 0.8);
  material("gold", 0xc7a461, 0.32, 0.7);
  material("cloth", 0x242d45, 0.9);
  material("clothDark", 0x101827, 0.92);
  material("skin", 0xb77d60, 0.85);
  material("hair", 0x17141e, 0.9);
  material("leather", 0x493024, 0.8);
  material("bone", 0xc4c3b5, 0.75);
  material("enemy", 0x3a202d, 0.65);
  material("enemyArmor", 0x261d2c, 0.4, 0.65);
  material("stone", 0x3b4652, 0.95);
  material("stoneDark", 0x202a35, 0.95);
  material("crystal", 0x51d9f4, 0.18, 0.15);
  material("crystalGlow", 0x9df4ff, 0.15, 0.1);
  material("eye", 0x92f2ff, 0.2, 0);
  material("wood", 0x483528, 0.95);
  material("boss", 0x211c32, 0.38, 0.5);
  material("bossMetal", 0x59486e, 0.3, 0.7);
}

function makeMesh(geometry, mat, parent, position = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function box(parent, mat, size, pos, bevel = false) {
  const geometry = bevel
    ? new THREE.BoxGeometry(...size)
    : new THREE.BoxGeometry(...size);

  return makeMesh(geometry, mat, parent, pos);
}

function sphere(parent, mat, radius, pos, scale = [1, 1, 1]) {
  const mesh = makeMesh(
    new THREE.SphereGeometry(radius, 16, 12),
    mat,
    parent,
    pos
  );

  mesh.scale.set(...scale);
  return mesh;
}

function cylinder(parent, mat, radiusTop, radiusBottom, height, pos, sides = 10) {
  return makeMesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, sides),
    mat,
    parent,
    pos
  );
}

function group(parent, position = [0, 0, 0]) {
  const obj = new THREE.Group();
  obj.position.set(...position);
  parent.add(obj);
  return obj;
}

function capsule(parent, mat, radius, length, pos) {
  const mesh = makeMesh(
    new THREE.CapsuleGeometry(radius, length, 4, 8),
    mat,
    parent,
    pos
  );
  return mesh;
}

/* ---------- Inicialização ---------- */

function init() {
  makeStandardMaterials();

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x09111d);
  scene.fog = new THREE.FogExp2(0x09111d, 0.0085);

  camera = new THREE.PerspectiveCamera(
    65,
    window.innerWidth / window.innerHeight,
    0.1,
    350
  );

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance"
  });

  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, 1.75)
  );

  renderer.setSize(window.innerWidth, window.innerHeight);

  renderer.shadowMap.enabled = state.settings.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  ui.game.replaceChildren(renderer.domElement);

  clock = new THREE.Clock();

  createLighting();
  createWorld();
  createPlayer();
  createWorldObjects();
  createEnemies();
  createNPCs();
  createBoss();
  setupEvents();
  setupUI();
  loadSettings();

  ui.loading.classList.add("hidden");
  ui.start.classList.remove("hidden");

  saveExists = Boolean(localStorage.getItem("veyra-save"));
  updateContinueButton();
  updateHUD();

  window.addEventListener("resize", onResize);

  animationFrame = requestAnimationFrame(loop);
}

/* ---------- Iluminação ---------- */

function createLighting() {
  const ambient = new THREE.HemisphereLight(
    0x9ab9d7,
    0x11111c,
    1.25
  );

  scene.add(ambient);

  const moon = new THREE.DirectionalLight(0xb3d9f3, 2.1);
  moon.position.set(-30, 45, 25);
  moon.castShadow = true;

  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -45;
  moon.shadow.camera.right = 45;
  moon.shadow.camera.top = 45;
  moon.shadow.camera.bottom = -45;
  moon.shadow.bias = -0.0003;

  scene.add(moon);

  const arcaneLight = new THREE.PointLight(0x279cc8, 28, 55, 2);
  arcaneLight.position.set(0, 5, -8);
  scene.add(arcaneLight);

  const warmLight = new THREE.PointLight(0xd6a45f, 18, 35, 2);
  warmLight.position.set(-12, 3, 5);
  scene.add(warmLight);
}

/* ---------- Terreno e cenário ---------- */

function createWorld() {
  worldGroup = group(scene);

  const floorGeometry = new THREE.PlaneGeometry(
    WORLD.size,
    WORLD.size,
    32,
    32
  );

  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x18241f,
    roughness: 1,
    metalness: 0
  });

  ground = makeMesh(
    floorGeometry,
    floorMaterial,
    worldGroup,
    [0, -0.15, 0]
  );

  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;

  const grid = new THREE.GridHelper(
    WORLD.size,
    36,
    0x344b58,
    0x243440
  );

  grid.position.y = -0.13;
  grid.material.transparent = true;
  grid.material.opacity = 0.12;
  worldGroup.add(grid);

  createRuins();
  createTrees();
  createRocks();
  createCrystalClusters();
}

function createRuins() {
  const ruins = group(worldGroup);

  const positions = [
    [-17, -15], [-12, -18], [-7, -18],
    [13, -16], [18, -12], [19, -7],
    [-22, 2], [-21, 7], [22, 5],
    [9, 18], [14, 20], [-12, 22]
  ];

  for (let i = 0; i < positions.length; i++) {
    const [x, z] = positions[i];
    const height = 2.2 + (i % 3) * 0.65;

    const pillar = box(
      ruins,
      i % 2 ? MATERIALS.stone : MATERIALS.stoneDark,
      [1.15, height, 1.15],
      [x, height / 2, z]
    );

    pillar.rotation.y = (i % 4) * 0.12;

    box(
      ruins,
      MATERIALS.stone,
      [1.5, 0.22, 1.5],
      [x, height + 0.04, z]
    );

    if (i % 3 === 0) {
      const broken = box(
        ruins,
        MATERIALS.stoneDark,
        [1.5, 0.65, 1.2],
        [x + 1.3, 0.35, z + 1.1]
      );

      broken.rotation.set(0.15, 0.45, 0.2);
    }
  }

  // Arco de pedra ao fundo.
  for (let i = 0; i < 4; i++) {
    box(
      ruins,
      MATERIALS.stone,
      [0.9, 4.4, 0.9],
      [-4.5 + i * 3, 2.2, -26]
    );
  }

  box(
    ruins,
    MATERIALS.stone,
    [10.3, 0.8, 1],
    [0, 4.5, -26]
  );

  // Plataforma central.
  cylinder(
    ruins,
    MATERIALS.stoneDark,
    4.6,
    5.2,
    0.65,
    [0, 0.15, -7],
    12
  );

  cylinder(
    ruins,
    MATERIALS.stone,
    3.7,
    4.1,
    0.28,
    [0, 0.56, -7],
    12
  );

  // Runas circulares discretas.
  const runeMaterial = new THREE.MeshBasicMaterial({
    color: 0x4abbd6,
    transparent: true,
    opacity: 0.32
  });

  const rune = makeMesh(
    new THREE.TorusGeometry(2.9, 0.035, 6, 64),
    runeMaterial,
    ruins,
    [0, 0.72, -7]
  );

  rune.rotation.x = Math.PI / 2;
}

function createTrees() {
  const treeGroup = group(worldGroup);

  for (let i = 0; i < 75; i++) {
    const x = (Math.random() - 0.5) * 145;
    const z = (Math.random() - 0.5) * 145;

    if (Math.abs(x) < 24 && Math.abs(z) < 28) continue;

    const height = 2.5 + Math.random() * 2.5;
    const trunk = cylinder(
      treeGroup,
      MATERIALS.wood,
      0.18,
      0.32,
      height,
      [x, height / 2, z],
      7
    );

    trunk.rotation.z = (Math.random() - 0.5) * 0.1;

    const leaves = sphere(
      treeGroup,
      material(
        `foliage${i % 3}`,
        [0x182c2a, 0x1b302d, 0x22342d][i % 3],
        1
      ),
      1,
      [x, height + 0.6, z],
      [1.15, 1.7, 1.15]
    );

    leaves.scale.multiplyScalar(1 + Math.random() * 0.4);
  }
}

function createRocks() {
  const rocks = group(worldGroup);

  for (let i = 0; i < 65; i++) {
    const x = (Math.random() - 0.5) * 140;
    const z = (Math.random() - 0.5) * 140;

    if (Math.abs(x) < 10 && Math.abs(z) < 12) continue;

    const rock = makeMesh(
      new THREE.DodecahedronGeometry(
        0.35 + Math.random() * 1.1,
        0
      ),
      MATERIALS.stoneDark,
      rocks,
      [x, 0.25, z]
    );

    rock.scale.y = 0.45 + Math.random() * 0.6;
    rock.rotation.set(
      Math.random(),
      Math.random() * Math.PI,
      Math.random()
    );
  }
}

function createCrystalClusters() {
  const locations = [
    [-7, 0, -4],
    [8, 0, -12],
    [-19, 0, -4],
    [17, 0, 7],
    [-9, 0, 17],
    [23, 0, -23]
  ];

  for (const position of locations) {
    const cluster = group(worldGroup, position);

    for (let i = 0; i < 4; i++) {
      const height = 0.7 + Math.random() * 1.15;

      const crystal = makeMesh(
        new THREE.OctahedronGeometry(0.42, 0),
        MATERIALS.crystal,
        cluster,
        [
          (Math.random() - 0.5) * 1.2,
          height / 2,
          (Math.random() - 0.5) * 1.2
        ]
      );

      crystal.scale.set(0.65, height, 0.65);
      crystal.rotation.z = (Math.random() - 0.5) * 0.4;

      const glow = new THREE.PointLight(0x46c9ee, 1.5, 5);
      glow.position.copy(crystal.position);
      cluster.add(glow);
    }
  }
}

/* ---------- Personagem humanoide ---------- */

function createHumanoid(options = {}) {
  const {
    type = "player",
    scale = 1,
    skin = MATERIALS.skin,
    armor = MATERIALS.armor,
    cloth = MATERIALS.cloth,
    accent = MATERIALS.gold,
    hair = MATERIALS.hair
  } = options;

  const root = group(scene);
  root.scale.setScalar(scale);

  const rig = group(root);

  // Pernas articuladas.
  const leftLeg = group(rig, [-0.19, 0.91, 0]);
  const rightLeg = group(rig, [0.19, 0.91, 0]);

  for (const [leg, side] of [
    [leftLeg, "left"],
    [rightLeg, "right"]
  ]) {
    capsule(leg, cloth, 0.13, 0.4, [0, -0.23, 0]);

    box(
      leg,
      armor,
      [0.3, 0.32, 0.31],
      [0, -0.49, 0],
      true
    );

    box(
      leg,
      MATERIALS.darkSteel,
      [0.32, 0.12, 0.43],
      [0, -0.7, -0.06]
    );

    box(
      leg,
      MATERIALS.leather,
      [0.33, 0.12, 0.42],
      [0, -0.77, -0.05]
    );
  }

  // Cintura e torso.
  const waist = cylinder(
    rig,
    armor,
    0.31,
    0.32,
    0.23,
    [0, 1.16, 0],
    8
  );

  waist.rotation.y = Math.PI / 8;

  const torso = group(rig, [0, 1.51, 0]);

  capsule(
    torso,
    cloth,
    0.31,
    0.35,
    [0, 0.04, 0]
  );

  // Peitoral sobre o tecido.
  const chest = box(
    torso,
    armor,
    [0.66, 0.54, 0.31],
    [0, 0.03, -0.035]
  );

  chest.rotation.z = -0.015;

  // Placas e detalhes metálicos.
  box(
    torso,
    MATERIALS.armorLight,
    [0.2, 0.34, 0.06],
    [-0.2, 0.04, -0.215]
  );

  box(
    torso,
    MATERIALS.armorLight,
    [0.2, 0.34, 0.06],
    [0.2, 0.04, -0.215]
  );

  box(
    torso,
    accent,
    [0.075, 0.35, 0.025],
    [0, -0.01, -0.205]
  );

  sphere(
    torso,
    MATERIALS.crystal,
    0.075,
    [0, 0.12, -0.25],
    [1, 1.2, 0.6]
  );

  // Ombros.
  sphere(
    torso,
    armor,
    0.22,
    [-0.4, 0.2, 0],
    [1.15, 0.8, 1]
  );

  sphere(
    torso,
    armor,
    0.22,
    [0.4, 0.2, 0],
    [1.15, 0.8, 1]
  );

  sphere(
    torso,
    accent,
    0.08,
    [-0.43, 0.23, -0.12],
    [1, 1, 0.65]
  );

  sphere(
    torso,
    accent,
    0.08,
    [0.43, 0.23, -0.12],
    [1, 1, 0.65]
  );

  // Capa.
  const cape = box(
    torso,
    cloth,
    [0.61, 0.85, 0.075],
    [0, -0.29, 0.2]
  );

  cape.rotation.x = -0.08;

  // Braços.
  const leftArm = group(torso, [-0.43, 0.12, 0]);
  const rightArm = group(torso, [0.43, 0.12, 0]);

  for (const arm of [leftArm, rightArm]) {
    capsule(
      arm,
      cloth,
      0.12,
      0.25,
      [0, -0.22, 0]
    );

    sphere(
      arm,
      armor,
      0.145,
      [0, -0.36, 0],
      [1, 1.2, 0.95]
    );

    box(
      arm,
      armorLightSafe(),
      [0.23, 0.24, 0.23],
      [0, -0.4, -0.015]
    );

    capsule(
      arm,
      skin,
      0.085,
      0.14,
      [0, -0.53, 0]
    );
  }

  // Cabeça e pescoço.
  cylinder(
    torso,
    skin,
    0.105,
    0.11,
    0.17,
    [0, 0.48, 0],
    10
  );

  const head = group(torso, [0, 0.69, 0]);

  sphere(
    head,
    skin,
    0.22,
    [0, 0, 0],
    [0.83, 1.1, 0.84]
  );

  // Cabelo e parte traseira da cabeça.
  sphere(
    head,
    hair,
    0.205,
    [0, 0.09, 0.035],
    [0.9, 0.75, 0.9]
  );

  sphere(
    head,
    skin,
    0.17,
    [0, -0.04, -0.025],
    [0.86, 0.93, 0.85]
  );

  // Franja.
  const fringe = box(
    head,
    hair,
    [0.29, 0.105, 0.13],
    [0, 0.105, -0.13]
  );

  fringe.rotation.x = -0.16;

  // Olhos.
  sphere(
    head,
    MATERIALS.eye,
    0.025,
    [-0.065, 0.01, -0.177],
    [1.2, 0.65, 0.55]
  );

  sphere(
    head,
    MATERIALS.eye,
    0.025,
    [0.065, 0.01, -0.177],
    [1.2, 0.65, 0.55]
  );

  // Proteções laterais do rosto.
  box(
    head,
    armor,
    [0.065, 0.19, 0.07],
    [-0.19, -0.015, -0.035]
  );

  box(
    head,
    armor,
    [0.065, 0.19, 0.07],
    [0.19, -0.015, -0.035]
  );

  // Cinto e pequenas bolsas.
  box(
    rig,
    MATERIALS.leather,
    [0.61, 0.12, 0.36],
    [0, 1.16, -0.005]
  );

  box(
    rig,
    accent,
    [0.12, 0.12, 0.06],
    [0, 1.16, -0.2]
  );

  box(
    rig,
    MATERIALS.leather,
    [0.12, 0.17, 0.12],
    [-0.25, 1.14, 0.02]
  );

  // Espada presa à mão direita.
  const sword = group(rightArm, [0.02, -0.64, -0.02]);

  cylinder(
    sword,
    MATERIALS.leather,
    0.035,
    0.035,
    0.24,
    [0, -0.06, 0],
    8
  );

  box(
    sword,
    accent,
    [0.29, 0.055, 0.065],
    [0, 0.08, 0]
  );

  const blade = box(
    sword,
    MATERIALS.armorLight,
    [0.105, 0.68, 0.035],
    [0, 0.44, 0]
  );

  blade.rotation.z = -0.025;

  const bladeTip = makeMesh(
    new THREE.ConeGeometry(0.074, 0.19, 4),
    MATERIALS.armorLight,
    sword,
    [0, 0.86, 0]
  );

  bladeTip.rotation.z = Math.PI;

  // Pequeno cristal na guarda da arma.
  sphere(
    sword,
    MATERIALS.crystal,
    0.045,
    [0, 0.08, -0.035]
  );

  return {
    root,
    rig,
    torso,
    head,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    cape,
    sword,
    type
  };
}

function armorLightSafe() {
  return MATERIALS.armorLight || MATERIALS.armor;
}

function createPlayer() {
  player = group(scene, [
    WORLD.playerSpawn.x,
    0,
    WORLD.playerSpawn.z
  ]);

  playerModel = createHumanoid();

  scene.remove(playerModel.root);
  player.add(playerModel.root);

  playerModel.root.position.set(0, 0, 0);
  playerParts = playerModel;

  // O eixo frontal do personagem é -Z.
  player.rotation.y = 0;
}

/* ---------- Objetos interativos ---------- */

function createWorldObjects() {
  const positions = [
    [-4, 0, -4],
    [5, 0, -10],
    [-14, 0, 4],
    [14, 0, 10],
    [0, 0, -20],
    [22, 0, -17],
    [-22, 0, -15],
    [7, 0, 22]
  ];

  positions.forEach((position, index) => {
    createCollectible(position, index);
  });

  createCampfire(-8, 0, 10);
  createCampfire(11, 0, -3);
}

function createCollectible(position, index) {
  const root = group(scene, position);

  cylinder(
    root,
    MATERIALS.stoneDark,
    0.38,
    0.48,
    0.25,
    [0, 0.12, 0],
    8
  );

  const crystal = makeMesh(
    new THREE.OctahedronGeometry(0.42, 0),
    MATERIALS.crystal,
    root,
    [0, 0.82, 0]
  );

  crystal.scale.set(0.75, 1.35, 0.75);

  const glow = new THREE.PointLight(0x4bcdf4, 2, 5);
  glow.position.set(0, 1, 0);
  root.add(glow);

  const ring = makeMesh(
    new THREE.TorusGeometry(0.58, 0.025, 6, 32),
    new THREE.MeshBasicMaterial({
      color: 0x5ed9f2,
      transparent: true,
      opacity: 0.6
    }),
    root,
    [0, 0.3, 0]
  );

  ring.rotation.x = Math.PI / 2;

  collectibles.push({
    root,
    crystal,
    ring,
    index,
    collected: false,
    baseY: 0.82,
    type: "crystal",
    name: "Fragmento de Veyra",
    description: "Um fragmento de energia antiga.",
    gold: 5 + index * 2
  });
}

function createCampfire(x, y, z) {
  const root = group(scene, [x, y, z]);

  for (let i = 0; i < 4; i++) {
    const log = cylinder(
      root,
      MATERIALS.wood,
      0.09,
      0.09,
      1.1,
      [0, 0.12, 0],
      7
    );

    log.rotation.z = Math.PI / 2;
    log.rotation.y = i * Math.PI / 2;
  }

  const flameMaterial = new THREE.MeshBasicMaterial({
    color: 0xffa74b,
    transparent: true,
    opacity: 0.85
  });

  const flame = makeMesh(
    new THREE.ConeGeometry(0.3, 0.85, 7),
    flameMaterial,
    root,
    [0, 0.58, 0]
  );

  const light = new THREE.PointLight(0xff873c, 3, 9);
  light.position.set(0, 0.8, 0);
  root.add(light);

  npcs.push({
    root,
    name: "Fogueira antiga",
    interact: () => {
      if (state.health < state.maxHealth || state.mana < state.maxMana) {
        state.health = Math.min(state.maxHealth, state.health + 25);
        state.mana = Math.min(state.maxMana, state.mana + 30);
        updateHUD();
        showToast("Você recuperou parte de sua energia.");
      } else {
        showToast("Sua energia já está restaurada.");
      }
    },
    range: 3.2
  });
}

/* ---------- Inimigos ---------- */

function createEnemies() {
  const positions = [
    [-9, 0, -12],
    [10, 0, -19],
    [20, 0, 3],
    [-19, 0, 11],
    [3, 0, 24]
  ];

  positions.forEach((position, index) => {
    createEnemy(position, index);
  });
}

function createEnemy(position, index) {
  const enemy = group(scene, position);

  const model = createHumanoid({
    type: "enemy",
    scale: 0.95,
    skin: material("enemySkin", 0x77505b, 0.85),
    armor: MATERIALS.enemyArmor,
    cloth: MATERIALS.enemy,
    accent: material("enemyAccent", 0x9b526a, 0.4, 0.4),
    hair: material("enemyHair", 0x201722, 0.8)
  });

  scene.remove(model.root);
  enemy.add(model.root);

  model.root.position.set(0, 0, 0);

  // Elmo com pontas.
  sphere(
    model.head,
    MATERIALS.enemyArmor,
    0.21,
    [0, 0.11, 0],
    [1.1, 0.6, 1]
  );

  for (const side of [-1, 1]) {
    const horn = makeMesh(
      new THREE.ConeGeometry(0.075, 0.38, 6),
      MATERIALS.bone,
      model.head,
      [side * 0.16, 0.26, 0]
    );

    horn.rotation.z = side * -0.35;
  }

  // Olhos vermelhos.
  const redEye = material("redEye", 0xff526e, 0.2, 0);

  sphere(
    model.head,
    redEye,
    0.028,
    [-0.065, 0.01, -0.18]
  );

  sphere(
    model.head,
    redEye,
    0.028,
    [0.065, 0.01, -0.18]
  );

  // Arma do inimigo.
  box(
    model.rightArm,
    MATERIALS.darkSteel,
    [0.08, 0.75, 0.08],
    [0, -0.8, -0.03]
  );

  const healthBar = makeEnemyHealthBar(enemy);

  enemies.push({
    root: enemy,
    model,
    health: 55 + index * 8,
    maxHealth: 55 + index * 8,
    alive: true,
    aggro: false,
    attackTimer: 0,
    speed: 1.1 + Math.random() * 0.5,
    phase: Math.random() * 5,
    healthBar,
    index,
    hitFlash: 0
  });
}

function makeEnemyHealthBar(parent) {
  const holder = group(parent, [0, 2.7, 0]);

  const back = makeMesh(
    new THREE.PlaneGeometry(1.1, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x23141c }),
    holder
  );

  const fill = makeMesh(
    new THREE.PlaneGeometry(1.04, 0.055),
    new THREE.MeshBasicMaterial({ color: 0xcf5364 }),
    holder,
    [0, 0, 0.01]
  );

  return { holder, fill, back };
}

/* ---------- NPC ---------- */

function createNPCs() {
  const npcRoot = group(scene, [-3, 0, -17]);

  const model = createHumanoid({
    scale: 1.03,
    skin: material("npcSkin", 0xc3926e, 0.85),
    armor: material("npcArmor", 0x5a594d, 0.55, 0.4),
    cloth: material("npcCloth", 0x3c4d58, 0.9),
    accent: MATERIALS.gold,
    hair: material("npcHair", 0xaaa08a, 0.8)
  });

  scene.remove(model.root);
  npcRoot.add(model.root);

  model.root.position.set(0, 0, 0);

  // Cajado do ancião.
  const staff = cylinder(
    model.leftArm,
    MATERIALS.wood,
    0.045,
    0.065,
    1.8,
    [0, -0.8, 0],
    8
  );

  staff.rotation.z = -0.08;

  sphere(
    model.leftArm,
    MATERIALS.crystal,
    0.12,
    [0, 0.12, 0]
  );

  npcs.push({
    root: npcRoot,
    model,
    name: "Ancião de Veyra",
    range: 3.5,
    interact: () => {
      openDialogue({
        speaker: "ANCIÃO DE VEYRA",
        title: "As ruínas despertaram",
        text: "Viajante, os cristais voltaram a brilhar. Há muito tempo, essas terras foram protegidas por uma antiga ordem. Colete os fragmentos e prepare-se para enfrentar o guardião.",
        choices: [
          {
            text: "Vou descobrir o que aconteceu.",
            action: () => {
              setQuest(
                "Fragmentos esquecidos",
                "Reúna os fragmentos de energia espalhados pelas ruínas.",
                `Fragmentos coletados: ${state.crystals} / 3`
              );
              showToast("Nova missão: Fragmentos esquecidos");
            }
          },
          {
            text: "Preciso recuperar minhas forças.",
            action: () => {
              state.health = state.maxHealth;
              state.mana = state.maxMana;
              updateHUD();
              showToast("Sua energia foi restaurada.");
            }
          }
        ]
      });
    }
  });
}

/* ---------- Chefe ---------- */

function createBoss() {
  const root = group(scene, [0, 0, -35]);

  const model = createHumanoid({
    type: "boss",
    scale: 1.9,
    skin: material("bossSkin", 0x55405f, 0.55),
    armor: MATERIALS.boss,
    cloth: material("bossCloth", 0x151320, 0.8),
    accent: MATERIALS.crystal,
    hair: material("bossHair", 0x100e18, 0.8)
  });

  scene.remove(model.root);
  root.add(model.root);

  model.root.position.set(0, 0, 0);

  // Coroa quebrada.
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;

    const spike = makeMesh(
      new THREE.ConeGeometry(0.12, 0.75, 5),
      MATERIALS.bossMetal,
      model.head,
      [
        Math.cos(angle) * 0.22,
        0.35 + (i % 2) * 0.08,
        Math.sin(angle) * 0.12
      ]
    );

    spike.rotation.z = Math.cos(angle) * -0.4;
    spike.rotation.x = Math.sin(angle) * 0.35;
  }

  // Ombreiras maiores.
  sphere(
    model.torso,
    MATERIALS.bossMetal,
    0.3,
    [-0.43, 0.2, 0],
    [1.5, 0.9, 1]
  );

  sphere(
    model.torso,
    MATERIALS.bossMetal,
    0.3,
    [0.43, 0.2, 0],
    [1.5, 0.9, 1]
  );

  // Aura.
  const aura = new THREE.PointLight(0x714ad9, 6, 14);
  aura.position.set(0, 2.2, 0);
  root.add(aura);

  boss = {
    root,
    model,
    health: 600,
    maxHealth: 600,
    active: false,
    defeated: false,
    attackTimer: 2,
    aura,
    phase: 1
  };
}

/* ---------- Controles e eventos ---------- */

function setupEvents() {
  window.addEventListener("keydown", (event) => {
    if ([
      "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"
    ].includes(event.code)) {
      event.preventDefault();
    }

    if (event.repeat) return;

    state.keys.add(event.code);

    if (!state.started || state.paused || state.dead) {
      if (event.code === "Escape" && state.started && !state.dead) {
        togglePause();
      }
      return;
    }

    switch (event.code) {
      case "Escape":
        togglePause();
        break;
      case "KeyI":
        toggleScreen(ui.inventory);
        renderInventory();
        break;
      case "KeyM":
        toggleScreen(ui.map);
        break;
      case "KeyK":
        toggleScreen(ui.skills);
        renderSkills();
        break;
      case "KeyE":
        interact();
        break;
      case "KeyQ":
        useSelectedItem();
        break;
      case "Space":
        jump();
        break;
      case "ShiftLeft":
      case "ShiftRight":
        break;
      case "KeyJ":
        showToast("Missão atual: " + ($("questTitle")?.textContent || "Exploração"));
        break;
    }
  });

  window.addEventListener("keyup", (event) => {
    state.keys.delete(event.code);
  });

  renderer.domElement.addEventListener("click", () => {
    if (state.started && !state.paused && !isAnyModalOpen()) {
      try {
        renderer.domElement.requestPointerLock?.();
      } catch {
        // Alguns navegadores podem bloquear o pointer lock.
      }
    }
  });

  document.addEventListener("pointerlockchange", () => {
    state.mouseDown = document.pointerLockElement === renderer.domElement;
  });

  document.addEventListener("mousemove", (event) => {
    if (
      document.pointerLockElement !== renderer.domElement ||
      !state.started ||
      state.paused
    ) return;

    state.yaw -= event.movementX * 0.002 * state.settings.sensitivity;
    state.pitch -= event.movementY * 0.0015 * state.settings.sensitivity;
    state.pitch = THREE.MathUtils.clamp(state.pitch, -0.15, 0.65);
  });

  renderer.domElement.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  renderer.domElement.addEventListener("mousedown", (event) => {
    if (!state.started || state.paused || isAnyModalOpen()) return;

    if (event.button === 0 && document.pointerLockElement === renderer.domElement) {
      attack();
    }

    if (event.button === 2 && document.pointerLockElement === renderer.domElement) {
      heavyAttack();
    }
  });

  window.addEventListener("blur", () => {
    state.keys.clear();
    state.mobileMoves.clear();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.started && !state.paused) {
      togglePause();
    }
  });

  // Controles de movimento para celular.
  document.querySelectorAll("[data-move]").forEach((button) => {
    const direction = button.dataset.move;

    const start = (event) => {
      event.preventDefault();
      state.mobileMoves.add(direction);
      button.setPointerCapture?.(event.pointerId);
    };

    const stop = (event) => {
      event.preventDefault();
      state.mobileMoves.delete(direction);
    };

    button.addEventListener("pointerdown", start);
    button.addEventListener("pointerup", stop);
    button.addEventListener("pointercancel", stop);
    button.addEventListener("lostpointercapture", stop);
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!state.started || state.paused) return;
      runAction(button.dataset.action);
    });
  });

  // O celular não tem mouse; o arrasto na tela gira a câmera.
  let touchLook = null;

  renderer.domElement.addEventListener("pointerdown", (event) => {
    if (
      event.pointerType !== "touch" ||
      !state.started ||
      state.paused
    ) return;

    if (event.clientX > window.innerWidth * 0.35) {
      touchLook = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY
      };
    }
  });

  renderer.domElement.addEventListener("pointermove", (event) => {
    if (!touchLook || touchLook.id !== event.pointerId) return;

    const dx = event.clientX - touchLook.x;
    const dy = event.clientY - touchLook.y;

    state.yaw -= dx * 0.006 * state.settings.sensitivity;
    state.pitch -= dy * 0.003 * state.settings.sensitivity;
    state.pitch = THREE.MathUtils.clamp(state.pitch, -0.15, 0.65);

    touchLook.x = event.clientX;
    touchLook.y = event.clientY;
  });

  const stopTouchLook = () => {
    touchLook = null;
  };

  renderer.domElement.addEventListener("pointerup", stopTouchLook);
  renderer.domElement.addEventListener("pointercancel", stopTouchLook);
}

/* ---------- Interface ---------- */

function setupUI() {
  $("startButton")?.addEventListener("click", startGame);
  $("continueButton")?.addEventListener("click", continueGame);
  $("resumeButton")?.addEventListener("click", resumeGame);

  $("pauseSaveButton")?.addEventListener("click", () => {
    saveGame();
    showToast("Progresso salvo.");
  });

  $("pauseSettingsButton")?.addEventListener("click", () => {
    ui.pause.classList.add("hidden");
    ui.settings.classList.remove("hidden");
  });

  $("mainMenuButton")?.addEventListener("click", () => {
    ui.pause.classList.add("hidden");
    ui.start.classList.remove("hidden");
    state.started = false;
    state.paused = false;
    document.exitPointerLock?.();
  });

  $("restartButton")?.addEventListener("click", () => {
    localStorage.removeItem("veyra-save");
    location.reload();
  });

  $("closeInventoryButton")?.addEventListener("click", () => {
    ui.inventory.classList.add("hidden");
  });

  $("closeMapButton")?.addEventListener("click", () => {
    ui.map.classList.add("hidden");
  });

  $("closeSkillsButton")?.addEventListener("click", () => {
    ui.skills.classList.add("hidden");
  });

  $("closeSettingsButton")?.addEventListener("click", () => {
    ui.settings.classList.add("hidden");
    if (state.started && !state.paused) resumeGame();
  });

  $("closeDialogueButton")?.addEventListener("click", closeDialogue);

  $("useItemButton")?.addEventListener("click", useSelectedItem);
  $("equipItemButton")?.addEventListener("click", equipSelectedItem);

  $("saveSettingsButton")?.addEventListener("click", () => {
    applySettings();
    localStorage.setItem(
      "veyra-settings",
      JSON.stringify(state.settings)
    );

    ui.settings.classList.add("hidden");
    showToast("Configurações salvas.");

    if (state.started && !state.paused) resumeGame();
  });

  // Existem dois botões com o mesmo ID no HTML:
  // ambos abrem as configurações.
  document.querySelectorAll("#openSettingsButton").forEach((button) => {
    button.addEventListener("click", () => {
      ui.start.classList.add("hidden");
      ui.settings.classList.remove("hidden");
      populateSettings();
    });
  });

  $("openInventoryButton")?.addEventListener("click", () => {
    ui.inventory.classList.remove("hidden");
    renderInventory();
  });

  $("openMapButton")?.addEventListener("click", () => {
    ui.map.classList.remove("hidden");
  });

  $("graphicsSelect")?.addEventListener("change", (event) => {
    state.settings.graphics = event.target.value;
  });

  $("sensitivityInput")?.addEventListener("input", (event) => {
    state.settings.sensitivity = Number(event.target.value);
  });

  $("volumeInput")?.addEventListener("input", (event) => {
    state.settings.volume = Number(event.target.value);
  });

  $("shadowsToggle")?.addEventListener("change", (event) => {
    state.settings.shadows = event.target.checked;
  });

  updateMobileControls();
}

function startGame() {
  ui.start.classList.add("hidden");
  ui.pause.classList.add("hidden");
  ui.settings.classList.add("hidden");

  state.started = true;
  state.paused = false;
  state.dead = false;

  if (isMobile()) {
    ui.mobile.classList.remove("hidden");
  }

  showToast("Bem-vindo às Terras Esquecidas.");
  document.exitPointerLock?.();
}

function continueGame() {
  const saved = readSave();

  if (!saved) {
    startGame();
    return;
  }

  restoreSave(saved);
  ui.start.classList.add("hidden");
  state.started = true;
  state.paused = false;
  state.dead = false;

  updateHUD();
  renderInventory();
  updateQuest();
  updateMobileControls();

  showToast("Sua jornada foi restaurada.");
}

function resumeGame() {
  ui.pause.classList.add("hidden");
  ui.settings.classList.add("hidden");
  ui.inventory.classList.add("hidden");
  ui.map.classList.add("hidden");
  ui.skills.classList.add("hidden");

  state.paused = false;
  state.started = true;

  updateMobileControls();
}

function togglePause() {
  if (!state.started || state.dead || !ui.start.classList.contains("hidden")) {
    return;
  }

  state.paused = !state.paused;
  ui.pause.classList.toggle("hidden", !state.paused);

  if (state.paused) {
    document.exitPointerLock?.();
    state.keys.clear();
    state.mobileMoves.clear();
  }
}

function toggleScreen(element) {
  if (!element) return;

  const wasHidden = element.classList.contains("hidden");

  closeAllScreens();

  if (wasHidden) {
    element.classList.remove("hidden");
    state.keys.clear();
    state.mobileMoves.clear();
    document.exitPointerLock?.();
  }
}

function closeAllScreens() {
  [
    ui.inventory,
    ui.map,
    ui.skills,
    ui.settings,
    ui.dialogue,
    ui.ending
  ].forEach((screen) => screen?.classList.add("hidden"));
}

function isAnyModalOpen() {
  return [
    ui.inventory,
    ui.map,
    ui.skills,
    ui.settings,
    ui.dialogue,
    ui.ending,
    ui.pause,
    ui.start
  ].some((screen) => screen && !screen.classList.contains("hidden"));
}

function updateMobileControls() {
  if (!ui.mobile) return;

  ui.mobile.classList.toggle(
    "hidden",
    !isMobile() || !state.started || state.paused
  );
}

function isMobile() {
  return window.matchMedia("(pointer: coarse)").matches ||
    window.innerWidth <= 700;
}

/* ---------- Movimento ---------- */

const playerVelocity = new THREE.Vector3();
let verticalVelocity = 0;
let onGround = true;

function updatePlayer(delta) {
  if (!state.started || state.paused || state.dead) return;

  const forward =
    state.keys.has("KeyW") ||
    state.keys.has("ArrowUp") ||
    state.mobileMoves.has("forward");

  const backward =
    state.keys.has("KeyS") ||
    state.keys.has("ArrowDown") ||
    state.mobileMoves.has("backward");

  const left =
    state.keys.has("KeyA") ||
    state.keys.has("ArrowLeft") ||
    state.mobileMoves.has("left");

  const right =
    state.keys.has("KeyD") ||
    state.keys.has("ArrowRight") ||
    state.mobileMoves.has("right");

  let x = Number(right) - Number(left);
  let z = Number(backward) - Number(forward);

  const moving = x !== 0 || z !== 0;

  if (moving) {
    const length = Math.hypot(x, z);
    x /= length;
    z /= length;

    const sprint =
      state.keys.has("ShiftLeft") ||
      state.keys.has("ShiftRight");

    const speed = state.playerSpeed * (sprint ? 1.55 : 1);

    const angle = state.yaw;
    const worldX = x * Math.cos(angle) + z * Math.sin(angle);
    const worldZ = -x * Math.sin(angle) + z * Math.cos(angle);

    player.position.x += worldX * speed * delta;
    player.position.z += worldZ * speed * delta;

    player.rotation.y = Math.atan2(worldX, worldZ) + Math.PI;

    // Passos e capa.
    const walkCycle = performance.now() * 0.009 * (sprint ? 1.7 : 1);
    playerModel.leftLeg.rotation.x = Math.sin(walkCycle) * 0.55;
    playerModel.rightLeg.rotation.x = Math.sin(walkCycle + Math.PI) * 0.55;
    playerModel.leftArm.rotation.x = Math.sin(walkCycle + Math.PI) * 0.35;
    playerModel.rightArm.rotation.x = Math.sin(walkCycle) * 0.35;
    playerModel.cape.rotation.x = -0.08 + Math.sin(walkCycle * 0.5) * 0.06;
  } else {
    playerModel.leftLeg.rotation.x = THREE.MathUtils.damp(
      playerModel.leftLeg.rotation.x, 0, 9, delta
    );

    playerModel.rightLeg.rotation.x = THREE.MathUtils.damp(
      playerModel.rightLeg.rotation.x, 0, 9, delta
    );

    playerModel.leftArm.rotation.x = THREE.MathUtils.damp(
      playerModel.leftArm.rotation.x, 0, 9, delta
    );

    playerModel.rightArm.rotation.x = THREE.MathUtils.damp(
      playerModel.rightArm.rotation.x, 0, 9, delta
    );
  }

  // Limite inicial do mapa.
  const limit = WORLD.size / 2 - 4;
  player.position.x = THREE.MathUtils.clamp(
    player.position.x, -limit, limit
  );
  player.position.z = THREE.MathUtils.clamp(
    player.position.z, -limit, limit
  );

  if (state.invulnerability > 0) {
    state.invulnerability -= delta;
  }

  if (state.attackCooldown > 0) {
    state.attackCooldown -= delta;
  }

  if (state.dodgeCooldown > 0) {
    state.dodgeCooldown -= delta;
  }

  // Gravidade e salto.
  if (!onGround) {
    verticalVelocity -= 15 * delta;
    player.position.y += verticalVelocity * delta;

    if (player.position.y <= 0) {
      player.position.y = 0;
      verticalVelocity = 0;
      onGround = true;
    }
  }

  updateCamera(delta);
  updateInteractionPrompt();
}

function updateCamera(delta) {
  const distance = isMobile() ? 6.8 : 6.2;
  const height = 2.8 + state.pitch * 2.3;

  const offset = new THREE.Vector3(
    Math.sin(state.yaw) * distance,
    height,
    Math.cos(state.yaw) * distance
  );

  const target = player.position.clone().add(new THREE.Vector3(0, 1.7, 0));
  const desired = target.clone().add(offset);

  camera.position.lerp(desired, 1 - Math.exp(-6 * delta));
  camera.lookAt(target);
}

/* ---------- Saltar, esquivar e atacar ---------- */

function jump() {
  if (!state.started || state.paused || !onGround) return;

  verticalVelocity = 6.2;
  onGround = false;
}

function dodge() {
  if (state.dodgeCooldown > 0 || !state.started || state.paused) return;

  const direction = new THREE.Vector3(
    -Math.sin(state.yaw),
    0,
    -Math.cos(state.yaw)
  );

  player.position.addScaledVector(direction, 2.3);
  state.invulnerability = 0.45;
  state.dodgeCooldown = 1.2;

  createBurst(player.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x62d8f1, 8);
  playTone(180, 0.07, 0.03);
}

function attack() {
  if (!state.started || state.paused || state.attackCooldown > 0) return;

  state.attackCooldown = 0.42;

  playerModel.rightArm.rotation.x = -1.1;
  playerModel.rightArm.rotation.z = -0.6;

  setTimeout(() => {
    if (!playerModel) return;
    playerModel.rightArm.rotation.x = 0;
    playerModel.rightArm.rotation.z = 0;
  }, 170);

  const target = findCombatTarget(3.2);

  if (target) {
    damageTarget(target, 24 + state.skills.strength * 5);
    createBurst(
      target.root.position.clone().add(new THREE.Vector3(0, 1.2, 0)),
      0xffd38b,
      10
    );
    playTone(125, 0.08, 0.06);
  } else {
    playTone(220, 0.04, 0.02);
  }
}

function heavyAttack() {
  if (!state.started || state.paused || state.mana < 15) return;

  state.mana -= 15;
  updateHUD();

  const target = findCombatTarget(4.5);

  createBurst(
    player.position.clone().add(new THREE.Vector3(0, 1, 0)),
    0x62cfea,
    15
  );

  if (target) {
    damageTarget(target, 45 + state.skills.arcana * 8);
    createBurst(
      target.root.position.clone().add(new THREE.Vector3(0, 1.3, 0)),
      0x62cfea,
      15
    );
  }

  playTone(90, 0.18, 0.05);
}

function runAction(action) {
  switch (action) {
    case "attack":
      attack();
      break;
    case "heavyAttack":
      heavyAttack();
      break;
    case "useItem":
      useSelectedItem();
      break;
    case "dodge":
      dodge();
      break;
    case "jump":
      jump();
      break;
    case "interact":
      interact();
      break;
  }
}

function findCombatTarget(range) {
  let closest = null;
  let closestDistance = range;

  for (const enemy of enemies) {
    if (!enemy.alive) continue;

    const distance = player.position.distanceTo(enemy.root.position);

    if (distance < closestDistance) {
      const directionToEnemy = enemy.root.position.clone().sub(player.position);
      directionToEnemy.y = 0;
      directionToEnemy.normalize();

      const facing = new THREE.Vector3(
        -Math.sin(player.rotation.y),
        0,
        -Math.cos(player.rotation.y)
      );

      if (facing.dot(directionToEnemy) > -0.1) {
        closest = enemy;
        closestDistance = distance;
      }
    }
  }

  if (boss && boss.active && !boss.defeated) {
    const distance = player.position.distanceTo(boss.root.position);

    if (distance < closestDistance) {
      closest = boss;
    }
  }

  return closest;
}

function damageTarget(target, damage) {
  if (target === boss) {
    if (boss.defeated) return;

    boss.health = Math.max(0, boss.health - damage);
    updateBossHUD();

    if (boss.health <= 0) {
      defeatBoss();
    }

    return;
  }

  if (!target.alive) return;

  target.health = Math.max(0, target.health - damage);
  target.hitFlash = 0.16;

  const ratio = target.health / target.maxHealth;
  target.healthBar.fill.scale.x = Math.max(0.001, ratio);
  target.healthBar.fill.position.x = -0.52 * (1 - ratio);

  if (target.health <= 0) {
    defeatEnemy(target);
  }
}

function defeatEnemy(enemy) {
  enemy.alive = false;
  enemy.root.visible = false;
  state.kills++;

  state.xp += 25;
  state.gold += 8 + Math.floor(Math.random() * 8);

  addInventoryItem({
    id: "essencia",
    name: "Essência sombria",
    description: "Uma pequena essência deixada por um inimigo.",
    icon: "✦",
    count: 1,
    type: "material"
  });

  checkLevelUp();
  updateHUD();
  updateQuest();

  showToast("Inimigo derrotado. Você recebeu experiência e ouro.");
}

function defeatBoss() {
  boss.defeated = true;
  boss.active = false;
  boss.root.visible = false;

  state.xp += 250;
  state.gold += 150;
  state.crystals += 1;

  checkLevelUp();
  updateHUD();

  $("endEyebrow").textContent = "O GUARDIÃO FOI DERROTADO";
  $("endTitle").textContent = "Um novo amanhecer";
  $("endDescription").textContent =
    "A energia das ruínas se acalma. Mas os ecos de Veyra ainda guardam segredos.";

  ui.ending.classList.remove("hidden");
  state.paused = true;
  document.exitPointerLock?.();

  saveGame();
}

function checkLevelUp() {
  while (state.xp >= state.xpNext) {
    state.xp -= state.xpNext;
    state.level++;
    state.skillPoints++;
    state.xpNext = Math.floor(state.xpNext * 1.35);

    state.maxHealth += 10;
    state.maxMana += 5;
    state.health = state.maxHealth;
    state.mana = state.maxMana;

    showToast(`Nível ${state.level}! Você recebeu um ponto de habilidade.`);
  }
}

/* ---------- IA simples ---------- */

function updateEnemies(delta) {
  if (!state.started || state.paused || state.dead) return;

  for (const enemy of enemies) {
    if (!enemy.alive) continue;

    const distance = enemy.root.position.distanceTo(player.position);

    enemy.healthBar.holder.lookAt(camera.position);

    if (distance < 12) {
      enemy.aggro = true;
    }

    if (!enemy.aggro) {
      enemy.model.leftArm.rotation.x =
        Math.sin(performance.now() * 0.001 + enemy.phase) * 0.08;
      continue;
    }

    if (distance > 1.8) {
      const direction = player.position.clone().sub(enemy.root.position);
      direction.y = 0;
      direction.normalize();

      enemy.root.position.addScaledVector(
        direction,
        enemy.speed * delta
      );

      enemy.root.rotation.y = Math.atan2(direction.x, direction.z) + Math.PI;

      const step = performance.now() * 0.007 + enemy.phase;
      enemy.model.leftLeg.rotation.x = Math.sin(step) * 0.4;
      enemy.model.rightLeg.rotation.x = Math.sin(step + Math.PI) * 0.4;
    } else {
      enemy.attackTimer -= delta;

      if (enemy.attackTimer <= 0) {
        enemy.attackTimer = 1.7;
        damagePlayer(9 + Math.floor(state.level * 0.5));
      }
    }

    if (enemy.hitFlash > 0) {
      enemy.hitFlash -= delta;
    }
  }

  updateBossAI(delta);
}

function updateBossAI(delta) {
  if (!boss || boss.defeated || !state.started || state.paused) return;

  const distance = boss.root.position.distanceTo(player.position);

  if (distance < 18) {
    boss.active = true;
    $("bossStatus")?.classList.remove("hidden");
  }

  if (!boss.active) return;

  boss.root.rotation.y = Math.atan2(
    player.position.x - boss.root.position.x,
    player.position.z - boss.root.position.z
  ) + Math.PI;

  if (boss.health < boss.maxHealth * 0.5) {
    boss.phase = 2;
    $("bossPhase").textContent = "FASE II";
    boss.aura.intensity = 10;
  }

  boss.attackTimer -= delta;

  if (distance < 4.3 && boss.attackTimer <= 0) {
    boss.attackTimer = boss.phase === 2 ? 1.2 : 2;
    damagePlayer(boss.phase === 2 ? 22 : 15);

    createBurst(
      player.position.clone().add(new THREE.Vector3(0, 1, 0)),
      0x995ee8,
      12
    );
  }
}

function damagePlayer(amount) {
  if (state.invulnerability > 0 || state.dead) return;

  state.health = Math.max(0, state.health - amount);
  state.invulnerability = 0.6;

  updateHUD();
  playTone(75, 0.15, 0.06);

  if (state.health <= 0) {
    state.dead = true;
    state.paused = true;

    $("endEyebrow").textContent = "AS SOMBRAS VENCERAM";
    $("endTitle").textContent = "A jornada foi interrompida";
    $("endDescription").textContent =
      "Sua história ainda não terminou. Retome a jornada e tente novamente.";

    ui.ending.classList.remove("hidden");
    document.exitPointerLock?.();
  }
}

/* ---------- Interação ---------- */

function updateInteractionPrompt() {
  let closest = null;
  let closestDistance = 3.5;

  for (const item of collectibles) {
    if (item.collected) continue;

    const distance = player.position.distanceTo(item.root.position);

    if (distance < closestDistance) {
      closest = {
        type: "collectible",
        target: item,
        distance
      };
      closestDistance = distance;
    }
  }

  for (const npc of npcs) {
    const distance = player.position.distanceTo(npc.root.position);

    if (distance < (npc.range || 3.5) && distance < closestDistance) {
      closest = {
        type: "npc",
        target: npc,
        distance
      };
      closestDistance = distance;
    }
  }

  if (boss && !boss.defeated) {
    const distance = player.position.distanceTo(boss.root.position);

    if (distance < 3.5 && distance < closestDistance) {
      closest = {
        type: "boss",
        target: boss,
        distance
      };
    }
  }

  activeInteraction = closest;

  if (closest) {
    ui.interactionPrompt?.classList.remove("hidden");

    const labels = {
      collectible: "Coletar fragmento",
      npc: closest.target.name === "Ancião de Veyra"
        ? "Conversar com o ancião"
        : "Recuperar energia",
      boss: "Enfrentar o guardião"
    };

    $("interactionText").textContent = labels[closest.type];
  } else {
    ui.interactionPrompt?.classList.add("hidden");
  }
}

function interact() {
  if (!activeInteraction) {
    showToast("Não há nada para interagir por perto.");
    return;
  }

  const { type, target } = activeInteraction;

  if (type === "collectible") {
    target.collected = true;
    target.root.visible = false;

    state.crystals++;
    state.mana = Math.min(state.maxMana, state.mana + 8);
    state.gold += target.gold;
    state.xp += 10;

    addInventoryItem({
      id: `fragment-${target.index}`,
      name: "Fragmento de Veyra",
      description: "Energia cristalizada das antigas ruínas.",
      icon: "✧",
      count: 1,
      type: "material"
    });

    checkLevelUp();
    updateHUD();
    updateQuest();

    showToast("Fragmento coletado.");
    playTone(520, 0.12, 0.035);
    return;
  }

  if (type === "npc") {
    target.interact();
    return;
  }

  if (type === "boss") {
    boss.active = true;
    $("bossStatus").classList.remove("hidden");
    showToast("O Guardião do Vazio desperta!");
  }
}

/* ---------- Missões ---------- */

function setQuest(title, description, objective) {
  $("questTitle").textContent = title;
  $("questDescription").textContent = description;
  $("objective").textContent = objective;
}

function updateQuest() {
  if (boss?.defeated) {
    setQuest(
      "O Guardião do Vazio",
      "A ameaça das ruínas foi derrotada.",
      "Guardião derrotado"
    );
    return;
  }

  if (state.crystals >= 3) {
    setQuest(
      "O Guardião do Vazio",
      "A energia dos cristais despertou uma presença nas ruínas.",
      "Encontre o Guardião do Vazio"
    );
  } else {
    setQuest(
      "Ecos na Escuridão",
      "Descubra a origem da energia que desperta nas ruínas.",
      `Colete fragmentos de Veyra: ${state.crystals} / 3`
    );
  }
}

/* ---------- Inventário ---------- */

function addInventoryItem(item) {
  const existing = state.inventory.find((entry) => entry.id === item.id);

  if (existing) {
    existing.count = (existing.count || 1) + (item.count || 1);
  } else {
    state.inventory.push({ ...item });
  }

  renderInventory();
}

function renderInventory() {
  const container = $("inventoryItems");
  if (!container) return;

  container.replaceChildren();

  for (let i = 0; i < 30; i++) {
    const item = state.inventory[i];
    const button = document.createElement("button");

    button.type = "button";
    button.className = "inventory-slot";
    button.setAttribute("aria-label", item ? item.name : "Espaço vazio");

    if (item) {
      button.textContent = item.icon || "◇";

      if (item.count > 1) {
        const count = document.createElement("span");
        count.className = "item-count";
        count.textContent = item.count;
        button.append(count);
      }

      if (state.selectedItem === item.id) {
        button.classList.add("selected");
      }

      button.addEventListener("click", () => {
        state.selectedItem = item.id;
        renderInventory();
        renderItemDetails(item);
      });
    } else {
      button.textContent = "";
      button.disabled = true;
    }

    container.append(button);
  }

  $("inventoryCount").textContent = `${state.inventory.length} / 30`;

  if (state.selectedItem) {
    const item = state.inventory.find(
      (entry) => entry.id === state.selectedItem
    );

    if (item) {
      renderItemDetails(item);
    } else {
      state.selectedItem = null;
    }
  }

  updateInventoryButtons();
}

function renderItemDetails(item) {
  const details = $("itemDetails");
  if (!details) return;

  details.replaceChildren();

  const icon = document.createElement("div");
  icon.className = "empty-state-symbol";
  icon.textContent = item.icon || "◇";

  const title = document.createElement("h3");
  title.textContent = item.name;

  const description = document.createElement("p");
  description.textContent = item.description || "Um item encontrado durante a jornada.";

  const count = document.createElement("p");
  count.textContent = `Quantidade: ${item.count || 1}`;

  details.append(icon, title, description, count);
  updateInventoryButtons();
}

function updateInventoryButtons() {
  const item = state.inventory.find(
    (entry) => entry.id === state.selectedItem
  );

  $("useItemButton").disabled = !item || item.type !== "potion";
  $("equipItemButton").disabled = !item || item.type !== "weapon";
}

function useSelectedItem() {
  const item = state.inventory.find(
    (entry) => entry.id === state.selectedItem
  );

  if (!item) {
    showToast("Selecione um item primeiro.");
    return;
  }

  if (item.type === "potion") {
    state.health = Math.min(state.maxHealth, state.health + 40);
    state.mana = Math.min(state.maxMana, state.mana + 25);

    item.count--;

    if (item.count <= 0) {
      state.inventory = state.inventory.filter(
        (entry) => entry.id !== item.id
      );
      state.selectedItem = null;
    }

    updateHUD();
    renderInventory();
    showToast("Poção utilizada.");
  } else {
    showToast("Este item não pode ser utilizado diretamente.");
  }
}

function equipSelectedItem() {
  const item = state.inventory.find(
    (entry) => entry.id === state.selectedItem
  );

  if (!item || item.type !== "weapon") return;

  showToast(`${item.name} equipado.`);
}

/* ---------- Habilidades ---------- */

function renderSkills() {
  const container = $("skillsList");
  if (!container) return;

  container.replaceChildren();

  const skills = [
    {
      id: "strength",
      title: "Força",
      description: "Aumenta o dano dos ataques corpo a corpo.",
      effect: `Nível atual: ${state.skills.strength}`
    },
    {
      id: "vitality",
      title: "Vitalidade",
      description: "Aumenta sua resistência e vida máxima.",
      effect: `Nível atual: ${state.skills.vitality}`
    },
    {
      id: "arcana",
      title: "Arcano",
      description: "Aumenta o poder dos ataques mágicos.",
      effect: `Nível atual: ${state.skills.arcana}`
    }
  ];

  for (const skill of skills) {
    const card = document.createElement("article");
    card.className = "skill-card";

    const title = document.createElement("h3");
    title.textContent = skill.title;

    const description = document.createElement("p");
    description.textContent = skill.description;

    const level = document.createElement("p");
    level.textContent = skill.effect;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Aprender habilidade";
    button.disabled = state.skillPoints <= 0;

    button.addEventListener("click", () => {
      if (state.skillPoints <= 0) return;

      state.skillPoints--;
      state.skills[skill.id]++;

      if (skill.id === "vitality") {
        state.maxHealth += 15;
        state.health += 15;
      }

      updateHUD();
      renderSkills();
      showToast(`Habilidade ${skill.title} aprimorada.`);
    });

    card.append(title, description, level, button);
    container.append(card);
  }

  $("skillPointsText").textContent = state.skillPoints;
}

/* ---------- Diálogos ---------- */

function openDialogue(data) {
  currentDialogue = data;

  $("dialogueSpeaker").textContent = data.speaker || "VIAJANTE";
  $("dialogueTitle").textContent = data.title || "Conversa";
  $("dialogueText").textContent = data.text || "";

  const choices = $("dialogueChoices");
  choices.replaceChildren();

  for (const choice of data.choices || []) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = choice.text;

    button.addEventListener("click", () => {
      if (typeof choice.action === "function") {
        choice.action();
      }

      closeDialogue();
    });

    choices.append(button);
  }

  ui.dialogue.classList.remove("hidden");
  document.exitPointerLock?.();
}

function closeDialogue() {
  ui.dialogue.classList.add("hidden");
  currentDialogue = null;
}

/* ---------- HUD ---------- */

function updateHUD() {
  const hp = Math.max(0, state.health);
  const mana = Math.max(0, state.mana);

  $("hpText").textContent = `${Math.ceil(hp)} / ${state.maxHealth}`;
  $("manaText").textContent = `${Math.ceil(mana)} / ${state.maxMana}`;

  $("hpBar").style.width = `${(hp / state.maxHealth) * 100}%`;
  $("manaBar").style.width = `${(mana / state.maxMana) * 100}%`;

  $("hpProgress").textContent = `${Math.round((hp / state.maxHealth) * 100)}%`;
  $("manaProgress").textContent = `${Math.round((mana / state.maxMana) * 100)}%`;

  $("levelText").textContent = state.level;

  $("xpBar").style.width = `${Math.min(100, (state.xp / state.xpNext) * 100)}%`;
  $("xpProgress").textContent = `${Math.round((state.xp / state.xpNext) * 100)}%`;

  $("goldText").textContent = state.gold;

  $("skillPointsText").textContent = state.skillPoints;
  $("mapLocation").textContent = "Terras Esquecidas";
}

function updateBossHUD() {
  if (!boss) return;

  $("bossName").textContent = "Guardião do Vazio";
  $("bossHpText").textContent =
    `${Math.ceil(boss.health)} / ${boss.maxHealth}`;

  $("bossHpBar").style.width =
    `${(boss.health / boss.maxHealth) * 100}%`;

  $("bossPhase").textContent = boss.phase === 2 ? "FASE II" : "FASE I";
}

/* ---------- Efeitos visuais ---------- */

function createBurst(position, color, count = 8) {
  for (let i = 0; i < count; i++) {
    const mesh = makeMesh(
      new THREE.SphereGeometry(0.045 + Math.random() * 0.045, 6, 6),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1
      }),
      scene,
      position.toArray()
    );

    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 4,
      Math.random() * 3,
      (Math.random() - 0.5) * 4
    );

    particles.push({
      mesh,
      velocity,
      life: 0.45 + Math.random() * 0.45,
      maxLife: 0.9
    });
  }
}

function updateParticles(delta) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i];

    particle.life -= delta;
    particle.mesh.position.addScaledVector(particle.velocity, delta);
    particle.velocity.y -= 2.5 * delta;

    const opacity = Math.max(0, particle.life / particle.maxLife);
    particle.mesh.material.opacity = opacity;
    particle.mesh.scale.setScalar(Math.max(0.01, opacity));

    if (particle.life <= 0) {
      scene.remove(particle.mesh);
      particle.mesh.geometry.dispose();
      particle.mesh.material.dispose();
      particles.splice(i, 1);
    }
  }
}

function updateCollectibles(delta) {
  const time = performance.now() * 0.001;

  for (const item of collectibles) {
    if (item.collected) continue;

    item.crystal.position.y =
      item.baseY + Math.sin(time * 1.7 + item.index) * 0.13;

    item.crystal.rotation.y += delta * 0.8;
    item.ring.rotation.z += delta * 0.35;
  }
}

/* ---------- Áudio simples ---------- */

function playTone(frequency = 220, duration = 0.08, volume = 0.03) {
  if (state.settings.volume <= 0) return;

  try {
    audioContext ||= new (
      window.AudioContext || window.webkitAudioContext
    )();

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;

    gain.gain.setValueAtTime(
      Math.max(0.0001, volume * state.settings.volume),
      audioContext.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      audioContext.currentTime + duration
    );

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch {
    // O jogo continua funcionando se o áudio não estiver disponível.
  }
}

/* ---------- Notificações ---------- */

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove("hidden");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 2800);

  $("message").textContent = message;
}

/* ---------- Salvamento ---------- */

function saveGame() {
  const data = {
    version: 1,
    player: {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      yaw: state.yaw
    },
    state: {
      health: state.health,
      maxHealth: state.maxHealth,
      mana: state.mana,
      maxMana: state.maxMana,
      level: state.level,
      xp: state.xp,
      xpNext: state.xpNext,
      gold: state.gold,
      skillPoints: state.skillPoints,
      crystals: state.crystals,
      kills: state.kills,
      skills: state.skills
    },
    inventory: state.inventory,
    selectedItem: state.selectedItem,
    collected: collectibles
      .filter((item) => item.collected)
      .map((item) => item.index),
    enemies: enemies.map((enemy) => ({
      index: enemy.index,
      alive: enemy.alive,
      health: enemy.health
    })),
    boss: {
      health: boss.health,
      defeated: boss.defeated,
      active: boss.active,
      phase: boss.phase
    },
    savedAt: Date.now()
  };

  try {
    localStorage.setItem("veyra-save", JSON.stringify(data));
    saveExists = true;
    updateContinueButton();
  } catch {
    showToast("Não foi possível salvar neste navegador.");
  }
}

function readSave() {
  try {
    const raw = localStorage.getItem("veyra-save");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function restoreSave(data) {
  if (!data || data.version !== 1) return;

  if (data.player) {
    player.position.set(
      Number(data.player.x) || 0,
      Number(data.player.y) || 0,
      Number(data.player.z) || 0
    );

    state.yaw = Number(data.player.yaw) || 0;
  }

  Object.assign(state, data.state || {});

  if (data.state?.skills) {
    state.skills = {
      strength: Number(data.state.skills.strength) || 0,
      vitality: Number(data.state.skills.vitality) || 0,
      arcana: Number(data.state.skills.arcana) || 0
    };
  }

  state.inventory = Array.isArray(data.inventory)
    ? data.inventory
    : [];

  state.selectedItem = data.selectedItem || null;

  const collected = new Set(data.collected || []);

  collectibles.forEach((item) => {
    item.collected = collected.has(item.index);
    item.root.visible = !item.collected;
  });

  const savedEnemies = new Map(
    (data.enemies || []).map((enemy) => [enemy.index, enemy])
  );

  enemies.forEach((enemy) => {
    const saved = savedEnemies.get(enemy.index);

    if (saved) {
      enemy.alive = Boolean(saved.alive);
      enemy.health = Number(saved.health) || enemy.maxHealth;
      enemy.root.visible = enemy.alive;
    }
  });

  if (data.boss) {
    boss.health = Number(data.boss.health) || boss.maxHealth;
    boss.defeated = Boolean(data.boss.defeated);
    boss.active = Boolean(data.boss.active);
    boss.phase = Number(data.boss.phase) || 1;
    boss.root.visible = !boss.defeated;
  }

  updateBossHUD();
  updateQuest();
  renderInventory();
  updateHUD();
}

function updateContinueButton() {
  const button = $("continueButton");
  if (!button) return;

  button.disabled = !saveExists;
  button.style.opacity = saveExists ? "1" : "0.45";
}

/* ---------- Configurações ---------- */

function populateSettings() {
  $("graphicsSelect").value = state.settings.graphics;
  $("sensitivityInput").value = state.settings.sensitivity;
  $("volumeInput").value = state.settings.volume;
  $("shadowsToggle").checked = state.settings.shadows;
}

function applySettings() {
  renderer.shadowMap.enabled = state.settings.shadows;

  const pixelRatio = state.settings.graphics === "high"
    ? Math.min(window.devicePixelRatio || 1, 2)
    : state.settings.graphics === "low"
      ? 1
      : Math.min(window.devicePixelRatio || 1, 1.5);

  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  if (state.settings.graphics === "low") {
    scene.fog.density = 0.006;
  } else if (state.settings.graphics === "high") {
    scene.fog.density = 0.009;
  } else {
    scene.fog.density = 0.0085;
  }

  populateSettings();
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("veyra-settings"));

    if (saved) {
      Object.assign(state.settings, saved);
    }
  } catch {
    // Configurações padrão.
  }

  populateSettings();
  applySettings();
}

/* ---------- Loop principal ---------- */

function loop() {
  animationFrame = requestAnimationFrame(loop);

  const delta = Math.min(clock.getDelta(), 0.04);

  if (state.started && !state.paused && !state.dead) {
    updatePlayer(delta);
    updateEnemies(delta);
    updateCollectibles(delta);

    if (boss && boss.active && !boss.defeated) {
      boss.model.cape.rotation.x =
        -0.08 + Math.sin(performance.now() * 0.0015) * 0.09;
    }

    // Salvamento automático periódico é implementado sem bloquear a cena.
    state.lastTime += delta;

    if (state.lastTime >= 60) {
      state.lastTime = 0;
      saveGame();
    }
  }

  updateParticles(delta);

  renderer.render(scene, camera);
}

function onResize() {
  if (!camera || !renderer) return;

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* ---------- Inicializar ---------- */

try {
  init();
} catch (error) {
  console.error("Erro ao iniciar Ecos de Veyra:", error);

  if (ui.loading) {
    ui.loading.classList.add("hidden");
  }

  showToast("Não foi possível iniciar o jogo. Verifique o console.");
}
