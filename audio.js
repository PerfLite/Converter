// ── DOM refs ──────────────────────────────────────────────────────────────────
const dropZone      = document.getElementById('dropZone');
const fileInput     = document.getElementById('fileInput');
const editor        = document.getElementById('editor');
const audioFiles    = document.getElementById('audioFiles');
const formatSelect  = document.getElementById('formatSelect');
const bitrateRange  = document.getElementById('bitrateRange');
const bitrateValue  = document.getElementById('bitrateValue');
const bitrateGroup  = document.getElementById('bitrateGroup');
const channelsSelect= document.getElementById('channelsSelect');
const resetBtn      = document.getElementById('resetBtn');
const convertBtn    = document.getElementById('convertBtn');
const toast         = document.getElementById('toast');

// ── State ─────────────────────────────────────────────────────────────────────
let files = [];   // [{ file, name, duration, size, status, resultUrl, resultName }]

const BITRATES = [64, 96, 128, 192, 256, 320];

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, isError = false) {
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.classList.toggle('error', isError);
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatBytes(bytes) {
    if (!bytes) return '—';
    const k = 1024, sizes = ['Б','КБ','МБ','ГБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDuration(sec) {
    if (!sec || isNaN(sec)) return '—';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function getAudioDuration(file) {
    return new Promise(resolve => {
        const url = URL.createObjectURL(file);
        const audio = new Audio();
        audio.onloadedmetadata = () => { resolve(audio.duration); URL.revokeObjectURL(url); };
        audio.onerror = () => resolve(null);
        audio.src = url;
    });
}

// ── File list render ──────────────────────────────────────────────────────────
function renderFiles() {
    audioFiles.innerHTML = '';
    files.forEach((entry, i) => {
        const row = document.createElement('div');
        row.className = 'audio-row';
        row.id = `row-${i}`;

        let statusHtml = '';
        if (entry.status === 'converting') {
            statusHtml = `<div class="audio-progress"><div class="audio-progress-bar" id="bar-${i}"></div></div>`;
        } else if (entry.status === 'done') {
            statusHtml = `
                <a class="btn btn-sm btn-primary" href="${entry.resultUrl}" download="${entry.resultName}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Скачать
                </a>`;
        } else if (entry.status === 'error') {
            statusHtml = `<span class="audio-error">Ошибка</span>`;
        } else {
            statusHtml = `<span class="audio-pending">Ожидание</span>`;
        }

        row.innerHTML = `
            <div class="audio-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="22" height="22" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                </svg>
            </div>
            <div class="audio-info">
                <span class="audio-name">${entry.name}</span>
                <span class="audio-meta">${formatBytes(entry.file.size)} · ${formatDuration(entry.duration)}</span>
            </div>
            <div class="audio-status" id="status-${i}">${statusHtml}</div>
            <button class="tool-btn audio-remove" data-i="${i}" title="Удалить">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>`;

        audioFiles.appendChild(row);
    });

    audioFiles.querySelectorAll('.audio-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            files.splice(+btn.dataset.i, 1);
            if (!files.length) fullReset();
            else renderFiles();
        });
    });
}

function updateStatus(i, status, extra = {}) {
    files[i] = { ...files[i], status, ...extra };
    const cell = document.getElementById(`status-${i}`);
    if (!cell) return;

    if (status === 'converting') {
        cell.innerHTML = `<div class="audio-progress"><div class="audio-progress-bar" id="bar-${i}" style="width:0%"></div></div>`;
    } else if (status === 'done') {
        cell.innerHTML = `
            <a class="btn btn-sm btn-primary" href="${extra.resultUrl}" download="${extra.resultName}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Скачать
            </a>`;
    } else if (status === 'error') {
        cell.innerHTML = `<span class="audio-error">${extra.message || 'Ошибка'}</span>`;
    }
}

function setProgress(i, pct) {
    const bar = document.getElementById(`bar-${i}`);
    if (bar) bar.style.width = pct + '%';
}

// ── Load files ────────────────────────────────────────────────────────────────
async function loadFiles(fileList) {
    const valid = Array.from(fileList).filter(f => {
        if (f.size > 200 * 1024 * 1024) { showToast(`${f.name}: слишком большой (макс. 200 МБ)`, true); return false; }
        return true;
    });
    if (!valid.length) return;

    const entries = await Promise.all(valid.map(async f => ({
        file: f,
        name: f.name,
        duration: await getAudioDuration(f),
        status: 'pending',
        resultUrl: null,
        resultName: null
    })));

    files.push(...entries);
    dropZone.style.display = 'none';
    editor.style.display   = 'block';
    renderFiles();
}

// ── Decode audio via Web Audio API ────────────────────────────────────────────
async function decodeAudio(file) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = await file.arrayBuffer();
    const decoded = await ctx.decodeAudioData(buf);
    await ctx.close();
    return decoded;
}

// ── Encode to WAV ─────────────────────────────────────────────────────────────
function encodeWav(audioBuffer, numChannels) {
    const ch      = numChannels || audioBuffer.numberOfChannels;
    const sr      = audioBuffer.sampleRate;
    const samples = audioBuffer.length;
    const bitsPerSample = 16;
    const byteRate = sr * ch * bitsPerSample / 8;
    const blockAlign = ch * bitsPerSample / 8;
    const dataSize = samples * ch * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view   = new DataView(buffer);

    function writeStr(off, str) { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); }
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, ch, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let s = 0; s < samples; s++) {
        for (let c = 0; c < ch; c++) {
            const srcCh = c < audioBuffer.numberOfChannels ? c : 0;
            const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(srcCh)[s]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }
    }
    return buffer;
}

// ── Encode to MP3 via lamejs ──────────────────────────────────────────────────
function encodeMp3(audioBuffer, numChannels, kbps, onProgress) {
    return new Promise((resolve, reject) => {
        if (typeof lamejs === 'undefined') {
            reject(new Error('lamejs не загружен'));
            return;
        }
        const ch      = numChannels || Math.min(audioBuffer.numberOfChannels, 2);
        const sr      = audioBuffer.sampleRate;
        const samples = audioBuffer.length;
        const encoder = new lamejs.Mp3Encoder(ch, sr, kbps);
        const blockSize = 1152;
        const mp3Data  = [];

        // Получаем PCM данные (Int16)
        function floatToInt16(floatArr) {
            const int16 = new Int16Array(floatArr.length);
            for (let i = 0; i < floatArr.length; i++) {
                int16[i] = Math.max(-32768, Math.min(32767, floatArr[i] * 32767));
            }
            return int16;
        }

        const leftFloat  = audioBuffer.getChannelData(0);
        const rightFloat = ch === 2 && audioBuffer.numberOfChannels > 1
            ? audioBuffer.getChannelData(1)
            : leftFloat;

        let processed = 0;
        function processChunk() {
            const end = Math.min(processed + blockSize, samples);
            const leftChunk  = floatToInt16(leftFloat.subarray(processed, end));
            const rightChunk = floatToInt16(rightFloat.subarray(processed, end));

            const encoded = ch === 2
                ? encoder.encodeBuffer(leftChunk, rightChunk)
                : encoder.encodeBuffer(leftChunk);

            if (encoded.length > 0) mp3Data.push(new Int8Array(encoded));
            processed = end;
            onProgress(Math.round(processed / samples * 90));

            if (processed < samples) {
                setTimeout(processChunk, 0);
            } else {
                const final = encoder.flush();
                if (final.length > 0) mp3Data.push(new Int8Array(final));
                onProgress(100);
                resolve(new Blob(mp3Data, { type: 'audio/mp3' }));
            }
        }
        processChunk();
    });
}

// ── Encode via MediaRecorder (OGG/WebM) ───────────────────────────────────────
function encodeMediaRecorder(audioBuffer, numChannels, mimeType) {
    return new Promise((resolve, reject) => {
        const ch  = numChannels || audioBuffer.numberOfChannels;
        const sr  = audioBuffer.sampleRate;
        const ctx = new OfflineAudioContext(ch, audioBuffer.length, sr);

        // Создаём новый буфер с нужным числом каналов
        const newBuf = ctx.createBuffer(ch, audioBuffer.length, sr);
        for (let c = 0; c < ch; c++) {
            const srcCh = c < audioBuffer.numberOfChannels ? c : 0;
            newBuf.copyToChannel(audioBuffer.getChannelData(srcCh), c);
        }

        const source = ctx.createBufferSource();
        source.buffer = newBuf;
        source.connect(ctx.destination);
        source.start();

        ctx.startRendering().then(rendered => {
            // Воспроизводим через AudioContext + MediaRecorder
            const playCtx = new AudioContext({ sampleRate: sr });
            const dest    = playCtx.createMediaStreamDestination();
            const src2    = playCtx.createBufferSource();
            src2.buffer   = rendered;
            src2.connect(dest);

            const recorder = new MediaRecorder(dest.stream, { mimeType });
            const chunks   = [];
            recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
            recorder.onstop = () => {
                playCtx.close();
                resolve(new Blob(chunks, { type: mimeType }));
            };
            recorder.onerror = e => { playCtx.close(); reject(e.error); };

            recorder.start();
            src2.start();
            src2.onended = () => recorder.stop();
        }).catch(reject);
    });
}

// ── Main convert ──────────────────────────────────────────────────────────────
async function convertFile(i) {
    const entry  = files[i];
    const fmt    = formatSelect.value;
    const kbps   = BITRATES[parseInt(bitrateRange.value)];
    const chMode = parseInt(channelsSelect.value);

    updateStatus(i, 'converting');
    setProgress(i, 5);

    try {
        const audioBuffer = await decodeAudio(entry.file);
        const numChannels = chMode > 0 ? chMode : audioBuffer.numberOfChannels;
        setProgress(i, 20);

        let blob, ext, mime;

        if (fmt === 'mp3') {
            blob = await encodeMp3(audioBuffer, numChannels, kbps, pct => setProgress(i, 20 + pct * 0.8));
            ext  = 'mp3'; mime = 'audio/mp3';
        } else if (fmt === 'wav') {
            const wavBuf = encodeWav(audioBuffer, numChannels);
            blob = new Blob([wavBuf], { type: 'audio/wav' });
            ext  = 'wav'; mime = 'audio/wav';
            setProgress(i, 100);
        } else if (fmt === 'ogg') {
            const supported = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
                ? 'audio/ogg;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/ogg') ? 'audio/ogg' : null;
            if (!supported) throw new Error('OGG не поддерживается вашим браузером. Попробуйте WAV или WebM.');
            blob = await encodeMediaRecorder(audioBuffer, numChannels, supported);
            ext  = 'ogg'; mime = 'audio/ogg';
            setProgress(i, 100);
        } else if (fmt === 'webm') {
            const supported = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : null;
            if (!supported) throw new Error('WebM не поддерживается вашим браузером. Попробуйте WAV.');
            blob = await encodeMediaRecorder(audioBuffer, numChannels, supported);
            ext  = 'webm'; mime = 'audio/webm';
            setProgress(i, 100);
        }

        const resultUrl  = URL.createObjectURL(blob);
        const resultName = entry.name.replace(/\.[^/.]+$/, '') + '_converted.' + ext;
        updateStatus(i, 'done', { resultUrl, resultName });

    } catch (e) {
        console.error(e);
        updateStatus(i, 'error', { message: e.message || 'Ошибка конвертации' });
    }
}

async function convertAll() {
    convertBtn.disabled = true;
    convertBtn.textContent = 'Конвертация...';

    for (let i = 0; i < files.length; i++) {
        if (files[i].status !== 'done') {
            await convertFile(i);
        }
    }

    convertBtn.disabled = false;
    convertBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Конвертировать`;
    showToast('Готово!');
}

// ── Controls ──────────────────────────────────────────────────────────────────
formatSelect.addEventListener('change', () => {
    bitrateGroup.style.display = formatSelect.value === 'mp3' ? 'block' : 'none';
});

bitrateRange.addEventListener('input', () => {
    bitrateValue.textContent = BITRATES[parseInt(bitrateRange.value)];
});

// ── Upload ────────────────────────────────────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', e => { if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('dragover'); });
dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    loadFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', () => { loadFiles(fileInput.files); fileInput.value = ''; });

// ── Buttons ───────────────────────────────────────────────────────────────────
convertBtn.addEventListener('click', convertAll);

function fullReset() {
    files = [];
    editor.style.display   = 'none';
    dropZone.style.display = 'block';
    audioFiles.innerHTML   = '';
    convertBtn.disabled    = false;
}
resetBtn.addEventListener('click', fullReset);

// ── Keyboard ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (!files.length) return;
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === 'Escape') { e.preventDefault(); fullReset(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); convertAll(); }
});
