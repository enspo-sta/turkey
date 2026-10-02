// Where the two buildings you visit most stand, worked out from the places
// alone: Ruben's cabin above Hotrod Landing and the Kenai Trading Post by
// the junction. The world levels a yard for each before the terrain is built
// (see World.levelPad and generateWorld), and the props build on them (see
// Props.computeLayout and world/buildings.js). Local +z is a building's
// front.

// The cabin: 17 m up the bank from the landing and 7 m to its side,
// facing the river.
export function cabinSite(W) {
  const landing = W.place('landing');
  const d = { x: -Math.sin(landing.face), z: -Math.cos(landing.face) }; // toward the water
  const r = { x: -d.z, z: d.x };
  return { x: landing.x - d.x * 17 + r.x * 7, z: landing.z - d.z * 17 + r.z * 7, yaw: Math.atan2(d.x, d.z) };
}

// The Trading Post: south-east of the junction, facing it.
export function postSite(W) {
  const post = W.place('post');
  const jx = -60;
  const jz = 428;
  const x = post.x + 16;
  const z = post.z + 24;
  return { x, z, yaw: Math.atan2(jx - x, jz - z) };
}

// The yards to level: a rectangle in each building's frame (x0..x1 across,
// z0..z1 front to back) brought to a plane through the ground at (0, zRef)
// that falls `fall` per metre toward the front, blended into the land
// around it over `blend` metres. The cabin's yard falls gently toward the
// river and stops short of the landing; the Trading Post's front yard
// rises gently toward the road and leaves its back, where the ground drops
// away, to its stone basement.
export function sitePads(W) {
  const cabin = cabinSite(W);
  const post = postSite(W);
  const ground = (s, lx, lz) => {
    const c = Math.cos(s.yaw);
    const n = Math.sin(s.yaw);
    return W.heightAt(s.x + lx * c + lz * n, s.z - lx * n + lz * c);
  };
  return [
    { ...cabin, x0: -8, x1: 8.5, z0: -4.5, z1: 9.5, zRef: 0, h0: ground(cabin, 0, 0), fall: 0.06, blend: 6 },
    { ...post, x0: -8.5, x1: 8.5, z0: 3.5, z1: 15, zRef: 9, h0: ground(post, 0, 9), fall: -0.07, blend: 6 },
  ];
}
