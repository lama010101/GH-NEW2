import * as dotenv from 'dotenv';
import * as path from 'path';
import { randomUUID } from 'crypto';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { createCompeteSession } from '../../../src/server/sessionCore';

async function main() {
  const playerId = randomUUID();
  const snapshot = await createCompeteSession({
    playerId,
    displayName: 'HostPlayer',
    mode: 'sync',
    roundTimerSec: 30,
    totalRounds: 2,
    yearMin: 1900,
    yearMax: 2000,
    resultsAutoAdvanceSec: 3,
  });
  console.log('HOST_ID', playerId);
  console.log('GAME_ID', snapshot.gameId);
  console.log('ROOM_CODE', snapshot.roomCode);
}

main().catch(err => { console.error(err); process.exit(1); });
