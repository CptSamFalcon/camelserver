const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Log server info on startup
console.log('='.repeat(50));
console.log('Camel Game Server');
console.log('='.repeat(50));
console.log(`Server starting on port ${PORT}`);
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
console.log('='.repeat(50));

// Game state - Single persistent lounge
const LOUNGE_ID = 'smokers-lounge'; // Single persistent room
const players = new Map(); // socketId -> { playerId, name, cosmetic, etc }

// Serve static files (optional - if hosting game files)
app.use(express.static('.'));

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  
  // Auto-join persistent lounge
  socket.join(LOUNGE_ID);
  
  // Get current players in lounge
  const currentPlayers = Array.from(players.values()).map(p => ({
    id: p.playerId,
    name: p.name,
    cosmetic: p.selectedCosmetic,
    isHost: false // No host in persistent lounge
  }));
  
  // Send current state to new player
  socket.emit('loungeJoined', {
    players: currentPlayers
  });
  
  // Notify other players
  socket.to(LOUNGE_ID).emit('playerJoined', {
    id: socket.id,
    name: `Player ${socket.id.substr(0, 6)}`,
    cosmetic: null
  });
  
  console.log(`Player ${socket.id} joined Smokers Lounge`);
  
  // Update player info (name/cosmetic)
  socket.on('updatePlayerInfo', (data) => {
    const { playerName, selectedCosmetic } = data;
    
    const player = {
      playerId: socket.id,
      name: playerName || `Player ${socket.id.substr(0, 6)}`,
      selectedCosmetic: selectedCosmetic || null
    };
    
    players.set(socket.id, player);
    
    // Notify all players in lounge
    io.to(LOUNGE_ID).emit('playerUpdated', {
      id: socket.id,
      name: player.name,
      cosmetic: player.selectedCosmetic
    });
    
    // Send updated player list
    const allPlayers = Array.from(players.values()).map(p => ({
      id: p.playerId,
      name: p.name,
      cosmetic: p.selectedCosmetic,
      isHost: false
    }));
    io.to(LOUNGE_ID).emit('loungeUpdate', {
      players: allPlayers
    });
    
    console.log(`${player.name} updated info in Smokers Lounge`);
  });
  
  // Join race - DEPRECATED (removed, using social lobby instead)
  socket.on('joinRace_DEPRECATED', (data) => {
    const { playerName, selectedCosmetic } = data;
    const player = players.get(socket.id);
    
    // If player is already in a race (auto-joined on connect), update their info
    if (player && player.raceId) {
      const race = races.get(player.raceId);
      if (race) {
        const camel = race.camels.find(c => c.playerId === socket.id);
        if (camel) {
          camel.name = playerName || camel.name;
          camel.cosmetic = selectedCosmetic || camel.cosmetic;
        }
        
        const playerData = players.get(socket.id);
        if (playerData) {
          playerData.name = playerName || playerData.name;
          playerData.selectedCosmetic = selectedCosmetic || playerData.selectedCosmetic;
        }
        
        // Notify all players in race
        io.to(race.id).emit('raceUpdate', {
          camels: race.camels,
          status: race.status
        });
        
        console.log(`${playerName} updated info in race ${race.id}`);
        return;
      }
    }
    
    // If not in a race, find or create one
    let race = null;
    for (const [raceId, r] of races.entries()) {
      if (r.status === 'waiting' && r.camels.length < 8) {
        race = r;
        break;
      }
    }
    
    if (!race) {
      const raceId = Math.random().toString(36).substr(2, 8).toUpperCase();
      race = {
        id: raceId,
        hostId: socket.id,
        camels: [],
        bets: new Map(),
        status: 'waiting',
        raceStartTime: null
      };
      races.set(raceId, race);
    }
    
    const camel = {
      playerId: socket.id,
      name: playerName || `Player ${socket.id.substr(0, 6)}`,
      cosmetic: selectedCosmetic || null,
      position: 0,
      speed: 0.5 + Math.random() * 0.5,
      totalBets: 0,
      isHost: race.camels.length === 0
    };
    
    if (camel.isHost) {
      race.hostId = socket.id;
    }
    
    race.camels.push(camel);
    players.set(socket.id, {
      playerId: socket.id,
      raceId: race.id,
      name: camel.name,
      selectedCosmetic: selectedCosmetic || null
    });
    
    socket.join(race.id);
    socket.emit('raceJoined', {
      raceId: race.id,
      isHost: camel.isHost,
      camels: race.camels,
      status: race.status
    });
    
    socket.to(race.id).emit('raceUpdate', {
      camels: race.camels,
      status: race.status
    });
    
    console.log(`${camel.name} joined race ${race.id}`);
  });
  
  // Place bet - DEPRECATED (removed, using social lobby instead)
  socket.on('placeBet_DEPRECATED', (data) => {
    const { camelId, amount } = data;
    const player = players.get(socket.id);
    if (!player || !player.raceId) return;
    
    const race = races.get(player.raceId);
    if (!race) return;
    
    if (race.status !== 'waiting' && race.status !== 'betting') {
      socket.emit('betError', { message: 'Betting is closed' });
      return;
    }
    
    // Store bet
    race.bets.set(socket.id, { camelId, amount });
    
    // Update camel's total bets
    const camel = race.camels.find(c => c.playerId === camelId);
    if (camel) {
      camel.totalBets = (camel.totalBets || 0) + amount;
    }
    
    // Broadcast bet to all players
    io.to(race.id).emit('betPlaced', {
      playerId: socket.id,
      camelId,
      amount
    });
    
    console.log(`Player ${socket.id} bet ${amount} on camel ${camelId}`);
  });
  
  // Start race - DEPRECATED (removed, using social lobby instead)
  socket.on('startRace_DEPRECATED', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.raceId) return;
    
    const race = races.get(player.raceId);
    if (!race || race.hostId !== socket.id) {
      socket.emit('error', { message: 'Only host can start the race' });
      return;
    }
    
    // Allow starting race with just 1 player (solo betting)
    if (race.camels.length < 1) {
      socket.emit('error', { message: 'Need at least 1 player' });
      return;
    }
    
    // Start betting phase
    race.status = 'betting';
    io.to(race.id).emit('raceStarting', { camels: race.camels });
    
    // After 5 seconds, start the race
    setTimeout(() => {
      if (race.status === 'betting') {
        race.status = 'racing';
        race.raceStartTime = Date.now();
        
        // Assign random speeds
        race.camels.forEach(camel => {
          camel.speed = 0.5 + Math.random() * 0.5;
        });
        
        io.to(race.id).emit('raceStarted', { camels: race.camels });
        
        // Race duration: 10 seconds
        setTimeout(() => {
          // Calculate winner (camel with highest position)
          race.camels.forEach(camel => {
            const elapsed = Date.now() - race.raceStartTime;
            const progress = Math.min(1, elapsed / 10000);
            camel.position = progress * camel.speed;
          });
          
          const winner = race.camels.reduce((prev, current) => {
            return (current.position > prev.position) ? current : prev;
          });
          
          // Calculate payouts
          const totalPot = Array.from(race.bets.values()).reduce((sum, bet) => sum + bet.amount, 0);
          const winnerBets = Array.from(race.bets.entries())
            .filter(([playerId, bet]) => bet.camelId === winner.playerId)
            .map(([playerId, bet]) => ({ playerId, amount: bet.amount }));
          
          const winnerTotalBets = winnerBets.reduce((sum, bet) => sum + bet.amount, 0);
          const payouts = new Map();
          
          winnerBets.forEach(({ playerId, amount }) => {
            const payout = Math.floor((amount / winnerTotalBets) * totalPot);
            payouts.set(playerId, payout);
          });
          
          race.status = 'finished';
          io.to(race.id).emit('raceFinished', {
            camels: race.camels,
            winner: winner.playerId,
            payouts: Object.fromEntries(payouts)
          });
          
          // Reset race after 5 seconds
          setTimeout(() => {
            race.status = 'waiting';
            race.camels.forEach(camel => {
              camel.totalBets = 0;
              camel.position = 0;
            });
            race.bets.clear();
            io.to(race.id).emit('raceUpdate', {
              camels: race.camels,
              status: race.status
            });
          }, 5000);
        }, 10000);
      }
    }, 5000);
  });
  
  // Leave race - DEPRECATED (removed, using social lobby instead)
  socket.on('leaveRace_DEPRECATED', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.raceId) return;
    
    const race = races.get(player.raceId);
    if (race) {
      race.camels = race.camels.filter(c => c.playerId !== socket.id);
      race.bets.delete(socket.id);
      
      // If host left, transfer host or close race
      if (race.hostId === socket.id && race.camels.length > 0) {
        race.hostId = race.camels[0].playerId;
        race.camels[0].isHost = true;
      }
      
      // Notify other players
      socket.to(race.id).emit('raceUpdate', {
        camels: race.camels,
        status: race.status
      });
      
      // Close race if empty
      if (race.camels.length === 0) {
        races.delete(race.id);
      }
    }
    
    socket.leave(player.raceId);
    players.delete(socket.id);
  });
  
  // OLD: Create lobby (kept for backward compatibility)
  socket.on('createLobby', (data) => {
    const { hostName, lobbyName, maxPlayers, level } = data;
    const lobbyId = Math.random().toString(36).substr(2, 8).toUpperCase();
    
    const lobby = {
      id: lobbyId,
      hostId: socket.id,
      name: lobbyName,
      maxPlayers: maxPlayers || 4,
      level: level || 'outrun',
      players: [{ id: socket.id, name: hostName, isHost: true }],
      gameState: null,
      gameStarted: false
    };
    
    lobbies.set(lobbyId, lobby);
    players.set(socket.id, {
      playerId: socket.id,
      lobbyId: lobbyId,
      name: hostName,
      x: 0,
      y: 0,
      facingRight: false,
      selectedCosmetic: selectedCosmetic || null
    });
    
    socket.join(lobbyId);
    socket.emit('lobbyCreated', lobby);
    
    // Notify all clients to refresh lobby list
    io.emit('lobbyListUpdate');
    
    console.log(`Lobby created: ${lobbyId} by ${hostName}`);
  });
  
  // List all available lobbies
  socket.on('listLobbies', () => {
    console.log(`Client ${socket.id} requested lobby list`);
    const availableLobbies = Array.from(lobbies.values())
      .filter(lobby => !lobby.gameStarted && lobby.players.length < lobby.maxPlayers)
      .map(lobby => ({
        id: lobby.id,
        name: lobby.name,
        hostName: lobby.players.find(p => p.isHost)?.name || 'Unknown',
        playerCount: lobby.players.length,
        maxPlayers: lobby.maxPlayers,
        level: lobby.level
      }));
    
    console.log(`Sending ${availableLobbies.length} lobbies to ${socket.id}`);
    socket.emit('lobbyList', availableLobbies);
  });
  
  // Join lobby
  socket.on('joinLobby', (data) => {
    const { lobbyId, playerName, selectedCosmetic } = data;
    const lobby = lobbies.get(lobbyId);
    
    if (!lobby) {
      socket.emit('lobbyError', { message: 'Lobby not found' });
      return;
    }
    
    if (lobby.players.length >= lobby.maxPlayers) {
      socket.emit('lobbyError', { message: 'Lobby is full' });
      return;
    }
    
    if (lobby.gameStarted) {
      socket.emit('lobbyError', { message: 'Game already started' });
      return;
    }
    
    lobby.players.push({ id: socket.id, name: playerName, isHost: false });
    players.set(socket.id, {
      playerId: socket.id,
      lobbyId: lobbyId,
      name: playerName,
      x: 0,
      y: 0,
      facingRight: false,
      selectedCosmetic: selectedCosmetic || null
    });
    
    socket.join(lobbyId);
    socket.emit('lobbyJoined', lobby);
    
    // Notify other players (include selected cosmetic if provided)
    const playerData = players.get(socket.id);
    socket.to(lobbyId).emit('playerJoined', { 
      id: socket.id, 
      name: playerName,
      selectedCosmetic: playerData?.selectedCosmetic || null
    });
    io.to(lobbyId).emit('lobbyUpdate', lobby);
    
    // Notify all clients to refresh lobby list
    io.emit('lobbyListUpdate');
    
    console.log(`${playerName} joined lobby ${lobbyId}`);
  });
  
  // Leave lobby
  socket.on('leaveLobby', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.lobbyId) return;
    
    const lobby = lobbies.get(player.lobbyId);
    if (lobby) {
      // Remove player from lobby
      lobby.players = lobby.players.filter(p => p.id !== socket.id);
      
      // If host left, transfer host or close lobby
      if (lobby.hostId === socket.id) {
        if (lobby.players.length > 0) {
          // Transfer host to first player
          lobby.hostId = lobby.players[0].id;
          lobby.players[0].isHost = true;
          io.to(lobby.id).emit('hostTransferred', { newHostId: lobby.hostId });
        } else {
          // Close lobby
          lobbies.delete(lobby.id);
        }
      }
      
      // Notify other players
      socket.to(lobby.id).emit('playerLeft', { playerId: socket.id });
      io.to(lobby.id).emit('lobbyUpdate', lobby);
      
      // Notify all clients to refresh lobby list
      io.emit('lobbyListUpdate');
    }
    
    socket.leave(player.lobbyId);
    players.delete(socket.id);
  });
  
  // Start game
  socket.on('startGame', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    
    const lobby = lobbies.get(player.lobbyId);
    if (!lobby || lobby.hostId !== socket.id) {
      socket.emit('error', { message: 'Only host can start the game' });
      return;
    }
    
    lobby.gameStarted = true;
    io.to(lobby.id).emit('gameStarting', { level: lobby.level });
    
    // Notify all clients to refresh lobby list (game started, no longer available)
    io.emit('lobbyListUpdate');
    
    console.log(`Game started in lobby ${lobby.id}`);
  });
  
  // Player movement
  socket.on('playerMove', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    
    // Update player position
    player.x = data.x;
    player.y = data.y;
    player.facingRight = data.facingRight;
    
    // Broadcast to other players in the same lobby
    socket.to(player.lobbyId).emit('playerMove', {
      playerId: socket.id,
      x: data.x,
      y: data.y,
      facingRight: data.facingRight
    });
  });
  
  // Game state sync (host sends authoritative state)
  socket.on('gameState', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    
    const lobby = lobbies.get(player.lobbyId);
    if (!lobby || lobby.hostId !== socket.id) return; // Only host can send game state
    
    lobby.gameState = data;
    
    // Broadcast to all other players
    socket.to(player.lobbyId).emit('gameState', data);
  });
  
  // Enemy spawn (host only)
  socket.on('enemySpawn', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    
    const lobby = lobbies.get(player.lobbyId);
    if (!lobby || lobby.hostId !== socket.id) return;
    
    socket.to(player.lobbyId).emit('enemySpawn', data);
  });
  
  // Enemy death (host only)
  socket.on('enemyDeath', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    
    const lobby = lobbies.get(player.lobbyId);
    if (!lobby || lobby.hostId !== socket.id) return;
    
    socket.to(player.lobbyId).emit('enemyDeath', data);
  });
  
  // Bullet removed (host only)
  socket.on('bulletRemoved', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    
    const lobby = lobbies.get(player.lobbyId);
    if (!lobby || lobby.hostId !== socket.id) return;
    
    socket.to(player.lobbyId).emit('bulletRemoved', data);
  });
  
  // XP orb picked up (host only)
  socket.on('xpOrbPickedUp', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    
    const lobby = lobbies.get(player.lobbyId);
    if (!lobby || lobby.hostId !== socket.id) return;
    
    socket.to(player.lobbyId).emit('xpOrbPickedUp', data);
  });
  
  // Camel coin picked up (host only)
  socket.on('camelCoinPickedUp', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    
    const lobby = lobbies.get(player.lobbyId);
    if (!lobby || lobby.hostId !== socket.id) return;
    
    socket.to(player.lobbyId).emit('camelCoinPickedUp', data);
  });
  
  // Chat message
  socket.on('chatMessage', (data) => {
    const player = players.get(socket.id);
    if (!player) {
      // If player not registered yet, create a basic entry
      players.set(socket.id, {
        playerId: socket.id,
        name: data.playerName || `Player ${socket.id.substr(0, 6)}`,
        selectedCosmetic: data.cosmetic || null
      });
    }
    
    const playerData = players.get(socket.id);
    
    // Broadcast chat message to all players in lounge
    io.to(LOUNGE_ID).emit('chatMessage', {
      playerName: playerData?.name || data.playerName || 'Unknown',
      message: data.message,
      cosmetic: playerData?.selectedCosmetic || data.cosmetic || null
    });
    
    console.log(`Chat in Smokers Lounge: ${playerData?.name || 'Unknown'}: ${data.message}`);
  });
  
  // Disconnect
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    const player = players.get(socket.id);
    if (player) {
      // Notify other players in lounge
      socket.to(LOUNGE_ID).emit('playerLeft', { playerId: socket.id });
      
      // Send updated player list
      players.delete(socket.id);
      const remainingPlayers = Array.from(players.values()).map(p => ({
        id: p.playerId,
        name: p.name,
        cosmetic: p.selectedCosmetic,
        isHost: false
      }));
      io.to(LOUNGE_ID).emit('loungeUpdate', {
        players: remainingPlayers
      });
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Game server running on port ${PORT}`);
  console.log(`Players can connect to: http://localhost:${PORT}`);
  console.log(`Or use: http://YOUR_SERVER_IP:${PORT}`);
});

