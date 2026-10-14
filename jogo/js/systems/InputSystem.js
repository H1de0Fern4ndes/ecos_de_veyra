// js/systems/InputSystem.js

export default class InputSystem {
  constructor(options = {}) {
    this.options = {
      target: options.target ?? window,
      preventDefault: options.preventDefault ?? true,
      enabled: options.enabled ?? true,
      mouseSensitivity: options.mouseSensitivity ?? 1,
      ...options
    };

    this.enabled = Boolean(this.options.enabled);
    this.destroyed = false;

    this.keysDown = new Set();
    this.keysPressed = new Set();
    this.keysReleased = new Set();

    this.mouseButtonsDown = new Set();
    this.mouseButtonsPressed = new Set();
    this.mouseButtonsReleased = new Set();

    this.mouse = {
      x: 0,
      y: 0,
      deltaX: 0,
      deltaY: 0,
      wheel: 0,
      locked: false
    };

    this.listeners = new Map();

    this.bindings = {
      moveForward: ["KeyW", "ArrowUp"],
      moveBackward: ["KeyS", "ArrowDown"],
      moveLeft: ["KeyA", "ArrowLeft"],
      moveRight: ["KeyD", "ArrowRight"],
      jump: ["Space"],
      sprint: ["ShiftLeft", "ShiftRight"],
      crouch: ["ControlLeft", "ControlRight"],
      dodge: ["AltLeft", "AltRight"],
      attack: ["Mouse0"],
      heavyAttack: ["Mouse2"],
      block: ["Mouse1"],
      interact: ["KeyE"],
      inventory: ["KeyI"],
      map: ["KeyM"],
      questLog: ["KeyJ"],
      character: ["KeyC"],
      skillMenu: ["KeyK"],
      pause: ["Escape"],
      useItem: ["KeyQ"],
      sheatheWeapon: ["KeyR"]
    };

    if (options.bindings) {
      for (const [action, keys] of Object.entries(options.bindings)) {
        this.bindings[action] = Array.isArray(keys) ? [...keys] : [keys];
      }
    }

    this.boundHandlers = {
      keydown: event => this.handleKeyDown(event),
      keyup: event => this.handleKeyUp(event),
      mousedown: event => this.handleMouseDown(event),
      mouseup: event => this.handleMouseUp(event),
      mousemove: event => this.handleMouseMove(event),
      wheel: event => this.handleWheel(event),
      blur: () => this.reset(),
      contextmenu: event => this.handleContextMenu(event)
    };

    this.attach();
  }

  attach() {
    const target = this.options.target;

    target.addEventListener("keydown", this.boundHandlers.keydown);
    target.addEventListener("keyup", this.boundHandlers.keyup);
    target.addEventListener("mousedown", this.boundHandlers.mousedown);
    target.addEventListener("mouseup", this.boundHandlers.mouseup);
    target.addEventListener("mousemove", this.boundHandlers.mousemove);
    target.addEventListener("wheel", this.boundHandlers.wheel, {
      passive: true
    });

    window.addEventListener("blur", this.boundHandlers.blur);

    if (target.addEventListener) {
      target.addEventListener(
        "contextmenu",
        this.boundHandlers.contextmenu
      );
    }

    if (document.pointerLockElement) {
      this.mouse.locked = true;
    }

    document.addEventListener(
      "pointerlockchange",
      this.handlePointerLockChange
    );
  }

  handlePointerLockChange = () => {
    this.mouse.locked = Boolean(document.pointerLockElement);
  };

  handleKeyDown(event) {
    if (!this.enabled || this.destroyed) return;

    const code = event.code;

    if (this.options.preventDefault && this.isGameKey(code)) {
      event.preventDefault();
    }

    if (!this.keysDown.has(code)) {
      this.keysPressed.add(code);
      this.emit("key:pressed", { code, event });
    }

    this.keysDown.add(code);
    this.emit("key:down", { code, event });
  }

  handleKeyUp(event) {
    if (this.destroyed) return;

    const code = event.code;

    if (this.keysDown.has(code)) {
      this.keysReleased.add(code);
      this.emit("key:released", { code, event });
    }

    this.keysDown.delete(code);
  }

  handleMouseDown(event) {
    if (!this.enabled || this.destroyed) return;

    const code = `Mouse${event.button}`;

    if (!this.mouseButtonsDown.has(event.button)) {
      this.mouseButtonsPressed.add(event.button);
      this.emit("mouse:pressed", {
        button: event.button,
        code,
        event
      });
    }

    this.mouseButtonsDown.add(event.button);
  }

  handleMouseUp(event) {
    if (this.destroyed) return;

    if (this.mouseButtonsDown.has(event.button)) {
      this.mouseButtonsReleased.add(event.button);
      this.emit("mouse:released", {
        button: event.button,
        code: `Mouse${event.button}`,
        event
      });
    }

    this.mouseButtonsDown.delete(event.button);
  }

  handleMouseMove(event) {
    if (!this.enabled || this.destroyed) return;

    this.mouse.x = event.clientX;
    this.mouse.y = event.clientY;

    if (this.mouse.locked) {
      this.mouse.deltaX += event.movementX *
        this.options.mouseSensitivity;

      this.mouse.deltaY += event.movementY *
        this.options.mouseSensitivity;
    }

    this.emit("mouse:move", {
      x: this.mouse.x,
      y: this.mouse.y,
      deltaX: event.movementX || 0,
      deltaY: event.movementY || 0,
      locked: this.mouse.locked,
      event
    });
  }

  handleWheel(event) {
    if (!this.enabled || this.destroyed) return;

    this.mouse.wheel += event.deltaY;

    this.emit("mouse:wheel", {
      delta: event.deltaY,
      event
    });
  }

  handleContextMenu(event) {
    if (
      this.enabled &&
      this.options.preventDefault &&
      this.isGameKey("Mouse2")
    ) {
      event.preventDefault();
    }
  }

  isGameKey(code) {
    return Object.values(this.bindings).some(keys =>
      keys.includes(code)
    );
  }

  isActionDown(action) {
    if (!this.enabled) return false;

    const keys = this.bindings[action] || [];

    return keys.some(key => {
      if (key.startsWith("Mouse")) {
        return this.mouseButtonsDown.has(Number(key.slice(5)));
      }

      return this.keysDown.has(key);
    });
  }

  wasActionPressed(action) {
    if (!this.enabled) return false;

    const keys = this.bindings[action] || [];

    return keys.some(key => {
      if (key.startsWith("Mouse")) {
        return this.mouseButtonsPressed.has(Number(key.slice(5)));
      }

      return this.keysPressed.has(key);
    });
  }

  wasActionReleased(action) {
    if (!this.enabled) return false;

    const keys = this.bindings[action] || [];

    return keys.some(key => {
      if (key.startsWith("Mouse")) {
        return this.mouseButtonsReleased.has(Number(key.slice(5)));
      }

      return this.keysReleased.has(key);
    });
  }

  getMovement() {
    if (!this.enabled) {
      return { x: 0, z: 0, magnitude: 0 };
    }

    let x = 0;
    let z = 0;

    if (this.isActionDown("moveLeft")) x -= 1;
    if (this.isActionDown("moveRight")) x += 1;
    if (this.isActionDown("moveForward")) z -= 1;
    if (this.isActionDown("moveBackward")) z += 1;

    const magnitude = Math.hypot(x, z);

    if (magnitude > 1) {
      x /= magnitude;
      z /= magnitude;
    }

    return { x, z, magnitude: Math.min(1, magnitude) };
  }

  getMouseDelta() {
    const delta = {
      x: this.mouse.deltaX,
      y: this.mouse.deltaY
    };

    this.mouse.deltaX = 0;
    this.mouse.deltaY = 0;

    return delta;
  }

  getMouseWheel() {
    const wheel = this.mouse.wheel;
    this.mouse.wheel = 0;
    return wheel;
  }

  bindAction(action, keys) {
    if (!action) {
      throw new Error("Informe o nome da ação.");
    }

    this.bindings[action] = Array.isArray(keys) ? [...keys] : [keys];

    this.emit("binding:changed", {
      action,
      keys: this.bindings[action]
    });
  }

  getBindings() {
    return Object.fromEntries(
      Object.entries(this.bindings).map(([action, keys]) => [
        action,
        [...keys]
      ])
    );
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
          `[InputSystem] Erro no evento "${eventName}":`,
          error
        );
      }
    }
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);

    if (!this.enabled) {
      this.reset();
    }

    this.emit("input:enabled", { enabled: this.enabled });
  }

  requestPointerLock(element = document.body) {
    if (!element?.requestPointerLock) return false;

    element.requestPointerLock();
    return true;
  }

  exitPointerLock() {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  reset() {
    this.keysDown.clear();
    this.keysPressed.clear();
    this.keysReleased.clear();

    this.mouseButtonsDown.clear();
    this.mouseButtonsPressed.clear();
    this.mouseButtonsReleased.clear();

    this.mouse.deltaX = 0;
    this.mouse.deltaY = 0;
    this.mouse.wheel = 0;
  }

  update() {
    // Chame uma vez por frame, depois de ler os inputs.
    this.keysPressed.clear();
    this.keysReleased.clear();

    this.mouseButtonsPressed.clear();
    this.mouseButtonsReleased.clear();

    this.mouse.deltaX = 0;
    this.mouse.deltaY = 0;
    this.mouse.wheel = 0;
  }

  destroy() {
    if (this.destroyed) return;

    const target = this.options.target;

    target.removeEventListener("keydown", this.boundHandlers.keydown);
    target.removeEventListener("keyup", this.boundHandlers.keyup);
    target.removeEventListener("mousedown", this.boundHandlers.mousedown);
    target.removeEventListener("mouseup", this.boundHandlers.mouseup);
    target.removeEventListener("mousemove", this.boundHandlers.mousemove);
    target.removeEventListener("wheel", this.boundHandlers.wheel);
    target.removeEventListener("contextmenu", this.boundHandlers.contextmenu);

    window.removeEventListener("blur", this.boundHandlers.blur);

    document.removeEventListener(
      "pointerlockchange",
      this.handlePointerLockChange
    );

    this.reset();
    this.listeners.clear();
    this.destroyed = true;
    this.enabled = false;
  }
}