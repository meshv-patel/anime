// Comprehensive test suite for Anime Bingo logic, board generation, line detection, and synchronization
import { generateBingoTropes, FREE_SPACE_TROPE } from '../src/lib/bingoTropes';
import { checkBingoLines, BINGO_LINES } from '../src/hooks/useBingo';
import { createGamesStore } from '../src/services/gamesStore';

// Mock localStorage for headless Node.js
const memoryStorage: Record<string, string> = {};
const mockStorage = {
  getItem: (k: string) => memoryStorage[k] ?? null,
  setItem: (k: string, v: string) => { memoryStorage[k] = v; },
  removeItem: (k: string) => { delete memoryStorage[k]; },
  clear: () => { for (const k of Object.keys(memoryStorage)) delete memoryStorage[k]; }
};
(globalThis as any).localStorage = mockStorage;
(globalThis as any).sessionStorage = mockStorage;

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
  if (!ok) failed++;
};

console.log('--- STARTING ANIME BINGO TEST SUITE ---\n');

// 1. Board Generation & Center Free Space
console.log('1. Testing Board Generation & Center Free Space');
const card1 = generateBingoTropes('all', 'test-seed-1');
check('Board has exactly 25 tropes', card1.length === 25);
check('Center square (index 12) is the Free Space', card1[12].isFree === true && card1[12].id === FREE_SPACE_TROPE.id);
check('Other 24 squares are non-free unique tropes', card1.filter((t) => !t.isFree).length === 24);

const cardGenre = generateBingoTropes('shonen', 'test-seed-2');
check('Category-filtered board has 25 tropes', cardGenre.length === 25);
check('Category-filtered board center is Free Space', cardGenre[12].isFree === true);

// 2. Line Completion Detections
console.log('\n2. Testing Winning Line Detections (5x5 Grid)');
// Row completion (Row 0: [0, 1, 2, 3, 4])
const r0 = checkBingoLines([0, 1, 2, 3, 4]);
check('Row 0 completion detected', r0.hasBingo && r0.lines.some((l) => l.join(',') === '0,1,2,3,4'));

// Row 2 (middle row including free space 12: [10, 11, 12, 13, 14])
const r2 = checkBingoLines([10, 11, 13, 14]); // 12 is automatically free
check('Row 2 completion detected using automatic Free Space', r2.hasBingo && r2.lines.some((l) => l.join(',') === '10,11,12,13,14'));

// Column completion (Col 1: [1, 6, 11, 16, 21])
const c1 = checkBingoLines([1, 6, 11, 16, 21]);
check('Col 1 completion detected', c1.hasBingo && c1.lines.some((l) => l.join(',') === '1,6,11,16,21'));

// Main Diagonal ([0, 6, 12, 18, 24])
const d1 = checkBingoLines([0, 6, 18, 24]);
check('Main diagonal completion detected with Free Space', d1.hasBingo && d1.lines.some((l) => l.join(',') === '0,6,12,18,24'));

// Anti-Diagonal ([4, 8, 12, 16, 20])
const d2 = checkBingoLines([4, 8, 16, 20]);
check('Anti-diagonal completion detected with Free Space', d2.hasBingo && d2.lines.some((l) => l.join(',') === '4,8,12,16,20'));

// Multiple Bingo detection (intersecting Row 0 and Col 0: [0,1,2,3,4] + [0,5,10,15,20])
const multi = checkBingoLines([0, 1, 2, 3, 4, 5, 10, 15, 20]);
check('Multiple bingo lines detected simultaneously', multi.count === 2);

// Incomplete line
const incomplete = checkBingoLines([0, 1, 2, 3]); // missing index 4
check('Incomplete line does not trigger bingo', !incomplete.hasBingo && incomplete.count === 0);

// 3. Store Operations & Duplicate Marking
console.log('\n3. Testing Store Operations & Duplicate Marking');
const store = createGamesStore();
const roomId = 'bingoroomtest1234567';

// Create Co-op game
const { game: coopGame, board: coopBoard } = await store.createBingoGame(roomId, 'cooperative', 'all', card1, 'seed-coop');
check('Cooperative game created with active status', coopGame.status === 'active' && coopGame.mode === 'cooperative');
check('Cooperative board initial marks include Free Space 12', coopBoard.marks.includes(12));

// Mark square 5
const marks1 = await store.markBingoSquare(coopGame.id, coopBoard.id, 5, 'user-1');
check('Square marked successfully', marks1.includes(5));

// Duplicate mark: marking 5 again must be safely idempotent
const marksDuplicate = await store.markBingoSquare(coopGame.id, coopBoard.id, 5, 'user-2');
check('Duplicate marking is idempotent and safe', marksDuplicate.filter((m) => m === 5).length === 1);

// Unmark square 5
const marksUnmark = await store.unmarkBingoSquare(coopGame.id, coopBoard.id, 5, 'user-1');
check('Square unmarked successfully', !marksUnmark.includes(5));

// Unmarking Free Space (12) must be prevented
const marksFreeUnmark = await store.unmarkBingoSquare(coopGame.id, coopBoard.id, 12, 'user-1');
check('Free Space (12) cannot be unmarked', marksFreeUnmark.includes(12));

// 4. Cooperative Synchronization
console.log('\n4. Testing Cooperative Board Synchronization');
// User 2 marks square 7 on the shared cooperative board
const coMarks = await store.markBingoSquare(coopGame.id, coopBoard.id, 7, 'user-2');
const reloadedCoopBoard = await store.getBingoBoard(coopGame.id, null);
check('Co-op mark visible to all users on shared board', reloadedCoopBoard?.marks.includes(7) === true);

// 5. Competitive Board Isolation
console.log('\n5. Testing Competitive Board Isolation');
const { game: compGame, board: p1Board } = await store.createBingoGame(roomId, 'competitive', 'shonen', card1, 'seed-comp');
const p2Board = await store.joinBingoBoard(compGame.id, roomId, 'user-2', generateBingoTropes('shonen', 'seed-comp-p2'));

check('Player 1 and Player 2 receive distinct boards', p1Board.id !== p2Board.id);

// Player 1 marks square 1 on their board
await store.markBingoSquare(compGame.id, p1Board.id, 1, 'user-1');

// Player 2 board must NOT have square 1 marked
const p2Reloaded = await store.getBingoBoard(compGame.id, 'user-2');
check('Player 2 board remains isolated from Player 1 marks', !p2Reloaded?.marks.includes(1));

// Player 2 attempting to mark Player 1 board must be REJECTED
let markRejected = false;
try {
  await store.markBingoSquare(compGame.id, p1Board.id, 8, 'user-2');
} catch {
  markRejected = true;
}
check('Unauthorized modification of another player’s competitive board is rejected', markRejected);

// 6. Reset Behavior
console.log('\n6. Testing Game Reset Behavior');
await store.resetBingoGame(compGame.id, roomId);
const activeGameAfterReset = await store.getBingoGame(roomId);
check('Reset game is no longer active', activeGameAfterReset === null);

console.log(failed ? `\n${failed} Bingo test(s) FAILED` : '\nAll Anime Bingo tests PASSED!');
process.exit(failed ? 1 : 0);
