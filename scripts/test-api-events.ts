import { fetchEventsWithDetails } from '../src/server/events';

async function test() {
  try {
    const events = await fetchEventsWithDetails({ limit: 3 });
    console.log('Events returned:', events.length);
    if (events.length > 0) {
      console.log('Sample event:', JSON.stringify(events[0], null, 2));
    }
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

test();
