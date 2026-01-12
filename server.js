require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');
const moment = require('moment');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Email configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// WhatsApp clients storage
const whatsappClients = new Map();
const userConnections = new Map(); // Store user contact info

// Email template
const emailTemplate = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
        .header { background: #25D366; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { padding: 30px; }
        .code { font-size: 36px; font-weight: bold; color: #075E54; text-align: center; margin: 20px 0; }
        .info { background: #f0f8ff; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; color: #666; margin-top: 30px; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>WhatsApp Pairing Successful! ✅</h1>
        </div>
        <div class="content">
            <h2>Hello {{name}},</h2>
            <p>Your WhatsApp has been successfully paired with a new device.</p>
            
            <div class="info">
                <p><strong>Phone Number:</strong> {{phone}}</p>
                <p><strong>Pairing Time:</strong> {{time}}</p>
                <p><strong>Device Type:</strong> WhatsApp Web/Desktop</p>
            </div>
            
            <p>If you did not initiate this pairing, please secure your WhatsApp account immediately.</p>
            
            <p>To review connected devices:</p>
            <ol>
                <li>Open WhatsApp on your phone</li>
                <li>Go to Settings → Linked Devices</li>
                <li>Review all connected devices</li>
            </ol>
        </div>
        <div class="footer">
            <p>© 2024 WhatsApp Pair System. This is an automated notification.</p>
            <p>If you need assistance, contact support immediately.</p>
        </div>
    </div>
</body>
</html>
`;

// Store email template
if (!fs.existsSync('templates')) {
    fs.mkdirSync('templates');
}
fs.writeFileSync('templates/email-template.html', emailTemplate);

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/status', (req, res) => {
    res.json({ status: 'Server is running', timestamp: new Date() });
});

// Start WhatsApp pairing
app.post('/api/start-pairing', async (req, res) => {
    try {
        const { phone, email, name } = req.body;
        
        if (!phone) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        const sessionId = `user_${phone}_${Date.now()}`;
        
        // Store user info
        userConnections.set(sessionId, {
            phone,
            email: email || 'prmox.asuka@gmail.com',
            name: name || 'User',
            status: 'waiting',
            socketId: null
        });

        // Initialize WhatsApp client
        const client = new Client({
            authStrategy: new LocalAuth({ clientId: sessionId }),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            },
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
            }
        });

        whatsappClients.set(sessionId, {
            client,
            qrCode: null,
            isReady: false,
            userData: { phone, email, name }
        });

        let qrGenerated = false;

        client.on('qr', async (qr) => {
            console.log(`QR received for ${phone}`);
            qrGenerated = true;
            
            const qrImage = await QRCode.toDataURL(qr);
            
            whatsappClients.get(sessionId).qrCode = qrImage;
            
            // Send QR to connected socket
            const userData = userConnections.get(sessionId);
            if (userData && userData.socketId) {
                io.to(userData.socketId).emit('qrCode', {
                    qrImage,
                    sessionId,
                    phone
                });
            }
            
            // Send initial email
            if (email) {
                await sendEmail(
                    email,
                    'WhatsApp Pairing QR Code',
                    `Your WhatsApp pairing QR code is ready. Please scan it within WhatsApp.`
                );
            }
        });

        client.on('ready', async () => {
            console.log(`WhatsApp ready for ${phone}`);
            
            whatsappClients.get(sessionId).isReady = true;
            
            const userData = userConnections.get(sessionId);
            if (userData) {
                userData.status = 'connected';
                userData.connectedAt = new Date();
                
                // Send success notifications
                await sendSuccessNotifications(userData, sessionId);
                
                // Notify via socket
                if (userData.socketId) {
                    io.to(userData.socketId).emit('pairingSuccess', {
                        message: 'WhatsApp successfully paired!',
                        phone,
                        timestamp: new Date()
                    });
                }
            }
        });

        client.on('authenticated', () => {
            console.log(`Authenticated for ${phone}`);
        });

        client.on('auth_failure', (msg) => {
            console.error(`Auth failure for ${phone}:`, msg);
            
            const userData = userConnections.get(sessionId);
            if (userData && userData.socketId) {
                io.to(userData.socketId).emit('pairingError', {
                    error: 'Authentication failed'
                });
            }
        });

        client.on('disconnected', (reason) => {
            console.log(`Disconnected for ${phone}:`, reason);
            
            const userData = userConnections.get(sessionId);
            if (userData) {
                userData.status = 'disconnected';
                
                if (userData.socketId) {
                    io.to(userData.socketId).emit('disconnected', {
                        message: 'WhatsApp disconnected',
                        reason
                    });
                }
            }
            
            whatsappClients.delete(sessionId);
        });

        // Initialize client
        await client.initialize();

        // Wait for QR generation
        setTimeout(() => {
            if (!qrGenerated) {
                res.status(202).json({
                    sessionId,
                    message: 'Generating QR code, please wait...',
                    phone
                });
            } else {
                res.json({
                    sessionId,
                    message: 'QR code generated',
                    phone
                });
            }
        }, 5000);

    } catch (error) {
        console.error('Pairing error:', error);
        res.status(500).json({ error: 'Failed to start pairing' });
    }
});

// Check pairing status
app.get('/api/pairing-status/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    const clientData = whatsappClients.get(sessionId);
    
    if (!clientData) {
        return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json({
        sessionId,
        isReady: clientData.isReady,
        qrCode: clientData.qrCode,
        status: clientData.isReady ? 'connected' : 'waiting'
    });
});

// Helper functions
async function sendEmail(to, subject, text) {
    try {
        const html = fs.readFileSync('templates/email-template.html', 'utf8')
            .replace('{{name}}', 'User')
            .replace('{{phone}}', to)
            .replace('{{time}}', moment().format('YYYY-MM-DD HH:mm:ss'));
        
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to,
            subject,
            text,
            html
        };
        
        await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${to}`);
    } catch (error) {
        console.error('Email sending error:', error);
    }
}

async function sendSMS(phoneNumber, message) {
    try {
        // Using Twilio (you need to set up Twilio account)
        if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
            const twilio = require('twilio')(
                process.env.TWILIO_ACCOUNT_SID,
                process.env.TWILIO_AUTH_TOKEN
            );
            
            await twilio.messages.create({
                body: message,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: phoneNumber
            });
            console.log(`SMS sent to ${phoneNumber}`);
        } else {
            console.log('Twilio not configured, SMS not sent');
        }
    } catch (error) {
        console.error('SMS sending error:', error);
    }
}

async function sendSuccessNotifications(userData, sessionId) {
    const { phone, email, name } = userData;
    const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
    
    // Email notification
    if (email) {
        const emailHtml = fs.readFileSync('templates/email-template.html', 'utf8')
            .replace('{{name}}', name)
            .replace('{{phone}}', phone)
            .replace('{{time}}', timestamp);
        
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: '✅ WhatsApp Pairing Successful!',
            html: emailHtml
        });
    }
    
    // SMS notification (to your number)
    const smsMessage = `WhatsApp pairing successful for ${phone} at ${timestamp}. Check email for details.`;
    await sendSMS('+94769484004', smsMessage);
}

// WebSocket connections
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    socket.on('registerSession', (sessionId) => {
        const userData = userConnections.get(sessionId);
        if (userData) {
            userData.socketId = socket.id;
            console.log(`Session ${sessionId} registered to socket ${socket.id}`);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});
