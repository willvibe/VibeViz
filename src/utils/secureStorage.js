const STORAGE_KEY = 'vibeviz_secure_data';
const ENCRYPTION_KEY = 'vibeviz_default_key_2024';

const xorEncrypt = (text, key) => {
    if (!text) return '';
    let result = '';
    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
        result += String.fromCharCode(charCode);
    }
    return btoa(result);
};

const xorDecrypt = (encryptedText, key) => {
    if (!encryptedText) return '';
    try {
        const text = atob(encryptedText);
        let result = '';
        for (let i = 0; i < text.length; i++) {
            const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
            result += String.fromCharCode(charCode);
        }
        return result;
    } catch (e) {
        return '';
    }
};

export const secureStorage = {
    setItem: (key, value) => {
        try {
            const encrypted = xorEncrypt(value, ENCRYPTION_KEY);
            const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            data[key] = encrypted;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('Secure storage set error:', e);
        }
    },

    getItem: (key) => {
        try {
            const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            const encrypted = data[key];
            return encrypted ? xorDecrypt(encrypted, ENCRYPTION_KEY) : '';
        } catch (e) {
            return '';
        }
    },

    removeItem: (key) => {
        try {
            const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            delete data[key];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('Secure storage remove error:', e);
        }
    }
};

export default secureStorage;
