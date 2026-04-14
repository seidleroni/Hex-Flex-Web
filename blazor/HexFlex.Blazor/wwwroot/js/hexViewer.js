// HexViewer — all scroll rendering happens in JS. Zero C# interop during scrolling.
// C# sends layout + byte data once on file load. JS handles the rest.
window.hexFlexHexViewer = {
    _instances: new Map(),

    init: function (elementId, dotNetRef) {
        const container = document.getElementById(elementId);
        if (!container) return;

        const scrollContent = container.querySelector('.hex-viewer-scroll-content');

        function setContainerHeight() {
            const rect = container.getBoundingClientRect();
            const footerHeight = 50;
            const h = Math.max(200, window.innerHeight - rect.top - footerHeight);
            container.style.setProperty('height', h + 'px', 'important');
        }
        setTimeout(setContainerHeight, 50);

        const state = {
            container,
            scrollContent,
            dotNetRef,
            rafPending: false,
            layout: null,       // set by setData
            segments: null,     // segment byte data
            segValidity: null,  // which bytes have data
            totalRowCount: 0,
            highlightAddr: -1,
            activeSegmentIndex: -1
        };

        function onScroll() {
            if (!state.rafPending) {
                state.rafPending = true;
                requestAnimationFrame(function () {
                    state.rafPending = false;
                    renderVisible(state);
                });
            }
        }

        container.addEventListener('scroll', onScroll, { passive: true });
        state.scrollHandler = onScroll;

        function onWindowResize() {
            setContainerHeight();
            renderVisible(state);
        }
        window.addEventListener('resize', onWindowResize);
        state.windowResizeHandler = onWindowResize;

        this._instances.set(elementId, state);

        // Initial render after layout settles
        requestAnimationFrame(function () {
            setContainerHeight();
            renderVisible(state);
        });
    },

    // Called once from C# after file load. Transfers all data JS needs.
    setData: function (elementId, layoutJson, segmentDataArrays, segmentValidityArrays) {
        const state = this._instances.get(elementId);
        if (!state) return;

        const layout = JSON.parse(layoutJson);
        state.layout = layout.entries;
        state.totalRowCount = layout.totalRowCount;
        state.segments = segmentDataArrays;   // array of Uint8Array, one per segment
        state.segValidity = segmentValidityArrays; // parallel validity masks

        // Set scroll content height
        state.scrollContent.style.height = (layout.totalRowCount * 28) + 'px';

        // Reset scroll and render
        state.container.scrollTop = 0;
        renderVisible(state);
    },

    scrollTo: function (elementId, scrollTop) {
        const state = this._instances.get(elementId);
        if (state && state.container) {
            state.container.scrollTop = scrollTop;
        }
    },

    // GoToAddress: compute target from layout, scroll, highlight — all in JS
    goToAddress: function (elementId, address) {
        const state = this._instances.get(elementId);
        if (!state || !state.layout) return;

        const rowH = 28;
        const bytesPerRow = 16;
        var rowAddr = Math.floor(address / bytesPerRow) * bytesPerRow;
        var targetIndex = -1;

        for (var i = 0; i < state.layout.length; i++) {
            var le = state.layout[i];
            if (le.isGap) {
                if (address >= le.gapStartAddr && address <= le.gapEndAddr) {
                    targetIndex = le.globalRowStart;
                    break;
                }
            } else {
                var segEnd = le.segStartAddr + (le.rowCount - 1) * bytesPerRow;
                if (rowAddr >= le.segStartAddr && rowAddr <= segEnd) {
                    var offset = Math.floor((rowAddr - le.segStartAddr) / bytesPerRow);
                    targetIndex = le.globalRowStart + offset;
                    break;
                }
            }
        }

        if (targetIndex >= 0) {
            state.highlightAddr = address;
            state.container.scrollTop = targetIndex * rowH;
            renderVisible(state);

            if (state._hlTimer) clearTimeout(state._hlTimer);
            state._hlTimer = setTimeout(function () {
                state.highlightAddr = -1;
                renderVisible(state);
            }, 2000);
        }
    },

    dispose: function (elementId) {
        const state = this._instances.get(elementId);
        if (state) {
            state.container.removeEventListener('scroll', state.scrollHandler);
            if (state.windowResizeHandler) {
                window.removeEventListener('resize', state.windowResizeHandler);
            }
            this._instances.delete(elementId);
        }
    }
};

// Hex lookup table
const HEX = [];
for (let i = 0; i < 256; i++) HEX[i] = i.toString(16).toUpperCase().padStart(2, '0');

function hexAddr8(addr) {
    // Format as 8-digit uppercase hex
    return addr.toString(16).toUpperCase().padStart(8, '0');
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
    const val = bytes / Math.pow(1024, i);
    return val.toFixed(2) + ' ' + sizes[i];
}

// Find layout entry for a global row index (binary search)
function findLayoutEntry(layout, globalRow) {
    let lo = 0, hi = layout.length - 1;
    while (lo < hi) {
        const mid = lo + ((hi - lo + 1) >> 1);
        if (layout[mid].globalRowStart <= globalRow) lo = mid;
        else hi = mid - 1;
    }
    return layout[lo];
}

// Get byte at address from segment data
function getByte(state, segIndex, offsetInSeg) {
    if (segIndex < 0 || segIndex >= state.segments.length) return null;
    const data = state.segments[segIndex];
    const valid = state.segValidity[segIndex];
    if (offsetInSeg < 0 || offsetInSeg >= data.length) return null;
    if (!valid[offsetInSeg]) return null;
    return data[offsetInSeg];
}

function renderVisible(state) {
    if (!state.layout || state.layout.length === 0) return;

    const container = state.container;
    const scrollTop = container.scrollTop;
    const viewportH = container.clientHeight;
    const rowH = 28;
    const bufferRows = 15;

    const firstRow = Math.max(0, Math.floor(scrollTop / rowH) - bufferRows);
    let lastRow = Math.min(state.totalRowCount - 1,
        firstRow + Math.ceil(viewportH / rowH) + 2 * bufferRows);
    if (lastRow - firstRow > 200) lastRow = firstRow + 200;

    const hlAddr = state.highlightAddr;
    let html = '';

    for (let globalRow = firstRow; globalRow <= lastRow; globalRow++) {
        const le = findLayoutEntry(state.layout, globalRow);
        const y = globalRow * rowH;

        if (le.isGap) {
            html += '<div class="hex-row hex-row-gap" style="transform:translateY(' + y +
                'px)" data-testid="gap-row" title="Skipped addresses from 0x' +
                hexAddr8(le.gapStartAddr) + ' to 0x' + hexAddr8(le.gapEndAddr) +
                '"><span class="hex-gap-text">\u2022\u2022\u2022 GAP: ' +
                formatBytes(le.gapEndAddr - le.gapStartAddr + 1) +
                ' SKIPPED \u2022\u2022\u2022</span></div>';
        } else if (le.isEmpty) {
            // Empty row — address with -- for every byte
            const offsetInEmpty = globalRow - le.globalRowStart;
            const rowAddr = le.segStartAddr + offsetInEmpty * 16;
            const addrHex = hexAddr8(rowAddr);

            html += '<div class="hex-row" style="transform:translateY(' + y +
                'px)" data-testid="data-row" data-address="' + addrHex + '">';
            html += '<span class="hex-addr">' + addrHex + '</span>';
            html += '<span class="hex-bytes">';
            for (let j = 0; j < 16; j++) {
                html += '<span class="hex-byte hex-byte-empty">--</span>';
            }
            html += '</span>';
            html += '<span class="hex-ascii">';
            for (let j = 0; j < 16; j++) {
                html += '<span class="hex-asc">.</span>';
            }
            html += '</span></div>';
        } else {
            const offsetInSeg = globalRow - le.globalRowStart;
            const rowAddr = le.segStartAddr + offsetInSeg * 16;
            const addrHex = hexAddr8(rowAddr);

            html += '<div class="hex-row" style="transform:translateY(' + y +
                'px)" data-testid="data-row" data-address="' + addrHex + '">';

            // Address
            html += '<span class="hex-addr">' + addrHex + '</span>';

            // Hex bytes
            html += '<span class="hex-bytes">';
            const segDataOffset = offsetInSeg * 16;
            for (let j = 0; j < 16; j++) {
                const byteAddr = rowAddr + j;
                const b = getByte(state, le.segmentIndex, segDataOffset + j);
                const isHl = hlAddr === byteAddr;

                if (b !== null) {
                    if (isHl) {
                        html += '<span class="hex-byte hex-byte-hl" data-addr="' +
                            hexAddr8(byteAddr) + '">' + HEX[b] + '</span>';
                    } else {
                        html += '<span class="hex-byte" data-addr="' +
                            hexAddr8(byteAddr) + '">' + HEX[b] + '</span>';
                    }
                } else {
                    html += '<span class="hex-byte hex-byte-empty" data-addr="' +
                        hexAddr8(byteAddr) + '">..</span>';
                }
            }
            html += '</span>';

            // ASCII
            html += '<span class="hex-ascii">';
            for (let j = 0; j < 16; j++) {
                const byteAddr = rowAddr + j;
                const b = getByte(state, le.segmentIndex, segDataOffset + j);
                const isHl = hlAddr === byteAddr;
                const isPrintable = b !== null && b >= 32 && b <= 126;

                if (isHl) html += '<span class="hex-asc hex-byte-hl">';
                else if (isPrintable) html += '<span class="hex-asc hex-asc-print">';
                else html += '<span class="hex-asc">';

                if (isPrintable) {
                    const c = b;
                    if (c === 60) html += '&lt;';       // <
                    else if (c === 62) html += '&gt;';   // >
                    else if (c === 38) html += '&amp;';   // &
                    else if (c === 34) html += '&quot;';  // "
                    else html += String.fromCharCode(c);
                } else {
                    html += '.';
                }
                html += '</span>';
            }
            html += '</span></div>';
        }
    }

    state.scrollContent.innerHTML = html;

    // Track active segment — debounce notification to avoid Blazor re-render blocking scroll
    if (state.layout.length > 1) {
        const centerRow = Math.floor((scrollTop + viewportH / 2) / rowH);
        const le = findLayoutEntry(state.layout, centerRow);
        const newSeg = le.segmentIndex >= 0 ? le.segmentIndex : 0;
        if (newSeg !== state.activeSegmentIndex) {
            state.activeSegmentIndex = newSeg;
            // Debounce: only notify C# after scrolling pauses for 150ms
            if (state._segTimer) clearTimeout(state._segTimer);
            state._segTimer = setTimeout(function () {
                state.dotNetRef.invokeMethodAsync('OnActiveSegmentChangedFromJs', newSeg);
            }, 150);
        }
    }
}
