// js/systems/MapSystem.js

export class MapSystem {
  constructor() {
    this.regions = new Map();
    this.markers = new Map();
    this.discoveredRegions = new Set();
    this.discoveredMarkers = new Set();
    this.playerPosition = { x: 0, y: 0, z: 0 };
    this.listeners = new Map();
  }

  // ==============================
  // EVENTOS
  // ==============================

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
        console.error(`[MapSystem] ${eventName}:`, error);
      }
    }
  }

  // ==============================
  // REGIÕES
  // ==============================

  registerRegion(id, config = {}) {
    if (!id) throw new Error("A região precisa de um ID.");

    if (this.regions.has(id)) {
      throw new Error(`A região "${id}" já existe.`);
    }

    const region = {
      id,
      name: config.name ?? id,
      description: config.description ?? "",
      level: Math.max(1, Number(config.level) || 1),
      bounds: config.bounds
        ? { ...config.bounds }
        : null,
      color: config.color ?? "#777777",
      metadata: { ...(config.metadata ?? {}) }
    };

    this.regions.set(id, region);

    this.emit("region:registered", { region: { ...region } });

    return { ...region };
  }

  getRegion(id) {
    const region = this.regions.get(id);
    return region ? { ...region } : null;
  }

  getRegions() {
    return [...this.regions.values()].map(region => ({
      ...region,
      discovered: this.discoveredRegions.has(region.id)
    }));
  }

  discoverRegion(id) {
    const region = this.regions.get(id);

    if (!region) return false;
    if (this.discoveredRegions.has(id)) return false;

    this.discoveredRegions.add(id);

    this.emit("region:discovered", {
      region: { ...region }
    });

    return true;
  }

  // ==============================
  // MARCADORES
  // ==============================

  addMarker(id, config = {}) {
    if (!id) throw new Error("O marcador precisa de um ID.");

    if (this.markers.has(id)) {
      throw new Error(`O marcador "${id}" já existe.`);
    }

    const marker = {
      id,
      name: config.name ?? id,
      type: config.type ?? "location",
      regionId: config.regionId ?? null,
      position: {
        x: Number(config.position?.x) || 0,
        y: Number(config.position?.y) || 0,
        z: Number(config.position?.z) || 0
      },
      description: config.description ?? "",
      visible: config.visible !== false,
      initiallyDiscovered: Boolean(config.discovered),
      metadata: { ...(config.metadata ?? {}) }
    };

    this.markers.set(id, marker);

    if (marker.initiallyDiscovered) {
      this.discoveredMarkers.add(id);
    }

    this.emit("marker:added", {
      marker: this.clone(marker)
    });

    return this.clone(marker);
  }

  removeMarker(id) {
    if (!this.markers.has(id)) return false;

    this.markers.delete(id);
    this.discoveredMarkers.delete(id);

    this.emit("marker:removed", { markerId: id });

    return true;
  }

  getMarker(id) {
    const marker = this.markers.get(id);

    if (!marker) return null;

    return {
      ...this.clone(marker),
      discovered: this.discoveredMarkers.has(id)
    };
  }

  getVisibleMarkers(options = {}) {
    return [...this.markers.values()]
      .filter(marker => marker.visible)
      .filter(marker =>
        options.includeUndiscovered === true ||
        this.discoveredMarkers.has(marker.id)
      )
      .filter(marker =>
        !options.type || marker.type === options.type
      )
      .filter(marker =>
        !options.regionId ||
        marker.regionId === options.regionId
      )
      .map(marker => this.clone(marker));
  }

  discoverMarker(id) {
    const marker = this.markers.get(id);

    if (!marker) return false;
    if (this.discoveredMarkers.has(id)) return false;

    this.discoveredMarkers.add(id);

    this.emit("marker:discovered", {
      marker: this.clone(marker)
    });

    return true;
  }

  // ==============================
  // POSIÇÃO DO JOGADOR
  // ==============================

  setPlayerPosition(position = {}) {
    const { x, y, z } = position;

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(z)
    ) {
      return false;
    }

    this.playerPosition = { x, y, z };

    this.emit("player:position", {
      position: { ...this.playerPosition }
    });

    return true;
  }

  getPlayerPosition() {
    return { ...this.playerPosition };
  }

  // Descobre marcadores dentro de um raio definido.
  discoverNearbyMarkers(radius = 10) {
    const safeRadius = Math.max(0, Number(radius) || 0);
    const discovered = [];

    for (const marker of this.markers.values()) {
      if (this.discoveredMarkers.has(marker.id)) continue;

      const dx = marker.position.x - this.playerPosition.x;
      const dy = marker.position.y - this.playerPosition.y;
      const dz = marker.position.z - this.playerPosition.z;

      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance <= safeRadius) {
        if (this.discoverMarker(marker.id)) {
          discovered.push(marker.id);
        }
      }
    }

    return discovered;
  }

  // ==============================
  // DISTÂNCIAS E ESTATÍSTICAS
  // ==============================

  getDistanceToMarker(id) {
    const marker = this.markers.get(id);

    if (!marker) return null;

    const dx = marker.position.x - this.playerPosition.x;
    const dy = marker.position.y - this.playerPosition.y;
    const dz = marker.position.z - this.playerPosition.z;

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  getStatistics() {
    return {
      totalRegions: this.regions.size,
      discoveredRegions: this.discoveredRegions.size,
      totalMarkers: this.markers.size,
      discoveredMarkers: this.discoveredMarkers.size
    };
  }

  // ==============================
  // SALVAR E CARREGAR
  // ==============================

  exportData() {
    return {
      version: 1,
      playerPosition: { ...this.playerPosition },
      discoveredRegions: [...this.discoveredRegions],
      discoveredMarkers: [...this.discoveredMarkers]
    };
  }

  importData(data) {
    if (!data || typeof data !== "object") {
      throw new Error("Dados do mapa inválidos.");
    }

    const position = data.playerPosition;

    if (
      position &&
      Number.isFinite(position.x) &&
      Number.isFinite(position.y) &&
      Number.isFinite(position.z)
    ) {
      this.playerPosition = { ...position };
    }

    this.discoveredRegions = new Set(
      (Array.isArray(data.discoveredRegions)
        ? data.discoveredRegions
        : []
      ).filter(id => this.regions.has(id))
    );

    this.discoveredMarkers = new Set(
      (Array.isArray(data.discoveredMarkers)
        ? data.discoveredMarkers
        : []
      ).filter(id => this.markers.has(id))
    );

    this.emit("data:imported", {
      statistics: this.getStatistics()
    });
  }

  // ==============================
  // UTILITÁRIO
  // ==============================

  clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
}

export default MapSystem;