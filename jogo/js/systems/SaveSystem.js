
/**
 * Ecos de Veyra — SaveSystem
 * Salvamento local com múltiplos slots.
 *
 * JavaScript ES Modules.
 * Usa localStorage no navegador.
 */

export class SaveSystem {
  constructor(options = {}) {
    this.storageKey = options.storageKey ?? "ecos-de-veyra";
    this.maxSlots = Math.max(
      1,
      Math.floor(Number(options.maxSlots) || 3)
    );

    this.version = 1;
    this.events = new Map();
    this.storage = options.storage ?? null;
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
          `[SaveSystem] Erro no evento "${eventName}":`,
          error
        );
      }
    }
  }

  // ========================================
  // ARMAZENAMENTO
  // ========================================

  getStorage() {
    if (this.storage) {
      return this.storage;
    }

    if (typeof globalThis.localStorage === "undefined") {
      throw new Error(
        "localStorage indisponível. Use um servidor HTTP ou forneça um armazenamento compatível."
      );
    }

    return globalThis.localStorage;
  }

  getIndexKey() {
    return `${this.storageKey}:index`;
  }

  getSlotKey(slot) {
    this.validateSlot(slot);
    return `${this.storageKey}:slot:${slot}`;
  }

  validateSlot(slot) {
    if (
      !Number.isSafeInteger(slot) ||
      slot < 1 ||
      slot > this.maxSlots
    ) {
      throw new RangeError(
        `Slot inválido. Escolha um valor entre 1 e ${this.maxSlots}.`
      );
    }
  }

  readJSON(key, fallback = null) {
    const raw = this.getStorage().getItem(key);

    if (raw === null) {
      return fallback;
    }

    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`Dados de salvamento corrompidos: ${key}`);
    }
  }

  writeJSON(key, value) {
    const serialized = JSON.stringify(value);

    if (typeof serialized !== "string") {
      throw new Error("Não foi possível serializar os dados.");
    }

    this.getStorage().setItem(key, serialized);
  }

  // ========================================
  // ÍNDICE DOS SLOTS
  // ========================================

  getIndex() {
    const index = this.readJSON(this.getIndexKey(), {});

    if (!index || typeof index !== "object" || Array.isArray(index)) {
      return {};
    }

    return index;
  }

  updateIndex(slot, metadata) {
    const index = this.getIndex();

    index[String(slot)] = metadata;

    this.writeJSON(this.getIndexKey(), index);
  }

  getSlots() {
    const index = this.getIndex();
    const slots = [];

    for (let slot = 1; slot <= this.maxSlots; slot++) {
      slots.push({
        slot,
        occupied: Boolean(index[String(slot)]),
        metadata: index[String(slot)] ?? null
      });
    }

    return slots;
  }

  // ========================================
  // SALVAR
  // ========================================

  save(slot, gameState, metadata = {}) {
    this.validateSlot(slot);

    if (
      !gameState ||
      typeof gameState !== "object" ||
      Array.isArray(gameState)
    ) {
      return {
        success: false,
        reason: "invalid_game_state"
      };
    }

    const now = new Date().toISOString();

    const payload = {
      version: this.version,
      slot,
      savedAt: now,
      metadata: {
        title: String(metadata.title ?? "Ecos de Veyra"),
        characterName: String(metadata.characterName ?? "Aventureiro"),
        playTime: Math.max(0, Number(metadata.playTime) || 0),
        location: String(metadata.location ?? "Desconhecida")
      },
      gameState
    };

    try {
      // Primeiro escreve o conteúdo do slot.
      this.writeJSON(this.getSlotKey(slot), payload);

      // Atualiza o índice depois do salvamento principal.
      this.updateIndex(slot, {
        savedAt: now,
        characterName: payload.metadata.characterName,
        level: Number(metadata.level) || 1,
        location: payload.metadata.location
      });

      this.emit("save:completed", {
        slot,
        savedAt: now,
        metadata: payload.metadata
      });

      return {
        success: true,
        slot,
        savedAt: now
      };
    } catch (error) {
      this.emit("save:error", {
        slot,
        message: error.message
      });

      return {
        success: false,
        reason: "storage_error",
        message: error.message
      };
    }
  }

  // ========================================
  // CARREGAR
  // ========================================

  load(slot) {
    this.validateSlot(slot);

    try {
      const payload = this.readJSON(this.getSlotKey(slot));

      if (!payload) {
        return {
          success: false,
          reason: "empty_slot"
        };
      }

      if (
        typeof payload !== "object" ||
        !payload.gameState ||
        typeof payload.gameState !== "object"
      ) {
        return {
          success: false,
          reason: "invalid_save"
        };
      }

      if (
        !Number.isSafeInteger(payload.version) ||
        payload.version > this.version
      ) {
        return {
          success: false,
          reason: "unsupported_version"
        };
      }

      this.emit("save:loaded", {
        slot,
        savedAt: payload.savedAt,
        metadata: payload.metadata
      });

      return {
        success: true,
        slot,
        savedAt: payload.savedAt,
        metadata: payload.metadata ?? {},
        gameState: payload.gameState
      };
    } catch (error) {
      this.emit("load:error", {
        slot,
        message: error.message
      });

      return {
        success: false,
        reason: "load_error",
        message: error.message
      };
    }
  }

  // ========================================
  // EXCLUIR
  // ========================================

  delete(slot) {
    this.validateSlot(slot);

    try {
      this.getStorage().removeItem(this.getSlotKey(slot));

      const index = this.getIndex();
      delete index[String(slot)];

      this.writeJSON(this.getIndexKey(), index);

      this.emit("save:deleted", { slot });

      return {
        success: true,
        slot
      };
    } catch (error) {
      return {
        success: false,
        reason: "storage_error",
        message: error.message
      };
    }
  }

  // ========================================
  // UTILITÁRIOS
  // ========================================

  hasSave(slot) {
    this.validateSlot(slot);

    try {
      return this.getStorage().getItem(this.getSlotKey(slot)) !== null;
    } catch {
      return false;
    }
  }

  getSaveMetadata(slot) {
    const result = this.load(slot);

    if (!result.success) {
      return null;
    }

    return {
      slot: result.slot,
      savedAt: result.savedAt,
      ...(result.metadata ?? {})
    };
  }

  exportSave(slot) {
    const result = this.load(slot);

    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: JSON.stringify(result, null, 2)
    };
  }

  importSave(slot, jsonText) {
    this.validateSlot(slot);

    let parsed;

    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return {
        success: false,
        reason: "invalid_json"
      };
    }

    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.gameState ||
      typeof parsed.gameState !== "object"
    ) {
      return {
        success: false,
        reason: "invalid_save"
      };
    }

    return this.save(
      slot,
      parsed.gameState,
      parsed.metadata ?? {}
    );
  }

  clearAll() {
    const results = [];

    for (let slot = 1; slot <= this.maxSlots; slot++) {
      results.push(this.delete(slot));
    }

    return {
      success: results.every(result => result.success),
      results
    };
  }
}

export default SaveSystem;
