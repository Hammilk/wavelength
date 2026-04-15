import {
  clamp,
  DEFAULT_ROUNDS,
  makeCode,
  MAX_SCORE_PER_PUZZLE,
  PUZZLES_PER_PLAYER,
  randomInt,
  scoreGuess,
  SPECTRA,
  shuffle,
} from '../lib/shared.js';
import { loadRooms, saveRooms } from './persistence.js';

const rooms = new Map();

function id(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sanitizeRoom(rawRoom) {
  const room = deepClone(rawRoom);
  room.players = room.players.map((player) => ({
    ...player,
    socketId: null,
  }));
  return room;
}

function hydrateRooms() {
  const loaded = loadRooms();
  for (const room of loaded) {
    room.players = (room.players || []).map((player) => ({
      ...player,
      socketId: null,
      connected: false,
    }));
    rooms.set(room.code, room);
  }
}

hydrateRooms();

function persist() {
  saveRooms(Array.from(rooms.values()).map(sanitizeRoom));
}

function createEmptyScoreboard() {
  return {
    total: 0,
    solvedPuzzles: 0,
    maxPossible: 0,
    rounds: [],
  };
}

function normalizeName(name) {
  return String(name || '').trim().slice(0, 30);
}

function makePuzzle(ownerId, slot, usedSpectra) {
  const available = SPECTRA.filter((pair) => !usedSpectra.has(pair.join('|')));
  const source = available.length > 0 ? available : SPECTRA;
  const selected = source[Math.floor(Math.random() * source.length)];
  usedSpectra.add(selected.join('|'));

  return {
    id: id('puzzle'),
    ownerId,
    slot,
    spectrum: {
      left: selected[0],
      right: selected[1],
    },
    target: randomInt(0, 100),
    clue: '',
  };
}

function getJoinedPlayers(room) {
  return room.players.filter((player) => !player.removed);
}

function makeRound(room) {
  const players = getJoinedPlayers(room);
  const usedSpectra = new Set();
  const puzzlesByPlayer = {};
  const allPuzzles = [];

  for (const player of players) {
    const puzzles = [];
    for (let slot = 1; slot <= PUZZLES_PER_PLAYER; slot += 1) {
      const puzzle = makePuzzle(player.id, slot, usedSpectra);
      puzzles.push(puzzle);
      allPuzzles.push(puzzle);
    }
    puzzlesByPlayer[player.id] = puzzles;
  }

  const queue = shuffle(allPuzzles.map((puzzle) => puzzle.id));

  return {
    roundNumber: room.currentRound,
    puzzlesByPlayer,
    queue,
    queueIndex: 0,
    currentGuess: 50,
    solved: [],
    roundScore: 0,
  };
}

function getAllPuzzles(room) {
  if (!room.round) return [];
  return Object.values(room.round.puzzlesByPlayer).flat();
}

function getPuzzleById(room, puzzleId) {
  return getAllPuzzles(room).find((puzzle) => puzzle.id === puzzleId) || null;
}

function getCurrentPuzzle(room) {
  if (!room.round) return null;
  const puzzleId = room.round.queue[room.round.queueIndex];
  return getPuzzleById(room, puzzleId);
}

function allCluesSubmitted(room) {
  return getAllPuzzles(room).every((puzzle) => puzzle.clue.trim().length > 0);
}

function clueProgress(room) {
  const players = getJoinedPlayers(room);
  const total = players.length * PUZZLES_PER_PLAYER;
  const submitted = getAllPuzzles(room).filter((puzzle) => puzzle.clue.trim().length > 0).length;
  const byPlayer = players.map((player) => {
    const puzzles = room.round?.puzzlesByPlayer[player.id] || [];
    return {
      playerId: player.id,
      name: player.name,
      submitted: puzzles.filter((puzzle) => puzzle.clue.trim().length > 0).length,
      total: puzzles.length,
    };
  });
  return { submitted, total, byPlayer };
}

function getPlayer(room, playerId) {
  return room.players.find((player) => player.id === playerId) || null;
}

function isHost(room, playerId) {
  return room.hostPlayerId === playerId;
}

function playerCanGuess(room, playerId) {
  const puzzle = getCurrentPuzzle(room);
  if (!puzzle) return false;
  return room.phase === 'guess' && puzzle.ownerId !== playerId;
}

function roundMaxScore(room) {
  return getJoinedPlayers(room).length * PUZZLES_PER_PLAYER * MAX_SCORE_PER_PUZZLE;
}

function buildClientState(room, playerId) {
  const players = getJoinedPlayers(room);
  const me = getPlayer(room, playerId);
  const puzzle = getCurrentPuzzle(room);
  const myPuzzles = room.round?.puzzlesByPlayer[playerId] || [];
  const currentPuzzleOwner = puzzle ? getPlayer(room, puzzle.ownerId) : null;
  const revealData = room.lastReveal || null;

  return {
    roomCode: room.code,
    phase: room.phase,
    hostPlayerId: room.hostPlayerId,
    myPlayerId: playerId,
    me: me
      ? {
          id: me.id,
          name: me.name,
          connected: me.connected,
        }
      : null,
    players: players.map((player) => ({
      id: player.id,
      name: player.name,
      connected: Boolean(player.connected),
      isHost: player.id === room.hostPlayerId,
    })),
    settings: room.settings,
    game: {
      currentRound: room.currentRound,
      totalRounds: room.settings.totalRounds,
      totalScore: room.scoreboard.total,
      solvedPuzzles: room.scoreboard.solvedPuzzles,
      maxPossible: room.scoreboard.maxPossible,
      totalPossibleThisGame: room.settings.totalRounds * roundMaxScore(room),
    },
    clueProgress: room.round ? clueProgress(room) : null,
    myPuzzles: myPuzzles.map((puzzleItem) => ({
      id: puzzleItem.id,
      slot: puzzleItem.slot,
      spectrum: puzzleItem.spectrum,
      target: puzzleItem.target,
      clue: puzzleItem.clue,
    })),
    queue: room.round
      ? {
          currentIndex: room.round.queueIndex,
          total: room.round.queue.length,
        }
      : null,
    currentGuess: room.round?.currentGuess ?? 50,
    currentPuzzle: puzzle
      ? {
          id: puzzle.id,
          slot: puzzle.slot,
          spectrum: puzzle.spectrum,
          clue: room.phase === 'clue' ? null : puzzle.clue,
          ownerId: puzzle.ownerId,
          ownerName: currentPuzzleOwner?.name || 'Unknown',
          target: room.phase === 'reveal' ? puzzle.target : null,
          guess: room.phase === 'reveal' ? revealData?.guess ?? null : null,
          distance: room.phase === 'reveal' ? revealData?.distance ?? null : null,
          points: room.phase === 'reveal' ? revealData?.points ?? null : null,
        }
      : null,
    solvedHistory: room.round?.solved || [],
    roundSummary:
      room.phase === 'round_summary' || room.phase === 'game_over'
        ? {
            roundScore: room.round?.roundScore ?? 0,
            maxRoundScore: roundMaxScore(room),
            rounds: room.scoreboard.rounds,
          }
        : null,
    permissions: {
      isHost: isHost(room, playerId),
      canStart: room.phase === 'lobby' && isHost(room, playerId) && players.length >= 2,
      canSubmitClues: room.phase === 'clue',
      canGuess: playerCanGuess(room, playerId),
      canContinueReveal: room.phase === 'reveal' && isHost(room, playerId),
      canStartNextRound: room.phase === 'round_summary' && isHost(room, playerId),
      canRestart: room.phase === 'game_over' && isHost(room, playerId),
      canLeaveRoom: Boolean(me),
      canCloseRoom: isHost(room, playerId),
      isCurrentPuzzleOwner: puzzle ? puzzle.ownerId === playerId : false,
    },
  };
}

function reassignHost(room) {
  const joined = getJoinedPlayers(room);
  const connected = joined.filter((player) => player.connected);
  if (connected.length > 0) {
    room.hostPlayerId = connected[0].id;
    return;
  }
  if (joined.length > 0) {
    room.hostPlayerId = joined[0].id;
    return;
  }
  room.hostPlayerId = null;
}

function finalizeRoundIfNeeded(room) {
  if (!room.round) return;

  if (room.round.queue.length === 0 || room.round.queueIndex >= room.round.queue.length) {
    if (room.phase === 'reveal') return;

    const existingIndex = room.scoreboard.rounds.findIndex((entry) => entry.roundNumber === room.currentRound);
    const summary = {
      roundNumber: room.currentRound,
      score: room.round.roundScore,
      maxScore: roundMaxScore(room),
    };

    if (existingIndex >= 0) {
      room.scoreboard.rounds[existingIndex] = summary;
    } else {
      room.scoreboard.rounds.push(summary);
    }

    if (room.currentRound >= room.settings.totalRounds) {
      room.phase = 'game_over';
    } else {
      room.phase = 'round_summary';
    }
    room.lastReveal = null;
  }
}

function removePlayerFromActiveRound(room, playerId) {
  if (!room.round) return;

  const ownedPuzzles = room.round.puzzlesByPlayer[playerId] || [];
  if (ownedPuzzles.length === 0) return;

  const ownedIds = new Set(ownedPuzzles.map((puzzle) => puzzle.id));
  const currentPuzzleId = room.round.queue[room.round.queueIndex] || null;
  const currentWasRemoved = currentPuzzleId ? ownedIds.has(currentPuzzleId) : false;
  const removedBeforeIndex = room.round.queue
    .slice(0, room.round.queueIndex)
    .filter((puzzleId) => ownedIds.has(puzzleId)).length;

  room.round.queue = room.round.queue.filter((puzzleId) => !ownedIds.has(puzzleId));
  delete room.round.puzzlesByPlayer[playerId];

  room.round.queueIndex = Math.max(0, room.round.queueIndex - removedBeforeIndex);
  if (currentWasRemoved && room.round.queueIndex >= room.round.queue.length) {
    room.round.queueIndex = Math.max(0, room.round.queue.length - 1);
  }

  if (room.phase === 'clue' && allCluesSubmitted(room)) {
    room.phase = 'guess';
    room.round.currentGuess = 50;
    room.lastReveal = null;
  }

  if (room.phase === 'guess' && currentWasRemoved) {
    room.round.currentGuess = 50;
    room.lastReveal = null;
  }

  if (room.phase === 'reveal' && room.lastReveal?.ownerId === playerId) {
    room.lastReveal = null;
    room.phase = 'guess';
    room.round.currentGuess = 50;
  }

  finalizeRoundIfNeeded(room);
}

function broadcastRoom(io, roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  for (const player of getJoinedPlayers(room)) {
    if (player.connected && player.socketId) {
      io.to(player.socketId).emit('room_state', buildClientState(room, player.id));
    }
  }

  persist();
}

export function createRoom({ playerId, name, totalRounds = DEFAULT_ROUNDS }) {
  const safeName = normalizeName(name);
  if (!safeName) {
    throw new Error('Name is required.');
  }

  let code = makeCode();
  while (rooms.has(code)) {
    code = makeCode();
  }

  const room = {
    code,
    hostPlayerId: playerId,
    phase: 'lobby',
    settings: {
      totalRounds: clamp(Number(totalRounds) || DEFAULT_ROUNDS, 1, 10),
    },
    players: [
      {
        id: playerId,
        name: safeName,
        connected: true,
        socketId: null,
        lastSeenAt: Date.now(),
      },
    ],
    currentRound: 0,
    round: null,
    lastReveal: null,
    scoreboard: createEmptyScoreboard(),
    createdAt: Date.now(),
  };

  rooms.set(code, room);
  persist();
  return room;
}

export function joinRoom({ roomCode, playerId, name }) {
  const code = String(roomCode || '').trim().toUpperCase();
  const room = rooms.get(code);
  if (!room) {
    throw new Error('Room not found.');
  }

  const safeName = normalizeName(name);
  if (!safeName) {
    throw new Error('Name is required.');
  }

  const existing = getPlayer(room, playerId);
  if (existing) {
    existing.name = safeName;
    existing.connected = true;
    existing.lastSeenAt = Date.now();
    persist();
    return room;
  }

  if (room.phase !== 'lobby') {
    throw new Error('Game already started. Only reconnecting players can join now.');
  }

  room.players.push({
    id: playerId,
    name: safeName,
    connected: true,
    socketId: null,
    lastSeenAt: Date.now(),
  });

  persist();
  return room;
}

export function attachSocket(roomCode, playerId, socketId) {
  const room = rooms.get(roomCode);
  if (!room) return null;
  const player = getPlayer(room, playerId);
  if (!player) return null;
  player.socketId = socketId;
  player.connected = true;
  player.lastSeenAt = Date.now();
  persist();
  return room;
}

export function markDisconnected(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) return null;
  const player = getPlayer(room, playerId);
  if (!player) return room;
  player.connected = false;
  player.socketId = null;
  player.lastSeenAt = Date.now();
  if (room.hostPlayerId === playerId) {
    reassignHost(room);
  }
  persist();
  return room;
}

export function leaveRoom(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) return { room: null, closed: false };

  const index = room.players.findIndex((player) => player.id === playerId);
  if (index === -1) return { room, closed: false };

  room.players.splice(index, 1);
  removePlayerFromActiveRound(room, playerId);

  if (room.players.length === 0) {
    rooms.delete(room.code);
    persist();
    return { room: null, closed: true };
  }

  if (room.hostPlayerId === playerId) {
    reassignHost(room);
  }

  persist();
  return { room, closed: false };
}

export function closeRoom(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) return null;
  if (!isHost(room, playerId)) throw new Error('Only the host can close the session.');
  rooms.delete(room.code);
  persist();
  return room;
}

export function updateSettings(roomCode, playerId, nextSettings) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found.');
  if (!isHost(room, playerId)) throw new Error('Only the host can change settings.');
  if (room.phase !== 'lobby') throw new Error('Settings can only be changed in the lobby.');
  room.settings.totalRounds = clamp(Number(nextSettings.totalRounds) || DEFAULT_ROUNDS, 1, 10);
  persist();
  return room;
}

export function startGame(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found.');
  if (!isHost(room, playerId)) throw new Error('Only the host can start the game.');
  if (getJoinedPlayers(room).length < 2) throw new Error('At least 2 players are required.');

  room.scoreboard = createEmptyScoreboard();
  room.currentRound = 1;
  room.round = makeRound(room);
  room.phase = 'clue';
  room.lastReveal = null;
  persist();
  return room;
}

export function submitClues(roomCode, playerId, entries) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found.');
  if (room.phase !== 'clue') throw new Error('Not accepting clues right now.');

  const playerPuzzles = room.round?.puzzlesByPlayer[playerId];
  if (!playerPuzzles) throw new Error('No puzzles found for this player.');

  for (const entry of entries || []) {
    const puzzle = playerPuzzles.find((item) => item.id === entry.puzzleId);
    if (!puzzle) continue;
    puzzle.clue = String(entry.clue || '').trim();
  }

  const missing = playerPuzzles.some((puzzle) => !puzzle.clue.trim());
  if (missing) {
    throw new Error('All 3 clues are required.');
  }

  if (allCluesSubmitted(room)) {
    room.phase = 'guess';
    room.round.currentGuess = 50;
    room.lastReveal = null;
  }

  persist();
  return room;
}

export function setGuess(roomCode, playerId, guess) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found.');
  if (!playerCanGuess(room, playerId)) throw new Error('You cannot adjust the guess for this puzzle.');
  room.round.currentGuess = clamp(Math.round(Number(guess) || 0), 0, 100);
  persist();
  return room;
}

export function lockGuess(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found.');
  if (!playerCanGuess(room, playerId)) throw new Error('You cannot lock the guess for this puzzle.');

  const puzzle = getCurrentPuzzle(room);
  if (!puzzle) throw new Error('No active puzzle.');

  const result = scoreGuess(puzzle.target, room.round.currentGuess);
  const reveal = {
    puzzleId: puzzle.id,
    ownerId: puzzle.ownerId,
    ownerName: getPlayer(room, puzzle.ownerId)?.name || 'Unknown',
    clue: puzzle.clue,
    spectrum: puzzle.spectrum,
    target: puzzle.target,
    guess: room.round.currentGuess,
    distance: result.distance,
    points: result.points,
    slot: puzzle.slot,
  };

  room.lastReveal = reveal;
  room.round.solved.push(reveal);
  room.round.roundScore += result.points;
  room.scoreboard.total += result.points;
  room.scoreboard.solvedPuzzles += 1;
  room.scoreboard.maxPossible += MAX_SCORE_PER_PUZZLE;
  room.phase = 'reveal';
  persist();
  return room;
}

export function continueAfterReveal(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found.');
  if (!isHost(room, playerId)) throw new Error('Only the host can continue.');
  if (room.phase !== 'reveal') throw new Error('Nothing to continue yet.');

  room.round.queueIndex += 1;
  room.lastReveal = null;

  if (room.round.queueIndex < room.round.queue.length) {
    room.phase = 'guess';
    room.round.currentGuess = 50;
  } else {
    room.scoreboard.rounds.push({
      roundNumber: room.currentRound,
      score: room.round.roundScore,
      maxScore: roundMaxScore(room),
    });

    if (room.currentRound >= room.settings.totalRounds) {
      room.phase = 'game_over';
    } else {
      room.phase = 'round_summary';
    }
  }

  persist();
  return room;
}

export function startNextRound(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found.');
  if (!isHost(room, playerId)) throw new Error('Only the host can start the next round.');
  if (room.phase !== 'round_summary') throw new Error('No next round available right now.');

  room.currentRound += 1;
  room.round = makeRound(room);
  room.phase = 'clue';
  room.lastReveal = null;
  persist();
  return room;
}

export function restartGame(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) throw new Error('Room not found.');
  if (!isHost(room, playerId)) throw new Error('Only the host can restart.');

  room.currentRound = 1;
  room.scoreboard = createEmptyScoreboard();
  room.round = makeRound(room);
  room.phase = 'clue';
  room.lastReveal = null;
  persist();
  return room;
}

export function getRoom(roomCode) {
  return rooms.get(String(roomCode || '').trim().toUpperCase()) || null;
}

export function listRooms() {
  return Array.from(rooms.values()).map((room) => ({
    code: room.code,
    phase: room.phase,
  }));
}

export function handleAction(io, roomCode, action) {
  const room = rooms.get(roomCode);
  if (!room) return;
  broadcastRoom(io, roomCode);
  return action;
}

export { broadcastRoom, buildClientState, rooms };
