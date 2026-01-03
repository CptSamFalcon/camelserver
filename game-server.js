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
console.log('Camel Game Server - Smokers Lounge');
console.log('='.repeat(50));
console.log(`Server starting on port ${PORT}`);
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
console.log('='.repeat(50));

// Game state - Persistent Smokers Lounge
const SMOKERS_LOUNGE_ID = 'smokers-lounge';
const smokersLounge = {
  id: SMOKERS_LOUNGE_ID,
  players: [],
  status: 'open'
};
const players = new Map(); // socketId -> { playerId, name, cosmetic, x, y, facingRight }

// Serve static files (optional - if hosting game files)
app.use(express.static('.'));

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  
  // Auto-join Smokers Lounge on connect
  const playerName = `Player ${socket.id.substr(0, 6)}`;
  const loungePlayer = {
    id: socket.id,
    name: playerName,
    cosmetic: null,
    x: 2500, // Center of world
    y: 2500,
    facingRight: false
  };
  
  smokersLounge.players.push(loungePlayer);
  players.set(socket.id, {
    playerId: socket.id,
    name: playerName,
    cosmetic: null,
    x: 2500,
    y: 2500,
    facingRight: false
  });
  
  socket.join(SMOKERS_LOUNGE_ID);
  
  // Send current lounge state to new player
  socket.emit('loungeJoined', {
    players: smokersLounge.players,
    status: smokersLounge.status
  });
  
  // Notify other players
  socket.to(SMOKERS_LOUNGE_ID).emit('playerJoined', {
    id: socket.id,
    name: playerName,
    cosmetic: null,
    x: 2500,
    y: 2500,
    facingRight: false
  });
  
  console.log(`${playerName} joined Smokers Lounge`);
  
  // Update player info (name/cosmetic)
  socket.on('updatePlayerInfo', (data) => {
    const { playerName, selectedCosmetic } = data;
    const player = players.get(socket.id);
    const loungePlayer = smokersLounge.players.find(p => p.id === socket.id);
    
    if (player && loungePlayer) {
      if (playerName) {
        player.name = playerName;
        loungePlayer.name = playerName;
      }
      if (selectedCosmetic !== undefined) {
        player.cosmetic = selectedCosmetic;
        loungePlayer.cosmetic = selectedCosmetic;
      }
      
      // Broadcast update to all players
      io.to(SMOKERS_LOUNGE_ID).emit('loungeUpdate', {
        players: smokersLounge.players,
        status: smokersLounge.status
      });
      
      console.log(`Player ${socket.id} updated info: ${playerName || 'unchanged'}, cosmetic: ${selectedCosmetic || 'unchanged'}`);
    }
  });
  
  // Player movement
  socket.on('playerMove', (data) => {
    const player = players.get(socket.id);
    const loungePlayer = smokersLounge.players.find(p => p.id === socket.id);
    
    if (player && loungePlayer) {
      player.x = data.x;
      player.y = data.y;
      player.facingRight = data.facingRight || false;
      
      loungePlayer.x = data.x;
      loungePlayer.y = data.y;
      loungePlayer.facingRight = data.facingRight || false;
      
      // Broadcast to other players
      socket.to(SMOKERS_LOUNGE_ID).emit('playerMove', {
        playerId: socket.id,
        x: data.x,
        y: data.y,
        facingRight: data.facingRight
      });
    }
  });
  
  // Request lounge info
  socket.on('requestLobbyInfo', () => {
    socket.emit('loungeJoined', {
      players: smokersLounge.players,
      status: smokersLounge.status
    });
  });
  
  // Legacy handlers - redirect to Smokers Lounge
  socket.on('createLobby', (data) => {
    socket.emit('loungeJoined', {
      players: smokersLounge.players,
      status: smokersLounge.status
    });
  });
  
  socket.on('joinLobby', (data) => {
    socket.emit('loungeJoined', {
      players: smokersLounge.players,
      status: smokersLounge.status
    });
  });
  
  // Disconnect
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    // Remove from Smokers Lounge
    smokersLounge.players = smokersLounge.players.filter(p => p.id !== socket.id);
    players.delete(socket.id);
    
    // Notify other players
    socket.to(SMOKERS_LOUNGE_ID).emit('playerLeft', { playerId: socket.id });
    io.to(SMOKERS_LOUNGE_ID).emit('loungeUpdate', {
      players: smokersLounge.players,
      status: smokersLounge.status
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Game server running on port ${PORT}`);
  console.log(`Players can connect to: http://localhost:${PORT}`);
  console.log(`Or use: http://YOUR_SERVER_IP:${PORT}`);
});
