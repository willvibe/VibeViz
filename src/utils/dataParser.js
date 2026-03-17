import * as XLSX from 'xlsx';

export const parseUploadedFile = (file) => {
    return new Promise((resolve, reject) => {
        const MAX_FILE_SIZE_MB = 60;
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            reject(new Error(`文件大小约为 ${(file.size / 1024 / 1024).toFixed(2)}MB。\n建议上传小于 ${MAX_FILE_SIZE_MB}MB 的文件。`));
            return;
        }

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                let parsedData = [];
                const buffer = evt.target.result;
                const fileName = file.name.toLowerCase();

                if (fileName.match(/\.(csv|tsv|txt)$/i)) {
                    let text = "";
                    try {
                        const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
                        text = utf8Decoder.decode(buffer);
                    } catch (e) {
                        const gbkDecoder = new TextDecoder('gbk');
                        text = gbkDecoder.decode(buffer);
                    }
                    const workbook = XLSX.read(text, { type: 'string' });
                    parsedData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
                } 
                else if (fileName.endsWith('.json')) {
                    const textDecoder = new TextDecoder('utf-8');
                    const jsonText = textDecoder.decode(buffer);
                    const jsonData = JSON.parse(jsonText);
                    parsedData = Array.isArray(jsonData) ? jsonData : [jsonData];
                } 
                else {
                    const data = new Uint8Array(buffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    parsedData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
                }
                resolve(parsedData);
            } catch (err) {
                reject(new Error("解析失败: " + err.message));
            }
        };
        reader.onerror = () => reject(new Error("读取文件发生错误"));
        reader.readAsArrayBuffer(file);
    });
};