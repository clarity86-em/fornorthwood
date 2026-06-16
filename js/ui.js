// ============================================================
// For Northwood! — UI 레이어 (렌더 + 상호작용)
// ============================================================
import * as E from './engine.js';
import { SUITS, DIFFICULTIES, charById, RANK_LABEL } from './data.js';

let state = null;
const ui = { selDiscard: new Set(), modal: null, modalSlot: null };
const root = () => document.getElementById('app');

export function start() {
  state = E.newGame({ difficulty: 'bronze', mode: 'intro', allowSpecials: true });
  state.phase = 'setup';
  render();
}

function render() {
  ui.selDiscard.clear();
  let html = '';
  switch (state.phase) {
    case 'setup':      html = screenSetup(); break;
    case 'board':      html = screenBoard(); break;
    case 'substitute': html = screenSubstitute(); break;
    case 'dialogue':   html = screenDialogue(); break;
    case 'visitEnd':   html = screenVisitEnd(); break;
    case 'gameEnd':    html = screenGameEnd(); break;
  }
  root().innerHTML = html + footer();
  if (ui.modal) root().insertAdjacentHTML('beforeend', ui.modal);
  bind();
}

// ---------------- 화면들 ----------------

function screenSetup() {
  const d = state.difficulty, m = state.mode;
  return `
  <div class="title"><h1>For Northwood!</h1><p>솔로 트릭테이킹 — 폰 웹앱</p></div>
  <div class="card-panel">
    <h3>난이도</h3>
    <div class="seg" data-seg="difficulty">
      ${Object.values(DIFFICULTIES).map((x) => `
        <div class="opt ${d === x.id ? 'sel' : ''}" data-val="${x.id}">
          <b>${x.ko}</b><small>${x.sub} · ${x.min}점+</small></div>`).join('')}
    </div>
  </div>
  <div class="card-panel">
    <h3>모드</h3>
    <div class="seg" data-seg="mode">
      <div class="opt ${m === 'intro' ? 'sel' : ''}" data-val="intro"><b>입문</b><small>Jack 동맹</small></div>
      <div class="opt ${m === 'full' ? 'sel' : ''}" data-val="full"><b>풀 게임</b><small>전체 24장</small></div>
    </div>
    <label class="row" style="align-items:center; margin-top:12px; gap:10px;">
      <input type="checkbox" id="specials" ${state.allowSpecials ? 'checked' : ''} style="width:20px;height:20px;">
      <span>특수 카드(능력) 적용 — 기본 모드부터 사용</span>
    </label>
  </div>
  <button class="btn primary full" data-act="newgame">게임 시작</button>
  <div class="card-panel small muted">
    <b>점수 규칙</b><br>
    영지마다 정확한 목표 점수(0~7)를 맞추면 통치자가 우호적이 됩니다.
    발언과 같은 무늬의 더 높은 카드, 또는 트럼프(통치자 무늬)로 받으면 득점.
  </div>`;
}

function fiefView(f, opts = {}) {
  const ruler = charById(f.rulerId);
  const suit = SUITS[ruler.suit];
  const cls = ['fief'];
  if (f.status === 'friendly') cls.push('friendly');
  if (f.status === 'failed') cls.push('failed');
  if (opts.visiting) cls.push('visiting');
  if (opts.clickable) cls.push('clickable');
  const badge = f.status === 'friendly' ? '<span class="badge">우호</span>'
    : f.status === 'failed' ? '<span class="badge failed">실패</span>' : '';
  return `
    <div class="${cls.join(' ')}" ${opts.clickable ? `data-fief="${f.pos}"` : ''}>
      ${badge}
      <div class="target">${f.target}</div>
      <div class="stars">${'★'.repeat(f.stars)}</div>
      <div class="suit">${suit.symbol}</div>
      <div class="ruler">${RANK_LABEL[ruler.rank]} · ${ruler.name}${ruler.crown ? ' 👑' : ''}</div>
    </div>`;
}

function screenBoard() {
  const visitedCount = state.fiefs.filter((f) => f.visited).length;
  const cur = E.finalScore(state);
  return `
  <div class="hud">
    <span class="pill">방문 <b>${visitedCount}/8</b></span>
    <span class="pill">${DIFFICULTIES[state.difficulty].ko} · ${cur.min}점</span>
    <span class="pill">현재 <b>${cur.vp}</b>점</span>
  </div>
  <div class="card-panel">
    <h3>방문할 영지를 선택</h3>
    <p class="muted small">목표 점수에 맞춰 정확히 득점하세요. 가장자리(★ 많음)가 가치 높지만 어렵습니다.</p>
    <div class="fiefs">
      ${state.fiefs.map((f) => fiefView(f, { clickable: !f.visited })).join('')}
    </div>
  </div>
  <button class="btn ghost full sm" data-act="abort">게임 종료 / 결과 보기</button>`;
}

function allyMini(slot, idx, withUseBtn) {
  const card = E.activeCardOfSlot(slot);
  const suit = SUITS[card.suit];
  const cls = ['ally'];
  if (slot.exhausted) cls.push('exhausted');
  if (slot.substituteId) cls.push('sub');
  const canUse = withUseBtn && E.canUseAbility(state, idx);
  return `
    <div class="${cls.join(' ')}">
      <div class="sym">${suit.symbol}</div>
      <div class="nm">${card.name}${card.crown ? ' 👑' : ''}</div>
      ${slot.substituteId ? '<div class="tag">대역</div>' : ''}
      ${withUseBtn ? `<button class="btn sm usebtn ${canUse ? '' : ''}" data-ability="${idx}" ${canUse ? '' : 'disabled'}>
        ${slot.exhausted ? '사용함' : '능력'}</button>` : ''}
    </div>`;
}

function screenSubstitute() {
  const v = state.visit;
  const fief = state.fiefs[v.fiefPos];
  const subs = v.availableSubs;
  return `
  <div class="hud">
    <span class="pill">영지 #${fief.pos} · 목표 <b>${fief.target}</b></span>
    <span class="pill trump">트럼프 ${SUITS[v.trump].symbol} ${SUITS[v.trump].ko}</span>
  </div>
  <div class="card-panel">
    <h3>우호 통치자 데려오기 <span class="muted small">(선택)</span></h3>
    <p class="muted small">우호적이 된 통치자를 동맹 자리에 넣어 그 능력을 이번 방문에만 사용할 수 있어요.</p>
    <div class="allies">
      ${v.slots.map((s, i) => `
        <div>
          ${allyMini(s, i, false)}
          ${subs.length ? `
            <select data-sub="${i}" class="btn sm full" style="margin-top:5px;">
              <option value="">— 동맹 유지 —</option>
              ${subs.map((rid) => {
                const c = charById(rid);
                return `<option value="${rid}" ${s.substituteId === rid ? 'selected' : ''}>${SUITS[c.suit].symbol} ${c.name}</option>`;
              }).join('')}
            </select>` : ''}
        </div>`).join('')}
    </div>
    ${subs.length ? '' : '<p class="muted small center">아직 데려올 우호 통치자가 없습니다.</p>'}
  </div>
  <button class="btn primary full" data-act="confirmSubs">대화 시작 →</button>`;
}

function pcard(card, extra = '') {
  return `<div class="pcard suit-${card.suit} ${extra}">
    <span class="v">${card.value}</span><span class="s">${SUITS[card.suit].symbol}</span></div>`;
}

function screenDialogue() {
  const v = state.visit;
  const fief = state.fiefs[v.fiefPos];
  const target = fief.target;
  const score = v.score.length;
  const legal = v.dialoguePhase === 'awaitResponse' ? E.legalResponses(state) : [];
  const pct = Math.min(100, (score / Math.max(target, 1)) * 100);

  const handHtml = v.hand.map((c, i) => {
    const playable = v.dialoguePhase === 'awaitResponse' && legal.includes(i);
    const dim = v.dialoguePhase === 'awaitResponse' && !legal.includes(i);
    const willScore = playable && E.wouldScore(state, c);
    return `<div class="pcard suit-${c.suit} ${playable ? 'playable' : ''} ${dim ? 'dim' : ''} ${willScore ? 'scored' : ''}"
      ${playable ? `data-play="${i}"` : ''}>
      <span class="v">${c.value}</span><span class="s">${SUITS[c.suit].symbol}</span></div>`;
  }).join('');

  return `
  <div class="hud">
    <span class="pill">영지 #${fief.pos}</span>
    <span class="pill trump">트럼프 ${SUITS[v.trump].symbol}</span>
    <span class="pill">점수 <b>${score}</b> / ${target}</span>
    <span class="pill">덱 ${v.deck.length}</span>
  </div>
  <div class="scorebar"><i style="width:${pct}%; background:${score > target ? 'var(--bad)' : 'var(--good)'}"></i></div>

  <div class="statement-zone">
    ${v.statement
      ? `<div><div class="label">통치자 발언</div>${pcard(v.statement, 'bigcard')}</div>`
      : `<div class="label center">${v.dialoguePhase === 'preStatement'
          ? '능력을 쓰려면 동맹의 [능력]을, 아니면 발언을 공개하세요.' : ''}</div>`}
  </div>

  ${v.dialoguePhase === 'preStatement'
    ? `<button class="btn primary full" data-act="reveal">통치자 발언 공개 →</button>`
    : `<p class="center muted small">손에서 응답할 카드를 선택하세요 (✓ = 득점)</p>`}

  <div class="card-panel" style="padding:10px;">
    <div class="hand">${handHtml || '<span class="muted">손패 없음</span>'}</div>
  </div>

  <div class="allies">
    ${v.slots.map((s, i) => allyMini(s, i, true)).join('')}
  </div>

  <div class="card-panel" style="padding:10px; margin-top:10px;">
    <div class="row small"><b>기록</b><span class="spacer"></span>
      <span class="muted">버림 ${v.discard.length} · 득점더미 ${v.score.length}</span></div>
    <div class="log">${state.log.slice(-6).reverse().map((l) => `<div>${l}</div>`).join('') || '<div class="muted">—</div>'}</div>
  </div>`;
}

function screenVisitEnd() {
  const v = state.visit;
  const fief = state.fiefs[v.fiefPos];
  const ok = fief.status === 'friendly';
  return `
  <div class="banner ${ok ? 'win' : 'loss'}">
    <div class="big">${ok ? 'For Northwood! 🎉' : '대화 실패…'}</div>
    <p>영지 #${fief.pos} · 목표 ${fief.target} · 획득 점수 <b>${v.resultScore}</b></p>
    <p class="muted small">${ok
      ? `통치자가 우호적이 되었습니다. 다음 방문부터 ${SUITS[fief.rulerId[0]].symbol} ${charById(fief.rulerId).name}을(를) 데려올 수 있어요. (+${fief.stars}★)`
      : '점수가 목표와 달라 통치자를 잃었습니다.'}</p>
  </div>
  <button class="btn primary full" data-act="finishVisit">계속 →</button>`;
}

function screenGameEnd() {
  const r = E.finalScore(state);
  const friendly = state.fiefs.filter((f) => f.status === 'friendly');
  return `
  <div class="banner ${r.win ? 'win' : 'loss'}">
    <div class="big">${r.win ? '승리! 🏆' : '패배'}</div>
    <p>최종 승점 <b style="font-size:22px">${r.vp}</b> / 기준 ${r.min}</p>
    <p class="muted small">${DIFFICULTIES[state.difficulty].ko} (${DIFFICULTIES[state.difficulty].sub})</p>
  </div>
  <div class="card-panel">
    <h3>우호 영지 (${friendly.length})</h3>
    <div class="fiefs">${state.fiefs.map((f) => fiefView(f)).join('')}</div>
  </div>
  <button class="btn primary full" data-act="restart">새 게임</button>`;
}

function footer() {
  return `<footer>For Northwood! 비공식 솔로 보조 앱 · 데이터 중심 능력 시스템</footer>`;
}

// ---------------- 능력 모달 ----------------
function openAbilityModal(slotIndex) {
  ui.modalSlot = slotIndex;
  const v = state.visit;
  const slot = v.slots[slotIndex];
  const card = E.activeCardOfSlot(slot);
  const ph = card.ability.placeholder;
  ui.modal = `
  <div class="modal-bg" data-modalbg>
    <div class="modal">
      <div class="row"><h3>${SUITS[card.suit].symbol} ${card.name}${card.crown ? ' 👑' : ''}</h3>
        <span class="spacer"></span>${ph ? '<span class="tag placeholder">임시 텍스트</span>' : ''}</div>
      <div class="ability-text">${card.ability.text}</div>
      <p class="muted small">능력을 직접 실행하세요. 카드 설명대로 뽑고 버리면 됩니다.</p>
      <div class="row wrap" style="margin:8px 0;">
        <button class="btn sm" data-mdraw="1">덱에서 1장 뽑기</button>
        <button class="btn sm" data-mdiscard>선택 카드 버리기</button>
      </div>
      <div class="card-panel" style="padding:8px;">
        <div class="hand" data-modalhand>
          ${v.hand.map((c, i) => `<div class="pcard suit-${c.suit}" data-msel="${i}">
            <span class="v">${c.value}</span><span class="s">${SUITS[c.suit].symbol}</span></div>`).join('')
            || '<span class="muted">손패 없음</span>'}
        </div>
        <p class="muted small center" style="margin:6px 0 0;">버릴 카드를 탭해서 선택 (빨강)</p>
      </div>
      <button class="btn primary full" data-act="closeModal">완료</button>
    </div>
  </div>`;
  render();
}

// ---------------- 이벤트 바인딩 ----------------
function bind() {
  const r = root();

  // 세그먼트 선택 (난이도/모드)
  r.querySelectorAll('[data-seg] .opt').forEach((el) => el.addEventListener('click', () => {
    const seg = el.closest('[data-seg]').dataset.seg;
    if (seg === 'difficulty') state.difficulty = el.dataset.val;
    if (seg === 'mode') state.mode = el.dataset.val;
    render();
  }));
  const sp = r.querySelector('#specials');
  if (sp) sp.addEventListener('change', () => { state.allowSpecials = sp.checked; });

  // 일반 액션 버튼
  r.querySelectorAll('[data-act]').forEach((el) => el.addEventListener('click', () => onAct(el.dataset.act)));

  // 영지 선택
  r.querySelectorAll('[data-fief]').forEach((el) => el.addEventListener('click', () => {
    E.startVisit(state, Number(el.dataset.fief)); render();
  }));

  // 대역 선택
  r.querySelectorAll('[data-sub]').forEach((el) => el.addEventListener('change', () => {
    E.setSubstitute(state, Number(el.dataset.sub), el.value); render();
  }));

  // 응답 카드 내기
  r.querySelectorAll('[data-play]').forEach((el) => el.addEventListener('click', () => {
    E.playResponse(state, Number(el.dataset.play)); render();
  }));

  // 능력 버튼 → 모달
  r.querySelectorAll('[data-ability]').forEach((el) => el.addEventListener('click', () => {
    const idx = Number(el.dataset.ability);
    E.activateAbility(state, idx);   // 소진 처리 + 자동효과
    openAbilityModal(idx);           // 수동 도구
  }));

  // 모달 내부 도구
  r.querySelectorAll('[data-mdraw]').forEach((el) => el.addEventListener('click', () => {
    E.manualDraw(state, Number(el.dataset.mdraw));
    refreshModalHand();
  }));
  r.querySelectorAll('[data-msel]').forEach((el) => el.addEventListener('click', () => {
    const i = Number(el.dataset.msel);
    if (ui.selDiscard.has(i)) ui.selDiscard.delete(i); else ui.selDiscard.add(i);
    el.classList.toggle('sel');
  }));
  const dbtn = r.querySelector('[data-mdiscard]');
  if (dbtn) dbtn.addEventListener('click', () => {
    if (ui.selDiscard.size === 0) return;
    E.manualDiscard(state, ui.selDiscard); ui.selDiscard.clear();
    refreshModalHand();
  });
  const bg = r.querySelector('[data-modalbg]');
  if (bg) bg.addEventListener('click', (e) => { if (e.target === bg) closeModal(); });
}

function refreshModalHand() {
  // 손패가 바뀌었으니 모달을 현재 상태로 다시 그린다 (모달 유지)
  if (ui.modalSlot == null) { render(); return; }
  openAbilityModal(ui.modalSlot);
}

function onAct(act) {
  switch (act) {
    case 'newgame':
      state = E.newGame({ difficulty: state.difficulty, mode: state.mode, allowSpecials: state.allowSpecials });
      break;
    case 'confirmSubs': E.confirmSubstitutes(state); break;
    case 'reveal': E.revealStatement(state); break;
    case 'finishVisit': E.finishVisit(state); break;
    case 'abort': state.phase = 'gameEnd'; state.gameOver = true; break;
    case 'restart': state = E.newGame({ difficulty: state.difficulty, mode: state.mode, allowSpecials: state.allowSpecials }); state.phase = 'setup'; break;
    case 'closeModal': closeModal(); return;
  }
  render();
}

function closeModal() { ui.modal = null; ui.modalSlot = null; render(); }
