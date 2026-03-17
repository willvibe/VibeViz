export const CHART_TYPES = [
    { id: 'bar', zh: '柱状图 (Bar)', en: 'Bar Chart' }, 
    { id: 'line', zh: '折线图 (Line)', en: 'Line Chart' }, 
    { id: 'area', zh: '面积图 (Area)', en: 'Area Chart' },
    { id: 'pie', zh: '饼图 (Pie)', en: 'Pie Chart' }, 
    { id: 'donut', zh: '环形图 (Donut)', en: 'Donut Chart' }, 
    { id: 'scatter', zh: '散点图 (Scatter)', en: 'Scatter Plot' },
    { id: 'funnel', zh: '漏斗图 (Funnel)', en: 'Funnel Chart' }, 
    { id: 'hbar', zh: '条形图 (Horizontal)', en: 'Horizontal Bar' },
    { id: 'step', zh: '阶梯图 (Step)', en: 'Step Chart' }, 
    { id: 'radar', zh: '雷达图 (Radar)', en: 'Radar Chart' },
    { id: 'bar3D', zh: '3D 柱状图 (3D Bar)', en: '3D Bar Chart' },
    { id: 'histogram', zh: '直方图 (Histogram)', en: 'Histogram (Distribution)' },
    { id: 'heatmap_corr', zh: '相关热力图 (Corr Heatmap)', en: 'Correlation Heatmap' },
    { id: 'map_china', zh: '中国地图 (China Map)', en: 'China Map' },
    { id: 'candlestick', zh: '股票K线图 (Candlestick)', en: 'Candlestick (K-Line)' }
];

export const OP_TYPES = [
    { id: 'groupby', zh: '分组聚合 (Group By)', en: 'Group By & Aggregation' }, 
    { id: 'value_counts', zh: '频数统计 (Value Counts)', en: 'Value Counts' },
    { id: 'pivot', zh: '数据透视 (Pivot Table)', en: 'Pivot Table' }, 
    { id: 'pearson', zh: '相关系数矩阵 (Pearson)', en: 'Pearson Matrix' },
    { id: 'sort', zh: '数据排序 (Sort)', en: 'Sort Data' },
    { id: 'bin', zh: '数据分箱 (Binning)', en: 'Data Binning' }, 
    { id: 'onehot', zh: '独热编码 (One-Hot)', en: 'One-Hot Encoding' },
    { id: 'timeseries', zh: '时间重采样 (Resampling)', en: 'Time Series Resampling' }
];

export const generatePM25Data = () => {
    const cities = ['北京', '上海', '广州', '深圳', '成都', '杭州', '武汉', '西安', '重庆', '南京', '天津', '苏州', '长沙', '郑州', '沈阳', '新疆', '西藏', '内蒙古'];
    const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    const data = [];
    cities.forEach(city => {
        let row = { "地区": city };
        months.forEach(month => {
            let base = 40;
            if (['1月', '2月', '11月', '12月'].includes(month)) base = 90;
            if (['北京', '天津', '郑州', '西安', '沈阳'].includes(city)) base += 40;
            row[month] = Math.floor(base + Math.random() * 80);
        });
        data.push(row);
    });
    return data;
};
