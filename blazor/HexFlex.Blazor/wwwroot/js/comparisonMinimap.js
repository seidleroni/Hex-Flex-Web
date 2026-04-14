// ComparisonMinimap — canvas minimap with diff-type coloring.
// Priority: Modified > Added > Removed > Data > Erased > Gap > Empty

var CMP_MM_BYTES_PER_ROW = 16;
var CMP_MM_ROW_HEIGHT = 28;

window.hexFlexComparisonMinimap = {
    _instances: new Map(),

    // Colors
    DATA_COLOR: '#22d3ee',       // cyan-400
    EMPTY_COLOR: '#374151',      // gray-700
    ERASED_COLOR: '#94a3b8',     // slate-400
    GAP_COLOR: '#8b5cf6',        // violet-500
    MODIFIED_COLOR: '#facc15',   // yellow-400
    ADDED_COLOR: '#4ade80',      // green-400
    REMOVED_COLOR: '#f87171',    // red-400
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
            virtualRows: null,
            diffTypes: null,
            validity: null,
            bytesA: null,
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
                    drawCmpMinimap(state);
                }
            }
        });
        ro.observe(canvas);
        state.resizeObserver = ro;

        function onScroll() {
            if (!state._scrollRaf) {
                state._scrollRaf = requestAnimationFrame(function () {
                    state._scrollRaf = 0;
                    drawCmpMinimap(state);
                });
            }
        }
        scrollContainer.addEventListener('scroll', onScroll, { passive: true });
        state.scrollHandler = onScroll;

        canvas.addEventListener('mousedown', function (e) { cmpHandlePointerDown(state, e); });
        canvas.addEventListener('touchstart', function (e) { cmpHandlePointerDown(state, e); }, { passive: false });

        function onMove(e) { cmpHandlePointerMove(state, e); }
        function onUp() { state.isDragging = false; state.dragOffset = 0; }

        window.addEventListener('mousemove', onMove);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchend', onUp);
        state._globalMove = onMove;
        state._globalUp = onUp;

        this._instances.set(canvasId, state);
    },

    setData: function (canvasId, virtualRowsJson, diffTypes, bytesA, validity) {
        var state = this._instances.get(canvasId);
        if (!state) return;

        var virtualRows = JSON.parse(virtualRowsJson);
        state.virtualRows = virtualRows;
        state.totalRowCount = virtualRows.length;
        state.diffTypes = diffTypes;
        state.bytesA = bytesA;
        state.validity = validity;
        state.pixelColors = null;

        // Build data row index mapping
        var dataRowIndex = 0;
        state.dataRowIndices = [];
        for (var i = 0; i < virtualRows.length; i++) {
            if (!virtualRows[i].isGap) {
                state.dataRowIndices.push(dataRowIndex);
                dataRowIndex++;
            } else {
                state.dataRowIndices.push(-1);
            }
        }

        drawCmpMinimap(state);
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

function cmpHandlePointerDown(state, e) {
    var sc = state.scrollContainer;
    var totalHeight = state.totalRowCount * CMP_MM_ROW_HEIGHT;
    var viewportHeight = sc.clientHeight;
    if (totalHeight <= viewportHeight) return;

    e.preventDefault();
    state.isDragging = true;

    var clientY = cmpGetClientY(e);
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

function cmpHandlePointerMove(state, e) {
    if (!state.isDragging) return;
    e.preventDefault();

    var clientY = cmpGetClientY(e);
    if (clientY === null) return;

    var canvas = state.canvas;
    var sc = state.scrollContainer;
    var totalHeight = state.totalRowCount * CMP_MM_ROW_HEIGHT;
    var viewportHeight = sc.clientHeight;

    var rect = canvas.getBoundingClientRect();
    var clickY = (clientY - rect.top) * (canvas.height / rect.height);
    var mapHeight = canvas.height;

    var newScrollTopRatio = (clickY - state.dragOffset) / mapHeight;
    sc.scrollTop = Math.max(0, Math.min(newScrollTopRatio * totalHeight, totalHeight - viewportHeight));
}

function cmpGetClientY(e) {
    if (e.touches) {
        if (e.touches.length > 0) return e.touches[0].clientY;
        if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0].clientY;
        return null;
    }
    return e.clientY;
}

// DiffType enum values
var CMM_UNCHANGED = 0;
var CMM_MODIFIED = 1;
var CMM_ADDED = 2;
var CMM_REMOVED = 3;

function computeCmpPixelColors(state) {
    var height = state.canvas.height;
    if (height <= 0 || !state.virtualRows || state.virtualRows.length === 0) return null;

    // Color codes: 0=empty, 1=data, 2=erased, 3=gap, 4=modified, 5=added, 6=removed
    var colors = new Uint8Array(height);
    var totalRows = state.totalRowCount;
    var rowsPerPixel = totalRows / height;

    for (var y = 0; y < height; y++) {
        var startRow = Math.floor(y * rowsPerPixel);
        var endRow = Math.max(startRow + 1, Math.floor((y + 1) * rowsPerPixel));

        var hasModified = false, hasAdded = false, hasRemoved = false;
        var hasData = false, hasErased = false, hasGap = false;

        for (var row = startRow; row < endRow && row < totalRows; row++) {
            var vr = state.virtualRows[row];
            if (!vr) continue;

            if (vr.isGap) {
                hasGap = true;
                continue;
            }

            var dataIdx = state.dataRowIndices[row];
            if (dataIdx < 0) continue;

            var baseOffset = dataIdx * CMP_MM_BYTES_PER_ROW;

            for (var j = 0; j < CMP_MM_BYTES_PER_ROW; j++) {
                var idx = baseOffset + j;
                if (!state.validity[idx]) continue;

                var dt = state.diffTypes[idx];
                switch (dt) {
                    case CMM_MODIFIED: hasModified = true; break;
                    case CMM_ADDED: hasAdded = true; break;
                    case CMM_REMOVED: hasRemoved = true; break;
                    case CMM_UNCHANGED:
                        if (state.bytesA[idx] === 0xFF) {
                            hasErased = true;
                        } else {
                            hasData = true;
                        }
                        break;
                }
            }

            // Early exit on highest priority
            if (hasModified) break;
        }

        // Priority: modified > added > removed > data > erased > gap > empty
        if (hasModified) colors[y] = 4;
        else if (hasAdded) colors[y] = 5;
        else if (hasRemoved) colors[y] = 6;
        else if (hasData) colors[y] = 1;
        else if (hasErased) colors[y] = 2;
        else if (hasGap) colors[y] = 3;
        // else 0 (empty)
    }

    return colors;
}

function drawCmpMinimap(state) {
    var ctx = state.ctx;
    var canvas = state.canvas;
    if (!ctx || canvas.width <= 0 || canvas.height <= 0) return;

    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!state.virtualRows || state.virtualRows.length === 0) return;

    if (!state.pixelColors || state.pixelColors.length !== h) {
        state.pixelColors = computeCmpPixelColors(state);
    }

    var colors = state.pixelColors;
    if (!colors) return;

    var mm = window.hexFlexComparisonMinimap;
    var colorMap = [
        mm.EMPTY_COLOR,     // 0
        mm.DATA_COLOR,      // 1
        mm.ERASED_COLOR,    // 2
        mm.GAP_COLOR,       // 3
        mm.MODIFIED_COLOR,  // 4
        mm.ADDED_COLOR,     // 5
        mm.REMOVED_COLOR    // 6
    ];

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

    // Viewport indicator
    var sc = state.scrollContainer;
    var totalHeight = state.totalRowCount * CMP_MM_ROW_HEIGHT;
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
