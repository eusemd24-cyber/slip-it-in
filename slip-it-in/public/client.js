const socket = io();

let currentRoom = null;
let isHost = false;

const screens = {
  login: document.getElementById('login-screen'),
  lobby: document.getElementById('lobby-screen'),
  submission: document.getElementById('submission-screen'),
  game: document.getElementById('game-screen')
};

function showScreen(screenName) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[screenName].classList.add('active');
}

document.getElementById('create-btn').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim();
  if (!name) return alert('Please enter your name.');
  socket.emit('createRoom', { name });
});

document.getElementById('join-btn').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim();
  const roomCode = document.getElementById('room-code-input').value.trim();
  if (!name || !roomCode) return alert('Please enter both name and room code.');
  socket.emit('joinRoom', { name, roomCode });
});

document.getElementById('setting-mode').addEventListener('change', updateHostSettings);
document.getElementById('setting-handsize').addEventListener('change', updateHostSettings);

function updateHostSettings() {
  if (!isHost) return;
  const mode = document.getElementById('setting-mode').value;
  const handSize = document.getElementById('setting-handsize').value;
  socket.emit('updateSettings', { roomCode: currentRoom, mode, handSize });
}

document.getElementById('start-game-btn').addEventListener('click', () => {
  socket.emit('initiateGame', { roomCode: currentRoom });
});

document.getElementById('submit-words-btn').addEventListener('click', () => {
  const inputs = document.querySelectorAll('.custom-word-input');
  const words = Array.from(inputs).map(i => i.value.trim()).filter(w => w !== '');
  
  if (words.length === 0) return alert('Please enter at least one word!');
  
  socket.emit('submitCustomWords', { roomCode: currentRoom, words });
  document.getElementById('submission-status').innerText = "Submitted! Waiting for other players...";
  document.getElementById('submit-words-btn').disabled = true;
});

socket.on('errorMsg', (msg) => alert(msg));

socket.on('roomJoined', (data) => {
  currentRoom = data.roomCode;
  isHost = data.isHost;
  document.getElementById('display-room-code').innerText = currentRoom;

  if (isHost) {
    document.getElementById('host-settings').classList.remove('hidden');
    document.getElementById('start-game-btn').classList.remove('hidden');
    document.getElementById('waiting-msg').classList.add('hidden');
  }

  showScreen('lobby');
});

socket.on('updateGameState', (game) => {
  if (game.state === 'lobby') {
    showScreen('lobby');
    renderLobby(game);
  } else if (game.state === 'submitting') {
    showScreen('submission');
  } else if (game.state === 'playing') {
    showScreen('game');
    renderGame(game);
  }
});

function renderLobby(game) {
  const playerList = document.getElementById('player-list');
  playerList.innerHTML = '';
  Object.values(game.players).forEach(p => {
    const li = document.createElement('li');
    li.innerText = `${p.name} ${game.hostId === socket.id ? '(Host)' : ''}`;
    playerList.appendChild(li);
  });
}

function renderGame(game) {
  const myPlayer = game.players[socket.id];
  document.getElementById('remaining-deck').innerText = game.wordPool.length;

  const cardsContainer = document.getElementById('cards-container');
  cardsContainer.innerHTML = '';

  if (myPlayer.hand.length === 0) {
    cardsContainer.innerHTML = '<p style="text-align:center;">You have no active cards left!</p>';
  } else {
    myPlayer.hand.forEach((word, index) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-text">"${word}"</div>
        <div class="card-actions">
          <button class="btn-success" onclick="markCard(${index}, 'success')">Slipped It In! (+1)</button>
          <button class="btn-fail" onclick="markCard(${index}, 'fail')">Discard / Failed</button>
        </div>
      `;
      cardsContainer.appendChild(card);
    });
  }

  const scoreboard = document.getElementById('scoreboard');
  scoreboard.innerHTML = '';
  const sortedPlayers = Object.values(game.players).sort((a, b) => b.score - a.score);

  sortedPlayers.forEach(p => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${p.name}</span> <strong>${p.score} pts</strong>`;
    scoreboard.appendChild(li);
  });
}

window.markCard = (wordIndex, outcome) => {
  socket.emit('markWord', { roomCode: currentRoom, wordIndex, outcome });
};
