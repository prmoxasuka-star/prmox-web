require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Create directories
const directories = ['sessions', 'public'];
directories.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Store sessions
const sessions = new Map();

// Import WhatsApp handler
const { initWhatsApp, generateQR } = require('./whatsapp');

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api', (req, res) => {
  res.json({
    name: 'WhatsApp Pair API',
    version: '1.0.0',
    endpoints: [
      'POST /api/generate',
      'GET /api/session/:id',
      'GET /api/sessions',
      'GET /api/health'
    ]
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    sessions: sessions.size
  });
});

// Generate new pair code
app.post('/api/generate', async (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    // Clean phone number
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number'
      });
    }

    const sessionId = `wa_${Date.now()}_${cleanPhone}`;
    const fullNumber = `+${cleanPhone}`;

    // Create session
    sessions.set(sessionId, {
      id: sessionId,
      phone: fullNumber,
      status: 'creating',
      createdAt: new Date(),
      qrCode: null,
      connected: false,
      user: null
    });

    console.log(`Creating session: ${sessionId} for ${fullNumber}`);

    // Generate QR in background
    setTimeout(async () => {
      try {
        const qr = await generateQR(sessionId, fullNumber, io);
        
        if (sessions.has(sessionId)) {
          const session = sessions.get(sessionId);
          session.status = 'qr_ready';
          session.qrCode = qr;
          session.lastUpdate = new Date();
          
          console.log(`QR generated for ${fullNumber}`);
          
          // Emit to specific session room
          io.to(sessionId).emit('qr_ready', {
            sessionId,
            qr,
            phone: fullNumber
          });
        }
      } catch (error) {
        console.error('QR generation failed:', error);
        if (sessions.has(sessionId)) {
          sessions.delete(sessionId);
          io.to(sessionId).emit('error', {
            sessionId,
            message: 'Failed to generate QR'
          });
        }
      }
    }, 1000);

    // Auto-cleanup after 5 minutes
    setTimeout(() => {
      if (sessions.has(sessionId) && !sessions.get(sessionId).connected) {
        sessions.delete(sessionId);
        io.to(sessionId).emit('session_expired', { sessionId });
        console.log(`Session expired: ${sessionId}`);
      }
    }, 5 * 60 * 1000);

    res.json({
      success: true,
      sessionId,
      phone: fullNumber,
      message: 'QR generation started. Connect to socket with sessionId.',
      socketEvent: 'join_session'
    });

  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get session status
app.get('/api/session/:id', (req, res) => {
  const { id } = req.params;
  
  if (!sessions.has(id)) {
    return res.status(404).json({
      success: false,
      message: 'Session not found'
    });
  }
  
  const session = sessions.get(id);
  res.json({
    success: true,
    session: {
      id: session.id,
      phone: session.phone,
      status: session.status,
      connected: session.connected,
      createdAt: session.createdAt,
      lastUpdate: session.lastUpdate
    }
  });
});

// List all sessions
app.get('/api/sessions', (req, res) => {
  const sessionList = Array.from(sessions.values()).map(s => ({
    id: s.id,
    phone: s.phone,
    status: s.status,
    connected: s.connected,
    createdAt: s.createdAt
  }));
  
  res.json({
    success: true,
    count: sessionList.length,
    sessions: sessionList
  });
});

// Socket.io
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.emit('connected', {
    message: 'Connected to WhatsApp Pair Server',
    socketId: socket.id
  });
  
  socket.on('join_session', (data) => {
    const { sessionId } = data;
    
    if (sessions.has(sessionId)) {
      socket.join(sessionId);
      console.log(`Socket ${socket.id} joined session ${sessionId}`);
      
      const session = sessions.get(sessionId);
      
      // Send current status
      socket.emit('session_update', {
        sessionId,
        status: session.status,
        phone: session.phone,
        connected: session.connected
      });
      
      // If QR is already ready, send it
      if (session.status === 'qr_ready' && session.qrCode) {
        socket.emit('qr_ready', {
          sessionId,
          qr: session.qrCode,
          phone: session.phone
        });
      }
    } else {
      socket.emit('error', {
        message: 'Session not found'
      });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Initialize WhatsApp
initWhatsApp(io, sessions);

// Cleanup interval
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [sessionId, session] of sessions.entries()) {
    const sessionAge = now - new Date(session.createdAt).getTime();
    
    // Remove sessions older than 10 minutes
    if (sessionAge > 10 * 60 * 1000) {
      sessions.delete(sessionId);
      cleaned++;
      console.log(`Cleaned expired session: ${sessionId}`);
    }
  }
  
  if (cleaned > 0) {
    console.log(`Cleaned ${cleaned} expired sessions`);
  }
}, 60 * 1000);

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
  🚀 WhatsApp Pair Server Started!
  📍 Port: ${PORT}
  🌐 Web: http://localhost:${PORT}
  📱 API: http://localhost:${PORT}/api
  🔗 Health: http://localhost:${PORT}/api/health
  
  ⚠️  Note: This is for development only!
  `);
});
