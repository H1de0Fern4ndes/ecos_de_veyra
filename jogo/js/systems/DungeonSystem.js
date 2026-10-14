// js/systems/DungeonSystem.js

export class DungeonSystem {
  constructor(options = {}) {
    this.dungeons = new Map();
    this.instances = new Map();
    this.listeners = new Map();

    this.maxActiveDungeons = Math.max(
      1,
      Number(options.maxActiveDungeons) || 3
    );

    this.nextInstanceId = 1;
  }

  // =====================================
  // EVENTOS
  // =====================================

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
        console.error(
          `[DungeonSystem] Erro no evento "${eventName}":`,
          error
        );
      }
    }
  }

  // =====================================
  // CADASTRO DE DUNGEONS
  // =====================================

  registerDungeon(dungeonId, config = {}) {
    if (!dungeonId) {
      throw new Error("A dungeon precisa de um ID.");
    }

    const rooms = Array.isArray(config.rooms)
      ? config.rooms.map((room, index) => ({
          id: room.id ?? `room_${index + 1}`,
          name: room.name ?? `Sala ${index + 1}`,
          type: room.type ?? "combat",
          enemies: Array.isArray(room.enemies)
            ? room.enemies.map(enemy => ({ ...enemy }))
            : [],
          loot: Array.isArray(room.loot)
            ? room.loot.map(item => ({ ...item }))
            : [],
          checkpoint: Boolean(room.checkpoint),
          required: room.required !== false,
          nextRooms: Array.isArray(room.nextRooms)
            ? [...room.nextRooms]
            : [],
          metadata: { ...(room.metadata ?? {}) }
        }))
      : [];

    if (rooms.length === 0) {
      throw new Error(
        `A dungeon "${dungeonId}" precisa ter pelo menos uma sala.`
      );
    }

    const roomIds = new Set();

    for (const room of rooms) {
      if (roomIds.has(room.id)) {
        throw new Error(
          `ID de sala duplicado "${room.id}" na dungeon "${dungeonId}".`
        );
      }

      roomIds.add(room.id);
    }

    for (const room of rooms) {
      for (const nextRoomId of room.nextRooms) {
        if (!roomIds.has(nextRoomId)) {
          throw new Error(
            `A sala "${room.id}" aponta para a sala inexistente "${nextRoomId}".`
          );
        }
      }
    }

    const entryRoomId = config.entryRoomId ?? rooms[0].id;

    if (!roomIds.has(entryRoomId)) {
      throw new Error(
        `A sala inicial "${entryRoomId}" não existe.`
      );
    }

    const dungeon = {
      id: dungeonId,
      name: config.name ?? dungeonId,
      description: config.description ?? "",
      recommendedLevel: Math.max(
        1,
        Number(config.recommendedLevel) || 1
      ),
      entryRoomId,
      rooms,
      rewards: {
        experience: Math.max(
          0,
          Number(config.rewards?.experience) || 0
        ),
        gold: Math.max(
          0,
          Number(config.rewards?.gold) || 0
        ),
        items: Array.isArray(config.rewards?.items)
          ? config.rewards.items.map(item => ({ ...item }))
          : []
      },
      repeatable: config.repeatable !== false,
      metadata: { ...(config.metadata ?? {}) }
    };

    this.dungeons.set(dungeonId, dungeon);

    this.emit("dungeon:registered", {
      dungeonId,
      roomCount: rooms.length
    });

    return this.getDungeon(dungeonId);
  }

  getDungeon(dungeonId) {
    const dungeon = this.dungeons.get(dungeonId);

    return dungeon ? this.clone(dungeon) : null;
  }

  getRoom(dungeonId, roomId) {
    const dungeon = this.dungeons.get(dungeonId);

    if (!dungeon) return null;

    const room = dungeon.rooms.find(item => item.id === roomId);

    return room ? this.clone(room) : null;
  }

  listDungeons() {
    return [...this.dungeons.values()].map(dungeon => ({
      id: dungeon.id,
      name: dungeon.name,
      description: dungeon.description,
      recommendedLevel: dungeon.recommendedLevel,
      roomCount: dungeon.rooms.length,
      repeatable: dungeon.repeatable
    }));
  }

  // =====================================
  // INICIAR UMA DUNGEON
  // =====================================

  startDungeon(dungeonId, options = {}) {
    const dungeon = this.dungeons.get(dungeonId);

    if (!dungeon) {
      return {
        success: false,
        reason: "dungeon_not_found"
      };
    }

    const activeCount = [...this.instances.values()].filter(
      instance =>
        instance.status === "active" &&
        instance.playerId === (options.playerId ?? "player")
    ).length;

    if (activeCount >= this.maxActiveDungeons) {
      return {
        success: false,
        reason: "active_limit_reached"
      };
    }

    const previousRuns = [...this.instances.values()].filter(
      instance =>
        instance.dungeonId === dungeonId &&
        instance.playerId === (options.playerId ?? "player")
    );

    if (!dungeon.repeatable && previousRuns.some(
      instance => instance.status === "completed"
    )) {
      return {
        success: false,
        reason: "already_completed"
      };
    }

    const instanceId = `dungeon_${this.nextInstanceId++}`;
    const playerId = options.playerId ?? "player";

    const instance = {
      instanceId,
      dungeonId,
      playerId,
      status: "active",
      currentRoomId: dungeon.entryRoomId,
      visitedRooms: [],
      clearedRooms: [],
      defeatedEnemies: [],
      collectedLoot: [],
      unlockedRooms: [dungeon.entryRoomId],
      completedObjectives: [],
      checkpointRoomId: dungeon.entryRoomId,
      startedAt: Date.now(),
      completedAt: null,
      rewardsClaimed: false,
      metadata: { ...(options.metadata ?? {}) }
    };

    this.instances.set(instanceId, instance);

    this.enterRoom(instanceId, dungeon.entryRoomId);

    this.emit("dungeon:started", {
      instanceId,
      dungeonId,
      playerId
    });

    return {
      success: true,
      instanceId,
      dungeonId,
      currentRoomId: instance.currentRoomId
    };
  }

  // =====================================
  // INSTÂNCIAS
  // =====================================

  getInstance(instanceId) {
    const instance = this.instances.get(instanceId);

    return instance ? this.clone(instance) : null;
  }

  getActiveInstances(playerId = null) {
    return [...this.instances.values()]
      .filter(instance =>
        instance.status === "active" &&
        (playerId === null || instance.playerId === playerId)
      )
      .map(instance => this.clone(instance));
  }

  getCurrentRoom(instanceId) {
    const instance = this.instances.get(instanceId);

    if (!instance) return null;

    return this.getRoom(
      instance.dungeonId,
      instance.currentRoomId
    );
  }

  // =====================================
  // SALAS E PROGRESSÃO
  // =====================================

  enterRoom(instanceId, roomId) {
    const instance = this.instances.get(instanceId);

    if (!instance || instance.status !== "active") {
      return {
        success: false,
        reason: "instance_not_active"
      };
    }

    const dungeon = this.dungeons.get(instance.dungeonId);
    const room = dungeon?.rooms.find(item => item.id === roomId);

    if (!room) {
      return {
        success: false,
        reason: "room_not_found"
      };
    }

    if (!instance.unlockedRooms.includes(roomId)) {
      return {
        success: false,
        reason: "room_locked"
      };
    }

    if (
      instance.currentRoomId &&
      instance.currentRoomId !== roomId
    ) {
      const currentRoom = dungeon.rooms.find(
        item => item.id === instance.currentRoomId
      );

      if (
        currentRoom?.type === "combat" &&
        !instance.clearedRooms.includes(currentRoom.id)
      ) {
        return {
          success: false,
          reason: "current_room_not_cleared"
        };
      }
    }

    instance.currentRoomId = roomId;

    if (!instance.visitedRooms.includes(roomId)) {
      instance.visitedRooms.push(roomId);
    }

    if (room.checkpoint) {
      instance.checkpointRoomId = roomId;

      this.emit("dungeon:checkpoint", {
        instanceId,
        roomId
      });
    }

    this.emit("room:entered", {
      instanceId,
      dungeonId: instance.dungeonId,
      room: this.clone(room)
    });

    return {
      success: true,
      room: this.clone(room)
    };
  }

  unlockRoom(instanceId, roomId) {
    const instance = this.instances.get(instanceId);

    if (!instance || instance.status !== "active") {
      return false;
    }

    const dungeon = this.dungeons.get(instance.dungeonId);
    const roomExists = dungeon?.rooms.some(
      room => room.id === roomId
    );

    if (!roomExists) return false;

    if (instance.unlockedRooms.includes(roomId)) {
      return true;
    }

    instance.unlockedRooms.push(roomId);

    this.emit("room:unlocked", {
      instanceId,
      roomId
    });

    return true;
  }

  unlockNextRooms(instanceId, roomId = null) {
    const instance = this.instances.get(instanceId);

    if (!instance || instance.status !== "active") {
      return [];
    }

    const dungeon = this.dungeons.get(instance.dungeonId);
    const sourceRoomId = roomId ?? instance.currentRoomId;

    const room = dungeon?.rooms.find(
      item => item.id === sourceRoomId
    );

    if (!room) return [];

    const unlocked = [];

    for (const nextRoomId of room.nextRooms) {
      if (this.unlockRoom(instanceId, nextRoomId)) {
        unlocked.push(nextRoomId);
      }
    }

    return unlocked;
  }

  // =====================================
  // INIMIGOS E SALAS CONCLUÍDAS
  // =====================================

  registerEnemyDefeated(instanceId, enemyId) {
    const instance = this.instances.get(instanceId);

    if (!instance || instance.status !== "active") {
      return false;
    }

    if (!enemyId) return false;

    const record = {
      roomId: instance.currentRoomId,
      enemyId
    };

    const alreadyRecorded = instance.defeatedEnemies.some(
      enemy =>
        enemy.roomId === record.roomId &&
        enemy.enemyId === record.enemyId
    );

    if (alreadyRecorded) return false;

    instance.defeatedEnemies.push(record);

    this.emit("dungeon:enemy_defeated", {
      instanceId,
      ...record
    });

    return true;
  }

  clearRoom(instanceId, roomId = null) {
    const instance = this.instances.get(instanceId);

    if (!instance || instance.status !== "active") {
      return false;
    }

    const dungeon = this.dungeons.get(instance.dungeonId);
    const targetRoomId = roomId ?? instance.currentRoomId;
    const room = dungeon?.rooms.find(
      item => item.id === targetRoomId
    );

    if (!room) return false;

    if (!instance.clearedRooms.includes(targetRoomId)) {
      instance.clearedRooms.push(targetRoomId);
    }

    this.emit("room:cleared", {
      instanceId,
      roomId: targetRoomId
    });

    const nextRooms = this.unlockNextRooms(
      instanceId,
      targetRoomId
    );

    if (this.areRequiredRoomsCleared(instanceId)) {
      this.emit("dungeon:ready_to_complete", {
        instanceId,
        dungeonId: instance.dungeonId
      });
    }

    return {
      success: true,
      roomId: targetRoomId,
      unlockedRooms: nextRooms
    };
  }

  areRequiredRoomsCleared(instanceId) {
    const instance = this.instances.get(instanceId);

    if (!instance) return false;

    const dungeon = this.dungeons.get(instance.dungeonId);

    if (!dungeon) return false;

    const requiredRooms = dungeon.rooms.filter(
      room => room.required
    );

    return requiredRooms.every(
      room => instance.clearedRooms.includes(room.id)
    );
  }

  // =====================================
  // OBJETIVOS
  // =====================================

  completeObjective(instanceId, objectiveId) {
    const instance = this.instances.get(instanceId);

    if (!instance || instance.status !== "active") {
      return false;
    }

    if (!objectiveId) return false;

    if (instance.completedObjectives.includes(objectiveId)) {
      return false;
    }

    instance.completedObjectives.push(objectiveId);

    this.emit("dungeon:objective_completed", {
      instanceId,
      objectiveId
    });

    return true;
  }

  // =====================================
  // LOOT
  // =====================================

  collectLoot(instanceId, lootId) {
    const instance = this.instances.get(instanceId);

    if (!instance || instance.status !== "active") {
      return false;
    }

    if (!lootId) return false;

    if (instance.collectedLoot.includes(lootId)) {
      return false;
    }

    instance.collectedLoot.push(lootId);

    this.emit("dungeon:loot_collected", {
      instanceId,
      lootId
    });

    return true;
  }

  getRoomLoot(instanceId, roomId = null) {
    const instance = this.instances.get(instanceId);

    if (!instance) return [];

    const dungeon = this.dungeons.get(instance.dungeonId);
    const targetRoomId = roomId ?? instance.currentRoomId;
    const room = dungeon?.rooms.find(
      item => item.id === targetRoomId
    );

    if (!room) return [];

    return room.loot
      .filter(item => !instance.collectedLoot.includes(item.id))
      .map(item => this.clone(item));
  }

  // =====================================
  // CHECKPOINT E REINÍCIO
  // =====================================

  returnToCheckpoint(instanceId) {
    const instance = this.instances.get(instanceId);

    if (!instance || instance.status !== "active") {
      return {
        success: false,
        reason: "instance_not_active"
      };
    }

    const checkpointRoomId = instance.checkpointRoomId;

    if (!checkpointRoomId) {
      return {
        success: false,
        reason: "checkpoint_not_found"
      };
    }

    instance.currentRoomId = checkpointRoomId;

    this.emit("dungeon:returned_to_checkpoint", {
      instanceId,
      roomId: checkpointRoomId
    });

    return {
      success: true,
      roomId: checkpointRoomId
    };
  }

  // =====================================
  // CONCLUIR DUNGEON
  // =====================================

  completeDungeon(instanceId, options = {}) {
    const instance = this.instances.get(instanceId);

    if (!instance || instance.status !== "active") {
      return {
        success: false,
        reason: "instance_not_active"
      };
    }

    if (
      options.force !== true &&
      !this.areRequiredRoomsCleared(instanceId)
    ) {
      return {
        success: false,
        reason: "required_rooms_remaining"
      };
    }

    const dungeon = this.dungeons.get(instance.dungeonId);

    instance.status = "completed";
    instance.completedAt = Date.now();

    const rewards = this.clone(dungeon.rewards);

    this.emit("dungeon:completed", {
      instanceId,
      dungeonId: instance.dungeonId,
      playerId: instance.playerId,
      rewards
    });

    return {
      success: true,
      instanceId,
      rewards
    };
  }

  claimRewards(instanceId) {
    const instance = this.instances.get(instanceId);

    if (!instance || instance.status !== "completed") {
      return {
        success: false,
        reason: "dungeon_not_completed"
      };
    }

    if (instance.rewardsClaimed) {
      return {
        success: false,
        reason: "rewards_already_claimed"
      };
    }

    const dungeon = this.dungeons.get(instance.dungeonId);

    instance.rewardsClaimed = true;

    const rewards = this.clone(dungeon.rewards);

    this.emit("dungeon:rewards_claimed", {
      instanceId,
      playerId: instance.playerId,
      rewards
    });

    return {
      success: true,
      rewards
    };
  }

  // =====================================
  // ABANDONAR
  // =====================================

  abandonDungeon(instanceId) {
    const instance = this.instances.get(instanceId);

    if (!instance || instance.status !== "active") {
      return false;
    }

    instance.status = "abandoned";

    this.emit("dungeon:abandoned", {
      instanceId,
      dungeonId: instance.dungeonId,
      playerId: instance.playerId
    });

    return true;
  }

  // =====================================
  // SALVAMENTO
  // =====================================

  exportData() {
    return {
      version: 1,
      nextInstanceId: this.nextInstanceId,
      instances: [...this.instances.values()].map(
        instance => this.clone(instance)
      )
    };
  }

  importData(data) {
    if (!data || !Array.isArray(data.instances)) {
      throw new Error("Dados de dungeon inválidos.");
    }

    const restored = new Map();

    for (const saved of data.instances) {
      const dungeon = this.dungeons.get(saved.dungeonId);

      if (!dungeon || !saved.instanceId) continue;

      const roomIds = new Set(
        dungeon.rooms.map(room => room.id)
      );

      if (!roomIds.has(saved.currentRoomId)) continue;

      const validRoomList = value =>
        Array.isArray(value)
          ? [...new Set(value.filter(id => roomIds.has(id)))]
          : [];

      const instance = {
        instanceId: saved.instanceId,
        dungeonId: saved.dungeonId,
        playerId: saved.playerId ?? "player",
        status: [
          "active",
          "completed",
          "abandoned"
        ].includes(saved.status)
          ? saved.status
          : "active",

        currentRoomId: saved.currentRoomId,
        visitedRooms: validRoomList(saved.visitedRooms),
        clearedRooms: validRoomList(saved.clearedRooms),
        unlockedRooms: validRoomList(saved.unlockedRooms),
        checkpointRoomId: roomIds.has(saved.checkpointRoomId)
          ? saved.checkpointRoomId
          : dungeon.entryRoomId,

        defeatedEnemies: Array.isArray(saved.defeatedEnemies)
          ? saved.defeatedEnemies
              .filter(enemy =>
                enemy &&
                roomIds.has(enemy.roomId) &&
                typeof enemy.enemyId === "string"
              )
              .map(enemy => ({ ...enemy }))
          : [],

        collectedLoot: Array.isArray(saved.collectedLoot)
          ? saved.collectedLoot.filter(
              id => typeof id === "string"
            )
          : [],

        completedObjectives: Array.isArray(saved.completedObjectives)
          ? saved.completedObjectives.filter(
              id => typeof id === "string"
            )
          : [],

        startedAt: Number(saved.startedAt) || Date.now(),
        completedAt: Number(saved.completedAt) || null,
        rewardsClaimed: Boolean(saved.rewardsClaimed),
        metadata: { ...(saved.metadata ?? {}) }
      };

      if (!instance.unlockedRooms.includes(instance.currentRoomId)) {
        instance.unlockedRooms.push(instance.currentRoomId);
      }

      restored.set(instance.instanceId, instance);
    }

    this.instances = restored;

    const largestId = [...restored.keys()].reduce(
      (largest, id) => {
        const match = id.match(/^dungeon_(\d+)$/);

        return match
          ? Math.max(largest, Number(match[1]))
          : largest;
      },
      0
    );

    this.nextInstanceId = Math.max(
      Number(data.nextInstanceId) || 1,
      largestId + 1
    );

    this.emit("data:imported", {
      instances: this.instances.size
    });
  }

  // =====================================
  // UTILITÁRIO
  // =====================================

  clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
}

export default DungeonSystem;