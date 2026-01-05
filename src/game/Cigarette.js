class Cigarette {
  constructor(data) {
    this.id = data.id || this.generateId();
    this.name = data.name;
    this.type = data.type; // e.g., 'Menthol', 'Light', 'Full', 'Filter'
    this.level = data.level || 1;
    this.hp = data.hp || this.calculateHP();
    this.maxHp = this.hp;
    this.attack = data.attack || this.calculateAttack();
    this.defense = data.defense || this.calculateDefense();
    this.speed = data.speed || this.calculateSpeed();
    this.experience = data.experience || 0;
    this.moves = data.moves || this.generateMoves();
  }
  
  generateId() {
    return 'cig_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
  
  calculateHP() {
    return Math.floor(50 + (this.level * 10) + (Math.random() * 20));
  }
  
  calculateAttack() {
    return Math.floor(10 + (this.level * 2) + (Math.random() * 5));
  }
  
  calculateDefense() {
    return Math.floor(5 + (this.level * 1.5) + (Math.random() * 3));
  }
  
  calculateSpeed() {
    return Math.floor(8 + (this.level * 1.2) + (Math.random() * 4));
  }
  
  generateMoves() {
    const movePool = [
      { name: 'Smoke Blast', damage: 20, type: 'normal' },
      { name: 'Nicotine Rush', damage: 15, type: 'speed' },
      { name: 'Tar Slam', damage: 25, type: 'normal' },
      { name: 'Filter Guard', damage: 0, type: 'defense', effect: 'defense_up' },
      { name: 'Ashes Attack', damage: 18, type: 'normal' },
      { name: 'Menthol Freeze', damage: 22, type: 'ice' }
    ];
    
    return movePool
      .sort(() => Math.random() - 0.5)
      .slice(0, 4)
      .map(move => ({ ...move, id: 'move_' + Math.random().toString(36).substr(2, 9) }));
  }
  
  takeDamage(damage) {
    const actualDamage = Math.max(1, damage - this.defense);
    this.hp = Math.max(0, this.hp - actualDamage);
    return actualDamage;
  }
  
  gainExperience(exp) {
    this.experience += exp;
    const expNeeded = this.level * 100;
    if (this.experience >= expNeeded) {
      return this.levelUp();
    }
    return null;
  }
  
  levelUp() {
    this.level++;
    const oldMaxHp = this.maxHp;
    this.maxHp = this.calculateHP();
    this.hp = this.maxHp; // Full heal on level up
    this.attack = this.calculateAttack();
    this.defense = this.calculateDefense();
    this.speed = this.calculateSpeed();
    this.experience = 0;
    return {
      level: this.level,
      hpIncrease: this.maxHp - oldMaxHp
    };
  }
  
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      level: this.level,
      hp: this.hp,
      maxHp: this.maxHp,
      attack: this.attack,
      defense: this.defense,
      speed: this.speed,
      experience: this.experience,
      moves: this.moves
    };
  }
}

module.exports = Cigarette;

