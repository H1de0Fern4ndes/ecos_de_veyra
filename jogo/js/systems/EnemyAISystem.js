
export class EnemyAISystem {
  constructor(options = {}) {
    this.enemies = new Map();
    this.nextId = 1;
    this.playerPosition = { x: 0, y: 0, z: 0 };

    this.defaults = {
      detectionRange: options.detectionRange ?? 12,
      attackRange: options.attackRange ?? 2,
      loseTargetRange: options.loseTargetRange ?? 18,
      moveSpeed: options.moveSpeed ?? 2,
      attackCooldown: options.attackCooldown ?? 1.5,
      returnSpeed: options.returnSpeed ?? 2
    };

    this.listeners = new Map();
    this.enabled = true;
  }

  // =========================
  // EVENTOS
  // =========================

  on(event, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("O callback precisa ser uma função.");
    }

    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    this.listeners.get(event).add(callback);

    return () => this.off(event, callback);
  }

  off(event, callback) {
    const callbacks = this.listeners.get(event);
    if (!callbacks) return false;

    const removed = callbacks.delete(callback);

    if (callbacks.size === 0) {
      this.listeners.delete(event);
    }

    return removed;
  }

  emit(event, detail = {}) {
    const callbacks = this.listeners.get(event);
    if (!callbacks) return;

    for (const callback of [...callbacks]) {
      try {
        callback(detail);
      } catch (error) {
        console.error(`[EnemyAISystem] Evento "${event}":`, error);
      }
    }
  }

  // =========================
  // UTILITÁRIOS
  // =========================

  normalizePosition(position) {
    return {
      x: Number(position?.x) || 0,
      y: Number(position?.y) || 0,
      z: Number(position?.z) || 0
    };
  }

  distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  moveTowards(current, target, maxDistance) {
    const distance = this.distance(current, target);

    if (distance === 0 || distance <= maxDistance) {
      return { ...target };
    }

    const factor = maxDistance / distance;

    return {
      x: current.x + (target.x - current.x) * factor,
      y: current.y + (target.y - current.y) * factor,
      z: current.z + (target.z - current.z) * factor
    };
  }

  // =========================
  // REGISTRO DE INIMIGOS
  // =========================

  register(config = {}) {
    const id = config.id ?? `enemy_${this.nextId++}`;

    if (this.enemies.has(id)) {
      throw new Error(`O inimigo "${id}" já existe.`);
    }

    const position = this.normalizePosition(config.position);

    const enemy = {
      id,
      name: config.name || "Inimigo",
      type: config.type || "creature",

      position: { ...position },
      homePosition: { ...position },

      state: "idle",
      alive: config.alive !== false,
      enabled: config.enabled !== false,

      health: Math.max(1, Number(config.health) || 100),
      maxHealth: Math.max(1, Number(config.health) || 100),
      damage: Math.max(0, Number(config.damage) || 10),

      detectionRange: Math.max(
        0,
        Number(config.detectionRange) ||
          this.defaults.detectionRange
      ),

      attackRange: Math.max(
        0.1,
        Number(config.attackRange) ||
          this.defaults.attackRange
      ),

      loseTargetRange: Math.max(
        0,
        Number(config.loseTargetRange) ||
          this.defaults.loseTargetRange
      ),

      moveSpeed: Math.max(
        0,
        Number(config.moveSpeed) ||
          this.defaults.moveSpeed
      ),

      returnSpeed: Math.max(
        0,
        Number(config.returnSpeed) ||
          this.defaults.returnSpeed
      ),

      attackCooldown: Math.max(
        0.1,
        Number(config.attackCooldown) ||
          this.defaults.attackCooldown
      ),

      attackTimer: 0,
      patrolPoints: Array.isArray(config.patrolPoints)
        ? config.patrolPoints.map(point =>
            this.normalizePosition(point)
          )
        : [],

      patrolIndex: 0,
      targetVisible: false,
      metadata: config.metadata ?? {}
    };

    this.enemies.set(id, enemy);

    this.emit("enemy:registered", {
      enemy: this.getEnemy(id)
    });

    return id;
  }

  unregister(id) {
    const removed = this.enemies.delete(id);

    if (removed) {
      this.emit("enemy:unregistered", { id });
    }

    return removed;
  }

  getEnemy(id) {
    const enemy = this.enemies.get(id);
    if (!enemy) return null;

    return {
      ...enemy,
      position: { ...enemy.position },
      homePosition: { ...enemy.homePosition },
      patrolPoints: enemy.patrolPoints.map(point => ({ ...point })),
      metadata: { ...enemy.metadata }
    };
  }

  getAllEnemies() {
    return [...this.enemies.keys()].map(id => this.getEnemy(id));
  }

  // =========================
  // JOGADOR
  // =========================

  setPlayerPosition(position) {
    this.playerPosition = this.normalizePosition(position);
  }

  // =========================
  // ATUALIZAÇÃO DA IA
  // =========================

  update(deltaTime) {
    if (!this.enabled) return;

    const dt = Math.max(0, Math.min(Number(deltaTime) || 0, 0.1));

    for (const enemy of this.enemies.values()) {
      if (!enemy.enabled || !enemy.alive) continue;

      enemy.attackTimer = Math.max(
        0,
        enemy.attackTimer - dt
      );

      const distanceToPlayer = this.distance(
        enemy.position,
        this.playerPosition
      );

      if (
        enemy.state !== "chasing" &&
        enemy.state !== "attacking" &&
        distanceToPlayer <= enemy.detectionRange
      ) {
        this.changeState(enemy, "chasing");
      }

      if (
        (enemy.state === "chasing" ||
          enemy.state === "attacking") &&
        distanceToPlayer > enemy.loseTargetRange
      ) {
        this.changeState(enemy, "returning");
      }

      switch (enemy.state) {
        case "idle":
          this.updatePatrol(enemy, dt);
          break;

        case "patrolling":
          this.updatePatrol(enemy, dt);
          break;

        case "chasing":
          this.updateChasing(enemy, dt, distanceToPlayer);
          break;

        case "attacking":
          this.updateAttacking(enemy, distanceToPlayer);
          break;

        case "returning":
          this.updateReturning(enemy, dt);
          break;
      }
    }
  }

  changeState(enemy, newState) {
    if (enemy.state === newState) return;

    const previousState = enemy.state;
    enemy.state = newState;

    this.emit("enemy:state-changed", {
      id: enemy.id,
      name: enemy.name,
      previousState,
      state: newState
    });
  }

  // =========================
  // PATRULHA
  // =========================

  updatePatrol(enemy, dt) {
    if (enemy.patrolPoints.length === 0) {
      this.changeState(enemy, "idle");
      return;
    }

    this.changeState(enemy, "patrolling");

    const target = enemy.patrolPoints[enemy.patrolIndex];

    enemy.position = this.moveTowards(
      enemy.position,
      target,
      enemy.moveSpeed * dt
    );

    if (this.distance(enemy.position, target) < 0.15) {
      enemy.patrolIndex =
        (enemy.patrolIndex + 1) % enemy.patrolPoints.length;
    }

    this.emit("enemy:moved", {
      id: enemy.id,
      position: { ...enemy.position },
      state: enemy.state
    });
  }

  // =========================
  // PERSEGUIÇÃO
  // =========================

  updateChasing(enemy, dt, distanceToPlayer) {
    if (distanceToPlayer <= enemy.attackRange) {
      this.changeState(enemy, "attacking");
      this.updateAttacking(enemy, distanceToPlayer);
      return;
    }

    enemy.position = this.moveTowards(
      enemy.position,
      this.playerPosition,
      enemy.moveSpeed * dt
    );

    this.emit("enemy:moved", {
      id: enemy.id,
      position: { ...enemy.position },
      state: enemy.state
    });
  }

  // =========================
  // ATAQUE
  // =========================

  updateAttacking(enemy, distanceToPlayer) {
    if (distanceToPlayer > enemy.attackRange) {
      this.changeState(enemy, "chasing");
      return;
    }

    if (enemy.attackTimer > 0) return;

    enemy.attackTimer = enemy.attackCooldown;

    this.emit("enemy:attack", {
      id: enemy.id,
      name: enemy.name,
      damage: enemy.damage,
      targetPosition: { ...this.playerPosition }
    });
  }

  // =========================
  // RETORNO À ORIGEM
  // =========================

  updateReturning(enemy, dt) {
    const distanceHome = this.distance(
      enemy.position,
      enemy.homePosition
    );

    if (distanceHome < 0.2) {
      enemy.position = { ...enemy.homePosition };
      this.changeState(enemy, "idle");

      this.emit("enemy:returned-home", {
        id: enemy.id
      });

      return;
    }

    enemy.position = this.moveTowards(
      enemy.position,
      enemy.homePosition,
      enemy.returnSpeed * dt
    );

    this.emit("enemy:moved", {
      id: enemy.id,
      position: { ...enemy.position },
      state: enemy.state
    });
  }

  // =========================
  // DANO E MORTE
  // =========================

  applyDamage(id, amount) {
    const enemy = this.enemies.get(id);

    if (!enemy || !enemy.alive) {
      return { success: false, reason: "enemy_unavailable" };
    }

    const damage = Math.max(0, Number(amount) || 0);

    enemy.health = Math.max(0, enemy.health - damage);

    this.emit("enemy:damaged", {
      id,
      damage,
      health: enemy.health,
      maxHealth: enemy.maxHealth
    });

    if (enemy.health <= 0) {
      enemy.alive = false;
      this.changeState(enemy, "dead");

      this.emit("enemy:died", {
        id,
        name: enemy.name,
        position: { ...enemy.position },
        metadata: { ...enemy.metadata }
      });
    }

    return {
      success: true,
      damage,
      health: enemy.health,
      dead: !enemy.alive
    };
  }

  revive(id, health) {
    const enemy = this.enemies.get(id);
    if (!enemy) return false;

    enemy.alive = true;
    enemy.health = Math.max(
      1,
      Math.min(
        Number(health) || enemy.maxHealth,
        enemy.maxHealth
      )
    );

    enemy.position = { ...enemy.homePosition };
    enemy.attackTimer = 0;

    this.changeState(enemy, "idle");

    this.emit("enemy:revived", {
      id,
      health: enemy.health
    });

    return true;
  }

  setEnabled(id, enabled) {
    const enemy = this.enemies.get(id);
    if (!enemy) return false;

    enemy.enabled = Boolean(enabled);
    return true;
  }

  setSystemEnabled(enabled) {
    this.enabled = Boolean(enabled);
  }

  // =========================
  // SALVAMENTO
  // =========================

  exportSave() {
    return {
      version: 1,
      enemies: [...this.enemies.values()].map(enemy => ({
        id: enemy.id,
        position: { ...enemy.position },
        health: enemy.health,
        alive: enemy.alive,
        enabled: enemy.enabled,
        state: enemy.state,
        patrolIndex: enemy.patrolIndex
      }))
    };
  }

  importSave(data) {
    if (!data || !Array.isArray(data.enemies)) {
      return false;
    }

    for (const saved of data.enemies) {
      const enemy = this.enemies.get(saved.id);
      if (!enemy) continue;

      if (saved.position) {
        enemy.position = this.normalizePosition(saved.position);
      }

      if (Number.isFinite(saved.health)) {
        enemy.health = Math.max(
          0,
          Math.min(saved.health, enemy.maxHealth)
        );
      }

      if (typeof saved.alive === "boolean") {
        enemy.alive = saved.alive;
      }

      if (typeof saved.enabled === "boolean") {
        enemy.enabled = saved.enabled;
      }

      if (Number.isInteger(saved.patrolIndex)) {
        enemy.patrolIndex = Math.max(
          0,
          enemy.patrolPoints.length
            ? saved.patrolIndex % enemy.patrolPoints.length
            : 0
        );
      }

      enemy.state = enemy.alive ? "idle" : "dead";
    }

    this.emit("enemy:save-loaded", {});
    return true;
  }

  clear() {
    this.enemies.clear();
    this.emit("enemy:cleared", {});
  }

  destroy() {
    this.clear();
    this.listeners.clear();
  }
}

export default EnemyAISystem;
