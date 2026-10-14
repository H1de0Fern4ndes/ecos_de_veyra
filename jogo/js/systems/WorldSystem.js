
/**
 * Ecos de Veyra — WorldSystem
 * Gerencia regiões, exploração, clima e ciclo de tempo.
 *
 * JavaScript ES Modules.
 * Independente do Three.js: fornece estado para o jogo
 * aplicar visualmente à cena 3D.
 */

export class WorldSystem {
  constructor(options = {}) {
    this.events = new Map();
    this.regions = new Map();
    this.pointsOfInterest = new Map();
    this.discoveredPoints = new Set();

    this.worldTime = {
      day: Math.max(1, Math.floor(Number(options.day) || 1)),
      hour: this.normalizeHour(options.hour ?? 8),
      timeScale: Math.max(0, Number(options.timeScale ?? 30)),
      paused: options.paused === true
    };

    this.weatherTypes = [
      "clear",
      "cloudy",
      "rain",
      "storm",
      "fog"
    ];

    this.weather = {
      current: this.weatherTypes.includes(options.weather)
        ? options.weather
        : "clear",
      intensity: 0,
      durationRemaining: 0
    };

    this.currentRegionId = null;
    this.elapsedWorldSeconds = 0;
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
          `[WorldSystem] Erro no evento "${eventName}":`,
          error
        );
      }
    }
  }

  // ========================================
  // REGIÕES
  // ========================================

  registerRegion(definition) {
    if (!definition || typeof definition.id !== "string") {
      throw new TypeError("A região precisa ter um ID válido.");
    }

    const id = definition.id.trim();

    if (!id) {
      throw new Error("O ID da região não pode estar vazio.");
    }

    if (this.regions.has(id)) {
      throw new Error(`A região "${id}" já está cadastrada.`);
    }

    const region = {
      id,
      name: String(definition.name ?? id),
      description: String(definition.description ?? ""),
      levelMin: Math.max(
        1,
        Math.floor(Number(definition.levelMin) || 1)
      ),
      levelMax: Math.max(
        1,
        Math.floor(Number(definition.levelMax) || 1)
      ),
      safe: definition.safe === true,
      discovered: definition.discovered === true,
      position: this.normalizePosition(definition.position),
      metadata: { ...(definition.metadata ?? {}) }
    };

    if (region.levelMax < region.levelMin) {
      region.levelMax = region.levelMin;
    }

    this.regions.set(id, region);

    this.emit("world:region_registered", {
      region: this.cloneRegion(region)
    });

    return this.cloneRegion(region);
  }

  normalizePosition(position) {
    return {
      x: Number.isFinite(Number(position?.x))
        ? Number(position.x)
        : 0,
      y: Number.isFinite(Number(position?.y))
        ? Number(position.y)
        : 0,
      z: Number.isFinite(Number(position?.z))
        ? Number(position.z)
        : 0
    };
  }

  cloneRegion(region) {
    return {
      ...region,
      position: { ...region.position },
      metadata: { ...region.metadata }
    };
  }

  getRegion(id) {
    const region = this.regions.get(id);
    return region ? this.cloneRegion(region) : null;
  }

  getRegions() {
    return [...this.regions.values()].map(region =>
      this.cloneRegion(region)
    );
  }

  discoverRegion(id) {
    const region = this.regions.get(id);

    if (!region) {
      return {
        success: false,
        reason: "region_not_found"
      };
    }

    if (region.discovered) {
      return {
        success: true,
        alreadyDiscovered: true,
        region: this.cloneRegion(region)
      };
    }

    region.discovered = true;

    this.emit("world:region_discovered", {
      region: this.cloneRegion(region)
    });

    return {
      success: true,
      region: this.cloneRegion(region)
    };
  }

  enterRegion(id) {
    const region = this.regions.get(id);

    if (!region) {
      return {
        success: false,
        reason: "region_not_found"
      };
    }

    const previousRegionId = this.currentRegionId;

    this.currentRegionId = id;
    this.discoverRegion(id);

    this.emit("world:region_entered", {
      region: this.cloneRegion(region),
      previousRegionId
    });

    return {
      success: true,
      region: this.cloneRegion(region),
      previousRegionId
    };
  }

  getCurrentRegion() {
    return this.currentRegionId
      ? this.getRegion(this.currentRegionId)
      : null;
  }

  // ========================================
  // PONTOS DE INTERESSE
  // ========================================

  registerPointOfInterest(definition) {
    if (!definition || typeof definition.id !== "string") {
      throw new TypeError("O ponto de interesse precisa de um ID.");
    }

    const id = definition.id.trim();

    if (!id) {
      throw new Error("O ID do ponto não pode estar vazio.");
    }

    if (this.pointsOfInterest.has(id)) {
      throw new Error(`O ponto "${id}" já está cadastrado.`);
    }

    if (
      definition.regionId &&
      !this.regions.has(definition.regionId)
    ) {
      throw new Error(
        `A região "${definition.regionId}" não existe.`
      );
    }

    const point = {
      id,
      name: String(definition.name ?? id),
      type: String(definition.type ?? "location"),
      description: String(definition.description ?? ""),
      regionId: definition.regionId ?? null,
      position: this.normalizePosition(definition.position),
      discovered: definition.discovered === true,
      visited: false,
      metadata: { ...(definition.metadata ?? {}) }
    };

    this.pointsOfInterest.set(id, point);

    if (point.discovered) {
      this.discoveredPoints.add(id);
    }

    this.emit("world:poi_registered", {
      point: this.clonePoint(point)
    });

    return this.clonePoint(point);
  }

  clonePoint(point) {
    return {
      ...point,
      position: { ...point.position },
      metadata: { ...point.metadata }
    };
  }

  getPointOfInterest(id) {
    const point = this.pointsOfInterest.get(id);
    return point ? this.clonePoint(point) : null;
  }

  getPointsOfInterest(regionId = null) {
    return [...this.pointsOfInterest.values()]
      .filter(point => !regionId || point.regionId === regionId)
      .map(point => this.clonePoint(point));
  }

  discoverPoint(id) {
    const point = this.pointsOfInterest.get(id);

    if (!point) {
      return {
        success: false,
        reason: "point_not_found"
      };
    }

    if (point.discovered) {
      return {
        success: true,
        alreadyDiscovered: true,
        point: this.clonePoint(point)
      };
    }

    point.discovered = true;
    this.discoveredPoints.add(id);

    this.emit("world:poi_discovered", {
      point: this.clonePoint(point)
    });

    return {
      success: true,
      point: this.clonePoint(point)
    };
  }

  visitPoint(id) {
    const point = this.pointsOfInterest.get(id);

    if (!point) {
      return {
        success: false,
        reason: "point_not_found"
      };
    }

    const firstVisit = !point.visited;

    point.discovered = true;
    point.visited = true;
    this.discoveredPoints.add(id);

    this.emit("world:poi_visited", {
      point: this.clonePoint(point),
      firstVisit
    });

    return {
      success: true,
      firstVisit,
      point: this.clonePoint(point)
    };
  }

  // ========================================
  // CICLO DE DIA E NOITE
  // ========================================

  normalizeHour(hour) {
    const value = Number(hour);

    if (!Number.isFinite(value)) {
      return 8;
    }

    return ((value % 24) + 24) % 24;
  }

  setTime(hour, day = this.worldTime.day) {
    const previous = this.getTime();

    this.worldTime.hour = this.normalizeHour(hour);
    this.worldTime.day = Math.max(
      1,
      Math.floor(Number(day) || 1)
    );

    this.emit("world:time_changed", {
      previous,
      current: this.getTime()
    });

    return this.getTime();
  }

  setTimeScale(scale) {
    const value = Number(scale);

    if (!Number.isFinite(value) || value < 0) {
      return {
        success: false,
        reason: "invalid_time_scale"
      };
    }

    this.worldTime.timeScale = value;

    return {
      success: true,
      timeScale: value
    };
  }

  pauseTime() {
    this.worldTime.paused = true;
    this.emit("world:time_paused", this.getTime());
  }

  resumeTime() {
    this.worldTime.paused = false;
    this.emit("world:time_resumed", this.getTime());
  }

  getTime() {
    const hour = this.worldTime.hour;
    const wholeHour = Math.floor(hour);
    const minutes = Math.floor((hour - wholeHour) * 60);

    return {
      day: this.worldTime.day,
      hour,
      hours: wholeHour,
      minutes,
      formatted: `${String(wholeHour).padStart(2, "0")}:${String(
        minutes
      ).padStart(2, "0")}`,
      phase: this.getDayPhase(hour),
      paused: this.worldTime.paused,
      timeScale: this.worldTime.timeScale
    };
  }

  getDayPhase(hour = this.worldTime.hour) {
    if (hour >= 5 && hour < 7) return "dawn";
    if (hour >= 7 && hour < 17) return "day";
    if (hour >= 17 && hour < 19) return "sunset";
    return "night";
  }

  update(deltaTime) {
    const delta = Number(deltaTime);

    if (!Number.isFinite(delta) || delta <= 0) {
      return;
    }

    if (!this.worldTime.paused) {
      const previousDay = this.worldTime.day;
      const previousPhase = this.getDayPhase();

      // timeScale representa minutos de jogo por segundo real.
      const elapsedHours =
        (delta * this.worldTime.timeScale) / 3600;

      this.worldTime.hour += elapsedHours;

      while (this.worldTime.hour >= 24) {
        this.worldTime.hour -= 24;
        this.worldTime.day += 1;
      }

      this.elapsedWorldSeconds += delta;

      const currentPhase = this.getDayPhase();

      if (currentPhase !== previousPhase) {
        this.emit("world:phase_changed", {
          previousPhase,
          phase: currentPhase,
          time: this.getTime()
        });
      }

      if (this.worldTime.day !== previousDay) {
        this.emit("world:new_day", {
          day: this.worldTime.day
        });
      }

      if (elapsedHours > 0) {
        this.emit("world:time_updated", this.getTime());
      }
    }

    if (this.weather.durationRemaining > 0) {
      this.weather.durationRemaining -= delta;

      if (this.weather.durationRemaining <= 0) {
        this.weather.durationRemaining = 0;
        this.setWeather("clear", 0, 0);
      }
    }
  }

  // ========================================
  // CLIMA
  // ========================================

  setWeather(type, intensity = 0.5, duration = 300) {
    if (!this.weatherTypes.includes(type)) {
      return {
        success: false,
        reason: "invalid_weather"
      };
    }

    const previous = { ...this.weather };

    this.weather = {
      current: type,
      intensity: Math.max(
        0,
        Math.min(1, Number(intensity) || 0)
      ),
      durationRemaining: Math.max(
        0,
        Number(duration) || 0
      )
    };

    this.emit("world:weather_changed", {
      previous,
      current: { ...this.weather }
    });

    return {
      success: true,
      weather: { ...this.weather }
    };
  }

  getWeather() {
    return { ...this.weather };
  }

  // ========================================
  // ESTADO DO MUNDO
  // ========================================

  exportSave() {
    return {
      version: 1,
      currentRegionId: this.currentRegionId,
      worldTime: { ...this.worldTime },
      weather: { ...this.weather },
      elapsedWorldSeconds: this.elapsedWorldSeconds,
      regions: [...this.regions.values()].map(region => ({
        id: region.id,
        discovered: region.discovered
      })),
      pointsOfInterest: [...this.pointsOfInterest.values()].map(
        point => ({
          id: point.id,
          discovered: point.discovered,
          visited: point.visited
        })
      )
    };
  }

  importSave(data) {
    if (!data || typeof data !== "object") {
      throw new TypeError("Save do mundo inválido.");
    }

    if (
      data.currentRegionId &&
      !this.regions.has(data.currentRegionId)
    ) {
      this.currentRegionId = null;
    } else {
      this.currentRegionId = data.currentRegionId ?? null;
    }

    if (data.worldTime) {
      this.worldTime.day = Math.max(
        1,
        Math.floor(Number(data.worldTime.day) || 1)
      );

      this.worldTime.hour = this.normalizeHour(
        data.worldTime.hour
      );

      this.worldTime.timeScale = Math.max(
        0,
        Number(data.worldTime.timeScale) || 0
      );

      this.worldTime.paused = data.worldTime.paused === true;
    }

    if (
      data.weather &&
      this.weatherTypes.includes(data.weather.current)
    ) {
      this.weather = {
        current: data.weather.current,
        intensity: Math.max(
          0,
          Math.min(1, Number(data.weather.intensity) || 0)
        ),
        durationRemaining: Math.max(
          0,
          Number(data.weather.durationRemaining) || 0
        )
      };
    }

    this.elapsedWorldSeconds = Math.max(
      0,
      Number(data.elapsedWorldSeconds) || 0
    );

    for (const saved of data.regions ?? []) {
      const region = this.regions.get(saved.id);

      if (region) {
        region.discovered = saved.discovered === true;
      }
    }

    this.discoveredPoints.clear();

    for (const saved of data.pointsOfInterest ?? []) {
      const point = this.pointsOfInterest.get(saved.id);

      if (point) {
        point.discovered = saved.discovered === true;
        point.visited = saved.visited === true;

        if (point.discovered) {
          this.discoveredPoints.add(point.id);
        }
      }
    }

    this.emit("world:loaded", {
      time: this.getTime(),
      region: this.getCurrentRegion(),
      weather: this.getWeather()
    });

    return {
      success: true,
      time: this.getTime(),
      region: this.getCurrentRegion()
    };
  }
}

export default WorldSystem;
