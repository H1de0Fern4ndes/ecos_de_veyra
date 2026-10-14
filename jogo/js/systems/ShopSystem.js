
export class ShopSystem {
  constructor(options = {}) {
    this.shops = new Map();
    this.listeners = new Map();

    this.inventory = options.inventory || null;
    this.getItem = options.getItem || null;

    this.gold = Math.max(0, Number(options.gold) || 0);
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
        console.error(`[ShopSystem] Evento "${event}":`, error);
      }
    }
  }

  // =========================
  // OURO
  // =========================

  getGold() {
    return this.gold;
  }

  addGold(amount) {
    const value = Math.floor(Number(amount));

    if (!Number.isFinite(value) || value <= 0) {
      return false;
    }

    this.gold += value;

    this.emit("shop:gold-changed", {
      gold: this.gold,
      difference: value
    });

    return true;
  }

  removeGold(amount) {
    const value = Math.floor(Number(amount));

    if (!Number.isFinite(value) || value <= 0) {
      return false;
    }

    if (this.gold < value) {
      return false;
    }

    this.gold -= value;

    this.emit("shop:gold-changed", {
      gold: this.gold,
      difference: -value
    });

    return true;
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
      typeof this.inventory.addItem === "function" &&
      typeof this.inventory.removeItem === "function" &&
      typeof this.inventory.getInventory === "function"
    );
  }

  getItemDefinition(itemId) {
    if (this.getItem) {
      return this.getItem(itemId);
    }

    return null;
  }

  getInventoryQuantity(itemId) {
    if (!this.hasInventory()) return 0;

    const items = this.inventory.getInventory();

    if (!Array.isArray(items)) return 0;

    return items.reduce((total, entry) => {
      if (entry.id !== itemId) return total;

      return total + Math.max(
        0,
        Number(entry.quantity) || 0
      );
    }, 0);
  }

  // =========================
  // CADASTRO DE LOJAS
  // =========================

  registerShop(config = {}) {
    if (!config.id) {
      throw new Error("A loja precisa de um ID.");
    }

    if (this.shops.has(config.id)) {
      throw new Error(`A loja "${config.id}" já existe.`);
    }

    const shop = {
      id: config.id,
      name: config.name || "Loja",
      npcId: config.npcId || null,
      enabled: config.enabled !== false,

      buyMultiplier: Math.max(
        0,
        Number(config.buyMultiplier) || 1
      ),

      sellMultiplier: Math.max(
        0,
        Number(config.sellMultiplier) || 0.5
      ),

      items: new Map(),
      metadata: config.metadata ?? {}
    };

    for (const entry of config.items || []) {
      this.setShopItem(shop, entry);
    }

    this.shops.set(shop.id, shop);

    this.emit("shop:registered", {
      shop: this.getShop(shop.id)
    });

    return shop.id;
  }

  setShopItem(shop, entry) {
    if (!entry?.itemId) {
      throw new Error("Um produto precisa de itemId.");
    }

    const price = Math.floor(Number(entry.price));

    if (!Number.isFinite(price) || price < 0) {
      throw new Error(
        `Preço inválido para "${entry.itemId}".`
      );
    }

    shop.items.set(entry.itemId, {
      itemId: entry.itemId,
      price,
      stock: entry.stock === null
        ? null
        : Math.max(0, Math.floor(Number(entry.stock) || 0)),

      maxStock: entry.maxStock === null
        ? null
        : Math.max(0, Math.floor(Number(entry.maxStock) || 0)),

      available: entry.available !== false
    });
  }

  getShop(id) {
    const shop = this.shops.get(id);
    if (!shop) return null;

    return {
      id: shop.id,
      name: shop.name,
      npcId: shop.npcId,
      enabled: shop.enabled,
      buyMultiplier: shop.buyMultiplier,
      sellMultiplier: shop.sellMultiplier,
      metadata: { ...shop.metadata },

      items: [...shop.items.values()].map(entry => ({
        ...entry,
        item: this.getItemDefinition(entry.itemId)
      }))
    };
  }

  getAllShops() {
    return [...this.shops.keys()].map(id => this.getShop(id));
  }

  // =========================
  // ESTOQUE
  // =========================

  restock(id, itemId, quantity) {
    const shop = this.shops.get(id);
    const entry = shop?.items.get(itemId);

    if (!entry || entry.stock === null) {
      return false;
    }

    const amount = Math.floor(Number(quantity));

    if (!Number.isFinite(amount) || amount <= 0) {
      return false;
    }

    entry.stock = entry.maxStock === null
      ? entry.stock + amount
      : Math.min(entry.maxStock, entry.stock + amount);

    this.emit("shop:stock-changed", {
      shopId: id,
      itemId,
      stock: entry.stock
    });

    return true;
  }

  // =========================
  // COMPRA
  // =========================

  buy(shopId, itemId, quantity = 1) {
    if (!this.enabled) {
      return { success: false, reason: "system_disabled" };
    }

    if (!this.hasInventory()) {
      return { success: false, reason: "inventory_not_configured" };
    }

    const shop = this.shops.get(shopId);

    if (!shop || !shop.enabled) {
      return { success: false, reason: "shop_unavailable" };
    }

    const entry = shop.items.get(itemId);

    if (!entry || !entry.available) {
      return { success: false, reason: "item_unavailable" };
    }

    const amount = Math.floor(Number(quantity));

    if (!Number.isFinite(amount) || amount < 1) {
      return { success: false, reason: "invalid_quantity" };
    }

    if (entry.stock !== null && entry.stock < amount) {
      return { success: false, reason: "insufficient_stock" };
    }

    const unitPrice = Math.floor(
      entry.price * shop.buyMultiplier
    );

    const total = unitPrice * amount;

    if (!Number.isSafeInteger(total) || total < 0) {
      return { success: false, reason: "invalid_price" };
    }

    if (this.gold < total) {
      return { success: false, reason: "insufficient_gold" };
    }

    // O inventário deve rejeitar a compra se não houver espaço.
    const addResult = this.inventory.addItem(itemId, amount);

    if (
      addResult === false ||
      addResult?.success === false ||
      (addResult && typeof addResult === "object" &&
        Number(addResult.remaining) > 0)
    ) {
      return {
        success: false,
        reason: "inventory_full"
      };
    }

    this.gold -= total;

    if (entry.stock !== null) {
      entry.stock -= amount;
    }

    const result = {
      success: true,
      shopId,
      itemId,
      quantity: amount,
      unitPrice,
      total,
      goldRemaining: this.gold
    };

    this.emit("shop:item-bought", result);
    this.emit("shop:gold-changed", {
      gold: this.gold,
      difference: -total
    });

    return result;
  }

  // =========================
  // VENDA
  // =========================

  sell(shopId, itemId, quantity = 1) {
    if (!this.enabled) {
      return { success: false, reason: "system_disabled" };
    }

    if (!this.hasInventory()) {
      return { success: false, reason: "inventory_not_configured" };
    }

    const shop = this.shops.get(shopId);

    if (!shop || !shop.enabled) {
      return { success: false, reason: "shop_unavailable" };
    }

    const amount = Math.floor(Number(quantity));

    if (!Number.isFinite(amount) || amount < 1) {
      return { success: false, reason: "invalid_quantity" };
    }

    const available = this.getInventoryQuantity(itemId);

    if (available < amount) {
      return { success: false, reason: "insufficient_items" };
    }

    const definition = this.getItemDefinition(itemId);
    const baseValue = Math.max(
      0,
      Number(definition?.value) || 0
    );

    const shopEntry = shop.items.get(itemId);

    const referencePrice = shopEntry
      ? shopEntry.price
      : baseValue;

    const unitPrice = Math.floor(
      referencePrice * shop.sellMultiplier
    );

    const total = unitPrice * amount;

    if (!Number.isSafeInteger(total) || total < 0) {
      return { success: false, reason: "invalid_price" };
    }

    const removeResult = this.inventory.removeItem(
      itemId,
      amount
    );

    if (
      removeResult === false ||
      removeResult?.success === false
    ) {
      return { success: false, reason: "item_removal_failed" };
    }

    this.gold += total;

    if (shopEntry && shopEntry.stock !== null) {
      shopEntry.stock += amount;

      if (shopEntry.maxStock !== null) {
        shopEntry.stock = Math.min(
          shopEntry.maxStock,
          shopEntry.stock
        );
      }
    }

    const result = {
      success: true,
      shopId,
      itemId,
      quantity: amount,
      unitPrice,
      total,
      goldRemaining: this.gold
    };

    this.emit("shop:item-sold", result);
    this.emit("shop:gold-changed", {
      gold: this.gold,
      difference: total
    });

    return result;
  }

  // =========================
  // CONTROLE
  // =========================

  setShopEnabled(id, enabled) {
    const shop = this.shops.get(id);
    if (!shop) return false;

    shop.enabled = Boolean(enabled);

    this.emit("shop:updated", {
      shopId: id,
      enabled: shop.enabled
    });

    return true;
  }

  setItemAvailable(shopId, itemId, available) {
    const shop = this.shops.get(shopId);
    const entry = shop?.items.get(itemId);

    if (!entry) return false;

    entry.available = Boolean(available);

    this.emit("shop:updated", {
      shopId,
      itemId,
      available: entry.available
    });

    return true;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
  }

  // =========================
  // SALVAMENTO
  // =========================

  exportSave() {
    return {
      version: 1,
      gold: this.gold,

      shops: [...this.shops.values()].map(shop => ({
        id: shop.id,
        enabled: shop.enabled,

        items: [...shop.items.values()].map(entry => ({
          itemId: entry.itemId,
          stock: entry.stock,
          available: entry.available
        }))
      }))
    };
  }

  importSave(data) {
    if (!data || !Array.isArray(data.shops)) {
      return false;
    }

    this.gold = Math.max(
      0,
      Math.floor(Number(data.gold) || 0)
    );

    for (const savedShop of data.shops) {
      const shop = this.shops.get(savedShop.id);
      if (!shop) continue;

      shop.enabled = savedShop.enabled !== false;

      for (const savedItem of savedShop.items || []) {
        const entry = shop.items.get(savedItem.itemId);
        if (!entry) continue;

        if (entry.stock !== null && Number.isFinite(savedItem.stock)) {
          entry.stock = Math.max(0, savedItem.stock);
        }

        entry.available = savedItem.available !== false;
      }
    }

    this.emit("shop:save-loaded", { gold: this.gold });

    return true;
  }

  destroy() {
    this.shops.clear();
    this.listeners.clear();
  }
}

export default ShopSystem;
