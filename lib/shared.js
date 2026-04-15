export const PUZZLES_PER_PLAYER = 3;
export const DEFAULT_ROUNDS = 3;
export const MAX_SCORE_PER_PUZZLE = 4;

export const SPECTRA = [
    ['Cheap', 'Expensive'],
    ['Dangerous', 'Safe'],
    ['Messy', 'Organized'],
    ['Sexy', 'Unsexy'],
    ['Chaotic', 'Orderly'],
    ['Hot', 'Cold'],
    ['Flexible', 'Rigid'],
    ['Normal', 'Weird'],
    ['Relaxing', 'Stressful'],
    ['Trashy', 'Classy'],
    ['Heroic', 'Cowardly'],
    ['Tasty', 'Gross'],
    ['Useful', 'Useless'],
    ['Soft', 'Hard'],
    ['Fast', 'Slow'],
    ['Trustworthy', 'Sketchy'],
    ['Fancy', 'Plain'],
    ['Overrated', 'Underrated'],
    ['Smart', 'Dumb'],
    ['Clean', 'Dirty'],
    ['Friendly', 'Hostile'],
    ['Powerful', 'Weak'],
    ['Calm', 'Unhinged'],
    ['Fun', 'Boring'],
    ['Elegant', 'Clumsy'],
    ['Polite', 'Rude'],
    ['Stable', 'Volatile'],
    ['Ancient', 'Futuristic'],
    ['Efficient', 'Wasteful'],
    ['Cozy', 'Bleak'],
    ['Practical', 'Impractical'],
    ['Believable', 'Absurd'],
    ['Smooth', 'Jagged'],
    ['Strong', 'Fragile'],
    ['Simple', 'Complicated'],
    ['Public', 'Private'],
    ['Blessed', 'Cursed'],
    ['Grounded', 'Pretentious'],
    ['Delicate', 'Brutal'],
    ['Subtle', 'Obvious'],
    ['Traditional', 'Experimental'],
    ['Sincere', 'Performative'],
    ['Lucky', 'Unlucky'],
    ['Comforting', 'Threatening'],
    ['Wholesome', 'Degenerate'],
    ['Reliable', 'Chaotic'],
    ['Cute', 'Intimidating'],
    ['Artistic', 'Mechanical'],
    ['Joyful', 'Miserable'],
    ['Honorable', 'Shady'],
    ['Cool', 'Lame'],
    ['Mainstream', 'Obscure'],
    ['Natural', 'Artificial'],
    ['Light', 'Heavy'],
    ['Legal', 'Questionable'],
    ['Disciplined', 'Impulsive'],
    ['Romantic', 'Clinical'],
    ['Sacred', 'Profane'],
    ['Tidy', 'Ferocious'],
    ['Playable', 'Cursed']
];

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function makeCode(length = 5) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < length; i += 1) {
        out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return out;
}

export function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function shuffle(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

export function scoreGuess(target, guess) {
    const distance = Math.abs(target - guess);
    if (distance <= 2) return { distance, points: 4 };
    if (distance <= 4) return { distance, points: 3 };
    if (distance <= 8) return { distance, points: 2 };
    if (distance <= 10) return { distance, points: 1 };
    return { distance, points: 0 };
}

export function formatSpectrum(spectrum) {
    return `${spectrum.left} ↔ ${spectrum.right}`;
}
