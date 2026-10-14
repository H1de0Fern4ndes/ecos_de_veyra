
import * as THREE from "three";

/*
 * ECOS DE VEYRA — O ÚLTIMO GUARDIÃO
 * Núcleo jogável: mundo 3D, personagem, câmera, combate,
 * inimigos, cristais, experiência, chefe, interface e salvamento.
 */

const $ = (id) => document.getElementById(id);

const ui = {
  game: $("game"),
  hpText: $("hpText"),
  hpBar: $("hpBar"),
  hpProgress: $("hpProgress"),
  manaText: $("manaText"),
  manaBar: $("manaBar"),
  manaProgress: $("manaProgress"),
  levelText: $("levelText"),
  xpBar: $("xpBar"),
  xpProgress: $("xpProgress"),
  questTitle: $("questTitle"),
  questDescription: $("questDescription"),
  objective: $("objective"),
  message: $("message"),
  toast: $("toast"),
  startScreen: $("startScreen"),
  pauseScreen: $("pauseScreen"),
  endScreen: $("endScreen"),
  endTitle: $("endTitle"),
  endDescription: $("endDescription"),
  bossStatus: $("bossStatus"),
  bossName: $("bossName"),
  bossHpText: $("bossHpText"),
  bossHpBar: $("bossHpBar"),
  bossPhase: $("bossPhase"),
  interactionPrompt: $("interactionPrompt"),
  interactionText: $("interactionText"),
  inventoryScreen: $("inventoryScreen"),
  inventoryItems: $("inventoryItems"),
  inventoryCount: $("inventoryCount"),
  itemDetails: $("itemDetails"),
  useItemButton: $("useItemButton"),
  equipItemButton: $("equipItemButton"),
  goldText: $("goldText"),
  mapScreen: $("mapScreen"),
  worldMap: $("worldMap"),
  mapLocation: $("mapLocation"),
  skillsScreen: $("skillsScreen"),
  skillsList: $("skillsList"),
  skillPointsText: $("skillPointsText"),
  settingsScreen: $("settingsScreen"),
  graphicsSelect: $("graphicsSelect"),
  sensitivityInput: $("sensitivityInput"),
  volumeInput: $("volumeInput"),
  shadowsToggle: $("shadowsToggle"),
  dialogueScreen: $("dialogueScreen"),
  dialogueSpeaker: $("dialogueSpeaker"),
  dialogueTitle: $("dialogueTitle"),
  dialogueText: $("dialogueText"),
  dialogueChoices: $("dialogueChoices"),
  loadingScreen: $("loadingScreen"),
  loadingText: $("loadingText"),
  loadingProgress: $("loadingProgress"),
  continueButton: $("continueButton"),
  mobileControls: $("mobileControls"),
};

const CONFIG = {
  worldSize: 180,
  playerSpeed: 7,
  runMultiplier: 1.65,
  attackRange: 3.5,
  attackCooldown: 0.55,
  dodgeDuration: 0.32,
  dodgeCooldown: 1.0,
  enemyThinkInterval: 0.15,
  saveKey: "ecos-de-veyra-save-v1",
};

const state = {
  running: false,
  started: false,
  paused: false,
  ended: false,
  victory: false,
  inventoryOpen: false,
  mapOpen: false,
  skillsOpen: false,
  settingsOpen: false,
  dialogueOpen: false,
  pointerLocked: false,
  crystals: 0,
  bossSpawned: false,
  bossDefeated: false,
  selectedItem: null,
  toastTimer: 0,
  playTime: 0,
  location: "Ilha Esquecida",
};

const playerData = {
  hp: 100,
  maxHp: 100,
  mana: 50,
  maxMana: 50,
  level: 1,
  xp: 0,
  xpNext: 100,
  attack: 20,
  defense: 3,
  speed: CONFIG.playerSpeed,
  skillPoints: 0,
  gold: 0,
  invulnerable: 0,
  attackCooldown: 0,
  dodgeCooldown: 0,
  dodgeTime: 0,
  dead: false,
};

const inventory = [];
const enemies = [];
const crystals = [];
const interactables = [];
const colliders = [];
const keys = new Set();
const touchMoves = new Set();

let scene;
let camera;
let renderer;
let clock;
let player;
let playerVisual;
let sword;
let swordPivot;
let sunLight;
let ambientLight;
let sky;
let ground;
let boss = null;
let attackAnimation = 0;
let attackQueued = false;
let enemyThinkTimer = 0;
let saveRequested = false;
let selectedInteractable = null;
let animationFrame = 0;
let lastAutosave = 0;

const cameraState = {
  yaw: 0,
  pitch: 0.27,
  distance: 7,
  sensitivity: 1,
  dragging: false,
  lastX: 0,
  lastY: 0,
};

const settings = {
  graphics: "medium",
  volume: 0.5,
  shadows: true,
};

const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
const raycaster = new THREE.Raycaster();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function random(min, max) {
  return min + Math.random() * (max - min);
}

function distanceXZ(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function makeMaterial(color, roughness = 0.9, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    ...extra,
  });
}

function addMesh(geometry, material, parent, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function createBox(parent, x, y, z, sx, sy, sz, color, options = {}) {
  const mesh = addMesh(
    new THREE.BoxGeometry(sx, sy, sz),
    makeMaterial(color, options.roughness ?? 0.9, options.material ?? {}),
    parent,
    x, y, z
  );

  if (options.castShadow !== false) mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function showMessage(text) {
  if (ui.message) ui.message.textContent = text;
}

function showToast(text, duration = 2300) {
  if (!ui.toast) return;

  ui.toast.textContent = text;
  ui.toast.classList.add("show");
  state.toastTimer = duration / 1000;
}

function hideToast() {
  ui.toast?.classList.remove("show");
}

function setScreen(screen, visible) {
  if (!screen) return;
  screen.classList.toggle("hidden", !visible);
}

function setQuest(title, description, objective) {
  if (ui.questTitle) ui.questTitle.textContent = title;
  if (ui.questDescription) ui.questDescription.textContent = description;
  if (ui.objective) ui.objective.textContent = objective;
}

function updateHUD() {
  const hp = clamp(playerData.hp, 0, playerData.maxHp);
  const mana = clamp(playerData.mana, 0, playerData.maxMana);
  const xpPercent = playerData.xpNext > 0
    ? (playerData.xp / playerData.xpNext) * 100
    : 0;

  if (ui.hpText) {
    ui.hpText.textContent = `${Math.ceil(hp)} / ${playerData.maxHp}`;
  }

  if (ui.hpBar) {
    ui.hpBar.style.width = `${(hp / playerData.maxHp) * 100}%`;
  }

  if (ui.hpProgress) {
    ui.hpProgress.setAttribute("aria-valuenow", String(Math.ceil(hp)));
    ui.hpProgress.setAttribute("aria-valuemax", String(playerData.maxHp));
  }

  if (ui.manaText) {
    ui.manaText.textContent = `${Math.ceil(mana)} / ${playerData.maxMana}`;
  }

  if (ui.manaBar) {
    ui.manaBar.style.width = `${(mana / playerData.maxMana) * 100}%`;
  }

  if (ui.manaProgress) {
    ui.manaProgress.setAttribute("aria-valuenow", String(Math.ceil(mana)));
    ui.manaProgress.setAttribute("aria-valuemax", String(playerData.maxMana));
  }

  if (ui.levelText) {
    ui.levelText.textContent = `Nível ${playerData.level}`;
  }

  if (ui.xpBar) {
    ui.xpBar.style.width = `${clamp(xpPercent, 0, 100)}%`;
  }

  if (ui.xpProgress) {
    ui.xpProgress.setAttribute("aria-valuenow", String(playerData.xp));
    ui.xpProgress.setAttribute("aria-valuemax", String(playerData.xpNext));
  }

  if (ui.goldText) {
    ui.goldText.textContent = `Ouro: ${playerData.gold}`;
  }

  if (boss && !boss.dead && ui.bossStatus) {
    ui.bossStatus.classList.remove("hidden");
    ui.bossHpText.textContent =
      `${Math.ceil((boss.hp / boss.maxHp) * 100)}%`;
    ui.bossHpBar.style.width =
      `${clamp((boss.hp / boss.maxHp) * 100, 0, 100)}%`;

    ui.bossPhase.textContent = boss.phase >= 2
      ? "Fase II — Fúria ancestral"
      : "Fase I — Guardião desperto";
  } else {
    ui.bossStatus?.classList.add("hidden");
  }
}

/* =========================================================
   CENA E AMBIENTE
========================================================= */

function createWorld() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8197a4);
  scene.fog = new THREE.FogExp2(0x8197a4, 0.008);

  camera = new THREE.PerspectiveCamera(
    65,
    window.innerWidth / window.innerHeight,
    0.1,
    350
  );

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });

  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, 1.75)
  );

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = settings.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  renderer.domElement.tabIndex = 0;
  ui.game.appendChild(renderer.domElement);

  ambientLight = new THREE.HemisphereLight(
    0xb9d8ed,
    0x273021,
    1.7
  );
  scene.add(ambientLight);

  sunLight = new THREE.DirectionalLight(0xffe2b0, 2.5);
  sunLight.position.set(-35, 55, 25);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.left = -60;
  sunLight.shadow.camera.right = 60;
  sunLight.shadow.camera.top = 60;
  sunLight.shadow.camera.bottom = -60;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 150;
  scene.add(sunLight);

  sky = new THREE.Mesh(
    new THREE.SphereGeometry(300, 24, 16),
    new THREE.MeshBasicMaterial({
      color: 0x8197a4,
      side: THREE.BackSide,
    })
  );
  scene.add(sky);

  const groundGeometry = new THREE.PlaneGeometry(
    CONFIG.worldSize,
    CONFIG.worldSize,
    50,
    50
  );

  const positions = groundGeometry.attributes.position;

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);

    const height =
      Math.sin(x * 0.065) * 0.7 +
      Math.cos(y * 0.08) * 0.5 +
      Math.sin((x + y) * 0.035) * 1.2;

    positions.setZ(i, height);
  }

  groundGeometry.computeVertexNormals();

  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x354b3d,
    roughness: 1,
    flatShading: true,
  });

  ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  createWater();
  createForest();
  createRuins();
  createRockFormations();
  createCrystals();
  createPlayer();
  createEnemies();
  createAncientAltar();
  createAmbientParticles();
}

function createWater() {
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 240),
    new THREE.MeshStandardMaterial({
      color: 0x173b4c,
      roughness: 0.22,
      metalness: 0.15,
      transparent: true,
      opacity: 0.85,
    })
  );

  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -2.7, 0);
  scene.add(water);
}

function createForest() {
  const treeTrunk = makeMaterial(0x49372b);
  const treeLeaves = [
    makeMaterial(0x233d34),
    makeMaterial(0x2d4939),
    makeMaterial(0x344d3e),
  ];

  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.45, 3.5, 7);
  const crownGeo = new THREE.ConeGeometry(2, 5.5, 7);

  for (let i = 0; i < 115; i++) {
    let x = random(-82, 82);
    let z = random(-82, 82);

    // Mantém uma área livre ao redor do início.
    if (Math.abs(x) < 14 && Math.abs(z) < 14) {
      x += x < 0 ? -16 : 16;
      z += z < 0 ? -16 : 16;
    }

    // Evita bloquear a área central do altar.
    if (Math.abs(x - 30) < 10 && Math.abs(z + 25) < 10) {
      x += 15;
    }

    const scale = random(0.7, 1.45);
    const tree = new THREE.Group();
    tree.position.set(x, 0, z);
    tree.scale.setScalar(scale);

    const trunk = addMesh(
      trunkGeo,
      treeTrunk,
      tree,
      0,
      1.7,
      0
    );
    trunk.castShadow = true;

    const crown = addMesh(
      crownGeo,
      treeLeaves[Math.floor(Math.random() * treeLeaves.length)],
      tree,
      0,
      5.1,
      0
    );
    crown.castShadow = true;

    const crown2 = addMesh(
      crownGeo,
      treeLeaves[Math.floor(Math.random() * treeLeaves.length)],
      tree,
      0,
      7.1,
      0
    );
    crown2.scale.setScalar(0.72);
    crown2.castShadow = true;

    scene.add(tree);

    colliders.push({
      x,
      z,
      radius: 1.1 * scale,
    });
  }
}

function createRuins() {
  const stone = makeMaterial(0x6a716e);
  const darkStone = makeMaterial(0x424c4d);
  const group = new THREE.Group();

  // Plataforma central.
  createBox(group, 0, 0.25, 0, 14, 0.5, 12, 0x535e5b);
  createBox(group, 0, 0.55, 0, 11, 0.2, 9, 0x737a72);

  // Pilares e vigas.
  for (const x of [-5, 5]) {
    for (const z of [-3.5, 3.5]) {
      const pillar = createBox(
        group, x, 2.4, z, 1.1, 4.4, 1.1, 0x727a74
      );
      pillar.material = stone;
    }
  }

  createBox(group, 0, 4.7, -3.5, 11, 0.8, 1.2, 0x525c59);
  createBox(group, -5, 4.7, 0, 1.2, 0.8, 7, 0x525c59);
  createBox(group, 5, 4.7, 0, 1.2, 0.8, 7, 0x525c59);

  // Pedras espalhadas ao redor.
  for (let i = 0; i < 14; i++) {
    const angle = random(0, Math.PI * 2);
    const radius = random(9, 14);

    const rock = addMesh(
      new THREE.DodecahedronGeometry(random(0.6, 1.6), 0),
      darkStone,
      group,
      Math.cos(angle) * radius,
      random(0.2, 0.7),
      Math.sin(angle) * radius
    );

    rock.rotation.set(random(0, 1), random(0, 3), random(0, 1));
    rock.castShadow = true;
    rock.receiveShadow = true;
  }

  group.position.set(30, 0, -25);
  scene.add(group);

  colliders.push({ x: 30, z: -25, radius: 8 });

  // Pequenas ruínas adicionais.
  for (const pos of [
    [-34, -35],
    [43, 42],
    [-50, 25],
  ]) {
    const ruin = new THREE.Group();

    createBox(ruin, 0, 0.25, 0, 7, 0.5, 6, 0x515b59);

    for (const x of [-2.5, 2.5]) {
      const height = random(1.8, 3.8);
      createBox(
        ruin, x, height / 2 + 0.4, 0,
        0.7, height, 0.7, 0x69736e
      );
    }

    ruin.position.set(pos[0], 0, pos[1]);
    scene.add(ruin);
  }
}

function createRockFormations() {
  const rockMaterials = [
    makeMaterial(0x505b59),
    makeMaterial(0x626c68),
    makeMaterial(0x3d4949),
  ];

  for (let i = 0; i < 65; i++) {
    const x = random(-85, 85);
    const z = random(-85, 85);

    if (Math.abs(x) < 12 && Math.abs(z) < 12) continue;

    const scale = random(0.4, 1.9);

    const rock = addMesh(
      new THREE.DodecahedronGeometry(1, 0),
      rockMaterials[Math.floor(Math.random() * rockMaterials.length)],
      scene,
      x,
      scale * 0.35,
      z
    );

    rock.scale.set(scale, scale * random(0.7, 1.4), scale);
    rock.rotation.set(random(0, 1), random(0, 6), random(0, 1));
    rock.castShadow = true;
    rock.receiveShadow = true;

    colliders.push({ x, z, radius: scale * 0.8 });
  }
}

function createAmbientParticles() {
  const count = 350;
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = random(-85, 85);
    positions[i * 3 + 1] = random(0.5, 15);
    positions[i * 3 + 2] = random(-85, 85);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3)
  );

  const material = new THREE.PointsMaterial({
    color: 0xb6eaff,
    size: 0.11,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });

  const particles = new THREE.Points(geometry, material);
  particles.name = "ambientParticles";
  scene.add(particles);
}

/* =========================================================
   PERSONAGEM
========================================================= */

function createPlayer() {
  player = new THREE.Group();
  player.position.set(0, 0, 0);
  scene.add(player);

  playerVisual = new THREE.Group();
  player.add(playerVisual);

  const armor = makeMaterial(0x303f50, 0.65);
  const armorLight = makeMaterial(0x667b8b, 0.6);
  const skin = makeMaterial(0xd1ad91);
  const cloth = makeMaterial(0x4b2534);
  const gold = makeMaterial(0xc9a85e, 0.45);

  // Pernas.
  const leftLeg = createBox(
    playerVisual, -0.23, 0.43, 0, 0.27, 0.85, 0.32, 0x29313b
  );
  const rightLeg = createBox(
    playerVisual, 0.23, 0.43, 0, 0.27, 0.85, 0.32, 0x29313b
  );

  // Corpo e armadura.
  const torso = addMesh(
    new THREE.CapsuleGeometry(0.43, 0.7, 4, 8),
    armor,
    playerVisual,
    0, 1.45, 0
  );

  torso.scale.set(0.9, 1, 0.7);
  torso.castShadow = true;

  createBox(
    playerVisual, 0, 1.35, -0.04,
    0.88, 0.16, 0.72, 0x8c754d
  );

  // Manto.
  const mantle = createBox(
    playerVisual, 0, 1.18, -0.35,
    0.72, 1.05, 0.16, 0x3b2433
  );
  mantle.rotation.x = -0.08;

  // Ombros.
  const shoulderL = addMesh(
    new THREE.SphereGeometry(0.28, 10, 8),
    armorLight,
    playerVisual,
    -0.55, 1.8, 0
  );

  const shoulderR = addMesh(
    new THREE.SphereGeometry(0.28, 10, 8),
    armorLight,
    playerVisual,
    0.55, 1.8, 0
  );

  // Cabeça.
  addMesh(
    new THREE.SphereGeometry(0.3, 12, 10),
    skin,
    playerVisual,
    0, 2.3, 0
  );

  // Capuz/cabelo.
  const hood = addMesh(
    new THREE.SphereGeometry(0.33, 10, 8),
    cloth,
    playerVisual,
    0, 2.47, -0.05
  );
  hood.scale.set(1, 0.8, 1);

  // Braços.
  const armL = createBox(
    playerVisual, -0.57, 1.4, 0,
    0.22, 0.7, 0.24, 0x3c4a58
  );

  const armR = createBox(
    playerVisual, 0.57, 1.4, 0,
    0.22, 0.7, 0.24, 0x3c4a58
  );

  // Detalhes dourados.
  createBox(
    playerVisual, 0, 1.8, 0.37,
    0.23, 0.32, 0.07, 0xc9a85e
  );

  // Espada posicionada na mão direita.
  swordPivot = new THREE.Group();
  swordPivot.position.set(0.65, 1.3, 0);
  playerVisual.add(swordPivot);

  sword = new THREE.Group();
  swordPivot.add(sword);

  createBox(sword, 0, 0.43, 0, 0.09, 0.9, 0.12, 0xcbd9df);
  createBox(sword, 0, 0.03, 0, 0.36, 0.09, 0.17, 0xc9a85e);
  createBox(sword, 0, -0.22, 0, 0.12, 0.4, 0.14, 0x563b2a);

  sword.rotation.z = -0.3;

  playerVisual.userData.parts = {
    leftLeg,
    rightLeg,
    armL,
    armR,
    shoulderL,
    shoulderR,
    mantle,
  };

  playerVisual.scale.setScalar(1);
}

function animatePlayer(delta) {
  if (!playerVisual) return;

  const parts = playerVisual.userData.parts;
  const moving = getMoveVector().lengthSq() > 0.01;
  const running = moving && keys.has("Shift");

  if (playerData.dodgeTime > 0) {
    playerVisual.position.y = Math.sin(
      (playerData.dodgeTime / CONFIG.dodgeDuration) * Math.PI
    ) * 0.18;
  } else {
    playerVisual.position.y = moving
      ? Math.abs(Math.sin(state.playTime * (running ? 13 : 8))) * 0.06
      : 0;
  }

  if (moving && playerData.dodgeTime <= 0) {
    const swing = Math.sin(state.playTime * (running ? 13 : 8)) * 0.42;
    parts.leftLeg.rotation.x = swing;
    parts.rightLeg.rotation.x = -swing;
    parts.armL.rotation.x = -swing * 0.7;
    parts.armR.rotation.x = swing * 0.7;
  } else {
    parts.leftLeg.rotation.x = THREE.MathUtils.damp(
      parts.leftLeg.rotation.x, 0, 8, delta
    );
    parts.rightLeg.rotation.x = THREE.MathUtils.damp(
      parts.rightLeg.rotation.x, 0, 8, delta
    );
    parts.armL.rotation.x = THREE.MathUtils.damp(
      parts.armL.rotation.x, 0, 8, delta
    );
    parts.armR.rotation.x = THREE.MathUtils.damp(
      parts.armR.rotation.x, 0, 8, delta
    );
  }

  if (attackAnimation > 0) {
    const progress = 1 - attackAnimation / 0.38;
    swordPivot.rotation.x = -Math.sin(progress * Math.PI) * 0.8;
    swordPivot.rotation.z = -Math.sin(progress * Math.PI) * 1.7;
  } else {
    swordPivot.rotation.x = THREE.MathUtils.damp(
      swordPivot.rotation.x, 0, 12, delta
    );
    swordPivot.rotation.z = THREE.MathUtils.damp(
      swordPivot.rotation.z, 0, 12, delta
    );
  }
}

/* =========================================================
   CRISTAIS E INTERAÇÃO
========================================================= */

function createCrystals() {
  const positions = [
    [-15, 1, -10],
    [18, 1, 12],
    [-36, 1, 18],
    [45, 1, -44],
    [2, 1, -56],
  ];

  const crystalMaterial = new THREE.MeshStandardMaterial({
    color: 0x55dfff,
    emissive: 0x158cba,
    emissiveIntensity: 2.4,
    metalness: 0.25,
    roughness: 0.2,
  });

  positions.forEach((pos, index) => {
    const group = new THREE.Group();
    group.position.set(pos[0], pos[1], pos[2]);

    const crystal = addMesh(
      new THREE.OctahedronGeometry(0.8, 0),
      crystalMaterial.clone(),
      group,
      0, 0.5, 0
    );

    crystal.scale.set(0.75, 1.4, 0.75);
    crystal.castShadow = true;

    const ring = addMesh(
      new THREE.TorusGeometry(1.05, 0.045, 8, 32),
      makeMaterial(0x75e8ff, 0.25, {
        emissive: 0x2089a9,
        emissiveIntensity: 1.2,
      }),
      group,
      0, 0.2, 0
    );
    ring.rotation.x = Math.PI / 2;

    const light = new THREE.PointLight(0x38cfff, 2.2, 9);
    light.position.y = 1;
    group.add(light);

    scene.add(group);

    const data = {
      id: `crystal-${index + 1}`,
      group,
      crystal,
      ring,
      light,
      collected: false,
      baseY: pos[1],
      type: "crystal",
      label: `Cristal ancestral ${index + 1}`,
    };

    crystals.push(data);
    interactables.push(data);
  });
}

function createAncientAltar() {
  const altar = new THREE.Group();
  altar.position.set(30, 0, -25);

  createBox(altar, 0, 0.5, 0, 3.5, 1, 3.5, 0x6e7975);
  createBox(altar, 0, 1.15, 0, 2.7, 0.3, 2.7, 0x87918a);

  const core = addMesh(
    new THREE.OctahedronGeometry(0.7, 0),
    makeMaterial(0x75e8ff, 0.25, {
      emissive: 0x238ab4,
      emissiveIntensity: 2.4,
    }),
    altar,
    0, 2.2, 0
  );

  const light = new THREE.PointLight(0x49cfff, 3, 16);
  light.position.set(0, 2.5, 0);
  altar.add(light);

  scene.add(altar);

  const altarData = {
    id: "ancient-altar",
    group: altar,
    crystal: core,
    light,
    type: "altar",
    label: "Altar ancestral",
    collected: false,
  };

  interactables.push(altarData);
}

/* =========================================================
   INIMIGOS E CHEFE
========================================================= */

function createEnemy(position, type = "mist") {
  const isStone = type === "stone";
  const enemy = new THREE.Group();

  enemy.position.set(position[0], 0, position[1]);

  const bodyColor = isStone ? 0x59636b : 0x25394c;
  const bodyMaterial = makeMaterial(bodyColor, 0.75, {
    emissive: isStone ? 0x111820 : 0x12324a,
    emissiveIntensity: 0.45,
  });

  const body = addMesh(
    new THREE.CapsuleGeometry(isStone ? 0.65 : 0.42, isStone ? 0.9 : 0.55, 4, 8),
    bodyMaterial,
    enemy,
    0, isStone ? 1.2 : 1, 0
  );

  body.castShadow = true;

  const head = addMesh(
    new THREE.SphereGeometry(isStone ? 0.42 : 0.32, 10, 8),
    makeMaterial(isStone ? 0x78858a : 0x394f61, 0.65, {
      emissive: 0x172d3a,
      emissiveIntensity: 0.5,
    }),
    enemy,
    0, isStone ? 2.15 : 1.8, 0
  );

  head.castShadow = true;

  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xff5068 });

  for (const x of [-0.13, 0.13]) {
    addMesh(
      new THREE.SphereGeometry(0.055, 8, 6),
      eyeMaterial,
      enemy,
      x, isStone ? 2.2 : 1.85, 0.28
    );
  }

  const scale = isStone ? 1.25 : 1;

  enemy.scale.setScalar(scale);
  scene.add(enemy);

  const data = {
    id: `enemy-${enemies.length + 1}`,
    mesh: enemy,
    type,
    hp: isStone ? 100 : 45,
    maxHp: isStone ? 100 : 45,
    attack: isStone ? 16 : 10,
    defense: isStone ? 5 : 1,
    speed: isStone ? 2.3 : 3.4,
    range: isStone ? 2.7 : 2.1,
    cooldown: random(0.5, 1.5),
    thinkTimer: random(0, 0.2),
    home: new THREE.Vector3(position[0], 0, position[1]),
    state: "idle",
    dead: false,
    hitFlash: 0,
    phase: 1,
    isBoss: false,
    rewardXP: isStone ? 45 : 25,
    rewardGold: isStone ? 15 : 7,
    body,
    head,
  };

  enemies.push(data);
  return data;
}

function createEnemies() {
  [
    [-10, -17, "mist"],
    [16, -20, "mist"],
    [-28, 10, "mist"],
    [25, 25, "mist"],
    [-45, -25, "stone"],
    [48, 15, "stone"],
    [0, 42, "mist"],
    [58, -40, "mist"],
  ].forEach(([x, z, type]) => createEnemy([x, z], type));
}

function createBoss() {
  if (boss || state.bossDefeated) return;

  const mesh = new THREE.Group();
  mesh.position.set(30, 0, -38);
  scene.add(mesh);

  const bodyMaterial = makeMaterial(0x443c50, 0.5, {
    emissive: 0x2b102c,
    emissiveIntensity: 1,
  });

  const body = addMesh(
    new THREE.CapsuleGeometry(1.15, 1.9, 5, 12),
    bodyMaterial,
    mesh,
    0, 2, 0
  );
  body.castShadow = true;

  const head = addMesh(
    new THREE.IcosahedronGeometry(0.9, 1),
    makeMaterial(0x635168, 0.5, {
      emissive: 0x661c53,
      emissiveIntensity: 1.4,
    }),
    mesh,
    0, 4.1, 0
  );

  head.castShadow = true;

  const hornsMaterial = makeMaterial(0x8b9ba3, 0.4);

  for (const side of [-1, 1]) {
    const horn = addMesh(
      new THREE.ConeGeometry(0.25, 1.5, 7),
      hornsMaterial,
      mesh,
      side * 0.7, 4.9, 0
    );

    horn.rotation.z = side * -0.55;

    const arm = addMesh(
      new THREE.CapsuleGeometry(0.32, 1.3, 4, 8),
      bodyMaterial,
      mesh,
      side * 1.35, 2.4, 0
    );

    arm.rotation.z = side * 0.25;
    arm.castShadow = true;
  }

  const eyes = new THREE.MeshBasicMaterial({ color: 0xff334e });

  for (const x of [-0.35, 0.35]) {
    addMesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      eyes,
      mesh,
      x, 4.15, 0.78
    );
  }

  boss = {
    id: "corrupted-guardian",
    mesh,
    body,
    head,
    hp: 650,
    maxHp: 650,
    attack: 22,
    defense: 5,
    speed: 2.6,
    range: 4,
    cooldown: 2,
    thinkTimer: 0,
    home: new THREE.Vector3(30, 0, -38),
    state: "idle",
    dead: false,
    hitFlash: 0,
    phase: 1,
    isBoss: true,
    rewardXP: 300,
    rewardGold: 150,
    telegraph: 0,
    attackType: "",
    attackDuration: 0,
  };

  state.bossSpawned = true;

  showToast("O Guardião Corrompido despertou!");
  showMessage("Uma presença ancestral emerge das ruínas.");
  updateHUD();
}

/* =========================================================
   MOVIMENTO, CÂMERA E COLISÕES
========================================================= */

function getMoveVector() {
  const vector = new THREE.Vector3();

  if (keys.has("KeyW") || touchMoves.has("forward")) vector.z -= 1;
  if (keys.has("KeyS") || touchMoves.has("backward")) vector.z += 1;
  if (keys.has("KeyA") || touchMoves.has("left")) vector.x -= 1;
  if (keys.has("KeyD") || touchMoves.has("right")) vector.x += 1;

  if (vector.lengthSq() > 0) vector.normalize();

  return vector;
}

function getCameraForward() {
  return new THREE.Vector3(
    -Math.sin(cameraState.yaw),
    0,
    -Math.cos(cameraState.yaw)
  ).normalize();
}

function getCameraRight() {
  return new THREE.Vector3(
    Math.cos(cameraState.yaw),
    0,
    -Math.sin(cameraState.yaw)
  ).normalize();
}

function getWorldMoveVector() {
  const local = getMoveVector();

  const forward = getCameraForward();
  const right = getCameraRight();

  return forward.multiplyScalar(-local.z)
    .add(right.multiplyScalar(local.x))
    .normalize();
}

function collidesAt(x, z, radius = 0.65) {
  const limit = CONFIG.worldSize / 2 - 3;

  if (x < -limit || x > limit || z < -limit || z > limit) {
    return true;
  }

  for (const collider of colliders) {
    const dx = x - collider.x;
    const dz = z - collider.z;
    const minimum = radius + collider.radius;

    if (dx * dx + dz * dz < minimum * minimum) {
      return true;
    }
  }

  // Colisão aproximada com inimigos grandes.
  return false;
}

function moveWithCollisions(object, dx, dz, radius = 0.65) {
  const nextX = object.position.x + dx;
  const nextZ = object.position.z + dz;

  if (!collidesAt(nextX, object.position.z, radius)) {
    object.position.x = nextX;
  }

  if (!collidesAt(object.position.x, nextZ, radius)) {
    object.position.z = nextZ;
  }

  object.position.x = clamp(
    object.position.x,
    -CONFIG.worldSize / 2 + 3,
    CONFIG.worldSize / 2 - 3
  );

  object.position.z = clamp(
    object.position.z,
    -CONFIG.worldSize / 2 + 3,
    CONFIG.worldSize / 2 - 3
  );
}

function updatePlayer(delta) {
  if (playerData.dead) return;

  playerData.invulnerable = Math.max(
    0, playerData.invulnerable - delta
  );

  playerData.attackCooldown = Math.max(
    0, playerData.attackCooldown - delta
  );

  playerData.dodgeCooldown = Math.max(
    0, playerData.dodgeCooldown - delta
  );

  playerData.dodgeTime = Math.max(
    0, playerData.dodgeTime - delta
  );

  if (attackAnimation > 0) {
    attackAnimation = Math.max(0, attackAnimation - delta);
  }

  const movement = getWorldMoveVector();

  if (playerData.dodgeTime > 0) {
    const dodgeSpeed = 18;
    const dodgeDirection = movement.lengthSq() > 0
      ? movement
      : getCameraForward();

    moveWithCollisions(
      player,
      dodgeDirection.x * dodgeSpeed * delta,
      dodgeDirection.z * dodgeSpeed * delta
    );
  } else if (movement.lengthSq() > 0) {
    const running = keys.has("Shift");
    const speed = playerData.speed *
      (running ? CONFIG.runMultiplier : 1);

    moveWithCollisions(
      player,
      movement.x * speed * delta,
      movement.z * speed * delta
    );

    player.rotation.y = Math.atan2(movement.x, movement.z);
  }

  // Regeneração gradual de energia.
  playerData.mana = Math.min(
    playerData.maxMana,
    playerData.mana + delta * 2.2
  );

  animatePlayer(delta);
  updateCamera(delta);
}

function updateCamera(delta) {
  const target = player.position.clone();
  target.y += 1.65;

  const pitch = clamp(cameraState.pitch, -0.1, 0.85);

  const horizontal = Math.cos(pitch) * cameraState.distance;
  const vertical = Math.sin(pitch) * cameraState.distance;

  const desired = new THREE.Vector3(
    target.x + Math.sin(cameraState.yaw) * horizontal,
    target.y + vertical,
    target.z + Math.cos(cameraState.yaw) * horizontal
  );

  camera.position.lerp(desired, 1 - Math.exp(-8 * delta));
  camera.lookAt(target);
}

/* =========================================================
   COMBATE
========================================================= */

function attack() {
  if (
    !state.running ||
    state.paused ||
    state.ended ||
    state.inventoryOpen ||
    state.mapOpen ||
    state.skillsOpen ||
    state.settingsOpen ||
    state.dialogueOpen ||
    playerData.dead
  ) {
    return;
  }

  if (playerData.attackCooldown > 0 || playerData.dodgeTime > 0) {
    return;
  }

  playerData.attackCooldown = CONFIG.attackCooldown;
  attackAnimation = 0.38;

  showMessage("A lâmina ancestral corta a névoa.");

  const candidates = [...enemies.filter((e) => !e.dead)];

  if (boss && !boss.dead) candidates.push(boss);

  let target = null;
  let bestScore = Infinity;

  const forward = new THREE.Vector3(
    Math.sin(player.rotation.y),
    0,
    Math.cos(player.rotation.y)
  );

  for (const enemy of candidates) {
    const dx = enemy.mesh.position.x - player.position.x;
    const dz = enemy.mesh.position.z - player.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    const direction = new THREE.Vector3(dx, 0, dz).normalize();
    const facing = forward.dot(direction);

    if (distance > CONFIG.attackRange + (enemy.isBoss ? 1.5 : 0)) {
      continue;
    }

    if (facing < -0.25) continue;

    const score = distance - facing * 0.5;

    if (score < bestScore) {
      bestScore = score;
      target = enemy;
    }
  }

  if (!target) {
    showToast("Você não alcançou nenhum inimigo.");
    return;
  }

  const critical = Math.random() < 0.1;
  const rawDamage = playerData.attack * (critical ? 1.8 : 1);
  const damage = Math.max(1, Math.round(rawDamage - target.defense));

  damageEnemy(target, damage);

  if (critical) {
    showToast(`Golpe crítico! ${damage} de dano`);
  } else {
    showToast(`${damage} de dano`);
  }
}

function damageEnemy(enemy, damage) {
  if (!enemy || enemy.dead) return;

  enemy.hp = Math.max(0, enemy.hp - damage);
  enemy.hitFlash = 0.18;
  enemy.state = enemy.hp <= 0 ? "dead" : "hurt";

  // Pequeno recuo ao receber dano.
  if (!enemy.isBoss) {
    const away = enemy.mesh.position.clone().sub(player.position);
    away.y = 0;

    if (away.lengthSq() > 0.001) {
      away.normalize();

      const nextX = enemy.mesh.position.x + away.x * 0.25;
      const nextZ = enemy.mesh.position.z + away.z * 0.25;

      if (!collidesAt(nextX, nextZ, enemy.type === "stone" ? 0.9 : 0.55)) {
        enemy.mesh.position.x = nextX;
        enemy.mesh.position.z = nextZ;
      }
    }
  }

  if (enemy.isBoss) {
    if (enemy.hp <= enemy.maxHp * 0.5 && enemy.phase === 1) {
      enemy.phase = 2;
      enemy.speed *= 1.35;
      enemy.attack *= 1.25;
      showToast("O guardião entra em fúria!");
    }

    updateHUD();
  }

  if (enemy.hp <= 0) {
    killEnemy(enemy);
  }
}

function killEnemy(enemy) {
  if (enemy.dead) return;

  enemy.dead = true;
  enemy.state = "dead";

  if (enemy.isBoss) {
    state.bossDefeated = true;
    state.ended = true;
    state.running = false;

    enemy.mesh.visible = false;

    playerData.xp += enemy.rewardXP;
    playerData.gold += enemy.rewardGold;
    processLevelUps();

    updateHUD();
    saveGame();

    setScreen(ui.endScreen, true);
    if (ui.endTitle) ui.endTitle.textContent = "O Reino Renascido";
    if (ui.endDescription) {
      ui.endDescription.textContent =
        "O Guardião Corrompido caiu. A névoa começa a desaparecer " +
        "e os ecos ancestrais voltam a percorrer Veyra. " +
        "Sua jornada, porém, está apenas começando.";
    }

    showMessage("Você restaurou o equilíbrio de Veyra.");
    return;
  }

  enemy.mesh.visible = false;
  playerData.xp += enemy.rewardXP;
  playerData.gold += enemy.rewardGold;

  showToast(`Inimigo derrotado! +${enemy.rewardXP} XP`);
  processLevelUps();
  updateHUD();
}

function damagePlayer(amount) {
  if (
    playerData.dead ||
    playerData.invulnerable > 0 ||
    playerData.dodgeTime > 0
  ) {
    return;
  }

  const damage = Math.max(1, amount - playerData.defense);

  playerData.hp = Math.max(0, playerData.hp - damage);
  playerData.invulnerable = 0.75;

  showToast(`Você recebeu ${damage} de dano.`);
  updateHUD();

  if (playerData.hp <= 0) {
    defeatPlayer();
  }
}

function defeatPlayer() {
  if (playerData.dead) return;

  playerData.dead = true;
  state.running = false;
  state.ended = true;

  saveGame();

  setScreen(ui.endScreen, true);

  if (ui.endTitle) ui.endTitle.textContent = "A Névoa Venceu";
  if (ui.endDescription) {
    ui.endDescription.textContent =
      "O guardião caiu diante das forças corrompidas. " +
      "Você pode tentar novamente e continuar a explorar Veyra.";
  }
}

function dodge() {
  if (
    !state.running ||
    state.paused ||
    state.ended ||
    playerData.dead ||
    playerData.dodgeCooldown > 0 ||
    playerData.dodgeTime > 0
  ) {
    return;
  }

  playerData.dodgeTime = CONFIG.dodgeDuration;
  playerData.dodgeCooldown = CONFIG.dodgeCooldown;
  playerData.invulnerable = CONFIG.dodgeDuration;

  showMessage("Você se esquiva.");
}

function useSpecialSkill() {
  if (!state.running || state.paused || state.ended || playerData.dead) {
    return;
  }

  if (playerData.mana < 20) {
    showToast("Energia insuficiente.");
    return;
  }

  playerData.mana -= 20;

  const radius = 7;
  let hits = 0;

  for (const enemy of enemies) {
    if (enemy.dead) continue;

    if (distanceXZ(player.position, enemy.mesh.position) <= radius) {
      damageEnemy(enemy, Math.max(10, playerData.attack * 1.5));
      hits++;
    }
  }

  if (boss && !boss.dead &&
      distanceXZ(player.position, boss.mesh.position) <= radius) {
    damageEnemy(boss, Math.max(10, playerData.attack * 1.5));
    hits++;
  }

  const burst = new THREE.Mesh(
    new THREE.TorusGeometry(3.5, 0.12, 8, 48),
    new THREE.MeshBasicMaterial({
      color: 0x75e8ff,
      transparent: true,
      opacity: 0.9,
    })
  );

  burst.rotation.x = Math.PI / 2;
  burst.position.set(player.position.x, 0.3, player.position.z);
  scene.add(burst);

  let age = 0;

  function animateBurst() {
    if (!scene || !burst.parent) return;

    age += 0.04;
    burst.scale.setScalar(1 + age);
    burst.material.opacity = Math.max(0, 0.9 - age);

    if (age >= 1) {
      scene.remove(burst);
      burst.geometry.dispose();
      burst.material.dispose();
      return;
    }

    requestAnimationFrame(animateBurst);
  }

  animateBurst();

  showToast(
    hits ? `Explosão ancestral! ${hits} alvo(s) atingido(s).`
      : "A energia ancestral se dissipa."
  );

  updateHUD();
}

/* =========================================================
   IA DOS INIMIGOS
========================================================= */

function updateEnemies(delta) {
  enemyThinkTimer -= delta;

  const updateDecisions = enemyThinkTimer <= 0;

  if (updateDecisions) {
    enemyThinkTimer = CONFIG.enemyThinkInterval;
  }

  for (const enemy of enemies) {
    if (enemy.dead) continue;

    enemy.cooldown = Math.max(0, enemy.cooldown - delta);
    enemy.hitFlash = Math.max(0, enemy.hitFlash - delta);

    if (enemy.hitFlash > 0) {
      enemy.mesh.scale.setScalar(
        (enemy.type === "stone" ? 1.25 : 1) * 1.04
      );
    } else {
      enemy.mesh.scale.setScalar(
        enemy.type === "stone" ? 1.25 : 1
      );
    }

    if (playerData.dead) continue;

    const dist = distanceXZ(player.position, enemy.mesh.position);
    const homeDist = distanceXZ(enemy.home, enemy.mesh.position);

    if (updateDecisions) {
      if (dist < 19 && homeDist < 32) {
        enemy.state = dist <= enemy.range ? "attack" : "chase";
      } else if (homeDist > 2.5) {
        enemy.state = "return";
      } else {
        enemy.state = "idle";
      }
    }

    if (enemy.state === "chase" || enemy.state === "return") {
      const target = enemy.state === "return"
        ? enemy.home
        : player.position;

      const direction = new THREE.Vector3(
        target.x - enemy.mesh.position.x,
        0,
        target.z - enemy.mesh.position.z
      );

      if (direction.lengthSq() > 0.1) {
        direction.normalize();

        const speed = enemy.speed *
          (enemy.state === "return" ? 1.1 : 1);

        const nx = enemy.mesh.position.x + direction.x * speed * delta;
        const nz = enemy.mesh.position.z + direction.z * speed * delta;

        if (!collidesAt(nx, nz, enemy.type === "stone" ? 0.9 : 0.55)) {
          enemy.mesh.position.x = nx;
          enemy.mesh.position.z = nz;
        }

        enemy.mesh.rotation.y = Math.atan2(direction.x, direction.z);
      }
    }

    if (enemy.state === "attack" && enemy.cooldown <= 0 && dist <= enemy.range + 0.5) {
      enemy.cooldown = enemy.type === "stone" ? 1.8 : 1.25;

      if (Math.random() > 0.15) {
        damagePlayer(enemy.attack);
      }
    }
  }

  if (boss && !boss.dead) {
    updateBoss(delta);
  }
}

function updateBoss(delta) {
  boss.cooldown = Math.max(0, boss.cooldown - delta);
  boss.telegraph = Math.max(0, boss.telegraph - delta);

  const dist = distanceXZ(player.position, boss.mesh.position);

  if (dist > 35) {
    boss.state = "idle";
    return;
  }

  if (dist > boss.range && boss.cooldown <= 0) {
    const direction = player.position.clone().sub(boss.mesh.position);
    direction.y = 0;

    if (direction.lengthSq() > 0.1) {
      direction.normalize();

      const nx = boss.mesh.position.x + direction.x * boss.speed * delta;
      const nz = boss.mesh.position.z + direction.z * boss.speed * delta;

      if (!collidesAt(nx, nz, 1.5)) {
        boss.mesh.position.x = nx;
        boss.mesh.position.z = nz;
      }

      boss.mesh.rotation.y = Math.atan2(direction.x, direction.z);
    }
  }

  if (boss.cooldown <= 0) {
    boss.cooldown = boss.phase === 1 ? 2.4 : 1.65;
    boss.attackType = Math.random() < 0.5 ? "melee" : "area";
    boss.telegraph = 0.7;
    boss.state = "telegraph";

    showMessage(
      boss.attackType === "area"
        ? "O guardião prepara uma explosão! Afaste-se!"
        : "O guardião prepara um golpe devastador!"
    );
  }

  if (boss.telegraph > 0) {
    if (boss.attackType === "area") {
      boss.mesh.scale.setScalar(
        1 + Math.sin(state.playTime * 18) * 0.04
      );
    }

    return;
  }

  boss.mesh.scale.setScalar(1);

  if (boss.state === "telegraph") {
    boss.state = "attack";

    const distance = distanceXZ(player.position, boss.mesh.position);

    if (boss.attackType === "melee") {
      if (distance <= boss.range + 1) {
        damagePlayer(boss.attack);
      }
    } else if (distance <= (boss.phase === 2 ? 10 : 7)) {
      damagePlayer(boss.attack * 1.3);
    }

    boss.cooldown = boss.phase === 1 ? 2.1 : 1.5;
    boss.state = "chase";
  }
}

/* =========================================================
   MISSÃO E PROGRESSÃO
========================================================= */

function processLevelUps() {
  while (playerData.xp >= playerData.xpNext) {
    playerData.xp -= playerData.xpNext;
    playerData.level++;
    playerData.xpNext = Math.floor(playerData.xpNext * 1.45);
    playerData.skillPoints++;

    playerData.maxHp += 15;
    playerData.maxMana += 5;
    playerData.attack += 3;

    playerData.hp = playerData.maxHp;
    playerData.mana = playerData.maxMana;

    showToast(`Nível ${playerData.level}! +1 ponto de habilidade`);
  }

  updateHUD();
}

function updateQuest() {
  if (state.crystals < 5) {
    setQuest(
      "O chamado antigo",
      "Explore a ilha esquecida, encontre os cristais ancestrais e descubra a origem da corrupção.",
      `Cristais: ${state.crystals} / 5`
    );
  } else if (!state.bossDefeated) {
    setQuest(
      "O guardião corrompido",
      "Os cinco cristais ressoam juntos. Encontre o guardião nas ruínas do altar e encerre a corrupção.",
      "Objetivo: Derrote o Guardião Corrompido"
    );
  } else {
    setQuest(
      "Ecos restaurados",
      "A corrupção recuou. Os segredos de Veyra aguardam uma nova jornada.",
      "Missão principal concluída"
    );
  }
}

function collectCrystal(crystal) {
  if (crystal.collected) return;

  crystal.collected = true;
  crystal.group.visible = false;
  state.crystals++;

  playerData.xp += 20;
  playerData.mana = Math.min(
    playerData.maxMana,
    playerData.mana + 10
  );

  processLevelUps();
  updateQuest();

  showToast(`Cristal ancestral obtido (${state.crystals}/5)`);
  showMessage("A energia do cristal percorre sua espada.");

  if (state.crystals >= 5 && !state.bossSpawned && !state.bossDefeated) {
    createBoss();
    setQuest(
      "O guardião corrompido",
      "Os cinco cristais despertaram o antigo guardião. Prepare-se para a batalha.",
      "Objetivo: Derrote o Guardião Corrompido"
    );
  }

  updateHUD();
}

function interact() {
  if (!state.running || state.paused || state.ended || playerData.dead) {
    return;
  }

  if (!selectedInteractable) {
    showToast("Não há nada para interagir por perto.");
    return;
  }

  if (selectedInteractable.type === "crystal") {
    collectCrystal(selectedInteractable);
    return;
  }

  if (selectedInteractable.type === "altar") {
    if (state.crystals < 5) {
      showToast(`O altar exige cinco cristais. Você possui ${state.crystals}.`);
    } else if (!state.bossSpawned && !state.bossDefeated) {
      createBoss();
    } else {
      showToast("O altar ressoa com a energia ancestral.");
    }
  }
}

function updateInteractions() {
  let nearest = null;
  let nearestDistance = Infinity;

  for (const item of interactables) {
    if (item.collected || !item.group.visible) continue;

    const distance = distanceXZ(player.position, item.group.position);

    if (distance < 4 && distance < nearestDistance) {
      nearest = item;
      nearestDistance = distance;
    }
  }

  selectedInteractable = nearest;

  if (nearest) {
    ui.interactionPrompt?.classList.remove("hidden");

    if (ui.interactionText) {
      ui.interactionText.textContent = nearest.label;
    }
  } else {
    ui.interactionPrompt?.classList.add("hidden");
  }
}

function updateCrystals(delta) {
  for (const crystal of crystals) {
    if (crystal.collected) continue;

    crystal.group.rotation.y += delta * 0.5;
    crystal.group.position.y =
      crystal.baseY + Math.sin(state.playTime * 1.7) * 0.18;

    crystal.crystal.rotation.y += delta * 0.4;
    crystal.ring.rotation.z += delta * 0.65;
  }
}

/* =========================================================
   INVENTÁRIO E HABILIDADES
========================================================= */

function addItem(item) {
  const existing = inventory.find((entry) => entry.id === item.id);

  if (existing && item.stackable) {
    existing.quantity += item.quantity ?? 1;
  } else {
    inventory.push({
      ...item,
      quantity: item.quantity ?? 1,
    });
  }

  renderInventory();
}

function renderInventory() {
  if (!ui.inventoryItems) return;

  ui.inventoryItems.replaceChildren();

  if (ui.inventoryCount) {
    ui.inventoryCount.textContent = `Itens: ${inventory.length}`;
  }

  if (ui.goldText) {
    ui.goldText.textContent = `Ouro: ${playerData.gold}`;
  }

  if (inventory.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Seu inventário está vazio.";
    ui.inventoryItems.appendChild(empty);
  }

  inventory.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "inventory-slot";
    button.classList.toggle("selected", state.selectedItem === item.id);

    const icon = document.createElement("span");
    icon.className = "item-icon";
    icon.textContent = item.icon ?? "◇";

    const name = document.createElement("span");
    name.className = "item-name";
    name.textContent = item.name;

    const quantity = document.createElement("span");
    quantity.className = "item-quantity";
    quantity.textContent = `x${item.quantity}`;

    button.append(icon, name, quantity);

    button.addEventListener("click", () => {
      state.selectedItem = item.id;
      renderInventory();
      renderItemDetails(item);
    });

    ui.inventoryItems.appendChild(button);
  });

  const selected = inventory.find((item) => item.id === state.selectedItem);

  if (selected) {
    renderItemDetails(selected);
  } else {
    if (ui.itemDetails) {
      ui.itemDetails.textContent = "Selecione um item para ver seus detalhes.";
    }

    if (ui.useItemButton) ui.useItemButton.disabled = true;
    if (ui.equipItemButton) ui.equipItemButton.disabled = true;
  }
}

function renderItemDetails(item) {
  if (!ui.itemDetails) return;

  ui.itemDetails.textContent =
    `${item.name} — ${item.description ?? "Sem descrição."} ` +
    `Categoria: ${item.category ?? "Material"}.`;

  if (ui.useItemButton) {
    ui.useItemButton.disabled = item.type !== "potion";
  }

  if (ui.equipItemButton) {
    ui.equipItemButton.disabled = item.type !== "weapon";
  }
}

function useSelectedItem() {
  const item = inventory.find((entry) => entry.id === state.selectedItem);

  if (!item || item.type !== "potion") return;

  if (playerData.hp >= playerData.maxHp) {
    showToast("Sua vitalidade já está completa.");
    return;
  }

  playerData.hp = Math.min(playerData.maxHp, playerData.hp + 40);
  item.quantity--;

  if (item.quantity <= 0) {
    inventory.splice(inventory.indexOf(item), 1);
    state.selectedItem = null;
  }

  showToast("Poção utilizada: +40 de vitalidade.");
  updateHUD();
  renderInventory();
}

function equipSelectedItem() {
  const item = inventory.find((entry) => entry.id === state.selectedItem);

  if (!item || item.type !== "weapon") return;

  playerData.attack += item.attackBonus ?? 5;

  item.type = "equipped";
  item.description = "Arma equipada.";
  item.attackBonus = 0;

  showToast(`${item.name} equipada!`);
  renderInventory();
  updateHUD();
}

function renderSkills() {
  if (!ui.skillsList) return;

  ui.skillsList.replaceChildren();

  if (ui.skillPointsText) {
    ui.skillPointsText.textContent =
      `Pontos disponíveis: ${playerData.skillPoints}`;
  }

  const skills = [
    {
      id: "strength",
      name: "Força ancestral",
      description: "+5 de ataque permanente.",
      apply: () => { playerData.attack += 5; },
    },
    {
      id: "vitality",
      name: "Vitalidade",
      description: "+25 de vida máxima e recuperação total.",
      apply: () => {
        playerData.maxHp += 25;
        playerData.hp = playerData.maxHp;
      },
    },
    {
      id: "energy",
      name: "Energia mística",
      description: "+15 de energia máxima.",
      apply: () => {
        playerData.maxMana += 15;
        playerData.mana = playerData.maxMana;
      },
    },
    {
      id: "defense",
      name: "Pele de pedra",
      description: "+2 de defesa permanente.",
      apply: () => { playerData.defense += 2; },
    },
  ];

  for (const skill of skills) {
    const card = document.createElement("div");
    card.className = "skill-card";

    const title = document.createElement("strong");
    title.textContent = skill.name;

    const description = document.createElement("span");
    description.textContent = skill.description;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "DESBLOQUEAR";
    button.disabled = playerData.skillPoints <= 0;

    button.addEventListener("click", () => {
      if (playerData.skillPoints <= 0) return;

      playerData.skillPoints--;
      skill.apply();

      showToast(`Habilidade desbloqueada: ${skill.name}`);
      renderSkills();
      updateHUD();
    });

    card.append(title, description, button);
    ui.skillsList.appendChild(card);
  }
}

/* =========================================================
   MAPA E CONFIGURAÇÕES
========================================================= */

function renderMap() {
  if (!ui.worldMap) return;

  ui.worldMap.replaceChildren();

  const locations = [
    { name: "Ilha Esquecida", x: 50, y: 50, color: "#75e8ff" },
    { name: "Floresta dos Sussurros", x: 25, y: 35, color: "#4f9d73" },
    { name: "Ruínas de Aether", x: 68, y: 28, color: "#e9c77b" },
    { name: "Vale das Cinzas", x: 72, y: 70, color: "#bb8c92" },
    { name: "Lago Cristalino", x: 30, y: 75, color: "#6eb8e8" },
  ];

  const map = document.createElement("div");
  map.style.position = "relative";
  map.style.width = "100%";
  map.style.height = "240px";

  for (const location of locations) {
    const marker = document.createElement("div");

    marker.style.position = "absolute";
    marker.style.left = `${location.x}%`;
    marker.style.top = `${location.y}%`;
    marker.style.width = "10px";
    marker.style.height = "10px";
    marker.style.borderRadius = "50%";
    marker.style.background = location.color;
    marker.style.boxShadow = `0 0 12px ${location.color}`;
    marker.title = location.name;

    map.appendChild(marker);
  }

  const playerMarker = document.createElement("div");
  playerMarker.style.position = "absolute";
  playerMarker.style.left =
    `${clamp(50 + player.position.x / CONFIG.worldSize * 90, 5, 95)}%`;
  playerMarker.style.top =
    `${clamp(50 + player.position.z / CONFIG.worldSize * 90, 5, 95)}%`;
  playerMarker.style.width = "12px";
  playerMarker.style.height = "12px";
  playerMarker.style.borderRadius = "50%";
  playerMarker.style.background = "#ffffff";
  playerMarker.style.border = "2px solid #75e8ff";
  playerMarker.title = "Você";

  map.appendChild(playerMarker);
  ui.worldMap.appendChild(map);

  if (ui.mapLocation) {
    ui.mapLocation.textContent =
      `Localização: ${state.location} · Cristais: ${state.crystals}/5`;
  }
}

function applySettings() {
  if (ui.graphicsSelect) {
    settings.graphics = ui.graphicsSelect.value;
  }

  if (ui.volumeInput) {
    settings.volume = Number(ui.volumeInput.value);
  }

  if (ui.shadowsToggle) {
    settings.shadows = ui.shadowsToggle.checked;
  }

  if (ui.sensitivityInput) {
    cameraState.sensitivity = Number(ui.sensitivityInput.value);
  }

  if (renderer) {
    const pixelRatio = settings.graphics === "low"
      ? 1
      : settings.graphics === "high"
        ? Math.min(window.devicePixelRatio || 1, 2)
        : Math.min(window.devicePixelRatio || 1, 1.5);

    renderer.setPixelRatio(pixelRatio);
    renderer.shadowMap.enabled = settings.shadows;
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  if (sunLight) {
    sunLight.castShadow = settings.shadows &&
      settings.graphics !== "low";
  }

  saveGame();
  showToast("Configurações aplicadas.");
}

/* =========================================================
   SALVAMENTO
========================================================= */

function saveGame() {
  if (!player || !scene) return false;

  const save = {
    version: 1,
    player: {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      rotation: player.rotation.y,
      ...playerData,
    },
    crystals: crystals.map((crystal) => crystal.collected),
    bossDefeated: state.bossDefeated,
    bossSpawned: state.bossSpawned,
    playTime: state.playTime,
    gold: playerData.gold,
    inventory: inventory.map((item) => ({ ...item })),
    settings: { ...settings },
    camera: {
      yaw: cameraState.yaw,
      pitch: cameraState.pitch,
    },
  };

  try {
    localStorage.setItem(CONFIG.saveKey, JSON.stringify(save));
    saveRequested = false;
    showToast("Jogo salvo neste dispositivo.");
    return true;
  } catch (error) {
    console.error("Não foi possível salvar:", error);
    showToast("Falha ao salvar. Verifique o armazenamento do navegador.");
    return false;
  }
}

function readSave() {
  try {
    const raw = localStorage.getItem(CONFIG.saveKey);
    if (!raw) return null;

    const save = JSON.parse(raw);

    if (
      !save ||
      save.version !== 1 ||
      !save.player ||
      !Number.isFinite(save.player.x) ||
      !Number.isFinite(save.player.z) ||
      !Array.isArray(save.crystals)
    ) {
      return null;
    }

    return save;
  } catch (error) {
    console.warn("Save inválido:", error);
    return null;
  }
}

function loadGame() {
  const save = readSave();

  if (!save) {
    showToast("Nenhum salvamento válido encontrado.");
    return false;
  }

  const p = save.player;

  player.position.set(
    clamp(p.x, -85, 85),
    0,
    clamp(p.z, -85, 85)
  );

  player.rotation.y = Number.isFinite(p.rotation) ? p.rotation : 0;

  const numericFields = [
    "hp", "maxHp", "mana", "maxMana", "level", "xp",
    "xpNext", "attack", "defense", "speed", "skillPoints", "gold",
  ];

  for (const field of numericFields) {
    if (Number.isFinite(p[field])) {
      playerData[field] = p[field];
    }
  }

  playerData.hp = clamp(playerData.hp, 1, playerData.maxHp);
  playerData.mana = clamp(playerData.mana, 0, playerData.maxMana);
  playerData.dead = false;

  state.crystals = 0;

  crystals.forEach((crystal, index) => {
    crystal.collected = Boolean(save.crystals[index]);
    crystal.group.visible = !crystal.collected;

    if (crystal.collected) state.crystals++;
  });

  state.bossDefeated = Boolean(save.bossDefeated);
  state.bossSpawned = false;
  state.playTime = Number.isFinite(save.playTime) ? save.playTime : 0;

  inventory.splice(0, inventory.length);

  if (Array.isArray(save.inventory)) {
    for (const item of save.inventory) {
      if (
        item &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        Number.isFinite(item.quantity) &&
        item.quantity > 0
      ) {
        inventory.push({ ...item });
      }
    }
  }

  if (save.settings && typeof save.settings === "object") {
    Object.assign(settings, save.settings);

    if (ui.graphicsSelect) {
      ui.graphicsSelect.value = settings.graphics;
    }

    if (ui.volumeInput) {
      ui.volumeInput.value = String(settings.volume);
    }

    if (ui.shadowsToggle) {
      ui.shadowsToggle.checked = settings.shadows;
    }
  }

  if (save.camera) {
    cameraState.yaw = Number.isFinite(save.camera.yaw)
      ? save.camera.yaw
      : 0;

    cameraState.pitch = Number.isFinite(save.camera.pitch)
      ? save.camera.pitch
      : 0.27;
  }

  if (state.crystals >= 5 && !state.bossDefeated) {
    createBoss();
  }

  if (state.bossDefeated && boss) {
    boss.dead = true;
    boss.mesh.visible = false;
  }

  applySettings();
  updateQuest();
  updateHUD();
  renderInventory();

  showToast("Progresso carregado.");
  return true;
}

function startNewGame() {
  const existing = readSave();

  if (existing) {
    const confirmed = window.confirm(
      "Iniciar uma nova jornada? O salvamento atual será substituído."
    );

    if (!confirmed) return;
  }

  locationReloadWorld();
}

function locationReloadWorld() {
  // Reiniciar a sessão sem duplicar a cena ou os listeners.
  player.position.set(0, 0, 0);
  player.rotation.set(0, 0, 0);

  Object.assign(playerData, {
    hp: 100,
    maxHp: 100,
    mana: 50,
    maxMana: 50,
    level: 1,
    xp: 0,
    xpNext: 100,
    attack: 20,
    defense: 3,
    speed: CONFIG.playerSpeed,
    skillPoints: 0,
    gold: 0,
    invulnerable: 0,
    attackCooldown: 0,
    dodgeCooldown: 0,
    dodgeTime: 0,
    dead: false,
  });

  inventory.length = 0;
  state.selectedItem = null;
  state.crystals = 0;
  state.bossDefeated = false;
  state.bossSpawned = false;
  state.playTime = 0;
  state.ended = false;
  state.victory = false;

  crystals.forEach((crystal) => {
    crystal.collected = false;
    crystal.group.visible = true;
  });

  for (const enemy of enemies) {
    enemy.dead = false;
    enemy.hp = enemy.maxHp;
    enemy.state = "idle";
    enemy.cooldown = random(0.5, 1.5);
    enemy.mesh.visible = true;
    enemy.mesh.position.copy(enemy.home);
  }

  if (boss) {
    scene.remove(boss.mesh);
    boss.mesh.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => material.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
    boss = null;
  }

  localStorage.removeItem(CONFIG.saveKey);

  cameraState.yaw = 0;
  cameraState.pitch = 0.27;

  setScreen(ui.endScreen, false);
  setScreen(ui.pauseScreen, false);
  setScreen(ui.startScreen, false);

  state.started = true;
  state.running = true;
  state.paused = false;

  updateQuest();
  updateHUD();
  renderInventory();
  showMessage("A névoa esconde segredos antigos...");

  if (isTouchDevice()) {
    ui.mobileControls?.classList.remove("hidden");
  }

  renderer.domElement.focus();
}

/* =========================================================
   PAUSA, MENUS E CONTROLES
========================================================= */

function isTouchDevice() {
  return window.matchMedia("(pointer: coarse)").matches ||
    navigator.maxTouchPoints > 0;
}

function pauseGame() {
  if (!state.started || state.ended || state.paused) return;

  state.paused = true;
  state.running = false;

  setScreen(ui.pauseScreen, true);

  if (document.pointerLockElement) {
    document.exitPointerLock();
  }
}

function resumeGame() {
  if (state.ended || playerData.dead) return;

  state.paused = false;
  state.running = true;

  setScreen(ui.pauseScreen, false);
  setScreen(ui.settingsScreen, false);

  clock.getDelta();

  if (!isTouchDevice()) {
    renderer.domElement.requestPointerLock?.();
  }
}

function toggleInventory() {
  if (!state.started || state.ended) return;

  if (state.inventoryOpen) {
    state.inventoryOpen = false;
    setScreen(ui.inventoryScreen, false);
    return;
  }

  closeOtherMenus();

  state.inventoryOpen = true;
  setScreen(ui.inventoryScreen, true);
  renderInventory();
}

function toggleMap() {
  if (!state.started || state.ended) return;

  if (state.mapOpen) {
    state.mapOpen = false;
    setScreen(ui.mapScreen, false);
    return;
  }

  closeOtherMenus();

  state.mapOpen = true;
  setScreen(ui.mapScreen, true);
  renderMap();
}

function toggleSkills() {
  if (!state.started || state.ended) return;

  if (state.skillsOpen) {
    state.skillsOpen = false;
    setScreen(ui.skillsScreen, false);
    return;
  }

  closeOtherMenus();

  state.skillsOpen = true;
  setScreen(ui.skillsScreen, true);
  renderSkills();
}

function closeOtherMenus() {
  state.inventoryOpen = false;
  state.mapOpen = false;
  state.skillsOpen = false;
  state.settingsOpen = false;
  state.dialogueOpen = false;

  setScreen(ui.inventoryScreen, false);
  setScreen(ui.mapScreen, false);
  setScreen(ui.skillsScreen, false);
  setScreen(ui.settingsScreen, false);
  setScreen(ui.dialogueScreen, false);
}

function openSettings() {
  state.settingsOpen = true;
  setScreen(ui.settingsScreen, true);
}

function closeSettings() {
  state.settingsOpen = false;
  setScreen(ui.settingsScreen, false);
}

function closeMenuWithEscape() {
  if (state.dialogueOpen) {
    state.dialogueOpen = false;
    setScreen(ui.dialogueScreen, false);
    return;
  }

  if (state.inventoryOpen) {
    toggleInventory();
    return;
  }

  if (state.mapOpen) {
    toggleMap();
    return;
  }

  if (state.skillsOpen) {
    toggleSkills();
    return;
  }

  if (state.settingsOpen) {
    closeSettings();

    if (state.paused) {
      setScreen(ui.pauseScreen, true);
    }

    return;
  }

  if (state.paused) {
    resumeGame();
  } else {
    pauseGame();
  }
}

function setupControls() {
  window.addEventListener("keydown", (event) => {
    if ([
      "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    ].includes(event.code)) {
      event.preventDefault();
    }

    if (event.repeat && [
      "KeyE", "Tab", "KeyM", "Escape", "Space", "KeyQ",
    ].includes(event.code)) {
      return;
    }

    keys.add(event.code);

    if (event.code === "Escape") {
      closeMenuWithEscape();
      return;
    }

    if (event.code === "Tab") {
      event.preventDefault();
      toggleInventory();
      return;
    }

    if (event.code === "KeyM") {
      toggleMap();
      return;
    }

    if (event.code === "KeyK") {
      toggleSkills();
      return;
    }

    if (event.code === "KeyE") {
      interact();
      return;
    }

    if (event.code === "Space") {
      dodge();
      return;
    }

    if (event.code === "KeyQ") {
      useSpecialSkill();
      return;
    }
  });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.code);
  });

  window.addEventListener("blur", () => {
    keys.clear();
    touchMoves.clear();

    if (state.running) pauseGame();
  });

  renderer.domElement.addEventListener("click", () => {
    if (!state.running || state.paused || isTouchDevice()) return;

    if (document.pointerLockElement !== renderer.domElement) {
      renderer.domElement.requestPointerLock?.();
    } else {
      attack();
    }
  });

  renderer.domElement.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  document.addEventListener("pointerlockchange", () => {
    state.pointerLocked =
      document.pointerLockElement === renderer.domElement;
  });

  document.addEventListener("mousemove", (event) => {
    if (!state.running || state.paused || !state.pointerLocked) return;

    cameraState.yaw -= event.movementX * 0.002 * cameraState.sensitivity;
    cameraState.pitch = clamp(
      cameraState.pitch + event.movementY * 0.0018 * cameraState.sensitivity,
      -0.1,
      0.85
    );
  });

  // Câmera por arraste em dispositivos sem mouse.
  renderer.domElement.addEventListener("pointerdown", (event) => {
    if (!isTouchDevice() || !state.running || state.paused) return;

    cameraState.dragging = true;
    cameraState.lastX = event.clientX;
    cameraState.lastY = event.clientY;
  });

  window.addEventListener("pointermove", (event) => {
    if (!cameraState.dragging || !isTouchDevice()) return;

    const dx = event.clientX - cameraState.lastX;
    const dy = event.clientY - cameraState.lastY;

    cameraState.yaw -= dx * 0.006 * cameraState.sensitivity;
    cameraState.pitch = clamp(
      cameraState.pitch + dy * 0.004 * cameraState.sensitivity,
      -0.1,
      0.85
    );

    cameraState.lastX = event.clientX;
    cameraState.lastY = event.clientY;
  });

  window.addEventListener("pointerup", () => {
    cameraState.dragging = false;
  });

  window.addEventListener("pointercancel", () => {
    cameraState.dragging = false;
    touchMoves.clear();
  });

  // Movimento por toque.
  document.querySelectorAll("[data-move]").forEach((button) => {
    const move = button.dataset.move;

    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      touchMoves.add(move);
      button.setPointerCapture?.(event.pointerId);
    });

    const release = () => touchMoves.delete(move);

    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();

      switch (button.dataset.action) {
        case "attack":
          attack();
          break;
        case "dodge":
          dodge();
          break;
        case "interact":
          interact();
          break;
        case "skill":
          useSpecialSkill();
          break;
      }
    });
  });

  // Interface.
  $("startButton")?.addEventListener("click", startNewGame);

  ui.continueButton?.addEventListener("click", () => {
    if (loadGame()) {
      state.started = true;
      state.running = true;
      state.paused = false;

      setScreen(ui.startScreen, false);

      if (isTouchDevice()) {
        ui.mobileControls?.classList.remove("hidden");
      }
    }
  });

  $("resumeButton")?.addEventListener("click", resumeGame);
  $("restartButton")?.addEventListener("click", startNewGame);

  $("pauseSaveButton")?.addEventListener("click", saveGame);
  $("pauseSettingsButton")?.addEventListener("click", () => {
    setScreen(ui.pauseScreen, false);
    openSettings();
  });

  $("openSettingsButton")?.addEventListener("click", () => {
    setScreen(ui.startScreen, false);
    openSettings();
  });

  $("closeSettingsButton")?.addEventListener("click", () => {
    closeSettings();

    if (!state.started) {
      setScreen(ui.startScreen, true);
    } else if (state.paused) {
      setScreen(ui.pauseScreen, true);
    }
  });

  $("saveSettingsButton")?.addEventListener("click", () => {
    applySettings();
    closeSettings();

    if (!state.started) {
      setScreen(ui.startScreen, true);
    } else if (state.paused) {
      setScreen(ui.pauseScreen, true);
    }
  });

  $("closeInventoryButton")?.addEventListener("click", toggleInventory);
  $("closeMapButton")?.addEventListener("click", toggleMap);
  $("closeSkillsButton")?.addEventListener("click", toggleSkills);

  ui.useItemButton?.addEventListener("click", useSelectedItem);
  ui.equipItemButton?.addEventListener("click", equipSelectedItem);

  $("mainMenuButton")?.addEventListener("click", () => {
    saveGame();

    state.running = false;
    state.paused = false;
    state.started = false;

    closeOtherMenus();
    setScreen(ui.pauseScreen, false);
    setScreen(ui.startScreen, true);

    ui.continueButton.disabled = !readSave();
  });

  // Ajusta o botão Continuar conforme o salvamento disponível.
  if (ui.continueButton) {
    ui.continueButton.disabled = !readSave();
  }
}

/* =========================================================
   CICLO DE JOGO
========================================================= */

function updateEnvironment(delta) {
  if (sky) {
    sky.rotation.y += delta * 0.002;
  }

  if (ambientLight && sunLight) {
    const cycle = (Math.sin(state.playTime * 0.025) + 1) / 2;

    sunLight.intensity = 0.8 + cycle * 1.8;
    ambientLight.intensity = 0.7 + cycle * 1.0;

    const dayColor = new THREE.Color(0x8197a4);
    const nightColor = new THREE.Color(0x111a35);
    const skyColor = nightColor.clone().lerp(dayColor, cycle);

    scene.background.copy(skyColor);
    scene.fog.color.copy(skyColor);
    sky.material.color.copy(skyColor);
  }

  const particles = scene.getObjectByName("ambientParticles");

  if (particles) {
    particles.rotation.y += delta * 0.015;
    particles.position.y = Math.sin(state.playTime * 0.2) * 0.3;
  }
}

function updateLocation() {
  const x = player.position.x;
  const z = player.position.z;

  if (Math.abs(x - 30) < 17 && Math.abs(z + 25) < 17) {
    state.location = "Ruínas de Aether";
  } else if (z < -40) {
    state.location = "Floresta dos Sussurros";
  } else if (x > 35 && z > 5) {
    state.location = "Vale das Cinzas";
  } else if (x < -20 && z > 10) {
    state.location = "Lago Cristalino";
  } else {
    state.location = "Ilha Esquecida";
  }
}

function update(delta) {
  if (!state.running || state.paused || state.ended) return;

  state.playTime += delta;

  updatePlayer(delta);
  updateEnemies(delta);
  updateCrystals(delta);
  updateInteractions();
  updateEnvironment(delta);
  updateLocation();

  // Salvamento automático periódico.
  lastAutosave += delta;

  if (lastAutosave >= 60) {
    lastAutosave = 0;

    try {
      const save = {
        version: 1,
        player: {
          x: player.position.x,
          y: player.position.y,
          z: player.position.z,
          rotation: player.rotation.y,
          ...playerData,
        },
        crystals: crystals.map((crystal) => crystal.collected),
        bossDefeated: state.bossDefeated,
        bossSpawned: state.bossSpawned,
        playTime: state.playTime,
        gold: playerData.gold,
        inventory: inventory.map((item) => ({ ...item })),
        settings: { ...settings },
        camera: {
          yaw: cameraState.yaw,
          pitch: cameraState.pitch,
        },
      };

      localStorage.setItem(CONFIG.saveKey, JSON.stringify(save));
    } catch (error) {
      console.warn("Falha no salvamento automático:", error);
    }
  }

  if (state.toastTimer > 0) {
    state.toastTimer -= delta;

    if (state.toastTimer <= 0) {
      hideToast();
    }
  }

  updateHUD();
}

function animate() {
  animationFrame = requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.05);

  if (state.running && !state.paused && !state.ended) {
    update(delta);
  } else if (state.toastTimer > 0) {
    state.toastTimer -= delta;

    if (state.toastTimer <= 0) {
      hideToast();
    }
  }

  renderer.render(scene, camera);
}

/* =========================================================
   INICIALIZAÇÃO E LIMPEZA
========================================================= */

function onResize() {
  if (!camera || !renderer) return;

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

function initialize() {
  if (!ui.game) {
    throw new Error("Elemento #game não encontrado no HTML.");
  }

  try {
    renderer = null;

    createWorld();

    clock = new THREE.Clock();

    setupControls();
    updateQuest();
    updateHUD();
    renderInventory();

    window.addEventListener("resize", onResize);

    if (readSave() && ui.continueButton) {
      ui.continueButton.disabled = false;
    }

    setScreen(ui.startScreen, true);
    setScreen(ui.pauseScreen, false);
    setScreen(ui.endScreen, false);
    setScreen(ui.inventoryScreen, false);
    setScreen(ui.mapScreen, false);
    setScreen(ui.skillsScreen, false);
    setScreen(ui.settingsScreen, false);
    setScreen(ui.bossStatus, false);
    setScreen(ui.mobileControls, isTouchDevice());

    animate();

    if (ui.loadingProgress) {
      ui.loadingProgress.style.width = "100%";
    }

    console.info("Ecos de Veyra inicializado.");
  } catch (error) {
    console.error("Erro ao inicializar Ecos de Veyra:", error);

    setScreen(ui.loadingScreen, true);

    if (ui.loadingText) {
      ui.loadingText.textContent =
        "Não foi possível iniciar o jogo. Verifique o console do navegador.";
    }

    showMessage("Erro ao iniciar o jogo.");
  }
}

window.addEventListener("beforeunload", () => {
  if (!player || !state.started || state.ended) return;

  try {
    const save = {
      version: 1,
      player: {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
        rotation: player.rotation.y,
        ...playerData,
      },
      crystals: crystals.map((crystal) => crystal.collected),
      bossDefeated: state.bossDefeated,
      bossSpawned: state.bossSpawned,
      playTime: state.playTime,
      gold: playerData.gold,
      inventory: inventory.map((item) => ({ ...item })),
      settings: { ...settings },
      camera: {
        yaw: cameraState.yaw,
        pitch: cameraState.pitch,
      },
    };

    localStorage.setItem(CONFIG.saveKey, JSON.stringify(save));
  } catch (error) {
    console.warn("Não foi possível salvar ao sair:", error);
  }
});

initialize();
