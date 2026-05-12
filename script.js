const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const editor = document.getElementById('editor');
const sourceImage = document.getElementById('sourceImage');
const resultImage = document.getElementById('resultImage');
const sourceInfo = document.getElementById('sourceInfo');
const resultInfo = document.getElementById('resultInfo');
const sourceBadge = document.getElementById('sourceBadge');
const resultBadge = document.getElementById('resultBadge');
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

function showToast(message, isError = false) {
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
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

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Не удалось загрузить изображение'));
        img.src = src;
    });
}

function showEditor(dataUrl, width, height, label) {
    originalWidth = width;
    originalHeight = height;

    sourceImage.src = dataUrl;
    sourceInfo.textContent = `${width}×${height} пикс. • ${formatBytes(currentFile.size)}`;
    sourceBadge.textContent = label;

    widthInput.value = width;
    heightInput.value = height;

    dropZone.style.display = 'none';
    editor.style.display = 'block';

    updateConversion();
}

async function parsePsd(file) {
    if (typeof agPsd === 'undefined') {
        throw new Error('Библиотека ag-psd не загружена. Проверьте подключение к интернету.');
    }

    const arrayBuffer = await file.arrayBuffer();

    // ag-psd требует инициализации canvas-фабрики в браузере
    agPsd.initializeCanvas((width, height) => {
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        return c;
    });

    const psd = agPsd.readPsd(arrayBuffer);

    if (!psd.canvas) {
        throw new Error('PSD файл не содержит данных изображения. Убедитесь, что файл сохранён с включённой опцией "Maximize Compatibility".');
    }

    return {
        dataUrl: psd.canvas.toDataURL('image/png'),
        width: psd.width,
        height: psd.height
    };
}

async function processFile(file) {
    const isPsd = isPsdFile(file);

    if (!file.type.startsWith('image/') && !isPsd) {
        showToast('Пожалуйста, выберите файл изображения', true);
        return;
    }
    if (file.size > 50 * 1024 * 1024) {
        showToast('Файл слишком большой (макс. 50 МБ)', true);
        return;
    }

    currentFile = file;
    showToast('Загрузка...');

    try {
        if (isPsd) {
            const { dataUrl, width, height } = await parsePsd(file);
            showEditor(dataUrl, width, height, 'PSD');
        } else {
            const objectUrl = URL.createObjectURL(file);
            const img = await loadImage(objectUrl);
            const label = file.type.replace('image/', '').toUpperCase() || file.name.split('.').pop().toUpperCase();
            showEditor(objectUrl, img.naturalWidth, img.naturalHeight, label);
        }
    } catch (e) {
        showToast('Ошибка: ' + (e.message || 'Не удалось обработать файл'), true);
        console.error('processFile error:', e);
        currentFile = null;
    }
}

function convertImage() {
    if (!sourceImage.src || !currentFile || isConverting) return;
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

    const img = new Image();
    img.onload = () => {
        // Белый фон для JPEG (убирает прозрачность)
        if (formatSelect.value === 'image/jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, targetWidth, targetHeight);
        }

        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        const mime = formatSelect.value;
        const quality = parseInt(qualityRange.value) / 100;
        const dataUrl = canvas.toDataURL(mime, quality);

        resultImage.src = dataUrl;

        const base64 = dataUrl.split(',')[1];
        const resultSize = Math.ceil((base64.length * 3) / 4);
        const ext = getExtension(mime).toUpperCase();
        resultInfo.textContent = `${targetWidth}×${targetHeight} пикс. • ${formatBytes(resultSize)}`;
        resultBadge.textContent = ext;

        isConverting = false;
    };
    img.onerror = () => {
        showToast('Ошибка при конвертации', true);
        isConverting = false;
    };
    img.src = sourceImage.src;
}

function updateConversion() {
    requestAnimationFrame(convertImage);
}

// --- Drag & Drop ---
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', (e) => {
    if (!dropZone.contains(e.relatedTarget)) {
        dropZone.classList.remove('dragover');
    }
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
});

fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) processFile(file);
    fileInput.value = ''; // сброс, чтобы можно было выбрать тот же файл снова
});

// --- Настройки конвертации ---
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

function updateAspect(value, isWidth) {
    if (!aspectLock.checked || !value) return;
    const ratio = originalWidth / originalHeight;
    if (isWidth) {
        heightInput.value = Math.round(parseInt(value) / ratio) || 1;
    } else {
        widthInput.value = Math.round(parseInt(value) * ratio) || 1;
    }
}

widthInput.addEventListener('input', () => updateAspect(widthInput.value, true));
heightInput.addEventListener('input', () => updateAspect(heightInput.value, false));

widthInput.addEventListener('change', updateConversion);
heightInput.addEventListener('change', updateConversion);

// --- Кнопки ---
resetBtn.addEventListener('click', () => {
    editor.style.display = 'none';
    dropZone.style.display = 'block';
    currentFile = null;
    isConverting = false;
    sourceImage.src = '';
    resultImage.src = '';
    sourceInfo.textContent = '';
    resultInfo.textContent = '';
    sourceBadge.textContent = '—';
    resultBadge.textContent = '—';
    resizeCheck.checked = false;
    resizeInputs.style.display = 'none';
    formatSelect.value = 'image/jpeg';
    qualityRange.value = 100;
    qualityValue.textContent = '100';
    qualityGroup.style.display = 'block';
});

downloadBtn.addEventListener('click', () => {
    if (!resultImage.src || resultImage.src === window.location.href) {
        showToast('Сначала загрузите изображение', true);
        return;
    }
    const link = document.createElement('a');
    const ext = getExtension(formatSelect.value);
    const baseName = currentFile.name.replace(/\.[^/.]+$/, '');
    link.download = `${baseName}_converted.${ext}`;
    link.href = resultImage.src;
    link.click();
    showToast('Скачивание началось');
});
