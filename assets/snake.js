(() => {
  const wallpaper = document.querySelector(".snake-wallpaper");
  const canvas = wallpaper?.querySelector(".snake-wallpaper__canvas");
  const cpuScoreNode = wallpaper?.querySelector(".snake-wallpaper__score--cpu");
  const playerScoreNode = wallpaper?.querySelector(".snake-wallpaper__score--player");
  const roundNode = wallpaper?.querySelector(".snake-wallpaper__round");
  const maxScoreNode = wallpaper?.querySelector(".snake-wallpaper__max-score");
  const speedCurrentNode = wallpaper?.querySelector(".snake-wallpaper__speed-current");
  const speedMaxNode = wallpaper?.querySelector(".snake-wallpaper__speed-max");
  const wallpaperAvatar = document.querySelector(".avatar-wallpaper__item");

  if (!wallpaper || !canvas || !cpuScoreNode || !playerScoreNode || !roundNode || !maxScoreNode || !speedCurrentNode || !speedMaxNode) {
    return;
  }

  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  const palette = {
    empty: "rgba(255, 255, 255, 0.032)",
    player: "#5aa864",
    playerHead: "#cfd66b",
    cpu: "#ffd18f",
    cpuHead: "#ff6b7f",
    food: "#f3f4fb",
    crash: "#ff6b7f",
  };

  const state = {
    columns: 0,
    rows: 0,
    cell: 0,
    snakes: {},
    food: null,
    speed: 150,
    lastStepAt: 0,
    trail: [],
    round: 1,
    maxScore: 1,
  };

  const speedBounds = {
    slowestInterval: 180,
    fastestInterval: 72,
  };

  function getTotalSnakeLength() {
    return Object.values(state.snakes).reduce((sum, snake) => sum + snake.body.length, 0);
  }

  function getSpeedValue(interval) {
    return Math.round(1000 / interval);
  }

  function updateSpeed() {
    const totalLength = getTotalSnakeLength();
    state.speed = Math.max(speedBounds.fastestInterval, speedBounds.slowestInterval - totalLength * 2);
    speedCurrentNode.textContent = String(getSpeedValue(state.speed)).padStart(2, "0");
    speedMaxNode.textContent = String(getSpeedValue(speedBounds.fastestInterval)).padStart(2, "0");
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getWallpaperPixelSize() {
    const fallback = clamp(Math.round(Math.min(window.innerWidth, window.innerHeight) / 26), 12, 22);

    if (!wallpaperAvatar) {
      return fallback;
    }

    const avatarSize = wallpaperAvatar.getBoundingClientRect().width;

    if (!avatarSize) {
      return fallback;
    }

    return Math.max(1, Math.round(avatarSize / 32));
  }

  function createSnake(name, body, direction) {
    return {
      name,
      body,
      direction: { ...direction },
      nextDirection: { ...direction },
      score: 1,
      crashUntil: 0,
    };
  }

  function randomCell() {
    return {
      x: Math.floor(Math.random() * state.columns),
      y: Math.floor(Math.random() * state.rows),
    };
  }

  function isSameCell(a, b) {
    return a.x === b.x && a.y === b.y;
  }

  function updateScore() {
    const cpuScore = String(state.snakes.cpu?.score ?? 0).padStart(3, "0");
    const playerScore = String(state.snakes.player?.score ?? 0).padStart(3, "0");
    state.maxScore = Math.max(state.maxScore, state.snakes.cpu?.score ?? 0, state.snakes.player?.score ?? 0);
    cpuScoreNode.textContent = cpuScore;
    playerScoreNode.textContent = playerScore;
    roundNode.textContent = String(state.round).padStart(3, "0");
    maxScoreNode.textContent = String(state.maxScore).padStart(3, "0");
  }

  function syncSize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const ratio = window.devicePixelRatio || 1;
    const cell = getWallpaperPixelSize();
    const columns = Math.max(1, Math.floor(width / cell));
    const rows = Math.max(1, Math.floor(height / cell));

    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const gridChanged = columns !== state.columns || rows !== state.rows || cell !== state.cell;

    state.columns = columns;
    state.rows = rows;
    state.cell = cell;

    if (gridChanged) {
      resetGame();
    }
  }

  function placeFood() {
    let candidate = randomCell();

    while (Object.values(state.snakes).some((snake) => snake.body.some((segment) => isSameCell(segment, candidate)))) {
      candidate = randomCell();
    }

    state.food = candidate;
  }

  function buildSpawn(name) {
    const centerX = Math.floor(state.columns / 2);
    const centerY = Math.floor(state.rows / 2);
    const wrapCell = (value, size) => ((value % size) + size) % size;

    if (name === "player") {
      return createSnake(
        "player",
        [
          { x: wrapCell(centerX - 7, state.columns), y: wrapCell(centerY + 4, state.rows) },
          { x: wrapCell(centerX - 6, state.columns), y: wrapCell(centerY + 4, state.rows) },
        ],
        { x: 1, y: 0 },
      );
    }

    return createSnake(
      "cpu",
      [
        { x: wrapCell(centerX + 7, state.columns), y: wrapCell(centerY - 4, state.rows) },
        { x: wrapCell(centerX + 8, state.columns), y: wrapCell(centerY - 4, state.rows) },
      ],
      { x: -1, y: 0 },
    );
  }

  function resetSnake(name, keepScore = true) {
    const score = keepScore ? state.snakes[name]?.score ?? 1 : 1;
    state.snakes[name] = buildSpawn(name);
    state.snakes[name].score = score;
    state.snakes[name].crashUntil = performance.now() + 700;
    state.trail = state.trail.filter((segment) => segment.owner !== name);
  }

  function resetGame() {
    state.snakes = {};
    resetSnake("player", false);
    resetSnake("cpu", false);
    state.snakes.player.crashUntil = 0;
    state.snakes.cpu.crashUntil = 0;
    state.lastStepAt = 0;
    state.trail = [];
    state.round = 1;
    state.maxScore = 1;
    placeFood();
    updateSpeed();
    updateScore();
  }

  function setDirection(snake, x, y) {
    if (!snake || (snake.direction.x === -x && snake.direction.y === -y)) {
      return;
    }

    snake.nextDirection = { x, y };
  }

  function getNextHead(snake, direction) {
    const head = snake.body[snake.body.length - 1];

    return {
      x: (head.x + direction.x + state.columns) % state.columns,
      y: (head.y + direction.y + state.rows) % state.rows,
    };
  }

  function torusDistance(from, to) {
    const deltaX = Math.abs(from.x - to.x);
    const deltaY = Math.abs(from.y - to.y);
    const wrapX = Math.min(deltaX, state.columns - deltaX);
    const wrapY = Math.min(deltaY, state.rows - deltaY);

    return wrapX + wrapY;
  }

  function getOccupiedSegments(excludedName, allowOwnTailMove) {
    const occupied = [];

    Object.entries(state.snakes).forEach(([name, snake]) => {
      const segments = allowOwnTailMove && name === excludedName ? snake.body.slice(1) : snake.body;

      segments.forEach((segment) => {
        occupied.push(segment);
      });
    });

    return occupied;
  }

  function isSafeDirection(name, direction) {
    const snake = state.snakes[name];

    if (snake.direction.x === -direction.x && snake.direction.y === -direction.y) {
      return false;
    }

    const nextHead = getNextHead(snake, direction);
    const isEating = Boolean(state.food && isSameCell(nextHead, state.food));
    const occupied = getOccupiedSegments(name, !isEating);

    return !occupied.some((segment) => isSameCell(segment, nextHead));
  }

  function chooseCpuDirection() {
    const cpu = state.snakes.cpu;
    const directions = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];
    const safeDirections = directions.filter((direction) => isSafeDirection("cpu", direction));

    if (safeDirections.length === 0) {
      return cpu.nextDirection;
    }

    const rankedDirections = safeDirections
      .map((direction) => ({
        direction,
        distance: state.food ? torusDistance(getNextHead(cpu, direction), state.food) : 0,
        turnPenalty: direction.x === cpu.direction.x && direction.y === cpu.direction.y ? 0 : 0.3,
      }))
      .sort((left, right) => (left.distance + left.turnPenalty) - (right.distance + right.turnPenalty));

    const keepGoing = safeDirections.find((direction) => direction.x === cpu.direction.x && direction.y === cpu.direction.y);

    if (keepGoing && Math.random() < 0.18) {
      return keepGoing;
    }

    if (rankedDirections.length > 1 && Math.random() < 0.18) {
      return rankedDirections[1].direction;
    }

    return rankedDirections[0].direction;
  }

  function stepSnake(name, timestamp) {
    const snake = state.snakes[name];

    if (name === "cpu") {
      snake.nextDirection = chooseCpuDirection();
    }

    snake.direction = snake.nextDirection;

    const nextHead = getNextHead(snake, snake.direction);
    const isEating = Boolean(state.food && isSameCell(nextHead, state.food));
    const occupied = getOccupiedSegments(name, !isEating);

    if (occupied.some((segment) => isSameCell(segment, nextHead))) {
      state.round += 1;
      resetSnake(name, true);
      updateScore();
      return;
    }

    snake.body.push(nextHead);
    state.trail.push({ ...nextHead, owner: name, bornAt: timestamp });

    if (isEating) {
      snake.score += 1;
      placeFood();
      updateSpeed();
      updateScore();
    } else {
      snake.body.shift();
    }
  }

  function step(timestamp) {
    if (!state.lastStepAt) {
      state.lastStepAt = timestamp;
    }

    if (timestamp - state.lastStepAt < state.speed) {
      return;
    }

    state.lastStepAt = timestamp;
    stepSnake("player", timestamp);
    stepSnake("cpu", timestamp);
    updateSpeed();
    state.trail = state.trail.filter((segment) => timestamp - segment.bornAt < 800);
  }

  function draw(timestamp) {
    const width = window.innerWidth;
    const height = window.innerHeight;

    context.clearRect(0, 0, width, height);

    const gridWidth = state.columns * state.cell;
    const gridHeight = state.rows * state.cell;
    const offsetX = Math.floor((width - gridWidth) / 2);
    const offsetY = Math.floor((height - gridHeight) / 2);
    const pixelWidth = Math.max(4, Math.floor(state.cell * 0.78));
    const pixelHeight = Math.max(4, Math.floor(state.cell * 0.82));
    const pixelOffsetX = Math.floor((state.cell - pixelWidth) / 2);
    const pixelOffsetY = Math.floor((state.cell - pixelHeight) / 2);

    function drawPixel(column, row, color, alpha = 1) {
      context.fillStyle = color;
      context.globalAlpha = alpha;
      context.fillRect(
        offsetX + column * state.cell + pixelOffsetX,
        offsetY + row * state.cell + pixelOffsetY,
        pixelWidth,
        pixelHeight,
      );
      context.globalAlpha = 1;
    }

    for (let row = 0; row < state.rows; row += 1) {
      for (let column = 0; column < state.columns; column += 1) {
        drawPixel(column, row, palette.empty);
      }
    }

    state.trail.forEach((segment) => {
      const age = Math.min(1, (timestamp - segment.bornAt) / 800);
      drawPixel(segment.x, segment.y, segment.owner === "cpu" ? palette.cpu : palette.player, 0.06 * (1 - age));
    });

    if (state.food) {
      drawPixel(state.food.x, state.food.y, palette.food, 0.34);
    }

    Object.values(state.snakes).forEach((snake) => {
      snake.body.forEach((segment, index) => {
        const isHead = index === snake.body.length - 1;
        const isCpu = snake.name === "cpu";
        const color = snake.crashUntil > timestamp
          ? palette.crash
          : isHead
            ? (isCpu ? palette.cpuHead : palette.playerHead)
            : (isCpu ? palette.cpu : palette.player);

        drawPixel(
          segment.x,
          segment.y,
          color,
          snake.crashUntil > timestamp ? 0.5 : isHead ? 0.36 : 0.26,
        );
      });
    });
  }

  function loop(timestamp) {
    step(timestamp);
    draw(timestamp);
    window.requestAnimationFrame(loop);
  }

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      resetGame();
      return;
    }

    const directionByKey = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      w: [0, -1],
      a: [-1, 0],
      s: [0, 1],
      d: [1, 0],
      W: [0, -1],
      A: [-1, 0],
      S: [0, 1],
      D: [1, 0],
    };

    const next = directionByKey[event.key];

    if (!next) {
      return;
    }

    event.preventDefault();
    setDirection(state.snakes.player, next[0], next[1]);
  }, { passive: false });

  window.addEventListener("resize", syncSize);

  syncSize();
  window.requestAnimationFrame(loop);
})();
