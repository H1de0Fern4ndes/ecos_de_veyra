
export class LootSystem {
  constructor(options = {}) {
    this.items = new Map();
    this.lootTables = new Map();
    this.drops = new Map();
    this.chests = new Map();

    this.nextDropId = 1;
    this.nextChestId = 1;

    this.pickupRange = Math.max(
      0.1,
      Number(options.pickupRange) || 2
    );

    this.playerPosition = { x: 0, y: 0, z: 0 };
    this.listeners = new Map();
    this.random = options.random || Math.random;
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
        console.error(`[LootSystem] Evento "${event}":`, error);
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

  randomInt(min, max) {
    const low = Math.ceil(min);
    const high = Math.floor(max);

    return Math.floor(
      this.random() * (high - low + 1)
    ) + low;
  }

  // =========================
  // CADASTRO DE ITENS
  // =========================

  registerItem(config = {}) {
    if (!config.id) {
      throw new Error("O item precisa de um ID.");
    }

    if (this.items.has(config.id)) {
      throw new Error(`O item "${config.id}" já está cadastrado.`);
    }

    const item = {
      id: config.id,
      name: config.name || config.id,
      type: config.type || "misc",
      rarity: config.rarity || "common",
      stackable: config.stackable !== false,
      maxStack: Math.max(1, Number(config.maxStack) || 99),
      value: Math.max(0, Number(config.value) || 0),
      icon: config.icon || null,
      metadata: config.metadata ?? {}
    };

    this.items.set(item.id, item);

    this.emit("loot:item-registered", {
      item: this.cloneItem(item)
    });

    return item.id;
  }

  cloneItem(item) {
    if (!item) return null;

    return {
      ...item,
      metadata: { ...item.metadata }
    };
  }

  getItem(id) {
    return this.cloneItem(this.items.get(id));
  }

  getAllItems() {
    return [...this.items.values()].map(item =>
      this.cloneItem(item)
    );
  }

  // =========================
  // TABELAS DE DROP
  // =========================

  registerLootTable(id, entries = [], options = {}) {
    if (!id) {
      throw new Error("A tabela de loot precisa de um ID.");
    }

    if (!Array.isArray(entries)) {
      throw new TypeError("As entradas precisam ser uma lista.");
    }

    const normalizedEntries = entries.map(entry => {
      if (!this.items.has(entry.itemId)) {
        throw new Error(
          `Item "${entry.itemId}" não cadastrado na tabela "${id}".`
        );
      }

      return {
        itemId: entry.itemId,
        chance: Math.max(
          0,
          Math.min(100, Number(entry.chance ?? 100))
        ),
        min: Math.max(1, Math.floor(Number(entry.min) || 1)),
        max: Math.max(
          Math.max(1, Math.floor(Number(entry.min) || 1)),
          Math.floor(Number(entry.max) || 1)
        )
      };
    });

    this.lootTables.set(id, {
      id,
      entries: normalizedEntries,
      rolls: Math.max(1, Math.floor(Number(options.rolls) || 1))
    });

    this.emit("loot:table-registered", { id });

    return id;
  }

  getLootTable(id) {
    const table = this.lootTables.get(id);
    if (!table) return null;

    return {
      id: table.id,
      rolls: table.rolls,
      entries: table.entries.map(entry => ({ ...entry }))
    };
  }

  rollLootTable(id) {
    const table = this.lootTables.get(id);

    if (!table) {
      return {
        success: false,
        reason: "table_not_found",
        items: []
      };
    }

    const results = [];

    for (let roll = 0; roll < table.rolls; roll++) {
      for (const entry of table.entries) {
        if (this.random() * 100 >= entry.chance) continue;

        results.push({
          itemId: entry.itemId,
          quantity: this.randomInt(entry.min, entry.max)
        });
      }
    }

    return {
      success: true,
      items: results
    };
  }

  // =========================
  // DROPS NO MUNDO
  // =========================

  createDrop(config = {}) {
    const item = this.items.get(config.itemId);

    if (!item) {
      return {
        success: false,
        reason: "item_not_found"
      };
    }

    const quantity = Math.floor(Number(config.quantity) || 1);

    if (quantity < 1) {
      return {
        success: false,
        reason: "invalid_quantity"
      };
    }

    const id = config.id ?? `drop_${this.nextDropId++}`;

    if (this.drops.has(id)) {
      return {
        success: false,
        reason: "drop_id_exists"
      };
    }

    const drop = {
      id,
      itemId: item.id,
      quantity,
      position: this.normalizePosition(config.position),
      source: config.source || "world",
      sourceId: config.sourceId ?? null,
      createdAt: Date.now(),
      enabled: config.enabled !== false,
      metadata: config.metadata ?? {}
    };

    this.drops.set(id, drop);

    this.emit("loot:drop-created", {
      drop: this.cloneDrop(drop),
      item: this.cloneItem(item)
    });

    return {
      success: true,
      dropId: id
    };
  }

  cloneDrop(drop) {
    return {
      ...drop,
      position: { ...drop.position },
      metadata: { ...drop.metadata }
    };
  }

  getDrop(id) {
    const drop = this.drops.get(id);
    return drop ? this.cloneDrop(drop) : null;
  }

  getNearbyDrops(position = this.playerPosition, range = this.pickupRange) {
    const origin = this.normalizePosition(position);
    const maxRange = Math.max(0, Number(range) || 0);

    return [...this.drops.values()]
      .filter(drop =>
        drop.enabled &&
        this.distance(origin, drop.position) <= maxRange
      )
      .map(drop => ({
        ...this.cloneDrop(drop),
        item: this.getItem(drop.itemId),
        distance: this.distance(origin, drop.position)
      }))
      .sort((a, b) => a.distance - b.distance);
  }

  setPlayerPosition(position) {
    this.playerPosition = this.normalizePosition(position);

    const nearby = this.getNearbyDrops();

    this.emit("loot:nearby-updated", { drops: nearby });

    return nearby;
  }

  // =========================
  // COLETA
  // =========================

  collectDrop(id) {
    const drop = this.drops.get(id);

    if (!drop || !drop.enabled) {
      return {
        success: false,
        reason: "drop_unavailable"
      };
    }

    const distance = this.distance(
      this.playerPosition,
      drop.position
    );

    if (distance > this.pickupRange) {
      return {
        success: false,
        reason: "out_of_range",
        distance,
        pickupRange: this.pickupRange
      };
    }

    const item = this.getItem(drop.itemId);

    this.drops.delete(id);

    const result = {
      success: true,
      dropId: id,
      item,
      quantity: drop.quantity
    };

    this.emit("loot:collected", result);

    return result;
  }

  collectNearby() {
    const nearby = this.getNearbyDrops();
    const results = [];

    for (const drop of nearby) {
      const result = this.collectDrop(drop.id);

      if (result.success) {
        results.push(result);
      }
    }

    return results;
  }

  // =========================
  // BAÚS
  // =========================

  registerChest(config = {}) {
    const id = config.id ?? `chest_${this.nextChestId++}`;

    if (this.chests.has(id)) {
      throw new Error(`O baú "${id}" já existe.`);
    }

    if (!this.lootTables.has(config.lootTableId)) {
      throw new Error(
        `Tabela "${config.lootTableId}" não encontrada.`
      );
    }

    const chest = {
      id,
      name: config.name || "Baú",
      position: this.normalizePosition(config.position),
      lootTableId: config.lootTableId,
      opened: config.opened === true,
      locked: config.locked === true,
      enabled: config.enabled !== false,
      metadata: config.metadata ?? {}
    };

    this.chests.set(id, chest);

    this.emit("loot:chest-registered", {
      chest: this.cloneChest(chest)
    });

    return id;
  }

  cloneChest(chest) {
    return {
      ...chest,
      position: { ...chest.position },
      metadata: { ...chest.metadata }
    };
  }

  getChest(id) {
    const chest = this.chests.get(id);
    return chest ? this.cloneChest(chest) : null;
  }

  openChest(id, options = {}) {
    const chest = this.chests.get(id);

    if (!chest || !chest.enabled) {
      return {
        success: false,
        reason: "chest_unavailable"
      };
    }

    if (chest.opened && options.allowReopen !== true) {
      return {
        success: false,
        reason: "already_opened"
      };
    }

    if (chest.locked && options.force !== true) {
      return {
        success: false,
        reason: "chest_locked"
      };
    }

    const distance = this.distance(
      this.playerPosition,
      chest.position
    );

    const range = Math.max(
      0.1,
      Number(options.range) || this.pickupRange
    );

    if (distance > range && options.ignoreRange !== true) {
      return {
        success: false,
        reason: "out_of_range",
        distance,
        range
      };
    }

    const loot = this.rollLootTable(chest.lootTableId);

    if (!loot.success) return loot;

    chest.opened = true;

    const drops = [];

    for (const entry of loot.items) {
      const result = this.createDrop({
        itemId: entry.itemId,
        quantity: entry.quantity,
        position: chest.position,
        source: "chest",
        sourceId: chest.id
      });

      if (result.success) {
        drops.push(result.dropId);
      }
    }

    const result = {
      success: true,
      chestId: id,
      drops,
      items: loot.items
    };

    this.emit("loot:chest-opened", result);

    return result;
  }

  // =========================
  // MORTE DE INIMIGOS
  // =========================

  dropFromEnemy(config = {}) {
    const tableId = config.lootTableId;

    const loot = this.rollLootTable(tableId);

    if (!loot.success) return loot;

    const createdDrops = [];

    for (const entry of loot.items) {
      const result = this.createDrop({
        itemId: entry.itemId,
        quantity: entry.quantity,
        position: config.position,
        source: "enemy",
        sourceId: config.enemyId ?? null
      });

      if (result.success) {
        createdDrops.push(result.dropId);
      }
    }

    this.emit("loot:enemy-dropped", {
      enemyId: config.enemyId ?? null,
      drops: createdDrops
    });

    return {
      success: true,
      drops: createdDrops,
      items: loot.items
    };
  }

  // =========================
  // SALVAMENTO
  // =========================

  exportSave() {
    return {
      version: 1,
      drops: [...this.drops.values()].map(drop =>
        this.cloneDrop(drop)
      ),
      chests: [...this.chests.values()].map(chest =>
        this.cloneChest(chest)
      ),
      nextDropId: this.nextDropId,
      nextChestId: this.nextChestId
    };
  }

  importSave(data) {
    if (!data || !Array.isArray(data.drops)) {
      return false;
    }

    this.drops.clear();

    for (const drop of data.drops) {
      if (!this.items.has(drop.itemId)) continue;

      this.drops.set(drop.id, {
        ...drop,
        position: this.normalizePosition(drop.position),
        metadata: { ...(drop.metadata ?? {}) }
      });
    }

    if (Array.isArray(data.chests)) {
      for (const saved of data.chests) {
        const chest = this.chests.get(saved.id);
        if (!chest) continue;

        chest.opened = saved.opened === true;
        chest.locked = saved.locked === true;
        chest.enabled = saved.enabled !== false;
      }
    }

    this.nextDropId = Math.max(
      this.nextDropId,
      Number(data.nextDropId) || 1
    );

    this.nextChestId = Math.max(
      this.nextChestId,
      Number(data.nextChestId) || 1
    );

    this.emit("loot:save-loaded", {});

    return true;
  }

  clearDrops() {
    this.drops.clear();
    this.emit("loot:drops-cleared", {});
  }

  destroy() {
    this.items.clear();
    this.lootTables.clear();
    this.drops.clear();
    this.chests.clear();
    this.listeners.clear();
  }
}

export default LootSystem;
