const express = require('express');
const pino = require('pino');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys");

const app = express();
// Koyeb විසින් ලබාදෙන PORT එක හෝ 8080 භාවිතා කරයි
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/pair', async (req, res) => {
    let phone = req.query.phone;
    if (!phone) return res.status(400).json({ error: "Phone number is required" });

    try {
        const { state } = await useMultiFileAuthState('/tmp/session_' + Date.now());
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: "silent" })
        });

        setTimeout(async () => {
            try {
                // අංකය පිරිසිදු කර pairing code එක ලබා ගැනීම
                const code = await sock.requestPairingCode(phone.replace(/[^0-9]/g, ''));
                if (!res.headersSent) {
                    res.status(200).json({ code: code });
                }
            } catch (e) {
                console.error(e);
                if (!res.headersSent) {
                    res.status(500).json({ error: "WhatsApp server error" });
                }
            }
        }, 3000);

    } catch (err) {
        console.error(err);
        if (!res.headersSent) {
            res.status(500).json({ error: "Internal server error" });
        }
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
