// js/systems/StatusEffectSystem.js

export class StatusEffectSystem {
  constructor(options = {}) {
    this.effects = new Map();
    this.targets = new Map();
    this.listeners = new Map();

    this.defaultTickInterval = options.defaultTickInterval ?? 1;
  }

  // =========================
  // EVENTOS
  // =========================

  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    this.listeners.get(eventName).add(callback);

    return () => {
      this.listeners.get(eventName)?.delete(callback);
    };
  }

  emit(eventName, data = {}) {
    const callbacks = this.listeners.get(eventName);

    if (!callbacks) return;

    for (const callback of callbacks) {
      try {
        callback(data);
      } catch (error) {
        console.error(
          `[StatusEffectSystem] Erro no evento "${eventName}":`,
          error
        );
      }
    }
  }

  // =========================
  // ALVOS
  // =========================

  registerTarget(targetId, options = {}) {
    if (!targetId) {
      throw new Error("O alvo precisa de um ID.");
    }

    if (this.targets.has(targetId)) {
      return this.targets.get(targetId);
    }

    const target = {
      id: targetId,
      type: options.type ?? "character",
      active: true,
      effects: new Map(),
      health: options.health ?? 100,
      maxHealth: options.maxHealth ?? options.health ?? 100,
      mana: options.mana ?? 100,
      maxMana: options.maxMana ?? options.mana ?? 100,
      stamina: options.stamina ?? 100,
      maxStamina: options.maxStamina ?? options.stamina ?? 100
    };

    this.targets.set(targetId, target);

    this.emit("target:registered", {
      targetId,
      type: target.type
    });

    return target;
  }

  unregisterTarget(targetId) {
    const target = this.targets.get(targetId);

    if (!target) return false;

    this.targets.delete(targetId);

    this.emit("target:unregistered", { targetId });

    return true;
  }

  getTarget(targetId) {
    return this.targets.get(targetId) ?? null;
  }

  setTargetActive(targetId, active) {
    const target = this.getTarget(targetId);

    if (!target) return false;

    target.active = Boolean(active);

    if (!target.active) {
      this.clearEffects(targetId);
    }

    return true;
  }

  // =========================
  // DEFINIÇÃO DOS EFEITOS
  // =========================

  registerEffect(effectId, definition) {
    if (!effectId || !definition) {
      throw new Error("ID e definição do efeito são obrigatórios.");
    }

    const duration = Number(definition.duration);

    this.effects.set(effectId, {
      id: effectId,
      name: definition.name ?? effectId,
      description: definition.description ?? "",
      duration: Number.isFinite(duration)
        ? Math.max(0, duration)
        : 5,

      interval: Math.max(
        0.05,
        Number(definition.interval) || this.defaultTickInterval
      ),

      damage: Math.max(0, Number(definition.damage) || 0),
      healing: Math.max(0, Number(definition.healing) || 0),
      manaRestore: Math.max(0, Number(definition.manaRestore) || 0),
      staminaRestore: Math.max(0, Number(definition.staminaRestore) || 0),

      modifiers: { ...(definition.modifiers ?? {}) },

      maxStacks: Math.max(
        1,
        Math.floor(Number(definition.maxStacks) || 1)
      ),

      stackMode: ["refresh", "stack", "replace"].includes(
        definition.stackMode
      )
        ? definition.stackMode
        : "refresh",

      harmful: Boolean(definition.harmful),
      tags: Array.isArray(definition.tags)
        ? [...definition.tags]
        : []
    });

    return this.effects.get(effectId);
  }

  getEffectDefinition(effectId) {
    return this.effects.get(effectId) ?? null;
  }

  // =========================
  // APLICAR EFEITOS
  // =========================

  applyEffect(targetId, effectId, options = {}) {
    const target = this.getTarget(targetId);
    const definition = this.getEffectDefinition(effectId);

    if (!target || !definition || !target.active) {
      return false;
    }

    if (definition.duration <= 0) {
      return false;
    }

    if (definition.harmful && options.allowHarmful === false) {
      return false;
    }

    const existing = target.effects.get(effectId);

    if (existing) {
      if (definition.stackMode === "refresh") {
        existing.remaining = definition.duration;
        existing.elapsed = 0;
      } else if (definition.stackMode === "stack") {
        existing.stacks = Math.min(
          existing.stacks + 1,
          definition.maxStacks
        );

        existing.remaining = definition.duration;
      } else if (definition.stackMode === "replace") {
        target.effects.set(effectId, this.createActiveEffect(definition));
      }

      this.emit("effect:refreshed", {
        targetId,
        effectId,
        stacks: target.effects.get(effectId).stacks
      });

      return true;
    }

    target.effects.set(
      effectId,
      this.createActiveEffect(definition)
    );

    this.emit("effect:applied", {
      targetId,
      effectId,
      name: definition.name
    });

    return true;
  }

  createActiveEffect(definition) {
    return {
      effectId: definition.id,
      remaining: definition.duration,
      elapsed: 0,
      stacks: 1
    };
  }

  // =========================
  // REMOVER EFEITOS
  // =========================

  removeEffect(targetId, effectId) {
    const target = this.getTarget(targetId);

    if (!target || !target.effects.has(effectId)) {
      return false;
    }

    target.effects.delete(effectId);

    this.emit("effect:removed", {
      targetId,
      effectId
    });

    return true;
  }

  clearEffects(targetId) {
    const target = this.getTarget(targetId);

    if (!target) return false;

    const effectIds = [...target.effects.keys()];

    for (const effectId of effectIds) {
      this.removeEffect(targetId, effectId);
    }

    return true;
  }

  removeEffectsByTag(targetId, tag) {
    const target = this.getTarget(targetId);

    if (!target) return 0;

    let removed = 0;

    for (const effectId of [...target.effects.keys()]) {
      const definition = this.getEffectDefinition(effectId);

      if (definition?.tags.includes(tag)) {
        if (this.removeEffect(targetId, effectId)) {
          removed++;
        }
      }
    }

    return removed;
  }

  // =========================
  // ATUALIZAÇÃO DOS EFEITOS
  // =========================

  update(deltaTime) {
    const delta = Number(deltaTime);

    if (!Number.isFinite(delta) || delta <= 0) {
      return;
    }

    // Evita processar um frame excepcionalmente grande de uma vez.
    const dt = Math.min(delta, 10);

    for (const target of this.targets.values()) {
      if (!target.active) continue;

      for (const [effectId, activeEffect] of [...target.effects]) {
        const definition = this.getEffectDefinition(effectId);

        if (!definition) {
          target.effects.delete(effectId);
          continue;
        }

        const previousRemaining = activeEffect.remaining;

        activeEffect.remaining = Math.max(
          0,
          activeEffect.remaining - dt
        );

        const effectiveDelta = Math.min(dt, previousRemaining);

        activeEffect.elapsed += effectiveDelta;

        while (activeEffect.elapsed >= definition.interval) {
          activeEffect.elapsed -= definition.interval;

          this.processEffectTick(target, activeEffect, definition);

          // Um efeito pode deixar de ser válido após o tick.
          if (!target.active || target.health <= 0) {
            break;
          }
        }

        if (activeEffect.remaining <= 0) {
          this.removeEffect(target.id, effectId);
        }
      }
    }
  }

  processEffectTick(target, activeEffect, definition) {
    const stacks = activeEffect.stacks;

    if (definition.damage > 0) {
      const damage = definition.damage * stacks;

      target.health = Math.max(0, target.health - damage);

      this.emit("effect:damage", {
        targetId: target.id,
        effectId: definition.id,
        amount: damage,
        health: target.health
      });

      if (target.health <= 0) {
        this.emit("target:defeated", {
          targetId: target.id,
          effectId: definition.id
        });
      }
    }

    if (definition.healing > 0) {
      const amount = definition.healing * stacks;
      const previousHealth = target.health;

      target.health = Math.min(
        target.maxHealth,
        target.health + amount
      );

      this.emit("effect:healing", {
        targetId: target.id,
        effectId: definition.id,
        amount: target.health - previousHealth,
        health: target.health
      });
    }

    if (definition.manaRestore > 0) {
      target.mana = Math.min(
        target.maxMana,
        target.mana + definition.manaRestore * stacks
      );
    }

    if (definition.staminaRestore > 0) {
      target.stamina = Math.min(
        target.maxStamina,
        target.stamina + definition.staminaRestore * stacks
      );
    }
  }

  // =========================
  // MODIFICADORES DE ATRIBUTOS
  // =========================

  getModifiers(targetId) {
    const target = this.getTarget(targetId);

    const totals = {};

    if (!target) return totals;

    for (const [effectId, activeEffect] of target.effects) {
      const definition = this.getEffectDefinition(effectId);

      if (!definition) continue;

      for (const [stat, value] of Object.entries(definition.modifiers)) {
        if (!Number.isFinite(Number(value))) continue;

        totals[stat] ??= 0;
        totals[stat] += Number(value) * activeEffect.stacks;
      }
    }

    return totals;
  }

  hasEffect(targetId, effectId) {
    return this.getTarget(targetId)?.effects.has(effectId) ?? false;
  }

  getActiveEffects(targetId) {
    const target = this.getTarget(targetId);

    if (!target) return [];

    return [...target.effects.values()].map(activeEffect => {
      const definition = this.getEffectDefinition(
        activeEffect.effectId
      );

      return {
        ...definition,
        remaining: activeEffect.remaining,
        stacks: activeEffect.stacks
      };
    }).filter(effect => effect.id);
  }

  // =========================
  // SALVAR E CARREGAR
  // =========================

  exportData() {
    return {
      version: 1,

      targets: [...this.targets.values()].map(target => ({
        id: target.id,
        type: target.type,
        active: target.active,
        health: target.health,
        maxHealth: target.maxHealth,
        mana: target.mana,
        maxMana: target.maxMana,
        stamina: target.stamina,
        maxStamina: target.maxStamina,

        effects: [...target.effects.values()].map(effect => ({
          effectId: effect.effectId,
          remaining: effect.remaining,
          elapsed: effect.elapsed,
          stacks: effect.stacks
        }))
      }))
    };
  }

  importData(data) {
    if (!data || !Array.isArray(data.targets)) {
      throw new Error("Dados de efeitos inválidos.");
    }

    this.targets.clear();

    for (const savedTarget of data.targets) {
      if (!savedTarget.id) continue;

      const target = this.registerTarget(savedTarget.id, {
        type: savedTarget.type,
        health: savedTarget.health,
        maxHealth: savedTarget.maxHealth,
        mana: savedTarget.mana,
        maxMana: savedTarget.maxMana,
        stamina: savedTarget.stamina,
        maxStamina: savedTarget.maxStamina
      });

      target.active = savedTarget.active !== false;

      for (const savedEffect of savedTarget.effects ?? []) {
        const definition = this.getEffectDefinition(
          savedEffect.effectId
        );

        if (!definition) continue;

        const remaining = Number(savedEffect.remaining);
        const elapsed = Number(savedEffect.elapsed);
        const stacks = Number(savedEffect.stacks);

        if (!Number.isFinite(remaining) || remaining <= 0) {
          continue;
        }

        target.effects.set(savedEffect.effectId, {
          effectId: savedEffect.effectId,
          remaining: Math.min(remaining, definition.duration),
          elapsed: Number.isFinite(elapsed)
            ? Math.max(0, Math.min(elapsed, definition.interval))
            : 0,
          stacks: Number.isFinite(stacks)
            ? Math.max(1, Math.min(
                Math.floor(stacks),
                definition.maxStacks
              ))
            : 1
        });
      }
    }

    this.emit("data:imported", {
      targets: this.targets.size
    });
  }
}

export default StatusEffectSystem;