const test = require("node:test");
const assert = require("node:assert/strict");
const { state, layout, routePoint } = require("../public/landing-story");

test("check follows the five specified scroll ranges in either direction", () => {
  const samples = [[0, 0], [.1999, 0], [.2, 1], [.3999, 1], [.4, 2],
    [.5999, 2], [.6, 3], [.7499, 3], [.75, 4], [1, 4]];
  for (const [progress, stage] of [...samples, ...samples.slice().reverse()]) {
    assert.equal(state(progress).stage, stage);
  }
  assert.equal(state(-3).progress, 0);
  assert.equal(state(3).progress, 1);
});

test("notification cannot begin before the failure and unwinds on backward scroll", () => {
  for (let p = 0; p <= .75; p += .01) assert.equal(state(p).notify, 0);
  assert.equal(state(.8).failure, 1);
  assert.ok(state(.9).notify > state(.8).notify);
  assert.equal(state(.5).failure, 0);
  assert.equal(state(.5).notify, 0);
});

test("request and reply traverse identical endpoints in opposite directions", () => {
  for (const width of [320, 390, 768, 1024, 1440]) {
    const g = layout(width, 844);
    const start = routePoint(state(.2).request, g.source, g.target, g.mobile);
    const end = routePoint(state(.4).request, g.source, g.target, g.mobile);
    const reply = routePoint(1 - state(.6).response, g.source, g.target, g.mobile);
    assert.ok(Math.abs(start.x - g.source.x) < .001);
    assert.ok(Math.abs(start.y - g.source.y) < .001);
    assert.ok(Math.abs(end.x - g.target.x) < .001);
    assert.ok(Math.abs(end.y - g.target.y) < .001);
    assert.ok(Math.abs(reply.x - start.x) < .001);
    assert.ok(Math.abs(reply.y - start.y) < .001);
  }
});

test("mobile is vertical and labels have screen margins at narrow widths", () => {
  for (const width of [320, 360, 390, 430, 768, 1024, 1440]) {
    const g = layout(width, 844);
    if (width <= 767) {
      assert.equal(g.source.x, g.target.x);
      assert.ok(g.target.y > g.source.y);
    } else assert.ok(g.target.x > g.source.x);
    for (const p of [g.source, g.target, g.message, ...g.channels]) {
      assert.ok(p.x >= 55 && p.x <= width - 55);
      assert.ok(p.y > 100 && p.y + 35 < 844);
    }
  }
});
