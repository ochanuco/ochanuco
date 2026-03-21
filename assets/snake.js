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
    offsetX: 0,
    offsetY: 0,
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
  const swipeThreshold = 24;
  const touchState = {
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    tracking: false,
    handled: false,
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

    return Math.max(1, avatarSize / 32);
  }

  function getWallpaperMetrics() {
    const rect = wallpaper.getBoundingClientRect();
    const width = rect.width || window.innerWidth;
    const height = rect.height || window.innerHeight;
    const cell = getWallpaperPixelSize();

    if (!wallpaperAvatar || !cell) {
      return {
        width,
        height,
        cell,
        offsetX: 0,
        offsetY: 0,
        columns: Math.max(1, Math.ceil(width / Math.max(cell, 1))),
        rows: Math.max(1, Math.ceil(height / Math.max(cell, 1))),
      };
    }

    const avatarRect = wallpaperAvatar.getBoundingClientRect();
    let offsetX = avatarRect.left - Math.round(avatarRect.left / cell) * cell;
    let offsetY = avatarRect.top - Math.round(avatarRect.top / cell) * cell;

    while (offsetX > 0) {
      offsetX -= cell;
    }

    while (offsetY > 0) {
      offsetY -= cell;
    }

    return {
      width,
      height,
      cell,
      offsetX,
      offsetY,
      columns: Math.max(1, Math.ceil((width - offsetX) / cell)),
      rows: Math.max(1, Math.ceil((height - offsetY) / cell)),
    };
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

  function getCellKey(cell) {
    return `${cell.x}:${cell.y}`;
  }

  function cloneGameSnapshot() {
    return {
      snakes: Object.fromEntries(
        Object.entries(state.snakes).map(([name, snake]) => [
          name,
          {
            ...snake,
            body: snake.body.map((segment) => ({ ...segment })),
            direction: { ...snake.direction },
            nextDirection: { ...snake.nextDirection },
          },
        ]),
      ),
      food: state.food ? { ...state.food } : null,
      trail: state.trail.map((segment) => ({ ...segment })),
    };
  }

  function projectCell(cell, previousColumns, previousRows) {
    const mapAxis = (value, previousSize, nextSize) => {
      if (nextSize <= 1 || previousSize <= 1) {
        return 0;
      }

      return clamp(Math.floor(((value + 0.5) / previousSize) * nextSize), 0, nextSize - 1);
    };

    return {
      x: mapAxis(cell.x, previousColumns, state.columns),
      y: mapAxis(cell.y, previousRows, state.rows),
    };
  }

  function findNearestAvailableCell(preferred, occupied) {
    const maxDistance = state.columns + state.rows;

    for (let distance = 0; distance <= maxDistance; distance += 1) {
      for (let deltaY = -distance; deltaY <= distance; deltaY += 1) {
        const deltaX = distance - Math.abs(deltaY);
        const candidates = deltaX === 0
          ? [[preferred.x, preferred.y + deltaY]]
          : [
              [preferred.x - deltaX, preferred.y + deltaY],
              [preferred.x + deltaX, preferred.y + deltaY],
            ];

        for (const [x, y] of candidates) {
          const candidate = {
            x: (x + state.columns) % state.columns,
            y: (y + state.rows) % state.rows,
          };

          if (!occupied.has(getCellKey(candidate))) {
            return candidate;
          }
        }
      }
    }

    return null;
  }

  function projectSnakeBody(body, previousColumns, previousRows, occupied) {
    const nextBody = [];
    const claimed = new Set();

    for (const segment of body) {
      const projected = projectCell(segment, previousColumns, previousRows);
      const nextSegment = findNearestAvailableCell(projected, new Set([...occupied, ...claimed]));

      if (!nextSegment) {
        return null;
      }

      nextBody.push(nextSegment);
      claimed.add(getCellKey(nextSegment));
    }

    return nextBody;
  }

  function reconcileStateAfterResize(snapshot, previousColumns, previousRows) {
    const occupied = new Set();

    state.snakes = {};

    ["player", "cpu"].forEach((name) => {
      const previousSnake = snapshot.snakes[name];

      if (!previousSnake) {
        resetSnake(name, false);
        state.snakes[name].crashUntil = 0;
        state.snakes[name].body.forEach((segment) => occupied.add(getCellKey(segment)));
        return;
      }

      const projectedBody = projectSnakeBody(previousSnake.body, previousColumns, previousRows, occupied);

      if (!projectedBody || projectedBody.length < 2) {
        const fallbackSnake = buildSpawn(name);
        fallbackSnake.score = previousSnake.score ?? 1;
        fallbackSnake.crashUntil = 0;
        state.snakes[name] = fallbackSnake;
        fallbackSnake.body.forEach((segment) => occupied.add(getCellKey(segment)));
        return;
      }

      state.snakes[name] = {
        ...previousSnake,
        body: projectedBody,
        direction: { ...previousSnake.direction },
        nextDirection: { ...previousSnake.nextDirection },
      };

      projectedBody.forEach((segment) => occupied.add(getCellKey(segment)));
    });

    state.food = snapshot.food ? projectCell(snapshot.food, previousColumns, previousRows) : null;

    if (!state.food || occupied.has(getCellKey(state.food))) {
      placeFood();
    }

    state.trail = snapshot.trail
      .map((segment) => ({
        ...segment,
        ...projectCell(segment, previousColumns, previousRows),
      }))
      .filter((segment, index, segments) => index === segments.findIndex((other) => (
        other.owner === segment.owner &&
        other.bornAt === segment.bornAt &&
        isSameCell(other, segment)
      )));

    updateSpeed();
    updateScore();
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
    const previousColumns = state.columns;
    const previousRows = state.rows;
    const previousSnapshot = previousColumns > 0 && previousRows > 0 ? cloneGameSnapshot() : null;
    const { width, height, cell, columns, rows, offsetX, offsetY } = getWallpaperMetrics();
    const ratio = window.devicePixelRatio || 1;

    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const gridChanged =
      columns !== state.columns ||
      rows !== state.rows ||
      Math.abs(cell - state.cell) > 0.01;

    state.columns = columns;
    state.rows = rows;
    state.cell = cell;
    state.offsetX = offsetX;
    state.offsetY = offsetY;

    if (!previousSnapshot) {
      resetGame();
      return;
    }

    if (gridChanged) {
      reconcileStateAfterResize(previousSnapshot, previousColumns, previousRows);
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

  function handleSwipe(deltaX, deltaY) {
    if (Math.abs(deltaX) < swipeThreshold && Math.abs(deltaY) < swipeThreshold) {
      return false;
    }

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      setDirection(state.snakes.player, deltaX > 0 ? 1 : -1, 0);
    } else {
      setDirection(state.snakes.player, 0, deltaY > 0 ? 1 : -1);
    }

    return true;
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
    const { width, height } = getWallpaperMetrics();

    context.clearRect(0, 0, width, height);

    const pixelWidth = Math.max(4, state.cell * 0.78);
    const pixelHeight = Math.max(4, state.cell * 0.82);
    const pixelOffsetX = (state.cell - pixelWidth) / 2;
    const pixelOffsetY = (state.cell - pixelHeight) / 2;

    function drawPixel(column, row, color, alpha = 1) {
      context.fillStyle = color;
      context.globalAlpha = alpha;
      context.fillRect(
        state.offsetX + column * state.cell + pixelOffsetX,
        state.offsetY + row * state.cell + pixelOffsetY,
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

  window.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1 || event.target.closest("a")) {
      touchState.tracking = false;
      return;
    }

    const touch = event.touches[0];
    touchState.startX = touch.clientX;
    touchState.startY = touch.clientY;
    touchState.lastX = touch.clientX;
    touchState.lastY = touch.clientY;
    touchState.tracking = true;
    touchState.handled = false;
  }, { passive: true });

  window.addEventListener("touchmove", (event) => {
    if (!touchState.tracking || touchState.handled || event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    touchState.lastX = touch.clientX;
    touchState.lastY = touch.clientY;

    if (!handleSwipe(touch.clientX - touchState.startX, touch.clientY - touchState.startY)) {
      return;
    }

    touchState.handled = true;
    event.preventDefault();
  }, { passive: false });

  window.addEventListener("touchend", () => {
    if (!touchState.tracking) {
      return;
    }

    if (!touchState.handled) {
      handleSwipe(touchState.lastX - touchState.startX, touchState.lastY - touchState.startY);
    }

    touchState.tracking = false;
    touchState.handled = false;
  });

  window.addEventListener("touchcancel", () => {
    touchState.tracking = false;
    touchState.handled = false;
  });

  window.addEventListener("resize", syncSize);
  window.visualViewport?.addEventListener("resize", syncSize);
  new ResizeObserver(syncSize).observe(wallpaper);

  if (wallpaperAvatar) {
    new ResizeObserver(syncSize).observe(wallpaperAvatar);
  }

  syncSize();
  window.requestAnimationFrame(loop);
})();
