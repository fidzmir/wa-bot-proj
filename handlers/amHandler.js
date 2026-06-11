const axios = require("axios");

const MANUAL_TPM_URL = "https://script.google.com/macros/s/AKfycbzyBY8Hdhh-2kHEh370mZetwLJGFFUTBD29ZhE8mQAu53-weofI-XU8po2NhwlyfFFI/exec";

const parseMultiSelect = (input, options) => {
    const choices = input.split(/[ ,./]+/).map(v => {
        let num = parseInt(v);
        return num === 0 ? options.length - 1 : num - 1;
    });
    const selected = choices
        .filter(idx => idx >= 0 && idx < options.length)
        .map(idx => options[idx]);
    const nonEmpty = selected.filter(val => val !== "");
    if (nonEmpty.length > 0) {
        return nonEmpty.join(", ");
    }
    return selected.length > 0 ? "" : null;
};

async function handleAmFeature(sock, jid, text, current, senderKey, tpmState, messageType, downloadMediaMessage, m, pushName) {
    if (current.step === "SELECT_SHEET") {
        const idx = parseInt(text) - 1;
        if (current.sheets[idx]) {
            current.targetSheet = current.sheets[idx];
            current.step = "SELECT_TAG_DEPT";
            return await sock.sendMessage(jid, { text: `✅ Sheet: *${current.targetSheet}*\n\n2. Kode Dept (HPL/ADH/FLR/PVC):` });
        }
    } else if (current.step === "SELECT_TAG_DEPT") {
        current.deptTag = text.toUpperCase(); current.step = "MACHINE";
        return await sock.sendMessage(jid, { text: `✅ Dept: *${current.deptTag}*\n\n3. Nama Mesin:` });
    } else if (current.step === "MACHINE") {
        current.machine = text; current.step = "ABNORMAL";
        current.opts = ["Bocor", "Usang", "Rusak", "Kendur", "Hilang", "Cacat", "Lain-Lain", ""];
        let menu = `✅ Mesin: *${current.machine}*\n\n4. Pilih *Abnormality* (Contoh: 1,3):\n`;
        current.opts.forEach((o, i) => {
            if (i === current.opts.length - 1) {
                menu += `0. Kosong\n`;
            } else {
                menu += `${i + 1}. ${o}\n`;
            }
        });
        return await sock.sendMessage(jid, { text: menu });
    } else if (current.step === "ABNORMAL") {
        current.abnormality = parseMultiSelect(text, current.opts);
        current.step = "CONTAM";
        current.opts = ["Pelumas", "Air/Cairan", "Produk", "Limbah", "Kotoran", "Korosi", ""];
        let menu = `✅ Abnormal: *${current.abnormality}*\n\n5. Pilih *Contamination*:\n`;
        current.opts.forEach((o, i) => {
            if (i === current.opts.length - 1) {
                menu += `0. Kosong\n`;
            } else {
                menu += `${i + 1}. ${o}\n`;
            }
        });
        return await sock.sendMessage(jid, { text: menu });
    } else if (current.step === "CONTAM") {
        current.contamination = parseMultiSelect(text, current.opts);
        current.step = "ACCESS";
        current.opts = ["Membersihkan", "Memeriksa", "Melumasi", "Mengganti", "Mengencangkan", ""];
        let menu = `✅ Contam: *${current.contamination}*\n\n6. Pilih *Hard To Access*:\n`;
        current.opts.forEach((o, i) => {
            if (i === current.opts.length - 1) {
                menu += `0. Kosong\n`;
            } else {
                menu += `${i + 1}. ${o}\n`;
            }
        });
        return await sock.sendMessage(jid, { text: menu });
    } else if (current.step === "ACCESS") {
        current.access = parseMultiSelect(text, current.opts);
        current.step = "DESC";
        return await sock.sendMessage(jid, { text: `✅ Access: *${current.access}*\n\n7. Deskripsi Singkat:` });
    } else if (current.step === "DESC") {
        current.description = text; current.step = "PHOTO";
        return await sock.sendMessage(jid, { text: `✅ Desk: *${current.description}*\n\n8. Kirim Foto Temuan:` });
    } else if (current.step === "PHOTO" && messageType === 'imageMessage') {
        const buffer = await downloadMediaMessage(m, 'buffer', {});
        current.imageBuffer = buffer.toString('base64');
        current.step = "CONFIRM";
        
        let confirmMsg = `📝 *KONFIRMASI RED TAG*\n\n`;
        confirmMsg += `*Sheet:* ${current.targetSheet}\n`;
        confirmMsg += `*Dept:* ${current.deptTag}\n`;
        confirmMsg += `*Mesin:* ${current.machine}\n`;
        confirmMsg += `*Abnormality:* ${current.abnormality || "-"}\n`;
        confirmMsg += `*Contamination:* ${current.contamination || "-"}\n`;
        confirmMsg += `*Hard To Access:* ${current.access || "-"}\n`;
        confirmMsg += `*Deskripsi:* ${current.description}\n\n`;
        confirmMsg += `1. Kirim\n2. Batal`;
        
        return await sock.sendMessage(jid, { text: confirmMsg });
    } else if (current.step === "CONFIRM") {
        if (text === "1") {
            await sock.sendMessage(jid, { text: "⏳ Sedang memproses ke Google Sheets..." });
            try {
                const response = await axios.post(MANUAL_TPM_URL, { ...current, action: "saveTag", senderName: pushName });
                if (response.data === "OK") {
                    await sock.sendMessage(jid, { text: "✅ *BERHASIL!* Data Red Tag telah tercatat." });
                } else {
                    await sock.sendMessage(jid, { text: `❌ *GAGAL!* Server merespon: ${response.data}` });
                }
            } catch (e) {
                await sock.sendMessage(jid, { text: "❌ *ERROR!* Koneksi terputus." });
            }
        } else {
            await sock.sendMessage(jid, { text: "🚫 Pembuatan tag dibatalkan." });
        }
        delete tpmState[senderKey];
        return;
    }
}

module.exports = { handleAmFeature };
