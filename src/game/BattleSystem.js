const Cigarette = require('./Cigarette');

class BattleSystem {
  constructor(playerCigarette, wildCigarette) {
    this.playerCigarette = new Cigarette(playerCigarette);
    this.wildCigarette = new Cigarette(wildCigarette);
    this.turnOrder = [];
    this.battleLog = [];
  }
  
  determineTurnOrder() {
    if (this.playerCigarette.speed >= this.wildCigarette.speed) {
      this.turnOrder = ['player', 'wild'];
    } else {
      this.turnOrder = ['wild', 'player'];
    }
  }
  
  executeMove(attacker, defender, move) {
    const attackerCig = attacker === 'player' ? this.playerCigarette : this.wildCigarette;
    const defenderCig = defender === 'player' ? this.playerCigarette : this.wildCigarette;
    
    let damage = 0;
    let effect = null;
    
    if (move.effect === 'defense_up') {
      defenderCig.defense += 5;
      effect = 'defense_up';
    } else {
      damage = move.damage + Math.floor(attackerCig.attack * 0.5);
      const actualDamage = defenderCig.takeDamage(damage);
      damage = actualDamage;
    }
    
    this.battleLog.push({
      attacker,
      move: move.name,
      damage,
      effect,
      attackerHp: attackerCig.hp,
      defenderHp: defenderCig.hp
    });
    
    return {
      damage,
      effect,
      attackerHp: attackerCig.hp,
      defenderHp: defenderCig.hp,
      isDefeated: defenderCig.hp <= 0
    };
  }
  
  getWildMove() {
    const moves = this.wildCigarette.moves;
    return moves[Math.floor(Math.random() * moves.length)];
  }
  
  isBattleOver() {
    return this.playerCigarette.hp <= 0 || this.wildCigarette.hp <= 0;
  }
  
  getWinner() {
    if (this.playerCigarette.hp > 0 && this.wildCigarette.hp <= 0) return 'player';
    if (this.wildCigarette.hp > 0 && this.playerCigarette.hp <= 0) return 'wild';
    return null;
  }
  
  calculateRewards() {
    if (this.getWinner() === 'player') {
      const expGain = Math.floor(this.wildCigarette.level * 15);
      const levelUpData = this.playerCigarette.gainExperience(expGain);
      return {
        experience: expGain,
        levelUp: levelUpData !== null,
        levelUpData: levelUpData
      };
    }
    return null;
  }
}

module.exports = BattleSystem;

