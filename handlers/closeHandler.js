const axios = require("axios");

const MANUAL_TPM_URL = "https://script.google.com/macros/s/AKfycbzyBY8Hdhh-2kHEh370mZetwLJGFFUTBD29ZhE8mQAu53-weofI-XU8po2NhwlyfFFI/exec";

async function handleCloseFeature(sock, jid, text, current, senderKey, tpmState, messageType, downloadMediaMessage, m) {
    if (current.step === "CLOSE_PHOTO") {
        if (messageType !== 'imageMessage') {
            return await sock.sendMessage(jid, { text: "⚠️ Harap kirimkan berupa FOTO bukti perbaikan (bukan dokumen/teks)." });
        }
        const buffer = await downloadMediaMessage(m, 'buffer', {});
        current.imageBuffer = buffer.toString('base64');
        current.step = "CLOSE_CONFIRM";
        return await sock.sendMessage(jid, { text: `📝 *KONFIRMASI TUTUP TAG*\n\nTag: ${current.tagCode}\n\n1. Konfirmasi Tutup\n2. Batal` });
    } 
    else if (current.step === "CLOSE_CONFIRM") {
        if (text === "1") {
            await sock.sendMessage(jid, { text: "⏳ Sedang memproses penutupan tag ke database..." });
            try {
                const response = await axios.post(MANUAL_TPM_URL, { 
                    action: "closeTag", 
                    tagCode: current.tagCode, 
                    imageBuffer: current.imageBuffer 
                });
                
                if (response.data === "SUCCESS") {
                    await sock.sendMessage(jid, { text: `✅ *BERHASIL!* Tag *${current.tagCode}* telah ditutup (CLOSE).` });
                } else if (response.data === "NOT_FOUND") {
                    await sock.sendMessage(jid, { text: `❌ *GAGAL!* Tag *${current.tagCode}* tidak ditemukan di database.` });
                } else {
                    await sock.sendMessage(jid, { text: `❌ *GAGAL!* Server merespon: ${response.data}` });
                }
            } catch (e) {
                await sock.sendMessage(jid, { text: "❌ *ERROR!* Koneksi terputus." });
            }
        } else {
            await sock.sendMessage(jid, { text: "🚫 Penutupan tag dibatalkan." });
        }
        delete tpmState[senderKey];
        return;
    }
}

module.exports = { handleCloseFeature };
