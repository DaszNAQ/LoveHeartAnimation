# Love Heart Animation

A collection of 7 heart animations that run right in the browser, with a dark/light theme and a responsive layout for phones.

## Scenes

| Scene | Tech | Description |
|---|---|---|
| **I Love You** | CSS | 70 lines of "I love you" moving along orbits to form a heart |
| **Heartbeat** | WebGL | A 3D heart with a "lub-dub" beat, glow and sparkles |
| **Floating** | WebGL | Hearts and "I <3 U" lettering drifting upward |
| **Orbit** | WebGL | A big heart in the middle with two rings of small hearts circling it |
| **Cupid** | WebGL | A heart pierced by an arrow |
| **Particles** | Three.js + GSAP | About 19,000 particles fly in and form a heart; drag to rotate |
| **Crystal** | Three.js + GSAP | A 3D crystal heart; press the music button to make the scene react to the sound |

The first 5 scenes are plain HTML/CSS/JavaScript on a hand-written WebGL engine, with no libraries.

## Run it

No install or build step: open `index.html` in a browser, or run `python3 -m http.server 8000` and visit http://localhost:8000.
Particles and Crystal load Three.js and GSAP (from the jsDelivr CDN) only when you open their tab, so they need an internet connection. Crystal also loads its model, textures and music from `assets.codepen.io`.

## Structure

`index.html` (page), `style.css` (layout, dark/light theme), `script.js` (all scenes), `img/` (favicons).

## Credits

The **I Love You**, **Particles** and **Crystal** scenes are adapted from demos by **@code_wars_official**. I only integrated them into this project, added light/dark theme support and made them load on demand and stop rendering when hidden. 
The 3D heart model is *Poly Heart* by Quaternius (CC0), via [Poly Pizza](https://poly.pizza/m/1yCRUwFnwX). 
Libraries: [Three.js](https://threejs.org/) and [GSAP](https://gsap.com/).
Everything else was written by DaszNAQ.