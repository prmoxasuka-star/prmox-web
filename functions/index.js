const express = require('express');
const serverless = require('serverless-http');
const pino = require('pino');
const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys");

const app = express();
const router = express.Router();

router.get('/pair', async (req, res) => {
    let phone = req.query.phone;
    if (!phone) return res.status(400).json({ error: "Phone number required" });

    try {
        const { state, saveCreds } = await useMultiFileAuthState('/tmp/auth'); // Netlify සඳහා /tmp භාවිතා කරන්න
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: "silent" })
        });

        if (!sock.authState.creds.registered) {
            await delay(2000);
            phone = phone.replace(/[^0-9]/g, '');
            const code = await sock.requestPairingCode(phone);
            res.json({ code: code });
        }
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

app.use('/.netlify/functions/index', router);
module.exports.handler = serverless(app);
