const BattleSystem = require('./BattleSystem');
const Cigarette = require('./Cigarette');
const { getPlayer, savePlayer, getWildCigarette } = require('../database/db');

class GameEngine {
  constructor(io) {
    this.io = io;
    this.players = new Map(); // socketId -> player data
    this.battles = new Map(); // socketId -> BattleSystem
    this.worldState = {
      wildCigarettes: [],
      players: []
    };
    
    // Spawn wild cigarettes periodically
    this.spawnWildCigarettes();
    setInterval(() => this.spawnWildCigarettes(), 30000); // Every 30 seconds
  }
  
  async addPlayer(socketId, playerData) {
    const player = await getPlayer(playerData.username) || {
      username: playerData.username,
      cigarettes: this.generateStarterCigarette(),
      position: { x: 0, y: 0 },
      level: 1
    };
    
    this.players.set(socketId, {
      ...player,
      socketId,
      currentCigarette: player.cigarettes[0] || null
    });
    
    this.io.to(socketId).emit('player:joined', player);
    this.broadcastWorldState();
  }
  
  generateStarterCigarette() {
    const starters = [
      { name: 'Camel Filter', type: 'Filter' },
      { name: 'Camel Menthol', type: 'Menthol' },
      { name: 'Camel Light', type: 'Light' }
    ];
    const starter = starters[Math.floor(Math.random() * starters.length)];
    const cigarette = new Cigarette({
      name: starter.name,
      type: starter.type,
      level: 5
    });
    return [cigarette.toJSON()];
  }
  
  handlePlayerMove(socketId, data) {
    const player = this.players.get(socketId);
    if (!player) return;
    
    player.position = data.position;
    this.broadcastWorldState();
  }
  
  async startBattle(socketId, wildCigaretteId) {
    const player = this.players.get(socketId);
    if (!player || !player.currentCigarette) return;
    
    const wildCig = this.worldState.wildCigarettes.find(wc => wc.id === wildCigaretteId) || this.generateWildCigarette();
    const battle = new BattleSystem(player.currentCigarette, wildCig);
    battle.determineTurnOrder();
    
    this.battles.set(socketId, {
      battle,
      wildCigarette: wildCig
    });
    
    this.io.to(socketId).emit('battle:started', {
      playerCigarette: player.currentCigarette,
      wildCigarette: wildCig
    });
  }
  
  handleBattleAction(socketId, action) {
    const battleData = this.battles.get(socketId);
    if (!battleData) return;
    
    const { battle, wildCigarette } = battleData;
    const player = this.players.get(socketId);
    
    // Player turn
    const playerMove = player.currentCigarette.moves.find(m => m.id === action.moveId);
    if (playerMove) {
      const result = battle.executeMove('player', 'wild', playerMove);
      this.io.to(socketId).emit('battle:update', result);
      
      if (battle.isBattleOver()) {
        this.endBattle(socketId);
        return;
      }
    }
    
    // Wild cigarette turn
    const wildMove = battle.getWildMove();
    const wildResult = battle.executeMove('wild', 'player', wildMove);
    this.io.to(socketId).emit('battle:update', wildResult);
    
    if (battle.isBattleOver()) {
      this.endBattle(socketId);
    }
  }
  
  async endBattle(socketId) {
    const battleData = this.battles.get(socketId);
    if (!battleData) return;
    
    const { battle } = battleData;
    const player = this.players.get(socketId);
    
    const winner = battle.getWinner();
    const rewards = battle.calculateRewards();
    
    if (winner === 'player' && rewards) {
      // Update player's cigarette
      const updatedCig = battle.playerCigarette.toJSON();
      player.currentCigarette = updatedCig;
      player.cigarettes = player.cigarettes.map(c => 
        c.id === updatedCig.id ? updatedCig : c
      );
      await savePlayer(player);
    }
    
    this.io.to(socketId).emit('battle:ended', {
      winner,
      rewards
    });
    
    this.battles.delete(socketId);
  }
  
  async attemptCatch(socketId, wildCigaretteId) {
    const player = this.players.get(socketId);
    const wildCig = this.worldState.wildCigarettes.find(wc => wc.id === wildCigaretteId);
    
    if (!wildCig) return;
    
    // Catch rate based on wild cigarette HP and level difference
    const catchRate = Math.max(0.1, 1 - (wildCig.hp / wildCig.maxHp) * 0.5);
    const caught = Math.random() < catchRate;
    
    if (caught) {
      player.cigarettes.push(wildCig);
      await savePlayer(player);
      this.io.to(socketId).emit('cigarette:caught', wildCig);
      
      // Remove from world
      this.worldState.wildCigarettes = this.worldState.wildCigarettes.filter(
        wc => wc.id !== wildCigaretteId
      );
      this.broadcastWorldState();
    } else {
      this.io.to(socketId).emit('cigarette:escaped');
    }
  }
  
  generateWildCigarette() {
    const types = ['Filter', 'Menthol', 'Light', 'Full', 'Unfiltered'];
    const names = ['Camel', 'Joe Camel', 'Desert Cigarette', 'Sandstorm Smoke'];
    
    const wildCig = new Cigarette({
      name: names[Math.floor(Math.random() * names.length)] + ' ' + types[Math.floor(Math.random() * types.length)],
      type: types[Math.floor(Math.random() * types.length)],
      level: Math.floor(Math.random() * 10) + 1
    });
    
    return wildCig.toJSON();
  }
  
  spawnWildCigarettes() {
    // Spawn 5-10 wild cigarettes in random locations
    const count = Math.floor(Math.random() * 6) + 5;
    this.worldState.wildCigarettes = [];
    
    for (let i = 0; i < count; i++) {
      const wildCig = this.generateWildCigarette();
      this.worldState.wildCigarettes.push({
        ...wildCig,
        position: {
          x: Math.random() * 1000,
          y: Math.random() * 1000
        }
      });
    }
    
    this.broadcastWorldState();
  }
  
  broadcastWorldState() {
    const worldState = {
      players: Array.from(this.players.values()).map(p => ({
        username: p.username,
        position: p.position
      })),
      wildCigarettes: this.worldState.wildCigarettes
    };
    
    this.io.emit('world:update', worldState);
  }
  
  removePlayer(socketId) {
    this.players.delete(socketId);
    this.battles.delete(socketId);
    this.broadcastWorldState();
  }
}

module.exports = GameEngine;

