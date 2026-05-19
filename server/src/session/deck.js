export const ROLES = ['director', 'agent', 'shield', 'liaison', 'chief'];

export function deckCountForMembers(n) {
  return Math.max(1, Math.ceil(n / 6));
}

export function buildDeck(memberCount) {
  const decks = deckCountForMembers(memberCount);
  const cards = [];
  for (let d = 0; d < decks; d++) {
    for (const role of ROLES) {
      for (let i = 0; i < 3; i++) {
        cards.push({ id: `${role}-${d}-${i}`, role });
      }
    }
  }
  return shuffle(cards);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function draw(pool, n = 1) {
  const drawn = pool.splice(0, n);
  return drawn;
}
