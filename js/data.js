// ============================================================
// For Northwood! — 게임 데이터
// 카드 / 영지 / 캐릭터 능력 정의 (데이터 중심 설계)
// ============================================================

// 네 가지 무늬(suit) — 색은 한국어판 실물 카드 기준
export const SUITS = {
  C: { id: 'C', name: 'Claws',   ko: '발톱',   symbol: '🐾', color: '#8d8d8d' }, // 회색
  F: { id: 'F', name: 'Flowers', ko: '꽃',     symbol: '🌸', color: '#d2596b' }, // 분홍/빨강
  L: { id: 'L', name: 'Leaves',  ko: '나뭇잎', symbol: '🍂', color: '#e0a92e' }, // 노랑/주황
  E: { id: 'E', name: 'Eyes',    ko: '눈',     symbol: '👁', color: '#5b9bd5' }, // 파랑
};
export const SUIT_ORDER = ['C', 'F', 'L', 'E'];

// 대화(dialogue) 덱: 각 무늬 1~8, 총 32장
export function buildDeck() {
  const deck = [];
  for (const s of SUIT_ORDER) {
    for (let v = 1; v <= 8; v++) {
      deck.push({ id: `${s}${v}`, suit: s, value: v });
    }
  }
  return deck;
}

// 영지(fief): 위치 0~7 = 목표 점수. 별(승점)은 가장자리가 높음.
// 별 합계 = 4+3+2+1+1+2+3+4 = 20 (= Gold/Idealist 만점)
const STARS = [4, 3, 2, 1, 1, 2, 3, 4];
export function buildFiefs() {
  return STARS.map((stars, pos) => ({
    pos,
    target: pos,   // 끝낼 때 정확히 맞춰야 하는 점수
    stars,         // 우호 시 얻는 승점
  }));
}

// 난이도
export const DIFFICULTIES = {
  bronze: { id: 'bronze', name: 'Bronze',   ko: '브론즈',   sub: 'Standard',  min: 16 },
  silver: { id: 'silver', name: 'Silver',   ko: '실버',     sub: 'Advanced',  min: 18 },
  gold:   { id: 'gold',   name: 'Gold',     ko: '골드',     sub: 'Idealist',  min: 20 },
};

// ============================================================
// 캐릭터 카드 (특수 카드) — 24장: 무늬당 6장
//   rank: J(Jack) / Q(Queen) / K(King)
//   crown: true 면 상급(왕관) 카드 — 입문 게임에서는 제외
//   intro 게임: 각 무늬 Jack = 동맹, Queen/King = 통치자
//
// ability.text : 카드에 적힌 능력 설명 (화면에 표시)
// ability.auto : 자동 실행 가능한 효과 키 (없으면 수동 도구로 직접 실행)
//
// ⚠️ 능력 텍스트는 실제 카드를 보고 채워야 정확합니다.
//    placeholder=true 인 항목은 추정/임시값이니 함께 교정해 주세요.
// ============================================================

// 능력을 간편히 정의하기 위한 헬퍼
function ch(suit, rank, crown, name, ability) {
  return {
    id: `${suit}${rank}${crown ? '+' : ''}`,
    suit, rank, crown,
    name,
    ability,
  };
}

// auto 효과 키 (engine 에서 해석):
//   'draw:N'              덱에서 N장 뽑기
//   'discardThenDraw:D:N' D장 버리고 N장 뽑기
//   'drawThenDiscard:N:D' N장 뽑고 D장 버리기
// 그 외는 text 를 보고 수동 도구(뽑기/버리기)로 직접 실행.

// 능력 효과(effect)는 "단계(step)"의 배열로 표현한다. (engine 의 STEP_TYPES 가 해석)
//   { type:'draw', n }                덱에서 n장 뽑기 (자동)
//   { type:'discard', n }             손패에서 n장 골라 버리기 (직접 선택)
//   { type:'discard', n, constraint } 조건부 버리기 (예: 합이 9)
//   { type:'message', text }          안내만 표시
// 새로운 능력 문구가 오면 여기에 단계를 조합하거나, 없는 동작이면
// engine 의 STEP_TYPES 에 새 타입을 추가한다.

// 실제 카드 이름/능력은 사진을 받는 대로 채운다.
const P = '(실제 카드 텍스트 입력 필요)';
const PH = { text: P, placeholder: true };
function trio(suit, ko, ab) {
  return [
    ch(suit, 'J', false, `${ko} 잭`,  ab.jack  || PH),
    ch(suit, 'Q', false, `${ko} 여왕`, ab.queen || PH),
    ch(suit, 'K', false, `${ko} 왕`,  ab.king  || PH),
    ch(suit, 'J', true,  `${ko} 잭`,  PH),
    ch(suit, 'Q', true,  `${ko} 여왕`, PH),
    ch(suit, 'K', true,  `${ko} 왕`,  PH),
  ];
}

export const CHARACTERS = [
  // ===== 발톱 (Claws) =====
  ...trio('C', '발톱', {
    jack: {
      flavor: '잠시만 참아',
      text: '손에 든 카드가 8장보다 적으면, 8장이 될 때까지 카드를 뽑습니다.',
      effect: [ { type: 'drawTo', n: 8 } ],
    },
    // 발톱 여왕 — 덱/버림/점수 더미 맨 위에서 골라서 최대 3장
    queen: {
      flavor: '내 기억엔 말이지',
      text: '카드 더미, 버려진 카드 더미, 점수 더미에서 맨 위 카드를 (각 더미당 1장씩, 원하는 만큼) 손으로 가져옵니다.',
      effect: [ { type: 'takeFromPiles' } ],
    },
    king: {
      flavor: '자만? 아니 자부심이야',
      text: '손에서 가장 높은 숫자를 가진 카드(들)를 점수 더미에 놓습니다.',
      effect: [ { type: 'scoreHighest' } ],
    },
  }),
  // ===== 꽃 (Flowers) =====
  ...trio('F', '꽃', {
    jack: {
      flavor: '폭탄 투하!',
      text: '현재 통치자의 무늬(트럼프)와 일치하는 손패의 모든 카드를 버립니다.',
      effect: [ { type: 'discardSuit', suit: 'trump' } ],
    },
    queen: {
      flavor: '정직한 옹즈림이네',
      text: '점수 더미의 맨 위 카드를 카드 더미 맨 위에 뒷면으로 놓습니다.',
      effect: [ { type: 'scoreTopToDeckTop' } ],
    },
    king: {
      flavor: '세상은 흑과 백으로만 이루어져 있지 않아',
      text: '숫자의 합이 정확히 9가 되는 카드 2장을 버립니다.',
      effect: [ { type: 'discard', n: 2, constraint: { sumEquals: 9 } } ],
    },
  }),
  // ===== 나뭇잎 (Leaves) =====
  ...trio('L', '나뭇잎', {
    jack: {
      flavor: '누구나 자기에게 맞는 그릇이 있지',
      text: '방문 중인 영지의 통치자를, 최대 두 칸 이내의 중립(미방문) 영지 통치자와 맞교환합니다. 현재 트럼프가 새 통치자 무늬로 바뀝니다.',
      effect: [ { type: 'swapRuler', range: 2 } ],
    },
    queen: {
      flavor: '내 말을 정확히 들거라',
      text: '방문 중인 영지에 있는 통치자의 능력을 사용합니다.',
      effect: [ { type: 'useRulerAbility' } ],
    },
    king: {
      flavor: '일어서서 전하라',
      text: '카드 더미의 맨 위 카드를 봅니다. 그것을 손에 있는 카드 1장과 바꿉니다.',
      effect: [ { type: 'swapDeckTop' } ],
    },
  }),
  // ===== 눈 (Eyes) =====
  ...trio('E', '눈', {
    jack: {
      flavor: '모든 거래는 잭에게 맡겨',
      text: '카드 2장을 뽑은 다음, 카드 2장을 버립니다.',
      effect: [ { type: 'draw', n: 2 }, { type: 'discard', n: 2 } ],
    },
    queen: {
      flavor: '장기적으로 봐야해',
      text: '카드 더미의 맨 위 카드 3장을 보고, 같은 순서로 되돌려 놓습니다.',
      effect: [ { type: 'peek', from: 'deck', n: 3 } ],
    },
    king: {
      flavor: '사각지대를 찾아라',
      text: '아무 수트 하나를 호명합니다. 카드 2장을 뽑은 다음, 손에서 호명한 수트의 카드를 모두 버립니다.',
      effect: [ { type: 'chooseSuit' }, { type: 'draw', n: 2 }, { type: 'discardSuit', suit: 'chosen' } ],
    },
  }),
];

export function charById(id) {
  return CHARACTERS.find((c) => c.id === id);
}

export const RANK_LABEL = { J: 'J', Q: 'Q', K: 'K' };
