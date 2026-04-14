// Minimap — canvas-based memory overview with click-to-navigate and viewport indicator.
// Uses the same layout as HexViewer (which now expands small gaps into empty rows),
// so the minimap and hex viewer share the same coordinate space.

var BYTES_PER_ROW = 16;
var ROW_HEIGHT = 28;

window.hexFlexMinimap = {
    _instances: new Map(),

    DATA_COLOR: '#22d3ee',      // cyan-400
    EMPTY_COLOR: '#374151',     // gray-700
    ERASED_COLOR: '#94a3b8',    // slate-400
    GAP_COLOR: '#8b5cf6',       // violet-500
    VIEWPORT_FILL: 'rgba(34, 211, 238, 0.5)',
    VIEWPORT_BORDER: 'rgba(207, 250, 254, 1)',

    init: function (canvasId, scrollContainerId) {
        var canvas = document.getElementById(canvasId);
        var scrollContainer = document.getElementById(scrollContainerId);
        if (!canvas || !scrollContainer) return;

        var state = {
            canvas: canvas,
            ctx: canvas.getContext('2d'),
            scrollContainer: scrollContainer,
            layout: null,
            segments: null,
            segValidity: null,
            totalRowCount: 0,
            isDragging: false,
            dragOffset: 0,
            pixelColors: null
        };

        var ro = new ResizeObserver(function (entries) {
            for (var i = 0; i < entries.length; i++) {
                var w = Math.floor(entries[i].contentRect.width);
                var h = Math.floor(entries[i].contentRect.height);
                if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
                    canvas.width = w;
                    canvas.height = h;
                    state.pixelColors = null;
                    drawMinimap(state);
                }
            }
        });
        ro.observe(canvas);
        state.resizeObserver = ro;

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
        var state = this._instances.get(canvasId);
        if (!state) return;

        var layout = JSON.parse(layoutJson);
        state.layout = layout.entries;
        state.totalRowCount = layout.totalRowCount;
        state.segments = segmentDataArrays;
        state.segValidity = segmentValidityArrays;
        state.pixelColors = null;
        drawMinimap(state);
    },

    dispose: function (canvasId) {
        var state = this._instances.get(canvasId);
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

// Click/drag — direct linear mapping to HexViewer scroll since they share the same row space
function handlePointerDown(state, e) {
    var sc = state.scrollContainer;
    var totalHeight = state.totalRowCount * ROW_HEIGHT;
    var viewportHeight = sc.clientHeight;
    if (totalHeight <= viewportHeight) return;

    e.preventDefault();
    state.isDragging = true;

    var clientY = getClientY(e);
    if (clientY === null) return;

    var canvas = state.canvas;
    var rect = canvas.getBoundingClientRect();
    var mapHeight = canvas.height;
    var clickY = (clientY - rect.top) * (canvas.height / rect.height);

    var thumbHeight = (viewportHeight / totalHeight) * mapHeight;
    var thumbTop = (sc.scrollTop / totalHeight) * mapHeight;

    if (clickY >= thumbTop && clickY <= thumbTop + thumbHeight) {
        state.dragOffset = clickY - thumbTop;
    } else {
        state.dragOffset = thumbHeight / 2;
    }

    var newScrollTopRatio = (clickY - state.dragOffset) / mapHeight;
    sc.scrollTop = Math.max(0, Math.min(newScrollTopRatio * totalHeight, totalHeight - viewportHeight));
}

function handlePointerMove(state, e) {
    if (!state.isDragging) return;
    e.preventDefault();

    var clientY = getClientY(e);
    if (clientY === null) return;

    var canvas = state.canvas;
    var sc = state.scrollContainer;
    var totalHeight = state.totalRowCount * ROW_HEIGHT;
    var viewportHeight = sc.clientHeight;

    var rect = canvas.getBoundingClientRect();
    var clickY = (clientY - rect.top) * (canvas.height / rect.height);
    var mapHeight = canvas.height;

    var newScrollTopRatio = (clickY - state.dragOffset) / mapHeight;
    sc.scrollTop = Math.max(0, Math.min(newScrollTopRatio * totalHeight, totalHeight - viewportHeight));
}

function getClientY(e) {
    if (e.touches) {
        if (e.touches.length > 0) return e.touches[0].clientY;
        if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0].clientY;
        return null;
    }
    return e.clientY;
}

// Find layout entry for a global row (binary search)
function findEntry(layout, globalRow) {
    var lo = 0, hi = layout.length - 1;
    while (lo < hi) {
        var mid = lo + ((hi - lo + 1) >> 1);
        if (layout[mid].globalRowStart <= globalRow) lo = mid;
        else hi = mid - 1;
    }
    return layout[lo];
}

// Classify each pixel row
function computePixelColors(state) {
    var height = state.canvas.height;
    if (height <= 0 || !state.layout || state.layout.length === 0) return null;

    var colors = new Uint8Array(height); // 0=empty, 1=data, 2=erased, 3=gap
    var totalRows = state.totalRowCount;
    var rowsPerPixel = totalRows / height;

    for (var y = 0; y < height; y++) {
        var startRow = Math.floor(y * rowsPerPixel);
        var endRow = Math.max(startRow + 1, Math.floor((y + 1) * rowsPerPixel));

        var hasData = false, hasErased = false, hasGap = false, hasEmpty = false;

        for (var row = startRow; row < endRow && row < totalRows; row++) {
            var le = findEntry(state.layout, row);
            if (!le) continue;

            if (le.isGap) {
                hasGap = true;
                continue;
            }

            if (le.isEmpty) {
                hasEmpty = true;
                continue;
            }

            // Data entry — check bytes
            var segIdx = le.segmentIndex;
            if (segIdx < 0 || segIdx >= state.segments.length) continue;

            var offsetInSeg = (row - le.globalRowStart) * BYTES_PER_ROW;
            var data = state.segments[segIdx];
            var valid = state.segValidity[segIdx];

            var rowHasData = false;
            var rowHasErased = false;

            for (var j = 0; j < BYTES_PER_ROW; j++) {
                var idx = offsetInSeg + j;
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

function drawMinimap(state) {
    var ctx = state.ctx;
    var canvas = state.canvas;
    if (!ctx || canvas.width <= 0 || canvas.height <= 0) return;

    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!state.layout || state.layout.length === 0) return;

    if (!state.pixelColors || state.pixelColors.length !== h) {
        state.pixelColors = computePixelColors(state);
    }

    var colors = state.pixelColors;
    if (!colors) return;

    var mm = window.hexFlexMinimap;
    var colorMap = [mm.EMPTY_COLOR, mm.DATA_COLOR, mm.ERASED_COLOR, mm.GAP_COLOR];

    var prevColor = -1;
    var runStart = 0;
    for (var y = 0; y <= h; y++) {
        var c = y < h ? colors[y] : -1;
        if (c !== prevColor) {
            if (prevColor >= 0) {
                ctx.fillStyle = colorMap[prevColor];
                ctx.fillRect(0, runStart, w, y - runStart);
            }
            prevColor = c;
            runStart = y;
        }
    }

    // Viewport indicator — direct mapping since minimap and HexViewer share row space
    var sc = state.scrollContainer;
    var totalHeight = state.totalRowCount * ROW_HEIGHT;
    var viewportHeight = sc.clientHeight;

    if (totalHeight > 0 && viewportHeight > 0) {
        var vpTop = (sc.scrollTop / totalHeight) * h;
        var vpH = Math.max(2, (viewportHeight / totalHeight) * h);

        ctx.fillStyle = mm.VIEWPORT_FILL;
        ctx.strokeStyle = mm.VIEWPORT_BORDER;
        ctx.lineWidth = 1;
        ctx.fillRect(0.5, vpTop + 0.5, w - 1, vpH - 1);
        ctx.strokeRect(0.5, vpTop + 0.5, w - 1, vpH - 1);
    }
}
