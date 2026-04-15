# Wavelength-Style Co-op Party Game

A fresh rebuild of the game around the final rules:

- fully cooperative
- no teams
- every player gets 3 private puzzles per round
- each puzzle has its own spectrum and hidden target
- every player writes 1 clue per puzzle
- all clues stay private until everyone submits
- puzzles are shuffled together each round
- puzzles are solved one at a time
- the puzzle owner must stay silent during their own puzzle
- the group makes 1 shared guess for each puzzle
- scoring is based on guess distance

## Tech

- Next.js App Router
- Socket.IO for real-time multiplayer
- Custom Node server for hosting the Next app and websocket server together
- File-backed room persistence in `.data/rooms.json`

## Run locally

```bash
npm install
npm run dev
```

Then open:

```bash
http://localhost:3000
```

Open multiple browser windows or an incognito window to test multiplayer.

## Production

```bash
npm install
npm run build
npm start
```

The app runs as a Node.js server process and is suitable for deployment on platforms or servers that support persistent Node processes.

## Notes

- Rooms are persisted to `.data/rooms.json`.
- New players may join only while the room is still in the lobby. If a game is already running, existing players can reconnect using the same browser session ID.
- The app does not implement voice chat. Players are expected to use Discord and follow the social rule that the puzzle owner must remain silent during their own puzzle.

## Scoring

- 0 to 4 away: 4 points
- 5 to 10 away: 3 points
- 11 to 16 away: 2 points
- 17 to 22 away: 1 point
- 23+ away: 0 points

## Suggested deployment

Use a Node-capable host such as Railway, Render, Fly.io, Docker, or a VPS with nginx in front.
