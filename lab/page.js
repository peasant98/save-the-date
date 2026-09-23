'use strict';
/* Wires a Diorama to the page chrome: the day/night pill, the hint, and the
 * caption that changes with the light. #day in the URL opens into daylight. */
import { Diorama } from '/lab/scene.js';

export function mount(cfg){
  const root   = document.getElementById('viewport');
  const hint   = document.getElementById('hint');
  const toggle = document.getElementById('toggle');
  const script = document.querySelector('#caption .script');
  const theme  = document.querySelector('meta[name=theme-color]');

  const scene = new Diorama(root, cfg);

  root.addEventListener('diorama:look', () => hint.classList.add('gone'));
  root.addEventListener('diorama:mode', e => {
    const night = e.detail.night;
    toggle.textContent = night ? 'see it by day' : 'see it by night';
    script.textContent = cfg.captions[night ? 'night' : 'day'];
    theme.content = night ? '#16223c' : '#cfe0ea';
  });

  toggle.addEventListener('click', () => scene.setNight(!scene.night));
  const touch = matchMedia('(hover: none)').matches;
  if (cfg.hint) hint.textContent = cfg.hint[touch ? 'touch' : 'pointer'];
  else if (touch) hint.textContent = 'drag to look around';
  scene.setNight(location.hash !== '#day');
  return scene;
}
