"""Assemble app/FatBoy.html from its source parts."""
from pathlib import Path
from lens import lens_defs

here = Path(__file__).parent

SCRIPTS = (
    "i18n.js", "strings-en.js", "strings-el.js", "strings-es.js",
    "content.js", "content-en.js", "content-el.js", "content-es.js", "recipes-data.js",
    "core.js", "figure-data.js", "figure.js", "quests.js", "effects.js", "views.js", "recipes.js", "foods.js", "photos.js", "insights.js", "delight.js", "account.js", "app.js",
)
read = lambda name: (here / name).read_text()
script = "\n".join(read(name) for name in SCRIPTS)

page = f"""<title>FatBoy</title>
<style>
{read("style.css")}
</style>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><path id="fb-figure" vector-effect="non-scaling-stroke"/><path id="fb-figure-soft" vector-effect="non-scaling-stroke"/>{lens_defs()}</defs></svg>
<div id="app">
  <div id="toolbar"></div>
  <main id="screen"></main>
  <div id="tabbar"></div>
  <div id="fab"></div>
</div>
<div id="overlay"></div>
<div id="lesson"></div>
<div id="toast" class="toast glass" role="status" aria-live="polite" hidden></div>
<div id="fx" aria-hidden="true"></div>
<script>
{script}
</script>
"""
(here / "FatBoy.html").write_text(page)
print(len(page), "bytes")
