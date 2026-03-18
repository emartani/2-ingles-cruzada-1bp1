/* Crossword Kids – Rounds (EN words, PT clues)
   - Rodadas: Toys, Colors, Classroom Objects
   - Primeira letra travada e visível
   - Pistas com chip de cor (colors) e miniatura (classroom)
   - Seleção aleatória de ~8 palavras por rodada
   - Verificar: apenas células preenchidas são avaliadas
   - Recorte do tabuleiro sem margem extra (sem “quadrados sobrando”)
*/

const state = {
  data: null,        // rounds do JSON
  roundIndex: 0,     // 0=toys, 1=colors, 2=classroom
  grid: [],
  rows: 15,
  cols: 15,
  placed: [],
  activeIndex: null,
  score: 0,
  solved: new Set(),
  total: 0,
  usedBounds: { minR: Infinity, maxR: -Infinity, minC: Infinity, maxC: -Infinity },
};

// alvo de palavras por rodada
const WORDS_PER_ROUND = 8;

// --- Helpers de limites/ocupação ---
function inBounds(r, c){
  return r >= 0 && r < state.rows && c >= 0 && c < state.cols;
}
function isEmptyCell(r, c){
  // considera fora do tabuleiro como "vazio" para fins de regra
  return !inBounds(r, c) || state.grid[r][c] === null;
}


// util: embaralhar
function shuffle(arr){
  const a = [...arr];
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const el = {
  board: document.getElementById('board'),
  score: document.getElementById('score'),
  doneCount: document.getElementById('doneCount'),
  totalCount: document.getElementById('totalCount'),
  cluesList: document.getElementById('cluesList'),
  title: document.getElementById('puzzleTitle'),
  hintBtn: document.getElementById('hintBtn'),
  checkBtn: document.getElementById('checkBtn'),
  resetBtn: document.getElementById('resetBtn'),
  confetti: document.getElementById('confetti'),
  roundSelect: document.getElementById('roundSelect'),
  prevRound: document.getElementById('prevRound'),
  nextRound: document.getElementById('nextRound'),
  reloadRound: document.getElementById('reloadRound'),
};

const DIR = {ACROSS:'across', DOWN:'down'};

function norm(s){
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^A-Za-z]/g,'')
    .toUpperCase();
}

async function loadAll(){
  const res = await fetch('rounds-data.json');
  state.data = await res.json();
  const idx = Number(el.roundSelect?.value ?? 0);
  await initRound(idx);
  attachRoundHandlers();
}

async function initRound(index){
  state.roundIndex = Math.max(0, Math.min(index, state.data.rounds.length-1));
  const round = state.data.rounds[state.roundIndex];

  // reset de estado por rodada
  state.grid = [];
  state.placed = [];
  state.activeIndex = null;
  state.score = 0;
  state.solved = new Set();
  state.usedBounds = { minR: Infinity, maxR: -Infinity, minC: Infinity, maxC: -Infinity };

  el.score.textContent = 0;
  el.doneCount.textContent = 0;

  // pool de palavras (mantém metadados de cor/imagem)
  const pool = round.words.map(w => ({
    id: w.id,
    word: w.word,          // EN
    norm: norm(w.word),
    clue: w.clue,          // PT
    color: w.color || null,
    image: w.image || null
  }));

  // ➊ sorteia ~8 (ou o máximo disponível)
  const selected = shuffle(pool).slice(0, Math.min(WORDS_PER_ROUND, pool.length));

  // ➋ maiores primeiro (facilita cruzamentos)
  const words = selected.sort((a,b)=> b.norm.length - a.norm.length);

  state.total = words.length;
  el.totalCount.textContent = state.total;
  el.title.textContent = round.title || `Rodada ${state.roundIndex+1}`;

  // grade base (pode crescer dinamicamente)
  buildGrid(15, 15);
  placeWords(words);
  renderBoard();
  renderClues();
  attachBoardHandlers();
}

function buildGrid(r,c){
  state.rows = r; state.cols = c;
  state.grid = Array.from({length:r}, ()=> Array.from({length:c}, ()=> null));
}

function setBounds(r,c){
  const b = state.usedBounds;
  b.minR = Math.min(b.minR, r);
  b.maxR = Math.max(b.maxR, r);
  b.minC = Math.min(b.minC, c);
  b.maxC = Math.max(b.maxC, c);
}

function canPlaceAt(row, col, dir, word){
  const L = word.length;

  if(dir === DIR.ACROSS){
    // 1) cabe no tabuleiro?
    if(col < 0 || col + L > state.cols || row < 0 || row >= state.rows) return false;

    // 2) extremidades não podem "tocar" outra letra
    //    (célula imediatamente antes e depois da palavra)
    if(!isEmptyCell(row, col - 1)) return false;
    if(!isEmptyCell(row, col + L)) return false;

    // 3) varrer cada posição
    for(let i = 0; i < L; i++){
      const r = row, c = col + i;
      const at = state.grid[r][c];

      // 3a) conflito de letra?
      if(at && at.char !== word[i]) return false;

      // 3b) regra de "no-touch" lateral (acima/abaixo) para letras novas
      //     (se é cruzamento real — já existe célula aqui — não aplicamos veto)
      if(!at){
        if(!isEmptyCell(r - 1, c)) return false; // acima vazio
        if(!isEmptyCell(r + 1, c)) return false; // abaixo vazio
      }

      // 3c) opcional: impedir "tocar diagonal" nas pontas (mais rígido)
      // (descomente se quiser evitar diagonais nas extremidades)
      // if(i === 0){
      //   if(!isEmptyCell(r - 1, c - 1) || !isEmptyCell(r + 1, c - 1)) return false;
      // }
      // if(i === L - 1){
      //   if(!isEmptyCell(r - 1, c + 1) || !isEmptyCell(r + 1, c + 1)) return false;
      // }
    }
    return true;

  }else{ // DIR.DOWN
    // 1) cabe no tabuleiro?
    if(row < 0 || row + L > state.rows || col < 0 || col >= state.cols) return false;

    // 2) extremidades não podem "tocar" outra letra
    if(!isEmptyCell(row - 1, col)) return false;      // acima do início
    if(!isEmptyCell(row + L, col)) return false;      // abaixo do fim

    // 3) varrer cada posição
    for(let i = 0; i < L; i++){
      const r = row + i, c = col;
      const at = state.grid[r][c];

      // 3a) conflito de letra?
      if(at && at.char !== word[i]) return false;

      // 3b) "no-touch" lateral (esquerda/direita) para letras novas
      if(!at){
        if(!isEmptyCell(r, c - 1)) return false; // esquerda vazia
        if(!isEmptyCell(r, c + 1)) return false; // direita vazia
      }

      // 3c) opcional: impedir diagonais nas pontas (mais rígido)
      // if(i === 0){
      //   if(!isEmptyCell(r - 1, c - 1) || !isEmptyCell(r - 1, c + 1)) return false;
      // }
      // if(i === L - 1){
      //   if(!isEmptyCell(r + 1, c - 1) || !isEmptyCell(r + 1, c + 1)) return false;
      // }
    }
    return true;
  }
}

function placeWord(row, col, dir, obj){
  const entry = {
    id: obj.id, word: obj.word, norm: obj.norm, clue: obj.clue,
    color: obj.color, image: obj.image,
    row, col, dir, cells: []
  };
  if(dir === DIR.ACROSS){
    for(let i=0;i<obj.norm.length;i++){
      const r=row, c=col+i, ch=obj.norm[i];
      if(!state.grid[r][c]) state.grid[r][c] = { char: ch, locked:false, el:null, owners:[] };
      state.grid[r][c].owners.push(entry.id);
      setBounds(r,c);
      entry.cells.push({r, c, index:i});
    }
  }else{
    for(let i=0;i<obj.norm.length;i++){
      const r=row+i, c=col, ch=obj.norm[i];
      if(!state.grid[r][c]) state.grid[r][c] = { char: ch, locked:false, el:null, owners:[] };
      state.grid[r][c].owners.push(entry.id);
      setBounds(r,c);
      entry.cells.push({r, c, index:i});
    }
  }
  // trava a primeira letra
  const first = entry.cells[0];
  state.grid[first.r][first.c].locked = true;
  entry.start = first;

  state.placed.push(entry);
}

function tryCrossPlace(obj){
  for(const placed of state.placed){
    for(const c1 of placed.cells){
      const ch = state.grid[c1.r][c1.c].char;
      for(let j=0;j<obj.norm.length;j++){
        if(obj.norm[j] !== ch) continue;

        if(placed.dir === DIR.ACROSS){
          const startRow = c1.r - j;
          const startCol = c1.c;
          if(startRow >=0 && canPlaceAt(startRow, startCol, DIR.DOWN, obj.norm)){
            placeWord(startRow, startCol, DIR.DOWN, obj);
            return true;
          }
        }else{
          const startRow = c1.r;
          const startCol = c1.c - j;
          if(startCol >=0 && canPlaceAt(startRow, startCol, DIR.ACROSS, obj.norm)){
            placeWord(startRow, startCol, DIR.ACROSS, obj);
            return true;
          }
        }
      }
    }
  }
  return false;
}

function placeWords(list){
  // primeira palavra no centro (across)
  const first = list[0];
  const startRow = Math.floor(state.rows/2);
  const startCol = Math.max(1, Math.floor((state.cols - first.norm.length)/2));
  placeWord(startRow, startCol, DIR.ACROSS, first);

  // demais
  for(let i=1;i<list.length;i++){
    const w = list[i];
    if(tryCrossPlace(w)) continue;

    let placed = false;

    // usar limites atuais para manter coesão do bloco
    const b = state.usedBounds;
    const rStart = Number.isFinite(b.minR) ? Math.max(0, b.minR - 1) : 0;
    const rEnd   = Number.isFinite(b.maxR) ? Math.min(state.rows - 1, b.maxR + 1) : state.rows - 1;
    const cStart = Number.isFinite(b.minC) ? Math.max(0, b.minC - 1) : 0;
    const cEnd   = Number.isFinite(b.maxC) ? Math.min(state.cols - w.norm.length, b.maxC + 1) : (state.cols - w.norm.length);

    // tenta across e down perto do bloco existente
    for(let r=rStart; r<=rEnd && !placed; r++){
      for(let c=cStart; c<=cEnd && !placed; c++){
        if(canPlaceAt(r, c, DIR.ACROSS, w.norm)){ placeWord(r, c, DIR.ACROSS, w); placed = true; break; }
        if(canPlaceAt(r, c, DIR.DOWN,   w.norm)){ placeWord(r, c, DIR.DOWN,   w); placed = true; break; }
      }
    }

    // se não coube, expandir grade de forma controlada e tentar só com essa palavra
    if(!placed){
      const grow = Math.max(4, Math.ceil(w.norm.length/3));
      // reidrata grade mantendo já posicionadas
      const prevPlaced = [...state.placed];
      buildGrid(state.rows + grow, state.cols + grow);
      state.grid = Array.from({length:state.rows}, ()=> Array.from({length:state.cols}, ()=> null));
      state.usedBounds = { minR: Infinity, maxR: -Infinity, minC: Infinity, maxC: -Infinity };
      state.placed = [];
      for(const p of prevPlaced){ placeWord(p.row, p.col, p.dir, p); }
      placeWords([w]);
    }
  }
}

function renderBoard(){
  const b = state.usedBounds;

  // ⬇️ Sem margem extra (sem -1/+1)
  const minR = Number.isFinite(b.minR) ? Math.max(0, b.minR) : 0;
  const maxR = Number.isFinite(b.maxR) ? Math.min(state.rows - 1, b.maxR) : state.rows - 1;
  const minC = Number.isFinite(b.minC) ? Math.max(0, b.minC) : 0;
  const maxC = Number.isFinite(b.maxC) ? Math.min(state.cols - 1, b.maxC) : state.cols - 1;

  const showCols = Math.max(1, maxC - minC + 1);
  el.board.style.gridTemplateColumns = `repeat(${showCols}, var(--cell-size))`;
  el.board.innerHTML = '';

  for(let r=minR; r<=maxR; r++){
    for(let c=minC; c<=maxC; c++){
      const data = state.grid[r][c];
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.tabIndex = 0;
      cell.dataset.r = r; cell.dataset.c = c;

      if(!data){
        cell.classList.add('block');
      }else{
        data.el = cell;
        cell.setAttribute('role','gridcell');
        cell.setAttribute('aria-label','letra');
        const owners = data.owners.map(id => state.placed.find(p=>p.id===id));
        const isStart = owners.some(p => p && p.start.r===r && p.start.c===c);
        if(isStart || data.locked){
          cell.textContent = data.char;
          cell.classList.add('locked','correct');
        }
        cell.addEventListener('click', ()=> {
          const owner = chooseOwner(owners);
          if(owner){ setActiveById(owner.id); focusFirstEditable(owner); }
        });
        cell.addEventListener('keydown', (ev)=> handleKey(ev, r, c));
      }
      el.board.appendChild(cell);
    }
  }
}

function chooseOwner(list){
  return list.find(p=>p.dir===DIR.ACROSS) || list[0] || null;
}

function renderClues(){
  el.cluesList.innerHTML = '';
  state.placed.forEach((p, idx)=>{
    const li = document.createElement('li');
    li.className = 'clue';
    li.dataset.id = p.id;

    const dirIcon = `<span class="dir">${p.dir===DIR.ACROSS?'↔':'↕'}</span>`;
    const num = `<b>${idx+1}.</b>`;

    const chip = p.color ? `<span class="badge-color" style="background:${p.color}"></span>` : '';
    const img  = p.image ? `${p.image}` : '';

    li.innerHTML = `${dirIcon}${num} ${chip} ${img} ${p.clue}`;
    li.addEventListener('click', ()=> {
      setActiveById(p.id);
      focusFirstEditable(p);
    });
    el.cluesList.appendChild(li);
  });
}

function setActiveById(id){
  state.activeIndex = state.placed.findIndex(p=>p.id===id);
  highlightActive();
}

function highlightActive(){
  document.querySelectorAll('.cell').forEach(c => c.classList.remove('word-active','focused'));
  document.querySelectorAll('.clue').forEach(c => c.classList.remove('active'));
  const p = state.placed[state.activeIndex];
  if(!p) return;
  p.cells.forEach(({r,c})=>{
    const cell = state.grid[r][c].el;
    if(cell) cell.classList.add('word-active');
  });
  const clueEl = [...el.cluesList.children].find(li => +li.dataset.id === p.id);
  if(clueEl) clueEl.classList.add('active');
}

function focusFirstEditable(p){
  const target = p.cells.find(({r,c})=>{
    const d = state.grid[r][c];
    return !d.locked && (!d.el.textContent || d.el.classList.contains('incorrect'));
  }) || p.cells[0];
  const cell = state.grid[target.r][target.c].el;
  if(cell) { cell.focus(); cell.classList.add('focused'); }
}

function handleKey(ev, r, c){
  const key = ev.key;
  const data = state.grid[r][c];
  const active = state.placed[state.activeIndex];
  if(!data || !active) return;

  const isLetter = /^[A-Za-z]$/.test(key);
  if(isLetter){
    if(!data.locked){
      const ch = key.toUpperCase();
      data.el.textContent = ch;
      moveCursor(active, r, c, +1);
    }
    ev.preventDefault();
  }else if(key === 'Backspace'){
    if(!data.locked && data.el.textContent){
      data.el.textContent = '';
    }else{
      moveCursor(active, r, c, -1);
    }
    ev.preventDefault();
  }else if(key.startsWith('Arrow')){
    const dirStep = (key==='ArrowRight'||key==='ArrowDown')? +1 : -1;
    moveCursor(active, r, c, dirStep);
    ev.preventDefault();
  }else if(key === 'Enter'){
    checkOne(active);
    ev.preventDefault();
  }
}

function moveCursor(p, r, c, step){
  const idx = p.cells.findIndex(cc => cc.r===r && cc.c===c);
  let next = Math.min(Math.max(0, idx + step), p.cells.length-1);
  const target = p.cells[next];
  const cell = state.grid[target.r][target.c].el;
  if(cell){ cell.focus(); document.querySelectorAll('.cell').forEach(c=>c.classList.remove('focused')); cell.classList.add('focused'); }
}

function attachBoardHandlers(){
  el.checkBtn.onclick = ()=> checkAll();
  el.hintBtn.onclick  = ()=> giveHint();
  el.resetBtn.onclick = ()=> resetBoard();
  setActiveById(state.placed[0].id);
}

function attachRoundHandlers(){
  el.roundSelect.addEventListener('change', async (e)=>{
    await initRound(Number(e.target.value));
  });
  el.prevRound.addEventListener('click', async ()=>{
    const next = Math.max(0, state.roundIndex - 1);
    el.roundSelect.value = String(next);
    await initRound(next);
  });
  el.nextRound.addEventListener('click', async ()=>{
    const next = Math.min(state.data.rounds.length-1, state.roundIndex + 1);
    el.roundSelect.value = String(next);
    await initRound(next);
  });
  el.reloadRound.addEventListener('click', async ()=>{
    await initRound(state.roundIndex);
  });
}

function getFilledString(p){
  return p.cells.map(({r,c})=>{
    const d = state.grid[r][c];
    return (d.locked ? d.char : (d.el.textContent||' '));
  }).join('');
}

function checkOne(p){
  const target = getFilledString(p).toUpperCase();
  const correct = target === p.norm;

  p.cells.forEach(({r,c}, i)=>{
    const d = state.grid[r][c];
    if(d.locked) return;

    const filled = (d.el.textContent || '').toUpperCase();

    // limpa marcações anteriores
    d.el.classList.remove('correct','incorrect');

    // ⬇️ NOVO: se está vazio, não marca nada
    if(!filled){
      return;
    }

    // Só marcar se há letra digitada
    d.el.classList.add(filled === p.norm[i] ? 'correct' : 'incorrect');
  });

  // Se completou a palavra corretamente
  if(correct && !state.solved.has(p.id)){
    state.solved.add(p.id);
    state.score += 10;
    updateScore();
    p.cells.forEach(({r,c})=>{
      const d = state.grid[r][c];
      if(!d.locked){
        d.el.classList.remove('incorrect');
        d.el.classList.add('correct');
      }
    });
    el.doneCount.textContent = state.solved.size;
    if(state.solved.size === state.total){
      celebrate();
    }
  }
}

function checkAll(){ state.placed.forEach(p => checkOne(p)); }

function giveHint(){
  const p = state.placed[state.activeIndex];
  if(!p) return;
  const editable = p.cells.filter(({r,c},i)=> !state.grid[r][c].locked && (!state.grid[r][c].el.textContent || state.grid[r][c].el.textContent.toUpperCase()!==p.norm[i]));
  if(editable.length===0) return;
  const pick = editable[Math.floor(Math.random()*editable.length)];
  const i = pick.index;
  const d = state.grid[pick.r][pick.c];
  d.el.textContent = p.norm[i];
  d.el.classList.add('correct');
  state.score = Math.max(0, state.score - 1);
  updateScore();
}

function updateScore(){ el.score.textContent = state.score; }

function resetBoard(){
  state.score = 0; state.solved.clear(); updateScore();
  el.doneCount.textContent = 0;
  state.placed.forEach(p=>{
    p.cells.forEach(({r,c})=>{
      const d = state.grid[r][c];
      if(!d.locked){
        d.el.textContent = '';
        d.el.classList.remove('correct','incorrect');
      }else{
        d.el.classList.remove('incorrect'); d.el.classList.add('correct');
      }
    });
  });
}

function celebrate(){
  for(let i=0;i<120;i++){
    const piece = document.createElement('div');
    piece.className = 'confetti';
    piece.style.left = Math.random()*100 + 'vw';
    piece.style.background = randomColor();
    piece.style.animationDelay = (Math.random()*0.5) + 's';
    piece.style.opacity = 0.9;
    el.confetti.appendChild(piece);
    setTimeout(()=> piece.remove(), 2000);
  }
}
function randomColor(){
  const colors = ['#6c5ce7','#00b894','#fdcb6e','#ff7675','#74b9ff','#a29bfe','#55efc4'];
  return colors[Math.floor(Math.random()*colors.length)];
}

loadAll().catch(err=>{
  console.error(err);
  alert('Não foi possível carregar o JSON. Abra com um servidor local (ex.: Live Server no VS Code).');
});