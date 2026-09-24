'use strict';
/* Wires a Diorama to the page chrome: the time control (a slider where the
 * page provides one, otherwise a day/night pill), the hint, and the caption
 * that changes with the light. #day in the URL opens into daylight. */
import { Diorama } from '/lab/scene.js';

/* which caption belongs to this light */
function band(day){
  return day < 0.33 ? 'night' : day < 0.67 ? 'dusk' : 'day';
}

export function mount(cfg){
  const root   = document.getElementById('viewport');
  const hint   = document.getElementById('hint');
  const script = document.querySelector('#caption .script');
  const theme  = document.querySelector('meta[name=theme-color]');
  const slider = document.getElementById('time');
  const toggle = document.getElementById('toggle');

  const start = location.hash === '#day' ? 1 : (cfg.day ?? 0);
  const scene = new Diorama(root, Object.assign({}, cfg, { day: start }));

  root.addEventListener('diorama:look', () => hint.classList.add('gone'));

  let shown = null;
  root.addEventListener('diorama:light', e => {
    const day = e.detail.day;
    document.body.classList.toggle('day', day > 0.5);
    theme.content = day > 0.5 ? '#cfe0ea' : '#16223c';
    const b = band(day);
    if (b !== shown){
      shown = b;
      script.textContent = cfg.captions[b] ?? cfg.captions[day > 0.5 ? 'day' : 'night'];
    }
    if (toggle) toggle.textContent = day > 0.5 ? 'see it by night' : 'see it by day';
  });

  if (slider){
    slider.value = start;
    /* a drag should track the thumb, so ease fast */
    slider.addEventListener('input', () => scene.setLight(+slider.value, 0.35));
  }
  if (toggle){
    toggle.addEventListener('click', () => scene.fadeLight(scene.goal > 0.5 ? 0 : 1));
  }

  const touch = matchMedia('(hover: none)').matches;
  if (cfg.hint) hint.textContent = cfg.hint[touch ? 'touch' : 'pointer'];
  else if (touch) hint.textContent = 'drag to look around';
  return scene;
}
