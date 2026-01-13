document.addEventListener('DOMContentLoaded', function() {
    const phoneNumberInput = document.getElementById('phoneNumber');
    const countryCodeInput = document.getElementById('countryCode');
    const generateBtn = document.getElementById('generateBtn');
    const qrContainer = document.getElementById('qrContainer');
    const qrcodeDiv = document.getElementById('qrcode');
    const statusMessage = document.getElementById('statusMessage');
    const timerDisplay = document.getElementById('timer');
    
    let currentSessionId = null;
    let countdownInterval = null;
    let socket = null;
    
    // Connect to Socket.io server
    function connectSocket() {
        socket = io();
        
        socket.on('connect', () => {
            console.log('Connected to server');
        });
        
        socket.on('qr-code', (data) => {
            if (data.sessionId === currentSessionId) {
                generateQRCode(data.qr);
                showStatus('Scan the QR code with your WhatsApp', 'info');
            }
        });
        
        socket.on('paired-success', (data) => {
            if (data.sessionId === currentSessionId) {
                showStatus(`✅ WhatsApp paired successfully for ${data.phoneNumber}!`, 'success');
                clearInterval(countdownInterval);
                qrContainer.style.display = 'none';
            }
        });
        
        socket.on('disconnect', () => {
            console.log('Disconnected from server');
        });
    }
    
    // Generate QR code
    function generateQRCode(qrData) {
        qrcodeDiv.innerHTML = '';
        QRCode.toCanvas(qrData, { 
            width: 200,
            height: 200,
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
            qrContainer.style.display = 'block';
        });
    }
    
    // Start countdown timer
    function startCountdown(minutes) {
        let time = minutes * 60;
        clearInterval(countdownInterval);
        
        countdownInterval = setInterval(() => {
            if (time <= 0) {
                clearInterval(countdownInterval);
                showStatus('QR code expired. Please generate a new one.', 'error');
                qrContainer.style.display = 'none';
                generateBtn.disabled = false;
                generateBtn.textContent = 'Generate Pair Code';
                return;
            }
            
            const minutes = Math.floor(time / 60);
            const seconds = time % 60;
            timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            time--;
        }, 1000);
    }
    
    // Show status message
    function showStatus(message, type = 'info') {
        statusMessage.textContent = message;
        statusMessage.className = `status ${type}`;
        statusMessage.style.display = 'block';
        
        if (type === 'success') {
            setTimeout(() => {
                statusMessage.style.display = 'none';
            }, 5000);
        }
    }
    
    // Validate phone number
    function validatePhoneNumber(phone) {
        const phoneRegex = /^[0-9]{9,15}$/;
        return phoneRegex.test(phone.replace(/\s/g, ''));
    }
    
    // Generate pair code
    generateBtn.addEventListener('click', async function() {
        const countryCode = countryCodeInput.value.trim();
        const phoneNumber = phoneNumberInput.value.trim().replace(/\s/g, '');
        
        if (!validatePhoneNumber(phoneNumber)) {
            showStatus('Please enter a valid phone number (9-15 digits)', 'error');
            return;
        }
        
        const fullNumber = `${countryCode}${phoneNumber}`;
        
        // Disable button and show loading
        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating...';
        statusMessage.style.display = 'none';
        
        try {
            const response = await fetch('/api/pair', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ phoneNumber: fullNumber })
            });
            
            const data = await response.json();
            
            if (data.success) {
                currentSessionId = data.sessionId;
                showStatus('Generating QR code...', 'info');
                startCountdown(5); // 5 minutes
                
                // Check status periodically
                const checkStatus = setInterval(async () => {
                    if (!currentSessionId) {
                        clearInterval(checkStatus);
                        return;
                    }
                    
                    const statusResponse = await fetch(`/api/status/${currentSessionId}`);
                    const statusData = await statusResponse.json();
                    
                    if (statusData.paired) {
                        clearInterval(checkStatus);
                    }
                }, 3000);
                
            } else {
                showStatus(data.error || 'Failed to generate pair code', 'error');
                generateBtn.disabled = false;
                generateBtn.textContent = 'Generate Pair Code';
            }
            
        } catch (error) {
            console.error('Error:', error);
            showStatus('Network error. Please try again.', 'error');
            generateBtn.disabled = false;
            generateBtn.textContent = 'Generate Pair Code';
        }
    });
    
    // Initialize socket connection
    connectSocket();
    
    // Handle Enter key in phone number field
    phoneNumberInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            generateBtn.click();
        }
    });
});
