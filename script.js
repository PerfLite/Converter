import Psd from 'https://esm.sh/@webtoon/psd@0.4.0';

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const editor = document.getElementById('editor');
const sourceImage = document.getElementById('sourceImage');
const resultImage = document.getElementById('resultImage');
const sourceInfo = document.getElementById('sourceInfo');
const resultInfo = document.getElementById('resultInfo');
const formatSelect = document.getElementById('formatSelect');
const qualityRange = document.getElementById('qualityRange');
const qualityValue = document.getElementById('qualityValue');
const qualityGroup = document.getElementById('qualityGroup');
const resizeCheck = document.getElementById('resizeCheck');
const resizeInputs = document.getElementById('resizeInputs');
const widthInput = document.getElementById('widthInput');
const heightInput = document.getElementById('heightInput');
const aspectLock = document.getElementById('aspectLock');
const resetBtn = document.getElementById('resetBtn');
const downloadBtn = document.getElementById('downloadBtn');
const toast = document.getElementById('toast');

let currentFile = null;
let originalWidth = 0;
let originalHeight = 0;
let isConverting = false;

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Б';
    const k = 1024;
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getExtension(mime) {
    const map = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp'
    };
    return map[mime] || 'bin';
}

function isPsdFile(file) {
    return file.name.toLowerCase().endsWith('.psd');
}

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

async function processFile(file) {
    const isPsd = isPsdFile(file);
    if (!file.type.startsWith('image/') && !isPsd) {
        showToast('Пожалуйста, выберите файл изображения');
        return;
    }
    if (file.size > 50 * 1024 * 1024) {
        showToast('Файл слишком большой (макс. 50 МБ)');
        return;
    }

    currentFile = file;

    if (isPsd) {
        try {
            if (typeof Psd === 'undefined' || !Psd.parse) {
                showToast('Библиотека PSD не загрузилась. Проверьте подключение к интернету.');
                console.error('Psd is undefined or missing parse method:', Psd);
                return;
            }
            const buffer = await file.arrayBuffer();
            const psdFile = Psd.parse(buffer);
            const composite = psdFile.composite();
            
            console.log('PSD debug:', { composite, width: composite?.width, height: composite?.height, dataLen: composite?.data?.length });
            
            if (!composite || !composite.width || !composite.height) {
                throw new Error('Invalid composite dimensions');
            }
            
            const canvas = document.createElement('canvas');
            canvas.width = composite.width;
            canvas.height = composite.height;
            const ctx = canvas.getContext('2d');
            
            let pixels;
            if (composite.data instanceof Uint8ClampedArray) {
                pixels = composite.data;
            } else if (composite.data instanceof Uint8Array) {
                pixels = new Uint8ClampedArray(composite.data);
            } else {
                throw new Error('Unknown pixel data format');
            }
            
            if (pixels.length !== composite.width * composite.height * 4) {
                throw new Error(`Invalid pixel data size: ${pixels.length} vs ${composite.width * composite.height * 4}`);
            }
            
            const imageData = new ImageData(pixels, composite.width, composite.height);
            ctx.putImageData(imageData, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');

            originalWidth = composite.width;
            originalHeight = composite.height;
            sourceImage.src = dataUrl;
            sourceInfo.textContent = `${originalWidth}×${originalHeight} пикс. • ${formatBytes(file.size)} • PSD`;
        } catch (e) {
            showToast('Ошибка PSD: ' + (e.message || e));
            console.error('PSD parse error:', e);
            return;
        }
    } else {
        const img = await loadImage(file);
        originalWidth = img.naturalWidth;
        originalHeight = img.naturalHeight;

        sourceImage.src = img.src;
        sourceInfo.textContent = `${originalWidth}×${originalHeight} пикс. • ${formatBytes(file.size)} • ${file.type.replace('image/', '').toUpperCase()}`;
    }

    widthInput.value = originalWidth;
    heightInput.value = originalHeight;

    dropZone.style.display = 'none';
    editor.style.display = 'block';

    updateConversion();
}

function convertImage() {
    if (!currentFile || isConverting) return;
    isConverting = true;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    let targetWidth = originalWidth;
    let targetHeight = originalHeight;

    if (resizeCheck.checked) {
        targetWidth = parseInt(widthInput.value) || originalWidth;
        targetHeight = parseInt(heightInput.value) || originalHeight;
    }

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    // Белый фон для JPEG, если есть прозрачность
    if (formatSelect.value === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
    }

    const img = new Image();
    img.onload = () => {
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        const mime = formatSelect.value;
        const quality = parseInt(qualityRange.value) / 100;
        const dataUrl = canvas.toDataURL(mime, quality);

        resultImage.src = dataUrl;

        const base64 = dataUrl.split(',')[1];
        const resultSize = Math.ceil((base64.length * 3) / 4);
        resultInfo.textContent = `${targetWidth}×${targetHeight} пикс. • ${formatBytes(resultSize)} • ${getExtension(mime).toUpperCase()}`;

        isConverting = false;
    };
    img.src = sourceImage.src;
}

function updateConversion() {
    requestAnimationFrame(convertImage);
}

// Events
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
});

fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) processFile(file);
});

formatSelect.addEventListener('change', () => {
    qualityGroup.style.display = formatSelect.value === 'image/png' ? 'none' : 'block';
    updateConversion();
});

qualityRange.addEventListener('input', () => {
    qualityValue.textContent = qualityRange.value;
    updateConversion();
});

resizeCheck.addEventListener('change', () => {
    resizeInputs.style.display = resizeCheck.checked ? 'grid' : 'none';
    if (resizeCheck.checked) {
        widthInput.value = originalWidth;
        heightInput.value = originalHeight;
    }
    updateConversion();
});

function updateAspect(current, isWidth) {
    if (!aspectLock.checked) return;
    const ratio = originalWidth / originalHeight;
    if (isWidth) {
        heightInput.value = Math.round(parseInt(current) / ratio);
    } else {
        widthInput.value = Math.round(parseInt(current) * ratio);
    }
}

widthInput.addEventListener('input', () => updateAspect(widthInput.value, true));
heightInput.addEventListener('input', () => updateAspect(heightInput.value, false));

[widthInput, heightInput].forEach(el => {
    el.addEventListener('change', updateConversion);
});

resetBtn.addEventListener('click', () => {
    editor.style.display = 'none';
    dropZone.style.display = 'block';
    fileInput.value = '';
    currentFile = null;
    resizeCheck.checked = false;
    resizeInputs.style.display = 'none';
    formatSelect.value = 'image/jpeg';
    qualityRange.value = 100;
    qualityValue.textContent = '100';
    qualityGroup.style.display = 'block';
});

downloadBtn.addEventListener('click', () => {
    if (!resultImage.src) return;
    const link = document.createElement('a');
    const ext = getExtension(formatSelect.value);
    const name = currentFile.name.replace(/\.[^/.]+$/, '') + '_converted.' + ext;
    link.download = name;
    link.href = resultImage.src;
    link.click();
    showToast('Скачивание началось');
});
