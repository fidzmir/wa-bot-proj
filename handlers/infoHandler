const axios = require("axios");

const MANUAL_TPM_URL = "https://script.google.com/macros/s/AKfycbzyBY8Hdhh-2kHEh370mZetwLJGFFUTBD29ZhE8mQAu53-weofI-XU8po2NhwlyfFFI/exec";

async function handleOpenList(sock, jid) {
    const res = await axios.get(`${MANUAL_TPM_URL}?action=getList`);
    let responseMsg = "📋 *DAFTAR TAG OPEN:*\n\n";
    res.data.forEach((item, i) => responseMsg += `${i + 1}. *${item.tag}* - ${item.desc}\n`);
    return await sock.sendMessage(jid, { text: responseMsg });
}

async function handleOpenDetail(sock, jid, text) {
    const args = text.split(" ");
    const tagCode = args[1]?.toUpperCase();

    if (!tagCode) {
        return await sock.sendMessage(jid, { text: "⚠️ Format salah. Contoh: */open AM-HPL-0001*" });
    }

    await sock.sendMessage(jid, { text: `⏳ Sedang mencari data untuk tag: *${tagCode}*...` });

    try {
        const res = await axios.get(`${MANUAL_TPM_URL}?action=getDetail&tag=${encodeURIComponent(tagCode)}`);
        const data = res.data; 

        if (data && data.tag) { 
            let detailMsg = `📄 *DETAIL TAG: ${data.tag}*\n\n`;
            detailMsg += `*Status:* ${data.status}\n`;
            detailMsg += `*Tanggal:* ${data.tanggal}\n`;
            detailMsg += `*Mesin:* ${data.machine}\n`;
            detailMsg += `*Pelapor:* ${data.pelapor}\n`;
            detailMsg += `*Abnormality:* ${data.abnormality}\n`;
            detailMsg += `*Contamination:* ${data.contamination}\n`;
            detailMsg += `*Hard to Access:* ${data.access}\n`;
            detailMsg += `*Deskripsi:* ${data.desc}\n`;
            
            await sock.sendMessage(jid, { text: detailMsg });

            if (data.photoUrl && data.photoUrl.startsWith('http')) {
                await sock.sendMessage(jid, { 
                    image: { url: data.photoUrl }, 
                    caption: `📸 Lampiran Foto untuk ${data.tag}` 
                });
            }
            return;
        } else {
            return await sock.sendMessage(jid, { text: `❌ Data untuk tag *${tagCode}* tidak ditemukan.` });
        }
    } catch (e) {
        console.error("Error fetching tag details:", e.message);
        return await sock.sendMessage(jid, { text: "❌ *ERROR!* Gagal mengambil data dari server Google." });
    }
}

module.exports = { handleOpenList, handleOpenDetail };
