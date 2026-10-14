
export class InteractionSystem {
  constructor(options = {}) {
    this.interactions = new Map();
    this.nextId = 1;

    this.defaultRange = Math.max(
      0.1,
      Number(options.defaultRange) || 3
    );

    this.playerPosition = { x: 0, y: 0, z: 0 };
    this.currentTargetId = null;
    this.enabled = true;

    this.listeners = new Map();
  }

  // =========================
  // EVENTOS
  // =========================

  on(eventName, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("O callback precisa ser uma função.");
    }

    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    this.listeners.get(eventName).add(callback);

    return () => this.off(eventName, callback);
  }

  off(eventName, callback) {
    const callbacks = this.listeners.get(eventName);
    if (!callbacks) return false;

    const removed = callbacks.delete(callback);

    if (callbacks.size === 0) {
      this.listeners.delete(eventName);
    }

    return removed;
  }

  emit(eventName, detail = {}) {
    const callbacks = this.listeners.get(eventName);
    if (!callbacks) return;

    for (const callback of [...callbacks]) {
      try {
        callback(detail);
      } catch (error) {
        console.error(
          `[InteractionSystem] Erro no evento "${eventName}":`,
          error
        );
      }
    }
  }

  // =========================
  // REGISTRO DE INTERAÇÕES
  // =========================

  register(config = {}) {
    const id = config.id ?? `interaction_${this.nextId++}`;

    if (this.interactions.has(id)) {
      throw new Error(`A interação "${id}" já está registrada.`);
    }

    const target = {
      id,
      name: config.name || "Objeto desconhecido",
      type: config.type || "object",

      position: this.normalizePosition(config.position),

      range: Math.max(
        0.1,
        Number(config.range) || this.defaultRange
      ),

      enabled: config.enabled !== false,
      visible: config.visible !== false,
      repeatable: config.repeatable !== false,
      interacted: false,

      prompt: config.prompt || "Interagir",
      icon: config.icon || "interact",

      condition:
        typeof config.condition === "function"
          ? config.condition
          : null,

      action:
        typeof config.action === "function"
          ? config.action
          : null,

      metadata: config.metadata ?? {}
    };

    this.interactions.set(id, target);

    this.emit("interaction:registered", {
      id,
      target: this.getTarget(id)
    });

    return id;
  }

  unregister(id) {
    const target = this.interactions.get(id);
    if (!target) return false;

    this.interactions.delete(id);

    if (this.currentTargetId === id) {
      this.setCurrentTarget(null);
    }

    this.emit("interaction:unregistered", {
      id,
      name: target.name
    });

    return true;
  }

  getTarget(id) {
    const target = this.interactions.get(id);
    if (!target) return null;

    return {
      ...target,
      position: { ...target.position },
      metadata: { ...target.metadata }
    };
  }

  getAllTargets() {
    return [...this.interactions.keys()]
      .map(id => this.getTarget(id));
  }

  // =========================
  // POSIÇÃO DO JOGADOR
  // =========================

  setPlayerPosition(position) {
    this.playerPosition = this.normalizePosition(position);
    return this.updateTarget();
  }

  normalizePosition(position) {
    if (!position) {
      return { x: 0, y: 0, z: 0 };
    }

    return {
      x: Number(position.x) || 0,
      y: Number(position.y) || 0,
      z: Number(position.z) || 0
    };
  }

  updateTarget() {
    if (!this.enabled) {
      this.setCurrentTarget(null);
      return null;
    }

    let nearest = null;
    let nearestDistance = Infinity;

    for (const target of this.interactions.values()) {
      if (!this.isAvailable(target)) continue;

      const distance = this.distanceTo(target.position);

      if (
        distance <= target.range &&
        distance < nearestDistance
      ) {
        nearest = target;
        nearestDistance = distance;
      }
    }

    this.setCurrentTarget(nearest?.id ?? null);

    if (!nearest) return null;

    return {
      target: this.getTarget(nearest.id),
      distance: nearestDistance
    };
  }

  distanceTo(position) {
    const dx = this.playerPosition.x - position.x;
    const dy = this.playerPosition.y - position.y;
    const dz = this.playerPosition.z - position.z;

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  setCurrentTarget(id) {
    if (this.currentTargetId === id) return;

    const previousId = this.currentTargetId;
    this.currentTargetId = id;

    if (previousId !== null) {
      this.emit("interaction:target-lost", {
        target: this.getTarget(previousId)
      });
    }

    if (id !== null) {
      const target = this.getTarget(id);

      this.emit("interaction:target-found", {
        target,
        distance: this.distanceTo(target.position)
      });
    }

    this.emit("interaction:target-changed", {
      previousId,
      currentId: id,
      target: id ? this.getTarget(id) : null
    });
  }

  getCurrentTarget() {
    if (!this.currentTargetId) return null;

    const target = this.getTarget(this.currentTargetId);

    if (!target || !this.isAvailable(target)) {
      this.setCurrentTarget(null);
      return null;
    }

    const distance = this.distanceTo(target.position);

    if (distance > target.range) {
      this.setCurrentTarget(null);
      return null;
    }

    return {
      target,
      distance
    };
  }

  // =========================
  // DISPONIBILIDADE
  // =========================

  isAvailable(target) {
    if (!target) return false;
    if (!target.enabled || !target.visible) return false;

    if (!target.repeatable && target.interacted) {
      return false;
    }

    if (target.condition) {
      try {
        return target.condition({
          target: this.getTarget(target.id),
          playerPosition: { ...this.playerPosition }
        }) === true;
      } catch (error) {
        console.error(
          `[InteractionSystem] Condição inválida em "${target.id}":`,
          error
        );

        return false;
      }
    }

    return true;
  }

  setEnabled(id, enabled) {
    const target = this.interactions.get(id);
    if (!target) return false;

    target.enabled = Boolean(enabled);

    if (
      !target.enabled &&
      this.currentTargetId === id
    ) {
      this.setCurrentTarget(null);
    }

    this.emit("interaction:updated", {
      target: this.getTarget(id)
    });

    return true;
  }

  setVisible(id, visible) {
    const target = this.interactions.get(id);
    if (!target) return false;

    target.visible = Boolean(visible);

    if (
      !target.visible &&
      this.currentTargetId === id
    ) {
      this.setCurrentTarget(null);
    }

    this.emit("interaction:updated", {
      target: this.getTarget(id)
    });

    return true;
  }

  updatePosition(id, position) {
    const target = this.interactions.get(id);
    if (!target) return false;

    target.position = this.normalizePosition(position);

    if (this.currentTargetId === id) {
      this.updateTarget();
    }

    this.emit("interaction:updated", {
      target: this.getTarget(id)
    });

    return true;
  }

  // =========================
  // EXECUÇÃO DA INTERAÇÃO
  // =========================

  interact(id = this.currentTargetId) {
    if (!this.enabled) {
      return {
        success: false,
        reason: "system_disabled"
      };
    }

    if (!id) {
      return {
        success: false,
        reason: "no_target"
      };
    }

    const target = this.interactions.get(id);

    if (!target) {
      return {
        success: false,
        reason: "target_not_found"
      };
    }

    if (!this.isAvailable(target)) {
      return {
        success: false,
        reason: "target_unavailable"
      };
    }

    const distance = this.distanceTo(target.position);

    if (distance > target.range) {
      return {
        success: false,
        reason: "out_of_range",
        distance,
        range: target.range
      };
    }

    const context = {
      target: this.getTarget(id),
      playerPosition: { ...this.playerPosition },
      distance,
      metadata: { ...target.metadata }
    };

    this.emit("interaction:started", context);

    let result = { success: true };

    if (target.action) {
      try {
        const actionResult = target.action(context);

        if (actionResult === false) {
          result = {
            success: false,
            reason: "action_rejected"
          };
        } else if (
          actionResult &&
          typeof actionResult === "object"
        ) {
          result = {
            ...actionResult,
            success: actionResult.success !== false
          };
        }
      } catch (error) {
        console.error(
          `[InteractionSystem] Erro ao interagir com "${id}":`,
          error
        );

        result = {
          success: false,
          reason: "action_error",
          error: error.message
        };
      }
    }

    if (!result.success) {
      this.emit("interaction:failed", {
        ...context,
        result
      });

      return result;
    }

    target.interacted = true;

    this.emit("interaction:completed", {
      ...context,
      result
    });

    if (!target.repeatable) {
      this.setCurrentTarget(null);
    }

    return {
      success: true,
      targetId: id,
      result
    };
  }

  // =========================
  // UTILITÁRIOS
  // =========================

  resetInteraction(id) {
    const target = this.interactions.get(id);
    if (!target) return false;

    target.interacted = false;

    this.emit("interaction:updated", {
      target: this.getTarget(id)
    });

    return true;
  }

  setSystemEnabled(enabled) {
    this.enabled = Boolean(enabled);

    if (!this.enabled) {
      this.setCurrentTarget(null);
    } else {
      this.updateTarget();
    }
  }

  clear() {
    this.interactions.clear();
    this.setCurrentTarget(null);

    this.emit("interaction:cleared", {});
  }

  destroy() {
    this.clear();
    this.listeners.clear();
  }

  exportSave() {
    return {
      version: 1,
      interactions: [...this.interactions.values()].map(target => ({
        id: target.id,
        enabled: target.enabled,
        visible: target.visible,
        interacted: target.interacted,
        position: { ...target.position }
      }))
    };
  }

  importSave(data) {
    if (!data || !Array.isArray(data.interactions)) {
      return false;
    }

    for (const saved of data.interactions) {
      const target = this.interactions.get(saved.id);
      if (!target) continue;

      if (typeof saved.enabled === "boolean") {
        target.enabled = saved.enabled;
      }

      if (typeof saved.visible === "boolean") {
        target.visible = saved.visible;
      }

      if (typeof saved.interacted === "boolean") {
        target.interacted = saved.interacted;
      }

      if (saved.position) {
        target.position = this.normalizePosition(saved.position);
      }
    }

    this.updateTarget();
    this.emit("interaction:save-loaded", {});

    return true;
  }
}

export default InteractionSystem;
