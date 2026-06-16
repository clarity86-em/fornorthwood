// ============================================================
// For Northwood! — 게임 엔진 (상태 + 규칙)
// UI 와 분리된 순수 로직. 상태를 들고 함수로 변형한다.
// ============================================================
import {
  SUITS, SUIT_ORDER, buildDeck, buildFiefs, DIFFICULTIES,
  CHARACTERS, charById,
} from './data.js';

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ----- 새 게임 -----
// mode: 'intro' | 'full'
//   intro: Jack=동맹, Queen/King=통치자 (왕관 카드 제외)
//   full : 24장 전체에서 무작위 (무늬당 동맹1 + 통치자2)
export function newGame({ difficulty = 'bronze', mode = 'intro', allowSpecials = true } = {}) {
  const fiefs = buildFiefs().map((f) => ({
    ...f,
    rulerId: null,
    status: 'neutral', // 'neutral' | 'friendly' | 'failed'
    visited: false,
    faceDown: false,
  }));

  let allyIds = [];
  if (mode === 'intro') {
    // 각 무늬 Jack(왕관X) 동맹
    allyIds = SUIT_ORDER.map((s) => `${s}J`);
    // 각 무늬 Queen/King(왕관X) 8장을 섞어 영지에 배치
    const rulers = shuffle(
      CHARACTERS.filter((c) => !c.crown && (c.rank === 'Q' || c.rank === 'K')).map((c) => c.id)
    );
    fiefs.forEach((f, i) => { f.rulerId = rulers[i]; });
  } else {
    // full: 무늬별로 카드를 한 장씩 공개, 첫 장=동맹, 2·3번째=통치자
    const dealt = shuffle(CHARACTERS.map((c) => c.id));
    const seen = {}; const rulerPool = [];
    for (const id of dealt) {
      const c = charById(id);
      seen[c.suit] = seen[c.suit] || [];
      if (seen[c.suit].length === 0) { allyIds.push(id); seen[c.suit].push('ally'); }
      else if (seen[c.suit].length <= 2) { rulerPool.push(id); seen[c.suit].push('ruler'); }
    }
    const rulers = shuffle(rulerPool);
    fiefs.forEach((f, i) => { f.rulerId = rulers[i]; });
  }

  return {
    difficulty,
    mode,
    allowSpecials,        // 특수 카드(능력) 적용 여부
    fiefs,
    allyIds,              // 시작 동맹 4장 (캐릭터 id)
    phase: 'board',       // board | substitute | dialogue | visitEnd | gameEnd
    // --- 진행 중인 방문 상태 ---
    visit: null,
    log: [],
    gameOver: false,
  };
}

export function difficultyInfo(state) { return DIFFICULTIES[state.difficulty]; }
export function suitOf(suitId) { return SUITS[suitId]; }

// ----- 방문 시작 (A) -----
export function startVisit(state, fiefPos) {
  const fief = state.fiefs[fiefPos];
  if (fief.visited) return state;

  // 동맹 슬롯 구성: 시작 동맹 4장, 각 슬롯에 능력 사용 여부 추적
  const slots = state.allyIds.map((id) => ({
    allyId: id,        // 원래 동맹
    substituteId: null, // 데려온 통치자(있으면 이 카드 능력 사용)
    exhausted: false,
  }));

  // 데려올 수 있는 우호 통치자(이전에 이긴 영지)
  const availableSubs = state.fiefs
    .filter((f) => f.status === 'friendly')
    .map((f) => f.rulerId);

  state.visit = {
    fiefPos,
    trump: charById(fief.rulerId).suit, // 통치자 무늬 = 트럼프
    slots,
    availableSubs,
    deck: [],
    hand: [],
    discard: [],
    score: [],            // 득점한 응답 카드들 (개수 = 점수)
    statement: null,      // 현재 통치자 발언 카드
    dialoguePhase: 'preStatement', // preStatement | awaitResponse
    abilityUsedThisDialogue: false,
    ended: false,
  };
  state.phase = 'substitute';
  return state;
}

// 통치자를 동맹 슬롯에 데려오기/되돌리기 (B)
export function setSubstitute(state, slotIndex, rulerId) {
  const v = state.visit;
  const slot = v.slots[slotIndex];
  // 같은 통치자가 다른 슬롯에 있으면 제거
  if (rulerId) {
    v.slots.forEach((s, i) => { if (i !== slotIndex && s.substituteId === rulerId) s.substituteId = null; });
  }
  slot.substituteId = rulerId || null;
  return state;
}

// 슬롯에서 "현재 능력을 제공하는" 카드
export function activeCardOfSlot(slot) {
  return charById(slot.substituteId || slot.allyId);
}

// 대화 단계로 진입: 덱 섞고 8장 드로우 (C 시작)
export function confirmSubstitutes(state) {
  const v = state.visit;
  v.deck = shuffle(buildDeck());
  v.hand = v.deck.splice(0, 8);
  sortHand(v.hand);
  state.phase = 'dialogue';
  beginDialogue(state);
  return state;
}

function sortHand(hand) {
  hand.sort((a, b) => SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit) || a.value - b.value);
}

// 새 대화 시작 — 능력 사용 창 (C1)
export function beginDialogue(state) {
  const v = state.visit;
  if (v.hand.length === 0 || v.deck.length === 0) { endVisit(state); return state; }
  v.dialoguePhase = 'preStatement';
  v.abilityUsedThisDialogue = false;
  v.statement = null;
  return state;
}

// 통치자 발언 공개 (C2)
export function revealStatement(state) {
  const v = state.visit;
  if (v.dialoguePhase !== 'preStatement') return state;
  if (v.deck.length === 0 || v.hand.length === 0) { endVisit(state); return state; }
  const card = v.deck.shift();
  v.statement = card;
  v.discard.push(card); // 발언 카드는 버림 더미로
  v.dialoguePhase = 'awaitResponse';
  return state;
}

// 손패에서 응답 카드의 합법성 (follow suit)
export function legalResponses(state) {
  const v = state.visit;
  if (!v.statement) return [];
  const hasSuit = v.hand.some((c) => c.suit === v.statement.suit);
  return v.hand
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !hasSuit || c.suit === v.statement.suit)
    .map(({ i }) => i);
}

// 득점 판정
export function wouldScore(state, card) {
  const v = state.visit;
  const st = v.statement;
  const trump = v.trump;
  if (!st) return false;
  // (a) 같은 무늬 + 더 높은 값
  if (card.suit === st.suit && card.value > st.value) return true;
  // (b) 발언이 트럼프가 아닌데 응답이 트럼프
  if (st.suit !== trump && card.suit === trump) return true;
  return false;
}

// 응답 카드 내기 (C3~C5)
export function playResponse(state, handIndex) {
  const v = state.visit;
  if (v.dialoguePhase !== 'awaitResponse') return state;
  if (!legalResponses(state).includes(handIndex)) return state;
  const card = v.hand.splice(handIndex, 1)[0];
  const scored = wouldScore(state, card);
  if (scored) v.score.push(card); else v.discard.push(card);
  state.log.push(
    `발언 ${cardLabel(v.statement)} → 응답 ${cardLabel(card)} : ${scored ? '득점 ✅' : '실패'}`
  );
  v.statement = null;
  // 다음 대화 또는 종료
  beginDialogue(state);
  return state;
}

function cardLabel(c) { return `${SUITS[c.suit].symbol}${c.value}`; }

// ----- 능력 (특수 카드) -----
// 능력 사용 시작: 슬롯을 소진 처리하고, 이번 대화 능력 플래그 설정
export function canUseAbility(state, slotIndex) {
  const v = state.visit;
  if (!state.allowSpecials) return false;
  if (v.dialoguePhase !== 'preStatement') return false; // 발언 전에만
  if (v.abilityUsedThisDialogue) return false;          // 대화당 1회
  const slot = v.slots[slotIndex];
  return slot && !slot.exhausted;
}

export function activateAbility(state, slotIndex) {
  if (!canUseAbility(state, slotIndex)) return state;
  const v = state.visit;
  const slot = v.slots[slotIndex];
  slot.exhausted = true;
  v.abilityUsedThisDialogue = true;
  const card = activeCardOfSlot(slot);
  state.log.push(`능력 사용: ${card.name} — ${card.ability.text}`);
  // 자동 효과가 있으면 실행 (수동 도구로도 보정 가능)
  if (card.ability.auto) runAutoEffect(state, card.ability.auto);
  return state;
}

function runAutoEffect(state, key) {
  const v = state.visit;
  const [op, ...args] = key.split(':');
  const n = args.map(Number);
  if (op === 'draw') manualDraw(state, n[0]);
  else if (op === 'drawThenDiscard') { manualDraw(state, n[0]); /* 버리기는 수동 선택 */ }
  // discardThenDraw 등은 수동 선택 필요 → 도구로 처리
}

// 수동 도구: 덱에서 N장 뽑기
export function manualDraw(state, n = 1) {
  const v = state.visit;
  for (let i = 0; i < n && v.deck.length > 0; i++) v.hand.push(v.deck.shift());
  sortHand(v.hand);
  return state;
}

// 수동 도구: 선택한 손패 카드들 버리기
export function manualDiscard(state, handIndexes) {
  const v = state.visit;
  const idx = [...handIndexes].sort((a, b) => b - a);
  for (const i of idx) {
    const [c] = v.hand.splice(i, 1);
    if (c) v.discard.push(c);
  }
  return state;
}

// ----- 방문 종료 (D) -----
export function endVisit(state) {
  const v = state.visit;
  if (v.ended) return state;
  v.ended = true;
  const fief = state.fiefs[v.fiefPos];
  const score = v.score.length;
  fief.visited = true;
  if (score === fief.target) {
    fief.status = 'friendly';
  } else {
    fief.status = 'failed';
    fief.faceDown = true;
  }
  v.resultScore = score;
  state.phase = 'visitEnd';
  return state;
}

// 방문 정리 후 보드로 (또는 게임 종료)
export function finishVisit(state) {
  state.visit = null;
  if (state.fiefs.every((f) => f.visited)) {
    state.phase = 'gameEnd';
    state.gameOver = true;
  } else {
    state.phase = 'board';
  }
  return state;
}

// 최종 점수
export function finalScore(state) {
  const vp = state.fiefs
    .filter((f) => f.status === 'friendly')
    .reduce((s, f) => s + f.stars, 0);
  const min = DIFFICULTIES[state.difficulty].min;
  return { vp, min, win: vp >= min };
}

export { charById };
