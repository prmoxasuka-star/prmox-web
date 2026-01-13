class WhatsAppPairApp {
    constructor() {
        this.socket = null;
        this.sessionId = null;
        this.countdownInterval = null;
        this.timeLeft = 300; // 5 minutes in seconds
        
        this.init();
    }
    
    init() {
        this.connectSocket();
        this.bindEvents();
        this.updateTimerDisplay();
    }
    
    connectSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.showToast('Connected to server', 'success');
        });
        
        this.socket.on('connected', (data) => {
            console.log('Server connected:', data);
        });
        
        this.socket.on('qr_ready', (data) => {
            if (data.sessionId === this.sessionId) {
                this.handleQRReady(data.qr, data.phone);
            }
        });
        
        this.socket.on('connected', (data) => {
            if (data.sessionId === this.sessionId) {
                this.handleConnected(data);
            }
        });
        
        this.socket.on('session_update', (data) => {
            if (data.sessionId === this.sessionId) {
                this.updateStatus(data.status);
            }
        });
        
        this.socket.on('session_expired', (data) => {
            if (data.sessionId === this.sessionId) {
                this.handleSessionExpired();
            }
        });
        
        this.socket.on('error', (data) => {
            this.showToast(data.message || 'Error occurred', 'error');
        });
        
        this.socket.on('disconnect', () => {
            this.showToast('Disconnected from server', 'warning');
        });
    }
    
    bindEvents() {
        // Generate button
        document.getElementById('generateBtn').addEventListener('click', () => {
            this.generateQR();
        });
        
        // New session button
        document.getElementById('newSessionBtn').addEventListener('click', () => {
            this.resetUI();
        });
        
        // Enter key in phone input
        document.getElementById('phoneInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.generateQR();
            }
        });
    }
    
    async generateQR() {
        const countryCode = document.getElementById('countryCode').value;
        const phoneNumber = document.getElementById('phoneInput').value.trim();
        
        // Validate phone number
        const cleanNumber = phoneNumber.replace(/\D/g, '');
        if (cleanNumber.length < 8) {
            this.showToast('Please enter a valid phone number', 'error');
            return;
        }
        
        const fullNumber = countryCode + cleanNumber;
        
        // Disable generate button
        const generateBtn = document.getElementById('generateBtn');
        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating...';
        
        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ phone: fullNumber })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.sessionId = data.sessionId;
                
                // Join socket room
                this.socket.emit('join_session', { sessionId: this.sessionId });
                
                // Show status section
                document.getElementById('statusSection').classList.remove('hidden');
                document.getElementById('sessionInfo').classList.remove('hidden');
                
                // Update session info
                document.getElementById('sessionPhone').textContent = data.phone;
                document.getElementById('sessionId').textContent = this.sessionId;
                
                // Start countdown
                this.startCountdown();
                
                this.showToast('QR code generation started', 'success');
                
            } else {
                this.showToast(data.message || 'Failed to generate', 'error');
                generateBtn.disabled = false;
                generateBtn.textContent = 'Generate QR Code';
            }
            
        } catch (error) {
            console.error('Error:', error);
            this.showToast('Network error. Please try again.', 'error');
            generateBtn.disabled = false;
            generateBtn.textContent = 'Generate QR Code';
        }
    }
    
    handleQRReady(qrCode, phone) {
        // Update UI
        document.getElementById('qrContainer').classList.remove('hidden');
        document.getElementById('statusText').textContent = 'Ready to Scan';
        document.getElementById('statusText').style.color = '#28a745';
        
        // Generate QR image
        this.generateQRImage(qrCode);
        
        // Re-enable generate button with new text
        const generateBtn = document.getElementById('generateBtn');
        generateBtn.disabled = false;
        generateBtn.textContent = 'Generating New QR';
        
        this.showToast('QR code generated. Scan with WhatsApp.', 'success');
    }
    
    generateQRImage(qrCode) {
        const qrcodeDiv = document.getElementById('qrcode');
        qrcodeDiv.innerHTML = '';
        
        QRCode.toCanvas(qrCode, {
            width: 250,
            height: 250,
            margin: 1,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        }, function(err, canvas) {
            if (err) {
                console.error('QR generation error:', err);
                return;
            }
            qrcodeDiv.appendChild(canvas);
        });
    }
    
    handleConnected(data) {
        // Update UI for success
        document.getElementById('statusSection').classList.add('hidden');
        document.getElementById('successMessage').classList.remove('hidden');
        
        // Update session info
        document.getElementById('connectionStatus').textContent = 'Connected';
        document.getElementById('connectionStatus').style.color = '#28a745';
        
        // Stop countdown
        this.stopCountdown();
        
        this.showToast('WhatsApp paired successfully!', 'success');
        
        // Clean up session after 10 seconds
        setTimeout(() => {
            if (this.sessionId) {
                fetch(`/api/session/${this.sessionId}`, { method: 'DELETE' }).catch(() => {});
            }
        }, 10000);
    }
    
    handleSessionExpired() {
        this.showToast('Session expired. Please generate a new QR.', 'error');
        this.resetUI();
    }
    
    startCountdown() {
        this.timeLeft = 300; // 5 minutes
        this.stopCountdown();
        
        this.countdownInterval = setInterval(() => {
            this.timeLeft--;
            this.updateTimerDisplay();
            
            if (this.timeLeft <= 0) {
                this.stopCountdown();
                this.handleSessionExpired();
            }
        }, 1000);
    }
    
    stopCountdown() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
    }
    
    updateTimerDisplay() {
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = this.timeLeft % 60;
        document.getElementById('timer').textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    updateStatus(status) {
        document.getElementById('statusText').textContent = status;
    }
    
    resetUI() {
        // Reset all UI elements
        document.getElementById('phoneInput').value = '';
        document.getElementById('statusSection').classList.add('hidden');
        document.getElementById('qrContainer').classList.add('hidden');
        document.getElementById('successMessage').classList.add('hidden');
        document.getElementById('sessionInfo').classList.add('hidden');
        
        const generateBtn = document.getElementById('generateBtn');
        generateBtn.disabled = false;
        generateBtn.textContent = 'Generate QR Code';
        
        this.sessionId = null;
        this.stopCountdown();
    }
    
    showToast(message, type = 'info') {
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 24px;
            background: ${type === 'error' ? '#ff6b6b' : 
                        type === 'success' ? '#28a745' : 
                        type === 'warning' ? '#ffc107' : '#17a2b8'};
            color: white;
            border-radius: 8px;
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(toast);
        
        // Remove toast after 3 seconds
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }
}

// Add CSS for toast animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Initialize app when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.app = new WhatsAppPairApp();
});
