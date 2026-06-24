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

if (!GEMINI_API_KEY) {
    console.error("❌ ERROR: GEMINI_API_KEY tidak ditemukan di environment! Pastikan file .env sudah dibuat.");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const tpmState = {};
const app = express();
const heartbeat = new HeartbeatManager({ interval: 30000 });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sock; 

app.get("/", (req, res) => {
    res.send(`✅ Bot Aktif! WA: ${sock ? "Connected" : "Connecting..."}`);
});

// ⚠️ Pastikan baris ini sudah ditaruh di bagian paling atas file server.js Anda
const nodeHtmlToImage = require('node-html-to-image');

app.post("/", async (req, res) => {
    if (!req.body || !sock) return res.status(400).send("ERROR");
    res.status(200).send("RECEIVED");
    
    try {
        const { message, targetJid, dataMesin, headerData } = req.body;
        // Tetap menggunakan nomor default Anda jika targetJid kosong
        const finalTarget = targetJid || DEPT_NOTICE_NUMBER; 

        // 1. Kirim pesan teks detail laporan terlebih dahulu
        if (message) {
            await sock.sendMessage(finalTarget, { text: message });
        }
        
        // 2. JIKA ada paket data JSON, buat gambar tabel otomatis yang rapi & kebal teks panjang
        if (dataMesin && Array.isArray(dataMesin) && dataMesin.length > 0) {
            console.log("⏳ Menghidupkan mesin render HTML-to-Image di VPS...");

            // Susun baris tabel HTML dari kiriman JSON secara dinamis
            let tableRowsHtml = "";
            dataMesin.forEach(m => {
                tableRowsHtml += `
                    <tr>
                        <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #1e293b;">${m.section}</td>
                        <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 500;">${m.hasil}</td>
                        <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: ${m.reject !== '0' ? '#ef4444' : '#64748b'}; font-weight: 500;">${m.reject}</td>
                        <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: bold; color: ${m.dt !== '0' ? '#b91c1c' : '#0f172a'};">${m.dt}</td>
                        <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11.5px; color: #334155; line-height: 1.4; max-width: 250px; word-wrap: break-word;">${m.kendala}</td>
                    </tr>
                `;
            });

            // Menggambar kode HTML menjadi file foto PNG jernih di dalam memori internal VPS
            const imageBuffer = await nodeHtmlToImage({
                html: `
                <html>
                    <body style="font-family: 'Segoe UI', Helvetica, Arial, sans-serif; padding: 15px; width: 750px; background-color: #f1f5f9;">
                        <div style="background: white; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); overflow: hidden; border: 1px solid #e2e8f0;">
                            
                            <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 18px; text-align: center; color: white;">
                                <div style="font-weight: bold; font-size: 18px; letter-spacing: 0.5px; margin-bottom: 4px;">LAPORAN HASIL TREATING - A1</div>
                                <div style="font-size: 12px; color: #94a3b8;">Tanggal: ${headerData?.tanggal || '-'} | Shift: ${headerData?.shift || '-'} | Tim: ${headerData?.tim || '-'}</div>
                            </div>

                            <table style="width: 100%; border-collapse: collapse; font-size: 13.5px;">
                                <thead>
                                    <tr style="background-color: #334155; color: white; text-align: left;">
                                        <th style="padding: 12px 10px;">SECTION</th>
                                        <th style="padding: 12px 10px; text-align: right;">HASIL (Shts)</th>
                                        <th style="padding: 12px 10px; text-align: right;">REJECT (Shts)</th>
                                        <th style="padding: 12px 10px; text-align: center;">DT (Mnt)</th>
                                        <th style="padding: 12px 10px; width: 250px;">KENDALA / CATATAN</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${tableRowsHtml}
                                </tbody>
                            </table>
                            
                            <div style="background-color: #f8fafc; padding: 10px 15px; font-size: 11px; color: #64748b; text-align: right; border-top: 1px solid #e2e8f0;">
                                Total Downtime Shift: <span style="font-weight: bold; color: #b91c1c;">${headerData?.totalDt || '0'} Menit</span>
                            </div>
                        </div>
                    </body>
                </html>
                `
            });

            // Tembak gambar visual tabel langsung ke WhatsApp grup Anda
            await sock.sendMessage(finalTarget, {
                image: imageBuffer,
                caption: "📋 *Visual Report Card Dashboard - Treating A1*"
            });

            console.log(`✅ Sukses mengirimkan teks dan gambar tabel laporan ke: ${finalTarget}`);
        }
    } catch (e) { 
        console.error("❌ Gagal merakit gambar laporan:", e.message); 
    }
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
        .replace(/<pre\b[^>]*>(.*?)<\/pre>/gi, '```$1\n```')
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

       
// ==================== [ FIX HANDLER /CEK ] ====================
        if (text.toLowerCase().startsWith("/cek")) {
            try {
                await sock.sendPresenceUpdate('composing', jid);
                
                const res = await axios.post(ORIGINAL_BOT_URL, { 
                    command: text, 
                    sender: jid 
                }, { timeout: 15000 });
                
                // Pancing Log untuk melihat kiriman asli dari Google Spreadsheet di terminal
                console.log("Diterima dari Google:", JSON.stringify(res.data));
                
                // JIKA formatnya JSON standar { type: 'text', content: '...' }
                if (res && res.data && res.data.type === 'text') {
                    return await sock.sendMessage(jid, { text: res.data.content });
                } 
                // JIKA Google langsung mengirim teks biasa tanpa dibungkus format JSON
                else if (res && typeof res.data === 'string') {
                    return await sock.sendMessage(jid, { text: res.data });
                }
                // JIKA Google mengirim objek JSON langsung berupa text/message
                else if (res && res.data && (res.data.text || res.data.message)) {
                    return await sock.sendMessage(jid, { text: res.data.text || res.data.message });
                }
                // Jika tipenya tidak dikenal
                else {
                    return await sock.sendMessage(jid, { text: `⚠️ Format data Google tidak dikenali. Cek log terminal VPS.` });
                }
            } catch (error) {
                console.error("❌ Error pada fitur /cek:", error.message);
                return await sock.sendMessage(jid, { 
                    text: "⚠️ Koneksi ke Google Spreadsheet timeout atau sibuk. Silakan coba sesaat lagi!" 
                });
            }
        }
        // ====================================================================
        
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

            if (current.step === "OCR_PHOTO") {
                return await handleOcrFeature(sock, jid, messageType, m, msg, current, senderKey, tpmState, downloadMediaMessage, aiModel);
            }

            if (current.step === "NGOBROL_CHAT") {
                return await handleOngoingChat(sock, jid, text, current);
            }

            if (current.step.startsWith("CLOSE_")) {
                return await handleCloseFeature(sock, jid, text, current, senderKey, tpmState, messageType, downloadMediaMessage, m);
            }

            return await handleAmFeature(sock, jid, text, current, senderKey, tpmState, messageType, downloadMediaMessage, m, pushName);
        }

        // Fallback for external macro links
        if (text.startsWith('/')) {
            const res = await axios.post(ORIGINAL_BOT_URL, { command: text, sender: jid });
            if (res.data.type === 'text') await sock.sendMessage(jid, { text: res.data.content });
        }
    });
}

// ====================================================================
// UBAH BAGIAN PALING BAWAH SERVER.JS MENJADI SEPERTI INI:
// ====================================================================

// Jalankan sistem utama WhatsApp terlebih dahulu
startSystem()
    .then(() => {
        // Setelah sistem WA siap, baru buka Port Webhook 8080
        app.listen(WEBHOOK_PORT, "0.0.0.0", () => {
            console.log(`🚀 Server Webhook aktif di port ${WEBHOOK_PORT}`);
        });
    })
    .catch((err) => {
        console.error("❌ Gagal menyalakan sistem utama:", err.message);
    });
