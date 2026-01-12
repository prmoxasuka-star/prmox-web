import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason
} from '@whiskeysockets/baileys'
import fs from 'fs'

let sock
let pairingCode = ""

export async function startBot(phoneNumber) {
    const { state, saveCreds } = await useMultiFileAuthState('./session')

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false
    })

    sock.ev.on('creds.update', saveCreds)

    if (!sock.authState.creds.registered) {
        const code = await sock.requestPairingCode(phoneNumber)
        pairingCode = code
        console.log("PAIR CODE:", code)
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update

        if (connection === 'close') {
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                startBot(phoneNumber)
            }
        }

        if (connection === 'open') {
            console.log("WHATSAPP CONNECTED")
        }
    })
}

export function getPairCode() {
    return pairingCode
}
