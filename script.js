// WhatsApp QR Code Generator - ප්‍රධාන JavaScript ගොනුව

// DOM අංග ලබාගැනීම
const elements = {
    phoneNumber: document.getElementById('phoneNumber'),
    countryCode: document.getElementById('countryCode'),
    countryPrefix: document.getElementById('countryPrefix'),
    generateBtn: document.getElementById('generateBtn'),
    clearBtn: document.getElementById('clearBtn'),
    qrcodeContainer: document.getElementById('qrcodeContainer'),
    qrcode: document.getElementById('qrcode'),
    displayNumber: document.getElementById('displayNumber'),
    timestamp: document.getElementById('timestamp'),
    whatsappLink: document.getElementById('whatsappLink'),
    errorContainer: document.getElementById('errorContainer'),
    errorText: document.getElementById('errorText'),
    downloadBtn: document.getElementById('downloadBtn'),
    saveSvgBtn: document.getElementById('saveSvgBtn'),
    shareBtn: document.getElementById('shareBtn'),
    printBtn: document.getElementById('printBtn'),
    historyContainer: document.getElementById('historyContainer'),
    historyList: document.getElementById('historyList'),
    clearHistoryBtn: document.getElementById('clearHistoryBtn'),
    emptyHistory: document.getElementById('emptyHistory'),
    placeholder: document.getElementById('placeholder')
};

// ගෝලීය විචල්යයන්
let currentQRCode = null;
let history = JSON.parse(localStorage.getItem('whatsappQRHistory')) || [];

// ප්‍රධාන ආරම්භක ශ්‍රිතය
function init() {
    setupEventListeners();
    updateCountryPrefix();
    loadHistory();
    checkBrowserSupport();
}

// අවස්ථා සවන්දීම් සකස් කිරීම
function setupEventListeners() {
    // රටේ කේතය වෙනස් වන විට
    elements.countryCode.addEventListener('change', updateCountryPrefix);
    
    // අංකය ඇතුළත් කිරීමේ සීමා කිරීම්
    elements.phoneNumber.addEventListener('input', formatPhoneNumber);
    
    // ජනනය කිරීමේ බොත්තම
    elements.generateBtn.addEventListener('click', generateQRCode);
    
    // මකන්න බොත්තම
    elements.clearBtn.addEventListener('click', clearAll);
    
    // බාගත කිරීමේ බොත්තම්
    elements.downloadBtn.addEventListener('click', downloadQRAsPNG);
    elements.saveSvgBtn.addEventListener('click', downloadQRAsSVG);
    elements.shareBtn.addEventListener('click', shareQRCode);
    elements.printBtn.addEventListener('click', printQRCode);
    
    // ඉතිහාසය මකන්න බොත්තම
    elements.clearHistoryBtn.addEventListener('click', clearHistory);
    
    // Enter යතුර එබීම
    elements.phoneNumber.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            generateQRCode();
        }
    });
    
    // අංකය අවධානය ලැබූ විට
    elements.phoneNumber.addEventListener('focus', clearError);
}

// රටේ කේතය අනුව පෙරපදය යාවත්කාලීන කිරීම
function updateCountryPrefix() {
    const selectedCode = elements.countryCode.value;
    elements.countryPrefix.textContent = `+${selectedCode}`;
    
    // පෙරනිමි placeholder එක යාවත්කාලීන කිරීම
    switch(selectedCode) {
        case '94':
            elements.phoneNumber.placeholder = '771234567';
            break;
        case '91':
            elements.phoneNumber.placeholder = '9876543210';
            break;
        case '1':
            elements.phoneNumber.placeholder = '5551234567';
            break;
        default:
            elements.phoneNumber.placeholder = '123456789';
    }
}

// දුරකථන අංකය ආකෘතිගත කිරීම
function formatPhoneNumber() {
    let value = elements.phoneNumber.value.replace(/\D/g, '');
    
    // අනවශ්‍ය 0 ඉවත් කිරීම (කේතයට පෙර)
    if (value.startsWith('0')) {
        value = value.substring(1);
    }
    
    // අක්ෂර සීමා කිරීම
    value = value.substring(0, 12);
    
    elements.phoneNumber.value = value;
}

// දෝෂ පණිවිඩ පෙන්වීම
function showError(message) {
    elements.errorText.textContent = message;
    elements.errorContainer.classList.remove('hidden');
    elements.qrcodeContainer.classList.add('hidden');
    elements.placeholder.classList.add('hidden');
}

// දෝෂ පණිවිඩය සක්‍රීය කිරීම
function clearError() {
    elements.errorContainer.classList.add('hidden');
}

// දුරකථන අංකය වලංගු කිරීම
function validatePhoneNumber(number) {
    // හිස්දැයි පරීක්ෂා කිරීම
    if (!number || number.trim() === '') {
        return {
            valid: false,
            message: 'කරුණාකර දුරකථන අංකය ඇතුළත් කරන්න'
        };
    }
    
    // ඉලක්කම් පමණක් ඇතිදැයි පරීක්ෂා කිරීම
    if (!/^\d+$/.test(number)) {
        return {
            valid: false,
            message: 'දුරකථන අංකයේ ඉලක්කම් පමණක් අඩංගු විය යුතුය'
        };
    }
    
    // දිග පරීක්ෂා කිරීම
    if (number.length < 9 || number.length > 12) {
        return {
            valid: false,
            message: 'දුරකථන අංකය 9-12 ඉලක්කම් විය යුතුය'
        };
    }
    
    return {
        valid: true,
        number: number
    };
}

// WhatsApp URL එක ජනනය කිරීම
function generateWhatsAppURL(phoneNumber) {
    const countryCode = elements.countryCode.value;
    const fullNumber = countryCode + phoneNumber;
    
    // WhatsApp Web සබැඳිය
    const whatsappURL = `https://web.whatsapp.com/send?phone=${fullNumber}&text=&type=phone_number&app_absent=0`;
    
    return {
        url: whatsappURL,
        fullNumber: `+${fullNumber}`
    };
}

// QR කේතය ජනනය කිරීම
function generateQRCode() {
    clearError();
    
    const phoneNumber = elements.phoneNumber.value.trim();
    const validation = validatePhoneNumber(phoneNumber);
    
    if (!validation.valid) {
        showError(validation.message);
        return;
    }
    
    // WhatsApp URL ජනනය කිරීම
    const whatsappData = generateWhatsAppURL(validation.number);
    
    // පැරණි QR කේතය මකන්න
    if (currentQRCode) {
        currentQRCode.clear();
        elements.qrcode.innerHTML = '';
    }
    
    // නව QR කේතය ජනනය කිරීම
    currentQRCode = new QRCode(elements.qrcode, {
        text: whatsappData.url,
        width: 200,
        height: 200,
        colorDark: "#000000",
        colorLight: "#FFFFFF",
        correctLevel: QRCode.CorrectLevel.H
    });
    
    // තොරතුරු යාවත්කාලීන කිරීම
    elements.displayNumber.textContent = whatsappData.fullNumber;
    
    const now = new Date();
    const formattedDate = formatDateTime(now);
    elements.timestamp.textContent = formattedDate;
    
    elements.whatsappLink.href = `https://wa.me/${elements.countryCode.value}${validation.number}`;
    elements.whatsappLink.textContent = `${whatsappData.fullNumber} විවෘත කරන්න`;
    
    // දර්ශනය යාවත්කාලීන කිරීම
    elements.qrcodeContainer.classList.remove('hidden');
    elements.placeholder.classList.add('hidden');
    elements.errorContainer.classList.add('hidden');
    
    // ඉතිහාසයට එකතු කිරීම
    addToHistory(whatsappData.fullNumber, now);
}

// දිනය සහ වේලාව ආකෘතිගත කිරීම
function formatDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// QR කේතය PNG ලෙස බාගත කිරීම
function downloadQRAsPNG() {
    if (!currentQRCode) {
        showError('පළමුව QR කේතයක් ජනනය කරන්න');
        return;
    }
    
    const canvas = elements.qrcode.querySelector('canvas');
    if (!canvas) {
        showError('QR කේතය ජනනය කිරීමේ දෝෂයකි');
        return;
    }
    
    const phoneNumber = elements.phoneNumber.value.trim();
    const countryCode = elements.countryCode.value;
    const filename = `whatsapp_qr_${countryCode}${phoneNumber}_${Date.now()}.png`;
    
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

// QR කේතය SVG ලෙස බාගත කිරීම
function downloadQRAsSVG() {
    if (!currentQRCode) {
        showError('පළමුව QR කේතයක් ජනනය කරන්න');
        return;
    }
    
    const svgElement = elements.qrcode.querySelector('svg');
    if (!svgElement) {
        showError('SVG QR කේතය නොමැත');
        return;
    }
    
    const phoneNumber = elements.phoneNumber.value.trim();
    const countryCode = elements.countryCode.value;
    const filename = `whatsapp_qr_${countryCode}${phoneNumber}_${Date.now()}.svg`;
    
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
    
    URL.revokeObjectURL(url);
}

// QR කේතය බෙදාගැනීම
function shareQRCode() {
    if (!currentQRCode) {
        showError('පළමුව QR කේතයක් ජනනය කරන්න');
        return;
    }
    
    const canvas = elements.qrcode.querySelector('canvas');
    if (!canvas) {
        showError('QR කේතය බෙදාගැනීමේ දෝෂයකි');
        return;
    }
    
    if (navigator.share && navigator.canShare) {
        canvas.toBlob(async (blob) => {
            const file = new File([blob], 'whatsapp_qr.png', { type: 'image/png' });
            
            if (navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: 'WhatsApp QR Code',
                        text: `WhatsApp QR code for ${elements.displayNumber.textContent}`
                    });
                } catch (error) {
                    console.log('Sharing cancelled:', error);
                }
            } else {
                alert('මෙම බ්‍රව්සරයේ ගොනු බෙදාගැනීම සහාය නොදක්වයි. PNG ලෙස බාගත කර බෙදාගන්න.');
            }
        });
    } else {
        alert('බෙදාගැනීමේ API මෙම බ්‍රව්සරය සහාය නොදක්වයි. PNG ලෙස බාගත කර බෙදාගන්න.');
    }
}

// QR කේතය මුද්‍රණය කිරීම
function printQRCode() {
    if (!currentQRCode) {
        showError('පළමුව QR කේතයක් ජනනය කරන්න');
        return;
    }
    
    const printWindow = window.open('', '_blank');
    const phoneNumber = elements.displayNumber.textContent;
    const timestamp = elements.timestamp.textContent;
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>WhatsApp QR Code - ${phoneNumber}</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    text-align: center; 
                    padding: 40px; 
                }
                h1 { color: #25D366; }
                .qr-container { margin: 30px 0; }
                .info { 
                    margin-top: 20px; 
                    text-align: left; 
                    display: inline-block;
                }
                @media print {
                    body { padding: 0; }
                }
            </style>
        </head>
        <body>
            <h1>WhatsApp QR Code</h1>
            <div class="qr-container">${elements.qrcode.innerHTML}</div>
            <div class="info">
                <p><strong>අංකය:</strong> ${phoneNumber}</p>
                <p><strong>ජනනය කළ දිනය:</strong> ${timestamp}</p>
                <p><strong>WhatsApp Link:</strong> ${elements.whatsappLink.href}</p>
            </div>
            <script>
                window.onload = function() {
                    window.print();
                    setTimeout(() => window.close(), 1000);
                };
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// ඉතිහාසයට එකතු කිරීම
function addToHistory(phoneNumber, timestamp) {
    const historyItem = {
        number: phoneNumber,
        timestamp: timestamp.toISOString(),
        displayTime: formatDateTime(timestamp)
    };
    
    // නව අයිතමය ඉහළට එකතු කරන්න
    history.unshift(historyItem);
    
    // උපරිම අයිතම 10කට සීමා කරන්න
    if (history.length > 10) {
        history = history.slice(0, 10);
    }
    
    // localStorage එකට සුරකින්න
    localStorage.setItem('whatsappQRHistory', JSON.stringify(history));
    
    // ඉතිහාසය යාවත්කාලීන කරන්න
    loadHistory();
}

// ඉතිහාසය පූරණය කිරීම
function loadHistory() {
    elements.historyList.innerHTML = '';
    
    if (history.length === 0) {
        elements.historyContainer.classList.add('hidden');
        elements.emptyHistory.classList.remove('hidden');
        return;
    }
    
    elements.historyContainer.classList.remove('hidden');
    elements.emptyHistory.classList.add('hidden');
    
    history.forEach((item, index) => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        
        historyItem.innerHTML = `
            <div class="history-number">
                <i class="fas fa-phone"></i> ${item.number}
            </div>
            <div class="history-time">
                <i class="fas fa-clock"></i> ${item.displayTime}
            </div>
        `;
        
        // අයිතමය ක්ලික් කළ විට නැවත භාවිතා කිරීම
        historyItem.addEventListener('click', () => {
            useHistoryItem(item.number);
        });
        
        elements.historyList.appendChild(historyItem);
    });
}

// ඉතිහාසයෙන් අයිතමයක් භාවිතා කිරීම
function useHistoryItem(phoneNumber) {
    // +94 ඉවත් කර අංකය වෙන් කරන්න
    const numberWithoutPlus = phoneNumber.replace('+', '');
    const countryCode = numberWithoutPlus.substring(0, 2);
    const number = numberWithoutPlus.substring(2);
    
    // ආදාන යාවත්කාලීන කරන්න
    elements.countryCode.value = countryCode;
    updateCountryPrefix();
    elements.phoneNumber.value = number;
    
    // QR කේතය ජනනය කරන්න
    generateQRCode();
}

// ඉතිහාසය මකන්න
function clearHistory() {
    if (confirm('ඔබට ඇත්තටම ඉතිහාසය මැකීමට අවශ්‍යද?')) {
        history = [];
        localStorage.removeItem('whatsappQRHistory');
        loadHistory();
    }
}

// සියල්ල මකන්න
function clearAll() {
    elements.phoneNumber.value = '';
    elements.qrcodeContainer.classList.add('hidden');
    elements.errorContainer.classList.add('hidden');
    elements.placeholder.classList.remove('hidden');
    
    if (currentQRCode) {
        currentQRCode.clear();
        elements.qrcode.innerHTML = '';
        currentQRCode = null;
    }
    
    clearError();
}

// බ්‍රව්සරයේ සහාය පරීක්ෂා කිරීම
function checkBrowserSupport() {
    const unsupportedFeatures = [];
    
    if (!('localStorage' in window)) {
        unsupportedFeatures.push('Local Storage');
    }
    
    if (!('Blob' in window)) {
        unsupportedFeatures.push('File Downloads');
    }
    
    if (unsupportedFeatures.length > 0) {
        console.warn('Unsupported features:', unsupportedFeatures.join(', '));
    }
}

// පිටුව පූරණය වූ විට ආරම්භ කිරීම
document.addEventListener('DOMContentLoaded', init);

// පිටුව විනිවිද පෙනෙන විට යාවත්කාලීන කිරීම
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        loadHistory();
    }
});
