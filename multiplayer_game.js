window.onload = () => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    const TILE_SIZE = 30;
    const COLS = 20;
    const ROWS = 20;

    // ── Sprites ──────────────────────────────────────────────────────────────
    const sprites = {
        player1: [new Image(), new Image()],
        player2: [new Image(), new Image()],
        alienAStar: [new Image(), new Image()],
        alienBFS:   [new Image(), new Image()],
        alienUCS:   [new Image(), new Image()]
    };
    sprites.player1[0].src = 'assets/player_1.png';
    sprites.player1[1].src = 'assets/player_2.png';
    sprites.player2[0].src = 'assets/enemy_pink_1.png'; // different tint for P2
    sprites.player2[1].src = 'assets/enemy_pink_2.png';
    sprites.alienAStar[0].src = 'assets/enemy_red_1.png';
    sprites.alienAStar[1].src = 'assets/enemy_red_2.png';
    sprites.alienBFS[0].src = 'assets/enemy_pink_1.png';
    sprites.alienBFS[1].src = 'assets/enemy_pink_2.png';
    sprites.alienUCS[0].src = 'assets/enemy_orange_1.png';
    sprites.alienUCS[1].src = 'assets/enemy_orange_2.png';

    // ── Audio ─────────────────────────────────────────────────────────────────
    const bgmGame = new Audio('assets/casual_music.mp3');
    bgmGame.loop = true;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContext();

    function playMoveSound() {
        if (audioCtx.state === 'suspended') return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    }

    // ── Fixed Pac-Man-style map (20×20) ──────────────────────────────────────
    const BASE_MAP = [
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        [1,3,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,2,3,1],
        [1,2,1,1,2,1,1,1,2,1,1,2,1,1,1,2,1,1,2,1],
        [1,2,1,1,2,1,1,1,2,1,1,2,1,1,1,2,1,1,2,1],
        [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
        [1,2,1,1,2,1,2,1,1,1,1,1,1,2,1,2,1,1,2,1],
        [1,2,2,2,2,1,2,2,2,1,1,2,2,2,1,2,2,2,2,1],
        [1,1,1,1,2,1,1,1,0,1,1,0,1,1,1,2,1,1,1,1],
        [0,0,0,1,2,1,0,0,0,0,0,0,0,0,1,2,1,0,0,0],
        [1,1,1,1,2,1,0,1,1,0,0,1,1,0,1,2,1,1,1,1],
        [2,2,2,2,2,0,0,1,0,0,0,0,1,0,0,2,2,2,2,2],
        [1,1,1,1,2,1,0,1,1,1,1,1,1,0,1,2,1,1,1,1],
        [0,0,0,1,2,1,0,0,0,0,0,0,0,0,1,2,1,0,0,0],
        [1,1,1,1,2,1,2,1,1,1,1,1,1,2,1,2,1,1,1,1],
        [1,2,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,2,2,1],
        [1,2,1,1,2,1,1,1,2,1,1,2,1,1,1,2,1,1,2,1],
        [1,2,2,1,2,2,2,2,2,0,0,2,2,2,2,2,1,2,2,1],
        [1,1,2,1,2,1,2,1,1,1,1,1,1,2,1,2,1,2,1,1],
        [1,3,2,2,2,1,2,2,2,1,1,2,2,2,1,2,2,2,3,1],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
    ];

    // ── Game state ────────────────────────────────────────────────────────────
    let levelMap = [];
    let remainingOrbs = 0;

    // Full authoritative state (host owns this)
    let gs = {
        p1: { x:1, y:1, angle:0, score:0, lives:3, overcharge:0, dirX:0, dirY:1, nextDirX:0, nextDirY:0, prevX:1, prevY:1 },
        p2: { x:18, y:18, angle:Math.PI, score:0, lives:3, overcharge:0, dirX:0, dirY:-1, nextDirX:0, nextDirY:0, prevX:18, prevY:18 },
        aliens: [],
        baseAlienSpeed: 260
    };

    let isHost = false;
    let myRole = null; // 'p1' | 'p2'
    let peer = null;
    let conn = null;
    let isPaused = false;
    let isGameOver = false;
    let gameStarted = false;
    let frameCount = 0;
    let hostGameInterval = null;

    // ── Utility ───────────────────────────────────────────────────────────────
    function getTile(x, y) {
        if ((y === 8 || y === 12) && (x < 0 || x >= COLS)) return 0;
        if (y < 0 || y >= ROWS || x < 0 || x >= COLS) return 1;
        return levelMap[y][x];
    }

    function countOrbs(map) {
        let n = 0;
        for (let r = 0; r < ROWS; r++)
            for (let c = 0; c < COLS; c++)
                if (map[r][c] === 2 || map[r][c] === 3) n++;
        return n;
    }

    // ── Alien AI (same as casual mode) ───────────────────────────────────────
    function getNextMove(startX, startY, targetX, targetY, algo) {
        const dirs = [{dx:0,dy:-1},{dx:1,dy:0},{dx:0,dy:1},{dx:-1,dy:0}];
        let best = null, minCost = Infinity;
        for (let d of dirs) {
            let nx = startX + d.dx, ny = startY + d.dy;
            if (getTile(nx, ny) !== 1) {
                let wx = (nx + COLS) % COLS;
                let dx = Math.min(Math.abs(targetX - wx), COLS - Math.abs(targetX - wx));
                let dy = Math.abs(targetY - ny);
                let h = dx + dy;
                let cost = algo === 'A*' ? 1 + h : algo === 'BFS' ? h : Math.random() * 10;
                if (cost < minCost) { minCost = cost; best = d; }
            }
        }
        return best || {dx:0, dy:0};
    }

    // ── Setup map ─────────────────────────────────────────────────────────────
    function setupMap() {
        levelMap = BASE_MAP.map(row => [...row]);
        remainingOrbs = countOrbs(levelMap);
    }

    function spawnAliens() {
        const configs = [
            {x:9, y:9, algo:'A*', sprite:'alienAStar'},
            {x:10,y:9, algo:'BFS', sprite:'alienBFS'},
            {x:9, y:10,algo:'UCS', sprite:'alienUCS'}
        ];
        gs.aliens = configs.map(c => ({
            x: c.x, y: c.y, startX: c.x, startY: c.y,
            algo: c.algo, sprite: c.sprite,
            angle: 0, prevX: c.x, prevY: c.y,
            respawnDelay: 0, isDead: false
        }));
    }

    function resetGameState() {
        gs.p1 = { x:1, y:1, angle:0, score:0, lives:3, overcharge:0, dirX:0, dirY:1, nextDirX:0, nextDirY:0, prevX:1, prevY:1 };
        gs.p2 = { x:18, y:18, angle:Math.PI, score:0, lives:3, overcharge:0, dirX:0, dirY:-1, nextDirX:0, nextDirY:0, prevX:18, prevY:18 };
        gs.baseAlienSpeed = 260;
        isGameOver = false;
        isPaused = false;
        setupMap();
        spawnAliens();
    }

    // ── 6-char room code ──────────────────────────────────────────────────────
    function makeRoomCode(peerId) {
        // Hash the peer ID into a 6-character alphanumeric code shown to the host.
        // The joiner enters this code; the host's full peer ID is stored in a
        // tiny in-memory registry so we can look it up.
        // Since this runs fully peer-to-peer (no server), we use a simpler
        // approach: encode part of the peer ID as a short code displayed to host,
        // and the joiner connects using that full ID. We display only first 6 chars
        // uppercased for UX, but store full ID for actual connection.
        return peerId.substring(0, 6).toUpperCase();
    }

    // We store the mapping code→fullId in the URL hash when hosting so joiners
    // can look up the full PeerJS ID from just the short code.
    // A simpler self-contained approach: the host's PeerJS ID IS the room.
    // We just display the first 6 chars as the "room code" and embed the full
    // ID in a small relay. Since PeerJS IDs are UUIDs, we'll ask PeerJS to use
    // a custom 6-char ID directly — that IS the room code.

    function generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
        let code = '';
        for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
        return code;
    }

    // ── UI helpers ────────────────────────────────────────────────────────────
    function showScreen(id) {
        document.querySelectorAll('.overlay').forEach(el => el.classList.remove('active'));
        if (id) document.getElementById(id).classList.add('active');
    }

    function setStatus(msg, color = '#ff003c') {
        const el = document.getElementById('connectionStatus');
        el.innerText = msg;
        el.style.color = color;
    }

    function updateUI() {
        document.getElementById('p1ScoreDisplay').innerText = gs.p1.score;
        document.getElementById('p2ScoreDisplay').innerText = gs.p2.score;
        document.getElementById('p1LivesDisplay').innerText = '♥'.repeat(Math.max(0, gs.p1.lives));
        document.getElementById('p2LivesDisplay').innerText = '♥'.repeat(Math.max(0, gs.p2.lives));
        document.getElementById('orbsDisplay').innerText = remainingOrbs;
        document.getElementById('p1OverchargeBar').style.width = (gs.p1.overcharge / 80 * 100) + '%';
        document.getElementById('p2OverchargeBar').style.width = (gs.p2.overcharge / 80 * 100) + '%';
    }

    // ── PeerJS init ───────────────────────────────────────────────────────────
    function initHostPeer(roomCode) {
        setStatus('Generating room...', '#fce205');
        // Use the room code as the PeerJS peer ID so joiners connect directly
        peer = new Peer(roomCode, { debug: 0 });

        peer.on('open', (id) => {
            document.getElementById('roomCodeDisplay').innerText = id;
            document.getElementById('roomCodeBox').style.display = 'flex';
            setStatus('Waiting for Player 2 to join...', '#fce205');
        });

        peer.on('error', (err) => {
            // If room code is taken, generate a new one
            if (err.type === 'unavailable-id') {
                const newCode = generateRoomCode();
                peer.destroy();
                initHostPeer(newCode);
            } else {
                setStatus('Error: ' + err.message);
            }
        });

        peer.on('connection', (connection) => {
            conn = connection;
            conn.on('open', () => {
                setStatus('Player 2 connected! Starting...', '#00ffaa');
                document.getElementById('roomCodeBox').style.display = 'none';
                startHostGame();
            });
            conn.on('data', handleIncomingData);
            conn.on('close', () => {
                if (!isGameOver) setStatus('Player 2 disconnected.');
            });
        });
    }

    function initJoinPeer(roomCode) {
        setStatus('Connecting to room ' + roomCode + '...', '#fce205');
        peer = new Peer(null, { debug: 0 });

        peer.on('open', () => {
            conn = peer.connect(roomCode, { reliable: true });
            conn.on('open', () => {
                setStatus('Connected! Waiting for host to start...', '#00ffaa');
                conn.on('data', handleIncomingData);
                conn.on('close', () => {
                    if (!isGameOver) setStatus('Host disconnected.');
                });
            });
            conn.on('error', () => setStatus('Could not connect. Check room code.'));
        });

        peer.on('error', () => setStatus('Connection failed. Is the room code correct?'));
    }

    // ── Button handlers ───────────────────────────────────────────────────────
    document.getElementById('btnHost').addEventListener('click', () => {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        isHost = true; myRole = 'p1';
        document.getElementById('btnHost').disabled = true;
        document.getElementById('btnJoin').disabled = true;
        document.getElementById('joinSection').style.opacity = '0.3';
        const code = generateRoomCode();
        initHostPeer(code);
    });

    document.getElementById('btnJoin').addEventListener('click', () => {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const code = document.getElementById('joinCodeInput').value.trim().toUpperCase();
        if (code.length < 4) { setStatus('Enter a valid room code.'); return; }
        isHost = false; myRole = 'p2';
        document.getElementById('btnHost').disabled = true;
        document.getElementById('btnJoin').disabled = true;
        document.getElementById('hostSection').style.opacity = '0.3';
        initJoinPeer(code);
    });

    // Enter key on input
    document.getElementById('joinCodeInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('btnJoin').click();
    });

    // ── HOST: Start game ──────────────────────────────────────────────────────
    function startHostGame() {
        showScreen(null);
        gameStarted = true;
        resetGameState();
        bgmGame.play().catch(() => {});

        // Send init packet to client
        sendToClient({ type: 'init', map: levelMap, gs });

        // Host game loop at 150ms tick
        hostGameInterval = setInterval(hostTick, 150);
    }

    // ── HOST: Game tick ───────────────────────────────────────────────────────
    let p1NextDir = {x:0, y:0};
    let p2NextDir = {x:0, y:0};

    function hostTick() {
        if (isPaused || isGameOver) return;

        // Move players
        movePlayer(gs.p1, p1NextDir, 'p1');
        movePlayer(gs.p2, p2NextDir, 'p2');

        // Move aliens
        gs.aliens.forEach(alien => {
            if (alien.respawnDelay > 0) { alien.respawnDelay--; return; }

            // Pick nearest player as target (more interesting gameplay)
            let t1d = Math.abs(alien.x - gs.p1.x) + Math.abs(alien.y - gs.p1.y);
            let t2d = Math.abs(alien.x - gs.p2.x) + Math.abs(alien.y - gs.p2.y);
            let target = t1d <= t2d ? gs.p1 : gs.p2;

            let tx = target.x, ty = target.y;
            // Flee if target is overcharged
            if (target.overcharge > 0) { tx = COLS - target.x; ty = ROWS - target.y; }

            let move = getNextMove(alien.x, alien.y, tx, ty, alien.algo);
            if (move.dx === 1)  alien.angle = -Math.PI/2;
            if (move.dx === -1) alien.angle =  Math.PI/2;
            if (move.dy === -1) alien.angle =  Math.PI;
            if (move.dy === 1)  alien.angle =  0;

            alien.prevX = alien.x; alien.prevY = alien.y;
            alien.x += move.dx; alien.y += move.dy;
            if (alien.x < 0) alien.x = COLS - 1;
            if (alien.x >= COLS) alien.x = 0;
        });

        // Tick overcharge timers
        ['p1','p2'].forEach(pk => {
            if (gs[pk].overcharge > 0) gs[pk].overcharge--;
        });

        // Collisions
        checkAllCollisions();

        // Win condition
        if (remainingOrbs <= 0 && !isGameOver) {
            triggerDraw();
            return;
        }

        // Broadcast state
        sendToClient({ type: 'state', gs, map: levelMap, remainingOrbs });
        drawGame();
    }

    function movePlayer(p, nextDir, pKey) {
        // Try to turn
        if (nextDir.x !== 0 || nextDir.y !== 0) {
            if (getTile(p.x + nextDir.x, p.y + nextDir.y) !== 1) {
                p.dirX = nextDir.x; p.dirY = nextDir.y;
            }
        }
        // Rotate sprite
        if (p.dirX === 1)  p.angle =  Math.PI/2;
        if (p.dirX === -1) p.angle = -Math.PI/2;
        if (p.dirY === 1)  p.angle =  Math.PI;
        if (p.dirY === -1) p.angle =  0;

        // Move
        if (getTile(p.x + p.dirX, p.y + p.dirY) !== 1) {
            p.prevX = p.x; p.prevY = p.y;
            p.x += p.dirX; p.y += p.dirY;
            if (p.x < 0) p.x = COLS - 1;
            if (p.x >= COLS) p.x = 0;
            playMoveSound();
        }

        // Collect orbs
        if (levelMap[p.y] && (levelMap[p.y][p.x] === 2 || levelMap[p.y][p.x] === 3)) {
            let isSuper = levelMap[p.y][p.x] === 3;
            levelMap[p.y][p.x] = 0;
            remainingOrbs--;
            p.score += isSuper ? 50 : 10;
            if (isSuper) {
                p.overcharge = 80;
                sendToClient({ type: 'overcharge', player: pKey });
            }
        }
    }

    function checkAllCollisions() {
        gs.aliens.forEach(alien => {
            ['p1','p2'].forEach(pk => {
                let p = gs[pk];
                let hit = (alien.x === p.x && alien.y === p.y) ||
                          (alien.x === p.prevX && alien.y === p.prevY && alien.prevX === p.x && alien.prevY === p.y);
                if (!hit) return;

                if (p.overcharge > 0) {
                    // Player eats alien
                    p.score += 200;
                    alien.isDead = true;
                    sendToClient({ type: 'alienKilled', alienIdx: gs.aliens.indexOf(alien) });
                } else {
                    // Player takes damage
                    p.lives--;
                    if (p.lives <= 0) {
                        isGameOver = true;
                        let winner = pk === 'p1' ? 'PLAYER 2 WINS!' : 'PLAYER 1 WINS!';
                        endGame(winner);
                    } else {
                        // Reset player position only — alien stays alive, returns to spawn
                        if (pk === 'p1') { p.x=1; p.y=1; p.dirX=0; p.dirY=1; }
                        else { p.x=18; p.y=18; p.dirX=0; p.dirY=-1; }
                        alien.x = alien.startX; alien.y = alien.startY;
                        alien.respawnDelay = 10;
                    }
                }
            });
        });
        gs.aliens = gs.aliens.filter(a => !a.isDead);

        // If all aliens are gone, spawn a new wave of 3 after a short delay
        if (gs.aliens.length === 0 && !isGameOver) {
            setTimeout(() => {
                if (!isGameOver) {
                    spawnAliens();
                    // Speed up slightly each wave (cap at 90ms)
                    gs.baseAlienSpeed = Math.max(90, gs.baseAlienSpeed - 20);
                }
            }, 1500);
        }
    }

    function endGame(msg) {
        isGameOver = true;
        clearInterval(hostGameInterval);
        bgmGame.pause();
        sendToClient({ type: 'gameOver', msg, p1Score: gs.p1.score, p2Score: gs.p2.score });
        triggerGameOverUI(msg, gs.p1.score, gs.p2.score);
    }

    function triggerDraw() {
        let msg = gs.p1.score > gs.p2.score ? 'PLAYER 1 WINS!' :
                  gs.p2.score > gs.p1.score ? 'PLAYER 2 WINS!' : 'TIE GAME!';
        endGame(msg);
    }

    // ── Incoming data handler (both host & client use this) ───────────────────
    function handleIncomingData(data) {
        if (isHost) {
            // Host receives input from client (P2)
            if (data.type === 'input') {
                p2NextDir = { x: data.dx, y: data.dy };
            }
        } else {
            // Client receives state from host
            if (data.type === 'init') {
                levelMap = data.map;
                gs = data.gs;
                remainingOrbs = countOrbs(levelMap);
                showScreen(null);
                gameStarted = true;
                bgmGame.play().catch(() => {});
                drawGame();
            } else if (data.type === 'state') {
                gs = data.gs;
                levelMap = data.map;
                remainingOrbs = data.remainingOrbs;
                drawGame();
            } else if (data.type === 'gameOver') {
                isGameOver = true;
                bgmGame.pause();
                triggerGameOverUI(data.msg, data.p1Score, data.p2Score);
            } else if (data.type === 'pause') {
                isPaused = data.isPaused;
                if (isPaused) { bgmGame.pause(); showScreen('pauseScreen'); }
                else { bgmGame.play().catch(()=>{}); showScreen(null); }
            } else if (data.type === 'restart') {
                isGameOver = false; isPaused = false;
                levelMap = data.map; gs = data.gs;
                remainingOrbs = countOrbs(levelMap);
                showScreen(null);
                bgmGame.currentTime = 0;
                bgmGame.play().catch(() => {});
                drawGame();
            }
        }
    }

    function sendToClient(data) {
        if (conn && conn.open) conn.send(data);
    }

    // ── Keyboard input ────────────────────────────────────────────────────────
    window.addEventListener('keydown', (e) => {
        const key = e.key; // keep original casing for special keys

        // ── Host-only controls ────────────────────────────────────────────
        if (isHost && gameStarted) {
            if (key === 'p' || key === 'P') {
                if (!isGameOver) {
                    isPaused = !isPaused;
                    if (isPaused) { bgmGame.pause(); showScreen('pauseScreen'); }
                    else { bgmGame.play().catch(()=>{}); showScreen(null); }
                    sendToClient({ type: 'pause', isPaused });
                }
                return;
            }
            if (key === 'r' || key === 'R') {
                if (isGameOver) {
                    clearInterval(hostGameInterval);
                    resetGameState();
                    showScreen(null);
                    bgmGame.currentTime = 0;
                    bgmGame.play().catch(() => {});
                    sendToClient({ type: 'restart', map: levelMap, gs });
                    hostGameInterval = setInterval(hostTick, 150);
                }
                return;
            }
        }

        if (!gameStarted) return;

        // ── Movement (WASD + Arrow keys) ──────────────────────────────────
        let dir = null;
        if (key === 'ArrowUp'    || key === 'w') dir = {x:0,  y:-1};
        if (key === 'ArrowDown'  || key === 's') dir = {x:0,  y:1};
        if (key === 'ArrowLeft'  || key === 'a') dir = {x:-1, y:0};
        if (key === 'ArrowRight' || key === 'd') dir = {x:1,  y:0};
        if (!dir) return;

        if (isHost) {
            p1NextDir = dir;
        } else {
            if (conn && conn.open) conn.send({ type: 'input', dx: dir.x, dy: dir.y });
        }
    });

    // ── Drawing ───────────────────────────────────────────────────────────────
    function drawGame() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        frameCount++;

        // Draw map
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                let tile = levelMap[r] ? levelMap[r][c] : 0;
                let x = c * TILE_SIZE, y = r * TILE_SIZE;
                if (tile === 1) {
                    ctx.strokeStyle = '#0055ff'; ctx.lineWidth = 2;
                    ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
                } else if (tile === 2) {
                    ctx.fillStyle = '#fff'; ctx.beginPath();
                    ctx.arc(x + TILE_SIZE/2, y + TILE_SIZE/2, 2, 0, Math.PI*2); ctx.fill();
                } else if (tile === 3) {
                    ctx.fillStyle = '#fce205';
                    ctx.fillRect(x + TILE_SIZE/4+2, y + TILE_SIZE/4+2, TILE_SIZE/2-4, TILE_SIZE/2-4);
                }
            }
        }

        // Overcharge glow
        if (gs.p1.overcharge > 0) {
            ctx.save();
            ctx.globalAlpha = 0.15 * (gs.p1.overcharge / 80);
            ctx.fillStyle = '#00f0ff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
        }
        if (gs.p2.overcharge > 0) {
            ctx.save();
            ctx.globalAlpha = 0.15 * (gs.p2.overcharge / 80);
            ctx.fillStyle = '#ff00ff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
        }

        // Draw P1 (cyan ring)
        drawEntity(gs.p1.x, gs.p1.y, gs.p1.angle, sprites.player1, '#00f0ff', gs.p1.overcharge > 0);
        // Draw P2 (magenta ring)
        drawEntity(gs.p2.x, gs.p2.y, gs.p2.angle, sprites.player2, '#ff00ff', gs.p2.overcharge > 0);

        // Draw aliens
        gs.aliens.forEach(alien => {
            let sprArr = sprites[alien.sprite] || sprites.alienAStar;
            ctx.save();
            ctx.globalAlpha = 0.85;
            drawEntity(alien.x, alien.y, alien.angle, sprArr, '#ff003c', false);
            ctx.restore();
        });

        updateUI();
    }

    function drawEntity(x, y, angle, spriteArr, ringColor, charged) {
        let px = x * TILE_SIZE + TILE_SIZE/2;
        let py = y * TILE_SIZE + TILE_SIZE/2;
        let img = spriteArr[frameCount % 10 < 5 ? 0 : 1];

        ctx.save();
        ctx.translate(px, py);

        // Glow ring when overcharged
        if (charged) {
            ctx.shadowColor = ringColor;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(0, 0, TILE_SIZE/2 + 3, 0, Math.PI*2);
            ctx.strokeStyle = ringColor;
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        ctx.rotate(angle);
        if (img && img.complete && img.naturalHeight !== 0) {
            ctx.drawImage(img, -TILE_SIZE/2, -TILE_SIZE/2, TILE_SIZE, TILE_SIZE);
        } else {
            ctx.fillStyle = ringColor;
            ctx.fillRect(-10, -10, 20, 20);
        }
        ctx.restore();
    }

    function triggerGameOverUI(msg, p1Score, p2Score) {
        document.getElementById('winnerText').innerText = msg;
        document.getElementById('p1FinalScore').innerText = p1Score;
        document.getElementById('p2FinalScore').innerText = p2Score;
        showScreen('gameOverScreen');
    }

    // ── Mobile controls ───────────────────────────────────────────────────────
    function setupMobileControls() {
        const dirs = { 'btn-up':{x:0,y:-1}, 'btn-down':{x:0,y:1}, 'btn-left':{x:-1,y:0}, 'btn-right':{x:1,y:0} };
        Object.entries(dirs).forEach(([id, dir]) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (!gameStarted) return;
                if (isHost) p1NextDir = dir;
                else conn.send({ type:'input', dx:dir.x, dy:dir.y });
            });
        });
    }
    setupMobileControls();
};