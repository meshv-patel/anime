import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Bookmark, ChevronsRight, Clapperboard, Copy, Crown, ListVideo, MessagesSquare, Settings, Wifi, WifiOff, Columns2, Rows2, Dices, Activity, MonitorUp, MonitorOff, Scroll } from 'lucide-react';
import { Chat } from '../components/Chat';
import { DiagnosticsOverlay } from '../components/DiagnosticsOverlay';
import { EmaPanel } from '../components/EmaPanel';
import { GamesPanel } from '../components/GamesPanel';
import { MediaDock } from '../components/MediaDock';
import { ModeBadge } from '../components/ModeBadge';
import { MomentsPanel, RoomPanel, WatchlistPanel } from '../components/Panels';
import { ReactionBar } from '../components/ReactionBar';
import { SourceForm } from '../components/SourceForm';
import { Stage, type LocalFile } from '../components/Stage';
import { Avatar } from '../components/Avatar';
import { Furin } from '../components/Furin';
import { SeasonalAtmosphere } from '../components/SeasonalAtmosphere';
import { useChat } from '../hooks/useChat';
import { useFullscreen } from '../hooks/useFullscreen';
import { useReactions } from '../hooks/useReactions';
import { useRoomSession } from '../hooks/useRoomSession';
import { useRoomStore } from '../hooks/useRoomStore';
import { liveConfigured } from '../lib/env';
import { isValidRoomId } from '../lib/ids';
import { loadPrefs, loadProfile, savePrefs, type Prefs } from '../lib/storage';
import type { MediaSource, Profile } from '../lib/types';

type Tab = 'chat' | 'list' | 'moments' | 'ema' | 'games' | 'room';
const noopSub = () => () => {};

export default function RoomPage() {
  const { roomId = '' } = useParams();
  const profile = loadProfile();
  if (!isValidRoomId(roomId)) return <Fail msg="That room link is not valid." />;
  if (!profile) return <Navigate to={`/start?join=${roomId}`} replace />;
  return <RoomView roomId={roomId} profile={profile} />;
}

function Fail({ msg }: { msg: string }) {
  return (
    <div className="grid min-h-screen place-items-center p-6"><div className="panel max-w-md p-8 text-center"><p className="text-4xl">🍂</p><h1 className="mt-3 font-display text-2xl font-bold">Can't open this room</h1><p className="mt-2 text-sm text-paper/70" role="alert">{msg}</p><Link to="/start" className="btn-lantern mt-6">Create or join another room</Link></div></div>
  );
}

function RoomView({ roomId, profile }: { roomId: string; profile: Profile }) {
  const nav = useNavigate();
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const [tab, setTab] = useState<Tab>('chat');
  const [panelOpen, setPanelOpen] = useState(true);
  const [theater, setTheater] = useState(false);
  const [viewMode, setViewMode] = useState<'video' | 'screen'>('video');
  const [localFile, setLocalFile] = useState<LocalFile | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const tablistRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const cdTimer = useRef<ReturnType<typeof setInterval>>();

  const S = useRoomSession(roomId, profile);
  const { session, peers } = S;
  const { isFs, toggle: toggleFs, supported: fsSupported } = useFullscreen(stageRef);
  const chatVisible = panelOpen && tab === 'chat' && !isFs && !theater;
  const chat = useChat(session, profile, peers, chatVisible, !chatVisible, prefs);
  const rx = useReactions(session, peers, profile.nickname);
  const store = useRoomStore(roomId, session);
  useSyncExternalStore((cb) => session?.media.subscribe(cb) ?? noopSub(), () => session?.media.version ?? 0);

  const setPrefs = (p: Prefs) => { setPrefsState(p); savePrefs(p); };
  const media = session?.media;
  const screenState = media?.getScreenState() ?? { state: 'idle', sharerId: null, isLocal: false, hasAudio: false, warning: null };
  const remoteSharerId = media?.remoteSharer() ?? null;
  const screenStream = media ? (media.local.screen ?? (remoteSharerId ? media.remote.get(remoteSharerId)?.screen ?? null : null)) : null;
  const sharerName = peers.find((p) => p.clientId === (screenState.sharerId ?? remoteSharerId))?.nickname ?? 'Someone';
  const isScreenSharing = media?.isLocal('screen') ?? false;

  // Jump to the shared screen when someone else starts sharing or when we start sharing
  useEffect(() => {
    if (remoteSharerId || isScreenSharing) {
      setViewMode('screen');
    }
  }, [remoteSharerId, isScreenSharing]);

  const handleStartScreen = async () => {
    try {
      await media?.start('screen');
      setViewMode('screen');
    } catch (e) {
      console.warn('Failed to start screen share', e);
    }
  };

  const handleStopScreen = () => {
    media?.stop('screen');
  };

  // A local-file source needs each viewer's own copy; forget ours when the source changes to something else.
  useEffect(() => {
    setLocalFile((f) => { const s = S.source; if (s?.kind === 'local' && f && f.name === s.fileName) return f; if (f) URL.revokeObjectURL(f.url); return null; });
  }, [S.source]);
  useEffect(() => () => { setLocalFile((f) => { if (f) URL.revokeObjectURL(f.url); return null; }); }, []);

  // 3-2-1 countdown (each client counts locally; the initiator resumes playback)
  const runCountdown = useCallback((initiator: boolean) => {
    if (cdTimer.current) clearInterval(cdTimer.current);
    let n = 3; setCountdown(n);
    cdTimer.current = setInterval(() => {
      n -= 1;
      if (n > 0) { setCountdown(n); return; }
      clearInterval(cdTimer.current); setCountdown(null);
      if (initiator) void session?.sync.play();
    }, 1000);
  }, [session]);
  useEffect(() => session?.transport.on('cd', () => runCountdown(false)), [session, runCountdown]);
  useEffect(() => () => { if (cdTimer.current) clearInterval(cdTimer.current); }, []);
  const startCountdown = () => { if (!session || !S.canControl || !S.source) return; session.sync.pause(); session.transport.send('cd', {}); runCountdown(true); };

  const pickLocal = (f: File) => setLocalFile({ url: URL.createObjectURL(f), name: f.name, size: f.size });
  const loadLocalAsSource = (f: File) => {
    pickLocal(f);
    session?.sync.setSource({ kind: 'local', url: '', title: f.name.replace(/\.[^.]+$/, ''), fileName: f.name, size: f.size });
  };
  const loadSource = (s: MediaSource) => session?.sync.setSource(s);

  // Auto-scroll selected tab into view in the horizontally scrollable tabstrip
  useEffect(() => {
    const el = tabRefs.current[tab];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
    if (tab === 'ema') {
      void store.reload();
    }
  }, [tab]);

  if (S.phase === 'error') return <Fail msg={S.error} />;
  if (S.phase === 'loading' || !session || !S.room) return <div className="grid min-h-screen place-items-center"><span className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-lantern-400" role="status" aria-label="Joining room" /></div>;

  const connected = S.status === 'connected';
  const inviteUrl = `${window.location.origin}/room/${roomId}`;
  const host = peers.find((p) => p.userId === S.room!.hostId);
  const tabs: Array<[Tab, string, JSX.Element, number?]> = [
    ['chat', 'Chat', <MessagesSquare size={16} />, chat.unread],
    ['list', 'Watchlist', <ListVideo size={16} />],
    ['moments', 'Moments', <Bookmark size={16} />],
    ['ema', 'Wishes (Ema)', <Scroll size={16} />],
    ['games', 'Games', <Dices size={16} />],
    ['room', 'Room', <Settings size={16} />]
  ];
  const sideVisible = panelOpen || theater;

  return (
    <div className="relative mx-auto max-w-[1500px] px-3 pb-10 pt-3 sm:px-5">
      <SeasonalAtmosphere />
      <header className="relative z-10 mb-3 flex flex-wrap items-center gap-3">
        <Link to="/" className="font-display text-lg font-extrabold">🌸 Anime Together</Link>
        <ModeBadge />
        <span role="status" className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${connected ? 'bg-emerald-400/15 text-emerald-300' : 'bg-sakura-500/25 text-sakura-200'}`}>{connected ? <Wifi size={13} /> : <WifiOff size={13} />}{connected ? 'Connected' : S.status === 'connecting' ? 'Connecting…' : S.status === 'reconnecting' ? 'Reconnecting…' : 'Offline'}</span>
        {S.isHost && (
          <button
            className={`btn ${isScreenSharing ? 'bg-sakura-500 text-white hover:bg-sakura-600' : 'btn-lantern'} flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold shadow-md`}
            onClick={() => void (isScreenSharing ? handleStopScreen() : handleStartScreen())}
            title={isScreenSharing ? 'Stop screen sharing' : 'Start sharing screen & audio'}
          >
            {isScreenSharing ? <MonitorOff size={14} /> : <MonitorUp size={14} />}
            <span>{isScreenSharing ? 'Stop Sharing' : 'Share Screen'}</span>
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex -space-x-2">{peers.map((p) => <Avatar key={p.clientId} value={p.avatar} size={32} title={p.nickname + (p.userId === S.room!.hostId ? ' (host)' : '')} />)}</div>
          <Furin />
          <button className={`icon-btn ${diagOpen ? 'bg-lantern-400 text-ink-950' : ''}`} onClick={() => setDiagOpen(!diagOpen)} aria-label="Toggle diagnostics" title="Toggle diagnostics (Ctrl+Shift+D)"><Activity size={16} /></button>
          <button className="icon-btn" onClick={() => void navigator.clipboard?.writeText(inviteUrl)} aria-label="Copy invitation link" title="Copy invitation link"><Copy size={16} /></button>
          <button className={`icon-btn ${theater ? 'bg-lantern-400 text-ink-950' : ''}`} aria-pressed={theater} onClick={() => setTheater(!theater)} aria-label="Theater mode" title="Theater mode">{theater ? <Rows2 size={16} /> : <Clapperboard size={16} />}</button>
          <button className="icon-btn relative" aria-pressed={panelOpen} onClick={() => setPanelOpen(!panelOpen)} aria-label={panelOpen ? 'Collapse side panel' : 'Expand side panel'} title="Toggle side panel">{panelOpen ? <ChevronsRight size={16} /> : <Columns2 size={16} />}
            {!panelOpen && chat.unread > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-lantern-400 px-1 text-[10px] font-extrabold text-ink-950">{chat.unread}</span>}</button>
        </div>
      </header>

      {!connected && <p role="alert" className="relative z-10 mb-3 rounded-2xl bg-sakura-500/20 px-4 py-2 text-sm">{S.status === 'offline' ? 'Realtime is unavailable, so nothing you do will reach other people.' : 'Realtime connection interrupted. Reconnecting; playback, chat and reactions may not reach others until it returns.'}</p>}

      <div className={`relative z-10 grid gap-4 ${sideVisible && !theater ? 'lg:grid-cols-[minmax(0,1fr)_380px]' : ''}`}>
        <main className="min-w-0 space-y-4">
          <Stage
            stageRef={stageRef}
            sync={session.sync}
            source={S.source}
            localFile={localFile}
            canControl={S.canControl}
            syncStatus={S.syncStatus}
            isFs={isFs}
            fsSupported={fsSupported}
            onFs={() => void toggleFs()}
            viewMode={viewMode}
            onViewMode={setViewMode}
            screenStream={screenStream}
            screenOwner={media!.local.screen ? 'me' : remoteSharerId}
            sharerName={sharerName}
            isHost={S.isHost}
            hostName={host?.nickname ?? 'The host'}
            screenStatus={screenState.state}
            hasScreenAudio={screenState.hasAudio}
            screenAudioWarning={screenState.warning}
            onStartScreen={handleStartScreen}
            onStopScreen={handleStopScreen}
            floats={rx.floats}
            fx={rx.fx}
            toasts={chat.toasts}
            unread={chatVisible ? 0 : chat.unread}
            countdown={countdown}
            theater={theater}
            onPickLocal={pickLocal}
          />

          <section className="panel flex flex-wrap items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-xl font-bold">
                {isScreenSharing
                  ? '📺 Sharing your screen & audio'
                  : remoteSharerId
                  ? `📺 Watching ${sharerName}'s screen share`
                  : S.source?.title ?? 'Ready for screen sharing'}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-paper/60">
                <span className="flex items-center gap-1"><Crown size={12} className="text-lantern-400" />Host: {host?.nickname ?? 'away'}{S.isHost && ' (you)'}</span>
                <span>{S.hostOnly ? 'Host controls playback' : 'Everyone can control playback'}</span>
              </p>
            </div>
            <ReactionBar onReact={rx.send} disabled={!connected} />
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="panel p-4">
              <h2 className="mb-3 font-bold flex items-center justify-between">
                <span>Watch party audio &amp; video</span>
                <span className="text-xs font-normal text-paper/50">Primary Experience</span>
              </h2>
              <MediaDock media={session.media} peers={peers} myId={session.transport.clientId} isHost={S.isHost} />
            </section>
            <section className="panel p-4">
              <h2 className="mb-3 font-bold flex items-center justify-between">
                <span>Alternative: Direct video link</span>
                <span className="text-xs font-normal text-paper/50">MP4 / HLS Stream</span>
              </h2>
              <SourceForm canControl={S.canControl} onLoad={loadSource} onLocal={loadLocalAsSource} />
            </section>
          </div>
        </main>

        {sideVisible && (
          <aside className={`panel flex min-h-0 flex-col overflow-hidden ${theater ? 'h-[520px]' : 'h-[560px] lg:sticky lg:top-3 lg:h-[calc(100vh-1.5rem)]'}`} aria-label="Room side panel">
            <div
              ref={tablistRef}
              role="tablist"
              aria-label="Room navigation"
              className="flex min-w-0 max-w-full flex-nowrap items-center gap-1.5 overflow-x-auto border-b border-white/10 p-2 scroll-smooth scrollbar-thin [overflow-scrolling:touch]"
            >
              {tabs.map(([id, label, icon, badge]) => (
                <button
                  key={id}
                  ref={(el) => { tabRefs.current[id] = el; }}
                  role="tab"
                  aria-selected={tab === id}
                  tabIndex={tab === id ? 0 : -1}
                  onClick={() => setTab(id)}
                  className={`relative flex flex-shrink-0 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-lantern-400 ${
                    tab === id ? 'bg-white/15 text-paper shadow-sm' : 'text-paper/60 hover:bg-white/5 hover:text-paper'
                  }`}
                >
                  {icon}
                  <span>{label}</span>
                  {!!badge && tab !== id && (
                    <span className="grid h-4 min-w-4 place-items-center rounded-full bg-lantern-400 px-1 text-[10px] font-extrabold text-ink-950">
                      {badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {tab === 'chat' && <Chat messages={chat.messages} myClientId={session.transport.clientId} typingNames={chat.typingNames} onSend={chat.send} onTyping={chat.notifyTyping} disabled={!connected} />}
              {tab === 'list' && <WatchlistPanel items={store.watch} error={store.error} onAdd={store.addWatch} onUpdate={store.updateWatch} onRemove={store.removeWatch} />}
              {tab === 'moments' && (
                <MomentsPanel
                  items={store.moments}
                  error={store.error}
                  canSeek={S.canControl}
                  hasVideo={!!S.source}
                  onSave={async (note) => {
                    try {
                      await store.addMoment({
                        note,
                        position: S.source ? session.sync.currentTime() : 0,
                        sourceTitle: S.source?.title ?? ''
                      });
                      return true;
                    } catch {
                      return false;
                    }
                  }}
                  onSeek={(t) => session.sync.seek(t)}
                  onRemove={store.removeMoment}
                />
              )}
              {tab === 'ema' && <EmaPanel items={store.emaList} currentUserId={session.userId} authorNickname={profile.nickname} isDemo={!liveConfigured} error={store.error} roomId={roomId} diagnostics={store.emaDiagnostics} onReload={store.reload} onAdd={store.addEma} onRemove={store.removeEma} />}
              {tab === 'games' && <GamesPanel session={session} roomId={roomId} userId={session.userId} nickname={profile.nickname} avatar={profile.avatar} isHost={S.isHost} />}
              {tab === 'room' && <RoomPanel inviteUrl={inviteUrl} peers={peers} myClientId={session.transport.clientId} hostId={S.room.hostId} isHost={S.isHost} hostOnly={S.hostOnly} prefs={prefs}
                expiresAt={S.room.expiresAt} maxParticipants={S.room.maxParticipants} demo={!liveConfigured} onHostOnly={S.setHostOnly} onTransfer={(p) => void S.transferHost(p)} onPrefs={setPrefs}
                onCountdown={startCountdown} canCountdown={S.canControl && !!S.source} onLeave={() => nav('/')} />}
            </div>
          </aside>
        )}
      </div>

      <DiagnosticsOverlay
        isOpen={diagOpen}
        onClose={() => setDiagOpen(false)}
        getDiagnostics={async () => {
          const base = await S.getDiagnostics();
          return {
            ...base,
            screenAudio: media?.getScreenAudioDiagnostics() ?? null,
            ema: {
              ...store.emaDiagnostics,
              reactStateCount: store.emaList.length
            }
          };
        }}
      />
    </div>
  );
}
