window.onload = () => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    const TILE_SIZE = 30;
    const ROWS = 20;
    const COLS = 20;

    // --- SPRITE ASSET LOADING ---
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

    // --- AUDIO SYSTEM ---
    const bgmGame = new Audio('assets/casual_music.mp3');
    bgmGame.loop = true;

    // --- LEVEL DATA ---
    const initialMap = [
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        [1,2,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,2,2,1],
        [1,3,1,1,2,1,1,1,2,1,1,2,1,1,1,2,1,1,3,1],
        [1,2,1,1,2,1,1,1,2,1,1,2,1,1,1,2,1,1,2,1],
        [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
        [1,2,1,1,2,1,2,1,1,1,1,1,1,2,1,2,1,1,2,1],
        [1,2,2,2,2,1,2,2,2,1,1,2,2,2,1,2,2,2,2,1],
        [1,1,1,1,2,1,1,1,0,1,1,0,1,1,1,2,1,1,1,1],
        [0,0,0,1,2,1,0,0,0,0,0,0,0,0,1,2,1,0,0,0], // TUNNEL ROW
        [1,1,1,1,2,1,0,1,1,0,0,1,1,0,1,2,1,1,1,1],
        [2,2,2,2,2,0,0,1,0,0,0,0,1,0,0,2,2,2,2,2],
        [1,1,1,1,2,1,0,1,1,1,1,1,1,0,1,2,1,1,1,1],
        [0,0,0,1,2,1,0,0,0,0,0,0,0,0,1,2,1,0,0,0], // TUNNEL ROW
        [1,1,1,1,2,1,2,1,1,1,1,1,1,2,1,2,1,1,1,1],
        [1,2,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,2,2,1],
        [1,3,1,1,2,1,1,1,2,1,1,2,1,1,1,2,1,1,3,1],
        [1,2,2,1,2,2,2,2,2,0,0,2,2,2,2,2,1,2,2,1],
        [1,1,2,1,2,1,2,1,1,1,1,1,1,2,1,2,1,2,1,1],
        [1,2,2,2,2,1,2,2,2,1,1,2,2,2,1,2,2,2,2,1],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
    ];
    let levelMap = [];

    function getTile(x, y) {
        // Tunnel Logic Validation
        if ((y === 8 || y === 12) && (x < 0 || x >= COLS)) return 0;
        if (y < 0 || y >= ROWS || x < 0 || x >= COLS) return 1;
        return levelMap[y][x];
    }

    // --- GAME STATE VARIABLES ---
    let score = 0;
    let highScore = localStorage.getItem('orbitalHighScore') || 0; 
    let lives = 3;
    let overchargeTime = 0;
    let animationFrameCount = 0;
    
    // State Flags
    let gameStarted = false; 
    let isGameOver = false;
    let isDeadPaused = false; 

    // Decoupled Speed Timers
    let lastPlayerTick = 0;
    let lastAlienTick = 0;

    document.getElementById('highScoreDisplay').innerText = highScore;

    function getNextMove(startX, startY, targetX, targetY, algoType) {
        const directions = [{dx: 0, dy: -1}, {dx: 1, dy: 0}, {dx: 0, dy: 1}, {dx: -1, dy: 0}];
        let bestMove = null; let minCost = Infinity;

        for (let dir of directions) {
            let nx = startX + dir.dx; let ny = startY + dir.dy;
            if (getTile(nx, ny) !== 1) {
                let cost = 0;
                // Tunnel math fix for pathfinding so they don't get confused by edge wraps
                let wrappedNx = (nx + COLS) % COLS;
                let heuristic = Math.abs(targetX - wrappedNx) + Math.abs(targetY - ny); 
                
                if (algoType === 'A*') cost = 1 + heuristic; 
                else if (algoType === 'BFS') cost = heuristic; 
                else if (algoType === 'UCS') cost = Math.random() * 10; 

                if (cost < minCost) { minCost = cost; bestMove = dir; }
            }
        }
        return bestMove || {dx: 0, dy: 0};
    }

    // --- ENTITIES ---
    class Player {
        constructor() { this.resetPosition(); }
        
        resetPosition() {
            this.x = 9; this.y = 16;
            this.dirX = 0; this.dirY = -1; // Default moving UP
            this.nextDirX = 0; this.nextDirY = 0;
            this.angle = 0; // 0 radians = UP for player
        }

        update() {
            if (getTile(this.x + this.nextDirX, this.y + this.nextDirY) !== 1) {
                this.dirX = this.nextDirX; this.dirY = this.nextDirY;
            }

            // Calculate rotation angle based on UP being the default image
            if (this.dirX === 1) this.angle = Math.PI / 2;       // Right
            if (this.dirX === -1) this.angle = -Math.PI / 2;     // Left
            if (this.dirY === 1) this.angle = Math.PI;           // Down
            if (this.dirY === -1) this.angle = 0;                // Up

            if (getTile(this.x + this.dirX, this.y + this.dirY) !== 1) {
                this.x += this.dirX; this.y += this.dirY;
                
                // Perfect Tunnel Wrap Logic
                if (this.x < 0) this.x = COLS - 1;
                if (this.x >= COLS) this.x = 0;
            }

            if (levelMap[this.y][this.x] === 2) {
                levelMap[this.y][this.x] = 0;
                score += 10;
            } else if (levelMap[this.y][this.x] === 3) {
                levelMap[this.y][this.x] = 0;
                score += 50;
                overchargeTime = 50; // Increased duration slightly
                document.getElementById('statusDisplay').innerText = "OVERCHARGE ACTIVE";
                document.getElementById('statusDisplay').className = "overcharge";
            }
        }

        draw() {
            let px = this.x * TILE_SIZE + (TILE_SIZE / 2); // Center X
            let py = this.y * TILE_SIZE + (TILE_SIZE / 2); // Center Y
            let frameIndex = (animationFrameCount % 10 < 5) ? 0 : 1;
            let currentSprite = sprites.player[frameIndex];

            ctx.save();
            ctx.translate(px, py); // Move canvas origin to center of player
            ctx.rotate(this.angle); // Rotate canvas

            if (currentSprite.complete && currentSprite.naturalHeight !== 0) {
                // Draw image offset by half size so it centers on the translated point
                ctx.drawImage(currentSprite, -TILE_SIZE/2, -TILE_SIZE/2, TILE_SIZE, TILE_SIZE);
            } else {
                ctx.fillStyle = '#00f0ff';
                ctx.fillRect(-10, -10, 20, 20); // Fallback box
            }
            ctx.restore(); // Reset canvas rotation/translation for the next object
        }
    }

    class Alien {
        constructor(x, y, spriteArray, algorithm) {
            this.startX = x; this.startY = y;
            this.spriteArray = spriteArray; 
            this.algorithm = algorithm;
            this.resetPosition();
        }

        resetPosition() {
            this.x = this.startX; 
            this.y = this.startY;
            this.respawnDelay = 0;
            this.angle = 0; // 0 radians = DOWN for enemy based on your image
        }

        update(playerX, playerY) {
            if (this.respawnDelay > 0) {
                this.respawnDelay--;
                return;
            }

            let targetX = playerX; let targetY = playerY;
            
            if (overchargeTime > 0) {
                targetX = COLS - playerX; targetY = ROWS - playerY;
            }

            let move = getNextMove(this.x, this.y, targetX, targetY, this.algorithm);
            
            // Calculate rotation angle based on DOWN being the default image
            if (move.dx === 1) this.angle = -Math.PI / 2;      // Right
            if (move.dx === -1) this.angle = Math.PI / 2;      // Left
            if (move.dy === -1) this.angle = Math.PI;          // Up
            if (move.dy === 1) this.angle = 0;                 // Down (Default)

            this.x += move.dx; this.y += move.dy;
            
            // Tunnel wrap for aliens
            if (this.x < 0) this.x = COLS - 1;
            if (this.x >= COLS) this.x = 0;

            if (this.x === player.x && this.y === player.y) {
                if (overchargeTime > 0) {
                    score += 200;
                    this.resetPosition();
                    this.respawnDelay = 15; 
                } else {
                    handlePlayerDeath();
                }
            }
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
                ctx.fillStyle = '#ff003c';
                ctx.fillRect(-10, -10, 20, 20);
            }
            ctx.globalAlpha = 1.0;
            ctx.restore();
        }
    }

    let player;
    let aliens = [];

    function initGame() {
        levelMap = JSON.parse(JSON.stringify(initialMap)); 
        score = 0;
        lives = 3;
        overchargeTime = 0;
        isGameOver = false;
        isDeadPaused = false;
        document.getElementById('gameOverScreen').classList.remove('active');
        document.getElementById('deathScreen').classList.remove('active');
        
        player = new Player();
        aliens = [
            new Alien(9, 9, sprites.alienAStar, 'A*'),   
            new Alien(10, 9, sprites.alienBFS, 'BFS'), 
            new Alien(9, 10, sprites.alienUCS, 'UCS')  
        ];
        updateUI();
        drawMap();
    }

    function handlePlayerDeath() {
        lives--;
        updateUI();
        if (lives <= 0) {
            isGameOver = true;
            if (score > highScore) {
                highScore = score;
                localStorage.setItem('orbitalHighScore', highScore);
            }
            document.getElementById('finalScore').innerText = score;
            document.getElementById('highScoreDisplay').innerText = highScore;
            document.getElementById('gameOverScreen').classList.add('active');
            bgmGame.pause();
        } else {
            // TRIGGER DEATH PAUSE
            isDeadPaused = true;
            document.getElementById('deathScreen').classList.add('active');
        }
    }

    function updateUI() {
        document.getElementById('scoreDisplay').innerText = score;
        document.getElementById('livesDisplay').innerText = lives;
    }

    document.addEventListener('keydown', (e) => {
        if (!gameStarted) {
            gameStarted = true;
            document.getElementById('readyScreen').classList.remove('active');
            bgmGame.play();
            requestAnimationFrame(gameLoop); 
            return;
        }

        if (isGameOver) {
            if (e.key === 'Enter') {
                initGame();
                bgmGame.currentTime = 0;
                bgmGame.play();
            }
            if (e.key === 'Escape') window.location.href = 'index.html';
            return;
        }

        // UNPAUSE AFTER DEATH
        if (isDeadPaused) {
            isDeadPaused = false;
            document.getElementById('deathScreen').classList.remove('active');
            player.resetPosition();
            aliens.forEach(a => a.resetPosition());
            // Reset timers so they don't jump instantly
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
        if (!gameStarted || isDeadPaused || isGameOver) {
            requestAnimationFrame(gameLoop);
            return;
        }

        // SPEED LOGIC: Player is faster, enemies are slower during overcharge
        let playerTickRate = (overchargeTime > 0) ? 100 : 160; 
        let alienTickRate = (overchargeTime > 0) ? 220 : 160;

        let needsRedraw = false;

        // Player Move Loop
        if (timestamp - lastPlayerTick > playerTickRate) {
            player.update();
            lastPlayerTick = timestamp;
            needsRedraw = true;
            animationFrameCount++;
        }

        // Alien Move Loop
        if (timestamp - lastAlienTick > alienTickRate) {
            aliens.forEach(alien => alien.update(player.x, player.y));
            lastAlienTick = timestamp;
            needsRedraw = true;
        }

        // Only redraw if someone actually moved
        if (needsRedraw) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            if (overchargeTime > 0) {
                overchargeTime--; // This now ticks down with the player's movement
                if (overchargeTime === 0) {
                    document.getElementById('statusDisplay').innerText = "NOMINAL";
                    document.getElementById('statusDisplay').className = "normal";
                }
            }

            drawMap();
            player.draw();
            aliens.forEach(alien => alien.draw());
            updateUI();
        }
        
        requestAnimationFrame(gameLoop);
    }

    initGame(); 
};