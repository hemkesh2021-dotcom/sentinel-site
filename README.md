# Sentinel v2 site: redesign candidate

A candidate only. Nothing here has been published, and the public site is unchanged. It is kept apart from the
Sentinel application code: the repository was read, never edited.

## What is in this folder

| Path | What it is |
| --- | --- |
| `index.html` | The page. Plain HTML, no build step, no framework. |
| `dashboard.html` | The live dashboard: the beta.1 dashboard's own stylesheet and `dashboard.js`, unmodified, answered by a recording of the real status server instead of a device. Self-contained; opens on its own too. |
| `assets/courtyard.js` | The shared synthetic courtyard: one scripted 72 s loop and one model of the yard as dots and lines, drawn in the browser. The field study at the top, the dashboard's picture, the evidence plate and the hardware sequence all draw from it. |
| `assets/hardware.js`, `assets/film.js` | The hardware sequence (three.js r128): two original, generic hardware studies, drawn as point clouds, and the scroll-driven timeline. |
| `assets/site.css`, `assets/site.js` | Layout, type and the page's behaviour. |
| `assets/three.min.js` | three.js r128 (MIT), loaded only when the hardware section is near. |
| `assets/fonts/` | Instrument Serif, IBM Plex Sans, IBM Plex Mono (SIL Open Font License; licences beside them). Self-hosted: the page asks no third party for anything. |
| `posters/` | Stills of the seven beats and of the dashboard, used when motion is reduced, WebGL is missing, or the dashboard cannot be embedded. |
| `qa/` | Recording, desktop and phone views, before/after, the two transition studies and the QA log. |

## Preview it

Any static file server works, for example `python3 -m http.server` in this folder, then open the address it prints.
Opening `index.html` straight from disk also works in most browsers; if the dashboard stays on "Starting", use a server.

## What is real and what is not

- The dashboard is the real interface code. Its data is a recording made by running the scripted scene through the
  real runtime with a stand-in camera and stand-in models. No camera, model or device is involved in the page.
- The people, the courtyard and every event are scripted. Answers in the Ask panel come from the script.
- The hardware models are original studies of a pan-tilt camera and a compute board, drawn as dots. They are not
  renders of the Imou Ranger S2 or the Jetson Orin Nano developer kit, and carry no maker's marks. Their proportions
  follow your reference photos; the photos themselves are not part of the site.
- The dotted look is a drawing style, not a scan: no depth is measured anywhere, and Sentinel works on the flat
  camera frame. The opened 3D view of the yard is labelled as an illustration.
- No performance, accuracy or readiness figure appears anywhere on the page.

## Rebuilding the dashboard page

`dashboard.html` is generated. The generator lives outside this folder (`dashboard/build.py` in the working tree
this candidate was made in); it needs a clone of the repository at beta.1 and Python 3.10 or newer, and runs in
about 15 seconds. If the dashboard's code changes, regenerate rather than editing `dashboard.html` by hand.

After regeneration, run `python3 tools/sync-dashboard-replay.py` to embed the site's Track 73 replay in the standalone demo. Both the embedded and standalone dashboard can then play the recording offline under the original content security policy. Use `--check` to verify the embedded copy matches the site assets.
