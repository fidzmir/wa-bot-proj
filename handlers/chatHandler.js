const axios = require("axios");

const MANUAL_TPM_URL = "https://script.google.com/macros/s/AKfycbzyBY8Hdhh-2kHEh370mZetwLJGFFUTBD29ZhE8mQAu53-weofI-XU8po2NhwlyfFFI/exec";

async function handleNewChat(sock, jid, text, senderKey, tpmState, aiModel) {
    const args = text.split(" ");
    const sheetMap = { "HPL": "Produksi HPL", "ADH": "Produksi Adhesive", "FLR": "Produksi Flooring", "PVC": "Produksi PVC Cikupa" };
    const sheetName = sheetMap[args[1]?.toUpperCase()];
    if (!sheetName) return await sock.sendMessage(jid, { text: "Format salah. Contoh: /ngobrol HPL ada berapa tag?" });
    
    const res = await axios.get(`${MANUAL_TPM_URL}?action=getRawData&sheetName=${encodeURIComponent(sheetName)}`);
    const chat = aiModel.startChat({ history: [{ role: "user", parts: [{ text: `Data: ${JSON.stringify(res.data)}` }] }] });
    const result = await chat.sendMessage(args.slice(2).join(" "));
    const botMsg = await sock.sendMessage(jid, { text: result.response.text() });
    tpmState[senderKey] = { step: "NGOBROL_CHAT", chatSession: chat, lastBotMsgId: botMsg.key.id };
    return;
}

async function handleOngoingChat(sock, jid, text, current) {
    const result = await current.chatSession.sendMessage(text);
    return await sock.sendMessage(jid, { text: result.response.text() + "\n\n_(Balas untuk lanjut)_" });
}

module.exports = { handleNewChat, handleOngoingChat };
