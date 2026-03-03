import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import * as echarts from 'echarts';
import 'echarts-gl';


// 自动从阿里云 DataV 官方接口拉取最新的中国地图 GeoJSON
if (!echarts.getMap('china')) {
    fetch('https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json')
        .then(res => res.json())
        .then(geoJson => {
            // 将地图数据注册为 'china'
            echarts.registerMap('china', geoJson);
            console.log('✅ 中国地图底层数据加载成功！');
        })
        .catch(err => console.error('地图加载失败:', err));
}

const ChartPreview = forwardRef(({ option }, ref) => {
    const chartRef = useRef(null);
    const chartInstance = useRef(null);
    const baseDataRef = useRef(null);
    const prevChartTypeRef = useRef(null); 
    const isAudioAppliedRef = useRef(false);
    
    // ★ 新增：专门用于管理“生长延迟”的定时器，防止组件卸载或连续点击时发生内存泄漏
    const renderTimerRef = useRef(null);

    useImperativeHandle(ref, () => ({
        // 导出超清图片
        exportImage: () => {
            return chartInstance.current ? chartInstance.current.getDataURL({ type: 'png', backgroundColor: '#ffffff', pixelRatio: 3 }) : null;
        },
        
        // 场景二：动态音频律动逻辑（接管渲染）
        applyAudioData: (frequencyData) => {
            if (!chartInstance.current || !baseDataRef.current || baseDataRef.current.length === 0) return;
            isAudioAppliedRef.current = true; 
            
            // ★ 如果律动开始，立刻打断正在“画平地”的定时器
            if (renderTimerRef.current) clearTimeout(renderTimerRef.current);
            
            let maxX = 0; let maxY = 0;
            baseDataRef.current.forEach(item => {
                const coords = Array.isArray(item) ? item : item.value;
                if (coords[0] > maxX) maxX = coords[0];
                if (coords[1] > maxY) maxY = coords[1];
            });
            const centerX = maxX / 2;
            const centerY = maxY / 2;
            const maxDist = Math.sqrt(centerX * centerX + centerY * centerY) || 1;

            const currentFrameMax = Math.max(...frequencyData) || 1;
            let currentMaxZ = -Infinity; let currentMinZ = Infinity;

            const newData = baseDataRef.current.map((item) => {
                const isObject = !Array.isArray(item);
                const coords = isObject ? item.value : item;
                const x = coords[0]; const y = coords[1]; const baseZ = coords[2];
                
                const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
                const normalizedDist = dist / maxDist; 
                const spatialMultiplier = Math.max(0.1, Math.pow(1 - normalizedDist, 1.8));
                
                const maxFreqBin = Math.floor(frequencyData.length * 0.6);
                let binIdx = Math.floor(normalizedDist * maxFreqBin); 
                if (binIdx >= frequencyData.length) binIdx = frequencyData.length - 1;
                const freq = frequencyData[binIdx] || 0;
                
                const boost = baseZ === 0 ? 10 : baseZ; 
                const newZ = baseZ + (freq / currentFrameMax) * Math.abs(boost) * 8 * spatialMultiplier;
                
                if (newZ > currentMaxZ) currentMaxZ = newZ;
                if (newZ < currentMinZ) currentMinZ = newZ;
                return isObject ? { ...item, value: [x, y, newZ] } : [x, y, newZ];
            });
            
            if (currentMaxZ === -Infinity) { currentMaxZ = 100; currentMinZ = 0; }
            if (currentMaxZ <= currentMinZ) currentMaxZ = currentMinZ + 10;
            let targetMax = currentMinZ + (currentMaxZ - currentMinZ) * 0.75;
            if (targetMax <= currentMinZ) targetMax = currentMinZ + 1;

            chartInstance.current.setOption({ 
                title: { show: false }, 
                visualMap: { min: Math.floor(currentMinZ), max: Math.ceil(targetMax) },
                xAxis3D: { nameTextStyle: { color: 'transparent' }, axisLabel: { show: false } },
                yAxis3D: { nameTextStyle: { color: 'transparent' }, axisLabel: { show: false } },
                zAxis3D: { nameTextStyle: { color: 'transparent' }, axisLabel: { show: false } },
                series: [{ 
                    data: newData,
                    animationDurationUpdate: 80, // 80ms极速刷新，贴合音符节奏
                    animationEasingUpdate: 'linear'
                }] 
            }, false); 
        },
        
        // 场景三：停止音乐时恢复原始数据状态（回归平静）
        resetAudioData: () => {
            if (!chartInstance.current || !baseDataRef.current || !isAudioAppliedRef.current) return;
            isAudioAppliedRef.current = false; 
            // 将完整的 Option 交还给 ECharts，它会自动执行平滑过渡降落
            chartInstance.current.setOption(option, false);
        }
    }));

    // 初始化
    useEffect(() => {
        if (chartRef.current) {
            chartInstance.current = echarts.init(chartRef.current);
        }
        const handleResize = () => chartInstance.current?.resize();
        window.addEventListener('resize', handleResize);
        
        return () => {
            window.removeEventListener('resize', handleResize);
            if (renderTimerRef.current) clearTimeout(renderTimerRef.current);
            if (chartInstance.current) {
                chartInstance.current.dispose(); 
                chartInstance.current = null;
            }
        };
    }, []); 

    // 场景一：正常渲染与静态生长
    useEffect(() => {
        if (chartInstance.current && option) {
            requestAnimationFrame(() => {
                if (!chartInstance.current) return;
                try { 
                    if (Object.keys(option).length === 0) {
                        chartInstance.current.clear();
                        prevChartTypeRef.current = null;
                        return;
                    }

                    const currentType = option.series && option.series[0] ? option.series[0].type : null;
                    const isNewType = prevChartTypeRef.current !== currentType;

                    if (currentType === 'bar3D') {
                        if (!isNewType) {
                            try {
                                const currentOpt = chartInstance.current.getOption();
                                if (currentOpt && currentOpt.grid3D && currentOpt.grid3D.length > 0) {
                                    const oldVC = currentOpt.grid3D[0].viewControl;
                                    if (option.grid3D && option.grid3D.viewControl && oldVC) {
                                        option.grid3D.viewControl.alpha = oldVC.alpha;
                                        option.grid3D.viewControl.beta = oldVC.beta;
                                        option.grid3D.viewControl.distance = oldVC.distance;
                                        if (oldVC.center) option.grid3D.viewControl.center = oldVC.center;
                                    }
                                }
                            } catch(e) {}
                        }

                        // 1. 构造“绝对零度”初始状态
                        let zeroOption = JSON.parse(JSON.stringify(option));
                        zeroOption.series[0].data = zeroOption.series[0].data.map(d => {
                            const v = Array.isArray(d) ? d : d.value;
                            return { value: [v[0], v[1], 0] }; 
                        });
                        if (zeroOption.zAxis3D) zeroOption.zAxis3D.min = 0; 
                        
                        // 关闭过渡，瞬间建立地平线
                        zeroOption.series[0].animationDurationUpdate = 0; 
                        chartInstance.current.setOption(zeroOption, { notMerge: isNewType });

                        // 备份目标真实数据，供后续长高和音频使用
                        baseDataRef.current = JSON.parse(JSON.stringify(option.series[0].data));

                        if (renderTimerRef.current) clearTimeout(renderTimerRef.current);

                        // ★ 核心修复：将 50ms 延长为 120ms
                        // 120ms 足够生产环境的 WebGL 引擎在极速压缩的代码流中“喘口气”，稳稳画出平地！
                        renderTimerRef.current = setTimeout(() => {
                            // 仅在当前没有处于“律动状态”时，才执行长高动画
                            if (chartInstance.current && !isAudioAppliedRef.current) {
                                chartInstance.current.setOption({
                                    series: [{
                                        data: option.series[0].data,
                                        animationDurationUpdate: 1500, // ECharts 原生 1.5 秒动画
                                        animationEasingUpdate: 'cubicOut'
                                    }]
                                }, false);
                            }
                        }, 10);

                        prevChartTypeRef.current = currentType;
                        return;
                    }

                    // --- 2D 图表开启大数据性能优化 ---
                    if (option.series) {
                        option.series = option.series.map(s => ({
                            ...s,
                            large: true,
                            largeThreshold: 2000,
                            progressive: 500
                        }));
                    }

                    chartInstance.current.setOption(option, {
                        notMerge: isNewType,
                        replaceMerge: isNewType ? [] : ['series', 'xAxis', 'yAxis']
                    });

                    prevChartTypeRef.current = currentType;
                } 
                catch (e) { console.error("ECharts Render Error:", e); }
            });
        }
    }, [option]);

    return <div ref={chartRef} style={{ width: '100%', height: '100%', minHeight: '450px', background: 'transparent' }} />;
});

export default ChartPreview;