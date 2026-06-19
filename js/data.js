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

// 실제 카드 이름/능력은 사진을 받는 대로 채운다. 지금은 무늬+등급 임시 이름.
const P = '(실제 카드 텍스트 입력 필요)';
function trio(suit, ko) {
  return [
    ch(suit, 'J', false, `${ko} J`,    { text: P, placeholder: true }),
    ch(suit, 'Q', false, `${ko} Q`,    { text: P, placeholder: true }),
    ch(suit, 'K', false, `${ko} K`,    { text: P, placeholder: true }),
    ch(suit, 'J', true,  `${ko} J`, { text: P, placeholder: true }),
    ch(suit, 'Q', true,  `${ko} Q`, { text: P, placeholder: true }),
    ch(suit, 'K', true,  `${ko} K`, { text: P, placeholder: true }),
  ];
}

export const CHARACTERS = [
  ...trio('C', '발톱'),
  ...trio('F', '꽃'),
  ...trio('L', '나뭇잎'),
  ...trio('E', '눈'),
];

export function charById(id) {
  return CHARACTERS.find((c) => c.id === id);
}

export const RANK_LABEL = { J: 'J', Q: 'Q', K: 'K' };
