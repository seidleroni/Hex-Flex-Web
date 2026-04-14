// HexViewer — all scroll rendering happens in JS. Zero C# interop during scrolling.
// C# sends layout + byte data once on file load. JS handles the rest.
//
// Constants (keep in sync with Services/Constants.cs):
//   ROW_HEIGHT = 28, BYTES_PER_ROW = 16, BUFFER_ROWS = 15,
//   MAX_RENDER_ROWS = 200, FOOTER_HEIGHT = 50
(function () {
    // Hex lookup table
    var HEX = [];
    for (var i = 0; i < 256; i++) HEX[i] = i.toString(16).toUpperCase().padStart(2, '0');

    function hexAddr8(addr) {
        return addr.toString(16).toUpperCase().padStart(8, '0');
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        var sizes = ['Bytes', 'KB', 'MB', 'GB'];
        var idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
        var val = bytes / Math.pow(1024, idx);
        return val.toFixed(2) + ' ' + sizes[idx];
    }

    // Find layout entry for a global row index (binary search)
    function findLayoutEntry(layout, globalRow) {
        var lo = 0, hi = layout.length - 1;
        while (lo < hi) {
            var mid = lo + ((hi - lo + 1) >> 1);
            if (layout[mid].globalRowStart <= globalRow) lo = mid;
            else hi = mid - 1;
        }
        return layout[lo];
    }

    // Get byte at address from segment data
    function getByte(state, segIndex, offsetInSeg) {
        if (segIndex < 0 || segIndex >= state.segments.length) return null;
        var data = state.segments[segIndex];
        var valid = state.segValidity[segIndex];
        if (offsetInSeg < 0 || offsetInSeg >= data.length) return null;
        if (!valid[offsetInSeg]) return null;
        return data[offsetInSeg];
    }

    function renderVisible(state) {
        if (!state.layout || state.layout.length === 0) return;

        var container = state.container;
        var scrollTop = container.scrollTop;
        var viewportH = container.clientHeight;
        var rowH = 28;
        var bufferRows = 15;

        var firstRow = Math.max(0, Math.floor(scrollTop / rowH) - bufferRows);
        var lastRow = Math.min(state.totalRowCount - 1,
            firstRow + Math.ceil(viewportH / rowH) + 2 * bufferRows);
        if (lastRow - firstRow > 200) lastRow = firstRow + 200;

        var hlAddr = state.highlightAddr;
        var html = '';

        for (var globalRow = firstRow; globalRow <= lastRow; globalRow++) {
            var le = findLayoutEntry(state.layout, globalRow);
            var y = globalRow * rowH;

            if (le.isGap) {
                html += '<div class="hex-row hex-row-gap" style="transform:translateY(' + y +
                    'px)" data-testid="gap-row" title="Skipped addresses from 0x' +
                    hexAddr8(le.gapStartAddr) + ' to 0x' + hexAddr8(le.gapEndAddr) +
                    '"><span class="hex-gap-text">\u2022\u2022\u2022 GAP: ' +
                    formatBytes(le.gapEndAddr - le.gapStartAddr + 1) +
                    ' SKIPPED \u2022\u2022\u2022</span></div>';
            } else if (le.isEmpty) {
                var offsetInEmpty = globalRow - le.globalRowStart;
                var rowAddr = le.segStartAddr + offsetInEmpty * 16;
                var addrHex = hexAddr8(rowAddr);

                html += '<div class="hex-row" style="transform:translateY(' + y +
                    'px)" data-testid="data-row" data-address="' + addrHex + '">';
                html += '<span class="hex-addr">' + addrHex + '</span>';
                html += '<span class="hex-bytes">';
                for (var j = 0; j < 16; j++) {
                    html += '<span class="hex-byte hex-byte-empty">--</span>';
                }
                html += '</span>';
                html += '<span class="hex-ascii">';
                for (var j = 0; j < 16; j++) {
                    html += '<span class="hex-asc">.</span>';
                }
                html += '</span></div>';
            } else {
                var offsetInSeg = globalRow - le.globalRowStart;
                var rowAddr = le.segStartAddr + offsetInSeg * 16;
                var addrHex = hexAddr8(rowAddr);

                html += '<div class="hex-row" style="transform:translateY(' + y +
                    'px)" data-testid="data-row" data-address="' + addrHex + '">';

                // Address
                html += '<span class="hex-addr">' + addrHex + '</span>';

                // Hex bytes
                html += '<span class="hex-bytes">';
                var segDataOffset = offsetInSeg * 16;
                for (var j = 0; j < 16; j++) {
                    var byteAddr = rowAddr + j;
                    var b = getByte(state, le.segmentIndex, segDataOffset + j);
                    var isHl = hlAddr === byteAddr;

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
                for (var j = 0; j < 16; j++) {
                    var byteAddr = rowAddr + j;
                    var b = getByte(state, le.segmentIndex, segDataOffset + j);
                    var isHl = hlAddr === byteAddr;
                    var isPrintable = b !== null && b >= 32 && b <= 126;

                    if (isHl) html += '<span class="hex-asc hex-byte-hl">';
                    else if (isPrintable) html += '<span class="hex-asc hex-asc-print">';
                    else html += '<span class="hex-asc">';

                    if (isPrintable) {
                        var c = b;
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
            var centerRow = Math.floor((scrollTop + viewportH / 2) / rowH);
            var le = findLayoutEntry(state.layout, centerRow);
            var newSeg = le.segmentIndex >= 0 ? le.segmentIndex : 0;
            if (newSeg !== state.activeSegmentIndex) {
                state.activeSegmentIndex = newSeg;
                if (state._segTimer) clearTimeout(state._segTimer);
                state._segTimer = setTimeout(function () {
                    state.dotNetRef.invokeMethodAsync('OnActiveSegmentChangedFromJs', newSeg);
                }, 150);
            }
        }
    }

    window.hexFlexHexViewer = {
        _instances: new Map(),

        init: function (elementId, dotNetRef) {
            var container = document.getElementById(elementId);
            if (!container) return;

            var scrollContent = container.querySelector('.hex-viewer-scroll-content');

            function setContainerHeight() {
                var rect = container.getBoundingClientRect();
                var footerHeight = 50;
                var h = Math.max(200, window.innerHeight - rect.top - footerHeight);
                container.style.setProperty('height', h + 'px', 'important');
            }
            setTimeout(setContainerHeight, 50);

            var state = {
                container: container,
                scrollContent: scrollContent,
                dotNetRef: dotNetRef,
                rafPending: false,
                layout: null,
                segments: null,
                segValidity: null,
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

            requestAnimationFrame(function () {
                setContainerHeight();
                renderVisible(state);
            });
        },

        setData: function (elementId, layoutJson, segmentDataArrays, segmentValidityArrays) {
            var state = this._instances.get(elementId);
            if (!state) return;

            var layout = JSON.parse(layoutJson);
            state.layout = layout.entries;
            state.totalRowCount = layout.totalRowCount;
            state.segments = segmentDataArrays;
            state.segValidity = segmentValidityArrays;

            state.scrollContent.style.height = (layout.totalRowCount * 28) + 'px';

            state.container.scrollTop = 0;
            renderVisible(state);
        },

        scrollTo: function (elementId, scrollTop) {
            var state = this._instances.get(elementId);
            if (state && state.container) {
                state.container.scrollTop = scrollTop;
            }
        },

        goToAddress: function (elementId, address) {
            var state = this._instances.get(elementId);
            if (!state || !state.layout) return;

            var rowH = 28;
            var bytesPerRow = 16;
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
            var state = this._instances.get(elementId);
            if (state) {
                state.container.removeEventListener('scroll', state.scrollHandler);
                if (state.windowResizeHandler) {
                    window.removeEventListener('resize', state.windowResizeHandler);
                }
                this._instances.delete(elementId);
            }
        }
    };
})();
