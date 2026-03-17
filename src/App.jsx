import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import _ from 'lodash';
import Icons from './components/Icons';
import RainEffect from './components/RainEffect';
import ChartPreview from './components/ChartPreview';
import { callGemini } from './utils/geminiAPI';
import { isStrictNumber, parseNumber, round2, calcStd, calcQuantile, formatCompactNumber } from './utils/statMath';
import { secureStorage } from './utils/secureStorage';
import { safeParseOption } from './utils/safeCodeParser';
import { Github } from 'lucide-react';
import { CHART_TYPES, OP_TYPES, generatePM25Data } from './constants/chartTypes';
import DataEngineWorker from './workers/dataEngine.worker.js?worker';

const App = () => {
    const [lang, setLang] = useState(() => secureStorage.getItem('app_lang') || 'en');
    const t = useCallback((zhText, enText) => lang === 'zh' ? zhText : enText, [lang]);
    const toggleLang = (newLang) => { setLang(newLang); secureStorage.setItem('app_lang', newLang); };

    const workerRef = useRef(null);
    const [isWorkerProcessing, setIsWorkerProcessing] = useState(false);

    const [file, setFile] = useState(null);
    const initialData = useMemo(() => generatePM25Data(), []);
    const initialCols = Object.keys(initialData[0]);

    const [rawData, setRawData] = useState(initialData);
    const [columns, setColumns] = useState(initialCols);
    const [dataTab, setDataTab] = useState('preview');
    const [originalData, setOriginalData] = useState(initialData);
    const [originalColumns, setOriginalColumns] = useState(initialCols);
    const [processedData, setProcessedData] = useState(initialData); 
    
    const [showFilterUI, setShowFilterUI] = useState(false);
    const [filterConfig, setFilterConfig] = useState({ col: '', op: 'eq', val: '' });
    const [showSplitUI, setShowSplitUI] = useState(false);
    const [splitConfig, setSplitConfig] = useState({ col: '', delimiter: '-' });
    const [isRenderPaused, setIsRenderPaused] = useState(false);

    const [dataOps, setDataOps] = useState([]); 
    const [activeOpMenu, setActiveOpMenu] = useState('groupby');
    const [opConfig, setOpConfig] = useState({});

    const [chartType, setChartType] = useState('bar3D');
    const [xAxis, setXAxis] = useState('地区');
    const [yAxes, setYAxes] = useState(initialCols.slice(1)); 
    
    const [chartDataLimit, setChartDataLimit] = useState(0); 
    const [isCustomLimit, setIsCustomLimit] = useState(false); 
    
    const [isManualMode, setIsManualMode] = useState(false);
    const [editorCode, setEditorCode] = useState('');
    const [manualOption, setManualOption] = useState(null); 
    const [copied, setCopied] = useState(false);
    const [dataCopied, setDataCopied] = useState(false); 

    const [errorMessage, setErrorMessage] = useState(null);
    const [apiKeyConfig, setApiKeyConfig] = useState(() => secureStorage.getItem('gemini_api_key') || '');
    const [showApiKeyInput, setShowApiKeyInput] = useState(false);

    const [aiPipelineAdvice, setAiPipelineAdvice] = useState('');
    const [isFetchingAdvice, setIsFetchingAdvice] = useState(false);
    const [aiChartInsight, setAiChartInsight] = useState('');
    const [customTitle, setCustomTitle] = useState(null);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [tempTitle, setTempTitle] = useState('');
    const [isFetchingInsight, setIsFetchingInsight] = useState(false);
    
    const [smartSwitchMsg, setSmartSwitchMsg] = useState('');
    const chartComponentRef = useRef();
    const prevColsRef = useRef('');

    const defaultBgAudio = "https://media.foryou.cc.cd/media/md.m4a";
    const defaultRainAudio = "https://media.foryou.cc.cd/media/rain.m4a";
    const audioRef = useRef(null);
    const rainAudioRef = useRef(null);
    const audioCtxRef = useRef(null);
    const analyserRef = useRef(null);
    const animationFrameRef = useRef(null);
    const [audioUrl, setAudioUrl] = useState(defaultBgAudio);
    const [isPlayingAudio, setIsPlayingAudio] = useState(false);
    const [rainState, setRainState] = useState(0); 
    const [audioUnlocked, setAudioUnlocked] = useState(false);
    const [showYAxisMenu, setShowYAxisMenu] = useState(false);

    useEffect(() => { setCustomTitle(null); }, [chartType, xAxis, yAxes, dataOps]);

    useEffect(() => {
        workerRef.current = new DataEngineWorker();
        workerRef.current.onmessage = (e) => {
            const { status, columns, rawData, processedData, error } = e.data;
            setIsWorkerProcessing(false);
            if (status === 'PARSE_SUCCESS') {
                Object.freeze(rawData);
                setColumns(columns); setOriginalColumns(columns); setRawData(rawData); setOriginalData(rawData);
                setDataOps([]); setDataTab('preview'); setIsManualMode(false); setChartDataLimit(0); setIsCustomLimit(false); setProcessedData(rawData); 
            } else if (status === 'PROCESS_SUCCESS') {
                Object.freeze(processedData); setProcessedData(processedData);
            } else if (status === 'ERROR') {
                setErrorMessage(t("处理失败: ", "Process Error: ") + error);
            }
        };
        return () => workerRef.current?.terminate();
    }, [t]);

    useEffect(() => {
        if (rawData.length > 0) {
            setIsWorkerProcessing(true);
            workerRef.current.postMessage({ action: 'PROCESS_DATA', payload: { rawData, dataOps, lang } });
        }
    }, [rawData, dataOps, lang]);

    useEffect(() => { if (audioRef.current) audioRef.current.volume = 0.3; }, []);

    useEffect(() => {
        if (!isManualMode) return;
        const timer = setTimeout(() => {
            try {
                const parsed = safeParseOption(editorCode);
                setManualOption(parsed);
            } catch(err) {
                console.warn('Code parse error:', err.message);
            }
        }, 800);
        return () => clearTimeout(timer);
    }, [editorCode, isManualMode]);

    const unlockAndPlayAudio = useCallback(() => {
        if (audioUnlocked) return;
        setAudioUnlocked(true);
        try {
            if (!audioCtxRef.current) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                audioCtxRef.current = new AudioContext();
                analyserRef.current = audioCtxRef.current.createAnalyser();
                analyserRef.current.fftSize = 128; analyserRef.current.smoothingTimeConstant = 0.85; 
                const source = audioCtxRef.current.createMediaElementSource(audioRef.current);
                source.connect(analyserRef.current); analyserRef.current.connect(audioCtxRef.current.destination);
            }
            if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
            if (audioRef.current && audioUrl === defaultBgAudio) { audioRef.current.play().then(() => setIsPlayingAudio(true)).catch(e => console.warn(e)); }
        } catch (err) {
            console.warn('Audio unlock error:', err);
        }
    }, [audioUnlocked, audioUrl]);

    useEffect(() => {
        let active = true; let lastFrameTime = 0; const fpsInterval = 50; 
        if (isPlayingAudio && audioRef.current && audioCtxRef.current && analyserRef.current) {
            const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
            const renderFrame = (timestamp) => {
                if (!active || !isPlayingAudio) return;
                animationFrameRef.current = requestAnimationFrame(renderFrame);
                if (timestamp - lastFrameTime >= fpsInterval) {
                    lastFrameTime = timestamp;
                    if (chartComponentRef.current && chartType === 'bar3D') { analyserRef.current.getByteFrequencyData(dataArray); chartComponentRef.current.applyAudioData(dataArray); }
                }
            };
            animationFrameRef.current = requestAnimationFrame(renderFrame);
        } else {
            if (audioRef.current) audioRef.current.pause();
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (chartComponentRef.current && chartType === 'bar3D') chartComponentRef.current.resetAudioData();
        }
        return () => { active = false; if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
    }, [isPlayingAudio, chartType]);

    useEffect(() => {
        if (audioUrl !== defaultBgAudio && audioRef.current) {
            const autoPlayNewAudio = async () => {
                try {
                    await audioRef.current.play();
                    setIsPlayingAudio(true);
                } catch (err) {
                    console.warn('Auto play error:', err);
                }
            };
            autoPlayNewAudio();
        }
    }, [audioUrl]);

    const handleAudioUpload = (e) => {
        const file = e.target.files[0]; if (!file) return;
        if (!audioCtxRef.current) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioCtxRef.current = new AudioContext(); analyserRef.current = audioCtxRef.current.createAnalyser(); analyserRef.current.fftSize = 128; 
            const source = audioCtxRef.current.createMediaElementSource(audioRef.current);
            source.connect(analyserRef.current); analyserRef.current.connect(audioCtxRef.current.destination);
        }
        if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
        const url = URL.createObjectURL(file); setAudioUrl(url); e.target.value = '';
    };

    const toggleAudio = () => {
        if (!audioRef.current) return;
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
        if (isPlayingAudio) setIsPlayingAudio(false); else audioRef.current.play().then(() => setIsPlayingAudio(true)).catch(err => {
            console.warn('Toggle audio error:', err);
        });
    };

    const toggleRainState = (e) => { e.stopPropagation(); setRainState(prev => (prev + 1) % 4); };

    useEffect(() => {
        if (!rainAudioRef.current) return;
        if (rainState === 2) {
            rainAudioRef.current.volume = 0.3;
            rainAudioRef.current.play().catch(err => {
                console.warn('Rain audio play error:', err);
            });
        } else if (rainState === 3) {
            rainAudioRef.current.volume = 1.0;
            rainAudioRef.current.play().catch(err => {
                console.warn('Rain audio play error:', err);
            });
        } else {
            rainAudioRef.current.pause();
        }
    }, [rainState]);

    const handleApiKeyChange = (e) => { const val = e.target.value; setApiKeyConfig(val); secureStorage.setItem('gemini_api_key', val); };

    const handleFileUpload = (e) => {
        const uploadedFile = e.target.files[0]; if (!uploadedFile) return;
        const MAX_FILE_SIZE_MB = 60;
        if (uploadedFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            setErrorMessage(t(`文件大小约为 ${(uploadedFile.size / 1024 / 1024).toFixed(2)}MB。\n建议上传小于 ${MAX_FILE_SIZE_MB}MB 的文件。`, `File size is approx ${(uploadedFile.size / 1024 / 1024).toFixed(2)}MB.\nPlease upload files smaller than ${MAX_FILE_SIZE_MB}MB.`));
            e.target.value = ''; return;
        }
        setErrorMessage(null); setFile(uploadedFile); setIsWorkerProcessing(true);
        const reader = new FileReader();
        reader.onload = (evt) => { workerRef.current.postMessage({ action: 'PARSE_FILE', payload: { fileBuffer: evt.target.result, fileName: uploadedFile.name } }, [evt.target.result]); };
        reader.readAsArrayBuffer(uploadedFile); e.target.value = '';
    };

    const handleRefreshData = () => {
        const newData = generatePM25Data(); const newCols = Object.keys(newData[0]);
        setRawData(newData); setColumns(newCols); setOriginalData(newData); setOriginalColumns(newCols);
        setFile(null); setDataOps([]); setChartType('bar3D'); setProcessedData(newData);
    };

    const applyFilter = () => {
        if (!filterConfig.col || !filterConfig.val) return;
        const { col, op, val } = filterConfig; const numVal = Number(val);
        const filtered = rawData.filter(row => {
            const rowVal = row[col]; if (rowVal === null || rowVal === undefined) return false;
            if (op === 'eq') return String(rowVal) === String(val);
            if (op === 'contains') return String(rowVal).includes(String(val));
            if (op === 'gt') return Number(rowVal) > numVal;
            if (op === 'lt') return Number(rowVal) < numVal;
            return true;
        });
        setRawData(filtered); setShowFilterUI(false); setFilterConfig({ col: '', op: 'eq', val: '' });
    };

    const applySplit = () => {
        if (!splitConfig.col || !splitConfig.delimiter) return;
        const { col, delimiter } = splitConfig; let maxSplits = 0;
        const newData = rawData.map(row => { const str = String(row[col] || ''); const parts = str.split(delimiter); if (parts.length > maxSplits) maxSplits = parts.length; return { ...row, _splitParts: parts }; });
        const newCols = []; for(let i=1; i<=maxSplits; i++) newCols.push(`${col}_${t('分列', 'Split')}${i}`);
        const finalData = newData.map(row => { const parts = row._splitParts; const newRow = { ...row }; delete newRow._splitParts; newCols.forEach((c, i) => { newRow[c] = parts[i] !== undefined ? parts[i] : ''; }); return newRow; });
        const colIndex = columns.indexOf(col); const updatedCols = [...columns]; updatedCols.splice(colIndex + 1, 0, ...newCols);
        setColumns(updatedCols); setRawData(finalData); setShowSplitUI(false); setSplitConfig({ col: '', delimiter: '-' });
    };

    const resetMetadata = () => { setRawData(originalData); setColumns(originalColumns); setDataOps([]); setFilterConfig({ col: '', op: 'eq', val: '' }); setSplitConfig({ col: '', delimiter: '-' }); setProcessedData(originalData); };

    const dataProfile = useMemo(() => {
        if (rawData.length === 0) return { info: [], describe: [] };
        const info = columns.map(col => {
            let nonNull = 0; let typeMap = {};
            rawData.forEach(row => { const val = row[col]; if (val !== "" && val !== null && val !== undefined) { nonNull++; const tStr = isStrictNumber(val) ? 'number' : 'string'; typeMap[tStr] = (typeMap[tStr] || 0) + 1; } });
            const majorityType = Object.keys(typeMap).length > 0 ? Object.keys(typeMap).reduce((a, b) => typeMap[a] > typeMap[b] ? a : b) : 'unknown';
            return { col, nonNull, dType: majorityType };
        });
        const numCols = info.filter(i => i.dType === 'number').map(i => i.col);
        const describe = numCols.map(col => {
            let vals = rawData.map(r => parseNumber(r[col])).filter(v => !isNaN(v)); vals.sort((a,b) => a-b);
            if (vals.length === 0) return null;
            const count = vals.length; const mean = _.mean(vals);
            return { col, count, mean: mean.toFixed(2), std: calcStd(vals, mean).toFixed(2), min: vals[0].toFixed(2), q25: calcQuantile(vals, 0.25).toFixed(2), q50: calcQuantile(vals, 0.50).toFixed(2), q75: calcQuantile(vals, 0.75).toFixed(2), max: vals[vals.length-1].toFixed(2) };
        }).filter(Boolean);
        return { info, describe };
    }, [rawData, columns]);

    const handleGetPipelineAdvice = async () => {
        if (columns.length === 0) return; setIsFetchingAdvice(true); setAiPipelineAdvice('');
        try {
            const sysPrompt = t("你是一个专业的数据分析师顾问。", "You are a professional data analyst consultant.");
            const userPrompt = t(`我有一份数据集，包含以下字段：${columns.join(', ')}。数据类型概览：${JSON.stringify(dataProfile.info.map(i => i.col + '(' + i.dType + ')'))}。请为我推荐2到3个有价值的数据分析方向。请使用简短、直白的中文回复，直接列出建议。`, `I have a dataset with these columns: ${columns.join(', ')}. Data types: ${JSON.stringify(dataProfile.info.map(i => i.col + '(' + i.dType + ')'))}. Please recommend 2-3 valuable data analysis directions. Please reply in clear and concise English, directly listing the recommendations.`);
            const result = await callGemini(userPrompt, sysPrompt, apiKeyConfig); setAiPipelineAdvice(result);
        } catch (error) { setErrorMessage(error.message); } finally { setIsFetchingAdvice(false); }
    };

    const handleGetChartInsight = async () => {
        if (processedData.length === 0 || !xAxis) return; setIsFetchingInsight(true); setAiChartInsight('');
        try {
            const sysPrompt = t("你是一位资深商业智能（BI）数据分析师。", "You are a senior Business Intelligence (BI) data analyst.");
            const sampleData = processedData.slice(0, 50); const axisInfo = `X轴:${xAxis}, Y轴(深度/度量):${yAxes.join(',')}`;
            const userPrompt = t(`我正在查看一张图表，图表类型是：${chartType}。轴向维度映射：${axisInfo}。图表背后经过聚合计算的数据如下（仅展示部分样本）：${JSON.stringify(sampleData)}。请基于这些数据，用中文为我提供一段简短的“商业洞察/数据结论”。要求：指出数据中最大的极值、明显的趋势或异常点，控制在150字以内，语言专业且精炼。`, `I am viewing a chart of type: ${chartType}. Axis Mapping: ${axisInfo}. Aggregated data behind the chart (sample): ${JSON.stringify(sampleData)}. Based on this data, provide a brief "Business Insight/Conclusion" in English. Requirement: Point out extremes, obvious trends, or anomalies. Keep it under 100 words, professional and concise.`);
            const result = await callGemini(userPrompt, sysPrompt, apiKeyConfig); setAiChartInsight(result);
        } catch (error) { setErrorMessage(error.message); } finally { setIsFetchingInsight(false); }
    };

    useEffect(() => {
        if (processedData && processedData.length > 10000) setIsRenderPaused(true);
        else setIsRenderPaused(false);
    }, [processedData]);

    const availableColumns = useMemo(() => processedData.length > 0 ? Object.keys(processedData[0]) : [], [processedData]);

    useEffect(() => {
        const colsStr = availableColumns.join(',');
        if (availableColumns.length > 0 && prevColsRef.current !== colsStr) {
            prevColsRef.current = colsStr;
            const dataLength = processedData.length;
            if (dataLength > 10000) { setXAxis(''); setYAxes([]); setChartType(''); setSmartSwitchMsg(t(`⚠️ 数据量过大(>10000条)，已清空选项。请手动选择后点击渲染按钮！`, `⚠️ >10000 rows. Options cleared. Select manually and click Render!`)); setTimeout(() => setSmartSwitchMsg(''), 6000); return; }
            let nextX = availableColumns[0]; let nextY = availableColumns.slice(1);
            const lastOp = dataOps.length > 0 ? dataOps[dataOps.length - 1] : null; let isStock = false;
            const findC = (keywords) => availableColumns.find(c => keywords.some(k => c.toLowerCase().includes(k)));
            const dCol = findC(['日期', '时间', 'date', 'time', 'day']); const oCol = findC(['开盘', 'open']); const cCol = findC(['收盘', 'close']); const lCol = findC(['最低', 'low']); const hCol = findC(['最高', 'high']);
            if (dCol && oCol && cCol && lCol && hCol) isStock = true;
            if (lastOp) {
                if (lastOp.type === 'bin') nextX = lastOp.col || nextX; else if (lastOp.type === 'groupby') nextX = lastOp.groupCol || nextX;
                else if (lastOp.type === 'value_counts') { nextX = lastOp.col || nextX; if (availableColumns.includes('Count')) nextY = ['Count']; } 
                else if (lastOp.type === 'timeseries') nextX = lastOp.col || nextX; else if (lastOp.type === 'pearson') { nextX = '变量'; nextY = availableColumns.filter(c => c !== '变量'); } 
                else if (lastOp.type === 'pivot') { nextX = lastOp.rowCol || nextX; nextY = availableColumns.filter(c => c !== lastOp.rowCol); }
            } else if (isStock) {
                nextX = dCol; nextY = [oCol, cCol, lCol, hCol].filter(Boolean); setChartType('candlestick');
                setSmartSwitchMsg(t(`✨ AI 检测到股票金融数据，已为您自动切换至：K线图`, `✨ AI detected stock data, auto-switched to: Candlestick`)); setTimeout(() => setSmartSwitchMsg(''), 4500);
            }
            setXAxis(nextX); setYAxes(nextY); 
        }
    }, [availableColumns, dataOps, t, processedData.length]);

    useEffect(() => { setIsManualMode(false); setManualOption(null); }, [dataOps, chartType, xAxis, yAxes, chartDataLimit]);

    const addOperation = () => {
        const numCols = availableColumns.filter(c => processedData[0] && !isNaN(parseNumber(processedData[0][c])));
        const defaultAggCol = numCols.length > 0 ? numCols[numCols.length - 1] : availableColumns[0];
        let op = { type: activeOpMenu };
        if(activeOpMenu === 'groupby') op = { ...op, groupCol: opConfig.gCol||availableColumns[0], aggCol: opConfig.aCol||defaultAggCol, aggFunc: opConfig.func||'sum' };
        else if(activeOpMenu === 'value_counts') op = { ...op, col: opConfig.vCol||availableColumns[0] };
        else if(activeOpMenu === 'sort') op = { ...op, sortCol: opConfig.sCol||availableColumns[0], order: opConfig.order||'desc' };
        else if(activeOpMenu === 'pivot') op = { ...op, rowCol: opConfig.pRow||availableColumns[0], colCol: opConfig.pCol||availableColumns[0], valCol: opConfig.pVal||defaultAggCol, aggFunc: opConfig.pFunc||'sum' };
        else if(activeOpMenu === 'bin') op = { ...op, col: opConfig.bCol||defaultAggCol, bins: parseInt(opConfig.bins)||5 };
        else if(activeOpMenu === 'onehot') op = { ...op, col: opConfig.oCol||availableColumns[0] };
        else if(activeOpMenu === 'timeseries') op = { ...op, col: opConfig.tCol||availableColumns[0], aggCol: opConfig.tAggCol||defaultAggCol, freq: opConfig.freq||'day', aggFunc: opConfig.tFunc||'sum' };
        else if(activeOpMenu === 'pearson') op = { ...op };
        if (activeOpMenu !== 'sort') { op.applySort = opConfig.applySort !== false; op.sortOrder = opConfig.sortOrder || 'desc'; }
        setDataOps([...dataOps, op]);
        let switchedChart = null;
        if (activeOpMenu === 'pearson') switchedChart = 'heatmap_corr'; else if (activeOpMenu === 'pivot') switchedChart = 'bar3D';
        else if (activeOpMenu === 'bin') switchedChart = 'histogram'; else if (activeOpMenu === 'timeseries') switchedChart = 'area';
        else if (activeOpMenu === 'value_counts') switchedChart = 'donut'; else if (activeOpMenu === 'groupby') switchedChart = 'bar';
        if (switchedChart && switchedChart !== chartType) {
            setChartType(switchedChart);
            setSmartSwitchMsg(t(`✨ AI 已自动适配最佳图表：${CHART_TYPES.find(c => c.id === switchedChart)?.zh.split(' ')[0]}`, `✨ AI auto-switched to: ${CHART_TYPES.find(c => c.id === switchedChart)?.en}`));
            setTimeout(() => setSmartSwitchMsg(''), 4500);
        }
    };

    // ==========================================
    // 🎨 核心绘图引擎 (The Ultimate Renderer)
    // ==========================================
    const generatedOption = useMemo(() => {
        if (isRenderPaused) return {};
        const curXAxis = xAxis && availableColumns.includes(xAxis) ? xAxis : (processedData.length > 10000 ? '' : availableColumns[0]);
        if (!processedData.length || !curXAxis || !chartType || yAxes.length === 0) return {};
        
        // ★ 核心变量初始化：必须放在所有逻辑最前面，杜绝 ReferenceError
        const validYAxes = yAxes.filter(y => availableColumns.includes(y));
        if (validYAxes.length === 0) return {};
        
        const chartRenderData = chartDataLimit > 0 ? processedData.slice(0, chartDataLimit) : processedData;
        const thermalColors = ['#1e40af', '#3b82f6', '#60a5fa', '#9ca3af', '#e5e7eb', '#fef3c7', '#fcd34d', '#f59e0b', '#ea580c', '#be123c'];
        const labelUnknown = t('未知', 'Unknown');

        const glassTooltip = {
            trigger: ['pie', 'donut', 'funnel', 'map_china', 'radar'].includes(chartType) ? 'item' : 'axis',
            axisPointer: { type: 'cross', crossStyle: { color: '#cbd5e1', type: 'dashed' }, shadowStyle: { color: 'rgba(241, 245, 249, 0.4)' } },
            confine: true, backgroundColor: 'rgba(255, 255, 255, 0.90)', borderColor: '#e2e8f0', borderWidth: 1, padding: [12, 16],
            textStyle: { color: '#1e293b', fontWeight: '500', fontSize: 13, fontFamily: 'system-ui, sans-serif' }, 
            backdropFilter: 'blur(10px)', extraCssText: 'box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); border-radius: 12px;'
        };

        let option = {
            color: thermalColors, backgroundColor: 'transparent', tooltip: glassTooltip,
            legend: { top: '2%', type: 'scroll', icon: 'circle', itemWidth: 10, itemHeight: 10, itemGap: 20, textStyle: { color: '#475569', fontWeight: '600', fontSize: 12, padding: [0, 0, 0, 4] } }, 
            grid: { left: '3%', right: '5%', bottom: '5%', top: '15%', containLabel: true },
            animationDuration: 1500, animationEasing: 'cubicOut', series: []
        };

        // ★ 智能标题引擎
        const isDefaultData = originalColumns.includes('1月') && originalColumns.includes('12月');
        const isInitialState = isDefaultData && dataOps.length === 0 && xAxis === '地区' && chartType === 'bar3D';
        const safeX = curXAxis || t('未知维度', 'Unknown');
        const yNamesZh = yAxes.length > 2 ? yAxes.slice(0, 2).join(' & ') + ' 等' : yAxes.join(' & ');
        const yNamesEn = yAxes.length > 2 ? yAxes.slice(0, 2).join(' & ') + ' etc.' : yAxes.join(' & ');
        
        let dynamicTitleZh = `${yNamesZh} 按 ${safeX} 的数据概览`;
        let dynamicTitleEn = `${yNamesEn} Overview by ${safeX}`;
        const xStr = safeX.toLowerCase();
        const isTime = /日期|时间|年|月|日|周|季度|date|time|year|month|day|week|quarter/.test(xStr);
        const isGeo = /省|市|区|国家|地区|城市|province|city|region|country/.test(xStr);

        if (['line', 'area', 'step'].includes(chartType)) { dynamicTitleZh = isTime ? `${yNamesZh} 的历史走势` : `各 ${safeX} 的 ${yNamesZh} 曲线`; }
        else if (['pie', 'donut', 'funnel'].includes(chartType)) { dynamicTitleZh = `各 ${safeX} 的 ${yNamesZh} 占比构成`; } 
        else if (['bar', 'hbar', 'bar3D'].includes(chartType)) { if (isTime) dynamicTitleZh = `不同 ${safeX} 的 ${yNamesZh} 周期对比`; else if (isGeo) dynamicTitleZh = `各 ${safeX} 的 ${yNamesZh} 空间分布`; else dynamicTitleZh = `各 ${safeX} 的 ${yNamesZh} 规模对比`; } 
        else if (chartType === 'scatter') { dynamicTitleZh = `${safeX} 与 ${yNamesZh} 的散点分析`; } 
        else if (chartType === 'map_china') { dynamicTitleZh = `${yNamesZh} 的全国地域分布`; } 
        else if (chartType === 'heatmap_corr') { dynamicTitleZh = '数据变量相关系数矩阵'; } 
        else if (chartType === 'histogram') { dynamicTitleZh = `${safeX} 的数据频数分布特征`; } 
        else if (chartType === 'candlestick') { dynamicTitleZh = `${safeX} 市场 K 线复盘`; }

        const autoTitle = isInitialState ? t('全国主要城市 PM2.5 月度均值', 'Major Cities PM2.5 Data Overview') : t(dynamicTitleZh, dynamicTitleEn);
        const actualTitle = customTitle !== null ? customTitle : autoTitle;

        option.title = { show: !isPlayingAudio && !isEditingTitle && actualTitle !== '', text: actualTitle, left: 'left', top: '2%', textStyle: { color: '#0f172a', fontSize: 16, fontWeight: '800', fontFamily: 'system-ui, sans-serif' } };
        const hasTitle = option.title.show;
        if (hasTitle) { option.legend.top = 40; option.grid.top = 85; }

        // ==========================================
        // 1. 中国地图 (China Map)
        // ==========================================
        if (chartType === 'map_china') {
            option.legend.show = false; 
            const valCol = validYAxes[0]; const regionCol = curXAxis;
            const getShortProvName = (name) => {
                if (!name) return ''; const str = String(name);
                const PROVINCES = ['北京', '天津', '上海', '重庆', '河北', '山西', '辽宁', '吉林', '黑龙江', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东', '海南', '四川', '贵州', '云南', '陕西', '甘肃', '青海', '台湾', '内蒙古', '广西', '西藏', '宁夏', '新疆', '香港', '澳门'];
                for (let i = 0; i < PROVINCES.length; i++) { if (str.includes(PROVINCES[i])) return PROVINCES[i]; }
                const cityToProv = { '广州':'广东', '深圳':'广东', '东莞':'广东', '佛山':'广东', '成都':'四川', '杭州':'浙江', '宁波':'浙江', '温州':'浙江', '武汉':'湖北', '西安':'陕西', '南京':'江苏', '苏州':'江苏', '无锡':'江苏', '长沙':'湖南', '郑州':'河南', '沈阳':'辽宁', '大连':'辽宁', '青岛':'山东', '济南':'山东', '厦门':'福建', '福州':'福建', '合肥':'安徽', '南昌':'江西', '哈尔滨':'黑龙江', '长春':'吉林', '昆明':'云南', '南宁':'广西', '贵阳':'贵州', '太原':'山西', '石家庄':'河北', '唐山':'河北', '呼和浩特':'内蒙古', '包头':'内蒙古', '乌鲁木齐':'新疆' };
                for (let c in cityToProv) { if (str.includes(c)) return cityToProv[c]; }
                return null;
            };
            const aggregatedMap = {}; let hasValidData = false;
            chartRenderData.forEach(r => {
                const shortName = getShortProvName(r[regionCol]);
                if (shortName) { aggregatedMap[shortName] = (aggregatedMap[shortName] || 0) + (parseNumber(r[valCol]) || 0); hasValidData = true; }
            });
            if (!hasValidData) {
                option.title = { show: true, text: '⚠️ 无法出图：X 轴未识别到任何有效的中国地名', left: 'center', top: 'center', textStyle: { color: '#ef4444', fontSize: 16 } };
                option.series = []; return option;
            }
            const FULL_NAMES = { '北京': '北京市', '天津': '天津市', '上海': '上海市', '重庆': '重庆市', '河北': '河北省', '山西': '山西省', '辽宁': '辽宁省', '吉林': '吉林省', '黑龙江': '黑龙江省', '江苏': '江苏省', '浙江': '浙江省', '安徽': '安徽省', '福建': '福建省', '江西': '江西省', '山东': '山东省', '河南': '河南省', '湖北': '湖北省', '湖南': '湖南省', '广东': '广东省', '海南': '海南省', '四川': '四川省', '贵州': '贵州省', '云南': '云南省', '陕西': '陕西省', '甘肃': '甘肃省', '青海': '青海省', '台湾': '台湾省', '内蒙古': '内蒙古自治区', '广西': '广西壮族自治区', '西藏': '西藏自治区', '宁夏': '宁夏回族自治区', '新疆': '新疆维吾尔自治区', '香港': '香港特别行政区', '澳门': '澳门特别行政区' };
            const finalMapData = [];
            Object.keys(aggregatedMap).forEach(k => {
                finalMapData.push({ name: k, value: aggregatedMap[k] });
                if (FULL_NAMES[k]) finalMapData.push({ name: FULL_NAMES[k], value: aggregatedMap[k] });
            });
            const mapVals = Object.values(aggregatedMap);
            const maxVal = mapVals.length > 0 ? Math.max(...mapVals) : 100;
            const minVal = mapVals.length > 0 ? Math.min(...mapVals) : 0;
            option.tooltip.formatter = (p) => `<div style="color:#64748b;font-size:12px;margin-bottom:4px;">${valCol}</div><div style="font-size:16px;"><b style="color:#0f172a">${p.name || labelUnknown}</b> : <span style="color:#d73027;font-weight:900;">${formatCompactNumber(p.value || 0)}</span></div>`;
            option.visualMap = { min: minVal, max: maxVal > minVal ? maxVal : minVal + 1, realtime: false, calculable: true, left: '5%', bottom: '5%', itemWidth: 12, itemHeight: 100, inRange: { color: thermalColors }, textStyle: { fontWeight: 'bold', color: '#64748b' }, formatter: (v) => formatCompactNumber(v) };
            option.series = [{ name: valCol, type: 'map', map: 'china', roam: true, zoom: 1.15, label: { show: true, color: '#475569', fontSize: 10, fontWeight: 'bold' }, emphasis: { label: { show: true, color: '#0f172a' }, itemStyle: { areaColor: '#fcd34d', shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' } }, data: finalMapData, itemStyle: { borderColor: '#ffffff', borderWidth: 1.5, areaColor: '#f1f5f9' } }];
            return option;
        }

        // ==========================================
        // 2. 直方图 (Histogram)
        // ==========================================
        else if (chartType === 'histogram') {
            const vals = chartRenderData.map(r => parseNumber(r[curXAxis])).filter(v => !isNaN(v)).sort((a, b) => a - b);
            if(vals.length === 0) return {};
            const binOp = [...dataOps].reverse().find(op => op.type === 'bin');
            const binCount = binOp && binOp.bins ? parseInt(binOp.bins) : 15;
            const q02 = calcQuantile(vals, 0.02); const q98 = calcQuantile(vals, 0.98);
            const cMin = q02 === q98 ? vals[0] : q02; const cMax = q02 === q98 ? vals[vals.length-1] : q98;
            const step = (cMax - cMin) === 0 ? 1 : (cMax - cMin) / binCount;
            const bins = Array(binCount + 2).fill(0);
            vals.forEach(v => { if (v < cMin) bins[0]++; else if (v >= cMax) bins[binCount+1]++; else { let idx = Math.floor((v - cMin) / step); if (idx >= binCount) idx = binCount - 1; bins[idx + 1]++; } });
            const xCat = []; const cData = []; const fData = []; const total = vals.length || 1;
            for(let i=0; i<binCount+2; i++) {
                if ((i === 0 || i === binCount + 1) && bins[i] === 0) continue;
                let label = '';
                if (i === 0) { label = `< ${formatCompactNumber(cMin)}`; } 
                else if (i === binCount + 1) { label = `≥ ${formatCompactNumber(cMax)}`; } 
                else {
                    let start = cMin + (i - 1) * step; let end = cMin + i * step;
                    let dStart = (cMax - cMin) > 10 ? Math.floor(start) : start;
                    let dEnd = (cMax - cMin) > 10 ? Math.ceil(end) : end;
                    label = `[${formatCompactNumber(dStart)} ~ ${formatCompactNumber(dEnd)})`;
                }
                xCat.push(label); cData.push(bins[i]); fData.push(round2((bins[i]/total)*100));
            }
            const maxCount = cData.length > 0 ? Math.max(...cData) : 100; const minCount = cData.length > 0 ? Math.min(...cData) : 0;
            const maxFreq = fData.length > 0 ? Math.max(...fData) : 100; const minFreq = fData.length > 0 ? Math.min(...fData) : 0;
            
            option.visualMap = [
                { show: false, seriesIndex: 0, min: minCount, max: maxCount > minCount ? maxCount : minCount + 1, inRange: { color: thermalColors } },
                { show: false, seriesIndex: 1, min: minFreq, max: maxFreq > minFreq ? maxFreq : minFreq + 1, inRange: { color: thermalColors } }
            ];
            if (xCat.length > 30) { option.dataZoom = [ { type: 'inside', start: 0, end: Math.max(10, 3000 / xCat.length) }, { show: true, type: 'slider', top: '92%', height: 15, borderColor: 'transparent', fillerColor: 'rgba(59, 130, 246, 0.1)' } ]; option.grid.bottom = '12%'; }
            option.legend.selectedMode = 'single'; option.legend.data = [t('数量 (Count)', 'Count'), t('频率分布 (%)', 'Frequency (%)')]; option.legend.selected = { [t('频率分布 (%)', 'Frequency (%)')]: false };
            option.xAxis = { type: 'category', data: xCat, axisLabel: { rotate: 30, color: '#64748b', fontWeight: '600', margin: 16 }, axisLine: { lineStyle: { color: '#cbd5e1' } }, axisTick: { show: false } };
            option.yAxis = [ { type: 'value', name: t('数量', 'Count'), axisLabel: { color: '#64748b', fontWeight: '600' }, splitLine: { lineStyle: { type: 'dashed', color: 'rgba(203, 213, 225, 0.4)' } } }, { type: 'value', name: t('频率 (%)', 'Freq (%)'), position: 'right', axisLabel: { formatter: '{value} %', color: '#64748b' }, splitLine: { show: false } } ];
            option.series = [
                { name: t('数量 (Count)', 'Count'), type: 'bar', data: cData, barCategoryGap: xCat.length > 50 ? '2%' : '5%', itemStyle: { borderRadius: [6, 6, 0, 0] }, label: { show: true, position: 'top', color: '#475569', fontSize: 10, fontWeight: 'bold', formatter: (p) => formatCompactNumber(p.value) }, labelLayout: { hideOverlap: true } },
                { name: t('频率分布 (%)', 'Frequency (%)'), type: 'bar', yAxisIndex: 1, data: fData, barCategoryGap: xCat.length > 50 ? '2%' : '5%', itemStyle: { borderRadius: [6, 6, 0, 0] }, label: { show: true, position: 'top', color: '#475569', fontSize: 10, fontWeight: 'bold', formatter: (p) => p.value + '%' }, labelLayout: { hideOverlap: true } }
            ];
            return option;
        }

        // ==========================================
        // 3. 相关热力图 (Corr Heatmap)
        // ==========================================
        else if (chartType === 'heatmap_corr') {
            const hasPearson = dataOps.some(op => op.type === 'pearson');
            if (!hasPearson) { option.title = { show: true, text: t('⚠️ 请先执行“相关系数矩阵 (Pearson)”操作', '⚠️ Execute Pearson Matrix first'), left: 'center', top: 'center', textStyle: { color: '#ef4444', fontSize: 14, fontWeight: 'bold' } }; return option; }
            const cols = chartRenderData.map(r => r['变量']); const matrix = [];
            for(let i=0; i<cols.length; i++) for(let j=0; j<cols.length; j++) matrix.push([j, i, chartRenderData[i][cols[j]]]);
            option.tooltip.formatter = (p) => `<div style="margin-bottom:4px;color:#64748b;font-size:12px;">Pearson Correlation</div><b style="color:#0f172a">${cols[p.data[0]]} & ${cols[p.data[1]]}</b><br/><div style="margin-top:4px;font-size:18px;font-weight:900;color:${p.data[2] > 0 ? '#d73027' : '#313695'}">${p.data[2]}</div>`;
            option.legend.show = false; option.grid = { left: '10%', right: '10%', bottom: '15%', top: hasTitle ? 85 : 50, containLabel: true };
            option.xAxis = { type: 'category', data: cols, axisLabel: { rotate: 30, fontWeight: 'bold', color: '#475569' }, axisLine: { show: false }, axisTick: { show: false }, splitArea: { show: false } };
            option.yAxis = { type: 'category', data: cols, axisLabel: { fontWeight: 'bold', color: '#475569' }, axisLine: { show: false }, axisTick: { show: false }, splitArea: { show: false } };
            option.visualMap = { min: -1, max: 1, calculable: true, orient: 'horizontal', left: 'center', bottom: '0%', itemWidth: 15, itemHeight: 120, inRange: { color: thermalColors }, textStyle: { color: '#64748b', fontWeight: 'bold' } };
            option.series = [{ name: 'Pearson', type: 'heatmap', data: matrix, label: { show: true, color: '#0f172a', fontWeight: 'bold', textShadowColor: 'rgba(255,255,255,0.6)', textShadowBlur: 3 }, itemStyle: { borderColor: '#fff', borderWidth: 3, borderRadius: 8 }, emphasis: { itemStyle: { shadowBlur: 15, shadowColor: 'rgba(0, 0, 0, 0.4)' } } }];
            return option;
        }

        // ==========================================
        // 4. 股票 K线图 (Candlestick)
        // ==========================================
        else if (chartType === 'candlestick') {
            const findCol = (keywords) => availableColumns.find(c => keywords.some(k => c.toLowerCase().includes(k)));
            const exactOpen = findCol(['开盘', 'open']); const exactClose = findCol(['收盘', 'close']);
            const exactLow = findCol(['最低', 'low']); const exactHigh = findCol(['最高', 'high']);
            if (!exactOpen || !exactClose || !exactLow || !exactHigh) return option; 
            const xData = chartRenderData.map(r => r[curXAxis] || labelUnknown);
            const kData = chartRenderData.map(r => [ parseNumber(r[exactOpen]), parseNumber(r[exactClose]), parseNumber(r[exactLow]), parseNumber(r[exactHigh]) ]);
            option.legend.data = [t('日K', 'K-Line'), 'MA5', 'MA10'];
            option.xAxis = { type: 'category', data: xData, boundaryGap: false, axisLine: { lineStyle: { color: '#cbd5e1' } }, axisLabel: { color: '#64748b', fontWeight: '600' }, axisTick: { show: false } };
            option.yAxis = { scale: true, splitArea: { show: false }, axisLabel: { color: '#64748b', fontWeight: '600', formatter: (v) => formatCompactNumber(v) }, axisLine: { show: false }, splitLine: { lineStyle: { type: 'dashed', color: 'rgba(203, 213, 225, 0.4)' } } };
            option.dataZoom = [ { type: 'inside', start: 50, end: 100 }, { show: true, type: 'slider', top: '92%', height: 20, start: 50, end: 100, borderColor: 'transparent', fillerColor: 'rgba(59, 130, 246, 0.1)', handleStyle: { color: '#3b82f6', borderColor: '#fff', borderWidth: 2 } } ];
            const calculateMA = (dayCount, data) => { let result = []; for (let i = 0; i < data.length; i++) { if (i < dayCount - 1) { result.push('-'); continue; } let sum = 0; for (let j = 0; j < dayCount; j++) sum += data[i - j][1]; result.push(round2(sum / dayCount)); } return result; };
            option.series = [
                { name: t('日K', 'K-Line'), type: 'candlestick', data: kData, itemStyle: { color: '#ef4444', color0: '#10b981', borderColor: '#ef4444', borderColor0: '#10b981', borderWidth: 1.5 } },
                { name: 'MA5', type: 'line', data: calculateMA(5, kData), smooth: true, lineStyle: { width: 2, color: '#3b82f6' }, symbol: 'none' },
                { name: 'MA10', type: 'line', data: calculateMA(10, kData), smooth: true, lineStyle: { width: 2, color: '#f59e0b' }, symbol: 'none' }
            ];
            return option;
        }

        // ==========================================
        // 5. 3D 律动火山 (Bar3D)
        // ==========================================
        else if (chartType === 'bar3D') {
            option.tooltip.trigger = 'item';
            option.tooltip.formatter = (p) => `<div style="color:#64748b;font-size:12px;margin-bottom:6px;line-height:1.6;">${curXAxis} : <b style="color:#0f172a">${p.data?.xName || ''}</b><br/>指标/列 : <b style="color:#0f172a">${p.data?.yName || ''}</b></div><div style="font-size:16px;font-weight:900;color:#d73027;">${formatCompactNumber(p.value[2])}</div>`;
            let uniqueX = Array.from(new Set(chartRenderData.map(d => String(d[curXAxis] || labelUnknown))));
            if (uniqueX.length === 0) return {};
            let data3D = []; let maxZ = -Infinity; let minZ = Infinity;
            uniqueX.forEach((xVal, xIndex) => {
                const rows = chartRenderData.filter(row => { let val = row[curXAxis]; let str = val === null || val === undefined ? labelUnknown : String(val).trim(); return (str === '' ? labelUnknown : str) === xVal; });
                validYAxes.forEach((yCol, yIndex) => {
                    let z = 0; let hasValidData = false;
                    rows.forEach(row => { let val = parseNumber(row[yCol]); if (!isNaN(val)) { z += val; hasValidData = true; } });
                    if (hasValidData) { z = round2(z); data3D.push({ name: xVal, value: [xIndex, yIndex, z], xName: xVal, yName: yCol }); if (z > maxZ) maxZ = z; if (z < minZ) minZ = z; }
                });
            });
            if (data3D.length === 0) return {};
            if (maxZ === -Infinity) { maxZ = 100; minZ = 0; }
            if (maxZ <= minZ) maxZ = minZ + 10;
            const renderX = uniqueX.length === 1 ? [...uniqueX, ' '] : uniqueX;
            const renderY = validYAxes.length === 1 ? [...validYAxes, ' '] : validYAxes;
            const deepThermalColors = ['#313695', '#4575b4', '#74add1', '#fdae61', '#f46d43', '#d73027', '#a50026'];
            option.visualMap = { show: true, min: Math.floor(minZ), max: Math.ceil(maxZ), calculable: true, dimension: 2, right: 20, bottom: 20, itemWidth: 15, itemHeight: 120, inRange: { color: deepThermalColors }, backgroundColor: 'rgba(255,255,255,0.8)', borderColor: 'rgba(255,255,255,1)', borderWidth: 1, textStyle: { color: '#64748b', fontWeight: 'bold' }, padding: 12, borderRadius: 16, formatter: (v) => formatCompactNumber(v) };
            const show3DAxis = !isPlayingAudio;
            option.xAxis3D = { type: 'category', data: renderX, name: show3DAxis ? curXAxis : '', nameTextStyle: { color: '#0f172a', fontWeight: '900', fontSize: 14 }, axisLabel: { show: show3DAxis, color: '#64748b', fontWeight: 'bold' }, axisLine: { show: show3DAxis, lineStyle: { color: '#cbd5e1' } }, axisTick: { show: show3DAxis } };
            option.yAxis3D = { type: 'category', data: renderY, name: show3DAxis ? t('指标/列', 'Metrics') : '', nameTextStyle: { color: '#0f172a', fontWeight: '900', fontSize: 14 }, axisLabel: { show: show3DAxis, color: '#64748b', fontWeight: 'bold' }, axisLine: { show: show3DAxis, lineStyle: { color: '#cbd5e1' } }, axisTick: { show: show3DAxis } };
            option.zAxis3D = { type: 'value', name: show3DAxis ? t('数值', 'Value') : '', nameTextStyle: { color: '#0f172a', fontWeight: '900', fontSize: 14 }, axisLabel: { show: show3DAxis, color: '#64748b', fontWeight: 'bold' }, axisLine: { show: show3DAxis, lineStyle: { color: '#cbd5e1' } }, axisTick: { show: show3DAxis } };
            let calculatedBoxWidth = Math.max(renderX.length * 18, 40); let calculatedBoxDepth = Math.max(renderY.length * 18, 40);
            const maxBox = Math.max(calculatedBoxWidth, calculatedBoxDepth);
            if (maxBox > 260) { const scale = 260 / maxBox; calculatedBoxWidth *= scale; calculatedBoxDepth *= scale; }
            option.grid3D = { boxWidth: calculatedBoxWidth, boxDepth: calculatedBoxDepth, boxHeight: 120, viewControl: { projection: 'perspective', autoRotate: true, autoRotateSpeed: 10, distance: 300, alpha: 30, beta: 45 }, light: { main: { intensity: 1.5, shadow: true, shadowQuality: 'high', alpha: 40, beta: -30 }, ambient: { intensity: 0.6 } } };
            option.series = [{ type: 'bar3D', coordinateSystem: 'cartesian3D', data: data3D, shading: 'lambert', itemStyle: { opacity: 1.5 }, bevelSize: 0.2, bevelSmoothness: 2, animation: true, animationDuration: 1500, animationEasing: 'cubicOut', animationDurationUpdate: 1000 }];
            return option;
        }

        // ==========================================
        // 6. 其他常规图表 (饼图、漏斗、雷达、柱状、折线、散点等)
        // ==========================================
        else {
            const xData = chartRenderData.map(row => { let val = row[curXAxis]; return (val === null || val === undefined || String(val).trim() === '') ? labelUnknown : String(val).trim(); });
            const dataLen = xData.length; const tooManyData = dataLen > 20;
            const step = dataLen > 15 ? Math.ceil(dataLen / 15) : 1;
            const isHorizontal = chartType === 'hbar';

            let globalMin = Infinity; let globalMax = -Infinity;
            if (['pie', 'donut', 'funnel'].includes(chartType)) {
                const firstY = validYAxes[0];
                chartRenderData.forEach(row => { let v = parseNumber(row[firstY]); if (!isNaN(v)) { if (v < globalMin) globalMin = v; if (v > globalMax) globalMax = v; } });
            } else { 
                validYAxes.forEach(y => {
                    chartRenderData.forEach(row => { let v = parseNumber(row[y]); if (!isNaN(v)) { if (v < globalMin) globalMin = v; if (v > globalMax) globalMax = v; } });
                });
            }
            if (globalMin === Infinity) { globalMin = 0; globalMax = 100; }
            if (globalMax <= globalMin) { globalMax = globalMin + 1; }

            if (chartType !== 'radar' && chartType !== 'candlestick') {
                let visualDimension = undefined;
                if (chartType === 'hbar') visualDimension = 0; 
                else if (chartType === 'scatter') visualDimension = 1;
                option.visualMap = { show: false, min: globalMin, max: globalMax, inRange: { color: thermalColors }, dimension: visualDimension };
            }

            if (!['pie', 'donut', 'funnel', 'radar'].includes(chartType)) {
                option.xAxis = { 
                    type: isHorizontal || chartType === 'scatter' ? 'value' : 'category', 
                    data: isHorizontal || chartType === 'scatter' ? undefined : xData, 
                    axisLine: { lineStyle: { color: '#cbd5e1', width: 2 } }, axisTick: { show: false }, 
                    axisLabel: { color: '#64748b', fontWeight: '600', interval: tooManyData ? 'auto' : 0, rotate: dataLen > 8 && !isHorizontal ? 30 : 0, formatter: isHorizontal || chartType === 'scatter' ? (v) => formatCompactNumber(v) : undefined, margin: 12 }, 
                    splitLine: { show: isHorizontal || chartType === 'scatter', lineStyle: { color: 'rgba(203, 213, 225, 0.4)', type: 'dashed' } } 
                };
                option.yAxis = { 
                    type: isHorizontal ? 'category' : 'value', 
                    data: isHorizontal ? xData : undefined, 
                    axisLine: { show: isHorizontal, lineStyle: { color: '#cbd5e1', width: 2 } }, axisTick: { show: false },
                    splitLine: { show: !isHorizontal, lineStyle: { color: 'rgba(203, 213, 225, 0.4)', type: 'dashed' } }, 
                    axisLabel: { color: '#64748b', fontWeight: '600', formatter: !isHorizontal ? (v) => formatCompactNumber(v) : undefined, margin: 12 } 
                };
            }

            if (['pie', 'donut', 'funnel'].includes(chartType)) {
                const firstY = validYAxes[0];
                const pieData = chartRenderData.map(row => ({ name: String(row[curXAxis]||labelUnknown), value: parseNumber(row[firstY])||0 })).sort((a,b) => b.value - a.value); 
                option.series.push({ 
                    name: firstY, type: chartType === 'donut' ? 'pie' : chartType, data: pieData, 
                    radius: chartType === 'donut' ? ['50%', '75%'] : (chartType === 'pie' ? ['10%', '75%'] : undefined), 
                    roseType: chartType === 'pie' ? 'radius' : false, center: hasTitle ? ['50%', '62%'] : ['50%', '55%'],
                    label: { show: true, formatter: (p) => `{name|${p.name}}\n{val|${formatCompactNumber(p.value)}}  {percent|${p.percent}%}`, rich: { name: { color: '#64748b', fontSize: 12, fontWeight: 'bold', padding: [0, 0, 4, 0] }, val: { color: '#0f172a', fontSize: 14, fontWeight: '900' }, percent: { color: '#d73027', fontSize: 12, fontWeight: 'bold' } } }, 
                    labelLine: { show: true, smooth: 0.2, length: 15, length2: 20, lineStyle: { width: 2, color: '#cbd5e1' } }, 
                    labelLayout: { hideOverlap: true }, itemStyle: { borderRadius: 12, borderColor: '#ffffff', borderWidth: 3, shadowBlur: 15, shadowColor: 'rgba(0, 0, 0, 0.1)', shadowOffsetY: 5 }, 
                });
            } else if (chartType === 'radar') {
                const getRadarColor = (val) => {
                    if (globalMax <= globalMin) return thermalColors[Math.floor(thermalColors.length / 2)];
                    let p = Math.max(0, Math.min(1, (val - globalMin) / (globalMax - globalMin)));
                    return thermalColors[Math.round(p * (thermalColors.length - 1))];
                };
                option.radar = { 
                    indicator: xData.map(x => ({ name: x })), radius: '65%', center: hasTitle ? ['50%', '62%'] : ['50%', '55%'],
                    splitArea: { show: true, areaStyle: { color: ['rgba(248, 250, 252, 0.8)', 'rgba(241, 245, 249, 0.8)'] } }, 
                    axisLine: { lineStyle: { color: 'rgba(203, 213, 225, 0.5)' } }, splitLine: { lineStyle: { color: 'rgba(203, 213, 225, 0.8)', width: 2 } },
                    axisName: { color: '#475569', fontWeight: 'bold', fontSize: 12, backgroundColor: '#f1f5f9', borderRadius: 6, padding: [4, 8] }
                };
                option.series = [{ 
                    type: 'radar', symbolSize: 8, emphasis: { areaStyle: { opacity: 0.4 } },
                    data: validYAxes.map(y => {
                        const vals = chartRenderData.map(row => parseNumber(row[y])||0);
                        const mappedColor = getRadarColor(Math.max(...vals));
                        return { name: y, value: vals, itemStyle: { color: mappedColor }, lineStyle: { color: mappedColor, width: 3 }, areaStyle: { color: mappedColor, opacity: 0.2 } };
                    }) 
                }];
            } else {
                validYAxes.forEach((y, index) => {
                    let seriesType = chartType; let extraConf = {};
                    if (chartType === 'area') { seriesType = 'line'; extraConf.areaStyle = { opacity: 0.4 }; }
                    if (chartType === 'step') { seriesType = 'line'; extraConf.step = 'middle'; }
                    if (chartType === 'scatter') { extraConf.symbolSize = (data) => Math.min(Math.max(data[1] / (globalMax / 40), 8), 40); extraConf.itemStyle = { opacity: 0.8, shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.15)', shadowOffsetY: 3, borderColor: '#fff', borderWidth: 1.5 }; }
                    if (['line', 'area', 'step'].includes(chartType)) { extraConf.smooth = 0.4; extraConf.symbol = 'circle'; extraConf.symbolSize = 8; extraConf.showSymbol = dataLen <= 30; extraConf.lineStyle = { width: 4, shadowBlur: 12, shadowColor: 'rgba(0,0,0,0.15)', shadowOffsetY: 6, cap: 'round' }; }
                    if (['bar', 'hbar'].includes(chartType)) { seriesType = 'bar'; extraConf.barMaxWidth = 50; extraConf.itemStyle = { borderRadius: isHorizontal ? [0, 8, 8, 0] : [8, 8, 0, 0], shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.05)', shadowOffsetY: 2 }; }
                    if (['bar', 'hbar', 'line', 'area', 'step'].includes(chartType)) { extraConf.markPoint = { data: [{ type: 'max', name: 'Max' }, { type: 'min', name: 'Min' }], symbol: 'pin', symbolSize: 45, itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.2)' }, label: { show: true, color: '#ffffff', fontSize: 10, fontWeight: 'bold', formatter: (p) => formatCompactNumber(p.value) } }; }
                    if (chartType !== 'scatter') { extraConf.label = { show: true, position: isHorizontal ? 'right' : 'top', color: '#475569', fontWeight: 'bold', fontSize: 10, formatter: (p) => { if (step > 1 && p.dataIndex % step !== 0) return ''; return formatCompactNumber(p.value); } }; extraConf.labelLayout = { hideOverlap: true }; }
                    extraConf.animationDelay = (idx) => idx * 20 + (index * 100);
                    option.series.push({ name: y, type: seriesType, large: true, largeThreshold: 2000, data: chartRenderData.map(row => { const val = parseNumber(row[y]); const safeVal = isNaN(val) ? 0 : val; return chartType === 'scatter' ? [parseNumber(row[curXAxis]||0), safeVal] : safeVal; }), ...extraConf });
                });
            }
            return option;
        }
    }, [processedData, chartType, xAxis, yAxes, availableColumns, chartDataLimit, t, originalColumns, dataOps, isRenderPaused, isPlayingAudio, customTitle, isEditingTitle]);

    useEffect(() => { if (!isManualMode) setEditorCode(JSON.stringify(generatedOption, null, 4)); }, [generatedOption, isManualMode]);

    const finalOption = (isManualMode && manualOption) ? manualOption : generatedOption;
    
    useEffect(() => { setIsPlayingAudio(false); }, [processedData, chartType, xAxis, yAxes, chartDataLimit]);

    const handleCopyCode = () => {
        try {
            const textArea = document.createElement("textarea");
            textArea.value = editorCode;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand("copy");
            textArea.remove();
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.warn('Copy code error:', err);
        }
    };

    const handleCopyData = () => {
        if (!processedData || processedData.length === 0) return;
        try {
            const header = availableColumns.join('\t');
            const rows = processedData.map(row => availableColumns.map(c => {
                let val = row[c];
                if (val === undefined || val === null) return '';
                return String(val).replace(/\t|\n/g, ' ');
            }).join('\t'));
            const tsvContent = [header, ...rows].join('\n');
            const textArea = document.createElement("textarea");
            textArea.value = tsvContent;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand("copy");
            textArea.remove();
            setDataCopied(true);
            setTimeout(() => setDataCopied(false), 2000);
        } catch (err) {
            console.warn('Copy data error:', err);
        }
    };

    const handleExportCSV = () => { 
        if (!processedData || processedData.length === 0) return; 
        try { 
            const BOM = '\uFEFF'; 
            const header = availableColumns.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','); 
            const rows = processedData.map(row => availableColumns.map(c => { let val = row[c]; if (val === undefined || val === null) return '""'; return `"${String(val).replace(/"/g, '""')}"`; }).join(',')); 
            const csvContent = BOM + [header, ...rows].join('\n'); 
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }); 
            const url = URL.createObjectURL(blob); 
            const a = document.createElement('a'); a.href = url; a.download = `DataViz_Export_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url); 
        } catch (err) { console.error(err); } 
    };

    const inputStyle = "bg-white/70 backdrop-blur border border-slate-200/60 text-slate-700 text-xs rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block w-full p-2 outline-none transition-all shadow-sm";
    const bgTransitionStyle = { transitionProperty: 'background-color, border-color, backdrop-filter', transitionDuration: rainState === 0 ? '5s' : '1s', transitionTimingFunction: 'ease-in-out' };

    let bgDarkness = 'bg-transparent'; if (rainState === 1) bgDarkness = 'bg-slate-600/10'; if (rainState === 2) bgDarkness = 'bg-slate-800/30'; if (rainState === 3) bgDarkness = 'bg-slate-900/50'; 
    let bgBlur = 'bg-white/30 border-white/20'; if (rainState === 1) bgBlur = 'bg-white/20 border-slate-300/30'; if (rainState === 2) bgBlur = 'bg-white/10 border-slate-400/40'; if (rainState === 3) bgBlur = 'bg-slate-900/10 border-slate-500/50';
    let rainTitle = t('增强雨点特效', 'More Rain'); if (rainState === 1) rainTitle = t('伴随雨丝滑落与微弱雨声', 'Heavy Rain & Low Audio'); if (rainState === 2) rainTitle = t('狂风暴雨伴随雷鸣音乐', 'Play Thunder Audio'); if (rainState === 3) rainTitle = t('雨过天晴 (缓慢恢复)', 'Clear Sky (5s Fade)');

    return (
        <div className="relative min-h-screen transition-colors duration-1000">
            <div className="fixed inset-0 z-[-3] rainy-ambient-bg"></div>
            <div className={`fixed inset-0 z-[-2] ${bgDarkness}`} style={bgTransitionStyle}></div>
            <div className={`fixed inset-0 z-[-1] backdrop-blur-2xl border-b ${bgBlur}`} style={bgTransitionStyle}></div>

            <div className="max-w-[1600px] mx-auto p-4 md:p-8 space-y-8 pb-24 relative z-[1]">

                {!audioUnlocked && (
                    <div onClick={unlockAndPlayAudio} className="fixed inset-0 z-[9999] flex flex-col items-center justify-center cursor-pointer transition-all duration-1000 group" style={{ background: 'linear-gradient(135deg, rgba(210, 225, 240, 0.35) 0%, rgba(190, 210, 230, 0.45) 50%, rgba(220, 230, 245, 0.35) 100%)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}>
                        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-300/20 rounded-full blur-[100px] pointer-events-none"></div>
                        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-300/20 rounded-full blur-[100px] pointer-events-none"></div>
                        <div className="relative z-10 flex flex-col items-center group-hover:scale-105 transition-transform duration-700 ease-out">
                            <div className="mb-8 relative">
                                <svg className="w-32 h-32 md:w-40 md:h-40 drop-shadow-lg opacity-85 mix-blend-multiply" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="50" cy="90" rx="40" ry="6" fill="rgba(148, 163, 184, 0.3)" className="animate-pulse" /><rect x="18" y="50" width="16" height="35" rx="8" fill="url(#logoGrad1)" className="opacity-80" /><rect x="42" y="30" width="16" height="55" rx="8" fill="url(#logoGrad2)" className="opacity-85" /><rect x="66" y="15" width="16" height="70" rx="8" fill="url(#logoGrad3)" className="opacity-90" /><defs><linearGradient id="logoGrad1" x1="26" y1="50" x2="26" y2="85" gradientUnits="userSpaceOnUse"><stop stopColor="#93C5FD" /><stop offset="1" stopColor="#60A5FA" /></linearGradient><linearGradient id="logoGrad2" x1="50" y1="30" x2="50" y2="85" gradientUnits="userSpaceOnUse"><stop stopColor="#A5B4FC" /><stop offset="1" stopColor="#818CF8" /></linearGradient><linearGradient id="logoGrad3" x1="74" y1="15" x2="74" y2="85" gradientUnits="userSpaceOnUse"><stop stopColor="#C4B5FD" /><stop offset="1" stopColor="#A78BFA" /></linearGradient></defs></svg>
                            </div>
                            <h2 className="text-5xl md:text-6xl font-bold tracking-tight mb-5 text-slate-700">Vibe <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500/90 to-indigo-500/90 font-black">Viz</span></h2>
                        </div>
                    </div>
                )}

                <header className="flex flex-row justify-between items-center gap-2 sm:gap-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <svg className="w-8 h-8 sm:w-11 sm:h-11 drop-shadow-sm flex-shrink-0" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="18" y="50" width="16" height="35" rx="8" fill="url(#headerLogoGrad1)" className="opacity-90" /><rect x="42" y="30" width="16" height="55" rx="8" fill="url(#headerLogoGrad2)" className="opacity-95" /><rect x="66" y="15" width="16" height="70" rx="8" fill="url(#headerLogoGrad3)" className="opacity-100" /><defs><linearGradient id="headerLogoGrad1" x1="26" y1="50" x2="26" y2="85" gradientUnits="userSpaceOnUse"><stop stopColor="#93C5FD" /><stop offset="1" stopColor="#60A5FA" /></linearGradient><linearGradient id="headerLogoGrad2" x1="50" y1="30" x2="50" y2="85" gradientUnits="userSpaceOnUse"><stop stopColor="#A5B4FC" /><stop offset="1" stopColor="#818CF8" /></linearGradient><linearGradient id="headerLogoGrad3" x1="74" y1="15" x2="74" y2="85" gradientUnits="userSpaceOnUse"><stop stopColor="#C4B5FD" /><stop offset="1" stopColor="#A78BFA" /></linearGradient></defs></svg>
                        <div>
                            <h1 className="text-lg sm:text-2xl font-extrabold text-slate-800 tracking-tight transition-colors duration-1000 whitespace-nowrap">
                                Vibe <span className="text-transparent bg-clip-text bg-gradient-to-r font-black transition-colors duration-1000 from-blue-500/90 to-indigo-500/90">Viz</span>
                            </h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-4">
                        <div className={`flex items-center bg-white/70 backdrop-blur-md p-1.5 rounded-xl border border-white/50 shadow-sm overflow-hidden transition-all duration-300 ${showApiKeyInput ? 'w-[140px] sm:w-[250px]' : 'w-[42px]'}`}>
                            <button onClick={() => setShowApiKeyInput(!showApiKeyInput)} className="w-[28px] h-[28px] flex-shrink-0 flex items-center justify-center bg-white/90 rounded-lg text-indigo-500 hover:bg-slate-50 transition-colors shadow-sm" title={t('配置 API Key', 'Configure API Key')}><Icons.Key /></button>
                            <div className={`overflow-hidden transition-all duration-300 ${showApiKeyInput ? 'opacity-100 w-full ml-2' : 'opacity-0 w-0 ml-0'}`}><input type="password" placeholder={t('Gemini API Key...', 'Gemini API Key...')} value={apiKeyConfig} onChange={handleApiKeyChange} className="text-xs border-none bg-transparent w-full outline-none text-slate-700 placeholder-slate-400 font-medium focus:ring-0 p-0" /></div>
                        </div>
                        <button onClick={toggleRainState} title={rainTitle} className={`flex items-center justify-center flex-shrink-0 w-[42px] h-[42px] rounded-xl transition-all cursor-pointer shadow-sm border backdrop-blur-md ${rainState > 0 ? 'bg-blue-100/80 text-blue-600 border-blue-300/50 shadow-inner' : 'bg-white/70 text-slate-500 border-white/50 hover:text-cyan-500 hover:bg-white/90'}`}><Icons.CloudRain /></button>
                        <button onClick={() => toggleLang(lang === 'en' ? 'zh' : 'en')} className="flex items-center justify-center flex-shrink-0 w-[42px] h-[42px] font-bold text-sm rounded-xl transition-all cursor-pointer shadow-sm border border-white/50 backdrop-blur-md bg-white/70 text-slate-700 hover:bg-white/90" title={t('切换语言', 'Toggle Language')}>{lang === 'en' ? 'EN' : '中'}</button>
						<a
    href="https://github.com/willvibe/VibeViz"
    target="_blank"
    rel="noopener noreferrer"
    title="Star on GitHub"
    className="flex items-center justify-center flex-shrink-0 w-[42px] h-[42px] font-bold text-sm rounded-xl transition-all cursor-pointer shadow-sm border border-white/50 backdrop-blur-md bg-white/70 text-slate-700 hover:bg-white/90"
  >
    <Github size={18} strokeWidth={2} />
  </a>
                    </div>
                </header>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                    
                    <div className="xl:col-span-5 flex flex-col gap-8">
                        <div className="glass-panel p-6 md:p-8 h-[400px] flex flex-col relative">
                            {isWorkerProcessing && (
                                <div className="absolute inset-0 z-50 bg-white/50 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                                    <div className="flex flex-col items-center">
                                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                                        <span className="text-sm font-bold text-slate-700">引擎处理中...</span>
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-wrap md:flex-nowrap items-center justify-between gap-3 mb-5 shrink-0">
                                <div className="flex items-center justify-between w-full md:w-auto">
                                    <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2 whitespace-nowrap shrink-0"><div className="text-blue-600"><Icons.Upload /></div> {t('1. 数据源探查', '1. Data Source')}</h2>
                                    <label title={file ? t('重新上传', 'Re-upload') : t('上传新数据', 'Upload New')} className="md:hidden flex items-center justify-center w-8 h-8 bg-white/70 text-slate-600 rounded-lg cursor-pointer hover:bg-white border border-slate-200/60 transition-all shadow-sm m-0 shrink-0"><Icons.Upload /><input type="file" className="hidden" onChange={handleFileUpload}/></label>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full md:w-auto justify-start md:justify-end">
                                    {rawData.length > 0 && (
                                        <>
                                            <div className="flex bg-slate-100/60 backdrop-blur p-1 rounded-xl border border-white/50 overflow-x-auto">
                                                {['preview', 'info', 'describe'].map(tab => (<button key={tab} onClick={() => setDataTab(tab)} className={`px-4 py-1 text-[11px] font-semibold rounded-lg transition-all duration-200 whitespace-nowrap ${dataTab === tab ? 'bg-white text-slate-900 shadow-[0_2px_8px_rgba(0,0,0,0.08)]' : 'text-slate-500 hover:text-slate-700'}`}>{tab === 'preview' ? t('数据', 'Data') : tab === 'info' ? t('属性', 'Info') : t('统计', 'Stats')}</button>))}
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <button onClick={() => {setDataTab('preview'); setShowFilterUI(!showFilterUI); setShowSplitUI(false);}} title={t('数据筛选', 'Filter Data')} className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all shadow-sm border ${showFilterUI ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white/70 text-slate-600 hover:bg-white border-slate-200/60'}`}><Icons.Filter /></button>
                                                <button onClick={() => {setDataTab('preview'); setShowSplitUI(!showSplitUI); setShowFilterUI(false);}} title={t('按字符分列', 'Split Col')} className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all shadow-sm border ${showSplitUI ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white/70 text-slate-600 hover:bg-white border-slate-200/60'}`}><Icons.Split /></button>
                                                {(rawData !== originalData || columns !== originalColumns || dataOps.length > 0) && (<button onClick={resetMetadata} title={t('重置数据与操作', 'Reset Metadata & Ops')} className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/70 text-red-600 border border-slate-200/60 hover:bg-white hover:text-red-500 transition-all shadow-sm"><Icons.Refresh /></button>)}
                                            </div>
                                        </>
                                    )}
                                    <label title={file ? t('重新上传', 'Re-upload') : t('上传新数据', 'Upload New')} className="hidden md:flex items-center justify-center w-8 h-8 bg-white/70 text-slate-600 rounded-lg cursor-pointer hover:bg-white border border-slate-200/60 transition-all shadow-sm m-0 shrink-0"><Icons.Upload /><input type="file" className="hidden" onChange={handleFileUpload}/></label>
                                </div>
                            </div>
                            
                            {rawData.length === 0 ? (
                                <label className="flex flex-col items-center justify-center w-full flex-1 border-2 border-dashed border-slate-300/60 rounded-2xl cursor-pointer bg-white/40 hover:bg-white/70 hover:border-blue-300 transition-all duration-300 group"><div className="p-3 bg-white/90 rounded-full shadow-sm text-blue-500 mb-3 group-hover:scale-110 transition-transform"><Icons.Upload /></div><p className="text-sm text-slate-700 font-semibold">{t('点击或拖拽文件上传', 'Click or drag file to upload')}</p><p className="text-xs text-slate-400 mt-1">{t('智能解析 CSV, Excel, JSON, TXT', 'Auto-parse CSV, Excel, JSON, TXT')}</p><input type="file" className="hidden" accept=".csv, .xlsx, .json, .txt" onChange={handleFileUpload} /></label>
                            ) : (
                                <div className="animate-fade-in flex flex-col flex-1 min-h-0">
                                    <div className="bg-white/60 backdrop-blur-md border border-white/50 rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0 shadow-sm">
                                        {dataTab === 'preview' && (showFilterUI || showSplitUI) && (
                                            <div className="bg-white/40 border-b border-white/50 z-20 shrink-0">
                                                {showFilterUI && (
                                                    <div className="flex flex-wrap items-center gap-2 text-xs p-3"><span className="font-semibold text-slate-700">{t('条件筛选:', 'Filter:')}</span><select value={filterConfig.col} onChange={e=>setFilterConfig({...filterConfig, col:e.target.value})} className="p-1.5 border border-slate-200/60 bg-white/80 rounded-lg min-w-[100px] outline-none"><option value="">{t('选择列...', 'Select Col...')}</option>{columns.map(c=><option key={c}>{c}</option>)}</select><select value={filterConfig.op} onChange={e=>setFilterConfig({...filterConfig, op:e.target.value})} className="p-1.5 border border-slate-200/60 bg-white/80 rounded-lg outline-none"><option value="eq">{t('等于 (=)', 'Equals (=)')}</option><option value="contains">{t('包含 (contains)', 'Contains')}</option><option value="gt">{t('大于 (>)', 'Greater (>)')}</option><option value="lt">{t('小于 (<)', 'Less (<)')}</option></select><input type="text" value={filterConfig.val} onChange={e=>setFilterConfig({...filterConfig, val:e.target.value})} placeholder={t('输入值...', 'Value...')} className="p-1.5 border border-slate-200/60 bg-white/80 rounded-lg w-24 outline-none"/><button onClick={applyFilter} className="bg-slate-900/90 text-white px-4 py-1.5 rounded-lg hover:bg-slate-800 font-medium transition-all shadow-md">{t('应用', 'Apply')}</button></div>
                                                )}
                                                {showSplitUI && (
                                                    <div className="flex flex-wrap items-center gap-2 text-xs p-3"><span className="font-semibold text-slate-700">{t('数据分列:', 'Split:')}</span><select value={splitConfig.col} onChange={e=>setSplitConfig({...splitConfig, col:e.target.value})} className="p-1.5 border border-slate-200/60 bg-white/80 rounded-lg min-w-[100px] outline-none"><option value="">{t('选择列...', 'Select Col...')}</option>{columns.map(c=><option key={c}>{c}</option>)}</select><input type="text" value={splitConfig.delimiter} onChange={e=>setSplitConfig({...splitConfig, delimiter:e.target.value})} placeholder={t('分隔符 (如 - 或 ,)', 'Delimiter')} className="p-1.5 border border-slate-200/60 bg-white/80 rounded-lg w-32 outline-none"/><button onClick={applySplit} className="bg-slate-900/90 text-white px-4 py-1.5 rounded-lg hover:bg-slate-800 font-medium transition-all shadow-md">{t('执行', 'Execute')}</button></div>
                                                )}
                                            </div>
                                        )}
                                        <div className="overflow-auto flex-1">
                                            {dataTab === 'preview' && (<table className="w-full text-left data-table"><thead><tr>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{rawData.slice(0, 50).map((r, i) => <tr key={i}>{columns.map(c => <td key={c}>{r[c]}</td>)}</tr>)}</tbody></table>)}
                                            {dataTab === 'info' && (<table className="w-full text-left data-table"><thead><tr><th>Column</th><th>Non-Null Count</th><th>Dtype</th></tr></thead><tbody>{dataProfile.info.map(i => <tr key={i.col}><td>{i.col}</td><td>{i.nonNull} non-null</td><td><span className="bg-white/80 text-[10px] px-2 py-0.5 rounded-md font-medium text-slate-600 border border-slate-200/50">{i.dType}</span></td></tr>)}</tbody></table>)}
                                            {dataTab === 'describe' && (<table className="w-full text-left data-table"><thead><tr><th></th>{dataProfile.describe.map(d => <th key={d.col}>{d.col}</th>)}</tr></thead><tbody>{['count','mean','std','min','q25','q50','q75','max'].map(stat => (<tr key={stat}><td className="font-semibold text-slate-400 uppercase text-[10px] tracking-wider">{stat}</td>{dataProfile.describe.map(d => <td key={d.col}>{d[stat]}</td>)}</tr>))}</tbody></table>)}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="glass-panel p-6 md:p-8 flex flex-col">
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                                <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2 whitespace-nowrap shrink-0"><div className="text-indigo-600"><Icons.Database /></div> {t('2. 数据处理引擎', '2. Processing Engine')}</h2>
                                <button onClick={handleGetPipelineAdvice} disabled={isFetchingAdvice || rawData.length === 0} title={t('AI 策略建议', 'AI Strategy Advice')} className="flex items-center justify-center w-9 h-9 bg-gradient-to-r from-purple-600/90 to-indigo-600/90 backdrop-blur text-white rounded-xl hover:shadow-lg hover:shadow-indigo-500/30 transition-all duration-300 disabled:opacity-50 border border-white/20 shrink-0"><span className={isFetchingAdvice ? "animate-pulse" : ""}><Icons.Sparkles /></span></button>
                            </div>
                            {rawData.length === 0 ? (
                                <div className="flex flex-col items-center justify-center text-slate-400 py-10"><div className="p-4 bg-white/50 rounded-full mb-3"><Icons.Database /></div><p className="text-sm font-medium">{t('请先加载数据源', 'Please load data source first')}</p></div>
                            ) : (
                                <div className="animate-fade-in flex flex-col gap-5">
                                    {aiPipelineAdvice && (<div className="p-4 bg-gradient-to-br from-indigo-50/80 via-purple-50/80 to-pink-50/80 backdrop-blur border border-purple-100/60 rounded-2xl text-[13px] text-slate-800 leading-relaxed shadow-inner relative overflow-hidden"><div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-purple-500 to-indigo-500"></div><div className="font-bold mb-2 flex items-center gap-1.5 text-indigo-700"><Icons.Sparkles /> {t('顾问建议：', 'AI Advice:')}</div>{aiPipelineAdvice}</div>)}
                                    {dataOps.length > 0 && (<div className="space-y-2">{dataOps.map((op, i) => (<div key={i} className="flex items-center justify-between p-3 bg-white/80 backdrop-blur border border-white/60 rounded-xl text-xs text-slate-700 shadow-sm transition-all hover:border-blue-300/60"><span className="font-medium"><span className="bg-slate-100/80 text-slate-500 px-1.5 py-0.5 rounded mr-2 font-bold">{i+1}</span> {OP_TYPES.find(t=>t.id===op.type)?.[lang]} : {op.col || op.groupCol || op.rowCol || op.sortCol}</span><button onClick={() => setDataOps(ops => ops.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-500 transition-colors p-1 bg-white/50 rounded-md hover:bg-red-50"><Icons.Trash /></button></div>))}</div>)}
                                    <div className="bg-white/40 backdrop-blur-md border border-white/50 rounded-2xl p-5 shadow-sm">
                                        <label className="text-xs font-semibold text-slate-500 mb-1 block uppercase tracking-wider">{t('添加操作节点', 'Add Operation Node')}</label>
                                        <select value={activeOpMenu} onChange={e => setActiveOpMenu(e.target.value)} className={inputStyle + " mb-5"}>{OP_TYPES.map(op => <option key={op.id} value={op.id}>{op[lang]}</option>)}</select>
                                        <div className="grid grid-cols-2 gap-4">
                                            {activeOpMenu === 'groupby' && <><div><label className="text-xs font-semibold text-slate-500 mb-1 block uppercase tracking-wider">{t('分组列', 'Group By Col')}</label><select className={inputStyle} onChange={e=>setOpConfig({...opConfig, gCol:e.target.value})}><option value="">{t('默认首列', 'Default 1st Col')}</option>{availableColumns.map(c=><option key={c}>{c}</option>)}</select></div><div><label className="text-xs font-semibold text-slate-500 mb-1 block uppercase tracking-wider">{t('聚合数值列', 'Agg Numeric Col')}</label><select className={inputStyle} onChange={e=>setOpConfig({...opConfig, aCol:e.target.value})}><option value="">{t('自动寻找数值', 'Auto Find Numeric')}</option>{availableColumns.map(c=><option key={c}>{c}</option>)}</select></div><div className="col-span-2"><label className="text-xs font-semibold text-slate-500 mb-1 block uppercase tracking-wider">{t('聚合函数', 'Agg Function')}</label><select className={inputStyle} onChange={e=>setOpConfig({...opConfig, func:e.target.value})}><option value="sum">{t('Sum (求和)', 'Sum')}</option><option value="avg">{t('Mean (平均)', 'Mean')}</option><option value="max">{t('Max (最大)', 'Max')}</option><option value="min">{t('Min (最小)', 'Min')}</option><option value="var">{t('Var (方差)', 'Variance')}</option><option value="range">{t('Range (极差)', 'Range')}</option><option value="count">{t('Count (计数)', 'Count')}</option></select></div></>}
                                            {activeOpMenu === 'value_counts' && <div className="col-span-2"><label className="text-xs font-semibold text-slate-500 mb-1 block uppercase tracking-wider">{t('目标列', 'Target Col')}</label><select className={inputStyle} onChange={e=>setOpConfig({...opConfig, vCol:e.target.value})}><option value="">{t('选择...', 'Select...')}</option>{availableColumns.map(c=><option key={c}>{c}</option>)}</select></div>}
                                            {activeOpMenu === 'pivot' && <><div><label className="text-xs font-semibold text-slate-500 mb-1 block uppercase tracking-wider">{t('行 (Index)', 'Row (Index)')}</label><select className={inputStyle} onChange={e=>setOpConfig({...opConfig, pRow:e.target.value})}><option value="">{t('选择...', 'Select...')}</option>{availableColumns.map(c=><option key={c}>{c}</option>)}</select></div><div><label className="text-xs font-semibold text-slate-500 mb-1 block uppercase tracking-wider">{t('列 (Columns)', 'Columns')}</label><select className={inputStyle} onChange={e=>setOpConfig({...opConfig, pCol:e.target.value})}><option value="">{t('选择...', 'Select...')}</option>{availableColumns.map(c=><option key={c}>{c}</option>)}</select></div><div><label className="text-xs font-semibold text-slate-500 mb-1 block uppercase tracking-wider">{t('值 (Values)', 'Values')}</label><select className={inputStyle} onChange={e=>setOpConfig({...opConfig, pVal:e.target.value})}><option value="">{t('自动寻找数值', 'Auto Find Numeric')}</option>{availableColumns.map(c=><option key={c}>{c}</option>)}</select></div><div><label className="text-xs font-semibold text-slate-500 mb-1 block uppercase tracking-wider">{t('聚合函数', 'Agg Function')}</label><select className={inputStyle} onChange={e=>setOpConfig({...opConfig, pFunc:e.target.value})}><option value="sum">{t('Sum (求和)', 'Sum')}</option><option value="avg">{t('Mean (平均)', 'Mean')}</option><option value="max">{t('Max (最大)', 'Max')}</option><option value="min">{t('Min (最小)', 'Min')}</option><option value="var">{t('Var (方差)', 'Variance')}</option><option value="range">{t('Range (极差)', 'Range')}</option><option value="count">{t('Count (计数)', 'Count')}</option></select></div></>}
                                            {activeOpMenu === 'sort' && <><div><label className="text-xs font-semibold text-slate-500 mb-1 block uppercase tracking-wider">{t('排序列', 'Sort Col')}</label><select className={inputStyle} onChange={e=>setOpConfig({...opConfig, sCol:e.target.value})}><option value="">{t('选择...', 'Select...')}</option>{availableColumns.map(c=><option key={c}>{c}</option>)}</select></div><div><label className="text-xs font-semibold text-slate-500 mb-1 block uppercase tracking-wider">{t('顺序', 'Order')}</label><select className={inputStyle} onChange={e=>setOpConfig({...opConfig, order:e.target.value})}><option value="desc">{t('降序 (Desc)', 'Descending')}</option><option value="asc">{t('升序 (Asc)', 'Ascending')}</option></select></div></>}
                                            {activeOpMenu === 'bin' && <><div><label className="text-xs font-semibold text-slate-500 mb-1 block uppercase tracking-wider">{t('目标数值列', 'Numeric Col')}</label><select className={inputStyle} onChange={e=>setOpConfig({...opConfig, bCol:e.target.value})}><option value="">{t('自动寻找数值', 'Auto Find Numeric')}</option>{availableColumns.map(c=><option key={c}>{c}</option>)}</select></div><div><label className="text-xs font-semibold text-slate-500 mb-1 block uppercase tracking-wider">{t('划分桶数', 'Bin Count')}</label><input type="number" min="2" max="20" defaultValue="5" className={inputStyle} onChange={e=>setOpConfig({...opConfig, bins:e.target.value})}/></div></>}
                                            {activeOpMenu === 'onehot' && <div className="col-span-2"><label className="text-xs font-semibold text-slate-500 mb-1 block uppercase tracking-wider">{t('分类列', 'Categorical Col')}</label><select className={inputStyle} onChange={e=>setOpConfig({...opConfig, oCol:e.target.value})}><option value="">{t('默认首列', 'Default 1st Col')}</option>{availableColumns.map(c=><option key={c}>{c}</option>)}</select></div>}
                                            {activeOpMenu === 'timeseries' && <><div className="col-span-2"><label className="text-xs font-semibold text-slate-500 mb-1 block uppercase tracking-wider">{t('时间戳列', 'Timestamp Col')}</label><select className={inputStyle} onChange={e=>setOpConfig({...opConfig, tCol:e.target.value})}><option value="">{t('选择...', 'Select...')}</option>{availableColumns.map(c=><option key={c}>{c}</option>)}</select></div><div><label className="text-xs font-semibold text-slate-500 mb-1 block uppercase tracking-wider">{t('采样周期', 'Frequency')}</label><select className={inputStyle} defaultValue="day" onChange={e=>setOpConfig({...opConfig, freq:e.target.value})}><option value="day">{t('按天 (Day)', 'Daily')}</option><option value="month">{t('按月 (Month)', 'Monthly')}</option><option value="year">{t('按年 (Year)', 'Yearly')}</option><option value="hour">{t('按时 (Hour)', 'Hourly')}</option><option value="minute">{t('按分 (Minute)', 'By Minute')}</option><option value="second">{t('按秒 (Second)', 'By Second')}</option></select></div><div><label className="text-xs font-semibold text-slate-500 mb-1 block uppercase tracking-wider">{t('聚合数值列', 'Agg Numeric Col')}</label><select className={inputStyle} onChange={e=>setOpConfig({...opConfig, tAggCol:e.target.value})}><option value="">{t('自动寻找数值', 'Auto Find Numeric')}</option>{availableColumns.map(c=><option key={c}>{c}</option>)}</select></div><div className="col-span-2"><label className="text-xs font-semibold text-slate-500 mb-1 block uppercase tracking-wider">{t('聚合函数', 'Agg Function')}</label><select className={inputStyle} onChange={e=>setOpConfig({...opConfig, tFunc:e.target.value})}><option value="sum">{t('Sum (求和)', 'Sum')}</option><option value="avg">{t('Mean (平均)', 'Mean')}</option><option value="max">{t('Max (最大)', 'Max')}</option><option value="min">{t('Min (最小)', 'Min')}</option><option value="var">{t('Var (方差)', 'Variance')}</option><option value="range">{t('Range (极差)', 'Range')}</option><option value="count">{t('Count (计数)', 'Count')}</option></select></div></>}
                                            {activeOpMenu === 'pearson' && <div className="col-span-2 text-sm text-slate-500 bg-blue-50/50 p-3 rounded-xl border border-blue-100/50 font-medium">{t('操作说明：系统将自动提取数据集中的所有数值列，并计算它们两两之间的皮尔逊相关系数矩阵（r值）。后续可使用此输出结果渲染热力图。', 'Note: System will auto-extract all numeric columns and calculate the Pearson correlation matrix (r-values). Use the output to render the Heatmap.')}</div>}
                                        </div>
                                        {activeOpMenu !== 'sort' && activeOpMenu !== 'pearson' && (
                                            <div className="mt-4 pt-4 border-t border-white/40 flex items-center justify-between">
                                                <label className="text-xs text-slate-700 font-medium flex items-center gap-2 cursor-pointer select-none"><input type="checkbox" checked={opConfig.applySort !== false} onChange={e => setOpConfig({...opConfig, applySort: e.target.checked})} className="w-4 h-4 text-blue-600 bg-white border-slate-300 rounded focus:ring-blue-500 focus:ring-2" />{t('完成后自动排序', 'Auto-sort after process')}</label>
                                                {opConfig.applySort !== false && (<select value={opConfig.sortOrder || 'desc'} onChange={e => setOpConfig({...opConfig, sortOrder: e.target.value})} className="text-[11px] p-1.5 border border-slate-200/60 bg-white/80 rounded-lg outline-none font-medium"><option value="desc">{t('降序排列', 'Descending')}</option><option value="asc">{t('升序排列', 'Ascending')}</option></select>)}
                                            </div>
                                        )}
                                        <button onClick={addOperation} className="mt-5 w-full bg-slate-900/90 backdrop-blur text-white py-3 rounded-xl text-sm font-bold hover:bg-slate-800 shadow-md transition-all">+ {t('添加并执行计算', 'Add & Execute')}</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="xl:col-span-7 flex flex-col gap-8">
                        <div className="glass-panel p-6 md:p-8 flex flex-col h-[400px]">
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 shrink-0">
                                <h2 className="text-base font-bold flex items-center gap-2 text-slate-900 tracking-tight whitespace-nowrap shrink-0"><div className="text-blue-500"><Icons.Table /></div> {t('3. 输出数据集', '3. Output Dataset')}</h2>
                                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                    {processedData.length > 0 && (
                                        <>
                                            <button onClick={handleCopyData} title={t('复制数据 (支持粘贴至 Excel / PPT 等)', 'Copy Data (Paste to Excel/PPT)')} className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all shadow-sm ${dataCopied ? 'bg-green-500/90 text-white' : 'bg-white/80 backdrop-blur text-slate-700 border border-slate-200/60 hover:bg-white'}`}>{dataCopied ? <Icons.Check /> : <Icons.Copy />}</button>
                                            <button onClick={handleExportCSV} title={t('导出为 CSV 文件', 'Export as CSV')} className="flex items-center justify-center w-8 h-8 rounded-lg transition-all shadow-sm bg-white/80 backdrop-blur text-slate-700 border border-slate-200/60 hover:bg-white hover:text-blue-600"><Icons.Download /></button>
                                            <span className="text-[11px] bg-white/60 text-slate-600 px-3 py-1.5 rounded-full border border-slate-200/50 font-bold tracking-wide shadow-sm whitespace-nowrap">{processedData.length} ROWS</span>
                                        </>
                                    )}
                                </div>
                            </div>
                            {processedData.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 py-6"><p className="text-sm font-medium">{t('暂无输出，请执行管线', 'No output yet, please execute pipeline')}</p></div>
                            ) : (
                                <div className="animate-fade-in flex flex-col flex-1 min-h-0">
                                    <div className="overflow-auto flex-1 bg-white/60 backdrop-blur border border-white/50 rounded-2xl shadow-sm relative">
                                        <table className="w-full text-left data-table result-table">
                                            <thead><tr>{availableColumns.map(c => <th key={c}>{c}</th>)}</tr></thead>
                                            <tbody>{processedData.slice(0, 50).map((r, i) => (<tr key={i}>{availableColumns.map(c => <td key={c}>{r[c]}</td>)}</tr>))}</tbody>
                                        </table>
                                    </div>
                                    {processedData.length > 50 && (<p className="text-[11px] text-slate-500 mt-3 text-center font-medium shrink-0">{t('* 性能保护机制：预览区仅展示 Top 50 行，图表渲染全量数据。', '* Guard: Preview limited to Top 50 rows, charts use full data.')}</p>)}
                                </div>
                            )}
                        </div>

                        <div className="glass-panel p-6 md:p-8 relative flex flex-col min-h-[600px]">
                            <div className="flex flex-wrap justify-between items-center gap-3 mb-6 border-b border-slate-200/50 pb-4">
                                <h2 className="text-base font-bold flex items-center gap-2 text-slate-900 tracking-tight whitespace-nowrap shrink-0"><div className="text-indigo-500"><Icons.Chart /></div> {t('4. 可视化看板', '4. Dashboard')}</h2>
                                {processedData.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                        <button onClick={handleGetChartInsight} disabled={isFetchingInsight} title={t('商业洞察结论', 'Business Insights')} className="flex items-center justify-center w-9 h-9 bg-gradient-to-r from-amber-500/90 to-orange-500/90 backdrop-blur text-white shadow-md shadow-orange-500/20 rounded-xl hover:shadow-lg hover:shadow-orange-500/40 transition-all disabled:opacity-50 shrink-0"><span className={isFetchingInsight ? "animate-pulse" : ""}><Icons.Sparkles /></span></button>
                                        <button onClick={() => { const url = chartComponentRef.current.exportImage(); const a = document.createElement('a'); a.href = url; a.download = 'business_chart_HD.png'; a.click(); }} title={t('导出超清无损图', 'Export HD Image')} className="flex items-center justify-center w-9 h-9 bg-blue-600/90 backdrop-blur text-white border border-blue-500/60 rounded-xl hover:bg-blue-700 shadow-sm shadow-blue-500/30 transition-all shrink-0"><Icons.Download /></button>
                                    </div>
                                )}
                            </div>

                            {processedData.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-400">{t('请先在左侧加载数据文件', 'Please load data file on the left first')}</div>
                            ) : (
                                <div className="flex flex-col h-full animate-fade-in">
                                    <div className="flex flex-row flex-wrap items-end gap-2 sm:gap-3 mb-3 p-3 bg-white/40 border border-white/50 rounded-2xl backdrop-blur-sm relative z-[60] overflow-visible">
                                        {smartSwitchMsg && (<div className="absolute -top-3 left-6 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-[11px] px-3 py-1 rounded-full shadow-md font-bold animate-bounce z-[100]">{smartSwitchMsg}</div>)}
                                        <div className="flex-1 min-w-[100px] max-w-[150px]">
                                            <label className="text-[10px] font-semibold text-slate-500 mb-1 block uppercase tracking-wider truncate">{t('图表模型', 'Chart Model')}</label>
                                            <select value={chartType} onChange={e=>{setChartType(e.target.value); if(processedData.length > 10000) setIsRenderPaused(true);}} className={inputStyle}><option value="" disabled hidden>{t('请选择...', 'Select...')}</option>{CHART_TYPES.map(tOption => <option key={tOption.id} value={tOption.id}>{tOption[lang]}</option>)}</select>
                                        </div>
                                        <div className="flex-1 min-w-[100px] max-w-[150px]">
                                            <label className="text-[10px] font-semibold text-slate-500 mb-1 block uppercase tracking-wider truncate">{t('X 轴 (维度/行)', 'X-Axis (Dimension)')}</label>
                                            <select value={xAxis} onChange={e=>{setXAxis(e.target.value); if(processedData.length > 10000) setIsRenderPaused(true);}} className={inputStyle}><option value="" disabled hidden>{t('请选择...', 'Select...')}</option>{availableColumns.map(c=><option key={c} value={c}>{c}</option>)}</select>
                                        </div>
                                        <div className="flex-[1.5] min-w-[120px] max-w-[200px] relative z-[60] hover:z-[70]">
                                            <label className="text-[10px] font-semibold text-slate-500 mb-1 block uppercase tracking-wider truncate">{t('Y 轴 (多项度量作深度/列)', 'Y-Axis (Metrics)')}</label>
                                            <div onClick={() => setShowYAxisMenu(!showYAxisMenu)} className="w-full text-xs p-2.5 border border-slate-200/60 rounded-xl bg-white/70 text-slate-700 font-medium cursor-pointer shadow-sm hover:border-slate-300 transition-colors flex items-center justify-between">
                                                <span className="truncate pr-2">{yAxes.length ? yAxes.join(', ') : t('请选择 Y 轴...', 'Select Y-Axis...')}</span>
                                                <svg className={`w-[18px] h-[18px] text-black shrink-0 pointer-events-none transition-transform duration-200 ${showYAxisMenu ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M6 8l4 4 4-4" /></svg>
                                            </div>
                                            {showYAxisMenu && (<div className="fixed inset-0 z-[90]" onClick={() => setShowYAxisMenu(false)}></div>)}
                                            {showYAxisMenu && (
                                                <div className="absolute top-full left-0 w-full pt-1.5 z-[100] animate-fade-in">
                                                    <div className="bg-white/95 border border-white/60 shadow-2xl rounded-xl max-h-64 overflow-y-auto p-2 backdrop-blur-xl">
                                                        {availableColumns.map(col => (
                                                            <label key={col} className="flex items-center gap-3 text-xs p-2 hover:bg-slate-100/80 rounded-lg cursor-pointer transition-colors">
                                                                <input type="checkbox" checked={yAxes.includes(col)} onChange={() => { if (yAxes.includes(col)) { if (yAxes.length > 0) setYAxes(p => p.filter(y => y !== col)); } else { setYAxes(p => [...p, col]); } if (processedData.length > 10000) setIsRenderPaused(true); }} className="w-3.5 h-3.5 text-blue-600 bg-white border-slate-300 rounded focus:ring-blue-500 focus:ring-2"/> 
                                                                <span className="font-medium text-slate-700 truncate">{col}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-[100px] max-w-[160px] flex gap-1.5">
                                            <div className="flex-1"><label className="text-[10px] font-semibold text-slate-500 mb-1 block uppercase tracking-wider truncate">{t('数据展示量', 'Data Limit')}</label><select value={isCustomLimit ? 'custom' : chartDataLimit} onChange={e => { const val = e.target.value; if (val === 'custom') { setIsCustomLimit(true); if (chartDataLimit === 0) setChartDataLimit(10); } else { setIsCustomLimit(false); setChartDataLimit(Number(val)); } if (processedData.length > 10000) setIsRenderPaused(true); }} className={inputStyle}><option value={0}>{t('全量渲染', 'Render All')}</option><option value={5}>Top 5</option><option value={10}>Top 10</option><option value={20}>Top 20</option><option value={50}>Top 50</option><option value={100}>Top 100</option><option value="custom">{t('自定义...', 'Custom...')}</option></select></div>
                                            {isCustomLimit && (<div className="w-12 animate-fade-in"><label className="text-[10px] uppercase font-bold text-transparent block mb-1">.</label><input type="number" min="1" value={chartDataLimit || ''} onChange={e => { const val = Number(e.target.value); setChartDataLimit(val > 0 ? val : 1); if (processedData.length > 10000) setIsRenderPaused(true); }} className={inputStyle} placeholder="N"/></div>)}
                                        </div>
                                        <div className="flex-shrink-0 ml-auto flex items-end">
                                            <button onClick={() => setIsRenderPaused(false)} disabled={!chartType || !xAxis || yAxes.length === 0} title={t('渲染出图', 'Render Chart')} className="w-[38px] h-[38px] bg-gradient-to-r from-blue-600/90 to-indigo-600/90 hover:from-blue-600 hover:to-indigo-600 text-white rounded-xl shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/40 hover:-translate-y-0.5 transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"><Icons.Play /></button>
                                        </div>
                                    </div>

                                    {chartType === 'histogram' && (<div className="mb-4 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg flex items-center gap-2 text-xs text-blue-700 animate-fade-in"><Icons.Info /> {t('直方图分布模式：仅读取 X 轴选择的数值列进行分布统计，无需配置 Y 轴。点击图例可切换数量/频率视角。', 'Histogram Mode: Only X-Axis metric is used for distribution stats. Toggle legend to switch Count/Freq.')}</div>)}
                                    {chartType === 'heatmap_corr' && (<div className="mb-4 px-3 py-2 bg-purple-50 border border-purple-100 rounded-lg flex items-center gap-2 text-xs text-purple-700 animate-fade-in"><Icons.Info /> {t('皮尔逊相关系数：必须先在左侧“数据处理引擎”中添加【相关系数矩阵 (Pearson)】操作。热力图的 XY 轴选项将被自动接管。', 'Pearson Corr: Must add [Pearson Matrix] in Processing Engine first. X/Y axes are auto-managed.')}</div>)}
                                    {chartType === 'map_china' && (<div className="mb-4 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center gap-2 text-xs text-emerald-700 animate-fade-in"><Icons.Info /> {t('地理映射模式：X 轴必须选择包含中国省/市名称的列，Y 轴的第一个选中列将作为地图的热力颜色深度。', 'GeoMap Mode: X-Axis must be Chinese province/city names. The first Y-Axis metric controls heatmap color.')}</div>)}
                                    {chartType === 'candlestick' && (<div className="mb-4 px-3 py-2 bg-rose-50 border border-rose-100 rounded-lg flex items-center gap-2 text-xs text-rose-700 animate-fade-in"><Icons.Info /> {t('金融 K 线图模式：系统会自动寻找数据中的【开盘、收盘、最低、最高】字段进行聚合渲染，并附加 MA5/MA10 均线，支持底部滚动缩放。', 'Candlestick Mode: Auto maps Open, Close, Low, High columns and renders MA5/10 lines with data zoom.')}</div>)}

                                    <div className="flex-1 rounded-2xl bg-white/40 backdrop-blur-md border border-white/80 overflow-hidden p-2 relative shadow-inner z-[10]">
                                        {isRenderPaused && (
                                            <div className="absolute inset-0 z-[200] flex flex-col items-center justify-center bg-white/85 backdrop-blur-md p-6 text-center animate-fade-in rounded-2xl">
                                                <span className="text-5xl mb-4 block drop-shadow-md">⏸️</span>
                                                <h3 className="text-xl font-extrabold text-blue-600 mb-3 tracking-tight">{t('等待渲染 (数据量 > 10000条)', 'Waiting for Render (Rows > 10000)')}</h3>
                                                <p className="text-slate-700 font-medium text-sm max-w-lg mb-6 leading-relaxed bg-blue-50 p-4 rounded-xl border border-blue-100 shadow-inner">{t('图表选项已清空并暂停自动更新。请在上方手动选择【图表模型】和【X/Y轴】配置，确认无误后点击右侧的 ▶ 按钮进行加载！', 'Options cleared and auto-render paused. Please manually select [Model] & [Axes] above, then click ▶ to render!')}</p>
                                            </div>
                                        )}
                                        {chartType === 'bar3D' && !isRenderPaused && (
                                            <div className="absolute top-4 right-4 z-[100] flex items-center gap-1 p-1.5 bg-white/80 backdrop-blur-md border border-slate-200/60 rounded-xl shadow-sm">
                                                <button onClick={handleRefreshData} title={t('重新生成数据', 'Regenerate Data')} className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-all cursor-pointer"><Icons.Refresh /></button>
                                                <button onClick={(e) => { e.stopPropagation(); toggleAudio(); }} title={isPlayingAudio ? t('停止律动', 'Pause Rhythm') : t('继续律动', 'Play Rhythm')} className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all cursor-pointer ${isPlayingAudio ? 'bg-orange-100 text-orange-600 shadow-inner' : 'text-slate-500 hover:text-orange-500 hover:bg-orange-50'}`}>{isPlayingAudio ? <Icons.Pause /> : <Icons.Play />}</button>
                                                <label title={t('上传本地音乐', 'Upload Music')} className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-purple-600 hover:bg-purple-50 transition-all cursor-pointer m-0"><Icons.Music /><input type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} /></label>
                                            </div>
                                        )}
                                        {finalOption?.title?.text && !isPlayingAudio && !isEditingTitle && (
                                            <div className="absolute top-2 left-2 w-[40%] h-[40px] z-[150] cursor-text" onDoubleClick={() => { setTempTitle(finalOption.title.text); setIsEditingTitle(true); }} title={t('双击修改标题', 'Double click to edit title')} />
                                        )}
                                        {isEditingTitle && (
                                            <input type="text" autoFocus value={tempTitle} onChange={(e) => setTempTitle(e.target.value)} onBlur={() => { setCustomTitle(tempTitle.trim() === '' ? null : tempTitle.trim()); setIsEditingTitle(false); }} onKeyDown={(e) => { if (e.key === 'Enter') { setCustomTitle(tempTitle.trim() === '' ? null : tempTitle.trim()); setIsEditingTitle(false); } if (e.key === 'Escape') { setIsEditingTitle(false); } }} className="absolute top-2 left-2 z-[200] bg-white border-2 border-blue-500 rounded-md px-2 py-1 text-[16px] font-[800] text-[#0f172a] shadow-lg outline-none w-1/2" style={{ fontFamily: 'system-ui, sans-serif' }} />
                                        )}
                                        <ChartPreview key={`${chartType}-${dataOps.length}-${xAxis}-${yAxes.join(',')}`} ref={chartComponentRef} option={finalOption} />
                                    </div>
                                    {aiChartInsight && (<div className="mt-6 p-5 bg-gradient-to-br from-amber-50/80 to-orange-50/80 backdrop-blur border border-orange-100/60 rounded-2xl text-[13px] text-amber-900 leading-relaxed shadow-sm relative overflow-hidden"><div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-orange-400 to-amber-500"></div><div className="font-bold mb-2 flex items-center gap-1.5 text-orange-700"><Icons.Sparkles /> {t('商业洞察结论：', 'Business Insight:')}</div>{aiChartInsight}</div>)}
                                </div>
                            )}
                        </div>

                        {processedData.length > 0 && (
                            <div className="glass-panel p-6 md:p-8">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3"><h2 className="text-base font-bold flex items-center gap-2 text-slate-900 tracking-tight"><Icons.Code /> Option JSON</h2>{isManualMode && <span className="text-[10px] font-bold tracking-wide bg-red-100/80 text-red-600 px-2.5 py-1 rounded-lg animate-pulse border border-red-200/50">{t('已暂停自动生成 (Override Mode)', 'OVERRIDE MODE')}</span>}</div>
                                    <button onClick={handleCopyCode} title={t('复制代码', 'COPY CODE')} className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all shadow-sm ${copied ? 'bg-green-500/90 text-white' : 'bg-white/80 backdrop-blur text-slate-700 border border-slate-200/60 hover:bg-white'}`}>{copied ? <Icons.Check /> : <Icons.Copy />}</button>
                                </div>
                                <textarea value={editorCode} onChange={(e) => { setEditorCode(e.target.value); setIsManualMode(true); }} className="w-full h-40 bg-[#0d1117]/80 backdrop-blur text-[#58a6ff] p-5 rounded-2xl outline-none code-editor text-[13px] shadow-inner focus:ring-2 focus:ring-blue-500/50 transition-all border border-slate-800/60" spellCheck="false" />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {errorMessage && (
                <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-900/50 backdrop-blur-md p-4 animate-fade-in">
                    <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl max-w-md w-full p-8 relative border border-white/50">
                        <div className="flex items-center gap-3 text-red-500 mb-5"><svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><h3 className="text-xl font-bold text-slate-900 tracking-tight">{t('系统提示', 'System Notice')}</h3></div>
                        <p className="text-slate-600 text-sm whitespace-pre-wrap mb-8 leading-relaxed font-medium">{errorMessage}</p>
                        <div className="flex justify-end"><button onClick={() => setErrorMessage(null)} className="bg-slate-900/90 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-800 transition-all shadow-md">{t('我知道了', 'Got it')}</button></div>
                    </div>
                </div>
            )}
            
            <audio ref={audioRef} src={audioUrl} loop crossOrigin="anonymous" style={{ display: 'none' }} />
            <audio ref={rainAudioRef} src={defaultRainAudio} loop crossOrigin="anonymous" style={{ display: 'none' }} />
            <RainEffect isTopZ={!audioUnlocked} rainState={rainState} />
        </div>
    );
};

export default App;