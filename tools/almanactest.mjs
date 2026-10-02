import { almanac, almanacLines } from '../src/gameplay/tonight.js';
for (const n of [1, 2, 5, 9, 14]) {
  const A = almanac(n);
  console.log(`Night ${n}: ${A.date}`);
  for (const [k, v] of almanacLines(A)) console.log(`  ${k}: ${v}`);
}
