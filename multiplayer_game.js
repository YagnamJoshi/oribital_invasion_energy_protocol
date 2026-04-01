window.onload = () => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    const TILE_SIZE = 30;
    const COLS = 30; 
    const ROWS = 20;

    const sprites = {
        player1: [new Image(), new Image()],
        player2: [new Image(), new Image()], 
        alien: [new Image(), new Image()]
    };
    
    sprites.player1[0].src = 'assets/player_1.png'; 
    sprites.player1[1].src = 'assets/player_2.png';
    sprites.player2[0].src = 'assets/player_1.png'; 
    sprites.player2[1].src = 'assets/player_2.png';
    sprites.alien[0].src = 'assets/enemy_red_1.png';
    sprites.alien[1].src = 'assets/enemy_red_2.png';

    // --- AUDIO SETUP ---
    const bgmGame = new Audio('assets/casual_music.mp3');
    bgmGame.loop = true;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContext();

    function playMoveSound() {
        if (audioCtx.state === 'suspended') return; // Failsafe
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.type = 'triangle'; 
        osc.frequency.setValueAtTime(300, audioCtx.currentTime); 
        osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.1); 
        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime); 
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1); 
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.1); 
    }

    // --- GAME STATE ---
    let levelMap = [];
    let remainingOrbs = 0;
    
    let state = {
        p1: { x: 2, y: 2, angle: 0, score: 0 },
        p2: { x: COLS - 3, y: ROWS - 3, angle: 0, score: 0 },
        aliens: []
    };

    let isHost = false;
    let peer = null;
    let conn = null;
    let isPaused = false;
    let isGameOver = false;

    // --- MAP GENERATION ---
    function generateMap() {
        levelMap = Array(ROWS).fill().map(() => Array(COLS).fill(2)); 
        remainingOrbs = 0;
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) levelMap[r][c] = 1;
                else if (r % 4 === 0 && c % 4 === 0) levelMap[r][c] = 1; 
                else if (Math.random() > 0.85) levelMap[r][c] = 1;
            }
        }
        levelMap[2][2] = 3; levelMap[2][COLS-3] = 3;
        levelMap[ROWS-3][2] = 3; levelMap[ROWS-3][COLS-3] = 3;

        levelMap[2][2] = 0; levelMap[2][3] = 0; levelMap[3][2] = 0;
        levelMap[ROWS-3][COLS-3] = 0; levelMap[ROWS-3][COLS-4] = 0; levelMap[ROWS-4][COLS-3] = 0;

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (levelMap[r][c] === 2 || levelMap[r][c] === 3) remainingOrbs++;
            }
        }
    }

    function resetGameState() {
        state.p1 = { x: 2, y: 2, angle: 0, score: 0 };
        state.p2 = { x: COLS - 3, y: ROWS - 3, angle: 0, score: 0 };
        state.aliens = [];
        for(let i=0; i<6; i++) {
            state.aliens.push({ x: Math.floor(COLS/2), y: Math.floor(ROWS/2) });
        }
        isGameOver = false;
        isPaused = false;
        document.getElementById('gameOverScreen').classList.remove('active');
        document.getElementById('pauseScreen').classList.remove('active');
    }

    // --- P2P NETWORKING LOGIC ---
    function initPeer() {
        if (audioCtx.state === 'suspended') audioCtx.resume(); // Resume audio context on user interaction
        
        peer = new Peer(null, { debug: 2 });
        peer.on('open', (id) => {
            if (isHost) {
                document.getElementById('hostIdDisplay').innerText = `Your Host Code: ${id}`;
                document.getElementById('hostIdDisplay').style.display = 'block';
            }
        });

        peer.on('connection', (connection) => {
            if (isHost) {
                conn = connection;
                setupHostGame();
            }
        });
    }

    document.getElementById('btnHost').addEventListener('click', () => {
        isHost = true;
        initPeer();
        document.getElementById('btnHost').disabled = true;
        document.getElementById('btnJoin').disabled = true;
    });

    document.getElementById('btnJoin').addEventListener('click', () => {
        const code = document.getElementById('joinCodeInput').value.trim();
        if (!code) return;
        initPeer();
        setTimeout(() => {
            conn = peer.connect(code);
            conn.on('open', () => {
                document.getElementById('connectionStatus').innerText = "Connected! Waiting for host...";
                setupClientGame();
            });
            conn.on('error', (err) => {
                document.getElementById('connectionStatus').innerText = "Connection failed.";
            });
        }, 1000);
    });

    // --- HOST AUTHORITATIVE LOGIC ---
    function setupHostGame() {
        document.getElementById('multiplayerMenu').classList.remove('active');
        bgmGame.play();
        generateMap();
        resetGameState();

        conn.send({ type: 'init', map: levelMap, state: state });

        let p2NextDir = { x: 0, y: 0 };
        conn.on('data', (data) => {
            if (data.type === 'input') p2NextDir = { x: data.dx, y: data.dy };
        });

        let p1NextDir = { x: 0, y: 0 };
        
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            
            // Host UI Controls
            if (key === 'p' && !isGameOver) {
                isPaused = !isPaused;
                if (isPaused) bgmGame.pause(); else bgmGame.play();
                document.getElementById('pauseScreen').classList.toggle('active', isPaused);
                conn.send({ type: 'pause', isPaused: isPaused });
                return;
            }
            if ((key === 'r' || (isGameOver && key === 'enter'))) {
                generateMap();
                resetGameState();
                conn.send({ type: 'restart', map: levelMap, state: state });
                return;
            }

            // Movement
            if (key === 'arrowup' || key === 'w') p1NextDir = { x: 0, y: -1 };
            if (key === 'arrowdown' || key === 's') p1NextDir = { x: 0, y: 1 };
            if (key === 'arrowleft' || key === 'a') p1NextDir = { x: -1, y: 0 };
            if (key === 'arrowright' || key === 'd') p1NextDir = { x: 1, y: 0 };
        });

        setupMobileControls((dx, dy) => { p1NextDir = { x: dx, y: dy }; });

        setInterval(() => {
            if (isPaused || isGameOver) return;

            updatePlayer('p1', p1NextDir);
            updatePlayer('p2', p2NextDir);
            
            state.aliens.forEach(alien => {
                if (Math.random() > 0.8) {
                    alien.dx = (Math.random() > 0.5 ? 1 : -1) * (Math.random() > 0.5 ? 1 : 0);
                    alien.dy = alien.dx === 0 ? (Math.random() > 0.5 ? 1 : -1) : 0;
                }
                if (levelMap[alien.y + (alien.dy||0)] && levelMap[alien.y + (alien.dy||0)][alien.x + (alien.dx||0)] !== 1) {
                    alien.x += alien.dx || 0; alien.y += alien.dy || 0;
                }
            });

            checkCollisions();
            checkWinCondition();

            conn.send({ type: 'state', state: state });
            drawGame();
        }, 150); 
    }

    function updatePlayer(pKey, nextDir) {
        let p = state[pKey];
        if (levelMap[p.y + nextDir.y] && levelMap[p.y + nextDir.y][p.x + nextDir.x] !== 1) {
            if (nextDir.x !== 0 || nextDir.y !== 0) {
                p.x += nextDir.x; p.y += nextDir.y;
                playMoveSound(); // Trigger sound on successful move
                
                if (nextDir.x === 1) p.angle = Math.PI / 2;
                if (nextDir.x === -1) p.angle = -Math.PI / 2;
                if (nextDir.y === 1) p.angle = Math.PI;
                if (nextDir.y === -1) p.angle = 0;
            }
        }

        if (levelMap[p.y][p.x] === 2) {
            levelMap[p.y][p.x] = 0; p.score += 10; remainingOrbs--;
            conn.send({ type: 'mapUpdate', x: p.x, y: p.y, val: 0 }); 
        } else if (levelMap[p.y][p.x] === 3) {
            levelMap[p.y][p.x] = 0; p.score += 50; remainingOrbs--;
            conn.send({ type: 'mapUpdate', x: p.x, y: p.y, val: 0 });
        }
    }

    function checkCollisions() {
        state.aliens.forEach(a => {
            if ((a.x === state.p1.x && a.y === state.p1.y)) state.p1.score = Math.max(0, state.p1.score - 100);
            if ((a.x === state.p2.x && a.y === state.p2.y)) state.p2.score = Math.max(0, state.p2.score - 100);
        });
    }

    function checkWinCondition() {
        if (remainingOrbs <= 0) {
            isGameOver = true;
            let msg = state.p1.score > state.p2.score ? "PLAYER 1 WINS!" : (state.p2.score > state.p1.score ? "PLAYER 2 WINS!" : "TIE GAME!");
            conn.send({ type: 'gameOver', msg: msg, p1Score: state.p1.score, p2Score: state.p2.score });
            triggerGameOverUI(msg, state.p1.score, state.p2.score);
        }
    }

    // --- CLIENT LOGIC ---
    function setupClientGame() {
        document.getElementById('multiplayerMenu').classList.remove('active');
        bgmGame.play();
        
        let clientNextDir = { x: 0, y: 0 };

        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            if (key === 'arrowup' || key === 'w') clientNextDir = { x: 0, y: -1 };
            if (key === 'arrowdown' || key === 's') clientNextDir = { x: 0, y: 1 };
            if (key === 'arrowleft' || key === 'a') clientNextDir = { x: -1, y: 0 };
            if (key === 'arrowright' || key === 'd') clientNextDir = { x: 1, y: 0 };
            conn.send({ type: 'input', dx: clientNextDir.x, dy: clientNextDir.y });
        });

        setupMobileControls((dx, dy) => { 
            conn.send({ type: 'input', dx: dx, dy: dy }); 
        });

        conn.on('data', (data) => {
            if (data.type === 'init' || data.type === 'restart') {
                levelMap = data.map;
                state = data.state;
                isGameOver = false;
                isPaused = false;
                document.getElementById('gameOverScreen').classList.remove('active');
                document.getElementById('pauseScreen').classList.remove('active');
            } else if (data.type === 'state') {
                let oldP1x = state.p1.x; let oldP2x = state.p2.x;
                state = data.state;
                // Play sound if position changed
                if (oldP1x !== state.p1.x || oldP2x !== state.p2.x) playMoveSound();
                drawGame();
            } else if (data.type === 'mapUpdate') {
                levelMap[data.y][data.x] = data.val;
            } else if (data.type === 'pause') {
                isPaused = data.isPaused;
                if (isPaused) bgmGame.pause(); else bgmGame.play();
                document.getElementById('pauseScreen').classList.toggle('active', isPaused);
            } else if (data.type === 'gameOver') {
                isGameOver = true;
                triggerGameOverUI(data.msg, data.p1Score, data.p2Score);
            }
        });
    }

    // --- SHARED DRAWING & UI ---
    let frameCount = 0;
    function drawGame() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        frameCount++;

        let localRemaining = 0;
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                let tile = levelMap[r] ? levelMap[r][c] : 0;
                let x = c * TILE_SIZE; let y = r * TILE_SIZE;
                if (tile === 1) { 
                    ctx.strokeStyle = '#0055ff'; ctx.lineWidth = 2; ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
                } else if (tile === 2) { 
                    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + TILE_SIZE/2, y + TILE_SIZE/2, 2, 0, Math.PI*2); ctx.fill();
                    localRemaining++;
                } else if (tile === 3) { 
                    ctx.fillStyle = '#fce205'; ctx.fillRect(x + TILE_SIZE/4+2, y + TILE_SIZE/4+2, TILE_SIZE/2-4, TILE_SIZE/2-4); 
                    localRemaining++;
                }
            }
        }

        document.getElementById('p1ScoreDisplay').innerText = state.p1.score;
        document.getElementById('p2ScoreDisplay').innerText = state.p2.score;
        document.getElementById('orbsDisplay').innerText = localRemaining;

        drawEntity(state.p1.x, state.p1.y, state.p1.angle, sprites.player1, '#00f0ff');
        drawEntity(state.p2.x, state.p2.y, state.p2.angle, sprites.player2, '#ff00ff');

        state.aliens.forEach(a => {
            drawEntity(a.x, a.y, 0, sprites.alien, '#ff003c');
        });
    }

    function drawEntity(x, y, angle, spriteArr, fallbackColor) {
        let px = x * TILE_SIZE + (TILE_SIZE / 2); 
        let py = y * TILE_SIZE + (TILE_SIZE / 2); 
        let img = spriteArr[frameCount % 10 < 5 ? 0 : 1];

        ctx.save(); ctx.translate(px, py); ctx.rotate(angle);
        if (img.complete && img.naturalHeight !== 0) {
            ctx.drawImage(img, -TILE_SIZE/2, -TILE_SIZE/2, TILE_SIZE, TILE_SIZE);
        } else {
            ctx.fillStyle = fallbackColor; ctx.fillRect(-10, -10, 20, 20); 
        }
        ctx.restore();
    }

    function triggerGameOverUI(msg, p1Score, p2Score) {
        document.getElementById('winnerText').innerText = msg;
        document.getElementById('p1FinalScore').innerText = p1Score;
        document.getElementById('p2FinalScore').innerText = p2Score;
        document.getElementById('gameOverScreen').classList.add('active');
    }

    function setupMobileControls(callback) {
        const bindTouch = (id, dx, dy) => {
            document.getElementById(id).addEventListener('touchstart', (e) => {
                e.preventDefault(); callback(dx, dy);
            });
        };
        bindTouch('btn-up', 0, -1); bindTouch('btn-down', 0, 1);
        bindTouch('btn-left', -1, 0); bindTouch('btn-right', 1, 0);
    }
};