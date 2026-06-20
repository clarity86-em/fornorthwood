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

// ===== 능력 단계(step) 레지스트리 =====
// 새 능력 동작이 필요하면 여기에 타입 하나만 추가하면 됨.
//   auto: true  → 즉시 실행 (run)
//   auto: false → 플레이어 입력 필요 (prompt 로 요구사항 알리고, resolve 로 처리)
const STEP_TYPES = {
  // 덱에서 n장 뽑기
  draw: {
    auto: true,
    run(state, step) { manualDraw(state, step.n ?? 1); },
    describe: (s) => `덱에서 ${s.n ?? 1}장 뽑기`,
  },
  // 손패에서 n장 골라 버리기 (조건 가능)
  discard: {
    auto: false,
    prompt(step) {
      return {
        action: 'select',
        min: step.min ?? step.n ?? 1,
        max: step.max ?? step.n ?? 1,
        constraint: step.constraint || null,
        then: 'discard',
        text: step.text || `버릴 카드 ${stepCountLabel(step)}장 선택`,
      };
    },
    resolve(state, step, sel) { manualDiscard(state, sel); },
  },
  // 손패를 n장이 될 때까지 채우기 (발톱 잭)
  drawTo: {
    auto: true,
    run(state, step) {
      const v = state.visit;
      while (v.hand.length < (step.n ?? 8) && v.deck.length > 0) v.hand.push(v.deck.shift());
      sortHand(v.hand);
    },
    describe: (s) => `${s.n ?? 8}장이 될 때까지 뽑기`,
  },
  // 특정 무늬 카드를 손패에서 전부 버리기 (꽃 잭=trump, 눈 왕=chosen)
  discardSuit: {
    auto: true,
    run(state, step) {
      const v = state.visit;
      const suit = step.suit === 'trump' ? v.trump
        : step.suit === 'chosen' ? (v.abilityRun.vars && v.abilityRun.vars.suit)
        : step.suit;
      if (!suit) return;
      for (let i = v.hand.length - 1; i >= 0; i--) {
        if (v.hand[i].suit === suit) v.discard.push(v.hand.splice(i, 1)[0]);
      }
    },
    describe: (s) => `${s.suit === 'trump' ? '트럼프' : s.suit === 'chosen' ? '호명' : s.suit} 무늬 전부 버리기`,
  },
  // 무늬 호명 (눈 왕) — 이후 단계가 vars.suit 사용
  chooseSuit: {
    auto: false,
    prompt() { return { action: 'selectSuit', text: '호명할 무늬를 선택' }; },
    resolveSuit(state, step, suit) {
      const run = state.visit.abilityRun;
      run.vars = run.vars || {};
      run.vars.suit = suit;
      state.log.push(`무늬 호명: ${SUITS[suit].ko}`);
    },
  },
  // 손에서 가장 높은 값 카드(들)를 점수 더미로 (발톱 왕)
  scoreHighest: {
    auto: true,
    run(state) {
      const v = state.visit;
      if (v.hand.length === 0) return;
      const max = Math.max(...v.hand.map((c) => c.value));
      for (let i = v.hand.length - 1; i >= 0; i--) {
        if (v.hand[i].value === max) v.score.push(v.hand.splice(i, 1)[0]);
      }
    },
    describe: () => '가장 높은 값 카드를 점수로',
  },
  // 점수 더미 맨 위 카드를 덱 맨 위(뒷면)로 (꽃 여왕)
  scoreTopToDeckTop: {
    auto: true,
    run(state) {
      const v = state.visit;
      const c = v.score.pop();
      if (c) v.deck.unshift(c);
    },
    describe: () => '점수 맨 위 카드를 덱 위로',
  },
  // 덱 맨 위 n장 정찰 (눈 여왕) — 순서 유지, 정보만
  peek: {
    auto: true,
    run(state, step) {
      const v = state.visit;
      v.abilityRun.info = { peek: v.deck.slice(0, step.n ?? 3).map((c) => ({ ...c })) };
    },
    describe: (s) => `덱 맨 위 ${s.n ?? 3}장 정찰`,
  },
  // 현재 영지 통치자의 능력을 사용 (나뭇잎 여왕)
  useRulerAbility: {
    auto: true,
    run(state) {
      const run = state.visit.abilityRun;
      const ruler = charById(state.fiefs[state.visit.fiefPos].rulerId);
      const reff = ruler.ability.effect;
      // 무한 재귀 방지: 통치자 능력이 또 useRulerAbility면 실행하지 않음
      if (reff && !reff.some((s) => s.type === 'useRulerAbility')) {
        run.steps.splice(run.index + 1, 0, ...reff.map((s) => ({ ...s })));
        state.log.push(`나뭇잎 여왕: 통치자(${ruler.name}) 능력 사용`);
      } else {
        run.info = { note: `통치자(${ruler.name})의 능력: ${ruler.ability.text}\n→ 자동화되지 않은 능력이면 직접 처리하세요.` };
      }
    },
    describe: () => '통치자 능력 사용',
  },
  // 덱 맨 위 카드를 손패 1장과 교환 (나뭇잎 왕)
  swapDeckTop: {
    auto: false,
    prompt(step, state) {
      const top = state.visit.deck[0] || null;
      return { action: 'select', min: 1, max: 1, then: 'swapDeckTop',
        deckTop: top, text: '덱 맨 위 카드와 바꿀 손패 1장 선택' };
    },
    resolve(state, step, sel) {
      const v = state.visit;
      if (v.deck.length === 0 || sel.length === 0) return;
      const hi = sel[0];
      const top = v.deck[0];
      v.deck[0] = v.hand[hi];
      v.hand[hi] = top;
      sortHand(v.hand);
    },
  },
  // 덱/버림/점수 더미 맨 위에서 골라 손으로 (발톱 여왕) — 각 더미 1장, 최대 3장
  takeFromPiles: {
    auto: false,
    prompt(step, state) {
      const v = state.visit;
      const piles = [];
      if (v.deck.length)    piles.push({ key: 'deck', hidden: true });
      if (v.discard.length) piles.push({ key: 'discard', card: v.discard[v.discard.length - 1] });
      if (v.score.length)   piles.push({ key: 'score', card: v.score[v.score.length - 1] });
      return { action: 'takePiles', piles, text: '가져올 더미를 고르세요 (각 더미 맨 위 1장)' };
    },
    resolveTake(state, step, keys) {
      const v = state.visit;
      for (const key of keys) {
        if (key === 'deck' && v.deck.length) v.hand.push(v.deck.shift());
        else if (key === 'discard' && v.discard.length) v.hand.push(v.discard.pop());
        else if (key === 'score' && v.score.length) v.hand.push(v.score.pop());
      }
      sortHand(v.hand);
    },
  },
  // 통치자 맞교환 (나뭇잎 잭): 현재 영지 ↔ ±range 이내 중립 영지
  swapRuler: {
    auto: false,
    prompt(step, state) {
      const cur = state.visit.fiefPos;
      const range = step.range ?? 2;
      const targets = state.fiefs
        .filter((f) => f.pos !== cur && !f.visited && Math.abs(f.pos - cur) <= range)
        .map((f) => f.pos);
      return { action: 'selectFief', targets, text: '바꿀 중립 영지를 선택' };
    },
    resolveFief(state, step, fiefPos) {
      const v = state.visit;
      const a = state.fiefs[v.fiefPos];
      const b = state.fiefs[fiefPos];
      [a.rulerId, b.rulerId] = [b.rulerId, a.rulerId];
      v.trump = charById(a.rulerId).suit; // 현재 영지의 새 통치자 무늬가 트럼프
      state.log.push(`나뭇잎 잭: 영지 #${a.pos} ↔ #${b.pos} 통치자 교환 (트럼프 → ${SUITS[v.trump].ko})`);
    },
  },
  // 안내만
  message: {
    auto: true,
    run() {},
    describe: (s) => s.text || '',
  },
};

function stepCountLabel(step) {
  const min = step.min ?? step.n ?? 1;
  const max = step.max ?? step.n ?? 1;
  return min === max ? `${min}` : `${min}~${max}`;
}

// 선택한 카드들이 단계 제약을 만족하는지
export function checkConstraint(constraint, cards) {
  if (!constraint) return { ok: true };
  if (constraint.sumEquals != null) {
    const sum = cards.reduce((a, c) => a + c.value, 0);
    return { ok: sum === constraint.sumEquals, reason: `합이 ${constraint.sumEquals}가 되어야 함 (현재 ${sum})` };
  }
  if (constraint.sameSuit) {
    const ok = cards.length === 0 || cards.every((c) => c.suit === cards[0].suit);
    return { ok, reason: '같은 무늬여야 함' };
  }
  if (constraint.suit) {
    const ok = cards.every((c) => c.suit === constraint.suit);
    return { ok, reason: `${SUITS[constraint.suit].ko} 무늬여야 함` };
  }
  return { ok: true };
}

export function activateAbility(state, slotIndex) {
  if (!canUseAbility(state, slotIndex)) return state;
  const v = state.visit;
  const slot = v.slots[slotIndex];
  slot.exhausted = true;
  v.abilityUsedThisDialogue = true;
  const card = activeCardOfSlot(slot);
  state.log.push(`능력 사용: ${card.name} — ${card.ability.text}`);
  startAbilityRun(state, slotIndex);
  return state;
}

// 능력 실행 시작: effect 가 있으면 단계 런타임, 없으면 수동(manual) 모드
function startAbilityRun(state, slotIndex) {
  const v = state.visit;
  const card = activeCardOfSlot(v.slots[slotIndex]);
  const effect = card.ability.effect;
  v.abilityRun = {
    slotIndex,
    cardId: card.id,
    steps: effect ? effect.map((s) => ({ ...s })) : null,
    index: 0,
    pending: null,
    done: false,
    manual: !effect, // effect 없으면 일반 뽑기/버리기 도구로 직접
  };
  if (effect) advanceAbilityRun(state);
  return state;
}

// 자동 단계는 실행하고, 입력이 필요한 단계에서 멈춘다.
export function advanceAbilityRun(state) {
  const run = state.visit.abilityRun;
  if (!run || run.manual) return state;
  while (run.index < run.steps.length) {
    const step = run.steps[run.index];
    const def = STEP_TYPES[step.type];
    if (!def) { run.index++; continue; }          // 모르는 타입은 건너뜀
    if (def.auto) { def.run(state, step); run.index++; continue; }
    run.pending = def.prompt(step, state);        // 입력 대기
    // FAQ: 수행할 수 없으면 아무 일도 일어나지 않음 → 건너뜀
    const empty = (run.pending.action === 'selectFief' && run.pending.targets.length === 0)
      || (run.pending.action === 'takePiles' && run.pending.piles.length === 0);
    if (empty) { run.pending = null; run.index++; continue; }
    return state;
  }
  run.pending = null;
  run.done = true;
  return state;
}

// 입력이 필요한 단계 처리 (선택한 손패 인덱스들)
export function resolveAbilityStep(state, selectedIndexes) {
  const run = state.visit.abilityRun;
  if (!run || !run.pending) return { ok: false };
  const p = run.pending;
  const n = selectedIndexes.length;
  // FAQ: 가능한 만큼만 — 손패가 모자라면 요구치를 줄인다
  const handLen = state.visit.hand.length;
  const reqMin = Math.min(p.min, handLen);
  const reqMax = Math.min(p.max, handLen);
  if (n < reqMin || n > reqMax) return { ok: false, reason: `${stepCountText(p)}장을 선택하세요` };
  const cards = selectedIndexes.map((i) => state.visit.hand[i]);
  const c = checkConstraint(p.constraint, cards);
  if (!c.ok) return { ok: false, reason: c.reason };
  const step = run.steps[run.index];
  STEP_TYPES[step.type].resolve(state, step, selectedIndexes);
  run.index++;
  run.pending = null;
  advanceAbilityRun(state);
  return { ok: true };
}

// 영지 선택이 필요한 단계 처리 (swapRuler 등)
export function resolveAbilityFief(state, fiefPos) {
  const run = state.visit.abilityRun;
  if (!run || !run.pending || run.pending.action !== 'selectFief') return { ok: false };
  if (!run.pending.targets.includes(fiefPos)) return { ok: false };
  const step = run.steps[run.index];
  STEP_TYPES[step.type].resolveFief(state, step, fiefPos);
  run.index++;
  run.pending = null;
  advanceAbilityRun(state);
  return { ok: true };
}

// 더미 선택이 필요한 단계 처리 (takeFromPiles)
export function resolveAbilityPiles(state, keys) {
  const run = state.visit.abilityRun;
  if (!run || !run.pending || run.pending.action !== 'takePiles') return { ok: false };
  const step = run.steps[run.index];
  STEP_TYPES[step.type].resolveTake(state, step, keys);
  run.index++;
  run.pending = null;
  advanceAbilityRun(state);
  return { ok: true };
}

// 무늬 선택이 필요한 단계 처리 (chooseSuit)
export function resolveAbilitySuit(state, suit) {
  const run = state.visit.abilityRun;
  if (!run || !run.pending || run.pending.action !== 'selectSuit') return { ok: false };
  const step = run.steps[run.index];
  STEP_TYPES[step.type].resolveSuit(state, step, suit);
  run.index++;
  run.pending = null;
  advanceAbilityRun(state);
  return { ok: true };
}

function stepCountText(p) { return p.min === p.max ? `${p.min}` : `${p.min}~${p.max}`; }

export function getAbilityRun(state) { return state.visit ? state.visit.abilityRun : null; }
export function endAbilityRun(state) { if (state.visit) state.visit.abilityRun = null; return state; }

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
