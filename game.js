window.onload = () => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    const TILE_SIZE = 30;
    const ROWS = 20;
    const COLS = 20;

    // --- GAME STATE MANAGER ---
    let currentState = 'START'; // START, MENU, PLAYING, GAMEOVER
    let menuIndex = 0;
    let musicEnabled = true;

    // --- AUDIO SYSTEM ---
    const AudioController = {
        // REPLACE THESE with your actual file paths (e.g., 'assets/start.mp3')
        bgmStart: new Audio('start_music.mp3'), 
        bgmMenu: new Audio('menu_music.mp3'),
        bgmGame: new Audio('casual_music.mp3'),
        currentTrack: null,
        
        init() {
            [this.bgmStart, this.bgmMenu, this.bgmGame].forEach(track => track.loop = true);
        },
        
        playTrack(trackName) {
            if (!musicEnabled) return;
            if (this.currentTrack) this.currentTrack.pause();
            
            if (trackName === 'START') this.currentTrack = this.bgmStart;
            else if (trackName === 'MENU') this.currentTrack = this.bgmMenu;
            else if (trackName === 'GAME') this.currentTrack = this.bgmGame;
            
            if (this.currentTrack) {
                this.currentTrack.currentTime = 0;
                this.currentTrack.play().catch(e => console.log("Audio play prevented by browser interaction rules."));
            }
        },

        stopAll() {
            if (this.currentTrack) this.currentTrack.pause();
        },

        // 8-bit Synth SFX Generator
        playSFX(type) {
            if (!musicEnabled) return;
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            if (type === 'menu_move') {
                oscillator.type = 'square';
                oscillator.frequency.setValueAtTime(400, audioCtx.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.1);
                gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
                oscillator.start(); oscillator.stop(audioCtx.currentTime + 0.1);
            } else if (type === 'eat_orb') {
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
                gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
                oscillator.start(); oscillator.stop(audioCtx.currentTime + 0.05);
            } else if (type === 'eat_alien') {
                oscillator.type = 'sawtooth';
                oscillator.frequency.setValueAtTime(200, audioCtx.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.2);
                gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
                oscillator.start(); oscillator.stop(audioCtx.currentTime + 0.2);
            } else if (type === 'death') {
                oscillator.type = 'triangle';
                oscillator.frequency.setValueAtTime(300, audioCtx.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.5);
                gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
                oscillator.start(); oscillator.stop(audioCtx.currentTime + 0.5);
            }
        }
    };
    AudioController.init();

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
    let levelMap = [];

    function getTile(x, y) {
        if ((y === 8 || y === 12) && (x < 0 || x >= COLS)) return 0;
        if (y < 0 || y >= ROWS || x < 0 || x >= COLS) return 1;
        return levelMap[y][x];
    }

    let score = 0;
    let lives = 3;
    let overchargeTime = 0;
    let animationFrameCount = 0;

    function getNextMove(startX, startY, targetX, targetY, algoType) {
        const directions = [{dx: 0, dy: -1}, {dx: 1, dy: 0}, {dx: 0, dy: 1}, {dx: -1, dy: 0}];
        let bestMove = null; let minCost = Infinity;

        for (let dir of directions) {
            let nx = startX + dir.dx; let ny = startY + dir.dy;
            if (getTile(nx, ny) !== 1) {
                let cost = 0;
                let heuristic = Math.abs(targetX - nx) + Math.abs(targetY - ny); 
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
            this.dirX = 0; this.dirY = 0;
            this.nextDirX = 0; this.nextDirY = 0;
        }

        update() {
            if (getTile(this.x + this.nextDirX, this.y + this.nextDirY) !== 1) {
                this.dirX = this.nextDirX; this.dirY = this.nextDirY;
            }

            if (getTile(this.x + this.dirX, this.y + this.dirY) !== 1) {
                this.x += this.dirX; this.y += this.dirY;
                if (this.x < 0) this.x = COLS - 1;
                if (this.x >= COLS) this.x = 0;
            }

            if (levelMap[this.y][this.x] === 2) {
                levelMap[this.y][this.x] = 0;
                score += 10;
                AudioController.playSFX('eat_orb');
            } else if (levelMap[this.y][this.x] === 3) {
                levelMap[this.y][this.x] = 0;
                score += 50;
                overchargeTime = 40; 
                document.getElementById('statusDisplay').innerText = "OVERCHARGE ACTIVE";
                document.getElementById('statusDisplay').className = "overcharge";
                AudioController.playSFX('eat_alien'); // Uses similar power-up sound
            }
        }

        draw() {
            let px = this.x * TILE_SIZE + TILE_SIZE/2;
            let py = this.y * TILE_SIZE + TILE_SIZE/2;
            
            // Animated Pac-Man style mouth (smaller radius)
            let radius = (TILE_SIZE / 2) - 4; // Made smaller here
            let mouthOpen = (animationFrameCount % 10 < 5) ? 0.2 : 0; 
            
            let angle = 0;
            if (this.dirX === 1) angle = 0;
            else if (this.dirX === -1) angle = Math.PI;
            else if (this.dirY === 1) angle = Math.PI / 2;
            else if (this.dirY === -1) angle = -Math.PI / 2;

            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(angle);
            ctx.fillStyle = '#00f0ff';
            ctx.beginPath();
            ctx.arc(0, 0, radius, mouthOpen * Math.PI, (2 - mouthOpen) * Math.PI);
            ctx.lineTo(0,0);
            ctx.fill();
            ctx.restore();
        }
    }

    class Alien {
        constructor(x, y, color, algorithm) {
            this.startX = x; this.startY = y;
            this.color = color; this.algorithm = algorithm;
            this.resetPosition();
        }

        resetPosition() {
            this.x = this.startX; this.y = this.startY;
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

            let targetX = playerX; let targetY = playerY;
            if (overchargeTime > 0) {
                targetX = COLS - playerX; targetY = ROWS - playerY;
            }

            let move = getNextMove(this.x, this.y, targetX, targetY, this.algorithm);
            this.x += move.dx; this.y += move.dy;

            if (this.x === player.x && this.y === player.y) {
                if (overchargeTime > 0) {
                    this.isEaten = true;
                    score += 200;
                    AudioController.playSFX('eat_alien');
                } else {
                    handlePlayerDeath();
                }
            }
        }

        draw() {
            let px = this.x * TILE_SIZE + TILE_SIZE/2;
            let py = this.y * TILE_SIZE + TILE_SIZE/2;
            let size = TILE_SIZE - 12; // Made smaller

            // Simple wiggle animation for aliens
            let yOffset = (animationFrameCount % 8 < 4) ? -2 : 0;

            ctx.fillStyle = this.isEaten ? 'rgba(255,255,255,0.2)' : (overchargeTime > 0 ? '#1e3a8a' : this.color);
            ctx.beginPath();
            ctx.arc(px, py + yOffset, size/2, Math.PI, 0); // Dome top
            ctx.lineTo(px + size/2, py + size/2 + yOffset);
            
            // Tentacles
            ctx.lineTo(px + size/4, py + size/4 + yOffset);
            ctx.lineTo(px, py + size/2 + yOffset);
            ctx.lineTo(px - size/4, py + size/4 + yOffset);
            ctx.lineTo(px - size/2, py + size/2 + yOffset);
            ctx.fill();
        }
    }

    // --- SYSTEM LOGIC ---
    let player;
    let aliens = [];

    function initGame() {
        levelMap = JSON.parse(JSON.stringify(initialMap)); // Deep copy map
        score = 0;
        lives = 3;
        overchargeTime = 0;
        player = new Player();
        aliens = [
            new Alien(9, 9, '#ff003c', 'A*'),   
            new Alien(10, 9, '#ff00ff', 'BFS'), 
            new Alien(9, 10, '#ff8c00', 'UCS')  
        ];
        updateUI();
    }

    function handlePlayerDeath() {
        AudioController.playSFX('death');
        lives--;
        updateUI();
        if (lives <= 0) {
            currentState = 'GAMEOVER';
            document.getElementById('finalScore').innerText = score;
            changeScreen('gameOverScreen');
            AudioController.stopAll();
        } else {
            // Reset positions
            player.resetPosition();
            aliens.forEach(a => a.resetPosition());
        }
    }

    function updateUI() {
        document.getElementById('scoreDisplay').innerText = score;
        document.getElementById('livesDisplay').innerText = lives;
    }

    // --- SCREEN/MENU MANAGEMENT ---
    function changeScreen(screenId) {
        document.querySelectorAll('.overlay').forEach(el => el.classList.remove('active'));
        if (screenId) document.getElementById(screenId).classList.add('active');
    }

    const menuItems = document.querySelectorAll('#menuList li');
    function updateMenuSelection() {
        menuItems.forEach((item, index) => {
            if (index === menuIndex) item.classList.add('selected');
            else item.classList.remove('selected');
        });
    }

    // --- INPUT HANDLING ---
    document.addEventListener('keydown', (e) => {
        if (currentState === 'START') {
            currentState = 'MENU';
            changeScreen('mainMenu');
            AudioController.playTrack('MENU');
            return;
        }

        if (currentState === 'GAMEOVER') {
            if (e.key === 'Enter') {
                currentState = 'MENU';
                changeScreen('mainMenu');
                AudioController.playTrack('MENU');
            }
            return;
        }

        if (currentState === 'MENU') {
            if (e.key === 'ArrowUp' || e.key === 'w') {
                menuIndex = (menuIndex > 0) ? menuIndex - 1 : menuItems.length - 1;
                AudioController.playSFX('menu_move');
                updateMenuSelection();
            } else if (e.key === 'ArrowDown' || e.key === 's') {
                menuIndex = (menuIndex < menuItems.length - 1) ? menuIndex + 1 : 0;
                AudioController.playSFX('menu_move');
                updateMenuSelection();
            } else if (e.key === 'Enter') {
                const action = menuItems[menuIndex].getAttribute('data-action');
                if (action === 'casual') {
                    currentState = 'PLAYING';
                    changeScreen(null);
                    initGame();
                    AudioController.playTrack('GAME');
                } else if (action === 'toggleMusic') {
                    musicEnabled = !musicEnabled;
                    menuItems[menuIndex].innerText = `Music: ${musicEnabled ? 'ON' : 'OFF'}`;
                    if (!musicEnabled) AudioController.stopAll();
                    else AudioController.playTrack('MENU');
                }
            }
            return;
        }

        // Gameplay Input
        if (currentState === 'PLAYING') {
            if (e.key === 'ArrowUp' || e.key === 'w') { player.nextDirX = 0; player.nextDirY = -1; }
            if (e.key === 'ArrowDown' || e.key === 's') { player.nextDirX = 0; player.nextDirY = 1; }
            if (e.key === 'ArrowLeft' || e.key === 'a') { player.nextDirX = -1; player.nextDirY = 0; }
            if (e.key === 'ArrowRight' || e.key === 'd') { player.nextDirX = 1; player.nextDirY = 0; }
        }
    });

    // --- RENDER LOOP ---
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
                    ctx.arc(x + TILE_SIZE/2, y + TILE_SIZE/2, 2, 0, Math.PI * 2); // Smaller orb
                    ctx.fill();
                } else if (tile === 3) { 
                    ctx.fillStyle = '#fce205';
                    ctx.fillRect(x + TILE_SIZE/4 + 2, y + TILE_SIZE/4 + 2, TILE_SIZE/2 - 4, TILE_SIZE/2 - 4); // Smaller battery
                }
            }
        }
    }

    let lastTick = 0;
    const tickRate = 150; 

    function gameLoop(timestamp) {
        if (currentState === 'PLAYING') {
            if (!lastTick || timestamp - lastTick > tickRate) {
                animationFrameCount++;
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
                updateUI();
                
                lastTick = timestamp;
            }
        }
        requestAnimationFrame(gameLoop);
    }

    // Initialize UI and loop
    initGame(); 
    drawMap(); // Draw background for start screen
    requestAnimationFrame(gameLoop);
    
    // Attempt to play start track (might require user interaction first depending on browser)
    document.addEventListener('click', () => {
        if (currentState === 'START' && !AudioController.currentTrack) {
            AudioController.playTrack('START');
        }
    }, { once: true });
};