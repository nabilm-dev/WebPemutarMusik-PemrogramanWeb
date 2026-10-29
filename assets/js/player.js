
/* ===== RAMPHONY MUSIC PLAYER ===== */

const $ = s => document.querySelector(s);
const audio = $('#a');

let tracks = [];
let cur = -1;
let shuffle = false;
let repeat = 0;

/* ===== LAGU DEMO ===== */

function addDemo() {
    const demo = [
        {
            name: 'Rex Orange County - Best Friend',
            src: encodeURI('demolagu/Rex Orange County - Best Friend.mp3'),
            tag: 'Demo'
        },
        {
            name: 'Rex Orange County - Hannah Montana',
            src: encodeURI('demolagu/Rex Orange County - Hannah Montana.mp3'),
            tag: 'Demo'
        }
    ];

    // Jangan menambahkan demo yang sama berulang kali
    const existing = new Set(tracks.map(t => t.src));
    add(demo.filter(t => !existing.has(t.src)));
}

/* ===== PLAYLIST ===== */

function add(items) {
    if (!items.length) return;

    const first = tracks.length;
    tracks.push(...items);

    render();

    if (cur < 0) {
        load(first, false);
    }
}

function render() {
    const ul = $('#ul');

    $('#count').textContent = tracks.length
        ? `Daftar putar (${tracks.length})`
        : 'Daftar putar';

    ul.innerHTML = '';

    if (!tracks.length) {
        const li = document.createElement('li');
        li.className = 'empty';
        li.textContent = 'Belum ada lagu. Klik Tambah lagu atau Coba demo.';
        li.style.padding = '20px';
        li.style.color = '#aaa';
        ul.appendChild(li);
        return;
    }

    tracks.forEach((track, i) => {
        const li = document.createElement('li');

        if (i === cur) {
            li.classList.add('cur');
        }

        const button = document.createElement('button');

        const number = document.createElement('span');
        number.className = 'n';
        number.textContent =
            i === cur && !audio.paused ? '▶' : i + 1;

        const title = document.createElement('span');
        title.className = 't';
        title.textContent = track.name;

        const tag = document.createElement('span');
        tag.className = 's';
        tag.textContent = track.tag;

        button.append(number, title, tag);

        button.onclick = () => {
            if (i === cur) {
                toggle();
            } else {
                load(i, true);
            }
        };

        li.appendChild(button);
        ul.appendChild(li);
    });
}

/* ===== LOAD LAGU ===== */

function load(index, autoplay = false) {
    if (index < 0 || index >= tracks.length) return;

    cur = index;

    const track = tracks[index];

    audio.src = track.src;
    audio.load();

    $('#title').textContent = track.name;
    $('#bottom-title').textContent = track.name;

    $('#sub').textContent =
        track.tag === 'Demo'
            ? 'Lagu demo'
            : 'Dari perangkatmu';

    $('#ini').textContent =
        track.name.trim().charAt(0).toUpperCase() || '♪';

    document.title = track.name + ' - Ramphony';

    $('#cur').textContent = '0:00';
    $('#dur').textContent = '0:00';
    $('#bottom-cur').textContent = '0:00';
    $('#bottom-dur').textContent = '0:00';

    $('#seek').value = 0;
    $('#bottom-progress').style.width = '0%';

    render();

    if (autoplay) {
        audio.play().catch(err => {
            console.warn('Audio tidak dapat diputar:', err);
        });
    }
}

/* ===== PLAY / PAUSE ===== */

function toggle() {
    if (cur < 0) {
        if (tracks.length) {
            load(0, true);
        } else {
            $('#pick').click();
        }
        return;
    }

    if (audio.paused) {
        audio.play().catch(err => {
            console.warn('Gagal memutar audio:', err);
        });
    } else {
        audio.pause();
    }
}

/* ===== NEXT / PREVIOUS ===== */

function step(direction) {
    if (!tracks.length) return;

    let index;

    if (shuffle && tracks.length > 1) {
        do {
            index = Math.floor(Math.random() * tracks.length);
        } while (index === cur);
    } else {
        index = (cur + direction + tracks.length)
            % tracks.length;
    }

    load(index, true);
}

function previous() {
    if (audio.currentTime > 3) {
        audio.currentTime = 0;
    } else {
        step(-1);
    }
}

/* ===== SHUFFLE ===== */

function toggleShuffle() {
    shuffle = !shuffle;

    ['#shuf', '#mobile-shuf'].forEach(selector => {
        const btn = $(selector);
        btn.classList.toggle('act', shuffle);
        btn.setAttribute('aria-pressed', String(shuffle));
        btn.title = shuffle ? 'Acak: nyala' : 'Acak: mati';
    });
}

/* ===== REPEAT ===== */

function toggleRepeat() {
    // 0 = mati, 1 = semua, 2 = satu lagu
    repeat = (repeat + 1) % 3;

    const labels = ['Mati', 'Semua', 'Satu lagu'];

    ['#rep', '#mobile-rep'].forEach(selector => {
        const btn = $(selector);
        btn.classList.toggle('act', repeat > 0);
        btn.title = 'Ulangi: ' + labels[repeat];
        btn.setAttribute('aria-label', btn.title);
        btn.setAttribute('aria-pressed', String(repeat > 0));
    });
}

/* ===== HUBUNGKAN TOMBOL ===== */

// Desktop
$('#play').onclick = toggle;
$('#next').onclick = () => step(1);
$('#prev').onclick = previous;
$('#shuf').onclick = toggleShuffle;
$('#rep').onclick = toggleRepeat;

// Mobile
$('#mobile-play').onclick = toggle;
$('#mobile-next').onclick = () => step(1);
$('#mobile-prev').onclick = previous;
$('#mobile-shuf').onclick = toggleShuffle;
$('#mobile-rep').onclick = toggleRepeat;

/* ===== UPLOAD LAGU ===== */

$('#pick').onclick = () => $('#file').click();
$('#demo').onclick = addDemo;

$('#file').onchange = e => {
    addFiles(e.target.files);
    e.target.value = '';
};

function addFiles(files) {
    const items = [...files]
        .filter(file =>
            file.type.startsWith('audio/') ||
            /\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(file.name)
        )
        .map(file => ({
            name: file.name.replace(/\.[^.]+$/, ''),
            src: URL.createObjectURL(file),
            tag: 'Berkas'
        }));

    add(items);
}

/* ===== FORMAT WAKTU ===== */

function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '0:00';

    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);

    return minutes + ':' + String(secs).padStart(2, '0');
}

/* ===== SEEK BAR ===== */

const seek = $('#seek');

seek.oninput = () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
        audio.currentTime =
            (Number(seek.value) / 1000) * audio.duration;
    }
};

audio.ontimeupdate = () => {
    const current = audio.currentTime;
    const duration = audio.duration;

    $('#cur').textContent = formatTime(current);
    $('#bottom-cur').textContent = formatTime(current);

    if (Number.isFinite(duration) && duration > 0) {
        const percent = (current / duration) * 100;

        if (document.activeElement !== seek) {
            seek.value = (current / duration) * 1000;
        }

        $('#bottom-progress').style.width = percent + '%';
    }
};

audio.onloadedmetadata = () => {
    const duration = formatTime(audio.duration);

    $('#dur').textContent = duration;
    $('#bottom-dur').textContent = duration;
};

/* ===== VOLUME ===== */

const volume = $('#vol');

audio.volume = 0.8;

function updateVolume() {
    audio.volume = Number(volume.value) / 100;

    $('#volume-number').textContent = volume.value;
    $('#lcd-volume').textContent = volume.value;
}

volume.oninput = updateVolume;
updateVolume();

/* ===== PLAYBACK STATE ===== */

function updateState(playing) {
    const symbol = playing ? 'Ⅱ' : '▶';

    $('#play').textContent = symbol;
    $('#mobile-play').textContent = symbol;

    $('#lcd-play-state').textContent = symbol;

    $('#play').setAttribute(
        'aria-label',
        playing ? 'Jeda' : 'Putar'
    );

    $('#mobile-play').setAttribute(
        'aria-label',
        playing ? 'Jeda' : 'Putar'
    );

    $('#visualizer').classList.toggle('playing', playing);

    render();
}

audio.onplay = () => updateState(true);
audio.onpause = () => updateState(false);

audio.onended = () => {
    if (repeat === 2) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
    } else if (repeat === 1 || cur < tracks.length - 1) {
        step(1);
    } else {
        updateState(false);
    }
};

audio.onerror = () => {
    console.error('File audio gagal dimuat:', audio.src);
    updateState(false);
};

/* ===== KEYBOARD SHORTCUT ===== */

document.addEventListener('keydown', e => {
    const tag = e.target.tagName;

    if (
        tag === 'INPUT' ||
        tag === 'BUTTON' ||
        tag === 'TEXTAREA' ||
        e.target.isContentEditable
    ) return;

    if (e.code === 'Space') {
        e.preventDefault();
        toggle();
    }

    if (e.code === 'ArrowRight' && cur >= 0) {
        e.preventDefault();
        audio.currentTime = Math.min(
            audio.currentTime + 5,
            audio.duration || 0
        );
    }

    if (e.code === 'ArrowLeft' && cur >= 0) {
        e.preventDefault();
        audio.currentTime = Math.max(
            audio.currentTime - 5,
            0
        );
    }
});

/* ===== DRAG & DROP ===== */

document.addEventListener('dragover', e => {
    e.preventDefault();
    document.body.classList.add('drop');
});

document.addEventListener('dragleave', e => {
    if (!e.relatedTarget) {
        document.body.classList.remove('drop');
    }
});

document.addEventListener('drop', e => {
    e.preventDefault();

    document.body.classList.remove('drop');

    if (e.dataTransfer?.files?.length) {
        addFiles(e.dataTransfer.files);
    }
});

/* ===== INISIALISASI ===== */

render();
updateState(false);
