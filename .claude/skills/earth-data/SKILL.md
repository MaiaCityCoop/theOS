---
name: earth-data
description: Placeholder. Real-world elevation for Maia City's terrain, from AWS Terrain Tiles (https://registry.opendata.aws/terrain-tiles/). Use when Samuel asks for real terrain, heightmaps, elevation, DEM data or a real place's ground for the world.
---

# Earth data

_Placeholder: one source so far, nothing wired into the game yet._

## AWS Terrain Tiles

[Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) is a free, global, bare-earth
elevation dataset on the AWS Registry of Open Data, built by Mapzen (now the Linux Foundation's
Tilezen project) from SRTM, GMTED, ETOPO1, USGS NED and other national open models, and served
from the public S3 bucket `elevation-tiles-prod` (us-east-1, mirrored as `elevation-tiles-prod-eu`
in eu-central-1) with no AWS account needed. Tiles follow the ordinary web map `{z}/{x}/{y}`
scheme, so a place is fetched like any map tile, e.g.
`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`, in four formats:
`terrarium` PNG (height in meters = `(R * 256 + G + B / 256) - 32768`, the easiest for a
heightmap in the browser), `normal` PNG (surface normals for shading), `geotiff` (512×512 for
GIS tools) and `skadi` (1°×1° SRTM-style `.hgt`). Attribution to its sources is required; see
[joerd's attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) and
[formats](https://github.com/tilezen/joerd/blob/master/docs/formats.md).
