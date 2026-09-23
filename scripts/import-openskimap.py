#!/usr/bin/env python3
"""Rebuild data/world-resorts.json from OpenSkiMap / OpenSkiData.

Source: https://tiles.openskimap.org/geojson/ski_areas.geojson
(OpenStreetMap + Skimap.org, via openskimap.org)

Keeps visited / UCPA flags and curated websites from the previous file when
a resort can be matched by name + nearby coordinates.
"""

from __future__ import annotations

import json
import re
import unicodedata
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "world-resorts.json"
SOURCE_URL = "https://tiles.openskimap.org/geojson/ski_areas.geojson"

ISO_COUNTRY = {
    "RU": "Russia",
    "UA": "Ukraine",
    "BY": "Belarus",
    "KZ": "Kazakhstan",
    "GE": "Georgia",
    "AM": "Armenia",
    "AZ": "Azerbaijan",
    "KG": "Kyrgyzstan",
    "UZ": "Uzbekistan",
    "TJ": "Tajikistan",
    "MN": "Mongolia",
    "CN": "China",
    "JP": "Japan",
    "KR": "South Korea",
    "TR": "Turkey",
    "IR": "Iran",
    "IN": "India",
    "NP": "Nepal",
    "US": "United States",
    "CA": "Canada",
    "MX": "Mexico",
    "IS": "Iceland",
    "NO": "Norway",
    "SE": "Sweden",
    "FI": "Finland",
    "EE": "Estonia",
    "LV": "Latvia",
    "LT": "Lithuania",
    "PL": "Poland",
    "CZ": "Czechia",
    "SK": "Slovakia",
    "HU": "Hungary",
    "RO": "Romania",
    "BG": "Bulgaria",
    "RS": "Serbia",
    "BA": "Bosnia and Herzegovina",
    "ME": "Montenegro",
    "MK": "North Macedonia",
    "AL": "Albania",
    "GR": "Greece",
    "HR": "Croatia",
    "SI": "Slovenia",
    "IT": "Italy",
    "CH": "Switzerland",
    "AT": "Austria",
    "DE": "Germany",
    "FR": "France",
    "ES": "Spain",
    "AD": "Andorra",
    "PT": "Portugal",
    "GB": "United Kingdom",
    "LI": "Liechtenstein",
    "AU": "Australia",
    "NZ": "New Zealand",
    "CL": "Chile",
    "AR": "Argentina",
    "BO": "Bolivia",
    "PE": "Peru",
    "MA": "Morocco",
    "LB": "Lebanon",
    "IL": "Israel",
    "CY": "Cyprus",
    "MD": "Moldova",
    "TW": "Taiwan",
}

FR_DEPT_TO_REGION = {
    "Haute-Savoie": "Auvergne-Rhône-Alpes",
    "Savoie": "Auvergne-Rhône-Alpes",
    "Isère": "Auvergne-Rhône-Alpes",
    "Drôme": "Auvergne-Rhône-Alpes",
    "Cantal": "Auvergne-Rhône-Alpes",
    "Puy-de-Dôme": "Auvergne-Rhône-Alpes",
    "Hautes-Alpes": "Provence-Alpes-Côte d'Azur",
    "Alpes-Maritimes": "Provence-Alpes-Côte d'Azur",
    "Alpes-de-Haute-Provence": "Provence-Alpes-Côte d'Azur",
    "Var": "Provence-Alpes-Côte d'Azur",
    "Hautes-Pyrénées": "Occitanie",
    "Haute-Garonne": "Occitanie",
    "Ariège": "Occitanie",
    "Aude": "Occitanie",
    "Pyrénées-Orientales": "Occitanie",
    "Pyrénées-Atlantiques": "Nouvelle-Aquitaine",
    "Vosges": "Grand Est",
    "Doubs": "Bourgogne-Franche-Comté",
    "Jura": "Bourgogne-Franche-Comté",
}


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s[:80] or "resort"


def norm_name(n: str) -> str:
    n = unicodedata.normalize("NFD", n or "")
    n = "".join(c for c in n if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "", n.lower())


def lift_count(stats) -> int:
    lifts = (stats or {}).get("lifts") or {}
    by = lifts.get("byType") or {}
    if not isinstance(by, dict):
        return 0
    total = 0
    for v in by.values():
        if isinstance(v, int):
            total += v
        elif isinstance(v, dict):
            total += int(v.get("count") or 0)
    return total


def coords_of(feat):
    vp = (feat["properties"].get("viewportHint") or {}).get("center")
    if vp and len(vp) >= 2:
        return float(vp[1]), float(vp[0])
    geom = feat["geometry"]
    t, c = geom["type"], geom["coordinates"]
    if t == "Point":
        return c[1], c[0]
    ring = c[0] if t == "Polygon" else c[0][0]
    return sum(p[1] for p in ring) / len(ring), sum(p[0] for p in ring) / len(ring)


def main() -> None:
    print(f"Downloading {SOURCE_URL} …")
    req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "SkillWiki/1.0"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        osm = json.load(resp)

    existing = json.loads(OUT.read_text()) if OUT.exists() else []
    preserve = {("name", norm_name(r["name"]), r.get("country")): r for r in existing}
    visited_names = {norm_name(r["name"]) for r in existing if r.get("visited")}
    ucpa_names = {norm_name(r["name"]) for r in existing if r.get("ucpa")}

    out = []
    seen_ids: set[str] = set()
    country_counts: Counter[str] = Counter()

    for feat in osm["features"]:
        p = feat["properties"]
        if p.get("status") != "operating":
            continue
        if "downhill" not in (p.get("activities") or []):
            continue
        if lift_count(p.get("statistics")) < 1:
            continue
        name = p.get("name")
        if not name:
            continue
        places = p.get("places") or []
        if not places:
            continue
        pl = places[0]
        cc = pl.get("iso3166_1Alpha2")
        loc = (pl.get("localized") or {}).get("en") or {}
        country = loc.get("country") or ISO_COUNTRY.get(cc) or cc
        if not country:
            continue
        department = loc.get("region") or loc.get("locality") or country
        region = FR_DEPT_TO_REGION.get(department, department) if country == "France" else department
        try:
            lat, lng = coords_of(feat)
        except Exception:
            continue
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            continue

        base = slugify(name)
        rid = base
        i = 2
        while rid in seen_ids:
            rid = f"{base}-{i}"
            i += 1
        seen_ids.add(rid)

        websites = p.get("websites") or []
        website = websites[0] if websites else ""
        nn = norm_name(name)
        prev = preserve.get(("name", nn, country))
        visited = False
        ucpa = False
        if prev and abs(prev["lat"] - lat) < 0.2 and abs(prev["lng"] - lng) < 0.2:
            visited = bool(prev.get("visited"))
            ucpa = bool(prev.get("ucpa"))
            if prev.get("website"):
                website = prev["website"]
            if prev["id"] not in seen_ids or prev["id"] == rid:
                seen_ids.discard(rid)
                rid = prev["id"]
                seen_ids.add(rid)
        else:
            visited = nn in visited_names and country == "France"
            ucpa = nn in ucpa_names and country in ("France", "Andorra", "Spain")

        out.append(
            {
                "id": rid,
                "name": name,
                "country": country,
                "region": region,
                "department": department,
                "area": region,
                "lat": round(lat, 5),
                "lng": round(lng, 5),
                "website": website,
                "visited": visited,
                "ucpa": ucpa,
                "source": "openskimap",
            }
        )
        country_counts[country] += 1

    def ensure(r: dict) -> None:
        for x in out:
            if x["id"] == r["id"] or (
                norm_name(x["name"]) == norm_name(r["name"]) and x["country"] == r["country"]
            ):
                x["visited"] = x["visited"] or bool(r.get("visited"))
                x["ucpa"] = x["ucpa"] or bool(r.get("ucpa"))
                if r.get("website"):
                    x["website"] = r["website"]
                return
        out.append({**r, "source": r.get("source", "curated")})

    for r in existing:
        if r.get("visited") or r.get("ucpa"):
            ensure(r)

    out.sort(key=lambda r: (r["country"], r["region"], r["name"]))
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
    print(f"Wrote {len(out)} resorts → {OUT.relative_to(ROOT)}")
    for c in ("Russia", "Ukraine", "Belarus", "Kazakhstan", "Georgia", "China", "Japan", "France", "United States"):
        print(f"  {c}: {country_counts[c]}")
    print(f"  countries: {len(country_counts)}")
    print(f"  visited: {sum(1 for r in out if r['visited'])}  ucpa: {sum(1 for r in out if r['ucpa'])}")


if __name__ == "__main__":
    main()
