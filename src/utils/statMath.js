// src/utils/statMath.js

export const isStrictNumber = (val) => {
    if (typeof val === 'number') return !isNaN(val);
    if (typeof val === 'string') return val.trim() !== '' && !isNaN(Number(val));
    return false;
};

export const parseNumber = (val) => {
    if (val === null || val === undefined || val === '') return NaN;
    if (typeof val === 'number') return val;
    let str = String(val).replace(/,/g, '').trim();
    return Number(str);
};

// ⚠️ 保留老的 parseDate 防止 App.jsx 和其他老组件导入报错导致白屏
export const parseDate = (val) => {
    return parseStandardDate(val);
};

export const round2 = (val) => {
    return Math.round(val * 100) / 100;
};

export const calcStd = (vals, mean) => {
    if (vals.length < 2) return 0;
    const variance = vals.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (vals.length - 1);
    return Math.sqrt(variance);
};

export const calcQuantile = (vals, q) => {
    if (vals.length === 0) return 0;
    const pos = (vals.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (vals[base + 1] !== undefined) {
        return vals[base] + rest * (vals[base + 1] - vals[base]);
    } else {
        return vals[base];
    }
};

export const cleanRegionName = (name) => {
    if (!name) return '';
    return String(name).replace(/省|市|自治区|特别行政区|壮族|回族|维吾尔/g, '').trim();
};

export const formatCompactNumber = (number) => {
    if (isNaN(number) || number === null) return 0;
    return new Intl.NumberFormat('en-US', {
        notation: "compact",
        compactDisplay: "short",
        maximumFractionDigits: 2
    }).format(number);
};

export const computeAgg = (vals, func) => {
    if (vals.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < vals.length; i++) sum += vals[i];
    if (func === 'sum') return round2(sum);
    if (func === 'avg') return round2(sum / vals.length);
    if (func === 'max') return round2(Math.max(...vals));
    if (func === 'min') return round2(Math.min(...vals));
    if (func === 'count') return vals.length;
    if (func === 'var') {
        const mean = sum / vals.length;
        let variance = 0;
        for (let i = 0; i < vals.length; i++) variance += Math.pow(vals[i] - mean, 2);
        return round2(variance / vals.length);
    }
    if (func === 'range') {
        return round2(Math.max(...vals) - Math.min(...vals));
    }
    return round2(sum);
};

export const calcPearson = (x, y) => {
    if (x.length !== y.length || x.length === 0) return 0;
    const n = x.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += x[i];
        sumY += y[i];
        sumXY += x[i] * y[i];
        sumX2 += x[i] * x[i];
        sumY2 += y[i] * y[i];
    }
    const numerator = (n * sumXY) - (sumX * sumY);
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    if (denominator === 0) return 0;
    return numerator / denominator;
};

// ==========================================
// 🔥 万能时间嗅探与清洗引擎 (含 Excel 制裁)
// ==========================================

export const parseStandardDate = (val) => {
    if (val === null || val === undefined || val === '') return null;
    let str = String(val).trim();

    // 1. 拦截底层传来的原生 JS Date 对象
    if (val instanceof Date) return formatStandardDate(val);

    // 2. 制裁 Excel 专属内部时间戳 (如 41900 代表 2014-09-18)
    if (/^\d{4,5}(\.\d+)?$/.test(str)) {
        const excelNum = Number(str);
        if (excelNum > 30000 && excelNum < 80000) {
            const unixTime = Math.round((excelNum - 25569) * 86400 * 1000);
            const utcDate = new Date(unixTime);
            const y = utcDate.getUTCFullYear();
            const m = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
            const day = String(utcDate.getUTCDate()).padStart(2, '0');
            const h = utcDate.getUTCHours();
            const min = utcDate.getUTCMinutes();
            const s = utcDate.getUTCSeconds();

            if (h === 0 && min === 0 && s === 0) {
                return `${y}-${m}-${day}`;
            }
            return `${y}-${m}-${day} ${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
    }

    // 3. 处理 UNIX 纯时间戳 (10位秒级 或 13位毫秒级)
    if (/^\d{10}$/.test(str)) return formatStandardDate(new Date(Number(str) * 1000));
    if (/^\d{13}$/.test(str)) return formatStandardDate(new Date(Number(str)));

    // 4. 暴力清洗中文年月日符号
    str = str.replace(/年|月/g, '/')
             .replace(/日|号/g, ' ')
             .replace(/时|分/g, ':')
             .replace(/秒/g, '')
             .trim();
    str = str.replace(/\/$/g, ''); 

    // 5. 兼容倒装的欧洲 DD/MM/YYYY 格式
    const euroMatch = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
    if (euroMatch) {
        if (Number(euroMatch[1]) > 12) {
            str = `${euroMatch[3]}/${euroMatch[2]}/${euroMatch[1]}`;
        }
    }

    // 6. 将短横线和点全部替换为斜杠 (治愈 Safari 解析 bug)
    str = str.replace(/[-.]/g, '/');

    // 7. 最后尝试交给浏览器底层解析
    const d = new Date(str);
    if (isNaN(d.getTime())) return null; 

    return formatStandardDate(d);
};

const formatStandardDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = d.getHours();
    const min = d.getMinutes();
    const s = d.getSeconds();

    if (h === 0 && min === 0 && s === 0) {
        return `${y}-${m}-${day}`;
    }
    return `${y}-${m}-${day} ${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export const isTimeColumn = (colName) => {
    if (!colName) return false;
    const lower = colName.toLowerCase();
    const timeKeywords = ['日期', '时间', '月份', '年份', 'date', 'time', 'month', 'year', 'day', 'period', 'timestamp'];
    return timeKeywords.some(keyword => lower.includes(keyword));
};