import _ from 'lodash';
import { parseNumber, cleanRegionName, formatCompactNumber } from './statMath';

const CHINA_PROVINCES = ['北京', '天津', '上海', '重庆', '河北', '山西', '辽宁', '吉林', '黑龙江', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东', '海南', '四川', '贵州', '云南', '陕西', '甘肃', '青海', '台湾', '内蒙古', '广西', '西藏', '宁夏', '新疆', '香港', '澳门'];

const getSmartTitle = (chartType, xAxis, yAxes, t) => {
    if (!xAxis || yAxes.length === 0) return '';
    const yLabel = yAxes[0];
    const timeKeywords = ['date', 'time', 'month', 'year', 'day', 'period', '日期', '时间', '月份', '年份'];
    const geoKeywords = ['region', 'province', 'city', 'area', 'location', '地区', '省份', '城市', '区域'];
    const isTime = timeKeywords.some(k => xAxis.toLowerCase().includes(k));
    const isGeo = geoKeywords.some(k => xAxis.toLowerCase().includes(k)) || CHINA_PROVINCES.some(p => p.includes(xAxis) || xAxis.includes(p));
    
    if (isTime) return t(`${yLabel} 时间趋势分析`, `${yLabel} Time Trend Analysis`);
    if (isGeo) return t(`${yLabel} 区域分布分析`, `${yLabel} Regional Distribution`);
    return t(`${yLabel} 按 ${xAxis} 分布`, `${yLabel} by ${xAxis}`);
};

const getBaseChartOption = (chartType, xAxis, yAxes, processedData, dataLimit, customTitle, t) => {
    const title = customTitle || getSmartTitle(chartType, xAxis, yAxes, t);
    const isDark = false;
    const textColor = isDark ? '#e2e8f0' : '#334155';
    const axisColor = isDark ? '#475569' : '#cbd5e1';
    const gridColor = isDark ? '#334155' : '#e2e8f0';
    
    const limitedData = dataLimit > 0 ? processedData.slice(0, dataLimit) : processedData;
    
    const baseOption = {
        title: {
            text: title,
            left: 'center',
            top: 10,
            textStyle: {
                color: textColor,
                fontSize: 16,
                fontWeight: 'bold'
            }
        },
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderColor: '#e2e8f0',
            borderWidth: 1,
            textStyle: { color: '#334155' },
            axisPointer: {
                type: 'shadow',
                shadowStyle: { color: 'rgba(148, 163, 184, 0.1)' }
            }
        },
        legend: {
            bottom: 10,
            textStyle: { color: textColor }
        },
        grid: {
            left: '3%',
            right: '4%',
            bottom: '15%',
            top: '15%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            data: limitedData.map(row => row[xAxis]),
            axisLine: { lineStyle: { color: axisColor } },
            axisLabel: { 
                color: textColor,
                rotate: limitedData.length > 20 ? 45 : 0,
                interval: limitedData.length > 50 ? 'auto' : 0
            },
            splitLine: { show: false }
        },
        yAxis: {
            type: 'value',
            axisLine: { show: false },
            axisLabel: { color: textColor, formatter: formatCompactNumber },
            splitLine: { lineStyle: { color: gridColor, type: 'dashed' } }
        },
        dataZoom: limitedData.length > 50 ? [
            { type: 'inside', start: 0, end: 30 },
            { type: 'slider', start: 0, end: 30, bottom: 40 }
        ] : [],
        series: yAxes.map((yAxis, idx) => ({
            name: yAxis,
            type: chartType === 'area' ? 'line' : chartType,
            data: limitedData.map(row => parseNumber(row[yAxis])),
            smooth: chartType === 'line' || chartType === 'area',
            areaStyle: chartType === 'area' ? { opacity: 0.3 } : undefined,
            step: chartType === 'step' ? 'middle' : undefined,
            itemStyle: {
                color: ['#60a5fa', '#818cf8', '#a78bfa', '#f472b6', '#fbbf24'][idx % 5]
            },
            large: true,
            largeThreshold: 2000,
            progressive: 500
        }))
    };
    
    return baseOption;
};

const getPieOption = (xAxis, yAxes, processedData, dataLimit, customTitle, t) => {
    const title = customTitle || getSmartTitle('pie', xAxis, yAxes, t);
    const limitedData = dataLimit > 0 ? processedData.slice(0, dataLimit) : processedData;
    const yAxis = yAxes[0];
    
    return {
        title: {
            text: title,
            left: 'center',
            top: 10,
            textStyle: { color: '#334155', fontSize: 16, fontWeight: 'bold' }
        },
        tooltip: {
            trigger: 'item',
            formatter: '{b}: {c} ({d}%)',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderColor: '#e2e8f0',
            borderWidth: 1,
            textStyle: { color: '#334155' }
        },
        legend: {
            orient: 'vertical',
            left: 'left',
            top: 'center',
            type: 'scroll'
        },
        series: [{
            type: 'pie',
            radius: ['40%', '70%'],
            center: ['60%', '50%'],
            avoidLabelOverlap: true,
            itemStyle: {
                borderRadius: 8,
                borderColor: '#fff',
                borderWidth: 2
            },
            label: {
                show: true,
                formatter: '{b}: {d}%'
            },
            emphasis: {
                label: { show: true, fontSize: 14, fontWeight: 'bold' },
                itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' }
            },
            data: limitedData.map(row => ({
                name: row[xAxis],
                value: parseNumber(row[yAxis])
            })).filter(d => !isNaN(d.value)).sort((a, b) => b.value - a.value)
        }]
    };
};

const getScatterOption = (xAxis, yAxes, processedData, dataLimit, customTitle, t) => {
    const title = customTitle || getSmartTitle('scatter', xAxis, yAxes, t);
    const limitedData = dataLimit > 0 ? processedData.slice(0, dataLimit) : processedData;
    
    return {
        title: {
            text: title,
            left: 'center',
            top: 10,
            textStyle: { color: '#334155', fontSize: 16, fontWeight: 'bold' }
        },
        tooltip: {
            trigger: 'item',
            formatter: (params) => `${xAxis}: ${params.value[0]}<br/>${yAxes[0]}: ${params.value[1]}`,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderColor: '#e2e8f0',
            borderWidth: 1,
            textStyle: { color: '#334155' }
        },
        xAxis: {
            type: 'value',
            name: xAxis,
            nameLocation: 'middle',
            nameGap: 30,
            axisLine: { lineStyle: { color: '#cbd5e1' } },
            axisLabel: { color: '#334155' },
            splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } }
        },
        yAxis: {
            type: 'value',
            name: yAxes[0],
            nameLocation: 'middle',
            nameGap: 40,
            axisLine: { show: false },
            axisLabel: { color: '#334155' },
            splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } }
        },
        series: [{
            type: 'scatter',
            data: limitedData.map(row => [parseNumber(row[xAxis]), parseNumber(row[yAxes[0]])]).filter(d => !isNaN(d[0]) && !isNaN(d[1])),
            symbolSize: 10,
            itemStyle: {
                color: '#60a5fa',
                opacity: 0.7
            },
            emphasis: {
                itemStyle: { opacity: 1, borderColor: '#fff', borderWidth: 2 }
            },
            large: true,
            largeThreshold: 2000,
            progressive: 500
        }]
    };
};

const getRadarOption = (xAxis, yAxes, processedData, dataLimit, customTitle, t) => {
    const title = customTitle || getSmartTitle('radar', xAxis, yAxes, t);
    const limitedData = dataLimit > 0 ? processedData.slice(0, dataLimit) : processedData;
    
    const indicators = yAxes.map(y => ({ name: y, max: Math.max(...limitedData.map(r => parseNumber(r[y]) || 0)) * 1.2 }));
    
    return {
        title: {
            text: title,
            left: 'center',
            top: 10,
            textStyle: { color: '#334155', fontSize: 16, fontWeight: 'bold' }
        },
        tooltip: {
            trigger: 'item',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderColor: '#e2e8f0',
            borderWidth: 1,
            textStyle: { color: '#334155' }
        },
        legend: {
            bottom: 10,
            data: limitedData.slice(0, 5).map(row => row[xAxis])
        },
        radar: {
            indicator: indicators,
            center: ['50%', '50%'],
            radius: '60%'
        },
        series: [{
            type: 'radar',
            data: limitedData.slice(0, 5).map((row, idx) => ({
                value: yAxes.map(y => parseNumber(row[y]) || 0),
                name: row[xAxis],
                itemStyle: { color: ['#60a5fa', '#818cf8', '#a78bfa', '#f472b6', '#fbbf24'][idx % 5] },
                areaStyle: { opacity: 0.2 }
            }))
        }]
    };
};

const getFunnelOption = (xAxis, yAxes, processedData, dataLimit, customTitle, t) => {
    const title = customTitle || getSmartTitle('funnel', xAxis, yAxes, t);
    const limitedData = dataLimit > 0 ? processedData.slice(0, dataLimit) : processedData;
    const yAxis = yAxes[0];
    
    return {
        title: {
            text: title,
            left: 'center',
            top: 10,
            textStyle: { color: '#334155', fontSize: 16, fontWeight: 'bold' }
        },
        tooltip: {
            trigger: 'item',
            formatter: '{b}: {c}',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderColor: '#e2e8f0',
            borderWidth: 1,
            textStyle: { color: '#334155' }
        },
        series: [{
            type: 'funnel',
            left: '10%',
            top: 60,
            bottom: 60,
            width: '80%',
            min: 0,
            max: Math.max(...limitedData.map(r => parseNumber(r[yAxis]) || 0)),
            minSize: '0%',
            maxSize: '100%',
            sort: 'descending',
            gap: 2,
            label: {
                show: true,
                position: 'inside'
            },
            labelLine: {
                length: 10,
                lineStyle: { width: 1, type: 'solid' }
            },
            itemStyle: { borderColor: '#fff', borderWidth: 1 },
            emphasis: {
                label: { fontSize: 20 }
            },
            data: limitedData.map(row => ({
                name: row[xAxis],
                value: parseNumber(row[yAxis])
            })).filter(d => !isNaN(d.value))
        }]
    };
};

const getBar3DOption = (xAxis, yAxes, processedData, dataLimit, customTitle, t) => {
    const title = customTitle || getSmartTitle('bar3D', xAxis, yAxes, t);
    const limitedData = dataLimit > 0 ? processedData.slice(0, dataLimit) : processedData;
    
    const xData = [...new Set(limitedData.map(row => row[xAxis]))];
    const yData = yAxes;
    
    const data = [];
    limitedData.forEach((row, rowIdx) => {
        yAxes.forEach((yAxis, yIdx) => {
            data.push([rowIdx, yIdx, parseNumber(row[yAxis]) || 0]);
        });
    });
    
    return {
        title: {
            text: title,
            left: 'center',
            top: 10,
            textStyle: { color: '#334155', fontSize: 16, fontWeight: 'bold' }
        },
        tooltip: {
            show: false
        },
        visualMap: {
            max: Math.max(...data.map(d => d[2])),
            min: 0,
            inRange: {
                color: ['#e0f2fe', '#7dd3fc', '#0ea5e9', '#0284c7', '#0369a1']
            },
            show: false
        },
        xAxis3D: {
            type: 'category',
            data: xData,
            name: '',
            axisLabel: { show: false },
            axisLine: { lineStyle: { color: '#cbd5e1' } }
        },
        yAxis3D: {
            type: 'category',
            data: yData,
            name: '',
            axisLabel: { show: false },
            axisLine: { lineStyle: { color: '#cbd5e1' } }
        },
        zAxis3D: {
            type: 'value',
            name: '',
            axisLabel: { show: false },
            axisLine: { lineStyle: { color: '#cbd5e1' } }
        },
        grid3D: {
            boxWidth: 200,
            boxDepth: 80,
            viewControl: {
                projection: 'perspective',
                autoRotate: false,
                alpha: 20,
                beta: 40,
                distance: 300
            },
            light: {
                main: { intensity: 1.2, shadow: true },
                ambient: { intensity: 0.3 }
            }
        },
        series: [{
            type: 'bar3D',
            data: data,
            shading: 'lambert',
            label: { show: false },
            itemStyle: { opacity: 0.9 },
            emphasis: {
                label: { show: false }
            }
        }]
    };
};

const getHistogramOption = (xAxis, yAxes, processedData, dataLimit, customTitle, t) => {
    const title = customTitle || getSmartTitle('histogram', xAxis, yAxes, t);
    const limitedData = dataLimit > 0 ? processedData.slice(0, dataLimit) : processedData;
    const yAxis = yAxes[0];
    
    const values = limitedData.map(row => parseNumber(row[yAxis])).filter(v => !isNaN(v));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const bins = 20;
    const step = (max - min) / bins;
    
    const histogramData = Array(bins).fill(0);
    values.forEach(v => {
        const binIdx = Math.min(Math.floor((v - min) / step), bins - 1);
        histogramData[binIdx]++;
    });
    
    const xLabels = Array(bins).fill(0).map((_, i) => {
        const start = min + i * step;
        const end = min + (i + 1) * step;
        return `${start.toFixed(1)}-${end.toFixed(1)}`;
    });
    
    return {
        title: {
            text: title,
            left: 'center',
            top: 10,
            textStyle: { color: '#334155', fontSize: 16, fontWeight: 'bold' }
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderColor: '#e2e8f0',
            borderWidth: 1,
            textStyle: { color: '#334155' }
        },
        xAxis: {
            type: 'category',
            data: xLabels,
            axisLabel: { rotate: 45, color: '#334155' },
            axisLine: { lineStyle: { color: '#cbd5e1' } }
        },
        yAxis: {
            type: 'value',
            name: '频数',
            axisLabel: { color: '#334155' },
            splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } }
        },
        series: [{
            type: 'bar',
            data: histogramData,
            itemStyle: {
                color: '#60a5fa',
                borderRadius: [4, 4, 0, 0]
            },
            barWidth: '90%'
        }]
    };
};

const getHeatmapCorrOption = (processedData, dataLimit, customTitle, t) => {
    const title = customTitle || t('相关系数矩阵', 'Correlation Matrix');
    const limitedData = dataLimit > 0 ? processedData.slice(0, dataLimit) : processedData;
    
    const cols = Object.keys(limitedData[0] || {}).filter(c => c !== '变量');
    const data = [];
    
    limitedData.forEach((row, i) => {
        cols.forEach((col, j) => {
            data.push([j, i, parseNumber(row[col]) || 0]);
        });
    });
    
    return {
        title: {
            text: title,
            left: 'center',
            top: 10,
            textStyle: { color: '#334155', fontSize: 16, fontWeight: 'bold' }
        },
        tooltip: {
            position: 'top',
            formatter: (params) => `${cols[params.value[1]]} - ${cols[params.value[0]]}: ${params.value[2].toFixed(2)}`,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderColor: '#e2e8f0',
            borderWidth: 1,
            textStyle: { color: '#334155' }
        },
        grid: {
            height: '70%',
            top: '15%'
        },
        xAxis: {
            type: 'category',
            data: cols,
            splitArea: { show: true },
            axisLabel: { rotate: 45, color: '#334155' }
        },
        yAxis: {
            type: 'category',
            data: cols,
            splitArea: { show: true },
            axisLabel: { color: '#334155' }
        },
        visualMap: {
            min: -1,
            max: 1,
            calculable: true,
            orient: 'horizontal',
            left: 'center',
            bottom: '5%',
            inRange: {
                color: ['#ef4444', '#fbbf24', '#22c55e', '#3b82f6']
            }
        },
        series: [{
            type: 'heatmap',
            data: data,
            label: {
                show: true,
                formatter: (params) => params.value[2].toFixed(2),
                color: '#334155'
            },
            emphasis: {
                itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' }
            }
        }]
    };
};

const getChinaMapOption = (xAxis, yAxes, processedData, dataLimit, customTitle, t) => {
    const title = customTitle || getSmartTitle('map_china', xAxis, yAxes, t);
    const limitedData = dataLimit > 0 ? processedData.slice(0, dataLimit) : processedData;
    const yAxis = yAxes[0];
    
    const mapData = limitedData.map(row => ({
        name: cleanRegionName(row[xAxis]),
        value: parseNumber(row[yAxis])
    })).filter(d => !isNaN(d.value));
    
    return {
        title: {
            text: title,
            left: 'center',
            top: 10,
            textStyle: { color: '#334155', fontSize: 16, fontWeight: 'bold' }
        },
        tooltip: {
            trigger: 'item',
            formatter: '{b}: {c}',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderColor: '#e2e8f0',
            borderWidth: 1,
            textStyle: { color: '#334155' }
        },
        visualMap: {
            min: Math.min(...mapData.map(d => d.value)),
            max: Math.max(...mapData.map(d => d.value)),
            left: 'left',
            top: 'bottom',
            text: ['高', '低'],
            calculable: true,
            inRange: {
                color: ['#e0f2fe', '#7dd3fc', '#0ea5e9', '#0284c7', '#0369a1']
            }
        },
        series: [{
            name: yAxis,
            type: 'map',
            map: 'china',
            roam: true,
            emphasis: {
                label: { show: true },
                itemStyle: { areaColor: '#fcd34d' }
            },
            itemStyle: {
                areaColor: '#f1f5f9',
                borderColor: '#94a3b8'
            },
            data: mapData
        }]
    };
};

const getCandlestickOption = (xAxis, yAxes, processedData, dataLimit, customTitle, t) => {
    const title = customTitle || getSmartTitle('candlestick', xAxis, yAxes, t);
    const limitedData = dataLimit > 0 ? processedData.slice(0, dataLimit) : processedData;
    
    const categories = limitedData.map(row => row[xAxis]);
    const data = limitedData.map(row => {
        const open = parseNumber(row[yAxes[0]]) || 0;
        const close = parseNumber(row[yAxes[1] || yAxes[0]]) || 0;
        const low = parseNumber(row[yAxes[2] || yAxes[0]]) || Math.min(open, close);
        const high = parseNumber(row[yAxes[3] || yAxes[0]]) || Math.max(open, close);
        return [open, close, low, high];
    });
    
    return {
        title: {
            text: title,
            left: 'center',
            top: 10,
            textStyle: { color: '#334155', fontSize: 16, fontWeight: 'bold' }
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross' },
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderColor: '#e2e8f0',
            borderWidth: 1,
            textStyle: { color: '#334155' }
        },
        legend: {
            data: ['日K'],
            bottom: 10
        },
        grid: {
            left: '10%',
            right: '10%',
            bottom: '15%'
        },
        xAxis: {
            type: 'category',
            data: categories,
            scale: true,
            boundaryGap: false,
            axisLine: { onZero: false, lineStyle: { color: '#cbd5e1' } },
            axisLabel: { color: '#334155' },
            splitLine: { show: false }
        },
        yAxis: {
            scale: true,
            axisLabel: { color: '#334155' },
            splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } }
        },
        dataZoom: [
            { type: 'inside', start: 50, end: 100 },
            { show: true, type: 'slider', top: '90%', start: 50, end: 100 }
        ],
        series: [{
            name: '日K',
            type: 'candlestick',
            data: data,
            itemStyle: {
                color: '#ef4444',
                color0: '#22c55e',
                borderColor: '#ef4444',
                borderColor0: '#22c55e'
            }
        }]
    };
};

export const buildChartOption = (chartType, xAxis, yAxes, processedData, dataLimit, customTitle, t) => {
    if (!processedData || processedData.length === 0) return {};
    
    switch (chartType) {
        case 'pie':
        case 'donut':
            return getPieOption(xAxis, yAxes, processedData, dataLimit, customTitle, t);
        case 'scatter':
            return getScatterOption(xAxis, yAxes, processedData, dataLimit, customTitle, t);
        case 'radar':
            return getRadarOption(xAxis, yAxes, processedData, dataLimit, customTitle, t);
        case 'funnel':
            return getFunnelOption(xAxis, yAxes, processedData, dataLimit, customTitle, t);
        case 'bar3D':
            return getBar3DOption(xAxis, yAxes, processedData, dataLimit, customTitle, t);
        case 'histogram':
            return getHistogramOption(xAxis, yAxes, processedData, dataLimit, customTitle, t);
        case 'heatmap_corr':
            return getHeatmapCorrOption(processedData, dataLimit, customTitle, t);
        case 'map_china':
            return getChinaMapOption(xAxis, yAxes, processedData, dataLimit, customTitle, t);
        case 'candlestick':
            return getCandlestickOption(xAxis, yAxes, processedData, dataLimit, customTitle, t);
        case 'hbar': {
            const hbarOption = getBaseChartOption('bar', xAxis, yAxes, processedData, dataLimit, customTitle, t);
            return {
                ...hbarOption,
                xAxis: { ...hbarOption.yAxis, type: 'value' },
                yAxis: { ...hbarOption.xAxis, type: 'category' },
                series: hbarOption.series.map(s => ({ ...s, type: 'bar' }))
            };
        }
        default:
            return getBaseChartOption(chartType, xAxis, yAxes, processedData, dataLimit, customTitle, t);
    }
};

export default buildChartOption;
