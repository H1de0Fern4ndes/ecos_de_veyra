// js/systems/DialogueUI.js

export class DialogueUI {
  constructor(options = {}) {
    this.containerId = options.containerId ?? "dialogue-ui";
    this.onChoice = options.onChoice ?? (() => {});
    this.onClose = options.onClose ?? (() => {});

    this.container = null;
    this.currentDialogue = null;
    this.isOpen = false;

    this.injectStyles();
    this.createContainer();
  }

  // =====================================
  // ESTILOS
  // =====================================

  injectStyles() {
    if (document.getElementById("dialogue-ui-styles")) return;

    const style = document.createElement("style");
    style.id = "dialogue-ui-styles";

    style.textContent = `
      #${this.containerId} {
        position: fixed;
        inset: auto 0 0;
        z-index: 1000;
        display: none;
        padding: 24px;
        pointer-events: none;
        color: #f1edf8;
        font-family: Arial, sans-serif;
      }

      #${this.containerId}.active {
        display: flex;
        justify-content: center;
      }

      #${this.containerId} .dialogue-panel {
        width: min(760px, 100%);
        padding: 24px;
        background: rgba(12, 10, 19, 0.96);
        border: 1px solid #69518b;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.55);
        pointer-events: auto;
        animation: dialogue-appear 180ms ease-out;
      }

      #${this.containerId} .dialogue-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 14px;
      }

      #${this.containerId} .dialogue-name {
        margin: 0;
        color: #c8a5ff;
        font-size: 1.15rem;
        font-weight: 700;
      }

      #${this.containerId} .dialogue-close {
        border: 0;
        border-radius: 6px;
        padding: 7px 11px;
        background: #292333;
        color: #fff;
        cursor: pointer;
      }

      #${this.containerId} .dialogue-text {
        margin: 0 0 20px;
        line-height: 1.7;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }

      #${this.containerId} .dialogue-choices {
        display: flex;
        flex-direction: column;
        gap: 9px;
      }

      #${this.containerId} .dialogue-choice {
        width: 100%;
        padding: 12px 14px;
        text-align: left;
        color: #f1edf8;
        background: #211b2c;
        border: 1px solid #48365f;
        border-radius: 8px;
        cursor: pointer;
        transition: background 120ms, border-color 120ms;
      }

      #${this.containerId} .dialogue-choice:hover {
        background: #352747;
        border-color: #b28ae8;
      }

      #${this.containerId} .dialogue-choice:focus-visible,
      #${this.containerId} .dialogue-close:focus-visible {
        outline: 2px solid #c8a5ff;
        outline-offset: 3px;
      }

      #${this.containerId} .dialogue-hint {
        margin: 16px 0 0;
        color: #aaa1b7;
        font-size: 0.8rem;
      }

      @keyframes dialogue-appear {
        from {
          opacity: 0;
          transform: translateY(12px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @media (max-width: 600px) {
        #${this.containerId} {
          padding: 12px;
        }

        #${this.containerId} .dialogue-panel {
          padding: 18px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        #${this.containerId} .dialogue-panel {
          animation: none;
        }
      }
    `;

    document.head.appendChild(style);
  }

  // =====================================
  // CRIAR INTERFACE
  // =====================================

  createContainer() {
    let container = document.getElementById(this.containerId);

    if (!container) {
      container = document.createElement("div");
      container.id = this.containerId;
      container.setAttribute("role", "dialog");
      container.setAttribute("aria-modal", "true");
      container.setAttribute("aria-label", "Diálogo");
      document.body.appendChild(container);
    }

    this.container = container;
  }

  // =====================================
  // ABRIR DIÁLOGO
  // =====================================

  open(dialogue = {}) {
    if (!this.container) this.createContainer();

    this.currentDialogue = {
      npcId: dialogue.npcId ?? null,
      npcName: dialogue.npcName ?? "Desconhecido",
      text: dialogue.text ?? "",
      choices: Array.isArray(dialogue.choices)
        ? dialogue.choices
        : []
    };

    this.isOpen = true;
    this.render();

    this.container.classList.add("active");

    const firstChoice = this.container.querySelector(
      ".dialogue-choice"
    );

    const closeButton = this.container.querySelector(
      ".dialogue-close"
    );

    (firstChoice ?? closeButton)?.focus();

    this.container.dispatchEvent(
      new CustomEvent("dialogue:opened", {
        detail: this.currentDialogue
      })
    );
  }

  // =====================================
  // RENDERIZAR CONTEÚDO
  // =====================================

  render() {
    if (!this.container || !this.currentDialogue) return;

    const dialogue = this.currentDialogue;

    this.container.replaceChildren();

    const panel = document.createElement("section");
    panel.className = "dialogue-panel";

    const header = document.createElement("header");
    header.className = "dialogue-header";

    const name = document.createElement("h2");
    name.className = "dialogue-name";
    name.textContent = dialogue.npcName;

    const closeButton = document.createElement("button");
    closeButton.className = "dialogue-close";
    closeButton.type = "button";
    closeButton.textContent = "Fechar";
    closeButton.addEventListener("click", () => this.close());

    header.append(name, closeButton);

    const text = document.createElement("p");
    text.className = "dialogue-text";
    text.textContent = dialogue.text;

    const choicesContainer = document.createElement("div");
    choicesContainer.className = "dialogue-choices";

    dialogue.choices.forEach((choice, index) => {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "dialogue-choice";
      button.textContent = choice.text ?? `Opção ${index + 1}`;

      button.addEventListener("click", () => {
        this.selectChoice(index);
      });

      choicesContainer.appendChild(button);
    });

    panel.append(header, text, choicesContainer);

    if (dialogue.choices.length === 0) {
      const hint = document.createElement("p");
      hint.className = "dialogue-hint";
      hint.textContent = "Feche a conversa para continuar.";
      panel.appendChild(hint);
    }

    this.container.appendChild(panel);
  }

  // =====================================
  // ESCOLHER RESPOSTA
  // =====================================

  selectChoice(index) {
    if (!this.isOpen || !this.currentDialogue) return;

    const choice = this.currentDialogue.choices[index];

    if (!choice) return;

    const result = {
      npcId: this.currentDialogue.npcId,
      choiceId: choice.id ?? null,
      index,
      choice
    };

    this.onChoice(result);

    this.container.dispatchEvent(
      new CustomEvent("dialogue:choice", {
        detail: result
      })
    );

    // A próxima fala deve ser aberta pelo sistema de diálogos.
    // Se a escolha não tiver continuação, a interface fecha.
    if (!choice.nextNodeId && !choice.keepOpen) {
      this.close();
    }
  }

  // =====================================
  // ATUALIZAR TEXTO
  // =====================================

  update(dialogue = {}) {
    if (!this.isOpen) return;

    this.open({
      ...this.currentDialogue,
      ...dialogue
    });
  }

  // =====================================
  // FECHAR
  // =====================================

  close() {
    if (!this.isOpen) return;

    this.isOpen = false;

    if (this.container) {
      this.container.classList.remove("active");
      this.container.replaceChildren();
    }

    const previousDialogue = this.currentDialogue;
    this.currentDialogue = null;

    this.onClose(previousDialogue);
 
    this.container?.dispatchEvent(
      new CustomEvent("dialogue:closed", {
        detail: previousDialogue
      })
    );
  }

  // =====================================
  // ESTADO
  // =====================================

  getIsOpen() {
    return this.isOpen;
  }

  destroy() {
    this.close();

    this.container?.remove();
    this.container = null;

    document.getElementById("dialogue-ui-styles")?.remove();
  }
}

export default DialogueUI;