// The world, loading: which still of it the veil is laid over (brand.css, html.os-loading). Read before the first paint
// (a plain script in the page's head), so the still is there from the start: one of the tent's, chosen at random.
(() => {
  const STILLS = ['tent-morning', 'tent-midday', 'tent-evening', 'tent-snow', 'tent-pines'];
  const pick = STILLS[Math.floor(Math.random() * STILLS.length)];
  document.documentElement.style.setProperty('--os-load-still', `url('/brand/loading/${pick}.jpg')`);
})();
