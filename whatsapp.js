const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

let io = null;
let sessions = null;

function initWhatsApp(socketIO, sessionStore) {
  io = socketIO;
  sessions = sessionStore;
  console.log('WhatsApp handler initialized');
}

async function generateQR(sessionId, phoneNumber) {
  return new Promise(async (resolve, reject) => {
    try {
      const sessionDir = path.join(__dirname, 'sessions', sessionId);
      
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }
      
      const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
      
      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'error' }),
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000
      });
      
      // Save credentials
      sock.ev.on('creds.update', saveCreds);
      
      // Handle connection updates
      sock.ev.on('connection.update', (update) => {
        const { connection, qr, lastDisconnect } = update;
        
        console.log(`Connection update for ${phoneNumber}:`, connection);
        
        if (qr) {
          console.log(`QR received for ${phoneNumber}`);
          resolve(qr);
        }
        
        if (connection === 'open') {
          console.log(`✅ WhatsApp CONNECTED for ${phoneNumber}`);
          
          if (sessions && sessions.has(sessionId)) {
            const session = sessions.get(sessionId);
            session.status = 'connected';
            session.connected = true;
            session.user = sock.user;
            session.lastUpdate = new Date();
            
            // Notify via socket
            if (io) {
              io.to(sessionId).emit('connected', {
                sessionId,
                phone: phoneNumber,
                user: sock.user,
                message: 'WhatsApp paired successfully!'
              });
            }
            
            // Disconnect after 5 seconds
            setTimeout(async () => {
              try {
                await sock.logout();
                console.log(`Logged out ${phoneNumber}`);
              } catch (e) {
                console.log(`Logout error: ${e.message}`);
              }
            }, 5000);
          }
        }
        
        if (connection === 'close') {
          const error = lastDisconnect?.error;
          if (error?.output?.statusCode !== DisconnectReason.loggedOut) {
            console.log(`Reconnecting ${phoneNumber}...`);
            // Auto-reconnect logic here if needed
          } else {
            console.log(`Logged out ${phoneNumber}`);
          }
        }
      });
      
      // Timeout after 2 minutes
      setTimeout(() => {
        reject(new Error('QR generation timeout (2 minutes)'));
        try {
          sock.logout();
        } catch (e) {}
      }, 120000);
      
    } catch (error) {
      console.error('WhatsApp error:', error);
      reject(error);
    }
  });
}

// Cleanup old sessions
function cleanupSession(sessionId) {
  try {
    const sessionDir = path.join(__dirname, 'sessions', sessionId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true });
      console.log(`Cleaned session: ${sessionId}`);
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

module.exports = {
  initWhatsApp,
  generateQR,
  cleanupSession
};
