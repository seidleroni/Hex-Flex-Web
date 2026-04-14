// Minimap — canvas-based memory overview with click-to-navigate and viewport indicator.
// Reads layout + byte data to classify each pixel row as data/erased/gap/empty.
window.hexFlexMinimap = {
    _instances: new Map(),

    // Colors matching React minimap
    DATA_COLOR: '#22d3ee',      // cyan-400
    EMPTY_COLOR: '#374151',     // gray-700
    ERASED_COLOR: '#94a3b8',    // slate-400
    GAP_COLOR: '#8b5cf6',       // violet-500
    VIEWPORT_FILL: 'rgba(34, 211, 238, 0.5)',
    VIEWPORT_BORDER: 'rgba(207, 250, 254, 1)',

    init: function (canvasId, scrollContainerId) {
        const canvas = document.getElementById(canvasId);
        const scrollContainer = document.getElementById(scrollContainerId);
        if (!canvas || !scrollContainer) return;

        const state = {
            canvas: canvas,
            ctx: canvas.getContext('2d'),
            scrollContainer: scrollContainer,
            layout: null,
            segments: null,
            segValidity: null,
            totalRowCount: 0,
            isDragging: false,
            dragOffset: 0,
            // Cached pixel classification array (recomputed on setData or resize)
            pixelColors: null
        };

        // ResizeObserver to keep canvas resolution matching display size
        const ro = new ResizeObserver(function (entries) {
            for (const entry of entries) {
                const w = Math.floor(entry.contentRect.width);
                const h = Math.floor(entry.contentRect.height);
                if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
                    canvas.width = w;
                    canvas.height = h;
                    state.pixelColors = null; // invalidate cache
                    drawMinimap(state);
                }
            }
        });
        ro.observe(canvas);
        state.resizeObserver = ro;

        // Scroll sync — update viewport indicator on hex viewer scroll
        function onScroll() {
            if (!state._scrollRaf) {
                state._scrollRaf = requestAnimationFrame(function () {
                    state._scrollRaf = 0;
                    drawMinimap(state);
                });
            }
        }
        scrollContainer.addEventListener('scroll', onScroll, { passive: true });
        state.scrollHandler = onScroll;

        // Click/drag interaction
        canvas.addEventListener('mousedown', function (e) { handlePointerDown(state, e); });
        canvas.addEventListener('touchstart', function (e) { handlePointerDown(state, e); }, { passive: false });

        function onMove(e) { handlePointerMove(state, e); }
        function onUp() { state.isDragging = false; state.dragOffset = 0; }

        window.addEventListener('mousemove', onMove);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchend', onUp);
        state._globalMove = onMove;
        state._globalUp = onUp;

        this._instances.set(canvasId, state);
    },

    setData: function (canvasId, layoutJson, segmentDataArrays, segmentValidityArrays) {
        const state = this._instances.get(canvasId);
        if (!state) return;

        const layout = JSON.parse(layoutJson);
        state.layout = layout.entries;
        state.totalRowCount = layout.totalRowCount;
        state.segments = segmentDataArrays;
        state.segValidity = segmentValidityArrays;
        state.pixelColors = null; // invalidate cache
        drawMinimap(state);
    },

    dispose: function (canvasId) {
        const state = this._instances.get(canvasId);
        if (!state) return;

        if (state.resizeObserver) state.resizeObserver.disconnect();
        if (state.scrollHandler) {
            state.scrollContainer.removeEventListener('scroll', state.scrollHandler);
        }
        if (state._globalMove) {
            window.removeEventListener('mousemove', state._globalMove);
            window.removeEventListener('touchmove', state._globalMove);
        }
        if (state._globalUp) {
            window.removeEventListener('mouseup', state._globalUp);
            window.removeEventListener('touchend', state._globalUp);
        }
        this._instances.delete(canvasId);
    }
};

function handlePointerDown(state, e) {
    const canvas = state.canvas;
    const sc = state.scrollContainer;
    const totalHeight = state.totalRowCount * 28;
    const viewportHeight = sc.clientHeight;
    if (totalHeight <= viewportHeight) return;

    e.preventDefault();
    state.isDragging = true;

    const clientY = getClientY(e);
    if (clientY === null) return;

    const rect = canvas.getBoundingClientRect();
    const mapHeight = canvas.height;
    const clickY = (clientY - rect.top) * (canvas.height / rect.height);

    const thumbHeight = (viewportHeight / totalHeight) * mapHeight;
    const thumbTop = (sc.scrollTop / totalHeight) * mapHeight;

    if (clickY >= thumbTop && clickY <= thumbTop + thumbHeight) {
        state.dragOffset = clickY - thumbTop;
    } else {
        state.dragOffset = thumbHeight / 2;
    }

    const ratio = (clickY - state.dragOffset) / mapHeight;
    sc.scrollTop = Math.max(0, Math.min(ratio * totalHeight, totalHeight - viewportHeight));
}

function handlePointerMove(state, e) {
    if (!state.isDragging) return;
    e.preventDefault();

    const clientY = getClientY(e);
    if (clientY === null) return;

    const canvas = state.canvas;
    const sc = state.scrollContainer;
    const totalHeight = state.totalRowCount * 28;
    const viewportHeight = sc.clientHeight;

    const rect = canvas.getBoundingClientRect();
    const clickY = (clientY - rect.top) * (canvas.height / rect.height);
    const mapHeight = canvas.height;

    const ratio = (clickY - state.dragOffset) / mapHeight;
    sc.scrollTop = Math.max(0, Math.min(ratio * totalHeight, totalHeight - viewportHeight));
}

function getClientY(e) {
    if (e.touches) {
        if (e.touches.length > 0) return e.touches[0].clientY;
        if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0].clientY;
        return null;
    }
    return e.clientY;
}

// Classify each pixel row and cache the result (only recompute when data or canvas height changes)
function computePixelColors(state) {
    const height = state.canvas.height;
    if (height <= 0 || !state.layout || state.layout.length === 0) return null;

    const colors = new Uint8Array(height); // 0=empty, 1=data, 2=erased, 3=gap
    const totalRows = state.totalRowCount;
    const rowsPerPixel = totalRows / height;

    for (let y = 0; y < height; y++) {
        const startRow = Math.floor(y * rowsPerPixel);
        const endRow = Math.max(startRow + 1, Math.floor((y + 1) * rowsPerPixel));

        let hasData = false, hasErased = false, hasGap = false;

        for (let row = startRow; row < endRow && row < totalRows; row++) {
            const le = findEntry(state.layout, row);
            if (!le) continue;

            if (le.isGap) {
                hasGap = true;
                continue;
            }

            // Check bytes in this row
            const segIdx = le.segmentIndex;
            if (segIdx < 0 || segIdx >= state.segments.length) continue;

            const offsetInSeg = (row - le.globalRowStart) * 16;
            const data = state.segments[segIdx];
            const valid = state.segValidity[segIdx];

            let rowHasData = false;
            let rowHasErased = false;

            for (let j = 0; j < 16; j++) {
                const idx = offsetInSeg + j;
                if (idx >= 0 && idx < data.length && valid[idx]) {
                    if (data[idx] === 0xFF) {
                        rowHasErased = true;
                    } else {
                        rowHasData = true;
                        break;
                    }
                }
            }

            if (rowHasData) hasData = true;
            else if (rowHasErased) hasErased = true;
        }

        if (hasData) colors[y] = 1;
        else if (hasErased) colors[y] = 2;
        else if (hasGap) colors[y] = 3;
        // else 0 (empty)
    }

    return colors;
}

function findEntry(layout, globalRow) {
    let lo = 0, hi = layout.length - 1;
    while (lo < hi) {
        const mid = lo + ((hi - lo + 1) >> 1);
        if (layout[mid].globalRowStart <= globalRow) lo = mid;
        else hi = mid - 1;
    }
    return layout[lo];
}

function drawMinimap(state) {
    const ctx = state.ctx;
    const canvas = state.canvas;
    if (!ctx || canvas.width <= 0 || canvas.height <= 0) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!state.layout || state.layout.length === 0) return;

    // Compute or use cached pixel colors
    if (!state.pixelColors || state.pixelColors.length !== h) {
        state.pixelColors = computePixelColors(state);
    }

    const colors = state.pixelColors;
    if (!colors) return;

    const mm = window.hexFlexMinimap;
    const colorMap = [mm.EMPTY_COLOR, mm.DATA_COLOR, mm.ERASED_COLOR, mm.GAP_COLOR];

    // Draw data stripes
    let prevColor = -1;
    let runStart = 0;
    for (let y = 0; y <= h; y++) {
        const c = y < h ? colors[y] : -1;
        if (c !== prevColor) {
            if (prevColor >= 0) {
                ctx.fillStyle = colorMap[prevColor];
                ctx.fillRect(0, runStart, w, y - runStart);
            }
            prevColor = c;
            runStart = y;
        }
    }

    // Draw viewport indicator
    const totalHeight = state.totalRowCount * 28;
    const sc = state.scrollContainer;
    const viewportHeight = sc.clientHeight;

    if (totalHeight > 0 && viewportHeight > 0) {
        const viewportTop = (sc.scrollTop / totalHeight) * h;
        const viewportH = Math.max(2, (viewportHeight / totalHeight) * h);

        ctx.fillStyle = mm.VIEWPORT_FILL;
        ctx.strokeStyle = mm.VIEWPORT_BORDER;
        ctx.lineWidth = 1;
        ctx.fillRect(0.5, viewportTop + 0.5, w - 1, viewportH - 1);
        ctx.strokeRect(0.5, viewportTop + 0.5, w - 1, viewportH - 1);
    }
}
