window.onload = () => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    const TILE_SIZE = 30;
    const ROWS = 20;
    const COLS = 20;

    const sprites = {
        player: [new Image(), new Image()],
        alienAStar: [new Image(), new Image()],
        alienBFS: [new Image(), new Image()],
        alienUCS: [new Image(), new Image()]
    };
    
    sprites.player[0].src = 'assets/player_1.png'; 
    sprites.player[1].src = 'assets/player_2.png';
    sprites.alienAStar[0].src = 'assets/enemy_red_1.png';
    sprites.alienAStar[1].src = 'assets/enemy_red_2.png';
    sprites.alienBFS[0].src = 'assets/enemy_pink_1.png';
    sprites.alienBFS[1].src = 'assets/enemy_pink_2.png';
    sprites.alienUCS[0].src = 'assets/enemy_orange_1.png';
    sprites.alienUCS[1].src = 'assets/enemy_orange_2.png';

    const bgmGame = new Audio('assets/casual_music.mp3');
    bgmGame.loop = true;
    window.bgmGameHandle = bgmGame; 

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContext();

    function playMoveSound() {
        if (window.isMusicMuted) return;
        if (audioCtx.state === 'suspended') audioCtx.resume(); 
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

    // --- PROCEDURAL SYMMETRIC MAP GENERATOR ---
    let levelMap = [];
    function generateRandomMap() {
        let map = Array(ROWS).fill().map(() => Array(COLS).fill(1)); 

        function carve(r, c, val) {
            map[r][c] = val;
            map[r][COLS - 1 - c] = val;
            map[ROWS - 1 - r][c] = val;
            map[ROWS - 1 - r][COLS - 1 - c] = val;
        }

        // 1. Carve the main outer loop
        for(let i=1; i<10; i++) { carve(1, i, 2); carve(i, 1, 2); }

        // 2. Random procedural carving for inner paths (Slightly more open)
        for(let i=0; i<45; i++) {
            let r = Math.floor(Math.random() * 8) + 2; 
            let c = Math.floor(Math.random() * 8) + 2; 
            carve(r, c, 2);
            if (Math.random() > 0.4) carve(r, c+1, 2); else carve(r+1, c, 2);
        }

        // 3. Clear the Center Box (Alien Spawn) and Player Escape Shaft
        for(let r=8; r<=11; r++) {
            for(let c=8; c<=11; c++) { map[r][c] = 0; }
        }
        carve(12, 9, 0); carve(13, 9, 0); 

        // 4. Force Tunnel Openings on Row 9
        map[9][0] = 0; map[9][1] = 0; map[9][18] = 0; map[9][19] = 0;

        // 5. Place the 4 Big Batteries in the corners
        carve(1, 1, 3);

        return map;
    }

    function getTile(x, y) {
        if ((y === 8 || y === 12) && (x < 0 || x >= COLS)) return 0; // Wrap around tunnels
        if (y < 0 || y >= ROWS || x < 0 || x >= COLS) return 1;
        return levelMap[y][x];
    }

    // --- STATE VARIABLES ---
    let score = 0;
    let currentLevel = 1;
    let maxLevel = parseInt(localStorage.getItem('orbitalMaxLevel')) || 1; 
    let lives = 3;
    let overchargeTime = 0;
    let animationFrameCount = 0;
    
    let baseAlienSpeed = 350; // Starts very slow
    let playerSpeed = 150;

    let gameStarted = false; 
    let loopRunning = false;
    let isGameOver = false;
    let isDeadPaused = false; 
    let isWinPaused = false;

    let lastPlayerTick = 0;
    let lastAlienTick = 0;

    document.getElementById('maxLevelDisplay').innerText = maxLevel;

    function getNextMove(startX, startY, targetX, targetY, algoType) {
        const directions = [{dx: 0, dy: -1}, {dx: 1, dy: 0}, {dx: 0, dy: 1}, {dx: -1, dy: 0}];
        let bestMove = null; let minCost = Infinity;

        for (let dir of directions) {
            let nx = startX + dir.dx; let ny = startY + dir.dy;
            if (getTile(nx, ny) !== 1) {
                let wrappedNx = (nx + COLS) % COLS;
                let distX = Math.abs(targetX - wrappedNx);
                distX = Math.min(distX, COLS - distX); 
                let distY = Math.abs(targetY - ny);
                
                let heuristic = distX + distY; 
                let cost = 0;
                
                if (algoType === 'A*') cost = 1 + heuristic; 
                else if (algoType === 'BFS') cost = heuristic; 
                else if (algoType === 'UCS') cost = Math.random() * 10; // Random wandering

                if (cost < minCost) { minCost = cost; bestMove = dir; }
            }
        }
        return bestMove || {dx: 0, dy: 0};
    }

    class Player {
        constructor() { this.resetPosition(); }
        resetPosition() {
            this.x = 9; this.y = 16;
            this.prevX = 9; this.prevY = 16;
            this.dirX = 0; this.dirY = -1; 
            this.nextDirX = 0; this.nextDirY = 0;
            this.angle = 0; 
        }
        update() {
            if (getTile(this.x + this.nextDirX, this.y + this.nextDirY) !== 1) {
                this.dirX = this.nextDirX; this.dirY = this.nextDirY;
            }
            if (this.dirX === 1) this.angle = Math.PI / 2;       
            if (this.dirX === -1) this.angle = -Math.PI / 2;     
            if (this.dirY === 1) this.angle = Math.PI;           
            if (this.dirY === -1) this.angle = 0;                

            if (getTile(this.x + this.dirX, this.y + this.dirY) !== 1) {
                this.prevX = this.x; this.prevY = this.y; 
                this.x += this.dirX; this.y += this.dirY;
                
                if (this.x < 0) this.x = COLS - 1;
                if (this.x >= COLS) this.x = 0;
                playMoveSound();
            }

            if (levelMap[this.y][this.x] === 2) {
                levelMap[this.y][this.x] = 0;
                score += 10;
            } else if (levelMap[this.y][this.x] === 3) {
                levelMap[this.y][this.x] = 0;
                score += 50;
                overchargeTime = 80; 
                document.getElementById('statusDisplay').innerText = "OVERCHARGE ACTIVE";
                document.getElementById('statusDisplay').className = "overcharge";
            }
        }
        draw() {
            let px = this.x * TILE_SIZE + (TILE_SIZE / 2); 
            let py = this.y * TILE_SIZE + (TILE_SIZE / 2); 
            let frameIndex = (animationFrameCount % 10 < 5) ? 0 : 1;
            let currentSprite = sprites.player[frameIndex];

            ctx.save();
            ctx.translate(px, py); 
            ctx.rotate(this.angle); 
            if (currentSprite.complete && currentSprite.naturalHeight !== 0) {
                ctx.drawImage(currentSprite, -TILE_SIZE/2, -TILE_SIZE/2, TILE_SIZE, TILE_SIZE);
            } else {
                ctx.fillStyle = '#00f0ff';
                ctx.fillRect(-10, -10, 20, 20); 
            }
            ctx.restore(); 
        }
    }

    class Alien {
        constructor(x, y, spriteArray, algorithm) {
            this.startX = x; this.startY = y;
            this.spriteArray = spriteArray; 
            this.algorithm = algorithm;
            this.isDead = false; 
            this.resetPosition();
        }
        resetPosition() {
            this.x = this.startX; this.y = this.startY;
            this.prevX = this.startX; this.prevY = this.startY;
            this.angle = 0; 
        }
        update(playerX, playerY) {
            let targetX = playerX; let targetY = playerY;
            if (overchargeTime > 0) {
                targetX = COLS - playerX; targetY = ROWS - playerY; // Run away
            }

            let move = getNextMove(this.x, this.y, targetX, targetY, this.algorithm);
            
            if (move.dx === 1) this.angle = -Math.PI / 2;      
            if (move.dx === -1) this.angle = Math.PI / 2;      
            if (move.dy === -1) this.angle = Math.PI;          
            if (move.dy === 1) this.angle = 0;                 

            this.prevX = this.x; this.prevY = this.y; 
            this.x += move.dx; this.y += move.dy;
            
            if (this.x < 0) this.x = COLS - 1;
            if (this.x >= COLS) this.x = 0;
        }
        draw() {
            let px = this.x * TILE_SIZE + (TILE_SIZE / 2);
            let py = this.y * TILE_SIZE + (TILE_SIZE / 2);
            let frameIndex = (animationFrameCount % 10 < 5) ? 0 : 1;
            let currentSprite = this.spriteArray[frameIndex];

            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(this.angle);
            ctx.globalAlpha = (overchargeTime > 0) ? 0.5 : 1.0;

            if (currentSprite.complete && currentSprite.naturalHeight !== 0) {
                ctx.drawImage(currentSprite, -TILE_SIZE/2, -TILE_SIZE/2, TILE_SIZE, TILE_SIZE);
            } else {
                ctx.fillStyle = (this.algorithm === 'A*') ? '#ff003c' : (this.algorithm === 'BFS' ? '#ff66b2' : '#ff9900');
                ctx.fillRect(-10, -10, 20, 20);
            }
            ctx.globalAlpha = 1.0;
            ctx.restore();
        }
    }

    let player;
    let aliens = [];

    // --- DYNAMIC ALGORITHM ASSIGNMENT & SCALING ---
    function spawnAliensForLevel(level) {
        let spawnList = [];
        // Determine total number of aliens (starts at 1, maxes out at 7)
        let totalAliens = Math.min(level, 7); 
        
        let algos = ['UCS', 'BFS', 'A*'];
        let spriteRefs = [sprites.alienUCS, sprites.alienBFS, sprites.alienAStar];
        
        for(let i = 0; i < totalAliens; i++) {
            let aType = 0; // Default to wandering (UCS)
            if (level >= 2 && i % 2 === 1) aType = 1; // Introduce BFS hunters
            if (level >= 4 && i % 3 === 2) aType = 2; // Introduce A* smart hunters

            // Spawn them neatly inside the center box
            let sx = 8 + (i % 4); 
            let sy = 8 + Math.floor(i / 4);
            
            spawnList.push(new Alien(sx, sy, spriteRefs[aType], algos[aType]));
        }
        
        // Speed scaling (Base speed gets progressively faster, capped at 120ms)
        baseAlienSpeed = Math.max(120, 380 - (level * 35));
        return spawnList;
    }

    function initGame() {
        levelMap = generateRandomMap();
        score = 0;
        lives = 3;
        currentLevel = 1;
        overchargeTime = 0;
        
        isGameOver = false; isDeadPaused = false; isWinPaused = false;
        document.querySelectorAll('.overlay').forEach(el => el.classList.remove('active'));
        document.getElementById('readyScreen').classList.add('active');
        
        player = new Player();
        aliens = spawnAliensForLevel(currentLevel);
        
        updateUI();
    }

    function handlePlayerDeath() {
        lives--;
        updateUI();
        if (lives <= 0) {
            isGameOver = true;
            document.getElementById('finalScore').innerText = currentLevel;
            document.getElementById('gameOverScreen').classList.add('active');
            bgmGame.pause();
        } else {
            isDeadPaused = true;
            document.getElementById('deathScreen').classList.add('active');
        }
    }

    function checkCollisions() {
        aliens.forEach(alien => {
            let directHit = (alien.x === player.x && alien.y === player.y);
            let swapHit = (alien.x === player.prevX && alien.y === player.prevY && 
                           alien.prevX === player.x && alien.prevY === player.y);

            if (directHit || swapHit) {
                if (overchargeTime > 0) {
                    alien.isDead = true;
                    score += 200;
                } else {
                    handlePlayerDeath();
                }
            }
        });

        aliens = aliens.filter(a => !a.isDead);

        // THE WIN CONDITION: All enemies eaten!
        if (aliens.length === 0 && !isWinPaused && !isGameOver && !isDeadPaused) {
            isWinPaused = true;
            document.getElementById('levelClearedText').innerText = `SECTOR ${currentLevel} CLEARED`;
            document.getElementById('winScreen').classList.add('active');
            
            currentLevel++;
            if (currentLevel > maxLevel) {
                maxLevel = currentLevel;
                localStorage.setItem('orbitalMaxLevel', maxLevel);
                document.getElementById('maxLevelDisplay').innerText = maxLevel;
            }
        }
    }

    function updateUI() {
        document.getElementById('scoreDisplay').innerText = score;
        document.getElementById('livesDisplay').innerText = lives;
        document.getElementById('levelDisplay').innerText = currentLevel;
    }

    // Controls & Game State Triggers
    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'm') return; 

        if (!gameStarted) {
            gameStarted = true;
            document.getElementById('readyScreen').classList.remove('active');
            if (audioCtx.state === 'suspended') audioCtx.resume();
            if (!window.isMusicMuted) bgmGame.play();
            
            // Prevent multiple loops from spawning
            if (!loopRunning) {
                requestAnimationFrame(gameLoop); 
                loopRunning = true;
            }
            return;
        }

        if (isGameOver) {
            if (e.key === 'Enter') {
                initGame();
                bgmGame.currentTime = 0;
                if (!window.isMusicMuted) bgmGame.play();
            }
            if (e.key === 'Escape') window.location.href = 'index.html';
            return;
        }

        if (isDeadPaused) {
            isDeadPaused = false;
            document.getElementById('deathScreen').classList.remove('active');
            player.resetPosition();
            aliens.forEach(a => a.resetPosition());
            lastPlayerTick = performance.now();
            lastAlienTick = performance.now();
            return;
        }

        if (isWinPaused) {
            isWinPaused = false;
            document.getElementById('winScreen').classList.remove('active');
            
            levelMap = generateRandomMap();
            player.resetPosition();
            aliens = spawnAliensForLevel(currentLevel);
            
            overchargeTime = 0;
            document.getElementById('statusDisplay').innerText = "NOMINAL";
            document.getElementById('statusDisplay').className = "normal";
            updateUI();
            
            lastPlayerTick = performance.now();
            lastAlienTick = performance.now();
            return;
        }

        if (e.key === 'ArrowUp' || e.key === 'w') { player.nextDirX = 0; player.nextDirY = -1; }
        if (e.key === 'ArrowDown' || e.key === 's') { player.nextDirX = 0; player.nextDirY = 1; }
        if (e.key === 'ArrowLeft' || e.key === 'a') { player.nextDirX = -1; player.nextDirY = 0; }
        if (e.key === 'ArrowRight' || e.key === 'd') { player.nextDirX = 1; player.nextDirY = 0; }
    });

    function drawMap() {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                let tile = levelMap[r][c];
                let x = c * TILE_SIZE; let y = r * TILE_SIZE;

                if (tile === 1) { 
                    ctx.strokeStyle = '#0055ff'; ctx.lineWidth = 2;
                    ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
                } else if (tile === 2) { 
                    ctx.fillStyle = '#fff'; ctx.beginPath();
                    ctx.arc(x + TILE_SIZE/2, y + TILE_SIZE/2, 2, 0, Math.PI * 2); 
                    ctx.fill();
                } else if (tile === 3) { 
                    ctx.fillStyle = '#fce205';
                    ctx.fillRect(x + TILE_SIZE/4 + 2, y + TILE_SIZE/4 + 2, TILE_SIZE/2 - 4, TILE_SIZE/2 - 4); 
                }
            }
        }
    }

    function gameLoop(timestamp) {
        if (!gameStarted || isDeadPaused || isWinPaused || isGameOver) {
            requestAnimationFrame(gameLoop);
            return;
        }

        let currentPlayerSpeed = (overchargeTime > 0) ? 90 : playerSpeed; 
        let currentAlienSpeed = (overchargeTime > 0) ? 300 : baseAlienSpeed;
        let needsRedraw = false;

        // Player Move Tick
        if (timestamp - lastPlayerTick > currentPlayerSpeed) {
            player.update();
            lastPlayerTick = timestamp;
            needsRedraw = true;
            animationFrameCount++;
            
            if (overchargeTime > 0) {
                overchargeTime--; 
                if (overchargeTime === 0) {
                    document.getElementById('statusDisplay').innerText = "NOMINAL";
                    document.getElementById('statusDisplay').className = "normal";
                    
                    // --- THE ENDURANCE HUNT ANTI-SOFTLOCK ---
                    // If power runs out and aliens are alive, instantly respawn all 4 corner batteries
                    let hasBattery = false;
                    for(let r=0; r<ROWS; r++) {
                        for(let c=0; c<COLS; c++) {
                            if(levelMap[r][c] === 3) hasBattery = true;
                        }
                    }
                    if (!hasBattery && aliens.length > 0) {
                        levelMap[1][1] = 3; 
                        levelMap[1][COLS-2] = 3; 
                        levelMap[ROWS-2][1] = 3; 
                        levelMap[ROWS-2][COLS-2] = 3; 
                    }
                }
            }
        }

        // Alien Move Tick
        if (timestamp - lastAlienTick > currentAlienSpeed) {
            aliens.forEach(alien => alien.update(player.x, player.y));
            lastAlienTick = timestamp;
            needsRedraw = true;
        }

        checkCollisions();

        if (needsRedraw) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawMap();
            player.draw();
            aliens.forEach(alien => alien.draw());
            updateUI();
        }
        
        requestAnimationFrame(gameLoop);
    }

    initGame(); 
};