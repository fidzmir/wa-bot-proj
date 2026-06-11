const GAS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbyt8BvIvEq34wUIF3ctJ_4E8xaxjbZ-EEPpyPK0Q155wKjSUrNz_nBVRhAG4gCU1fsY/exec"; 

async function handleOcrFeature(sock, jid, messageType, m, msg, current, senderKey, tpmState, downloadMediaMessage, aiModel) {
    if (messageType !== 'imageMessage') {
        return await sock.sendMessage(jid, { text: "⚠️ Harap kirimkan foto label produk (bukan teks/dokumen)." });
    }
    await sock.sendMessage(jid, { text: "⏳ Foto diterima. Mengunduh gambar media dari WhatsApp..." });
    try {
        console.log(`[OCR] Mengunduh gambar untuk item ${current.itemWip}...`);
        const buffer = await downloadMediaMessage(m, 'buffer', {});
        const mimeType = msg.imageMessage?.mimetype || 'image/jpeg';
        console.log(`[OCR] Gambar berhasil diunduh. Ukuran buffer: ${buffer.length} bytes.`);

        await sock.sendMessage(jid, { text: "⏳ Gambar berhasil dimuat ke server. Memproses analisis pola visual AI..." });

        const ruleBookText = `
        - Untuk 30G161, 33G198, 36G161, 36G198: Harus berupa 4 sampai 5 digit angka murni (Contoh: 3015, 12345).
        - Untuk 30H160: Harus berupa 14 digit angka murni (Contoh: 56100143010497).
        - Untuk 33F161, 33F198, 36F161: Harus berupa 6 digit angka, diikuti huruf 'A', lalu diikuti 9 digit angka (Contoh: 123456A123456789).
        - Untuk 33P160: Harus berupa format 6 digit angka, tanda strip, kombinasi huruf/angka, tanda strip, 1 digit angka, tanda strip, 2 digit angka, tanda strip, 2 digit angka.
        - Untuk 33P150: Harus berupa pola format kode berawalan 6 digit angka yang dipisahkan strip opsional.
        - Untuk 30R061: Harus berupa format 5 digit angka, tanda strip, 1 huruf besar, dan 1 digit angka (Contoh: 12345-A1).
        - Untuk 35I161: Harus berupa kode berawalan huruf 'HT' diikuti 10 digit angka, ATAU berupa 9 sampai 10 digit angka murni (Contoh: 701364976, 2420936452).
        - Untuk 35O190: Harus berupa 1 digit angka, 1 huruf besar, dan 6 digit angka.
        `;

        const aiPrompt = `Kamu adalah AI ahli verifikasi data logistik pabrik kertas tingkat tinggi.
        Operator sedang menginput data untuk Kode Item WIP: "${current.itemWip}"
        
        Berikut adalah panduan pola validasi nomor lot/roll untuk item ini:
        ${ruleBookText}
        
        TUGAS UTAMA:
        1. Analisis gambar label fisik secara menyeluruh. Perhatikan area Barcode (garis-garis hitam) dan angka di bawahnya, serta teks di samping tulisan "Lot No.".
        2. Cari, kumpulkan, dan gabungkan semua angka murni atau kode yang ada. Jika ada angka yang terpisah oleh spasi di bawah barcode (seperti: 5 6 1 0...), GABUNGKAN menjadi satu string utuh tanpa spasi (menjadi: 5610...).
        3. Lakukan pencocokan pola secara ketat dengan aturan validasi khusus untuk item "${current.itemWip}" di atas.
        4. Pilih satu kode yang PALING COCOK dan memenuhi kriteria aturan item tersebut.
        
        Keluaran WAJIB hanya berupa kode/angka bersih hasil pilihanmu saja tanpa ada penjelasan teks, tanpa spasi, tanpa kata pengantar, tanpa tanda baca, dan tanpa backtick markdown. Jika setelah dicocokkan tidak ada satu pun kode di foto yang memenuhi kriteria pola item tersebut, jawab dengan 'NOT_FOUND'.`;

        console.log(`[OCR] Mengirimkan data visual Base64 ke Gemini AI...`);
        const aiResponse = await aiModel.generateContent([
            {
                inlineData: {
                    data: buffer.toString('base64'),
                    mimeType: mimeType
                }
            },
            aiPrompt
        ]);

        const extractedLot = aiResponse.response.text().trim().replace(/`/g, "");
        console.log(`[OCR] Respon dari Gemini AI diterima: "${extractedLot}"`);

        if (extractedLot === "NOT_FOUND") {
            await sock.sendMessage(jid, { text: `❌ AI tidak dapat menemukan nomor lot/reel yang sesuai dengan spesifikasi aturan pola untuk item *${current.itemWip}*.` });
            delete tpmState[senderKey];
            return;
        }

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
                text: `❌ AI berhasil mencocokkan nomor \`${extractedLot}\`, tetapi ditolak oleh sistem validasi akhir Google Sheets.` 
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
