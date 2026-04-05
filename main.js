const config = {
    type: Phaser.AUTO,
    width: 560,
    height: 900, 
    backgroundColor: "#050101",
    physics: {
        default: "arcade",
        arcade: { 
            debug: false,
            checkCollision: { up: true, down: false, left: true, right: true }
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

const SHOOT_X = 280; 
const SHOOT_Y = 800; 
const BALL_RADIUS = 10;
const BASE_SPEED = 750; 

let lastBounceTime = 0; 
let timerText, ballsText, exitText;
let elapsedSeconds = 0;
let uiGraphics, balls, bricks, powerupsBlue, powerupsOrange, graphics;
let totalBalls = 1;
let ballsInPlay = 0;
let canShoot = true;
let sceneRef;
let ballsReturned = 0;
let level = 1;
let turboEvent;
let gridSize = { cols: 7, rows: 8, cellWidth: 80, cellHeight: 80 };

function getLevelHealth(currentLevel) {
    let extraDifficulty = Math.floor(currentLevel / 20) * 2;
    return currentLevel + extraDifficulty;
}

function getHealthColor(health, maxHealth) {
    let ratio = health / maxHealth;
    if (ratio > 0.80) return 0xFF00FF; 
    if (ratio > 0.60) return 0xFF4444; 
    if (ratio > 0.40) return 0xFFFF00;
    if (ratio > 0.20) return 0x00FF00 ; 
    return 0x00FFFF;                   
}

function preload() {
    this.load.audio('sonidoRebote', 'audio/Jump(1).wav');
    this.load.audio('sonidoExtra', 'audio/Blip.wav');
    this.load.audio('sonidoRayo', 'audio/PowerUp1.wav');
}

function create() {
    sceneRef = this;
    generateTextures(this);

    this.bounceSfx = this.sound.add('sonidoRebote', { volume: 0.5 });
    this.extraSfx = this.sound.add('sonidoExtra', { volume: 0.6 });
    this.rayoSfx = this.sound.add('sonidoRayo', { volume: 0.7 });

    this.physics.world.setBounds(0, 75, 560, 900); 
    balls = this.physics.add.group({ bounceX: 1, bounceY: 1 });
    bricks = this.physics.add.staticGroup();
    powerupsBlue = this.physics.add.staticGroup();
    powerupsOrange = this.physics.add.staticGroup();

    this.physics.world.on('worldbounds', (body) => {
        if (body.gameObject && body.gameObject.texture.key === 'ball') {
            playBounceSound(this); 
        }
    });

    this.physics.add.collider(balls, bricks, (ball, brick) => {
        playBounceSound(this); 
        
        brick.health--;
        if (brick.health <= 0) {
            if (brick.text) brick.text.destroy();
            brick.destroy();
        } else {
            brick.text.setText(brick.health);
            brick.setTint(getHealthColor(brick.health, brick.maxHealth));
        }
    });

    this.physics.add.overlap(balls, powerupsBlue, (ball, gem) => {
        this.extraSfx.play(); 
        let extra = Phaser.Math.Between(1, 5); 
        totalBalls += extra;
        showPopupText(gem.x, gem.y, `+${extra}`, "#00aaff");
        gem.destroy();
        ballsText.setText("Balls: " + totalBalls);
    });

    this.physics.add.overlap(balls, powerupsOrange, (ball, gem) => {
        if (!gem.ballsHit) gem.ballsHit = new Set();
        if (!gem.ballsHit.has(ball)) {
            gem.ballsHit.add(ball);
            if(this.rayoSfx) this.rayoSfx.play({ volume: 0.4 }); 
            gem.setTint(0xffffff);
            this.time.delayedCall(100, () => gem.clearTint());
            activateRowStrike(gem.y);
        }
    });
    
    uiGraphics = this.add.graphics();
    const topY = 25; 
    const gap = 4; 
    const neonColor = 0x00ff00;

    function traceRetroHUD(graphics, y) {
        graphics.moveTo(0, y);
        graphics.lineTo(40, y);       
        graphics.lineTo(60, y + 20); 
        graphics.lineTo(160, y + 20); 
        graphics.lineTo(180, y);       
        graphics.lineTo(220, y);       
        graphics.lineTo(240, y + 35); 
        graphics.lineTo(320, y + 35); 
        graphics.lineTo(340, y);       
        graphics.lineTo(380, y);       
        graphics.lineTo(400, y + 20); 
        graphics.lineTo(500, y + 20); 
        graphics.lineTo(520, y);    
        graphics.lineTo(560, y);    
    }

    uiGraphics.lineStyle(8, neonColor, 0.2); 
    uiGraphics.beginPath();
    traceRetroHUD(uiGraphics, topY);
    traceRetroHUD(uiGraphics, topY + gap);
    uiGraphics.strokePath();

    uiGraphics.lineStyle(2, neonColor, 1); 
    uiGraphics.beginPath();
    traceRetroHUD(uiGraphics, topY);
    traceRetroHUD(uiGraphics, topY + gap);
    uiGraphics.strokePath();

    const styleNormal = { font: "16px Consolas", fill: "#ccffcc", fontWeight: "bold" };
    const styleLarge = { font: "32px Consolas", fill: "#00ffff", fontWeight: "bold" };

    ballsText = this.add.text(110, topY + 11, "Balls: 1", styleNormal).setOrigin(0.5);
    timerText = this.add.text(280, topY + 18, "00:00", styleLarge).setOrigin(0.5);
    exitText = this.add.text(450, topY + 11, "SALIR", styleNormal).setOrigin(0.5).setInteractive({ useHandCursor: true });

    exitText.on('pointerdown', () => { location.reload(); });

    this.time.addEvent({
        delay: 1000,
        callback: () => {
            elapsedSeconds++;
            let mins = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
            let secs = (elapsedSeconds % 60).toString().padStart(2, '0');
            timerText.setText(`${mins}:${secs}`);
        },
        callbackScope: this,
        loop: true
    });

    let floorVisual = this.add.graphics();
    const drawTechFloor = (gr) => {
        gr.moveTo(0, SHOOT_Y + 12); gr.lineTo(560, SHOOT_Y + 12);
        gr.moveTo(0, SHOOT_Y + 18); gr.lineTo(180, SHOOT_Y + 18);
        gr.lineTo(200, SHOOT_Y + 36); gr.lineTo(360, SHOOT_Y + 36); 
        gr.lineTo(380, SHOOT_Y + 18); gr.lineTo(560, SHOOT_Y + 18);
    };
    floorVisual.lineStyle(6, 0x33ff33, 0.2).beginPath(); drawTechFloor(floorVisual); floorVisual.strokePath();
    floorVisual.lineStyle(2, 0xccffcc, 1).beginPath(); drawTechFloor(floorVisual); floorVisual.strokePath();

    this.add.text(SHOOT_X, SHOOT_Y + 27, "SHOCKBLOCK", { 
        fontSize: "15px", fill: "#ccffcc", fontStyle: "bold", fontFamily: "Consolas" 
    }).setOrigin(0.5);

    graphics = this.add.graphics();
    this.add.grid(280, 450, 560, 900, 80, 80, 0xffffff, 0.05);

    spawnBall(SHOOT_X, SHOOT_Y);
    spawnBrickRow(this);

    this.input.on("pointermove", (p) => {
        if (!canShoot) return;
        graphics.clear();
        let angle = Phaser.Math.Angle.Between(SHOOT_X, SHOOT_Y, p.x, p.y);
        let dist = 45; 
        graphics.lineStyle(3, 0x33ff33, 0.8);
        for(let i = 1; i <= 6; i++) {
            let fx = SHOOT_X + Math.cos(angle) * (i * dist);
            let fy = SHOOT_Y + Math.sin(angle) * (i * dist);
            graphics.beginPath();
            graphics.moveTo(fx - Math.cos(angle - 0.5) * 15, fy - Math.sin(angle - 0.5) * 15);
            graphics.lineTo(fx, fy);
            graphics.lineTo(fx - Math.cos(angle + 0.5) * 15, fy - Math.sin(angle + 0.5) * 15);
            graphics.strokePath();
        }
    });

    this.input.on("pointerup", (p) => {
        if (!canShoot || p.y >= SHOOT_Y) return;
        graphics.clear();
        shootBalls(p);
    });
}

function spawnBall(x, y) {
    let ball = balls.create(x, y, "ball");
    ball.setCollideWorldBounds(true);
    ball.body.onWorldBounds = true;
    ball.body.setBounce(1, 1);
    return ball;
}

function shootBalls(pointer) {
    canShoot = false;
    ballsInPlay = totalBalls;
    ballsReturned = 0;
    let angle = Phaser.Math.Angle.Between(SHOOT_X, SHOOT_Y, pointer.x, pointer.y);

    balls.getChildren().forEach((ball, i) => {
        ball.body.reset(SHOOT_X, SHOOT_Y);
        ball.setVisible(false);
        sceneRef.time.delayedCall(i * 80, () => {
            ball.setVisible(true);
            sceneRef.physics.velocityFromRotation(angle, BASE_SPEED, ball.body.velocity);
        });
    });

    turboEvent = sceneRef.time.delayedCall(10000, () => {
        balls.getChildren().forEach(ball => {
            if (ball.active && ball.body.speed > 0) ball.body.velocity.scale(6);
        });
        showPopupText(280, 450, "TURBO SPEED!", "#ff0000");
    });
}

function activateRowStrike(y) {
    let line = sceneRef.add.graphics();
    line.lineStyle(4, 0xffaa00, 0.8);
    line.moveTo(0, y); line.lineTo(560, y);
    line.strokePath();
    sceneRef.tweens.add({ targets: line, alpha: 0, duration: 300, onComplete: () => line.destroy() });

    let bloquesEnFila = bricks.getChildren().filter(b => b.active && Math.abs(b.y - y) < 50);

    bloquesEnFila.forEach(b => {
        b.health--;
        if (b.health <= 0) {
            if (b.text) b.text.destroy();
            b.destroy(); 
        } else {
            b.text.setText(b.health);
            b.setTint(getHealthColor(b.health, b.maxHealth));
        }
    });
}

function showPopupText(x, y, content, color) {
    let t = sceneRef.add.text(x, y, content, { fontSize: "24px", fill: color, fontStyle: "bold" }).setOrigin(0.5);
    sceneRef.tweens.add({ targets: t, y: y - 80, alpha: 0, duration: 1000, onComplete: () => t.destroy() });
}

function update() {
    balls.getChildren().forEach(ball => {
        if (ball.active && ball.y > SHOOT_Y + 10) {
            ball.body.setVelocity(0, 0);
            ball.setActive(false).setVisible(false);
            ballsReturned++;
            if (ballsReturned >= ballsInPlay) resetTurn();
        }
    });
}

function resetTurn() {
    canShoot = true;
    level++;
    ballsReturned = 0;
    if (turboEvent) turboEvent.remove();

    powerupsOrange.getChildren().forEach(p => { 
        if(p.ballsHit && p.ballsHit.size > 0) p.destroy(); 
    });

    [bricks, powerupsBlue, powerupsOrange].forEach(group => {
        group.getChildren().forEach(obj => {
            obj.y += 80;
            if (obj.text) obj.text.y += 80;
            obj.body.updateFromGameObject(); 
            if (obj.y >= SHOOT_Y - 40) { alert("Game Over!"); location.reload(); }
        });
    });

    while (balls.getLength() < totalBalls) {
        spawnBall(SHOOT_X, SHOOT_Y);
    }

    balls.getChildren().forEach((ball, index) => {
        ball.body.reset(SHOOT_X, SHOOT_Y);
        ball.setActive(true);
        ball.setVisible(index === 0); 
    });
    
    ballsText.setText("Balls: " + totalBalls);
    spawnBrickRow(sceneRef);
}

function generateTextures(scene) {
    let size = 76;
    let gr = scene.make.graphics({ x: 0, y: 0, add: false });
    
    gr.fillStyle(0xffffff, 1).fillCircle(BALL_RADIUS, BALL_RADIUS, BALL_RADIUS);
    gr.generateTexture("ball", BALL_RADIUS * 2, BALL_RADIUS * 2);
    gr.clear();

    gr.lineStyle(6, 0xffffff, 0.3).strokeRect(3, 3, size-6, size-6);
    gr.lineStyle(4, 0xffffff, 1).strokeRect(2, 2, size-4, size-4);
    gr.generateTexture("rect_outline", size, size);
    gr.clear();

    const drawRhombus = (g, s) => {
        g.beginPath(); g.moveTo(s/2, 2); g.lineTo(s-2, s/2); g.lineTo(s/2, s-2); g.lineTo(2, s/2);
        g.closePath(); g.strokePath();
    };

    gr.lineStyle(6, 0x00aaff, 0.4); drawRhombus(gr, 40);
    gr.lineStyle(2, 0xffffff, 1); drawRhombus(gr, 40);
    gr.moveTo(14, 20); gr.lineTo(26, 20); gr.moveTo(20, 14); gr.lineTo(20, 26); gr.strokePath();
    gr.generateTexture("powerup_blue", 40, 40);
    gr.clear();

    gr.lineStyle(6, 0xffaa00, 0.4); drawRhombus(gr, 40);
    gr.lineStyle(2, 0xffffff, 1); drawRhombus(gr, 40);
    gr.moveTo(8, 20); gr.lineTo(32, 20); 
    gr.moveTo(8, 20); gr.lineTo(13, 15); gr.moveTo(8, 20); gr.lineTo(13, 25); 
    gr.moveTo(32, 20); gr.lineTo(27, 15); gr.moveTo(32, 20); gr.lineTo(27, 25); 
    gr.strokePath();
    gr.generateTexture("powerup_orange", 40, 40);
}

function spawnBrickRow(scene) {
    let baseHealth = getLevelHealth(level);

    for (let i = 0; i < gridSize.cols; i++) {
        if (Math.random() > 0.6) continue;
        let x = (i * 80) + 40;
        let subRand = Math.random();

        if (subRand < 0.75) { 
            let b = bricks.create(x, 160, "rect_outline");
            let finalHealth = baseHealth;

           
            if (level >= 35 && Math.random() < 0.30) {
                finalHealth = baseHealth * 3;
                b.setTint(0xffffff); 
                showPopupText(x, 160, "!!!", "#ffffff"); 
            } else {
                b.setTint(getHealthColor(finalHealth, finalHealth));
            }

            b.maxHealth = b.health = finalHealth;
            b.text = scene.add.text(x, 160, b.health, { 
                fontSize: "20px", 
                fontStyle: "bold",
                fill: (finalHealth > baseHealth) ? "#ff0000" : "#ffffff" 
            }).setOrigin(0.5);

        } else if (subRand < 0.90) {
            powerupsBlue.create(x, 160, "powerup_blue");
        } else {
            powerupsOrange.create(x, 160, "powerup_orange");
        }
    }
}

function playBounceSound(scene) {
    let currentTime = scene.time.now;
    if (currentTime - lastBounceTime > 40) {
        scene.bounceSfx.play({ detune: Phaser.Math.Between(-200, 200) });
        lastBounceTime = currentTime;
    }
}