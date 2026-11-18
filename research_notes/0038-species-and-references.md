# 0038 · Species and reference photographs for the forest

Research for intent 0038:
- stage 7: the one placement rule and the five layers;
- the gate's "real" half: renders held against photographs at fixed views.

Written 2026-11-18.

**How it was made:**
- The repository was read for the site.
- Three research passes read floras, inventories and papers: the canopy and young trees; the shrubs and climbers; the floor.
- The photographs were chosen on Wikimedia Commons through its API, from metadata only: title, description, categories and EXIF.

**Limits:**
- **No image was downloaded or looked at.** Every photo should be eyeballed once before it goes into the gate.
- **The web search budget ran out** before the photo search, so the photos come from Commons category browsing alone. Unsplash and Pexels were not searched.
- **Some numbers are unchecked.** A number marked † was seen only in a search engine's excerpt of a page that could not be opened. Check those before building on them.
- **Some PDFs were cached.** Some pages read through the fetch tool were PDFs, which the tool cached in this session's own folder, outside the repository.

---

## 1. Where the site is

**The repository names no site.** What it fixes is a Mediterranean setting at 41.2° N.

| Where | What it says | Sure? |
| --- | --- | --- |
| `Bible/worldbuilding/locations/maia-city.md` | Under Open: the region is not chosen yet; the first village goes in the Mediterranean; the city's own ground is a separate decision | Certain |
| `Bible/worldbuilding/locations/the-first-village.md` | `region: Mediterranean`; under Open: "The country and the site"; the climate suits year-round growing | Certain |
| `Bible/plot/timeline.md`, `plot/arcs/the-thousand.md` | Year 4: the village site is chosen, in the Mediterranean. Year 6: the site and sovereignty are settled | Certain |
| `TheGame/world/sky.js` | `latitude: 41.2`, set in intent 0007 with no reason recorded. Midsummer is day 172 (`world/clock.js`) | Certain: the game's sun is at 41.2° N |
| `Intents/0038-one-clean-architecture.md` | "The species will come from the site". The gate's photos "are Samuel's own, of the real site" (2026-11-17, with a shot list). Stage 7 "needs Samuel's photos of the real site to choose the species" | Certain that Samuel means a real place. It is not written down anywhere |
| `TheGame/src/world/land.js` | The land is integer-hash noise, eight octaves from 700 m to 2.5 m. No elevation model, no coordinates | Certain: no geography in the terrain |
| `TheGame/assets/*`, `biomes/pineforest.js` | Pinus pinea, Quercus ilex, Pistacia lentiscus, Cistus salviifolius, Pteridium aquilinum, Leucobryum glaucum (the moss cushion), Phragmites (reeds). Biomes: pine forest, meadow, dry land, riverbank, river, cut bank, gravel bar. Snow can fall | Certain: a Tyrrhenian or west-Mediterranean pine and oak wood |
| `Stories/`, `reports/`, `research_notes/` | No place, region or climate beyond the above | Certain |

**What follows from this:**
- The world is a lowland Mediterranean coast at about 41° N, with stone pine over holm oak, a river, coastal lakes with reeds, and hills on the horizon.
- At that latitude, stone pine and holm oak grow together on:
  - the Lazio coast: Castel Fusano and Castelporziano at 41.7° N, and Circeo and Sabaudia at 41.2–41.3° N;
  - the Catalan coast: Collserola, Maresme and Baix Llobregat at 41.3–41.6° N;
  - Gallura in northern Sardinia: Capo Testa is at 41.24° N;
  - southern Corsica at 41.4–41.7° N.
- I am sure of "Mediterranean, about 41° N". I cannot tell the country or the place.

**The reference woodland used below** is the Tyrrhenian stone pine wood on coastal sands over a holm oak and maquis understorey: Castel Fusano, Castelporziano, Feniglia and Circeo.
- It matches the assets the game already has.
- It is the best measured woodland of its kind.
- Catalan and Sardinian or Corsican differences are noted where they matter. On granite, rock shows through. In Spain there is no Cyclamen. In Lazio there is Quercus cerris and Q. frainetto.

---

## 2. Species per layer, with numbers

Each layer lists the most common and characteristic species first. The keys in brackets point to the source lists at the end: **[C]** canopy and young trees, **[S]** shrubs and climbers, **[F]** the floor.

- "FI" means Flora iberica and "AO" means Flora Vascular de Andalucía Occidental. Both were read on floravascular.com.
- Ranges are written as typical (extreme).

### 2.1 Canopy trees

| Species | Where in this woodland | Height | Trunk (DBH) | Crown |
| --- | --- | --- | --- | --- |
| **Pinus pinea**, stone pine | The canopy of the coastal pinewoods. Planted for so long that its native range is uncertain [C2] | Stand means 15.4–18.3 m at Castel Fusano and 8.8–10.8 m in Sardinia [C7]; 7.8–9.6 m in Spain's inventory [C8]. Most 25–30 m [C2]; record 35 m [C6] | Stand means 25–38 cm [C7], 23–36 cm in Spain [C8]. Can exceed 2 m [C2] | Globose and shrubby when young, an umbrella in mid-age, flat and broad when old [C2]. Branches rise at 30–60° [C6]. Over 8 m wide† [C32] |
| **Quercus ilex**, holm oak (subsp. *ilex* on these coasts [C3][C36]) | Climax tree. The second storey under the pines, and closed woods on sandier soils [C30] | High forest canopy 14.9 m at Castelporziano [C22]; inventory means 4.6–7.2 m [C8]. Most 25 m, exceptionally 30 m [C3] | Inventory means 12–34 cm [C8]. Can exceed 2 m [C3] | Broad, domed, branches ascending, often several low stems [C3]. 6–8 m wide; old single trees cover 125–210 m²† [C33] |
| *Quercus suber*, cork oak | A belt behind the coastal maquis at Castelporziano [C30]; in the Feniglia pinewood | Inventory means 5.9–8.4 m [C8]; 10–15 (25) m [C1] | 18–41 cm [C8] | Broad, irregular [C1] |
| *Pinus halepensis*, Aleppo pine | Limestone. The common pine in Catalonia, with *Q. ilex* under it [C3] | To 20 m [C1] | n.f. | Globose; trunk usually crooked [C1] |
| *Quercus cerris*, *Q. frainetto* | Deciduous lowland forest: the Selva di Circe and inland Castelporziano [C30][C31†]. Not in Iberia [C4][C5] | *Q. cerris* to 40 m [C4]; *Q. frainetto* over 30 m [C5] | *Q. cerris* to 1.5–2 m [C4] | *Q. frainetto*: broad on a short stout bole [C30] |
| *Quercus pubescens* s.l., *Fraxinus ornus* | Cooler, deeper soils, with *Q. ilex* in the supra-Mediterranean belt [C3] | *Q. pubescens* 20 (25) m; *F. ornus* 10 (20) m [C1] | n.f. | Broad [C1] |
| *Pinus pinaster* | Gallura's granite pinewoods (see [F9]); not verified for the Lazio sites | To 40 m [C1] | n.f. | Rounded [C1] |

**Leaves, bark and fruit**

| Species | Leaves or needles | Juvenile foliage | Bark | Cones / acorns |
| --- | --- | --- | --- | --- |
| *P. pinea* | In pairs, 10–15 (20) cm × 1–1.5 mm, somewhat flexible, intense green [C1]. Others give 8–15 cm and bluish-green [C2], or 10–18 (28) cm [C6]. Sheath 1–1.5 cm; needles live 2–4 years [C2][C6] | Single, glaucous needles 1.5–4 cm. They are made for 3–10 years, and adult pairs appear among them from year 3 [C6] | Reddish-brown, deeply fissured into broad, flat-topped, orange-purple plates [C2] | 8–15 × 7–10 cm, globose-ovoid, almost stalkless. Green, then glossy reddish-brown [C1][C2]. 100–350 g, extremes 50–750 g† [C26]. Ripen in April of the third year [C2][C6]. Seeds 15–20 mm [C1] |
| *Q. ilex* | 2–9 (12) × 1.5–4 (6) cm, petiole 3–10 mm [C1]. Leathery; orbicular to oblong-lanceolate; entire to toothed; 5–14 vein pairs [C1] (8–9 in subsp. *ilex* [C3]). Dull dark green above, ageing to glossy blackish-green; grey felt below. New leaves silvery-white, then pale yellow [C1][C3]. Live under 1 to 4 years [C3] | Serrulate to spiny, holly-like, petiole 1–3 mm, on young trees and sprouts [C1][C3] | Brownish-black, shallowly cracked into small square plates [C3]; ash-grey and scaly [C1] | 15–35 × 8–18 mm, dark brown. Cup 7–14 × 10–20 mm, covering ⅓–½ [C1][C3]. 3.2–4.1 g (subsp. *ballota*)† [C27]. Ripen in a year, fall November–January, heavy crops every 4–6 years [C3] |
| *Q. suber* | 2.5–10 × 1.2–6.5 cm, ovate, sparsely toothed. Dark green above, grey felt below [C1] | n.f. | Thick fissured cork. Stripped trunks go yellowish, reddish, then blackish [C1] | 20–45 × 10–18 mm; the upper cup scales recurved [C1] |
| *P. halepensis* | In pairs, 6–12 (15) cm × 0.7–1 mm, light green [C1] | n.f. | Ash-grey and smooth when young, then whitish with reddish cracks [C1] | 6–12 × 3.5–4.5 cm, stalked, reddish-brown, staying on the tree for years [C1] |
| *Q. cerris* | 9–12 × 3–5 cm, 7–9 pairs of lobes. Turns yellow-gold; young trees keep their dead leaves until spring [C4] | n.f. | Mauve-grey, deeply furrowed, orange in the cracks [C4] | 2–3.5 (5) cm in a bristly cup; ripen in 2 years [C4] |
| *F. ornus* | Pinnate, (5) 7–9 leaflets of 4–8 × 2.5–4 cm. White flowers, March–May [C1] | n.f. | Grey, smooth [C1] | Winged seed 16–28 × 3–6 mm [C1] |

**Stone pine stands**

| Stand | Age (yr) | Trees/ha | Basal area (m²/ha) | Mean height (m) | Mean DBH (cm) |
| --- | --- | --- | --- | --- | --- |
| Castel Fusano B, 41°43′ N [C7] | 62 | 338 | 38.8 | 18.3 | 38.2 |
| Castel Fusano C [C7] | 50 | 370 | 33.8 | 15.4 | 33.7 |
| Bidderosa, E Sardinia [C7] | 48 | 462 | 23.7 | 8.8 | 25.6 |
| Is Arenas, W Sardinia [C7] | 60 | 639 | 31.4 | 10.8 | 25.0 |
| Spain's inventory, 6 regions, 1,454 plots [C8] | – | 160–435 | 9.5–18.7 | 7.8–9.6 | 22.7–35.6 |
| Castelporziano, an old pine stand [F23] | old | **103 pines over 582 holm oaks** | – | – | Standing stock 476 m³/ha |

**Management context:**
- About 800 trees/ha are planted and about 100/ha are left before the final cut† [C11].
- Cone orchards are set on a 10 × 10 m grid† [C12].
- Rotations run 80–120 years† [C17].
- The 2002 thinning at Castel Fusano took 56% of the trees [C9].
- At Castelporziano about 789 ha of stone pine has been dying from insect outbreaks since 2018 [C22].

**Holm oak stands:**
- **Montseny (La Castanya):** 2,010 stems/ha over 5 cm DBH, 26.6 m²/ha, most stems 4–7 m† [C19][C21]. Coppices under selection thinning hold 3,043 stems on 1,261 stools† [C20].
- **Prades coppice,** uncut for about 70 years: 15,433 stems/ha of all species (5,258 of them *Q. ilex*), with a closed canopy at 3–10 m [C18].
- **Spain's inventory:** 109–1,277 trees/ha and 4–20 m²/ha [C8].

**Today's game against these numbers:** the pine forest's stand is one tree at most per 10 m cell, at density 0.75 (`biomes/pineforest.js`). That is at most about 75 trees/ha before groves and glades thin it, shared by pine and oak.
- Real old stands hold 103 pines/ha over 582 holm oaks/ha.
- Mid-aged stands hold 338–639 pines/ha.

### 2.2 Young trees (regeneration)

| Situation | Seedlings/ha | Saplings/ha |
| --- | --- | --- |
| Pine plantations, Sierra Nevada, 442 plots; plots that had any regeneration [C23] | about 2,700, all species (54% of plots had none) | about 800 *Q. ilex* |
| Natural holm oak forest, same study [C23] | about 10,300 | about 1,600 |
| *Q. ilex* saplings by pine density [C23] | – | most where the pines stand at 400–900/ha; near zero at 1,500–2,000/ha |
| *Q. ilex* by distance to a seed source [C23] | near zero beyond 4 km | near zero beyond 2 km |
| Stone pine plots, Spain's inventory, all recruits [C8] | 1,655–4,927 | 78–593 |

In [C23], seedlings are under 2.5 cm DBH and 1.3 m tall, and saplings are 2.5–7.5 cm DBH. In [C8], a sapling is 1.3 m or taller and under 7.5 cm DBH.

**How the young trees grow and look:**
- **Holm oak grows up under the pines.** At Torre Astura (Lazio), pines of 25–30 m stand over a *Q. ilex* layer of 8–12 m [S9]. At Castel Fusano, pines of 50–60 years stand over a rich understorey of holm oak and *Phillyrea*† [C35].
- **Holm oak regenerates under the canopy** and comes back after disturbance mainly from resprouts. Stools form one age cohort for about 15 years, and several by 30 years [C3][C20].
- **A holm oak sapling** is a multi-stemmed clump of spiny, holly-like, short-stalked leaves [C1][C3][C20].
- **Planted holm oak grows slowly:** one-year-old seedlings were 37–60 cm tall after six seasons, growing 2–12 cm a year [C24].
- **Stone pine regenerates in clumps, in gaps** [C15][C14†].
- **A stone pine sapling** is a glaucous, shrubby globe of short single needles. The umbrella comes only in mid-age [C2][C6].
- **Stone pine height by age**, from plantations in Tunisia (37° N, site class 1–3) [C25]:

  | Age | Height |
  | --- | --- |
  | 5 yr | 1.4–1.5 m |
  | 10 yr | 2.5–3.5 m |
  | 20 yr | 4.9–8.0 m |
  | 30 yr | 6.8–11.4 m |

  Height growth peaks around year 14 at 25–47 cm a year. Cones come from 15–25 years† [C11].

### 2.3 Shrubs and climbers

**The order, from the sources:**
- **Under the pines on the Lazio sands**, the shrub layer is *Q. ilex*, *Phillyrea latifolia*, *Pistacia lentiscus*, *Arbutus unedo*, *Erica arborea* and *Ligustrum vulgare* [S9][S10][S11].
- **Between the trees at Castelporziano**, *Cistus creticus* (subsp. *eriocephalus*) occurs in 80% of the shrub clumps, *Erica multiflora* in 73% and *Smilax aspera* in 53% [S8].
- ***Viburnum tinus*** belongs to closed holm oak forest, not to the pinewood [S13][S14].
- ***Juniperus macrocarpa*** is dune scrub only [S9].
- **Missing from my list but named by the sources:** *Daphne gnidium*, *Ligustrum vulgare*, *Rosa sempervirens*, *Ruscus aculeatus*, and *Cistus albidus* and *Ulex parviflorus* in Catalonia [S8][S9][S14][S18†].

**Size and leaves.** Widths marked [S3] are the RHS's garden spreads, not measured in the wild.

| Species | Height: typical / most | Width; habit | Leaf (mm): type, size, shape | Texture; colour above / below | Bark or stems |
| --- | --- | --- | --- | --- | --- |
| **Phillyrea latifolia** | about 1.4 in maquis [S8] / 8 (FI) | 4–8† [S3]; erect shrub or small tree | Simple, opposite, 27–75 (93) × 10–33 (43); ovate-lanceolate; entire to serrate; juvenile leaves deeply toothed (FI) | Leathery; dark green / paler (FI) | Smooth, grey-brown, with lenticels (FI) |
| **Pistacia lentiscus** (in the game, `mastic.js`) | under 1 in maquis [S8] / 5 (AO), 7–8 [S2] | 2.5–4† [S3]; bushy, much branched [S2] | **Even-pinnate**: 2–10 leaflets (AO), or 2–7 pairs [S2]. Leaflet 15–40 × 5–15, oblong-lanceolate, entire; **winged** leaf stalk | Leathery, shiny; dark / a little paler [S2] | Grey; young twigs green or reddish [S2] |
| **Arbutus unedo** | 4–5 / 7 (FI); about 1.4 in maquis [S8] | 4–8† [S3]; dense, globose crown [S2] | Simple, to 80 (105) × 30 (40), lanceolate, serrate (FI) | Shiny; bright green above / matt (FI) | Red-brown, fissured, scaly, peeling; twigs reddish [S2] |
| **Erica arborea** | 1–4 / 7 (FI) | 2.5–4† [S3]; dense, much branched [S2] | Needle-like, in whorls of 3–4, 3–9 × 0.3–0.7, margins rolled under (FI) | Dark green† [S3] | Brown, fibrous, peeling in strips; twigs white-haired [S2] |
| **Myrtus communis** | 1–5 (0.6) (FI) | 1.5–2.5† [S3]; erect, very branched | Simple, opposite, 20–50 (10–60) × 10–20 (5–30), ovate-lanceolate (FI) | Leathery, gland-dotted, aromatic; glossy dark green / paler (FI) | Four-angled twigs (FI) |
| **Cistus creticus** (subsp. *eriocephalus*) | 0.3–1† [S6]; 0.6–1.2 [S5] | n.f.; compact, much branched [S5] | Simple, to 25 in wavy forms, to about 50 in others; ovate to obovate [S5] | Hairy both sides; grey-green, fuzzy† [S3] | Long- or star-haired twigs [S5] |
| *Rhamnus alaternus* | – / 5 (AO), 8 [S2] | n.f.; prostrate to tree-like [S2] | Simple, alternate, 15–80 × 10–40, elliptic, finely serrate (AO) | Leathery; dark green / light green to yellowish [S2] | Smooth grey, later cracked [S2] |
| *Phillyrea angustifolia* | 1–3 / 4 (FI) | n.f. | Simple, 31–78 × 3–12, linear-lanceolate, entire (FI) | Leathery; dark / lighter green (FI) | Smooth grey-brown (FI) |
| *Viburnum tinus* (closed oak wood) | 2.5–4 [S3] / 7 (AO) | 2.5–4 [S3] | Simple, opposite, 55–120 (30–160) × 26–58 (11–70), ovate-elliptic, entire (AO) | Leathery; glossy dark green [S3] / a little hairy (AO) | Angular, downy young twigs (AO) |
| *Erica multiflora* (limestone, yet frequent at Castelporziano) | 0.3–2 / 3 (FI) | n.f. | Needle-like, whorls of 4–5, 6–11 long (FI) | n.f. | Chestnut or whitish young stems (FI) |
| *Cistus salviifolius* (in the game, `rockrose.js`) | 0.2–0.9 (FI) / 1 (AO) | about 0.8† [S3]; low to erect | Simple, 15–33 (11–50) × 9–20 (7–25), ovate (AO) | Wrinkled, star-haired; dark green (FI) | Star-haired twigs (FI) |
| *Cistus monspeliensis* | 0.6–1.2 / 1.8 (FI) | 1–1.5 [S3]; erect, compact, very sticky | Simple, 15–45 (70) × 2–7 (13), linear-lanceolate, 3-veined (FI) | Sticky; light green (FI) or dark (RHS) | Bristly twigs (FI) |
| *Salvia rosmarinus* | – / 1.8 (FI), 2 (AO) | 1.5–2.5† [S3] | Linear, 10–41 × 1–3, rolled margins (FI) | Green / white felt (AO) | n.f. |
| *Juniperus macrocarpa* (dunes) | 0.5–0.7 as dune scrub [S9] / 14 [S4] | n.f. | Needles 12–20 × 2–2.5, two white bands above [S4] | Rigid | Red-brown, shredding [S4] |
| *Calicotome villosa* (Lazio, Sardinia) / *C. spinosa* (Catalonia) | 1.5–3 / about 2 (FI) | Very branched, spiny | Trifoliate, leaflets 4.5–15 × 2–6 (FI) | Silky below | Ribbed, silky (FI) |
| *Lavandula stoechas*, *Spartium junceum* (glades, edges) | 0.23–1.5; – / 3–3.5 (FI, AO) | 0.4–1†; 1.5–2.5† [S3] | Linear, 6–37 × 1.5–4; *Spartium* nearly leafless green rods | Woolly; green rush-like stems | – |

**Climbers.** These are the most frequent plants of the floor too (section 2.4).

| Species | Length | Leaf (mm) | Fruit |
| --- | --- | --- | --- |
| **Smilax aspera** | stems to 6 (10) m (FI) | Simple, 42–68 (15–103) × 24–59, heart- to arrow-shaped, spiny edges, leathery, sometimes white-blotched; prickles 1–6.6 mm (FI) | 4–9.6 mm, red turning almost black, September–November (FI, AO) |
| **Rubia peregrina** | 0.25–7 m (FI) | In whorls of 4–6 (8), 15–100 × 4–27, elliptic-lanceolate, leathery, prickly edges; stems four-angled (FI) | 3–6 mm, black (AO) |
| **Asparagus acutifolius** | to 2 m (AO) | Needle cladodes 2–8 × 0.3–0.5, 10–30 a tuft, spiny tip; stems whitish-grey (AO) | 4.5–7.5 mm, black (AO) |
| *Lonicera implexa* | 1.5–2.5 / 3 m (FI) | 24–45 × 19–36, the upper pairs fused; dark green above, blue-grey below (FI) | 6–7.5 mm, red (FI) |
| *Hedera helix* | 8–12 m† [S3] | 3–5-lobed on climbing shoots, 16–64 long; entire on flowering shoots, 38–82 long; shiny dark green with pale veins (FI) | 7–8 mm, black (FI) |
| *Clematis flammula* | to 5 m (AO) | Twice pinnate, leaflets 15–35 × 5–15 (AO) | Feathery seed tails to 35 mm (FI) |

**Flowers and fruit that change the look:**
- ***Arbutus*:** white to pink hanging bells 7–8 (11) mm, September–February, at the same time as warty red or orange fruit 7–10 (20) mm (FI, AO, [S2]).
- ***Erica arborea*:** dense heads of white bells 2–3.5 mm at the tips, February–July (FI).
- ***Cistus creticus*:** purple-pink flowers 5–6.5 cm with a yellow base, March–May [S5][S19†].
- ***C. salviifolius*:** white petals 14–20 mm, March–June (FI).
- ***Pistacia*:** drupes 3.5–5 mm, red turning black, September–October [S2] (AO says reddish, then brown).
- ***Myrtus*:** white flowers to 3 cm, May–July; blue-black berries 7–10 mm in autumn and winter (FI, AO).
- ***Viburnum*:** pink buds and white flowers, January–April; metallic-blue fruit 6–10 mm (AO).
- ***Calicotome* and *Spartium*:** yellow, March–July.
- ***Lavandula*:** dark purple spikes 1.5–4.7 cm under violet bracts (FI).

**Abundance:**
- **Castelporziano maquis between the trees** [S8]:
  - 1,050 ± 300 shrub clumps/ha, holding 7,793 ± 1,401 m³ of shrub;
  - 78% cover and 22% bare ground;
  - about 6 species in each clump;
  - 94% less light under a clump.
  - Clumps are small (63%, under 1 m: *Cistus*, *Daphne*, *E. multiflora*, *P. lentiscus*, rosemary), medium (31%) or large (6%). The medium and large ones are 1.4 ± 0.3 m tall: *Arbutus*, *E. arborea*, *P. latifolia*, *Q. ilex*.
  - Mean clump volumes are 1.9, 13.1 and 34.9 m³.
- **Closed holm oak forest** (Sicily, 15 relevés, tree cover 100%): the shrub layer covers 25–60% [S13].
  - *P. latifolia* takes Braun-Blanquet cover classes 2–4, *V. tinus* 1–4, *P. lentiscus* 1–3, and *Arbutus* and *Smilax* 1–2.
  - Classes: 1 = under 5%, 2 = 5–25%, 3 = 25–50%, 4 = 50–75%.
- **Stone pine stands:**
  - inland Sicily (tree cover 90%, pines 18 m): shrubs cover 80–100%, *E. arborea* 1–5, *C. salviifolius* 2–3 [S12];
  - Calabrian dunes (tree cover 80–95%): no shrub layer, herbs 5–10% [S12];
  - San Rossore, 103 years old: a scarce shrub layer of 1–2 m† [S15].
- **Layer heights:**
  - Catalan coastal holm oak: trees 10–15 m, tall shrubs 1.5–3 m, low shrubs 0.5–1 m [S14];
  - Torre Astura: holm oak thickets at most 4–5 m [S9].
- **What governs cover:**
  - more pine canopy means less woody understorey† [S17];
  - management often weighs more: thinning 40% of the pines at Castel Fusano halved the understorey [S10];
  - similar canopies carry 0% shrubs in one place and 80–100% in another [S12];
  - a shrub layer over 50% marks an undisturbed pine woodland† [S18].

**Today's game against these numbers:**
- The understorey is one bush at most per 3 m cell at density 0.9, about 1,000 a hectare. That matches the 1,050 ± 300 clumps/ha at Castelporziano.
- What is missing is the mix: about six species to a clump, *Smilax* laced through half of them, and a 1.4 m tall class.

### 2.4 Ferns, herbs and grasses

**Plot frequencies** ("x/N": found in x of N plots):

| Code | Plots | Source |
| --- | --- | --- |
| PP | *P. pinea* wood on dunes, SW Sardinia, N=10 | [F9] |
| PG | Pinewood on granite in Gallura (*P. pinaster* with *Q. ilex* in 31 of 32 plots), N=32 | [F9] |
| QL | Lowland holm oak wood, Nurra (Sardinia), N=5 | [F10] |
| QS | Holm oak wood near Palermo (38° N), N=15 | [F11] |

In these plots almost every floor species takes only the two lowest cover classes: "+" or 1, under 5%.

| Species | Frequency | Height | Leaf or frond | Shape and colour | Flowers / fruit |
| --- | --- | --- | --- | --- | --- |
| **Rubia peregrina** (a climber) | PP 10/10, PG 32/32, QL 5/5, QS 7/15 | see 2.3 | | | |
| **Smilax aspera** (a climber) | PP 6/10, PG 14/32, QL 5/5, QS 6/15 | see 2.3 | | | |
| **Asparagus acutifolius** | PP 5/10, QL 5/5, QS 10/15 | see 2.3 | | | |
| **Brachypodium retusum** | PG 20/32, QL 3/5, PP 1/10 | Culms 40–60 cm (12–140) [F1] | Blades 7–50 cm × 0.5–5 mm, rolled and rush-like, in two ranks [F1]. Branched rhizome, a mat of dry and green leaves under shrubs and pines [F6] | Glaucous culms [F1] | May–June [F1] |
| **Arisarum vulgare** | QL 5/5, QS 14/15, PG 4/32, PP 2/10 | n.f. | Blade 2–16.5 (21.5) × 1.8–14.7 cm; petiole 5.5–37.5 cm [F1] | Cordate to hastate; the petiole sometimes purple-marked [F1] | A hooded spathe 2.9–7.5 cm with a pale purple tip [F1] |
| **Arum italicum** (*A. pictum* in Sardinia and Corsica [F10]) | QS 14/15, QL 3/5 | 25–60 cm [F8] | Blade 5–35 × 3.2–27 cm; petiole 13–46 cm [F1] | Hastate, light green, creamy veins, sometimes spotted; leaves from autumn to spring [F1][F8] | Spathe 11–35 cm, yellow-green; berries red, 2–13 mm [F1] |
| **Ruscus aculeatus** | PP 4/10, QS 5/15 | Stems to 1 m [F1] | Cladodes 1.5–5 (6) × 1–2.5 (3.5) cm, spine-tipped [F1] | n.f. | Red berries 10–15 mm; flowers February–May [F1] |
| *Rubus ulmifolius* | PG 13/32, QL 4/5 | Arching stems to 3 m [F1] | 3–5 leaflets [F1] | Dark green above, white felt below [F1] | Pink or white petals 9–14 mm, May–September; glossy black fruit [F1] |
| *Polypodium cambricum* (on rock and bark) | PG 8/32, QS 4/15, PP 2/10 | Fronds 10–40 (50) cm [F2][F3] | Ovate-triangular, 9–22 lobes a side, the longest 4.5–6 cm [F2] | New in autumn and winter; yellow and dying in late spring [F3] | – |
| *Viola alba* (subsp. *dehnhardtii*) | PG 7/32 | 5–15 (25) cm [F1] | Ovate, deeply cordate [F1] | – | White petals 10–20 mm, March–April [F1] |
| **Asplenium onopteris** | PP 3/10, QL 1/5, PG 1/32 | Fronds 15–45 cm [F1] | Blade 9–25 × 5.5–17 cm; the stalk ½–⅗ of the blade [F1] | 3–4-pinnate with a long tail tip; dark green, very glossy, leathery; stalk red-brown to purple-black and shiny [F1] | – |
| *Pteridium aquilinum* (in the game, `bracken.js`) | PG 5/32 | Fronds 30–180 cm (to 5 m) [F2] | Stalk about as long as the blade [F2] | Bipinnate, dull; dies back in autumn; often dominant in open ground [F2] | – |
| **Cyclamen repandum** (Italy, Corsica; not Spain [F4]) | PG 4/32 | n.f. | 2–15 × 1.5–15 cm; tuber to 7 cm [F4] | Heart-shaped, dark green with a pale or silvered jagged zone; purplish below [F4] | Reddish pink, petals 15–25 mm, March–May [F4] |
| *Cyclamen hederifolium* (not Spain [F4]) | QS 1/15 | n.f. | 3–15 × 2–13 cm, in autumn [F4] | Ivy- to heart-shaped, silver pattern [F4] | Rose pink, August–October [F4] |
| *Carex distachya* | QL 1/5; frequent in holm oak, cork oak and pine woods [F1] | Culms 15–40 cm [F1] | Leaves 0.5–2 mm wide [F1] | Dense tuft, dark green [F1] | February–June [F1] |
| *Carex hallerana* (limestone) | PP 2/10 | 10–40 cm [F1] | 1–2.5 mm wide [F1] | Dense tuft, bright green [F1] | March–July [F1] |
| *Asphodelus ramosus* (glades, pasture) | PG 3/32 | Scape to 1.8 m [F1] | Leaves to 45 × 2.5 (3) cm [F1] | – | White tepals 16–22 mm with a brown vein, February–June [F1] |
| *Euphorbia characias* | n.f. | To 1.8 m [F7] | 30–130 × 4–10 mm [F7] | Glaucous, felted [F7] | Dark red-brown glands, March–May [F7] |
| *Ampelodesmos mauritanicus* (garrigue) | n.f. | Culms 1–2 m [F5] | 30–100 cm × 4–7 mm, stiff [F5] | Tussock [F5] | Panicle 25–50 cm [F5] |
| *Asplenium trichomanes*, *Selaginella denticulata* | n.f. | Fronds 4–20 (35) cm; stems to 15 (20) cm [F1] | *Selaginella*: leaves 1.5–3 mm, mats on shaded, dewy banks [F1] | – | – |

**Corrections to the list:**
- ***Carex flacca* and *Brachypodium sylvaticum*** belong on damp or montane floors. In Sardinia *B. sylvaticum* grew in 13 of 16 plots at 660–1,100 m [F10].
- ***Cyclamen*:** drop them for a Catalan site [F4].

### 2.5 Litter and deadwood

| Item | Values |
| --- | --- |
| *P. pinea* needles | Paired, 10–15 (20) cm × 1–1.5 mm [F1]; 10–18 (28) cm, staying 2–4 years on the tree [F12]. Weathered colour: n.f. |
| *P. pinea* cones | 8–15 × 7–10 cm, glossy reddish-brown; they fall from the tree [F1]. 100–350 g, extremes 50–750 g† [F13]; 3–4 green cones a kg [F14]. They ripen in April of the third year and open then or up to a year later, shedding the sterile basal scales [F12]. How they lie, break up and how many lie per m²: n.f. |
| Pine nuts | 15–20 × 7–11 mm, a woody shell, pale brown under a black sooty powder; vestigial wing 3–8 mm [F1][F12] |
| *Q. ilex* leaf litter | Leaves 2–9 (12) × 1.5–4 cm, dull dark green above and grey felt below when alive [F1]. Leaf fall peaks in May–June, with a second peak in November [F18]. 55.7% of the mass is lost in 24 months [F19]. How they curl and their dead colours: n.f. |
| Acorns and cups | Acorn 15–35 × 8–18 mm, dark chestnut to blackish; cup 7–14 × 10–20 mm with flat scales [F1] |
| Litterfall, *P. pinea* | 2.40 t/ha/yr in a Zamora plantation, 78–96% of it needles and leaves [F15]; 0.31–1.14 t/ha/yr in Valladolid plots [F16] |
| Litterfall, *Q. ilex* | 4.52 ± 0.39 t/ha/yr at Montseny, 68% of it leaves [F17]; 4.34–5.3 in another version [F18] |
| Forest floor mass, litter depth | n.f. The closest proxy: forest floor carbon of 13.7 ± 0.9 Mg C/ha under other pines in N Spain, against 5.4 ± 0.7 under *Q. pyrenaica* [F20] |
| **Ground cover shares** | Gallura granite: litter 20–95%, bare soil 1–18%, rock 2–65%, stones 2–60%, moss and lichen 1–50%. *P. pinea* dunes: moss and lichen 5–60% [F9]. Lowland holm oak on alluvium: stones 0–10% [F10] |

| Deadwood | Values |
| --- | --- |
| INFC 2015, Italy | 14.7 m³/ha: standing 7.4 (150 dead trees/ha), lying 5.7, stumps 1.5 (86/ha) [F21] |
| INFC 2015, Lazio | 7.6 m³/ha: standing 4.1 (146/ha), lying 2.8, stumps about 0.7 [F21] |
| INFC 2015, Sardinia | 3.2 m³/ha: standing 1.6 (72/ha), lying 1.2 [F21] |
| INFC 2005, by type | Evergreen broadleaf woods 2.6 m³/ha; pine and other conifer woods 8.0 m³/ha; standing wood is the larger part in most types [F22] |
| **Castelporziano, *P. pinea* stand** [F23] | 42.1 m³/ha, 82% standing. By decay class 1–5: 30.0 / 4.6 / 3.7 / 3.8 / 0. The snags are suppressed broadleaves, mostly under 20 cm DBH (about 500/ha, read from a figure). There were no standing dead pines. The logs are almost all pine branches under 20 cm (about 3,500/ha, read from a figure) |
| Castelporziano, holm and cork oak coppice [F23] | 11.0 m³/ha, half standing. 97% of the logs are under 20 cm; the 21–40 cm class holds 44% of the log volume. Old stools are hard to recognise |
| How it looks as it decays [F23] | Class 1: tight bark, twigs, original colour. 2: loose bark. 3: under half the bark left, only large branch stubs, colour fading. 4: no bark, broken snag tops, the log oval and fully on the ground. 5: heavily faded, fragmented and powdery, flat, snags under 6 m. Wood density by class: 0.555 / 0.512 / 0.453 / 0.379 / 0.289 t/m³ |
| Pine branches | They lie on the ground and decay early, even large ones, because the wood does not last [F23] |

**Today's game against these numbers:**
- The litter stand is one piece at most per 1.7 m cell, at density 0.85, about 2,900 pieces/ha of branches and moss cushions. That is close to the 3,500 small logs/ha at Castelporziano.
- What is missing: the snags (about 500/ha), stumps (86/ha), the decay classes, cones and the oak leaf litter.

### 2.6 Rocks, moss and lichen

| Rock | Values |
| --- | --- |
| Gallura granite | The Rosa Beta quartz-monzonite: light grey-pink with pink feldspars, even grain [F25]. A landscape of inselbergs, tors and large tafoni [F26] |
| Corsica | Tafoni weather about 10× faster than block tops; their size shows no trend from the coast to the mountains [F27] |
| Catalan granite | Granodiorite grey and medium-grained, some with white or pink feldspar; tonalite darker grey; leucogranite whitish, pinkish or yellowish (Maresme) [F28]. The weathered sand ("sauló") can be metres thick and grades into fresh rock [F29] |
| Circeo, Garraf | Circeo: a Mesozoic limestone and dolomite massif of 541 m, whitish-grey turning pearly [F30]. Garraf: Triassic and Cretaceous limestone and dolomite, karren of bare rock, dolines, caves [F31] |

**Bryophytes** [F32]:
- Moss and lichen together cover 1–50% of the ground on granite and 5–60% on the dunes [F9].
- Castelporziano has 91 bryophyte taxa [F35].
- Cushion and mat widths: n.f.

| Moss | Size | Colour | Where |
| --- | --- | --- | --- |
| **Hypnum cupressiforme** | Shoots about 2 cm, leaves 1–2 mm, in wide mats | Green, older parts brownish, shiny | Bark, siliceous rock |
| **Homalothecium sericeum** | Main shoots several cm; side branches under 1 cm that curl up when dry | Green to golden green | Base-rich rock, bark |
| **Scorpiurium circinatum** | Wide patches, leaves about 1 mm | Green to yellow-green, wiry when dry | Base-rich rock, tree bases |
| *Grimmia pulvinata*, *G. laevigata* | Round cushions 1–2 cm tall; *G. laevigata* about 1 cm, wider than tall | Dark green when wet; grey with silvery hair points when dry (*G. laevigata* hoary) | Base-rich rock; sunny granite |
| *Tortella nitida* | Cushions 0.5–1 cm | Dark green, shiny, curled when dry | Sunny limestone |
| *Pleurochaete squarrosa* | 2–6 cm tall | Green to golden; crisped when dry | Open sandy or limy ground |
| *Dicranum scoparium*, *Pseudoscleropodium purum* | To 10 cm | Yellow-green to dark green | Woodland ground, logs; open wood |

| Lichen [F33] | Size | Colour | Where |
| --- | --- | --- | --- |
| *Flavoparmelia caperata* | Rosettes to 20 cm, lobes 5–13 mm | Pale yellow-green, wrinkled | Bark, siliceous rock |
| *Cladonia rangiformis* | Stalks 2–6 cm | Grey-white to grey-green | Dunes, dry grass |
| *Evernia prunastri*, *Ramalina farinacea* | 2–7 cm | Grey-green, white below | Sunny bark, twigs |
| *Lobaria pulmonaria* | Often over 30 cm, lobes 1–3 cm | Green-brown dry, bright green wet | Old broadleaf trees and mossy rock in humid holm oak woods. 256 lichen taxa were found on holm oak bark in Sardinia [F34] |

**What reads at eye level on this floor** [F9][F23]:
- Under a near-closed pine canopy (90–100% at 12–18 m), holm oak saplings screen the floor.
- The base is litter. On granite, bare rock reaches 65%, with grey cushion mosses and lichens.
- The largest repeated objects are the reddish-brown cones.
- The living floor plants are low climbers and mat grass, each under 5% cover.
- Glossy ferns, *Ruscus* and *Cyclamen* are scattered accents.
- Deadwood is thin and sparse.

### 2.7 What this says about the assets the game has

These are checks for stage 7, not changes made.

- **`stonepine.js`** (12–20 m, at most 25 m) and **`holmoak.js`** (12–25 m) agree with the sources. The holm oak's 21 m when grown is at the top of real canopies: 14.9 m at Castelporziano, 4.6–7.2 m as inventory means.
- **`mastic.js`** wears the holm oak's leaf. The real mastic's leaf is even-pinnate, with 2–7 pairs of leaflets of 15–40 × 5–15 mm on a winged stalk. It needs a sprig of its own.
- **`rockrose.js`** (*C. salviifolius*) is right. Under the Lazio pines the commoner *Cistus* is *C. creticus*, grey-green and fuzzy with pink flowers.
- **`bracken.js`** belongs to clearings on acid ground (5 of 32 Gallura plots), not to the floor in general.
- **`mosscushion.js`** is *Leucobryum glaucum*, which none of the sources for these woods lists. Their mosses are *Hypnum*, *Homalothecium*, *Scorpiurium*, *Grimmia*, *Tortella* and *Pleurochaete*.
- **The stand** draws at most about 75 trees/ha, against 103 pines over 582 oaks/ha in an old stand and 338–639 pines/ha in mid-aged ones. It has no holm oak layer under the pines.

---

## 3. Reference photographs

38 photographs from Wikimedia Commons. **Total 312.0 MB** (312,032,655 bytes) at full resolution.
- **Licences:** 2 CC0, 2 public domain, 1 CC BY 2.0, 2 CC BY 3.0, 8 CC BY-SA 3.0 (one of them 3.0 DE) and 23 CC BY-SA 4.0.
- **Attribution:** CC BY and CC BY-SA need the author, the licence and a link wherever a photo is shown. BY-SA adaptations must keep the licence.
- **Lens:** focal lengths are 35 mm equivalents from the EXIF. The walker's lens is 28 mm.
- **Distances:** all are estimates from the lens and the description unless the table says otherwise. No photo was looked at.
- **Samuel's own photos:** intent 0038 says the gate is held against his photos of the real site. These are stand-ins until then.

| # | View | What it shows | Licence · author | Pixels | MB | Page | Direct image |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Eye level in the stand | Pinewood behind the beaches of Alghero, NW Sardinia (40.6° N), on a trail; 28 mm, July 16:44 | CC0 · Benoît Prieur | 4032×3024 | 8.5 | [page](https://commons.wikimedia.org/wiki/File:Sardaigne_(Alghero)_en_juillet_2018_-_1.JPG) | https://upload.wikimedia.org/wikipedia/commons/e/e1/Sardaigne_%28Alghero%29_en_juillet_2018_-_1.JPG |
| 2 | Eye level in the stand | Inside a holm oak and cork oak wood below Castirla, Corsica (42.4° N); 28 mm, September | CC BY-SA 4.0 · Pierre Bona | 6016×4016 | 7.8 | [page](https://commons.wikimedia.org/wiki/File:Castirla_dans_la_ch%C3%AAnaie_sous_le_village.jpg) | https://upload.wikimedia.org/wikipedia/commons/a/a1/Castirla_dans_la_ch%C3%AAnaie_sous_le_village.jpg |
| 3 | Eye level in the stand | Stone pine forest, Doñana, Andalusia (37.0° N); 24 mm, April 16:19 | CC BY 2.0 · Nacho Pintos | 3776×2520 | 4.3 | [page](https://commons.wikimedia.org/wiki/File:Pinus_pinea_Do%C3%B1ana_2.jpg) | https://upload.wikimedia.org/wikipedia/commons/7/7d/Pinus_pinea_Do%C3%B1ana_2.jpg |
| 4 | Eye level in the stand | Stone pine plantation on Mont Saint-Clair, Sète, France (43.4° N); 35 mm, May evening | CC BY-SA 3.0 · Christian Ferrer | 6016×4016 | 29.2 | [page](https://commons.wikimedia.org/wiki/File:Pine_forest_of_S%C3%A8te_03.jpg) | https://upload.wikimedia.org/wikipedia/commons/9/9f/Pine_forest_of_S%C3%A8te_03.jpg |
| 5 | Eye level in the stand | A trail through the Castel Fusano pinewood, Rome (41.72° N); 82 mm, March 12:46 | CC BY-SA 4.0 · Ryan Hodnett | 5496×3091 | 13.0 | [page](https://commons.wikimedia.org/wiki/File:Castelfusano_(Parco_urbano_Pineta_di_Castel_Fusano)_-_Rome,_Italy_2024-03-04.jpg) | https://upload.wikimedia.org/wikipedia/commons/8/86/Castelfusano_%28Parco_urbano_Pineta_di_Castel_Fusano%29_-_Rome%2C_Italy_2024-03-04.jpg |
| 6 | Eye level in the stand | The main path inside the Feniglia stone pine wood, Orbetello, Tuscany (42.4° N); 101 mm, May 17:46 | CC BY-SA 4.0 · Albarubescens | 4608×3372 | 10.5 | [page](https://commons.wikimedia.org/wiki/File:Il_sentiero_principale_della_pineta_di_Feniglia.jpg) | https://upload.wikimedia.org/wikipedia/commons/c/ce/Il_sentiero_principale_della_pineta_di_Feniglia.jpg |
| 7 | Eye level: young trees | Large Aleppo pines over young holm oaks, a secondary succession, Terrassa, Catalonia (41.6° N); April | CC BY 3.0 · Xvazquez | 2592×1944 | 1.8 | [page](https://commons.wikimedia.org/wiki/File:Secondary_succession_Mediterranean_forest.jpg) | https://upload.wikimedia.org/wikipedia/commons/5/5c/Secondary_succession_Mediterranean_forest.jpg |
| 8 | Eye level: deadwood | Fire-damaged trees in the Castel Fusano pinewood (41.72° N): snags and charred wood; 39 mm, March 13:24 | CC BY-SA 4.0 · Ryan Hodnett | 5933×3955 | 22.2 | [page](https://commons.wikimedia.org/wiki/File:Fire_Damage_in_Castelfusano_(Parco_urbano_Pineta_di_Castel_Fusano)_-_Rome,_Italy_2024-03-04_(01).jpg) | https://upload.wikimedia.org/wikipedia/commons/a/ab/Fire_Damage_in_Castelfusano_%28Parco_urbano_Pineta_di_Castel_Fusano%29_-_Rome%2C_Italy_2024-03-04_%2801%29.jpg |
| 9 | Eye level among shrubs (2–10 m) | An unpaved road through dense maquis, Capo di Muro, Corse-du-Sud (41.7° N); 105 mm, July 11:46 | CC BY-SA 3.0 · Calimo | 3008×2000 | 2.4 | [page](https://commons.wikimedia.org/wiki/File:Maquis_Capo_di_Muro.jpg) | https://upload.wikimedia.org/wikipedia/commons/a/a5/Maquis_Capo_di_Muro.jpg |
| 10 | Eye level among shrubs | A path through dense maquis by the Fango river, Haute-Corse (42.4° N); 27 mm, July 18:30 | CC BY-SA 3.0 · Calimo | 3008×2000 | 3.7 | [page](https://commons.wikimedia.org/wiki/File:Maquis_Fango.jpg) | https://upload.wikimedia.org/wikipedia/commons/9/93/Maquis_Fango.jpg |
| 11 | Eye level in the stand | Stone pine trunks in the Parc Forestal de Mataró, Catalonia (41.5° N); about 88 mm, May 13:48 | CC BY-SA 4.0 · Quercinus | 5184×3456 | 11.8 | [page](https://commons.wikimedia.org/wiki/File:Pins_del_Parc_Forestal_de_Matar%C3%B3.jpg) | https://upload.wikimedia.org/wikipedia/commons/0/05/Pins_del_Parc_Forestal_de_Matar%C3%B3.jpg |
| 12 | Eye level in the stand | A trail in the Circeo National Park, Lazio (about 41.25° N); about 80 mm, October 2006 (what grows there is not described) | CC BY-SA 3.0 · Gabriele Ferrazzi | 3456×2304 | 4.4 | [page](https://commons.wikimedia.org/wiki/File:Sentiero_del_Parco_del_Circeo.JPG) | https://upload.wikimedia.org/wikipedia/commons/a/ad/Sentiero_del_Parco_del_Circeo.JPG |
| 13 | A tree at 2 m | The bark of a stone pine about 120 years old, with dried resin, Italy. The EXIF time is 22:11, probably with flash | Public domain · Fausta Samaritani | 3240×4320 | 5.7 | [page](https://commons.wikimedia.org/wiki/File:Corteccia_di_pinus_pinea_di_circa_120_anni,_con_resina.jpg) | https://upload.wikimedia.org/wikipedia/commons/c/c3/Corteccia_di_pinus_pinea_di_circa_120_anni%2C_con_resina.jpg |
| 14 | A tree at 2 m | Stone pine bark with two knotholes, a planted tree in Rhineland-Palatinate; 47 mm, August | CC BY-SA 4.0 · Friedrich Haag | 3173×3894 | 5.3 | [page](https://commons.wikimedia.org/wiki/File:Rinde_002_2021_08_18.jpg) | https://upload.wikimedia.org/wikipedia/commons/f/f2/Rinde_002_2021_08_18.jpg |
| 15 | A tree at 2–5 m | A holm oak's trunk and bark, a planted tree in the Jardin botanique de la Charme, Clermont-Ferrand; 127 mm, July 10:08 | CC BY-SA 4.0 · Krzysztof Golik | 4000×6000 | 9.4 | [page](https://commons.wikimedia.org/wiki/File:Quercus_ilex_in_Jardin_botanique_de_la_Charme_01.jpg) | https://upload.wikimedia.org/wikipedia/commons/d/d6/Quercus_ilex_in_Jardin_botanique_de_la_Charme_01.jpg |
| 16 | A tree at 10 m | A stone pine in the Castel Fusano pinewood; at 105 mm probably its crown or part of it; March 11:44 | CC BY-SA 4.0 · Ryan Hodnett | 4027×3221 | 9.2 | [page](https://commons.wikimedia.org/wiki/File:Stone_Pine_(Pinus_pinea)_-_Rome,_Italy_2024-03-04.jpg) | https://upload.wikimedia.org/wikipedia/commons/e/ed/Stone_Pine_%28Pinus_pinea%29_-_Rome%2C_Italy_2024-03-04.jpg |
| 17 | A young tree at 5–10 m | A stone pine of 17 years, never pruned, in its natural form (planted 1994), Castelltallat, Catalonia (41.8° N) | Public domain · Victor M. Vicente Selvas | 3072×2304 | 3.4 | [page](https://commons.wikimedia.org/wiki/File:Pinyerdel_pare_bis.JPG) | https://upload.wikimedia.org/wikipedia/commons/b/b7/Pinyerdel_pare_bis.JPG |
| 18 | A tree at 10 m | A cork oak in the Feniglia pinewood; 24 mm, May 17:23 | CC BY-SA 4.0 · Albarubescens | 4608×3456 | 11.4 | [page](https://commons.wikimedia.org/wiki/File:Sughera_nella_pineta.jpg) | https://upload.wikimedia.org/wikipedia/commons/a/ad/Sughera_nella_pineta.jpg |
| 19 | A tree at 10–30 m | A holm oak in front of Can Maimó, Collserola Natural Park (41.44° N); 28 mm, May 10:03 | CC BY-SA 3.0 · pere prlpz | 3072×2304 | 3.3 | [page](https://commons.wikimedia.org/wiki/File:Alzina_davant_de_can_Maim%C3%B3_P1510024.jpg) | https://upload.wikimedia.org/wikipedia/commons/1/1f/Alzina_davant_de_can_Maim%C3%B3_P1510024.jpg |
| 20 | A tree at 30 m | A stone pine at Pompeii (40.75° N); 52 mm, July 10:41 | CC0 · Jebulon | 4328×2880 | 8.6 | [page](https://commons.wikimedia.org/wiki/File:Pinus_pinea_Pompeii.jpg) | https://upload.wikimedia.org/wikipedia/commons/c/c4/Pinus_pinea_Pompeii.jpg |
| 21 | Trees at 10–30 m | Stone pines on the south slope of Sant Pere Màrtir, Collserola (41.39° N, 349 m); 28 mm, May 18:48 | CC BY-SA 3.0 · pere prlpz | 4128×3096 | 8.8 | [page](https://commons.wikimedia.org/wiki/File:Pins_pinyers_a_Sant_Pere_M%C3%A0rtir_-_Esplugues_de_Llobregat_-_20210502_184811.jpg) | https://upload.wikimedia.org/wikipedia/commons/b/b4/Pins_pinyers_a_Sant_Pere_M%C3%A0rtir_-_Esplugues_de_Llobregat_-_20210502_184811.jpg |
| 22 | A tree at 30 m | A single umbrella pine, Roquebrune-Cap-Martin, France (43.8° N); a Commons quality image; September 08:11 | CC BY-SA 4.0 · Timothy A. Gonsalves | 5529×3686 | 16.6 | [page](https://commons.wikimedia.org/wiki/File:Umbrella_Pine_Roquebrune_Cap_Martin_France_Sep23_A7C_06567.jpg) | https://upload.wikimedia.org/wikipedia/commons/f/f7/Umbrella_Pine_Roquebrune_Cap_Martin_France_Sep23_A7C_06567.jpg |
| 23 | A shrub at 2 m | A mastic (*Pistacia lentiscus*) wrapped round a pine's trunk, Feniglia; 44 mm, May 18:11 | CC BY-SA 4.0 · Albarubescens | 4608×3456 | 3.8 | [page](https://commons.wikimedia.org/wiki/File:L%27abbraccio_del_lentisco.jpg) | https://upload.wikimedia.org/wikipedia/commons/0/07/L%27abbraccio_del_lentisco.jpg |
| 24 | A shrub at 2 m | *Cistus creticus* at Castel Fusano; 157 mm (close detail), March 14:54 | CC BY-SA 4.0 · Ryan Hodnett | 4600×3066 | 8.8 | [page](https://commons.wikimedia.org/wiki/File:Hoary_Rock-Rose_(Cisto_di_Creta)_(Cistus_creticus)_-_Rome,_Italy_2024-03-04.jpg) | https://upload.wikimedia.org/wikipedia/commons/d/de/Hoary_Rock-Rose_%28Cisto_di_Creta%29_%28Cistus_creticus%29_-_Rome%2C_Italy_2024-03-04.jpg |
| 25 | A shrub at 2 m | A strawberry tree (*Arbutus unedo*) at Castel Fusano; 157 mm, March 14:29 | CC BY-SA 4.0 · Ryan Hodnett | 3696×2079 | 4.3 | [page](https://commons.wikimedia.org/wiki/File:Strawberry_Tree_(Corbezzolo)_(Arbutus_unedo)_-_Rome,_Italy_2024-03-04.jpg) | https://upload.wikimedia.org/wikipedia/commons/6/62/Strawberry_Tree_%28Corbezzolo%29_%28Arbutus_unedo%29_-_Rome%2C_Italy_2024-03-04.jpg |
| 26 | Shrubs at 10–30 m | Maquis near Sainte-Lucie de Porto-Vecchio, Corse-du-Sud (41.7° N); 105 mm, July 18:09 | CC BY-SA 3.0 · Calimo | 3008×2000 | 4.1 | [page](https://commons.wikimedia.org/wiki/File:Maquis_Ste_Lucie1.jpg) | https://upload.wikimedia.org/wikipedia/commons/5/53/Maquis_Ste_Lucie1.jpg |
| 27 | A rock at 2–5 m | Tafoni in a 2 m high quartz-monzonite boulder near Corbara, Corsica (42.6° N); 25 mm, May 18:15 | CC BY-SA 4.0 · Cardioceras | 2432×1824 | 2.2 | [page](https://commons.wikimedia.org/wiki/File:Tafoni_weathering_in_monzonite_near_Corbara_in_Corsica.jpg) | https://upload.wikimedia.org/wikipedia/commons/a/a6/Tafoni_weathering_in_monzonite_near_Corbara_in_Corsica.jpg |
| 28 | A rock at 10–30 m | Granite and tafoni of Capo d'Orso (the Bear rock), Palau, Gallura (41.18° N); a stitched panorama at 18 mm (APS-C), July 2010 | CC BY-SA 3.0 DE · Heinz-Josef Lücking | 7886×3396 | 7.0 | [page](https://commons.wikimedia.org/wiki/File:Capo_d%27Orso.jpg) | https://upload.wikimedia.org/wikipedia/commons/6/6a/Capo_d%27Orso.jpg |
| 29 | A rock at 30 m and more | The limestone of Monte Circeo with the Grotta delle Capre, seen from the trail (41.22° N); 80 mm, April 15:42 | CC BY-SA 4.0 · Eloise Poitier | 4608×3456 | 3.8 | [page](https://commons.wikimedia.org/wiki/File:Lazio_-_San_Felice_Circeo_-_Vista_sulla_Grotta_delle_Capre_da_lontano.jpg) | https://upload.wikimedia.org/wikipedia/commons/c/c1/Lazio_-_San_Felice_Circeo_-_Vista_sulla_Grotta_delle_Capre_da_lontano.jpg |
| 30 | Floor at 2 m | Oak acorns at Castel Fusano (whether on the ground is not stated); 157 mm, March 14:12 | CC BY-SA 4.0 · Ryan Hodnett | 4364×3491 | 15.1 | [page](https://commons.wikimedia.org/wiki/File:Oak_(Quercus_sp.)_Acorns_-_Rome,_Italy_2024-03-04_(02).jpg) | https://upload.wikimedia.org/wikipedia/commons/e/e5/Oak_%28Quercus_sp.%29_Acorns_-_Rome%2C_Italy_2024-03-04_%2802%29.jpg |
| 31 | Floor at 2 m | *Cyclamen repandum* on the Castel Fusano floor; 157 mm, March 14:11 | CC BY-SA 4.0 · Ryan Hodnett | 3707×2965 | 7.2 | [page](https://commons.wikimedia.org/wiki/File:Spring_Sowbread_(Ciclamino_Primaverile)_(Cyclamen_repandum)_-_Rome,_Italy_2024-03-04.jpg) | https://upload.wikimedia.org/wikipedia/commons/4/4c/Spring_Sowbread_%28Ciclamino_Primaverile%29_%28Cyclamen_repandum%29_-_Rome%2C_Italy_2024-03-04.jpg |
| 32 | Floor at 2 m | An unidentified moss at Castel Fusano; 157 mm, March 14:06 | CC BY-SA 4.0 · Ryan Hodnett | 3615×3615 | 9.6 | [page](https://commons.wikimedia.org/wiki/File:Moss_-_Rome,_Italy_2024-03-04_(01).jpg) | https://upload.wikimedia.org/wikipedia/commons/9/9f/Moss_-_Rome%2C_Italy_2024-03-04_%2801%29.jpg |
| 33 | Floor at 1–2 m | A stone pine seed germinating on the floor of the Bkassine forest, Lebanon (33.6° N); February | CC BY-SA 4.0 · Habibhelou | 3368×6000 | 4.7 | [page](https://commons.wikimedia.org/wiki/File:Pine_Seed_Germination_in_Bkassine_Forest.jpg) | https://upload.wikimedia.org/wikipedia/commons/5/57/Pine_Seed_Germination_in_Bkassine_Forest.jpg |
| 34 | The stand from above (tens of metres, estimate) | A drone's view (DJI, 24 mm) of the pinewood round the Castello di San Michele, Cagliari (39.2° N). GPS altitude 121.6 m above sea level; the height above the trees is not recorded; December 15:44 | CC BY-SA 4.0 · Elisa.Mnn | 4000×3000 | 5.5 | [page](https://commons.wikimedia.org/wiki/File:Castello_di_San_Michele,_parco.jpg) | https://upload.wikimedia.org/wikipedia/commons/2/2b/Castello_di_San_Michele%2C_parco.jpg |
| 35 | The stand from above (height unknown) | The Parco del Montuno in Terracina (41.29° N) from above, with a compact camera, so from a height and not a drone; June 10:44 | CC BY-SA 4.0 · Mænsard vokser | 3444×2296 | 5.5 | [page](https://commons.wikimedia.org/wiki/File:Veduta_aerea_del_Parco_del_Montuno_-_Terracina,_Latina,_Lazio,_Italy_-_2021-06-28.jpg) | https://upload.wikimedia.org/wikipedia/commons/2/28/Veduta_aerea_del_Parco_del_Montuno_-_Terracina%2C_Latina%2C_Lazio%2C_Italy_-_2021-06-28.jpg |
| 36 | Hills at about 10 km | Monte Circeo's north face from the Sabaudia beach (41.31° N); 50 mm full frame, June 18:03. The summit is about 9–10 km away, from the photo's GPS | CC BY-SA 4.0 · Anglisani Alessandro | 4608×3072 | 8.5 | [page](https://commons.wikimedia.org/wiki/File:Promontorio_del_monte_Circeo,Lazio._IT.jpg) | https://upload.wikimedia.org/wikipedia/commons/d/d1/Promontorio_del_monte_Circeo%2CLazio._IT.jpg |
| 37 | Hills at 1–3 km (estimate) | Wooded hills west of Santes Creus seen from the monastery, Catalonia (41.35° N); 82 mm, April 13:26 | CC BY-SA 4.0 · Ymblanter | 6008×4008 | 16.1 | [page](https://commons.wikimedia.org/wiki/File:Santes_Creus_Hills_west_of_the_village_seen_from_the_monastery.jpg) | https://upload.wikimedia.org/wikipedia/commons/6/64/Santes_Creus_Hills_west_of_the_village_seen_from_the_monastery.jpg |
| 38 | Hills at 1–12 km | The view from the hill above Terracina (41.29° N), filed under stone pines in Italy; January 2008 | CC BY 3.0 · brunobarbato | 3264×1832 | 4.6 | [page](https://commons.wikimedia.org/wiki/File:Vista_dal_monte_sopra_Terracina_-_panoramio_-_brunobarbato.jpg) | https://upload.wikimedia.org/wikipedia/commons/4/40/Vista_dal_monte_sopra_Terracina_-_panoramio_-_brunobarbato.jpg |

**Coverage of the gate's views:**

| View | Photos | Count |
| --- | --- | --- |
| Eye level in the stand | 1–12 | 12 |
| A tree at 2 m | 13–15 | 3 |
| A tree at 10 m | 16–19 | 4 |
| A tree at 30 m | 20–22 | 3 |
| A shrub at 2 m | 23–25 | 3 |
| A shrub at 10–30 m | 26, and 9 and 10 | 1 (3 with the maquis paths) |
| A rock at 2, 10 and 30 m | 27–29 | 3 |
| The floor at 2 m | 30–33 | 4 |
| The stand from above | 34–35 | 2 |
| Hills | 36–38 | 3 |

**Weak or missing:**
- **The stand from exactly 10, 30 and 120 m up.** Commons holds no drone photo of a stone pine stand near 41° N at a known height. Samuel's drone, or a hill above the site, is the way to get these.
- **A holm oak's bark in the wild.** Photo 15 is a planted tree.
- **Pine needle litter with cones on the ground.** Photo 33 shows a floor with needles, but in Lebanon.
- **The midday light.** Several photos are in morning or evening light; 0038's shot list asks for 11:00 in clear sun.

---

## 4. The kinds to model first, for the biggest gain on the floor

Ordered by how much of the eye-level picture each one changes, for the least new work. Each comes with the numbers to build it from and the photos to check it against.

1. **The holm oak understorey: young oaks and resprout clumps, 1–12 m.**
   - The second storey. Old stands hold 582 holm oaks/ha under 103 pines/ha [F23], and the oak layer stands 8–12 m under pines of 25–30 m [S9].
   - Saplings run to about 800/ha in pinewoods and 1,600/ha in natural holm oak forest [C23].
   - Dark, nearly black-green domes that close the view at eye level. Spiny, holly-like leaves on the young growth [C1][C3]. Several stems from one stool [C20].
   - `holmoak.js` already grows by age. What is new is the stand that places young ones under the pines (0038's "young trees" layer).
   - Photos 7 and 2.

2. **The mixed maquis clump.**
   - The species: *Phillyrea latifolia*, *Pistacia lentiscus*, *Arbutus unedo*, *Erica arborea*, *Myrtus communis* and *Cistus creticus*, with *Smilax aspera* laced through.
   - The structure [S8]:
     - 1,050 ± 300 clumps/ha with 78% cover;
     - about 6 species to a clump, and *Smilax* in 53% of them;
     - 63% of clumps under 1 m and the rest 1.4 ± 0.3 m;
     - volumes of 1.9, 13.1 and 34.9 m³;
     - 94% less light inside.
   - The leaves for the new sprigs:
     - *Phillyrea*: opposite, 27–75 × 10–33 mm, dark green;
     - *Arbutus*: 80 × 30 mm, serrate, glossy bright green, with peeling red-brown bark and red fruit 7–10 (20) mm;
     - *Erica arborea*: needles 3–9 mm in whorls of 3–4, with white flower heads in spring;
     - *Myrtus*: 20–50 × 10–20 mm, glossy;
     - *Pistacia*: its own pinnate leaf (2.7).
   - Photos 9, 10, 23–26.

3. **Stone pine cones and needle litter.**
   - Needles: paired, 10–15 (20) cm × 1–1.5 mm.
   - Cones: 8–15 × 7–10 cm and 100–350 g, glossy reddish-brown. They open and shed their basal scales. Nuts are 15–20 mm under a black sooty powder [F1][F12][F13].
   - Litter covers 20–95% of the ground [F9], and 2.4 t/ha falls each year [F15].
   - Make a cone in its states (closed, open, broken), loose scales, and needle drifts with relief for the land's material.
   - Photos 1, 3, 33. A photo of the real floor is still needed.

4. **Holm oak leaf litter and acorns, in patches under the oaks.**
   - Leaves 2–9 (12) × 1.5–4 cm, grey felt underneath, so a curled leaf shows a pale side. They fall mostly in May–June [F18], 4.3–5.3 t/ha a year, 68% of it leaves [F17].
   - Acorns 15–35 × 8–18 mm, cups 7–14 × 10–20 mm [F1].
   - A greyer, flatter, leathery litter that sets the oaks' floor apart from the reddish needle floor.
   - Photos 2 and 30.

5. **Deadwood at its real sizes and decay.**
   - Fallen pine branches mostly under 20 cm, about 3,500/ha [F23].
   - Snags of suppressed broadleaves under 20 cm DBH, about 500/ha [F23].
   - Stumps, 86/ha in Italy [F21].
   - Five decay classes, from tight bark to faded, flat and powdery [F23].
   - Volumes of 7.6 m³/ha (Lazio) to 42 m³/ha (an old Castelporziano pine stand).
   - `deadwood.js` has three branch shapes. Add snags, stumps and the decay classes' bark loss and greying.
   - Photo 8.

6. **The scramblers.**
   - *Rubia peregrina*, *Smilax aspera*, *Asparagus acutifolius*, and *Ruscus aculeatus* with them.
   - The commonest floor plants in every plot table: *Rubia* in 10 of 10, 32 of 32 and 5 of 5 plots. Each under 5% cover, but everywhere, draped over litter, shrubs and rocks [F9][F10].
   - *Rubia*: whorls of 4–6 leaves, 15–100 × 4–27 mm, prickly.
   - *Smilax*: 42–68 × 24–59 mm, heart-shaped, spiny edges, red-black berries.
   - *Asparagus*: tufts of 10–30 needle cladodes of 2–8 mm.
   - *Ruscus*: spine-tipped cladodes of 1.5–5 cm and red berries of 10–15 mm (FI, AO).

7. **The floor's grass and sedges, in place of the meadow's blades under the pines.**
   - *Brachypodium retusum* mats [F1][F6][F9]:
     - culms 40–60 cm;
     - glaucous, rolled blades 7–50 cm × 0.5–5 mm, under shrubs and pines;
     - found in 20 of 32 Gallura plots.
   - *Carex distachya*: dense dark green tufts of 15–40 cm [F1].

8. **Rock with moss and lichen.**
   - Granite with tafoni (Gallura, Corsica) or whitish-grey limestone (Circeo, Garraf). On granite, rock is 2–65% and stones 2–60% of the ground, and moss and lichen 1–50% [F9].
   - Mosses:
     - *Hypnum cupressiforme* mats, green turning brownish;
     - *Grimmia* cushions 1–2 cm, grey when dry;
     - *Homalothecium sericeum*.
   - Lichens:
     - *Flavoparmelia caperata* rosettes to 20 cm, pale yellow-green;
     - grey crusts;
     - *Cladonia rangiformis* on sand.
   - The boulders exist (`boulder.js`). Give them these skins and tafoni, and replace or demote the *Leucobryum* cushion.
   - Photos 27–29, 32.

**After these**, the glossy accents: *Asplenium onopteris*, *Cyclamen repandum* (Italy only), *Arisarum vulgare*, *Arum italicum* or *A. pictum*, and *Polypodium cambricum* on rock and bark. Each is scattered, in 4 plots in 10 or fewer, but each is unmistakable at 2 m.

---

## Sources

### [C] Canopy and young trees

1. Flora iberica and Flora Vascular de Andalucía Occidental, on floravascular.com, pages for *P. pinea*, *Q. ilex* (Andalusian text), *Q. suber*, *P. halepensis*, *P. pinaster*, *Q. pubescens* (as *Q. humilis*) and *F. ornus*: https://www.floravascular.com/index.php?spp=Pinus%20pinea (change `spp`)
2. Abad Viñas et al. 2016, JRC European Atlas of Forest Tree Species, *Pinus pinea*: https://forest.jrc.ec.europa.eu/media/atlas/Pinus_pinea.pdf
3. de Rigo & Caudullo 2016, JRC Atlas, *Quercus ilex*: https://forest.jrc.ec.europa.eu/media/atlas/Quercus_ilex.pdf
4. de Rigo et al. 2016, JRC Atlas, *Quercus cerris*: https://forest.jrc.ec.europa.eu/media/atlas/Quercus_cerris.pdf
5. Mauri et al. 2016, JRC Atlas, *Quercus frainetto*: https://forest.jrc.ec.europa.eu/media/atlas/Quercus_frainetto.pdf
6. Earle, Gymnosperm Database, *Pinus pinea*: https://www.conifers.org/pi/Pinus_pinea.php
7. Cutini, Chianucci & Manetti 2013, iForest 6: 331: https://iforest.sisef.org/contents/?id=ifor0941-006
8. Moreno-Fernández et al. 2020, Annals of Forest Science 77: 44 (Tables 8, 12, 13; Table 13's caption is misprinted "Q. suber" and is *Q. ilex*): https://link.springer.com/article/10.1007/s13595-020-00943-3
9. Mazza et al. 2011, Annals of Forest Science 68: 1323: https://link.springer.com/article/10.1007/s13595-011-0142-7
10. Correia et al. 2010, Forest Systems 19: 418: https://fs.revistas.csic.es/index.php/fs/article/view/1464
11. Gallardo 1998, Cuadernos SECF 6†: https://dialnet.unirioja.es/descarga/articulo/8197365.pdf
12. Loewe-Muñoz et al. 2020, Bosque†: https://revistabosque.org/index.php/bosque/article/download/268/137
13. Gordo et al. 2014, Cuadernos SECF†: https://dialnet.unirioja.es/descarga/articulo/6939797.pdf
14. Calama et al. 2017, Forest Systems 26(2)†: https://fs.revistas.csic.es/index.php/fs/article/view/11255
15. Barbeito et al. 2008, Forestry 81: 617: https://academic.oup.com/forestry/article-abstract/81/5/617/524291
16. Pardos et al. 2021, Trees†: https://link.springer.com/article/10.1007/s00468-021-02171-2
17. Travaglini et al. 2022, San Rossore†: https://library.oapen.org/handle/20.500.12657/62821
18. Bogdziewicz et al. 2020, New Phytologist 227: 1073: https://pmc.ncbi.nlm.nih.gov/articles/PMC7496795
19. Ferrés et al. 1980, Mediterránea 4†: https://core.ac.uk/download/16360392.pdf
20. Retana et al. 1992, Vegetatio 99: 355 (figures†): https://link.springer.com/article/10.1007/BF00118242
21. Mayor & Rodà 1993, Annales des Sciences Forestières 50†: https://www.afs-journal.org/articles/forest/pdf/1993/03/AFS_0003-4312_1993_50_3_ART0003.pdf
22. Scarascia-Mugnozza et al. 2026, Rendiconti Lincei 37: https://link.springer.com/article/10.1007/s12210-025-01403-8
23. Gómez-Aparicio et al. 2009, Ecological Applications 19: 2124: https://ecologia.ugr.es/sites/dpto/ecologia/public/inline-images/Are-pine-plantations-valid.pdf
24. Jelić et al. 2015, Periodicum Biologorum 117: 493: https://hrcak.srce.hr/file/226253
25. Sghaier, Garchi & Khouaja 2006, Geo-Eco-Trop 30: 1: https://geoecotrop.be/uploads/publications/pub_301_01.pdf
26. "La imagen forestal: el pino piñonero"†: https://www.forestales.net/revistas/articulos/296/completo/la_imagen_forestal_el_pino_pinonero_pdf.pdf
27. A holm oak acorn mass study, Agroforestry Systems 2011†: https://link.springer.com/doi/10.1007/s10457-011-9369-4
28. Pons & Pausas 2012, Oecologia†: https://www.uv.es/jgpausas/papers/Pons-Pausas-2012-Oecologia_Quercus-suber-acorn-production.pdf
29. Journal of Plant Ecology 7: 567†: https://academic.oup.com/jpe/article/7/6/567/887462
30. International Oak Society, "Farnetto path": https://internationaloaksociety.org/content/farnetto-path
31. Circeo†: https://www.scienzadellavegetazione.it/wp-content/uploads/2023/07/555.pdf and https://www.inalto.org/en/points-of-interest/park-of-the-circeo
32. Verd Urbà, Diputació de Barcelona†: https://verd-urba.diba.cat/printpdf/260
33. Diputación de Cádiz, holm oak sheet†: https://www.dipucadiz.es/export/sites/default/transicion-ecologica-y-desarrollo-urbano-sostenible/.galeria_de_ficheros/Guia_Virtual_de_Especies_Vegetales_Diputacion_Cadiz/29_Quercus-ilex-L_Encina.pdf
34. EUFORGEN Spain, *Pinus pinea* technical guidelines†: https://euforgen.org/fileadmin/templates/euforgen.org/upload/Countries/Spain/Technical_guidelines/Pinus_pinea_ESP.pdf
35. Castel Fusano bird study, Rivista Italiana di Ornitologia†: https://sisn.pagepress.org/rio/article/download/104/98/260
36. Herbari Virtual UIB, *Q. ilex* subsp. *ilex*: https://herbarivirtual.uib.cat/en/general/170/especie/alzina

### [S] Shrubs and climbers

1. floravascular.com (Flora iberica, Flora Vascular de Andalucía Occidental), a page per species: https://www.floravascular.com/index.php?spp=Genus%20species (*Cistus salviifolius* is under "salvifolius"; Flora iberica's sections for *Pistacia*, *Rhamnus*, *Viburnum* and *Asparagus* are empty there, so AO was used)
2. Arbolapp (CSIC, Real Jardín Botánico): https://www.arbolapp.es/en/species/info/ (pages pistacia-lentiscus, phillyrea-latifolia, arbutus-unedo, erica-arborea, rhamnus-alaternus, juniperus-phoenicea)
3. RHS plant pages: https://www.rhs.org.uk/plants/18950/viburnum-tinus/details and https://www.rhs.org.uk/plants/3877/wd/details were read. The others (IDs 25153, 12668, 1473, 11311, 6596, 29362, 24039, 68455, 384211, 17427, 3935, 43091, 22582 at https://www.rhs.org.uk/plants/ID/details) are from search excerpts only†
4. Gymnosperm Database: https://www.conifers.org/cu/Juniperus_macrocarpa.php and https://www.conifers.org/cu/Juniperus_turbinata.php
5. Trees and Shrubs Online: https://www.treesandshrubsonline.org/articles/cistus/cistus-creticus/ and http://www.treesandshrubsonline.org/articles/myrtus/myrtus-communis/
6. Acta Plantarum, *C. creticus* subsp. *eriocephalus*†: https://www.actaplantarum.org/flora/flora_info.php?id=2179
7. Cretan Flora, *Calicotome villosa*†: https://www.cretanflora.com/calicotome_villosa_text.html
8. Gratani, Bombelli & Covone 2003, Journal of Mediterranean Ecology 4(1): 31–37 (Castelporziano maquis): https://www.jmecology.com/?p=212
9. LIFE06 NAT/IT/000050, management plan for the Natura 2000 site IT6030048 Torre Astura (2009), pp. 27–36: https://www.parchilazio.it/documenti/schede/184_allegato3.pdf
10. Castaldi & Guerrieri 2013, Rivista Italiana di Ornitologia 82: 15–19: https://sisn.pagepress.org/rio/article/download/104/98/260
11. Mazza et al. 2011, Annals of Forest Science 68: 1323–1332†: https://link.springer.com/article/10.1007/s13595-011-0142-7
12. Rivieccio et al. 2022, Plant Sociology 59(2): https://plantsociology.arphahub.com/article_preview.php?id=97643
13. Gianguzzi et al. 2024, Plant Sociology 61(1): https://plantsociology.arphahub.com/article_preview.php?id=114343
14. Enciclopèdia.cat, "Els boscos mediterranis i submediterranis": https://www.enciclopedia.cat/historia-natural-dels-paisos-catalans/els-boscos-mediterranis-i-submediterranis
15. Travaglini et al. 2022†: https://library.oapen.org/handle/20.500.12657/62821
16. Arduini & Ercoli 2012, Plant Biosystems 146 suppl.†: https://www.iris.santannapisa.it/handle/11382/354828
17. Bonari, Acosta & Angiolini 2017, Forest Ecology and Management 391: 19–28†: https://usiena-air.unisi.it/handle/11365/1007730
18. EUNIS†: https://eunis.eea.europa.eu/habitats/8215 and https://eunis.eea.europa.eu/habitats/22161
19. FloraVeg†: https://floraveg.eu/factsheet/default/142212
20. Calvia et al. 2022, Mediterranean Botany 43: https://revistas.ucm.es/index.php/MBOT/article/view/72699

### [F] The floor

1. Flora iberica and Flora Vascular de Andalucía Occidental via floravascular.com: https://www.floravascular.com/index.php?spp=Asplenium%20onopteris (the same pattern for each species)
2. Watson & Dallwitz, Ferns of Britain and Ireland: https://www.delta-intkey.com/britfe/www/pteraqui.htm and https://www.delta-intkey.com/britfe/www/polycamb.htm
3. BSBI *Polypodium* crib: https://bsbi.org/wp-content/uploads/dlm_uploads/Polypodium_Crib.pdf; BSBI Fermanagh: https://fermanagh.bsbi.org/polypodium-cambricum-l
4. Cyclamen Society: https://www.cyclamen.org/plants/species/cyclamen-repandum/ and https://www.cyclamen.org/plants/species/cyclamen-hederifolium/
5. Kew GrassBase, *Ampelodesmos*: https://static1.kew.org/data/grasses-db/www/imp00400.htm
6. Herbari virtual del Mediterrani Occidental, *Brachypodium retusum*: https://herbarivirtual.uib.es/en/general/292/especie/fenal
7. Cretan Flora, *Euphorbia characias*: https://www.cretanflora.com/euphorbia_characias_text.html
8. NZPCN, *Arum italicum*: https://www.nzpcn.org.nz/flora/species/arum-italicum/
9. Calvia et al. 2022, Mediterranean Botany 43 e72699, supplementary Tables S2–S3: https://doi.org/10.5029/mbot.72699
10. Bacchetta et al. 2004, Fitosociologia 41(1): 29–51: https://www.scienzadellavegetazione.it/wp-content/uploads/2023/07/166.pdf
11. Gianguzzi et al. 2024, Plant Sociology 61(1): https://plantsociology.arphahub.com/article_preview.php?id=114343
12. Gymnosperm Database, *Pinus pinea*: https://conifers.org/pi/Pinus_pinea.php
13. "La imagen forestal: el pino piñonero"†: https://www.forestales.net/revistas/articulos/296/completo/la_imagen_forestal_el_pino_pinonero_pdf.pdf
14. POCTEFA project document: https://keep.eu/api/project-attachment/6733/get_file
15. Santa Regina 2001, Forestry (litter fall in three stands, Zamora): https://typeset.io/pdf/litter-fall-decomposition-and-nutrient-release-in-three-semi-3larg8e32o.pdf
16. A Spanish litterfall compilation: https://www.forestales.net/revistas/articulos/286/completo/archivo_de_documentacion_adicional_pdf.pdf
17. Verdú, Ferrés, Rodà & Terradas 1980, Mediterránea 4: https://core.ac.uk/download/16360547.pdf
18. Bou et al. 2015, Montseny litterfall: https://dugi-doc.udg.edu/handle/10256/17697
19. Santonja et al. 2022, Forests 13: 1485: https://doi.org/10.3390/f13091485
20. Herrero et al. 2016, Forest Systems 25(2): https://uvadoc.uva.es/handle/10324/50033
21. Di Cosmo & Floris 2022, INFC 2015, chapter 9, Tables 9.9–9.14: https://link.springer.com/chapter/10.1007/978-3-030-98678-0_9
22. Pignatti et al. 2009, Forest@ 6: 365–375: https://foresta.sisef.org/contents/?id=efor0598-006
23. Lo Monaco et al. 2020, Forests 11: 253 (Castelporziano deadwood; living stock, 103 pines and 582 holm oaks/ha): https://doi.org/10.3390/f11030253
24. Alberdi et al. 2020, Science of the Total Environment 747: https://www.pubmed.gov/32791408/
25. IUGS, Rosa Beta granite: https://iugs-geoheritage.org/geoheritage_stones/rosa-beta-granite/
26. Ginesu & Secchi 2009, Italian Journal of Geosciences 128: https://www.italianjournalofgeosciences.it/297/article-153/geomorfositi-in-ambiente-granitico-un-esempio-dall-alta-gallura-sardegna-nord-orientale-italia.html
27. Brandmeier et al. 2011, Earth Surface Processes and Landforms: https://doi.org/10.1002/esp.2112
28. Enciclopèdia Catalana, the igneous rocks of the coastal range: https://www.enciclopedia.cat/historia-natural-dels-paisos-catalans/les-roques-ignies-de-la-serralada-costanera-catalana-com-a
29. Enciclopèdia Catalana, soil processes: https://www.enciclopedia.cat/historia-natural-dels-paisos-catalans/els-processos-edafogenics-als-paisos-catalans; DECAT: https://decat.iec.cat/documents/VII/719.pdf
30. Parks.it, Circeo: https://parks.it/parco.nazionale.circeo/Eiti.php; Meli 1894: https://opac.geologie.ac.at/ais312/dokumente/Meli_1894_Nella.pdf
31. Enciclopèdia Catalana, Garraf-Ordal: https://www.enciclopedia.cat/historia-natural-dels-paisos-catalans/el-massis-de-garraf-ordal
32. British Bryological Society field guide accounts, one page per species, e.g. https://www.bibsbryology.org/wp-content/uploads/2020/12/Hypnum-cupressiforme.pdf
33. British Lichen Society species accounts, one page per species, e.g. https://britishlichensociety.org.uk/resources/species-accounts/lobaria-pulmonaria
34. Zedda 2002, Englera 24: https://bo.berlin/node/704
35. Aleffi 2021, the bryophytes of Castelporziano: https://pubblicazioni.unicam.it/handle/11581/454388

### [R] The repository

- `Bible/worldbuilding/locations/maia-city.md`, `Bible/worldbuilding/locations/the-first-village.md`, `Bible/plot/timeline.md`
- `TheGame/world/sky.js`, `TheGame/world/clock.js`, `TheGame/src/world/land.js`
- `TheGame/biomes/pineforest.js`, `TheGame/assets/{stonepine,holmoak,mastic,rockrose,bracken,deadwood,mosscushion}.js`
- `Intents/0007-sun-and-sky.md`, `Intents/0008-webgpu.md`, `Intents/0035-one-measure-for-everything.md`, `Intents/0038-one-clean-architecture.md`

### Photographs

All are from Wikimedia Commons; the links are in section 3. The sizes, resolutions, licences, authors and EXIF data were read from the Commons API (`prop=imageinfo`) on 2026-11-18.
