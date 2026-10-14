
/**
 * Ecos de Veyra — QuestSystem
 * Gerencia missões, objetivos, progresso e recompensas.
 *
 * Compatível com JavaScript ES Modules.
 * Não depende de Three.js.
 */

export class QuestSystem {
  constructor(options = {}) {
    this.quests = new Map();
    this.activeQuestIds = new Set();
    this.completedQuestIds = new Set();
    this.events = new Map();

    this.maxActiveQuests = Math.max(
      1,
      Math.floor(options.maxActiveQuests ?? 10)
    );

    this.autoComplete = options.autoComplete !== false;
  }

  // -----------------------------
  // Eventos
  // -----------------------------

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
          `[QuestSystem] Erro no evento "${eventName}":`,
          error
        );
      }
    }
  }

  // -----------------------------
  // Cadastro de missões
  // -----------------------------

  registerQuest(definition) {
    if (!definition || typeof definition.id !== "string") {
      throw new TypeError("A missão precisa ter um ID válido.");
    }

    const id = definition.id.trim();

    if (!id) {
      throw new Error("O ID da missão não pode estar vazio.");
    }

    if (this.quests.has(id)) {
      throw new Error(`A missão "${id}" já está cadastrada.`);
    }

    const objectives = Array.isArray(definition.objectives)
      ? definition.objectives
      : [];

    const normalizedObjectives = objectives.map((objective, index) => {
      if (!objective || typeof objective.id !== "string") {
        throw new TypeError(
          `O objetivo ${index + 1} da missão "${id}" precisa de um ID.`
        );
      }

      const target = Math.max(
        1,
        Math.floor(Number(objective.target) || 1)
      );

      return {
        id: objective.id.trim(),
        description: String(
          objective.description ?? "Objetivo"
        ),
        type: String(objective.type ?? "custom"),
        target,
        progress: 0,
        completed: false,
        metadata: objective.metadata ?? {}
      };
    });

    const objectiveIds = normalizedObjectives.map(item => item.id);

    if (new Set(objectiveIds).size !== objectiveIds.length) {
      throw new Error(
        `A missão "${id}" possui IDs de objetivos duplicados.`
      );
    }

    const quest = {
      id,
      title: String(definition.title ?? "Missão sem título"),
      description: String(definition.description ?? ""),
      type: String(definition.type ?? "side"),
      level: Math.max(1, Math.floor(Number(definition.level) || 1)),
      prerequisites: Array.isArray(definition.prerequisites)
        ? [...definition.prerequisites]
        : [],
      objectives: normalizedObjectives,
      rewards: this.normalizeRewards(definition.rewards),
      status: "available",
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      metadata: definition.metadata ?? {}
    };

    this.quests.set(id, quest);

    this.emit("quest:registered", {
      quest: this.getQuest(id)
    });

    return this.getQuest(id);
  }

  normalizeRewards(rewards = {}) {
    return {
      experience: Math.max(
        0,
        Number(rewards.experience) || 0
      ),
      gold: Math.max(0, Number(rewards.gold) || 0),
      items: Array.isArray(rewards.items)
        ? rewards.items.map(item => ({
            id: String(item.id),
            quantity: Math.max(
              1,
              Math.floor(Number(item.quantity) || 1)
            )
          }))
        : []
    };
  }

  // -----------------------------
  // Consulta
  // -----------------------------

  getQuest(id) {
    const quest = this.quests.get(id);

    return quest ? this.cloneQuest(quest) : null;
  }

  getAllQuests() {
    return [...this.quests.values()].map(quest =>
      this.cloneQuest(quest)
    );
  }

  getActiveQuests() {
    return [...this.activeQuestIds]
      .map(id => this.quests.get(id))
      .filter(Boolean)
      .map(quest => this.cloneQuest(quest));
  }

  getCompletedQuests() {
    return [...this.completedQuestIds]
      .map(id => this.quests.get(id))
      .filter(Boolean)
      .map(quest => this.cloneQuest(quest));
  }

  getAvailableQuests() {
    return [...this.quests.values()]
      .filter(quest => this.canStartQuest(quest.id))
      .map(quest => this.cloneQuest(quest));
  }

  cloneQuest(quest) {
    return {
      ...quest,
      prerequisites: [...quest.prerequisites],
      objectives: quest.objectives.map(objective => ({
        ...objective,
        metadata: { ...objective.metadata }
      })),
      rewards: {
        ...quest.rewards,
        items: quest.rewards.items.map(item => ({ ...item }))
      },
      metadata: { ...quest.metadata }
    };
  }

  // -----------------------------
  // Iniciar missões
  // -----------------------------

  canStartQuest(id) {
    const quest = this.quests.get(id);

    if (!quest || quest.status !== "available") {
      return false;
    }

    if (this.activeQuestIds.size >= this.maxActiveQuests) {
      return false;
    }

    return quest.prerequisites.every(prerequisite =>
      this.completedQuestIds.has(prerequisite)
    );
  }

  startQuest(id) {
    const quest = this.quests.get(id);

    if (!quest) {
      return {
        success: false,
        reason: "not_found"
      };
    }

    if (!this.canStartQuest(id)) {
      return {
        success: false,
        reason: this.activeQuestIds.size >= this.maxActiveQuests
          ? "active_limit"
          : "prerequisites_or_status"
      };
    }

    quest.status = "active";
    quest.startedAt = Date.now();

    this.activeQuestIds.add(id);

    this.emit("quest:started", {
      quest: this.getQuest(id)
    });

    if (quest.objectives.length === 0 && this.autoComplete) {
      this.completeQuest(id);
    }

    return {
      success: true,
      quest: this.getQuest(id)
    };
  }

  // -----------------------------
  // Atualizar objetivos
  // -----------------------------

  updateObjective(questId, objectiveId, amount = 1) {
    const quest = this.quests.get(questId);

    if (!quest || quest.status !== "active") {
      return {
        success: false,
        reason: "quest_not_active"
      };
    }

    const objective = quest.objectives.find(
      item => item.id === objectiveId
    );

    if (!objective) {
      return {
        success: false,
        reason: "objective_not_found"
      };
    }

    if (objective.completed) {
      return {
        success: false,
        reason: "objective_completed"
      };
    }

    const increment = Number(amount);

    if (!Number.isFinite(increment) || increment <= 0) {
      return {
        success: false,
        reason: "invalid_amount"
      };
    }

    const previousProgress = objective.progress;

    objective.progress = Math.min(
      objective.target,
      objective.progress + increment
    );

    objective.completed =
      objective.progress >= objective.target;

    this.emit("quest:objective_updated", {
      questId,
      objective: { ...objective },
      previousProgress,
      progress: objective.progress,
      target: objective.target
    });

    if (objective.completed) {
      this.emit("quest:objective_completed", {
        questId,
        objective: { ...objective }
      });
    }

    if (
      this.autoComplete &&
      quest.objectives.length > 0 &&
      quest.objectives.every(item => item.completed)
    ) {
      this.completeQuest(questId);
    }

    return {
      success: true,
      objective: { ...objective },
      quest: this.getQuest(questId)
    };
  }

  /**
   * Atualiza objetivos pelo tipo.
   *
   * Exemplo:
   * recordProgress("kill", { enemyId: "wolf", amount: 1 })
   */
  recordProgress(type, data = {}) {
    const results = [];
    const amount = Number(data.amount ?? 1);

    for (const questId of this.activeQuestIds) {
      const quest = this.quests.get(questId);

      if (!quest) continue;

      for (const objective of quest.objectives) {
        if (
          objective.completed ||
          objective.type !== type
        ) {
          continue;
        }

        const requiredTarget = objective.metadata.targetId;

        if (
          requiredTarget &&
          requiredTarget !== data.targetId
        ) {
          continue;
        }

        results.push(
          this.updateObjective(
            questId,
            objective.id,
            amount
          )
        );
      }
    }

    return results;
  }

  // -----------------------------
  // Concluir e cancelar
  // -----------------------------

  completeQuest(id) {
    const quest = this.quests.get(id);

    if (!quest || quest.status !== "active") {
      return {
        success: false,
        reason: "quest_not_active"
      };
    }

    const allObjectivesComplete = quest.objectives.every(
      objective => objective.completed
    );

    if (!allObjectivesComplete) {
      return {
        success: false,
        reason: "objectives_incomplete"
      };
    }

    quest.status = "completed";
    quest.completedAt = Date.now();

    this.activeQuestIds.delete(id);
    this.completedQuestIds.add(id);

    const result = {
      quest: this.getQuest(id),
      rewards: {
        ...quest.rewards,
        items: quest.rewards.items.map(item => ({ ...item }))
      }
    };

    this.emit("quest:completed", result);
    this.emit("quest:rewards", result);

    return {
      success: true,
      ...result
    };
  }

  abandonQuest(id) {
    const quest = this.quests.get(id);

    if (!quest || quest.status !== "active") {
      return {
        success: false,
        reason: "quest_not_active"
      };
    }

    quest.status = "available";
    quest.startedAt = null;

    for (const objective of quest.objectives) {
      objective.progress = 0;
      objective.completed = false;
    }

    this.activeQuestIds.delete(id);

    this.emit("quest:abandoned", {
      quest: this.getQuest(id)
    });

    return {
      success: true,
      quest: this.getQuest(id)
    };
  }

  // -----------------------------
  // Persistência
  // -----------------------------

  exportSave() {
    return {
      version: 1,
      activeQuestIds: [...this.activeQuestIds],
      completedQuestIds: [...this.completedQuestIds],
      quests: [...this.quests.values()].map(quest => ({
        id: quest.id,
        status: quest.status,
        startedAt: quest.startedAt,
        completedAt: quest.completedAt,
        objectives: quest.objectives.map(objective => ({
          id: objective.id,
          progress: objective.progress,
          completed: objective.completed
        }))
      }))
    };
  }

  importSave(saveData) {
    if (!saveData || !Array.isArray(saveData.quests)) {
      throw new TypeError("Dados de salvamento inválidos.");
    }

    const restored = [];

    for (const savedQuest of saveData.quests) {
      const quest = this.quests.get(savedQuest.id);

      // Ignora missões do save que não existem nesta versão do jogo.
      if (!quest) continue;

      const savedObjectives = new Map(
        (savedQuest.objectives ?? []).map(objective => [
          objective.id,
          objective
        ])
      );

      for (const objective of quest.objectives) {
        const saved = savedObjectives.get(objective.id);

        if (!saved) continue;

        const progress = Number(saved.progress);

        objective.progress = Number.isFinite(progress)
          ? Math.max(0, Math.min(objective.target, progress))
          : 0;

        objective.completed =
          objective.progress >= objective.target;
      }

      const validStatuses = [
        "available",
        "active",
        "completed"
      ];

      quest.status = validStatuses.includes(savedQuest.status)
        ? savedQuest.status
        : "available";

      quest.startedAt = savedQuest.startedAt ?? null;
      quest.completedAt = savedQuest.completedAt ?? null;

      restored.push(quest.id);
    }

    this.activeQuestIds.clear();
    this.completedQuestIds.clear();

    for (const id of restored) {
      const quest = this.quests.get(id);

      if (quest.status === "active") {
        this.activeQuestIds.add(id);
      }

      if (quest.status === "completed") {
        this.completedQuestIds.add(id);
      }
    }

    // Impede um save antigo ou alterado de exceder o limite.
    while (this.activeQuestIds.size > this.maxActiveQuests) {
      const id = [...this.activeQuestIds].pop();

      this.activeQuestIds.delete(id);

      const quest = this.quests.get(id);

      if (quest) {
        quest.status = "available";
      }
    }

    this.emit("quest:save_loaded", {
      restoredQuestIds: [...restored]
    });

    return {
      success: true,
      restoredCount: restored.length
    };
  }
}

export default QuestSystem;
