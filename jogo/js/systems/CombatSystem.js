
/**
 * Ecos de Veyra — CombatSystem
 * Sistema base de combate para RPG 3D com Three.js.
 *
 * Responsabilidades:
 * - Dano físico e mágico
 * - Defesa e resistência
 * - Acertos críticos
 * - Esquiva e bloqueio
 * - Stamina
 * - Recargas de ações
 * - Eventos de combate
 *
 * Este módulo não depende diretamente de Three.js.
 */

export class CombatSystem {
  constructor(options = {}) {
    this.config = {
      baseCriticalChance: 0.05,
      baseCriticalMultiplier: 1.75,
      staminaRegen: 18,
      defaultMaxStamina: 100,
      dodgeCost: 25,
      blockCostPerSecond: 8,
      blockDamageReduction: 0.7,
      dodgeDuration: 0.35,
      attackCooldown: 0.4,
      heavyAttackCooldown: 0.9,
      ...options
    };

    this.entities = new Map();
    this.cooldowns = new Map();
    this.listeners = new Map();
    this.time = 0;
  }

  // --------------------------------------------------
  // EVENTOS
  // --------------------------------------------------

  on(eventName, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("O callback precisa ser uma função.");
    }

    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    this.listeners.get(eventName).add(callback);

    return () => {
      this.listeners.get(eventName)?.delete(callback);
    };
  }

  emit(eventName, payload = {}) {
    for (const callback of this.listeners.get(eventName) ?? []) {
      try {
        callback(payload);
      } catch (error) {
        console.error(
          `[CombatSystem] Erro no evento "${eventName}":`,
          error
        );
      }
    }
  }

  // --------------------------------------------------
  // ENTIDADES
  // --------------------------------------------------

  registerEntity(id, stats = {}) {
    if (id == null || id === "") {
      throw new Error("A entidade precisa de um identificador.");
    }

    if (this.entities.has(id)) {
      throw new Error(`A entidade "${id}" já está registrada.`);
    }

    const maxHealth = this.positiveNumber(
      stats.maxHealth,
      100
    );

    const maxStamina = this.positiveNumber(
      stats.maxStamina,
      this.config.defaultMaxStamina
    );

    const entity = {
      id,
      name: stats.name ?? String(id),

      level: this.positiveNumber(stats.level, 1),

      health: maxHealth,
      maxHealth,

      stamina: maxStamina,
      maxStamina,

      strength: this.nonNegativeNumber(stats.strength, 10),
      intelligence: this.nonNegativeNumber(
        stats.intelligence,
        10
      ),

      defense: this.nonNegativeNumber(stats.defense, 0),
      magicDefense: this.nonNegativeNumber(
        stats.magicDefense,
        0
      ),

      criticalChance: this.clamp(
        stats.criticalChance ??
          this.config.baseCriticalChance,
        0,
        1
      ),

      criticalMultiplier: this.positiveNumber(
        stats.criticalMultiplier,
        this.config.baseCriticalMultiplier
      ),

      resistance: {
        physical: this.clamp(
          stats.resistance?.physical ?? 0,
          0,
          0.9
        ),
        magic: this.clamp(
          stats.resistance?.magic ?? 0,
          0,
          0.9
        )
      },

      alive: true,
      blocking: false,
      dodging: false,
      dodgeTimer: 0
    };

    this.entities.set(id, entity);

    this.emit("entity:registered", {
      entity: this.getEntity(id)
    });

    return this.getEntity(id);
  }

  unregisterEntity(id) {
    const existed = this.entities.delete(id);

    this.clearCooldowns(id);

    if (existed) {
      this.emit("entity:unregistered", { id });
    }

    return existed;
  }

  getEntity(id) {
    const entity = this.entities.get(id);

    return entity ? this.cloneEntity(entity) : null;
  }

  updateEntity(id, changes = {}) {
    const entity = this.entities.get(id);

    if (!entity) {
      throw new Error(`Entidade "${id}" não encontrada.`);
    }

    const oldMaxHealth = entity.maxHealth;
    const oldMaxStamina = entity.maxStamina;

    for (const key of [
      "level",
      "strength",
      "intelligence",
      "defense",
      "magicDefense",
      "criticalMultiplier"
    ]) {
      if (changes[key] !== undefined) {
        entity[key] = this.positiveNumber(
          changes[key],
          entity[key]
        );
      }
    }

    if (changes.criticalChance !== undefined) {
      entity.criticalChance = this.clamp(
        changes.criticalChance,
        0,
        1
      );
    }

    if (changes.resistance) {
      for (const type of ["physical", "magic"]) {
        if (changes.resistance[type] !== undefined) {
          entity.resistance[type] = this.clamp(
            changes.resistance[type],
            0,
            0.9
          );
        }
      }
    }

    if (changes.maxHealth !== undefined) {
      entity.maxHealth = this.positiveNumber(
        changes.maxHealth,
        oldMaxHealth
      );

      entity.health = Math.min(
        entity.maxHealth,
        entity.health + entity.maxHealth - oldMaxHealth
      );
    }

    if (changes.maxStamina !== undefined) {
      entity.maxStamina = this.positiveNumber(
        changes.maxStamina,
        oldMaxStamina
      );

      entity.stamina = Math.min(
        entity.maxStamina,
        entity.stamina + entity.maxStamina - oldMaxStamina
      );
    }

    if (changes.name !== undefined) {
      entity.name = String(changes.name);
    }

    return this.getEntity(id);
  }

  // --------------------------------------------------
  // ATAQUES
  // --------------------------------------------------

  attack(attackerId, targetId, options = {}) {
    const attacker = this.entities.get(attackerId);
    const target = this.entities.get(targetId);

    if (!attacker || !target) {
      return this.fail("invalid_entity");
    }

    if (!attacker.alive || !target.alive) {
      return this.fail("dead_entity");
    }

    if (attackerId === targetId) {
      return this.fail("self_target");
    }

    const type = options.type ?? "physical";
    const style = options.style ?? "light";

    if (!["physical", "magic"].includes(type)) {
      return this.fail("invalid_damage_type");
    }

    if (!["light", "heavy"].includes(style)) {
      return this.fail("invalid_attack_style");
    }

    const cooldownKey = `${attackerId}:attack`;

    if (this.isOnCooldown(cooldownKey)) {
      return this.fail("attack_cooldown");
    }

    const staminaCost = this.positiveNumber(
      options.staminaCost,
      style === "heavy" ? 25 : 10
    );

    if (attacker.stamina < staminaCost) {
      return this.fail("insufficient_stamina");
    }

    attacker.stamina -= staminaCost;

    const basePower = this.nonNegativeNumber(
      options.power,
      type === "magic"
        ? attacker.intelligence
        : attacker.strength
    );

    const multiplier = this.positiveNumber(
      options.multiplier,
      style === "heavy" ? 1.8 : 1
    );

    const rawDamage = basePower * multiplier;

    const defense =
      type === "magic"
        ? target.magicDefense
        : target.defense;

    const resistance = target.resistance[type];

    const mitigation = defense / (defense + 100);

    let damage = rawDamage * (1 - mitigation);
    damage *= 1 - resistance;

    const criticalChance = this.clamp(
      options.criticalChance ??
        attacker.criticalChance,
      0,
      1
    );

    const critical = Math.random() < criticalChance;

    if (critical) {
      damage *= this.positiveNumber(
        options.criticalMultiplier,
        attacker.criticalMultiplier
      );
    }

    if (target.dodging) {
      damage = 0;
    } else if (target.blocking) {
      damage *= 1 - this.config.blockDamageReduction;
    }

    damage = Math.max(
      0,
      Math.round(damage)
    );

    const previousHealth = target.health;

    target.health = Math.max(
      0,
      target.health - damage
    );

    if (target.health === 0) {
      target.alive = false;
      target.blocking = false;
      target.dodging = false;
    }

    const actualDamage = previousHealth - target.health;

    const cooldown = this.positiveNumber(
      options.cooldown,
      style === "heavy"
        ? this.config.heavyAttackCooldown
        : this.config.attackCooldown
    );

    this.setCooldown(cooldownKey, cooldown);

    const result = {
      success: true,
      attackerId,
      targetId,
      type,
      style,
      rawDamage,
      damage: actualDamage,
      critical,
      blocked: target.blocking && actualDamage > 0,
      dodged: target.dodging,
      targetHealth: target.health,
      targetMaxHealth: target.maxHealth,
      defeated: !target.alive
    };

    this.emit("combat:hit", result);

    if (actualDamage > 0) {
      this.emit("entity:damaged", result);
    }

    if (!target.alive) {
      this.emit("entity:defeated", {
        entityId: targetId,
        defeatedBy: attackerId
      });
    }

    return result;
  }

  // --------------------------------------------------
  // DEFESA E ESQUIVA
  // --------------------------------------------------

  block(entityId, enabled = true) {
    const entity = this.entities.get(entityId);

    if (!entity || !entity.alive) {
      return this.fail("invalid_entity");
    }

    if (enabled && entity.dodging) {
      return this.fail("currently_dodging");
    }

    if (enabled && entity.stamina <= 0) {
      return this.fail("insufficient_stamina");
    }

    entity.blocking = Boolean(enabled);

    this.emit("combat:block", {
      entityId,
      blocking: entity.blocking
    });

    return {
      success: true,
      blocking: entity.blocking
    };
  }

  dodge(entityId, duration = this.config.dodgeDuration) {
    const entity = this.entities.get(entityId);

    if (!entity || !entity.alive) {
      return this.fail("invalid_entity");
    }

    if (entity.dodging) {
      return this.fail("already_dodging");
    }

    if (entity.stamina < this.config.dodgeCost) {
      return this.fail("insufficient_stamina");
    }

    entity.stamina -= this.config.dodgeCost;
    entity.blocking = false;
    entity.dodging = true;

    entity.dodgeTimer = this.positiveNumber(
      duration,
      this.config.dodgeDuration
    );

    this.emit("combat:dodge", { entityId });

    return {
      success: true,
      duration: entity.dodgeTimer
    };
  }

  // --------------------------------------------------
  // CURA E STAMINA
  // --------------------------------------------------

  heal(entityId, amount) {
    const entity = this.entities.get(entityId);

    if (!entity || !entity.alive) {
      return this.fail("invalid_entity");
    }

    const value = this.nonNegativeNumber(amount, 0);
    const previousHealth = entity.health;

    entity.health = Math.min(
      entity.maxHealth,
      entity.health + value
    );

    const healed = entity.health - previousHealth;

    this.emit("entity:healed", {
      entityId,
      amount: healed,
      health: entity.health,
      maxHealth: entity.maxHealth
    });

    return {
      success: true,
      healed,
      health: entity.health
    };
  }

  restoreStamina(entityId, amount) {
    const entity = this.entities.get(entityId);

    if (!entity || !entity.alive) {
      return this.fail("invalid_entity");
    }

    const previous = entity.stamina;

    entity.stamina = Math.min(
      entity.maxStamina,
      entity.stamina +
        this.nonNegativeNumber(amount, 0)
    );

    return {
      success: true,
      restored: entity.stamina - previous,
      stamina: entity.stamina
    };
  }

  // --------------------------------------------------
  // ATUALIZAÇÃO POR FRAME
  // Chame update(deltaTime) uma vez por frame.
  // --------------------------------------------------

  update(deltaTime) {
    const dt = this.clamp(
      Number.isFinite(deltaTime) ? deltaTime : 0,
      0,
      0.1
    );

    this.time += dt;

    for (const [key, remaining] of this.cooldowns) {
      const next = remaining - dt;

      if (next <= 0) {
        this.cooldowns.delete(key);

        this.emit("combat:cooldown-ready", {
          key
        });
      } else {
        this.cooldowns.set(key, next);
      }
    }

    for (const entity of this.entities.values()) {
      if (!entity.alive) continue;

      if (entity.dodging) {
        entity.dodgeTimer -= dt;

        if (entity.dodgeTimer <= 0) {
          entity.dodging = false;
          entity.dodgeTimer = 0;

          this.emit("combat:dodge-end", {
            entityId: entity.id
          });
        }
      }

      if (entity.blocking) {
        entity.stamina = Math.max(
          0,
          entity.stamina -
            this.config.blockCostPerSecond * dt
        );

        if (entity.stamina <= 0) {
          entity.blocking = false;

          this.emit("combat:block-broken", {
            entityId: entity.id
          });
        }
      } else if (!entity.dodging) {
        entity.stamina = Math.min(
          entity.maxStamina,
          entity.stamina + this.config.staminaRegen * dt
        );
      }
    }
  }

  // --------------------------------------------------
  // RECARGAS
  // --------------------------------------------------

  setCooldown(key, seconds) {
    this.cooldowns.set(
      key,
      this.positiveNumber(seconds, 0.1)
    );
  }

  isOnCooldown(key) {
    return (this.cooldowns.get(key) ?? 0) > 0;
  }

  getCooldown(key) {
    return Math.max(0, this.cooldowns.get(key) ?? 0);
  }

  clearCooldowns(entityId) {
    const prefix = `${entityId}:`;

    for (const key of this.cooldowns.keys()) {
      if (key.startsWith(prefix)) {
        this.cooldowns.delete(key);
      }
    }
  }

  // --------------------------------------------------
  // UTILITÁRIOS
  // --------------------------------------------------

  fail(reason) {
    return {
      success: false,
      reason
    };
  }

  positiveNumber(value, fallback) {
    const number = Number(value);

    return Number.isFinite(number) && number > 0
      ? number
      : fallback;
  }

  nonNegativeNumber(value, fallback) {
    const number = Number(value);

    return Number.isFinite(number) && number >= 0
      ? number
      : fallback;
  }

  clamp(value, min, max) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return min;
    }

    return Math.max(min, Math.min(max, number));
  }

  cloneEntity(entity) {
    return {
      ...entity,
      resistance: { ...entity.resistance }
    };
  }
}
