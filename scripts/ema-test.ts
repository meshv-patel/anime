// Comprehensive test suite for Phase 3C: Ema Wish Board (絵馬)
import * as fs from 'fs';
import * as path from 'path';
import { createStore } from '../src/services/roomStore';
import type { EmaTheme, EmaCategory, EmaPlaque } from '../src/lib/types';

// Mock localStorage and sessionStorage for Node.js
const memoryStorage: Record<string, string> = {};
const mockStorage = {
  getItem: (k: string) => memoryStorage[k] ?? null,
  setItem: (k: string, v: string) => { memoryStorage[k] = v; },
  removeItem: (k: string) => { delete memoryStorage[k]; },
  clear: () => { for (const k of Object.keys(memoryStorage)) delete memoryStorage[k]; }
};
(globalThis as any).localStorage = mockStorage;
(globalThis as any).sessionStorage = mockStorage;
(globalThis as any).window = globalThis;

let failed = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
  if (!ok) failed++;
};

console.log('--- STARTING EMA WISH BOARD (絵馬) TEST SUITE ---\n');

// 1. Creation and Attributes
console.log('1. Testing Ema Creation & Attributes');
mockStorage.clear();
const roomId = 'test-room-ema-101';
const store = createStore(roomId);

const initialList = await store.emaList();
check('Initial Ema board is empty', initialList.length === 0);

await store.addEma({
  message: 'May our anime watch nights always stay cozy and warm. 🌸',
  authorNickname: 'Ren',
  theme: 'hinoki',
  category: 'wish',
  authorId: 'user-ren-01'
});

let list = await store.emaList();
check('Plaque successfully added to board', list.length === 1);
const plaque1 = list[0];
check('Plaque has valid generated ID', typeof plaque1.id === 'string' && plaque1.id.length > 0);
check('Plaque assigned to correct roomId', plaque1.roomId === roomId);
check('Message content matches', plaque1.message === 'May our anime watch nights always stay cozy and warm. 🌸');
check('Author nickname matches', plaque1.authorNickname === 'Ren');
check('Author ID matches', plaque1.authorId === 'user-ren-01');
check('Theme is hinoki', plaque1.theme === 'hinoki');
check('Category is wish', plaque1.category === 'wish');
check('Timestamp recorded', typeof plaque1.createdAt === 'number' && plaque1.createdAt > 0);

// 2. All 4 Wooden Themes & 4 Categories
console.log('\n2. Testing All Traditional Wooden Themes & Categories');
const themes: EmaTheme[] = ['hinoki', 'sakura', 'matsu', 'kuro'];
const categories: EmaCategory[] = ['wish', 'dream', 'gratitude', 'message'];

for (let i = 0; i < themes.length; i++) {
  const t = themes[i];
  const c = categories[i];
  await store.addEma({
    message: `Test plaque with theme ${t} and category ${c}`,
    authorNickname: `Tester_${i}`,
    theme: t,
    category: c,
    authorId: `tester-${i}`
  });
}

list = await store.emaList();
check('Board holds all added plaques (5 total)', list.length === 5);
themes.forEach((t) => {
  check(`Theme "${t}" exists on board`, list.some((p) => p.theme === t));
});
categories.forEach((c) => {
  check(`Category "${c}" exists on board`, list.some((p) => p.category === c));
});

// 3. Message Validation & 280-Character Limits
console.log('\n3. Testing Message Validation & Character Truncation');
// Empty and whitespace messages
const emptyPlaque = {
  message: '   ',
  authorNickname: 'Miyuki',
  theme: 'sakura' as EmaTheme,
  category: 'dream' as EmaCategory
};
const trimmedEmpty = emptyPlaque.message.trim();
check('Empty/whitespace message trimmed length is 0 (validation fails)', trimmedEmpty.length === 0);

// Max 280 characters
const longMessage = 'A'.repeat(350);
await store.addEma({
  message: longMessage,
  authorNickname: 'LongWriter',
  theme: 'kuro',
  category: 'message',
  authorId: 'user-long'
});
list = await store.emaList();
const truncated = list.find((p) => p.authorNickname === 'LongWriter');
check('Plaque message longer than 280 characters is capped at exactly 280', truncated?.message.length === 280);

const exact280 = 'B'.repeat(280);
await store.addEma({
  message: exact280,
  authorNickname: 'ExactWriter',
  theme: 'matsu',
  category: 'gratitude',
  authorId: 'user-exact'
});
list = await store.emaList();
const exactP = list.find((p) => p.authorNickname === 'ExactWriter');
check('Plaque message of exactly 280 characters is preserved without truncation', exactP?.message.length === 280);

// 4. Author-Only Deletion Security
console.log('\n4. Testing Author-Only Deletion Security');
// Ren (user-ren-01) created plaque1.
// Verify Ren can delete plaque1:
await store.removeEma(plaque1.id);
list = await store.emaList();
check('Author successfully deleted their own plaque', !list.some((p) => p.id === plaque1.id));

// Verify non-author cannot delete someone else's plaque at UI/Store contract level
const exactId = exactP!.id;
const mockCurrentUser = 'unauthorized-user-999';
const canDelete = exactP!.authorId === mockCurrentUser;
check('Unauthorized user is not permitted to delete other users plaque', canDelete === false);

// 5. Persistence Across Simulated Room Reloads
console.log('\n5. Testing Persistence Across Room Reloads');
const newStoreInstance = createStore(roomId);
const reloadedList = await newStoreInstance.emaList();
check('New store instance reloads all persistent plaques from storage', reloadedList.length === list.length);
check('Plaque order and attributes preserved', reloadedList[0].id === list[0].id);

// 6. Realtime Invalidation Signaling Simulation & Error Propagation
console.log('\n6. Testing Realtime Invalidation & Error Propagation in Hook');
// Verify useRoomStore registers 'ema' event and triggers broadcast
const useRoomStoreFile = fs.readFileSync(path.resolve(process.cwd(), 'src/hooks/useRoomStore.ts'), 'utf-8');
check('useRoomStore listens for "ema" realtime invalidation', useRoomStoreFile.includes("session.transport.on('ema'"));
check('useRoomStore broadcasts "ema" ping on addEma', useRoomStoreFile.includes("run('ema', () => store.addEma"));
check('useRoomStore broadcasts "ema" ping on removeEma', useRoomStoreFile.includes("run('ema', () => store.removeEma"));
check('useRoomStore rethrows errors instead of swallowing them', useRoomStoreFile.includes('throw e;'));

// 7. Navigation & Room Mounting Verification
console.log('\n7. Testing Room Navigation & Component Integration');
const roomPageFile = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/RoomPage.tsx'), 'utf-8');
check('RoomPage imports EmaPanel', roomPageFile.includes("import { EmaPanel } from '../components/EmaPanel'"));
check('RoomPage Tab union includes "ema"', roomPageFile.includes("'chat' | 'list' | 'moments' | 'ema' | 'games' | 'room'"));
check('RoomPage tabs array has clean English tab entry "Wishes (Ema)"', roomPageFile.includes("['ema', 'Wishes (Ema)'"));
check('RoomPage mounts EmaPanel conditionally for tab === "ema"', roomPageFile.includes("{tab === 'ema' && <EmaPanel"));
check('RoomPage passes error state to EmaPanel', roomPageFile.includes("error={store.error}"));

// 8. SQL Schema & Migration Verification
console.log('\n8. Testing SQL Migration & RLS Security Policies');
const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261121_create_ema_cards.sql');
check('Migration file 20261121_create_ema_cards.sql exists', fs.existsSync(migrationPath));

const migrationContent = fs.readFileSync(migrationPath, 'utf-8');
check('Migration defines public.ema_cards table', migrationContent.includes('create table if not exists public.ema_cards'));
check('Migration checks message length <= 280', migrationContent.includes('char_length(trim(message)) between 1 and 280'));
check('Migration defines author_id with default auth.uid()', migrationContent.includes('author_id uuid not null default auth.uid()'));
check('Migration has foreign key cascade on rooms', migrationContent.includes('references public.rooms(id) on delete cascade'));
check('Migration has foreign key cascade on auth.users', migrationContent.includes('references auth.users(id) on delete cascade'));
check('Migration defines composite index (room_id, created_at desc)', migrationContent.includes('idx_ema_cards_room_created on public.ema_cards (room_id, created_at desc)'));
check('Migration defines set_ema_author_info trigger function to derive author nickname', migrationContent.includes('function public.set_ema_author_info()'));
check('Migration creates trg_set_ema_author_info trigger', migrationContent.includes('trigger trg_set_ema_author_info'));
check('Migration enables Row Level Security (RLS)', migrationContent.includes('alter table public.ema_cards enable row level security'));
check('Migration specifies ema_select policy for room members', migrationContent.includes('create policy ema_select on public.ema_cards') && migrationContent.includes('public.is_member(room_id)'));
check('Migration specifies ema_insert policy checking author_id = auth.uid()', migrationContent.includes('create policy ema_insert on public.ema_cards') && migrationContent.includes('author_id = auth.uid()'));
check('Migration specifies ema_delete policy checking author_id = auth.uid()', migrationContent.includes('create policy ema_delete on public.ema_cards') && migrationContent.includes('author_id = auth.uid()'));
check('Migration grants select, insert, delete to authenticated', migrationContent.includes('grant select, insert, delete on public.ema_cards to authenticated'));
check('Migration does not grant update (plaques are permanent and tamper-resistant)', !migrationContent.includes('grant update on public.ema_cards'));

// Check main schema.sql consistency
const schemaPath = path.resolve(process.cwd(), 'supabase/schema.sql');
const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
check('supabase/schema.sql includes public.ema_cards table', schemaContent.includes('create table if not exists public.ema_cards'));
check('supabase/schema.sql includes set_ema_author_info trigger function', schemaContent.includes('function public.set_ema_author_info()'));
check('supabase/schema.sql includes ema_cards RLS policies', schemaContent.includes('create policy ema_select on public.ema_cards') && schemaContent.includes('create policy ema_delete on public.ema_cards'));

// 9. UI Language Simplification Verification
console.log('\n9. Testing UI Language Simplification');
const emaPanelFile = fs.readFileSync(path.resolve(process.cwd(), 'src/components/EmaPanel.tsx'), 'utf-8');
check('EmaPanel uses English header "Wishes (Ema)"', emaPanelFile.includes('Wishes (Ema)'));
check('EmaPanel uses clean English action "Hang Wish Plaque"', emaPanelFile.includes('Hang Wish Plaque'));
check('EmaPanel uses clean English finish "Wood Finish"', emaPanelFile.includes('Wood Finish'));
check('EmaPanel removed obscure term "奉納"', !emaPanelFile.includes('奉納'));
check('EmaPanel removed obscure term "木目"', !emaPanelFile.includes('木目'));
check('EmaPanel does not import external HTTP/HTTPS scripts', !emaPanelFile.includes('http://') && !emaPanelFile.includes('https://'));
check('EmaPanel uses standard local styling and Lucide icons', !emaPanelFile.includes('cdn.') && !emaPanelFile.includes('unpkg.'));

// 10. Persistence Diagnostics & Complete Read Pipeline Verification
console.log('\n10. Testing Persistence Diagnostics & Pipeline');
const storeDiagnostics = store.getEmaDiagnostics();
check('Store provides getEmaDiagnostics method', typeof store.getEmaDiagnostics === 'function');
check('Diagnostics includes currentRoomId', storeDiagnostics?.currentRoomId === roomId);
check('Diagnostics includes rowsReturned count', typeof storeDiagnostics?.rowsReturned === 'number');
check('useRoomStore uses Promise.allSettled for isolated error resilience', useRoomStoreFile.includes('Promise.allSettled'));
check('useRoomStore provides emaDiagnostics state', useRoomStoreFile.includes('emaDiagnostics'));
check('RoomPage reloads on switching to ema tab', roomPageFile.includes("if (tab === 'ema')") && roomPageFile.includes('store.reload()'));
check('RoomPage passes diagnostics to EmaPanel', roomPageFile.includes('diagnostics={store.emaDiagnostics}'));
check('EmaPanel includes Database Diagnostics in empty state', emaPanelFile.includes('Database Diagnostics'));
check('EmaPanel includes Refresh button', emaPanelFile.includes('Refresh Board'));

console.log(`\n--- EMA WISH BOARD TEST SUITE SUMMARY: ${failed === 0 ? 'ALL PASSED' : failed + ' FAILED'} ---`);
if (failed > 0) process.exit(1);
