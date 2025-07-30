import { useState, useMemo, useCallback, useEffect } from 'react';

// An interface for any object that can provide segments.
// Both SparseMemory and ComparisonMemory have this method.
interface SegmentProvider {
    getDataSegments(): { start: number; end: number; size: number }[];
    isEmpty(): boolean;
}

// An interface for the map's actions ref.
// Both MemoryMapActions and ComparisonMapActions have this method.
interface MapActions {
    goToAddress: (address: number) => void;
}

export const useSegmentManager = (
    memorySource: SegmentProvider | null,
    mapRef: React.RefObject<MapActions>
) => {
    const [activeSegmentIndex, setActiveSegmentIndex] = useState<number>(0);

    const segments = useMemo(() => {
        if (!memorySource || memorySource.isEmpty()) return [];
        return memorySource.getDataSegments();
    }, [memorySource]);

    // When the segments change (e.g., new file loaded), reset the active index to the first segment.
    useEffect(() => {
        setActiveSegmentIndex(0);
    }, [segments]);

    const handleScrollUpdate = useCallback((index: number) => {
        setActiveSegmentIndex(index);
    }, []);

    const handleSegmentClick = useCallback((address: number) => {
        mapRef.current?.goToAddress(address);
    }, [mapRef]);

    return {
        segments,
        activeSegmentIndex,
        handleScrollUpdate,
        handleSegmentClick
    };
};
