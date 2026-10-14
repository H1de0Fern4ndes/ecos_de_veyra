
/**
 * Ecos de Veyra — CharacterSystem
 * Gerencia atributos, recursos e progressão do personagem.
 *
 * JavaScript ES Modules.
 * Independente do Three.js.
 */

export class CharacterSystem {
  constructor(options = {}) {
    this.events = new Map();

    this.config = {
      baseExperience: Math.max(
        1,
        Number(options.baseExperience) || 100
      ),
      experienceGrowth: Math.max(
        1,
        Number(options.experienceGrowth) || 1.5
      ),
      pointsPerLevel: Math.max(
        0,
        Math.floor(Number(options.pointsPerLevel ?? 3))
      ),
      baseStats: {
        strength: 5,
        vitality: 5,
        agility: 5,
        intelligence: 5,
        endurance: 5,
        ...(options.baseStats ?? {})
      }
    };

    this.character = {
      name: String(options.name ?? "Aventureiro"),
      level: Math.max(
        1,
        Math.floor(Number(options.level) || 1)
      ),
      experience: Math.max(
        0,
        Number(options.experience) || 0
      ),
      unspentPoints: Math.max(
        0,
        Math.floor(Number(options.unspentPoints) || 0)
      ),
      stats: { ...this.config.baseStats },
      resources: {
        health: 100,
        mana: 50,
        stamina: 100
      },
      maxima: {
        health: 100,
        mana: 50,
        stamina: 100
      }
    };

    this.recalculateMaxima();
    this.character.resources.health =
      this.character.maxima.health;
    this.character.resources.mana =
      this.character.maxima.mana;
    this.character.resources.stamina =
      this.character.maxima.stamina;
  }

  // ========================================
  // EVENTOS
  // ========================================

  on(eventName, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("O callback precisa ser uma função.");
    }

    if (!this.events.has(eventName)) {
      this.events.set(eventName, new Set());
    }

    this.events.get(eventName).add(callback);

    return () => this.off(eventName, callback);
  }

  off(eventName, callback) {
    this.events.get(eventName)?.delete(callback);
  }

  emit(eventName, data = {}) {
    for (const callback of this.events.get(eventName) ?? []) {
      try {
        callback(data);
      } catch (error) {
        console.error(
          `[CharacterSystem] Erro no evento "${eventName}":`,
          error
        );
      }
    }
  }

  // ========================================
  // CONSULTA
  // ========================================

  getCharacter() {
    return {
      ...this.character,
      stats: { ...this.character.stats },
      resources: { ...this.character.resources },
      maxima: { ...this.character.maxima }
    };
  }

  getLevel() {
    return this.character.level;
  }

  getExperience() {
    return this.character.experience;
  }

  getExperienceToNextLevel() {
    return this.getExperienceRequired(this.character.level);
  }

  getExperienceRequired(level = this.character.level) {
    const safeLevel = Math.max(
      1,
      Math.floor(Number(level) || 1)
    );

    return Math.floor(
      this.config.baseExperience *
      Math.pow(
        this.config.experienceGrowth,
        safeLevel - 1
      )
    );
  }

  getExperienceProgress() {
    const required = this.getExperienceToNextLevel();

    return {
      current: this.character.experience,
      required,
      percentage: required > 0
        ? Math.min(
            100,
            (this.character.experience / required) * 100
          )
        : 100
    };
  }

  getStat(statName) {
    return this.character.stats[statName] ?? null;
  }

  getResource(resourceName) {
    return this.character.resources[resourceName] ?? null;
  }

  getMaximum(resourceName) {
    return this.character.maxima[resourceName] ?? null;
  }

  isAlive() {
    return this.character.resources.health > 0;
  }

  // ========================================
  // ATRIBUTOS DERIVADOS
  // ========================================

  recalculateMaxima() {
    const stats = this.character.stats;

    const previousMaxima = this.character.maxima ?? {
      health: 100,
      mana: 50,
      stamina: 100
    };

    const previousResources =
      this.character.resources ?? {
        health: 100,
        mana: 50,
        stamina: 100
      };

    const maxima = {
      health: 100 + stats.vitality * 20,
      mana: 50 + stats.intelligence * 12,
      stamina: 100 + stats.endurance * 10
    };

    this.character.maxima = maxima;

    this.character.resources = {
      health: this.adjustResourceForNewMaximum(
        previousResources.health,
        previousMaxima.health,
        maxima.health
      ),
      mana: this.adjustResourceForNewMaximum(
        previousResources.mana,
        previousMaxima.mana,
        maxima.mana
      ),
      stamina: this.adjustResourceForNewMaximum(
        previousResources.stamina,
        previousMaxima.stamina,
        maxima.stamina
      )
    };
  }

  adjustResourceForNewMaximum(current, oldMax, newMax) {
    const safeCurrent = Math.max(
      0,
      Number(current) || 0
    );

    const safeOldMax = Math.max(
      1,
      Number(oldMax) || 1
    );

    // Mantém a proporção atual do recurso ao mudar o máximo.
    const ratio = Math.min(1, safeCurrent / safeOldMax);

    return Math.round(newMax * ratio);
  }

  getDerivedStats() {
    const stats = this.character.stats;

    return {
      attack: Math.round(
        stats.strength * 2 + stats.agility * 0.5
      ),
      defense: Math.round(
        stats.vitality * 1.5 + stats.endurance * 0.5
      ),
      magicPower: Math.round(
        stats.intelligence * 2
      ),
      criticalChance: Math.min(
        50,
        Math.max(0, stats.agility * 0.5)
      ),
      movementBonus: Math.max(
        0,
        stats.agility * 0.005
      ),
      health: this.character.maxima.health,
      mana: this.character.maxima.mana,
      stamina: this.character.maxima.stamina
    };
  }

  // ========================================
  // EXPERIÊNCIA E NÍVEIS
  // ========================================

  addExperience(amount, source = "unknown") {
    const value = Number(amount);

    if (!Number.isFinite(value) || value <= 0) {
      return {
        success: false,
        reason: "invalid_amount"
      };
    }

    const previousLevel = this.character.level;

    this.character.experience += Math.floor(value);

    const levelsGained = [];

    while (
      this.character.experience >=
      this.getExperienceToNextLevel()
    ) {
      this.character.experience -=
        this.getExperienceToNextLevel();

      this.character.level += 1;

      this.character.unspentPoints +=
        this.config.pointsPerLevel;

      this.recalculateMaxima();

      // Recuperação parcial ao subir de nível.
      this.character.resources.health =
        Math.min(
          this.character.maxima.health,
          this.character.resources.health +
            Math.round(this.character.maxima.health * 0.25)
        );

      this.character.resources.mana =
        Math.min(
          this.character.maxima.mana,
          this.character.resources.mana +
            Math.round(this.character.maxima.mana * 0.25)
        );

      this.character.resources.stamina =
        this.character.maxima.stamina;

      levelsGained.push(this.character.level);

      this.emit("character:level_up", {
        level: this.character.level,
        previousLevel: this.character.level - 1,
        unspentPoints: this.character.unspentPoints,
        character: this.getCharacter()
      });
    }

    this.emit("character:experience_gained", {
      amount: Math.floor(value),
      source,
      totalExperience: this.character.experience,
      levelsGained,
      character: this.getCharacter()
    });

    return {
      success: true,
      gained: Math.floor(value),
      previousLevel,
      currentLevel: this.character.level,
      levelsGained,
      experience: this.character.experience,
      required: this.getExperienceToNextLevel()
    };
  }

  // ========================================
  // DISTRIBUIÇÃO DE PONTOS
  // ========================================

  spendStatPoint(statName, amount = 1) {
    const allowedStats = Object.keys(
      this.character.stats
    );

    const points = Number(amount);

    if (!allowedStats.includes(statName)) {
      return {
        success: false,
        reason: "invalid_stat"
      };
    }

    if (
      !Number.isSafeInteger(points) ||
      points <= 0
    ) {
      return {
        success: false,
        reason: "invalid_amount"
      };
    }

    if (this.character.unspentPoints < points) {
      return {
        success: false,
        reason: "insufficient_points"
      };
    }

    this.character.unspentPoints -= points;
    this.character.stats[statName] += points;

    this.recalculateMaxima();

    this.emit("character:stats_changed", {
      statName,
      amount: points,
      stats: { ...this.character.stats },
      derivedStats: this.getDerivedStats(),
      character: this.getCharacter()
    });

    return {
      success: true,
      statName,
      value: this.character.stats[statName],
      unspentPoints: this.character.unspentPoints
    };
  }

  // ========================================
  // VIDA, MANA E STAMINA
  // ========================================

  changeResource(resourceName, amount, source = "unknown") {
    if (
      !Object.hasOwn(
        this.character.resources,
        resourceName
      )
    ) {
      return {
        success: false,
        reason: "invalid_resource"
      };
    }

    const value = Number(amount);

    if (!Number.isFinite(value) || value === 0) {
      return {
        success: false,
        reason: "invalid_amount"
      };
    }

    const previous = this.character.resources[resourceName];

    const current = Math.max(
      0,
      Math.min(
        this.character.maxima[resourceName],
        previous + value
      )
    );

    this.character.resources[resourceName] = current;

    const actualChange = current - previous;

    this.emit("character:resource_changed", {
      resource: resourceName,
      previous,
      current,
      maximum: this.character.maxima[resourceName],
      change: actualChange,
      source
    });

    if (resourceName === "health") {
      if (previous > 0 && current === 0) {
        this.emit("character:death", {
          source,
          character: this.getCharacter()
        });
      } else if (previous === 0 && current > 0) {
        this.emit("character:revived", {
          source,
          character: this.getCharacter()
        });
      }
    }

    return {
      success: true,
      resource: resourceName,
      previous,
      current,
      change: actualChange
    };
  }

  heal(amount, source = "healing") {
    return this.changeResource("health", Math.abs(amount), source);
  }

  takeDamage(amount, source = "damage") {
    const value = Number(amount);

    if (!Number.isFinite(value) || value <= 0) {
      return {
        success: false,
        reason: "invalid_damage"
      };
    }

    return this.changeResource("health", -value, source);
  }

  restoreMana(amount, source = "restoration") {
    return this.changeResource("mana", Math.abs(amount), source);
  }

  restoreStamina(amount, source = "restoration") {
    return this.changeResource(
      "stamina",
      Math.abs(amount),
      source
    );
  }

  spendMana(amount, source = "ability") {
    return this.spendResource("mana", amount, source);
  }

  spendStamina(amount, source = "action") {
    return this.spendResource("stamina", amount, source);
  }

  spendResource(resourceName, amount, source) {
    const value = Number(amount);

    if (
      !Number.isFinite(value) ||
      value <= 0 ||
      !Object.hasOwn(this.character.resources, resourceName)
    ) {
      return {
        success: false,
        reason: "invalid_amount"
      };
    }

    if (this.character.resources[resourceName] < value) {
      return {
        success: false,
        reason: "insufficient_resource"
      };
    }

    return this.changeResource(
      resourceName,
      -value,
      source
    );
  }

  // ========================================
  // SALVAMENTO
  // ========================================

  exportSave() {
    return {
      version: 1,
      name: this.character.name,
      level: this.character.level,
      experience: this.character.experience,
      unspentPoints: this.character.unspentPoints,
      stats: { ...this.character.stats },
      resources: { ...this.character.resources }
    };
  }

  importSave(data) {
    if (!data || typeof data !== "object") {
      throw new TypeError("Save do personagem inválido.");
    }

    const level = Number(data.level);
    const experience = Number(data.experience);
    const points = Number(data.unspentPoints);

    this.character.name = String(
      data.name ?? this.character.name
    );

    this.character.level =
      Number.isSafeInteger(level) && level >= 1
        ? level
        : 1;

    this.character.experience =
      Number.isFinite(experience)
        ? Math.max(0, experience)
        : 0;

    this.character.unspentPoints =
      Number.isSafeInteger(points) && points >= 0
        ? points
        : 0;

    for (const statName of Object.keys(this.character.stats)) {
      const value = Number(data.stats?.[statName]);

      if (Number.isFinite(value)) {
        this.character.stats[statName] = Math.max(0, value);
      }
    }

    this.recalculateMaxima();

    for (const resourceName of Object.keys(
      this.character.resources
    )) {
      const value = Number(data.resources?.[resourceName]);

      if (Number.isFinite(value)) {
        this.character.resources[resourceName] = Math.max(
          0,
          Math.min(
            this.character.maxima[resourceName],
            value
          )
        );
      }
    }

    this.emit("character:loaded", {
      character: this.getCharacter()
    });

    return {
      success: true,
      character: this.getCharacter()
    };
  }
}

export default CharacterSystem;
