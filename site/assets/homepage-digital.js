const journey = document.querySelector('[data-digital-home]');
const chapters = [...journey.querySelectorAll('[data-digital-chapter]')];
const reduced = matchMedia('(prefers-reduced-motion:reduce)');
const narrow = matchMedia('(max-width:720px)');
let pending = 0;

function update() {
  pending = 0;
  const height = innerHeight, scale = visualViewport?.scale || 1;
  const staticReading = reduced.matches || narrow.matches || scale > 1.15 || innerWidth < 1000;
  journey.dataset.reading = staticReading ? 'native' : 'spatial';
  const positions = chapters.map(node => node.getBoundingClientRect());
  let active = 0;
  positions.forEach((rect, index) => { if (rect.top < height * .48) active = index; });
  journey.dataset.chapter = chapters[active].id;
  chapters.forEach((chapter, index) => {
    const progress = Math.max(-1, Math.min(1, (positions[index].top - height * .12) / height));
    const pane = chapter.querySelector('[data-digital-pane]');
    const near = Math.abs(index - active) <= 1;
    chapter.dataset.paneState = index === active ? 'active' : index < active ? 'past' : 'next';
    // Focus always restores the native pane; never hide, inert or clone content.
    const frozen = staticReading || pane.contains(document.activeElement);
    pane.style.transform = frozen ? 'none' : `perspective(1600px) translate3d(${progress * 26}px,${progress * 18}px,${-Math.abs(progress) * 36}px) rotateY(${progress * -4}deg)`;
    pane.style.setProperty('--screen-energy', near ? '1' : '.2');
  });
  journey.dispatchEvent(new CustomEvent('portfolio:reading', {detail:{quiet:chapters[active].classList.contains('digital-deep-reading'),active,progress:Math.max(0,Math.min(1,-journey.getBoundingClientRect().top / Math.max(1,journey.offsetHeight-height)))}}));
}
function schedule() { if (!pending && !document.hidden) pending = requestAnimationFrame(update); }
for (const type of ['scroll','resize','pageshow','hashchange','focusin','focusout']) addEventListener(type,schedule,{passive:true});
visualViewport?.addEventListener('resize',schedule,{passive:true});
reduced.addEventListener('change',schedule); narrow.addEventListener('change',schedule);
new ResizeObserver(schedule).observe(journey);
document.addEventListener('visibilitychange',schedule);
window.PortfolioHomepage = {snapshot:() => ({mode:journey.dataset.reading,chapter:journey.dataset.chapter,panes:chapters.map(node=>({id:node.id,state:node.dataset.paneState,transform:node.querySelector('[data-digital-pane]').style.transform})),model:journey.machine?.diagnostics()})};
update();
