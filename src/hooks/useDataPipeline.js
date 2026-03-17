import { useMemo } from 'react';
import { processDataOps } from '../utils/dataOperations';

export const useDataPipeline = (rawData, dataOps, t) => {
    const processedData = useMemo(() => {
        try {
            return processDataOps(rawData, dataOps, t('无效日期', 'Invalid Date'));
        } catch (e) {
            console.error("Process Error:", e);
            return rawData;
        }
    }, [rawData, dataOps, t]);

    return processedData;
};

export default useDataPipeline;
