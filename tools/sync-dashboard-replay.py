"""Embed the site replay in the standalone demo after regenerating dashboard.html."""
from pathlib import Path
import re
import sys


root = Path(__file__).resolve().parents[1]


def embed(html, tag, name, before):
    block = f'<{tag} id="site-{name}">\n{(root / "assets" / name).read_text().rstrip()}\n</{tag}>'
    existing = rf'<{tag} id="site-{re.escape(name)}">.*?</{tag}>'
    if re.search(existing, html, re.S):
        return re.sub(existing, lambda _: block, html, count=1, flags=re.S)
    if html.count(before) != 1:
        raise ValueError(f"Cannot find unique dashboard insertion point for {name}")
    return html.replace(before, block + "\n" + before)


page = root / "dashboard.html"
original = page.read_text()
html = embed(original, "style", "track-replay.css", "</head>")
html = embed(html, "script", "track-replay.js", "<script>window.SentinelDemo && window.SentinelDemo.started();</script>")
marker = "    started() {  // after the dashboard's own script has run\n      ready();"
hook = """
      const replay = window.SentinelTrackReplay;
      if (replay) replay.enhanceDashboard(document.getElementById("inc-preview"), (id) =>
        incidentsNow().some(({incident, id: current}) => current === id && !incident.seed &&
          incident.first_ms === Math.round(replay.recording.opened * 1000)));"""
if marker not in html:
    raise ValueError("Cannot find the demo startup hook")
if marker + hook not in html:
    html = html.replace(marker, marker + hook, 1)
if "--check" in sys.argv:
    sys.exit(0 if html == original else "Dashboard replay needs to be synced")
if html != original:
    page.write_text(html)
