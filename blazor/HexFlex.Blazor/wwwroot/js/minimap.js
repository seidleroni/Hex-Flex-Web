// Minimap — canvas-based memory overview with click-to-navigate and viewport indicator.
//
// The minimap builds its OWN virtual row list from the segment layout, expanding
// gaps smaller than VIEW_GAP_THRESHOLD (1MB) into individual empty rows — exactly
// like the React MemoryMap does. This means the minimap shows the address space
// proportionally, with visible empty regions between segments.
//
// The HexViewer, by contrast, collapses ALL gaps to a single row for scrolling.
// So the minimap must map between its own row space and the HexViewer's row space
// when handling click-to-navigate.

var VIEW_GAP_THRESHOLD = 0x100000; // 1MB — gaps larger than this get collapsed
var BYTES_PER_ROW = 16;
var ROW_HEIGHT = 28; // HexViewer row height in px

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
        var canvas = document.getElementById(canvasId);
        var scrollContainer = document.getElementById(scrollContainerId);
        if (!canvas || !scrollContainer) return;

        var state = {
            canvas: canvas,
            ctx: canvas.getContext('2d'),
            scrollContainer: scrollContainer,
            // Data from C#
            hvLayout: null,       // HexViewer layout entries (for scroll mapping)
            hvTotalRowCount: 0,   // HexViewer total row count
            segments: null,       // byte data per segment
            segValidity: null,    // validity masks
            // Minimap's own virtual row list
            mmRows: null,         // array of { type, address?, segIndex?, gapStart?, gapEnd? }
            mmTotalRows: 0,
            // Interaction
            isDragging: false,
            dragOffset: 0,
            pixelColors: null
        };

        // ResizeObserver to keep canvas resolution matching display size
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

        // Scroll sync
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

        // Click/drag
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
        state.hvLayout = layout.entries;
        state.hvTotalRowCount = layout.totalRowCount;
        state.segments = segmentDataArrays;
        state.segValidity = segmentValidityArrays;

        // Build the minimap's own virtual row list (React-style: expand small gaps)
        buildMinimapRows(state);

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

// Build virtual rows for the minimap, matching the React MemoryMap approach:
// - For each segment: emit data rows for every 16-byte-aligned address
// - For gaps < VIEW_GAP_THRESHOLD: emit individual empty/data rows per address
// - For gaps >= VIEW_GAP_THRESHOLD: emit a single collapsed gap row
function buildMinimapRows(state) {
    var layout = state.hvLayout;
    if (!layout || layout.length === 0) {
        state.mmRows = [];
        state.mmTotalRows = 0;
        return;
    }

    // Collect segments (non-gap entries) with their address ranges
    var segments = [];
    for (var i = 0; i < layout.length; i++) {
        var le = layout[i];
        if (!le.isGap) {
            var segEnd = le.segStartAddr + (le.rowCount - 1) * BYTES_PER_ROW;
            segments.push({
                startAddr: le.segStartAddr,
                endAddr: segEnd,
                rowCount: le.rowCount,
                segmentIndex: le.segmentIndex
            });
        }
    }

    if (segments.length === 0) {
        state.mmRows = [];
        state.mmTotalRows = 0;
        return;
    }

    // We don't store individual rows — instead store "runs" that we can index into.
    // Each run is: { type: 'data'|'empty'|'gap', startAddr, rowCount, segmentIndex }
    var runs = [];
    var lastRowAddr = segments[0].startAddr - BYTES_PER_ROW;

    for (var si = 0; si < segments.length; si++) {
        var seg = segments[si];
        var gapStart = lastRowAddr + BYTES_PER_ROW;
        var gapSize = seg.startAddr - gapStart;

        if (gapSize > 0) {
            if (gapSize > VIEW_GAP_THRESHOLD) {
                // Collapsed gap — single row
                runs.push({
                    type: 'gap',
                    startAddr: gapStart,
                    endAddr: seg.startAddr - 1,
                    rowCount: 1,
                    segmentIndex: -1
                });
            } else {
                // Expanded gap — individual rows for each address
                var gapRows = Math.floor(gapSize / BYTES_PER_ROW);
                if (gapRows > 0) {
                    runs.push({
                        type: 'empty',
                        startAddr: gapStart,
                        rowCount: gapRows,
                        segmentIndex: si
                    });
                }
            }
        }

        // Data segment rows
        runs.push({
            type: 'data',
            startAddr: seg.startAddr,
            rowCount: seg.rowCount,
            segmentIndex: seg.segmentIndex
        });

        lastRowAddr = seg.endAddr;
    }

    // Compute cumulative row starts for binary search
    var totalRows = 0;
    for (var ri = 0; ri < runs.length; ri++) {
        runs[ri].globalRowStart = totalRows;
        totalRows += runs[ri].rowCount;
    }

    state.mmRuns = runs;
    state.mmTotalRows = totalRows;
}

// Find which run a minimap row belongs to
function findMmRun(runs, globalRow) {
    var lo = 0, hi = runs.length - 1;
    while (lo < hi) {
        var mid = lo + ((hi - lo + 1) >> 1);
        if (runs[mid].globalRowStart <= globalRow) lo = mid;
        else hi = mid - 1;
    }
    return runs[lo];
}

// Classify each pixel row based on the minimap's own virtual row mapping
function computePixelColors(state) {
    var height = state.canvas.height;
    if (height <= 0 || !state.mmRuns || state.mmRuns.length === 0) return null;

    var colors = new Uint8Array(height); // 0=empty, 1=data, 2=erased, 3=gap
    var totalRows = state.mmTotalRows;
    var rowsPerPixel = totalRows / height;

    for (var y = 0; y < height; y++) {
        var startRow = Math.floor(y * rowsPerPixel);
        var endRow = Math.max(startRow + 1, Math.floor((y + 1) * rowsPerPixel));

        var hasData = false, hasErased = false, hasGap = false, hasEmpty = false;

        for (var row = startRow; row < endRow && row < totalRows; row++) {
            var run = findMmRun(state.mmRuns, row);
            if (!run) continue;

            if (run.type === 'gap') {
                hasGap = true;
                continue;
            }

            if (run.type === 'empty') {
                hasEmpty = true;
                continue;
            }

            // 'data' run — check actual bytes
            var segIdx = run.segmentIndex;
            if (segIdx < 0 || segIdx >= state.segments.length) continue;

            var offsetInRun = row - run.globalRowStart;
            var offsetInSeg = offsetInRun * BYTES_PER_ROW;
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

        // Priority: data > erased > gap > empty
        if (hasData) colors[y] = 1;
        else if (hasErased) colors[y] = 2;
        else if (hasGap) colors[y] = 3;
        else if (hasEmpty) colors[y] = 0; // empty color
        // else 0 (empty) — default
    }

    return colors;
}


// Click/drag handlers — linear mapping from canvas Y to HexViewer scroll.
// The visual (pixel colors) shows the address space proportionally, but the
// interaction behaves like a standard scrollbar: clicking at Y% scrolls to Y%.
// This avoids jarring jumps when clicking in gap regions.
function handlePointerDown(state, e) {
    var canvas = state.canvas;
    var sc = state.scrollContainer;
    var hvTotalHeight = state.hvTotalRowCount * ROW_HEIGHT;
    var viewportHeight = sc.clientHeight;
    if (hvTotalHeight <= viewportHeight) return;

    e.preventDefault();
    state.isDragging = true;

    var clientY = getClientY(e);
    if (clientY === null) return;

    var rect = canvas.getBoundingClientRect();
    var mapHeight = canvas.height;
    var clickY = (clientY - rect.top) * (canvas.height / rect.height);

    // Viewport indicator uses linear mapping
    var maxScroll = hvTotalHeight - viewportHeight;
    var thumbHeight = Math.max(2, (viewportHeight / hvTotalHeight) * mapHeight);
    var thumbTop = (sc.scrollTop / maxScroll) * (mapHeight - thumbHeight);

    if (clickY >= thumbTop && clickY <= thumbTop + thumbHeight) {
        state.dragOffset = clickY - thumbTop;
    } else {
        state.dragOffset = thumbHeight / 2;
    }

    navigateLinear(state, clickY, mapHeight);
}

function handlePointerMove(state, e) {
    if (!state.isDragging) return;
    e.preventDefault();

    var clientY = getClientY(e);
    if (clientY === null) return;

    var canvas = state.canvas;
    var rect = canvas.getBoundingClientRect();
    var clickY = (clientY - rect.top) * (canvas.height / rect.height);

    navigateLinear(state, clickY, canvas.height);
}

function navigateLinear(state, clickY, mapHeight) {
    var sc = state.scrollContainer;
    var hvTotalHeight = state.hvTotalRowCount * ROW_HEIGHT;
    var viewportHeight = sc.clientHeight;
    var maxScroll = hvTotalHeight - viewportHeight;
    var thumbHeight = Math.max(2, (viewportHeight / hvTotalHeight) * mapHeight);

    var adjustedY = clickY - state.dragOffset;
    var fraction = adjustedY / (mapHeight - thumbHeight);
    fraction = Math.max(0, Math.min(1, fraction));

    sc.scrollTop = fraction * maxScroll;
}

function getClientY(e) {
    if (e.touches) {
        if (e.touches.length > 0) return e.touches[0].clientY;
        if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0].clientY;
        return null;
    }
    return e.clientY;
}

function drawMinimap(state) {
    var ctx = state.ctx;
    var canvas = state.canvas;
    if (!ctx || canvas.width <= 0 || canvas.height <= 0) return;

    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!state.mmRuns || state.mmRuns.length === 0) return;

    // Compute or use cached pixel colors
    if (!state.pixelColors || state.pixelColors.length !== h) {
        state.pixelColors = computePixelColors(state);
    }

    var colors = state.pixelColors;
    if (!colors) return;

    var mm = window.hexFlexMinimap;
    var colorMap = [mm.EMPTY_COLOR, mm.DATA_COLOR, mm.ERASED_COLOR, mm.GAP_COLOR];

    // Draw data stripes
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

    // Draw viewport indicator — linear mapping from HexViewer scroll position
    var sc = state.scrollContainer;
    var viewportHeight = sc.clientHeight;
    var hvTotalHeight = state.hvTotalRowCount * ROW_HEIGHT;

    if (hvTotalHeight > 0 && viewportHeight > 0) {
        var maxScroll = hvTotalHeight - viewportHeight;
        var thumbH = Math.max(2, (viewportHeight / hvTotalHeight) * h);
        var vpTop = maxScroll > 0 ? (sc.scrollTop / maxScroll) * (h - thumbH) : 0;

        ctx.fillStyle = mm.VIEWPORT_FILL;
        ctx.strokeStyle = mm.VIEWPORT_BORDER;
        ctx.lineWidth = 1;
        ctx.fillRect(0.5, vpTop + 0.5, w - 1, thumbH - 1);
        ctx.strokeRect(0.5, vpTop + 0.5, w - 1, thumbH - 1);
    }
}
