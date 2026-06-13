require('dotenv').config();
const { connectToWhatsApp } = require('./session');
const { getContentType, downloadMediaMessage } = require("@whiskeysockets/baileys");
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require("express");
const { HeartbeatManager } = require('./heartbeat');
const fs = require('fs');

// Import data kustom & modul fitur eksternal
const { ITEM_RULES } = require('./config/rules');
const { handleAmFeature } = require('./handlers/amHandler');
const { handleOcrFeature } = require('./handlers/ocrHandler');
const { handleCloseFeature } = require('./handlers/closeHandler');
const { handleOpenList, handleOpenDetail } = require('./handlers/infoHandler');
const { handleNewChat, handleOngoingChat } = require('./handlers/chatHandler');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

const ORIGINAL_BOT_URL = "https://script.google.com/macros/s/AKfycbyknMRVxLOwYy_jwMaOuaQsL_a4Rjwr5eX_9lNMmO64vpoAcKxDsd_x8yQJw85te4M0/exec";
const DEPT_NOTICE_NUMBER = "6285933263178@s.whatsapp.net";
const WEBHOOK_PORT = 8080;

// ==================== [TAMBAHAN: CONFIG GAME 34-0.XYZ] ====================
const MATCH_ENDPOINT = 'https://gnjcmrqfooalhynogeyt.supabase.co/functions/v1/resolve-match';
const USER_ENDPOINT = 'https://gnjcmrqfooalhynogeyt.supabase.co/auth/v1/user';
const ANON_KEY = 'sb_publishable_0vh5J0rfiHxGOxkwGZuBYA_YBo-xblo'; 

// Ganti token ini jika nanti dapet log error 401 (expired) di WhatsApp kamu
const BEARER_TOKEN = 'Bearer eyJhbGciOiJFUzI1NiIsImtpZCI6IjlmNmRiY2ExLWIzOTItNDY4YS1iZWNiLTE0MjgzZjI0N2JlOCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2duamNtcnFmb29hbGh5bm9nZXl0LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJhMzQ2ZjkyMi1kMTg0LTQyOTYtYTU5Zi1jMTNkYTI1YjUzZTIiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxTzgxMzI2MDQxLCJpYXQiOjE3ODEzMjI0NDEsImVtYWlsIjoiZmlkem1pcjY2QGdtYWlsLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiZW1haWwiOiJmaWR6bWlyNjZAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwic3ViIjoiYTM0NmY5MjItZDE4NC00Mjk2LWE1OWYtYzEzZGEyNWI1M2UyIiwidXNlcm5hbWUiOiJmaWR6bWlyIn0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoicGFzc3dvcmQiLCJ0aW1lc3RhbXAiOjE3ODEzMjI0NDF9XSwic2Vzc2lvbl9pZCI6IjIwMzRlMGEwLTk5YTItNDY6ZS1iNzNhLWNjNzgzNmRiZTczNSIsImlzX2Fub255bW91cyI6ZmFsc2V9.VCU3-Eyaj4-wYNXh7O_Ujq9ZNQQMUltoklQaTYU6SzyYW4JMr3G6kop4UhGKCwqUKbOvxaziSkbQ68Szp0aJjQ';

const GAME_HEADERS = {
  'Content-Type': 'application/json',
  'apikey': ANON_KEY, 
  'Authorization': BEARER_TOKEN
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fungsi Cek Validitas Token Game via API User Supabase
async function checkGameTokenValid() {
  try {
    const response = await fetch(USER_ENDPOINT, { method: 'GET', headers: GAME_HEADERS });
    return response.ok;
  } catch (error) {
    return false;
  }
}

// Fungsi Loop Otomatis Pertandingan Game 34-0.xyz
async function jalankanLoopMatchGame(socketClient) {
  console.log('🤖 [GAME 34-0] Background job simulasi pertandingan dimulai...');
  
  while (true) {
    // 1. Validasi token game sebelum bertanding
    const isTokenValid = await checkGameTokenValid();
    if (!isTokenValid) {
      console.log('🚨 [GAME 34-0] Token Game Kedaluwarsa!');
      try {
        await socketClient.sendMessage(DEPT_NOTICE_NUMBER, { 
          text: `🚨 *BOT GAME CRITICAL ERROR*:\n\nToken Bearer game kamu habis/expired. Bot tanding dihentikan sementara sampai kamu update token baru di server.` 
        });
      } catch (e) { console.error("Gagal mengirim error token ke WA:", e.message); }
      await delay(300000); // Jeda 5 menit sebelum coba lagi
      continue;
    }

    // 2. Kirim request match jika token valid
    const randomSeed = Math.floor(100000000 + Math.random() * 900000000);
    try {
      const response = await fetch(MATCH_ENDPOINT, {
        method: 'POST',
        headers: GAME_HEADERS,
        body: JSON.stringify({ seed: randomSeed })
      });

      if (!response.ok) throw new Error(`Status ${response.status}`);

      const data = await response.json();
      const statusMenang = data.won ? 'MENANG 🏆' : 'KALAH 💔';
      
      const teksWA = `*🤖 MATCH REPORT 34-0.XYZ*\n\n` +
                     `• Hasil: *${statusMenang}*\n` +
                     `• Skor: Kamu ${data.ga} - ${data.gb} ${data.opponent?.handle || 'Bot'}\n` +
                     `• MMR Baru: *${data.newMmr || 'N/A'}* (${data.mmrDelta >= 0 ? '+' : ''}${data.mmrDelta || 0})\n` +
                     `• Koin: +${data.coinsEarned || 0}\n\n` +
                     `_Jam: ${new Date().toLocaleTimeString()}_`;

      // Kirim log report ke nomor kamu
      await socketClient.sendMessage(DEPT_NOTICE_NUMBER, { text: teksWA });
      console.log(`✅ [GAME 34-0] Match selesai. Log terkirim ke ${DEPT_NOTICE_NUMBER}`);

    } catch (error) {
      console.error('❌ [GAME 34-0] Gagal eksekusi match game:', error.message);
    }

    // Jeda antar game (Ambil acak 14-20 detik agar aman dari rate-limit)
    const jedaWaktu = Math.floor(Math.random() * 6000) + 14000;
    await delay(jedaWaktu);
  }
}
// =========================================================================

if (!GEMINI_API_KEY) {
    console.error("❌ ERROR: GEMINI_API_KEY tidak ditemukan di environment! Pastikan file .env sudah dibuat.");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const tpmState = {};
const app = Fact = express();
const heartbeat = new HeartbeatManager({ interval: 30000 });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sock; 

app.get("/", (req, res) => {
    res.send(`✅ Bot Aktif! WA: ${sock ? "Connected" : "Connecting..."}`);
});

app.post("/", async (req, res) => {
    if (!req.body || !sock) return res.status(400).send("ERROR");
    res.status(200).send("RECEIVED");
    try {
        const { message, targetJid } = req.body;
        await sock.sendMessage(targetJid || DEPT_NOTICE_NUMBER, { text: message });
    } catch (e) { console.error("Webhook Error:", e.message); }
});

const formatToWhatsApp = (text) => {
    if (typeof text !== 'string') return text;
    return text
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<b\b[^>]*>(.*?)<\/b>/gi, '*$1*')
        .replace(/<strong\b[^>]*>(.*?)<\/strong>/gi, '*$1*')
        .replace(/<i\b[^>]*>(.*?)<\/i>/gi, '_$1_')
        .replace(/<em\b[^>]*>(.*?)<\/em>/gi, '_$1_')
        .replace(/<code\b[^>]*>(.*?)<\/code>/gi, '`$1`')
        .replace(/<pre\b[^>]*>(.*?)<\/pre>/gi, '```$1
```')
        .replace(/<\/?(b|strong)>/gi, '*')
        .replace(/<\/?(i|em)>/gi, '_')
        .replace(/<\/?code>/gi, '`')
        .replace(/\*\*([^*]+)\*\*/g, '*$1*')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
};

async function startSystem() {
    const { sock: socketInstance, saveCreds } = await connectToWhatsApp(); 
    sock = socketInstance;

    const originalSendMessage = sock.sendMessage.bind(sock);
    sock.sendMessage = async (jid, content, options) => {
        if (content && typeof content.text === 'string') {
            content.text = formatToWhatsApp(content.text);
        }
        if (content && typeof content.caption === 'string') {
            content.caption = formatToWhatsApp(content.caption);
        }
        return originalSendMessage(jid, content, options);
    };

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'open') {
            console.log("✅ WHATSAPP TERHUBUNG!");
            if (sock.user?.id) heartbeat.start(sock, sock.user.id);

            // TRIGGERS OTOMATIS: Jalankan loop game di background saat WA terkoneksi
            jalankanLoopMatchGame(sock);
        } 
        
        else if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`❌ KONEKSI TERPUTUS! Status Code: ${statusCode}`);

            const sessionCorrupted = [401, 403, 500];
            const FOLDER_SESI = './auth_info_baileys';

            if (sessionCorrupted.includes(statusCode)) {
                console.log("⚠️ Sesi rusak atau telah dikeluarkan. Menghapus folder auth...");
                try {
                    if (fs.existsSync(FOLDER_SESI)) {
                        fs.rmSync(FOLDER_SESI, { recursive: true, force: true });
                        console.log("🗑️ Folder 'auth_info_baileys' berhasil dibersihkan.");
                    }
                } catch (err) {
                    console.error("Gagal menghapus folder sesi:", err.message);
                }
                console.log("🛑 Sistem dihentikan secara aman. Silakan jalankan ulang untuk scan QR baru.");
                process.exit(0); 
            } else {
                console.log("🔄 Putus koneksi biasa (Masalah jaringan/Server restart). Merestart bot...");
                process.exit(1); 
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const jid = m.key.remoteJid;
        const senderKey = m.key.participant || m.key.remoteJid;
        const pushName = m.pushName || "User WA";
        const msg = m.message?.ephemeralMessage?.message || m.message;
        const messageType = getContentType(msg);
        const text = (msg?.conversation || msg?.extendedTextMessage?.text || msg?.imageMessage?.caption || "").trim();

        // 1. Handle command /cancel
        if (text.toLowerCase() === "/cancel") {
            delete tpmState[senderKey];
            return await sock.sendMessage(jid, { text: "🚫 Proses dibatalkan." });
        }

        // 2. Handle command /am
        if (text.toLowerCase() === "/am") {
            tpmState[senderKey] = { step: "SELECT_SHEET", sheets: ["Produksi HPL", "Produksi Adhesive", "Produksi Flooring", "Produksi PVC Cikupa"] };
            let menu = `Halo *${pushName}*!\nPilih Sheet:\n` + tpmState[senderKey].sheets.map((s, i) => `${i+1}. ${s}`).join("\n");
            return await sock.sendMessage(jid, { text: menu });
        }

        // 3. Handle command /openlist
        if (text.toLowerCase() === "/openlist") {
            return await handleOpenList(sock, jid);
        }

        // 4. Handle command /open
        if (text.toLowerCase().startsWith("/open ")) {
            return await handleOpenDetail(sock, jid, text);
        }

        // 5. Handle command /close
        if (text.toLowerCase().startsWith("/close ")) {
            const args = text.split(" ");
            const tagCode = args[1]?.toUpperCase();

            if (!tagCode) {
                return await sock.sendMessage(jid, { text: "⚠️ Format salah. Contoh: */close AM-HPL-0001*" });
            }

            tpmState[senderKey] = {
                step: "CLOSE_PHOTO",
                tagCode: tagCode
            };
            
            return await sock.sendMessage(jid, { text: `✅ Process Tutup Tag: *${tagCode}*\n\nSilakan kirimkan *FOTO BUKTI* perbaikan untuk menutup tag ini.\n_(Atau ketik /cancel untuk membatalkan)_` });
        }

        // 6. Handle command /input [ITEM_CODE] for OCR Flow
        if (text.toLowerCase().startsWith("/input ")) {
            const args = text.split(" ");
            const itemWip = args[1]?.trim().toUpperCase();

            if (!itemWip || !ITEM_RULES[itemWip]) {
                return await sock.sendMessage(jid, { text: "⚠️ Kode Item WIP tidak valid atau kosong. Contoh: */input 33G198*" });
            }

            tpmState[senderKey] = {
                step: "OCR_PHOTO",
                itemWip: itemWip
            };
            
            await sock.sendMessage(jid, { text: `✅ Kode Item Terbaca: *${itemWip}*\n\nSilakan kirimkan *FOTO LABEL* produk sekarang untuk dideteksi secara cerdas oleh AI.` });
            return; 
        }

        // 7. Handle command /ngobrol
        if (text.toLowerCase().startsWith("/ngobrol ")) {
            return await handleNewChat(sock, jid, text, senderKey, tpmState, aiModel);
        }

        // 8. Handle State Management
        if (tpmState[senderKey]) {
            const current = tpmState[senderKey];

            // Rute Kondisional Sesuai Dengan Aktivitas State User
            if (current.step === "OCR_PHOTO") {
                return await handleOcrFeature(sock, jid, messageType, m, msg, current, senderKey, tpmState, downloadMediaMessage, aiModel);
            }

            if (current.step === "NGOBROL_CHAT") {
                return await handleOngoingChat(sock, jid, text, current);
            }

            if (current.step.startsWith("CLOSE_")) {
                return await handleCloseFeature(sock, jid, text, current, senderKey, tpmState, messageType, downloadMediaMessage, m);
            }

            // Fallback sisa state dimasukkan ke alur proses pembuatan Red Tag (/am)
            return await handleAmFeature(sock, jid, text, current, senderKey, tpmState, messageType, downloadMediaMessage, m, pushName);
        }

        // Fallback for external macro links
        if (text.startsWith('/')) {
            const res = await axios.post(ORIGINAL_BOT_URL, { command: text, sender: jid });
            if (res.data.type === 'text') await sock.sendMessage(jid, { text: res.data.content });
        }
    });
}

app.listen(WEBHOOK_PORT, "0.0.0.0", () => {
    console.log(`🚀 Server on port ${WEBHOOK_PORT}`);
    startSystem();
});
