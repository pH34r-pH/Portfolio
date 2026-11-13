export function resumedImportArmed() {
  const startup=document.querySelector('[data-model-machine]')?.modelStartup;
  return Boolean(startup&&!startup.quiet&&portfolioStartupDeadlines.length>=2);
}

export function observeQuietMedia() {
  window.portfolioQuietMedia=['(prefers-reduced-motion:reduce)','(forced-colors:active)'].map(query=>{
    const list=matchMedia(query),events=[];
    list.addEventListener('change',event=>events.push({matches:event.matches,at:performance.now()}));
    return {query,list,events};
  });
}

export async function resumedImportObservation() {
  const root=document.querySelector('[data-model-machine]'),startup=root.modelStartup;
  window.resumedStartup=PortfolioModelStartup.start({retained:true});
  // Drain onStart's resolved controller await before observing boot's loading state.
  await new Promise(resolve=>queueMicrotask(resolve));
  return {freshAttempt:window.resumedStartup!==window.pendingStartup,render:root.dataset.render,
    deadlineCount:portfolioStartupDeadlines.length,startedAt:startup.startedAt,
    deadlineAt:startup.deadlineAt,observedAt:performance.now(),observedWallTime:Date.now()};
}
