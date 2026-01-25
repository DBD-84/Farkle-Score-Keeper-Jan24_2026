// --- AUDIO & EFFECTS ---
const AudioCtx = new (window.AudioContext || window.webkitAudioContext)();
const playSfx = (type) => {
    if (AudioCtx.state === 'suspended') AudioCtx.resume();
    if (type === 'farkle') {
        const osc = AudioCtx.createOscillator(); const gain = AudioCtx.createGain();
        osc.connect(gain); gain.connect(AudioCtx.destination);
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, AudioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, AudioCtx.currentTime + 0.4);
        gain.gain.exponentialRampToValueAtTime(0.01, AudioCtx.currentTime + 0.4);
        osc.start(); osc.stop(AudioCtx.currentTime + 0.4);
        const container = document.querySelector('.container');
        container.classList.add('shake');
        setTimeout(() => container.classList.remove('shake'), 200);
    } else {
        [523, 659, 783].forEach((f, i) => {
            const o = AudioCtx.createOscillator(); const g = AudioCtx.createGain();
            o.connect(g); g.connect(AudioCtx.destination); o.frequency.value = f;
            g.gain.setValueAtTime(0, AudioCtx.currentTime + (i * 0.1));
            g.gain.linearRampToValueAtTime(0.1, AudioCtx.currentTime + (i * 0.1) + 0.05);
            g.gain.exponentialRampToValueAtTime(0.01, AudioCtx.currentTime + 0.6);
            o.start(AudioCtx.currentTime + (i * 0.1)); o.stop(AudioCtx.currentTime + 0.6);
        });
    }
};

// --- STATE ---
let players = [];
let currentPlayerIndex = 0;
let finalRound = false;
let highestScore = 0;
let gameHistory = [];
let lastEntryCoords = { playerIndex: -1, turnIndex: -1 };
let stats = { highestTurn: { score: 0, playerName: '' }, farkleCounts: {} };

const turnInput = document.getElementById('turn-score-input');

function init() {
    document.getElementById('add-player-btn').onclick = addPlayerInput;
    document.getElementById('start-game-btn').onclick = startGame;
    document.getElementById('submit-score-btn').onclick = submitScore;
    document.getElementById('farkle-btn').onclick = handleFarkle;
    document.getElementById('undo-btn').onclick = undo;
    document.getElementById('clear-input').onclick = () => turnInput.value = '';
    document.getElementById('new-game-btn').onclick = () => location.reload();
    document.querySelectorAll('.btn-quick[data-value]').forEach(btn => {
        btn.onclick = () => turnInput.value = (parseInt(turnInput.value) || 0) + parseInt(btn.dataset.value);
    });
    addPlayerInput();
}

function addPlayerInput() {
    const container = document.getElementById('player-inputs');
    const div = document.createElement('div');
    div.style.display = 'flex'; div.style.gap = '10px'; div.style.marginBottom = '10px';
    div.innerHTML = `<input type="text" placeholder="Player ${container.children.length + 1}">
                     <button class="btn btn-secondary" onclick="this.parentElement.remove(); updateStartBtn();">×</button>`;
    div.querySelector('input').oninput = updateStartBtn;
    container.appendChild(div);
    updateStartBtn();
}

function updateStartBtn() {
    const inputs = document.querySelectorAll('#player-inputs input');
    document.getElementById('start-game-btn').disabled = Array.from(inputs).filter(i => i.value.trim() !== "").length < 2;
}

function startGame() {
    players = Array.from(document.querySelectorAll('#player-inputs input'))
        .filter(i => i.value.trim() !== "").map(i => ({ name: i.value, score: 0, onBoard: false, turnScores: [], eliminated: false }));
    document.getElementById('setup-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
    updateUI();
}

function submitScore() {
    const val = parseInt(turnInput.value);
    if (isNaN(val) || val <= 0) return;
    const p = players[currentPlayerIndex];
    if (!p.onBoard && val < 500) { alert("Need 500+ to start!"); return; }

    save(); p.score += val; p.onBoard = true; p.turnScores.push(val);
    lastEntryCoords = { playerIndex: currentPlayerIndex, turnIndex: p.turnScores.length - 1 };
    if (val > stats.highestTurn.score) stats.highestTurn = { score: val, playerName: p.name };

    if (p.score >= 10000 && !finalRound) {
        finalRound = true; highestScore = p.score; playSfx('win'); alert("Final Round!");
    } else if (finalRound) {
        if (p.score > highestScore) highestScore = p.score; else p.eliminated = true;
    }
    checkEnd();
}

function handleFarkle() {
    save(); playSfx('farkle');
    const p = players[currentPlayerIndex]; p.turnScores.push(0);
    lastEntryCoords = { playerIndex: currentPlayerIndex, turnIndex: p.turnScores.length - 1 };
    stats.farkleCounts[p.name] = (stats.farkleCounts[p.name] || 0) + 1;
    if (finalRound) p.eliminated = true;
    checkEnd();
}

function checkEnd() {
    const active = players.filter(p => !p.eliminated);
    if (finalRound && active.length <= 1) {
        playSfx('win');
        const winner = active.length === 1 ? active[0] : players.reduce((a,b) => a.score > b.score ? a : b);
        let mf = { name: 'None', count: 0 };
        for (const [n, c] of Object.entries(stats.farkleCounts)) if (c > mf.count) mf = { name: n, count: c };
        document.getElementById('winner-text').innerHTML = `
            <span style="font-size:2rem; color:var(--warning)">🏆 ${winner.name}</span><br>Score: ${winner.score.toLocaleString()}
            <div class="stats-container">
                <div class="stat-item"><span>🚀 Biggest Turn</span><span>${stats.highestTurn.playerName} (${stats.highestTurn.score})</span></div>
                <div class="stat-item"><span>🧊 Most Farkles</span><span>${mf.name} (${mf.count})</span></div>
                <div class="stat-item"><span>⏱️ Rounds</span><span>${players[0].turnScores.length}</span></div>
            </div>`;
        document.getElementById('win-modal').classList.remove('hidden');
    } else {
        let n = (currentPlayerIndex + 1) % players.length;
        while (players[n].eliminated) n = (n + 1) % players.length;
        currentPlayerIndex = n; updateUI();
    }
}

function renderBoard() {
    let li = -1, ms = -1;
    players.forEach((p, i) => { if (p.score > ms && p.score > 0) { ms = p.score; li = i; } });
    let h = `<table class="score-table"><thead><tr><th>Turn</th>`;
    players.forEach((p, i) => {
        let cls = [i === currentPlayerIndex ? 'current-player-column current-player-header' : '', i === li ? 'leader-column' : '', p.eliminated ? 'eliminated' : ''];
        let chase = (finalRound && !p.eliminated) ? (i === li ? `<span class="chase-message" style="color:var(--success)">DEFENDING</span>` : `<span class="chase-message">Need ${(ms - p.score + 50).toLocaleString()}+</span>`) : '';
        h += `<th class="${cls.join(' ')}"><div class="player-header-name">${p.name}</div>${chase}</th>`;
    });
    h += `</tr></thead><tbody>`;
    const rows = Math.max(...players.map(p => p.turnScores.length), 1);
    for(let r=0; r<rows; r++) {
        h += `<tr><td class="row-label">T${r+1}</td>`;
        players.forEach((p, i) => {
            const s = p.turnScores[r] !== undefined ? p.turnScores[r] : '-';
            let c = [i === currentPlayerIndex ? 'current-player-column' : '', i === li ? 'leader-column' : '', p.eliminated ? 'eliminated' : ''];
            if (i === lastEntryCoords.playerIndex && r === lastEntryCoords.turnIndex) c.push(p.eliminated ? 'elimination-flash' : 'last-entry-pulse');
            h += `<td class="${c.join(' ')}">${s === 0 ? 'FARKLE' : s.toLocaleString()}</td>`;
        });
        h += `</tr>`;
    }
    h += `<tr class="total-row" style="font-weight:bold"><td>Total</td>`;
    players.forEach((p, i) => {
        let tc = [i === li ? 'leader-column' : '', p.eliminated ? 'eliminated' : '', i === currentPlayerIndex ? 'current-player-column' : ''];
        h += `<td class="${tc.join(' ')}">${p.score.toLocaleString()}</td>`;
    });
    h += `</tr></tbody></table>`;
    document.getElementById('scoreboard').innerHTML = h;
}

const save = () => gameHistory.push(JSON.stringify({ players, currentPlayerIndex, finalRound, highestScore, lastEntryCoords, stats }));
const undo = () => { if (!gameHistory.length) return; const s = JSON.parse(gameHistory.pop()); players = s.players; currentPlayerIndex = s.currentPlayerIndex; finalRound = s.finalRound; highestScore = s.highestScore; lastEntryCoords = s.lastEntryCoords; stats = s.stats; updateUI(); };
const updateUI = () => { document.getElementById('current-player-name').innerText = players[currentPlayerIndex].name; document.getElementById('undo-btn').disabled = !gameHistory.length; renderBoard(); turnInput.value = ''; turnInput.focus(); };

// Add this to your setupListeners/init function:
document.getElementById('rematch-btn').onclick = handleRematch;

function handleRematch() {
    // Reset all player data but keep the names
    players.forEach(p => {
        p.score = 0;
        p.onBoard = false;
        p.turnScores = [];
        p.eliminated = false;
    });

    // Reset game state
    currentPlayerIndex = 0;
    finalRound = false;
    highestScore = 0;
    gameHistory = [];
    lastEntryCoords = { playerIndex: -1, turnIndex: -1 };
    stats = { highestTurn: { score: 0, playerName: '' }, farkleCounts: {} };

    // Hide modal and refresh UI
    document.getElementById('win-modal').classList.add('hidden');
    updateUI();
}

init();
