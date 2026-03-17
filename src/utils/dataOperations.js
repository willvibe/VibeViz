import _ from 'lodash';
import { parseNumber, computeAgg, calcPearson, round2 } from './statMath';

export const extractVals = (arr, colName, aggFunc) => {
    return arr.map(g => {
        if (aggFunc === 'count') {
            return (g[colName] !== null && g[colName] !== undefined && String(g[colName]).trim() !== '') ? 1 : NaN;
        }
        return parseNumber(g[colName]);
    }).filter(v => !isNaN(v));
};

export const processGroupBy = (data, config) => {
    const { groupCol, aggCol, aggFunc } = config;
    const grouped = _.groupBy(data, groupCol);
    return Object.keys(grouped).map(key => {
        let newRow = { [groupCol]: key };
        const groupVals = extractVals(grouped[key], aggCol, aggFunc);
        newRow[`${aggCol}_${aggFunc}`] = computeAgg(groupVals, aggFunc);
        return newRow;
    });
};

export const processValueCounts = (data, config) => {
    const { col } = config;
    const counts = _.countBy(data, col);
    return Object.keys(counts).map(k => ({ [col]: k, 'Count': counts[k] })).sort((a, b) => b.Count - a.Count);
};

export const processSort = (data, config) => {
    const { sortCol, order } = config;
    return _.orderBy(data, [row => parseNumber(row[sortCol]) || row[sortCol]], [order]);
};

export const processPivot = (data, config) => {
    const { rowCol, colCol, valCol, aggFunc } = config;
    const groupedByRow = _.groupBy(data, rowCol);
    const allCols = Array.from(new Set(data.map(r => String(r[colCol]))));
    return Object.keys(groupedByRow).map(rowKey => {
        let newRow = { [rowCol]: rowKey };
        allCols.forEach(c => {
            const cellGroup = groupedByRow[rowKey].filter(g => String(g[colCol]) === c);
            const cellData = extractVals(cellGroup, valCol, aggFunc);
            newRow[c] = computeAgg(cellData, aggFunc);
        });
        return newRow;
    });
};

export const processBin = (data, config) => {
    const { col, bins } = config;
    const vals = data.map(r => parseNumber(r[col])).filter(v => !isNaN(v));
    if (vals.length === 0) return data;

    const min = _.min(vals);
    const max = _.max(vals);
    const range = max - min;
    const step = max === min ? 1 : range / bins;

    return data.map(r => {
        const val = parseNumber(r[col]);
        if (isNaN(val)) return r;
        let binIdx = max === min ? 0 : Math.floor((val - min) / step);
        if (binIdx >= bins) binIdx = bins - 1;

        let binStart = min + binIdx * step;
        let binEnd = min + (binIdx + 1) * step;

        let dStart = range > 10 ? Math.floor(binStart) : round2(binStart);
        let dEnd = range > 10 ? Math.floor(binEnd) : round2(binEnd);
        if (binIdx === bins - 1 && range > 10) dEnd = Math.ceil(binEnd);

        return { ...r, [`${col}_bins`]: `[${dStart} ~ ${dEnd})` };
    });
};

export const processOneHot = (data, config) => {
    const { col } = config;
    let uniqueVals = Array.from(new Set(data.map(r => String(r[col]))));
    if (uniqueVals.length > 50) uniqueVals.length = 50;
    return data.map(r => {
        let newR = { ...r };
        uniqueVals.forEach(v => { newR[`${col}_${v}`] = String(r[col]) === v ? 1 : 0; });
        return newR;
    });
};

export const processTimeSeries = (data, config, lang) => {
    const { col, freq, aggCol, aggFunc } = config;
    const grouped = _.groupBy(data, row => {
        const d = new Date(row[col]);
        if (isNaN(d.getTime())) return lang === 'zh' ? '\u65e0\u6548\u65e5\u671f' : 'Invalid Date';

        const pad = n => String(n).padStart(2, '0');
        const yyyy = d.getFullYear();
        const mm = pad(d.getMonth() + 1);
        const dd = pad(d.getDate());
        const hh = pad(d.getHours());
        const min = pad(d.getMinutes());
        const ss = pad(d.getSeconds());

        if (freq === 'year') return String(yyyy);
        if (freq === 'month') return `${yyyy}-${mm}`;
        if (freq === 'day') return `${yyyy}-${mm}-${dd}`;
        if (freq === 'hour') return `${yyyy}-${mm}-${dd} ${hh}:00`;
        if (freq === 'minute') return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
        if (freq === 'second') return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
        return `${yyyy}-${mm}-${dd}`;
    });

    const invalidLabel = lang === 'zh' ? '\u65e0\u6548\u65e5\u671f' : 'Invalid Date';
    return Object.keys(grouped).filter(k => k !== invalidLabel).map(key => {
        let newRow = { [col]: key };
        const groupVals = extractVals(grouped[key], aggCol, aggFunc);
        newRow[`${aggCol}_${aggFunc}`] = computeAgg(groupVals, aggFunc);
        return newRow;
    }).sort((a, b) => a[col].localeCompare(b[col]));
};

export const processPearson = (data) => {
    const currentCols = Object.keys(data[0] || {});
    const numCols = currentCols.filter(c => {
        let numCount = 0;
        data.forEach(r => { if (!isNaN(parseNumber(r[c]))) numCount++; });
        return numCount > data.length * 0.5;
    });

    if (numCols.length <= 1) return data;

    const matrixData = [];
    numCols.forEach(c1 => {
        let row = { '\u53d8\u91cf': c1 };
        numCols.forEach(c2 => {
            let pairX = [], pairY = [];
            data.forEach(r => {
                let val1 = parseNumber(r[c1]);
                let val2 = parseNumber(r[c2]);
                if (!isNaN(val1) && !isNaN(val2)) { pairX.push(val1); pairY.push(val2); }
            });
            row[c2] = round2(calcPearson(pairX, pairY));
        });
        matrixData.push(row);
    });
    return matrixData;
};

export const applySortAfterOp = (data, sortOrder = 'desc') => {
    if (data.length === 0) return data;
    const currentCols = Object.keys(data[0]);
    let sortCol = currentCols[currentCols.length - 1];
    for (let i = currentCols.length - 1; i >= 0; i--) {
        if (!isNaN(parseNumber(data[0][currentCols[i]]))) {
            sortCol = currentCols[i];
            break;
        }
    }
    return _.orderBy(data, [row => {
        const val = parseNumber(row[sortCol]);
        return isNaN(val) ? row[sortCol] : val;
    }], [sortOrder]);
};

export const processDataOps = (rawData, dataOps, lang) => {
    let result = [...rawData];

    for (let op of dataOps) {
        switch (op.type) {
            case 'groupby':
                result = processGroupBy(result, op);
                break;
            case 'value_counts':
                result = processValueCounts(result, op);
                break;
            case 'sort':
                result = processSort(result, op);
                break;
            case 'pivot':
                result = processPivot(result, op);
                break;
            case 'bin':
                result = processBin(result, op);
                break;
            case 'onehot':
                result = processOneHot(result, op);
                break;
            case 'timeseries':
                result = processTimeSeries(result, op, lang);
                break;
            case 'pearson':
                result = processPearson(result);
                break;
        }

        if (op.applySort && result.length > 0) {
            result = applySortAfterOp(result, op.sortOrder);
        }
    }

    return result;
};

export default {
    processDataOps,
    processGroupBy,
    processValueCounts,
    processSort,
    processPivot,
    processBin,
    processOneHot,
    processTimeSeries,
    processPearson
};
