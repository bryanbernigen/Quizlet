// Hardcoded sample content seeded into every new guest account so that
// review/quiz/spelling are immediately usable. Kept small and on-theme
// (Korean ⇄ Indonesian, matching the app).

export const GUEST_SEED_SETS = [
  {
    name: 'Greetings (Demo)',
    cards: [
      { front: '안녕하세요', back: 'Halo / Apa kabar' },
      { front: '감사합니다', back: 'Terima kasih' },
      { front: '죄송합니다', back: 'Maaf' },
      { front: '네', back: 'Ya' },
      { front: '아니요', back: 'Tidak' },
      { front: '안녕히 가세요', back: 'Selamat jalan' },
    ],
  },
  {
    name: 'Numbers 1–5 (Demo)',
    cards: [
      { front: '하나', back: 'Satu' },
      { front: '둘', back: 'Dua' },
      { front: '셋', back: 'Tiga' },
      { front: '넷', back: 'Empat' },
      { front: '다섯', back: 'Lima' },
    ],
  },
];

/**
 * Insert the seed sets and their cards for `userId` using an open
 * transaction `client`. Caller owns BEGIN/COMMIT/ROLLBACK.
 */
export async function seedGuestContent(client, userId) {
  for (const set of GUEST_SEED_SETS) {
    const { rows } = await client.query(
      'INSERT INTO sets (name, user_id) VALUES ($1, $2) RETURNING id',
      [set.name, userId]
    );
    const setId = rows[0].id;
    if (set.cards.length > 0) {
      const placeholders = set.cards
        .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
        .join(', ');
      const flat = set.cards.flatMap(c => [setId, c.front, c.back]);
      await client.query(
        `INSERT INTO cards (set_id, front, back) VALUES ${placeholders}`,
        flat
      );
    }
  }
}
