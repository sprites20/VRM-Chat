// noise.js
import { createNoise2D } from 'simplex-noise';

const seed = 'qwertyuiop'; // can use a UUID or random string
const random = () => {
  let x = seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return () => (x = (x * 16807) % 2147483647) / 2147483647;
};
const noise2D = createNoise2D(random());

export default noise2D;
