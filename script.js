document.addEventListener('DOMContentLoaded', function() {
    const phoneInput = document.getElementById('phoneNumber');
    const countryCodeSelect = document.getElementById('countryCode');
    const generateBtn = document.getElementById('generateBtn');
    const clearBtn = document.getElementById('clearBtn');
    const qrcodeContainer = document.getElementById('qrcodeContainer');
    const errorContainer = document.getElementById('errorContainer');
    const historyContainer = document.getElementById('historyContainer');
    const qrcodeElement = document.getElementById('qrcode');
    const displayNumber = document.getElementById('displayNumber');
    const timestamp = document.getElementById('timestamp');
    const downloadBtn = document.getElementById('downloadBtn');
    const shareBtn = document.getElementById('shareBtn');
    const historyList = document.getElementById('historyList');
    const errorText = document.getElementById('errorText');

    let currentQRCode = null;
    let history = JSON.parse(localStorage.getItem('whatsappPairHistory')) || [];

    // ඉතිහාසය පෙන්වන්න
    function displayHistory() {
        if (history.length > 0) {
            historyContainer.classList.remove('hidden');
            historyList.innerHTML = '';
            
            history.slice(-5).reverse().forEach(item => {
                const historyItem = document.createElement('div');
                historyItem.className = 'history-item';
                historyItem.innerHTML = `
                    <span>${item.number}</span>
                    <span>${new Date(item.timestamp).toLocaleTimeString()}</span>
                `;
                historyList.appendChild(historyItem);
            });
        }
    }

    displayHistory();

    // දිනය සහ වේලාව අංකනය කරන ශ්‍රිතය
    function formatDate(date) {
        return date.toLocaleDateString('si-LK', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    // දෝෂ පනවන්න
    function showError(message) {
        errorText.textContent = message;
        errorContainer.classList.remove('hidden');
        qrcodeContainer.classList.add('hidden');
    }

    // දෝෂ සක්‍රීය කරන්න
    function clearError() {
        errorContainer.classList.add('hidden');
    }

    // අංකය වලංගු කිරීම
    function validatePhoneNumber(number) {
        const cleaned = number.replace(/\D/g, '');
        
        if (cleaned.length < 9 || cleaned.length > 12) {
            return { valid: false, message: 'අංකය 9-12 ඉලක්කම් විය යුතුය' };
        }
        
        if (!/^\d+$/.test(cleaned)) {
            return { valid: false, message: 'අංකයේ ඉලක්කම් පමණක් අඩංගු විය යුතුය' };
        }
        
        return { valid: true, number: cleaned };
    }

    // WhatsApp pair URL එක ජනනය කිරීම
    function generateWhatsAppPairURL(phoneNumber) {
        // WhatsApp Web pair කිරීමේ URL format එක
        // මෙය WhatsApp Web QR කේතය සඳහා අනුකරණය කරන ආකාරයකි
        const baseURL = `https://web.whatsapp.com/send?phone=${phoneNumber}&text=&type=phone_number&app_absent=0`;
        return baseURL;
    }

    // QR කේතය ජනනය කිරීම
    function generateQRCode(url, element) {
        if (currentQRCode) {
            currentQRCode.clear();
        }
        
        element.innerHTML = '';
        
        currentQRCode = new QRCode(element, {
            text: url,
            width: 200,
            height: 200,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    }

    // QR කේතය බාගත කිරීම
    function downloadQRCode() {
        const canvas = qrcodeElement.querySelector('canvas');
        if (!canvas) {
            showError('QR කේතය ජනනය කර නොමැත');
            return;
        }
        
        const link = document.createElement('a');
        link.download = `whatsapp-pair-${phoneInput.value}-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    // බෙදාගැනීමේ ශ්‍රිතය
    function shareQRCode() {
        if (!navigator.share) {
            alert('බෙදාගැනීමේ විකල්පය ඔබේ බ්‍රව්සරය සපයන්නේ නැත. QR කේතය බාගත කර එය බෙදාගන්න.');
            return;
        }
        
        const phoneNumber = phoneInput.value;
        navigator.share({
            title: 'WhatsApp Pair Code',
            text: `WhatsApp pair code for ${phoneNumber}`,
            url: window.location.href
        });
    }

    // ප්‍රධාන ජනනය කිරීමේ ශ්‍රිතය
    generateBtn.addEventListener('click', function() {
        clearError();
        
        const countryCode = countryCodeSelect.value;
        const phoneNumber = phoneInput.value.trim();
        
        if (!phoneNumber) {
            showError('කරුණාකර අංග සම්පූර්ණ අංකය ඇතුළත් කරන්න');
            return;
        }
        
        const validation = validatePhoneNumber(phoneNumber);
        if (!validation.valid) {
            showError(validation.message);
            return;
        }
        
        const fullNumber = countryCode + validation.number;
        const whatsappURL = generateWhatsAppPairURL(fullNumber);
        
        // QR කේතය ජනනය කිරීම
        generateQRCode(whatsappURL, qrcodeElement);
        
        // තොරතුරු පෙන්වන්න
        displayNumber.textContent = fullNumber;
        const now = new Date();
        timestamp.textContent = formatDate(now);
        
        // කන්ටේනරය පෙන්වන්න
        qrcodeContainer.classList.remove('hidden');
        
        // ඉතිහාසයට එකතු කරන්න
        const historyItem = {
            number: fullNumber,
            timestamp: now.toISOString()
        };
        
        history.push(historyItem);
        if (history.length > 10) {
            history = history.slice(-10);
        }
        
        localStorage.setItem('whatsappPairHistory', JSON.stringify(history));
        displayHistory();
    });

    // මකන්න බොත්තම
    clearBtn.addEventListener('click', function() {
        phoneInput.value = '';
        qrcodeContainer.classList.add('hidden');
        errorContainer.classList.add('hidden');
        clearError();
        
        if (currentQRCode) {
            currentQRCode.clear();
            qrcodeElement.innerHTML = '';
        }
    });

    // බාගත කිරීමේ බොත්තම
    downloadBtn.addEventListener('click', downloadQRCode);

    // බෙදාගැනීමේ බොත්තම
    shareBtn.addEventListener('click', shareQRCode);

    // Enter යතුර එබීම
    phoneInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            generateBtn.click();
        }
    });

    // ආරම්භක අංකය සඳහා උදාහරණයක්
    phoneInput.placeholder = `94${'7'.padEnd(9, 'X')}`;
});