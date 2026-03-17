export const callGemini = async (prompt, systemInstruction, key) => {
    if (!key) throw new Error("缺少 API Key！请先在网页右上角配置您的 Gemini API Key。");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${key}`;
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: systemInstruction || "You are an AI assistant." }] }
    };
    const delays = [1000, 2000, 4000, 8000, 16000];
    for (let i = 0; i < delays.length + 1; i++) {
        try {
            const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const data = await res.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text || "No result";
        } catch (e) {
            if (i === delays.length) throw new Error("API 请求失败：" + e.message);
            await new Promise(r => setTimeout(r, delays[i]));
        }
    }
};