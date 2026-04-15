import http from 'node:http';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import {
  attachSocket,
  broadcastRoom,
  buildClientState,
  continueAfterReveal,
  createRoom,
  getRoom,
  joinRoom,
  lockGuess,
  markDisconnected,
  restartGame,
  setGuess,
  startGame,
  leaveRoom,
  closeRoom,
  startNextRound,
  submitClues,
  updateSettings,
} from './server/game.js';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = Number(process.env.PORT) || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = http.createServer((req, res) => handle(req, res));
  const io = new SocketIOServer(server, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  function fail(socket, error) {
    socket.emit('action_error', error instanceof Error ? error.message : String(error));
  }

  io.on('connection', (socket) => {
    socket.on('create_room', (payload) => {
      try {
        const room = createRoom(payload || {});
        const attached = attachSocket(room.code, payload.playerId, socket.id);
        socket.data.roomCode = room.code;
        socket.data.playerId = payload.playerId;
        socket.join(room.code);
        socket.emit('room_state', buildClientState(attached, payload.playerId));
        broadcastRoom(io, room.code);
      } catch (error) {
        fail(socket, error);
      }
    });

    socket.on('join_room', (payload) => {
      try {
        const room = joinRoom(payload || {});
        const attached = attachSocket(room.code, payload.playerId, socket.id);
        socket.data.roomCode = room.code;
        socket.data.playerId = payload.playerId;
        socket.join(room.code);
        socket.emit('room_state', buildClientState(attached, payload.playerId));
        broadcastRoom(io, room.code);
      } catch (error) {
        fail(socket, error);
      }
    });

    socket.on('update_settings', (payload) => {
      try {
        const room = updateSettings(payload.roomCode, payload.playerId, payload.settings || {});
        broadcastRoom(io, room.code);
      } catch (error) {
        fail(socket, error);
      }
    });

    socket.on('start_game', (payload) => {
      try {
        const room = startGame(payload.roomCode, payload.playerId);
        broadcastRoom(io, room.code);
      } catch (error) {
        fail(socket, error);
      }
    });

    socket.on('submit_clues', (payload) => {
      try {
        const room = submitClues(payload.roomCode, payload.playerId, payload.entries || []);
        broadcastRoom(io, room.code);
      } catch (error) {
        fail(socket, error);
      }
    });

    socket.on('set_guess', (payload) => {
      try {
        const room = setGuess(payload.roomCode, payload.playerId, payload.guess);
        broadcastRoom(io, room.code);
      } catch (error) {
        fail(socket, error);
      }
    });

    socket.on('lock_guess', (payload) => {
      try {
        const room = lockGuess(payload.roomCode, payload.playerId);
        broadcastRoom(io, room.code);
      } catch (error) {
        fail(socket, error);
      }
    });

    socket.on('continue_after_reveal', (payload) => {
      try {
        const room = continueAfterReveal(payload.roomCode, payload.playerId);
        broadcastRoom(io, room.code);
      } catch (error) {
        fail(socket, error);
      }
    });

    socket.on('start_next_round', (payload) => {
      try {
        const room = startNextRound(payload.roomCode, payload.playerId);
        broadcastRoom(io, room.code);
      } catch (error) {
        fail(socket, error);
      }
    });

    socket.on('restart_game', (payload) => {
      try {
        const room = restartGame(payload.roomCode, payload.playerId);
        broadcastRoom(io, room.code);
      } catch (error) {
        fail(socket, error);
      }
    });

    socket.on('leave_room', (payload) => {
      try {
        const result = leaveRoom(payload.roomCode, payload.playerId);
        socket.leave(payload.roomCode);
        socket.data.roomCode = null;
        socket.data.playerId = null;
        socket.emit('room_left');
        if (result.room) {
          broadcastRoom(io, result.room.code);
        }
      } catch (error) {
        fail(socket, error);
      }
    });

    socket.on('close_room', (payload) => {
      try {
        const room = closeRoom(payload.roomCode, payload.playerId);
        if (!room) return;
        io.to(room.code).emit('room_closed');
        const targetRoom = io.sockets.adapter.rooms.get(room.code);
        if (targetRoom) {
          for (const socketId of targetRoom) {
            const memberSocket = io.sockets.sockets.get(socketId);
            if (!memberSocket) continue;
            memberSocket.leave(room.code);
            memberSocket.data.roomCode = null;
            memberSocket.data.playerId = null;
          }
        }
      } catch (error) {
        fail(socket, error);
      }
    });

    socket.on('request_sync', ({ roomCode, playerId }) => {
      try {
        const room = getRoom(roomCode);
        if (!room) return;
        const attached = attachSocket(room.code, playerId, socket.id);
        socket.data.roomCode = room.code;
        socket.data.playerId = playerId;
        socket.join(room.code);
        socket.emit('room_state', buildClientState(attached, playerId));
        broadcastRoom(io, room.code);
      } catch (error) {
        fail(socket, error);
      }
    });

    socket.on('disconnect', () => {
      const { roomCode, playerId } = socket.data || {};
      if (!roomCode || !playerId) return;
      const room = markDisconnected(roomCode, playerId);
      if (room) {
        broadcastRoom(io, room.code);
      }
    });
  });

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
