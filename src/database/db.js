const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../../data');
const dbFile = path.join(dbPath, 'game.db');

// Ensure data directory exists
if (!fs.existsSync(dbPath)) {
  fs.mkdirSync(dbPath, { recursive: true });
}

let db;

function initDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbFile, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }
      
      // Create tables
      db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS players (
          username TEXT PRIMARY KEY,
          data TEXT
        )`, (err) => {
          if (err) {
            reject(err);
            return;
          }
        });
        
        db.run(`CREATE TABLE IF NOT EXISTS wild_cigarettes (
          id TEXT PRIMARY KEY,
          data TEXT,
          spawn_time INTEGER
        )`, (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    });
  });
}

function getPlayer(username) {
  return new Promise((resolve, reject) => {
    db.get('SELECT data FROM players WHERE username = ?', [username], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row ? JSON.parse(row.data) : null);
    });
  });
}

function savePlayer(player) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(player);
    db.run(
      'INSERT OR REPLACE INTO players (username, data) VALUES (?, ?)',
      [player.username, data],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function getWildCigarette(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT data FROM wild_cigarettes WHERE id = ?', [id], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row ? JSON.parse(row.data) : null);
    });
  });
}

module.exports = {
  initDatabase,
  getPlayer,
  savePlayer,
  getWildCigarette
};

