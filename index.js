// index.js - Main entry point
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { Boom } = require('@hapi/boom');
const fs = require('fs');

// Create necessary directories
if (!fs.existsSync('./sessions')) {
    fs.mkdirSync('./sessions');
}

if (!fs.existsSync('./public')) {
    fs.mkdirSync('./public');
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Import WhatsApp handler
const { initializeWhatsApp, generatePairCode } = require('./whatsapp-handler');

// Store active sessions
const activeSessions = new Map();

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'online', 
        timestamp: new Date().toISOString(),
        sessions: activeSessions.size 
    });
});

// API to generate pair code
app.post('/api/generate-pair', async (req, res) => {
    try {
        const { phoneNumber, sessionName = 'default' } = req.body;
        
        if (!phoneNumber) {
            return res.status(400).json({ 
                success: false, 
                message: 'Phone number is required' 
            });
        }

        // Clean phone number
        const cleanPhone = phoneNumber.replace(/\s+/g, '').replace('+', '');
        
        // Generate unique session ID
        const sessionId = `session_${Date.now()}_${cleanPhone}`;
        
        // Store session info
        activeSessions.set(sessionId, {
            phoneNumber: `+${cleanPhone}`,
            sessionName,
            status: 'generating',
            createdAt: new Date(),
            lastUpdate: new Date()
        });

        // Generate pair code asynchronously
        setTimeout(async () => {
            try {
                const qrCode = await generatePairCode(sessionId, `+${cleanPhone}`);
                
                if (activeSessions.has(sessionId)) {
                    const session = activeSessions.get(sessionId);
                    session.status = 'qr_ready';
                    session.qrCode = qrCode;
                    session.lastUpdate = new Date();
                    
                    // Emit QR code to connected clients
                    io.emit('qr-update', {
                        sessionId,
                        qrCode,
                        phoneNumber: `+${cleanPhone}`
                    });
                }
            } catch (error) {
                console.error('Error generating QR:', error);
                if (activeSessions.has(sessionId)) {
                    activeSessions.delete(sessionId);
                }
            }
        }, 1000);

        // Set session expiry (10 minutes)
        setTimeout(() => {
            if (activeSessions.has(sessionId) && activeSessions.get(sessionId).status !== 'paired') {
                activeSessions.delete(sessionId);
                io.emit('session-expired', { sessionId });
            }
        }, 10 * 60 * 1000);

        res.json({
            success: true,
            sessionId,
            message: 'Pair code generation started',
            expiresIn: '10 minutes'
        });

    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Check session status
app.get('/api/session/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    
    if (!activeSessions.has(sessionId)) {
        return res.status(404).json({
            success: false,
            message: 'Session not found'
        });
    }
    
    const session = activeSessions.get(sessionId);
    
    // Don't send full QR code in status check
    const { qrCode, ...sessionInfo } = session;
    
    res.json({
        success: true,
        session: sessionInfo
    });
});

// Get QR code for session
app.get('/api/qr/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    
    if (!activeSessions.has(sessionId)) {
        return res.status(404).json({
            success: false,
            message: 'Session not found'
        });
    }
    
    const session = activeSessions.get(sessionId);
    
    if (session.status !== 'qr_ready') {
        return res.json({
            success: false,
            message: 'QR code not ready yet',
            status: session.status
        });
    }
    
    res.json({
        success: true,
        qrCode: session.qrCode,
        phoneNumber: session.phoneNumber
    });
});

// List all active sessions
app.get('/api/sessions', (req, res) => {
    const sessions = Array.from(activeSessions.entries()).map(([id, session]) => ({
        sessionId: id,
        phoneNumber: session.phoneNumber,
        status: session.status,
        createdAt: session.createdAt,
        lastUpdate: session.lastUpdate
    }));
    
    res.json({
        success: true,
        count: sessions.length,
        sessions
    });
});

// Cleanup expired sessions
app.post('/api/cleanup', (req, res) => {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [sessionId, session] of activeSessions.entries()) {
        const sessionAge = now - new Date(session.lastUpdate).getTime();
        
        if (sessionAge > 10 * 60 * 1000) { // Older than 10 minutes
            activeSessions.delete(sessionId);
            cleaned++;
        }
    }
    
    res.json({
        success: true,
        message: `Cleaned ${cleaned} expired sessions`
    });
});

// Socket.io connection
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    
    socket.emit('connected', { 
        message: 'Connected to WhatsApp Pair Server',
        serverTime: new Date().toISOString()
    });
    
    socket.on('join-session', (sessionId) => {
        socket.join(sessionId);
        console.log(`Client ${socket.id} joined session ${sessionId}`);
    });
    
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});

// Initialize WhatsApp
initializeWhatsApp(io, activeSessions);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        message: 'Something went wrong!'
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 WhatsApp Pair Code Generator`);
    console.log(`🌐 Web Interface: http://localhost:${PORT}`);
    console.log(`📊 API Health: http://localhost:${PORT}/health`);
});
