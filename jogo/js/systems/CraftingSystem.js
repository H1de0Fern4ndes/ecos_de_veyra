
export class CraftingSystem {
  constructor(options = {}) {
    this.recipes = new Map();
    this.listeners = new Map();

    this.inventory = options.inventory || null;
    this.getItem = options.getItem || null;

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
        console.error(`[CraftingSystem] Evento "${event}":`, error);
      }
    }
  }

  // =========================
  // RECEITAS
  // =========================

  registerRecipe(config = {}) {
    if (!config.id) {
      throw new Error("A receita precisa de um ID.");
    }

    if (this.recipes.has(config.id)) {
      throw new Error(`A receita "${config.id}" já existe.`);
    }

    if (!config.result?.itemId) {
      throw new Error("A receita precisa definir o item produzido.");
    }

    if (
      !Array.isArray(config.materials) ||
      config.materials.length === 0
    ) {
      throw new Error("A receita precisa de pelo menos um material.");
    }

    const materials = config.materials.map(material => {
      const quantity = Math.floor(Number(material.quantity));

      if (!material.itemId || quantity < 1) {
        throw new Error(
          `Material inválido na receita "${config.id}".`
        );
      }

      return {
        itemId: material.itemId,
        quantity
      };
    });

    const recipe = {
      id: config.id,
      name: config.name || config.id,
      description: config.description || "",
      category: config.category || "general",

      materials,

      result: {
        itemId: config.result.itemId,
        quantity: Math.max(
          1,
          Math.floor(Number(config.result.quantity) || 1)
        )
      },

      requiredLevel: Math.max(
        1,
        Math.floor(Number(config.requiredLevel) || 1)
      ),

      requiredStation: config.requiredStation || null,

      goldCost: Math.max(
        0,
        Math.floor(Number(config.goldCost) || 0)
      ),

      craftingTime: Math.max(
        0,
        Number(config.craftingTime) || 0
      ),

      unlocked: config.unlocked !== false,
      metadata: config.metadata ?? {}
    };

    this.recipes.set(recipe.id, recipe);

    this.emit("crafting:recipe-registered", {
      recipe: this.cloneRecipe(recipe)
    });

    return recipe.id;
  }

  cloneRecipe(recipe) {
    return {
      ...recipe,
      materials: recipe.materials.map(material => ({ ...material })),
      result: { ...recipe.result },
      metadata: { ...recipe.metadata }
    };
  }

  getRecipe(id) {
    const recipe = this.recipes.get(id);
    return recipe ? this.cloneRecipe(recipe) : null;
  }

  getAllRecipes() {
    return [...this.recipes.values()].map(recipe =>
      this.cloneRecipe(recipe)
    );
  }

  getRecipesByCategory(category) {
    return this.getAllRecipes().filter(
      recipe => recipe.category === category
    );
  }

  // =========================
  // INVENTÁRIO
  // =========================

  setInventory(inventory) {
    this.inventory = inventory || null;
  }

  setItemResolver(getItem) {
    this.getItem = typeof getItem === "function" ? getItem : null;
  }

  hasInventory() {
    return Boolean(
      this.inventory &&
      typeof this.inventory.getInventory === "function" &&
      typeof this.inventory.addItem === "function" &&
      typeof this.inventory.removeItem === "function"
    );
  }

  getInventoryQuantity(itemId) {
    if (!this.hasInventory()) return 0;

    const entries = this.inventory.getInventory();

    if (!Array.isArray(entries)) return 0;

    return entries.reduce((total, entry) => {
      if (entry.id !== itemId) return total;

      return total + Math.max(
        0,
        Number(entry.quantity) || 0
      );
    }, 0);
  }

  // =========================
  // VERIFICAÇÃO DE RECEITAS
  // =========================

  canCraft(id, context = {}) {
    if (!this.enabled) {
      return { allowed: false, reason: "system_disabled" };
    }

    const recipe = this.recipes.get(id);

    if (!recipe) {
      return { allowed: false, reason: "recipe_not_found" };
    }

    if (!recipe.unlocked) {
      return { allowed: false, reason: "recipe_locked" };
    }

    if (!this.hasInventory()) {
      return { allowed: false, reason: "inventory_not_configured" };
    }

    const level = Math.max(
      1,
      Math.floor(Number(context.characterLevel) || 1)
    );

    if (level < recipe.requiredLevel) {
      return {
        allowed: false,
        reason: "level_too_low",
        requiredLevel: recipe.requiredLevel
      };
    }

    if (
      recipe.requiredStation &&
      context.station !== recipe.requiredStation
    ) {
      return {
        allowed: false,
        reason: "wrong_station",
        requiredStation: recipe.requiredStation
      };
    }

    const gold = Math.max(0, Number(context.gold) || 0);

    if (gold < recipe.goldCost) {
      return {
        allowed: false,
        reason: "insufficient_gold",
        requiredGold: recipe.goldCost
      };
    }

    const missing = [];

    for (const material of recipe.materials) {
      const available = this.getInventoryQuantity(material.itemId);

      if (available < material.quantity) {
        missing.push({
          itemId: material.itemId,
          required: material.quantity,
          available,
          missing: material.quantity - available
        });
      }
    }

    if (missing.length > 0) {
      return {
        allowed: false,
        reason: "missing_materials",
        missing
      };
    }

    return {
      allowed: true,
      recipe: this.cloneRecipe(recipe)
    };
  }

  // =========================
  // CRIAÇÃO DE ITENS
  // =========================

  craft(id, context = {}) {
    const check = this.canCraft(id, context);

    if (!check.allowed) {
      return {
        success: false,
        reason: check.reason,
        details: check
      };
    }

    const recipe = this.recipes.get(id);
    const removedMaterials = [];

    // Retira os materiais. Se uma remoção falhar,
    // tenta devolver os materiais já retirados.
    for (const material of recipe.materials) {
      const result = this.inventory.removeItem(
        material.itemId,
        material.quantity
      );

      if (result === false || result?.success === false) {
        for (const removed of removedMaterials) {
          this.inventory.addItem(
            removed.itemId,
            removed.quantity
          );
        }

        return {
          success: false,
          reason: "material_removal_failed",
          itemId: material.itemId
        };
      }

      removedMaterials.push({
        itemId: material.itemId,
        quantity: material.quantity
      });
    }

    const output = this.inventory.addItem(
      recipe.result.itemId,
      recipe.result.quantity
    );

    if (output === false || output?.success === false) {
      // Reembolsa os materiais se o inventário rejeitar o resultado.
      for (const removed of removedMaterials) {
        this.inventory.addItem(
          removed.itemId,
          removed.quantity
        );
      }

      return {
        success: false,
        reason: "output_add_failed"
      };
    }

    const result = {
      success: true,
      recipeId: id,
      recipeName: recipe.name,
      itemId: recipe.result.itemId,
      quantity: recipe.result.quantity,
      materialsConsumed: removedMaterials,
      craftingTime: recipe.craftingTime
    };

    this.emit("crafting:completed", result);

    return result;
  }

  // =========================
  // RECEITAS DESBLOQUEÁVEIS
  // =========================

  unlockRecipe(id) {
    const recipe = this.recipes.get(id);

    if (!recipe) {
      return {
        success: false,
        reason: "recipe_not_found"
      };
    }

    if (recipe.unlocked) {
      return {
        success: false,
        reason: "already_unlocked"
      };
    }

    recipe.unlocked = true;

    this.emit("crafting:recipe-unlocked", {
      recipe: this.cloneRecipe(recipe)
    });

    return { success: true, recipeId: id };
  }

  lockRecipe(id) {
    const recipe = this.recipes.get(id);
    if (!recipe) return false;

    recipe.unlocked = false;

    this.emit("crafting:recipe-locked", { recipeId: id });

    return true;
  }

  // =========================
  // CONTROLE
  // =========================

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
  }

  exportSave() {
    return {
      version: 1,
      unlockedRecipes: [...this.recipes.values()]
        .filter(recipe => recipe.unlocked)
        .map(recipe => recipe.id)
    };
  }

  importSave(data) {
    if (!data || !Array.isArray(data.unlockedRecipes)) {
      return false;
    }

    const unlocked = new Set(data.unlockedRecipes);

    for (const recipe of this.recipes.values()) {
      recipe.unlocked = unlocked.has(recipe.id);
    }

    this.emit("crafting:save-loaded", {});

    return true;
  }

  destroy() {
    this.recipes.clear();
    this.listeners.clear();
  }
}

export default CraftingSystem;
