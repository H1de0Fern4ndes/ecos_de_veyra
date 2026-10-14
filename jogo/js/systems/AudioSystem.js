// js/systems/AudioSystem.js

export default class AudioSystem {
  constructor(options = {}) {
    this.options = {
      musicVolume: options.musicVolume ?? 0.35,
      sfxVolume: options.sfxVolume ?? 0.7,
      basePath: options.basePath ?? "assets/audio/",
      maxSimultaneousSFX: options.maxSimultaneousSFX ?? 12
    };

    this.musicVolume = this.clamp(this.options.musicVolume);
    this.sfxVolume = this.clamp(this.options.sfxVolume);
    this.muted = false;

    this.sounds = new Map();
    this.activeSFX = new Set();
    this.currentMusic = null;
    this.currentMusicName = null;

    this.initialized = false;
    this.destroyed = false;

    this.musicFadeInterval = null;
    this.listeners = new Map();
  }

  clamp(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  init() {
    if (this.destroyed) {
      throw new Error("AudioSystem já foi destruído.");
    }

    this.initialized = true;
    this.emit("audio:ready");

    return this;
  }

  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    this.listeners.get(eventName).add(callback);

    return () => this.off(eventName, callback);
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

    for (const callback of callbacks) {
      try {
        callback(detail);
      } catch (error) {
        console.error(
          `[AudioSystem] Erro no evento "${eventName}":`,
          error
        );
      }
    }
  }

  registerSound(name, source, options = {}) {
    if (!name || !source) {
      throw new Error("Informe o nome e o caminho do áudio.");
    }

    const sound = {
      name,
      source,
      volume: this.clamp(options.volume ?? 1),
      loop: options.loop ?? false,
      category: options.category ?? "sfx",
      preload: options.preload ?? false
    };

    this.sounds.set(name, sound);

    if (sound.preload) {
      this.preload(name);
    }

    return sound;
  }

  registerSounds(sounds = {}) {
    for (const [name, config] of Object.entries(sounds)) {
      if (typeof config === "string") {
        this.registerSound(name, config);
      } else {
        this.registerSound(name, config.source, config);
      }
    }
  }

  resolveSource(source) {
    try {
      return new URL(source, document.baseURI).href;
    } catch {
      return `${this.options.basePath}${source}`;
    }
  }

  createAudio(name) {
    const config = this.sounds.get(name);

    if (!config) {
      console.warn(`[AudioSystem] Áudio não registrado: ${name}`);
      return null;
    }

    const audio = new Audio(this.resolveSource(config.source));

    audio.preload = "auto";
    audio.loop = config.loop;
    audio.volume = this.clamp(
      config.volume *
      (config.category === "music"
        ? this.musicVolume
        : this.sfxVolume)
    );

    return audio;
  }

  preload(name) {
    const config = this.sounds.get(name);

    if (!config) return false;

    const audio = new Audio(this.resolveSource(config.source));
    audio.preload = "auto";
    audio.load();

    return true;
  }

  async playMusic(name, options = {}) {
    if (this.destroyed) return false;

    const config = this.sounds.get(name);

    if (!config) {
      console.warn(`[AudioSystem] Música não registrada: ${name}`);
      return false;
    }

    if (this.currentMusicName === name && this.currentMusic) {
      if (this.currentMusic.paused) {
        return this.resumeMusic();
      }

      return true;
    }

    this.stopMusic();

    const audio = this.createAudio(name);

    if (!audio) return false;

    audio.loop = options.loop ?? true;

    if (options.startTime !== undefined) {
      audio.currentTime = Math.max(0, Number(options.startTime) || 0);
    }

    if (options.volume !== undefined) {
      audio.volume = this.clamp(options.volume) *
        this.musicVolume *
        config.volume;
    }

    this.currentMusic = audio;
    this.currentMusicName = name;

    audio.addEventListener("ended", () => {
      if (this.currentMusic === audio) {
        this.emit("music:ended", { name });
      }
    });

    audio.addEventListener("error", () => {
      this.emit("audio:error", {
        name,
        source: config.source
      });
    });

    try {
      await audio.play();

      this.emit("music:started", { name });

      return true;
    } catch (error) {
      this.emit("music:blocked", { name, error });
      return false;
    }
  }

  async playSFX(name, options = {}) {
    if (this.destroyed || this.muted) return false;

    if (this.activeSFX.size >= this.options.maxSimultaneousSFX) {
      const oldest = this.activeSFX.values().next().value;

      if (oldest) {
        oldest.pause();
        oldest.currentTime = 0;
        this.activeSFX.delete(oldest);
      }
    }

    const audio = this.createAudio(name);

    if (!audio) return false;

    const config = this.sounds.get(name);

    audio.loop = options.loop ?? false;
    audio.volume = this.clamp(
      this.sfxVolume *
      config.volume *
      (options.volume ?? 1)
    );

    if (options.startTime !== undefined) {
      audio.currentTime = Math.max(0, Number(options.startTime) || 0);
    }

    this.activeSFX.add(audio);

    const cleanup = () => {
      this.activeSFX.delete(audio);
      audio.removeEventListener("ended", cleanup);
      audio.removeEventListener("error", cleanup);
    };

    audio.addEventListener("ended", cleanup);
    audio.addEventListener("error", cleanup);

    try {
      await audio.play();

      this.emit("sfx:played", { name });

      return true;
    } catch (error) {
      cleanup();

      this.emit("audio:error", { name, error });

      return false;
    }
  }

  pauseMusic() {
    if (!this.currentMusic) return false;

    this.currentMusic.pause();
    this.emit("music:paused", {
      name: this.currentMusicName
    });

    return true;
  }

  async resumeMusic() {
    if (!this.currentMusic) return false;

    try {
      await this.currentMusic.play();

      this.emit("music:resumed", {
        name: this.currentMusicName
      });

      return true;
    } catch (error) {
      this.emit("music:blocked", {
        name: this.currentMusicName,
        error
      });

      return false;
    }
  }

  stopMusic() {
    this.clearFade();

    if (!this.currentMusic) return false;

    const name = this.currentMusicName;

    this.currentMusic.pause();
    this.currentMusic.currentTime = 0;
    this.currentMusic.src = "";

    this.currentMusic = null;
    this.currentMusicName = null;

    this.emit("music:stopped", { name });

    return true;
  }

  stopSFX() {
    for (const audio of this.activeSFX) {
      audio.pause();
      audio.currentTime = 0;
      audio.src = "";
    }

    this.activeSFX.clear();
  }

  setMusicVolume(volume) {
    this.musicVolume = this.clamp(volume);
    this.applyMusicVolume();

    this.emit("volume:changed", {
      category: "music",
      volume: this.musicVolume
    });
  }

  setSFXVolume(volume) {
    this.sfxVolume = this.clamp(volume);

    for (const audio of this.activeSFX) {
      const config = [...this.sounds.values()].find(
        sound => this.resolveSource(sound.source) === audio.src
      );

      if (config) {
        audio.volume = this.muted
          ? 0
          : this.clamp(config.volume * this.sfxVolume);
      }
    }

    this.emit("volume:changed", {
      category: "sfx",
      volume: this.sfxVolume
    });
  }

  applyMusicVolume() {
    if (!this.currentMusic) return;

    const config = this.sounds.get(this.currentMusicName);

    this.currentMusic.volume = this.muted
      ? 0
      : this.clamp(this.musicVolume * (config?.volume ?? 1));
  }

  setMuted(muted) {
    this.muted = Boolean(muted);

    this.applyMusicVolume();

    for (const audio of this.activeSFX) {
      audio.muted = this.muted;
    }

    this.emit("audio:muted", { muted: this.muted });
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  fadeMusic(targetVolume, duration = 1000) {
    if (!this.currentMusic) return;

    this.clearFade();

    const audio = this.currentMusic;
    const target = this.clamp(targetVolume);
    const start = audio.volume;
    const steps = 20;
    const interval = Math.max(10, duration / steps);
    let step = 0;

    this.musicFadeInterval = setInterval(() => {
      if (this.currentMusic !== audio) {
        this.clearFade();
        return;
      }

      step++;

      const progress = Math.min(1, step / steps);

      audio.volume = this.muted
        ? 0
        : this.clamp(start + (target - start) * progress);

      if (step >= steps) {
        this.clearFade();
        audio.volume = this.muted ? 0 : target;
      }
    }, interval);
  }

  fadeOutMusic(duration = 1000, stopAfter = true) {
    if (!this.currentMusic) return;

    this.clearFade();

    const audio = this.currentMusic;
    const start = audio.volume;
    const steps = 20;
    const interval = Math.max(10, duration / steps);
    let step = 0;

    this.musicFadeInterval = setInterval(() => {
      if (this.currentMusic !== audio) {
        this.clearFade();
        return;
      }

      step++;

      const progress = Math.min(1, step / steps);

      audio.volume = this.muted
        ? 0
        : this.clamp(start * (1 - progress));

      if (step >= steps) {
        this.clearFade();

        if (stopAfter) {
          this.stopMusic();
        } else {
          audio.volume = this.muted ? 0 : start;
        }
      }
    }, interval);
  }

  clearFade() {
    if (this.musicFadeInterval !== null) {
      clearInterval(this.musicFadeInterval);
      this.musicFadeInterval = null;
    }
  }

  getState() {
    return {
      initialized: this.initialized,
      muted: this.muted,
      musicVolume: this.musicVolume,
      sfxVolume: this.sfxVolume,
      currentMusic: this.currentMusicName,
      registeredSounds: [...this.sounds.keys()],
      activeSFX: this.activeSFX.size
    };
  }

  destroy() {
    this.stopMusic();
    this.stopSFX();
    this.clearFade();

    this.sounds.clear();
    this.listeners.clear();

    this.initialized = false;
    this.destroyed = true;
  }
}