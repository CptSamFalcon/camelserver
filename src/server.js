const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { initDatabase } = require('./database/db');
const GameEngine = require('./game/GameEngine');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const gameEngine = new GameEngine(io);

// Initialize database
initDatabase().then(() => {
  console.log('Database initialized');
}).catch(err => {
  console.error('Database initialization failed:', err);
});

// REST API routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  
  socket.on('player:join', async (playerData) => {
    await gameEngine.addPlayer(socket.id, playerData);
  });
  
  socket.on('player:move', (data) => {
    gameEngine.handlePlayerMove(socket.id, data);
  });
  
  socket.on('battle:start', (data) => {
    gameEngine.startBattle(socket.id, data);
  });
  
  socket.on('battle:action', (data) => {
    gameEngine.handleBattleAction(socket.id, data);
  });
  
  socket.on('cigarette:catch', (data) => {
    gameEngine.attemptCatch(socket.id, data);
  });
  
  socket.on('disconnect', () => {
    gameEngine.removePlayer(socket.id);
    console.log('Player disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

