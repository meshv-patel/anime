import { liveConfigured } from '../lib/env';
import { LiveTransport } from './liveTransport';
import { LocalTransport } from './localTransport';
import type { Transport } from './transport';

export const createTransport = (roomId: string): Transport => (liveConfigured ? new LiveTransport(roomId) : new LocalTransport(roomId));
