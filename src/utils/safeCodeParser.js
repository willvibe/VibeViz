const validateCode = (code) => {
    if (!code || typeof code !== 'string') return false;

    const dangerousPatterns = [
        /eval\s*\(/i,
        /Function\s*\(/i,
        /setTimeout\s*\(\s*["'].*["']/i,
        /setInterval\s*\(\s*["'].*["']/i,
        /<script/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /document\./i,
        /window\./i,
        /location\./i,
        /fetch\s*\(/i,
        /XMLHttpRequest/i,
        /WebSocket/i,
        /import\s*\(/i,
        /require\s*\(/i
    ];

    for (const pattern of dangerousPatterns) {
        if (pattern.test(code)) return false;
    }

    const braceStack = [];
    const bracketStack = [];
    const parenStack = [];

    for (let i = 0; i < code.length; i++) {
        const char = code[i];
        switch (char) {
            case '{': braceStack.push(i); break;
            case '}': if (braceStack.length === 0) return false; braceStack.pop(); break;
            case '[': bracketStack.push(i); break;
            case ']': if (bracketStack.length === 0) return false; bracketStack.pop(); break;
            case '(': parenStack.push(i); break;
            case ')': if (parenStack.length === 0) return false; parenStack.pop(); break;
        }
    }

    return braceStack.length === 0 && bracketStack.length === 0 && parenStack.length === 0;
};

export const safeParseOption = (code) => {
    if (!validateCode(code)) {
        throw new Error('Invalid or unsafe code detected');
    }

    try {
        const jsonPattern = /^\s*[{}[]/;
        if (jsonPattern.test(code)) {
            return JSON.parse(code);
        }

        const cleanCode = code
            .replace(/\/\/.*$/gm, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .trim();

        if (!cleanCode) return null;

        const result = (0, eval)(`(${cleanCode})`);
        return result;
    } catch (e) {
        throw new Error(`Parse error: ${e.message}`);
    }
};

export default { safeParseOption };
