import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import Landing from './pages/Landing';
import Lobby from './pages/Lobby';
import RoomPage from './pages/RoomPage';
import { initGlobalButtonSound } from './lib/furinAudio';

export default function App() {
  useEffect(() => {
    return initGlobalButtonSound();
  }, []);

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/start" element={<Lobby />} />
        <Route path="/room/:roomId" element={<RoomPage />} />
        <Route path="*" element={<Landing />} />
      </Routes>
    </ErrorBoundary>
  );
}
