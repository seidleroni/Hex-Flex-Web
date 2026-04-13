// File upload JS interop for drag-drop support
window.hexFlexFileUpload = {
    // Click the hidden InputFile element
    clickElement: function (element) {
        if (element) {
            element.click();
        }
    },

    // Initialize drag-drop on a container, forwarding dropped files to the InputFile
    initDropZone: function (dropZoneElement, inputFileElement) {
        if (!dropZoneElement || !inputFileElement) return;

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
