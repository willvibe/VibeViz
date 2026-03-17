import * as XLSX from 'xlsx';
import _ from 'lodash';
import { parseStandardDate, isTimeColumn } from '../utils/statMath';
import { processDataOps } from '../utils/dataOperations';

self.onmessage = async (e) => {
    const { action, payload } = e.data;

    try {
        if (action === 'PARSE_FILE') {
            const { fileBuffer, fileName } = payload;
            let parsedData = [];
            
            if (fileName.match(/\.(csv|tsv|txt)$/i)) {
                let text = "";
                try {
                    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
                    text = utf8Decoder.decode(fileBuffer);
                } catch (err) {
                    const gbkDecoder = new TextDecoder('gbk');
                    text = gbkDecoder.decode(fileBuffer);
                }
                const workbook = XLSX.read(text, { type: 'string' });
                parsedData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
            } 
            else if (fileName.endsWith('.json')) {
                const text = new TextDecoder('utf-8').decode(fileBuffer);
                const jsonData = JSON.parse(text);
                parsedData = Array.isArray(jsonData) ? jsonData : [jsonData];
            } 
            else {
                const workbook = XLSX.read(new Uint8Array(fileBuffer), { type: 'array' });
                parsedData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
            }

            let rawData = parsedData;
            const currentColumns = rawData.length > 0 ? Object.keys(rawData[0]) : [];
            const timeCols = currentColumns.filter(col => isTimeColumn(col));

            if (timeCols.length > 0) {
                rawData = rawData.map(row => {
                    const newRow = { ...row }; 
                    timeCols.forEach(col => {
                        const cleanDate = parseStandardDate(newRow[col]);
                        if (cleanDate) {
                            newRow[col] = cleanDate; 
                        }
                    });
                    return newRow;
                });
            }

            self.postMessage({ 
                status: 'PARSE_SUCCESS', 
                columns: currentColumns,
                rawData: rawData,
                processedData: rawData
            });
        }

        if (action === 'PROCESS_DATA') {
            const { rawData, dataOps, lang } = payload;
            const result = processDataOps(rawData, dataOps, lang);

            self.postMessage({ 
                status: 'PROCESS_SUCCESS', 
                processedData: result 
            });
        }
    } catch (error) {
        self.postMessage({ status: 'ERROR', error: error.message });
    }
};
