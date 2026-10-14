// js/systems/AchievementSystem.js

export class AchievementSystem {
  constructor() {
    this.achievements = new Map();
    this.progress = new Map();
    this.listeners = new Map();
  }

  // =====================================
  // EVENTOS
  // =====================================

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
    for (const callback of this.listeners.get(eventName) ?? []) {
      try {
        callback(data);
      } catch (error) {
        console.error(
          `[AchievementSystem] Erro no evento "${eventName}":`,
          error
        );
      }
    }
  }

  // =====================================
  // CADASTRAR CONQUISTAS
  // =====================================

  registerAchievement(id, config = {}) {
    if (!id) {
      throw new Error("A conquista precisa de um ID.");
    }

    if (this.achievements.has(id)) {
      throw new Error(`A conquista "${id}" já existe.`);
    }

    const target = Number(config.target ?? 1);

    if (!Number.isFinite(target) || target <= 0) {
      throw new Error("O objetivo da conquista precisa ser positivo.");
    }

    const achievement = {
      id,
      name: config.name ?? id,
      description: config.description ?? "",
      category: config.category ?? "general",
      target,
      hidden: Boolean(config.hidden),

      prerequisites: Array.isArray(config.prerequisites)
        ? [...config.prerequisites]
        : [],

      rewards: {
        experience: Math.max(
          0,
          Number(config.rewards?.experience) || 0
        ),
        gold: Math.max(
          0,
          Number(config.rewards?.gold) || 0
        ),
        items: Array.isArray(config.rewards?.items)
          ? config.rewards.items.map(item => ({ ...item }))
          : []
      },

      metadata: { ...(config.metadata ?? {}) }
    };

    this.achievements.set(id, achievement);

    this.progress.set(id, {
      current: 0,
      unlocked: false,
      claimed: false,
      unlockedAt: null
    });

    this.emit("achievement:registered", {
      achievementId: id
    });

    return this.getAchievement(id);
  }

  // =====================================
  // CONSULTAS
  // =====================================

  getAchievement(id) {
    const achievement = this.achievements.get(id);

    if (!achievement) return null;

    return {
      ...this.clone(achievement),
      ...this.clone(this.progress.get(id))
    };
  }

  getAllAchievements(options = {}) {
    return [...this.achievements.keys()]
      .map(id => this.getAchievement(id))
      .filter(achievement =>
        options.includeHidden === true ||
        !achievement.hidden ||
        achievement.unlocked
      );
  }

  getUnlockedAchievements() {
    return this.getAllAchievements({ includeHidden: true })
      .filter(achievement => achievement.unlocked);
  }

  getCompletionStats() {
    const total = this.achievements.size;
    const unlocked = [...this.progress.values()]
      .filter(item => item.unlocked).length;

    return {
      total,
      unlocked,
      remaining: total - unlocked,
      percentage: total === 0
        ? 0
        : Math.round((unlocked / total) * 100)
    };
  }

  // =====================================
  // PRÉ-REQUISITOS
  // =====================================

  prerequisitesMet(id) {
    const achievement = this.achievements.get(id);

    if (!achievement) return false;

    return achievement.prerequisites.every(requiredId => {
      const required = this.progress.get(requiredId);

      return Boolean(required?.unlocked);
    });
  }

  // =====================================
  // ATUALIZAR PROGRESSO
  // =====================================

  addProgress(id, amount = 1) {
    const achievement = this.achievements.get(id);
    const progress = this.progress.get(id);
    const increment = Number(amount);

    if (!achievement || !progress) {
      return {
        success: false,
        reason: "achievement_not_found"
      };
    }

    if (progress.unlocked) {
      return {
        success: false,
        reason: "already_unlocked"
      };
    }

    if (!Number.isFinite(increment) || increment <= 0) {
      return {
        success: false,
        reason: "invalid_amount"
      };
    }

    if (!this.prerequisitesMet(id)) {
      return {
        success: false,
        reason: "prerequisites_not_met"
      };
    }

    progress.current = Math.min(
      achievement.target,
      progress.current + increment
    );

    this.emit("achievement:progress", {
      achievementId: id,
      current: progress.current,
      target: achievement.target,
      percentage: Math.round(
        (progress.current / achievement.target) * 100
      )
    });

    if (progress.current >= achievement.target) {
      this.unlockAchievement(id);
    }

    return {
      success: true,
      current: progress.current,
      target: achievement.target,
      unlocked: progress.unlocked
    };
  }

  setProgress(id, value) {
    const achievement = this.achievements.get(id);
    const progress = this.progress.get(id);
    const amount = Number(value);

    if (!achievement || !progress) {
      return {
        success: false,
        reason: "achievement_not_found"
      };
    }

    if (progress.unlocked) {
      return {
        success: false,
        reason: "already_unlocked"
      };
    }

    if (!Number.isFinite(amount) || amount < 0) {
      return {
        success: false,
        reason: "invalid_amount"
      };
    }

    progress.current = Math.min(amount, achievement.target);

    this.emit("achievement:progress", {
      achievementId: id,
      current: progress.current,
      target: achievement.target,
      percentage: Math.round(
        (progress.current / achievement.target) * 100
      )
    });

    if (
      progress.current >= achievement.target &&
      this.prerequisitesMet(id)
    ) {
      this.unlockAchievement(id);
    }

    return {
      success: true,
      current: progress.current,
      target: achievement.target,
      unlocked: progress.unlocked
    };
  }

  // =====================================
  // DESBLOQUEAR CONQUISTAS
  // =====================================

  unlockAchievement(id) {
    const achievement = this.achievements.get(id);
    const progress = this.progress.get(id);

    if (!achievement || !progress || progress.unlocked) {
      return false;
    }

    if (!this.prerequisitesMet(id)) {
      return false;
    }

    // Não permite desbloquear antes de cumprir o objetivo.
    if (progress.current < achievement.target) {
      return false;
    }

    progress.unlocked = true;
    progress.unlockedAt = Date.now();

    this.emit("achievement:unlocked", {
      achievement: this.getAchievement(id),
      rewards: this.clone(achievement.rewards)
    });

    return true;
  }

  // =====================================
  // RESGATAR RECOMPENSAS
  // =====================================

  claimRewards(id) {
    const achievement = this.achievements.get(id);
    const progress = this.progress.get(id);

    if (!achievement || !progress) {
      return {
        success: false,
        reason: "achievement_not_found"
      };
    }

    if (!progress.unlocked) {
      return {
        success: false,
        reason: "not_unlocked"
      };
    }

    if (progress.claimed) {
      return {
        success: false,
        reason: "already_claimed"
      };
    }

    progress.claimed = true;

    const rewards = this.clone(achievement.rewards);

    this.emit("achievement:rewards_claimed", {
      achievementId: id,
      rewards
    });

    return {
      success: true,
      rewards
    };
  }

  // =====================================
  // PROGRESSO POR EVENTOS DO JOGO
  // =====================================

  handleGameEvent(eventName, amount = 1) {
    const results = [];

    for (const achievement of this.achievements.values()) {
      if (achievement.metadata.event !== eventName) {
        continue;
      }

      const result = this.addProgress(
        achievement.id,
        amount
      );

      results.push({
        achievementId: achievement.id,
        ...result
      });
    }

    return results;
  }

  // =====================================
  // RESETAR PROGRESSO
  // =====================================

  resetAchievement(id) {
    if (!this.achievements.has(id)) {
      return false;
    }

    this.progress.set(id, {
      current: 0,
      unlocked: false,
      claimed: false,
      unlockedAt: null
    });

    this.emit("achievement:reset", {
      achievementId: id
    });

    return true;
  }

  resetAll() {
    for (const id of this.achievements.keys()) {
      this.progress.set(id, {
        current: 0,
        unlocked: false,
        claimed: false,
        unlockedAt: null
      });
    }

    this.emit("achievements:reset");
  }

  // =====================================
  // SALVAR E CARREGAR
  // =====================================

  exportData() {
    return {
      version: 1,

      progress: [...this.progress.entries()].map(
        ([id, data]) => ({
          id,
          current: data.current,
          unlocked: data.unlocked,
          claimed: data.claimed,
          unlockedAt: data.unlockedAt
        })
      )
    };
  }

  importData(data) {
    if (!data || !Array.isArray(data.progress)) {
      throw new Error("Dados de conquistas inválidos.");
    }

    for (const saved of data.progress) {
      const achievement = this.achievements.get(saved.id);

      if (!achievement) continue;

      const current = Number(saved.current);

      const validCurrent = Number.isFinite(current)
        ? Math.max(0, Math.min(current, achievement.target))
        : 0;

      const unlocked = Boolean(saved.unlocked) &&
        validCurrent >= achievement.target;

      this.progress.set(saved.id, {
        current: validCurrent,
        unlocked,
        claimed: unlocked && Boolean(saved.claimed),
        unlockedAt: unlocked
          ? Number(saved.unlockedAt) || null
          : null
      });
    }

    this.emit("data:imported", {
      stats: this.getCompletionStats()
    });
  }

  // =====================================
  // UTILITÁRIO
  // =====================================

  clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
}

export default AchievementSystem;