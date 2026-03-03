import * as XLSX from 'xlsx';
import _ from 'lodash';
import { parseNumber, computeAgg, calcPearson, parseDate, round2, isTimeColumn, parseStandardDate } from '../utils/statMath';

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
            let result = [...rawData];

            const extractVals = (arr, colName, aggFunc) => {
                return arr.map(g => {
                    if (aggFunc === 'count') {
                        return (g[colName] !== null && g[colName] !== undefined && String(g[colName]).trim() !== '') ? 1 : NaN;
                    }
                    return parseNumber(g[colName]);
                }).filter(v => !isNaN(v));
            };

            for (let op of dataOps) {
                if (op.type === 'groupby') {
                    const grouped = _.groupBy(result, op.groupCol);
                    result = Object.keys(grouped).map(key => {
                        let newRow = { [op.groupCol]: key };
                        const groupVals = extractVals(grouped[key], op.aggCol, op.aggFunc);
                        newRow[`${op.aggCol}_${op.aggFunc}`] = computeAgg(groupVals, op.aggFunc);
                        return newRow;
                    });
                } 
                else if (op.type === 'value_counts') {
                    const counts = _.countBy(result, op.col);
                    result = Object.keys(counts).map(k => ({ [op.col]: k, 'Count': counts[k] })).sort((a,b) => b.Count - a.Count);
                }
                else if (op.type === 'sort') {
                    result = _.orderBy(result, [row => parseNumber(row[op.sortCol]) || row[op.sortCol]], [op.order]);
                } 
                else if (op.type === 'pivot') {
                    const groupedByRow = _.groupBy(result, op.rowCol);
                    const allCols = Array.from(new Set(result.map(r => String(r[op.colCol]))));
                    result = Object.keys(groupedByRow).map(rowKey => {
                        let newRow = { [op.rowCol]: rowKey };
                        allCols.forEach(c => {
                            const cellGroup = groupedByRow[rowKey].filter(g => String(g[op.colCol]) === c);
                            const cellData = extractVals(cellGroup, op.valCol, op.aggFunc);
                            newRow[c] = computeAgg(cellData, op.aggFunc);
                        });
                        return newRow;
                    });
                } 
                else if (op.type === 'bin') {
                    const vals = result.map(r => parseNumber(r[op.col])).filter(v => !isNaN(v));
                    if (vals.length > 0) {
                        const min = _.min(vals); const max = _.max(vals);
                        const range = max - min;
                        const step = max === min ? 1 : range / op.bins;
                        result = result.map(r => {
                            const val = parseNumber(r[op.col]);
                            if (isNaN(val)) return r;
                            let binIdx = max === min ? 0 : Math.floor((val - min) / step);
                            if (binIdx >= op.bins) binIdx = op.bins - 1;
                            
                            let binStart = min + binIdx * step;
                            let binEnd = min + (binIdx + 1) * step;
                            
                            let dStart = range > 10 ? Math.floor(binStart) : round2(binStart);
                            let dEnd = range > 10 ? Math.floor(binEnd) : round2(binEnd);
                            if (binIdx === op.bins - 1 && range > 10) dEnd = Math.ceil(binEnd);
                            
                            return { ...r, [`${op.col}_bins`]: `[${dStart} ~ ${dEnd})` };
                        });
                    }
                }
                else if (op.type === 'onehot') {
                    let uniqueVals = Array.from(new Set(result.map(r => String(r[op.col]))));
                    if (uniqueVals.length > 50) uniqueVals.length = 50; 
                    result = result.map(r => {
                        let newR = { ...r };
                        uniqueVals.forEach(v => { newR[`${op.col}_${v}`] = String(r[op.col]) === v ? 1 : 0; });
                        return newR;
                    });
                }
                else if (op.type === 'timeseries') {
                    const grouped = _.groupBy(result, row => {
                        const d = new Date(row[op.col]);
                        if(isNaN(d.getTime())) return lang === 'zh' ? '\u65e0\u6548\u65e5\u671f' : 'Invalid Date';
                        
                        const pad = n => String(n).padStart(2, '0');
                        const yyyy = d.getFullYear(); const mm = pad(d.getMonth() + 1); const dd = pad(d.getDate());
                        const hh = pad(d.getHours()); const min = pad(d.getMinutes()); const ss = pad(d.getSeconds());
                        
                        if(op.freq === 'year') return String(yyyy);
                        if(op.freq === 'month') return `${yyyy}-${mm}`;
                        if(op.freq === 'day') return `${yyyy}-${mm}-${dd}`;
                        if(op.freq === 'hour') return `${yyyy}-${mm}-${dd} ${hh}:00`;
                        if(op.freq === 'minute') return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
                        if(op.freq === 'second') return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
                        return `${yyyy}-${mm}-${dd}`;
                    });
                    
                    const invalidLabel = lang === 'zh' ? '\u65e0\u6548\u65e5\u671f' : 'Invalid Date';
                    result = Object.keys(grouped).filter(k => k !== invalidLabel).map(key => {
                        let newRow = { [op.col]: key };
                        const groupVals = extractVals(grouped[key], op.aggCol, op.aggFunc);
                        newRow[`${op.aggCol}_${op.aggFunc}`] = computeAgg(groupVals, op.aggFunc);
                        return newRow;
                    }).sort((a, b) => a[op.col].localeCompare(b[op.col]));
                }
                else if (op.type === 'pearson') {
                    const currentCols = Object.keys(result[0] || {});
                    const numCols = currentCols.filter(c => {
                        let numCount = 0;
                        result.forEach(r => { if (!isNaN(parseNumber(r[c]))) numCount++; });
                        return numCount > result.length * 0.5; 
                    });
                    
                    if (numCols.length > 1) {
                        const matrixData = [];
                        numCols.forEach(c1 => {
                            let row = { '\u53d8\u91cf': c1 };
                            numCols.forEach(c2 => {
                                let pairX = [], pairY = [];
                                result.forEach(r => {
                                    let val1 = parseNumber(r[c1]);
                                    let val2 = parseNumber(r[c2]);
                                    if (!isNaN(val1) && !isNaN(val2)) { pairX.push(val1); pairY.push(val2); }
                                });
                                row[c2] = round2(calcPearson(pairX, pairY));
                            });
                            matrixData.push(row);
                        });
                        result = matrixData;
                    }
                }
                
                if (op.applySort && result.length > 0) {
                    const currentCols = Object.keys(result[0]);
                    let sortCol = currentCols[currentCols.length - 1]; 
                    for (let i = currentCols.length - 1; i >= 0; i--) {
                        if (!isNaN(parseNumber(result[0][currentCols[i]]))) { sortCol = currentCols[i]; break; }
                    }
                    result = _.orderBy(result, [row => {
                        const val = parseNumber(row[sortCol]);
                        return isNaN(val) ? row[sortCol] : val;
                    }], [op.sortOrder || 'desc']);
                }
            }

            self.postMessage({ 
                status: 'PROCESS_SUCCESS', 
                processedData: result 
            });
        }
    } catch (error) {
        self.postMessage({ status: 'ERROR', error: error.message });
    }
};