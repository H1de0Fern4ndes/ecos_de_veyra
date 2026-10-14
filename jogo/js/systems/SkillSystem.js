
export class SkillSystem {
  constructor(options = {}) {
    this.skills = new Map();
    this.unlockedSkills = new Map();
    this.cooldowns = new Map();
    this.listeners = new Map();

    this.skillPoints = Math.max(
      0,
      Math.floor(Number(options.skillPoints) || 0)
    );

    this.characterLevel = Math.max(
      1,
      Math.floor(Number(options.characterLevel) || 1)
    );

    this.resources = {
      mana: Math.max(0, Number(options.mana) || 100),
      stamina: Math.max(0, Number(options.stamina) || 100)
    };

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
        console.error(`[SkillSystem] Evento "${event}":`, error);
      }
    }
  }

  // =========================
  // REGISTRO DE HABILIDADES
  // =========================

  registerSkill(config = {}) {
    if (!config.id) {
      throw new Error("A habilidade precisa de um ID.");
    }

    if (this.skills.has(config.id)) {
      throw new Error(`A habilidade "${config.id}" já existe.`);
    }

    const skill = {
      id: config.id,
      name: config.name || config.id,
      description: config.description || "",
      type: config.type || "active",
      category: config.category || "general",
      icon: config.icon || null,

      maxLevel: Math.max(
        1,
        Math.floor(Number(config.maxLevel) || 1)
      ),

      requiredLevel: Math.max(
        1,
        Math.floor(Number(config.requiredLevel) || 1)
      ),

      pointCost: Math.max(
        1,
        Math.floor(Number(config.pointCost) || 1)
      ),

      manaCost: Math.max(0, Number(config.manaCost) || 0),
      staminaCost: Math.max(0, Number(config.staminaCost) || 0),

      cooldown: Math.max(0, Number(config.cooldown) || 0),

      prerequisites: Array.isArray(config.prerequisites)
        ? config.prerequisites.map(requirement => ({
            id: requirement.id,
            level: Math.max(
              1,
              Math.floor(Number(requirement.level) || 1)
            )
          }))
        : [],

      effects: Array.isArray(config.effects)
        ? config.effects.map(effect => ({ ...effect }))
        : [],

      metadata: config.metadata ?? {}
    };

    this.skills.set(skill.id, skill);

    this.emit("skill:registered", {
      skill: this.cloneSkill(skill)
    });

    return skill.id;
  }

  cloneSkill(skill) {
    if (!skill) return null;

    return {
      ...skill,
      prerequisites: skill.prerequisites.map(item => ({ ...item })),
      effects: skill.effects.map(effect => ({ ...effect })),
      metadata: { ...skill.metadata }
    };
  }

  getSkill(id) {
    return this.cloneSkill(this.skills.get(id));
  }

  getAllSkills() {
    return [...this.skills.values()].map(skill =>
      this.cloneSkill(skill)
    );
  }

  getUnlockedSkills() {
    return [...this.unlockedSkills.entries()].map(([id, data]) => ({
      skill: this.getSkill(id),
      level: data.level
    }));
  }

  getSkillLevel(id) {
    return this.unlockedSkills.get(id)?.level || 0;
  }

  // =========================
  // PRÉ-REQUISITOS
  // =========================

  canUnlock(id) {
    const skill = this.skills.get(id);

    if (!skill) {
      return { allowed: false, reason: "skill_not_found" };
    }

    if (this.getSkillLevel(id) >= skill.maxLevel) {
      return { allowed: false, reason: "max_level_reached" };
    }

    if (this.characterLevel < skill.requiredLevel) {
      return { allowed: false, reason: "level_too_low" };
    }

    if (this.skillPoints < skill.pointCost) {
      return { allowed: false, reason: "insufficient_skill_points" };
    }

    for (const requirement of skill.prerequisites) {
      if (this.getSkillLevel(requirement.id) < requirement.level) {
        return {
          allowed: false,
          reason: "prerequisite_missing",
          prerequisite: requirement.id,
          requiredLevel: requirement.level
        };
      }
    }

    return { allowed: true };
  }

  // =========================
  // DESBLOQUEIO E EVOLUÇÃO
  // =========================

  unlockSkill(id) {
    const check = this.canUnlock(id);

    if (!check.allowed) {
      return {
        success: false,
        ...check
      };
    }

    const skill = this.skills.get(id);
    const current = this.unlockedSkills.get(id);

    this.skillPoints -= skill.pointCost;

    const level = current ? current.level + 1 : 1;

    this.unlockedSkills.set(id, { level });

    this.emit("skill:unlocked", {
      skill: this.getSkill(id),
      level,
      remainingPoints: this.skillPoints
    });

    return {
      success: true,
      skillId: id,
      level,
      remainingPoints: this.skillPoints
    };
  }

  addSkillPoints(amount) {
    const points = Math.max(
      0,
      Math.floor(Number(amount) || 0)
    );

    this.skillPoints += points;

    this.emit("skill:points-changed", {
      skillPoints: this.skillPoints
    });

    return this.skillPoints;
  }

  setCharacterLevel(level) {
    this.characterLevel = Math.max(
      1,
      Math.floor(Number(level) || 1)
    );
  }

  // =========================
  // RECURSOS
  // =========================

  setResources(resources = {}) {
    for (const key of ["mana", "stamina"]) {
      if (Number.isFinite(resources[key])) {
        this.resources[key] = Math.max(0, resources[key]);
      }
    }
  }

  canUseSkill(id) {
    if (!this.enabled) {
      return { allowed: false, reason: "system_disabled" };
    }

    const skill = this.skills.get(id);

    if (!skill) {
      return { allowed: false, reason: "skill_not_found" };
    }

    const level = this.getSkillLevel(id);

    if (level <= 0) {
      return { allowed: false, reason: "skill_locked" };
    }

    if (this.cooldowns.has(id)) {
      return { allowed: false, reason: "on_cooldown" };
    }

    if (this.resources.mana < skill.manaCost) {
      return { allowed: false, reason: "insufficient_mana" };
    }

    if (this.resources.stamina < skill.staminaCost) {
      return { allowed: false, reason: "insufficient_stamina" };
    }

    return {
      allowed: true,
      skill,
      level
    };
  }

  // =========================
  // USO DE HABILIDADES
  // =========================

  useSkill(id, context = {}) {
    const check = this.canUseSkill(id);

    if (!check.allowed) {
      return {
        success: false,
        reason: check.reason
      };
    }

    const { skill, level } = check;

    this.resources.mana -= skill.manaCost;
    this.resources.stamina -= skill.staminaCost;

    if (skill.cooldown > 0) {
      this.cooldowns.set(id, skill.cooldown);
    }

    const result = {
      success: true,
      skillId: id,
      name: skill.name,
      level,
      costs: {
        mana: skill.manaCost,
        stamina: skill.staminaCost
      },
      effects: skill.effects.map(effect => ({
        ...effect,
        value: Number(effect.value) * level
      })),
      context
    };

    this.emit("skill:used", result);

    return result;
  }

  // =========================
  // RECARGAS
  // =========================

  update(deltaTime) {
    const dt = Math.max(0, Number(deltaTime) || 0);

    for (const [id, remaining] of this.cooldowns.entries()) {
      const next = Math.max(0, remaining - dt);

      if (next <= 0) {
        this.cooldowns.delete(id);

        this.emit("skill:cooldown-finished", {
          skillId: id
        });
      } else {
        this.cooldowns.set(id, next);
      }
    }
  }

  getCooldown(id) {
    return this.cooldowns.get(id) || 0;
  }

  // =========================
  // CONTROLE
  // =========================

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
  }

  resetCooldown(id) {
    return this.cooldowns.delete(id);
  }

  resetAllCooldowns() {
    this.cooldowns.clear();
  }

  // =========================
  // SALVAMENTO
  // =========================

  exportSave() {
    return {
      version: 1,
      skillPoints: this.skillPoints,
      characterLevel: this.characterLevel,
      resources: { ...this.resources },

      unlockedSkills: [...this.unlockedSkills.entries()].map(
        ([id, data]) => ({
          id,
          level: data.level
        })
      ),

      cooldowns: [...this.cooldowns.entries()].map(
        ([id, remaining]) => ({
          id,
          remaining
        })
      )
    };
  }

  importSave(data) {
    if (!data || !Array.isArray(data.unlockedSkills)) {
      return false;
    }

    this.skillPoints = Math.max(
      0,
      Math.floor(Number(data.skillPoints) || 0)
    );

    this.characterLevel = Math.max(
      1,
      Math.floor(Number(data.characterLevel) || 1)
    );

    this.setResources(data.resources || {});

    this.unlockedSkills.clear();

    for (const saved of data.unlockedSkills) {
      const skill = this.skills.get(saved.id);
      if (!skill) continue;

      const level = Math.floor(Number(saved.level));

      if (level >= 1 && level <= skill.maxLevel) {
        this.unlockedSkills.set(saved.id, { level });
      }
    }

    this.cooldowns.clear();

    if (Array.isArray(data.cooldowns)) {
      for (const saved of data.cooldowns) {
        if (
          this.skills.has(saved.id) &&
          Number(saved.remaining) > 0
        ) {
          this.cooldowns.set(
            saved.id,
            Number(saved.remaining)
          );
        }
      }
    }

    this.emit("skill:save-loaded", {});

    return true;
  }

  destroy() {
    this.skills.clear();
    this.unlockedSkills.clear();
    this.cooldowns.clear();
    this.listeners.clear();
  }
}

export default SkillSystem;
