# Exprnc. — film motion design (POV onirique)

Film de présentation d'environ 23 s, 1920×1080, 30 i/s, avec sound design, généré entièrement par code
(rendu déterministe image par image : three.js dans Chromium headless + ffmpeg).

## Storyboard

| Temps | Plan |
|---|---|
| 0 – 2,3 s | Vue subjective : une porte noire cernée de lumière s'ouvre, on la franchit (éclair blanc). |
| 2,3 – 5,1 s | Tête à gauche : vision **Escape game — Casino** (roulette, cartes, jetons, dés, cadenas, minuteur). |
| 5,1 – 8,0 s | Tête à droite : vision **Murder party — Festival de cinéma** (tapis rouge, clap, pellicules, flashs, contour à la craie). |
| 8,0 – 10,9 s | Tête à gauche : vision **Undercover** (silhouettes, masque, lasers, empreinte, dossiers confidentiels). |
| 10,9 – 13,8 s | Tête à droite : vision **Exprnc. Food** (cocktails lumineux, agrumes, glaçons, coulée). |
| 14,2 – 15 s | On trébuche, le regard tombe sur les 3 pièces du logo éparpillées au sol. |
| 15 – 19,3 s | Les pièces sont ramassées une à une et fixées dans le vide (ondes sur un mur invisible, clics d'emboîtement). |
| 19,3 – 23 s | Logo complet sur fond noir, reflet balayant et signature « DES EXPÉRIENCES QUI MARQUENT. » |

Les visions sont des « souvenirs » : elles se matérialisent et se dissolvent (dissolution par bruit 3D à bords lumineux),
flottent dans le noir et se reflètent sur un sol miroir.

## Structure

```
assets/logo-source.png   logo fourni
assets/logo.json         logo vectorisé : lettres, sticker, 2 lignes de coupe, 3 pièces
assets/fonts/            Montserrat (OFL)
prep/vectorize.py        vectorisation du PNG -> logo.json
prep/sound.py            sound design procédural -> output/audio.wav
src/timeline.js          minutage global (CUES) + courbes d'animation
src/film/camera.js       caméra subjective (marche, regards, trébuchement, ramassage)
src/film/world.js        vide noir, sol miroir, éclairages, poussière
src/film/door.js         la porte
src/film/visions.js      les 4 visions (concepts)
src/film/textures.js     textures procédurales (cartes, roulette, clap, empreinte…)
src/film/dream.js        dissolution « souvenir », étiquettes, rubans, particules
src/film/puzzle.js       pièces du logo, mur invisible, carton final
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
node render/render.mjs             # toutes les images -> output/segments/ (long sans GPU)
node render/render.mjs --assemble  # -> output/exprnc-motion.mp4
```

Aperçu rapide : `node render/render.mjs --w 960 --h 540 --q 0.4 --segdir /tmp/prev` puis
`node render/render.mjs --assemble --segdir /tmp/prev --out /tmp/preview.mp4`.
Images de contrôle : `node render/render.mjs --stills 3.7s,9.5s,21.5s`.

## Personnaliser

- Signature : `src/overlay.js` (`TAGLINE`).
- Noms / sous-titres des concepts : `label: [...]` dans chaque classe de `src/film/visions.js`.
- Rythme : `CUES` dans `src/timeline.js` (le son suit automatiquement ces repères).
