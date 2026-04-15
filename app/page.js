'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { formatSpectrum, PUZZLES_PER_PLAYER } from '@/lib/shared.js';

function getBrowserPlayerId() {
    if (typeof window === 'undefined') return '';
    const key = 'signal-board-player-id';
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const created = window.crypto?.randomUUID?.() || `player_${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(key, created);
    return created;
}

function saveSession(name, roomCode) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('signal-board-name', name);
    window.localStorage.setItem('signal-board-room', roomCode);
}

function loadSession() {
    if (typeof window === 'undefined') return { name: '', roomCode: '' };
    return {
        name: window.localStorage.getItem('signal-board-name') || '',
        roomCode: window.localStorage.getItem('signal-board-room') || '',
    };
}

function Button({ children, className = '', ...props }) {
    return (
        <button className={`button ${className}`.trim()} {...props}>
            {children}
        </button>
    );
}

function Stat({ label, value }) {
    return (
        <div className="stat">
            <div className="statLabel">{label}</div>
            <div className="statValue">{value}</div>
        </div>
    );
}


function clampPercent(value) {
    return Math.max(0, Math.min(100, value));
}

function RevealScale({ spectrum, guess, target }) {
    const bands = [
        { label: '4 pts', start: target - 4, end: target + 4, className: 'band4' },
        { label: '3 pts', start: target - 10, end: target + 10, className: 'band3' },
        { label: '2 pts', start: target - 16, end: target + 16, className: 'band2' },
        { label: '1 pt', start: target - 22, end: target + 22, className: 'band1' },
    ];

    return (
        <div className="revealScaleCard">
            <div className="spectrumBarLabels">
                <span>{spectrum.left}</span>
                <span>{spectrum.right}</span>
            </div>
            <div className="revealScale">
                {bands
                    .slice()
                    .reverse()
                    .map((band) => {
                        const start = clampPercent(band.start);
                        const end = clampPercent(band.end);
                        return (
                            <div
                                key={band.label}
                                className={`scoreBand ${band.className}`}
                                style={{ left: `${start}%`, width: `${Math.max(0, end - start)}%` }}
                                title={`${band.label}: ${Math.max(0, Math.round(start))}-${Math.min(100, Math.round(end))}`}
                            >
                                <span>{band.label}</span>
                            </div>
                        );
                    })}

                <div className="scaleTicks">
                    {[0, 25, 50, 75, 100].map((tick) => (
                        <div key={tick} className="tick" style={{ left: `${tick}%` }}>
                            <span>{tick}</span>
                        </div>
                    ))}
                </div>

                <div className="marker guessMarker" style={{ left: `${guess}%` }}>
                    <div className="markerLabel">Guess {guess}</div>
                    <div className="markerNeedle" />
                </div>

                <div className="marker targetMarker" style={{ left: `${target}%` }}>
                    <div className="markerLabel">Target {target}</div>
                    <div className="markerNeedle" />
                </div>
            </div>
            <div className="bandLegend">
                <span><i className="legendSwatch band4" />0–4 away = 4 pts</span>
                <span><i className="legendSwatch band3" />5–10 away = 3 pts</span>
                <span><i className="legendSwatch band2" />11–16 away = 2 pts</span>
                <span><i className="legendSwatch band1" />17–22 away = 1 pt</span>
            </div>
        </div>
    );
}

function PuzzleCard({ puzzle, value, onChange, disabled }) {
    return (
        <div className="card puzzleCard">
            <div className="eyebrow">Puzzle {puzzle.slot}</div>
            <h3>{formatSpectrum(puzzle.spectrum)}</h3>
            <div className="targetLine">
                <span>{puzzle.spectrum.left}</span>
                <strong>{puzzle.target}</strong>
                <span>{puzzle.spectrum.right}</span>
            </div>
            <textarea
                value={value}
                disabled={disabled}
                onChange={(event) => onChange(puzzle.id, event.target.value)}
                placeholder="Write a clue for the rest of the group"
                rows={5}
            />
        </div>
    );
}

export default function HomePage() {
    const socketRef = useRef(null);
    const [playerId, setPlayerId] = useState('');
    const [name, setName] = useState('');
    const [joinCode, setJoinCode] = useState('');
    const [room, setRoom] = useState(null);
    const [error, setError] = useState('');
    const [status, setStatus] = useState('disconnected');
    const [rounds, setRounds] = useState(3);
    const [clues, setClues] = useState({});
    const [copyMessage, setCopyMessage] = useState('');

    useEffect(() => {
        const session = loadSession();
        setPlayerId(getBrowserPlayerId());
        setName(session.name);
        setJoinCode(session.roomCode);
    }, []);

    useEffect(() => {
        const socket = io({ autoConnect: false });
        socketRef.current = socket;

        socket.on('connect', () => {
            setStatus('connected');
            const cachedRoom = window.localStorage.getItem('signal-board-room');
            const cachedName = window.localStorage.getItem('signal-board-name');
            const cachedPlayerId = getBrowserPlayerId();
            if (cachedRoom && cachedName) {
                socket.emit('request_sync', { roomCode: cachedRoom, playerId: cachedPlayerId });
            }
        });

        socket.on('disconnect', () => setStatus('disconnected'));
        socket.on('room_state', (nextRoom) => {
            setRoom(nextRoom);
            setRounds(nextRoom.settings.totalRounds);
            setError('');
            if (nextRoom.roomCode && nextRoom.me?.name) {
                saveSession(nextRoom.me.name, nextRoom.roomCode);
            }
            if (nextRoom.myPuzzles?.length) {
                setClues((previous) => {
                    const merged = { ...previous };
                    for (const puzzle of nextRoom.myPuzzles) {
                        if (!(puzzle.id in merged)) {
                            merged[puzzle.id] = puzzle.clue || '';
                        }
                    }
                    return merged;
                });
            }
        });
        socket.on('action_error', (message) => setError(message));
        socket.on('room_left', () => {
            window.localStorage.removeItem('signal-board-room');
            setRoom(null);
            setJoinCode('');
            setClues({});
            setError('');
        });
        socket.on('room_closed', () => {
            window.localStorage.removeItem('signal-board-room');
            setRoom(null);
            setJoinCode('');
            setClues({});
            setError('The host closed the session.');
        });

        socket.connect();

        return () => {
            socket.disconnect();
        };
    }, []);

    useEffect(() => {
        if (!copyMessage) return undefined;
        const timer = window.setTimeout(() => setCopyMessage(''), 1500);
        return () => window.clearTimeout(timer);
    }, [copyMessage]);

    const canSubmitAllClues = useMemo(() => {
        if (!room?.myPuzzles?.length) return false;
        return room.myPuzzles.every((puzzle) => String(clues[puzzle.id] || '').trim().length > 0);
    }, [room, clues]);

    const connectAndEmit = (eventName, payload) => {
        const socket = socketRef.current;
        if (!socket) return;
        if (!socket.connected) socket.connect();
        socket.emit(eventName, payload);
    };

    const createRoom = () => {
        if (!name.trim()) {
            setError('Enter a name first.');
            return;
        }
        connectAndEmit('create_room', { playerId, name: name.trim(), totalRounds: rounds });
    };

    const joinRoom = () => {
        if (!name.trim() || !joinCode.trim()) {
            setError('Enter a name and room code.');
            return;
        }
        connectAndEmit('join_room', { playerId, name: name.trim(), roomCode: joinCode.trim().toUpperCase() });
    };

    const updateClue = (puzzleId, value) => {
        setClues((previous) => ({ ...previous, [puzzleId]: value }));
    };

    const submitClues = () => {
        if (!room) return;
        connectAndEmit('submit_clues', {
            roomCode: room.roomCode,
            playerId,
            entries: room.myPuzzles.map((puzzle) => ({
                puzzleId: puzzle.id,
                clue: clues[puzzle.id] ?? '',
            })),
        });
    };

    const copyCode = async () => {
        if (!room?.roomCode) return;
        await navigator.clipboard.writeText(room.roomCode);
        setCopyMessage('Copied');
    };

    const leaveRoom = () => {
        if (!room) return;
        connectAndEmit('leave_room', { roomCode: room.roomCode, playerId });
    };

    const closeRoom = () => {
        if (!room) return;
        connectAndEmit('close_room', { roomCode: room.roomCode, playerId });
    };

    const setGuess = (value) => {
        if (!room) return;
        connectAndEmit('set_guess', { roomCode: room.roomCode, playerId, guess: Number(value) });
    };

    const currentPuzzleLabel = room?.currentPuzzle
        ? `${room.currentPuzzle.ownerName} • puzzle ${room.currentPuzzle.slot}`
        : 'No puzzle active';

    return (
        <main className="pageShell">
            <div className="pageBackdrop" />
            <div className="pageContent">
                <section className="hero card">
                    <div>
                        <div className="eyebrow">Wavelength</div>
                        <h1>David Pham's Shitty AI Generated Wavelength Clone</h1>
                        <p>
                            Everyone gets 3 private puzzles. Write clues, shuffle everything together, then let the rest of the
                            group try to place each target.
                        </p>
                    </div>
                    <div className="heroStats">
                        <Stat label="Status" value={status} />
                        <Stat label="Puzzles per player" value={PUZZLES_PER_PLAYER} />
                        <Stat label="Rules" value="Fully co-op" />
                    </div>
                </section>

                {error ? <div className="errorBanner">{error}</div> : null}

                {!room ? (
                    <section className="grid twoCol">
                        <div className="card stack">
                            <div className="eyebrow">Identity</div>
                            <label>
                                Name
                                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your display name" />
                            </label>
                            <label>
                                Rounds
                                <input
                                    type="number"
                                    min={1}
                                    max={10}
                                    value={rounds}
                                    onChange={(event) => setRounds(Number(event.target.value || 3))}
                                />
                            </label>
                            <Button onClick={createRoom}>Create room</Button>
                        </div>

                        <div className="card stack">
                            <div className="eyebrow">Join</div>
                            <label>
                                Room code
                                <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="ABCDE" />
                            </label>
                            <Button onClick={joinRoom}>Join room</Button>
                            <p className="muted">Make sure you type in a name in the Identity Section first. Too lazy to add another name field here.</p>
                        </div>
                    </section>
                ) : (
                    <>
                        <section className="grid layoutTop">
                            <div className="card stack">
                                <div className="roomHeader">
                                    <div>
                                        <div className="eyebrow">Room</div>
                                        <h2>{room.roomCode}</h2>
                                    </div>
                                    <Button className="secondary" onClick={copyCode}>
                                        Copy code
                                    </Button>
                                </div>
                                {copyMessage ? <div className="muted">{copyMessage}</div> : null}
                                <div className="roomActions">
                                    <Button className="secondary" onClick={leaveRoom} disabled={!room.permissions.canLeaveRoom}>
                                        Leave room
                                    </Button>
                                    {room.permissions.canCloseRoom ? (
                                        <Button className="danger" onClick={closeRoom}>
                                            Close session
                                        </Button>
                                    ) : null}
                                </div>
                                <div className="statsRow">
                                    <Stat label="Round" value={`${room.game.currentRound || 0} / ${room.game.totalRounds}`} />
                                    <Stat label="Score" value={`${room.game.totalScore} / ${room.game.maxPossible}`} />
                                    <Stat label="Phase" value={room.phase.replace('_', ' ')} />
                                </div>
                            </div>

                            <div className="card stack">
                                <div className="eyebrow">Players</div>
                                <div className="playerList">
                                    {room.players.map((player) => (
                                        <div key={player.id} className="playerPill">
                                            <span>{player.name}</span>
                                            <span className={player.connected ? 'online' : 'offline'}>
                                                {player.isHost ? 'Host • ' : ''}
                                                {player.connected ? 'Online' : 'Offline'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>

                        {room.phase === 'lobby' ? (
                            <section className="grid twoCol">
                                <div className="card stack">
                                    <div className="eyebrow">Lobby</div>
                                    <p>
                                        Everyone writes 3 clues each round. New players can only join while you are here in the lobby.
                                    </p>
                                    <label>
                                        Total rounds
                                        <input
                                            type="number"
                                            min={1}
                                            max={10}
                                            value={rounds}
                                            onChange={(event) => {
                                                const next = Number(event.target.value || 3);
                                                setRounds(next);
                                                if (room.permissions.isHost) {
                                                    connectAndEmit('update_settings', {
                                                        roomCode: room.roomCode,
                                                        playerId,
                                                        settings: { totalRounds: next },
                                                    });
                                                }
                                            }}
                                            disabled={!room.permissions.isHost}
                                        />
                                    </label>
                                    <Button disabled={!room.permissions.canStart} onClick={() => connectAndEmit('start_game', { roomCode: room.roomCode, playerId })}>
                                        Start game
                                    </Button>
                                </div>

                                <div className="card stack">
                                    <div className="eyebrow">Teach script</div>
                                    <ol className="rulesList">
                                        <li>Each player gets 3 private spectra with targets.</li>
                                        <li>Write one clue for each of your 3 puzzles.</li>
                                        <li>All clues reveal after everyone finishes.</li>
                                        <li>Puzzles are shuffled together and solved one by one.</li>
                                        <li>The owner stays silent during their own puzzle.</li>
                                        <li>The group makes one shared guess for each puzzle.</li>
                                    </ol>
                                </div>
                            </section>
                        ) : null}

                        {room.phase === 'clue' ? (
                            <section className="stack largeGap">
                                <div className="card stack">
                                    <div className="eyebrow">Clue writing</div>
                                    <h2>Your 3 private puzzles</h2>
                                    <p className="muted">Write one clue for each puzzle. Nobody sees them until everyone is done.</p>
                                    <div className="roomActions">
                                        <Button className="secondary" onClick={leaveRoom} disabled={!room.permissions.canLeaveRoom}>
                                            Leave room
                                        </Button>
                                        {room.permissions.canCloseRoom ? (
                                            <Button className="danger" onClick={closeRoom}>
                                                Close session
                                            </Button>
                                        ) : null}
                                    </div>
                                    <div className="statsRow">
                                        <Stat label="Submitted" value={`${room.clueProgress?.submitted ?? 0} / ${room.clueProgress?.total ?? 0}`} />
                                        <Stat label="Your clues" value={`${room.myPuzzles.filter((puzzle) => String(clues[puzzle.id] || '').trim()).length} / 3`} />
                                    </div>
                                </div>

                                <div className="grid threeCol">
                                    {room.myPuzzles.map((puzzle) => (
                                        <PuzzleCard
                                            key={puzzle.id}
                                            puzzle={puzzle}
                                            value={clues[puzzle.id] ?? puzzle.clue ?? ''}
                                            onChange={updateClue}
                                            disabled={false}
                                        />
                                    ))}
                                </div>

                                <div className="card stack">
                                    <div className="progressGrid">
                                        {room.clueProgress?.byPlayer?.map((entry) => (
                                            <div key={entry.playerId} className="progressItem">
                                                <span>{entry.name}</span>
                                                <strong>
                                                    {entry.submitted}/{entry.total}
                                                </strong>
                                            </div>
                                        ))}
                                    </div>
                                    <Button disabled={!canSubmitAllClues} onClick={submitClues}>
                                        Submit all 3 clues
                                    </Button>
                                </div>
                            </section>
                        ) : null}

                        {room.phase === 'guess' ? (
                            <section className="grid layoutGame">
                                <div className="card stack tall">
                                    <div className="eyebrow">Current puzzle</div>
                                    <h2>{currentPuzzleLabel}</h2>
                                    <div className="spectrumBarLabels">
                                        <span>{room.currentPuzzle?.spectrum.left}</span>
                                        <span>{room.currentPuzzle?.spectrum.right}</span>
                                    </div>
                                    <div className="spectrumHero">{formatSpectrum(room.currentPuzzle.spectrum)}</div>
                                    <div className="quoteBox">“{room.currentPuzzle?.clue}”</div>
                                    <div className="muted">
                                        {room.permissions.isCurrentPuzzleOwner
                                            ? 'This is your puzzle. Stay silent and do not guide the guess.'
                                            : 'Discuss on Discord, then lock one shared guess.'}
                                    </div>
                                    <div className="dialBox">
                                        <input
                                            type="range"
                                            min={0}
                                            max={100}
                                            value={room.currentGuess}
                                            disabled={!room.permissions.canGuess}
                                            onChange={(event) => setGuess(event.target.value)}
                                        />
                                        <div className="dialValue">{room.currentGuess}</div>
                                    </div>
                                    <Button
                                        disabled={!room.permissions.canGuess}
                                        onClick={() => connectAndEmit('lock_guess', { roomCode: room.roomCode, playerId })}
                                    >
                                        Lock guess
                                    </Button>
                                </div>

                                <div className="stack largeGap">
                                    <div className="card stack">
                                        <div className="eyebrow">Queue</div>
                                        <Stat label="Puzzle" value={`${(room.queue?.currentIndex ?? 0) + 1} / ${room.queue?.total ?? 0}`} />
                                        <p className="muted">Puzzles are shuffled together each round.</p>
                                    </div>

                                    <div className="card stack">
                                        <div className="eyebrow">Solved so far</div>
                                        <div className="historyList compact">
                                            {room.solvedHistory.length === 0 ? <div className="muted">No solved puzzles yet this round.</div> : null}
                                            {room.solvedHistory.map((item) => (
                                                <div key={item.puzzleId} className="historyItem">
                                                    <strong>{item.ownerName}</strong>
                                                    <span>{formatSpectrum(item.spectrum)}</span>
                                                    <span>
                                                        Guess {item.guess} • Target {item.target} • +{item.points}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </section>
                        ) : null}

                        {room.phase === 'reveal' ? (
                            <section className="grid layoutGame">
                                <div className="card stack tall">
                                    <div className="eyebrow">Reveal</div>
                                    <h2>{currentPuzzleLabel}</h2>
                                    <div className="spectrumHero">{formatSpectrum(room.currentPuzzle.spectrum)}</div>
                                    <div className="quoteBox">“{room.currentPuzzle?.clue}”</div>
                                    <RevealScale
                                        spectrum={room.currentPuzzle.spectrum}
                                        guess={room.currentPuzzle.guess}
                                        target={room.currentPuzzle.target}
                                    />
                                    <div className="revealGrid">
                                        <Stat label="Guess" value={room.currentPuzzle.guess} />
                                        <Stat label="Target" value={room.currentPuzzle.target} />
                                        <Stat label="Distance" value={room.currentPuzzle.distance} />
                                        <Stat label="Points" value={`+${room.currentPuzzle.points}`} />
                                    </div>
                                    <Button
                                        disabled={!room.permissions.canContinueReveal}
                                        onClick={() => connectAndEmit('continue_after_reveal', { roomCode: room.roomCode, playerId })}
                                    >
                                        Continue
                                    </Button>
                                </div>

                                <div className="card stack">
                                    <div className="eyebrow">Round history</div>
                                    <div className="historyList">
                                        {room.solvedHistory.map((item) => (
                                            <div key={item.puzzleId} className="historyItem">
                                                <strong>
                                                    {item.ownerName} • puzzle {item.slot}
                                                </strong>
                                                <span>{formatSpectrum(item.spectrum)}</span>
                                                <span>{item.clue}</span>
                                                <span>
                                                    Guess {item.guess} • Target {item.target} • Distance {item.distance} • +{item.points}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </section>
                        ) : null}

                        {room.phase === 'round_summary' ? (
                            <section className="grid twoCol">
                                <div className="card stack">
                                    <div className="eyebrow">Round complete</div>
                                    <h2>
                                        Round {room.game.currentRound} score: {room.roundSummary?.roundScore} / {room.roundSummary?.maxRoundScore}
                                    </h2>
                                    <p className="muted">Cumulative score so far: {room.game.totalScore}</p>
                                    <Button
                                        disabled={!room.permissions.canStartNextRound}
                                        onClick={() => connectAndEmit('start_next_round', { roomCode: room.roomCode, playerId })}
                                    >
                                        Start next round
                                    </Button>
                                </div>

                                <div className="card stack">
                                    <div className="eyebrow">Scoreboard</div>
                                    <div className="historyList compact">
                                        {room.roundSummary?.rounds?.map((entry) => (
                                            <div key={entry.roundNumber} className="historyItem">
                                                <strong>Round {entry.roundNumber}</strong>
                                                <span>
                                                    {entry.score} / {entry.maxScore}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </section>
                        ) : null}

                        {room.phase === 'game_over' ? (
                            <section className="grid twoCol">
                                <div className="card stack">
                                    <div className="eyebrow">Game over</div>
                                    <h2>
                                        Final score: {room.game.totalScore} / {room.game.maxPossible}
                                    </h2>
                                    <p className="muted">
                                        Max possible across the full game with this player count: {room.game.totalPossibleThisGame}
                                    </p>
                                    <Button
                                        disabled={!room.permissions.canRestart}
                                        onClick={() => connectAndEmit('restart_game', { roomCode: room.roomCode, playerId })}
                                    >
                                        Play again
                                    </Button>
                                </div>

                                <div className="card stack">
                                    <div className="eyebrow">Rounds</div>
                                    <div className="historyList compact">
                                        {room.roundSummary?.rounds?.map((entry) => (
                                            <div key={entry.roundNumber} className="historyItem">
                                                <strong>Round {entry.roundNumber}</strong>
                                                <span>
                                                    {entry.score} / {entry.maxScore}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </section>
                        ) : null}
                    </>
                )}
            </div>
        </main>
    );
}
