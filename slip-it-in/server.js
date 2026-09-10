const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const DEFAULT_WORDS = require('./words');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const games = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function shuffleArray(array) {
  return array.sort(() => Math.random() - 0.5);
}

// Function to pad any word pool up to at least 50 words using default words
function padWordPool(pool, minSize = 50) {
  let padded = [...pool];
  if (padded.length >= minSize) return padded;

  let availableDefaults = shuffleArray([...DEFAULT_WORDS]);
  while (padded.length < minSize) {
    if (availableDefaults.length === 0) {
      availableDefaults = shuffleArray([...DEFAULT_WORDS]);
    }
    padded.push(availableDefaults.pop());
  }
  return padded;
}

io.on('connection', (socket) => {
  socket.on('createRoom', ({ name }) => {
    let roomCode = generateRoomCode();
    while (games[roomCode]) roomCode = generateRoomCode();

    games[roomCode] = {
      code: roomCode,
      hostId: socket.id,
      state: 'lobby',
      settings: { mode: 'default', handSize: 4 },
      players: {
        [socket.id]: { name, score: 0, hand: [], submittedWords: [], ready: false }
      },
      wordPool: []
    };

    socket.join(roomCode);
    socket.emit('roomJoined', { roomCode, isHost: true });
    io.to(roomCode).emit('updateGameState', games[roomCode]);
  });

  socket.on('joinRoom', ({ name, roomCode }) => {
    const code = roomCode.toUpperCase();
    const game = games[code];

    if (!game) {
      socket.emit('errorMsg', 'Room not found.');
      return;
    }
    if (game.state !== 'lobby') {
      socket.emit('errorMsg', 'Game has already started.');
      return;
    }

    game.players[socket.id] = { name, score: 0, hand: [], submittedWords: [], ready: false };
    socket.join(code);
    socket.emit('roomJoined', { roomCode: code, isHost: false });
    io.to(code).emit('updateGameState', game);
  });

  socket.on('updateSettings', ({ roomCode, mode, handSize }) => {
    const game = games[roomCode];
    if (!game || game.hostId !== socket.id) return;

    game.settings.mode = mode;
    game.settings.handSize = parseInt(handSize, 10) || 4;
    io.to(roomCode).emit('updateGameState', game);
  });

  socket.on('initiateGame', ({ roomCode }) => {
    const game = games[roomCode];
    if (!game || game.hostId !== socket.id) return;

    if (game.settings.mode === 'custom') {
      game.state = 'submitting';
      io.to(roomCode).emit('updateGameState', game);
    } else {
      startGame(roomCode, [...DEFAULT_WORDS]);
    }
  });

  socket.on('submitCustomWords', ({ roomCode, words }) => {
    const game = games[roomCode];
    if (!game || !game.players[socket.id]) return;

    game.players[socket.id].submittedWords = words.filter(w => w.trim() !== '');
    game.players[socket.id].ready = true;

    const allReady = Object.values(game.players).every(p => p.ready);
    if (allReady) {
      let combinedWords = [];
      Object.values(game.players).forEach(p => {
        combinedWords = combinedWords.concat(p.submittedWords);
      });
      startGame(roomCode, combinedWords);
    } else {
      io.to(roomCode).emit('updateGameState', game);
    }
  });

  function startGame(roomCode, pool) {
    const game = games[roomCode];
    if (!game) return;

    // Pad pool to ensure at least 50 words total, then shuffle
    const paddedPool = padWordPool(pool, 50);
    game.wordPool = shuffleArray(paddedPool);
    game.state = 'playing';

    Object.keys(game.players).forEach(pId => {
      game.players[pId].hand = [];
      for (let i = 0; i < game.settings.handSize; i++) {
        if (game.wordPool.length > 0) {
          game.players[pId].hand.push(game.wordPool.pop());
        }
      }
    });

    io.to(roomCode).emit('updateGameState', game);
  }

  socket.on('markWord', ({ roomCode, wordIndex, outcome }) => {
    const game = games[roomCode];
    if (!game || game.state !== 'playing') return;

    const player = game.players[socket.id];
    if (!player || wordIndex < 0 || wordIndex >= player.hand.length) return;

    if (outcome === 'success') {
      player.score += 1;
    }

    if (game.wordPool.length > 0) {
      player.hand[wordIndex] = game.wordPool.pop();
    } else {
      player.hand.splice(wordIndex, 1);
    }

    io.to(roomCode).emit('updateGameState', game);
  });

  socket.on('disconnect', () => {
    for (const roomCode in games) {
      const game = games[roomCode];
      if (game.players[socket.id]) {
        delete game.players[socket.id];
        if (Object.keys(game.players).length === 0) {
          delete games[roomCode];
        } else {
          if (game.hostId === socket.id) {
            game.hostId = Object.keys(game.players)[0];
          }
          io.to(roomCode).emit('updateGameState', game);
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
