# Exprnc. — vidéo motion design (10 s)

Vidéo de présentation de 10 secondes, 1920×1080, 60 i/s, avec sound design, générée entièrement par code
(rendu déterministe image par image).

## Storyboard

| Temps | Plan |
|---|---|
| 0,0 – 1,5 s | Le mot « Expérience » apparaît lettre par lettre dans l'obscurité. |
| 1,5 – 2,6 s | Les voyelles tombent, les consonnes se resserrent : « Exprnc. » (le point tombe en dernier). |
| 3,3 – 4,25 s | Deux étincelles découpent le mot selon les vraies lignes de puzzle du logo, les 3 morceaux tombent. |
| 4,25 – 5,5 s | Les 3 pièces de puzzle 3D du logo tombent et restent éparpillées au sol (poussière, ombres douces). |
| 5,3 – 7,4 s | Les pièces vibrent, s'envolent (tonneau, pirouette) et s'emboîtent toutes seules (flash sur les jointures). |
| 7,4 – 10 s | « Clac » final, la caméra passe en vue de dessus, reflet balayant, signature « L'expérience, pièce par pièce. » |

## Structure

```
assets/logo-source.png   logo fourni
assets/logo.json         logo vectorisé : lettres, sticker, 2 lignes de coupe, 3 pièces
assets/fonts/            Montserrat (OFL)
prep/vectorize.py        vectorisation du PNG -> logo.json
prep/sound.py            sound design procédural -> output/audio.wav
src/timeline.js          minutage global (CUES) + courbes d'animation
src/act1.js              acte 1 : typographie (Canvas 2D)
src/act2.js              acte 2 : puzzle 3D (three.js, ombres PCSS, particules)
src/post.js              flou de mouvement, profondeur de champ, bloom, étalonnage, grain
src/overlay.js           signature finale
render/render.mjs        rendu Chromium headless + ffmpeg
```

## Régénérer la vidéo

```bash
npm install
pip install numpy scipy pillow scikit-image shapely opencv-python-headless   # pour prep/
python3 prep/vectorize.py          # seulement si le logo change
python3 prep/sound.py              # bande son
node render/render.mjs             # toutes les images -> output/segments/ (≈ 1 h sans GPU)
node render/render.mjs --assemble  # -> output/exprnc-motion.mp4
```

Aperçu rapide : `node render/render.mjs --w 960 --h 540 --q 0.5 --segdir /tmp/prev` puis
`node render/render.mjs --assemble --segdir /tmp/prev --out /tmp/preview.mp4`.
Images de contrôle : `node render/render.mjs --stills 2.5s,6.9s,9.5s`.

## Personnaliser

- Textes : `src/overlay.js` (`TAGLINE`) et `src/act1.js` (mots « Expérience » / « Exprnc. »).
- Rythme : `CUES` dans `src/timeline.js` (le son suit automatiquement ces repères).
- Couleurs / lumière / matières : `src/act2.js` (`buildLights`, `buildPieces`, `buildFloor`).
