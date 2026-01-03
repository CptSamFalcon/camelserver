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

// Game state
const lobbies = new Map(); // lobbyId -> { hostId, players, gameState, etc }
const players = new Map(); // socketId -> { playerId, lobbyId, name, x, y, etc }

// Serve static files (optional - if hosting game files)
app.use(express.static('.'));

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  
  // Create lobby
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
      facingRight: false
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
    const { lobbyId, playerName } = data;
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
      facingRight: false
    });
    
    socket.join(lobbyId);
    socket.emit('lobbyJoined', lobby);
    
    // Notify other players
    socket.to(lobbyId).emit('playerJoined', { id: socket.id, name: playerName });
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
  
  // Disconnect
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    const player = players.get(socket.id);
    if (player) {
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
      }
      
      players.delete(socket.id);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Game server running on port ${PORT}`);
  console.log(`Players can connect to: http://localhost:${PORT}`);
  console.log(`Or use: http://YOUR_SERVER_IP:${PORT}`);
});

