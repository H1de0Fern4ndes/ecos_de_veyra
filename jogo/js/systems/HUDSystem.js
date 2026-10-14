// js/systems/HUDSystem.js

export default class HUDSystem {
  constructor(options = {}) {
    this.options = {
      parent: options.parent || document.body,
      showGold: options.showGold ?? true,
      showStamina: options.showStamina ?? true,
      ...options
    };

    this.state = {
      name: "Aventureiro",
      level: 1,
      xp: 0,
      xpToNext: 100,
      health: 100,
      maxHealth: 100,
      mana: 100,
      maxMana: 100,
      stamina: 100,
      maxStamina: 100,
      gold: 0
    };

    this.notifications = [];
    this.notificationId = 0;
    this.visible = true;

    this.injectStyles();
    this.createElements();
    this.render();
  }

  injectStyles() {
    if (document.getElementById("veyra-hud-styles")) return;

    const style = document.createElement("style");
    style.id = "veyra-hud-styles";

    style.textContent = `
      .veyra-hud {
        position: fixed;
        inset: 0;
        z-index: 1000;
        pointer-events: none;
        color: #f0edf7;
        font-family: Inter, system-ui, sans-serif;
        user-select: none;
      }

      .veyra-hud * {
        box-sizing: border-box;
      }

      .veyra-player-panel {
        position: absolute;
        top: 20px;
        left: 20px;
        width: min(310px, calc(100vw - 40px));
        padding: 14px;
        background: rgba(12, 10, 19, .88);
        border: 1px solid rgba(174, 125, 230, .35);
        border-radius: 10px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, .3);
        backdrop-filter: blur(8px);
      }

      .veyra-player-heading {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }

      .veyra-player-name {
        font-size: 14px;
        font-weight: 700;
        letter-spacing: .3px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .veyra-level {
        flex-shrink: 0;
        padding: 4px 8px;
        background: rgba(151, 91, 211, .2);
        border: 1px solid rgba(183, 134, 239, .45);
        border-radius: 5px;
        color: #d9b9ff;
        font-size: 11px;
        font-weight: 800;
      }

      .veyra-stat {
        margin-top: 9px;
      }

      .veyra-stat-label {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 4px;
        color: #c8c2d3;
        font-size: 11px;
      }

      .veyra-stat-track {
        height: 8px;
        overflow: hidden;
        background: #292432;
        border-radius: 5px;
      }

      .veyra-stat-fill {
        width: 100%;
        height: 100%;
        border-radius: inherit;
        transition: width .2s ease;
      }

      .veyra-health-fill {
        background: linear-gradient(90deg, #a82e52, #ed5976);
      }

      .veyra-mana-fill {
        background: linear-gradient(90deg, #4545b8, #8b7aff);
      }

      .veyra-stamina-fill {
        background: linear-gradient(90deg, #25875f, #62d69a);
      }

      .veyra-xp-fill {
        background: linear-gradient(90deg, #8752c5, #c99aff);
      }

      .veyra-gold {
        position: absolute;
        top: 20px;
        right: 20px;
        padding: 11px 15px;
        color: #f4d88b;
        background: rgba(12, 10, 19, .88);
        border: 1px solid rgba(224, 185, 94, .35);
        border-radius: 8px;
        font-size: 13px;
        font-weight: 700;
        box-shadow: 0 8px 25px rgba(0, 0, 0, .25);
      }

      .veyra-notifications {
        position: absolute;
        top: 90px;
        right: 20px;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
        width: min(320px, calc(100vw - 40px));
      }

      .veyra-notification {
        width: 100%;
        padding: 12px 15px;
        background: rgba(18, 14, 27, .94);
        border: 1px solid rgba(174, 125, 230, .45);
        border-left: 3px solid #ad7ce8;
        border-radius: 6px;
        color: #f1eafc;
        font-size: 13px;
        line-height: 1.45;
        box-shadow: 0 6px 20px rgba(0, 0, 0, .25);
        animation: veyra-notification-in .2s ease-out;
      }

      .veyra-notification.success {
        border-left-color: #62d69a;
      }

      .veyra-notification.warning {
        border-left-color: #e6bd62;
      }

      .veyra-notification.error {
        border-left-color: #ed5976;
      }

      .veyra-interaction-hint {
        position: absolute;
        bottom: 12%;
        left: 50%;
        transform: translateX(-50%);
        padding: 11px 16px;
        background: rgba(12, 10, 19, .9);
        border: 1px solid rgba(174, 125, 230, .45);
        border-radius: 7px;
        color: #eee7fa;
        font-size: 13px;
        text-align: center;
        white-space: normal;
        max-width: calc(100vw - 32px);
      }

      .veyra-key {
        display: inline-flex;
        min-width: 23px;
        min-height: 23px;
        align-items: center;
        justify-content: center;
        margin-right: 7px;
        padding: 2px 6px;
        background: #342744;
        border: 1px solid #7957a3;
        border-radius: 4px;
        color: #e5ceff;
        font-size: 11px;
        font-weight: 800;
      }

      .veyra-hud-hidden {
        display: none !important;
      }

      @keyframes veyra-notification-in {
        from {
          opacity: 0;
          transform: translateX(10px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      @media (max-width: 600px) {
        .veyra-player-panel {
          top: 10px;
          left: 10px;
          width: min(255px, calc(100vw - 20px));
          padding: 10px;
        }

        .veyra-player-heading {
          margin-bottom: 8px;
        }

        .veyra-stat {
          margin-top: 7px;
        }

        .veyra-stat-track {
          height: 7px;
        }

        .veyra-gold {
          top: auto;
          right: 10px;
          bottom: 10px;
          padding: 9px 12px;
        }

        .veyra-notifications {
          top: 190px;
          right: 10px;
          width: min(280px, calc(100vw - 20px));
        }

        .veyra-interaction-hint {
          bottom: 65px;
          font-size: 12px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  createElements() {
    this.root = document.createElement("div");
    this.root.className = "veyra-hud";

    this.root.innerHTML = `
      <section class="veyra-player-panel">
        <div class="veyra-player-heading">
          <span class="veyra-player-name">Aventureiro</span>
          <span class="veyra-level">NÍVEL 1</span>
        </div>

        <div class="veyra-stat">
          <div class="veyra-stat-label">
            <span>Vida</span>
            <span data-value="health">100 / 100</span>
          </div>
          <div class="veyra-stat-track">
            <div class="veyra-stat-fill veyra-health-fill"
                 data-bar="health"></div>
          </div>
        </div>

        <div class="veyra-stat">
          <div class="veyra-stat-label">
            <span>Mana</span>
            <span data-value="mana">100 / 100</span>
          </div>
          <div class="veyra-stat-track">
            <div class="veyra-stat-fill veyra-mana-fill"
                 data-bar="mana"></div>
          </div>
        </div>

        <div class="veyra-stat" data-stat="stamina">
          <div class="veyra-stat-label">
            <span>Stamina</span>
            <span data-value="stamina">100 / 100</span>
          </div>
          <div class="veyra-stat-track">
            <div class="veyra-stat-fill veyra-stamina-fill"
                 data-bar="stamina"></div>
          </div>
        </div>

        <div class="veyra-stat">
          <div class="veyra-stat-label">
            <span>Experiência</span>
            <span data-value="xp">0 / 100 XP</span>
          </div>
          <div class="veyra-stat-track">
            <div class="veyra-stat-fill veyra-xp-fill"
                 data-bar="xp"></div>
          </div>
        </div>
      </section>

      <div class="veyra-gold">◆ <span data-value="gold">0</span> ouro</div>

      <div class="veyra-notifications"></div>

      <div class="veyra-interaction-hint veyra-hud-hidden">
        <span class="veyra-key">E</span>
        <span data-value="interaction">Interagir</span>
      </div>
    `;

    this.options.parent.appendChild(this.root);

    this.playerNameElement =
      this.root.querySelector(".veyra-player-name");

    this.levelElement =
      this.root.querySelector(".veyra-level");

    this.notificationContainer =
      this.root.querySelector(".veyra-notifications");

    this.interactionHint =
      this.root.querySelector(".veyra-interaction-hint");

    this.interactionText =
      this.root.querySelector('[data-value="interaction"]');

    if (!this.options.showStamina) {
      this.root.querySelector('[data-stat="stamina"]')
        .classList.add("veyra-hud-hidden");
    }

    if (!this.options.showGold) {
      this.root.querySelector(".veyra-gold")
        .classList.add("veyra-hud-hidden");
    }
  }

  render() {
    const s = this.state;

    this.playerNameElement.textContent = s.name;
    this.levelElement.textContent = `NÍVEL ${s.level}`;

    this.updateBar("health", s.health, s.maxHealth);
    this.updateBar("mana", s.mana, s.maxMana);
    this.updateBar("stamina", s.stamina, s.maxStamina);
    this.updateBar("xp", s.xp, s.xpToNext);

    this.root.querySelector('[data-value="gold"]')
      .textContent = Math.floor(s.gold).toLocaleString("pt-BR");
  }

  updateBar(name, value, max) {
    const bar = this.root.querySelector(`[data-bar="${name}"]`);
    const label = this.root.querySelector(`[data-value="${name}"]`);

    const safeMax = Math.max(0, Number(max) || 0);
    const safeValue = Math.max(0, Number(value) || 0);
    const percentage = safeMax > 0
      ? Math.min(100, (safeValue / safeMax) * 100)
      : 0;

    if (bar) {
      bar.style.width = `${percentage}%`;
    }

    if (label) {
      if (name === "xp") {
        label.textContent =
          `${Math.floor(safeValue)} / ${Math.floor(safeMax)} XP`;
      } else {
        label.textContent =
          `${Math.ceil(safeValue)} / ${Math.ceil(safeMax)}`;
      }
    }
  }

  setCharacter(character = {}) {
    if (character.name !== undefined) {
      this.state.name = String(character.name);
    }

    if (character.level !== undefined) {
      this.state.level = Math.max(1, Number(character.level) || 1);
    }

    if (character.xp !== undefined) {
      this.state.xp = Math.max(0, Number(character.xp) || 0);
    }

    if (character.xpToNext !== undefined) {
      this.state.xpToNext =
        Math.max(1, Number(character.xpToNext) || 1);
    }

    if (character.health !== undefined) {
      this.state.health = Number(character.health) || 0;
    }

    if (character.maxHealth !== undefined) {
      this.state.maxHealth =
        Math.max(0, Number(character.maxHealth) || 0);
    }

    if (character.mana !== undefined) {
      this.state.mana = Number(character.mana) || 0;
    }

    if (character.maxMana !== undefined) {
      this.state.maxMana =
        Math.max(0, Number(character.maxMana) || 0);
    }

    if (character.stamina !== undefined) {
      this.state.stamina = Number(character.stamina) || 0;
    }

    if (character.maxStamina !== undefined) {
      this.state.maxStamina =
        Math.max(0, Number(character.maxStamina) || 0);
    }

    if (character.gold !== undefined) {
      this.state.gold = Math.max(0, Number(character.gold) || 0);
    }

    this.render();
  }

  updateResources(resources = {}) {
    const keys = [
      "health",
      "maxHealth",
      "mana",
      "maxMana",
      "stamina",
      "maxStamina"
    ];

    for (const key of keys) {
      if (resources[key] !== undefined) {
        this.state[key] = Math.max(0, Number(resources[key]) || 0);
      }
    }

    this.render();
  }

  updateXP(xp, xpToNext = this.state.xpToNext) {
    this.state.xp = Math.max(0, Number(xp) || 0);
    this.state.xpToNext = Math.max(1, Number(xpToNext) || 1);
    this.render();
  }

  setLevel(level) {
    this.state.level = Math.max(1, Number(level) || 1);
    this.render();
  }

  setGold(amount) {
    this.state.gold = Math.max(0, Number(amount) || 0);
    this.render();
  }

  addGold(amount) {
    this.setGold(this.state.gold + (Number(amount) || 0));
  }

  showNotification(message, type = "info", duration = 3000) {
    const allowedTypes = ["info", "success", "warning", "error"];
    const safeType = allowedTypes.includes(type) ? type : "info";

    const notification = document.createElement("div");
    notification.className = `veyra-notification ${safeType}`;
    notification.textContent = String(message);

    const id = ++this.notificationId;
    notification.dataset.notificationId = String(id);

    this.notificationContainer.appendChild(notification);
    this.notifications.push({ id, element: notification });

    while (this.notifications.length > 5) {
      const oldest = this.notifications.shift();
      oldest.element.remove();
    }

    if (duration > 0) {
      setTimeout(() => {
        notification.remove();
        this.notifications = this.notifications.filter(
          item => item.id !== id
        );
      }, duration);
    }

    return id;
  }

  removeNotification(id) {
    const notification = this.notifications.find(item => item.id === id);

    if (!notification) return false;

    notification.element.remove();
    this.notifications = this.notifications.filter(
      item => item.id !== id
    );

    return true;
  }

  setInteractionHint(message, key = "E") {
    this.interactionText.textContent = String(message);

    const keyElement = this.interactionHint.querySelector(".veyra-key");
    keyElement.textContent = String(key);

    this.interactionHint.classList.remove("veyra-hud-hidden");
  }

  hideInteractionHint() {
    this.interactionHint.classList.add("veyra-hud-hidden");
  }

  show() {
    this.visible = true;
    this.root.classList.remove("veyra-hud-hidden");
  }

  hide() {
    this.visible = false;
    this.root.classList.add("veyra-hud-hidden");
  }

  toggle() {
    this.visible ? this.hide() : this.show();
  }

  getState() {
    return { ...this.state };
  }

  destroy() {
    this.root?.remove();
    this.notifications = [];

    const styles = document.getElementById("veyra-hud-styles");
    styles?.remove();
  }
}