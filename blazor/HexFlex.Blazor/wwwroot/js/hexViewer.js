// Hex viewer JS interop for virtual scrolling
window.hexFlexHexViewer = {
    _instances: new Map(),

    init: function (elementId, dotNetRef) {
        const container = document.getElementById(elementId);
        if (!container) return;

        // Set a concrete pixel height on the scroll container based on viewport.
        // Must be applied via a CSS custom property so Blazor re-renders don't overwrite it.
        function setContainerHeight() {
            const rect = container.getBoundingClientRect();
            const footerHeight = 50;
            const availableHeight = window.innerHeight - rect.top - footerHeight;
            const h = Math.max(200, availableHeight);
            container.style.setProperty('height', h + 'px', 'important');
        }
        // Delay to ensure Blazor's initial render is complete
        setTimeout(setContainerHeight, 50);

        const state = {
            container: container,
            dotNetRef: dotNetRef,
            rafPending: false
        };

        function getVisibleHeight() {
            return container.clientHeight;
        }

        function onScroll() {
            if (!state.rafPending) {
                state.rafPending = true;
                requestAnimationFrame(function () {
                    state.rafPending = false;
                    dotNetRef.invokeMethodAsync('OnScrollFromJs',
                        container.scrollTop,
                        getVisibleHeight()
                    );
                });
            }
        }

        container.addEventListener('scroll', onScroll, { passive: true });
        state.scrollHandler = onScroll;

        // Window resize → recalculate container height, then notify Blazor
        function onWindowResize() {
            setContainerHeight();
            dotNetRef.invokeMethodAsync('OnResizeFromJs',
                container.scrollTop,
                getVisibleHeight()
            );
        }
        window.addEventListener('resize', onWindowResize);
        state.windowResizeHandler = onWindowResize;

        this._instances.set(elementId, state);

        // Fire initial size after a frame so layout is complete
        requestAnimationFrame(function () {
            dotNetRef.invokeMethodAsync('OnResizeFromJs',
                container.scrollTop,
                getVisibleHeight()
            );
        });
    },

    scrollTo: function (elementId, scrollTop) {
        const state = this._instances.get(elementId);
        if (state && state.container) {
            state.container.scrollTop = scrollTop;
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
