// js/systems/GameManager.js

export default class GameManager {
  constructor(options = {}) {
    this.options = {
      autoStart: options.autoStart ?? false,
      targetFPS: options.targetFPS ?? 60,
      maxDeltaTime: options.maxDeltaTime ?? 0.05,
      ...options
    };

    this.state = "loading";
    this.systems = new Map();
    this.updateSystems = [];
    this.listeners = new Map();

    this.running = false;
    this.destroyed = false;

    this.frameId = null;
    this.lastFrameTime = 0;
    this.elapsedTime = 0;
    this.frameCount = 0;
    this.fps = 0;
    this.fpsFrameCount = 0;
    this.fpsTimer = 0;

    this.fixedStep = 1 / 60;
    this.accumulator = 0;

    this.boundFrame = timestamp => this.frame(timestamp);

    this.emit("game:created");

    if (this.options.autoStart) {
      this.start();
    }
  }

  registerSystem(name, system, options = {}) {
    if (this.destroyed) {
      throw new Error("GameManager já foi destruído.");
    }

    if (!name || !system) {
      throw new Error("Informe o nome e a instância do sistema.");
    }

    if (this.systems.has(name)) {
      throw new Error(`Sistema já registrado: ${name}`);
    }

    const entry = {
      name,
      instance: system,
      priority: Number(options.priority) || 0,
      enabled: options.enabled ?? true,
      updateMethod: options.updateMethod ?? "update",
      fixedUpdateMethod: options.fixedUpdateMethod ?? "fixedUpdate"
    };

    this.systems.set(name, entry);

    this.updateSystems.push(entry);
    this.sortSystems();

    this.emit("system:registered", {
      name,
      system
    });

    return system;
  }

  unregisterSystem(name, options = {}) {
    const entry = this.systems.get(name);

    if (!entry) return false;

    this.systems.delete(name);

    this.updateSystems = this.updateSystems.filter(
      item => item.name !== name
    );

    if (options.destroy && typeof entry.instance.destroy === "function") {
      entry.instance.destroy();
    }

    this.emit("system:unregistered", { name });

    return true;
  }

  getSystem(name) {
    return this.systems.get(name)?.instance ?? null;
  }

  hasSystem(name) {
    return this.systems.has(name);
  }

  setSystemEnabled(name, enabled) {
    const entry = this.systems.get(name);

    if (!entry) return false;

    entry.enabled = Boolean(enabled);

    if (typeof entry.instance.setEnabled === "function") {
      entry.instance.setEnabled(entry.enabled);
    }

    this.emit("system:enabled", {
      name,
      enabled: entry.enabled
    });

    return true;
  }

  sortSystems() {
    this.updateSystems.sort((a, b) => a.priority - b.priority);
  }

  setState(nextState) {
    const allowedStates = [
      "loading",
      "menu",
      "playing",
      "paused",
      "gameover",
      "transition"
    ];

    if (!allowedStates.includes(nextState)) {
      throw new Error(`Estado inválido: ${nextState}`);
    }

    const previousState = this.state;

    if (previousState === nextState) return;

    this.state = nextState;

    this.emit("game:stateChanged", {
      previousState,
      state: nextState
    });

    if (nextState === "paused") {
      this.emit("game:paused");
    }

    if (nextState === "playing") {
      this.emit("game:resumed");
    }

    if (nextState === "gameover") {
      this.emit("game:over");
    }
  }

  start() {
    if (this.destroyed || this.running) return false;

    this.running = true;
    this.lastFrameTime = 0;
    this.fpsTimer = 0;
    this.fpsFrameCount = 0;

    if (this.state === "loading" || this.state === "menu") {
      this.setState("playing");
    }

    this.frameId = requestAnimationFrame(this.boundFrame);

    this.emit("game:started");

    return true;
  }

  stop() {
    if (!this.running) return false;

    this.running = false;

    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }

    this.emit("game:stopped");

    return true;
  }

  pause() {
    if (this.state !== "playing") return false;

    this.setState("paused");
    return true;
  }

  resume() {
    if (this.state !== "paused") return false;

    this.setState("playing");
    return true;
  }

  togglePause() {
    if (this.state === "playing") {
      return this.pause();
    }

    if (this.state === "paused") {
      return this.resume();
    }

    return false;
  }

  frame(timestamp) {
    if (!this.running || this.destroyed) return;

    if (this.lastFrameTime === 0) {
      this.lastFrameTime = timestamp;
    }

    const rawDelta = (timestamp - this.lastFrameTime) / 1000;
    const deltaTime = Math.min(
      Math.max(rawDelta, 0),
      this.options.maxDeltaTime
    );

    this.lastFrameTime = timestamp;

    this.frameCount++;
    this.fpsFrameCount++;
    this.fpsTimer += deltaTime;

    if (this.fpsTimer >= 1) {
      this.fps = this.fpsFrameCount / this.fpsTimer;
      this.fpsFrameCount = 0;
      this.fpsTimer = 0;

      this.emit("game:fps", { fps: this.fps });
    }

    if (this.state === "playing") {
      this.elapsedTime += deltaTime;
      this.update(deltaTime);
    }

    this.emit("game:frame", {
      deltaTime,
      elapsedTime: this.elapsedTime,
      frameCount: this.frameCount
    });

    if (this.running) {
      this.frameId = requestAnimationFrame(this.boundFrame);
    }
  }

  update(deltaTime) {
    for (const entry of this.updateSystems) {
      if (!entry.enabled) continue;

      const method = entry.instance[entry.updateMethod];

      if (typeof method !== "function") continue;

      try {
        method.call(entry.instance, deltaTime);
      } catch (error) {
        console.error(
          `[GameManager] Erro ao atualizar "${entry.name}":`,
          error
        );

        this.emit("system:error", {
          name: entry.name,
          error
        });
      }
    }

    this.emit("game:update", { deltaTime });
  }

  fixedUpdate(deltaTime = this.fixedStep) {
    for (const entry of this.updateSystems) {
      if (!entry.enabled) continue;

      const method = entry.instance[entry.fixedUpdateMethod];

      if (typeof method !== "function") continue;

      try {
        method.call(entry.instance, deltaTime);
      } catch (error) {
        console.error(
          `[GameManager] Erro no fixedUpdate de "${entry.name}":`,
          error
        );

        this.emit("system:error", {
          name: entry.name,
          error
        });
      }
    }
  }

  runFixedUpdates(deltaTime) {
    this.accumulator += deltaTime;

    while (this.accumulator >= this.fixedStep) {
      this.fixedUpdate(this.fixedStep);
      this.accumulator -= this.fixedStep;
    }
  }

  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    this.listeners.get(eventName).add(callback);

    return () => this.off(eventName, callback);
  }

  once(eventName, callback) {
    const unsubscribe = this.on(eventName, detail => {
      unsubscribe();
      callback(detail);
    });

    return unsubscribe;
  }

  off(eventName, callback) {
    const callbacks = this.listeners.get(eventName);

    if (!callbacks) return;

    callbacks.delete(callback);

    if (callbacks.size === 0) {
      this.listeners.delete(eventName);
    }
  }

  emit(eventName, detail = {}) {
    const callbacks = this.listeners.get(eventName);

    if (!callbacks) return;

    for (const callback of [...callbacks]) {
      try {
        callback(detail);
      } catch (error) {
        console.error(
          `[GameManager] Erro no evento "${eventName}":`,
          error
        );
      }
    }
  }

  getStats() {
    return {
      state: this.state,
      running: this.running,
      elapsedTime: this.elapsedTime,
      frameCount: this.frameCount,
      fps: Math.round(this.fps),
      registeredSystems: [...this.systems.keys()],
      enabledSystems: this.updateSystems
        .filter(system => system.enabled)
        .map(system => system.name)
    };
  }

  destroy() {
    if (this.destroyed) return;

    this.stop();

    for (const entry of this.updateSystems) {
      try {
        if (typeof entry.instance.destroy === "function") {
          entry.instance.destroy();
        }
      } catch (error) {
        console.error(
          `[GameManager] Erro ao destruir "${entry.name}":`,
          error
        );
      }
    }

    this.systems.clear();
    this.updateSystems = [];
    this.listeners.clear();

    this.destroyed = true;
    this.state = "loading";
  }
}