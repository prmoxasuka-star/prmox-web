const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Boom } = require('@hapi/boom');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Store active sessions
const activeSessions = new Map();

// API endpoint to generate pair code
app.post('/api/pair', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        
        if (!phoneNumber) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        const sessionId = `session_${Date.now()}_${phoneNumber}`;
        
        // Generate pair code
        const pairCode = await generatePairCode(sessionId, phoneNumber);
        
        activeSessions.set(sessionId, {
            phoneNumber,
            pairCode,
            timestamp: Date.now(),
            status: 'pending'
        });

        // Clean up old sessions after 5 minutes
        setTimeout(() => {
            if (activeSessions.has(sessionId)) {
                activeSessions.delete(sessionId);
            }
        }, 5 * 60 * 1000);

        res.json({
            success: true,
            sessionId,
            pairCode,
            message: 'Pair code generated successfully'
        });

    } catch (error) {
        console.error('Error generating pair code:', error);
        res.status(500).json({ error: 'Failed to generate pair code' });
    }
});

// API endpoint to check status
app.get('/api/status/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = activeSessions.get(sessionId);
    
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json({
        status: session.status,
        phoneNumber: session.phoneNumber,
        paired: session.status === 'paired'
    });
});

// Function to generate pair code using Baileys
async function generatePairCode(sessionId, phoneNumber) {
    return new Promise(async (resolve, reject) => {
        try {
            const { state, saveCreds } = await useMultiFileAuthState(`./auth_info_${sessionId}`);
            
            const sock = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                logger: pino({ level: 'silent' }),
                browser: Browsers.ubuntu('Chrome')
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update) => {
                const { connection, qr } = update;
                
                if (qr) {
                    // Send QR code via socket
                    io.emit('qr-code', { sessionId, qr });
                    resolve(qr);
                }
                
                if (connection === 'open') {
                    console.log(`WhatsApp connected for ${phoneNumber}`);
                    
                    // Update session status
                    const session = activeSessions.get(sessionId);
                    if (session) {
                        session.status = 'paired';
                        
                        // Send success notification
                        io.emit('paired-success', { 
                            sessionId, 
                            phoneNumber,
                            message: 'WhatsApp paired successfully!' 
                        });
                        
                        // Get user info
                        const user = sock.user;
                        if (user) {
                            session.userInfo = {
                                id: user.id,
                                name: user.name
                            };
                        }
                        
                        // Wait a bit and then logout
                        await delay(2000);
                        await sock.logout();
                        
                        // Clean up auth files (optional)
                        // fs.rmSync(`./auth_info_${sessionId}`, { recursive: true });
                    }
                }
                
                if (connection === 'close') {
                    const lastDisconnect = sock.lastDisconnect?.error;
                    if (lastDisconnect instanceof Boom) {
                        const shouldReconnect = lastDisconnect.output?.statusCode !== DisconnectReason.loggedOut;
                        
                        if (!shouldReconnect) {
                            console.log(`Connection closed for ${phoneNumber}`);
                        }
                    }
                }
            });

            // Set timeout for QR generation
            setTimeout(() => {
                reject(new Error('QR generation timeout'));
            }, 60000);

        } catch (error) {
            reject(error);
        }
    });
}

// Socket.io connection
io.on('connection', (socket) => {
    console.log('Client connected');
    
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
