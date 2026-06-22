const { google } = require('googleapis');
const path = require('path');
const axios = require('axios');

// =========================================================================
// 1. KONFIGURASI ID SPREADSHEET & GRUP WA (T1/T2 OFF - SPREADSHEET A DIHAPUS)
// =========================================================================
const SPREADSHEET_ID_B = "1RPtjLazoV7lpxACc97x4BzITqTzCH81e1qqPdE5Mq-8"; 
const SPREADSHEET_ID_C = "1om0vnc5JgPMefn6Drz74ugL7C8Q-ntX2qXRVxNLf-4c"; 

const GROUP_RCVC = "628817433101-1550727854@g.us"; 
const LOCAL_API_URL = "http://localhost:8080/"; // ✅ Benar (Sesuai dengan app.post("/", ...) di server.js) // Endpoint Express di server.js Anda

// Mapping konfigurasi mesin aktif (T1 & T2 diset off: true)
const CONFIG_MACHINES = [
    { name: "T1", off: true },
    { name: "T2", off: true },
    { 
        name: "T3", off: false, sheetName: "T3", spreadsheetId: SPREADSHEET_ID_B, 
        idxHasil: 47,  // Kolom AV
        idxReject: 50  // Kolom AY
    },
    { 
        name: "T4", off: false, sheetName: "T4", spreadsheetId: SPREADSHEET_ID_B, 
        idxHasil: 47,  // Kolom AV
        idxReject: 50  // Kolom AY
    },
    { 
        name: "T5", off: false, sheetName: "T5", spreadsheetId: SPREADSHEET_ID_C, 
        idxHasil: 53,  // Kolom BB
        idxReject: 71  // Kolom BT
    },
    { 
        name: "T6", off: false, sheetName: "T6", spreadsheetId: SPREADSHEET_ID_C, 
        idxHasil: 53,  // Kolom BB
        idxReject: 71  // Kolom BT
    }
];

// Load Service Account JSON Key
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

function parseTimeStr(val) {
    if (!val) return null;
    if (val.includes('T')) return val.split('T')[1].substring(0, 5);
    return val.toString().trim().replace('.', ':');
}

async function generateAndSendReport() {
    const sheets = google.sheets({ version: 'v4', auth });
    const now = new Date();
    const currentHour = now.getHours();
    
    // Format tanggal hari ini sesuai ketikan operator (dd/MM/yyyy)
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const todayStr = `${day}/${month}/${year}`;

    // Logika penentuan shift otomatis
    let targetShift = "2"; 
    if (currentHour >= 5 && currentHour <= 7) targetShift = "1";
    else if (currentHour >= 13 && currentHour <= 15) targetShift = "2";
    else if (currentHour >= 21 && currentHour <= 23) targetShift = "3";

    let totalDTHariIni = 0;
    let timFound = "-";
    let sectionPesanMachines = "";

    console.log(`🚀 Memulai Konsolidasi | Tanggal: ${todayStr} | Shift: ${targetShift} (T1/T2 Di-Bypass)`);

    // Loop menyisir 6 mesin
    for (let m = 0; m < CONFIG_MACHINES.length; m++) {
        const mac = CONFIG_MACHINES[m];
        
        // JIKA MESIN BERSTATUS OFF JANGKA PANJANG (LANGSUNG CETAK PLAN STOP TANPA BACA SHEET)
        if (mac.off) {
            sectionPesanMachines += `--------------------\n` +
                                    `Treating ${m+1}\n` +
                                    `Hasil       =  0  sheets\n` +
                                    `Reject     =   0  sheets\n` +
                                    `DT    =   0  jam\n` +
                                    `Kendala =  PLAN STOP\n`;
            continue; 
        }

        let totalHasil = 0;
        let totalReject = 0;
        let totalMenitDTMachine = 0;
        let kendalaList = [];
        let isSheetActiveInShift = false;

        try {
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: mac.spreadsheetId,
                range: `${mac.sheetName}!A2:BZ`,
            });

            const rows = response.data.values;
            if (!rows || rows.length === 0) throw new Error("Empty");

            let shiftFound = "";
            let lastValidTim = "-";
            let lastValidDate = "-";

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length === 0) continue;

                if (row[0] && row[0] !== "") {
                    lastValidDate = row[0].trim();
                    lastValidTim = row[2] ? row[2].trim() : "-";
                    shiftFound = row[3] ? row[3].trim() : "";
                }

                if (lastValidDate === todayStr && shiftFound === targetShift) {
                    isSheetActiveInShift = true;
                    if (timFound === "-") timFound = lastValidTim;

                    const hasilValue = row[mac.idxHasil] ? Number(row[mac.idxHasil].toString().replace(/[^0-9]/g, '')) : 0;
                    totalHasil += hasilValue;

                    let rejectValue = 0;
                    if (row[mac.idxReject]) {
                        const rawRejectStr = row[mac.idxReject].toString().trim();
                        if (!rawRejectStr.includes('-')) {
                            rejectValue = Number(rawRejectStr.replace(/[^0-9]/g, '')) || 0;
                        }
                    }
                    if (rejectValue < 0) rejectValue = 0; 
                    totalReject += rejectValue;

                    const alasanDT = row[7] && isNaN(row[7]) && !row[7].includes('.') && !row[7].includes(':') ? row[7] : row[8];
                    const jamMulai = parseTimeStr(row[8]) && parseTimeStr(row[8]).includes(':') ? parseTimeStr(row[8]) : parseTimeStr(row[9]);
                    const jamAkhir = parseTimeStr(row[9]) && parseTimeStr(row[9]).includes(':') ? parseTimeStr(row[9]) : parseTimeStr(row[10]);

                    if (jamMulai && jamAkhir && jamMulai.includes(':') && jamAkhir.includes(':')) {
                        const [hStart, mStart] = jamMulai.split(':').map(Number);
                        const [hEnd, mEnd] = jamAkhir.split(':').map(Number);

                        let totalMenitMulai = (hStart * 60) + mStart;
                        let totalMenitAkhir = (hEnd * 60) + mEnd;
                        if (totalMenitAkhir < totalMenitMulai) totalMenitAkhir += 24 * 60;

                        const selisih = totalMenitAkhir - totalMenitMulai;
                        totalMenitDTMachine += selisih;
                        totalDTHariIni += selisih;

                        if (alasanDT && alasanDT.trim() !== "") {
                            kendalaList.push(alasanDT.toUpperCase().trim());
                        }
                    } else if (alasanDT && alasanDT.trim() !== "" && isNaN(alasanDT)) {
                        kendalaList.push(alasanDT.toUpperCase().trim());
                    }
                }
            }
        } catch (err) {
            isSheetActiveInShift = false;
        }

        let jamDTDesimal = (totalMenitDTMachine / 60).toFixed(2).replace('.', ',');
        let teksKendala = "0";

        if (!isSheetActiveInShift) {
            teksKendala = "PLAN STOP";
        } else if (kendalaList.length > 0) {
            let counts = {};
            const cleanKendala = kendalaList.filter(x => x !== "SHIFT" && x !== "TEAM" && x !== "T6" && x !== "T5" && x !== "T4" && x !== "T3");
            
            if (cleanKendala.length > 0) {
                cleanKendala.forEach(x => { counts[x] = (counts[x] || 0) + 1; });
                teksKendala = Object.keys(counts).map(key => counts[key] > 1 ? `${key} ${counts[key]}X` : key).join(', ');
            } else {
                teksKendala = "0";
            }
        }

        sectionPesanMachines += `--------------------\n` +
                                `Treating ${m+1}\n` +
                                `Hasil       =  ${totalHasil}  sheets\n` +
                                `Reject     =   ${totalReject}  sheets\n` +
                                `DT    =   ${jamDTDesimal}  jam\n` +
                                `Kendala =  ${teksKendala}\n`;
    }

    let totalDTAllDesimal = (totalDTHariIni / 60).toFixed(2).replace('.', ',');
    const hariTanggalTeks = now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const messageText = `Laporan Hasil Treating - A1
Hari & Tanggal  =  ${hariTanggalTeks}
Shift                  =  ${targetShift}
Tim                     =  ${timFound}
Jam Kerja          =  7
Total DT            =  ${totalDTAllDesimal}

${sectionPesanMachines}`;

    try {
        const res = await axios.post(LOCAL_API_URL, { 
            targetJid: GROUP_RCVC, 
            message: messageText 
        });
        console.log("✅ Sukses terkirim via server.js! Response:", res.data.message);
    } catch (err) {
        console.error("❌ Gagal mengirim via API server.js:", err.message);
    }
}

generateAndSendReport();
