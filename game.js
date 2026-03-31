window.onload = () => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    const TILE_SIZE = 30;
    const ROWS = 20;
    const COLS = 20;

    const levelMap = [
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        [1,2,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,2,2,1],
        [1,3,1,1,2,1,1,1,2,1,1,2,1,1,1,2,1,1,3,1],
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
        [1,3,1,1,2,1,1,1,2,1,1,2,1,1,1,2,1,1,3,1],
        [1,2,2,1,2,2,2,2,2,0,0,2,2,2,2,2,1,2,2,1],
        [1,1,2,1,2,1,2,1,1,1,1,1,1,2,1,2,1,2,1,1],
        [1,2,2,2,2,1,2,2,2,1,1,2,2,2,1,2,2,2,2,1],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
    ];

    // --- SAFE TILE CHECK ---
    // This prevents the game loop from crashing if an entity looks outside the array
    function getTile(x, y) {
        // Allow the specific wrap-around tunnels on rows 8 and 12
        if ((y === 8 || y === 12) && (x < 0 || x >= COLS)) return 0;
        // Treat all other out-of-bounds checks as a solid wall
        if (y < 0 || y >= ROWS || x < 0 || x >= COLS) return 1;
        return levelMap[y][x];
    }

    let score = 0;
    let overchargeTime = 0;
    let gameOver = false;

    // --- UTILITY: Grid Pathfinding ---
    function getNextMove(startX, startY, targetX, targetY, algoType) {
        const directions = [{dx: 0, dy: -1}, {dx: 1, dy: 0}, {dx: 0, dy: 1}, {dx: -1, dy: 0}];
        let bestMove = null;
        let minCost = Infinity;

        for (let dir of directions) {
            let nx = startX + dir.dx;
            let ny = startY + dir.dy;

            // Safe bound checking
            if (getTile(nx, ny) !== 1) {
                let cost = 0;
                let heuristic = Math.abs(targetX - nx) + Math.abs(targetY - ny); 

                if (algoType === 'A*') cost = 1 + heuristic; 
                else if (algoType === 'BFS') cost = heuristic; 
                else if (algoType === 'UCS') cost = Math.random() * 10; 

                if (cost < minCost) {
                    minCost = cost;
                    bestMove = dir;
                }
            }
        }
        return bestMove || {dx: 0, dy: 0};
    }

    // --- ENTITIES ---
    class Player {
        constructor() {
            this.x = 9; this.y = 16;
            this.dirX = 0; this.dirY = 0;
            this.nextDirX = 0; this.nextDirY = 0;
        }

        update() {
            // Check next intended direction safely
            if (getTile(this.x + this.nextDirX, this.y + this.nextDirY) !== 1) {
                this.dirX = this.nextDirX;
                this.dirY = this.nextDirY;
            }

            // Move if not hitting a wall
            if (getTile(this.x + this.dirX, this.y + this.dirY) !== 1) {
                this.x += this.dirX;
                this.y += this.dirY;
                
                // Screen wrap logic
                if (this.x < 0) this.x = COLS - 1;
                if (this.x >= COLS) this.x = 0;
            }

            // Eat items
            if (levelMap[this.y][this.x] === 2) {
                levelMap[this.y][this.x] = 0;
                score += 10;
            } else if (levelMap[this.y][this.x] === 3) {
                levelMap[this.y][this.x] = 0;
                score += 50;
                overchargeTime = 30; 
                document.getElementById('statusDisplay').innerText = "OVERCHARGE ACTIVE";
                document.getElementById('statusDisplay').className = "overcharge";
            }
        }

        draw() {
            ctx.fillStyle = '#00f0ff';
            ctx.beginPath();
            ctx.arc(this.x * TILE_SIZE + TILE_SIZE/2, this.y * TILE_SIZE + TILE_SIZE/2, TILE_SIZE/2.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    class Alien {
        constructor(x, y, color, algorithm) {
            this.startX = x; this.startY = y;
            this.x = x; this.y = y;
            this.color = color;
            this.algorithm = algorithm;
            this.isEaten = false;
        }

        update(playerX, playerY) {
            if (this.isEaten) {
                if (this.x === this.startX && this.y === this.startY) {
                    this.isEaten = false;
                } else {
                    let move = getNextMove(this.x, this.y, this.startX, this.startY, 'A*');
                    this.x += move.dx; this.y += move.dy;
                }
                return;
            }

            let targetX = playerX;
            let targetY = playerY;

            if (overchargeTime > 0) {
                targetX = COLS - playerX; 
                targetY = ROWS - playerY;
            }

            let move = getNextMove(this.x, this.y, targetX, targetY, this.algorithm);
            this.x += move.dx;
            this.y += move.dy;

            if (this.x === player.x && this.y === player.y) {
                if (overchargeTime > 0) {
                    this.isEaten = true;
                    score += 200;
                } else {
                    gameOver = true;
                }
            }
        }

        draw() {
            ctx.fillStyle = this.isEaten ? 'rgba(255,255,255,0.2)' : (overchargeTime > 0 ? '#1e3a8a' : this.color);
            ctx.fillRect(this.x * TILE_SIZE + 4, this.y * TILE_SIZE + 4, TILE_SIZE - 8, TILE_SIZE - 8);
            ctx.fillStyle = '#fff';
            ctx.font = '10px Courier';
            ctx.fillText(this.algoText(), this.x * TILE_SIZE + 6, this.y * TILE_SIZE + 18);
        }

        algoText() {
            if(this.algorithm === 'A*') return 'A*';
            if(this.algorithm === 'BFS') return 'BF';
            if(this.algorithm === 'UCS') return 'UC';
        }
    }

    // --- SETUP & RENDERER ---
    const player = new Player();
    const aliens = [
        new Alien(9, 9, '#ff003c', 'A*'),   
        new Alien(10, 9, '#ff00ff', 'BFS'), 
        new Alien(9, 10, '#ff8c00', 'UCS')  
    ];

    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp' || e.key === 'w') { player.nextDirX = 0; player.nextDirY = -1; }
        if (e.key === 'ArrowDown' || e.key === 's') { player.nextDirX = 0; player.nextDirY = 1; }
        if (e.key === 'ArrowLeft' || e.key === 'a') { player.nextDirX = -1; player.nextDirY = 0; }
        if (e.key === 'ArrowRight' || e.key === 'd') { player.nextDirX = 1; player.nextDirY = 0; }
    });

    function drawMap() {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                let tile = levelMap[r][c];
                let x = c * TILE_SIZE;
                let y = r * TILE_SIZE;

                if (tile === 1) { 
                    ctx.strokeStyle = '#0055ff';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
                } else if (tile === 2) { 
                    ctx.fillStyle = '#fff';
                    ctx.beginPath();
                    ctx.arc(x + TILE_SIZE/2, y + TILE_SIZE/2, 3, 0, Math.PI * 2);
                    ctx.fill();
                } else if (tile === 3) { 
                    ctx.fillStyle = '#fce205';
                    ctx.fillRect(x + TILE_SIZE/4, y + TILE_SIZE/4, TILE_SIZE/2, TILE_SIZE/2);
                }
            }
        }
    }

    let lastTick = 0;
    const tickRate = 150; 

    function gameLoop(timestamp) {
        if (gameOver) {
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(0,0, canvas.width, canvas.height);
            ctx.fillStyle = '#ff003c';
            ctx.font = '40px Courier';
            ctx.textAlign = 'center';
            ctx.fillText("SYSTEM FAILURE", canvas.width/2, canvas.height/2);
            return;
        }

        if (!lastTick || timestamp - lastTick > tickRate) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            player.update();
            aliens.forEach(alien => alien.update(player.x, player.y));
            
            if (overchargeTime > 0) {
                overchargeTime--;
                if (overchargeTime === 0) {
                    document.getElementById('statusDisplay').innerText = "NOMINAL";
                    document.getElementById('statusDisplay').className = "normal";
                }
            }

            drawMap();
            player.draw();
            aliens.forEach(alien => alien.draw());
            document.getElementById('scoreDisplay').innerText = score;
            
            lastTick = timestamp;
        }
        requestAnimationFrame(gameLoop);
    }

    // Paint the very first frame instantly before the loop takes over
    drawMap();
    player.draw();
    aliens.forEach(alien => alien.draw());
    requestAnimationFrame(gameLoop);
};