"""SVG filters that bend what sits behind a glass surface, strongest at the rim.

Each filter reads a displacement map: neutral grey across the middle, ramping towards the edges
(red = horizontal shift, green = vertical shift). rx / ry are the rim thickness as a share of the
width / height, so wide bars, small pills and tall sheets each get their own.
"""
import urllib.parse

def _map(rx, ry):
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" preserveAspectRatio="none"><defs>'
        f'<linearGradient id="x" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="rgb(255,255,255)"/><stop offset="{rx}%" stop-color="rgb(128,255,255)"/><stop offset="{100 - rx}%" stop-color="rgb(128,255,255)"/><stop offset="100%" stop-color="rgb(0,255,255)"/></linearGradient>'
        f'<linearGradient id="y" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="rgb(255,255,255)"/><stop offset="{ry}%" stop-color="rgb(255,128,255)"/><stop offset="{100 - ry}%" stop-color="rgb(255,128,255)"/><stop offset="100%" stop-color="rgb(255,0,255)"/></linearGradient>'
        '</defs><rect width="100%" height="100%" fill="#fff"/><rect width="100%" height="100%" fill="url(#x)"/>'
        '<rect width="100%" height="100%" fill="url(#y)" style="mix-blend-mode:multiply"/></svg>'
    )
    return "data:image/svg+xml," + urllib.parse.quote(svg)

def _filter(name, rx, ry, scale):
    return (
        f'<filter id="fb-lens-{name}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">'
        f'<feImage href="{_map(rx, ry)}" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map"/>'
        f'<feDisplacementMap in="SourceGraphic" in2="map" scale="{scale}" xChannelSelector="R" yChannelSelector="G"/></filter>'
    )

def lens_defs():
    return _filter("bar", 5, 30, 26) + _filter("pill", 14, 38, 18) + _filter("sheet", 4, 5, 28)
