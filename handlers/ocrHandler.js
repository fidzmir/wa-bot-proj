const axios = require('axios'); // Pastikan sudah install axios untuk fetch API luar lebih mudah

const GAS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbyt8BvIvEq34wUIF3ctJ_4E8xaxjbZ-EEPpyPK0Q155wKjSUrNz_nBVRhAG4gCU1fsY/exec"; 
const HF_TOKEN = "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"; // Masukkan token Hugging Face Anda
const HF_MODEL_URL = "https://api-inference.huggingface.co/models/baidu/Unlimited-OCR";

async function handleOcrFeature(sock, jid, messageType, m, msg, current, senderKey, tpmState, downloadMediaMessage) {
    if (messageType !== 'imageMessage') {
        return await sock.sendMessage(jid, { text: "⚠️ Harap kirimkan foto label produk (bukan teks/dokumen)." });
    }
    await sock.sendMessage(jid, { text: "⏳ Foto diterima. Mengunduh gambar media dari WhatsApp..." });
    
    try {
        console.log(`[OCR] Mengunduh gambar untuk item ${current.itemWip}...`);
        const buffer = await downloadMediaMessage(m, 'buffer', {});
        console.log(`[OCR] Gambar berhasil diunduh. Ukuran buffer: ${buffer.length} bytes.`);

        await sock.sendMessage(jid, { text: "⏳ Gambar berhasil dimuat ke server. Memproses OCR via Hugging Face..." });

        // 1. Panggil Hugging Face API menggunakan data biner Buffer gambar
        console.log(`[OCR] Mengirimkan data biner ke baidu/Unlimited-OCR...`);
        const hfResponse = await axios.post(HF_MODEL_URL, buffer, {
            headers: {
                'Authorization': `Bearer ${HF_TOKEN}`,
                'Content-Type': 'application/octet-stream'
            }
        });

        // Ambil teks mentah hasil OCR (sesuaikan dengan struktur response JSON dari model)
        // Umumnya mengembalikan array objek atau string teks langsung
        let rawOcrText = "";
        if (Array.isArray(hfResponse.data)) {
            rawOcrText = hfResponse.data[0]?.generated_text || JSON.stringify(hfResponse.data);
        } else {
            rawOcrText = hfResponse.data.generated_text || JSON.stringify(hfResponse.data);
        }

        console.log(`[OCR] Teks mentah dari Hugging Face: "${rawOcrText}"`);

        // 2. LOGIKA VALIDASI MANDIRI (Pindahan dari prompt Gemini ke Regex Node.js)
        // Bersihkan spasi berlebih untuk mempermudah pencocokan kode berantai
        const cleanText = rawOcrText.replace(/\s+/g, ''); 
        let extractedLot = null;

        // Implementasi Rule Book Anda menggunakan JavaScript Regular Expression (Regex)
        const itemWip = current.itemWip;

        if (['30G161', '33G198', '36G161', '36G198'].includes(itemWip)) {
            const match = cleanText.match(/\b\d{4,5}\b/); // 4-5 digit angka murni
            if (match) extractedLot = match[0];
        } 
        else if (itemWip === '30H160') {
            const match = cleanText.match(/\b\d{14}\b/); // 14 digit angka murni
            if (match) extractedLot = match[0];
        } 
        else if (['33F161', '33F198', '36F161'].includes(itemWip)) {
            const match = cleanText.match(/\b\d{6}A\d{9}\b/); // 6 angka + A + 9 angka
            if (match) extractedLot = match[0];
        }
        else if (itemWip === '33P160') {
            // Format: 6 angka - kombinasi huruf/angka - 1 angka - 2 angka - 2 angka
            const match = cleanText.match(/\b\d{6}-[A-Za-z0-9]+-\d{1}-\d{2}-\d{2}\b/);
            if (match) extractedLot = match[0];
        }
        else if (itemWip === '30R061') {
            const match = cleanText.match(/\b\d{5}-[A-Z]\d{1}\b/); // 5 angka - 1 huruf besar 1 angka
            if (match) extractedLot = match[0];
        }
        else if (itemWip === '35I161') {
            const match = cleanText.match(/\b(HT\d{10}|\d{9,10})\b/); // HT+10 angka ATAU 9-10 angka murni
            if (match) extractedLot = match[0];
        }
        else if (itemWip === '35O190') {
            const match = cleanText.match(/\b\d{1}[A-Z]\d{6}\b/); // 1 angka + 1 huruf besar + 6 angka
            if (match) extractedLot = match[0];
        }
        else {
            // Default jika pola itemWip tidak terdaftar, ambil apa saja angka/kode yang ditemukan
            extractedLot = cleanText; 
        }

        // Jika setelah di-scan dengan Regex tidak ada pola yang cocok
        if (!extractedLot) {
            await sock.sendMessage(jid, { text: `❌ Hasil pembacaan teks tidak menemukan nomor lot yang sesuai dengan spesifikasi aturan pola untuk item *${itemWip}*.` });
            delete tpmState[senderKey];
            return;
        }

        // 3. Kirim hasil yang sudah tervalidasi ke Google Sheets Webhook Anda
        console.log(`[OCR] Mengirim hasil "${extractedLot}" ke Google Sheets Webhook...`);
        const response = await fetch(GAS_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                itemWip: current.itemWip,
                ocrText: extractedLot, 
                sender: senderKey.split(/[:@]/)[0]
            })
        });

        const responseText = await response.text();
        console.log(`[OCR] Respon mentah dari Google Sheets: ${responseText}`);
        
        let resData;
        try {
            resData = JSON.parse(responseText);
        } catch (jsonErr) {
            throw new Error(`Google Apps Script mengembalikan format non-JSON: ${responseText.substring(0, 100)}`);
        }

        if (resData.success) {
            await sock.sendMessage(jid, { 
                text: `✅ *Logged to Sheet!*\n\n*Item:* ${current.itemWip}\n*Lot:* \`${resData.lot}\`` 
            });
            console.log(`[OCR] Transaksi sukses disimpan ke Sheets.`);
        } else {
            await sock.sendMessage(jid, { 
                text: `❌ Nomor lot \`${extractedLot}\` berhasil diekstraksi, tetapi ditolak oleh sistem validasi akhir Google Sheets.` 
            });
        }
    } catch (error) {
        console.error("🚨 CRITICAL OCR ERROR:", error);
        await sock.sendMessage(jid, { text: `🚨 *Sistem Error:* ${error.message}` });
    }
    delete tpmState[senderKey];
    return; 
}

module.exports = { handleOcrFeature };
