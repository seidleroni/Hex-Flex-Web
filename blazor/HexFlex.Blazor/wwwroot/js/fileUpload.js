// File upload JS interop for drag-drop support
window.hexFlexFileUpload = {
    // Click the hidden InputFile element
    clickElement: function (element) {
        if (element) {
            element.click();
        }
    },

    // Initialize drag-drop and click-to-upload on a container
    initDropZone: function (dropZoneElement, inputFileElement) {
        if (!dropZoneElement || !inputFileElement) return;

        // Handle click: open file dialog synchronously from user gesture
        // (Blazor async interop breaks the trusted gesture chain, causing hangs)
        function onClick(e) {
            // Don't re-trigger if the click came from the input itself
            if (e.target === inputFileElement) return;
            inputFileElement.click();
        }

        dropZoneElement.addEventListener('click', onClick);

        function onDrop(e) {
            e.preventDefault();
            e.stopPropagation();
            dropZoneElement.classList.remove('dragging');

            // Forward the dropped files to the InputFile by creating a new DataTransfer
            inputFileElement.files = e.dataTransfer.files;
            const event = new Event('change', { bubbles: true });
            inputFileElement.dispatchEvent(event);
        }

        function onDragOver(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        function onDragEnter(e) {
            e.preventDefault();
            e.stopPropagation();
            dropZoneElement.classList.add('dragging');
        }

        function onDragLeave(e) {
            e.preventDefault();
            e.stopPropagation();
            dropZoneElement.classList.remove('dragging');
        }

        dropZoneElement.addEventListener('drop', onDrop);
        dropZoneElement.addEventListener('dragover', onDragOver);
        dropZoneElement.addEventListener('dragenter', onDragEnter);
        dropZoneElement.addEventListener('dragleave', onDragLeave);

        // Return a cleanup reference
        dropZoneElement._hexFlexCleanup = function () {
            dropZoneElement.removeEventListener('click', onClick);
            dropZoneElement.removeEventListener('drop', onDrop);
            dropZoneElement.removeEventListener('dragover', onDragOver);
            dropZoneElement.removeEventListener('dragenter', onDragEnter);
            dropZoneElement.removeEventListener('dragleave', onDragLeave);
        };
    },

    disposeDropZone: function (dropZoneElement) {
        if (dropZoneElement && dropZoneElement._hexFlexCleanup) {
            dropZoneElement._hexFlexCleanup();
        }
    }
};
