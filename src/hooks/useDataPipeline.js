import { useMemo } from 'react';
import _ from 'lodash';
import { parseNumber, parseDate, computeAgg, calcPearson, round2 } from '../utils/statMath';

export const useDataPipeline = (rawData, dataOps, t) => {
    const processedData = useMemo(() => {
        let result = [...rawData];
        try {
            for (let op of dataOps) {
                if (op.type === 'groupby') {
                    const grouped = _.groupBy(result, op.groupCol);
                    result = Object.keys(grouped).map(key => {
                        let newRow = { [op.groupCol]: key };
                        const groupVals = grouped[key].map(g => parseNumber(g[op.aggCol])).filter(v => !isNaN(v));
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
                            const cellData = groupedByRow[rowKey].filter(g => String(g[op.colCol]) === c).map(g => parseNumber(g[op.valCol])).filter(v => !isNaN(v));
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
                        const d = parseDate(row[op.col]);
                        if(!d) return t('无效日期', 'Invalid Date');
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
                    result = Object.keys(grouped).filter(k => k !== t('无效日期', 'Invalid Date')).map(key => {
                        let newRow = { [op.col]: key };
                        const groupVals = grouped[key].map(g => parseNumber(g[op.aggCol])).filter(v => !isNaN(v));
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
                            let row = { '变量': c1 };
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
        } catch(e) { console.error("Process Error:", e); }
        return result;
    }, [rawData, dataOps, t]);

    return processedData;
};