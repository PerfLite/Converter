// ── DOM refs ──────────────────────────────────────────────────────────────────
const dropZone         = document.getElementById('dropZone');
const fileInput        = document.getElementById('fileInput');
const editor           = document.getElementById('editor');
const sourceImage      = document.getElementById('sourceImage');
const resultImage      = document.getElementById('resultImage');
const sourceInfo       = document.getElementById('sourceInfo');
const resultInfo       = document.getElementById('resultInfo');
const sourceBadge      = document.getElementById('sourceBadge');
const resultBadge      = document.getElementById('resultBadge');
const formatSelect     = document.getElementById('formatSelect');
const qualityRange     = document.getElementById('qualityRange');
const qualityValue     = document.getElementById('qualityValue');
const qualityGroup     = document.getElementById('qualityGroup');
const resizeCheck      = document.getElementById('resizeCheck');
const resizeInputs     = document.getElementById('resizeInputs');
const widthInput       = document.getElementById('widthInput');
const heightInput      = document.getElementById('heightInput');
const aspectLock       = document.getElementById('aspectLock');
const resetBtn         = document.getElementById('resetBtn');
const downloadBtn      = document.getElementById('downloadBtn');
const toast            = document.getElementById('toast');
const rotateLeftBtn    = document.getElementById('rotateLeftBtn');
const rotateRightBtn   = document.getElementById('rotateRightBtn');
const flipHBtn         = document.getElementById('flipHBtn');
const flipVBtn         = document.getElementById('flipVBtn');
const resetTransformBtn= document.getElementById('resetTransformBtn');
const transparencyWarn = document.getElementById('transparencyWarning');
const sourceDropTarget = document.getElementById('sourceDropTarget');
const batchSection     = document.getElementById('batchSection');
const batchList        = document.getElementById('batchList');
const batchTitle       = document.getElementById('batchTitle');
const addMoreBtn       = document.getElementById('addMoreBtn');
const downloadAllBtn   = document.getElementById('downloadAllBtn');
const historySection   = document.getElementById('historySection');
const historyList      = document.getElementById('historyList');
const clearHistoryBtn  = document.getElementById('clearHistoryBtn');

// ── State ─────────────────────────────────────────────────────────────────────
let currentFile    = null;
let originalWidth  = 0;
let originalHeight = 0;
let isConverting   = false;
let rotation       = 0;   // 0 | 90 | 180 | 270
let flipH          = false;
let flipV          = false;
let sourceHasAlpha = false;

// Batch: [{ file, dataUrl, width, height, label }]
let batchFiles = [];

// History: [{ name, srcDataUrl, resultDataUrl, label, size }]
let history = [];

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(message, isError = false) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatBytes(bytes) {
    if (bytes === 0) return '0 Б';
    const k = 1024;
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getExtension(mime) {
    return { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[mime] || 'bin';
}

function isPsdFile(file) {
    return file.name.toLowerCase().endsWith('.psd');
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload  = () => resolve(img);
        img.onerror = () => reject(new Error('Не удалось загрузить изображение'));
        img.src = src;
    });
}

// Detect alpha channel in image
function imageHasAlpha(img) {
    const c = document.createElement('canvas');
    const size = Math.min(img.naturalWidth, img.naturalHeight, 64);
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 255) return true;
    }
    return false;
}

function sizeDiff(original, result) {
    if (!original || !result) return '';
    const diff = Math.round((result - original) / original * 100);
    if (diff === 0) return '';
    const sign = diff > 0 ? '+' : '';
    const cls  = diff > 0 ? 'size-up' : 'size-down';
    return ` <span class="${cls}">${sign}${diff}%</span>`;
}

// ── PSD parser ────────────────────────────────────────────────────────────────
async function parsePsd(file) {
    if (typeof agPsd === 'undefined') {
        throw new Error('Библиотека ag-psd не загружена. Проверьте подключение к интернету.');
    }
    agPsd.initializeCanvas((w, h) => {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        return c;
    });
    const psd = agPsd.readPsd(await file.arrayBuffer());
    if (!psd.canvas) {
        throw new Error('PSD не содержит данных изображения. Включите "Maximize Compatibility" при сохранении.');
    }
    return { dataUrl: psd.canvas.toDataURL('image/png'), width: psd.width, height: psd.height };
}

// ── Process single file ───────────────────────────────────────────────────────
async function processFile(file) {
    const isPsd = isPsdFile(file);
    if (!file.type.startsWith('image/') && !isPsd) {
        showToast('Пожалуйста, выберите файл изображения', true);
        return null;
    }
    if (file.size > 50 * 1024 * 1024) {
        showToast('Файл слишком большой (макс. 50 МБ)', true);
        return null;
    }
    try {
        if (isPsd) {
            const { dataUrl, width, height } = await parsePsd(file);
            return { file, dataUrl, width, height, label: 'PSD' };
        } else {
            const objectUrl = URL.createObjectURL(file);
            const img = await loadImage(objectUrl);
            const label = (file.type.replace('image/', '') || file.name.split('.').pop()).toUpperCase();
            return { file, dataUrl: objectUrl, width: img.naturalWidth, height: img.naturalHeight, label };
        }
    } catch (e) {
        showToast('Ошибка: ' + (e.message || 'Не удалось обработать файл'), true);
        console.error(e);
        return null;
    }
}

// ── Single-image editor ───────────────────────────────────────────────────────
function showEditor(entry) {
    currentFile   = entry.file;
    originalWidth = entry.width;
    originalHeight= entry.height;
    rotation = 0; flipH = false; flipV = false;

    sourceImage.src = entry.dataUrl;
    sourceBadge.textContent = entry.label;
    sourceInfo.textContent  = `${entry.width}×${entry.height} пикс. • ${formatBytes(entry.file.size)}`;

    widthInput.value  = entry.width;
    heightInput.value = entry.height;

    dropZone.style.display = 'none';
    editor.style.display   = 'block';

    // Check alpha for transparency warning
    loadImage(entry.dataUrl).then(img => {
        sourceHasAlpha = imageHasAlpha(img);
        updateTransparencyWarning();
    });

    updateConversion();
}

function updateTransparencyWarning() {
    const show = sourceHasAlpha && formatSelect.value === 'image/jpeg';
    transparencyWarn.style.display = show ? 'flex' : 'none';
}

// ── Conversion ────────────────────────────────────────────────────────────────
function buildCanvas(srcDataUrl, targetW, targetH, mime, rot, fH, fV) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const rotated = rot === 90 || rot === 270;
            const cw = rotated ? targetH : targetW;
            const ch = rotated ? targetW : targetH;

            const canvas = document.createElement('canvas');
            canvas.width  = cw;
            canvas.height = ch;
            const ctx = canvas.getContext('2d');

            if (mime === 'image/jpeg') {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, cw, ch);
            }

            ctx.save();
            ctx.translate(cw / 2, ch / 2);
            ctx.rotate(rot * Math.PI / 180);
            ctx.scale(fH ? -1 : 1, fV ? -1 : 1);
            ctx.drawImage(img, -targetW / 2, -targetH / 2, targetW, targetH);
            ctx.restore();

            resolve(canvas);
        };
        img.onerror = reject;
        img.src = srcDataUrl;
    });
}

async function convertImage() {
    if (!sourceImage.src || !currentFile || isConverting) return;
    isConverting = true;

    let targetW = originalWidth;
    let targetH = originalHeight;
    if (resizeCheck.checked) {
        targetW = parseInt(widthInput.value)  || originalWidth;
        targetH = parseInt(heightInput.value) || originalHeight;
    }

    const mime    = formatSelect.value;
    const quality = parseInt(qualityRange.value) / 100;

    try {
        const canvas  = await buildCanvas(sourceImage.src, targetW, targetH, mime, rotation, flipH, flipV);
        const dataUrl = canvas.toDataURL(mime, quality);

        resultImage.src = dataUrl;

        const base64      = dataUrl.split(',')[1];
        const resultSize  = Math.ceil((base64.length * 3) / 4);
        const ext         = getExtension(mime).toUpperCase();
        const diff        = sizeDiff(currentFile.size, resultSize);

        resultInfo.innerHTML = `${canvas.width}×${canvas.height} пикс. • ${formatBytes(resultSize)}${diff}`;
        resultBadge.textContent = ext;
    } catch (e) {
        showToast('Ошибка при конвертации', true);
    }

    isConverting = false;
}

function updateConversion() {
    requestAnimationFrame(convertImage);
}

// ── Transform controls ────────────────────────────────────────────────────────
rotateLeftBtn.addEventListener('click', () => {
    rotation = (rotation - 90 + 360) % 360;
    swapDimensionsIfNeeded();
    updateConversion();
});
rotateRightBtn.addEventListener('click', () => {
    rotation = (rotation + 90) % 360;
    swapDimensionsIfNeeded();
    updateConversion();
});
flipHBtn.addEventListener('click', () => { flipH = !flipH; updateConversion(); });
flipVBtn.addEventListener('click', () => { flipV = !flipV; updateConversion(); });
resetTransformBtn.addEventListener('click', () => {
    rotation = 0; flipH = false; flipV = false;
    widthInput.value  = originalWidth;
    heightInput.value = originalHeight;
    updateConversion();
});

function swapDimensionsIfNeeded() {
    if (!resizeCheck.checked) return;
    const rotated = rotation === 90 || rotation === 270;
    widthInput.value  = rotated ? originalHeight : originalWidth;
    heightInput.value = rotated ? originalWidth  : originalHeight;
}

// ── Batch processing ──────────────────────────────────────────────────────────
function renderBatchList() {
    batchTitle.textContent = `${batchFiles.length} файл${pluralRu(batchFiles.length)}`;
    batchList.innerHTML = '';

    batchFiles.forEach((entry, i) => {
        const row = document.createElement('div');
        row.className = 'batch-row';
        row.innerHTML = `
            <img class="batch-thumb" src="${entry.dataUrl}" alt="">
            <div class="batch-info">
                <span class="batch-name">${entry.file.name}</span>
                <span class="batch-meta">${entry.width}×${entry.height} • ${formatBytes(entry.file.size)} • ${entry.label}</span>
            </div>
            <button class="batch-open btn btn-sm btn-secondary" data-i="${i}">Открыть</button>
            <button class="batch-remove tool-btn" data-i="${i}" title="Удалить">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>`;
        batchList.appendChild(row);
    });

    batchList.querySelectorAll('.batch-open').forEach(btn => {
        btn.addEventListener('click', () => {
            const entry = batchFiles[+btn.dataset.i];
            batchSection.style.display = 'none';
            showEditor(entry);
        });
    });
    batchList.querySelectorAll('.batch-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            batchFiles.splice(+btn.dataset.i, 1);
            if (batchFiles.length === 0) {
                batchSection.style.display = 'none';
                dropZone.style.display = 'block';
            } else {
                renderBatchList();
            }
        });
    });
}

function pluralRu(n) {
    if (n % 10 === 1 && n % 100 !== 11) return '';
    if ([2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100)) return 'а';
    return 'ов';
}

async function handleFiles(files) {
    if (files.length === 0) return;

    if (files.length === 1 && batchFiles.length === 0) {
        showToast('Загрузка...');
        const entry = await processFile(files[0]);
        if (entry) showEditor(entry);
        return;
    }

    showToast('Загрузка файлов...');
    const results = await Promise.all(Array.from(files).map(processFile));
    const valid = results.filter(Boolean);
    if (!valid.length) return;

    batchFiles.push(...valid);
    dropZone.style.display   = 'none';
    editor.style.display     = 'none';
    batchSection.style.display = 'block';
    renderBatchList();
    showToast(`Загружено ${valid.length} файл${pluralRu(valid.length)}`);
}

addMoreBtn.addEventListener('click', () => fileInput.click());

downloadAllBtn.addEventListener('click', async () => {
    if (!batchFiles.length) return;
    if (typeof JSZip === 'undefined') {
        showToast('JSZip не загружен', true);
        return;
    }

    showToast('Создание ZIP...');
    const mime    = formatSelect.value;
    const quality = parseInt(qualityRange.value) / 100;
    const ext     = getExtension(mime);
    const zip     = new JSZip();

    for (const entry of batchFiles) {
        const canvas  = await buildCanvas(entry.dataUrl, entry.width, entry.height, mime, rotation, flipH, flipV);
        const dataUrl = canvas.toDataURL(mime, quality);
        const base64  = dataUrl.split(',')[1];
        const name    = entry.file.name.replace(/\.[^/.]+$/, '') + '_converted.' + ext;
        zip.file(name, base64, { base64: true });
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href     = URL.createObjectURL(blob);
    link.download = 'converted_images.zip';
    link.click();
    showToast('ZIP скачан');
});

// ── History ───────────────────────────────────────────────────────────────────
function addToHistory(entry, resultDataUrl, resultSize) {
    history.unshift({ name: entry.file.name, srcDataUrl: entry.dataUrl, resultDataUrl, label: entry.label, size: resultSize });
    if (history.length > 5) history.pop();
    renderHistory();
}

function renderHistory() {
    if (!history.length) { historySection.style.display = 'none'; return; }
    historySection.style.display = 'block';
    historyList.innerHTML = '';
    history.forEach((h, i) => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
            <img class="history-thumb" src="${h.resultDataUrl}" alt="">
            <div class="history-info">
                <span class="history-name">${h.name}</span>
                <span class="history-meta">${h.label} • ${formatBytes(h.size)}</span>
            </div>
            <a class="btn btn-sm btn-secondary" href="${h.resultDataUrl}" download="${h.name.replace(/\.[^/.]+$/, '')}_converted">Скачать</a>`;
        historyList.appendChild(item);
    });
}

clearHistoryBtn.addEventListener('click', () => {
    history = [];
    renderHistory();
});

// ── Drop on source preview (replace image) ────────────────────────────────────
sourceDropTarget.addEventListener('dragover', (e) => {
    e.preventDefault();
    sourceDropTarget.classList.add('drop-active');
});
sourceDropTarget.addEventListener('dragleave', (e) => {
    if (!sourceDropTarget.contains(e.relatedTarget))
        sourceDropTarget.classList.remove('drop-active');
});
sourceDropTarget.addEventListener('drop', async (e) => {
    e.preventDefault();
    sourceDropTarget.classList.remove('drop-active');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    showToast('Загрузка...');
    const entry = await processFile(file);
    if (entry) showEditor(entry);
});

// ── Upload zone events ────────────────────────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', (e) => { if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('dragover'); });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', () => {
    handleFiles(fileInput.files);
    fileInput.value = '';
});

// ── Controls ──────────────────────────────────────────────────────────────────
formatSelect.addEventListener('change', () => {
    qualityGroup.style.display = formatSelect.value === 'image/png' ? 'none' : 'block';
    updateTransparencyWarning();
    updateConversion();
});
qualityRange.addEventListener('input', () => {
    qualityValue.textContent = qualityRange.value;
    updateConversion();
});
resizeCheck.addEventListener('change', () => {
    resizeInputs.style.display = resizeCheck.checked ? 'grid' : 'none';
    if (resizeCheck.checked) {
        widthInput.value  = originalWidth;
        heightInput.value = originalHeight;
    }
    updateConversion();
});

function updateAspect(value, isWidth) {
    if (!aspectLock.checked || !value) return;
    const ratio = originalWidth / originalHeight;
    if (isWidth) heightInput.value = Math.round(parseInt(value) / ratio) || 1;
    else         widthInput.value  = Math.round(parseInt(value) * ratio) || 1;
}
widthInput.addEventListener('input',  () => updateAspect(widthInput.value, true));
heightInput.addEventListener('input', () => updateAspect(heightInput.value, false));
widthInput.addEventListener('change',  updateConversion);
heightInput.addEventListener('change', updateConversion);

// ── Buttons ───────────────────────────────────────────────────────────────────
function fullReset() {
    editor.style.display       = 'none';
    batchSection.style.display = 'none';
    dropZone.style.display     = 'block';
    currentFile = null; isConverting = false;
    batchFiles  = [];
    rotation = 0; flipH = false; flipV = false; sourceHasAlpha = false;
    sourceImage.src = ''; resultImage.src = '';
    sourceInfo.textContent = ''; resultInfo.textContent = '';
    sourceBadge.textContent = '—'; resultBadge.textContent = '—';
    resizeCheck.checked = false;
    resizeInputs.style.display = 'none';
    formatSelect.value = 'image/jpeg';
    qualityRange.value = 100; qualityValue.textContent = '100';
    qualityGroup.style.display = 'block';
    transparencyWarn.style.display = 'none';
}

resetBtn.addEventListener('click', fullReset);

downloadBtn.addEventListener('click', async () => {
    if (!resultImage.src || resultImage.src === window.location.href) {
        showToast('Сначала загрузите изображение', true);
        return;
    }
    const link    = document.createElement('a');
    const ext     = getExtension(formatSelect.value);
    const baseName= currentFile.name.replace(/\.[^/.]+$/, '');
    link.download = `${baseName}_converted.${ext}`;
    link.href     = resultImage.src;
    link.click();
    showToast('Скачивание началось');

    // Save to history
    const base64     = resultImage.src.split(',')[1];
    const resultSize = Math.ceil((base64.length * 3) / 4);
    addToHistory({ file: currentFile, dataUrl: sourceImage.src, label: sourceBadge.textContent }, resultImage.src, resultSize);
});

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
    // Работаем только когда редактор видим
    if (!currentFile) return;

    const tag = document.activeElement.tagName;
    // Не перехватываем когда фокус в поле ввода
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    if (e.key === 'Escape') { e.preventDefault(); fullReset(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        downloadBtn.click();
        return;
    }
    if (e.key === 'r' || e.key === 'R') { e.preventDefault(); rotateRightBtn.click(); return; }
    if (e.key === 'h' || e.key === 'H') { e.preventDefault(); flipHBtn.click(); return; }
    if (e.key === 'v' || e.key === 'V') { e.preventDefault(); flipVBtn.click(); return; }
});
