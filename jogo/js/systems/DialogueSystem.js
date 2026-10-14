
/**
 * Ecos de Veyra — DialogueSystem
 * Gerencia diálogos, escolhas, condições e ações de NPCs.
 *
 * JavaScript ES Modules.
 * Independente do Three.js.
 */

export class DialogueSystem {
  constructor(options = {}) {
    this.dialogues = new Map();
    this.npcs = new Map();
    this.sessions = new Map();
    this.events = new Map();

    this.maxHistory = Math.max(
      1,
      Math.floor(Number(options.maxHistory) || 50)
    );
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
          `[DialogueSystem] Erro no evento "${eventName}":`,
          error
        );
      }
    }
  }

  // ========================================
  // NPCs
  // ========================================

  registerNPC(definition) {
    if (!definition || typeof definition.id !== "string") {
      throw new TypeError("O NPC precisa ter um ID válido.");
    }

    const id = definition.id.trim();

    if (!id) {
      throw new Error("O ID do NPC não pode estar vazio.");
    }

    if (this.npcs.has(id)) {
      throw new Error(`O NPC "${id}" já está cadastrado.`);
    }

    const npc = {
      id,
      name: String(definition.name ?? "Desconhecido"),
      description: String(definition.description ?? ""),
      dialogueId: definition.dialogueId ?? null,
      role: String(definition.role ?? "civilian"),
      metadata: { ...(definition.metadata ?? {}) }
    };

    this.npcs.set(id, npc);

    this.emit("npc:registered", {
      npc: this.cloneNPC(npc)
    });

    return this.cloneNPC(npc);
  }

  cloneNPC(npc) {
    return {
      ...npc,
      metadata: { ...npc.metadata }
    };
  }

  getNPC(id) {
    const npc = this.npcs.get(id);
    return npc ? this.cloneNPC(npc) : null;
  }

  getAllNPCs() {
    return [...this.npcs.values()].map(npc =>
      this.cloneNPC(npc)
    );
  }

  // ========================================
  // CADASTRO DE DIÁLOGOS
  // ========================================

  registerDialogue(definition) {
    if (!definition || typeof definition.id !== "string") {
      throw new TypeError("O diálogo precisa ter um ID válido.");
    }

    const id = definition.id.trim();

    if (!id) {
      throw new Error("O ID do diálogo não pode estar vazio.");
    }

    if (this.dialogues.has(id)) {
      throw new Error(`O diálogo "${id}" já está cadastrado.`);
    }

    if (
      !definition.nodes ||
      typeof definition.nodes !== "object" ||
      Array.isArray(definition.nodes)
    ) {
      throw new TypeError(
        `O diálogo "${id}" precisa ter um objeto nodes.`
      );
    }

    const nodes = {};

    for (const [nodeId, rawNode] of Object.entries(definition.nodes)) {
      if (!rawNode || typeof rawNode !== "object") {
        throw new TypeError(
          `Nó inválido "${nodeId}" no diálogo "${id}".`
        );
      }

      nodes[nodeId] = {
        id: nodeId,
        speaker: String(rawNode.speaker ?? ""),
        text: String(rawNode.text ?? ""),
        choices: Array.isArray(rawNode.choices)
          ? rawNode.choices.map((choice, index) => ({
              id: String(choice.id ?? `choice-${index + 1}`),
              text: String(choice.text ?? "Continuar"),
              next: choice.next ?? null,
              condition: choice.condition ?? null,
              action: choice.action ?? null
            }))
          : [],
        next: rawNode.next ?? null,
        action: rawNode.action ?? null,
        condition: rawNode.condition ?? null,
        end: rawNode.end === true,
        metadata: { ...(rawNode.metadata ?? {}) }
      };
    }

    const startNode = String(
      definition.startNode ??
      Object.keys(nodes)[0] ??
      ""
    );

    if (!nodes[startNode]) {
      throw new Error(
        `Nó inicial "${startNode}" inexistente no diálogo "${id}".`
      );
    }

    // Validação das referências diretas.
    for (const node of Object.values(nodes)) {
      if (node.next && !nodes[node.next]) {
        throw new Error(
          `O nó "${node.id}" aponta para "${node.next}", que não existe.`
        );
      }

      for (const choice of node.choices) {
        if (choice.next && !nodes[choice.next]) {
          throw new Error(
            `A escolha "${choice.id}" aponta para "${choice.next}", que não existe.`
          );
        }
      }
    }

    const dialogue = {
      id,
      title: String(definition.title ?? id),
      startNode,
      nodes,
      metadata: { ...(definition.metadata ?? {}) }
    };

    this.dialogues.set(id, dialogue);

    this.emit("dialogue:registered", {
      dialogueId: id,
      title: dialogue.title
    });

    return this.getDialogue(id);
  }

  getDialogue(id) {
    const dialogue = this.dialogues.get(id);

    if (!dialogue) return null;

    return {
      ...dialogue,
      nodes: Object.fromEntries(
        Object.entries(dialogue.nodes).map(([nodeId, node]) => [
          nodeId,
          {
            ...node,
            choices: node.choices.map(choice => ({
              ...choice,
              condition: choice.condition
                ? { ...choice.condition }
                : null,
              action: choice.action
                ? { ...choice.action }
                : null
            })),
            metadata: { ...node.metadata }
          }
        ])
      ),
      metadata: { ...dialogue.metadata }
    };
  }

  // ========================================
  // INICIAR E ENCERRAR SESSÕES
  // ========================================

  startDialogue(npcId, context = {}) {
    const npc = this.npcs.get(npcId);

    if (!npc) {
      return {
        success: false,
        reason: "npc_not_found"
      };
    }

    if (!npc.dialogueId) {
      return {
        success: false,
        reason: "npc_has_no_dialogue"
      };
    }

    const dialogue = this.dialogues.get(npc.dialogueId);

    if (!dialogue) {
      return {
        success: false,
        reason: "dialogue_not_found"
      };
    }

    const sessionId = `${npcId}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const session = {
      id: sessionId,
      npcId,
      dialogueId: dialogue.id,
      currentNodeId: dialogue.startNode,
      context,
      history: [],
      startedAt: Date.now(),
      active: true
    };

    this.sessions.set(sessionId, session);

    this.emit("dialogue:started", {
      sessionId,
      npc: this.cloneNPC(npc)
    });

    return this.getCurrentNode(sessionId);
  }

  endDialogue(sessionId, reason = "finished") {
    const session = this.sessions.get(sessionId);

    if (!session || !session.active) {
      return {
        success: false,
        reason: "session_not_active"
      };
    }

    session.active = false;

    this.emit("dialogue:ended", {
      sessionId,
      npcId: session.npcId,
      reason,
      history: [...session.history]
    });

    return {
      success: true,
      sessionId,
      reason
    };
  }

  // ========================================
  // CONDIÇÕES
  // ========================================

  evaluateCondition(condition, context) {
    if (!condition) return true;

    // Condições são declarativas, não funções arbitrárias.
    const value = this.readPath(context, condition.path);

    switch (condition.operator ?? "truthy") {
      case "truthy":
        return Boolean(value);

      case "falsy":
        return !value;

      case "equals":
        return value === condition.value;

      case "notEquals":
        return value !== condition.value;

      case "greaterThan":
        return Number(value) > Number(condition.value);

      case "greaterOrEqual":
        return Number(value) >= Number(condition.value);

      case "lessThan":
        return Number(value) < Number(condition.value);

      case "lessOrEqual":
        return Number(value) <= Number(condition.value);

      case "includes":
        return Array.isArray(value) &&
          value.includes(condition.value);

      default:
        return false;
    }
  }

  readPath(object, path) {
    if (!path || typeof path !== "string") {
      return undefined;
    }

    return path.split(".").reduce((value, key) => {
      if (
        value === null ||
        value === undefined ||
        key === "__proto__" ||
        key === "constructor" ||
        key === "prototype"
      ) {
        return undefined;
      }

      return value[key];
    }, object);
  }

  // ========================================
  // LER NÓ ATUAL
  // ========================================

  getCurrentNode(sessionId) {
    const session = this.sessions.get(sessionId);

    if (!session || !session.active) {
      return {
        success: false,
        reason: "session_not_active"
      };
    }

    const dialogue = this.dialogues.get(session.dialogueId);
    const node = dialogue?.nodes[session.currentNodeId];

    if (!node) {
      this.endDialogue(sessionId, "invalid_node");

      return {
        success: false,
        reason: "node_not_found"
      };
    }

    if (!this.evaluateCondition(node.condition, session.context)) {
      if (node.next) {
        session.currentNodeId = node.next;
        return this.getCurrentNode(sessionId);
      }

      this.endDialogue(sessionId, "condition_failed");

      return {
        success: false,
        reason: "condition_failed"
      };
    }

    this.executeAction(
      node.action,
      session,
      node.id
    );

    const availableChoices = node.choices.filter(choice =>
      this.evaluateCondition(choice.condition, session.context)
    );

    const result = {
      success: true,
      sessionId,
      npc: this.getNPC(session.npcId),
      node: {
        id: node.id,
        speaker: node.speaker || this.npcs.get(session.npcId)?.name,
        text: node.text,
        choices: availableChoices.map(choice => ({
          id: choice.id,
          text: choice.text
        })),
        end: node.end
      }
    };

    this.emit("dialogue:node", result);

    if (
      node.end &&
      availableChoices.length === 0 &&
      !node.next
    ) {
      this.endDialogue(sessionId, "finished");
    }

    return result;
  }

  // ========================================
  // ESCOLHER RESPOSTA
  // ========================================

  choose(sessionId, choiceId) {
    const session = this.sessions.get(sessionId);

    if (!session || !session.active) {
      return {
        success: false,
        reason: "session_not_active"
      };
    }

    const dialogue = this.dialogues.get(session.dialogueId);
    const node = dialogue?.nodes[session.currentNodeId];

    if (!node) {
      return {
        success: false,
        reason: "node_not_found"
      };
    }

    const choice = node.choices.find(
      item => item.id === choiceId
    );

    if (!choice) {
      return {
        success: false,
        reason: "choice_not_found"
      };
    }

    if (!this.evaluateCondition(choice.condition, session.context)) {
      return {
        success: false,
        reason: "condition_not_met"
      };
    }

    this.addHistory(session, {
      nodeId: node.id,
      choiceId: choice.id,
      choiceText: choice.text,
      timestamp: Date.now()
    });

    this.executeAction(
      choice.action,
      session,
      node.id
    );

    this.emit("dialogue:choice", {
      sessionId,
      npcId: session.npcId,
      choiceId,
      text: choice.text
    });

    if (!choice.next) {
      this.endDialogue(sessionId, "choice_finished");

      return {
        success: true,
        ended: true
      };
    }

    session.currentNodeId = choice.next;

    return this.getCurrentNode(sessionId);
  }

  // ========================================
  // AVANÇAR SEM ESCOLHAS
  // ========================================

  continueDialogue(sessionId) {
    const session = this.sessions.get(sessionId);

    if (!session || !session.active) {
      return {
        success: false,
        reason: "session_not_active"
      };
    }

    const dialogue = this.dialogues.get(session.dialogueId);
    const node = dialogue?.nodes[session.currentNodeId];

    if (!node) {
      return {
        success: false,
        reason: "node_not_found"
      };
    }

    if (node.choices.length > 0) {
      return {
        success: false,
        reason: "choices_required"
      };
    }

    this.addHistory(session, {
      nodeId: node.id,
      text: node.text,
      timestamp: Date.now()
    });

    if (!node.next) {
      this.endDialogue(sessionId, "finished");

      return {
        success: true,
        ended: true
      };
    }

    session.currentNodeId = node.next;

    return this.getCurrentNode(sessionId);
  }

  // ========================================
  // AÇÕES
  // ========================================

  executeAction(action, session, nodeId) {
    if (!action || typeof action.type !== "string") {
      return;
    }

    // O sistema emite eventos. O jogo decide como executar
    // ações reais, como iniciar uma missão ou entregar itens.
    this.emit("dialogue:action", {
      sessionId: session.id,
      npcId: session.npcId,
      nodeId,
      action: { ...action },
      context: session.context
    });
  }

  // ========================================
  // HISTÓRICO
  // ========================================

  addHistory(session, entry) {
    session.history.push(entry);

    if (session.history.length > this.maxHistory) {
      session.history.shift();
    }
  }

  getHistory(sessionId) {
    const session = this.sessions.get(sessionId);

    if (!session) return [];

    return session.history.map(entry => ({ ...entry }));
  }

  getActiveSessions() {
    return [...this.sessions.values()]
      .filter(session => session.active)
      .map(session => ({
        id: session.id,
        npcId: session.npcId,
        dialogueId: session.dialogueId,
        currentNodeId: session.currentNodeId,
        startedAt: session.startedAt
      }));
  }
}

export default DialogueSystem;
