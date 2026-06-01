// Test haversineDistanceKm with antimeridian case
import { haversineDistanceKm } from '../src/core/rules.ts';

const result = haversineDistanceKm({ lat: 0, lng: 170 }, { lat: 0, lng: -170 });
console.log(`Distance from (0, 170) to (0, -170): ${result} km`);
console.log(`Expected: ~2228 km`);
console.log(`Pass: ${Math.abs(result - 2228) < 100 ? 'YES' : 'NO'}`);
