
/**
 * Ecos de Veyra — InventorySystem
 * Gerencia itens, quantidades, equipamentos e consumo.
 *
 * JavaScript ES Modules.
 * Independente do Three.js.
 */

export class InventorySystem {
  constructor(options = {}) {
    this.items = new Map();
    this.inventory = new Map();
    this.equipment = new Map();
    this.events = new Map();

    this.maxSlots = Math.max(
      1,
      Math.floor(Number(options.maxSlots) || 30)
    );

    this.maxStackSize = Math.max(
      1,
      Math.floor(Number(options.maxStackSize) || 99)
    );

    this.equipmentSlots = [
      "head",
      "chest",
      "legs",
      "feet",
      "weapon",
      "offhand",
      "accessory"
    ];
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
          `[InventorySystem] Erro no evento "${eventName}":`,
          error
        );
      }
    }
  }

  // ========================================
  // DEFINIÇÕES DOS ITENS
  // ========================================

  registerItem(definition) {
    if (!definition || typeof definition.id !== "string") {
      throw new TypeError("O item precisa ter um ID válido.");
    }

    const id = definition.id.trim();

    if (!id) {
      throw new Error("O ID do item não pode estar vazio.");
    }

    if (this.items.has(id)) {
      throw new Error(`O item "${id}" já está cadastrado.`);
    }

    const type = String(definition.type ?? "misc");

    const item = {
      id,
      name: String(definition.name ?? id),
      description: String(definition.description ?? ""),
      type,
      rarity: String(definition.rarity ?? "common"),
      stackable: definition.stackable !== false,
      maxStack: definition.stackable === false
        ? 1
        : Math.max(
            1,
            Math.min(
              this.maxStackSize,
              Math.floor(Number(definition.maxStack) ||
                this.maxStackSize)
            )
          ),
      weight: Math.max(0, Number(definition.weight) || 0),
      value: Math.max(0, Number(definition.value) || 0),
      equipmentSlot: definition.equipmentSlot ?? null,
      stats: this.normalizeStats(definition.stats),
      effects: this.normalizeEffects(definition.effects),
      icon: definition.icon ?? null,
      metadata: definition.metadata ?? {}
    };

    if (
      item.equipmentSlot &&
      !this.equipmentSlots.includes(item.equipmentSlot)
    ) {
      throw new Error(
        `Slot de equipamento inválido: ${item.equipmentSlot}`
      );
    }

    this.items.set(id, item);

    this.emit("item:registered", {
      item: this.cloneItem(item)
    });

    return this.cloneItem(item);
  }

  normalizeStats(stats = {}) {
    const normalized = {};

    for (const [key, value] of Object.entries(stats)) {
      const number = Number(value);

      if (Number.isFinite(number)) {
        normalized[key] = number;
      }
    }

    return normalized;
  }

  normalizeEffects(effects = {}) {
    const normalized = {};

    for (const [key, value] of Object.entries(effects)) {
      const number = Number(value);

      if (Number.isFinite(number)) {
        normalized[key] = number;
      }
    }

    return normalized;
  }

  cloneItem(item) {
    return {
      ...item,
      stats: { ...item.stats },
      effects: { ...item.effects },
      metadata: { ...item.metadata }
    };
  }

  getItemDefinition(itemId) {
    const item = this.items.get(itemId);

    return item ? this.cloneItem(item) : null;
  }

  // ========================================
  // CONSULTA DO INVENTÁRIO
  // ========================================

  getInventory() {
    return [...this.inventory.entries()].map(([id, entry]) => ({
      ...this.cloneItem(this.items.get(id)),
      quantity: entry.quantity
    }));
  }

  getItem(itemId) {
    const definition = this.items.get(itemId);
    const entry = this.inventory.get(itemId);

    if (!definition || !entry) {
      return null;
    }

    return {
      ...this.cloneItem(definition),
      quantity: entry.quantity
    };
  }

  hasItem(itemId, quantity = 1) {
    const entry = this.inventory.get(itemId);

    return Boolean(
      entry &&
      Number.isFinite(Number(quantity)) &&
      Number(quantity) > 0 &&
      entry.quantity >= Number(quantity)
    );
  }

  getQuantity(itemId) {
    return this.inventory.get(itemId)?.quantity ?? 0;
  }

  getUsedSlots() {
    return this.inventory.size;
  }

  getFreeSlots() {
    return Math.max(0, this.maxSlots - this.inventory.size);
  }

  getTotalWeight() {
    let weight = 0;

    for (const [id, entry] of this.inventory) {
      const item = this.items.get(id);

      if (item) {
        weight += item.weight * entry.quantity;
      }
    }

    return weight;
  }

  // ========================================
  // ADICIONAR ITENS
  // ========================================

  addItem(itemId, quantity = 1) {
    const item = this.items.get(itemId);
    const amount = Number(quantity);

    if (!item) {
      return {
        success: false,
        reason: "item_not_registered",
        added: 0,
        remaining: Number.isFinite(amount) ? amount : 0
      };
    }

    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0
    ) {
      return {
        success: false,
        reason: "invalid_quantity",
        added: 0,
        remaining: 0
      };
    }

    let remaining = amount;
    let added = 0;

    const current = this.inventory.get(itemId);

    // Completa pilhas existentes antes de criar novas.
    if (item.stackable && current) {
      const available = item.maxStack - current.quantity;
      const toAdd = Math.min(available, remaining);

      if (toAdd > 0) {
        current.quantity += toAdd;
        remaining -= toAdd;
        added += toAdd;
      }
    }

    // Cria novas pilhas respeitando o limite de espaços.
    while (
      remaining > 0 &&
      this.inventory.size < this.maxSlots
    ) {
      const stackAmount = item.stackable
        ? Math.min(item.maxStack, remaining)
        : 1;

      this.inventory.set(itemId, {
        quantity: stackAmount
      });

      remaining -= stackAmount;
      added += stackAmount;
    }

    if (added > 0) {
      this.emit("inventory:changed", {
        action: "add",
        itemId,
        quantity: added,
        total: this.getQuantity(itemId),
        inventory: this.getInventory()
      });

      this.emit("item:added", {
        item: this.cloneItem(item),
        quantity: added
      });
    }

    return {
      success: added > 0,
      reason: remaining > 0 ? "inventory_full" : null,
      added,
      remaining,
      total: this.getQuantity(itemId)
    };
  }

  // ========================================
  // REMOVER ITENS
  // ========================================

  removeItem(itemId, quantity = 1) {
    const amount = Number(quantity);
    const entry = this.inventory.get(itemId);

    if (!entry) {
      return {
        success: false,
        reason: "item_not_owned",
        removed: 0
      };
    }

    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0
    ) {
      return {
        success: false,
        reason: "invalid_quantity",
        removed: 0
      };
    }

    if (entry.quantity < amount) {
      return {
        success: false,
        reason: "insufficient_quantity",
        removed: 0
      };
    }

    entry.quantity -= amount;

    if (entry.quantity === 0) {
      this.inventory.delete(itemId);
    }

    this.emit("inventory:changed", {
      action: "remove",
      itemId,
      quantity: amount,
      total: this.getQuantity(itemId),
      inventory: this.getInventory()
    });

    this.emit("item:removed", {
      itemId,
      quantity: amount
    });

    return {
      success: true,
      removed: amount,
      total: this.getQuantity(itemId)
    };
  }

  // ========================================
  // EQUIPAR E DESEQUIPAR
  // ========================================

  equipItem(itemId) {
    const item = this.items.get(itemId);

    if (!item || !this.hasItem(itemId)) {
      return {
        success: false,
        reason: "item_not_owned"
      };
    }

    if (!item.equipmentSlot) {
      return {
        success: false,
        reason: "item_not_equippable"
      };
    }

    const slot = item.equipmentSlot;
    const previousItemId = this.equipment.get(slot) ?? null;

    // O item anterior permanece no inventário.
    // O novo item só é removido após validar a operação.
    if (previousItemId === itemId) {
      return {
        success: false,
        reason: "already_equipped"
      };
    }

    const removed = this.removeItem(itemId, 1);

    if (!removed.success) {
      return {
        success: false,
        reason: "item_not_owned"
      };
    }

    // Devolve o equipamento anterior ao inventário.
    if (previousItemId) {
      this.equipment.delete(slot);

      const returned = this.addItem(previousItemId, 1);

      if (!returned.success || returned.remaining > 0) {
        // Reverte a troca se o item anterior não puder voltar.
        this.addItem(itemId, 1);
        this.equipment.set(slot, previousItemId);

        return {
          success: false,
          reason: "inventory_full"
        };
      }
    }

    this.equipment.set(slot, itemId);

    this.emit("equipment:changed", {
      slot,
      equippedItemId: itemId,
      previousItemId,
      equipment: this.getEquipment()
    });

    return {
      success: true,
      slot,
      equippedItem: this.cloneItem(item),
      previousItemId
    };
  }

  unequipItem(slot) {
    if (!this.equipmentSlots.includes(slot)) {
      return {
        success: false,
        reason: "invalid_slot"
      };
    }

    const itemId = this.equipment.get(slot);

    if (!itemId) {
      return {
        success: false,
        reason: "slot_empty"
      };
    }

    // Confere a capacidade antes de alterar o equipamento.
    const existing = this.inventory.get(itemId);
    const definition = this.items.get(itemId);

    const canStack = Boolean(
      definition?.stackable &&
      existing &&
      existing.quantity < definition.maxStack
    );

    if (!canStack && this.inventory.size >= this.maxSlots) {
      return {
        success: false,
        reason: "inventory_full"
      };
    }

    const result = this.addItem(itemId, 1);

    if (!result.success || result.remaining > 0) {
      return {
        success: false,
        reason: "inventory_full"
      };
    }

    this.equipment.delete(slot);

    this.emit("equipment:changed", {
      slot,
      equippedItemId: null,
      previousItemId: itemId,
      equipment: this.getEquipment()
    });

    return {
      success: true,
      slot,
      itemId
    };
  }

  getEquipment() {
    const result = {};

    for (const slot of this.equipmentSlots) {
      const itemId = this.equipment.get(slot);

      result[slot] = itemId
        ? this.cloneItem(this.items.get(itemId))
        : null;
    }

    return result;
  }

  getEquipmentStats() {
    const stats = {};

    for (const itemId of this.equipment.values()) {
      const item = this.items.get(itemId);

      if (!item) continue;

      for (const [key, value] of Object.entries(item.stats)) {
        stats[key] = (stats[key] ?? 0) + value;
      }
    }

    return stats;
  }

  // ========================================
  // CONSUMIR ITENS
  // ========================================

  useItem(itemId, context = {}) {
    const item = this.items.get(itemId);

    if (!item || !this.hasItem(itemId)) {
      return {
        success: false,
        reason: "item_not_owned"
      };
    }

    if (item.type !== "consumable") {
      return {
        success: false,
        reason: "item_not_consumable"
      };
    }

    // A integração com o jogador será feita pelo sistema de
    // personagens. Aqui, os efeitos são devolvidos ao chamador.
    const removed = this.removeItem(itemId, 1);

    if (!removed.success) {
      return {
        success: false,
        reason: "consume_failed"
      };
    }

    const result = {
      success: true,
      itemId,
      effects: { ...item.effects },
      context
    };

    this.emit("item:used", result);

    return result;
  }

  // ========================================
  // VENDA
  // ========================================

  sellItem(itemId, quantity = 1) {
    const item = this.items.get(itemId);

    if (!item) {
      return {
        success: false,
        reason: "item_not_registered"
      };
    }

    if (this.isEquipped(itemId)) {
      return {
        success: false,
        reason: "item_equipped"
      };
    }

    const result = this.removeItem(itemId, quantity);

    if (!result.success) {
      return result;
    }

    const gold = item.value * result.removed;

    this.emit("item:sold", {
      itemId,
      quantity: result.removed,
      gold
    });

    return {
      success: true,
      itemId,
      quantity: result.removed,
      gold
    };
  }

  isEquipped(itemId) {
    return [...this.equipment.values()].includes(itemId);
  }

  // ========================================
  // SALVAMENTO
  // ========================================

  exportSave() {
    return {
      version: 1,
      maxSlots: this.maxSlots,
      inventory: [...this.inventory.entries()].map(
        ([id, entry]) => ({
          id,
          quantity: entry.quantity
        })
      ),
      equipment: Object.fromEntries(this.equipment)
    };
  }

  importSave(data) {
    if (!data || !Array.isArray(data.inventory)) {
      throw new TypeError("Save do inventário inválido.");
    }

    const nextInventory = new Map();

    for (const entry of data.inventory) {
      const item = this.items.get(entry.id);
      const quantity = Number(entry.quantity);

      if (
        !item ||
        !Number.isSafeInteger(quantity) ||
        quantity <= 0
      ) {
        continue;
      }

      if (nextInventory.size >= this.maxSlots) {
        break;
      }

      nextInventory.set(item.id, {
        quantity: Math.min(quantity, item.maxStack)
      });
    }

    const nextEquipment = new Map();

    for (const [slot, itemId] of Object.entries(
      data.equipment ?? {}
    )) {
      const item = this.items.get(itemId);

      if (
        this.equipmentSlots.includes(slot) &&
        item &&
        item.equipmentSlot === slot
      ) {
        nextEquipment.set(slot, itemId);
      }
    }

    // Só substitui o estado atual após validar os dados.
    this.inventory = nextInventory;
    this.equipment = nextEquipment;

    this.emit("inventory:loaded", {
      inventory: this.getInventory(),
      equipment: this.getEquipment()
    });

    return {
      success: true,
      slotsUsed: this.getUsedSlots()
    };
  }
}

export default InventorySystem;
