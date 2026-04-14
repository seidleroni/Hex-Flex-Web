// ComparisonHexViewer — diff-colored hex view with virtual scrolling.
// Same architecture as hexViewer.js: C# sends layout + diff data once, JS renders during scroll.
//
// Constants (keep in sync with Services/Constants.cs):
//   ROW_HEIGHT = 28, BYTES_PER_ROW = 16, BUFFER_ROWS = 15,
//   MAX_RENDER_ROWS = 200, FOOTER_HEIGHT = 50
(function () {
    // Hex lookup table
    var CMP_HEX = [];
    for (var i = 0; i < 256; i++) CMP_HEX[i] = i.toString(16).toUpperCase().padStart(2, '0');

    function cmpHexAddr8(addr) {
        return addr.toString(16).toUpperCase().padStart(8, '0');
    }

    function cmpFormatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        var sizes = ['Bytes', 'KB', 'MB', 'GB'];
        var idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
        var val = bytes / Math.pow(1024, idx);
        return val.toFixed(2) + ' ' + sizes[idx];
    }

    // Diff type constants matching C# DiffType enum
    var DIFF_UNCHANGED = 0;
    var DIFF_MODIFIED = 1;
    var DIFF_ADDED = 2;
    var DIFF_REMOVED = 3;

    // Background color CSS for diff types
    var DIFF_BG = {
        1: 'rgba(250,204,21,0.3)',  // modified - yellow
        2: 'rgba(74,222,128,0.3)',  // added - green
        3: 'rgba(248,113,113,0.3)'  // removed - red
    };

    function diffTextClass(diffType) {
        switch (diffType) {
            case DIFF_MODIFIED: return 'diff-text-modified';
            case DIFF_ADDED: return 'diff-text-added';
            case DIFF_REMOVED: return 'diff-text-removed';
            default: return '';
        }
    }

    function renderVisible(state) {
        if (!state.virtualRows || state.virtualRows.length === 0) return;

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

        for (var row = firstRow; row <= lastRow; row++) {
            var vr = state.virtualRows[row];
            var y = row * rowH;

            if (vr.isGap) {
                html += '<div class="hex-row hex-row-gap" style="transform:translateY(' + y +
                    'px)" data-testid="gap-row" title="Skipped addresses from 0x' +
                    cmpHexAddr8(vr.gapStartAddr) + ' to 0x' + cmpHexAddr8(vr.gapEndAddr) +
                    '"><span class="hex-gap-text">\u2022\u2022\u2022 GAP: ' +
                    cmpFormatBytes(vr.skippedBytes) +
                    ' SKIPPED \u2022\u2022\u2022</span></div>';
            } else {
                var dataIdx = state.dataRowIndices[row];
                if (dataIdx < 0) continue;

                var rowAddr = vr.address;
                var addrHex = cmpHexAddr8(rowAddr);
                var baseOffset = dataIdx * 16;

                html += '<div class="hex-row" style="transform:translateY(' + y +
                    'px)" data-testid="data-row" data-address="' + addrHex + '">';

                // Address
                html += '<span class="hex-addr">' + addrHex + '</span>';

                // Hex bytes
                html += '<span class="hex-bytes">';
                for (var j = 0; j < 16; j++) {
                    var idx = baseOffset + j;
                    var hasData = state.validity[idx];
                    var byteAddr = rowAddr + j;
                    var isHl = hlAddr === byteAddr;
                    var dt = state.diffTypes[idx];

                    if (hasData) {
                        var byteVal;
                        if (dt === DIFF_REMOVED) {
                            byteVal = state.bytesA[idx];
                        } else {
                            byteVal = state.bytesB[idx];
                        }

                        var bgStyle = '';
                        if (dt > 0 && DIFF_BG[dt]) {
                            bgStyle = ' style="background:' + DIFF_BG[dt] + '"';
                        }

                        var cls = 'hex-byte';
                        if (isHl) {
                            cls += ' hex-byte-hl';
                        } else {
                            var tc = diffTextClass(dt);
                            if (tc) cls += ' ' + tc;
                        }

                        html += '<span class="' + cls + '"' + bgStyle + ' data-addr="' +
                            cmpHexAddr8(byteAddr) + '">' + CMP_HEX[byteVal] + '</span>';
                    } else {
                        html += '<span class="hex-byte hex-byte-empty" data-addr="' +
                            cmpHexAddr8(byteAddr) + '">--</span>';
                    }
                }
                html += '</span>';

                // ASCII
                html += '<span class="hex-ascii">';
                for (var j = 0; j < 16; j++) {
                    var idx = baseOffset + j;
                    var hasData = state.validity[idx];
                    var byteAddr = rowAddr + j;
                    var isHl = hlAddr === byteAddr;
                    var dt = state.diffTypes[idx];

                    if (hasData) {
                        var byteVal;
                        if (dt === DIFF_MODIFIED) {
                            byteVal = state.bytesB[idx];
                        } else if (dt === DIFF_REMOVED) {
                            byteVal = state.bytesA[idx];
                        } else {
                            byteVal = state.bytesB[idx];
                        }

                        var isPrintable = byteVal >= 32 && byteVal <= 126;
                        var bgStyle = '';
                        if (dt > 0 && DIFF_BG[dt]) {
                            bgStyle = ' style="background:' + DIFF_BG[dt] + '"';
                        }

                        var cls = 'hex-asc';
                        if (isHl) {
                            cls += ' hex-byte-hl';
                        } else if (dt === DIFF_MODIFIED) {
                            cls += ' diff-text-modified';
                        } else if (dt === DIFF_ADDED) {
                            cls += isPrintable ? ' diff-text-added' : '';
                        } else if (dt === DIFF_REMOVED) {
                            cls += ' diff-text-removed';
                        } else if (isPrintable) {
                            cls += ' hex-asc-print';
                        }

                        var ch;
                        if (isPrintable) {
                            if (byteVal === 60) ch = '&lt;';
                            else if (byteVal === 62) ch = '&gt;';
                            else if (byteVal === 38) ch = '&amp;';
                            else if (byteVal === 34) ch = '&quot;';
                            else ch = String.fromCharCode(byteVal);
                        } else {
                            ch = '.';
                        }

                        html += '<span class="' + cls + '"' + bgStyle + '>' + ch + '</span>';
                    } else {
                        html += '<span class="hex-asc">.</span>';
                    }
                }
                html += '</span></div>';
            }
        }

        state.scrollContent.innerHTML = html;

        // Track active segment
        if (state.virtualRows.length > 1) {
            var centerRow = Math.floor((scrollTop + viewportH / 2) / rowH);
            if (centerRow >= 0 && centerRow < state.virtualRows.length) {
                var vr = state.virtualRows[centerRow];
                var newSeg = vr.segmentIndex >= 0 ? vr.segmentIndex : 0;
                if (newSeg !== state.activeSegmentIndex) {
                    state.activeSegmentIndex = newSeg;
                    if (state._segTimer) clearTimeout(state._segTimer);
                    state._segTimer = setTimeout(function () {
                        state.dotNetRef.invokeMethodAsync('OnActiveSegmentChangedFromJs', newSeg);
                    }, 150);
                }
            }
        }
    }

    window.hexFlexComparisonHexViewer = {
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
                virtualRows: null,
                totalRowCount: 0,
                diffTypes: null,
                bytesB: null,
                bytesA: null,
                validity: null,
                dataRowIndices: null,
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

        setData: function (elementId, vrAddressBytes, vrFlags, gapDataBytes, diffTypes, bytesB, bytesA, validity) {
            var state = this._instances.get(elementId);
            if (!state) return;

            // Reconstruct virtualRows from byte arrays (uint32 LE packed)
            var addrView = new DataView(vrAddressBytes.buffer, vrAddressBytes.byteOffset, vrAddressBytes.byteLength);
            var gapView = gapDataBytes.length > 0
                ? new DataView(gapDataBytes.buffer, gapDataBytes.byteOffset, gapDataBytes.byteLength)
                : null;
            var count = vrFlags.length;
            var virtualRows = new Array(count);
            var gapIdx = 0;
            var dataRowIndex = 0;
            var dataRowIndices = new Array(count);

            for (var i = 0; i < count; i++) {
                var flag = vrFlags[i];
                var isGap = (flag & 1) === 1;
                var segmentIndex = (flag >> 1) & 0x7F;

                if (isGap) {
                    virtualRows[i] = {
                        isGap: true,
                        segmentIndex: segmentIndex,
                        gapStartAddr: gapView.getUint32(gapIdx * 12, true),
                        gapEndAddr: gapView.getUint32(gapIdx * 12 + 4, true),
                        skippedBytes: gapView.getUint32(gapIdx * 12 + 8, true)
                    };
                    dataRowIndices[i] = -1;
                    gapIdx++;
                } else {
                    virtualRows[i] = {
                        isGap: false,
                        segmentIndex: segmentIndex,
                        address: addrView.getUint32(i * 4, true)
                    };
                    dataRowIndices[i] = dataRowIndex;
                    dataRowIndex++;
                }
            }

            state.virtualRows = virtualRows;
            state.totalRowCount = count;
            state.diffTypes = diffTypes;
            state.bytesB = bytesB;
            state.bytesA = bytesA;
            state.validity = validity;
            state.dataRowIndices = dataRowIndices;

            state.scrollContent.style.height = (count * 28) + 'px';

            state.container.scrollTop = 0;
            state.highlightAddr = -1;
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
            if (!state || !state.virtualRows) return;

            var rowH = 28;
            var bytesPerRow = 16;
            var rowAddr = Math.floor(address / bytesPerRow) * bytesPerRow;
            var targetIndex = -1;

            for (var i = 0; i < state.virtualRows.length; i++) {
                var vr = state.virtualRows[i];
                if (!vr.isGap && vr.address === rowAddr) {
                    targetIndex = i;
                    break;
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
