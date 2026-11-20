# What makes a rendered nude body read as real: cues, surface anatomy, free references, evaluation (as of November 2026)

How to read these notes. Every claim carries a tag saying how it is known:

- **[S]** = from a search extract in this session (the search tool's quote or summary of the page; the page itself was not opened).
- **[R]** = recalled from training knowledge, not verified in this session. Treat as a lead to check, not as a citation.
- **[C]** = computed by me from numbers stated next to it.
- **Read at the source: nothing.** Direct page fetches failed for every host tried (commons.wikimedia.org, pmc.ncbi.nlm.nih.gov, and by proxy test also openlab.psu.edu, apps.dtic.mil, nlm.nih.gov, en.wikipedia.org, archive.org). These hosts are outside this session's allowed network domains. Consequence: no licence statement below was read on its own page, and no ANSUR II number was read from the report or computed from the CSV. Both are flagged wherever they occur.

Subject throughout: a lean, slightly muscular adult man (1.80 m, about 14 % body fat), standing, viewed from 0.45 m to 4 m. Short notes on women and other builds are at the end of the relevant sections.

---

## 1. Perception: which cues separate a real body from a CG mannequin, and which errors hurt most?

### Takeaway
The research says shape comes first: shape is the main driver of perceived realism, a realistic skin material cannot rescue an off shape, and the more photoreal the surface the less viewers tolerate wrong proportions or one feature that is less real than the rest. After shape, the cues with experimental support are soft shadows, non-smooth surfaces, subsurface light (without it skin reads as hard plastic), the eyes, and consistency of realism across all parts; almost all of this evidence is from faces, not nude bodies.

### Cited Findings

Shape versus material
- Zell et al. 2015 ("To stylize or not to stylize?", ACM TOG 34(6)): "Shape is the key attribute for perceived realism. Stylized materials decrease the perceived level of realism for realistic shapes; however, realistic materials do not increase realism of stylized shapes." Appeal, eeriness and attractiveness depend mainly on material, not shape; within material, the albedo (colour) texture is the dominant factor; realism alone is a bad predictor of appeal. [S] — [TU Dortmund project page](https://ls7-gv.cs.tu-dortmund.de/publications/2015-stylize.page/), [paper PDF](https://ls7-gv.cs.tu-dortmund.de/publications/2015-stylize.pdf)
- A secondary review of Zell adds that strong mismatch between shape and material stylization made characters unappealing and eerie, with abstract shapes plus realistic materials rated especially eerie. [S] — [review](https://100-paper-fungoes.hatenadiary.com/entry/2022/04/30/194728)
- Fleming et al. 2016 (bodies, not faces; female 3D body scans): adding colour information and better render quality "had no significant effect on the overall perceived appeal", "the body shape primarily drives the change in appeal ratings"; a partially stylized shape was rated most appealing (about +34 %), fully realistic and fully stylized least. Note this measures appeal, not realism. [S] — [MPI page](https://ps.is.tuebingen.mpg.de/publications/fleming-grapp-2016), [Sheffield Hallam repository](https://shura.shu.ac.uk/11507)

Proportion, mismatch and the uncanny valley
- MacDorman, Green, Ho & Koch 2009 ("Too real for comfort?"): atypical facial proportions were more disturbing on photorealistic faces than on other faces; the paper's results contest a simple comfort-versus-human-likeness curve. [S] — [IU ScholarWorks record](https://scholarworks.indianapolis.iu.edu/items/e8fb6458-ddad-4067-b877-1207d720ba0c)
- Seyama & Nagayama 2007: morphing doll faces into human faces produced an uncanny valley only when the faces had abnormal features such as bizarre (enlarged) eyes; realism by itself did not. Reviews disagree on whether the study "found" the valley. [S] — [review, PMC6260244](https://pmc.ncbi.nlm.nih.gov/articles/PMC6260244); [Frontiers 2013](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2013.00108/full)
- Kätsyri et al. 2015 (review of the hypotheses): "good support was found for the perceptual mismatch" account (features of unequal human-likeness, for example human skin with computer-modelled eyes); no consistent support for the naive "more human-like means eerier before real" curve, nor for a modulating effect of movement. [S] — [Frontiers in Psychology](https://www.frontiersin.org/articles/10.3389/fpsyg.2015.00390/full)
- MacDorman & Chattopadhyay 2016 (548 participants): reducing the consistency of realism made humans and animals, but not objects, look eerier and colder; category uncertainty alone did not. [S] — [IU ScholarWorks](https://scholarworks.indianapolis.iu.edu/items/d82b9253-19d7-49a4-87f6-88ea71f80c08); companion paper [Chattopadhyay & MacDorman, J. Vision 2016](https://www.evl.uic.edu/pubs/2351)
- McDonnell, Breidt & Bülthoff 2012 ("Render me real?", ACM TOG 31(4)): as reported by later papers, cartoon renders and the most realistic renders were rated most appealing and the in-between styles least; more realistic virtual humans make viewers more sensitive to imperfections. The paper's own abstract and statistics were not retrieved. [S] — [dblp record](https://dblp.uni-trier.de/rec/journals/tog/McDonnellBB12.html); secondary: [arXiv 2509.17803](https://arxiv.org/html/2509.17803v1)
- Mori 1970 (authorised 2012 translation): movement "amplifies the peaks and valleys" of the curve; a prosthetic hand near the bottom of the valley becomes eerier once it moves. Mori meant it as design advice, not a scientific statement. [S] — [IEEE Spectrum translation](https://spectrum.ieee.org/the-uncanny-valley)

Shading, shadows, skin light
- Rademacher et al. 2001 ("Measuring the perception of visual realism in images"): of five tested factors (shadow softness, surface smoothness, number of lights, number of objects, variety of shapes), shadow penumbra and surface smoothness/roughness significantly changed whether an image was judged a photograph; number of objects was borderline. [S, via a secondary summary] — [Eurographics digital library](https://diglib.eg.org/handle/10.2312/EGWR.EGWR01.235-248); [thesis](https://techreports.cs.unc.edu/papers/03-031.pdf)
- Jensen et al. 2001 (the subsurface-scattering paper): "The BRDF face looks more like hard plastic than human skin, while the BSSRDF face has a softer appearance"; surface-only shading gives "a hard, distinctly computer-generated appearance". [S] — [paper PDF](https://www.cs.cornell.edu/courses/cs667/2005sp/readings/jensen01.pdf)
- Koenderink & Pont 2003 ("The secret of velvety skin"): asperity scattering from a thin layer of sparse scatterers (dust, hairs) adds a lobe that is strong only at grazing angles; it shapes "the occluding contour and the edge of the body shadow", makes smooth cheeks look "velvety" or "peachy", and is missed by Lambertian, plain skin-BRDF and translucent renderings. [S] — [DOI record](https://unpaywall.org/10.1007%2Fs00138-002-0089-7)
- Epic's Digital Humans documentation: skin uses a screen-space subsurface profile; a dual-lobe specular (two roughness values combined) gives "nice subpixel micro-frequencies in the skin for a natural look"; several normal maps are blended for medium-sized and micro-sized detail; full-resolution skin shading preserves pores and wrinkles. [S] — [UE 4.26 Digital Humans](https://docs.unrealengine.com/4.26/Resources/Showcases/DigitalHumans); [Subsurface Profile docs](https://dev.epicgames.com/documentation/unreal-engine/subsurface-profile-shading-model-in-unreal-engine)
- Jorge Jimenez (Activision): efforts toward ultra-realistic skin "are futile if they are not coupled with HDR, high quality bloom, depth of field, film grain, tone mapping". [S] — [iryoku.com](https://www.iryoku.com/screen-space-subsurface-scattering/)
- Press coverage of Epic's 2018 "Siren": improvements to eyes, skin and hair were named as what closes the valley; Tim Sweeney said of an earlier demo that skin and hair detail still fell short; facial animation is "equally crucial" to rendering. [S] — [Fortune](https://dc.fortune.com/2018/03/22/epic-games-siren-hyper-realistic-characters-video-games); [CG Channel](https://www.cgchannel.com/2018/03/eye-candy-epic-games-unreal-new-digital-human-demos/)

How well people tell CG from photographs
- Holmes, Banks & Farid 2016 (60 high-quality CG and photographic portraits, 250 observers): photographs were classified correctly 92 % of the time, CG images only 60 %; observers were biased toward answering "photograph"; resolution had "surprisingly little effect"; after brief training, CG accuracy rose to 76 % (photo accuracy fell to 85 %). Numbers are from the press release, not the paper. [S] — [EurekAlert](https://www.eurekalert.org/news-releases/780736); [ScienceDaily](https://sciencedaily.com/releases/2016/02/160218144928.htm)
- Raiturkar, Farid & Jain 2018 (eye tracking): advises artists to improve features such as the eyes and also the "holistic" realism of the face. [S] — [tech report](https://farid.berkeley.edu/downloads/publications/tr18a.pdf)

Stillness
- A 2021 Scientific Reports study: adding natural postural sway (from motion capture) to an otherwise still virtual character made its facial pain expression read as more intense and raised empathy. [S] — [Nature Sci. Rep.](https://www.nature.com/articles/s41598-021-91710-5)
- Practitioner guidance (not research): a standing idle with no visible breathing "reads as a frozen statue"; perfectly symmetrical idle poses look artificial. [S] — [MoCap Online guide](https://mocaponline.com/blogs/mocap-news/idle-animation-game-dev-guide)
- Cutler et al. 2024/2025 (photoreal avatars in telecommunication): strong linear relation between affinity and realism, and no uncanny valley found in that scenario. [S] — [arXiv 2411.09066](https://arxiv.org/html/2411.09066v3)

### Inferences

Scale check [C]. With a 50 degree vertical field of view on a 1080-line screen, one pixel covers about 0.39 mm at 0.45 m, 0.86 mm at 1 m and 3.5 mm at 4 m (halve these for a 2160-line screen). So at 4 m nothing smaller than a few millimetres exists on screen: only silhouette, the large forms, shading and colour count. At 0.45 m, sub-millimetre skin structure is at pixel size and belongs in normal and roughness detail, not in geometry.

Checklist A: viewing distance 1 to 4 m (whole body or half body in frame), most damaging error first. Ordering is my synthesis of the findings above; items 1 to 4 have direct experimental support, the rest are practitioner consensus or inference.
1. Proportion and silhouette. Segment lengths, shoulder/waist/hip widths, limb taper, the stagger of contours. (Zell: shape decides realism; MacDorman: errors punished harder the more photoreal the skin.)
2. Continuity of mid-scale form. No lumps or dents at the 2 to 10 cm scale; a 1 mm bump over 3 cm already tilts the surface normal by about 6 degrees [C: 2π × 0.5 mm / 30 mm = 0.105 rad], which visibly bends a highlight. This is the owner's "weird shapes and dents" complaint and sits under "shape".
3. Hard-versus-soft variety of form: bony landmarks crisp, muscle bellies soft, fat softer, creases sharp. A body where everything has the same softness is the mannequin look (section 2).
4. Light integration: soft-edged shadows, contact shadows under feet and between limbs and trunk, ambient occlusion in armpit, groin, gluteal cleft. (Rademacher.)
5. Subsurface light and a non-uniform specular: soft red-tinted shadow edge, no chalky or plastic look. (Jensen; Epic.)
6. Colour zoning: paler trunk, redder hands, feet, knees, elbows, face and genitals, darker nipples, faint veins. (Zell: albedo is the dominant material factor; body-site colour data in section 2.)
7. Asymmetry and weight: left-right differences, a relaxed stance with weight on the feet, arms hanging with bent elbows and curled fingers.
8. Hair: a body with no scalp hair, eyebrows, lashes or body hair reads as a mannequin or patient regardless of skin quality. No study was found that isolates this cue; it follows from the mismatch findings (one feature less real than the rest) and from Epic's "eyes, skin and hair".
9. Eyes and face, as soon as the face is legible (roughly inside 2 m).
10. Stillness: breathing and sway. Evidence that movement changes eeriness is mixed (Kätsyri), but a frozen figure is a known tell.

Checklist B: viewing distance about 0.5 m (a body part fills the frame), most damaging first.
1. Eyes and face if in frame (Seyama & Nagayama; Raiturkar).
2. Micro-surface in the highlight: pores and fine lines must break up the specular; a smooth highlight is plastic (Epic dual-lobe and micro normals; Rademacher surface smoothness).
3. Subsurface detail: soft terminator, glow through thin parts (ear, nostril wing, finger webs), no wax.
4. Sharp creases and thin structures: wrist and knuckle creases, navel interior, nail edges and cuticles, tendons and veins standing proud. Smooth blending cannot make these (section 7).
5. Asperity glow and visible hairs at the contour (Koenderink & Pont). Its absence is the "CG rim" look.
6. Fine colour variation: mottling, moles, freckles, redness at knuckles, nail colour, areola texture.
7. Shading artefacts: faceting, noisy normals, texture stretch, shimmering highlights.
8. Contact deformation where skin meets skin or floor.

Design consequence of the mismatch findings: raise all features together. A photoreal skin shader on a body whose shape is still off, or on a hairless body with simple eyes, is predicted to look worse (eerier), not better, than a consistent slightly less detailed body.

### Gaps
- Almost all the perception work is on faces. No study was found that ranks cues for nude whole bodies at these distances.
- McDonnell 2012 was not opened; only secondary descriptions support the bullet above. Its findings on render style versus animation artefacts are missing.
- No study was found on how absence of hair affects perceived realism.
- SIGGRAPH digital-human course notes (2015 to 2026) and talks by Naughty Dog, Santa Monica Studio and Wētā were not retrieved; searches returned only press coverage of Epic.
- Rademacher's direction of effect (soft shadows and rougher surfaces judged more real) is [R]; the extract confirms only that both factors were significant.
- Jimenez, Sundstedt & Gutierrez 2009 ran a psychophysical comparison of no subsurface scattering versus two methods ([paper](https://graphics.unizar.es/papers/Screen-Space-Perceptual-Rendering-of-Human-Skin.pdf)); the result was not retrieved.

---

## 2. What practitioners say makes a body sculpt read as real, and the surface anatomy a lean, slightly muscular man shows (region by region)

### Takeaway
Practitioners agree on a short list: bony landmarks must show where bone lies directly under skin, fat and skin must soften and bridge the muscles (otherwise the figure looks "shrink-wrapped"), nothing is symmetrical, and small detail is subordinate to big forms. The region-by-region specifics below are mostly standard surface anatomy recalled from Gray, Richer, Goldfinger and Bammes and are tagged [R] where no extract confirmed them this session.

### Cited Findings

General practice
- Bony landmarks are "areas where the bone sits directly beneath the skin, unaffected by muscle or fat"; without them "the anatomy becomes very soft, and muscle groups tend to flow in strange directions". [S] — [The Rookies, anatomy study guide](https://blog.therookies.co/2024/01/21/a-rookies-guide-to-sculpting-an-anatomy-study/)
- "Introducing asymmetry is key to creating believable characters as no human body is perfectly symmetrical." [S] — [Novedge ZBrush tip](https://novedge.com/blogs/design-news/zbrush-tip-enhancing-realism-in-character-sculpting-with-zbrush-tips-for-anatomical-accuracy)
- The "shrink-wrapped" problem: figures that look as if there were no skin over the muscles; the fix named is adding subcutaneous fat and skin thickness. Realistic figures are nearer 7.5 heads tall than the heroic 8. Low-quality source, but it matches common teaching. [S] — [Hitem3D blog](https://blog.hitem3d.ai/blog/en-Anatomy-for-3D-Artists-Essential-Knowledge-for-Sculpting-Realistic-Characters/)
- Scott Eaton's common mistakes: the biceps drawn passing over the chest muscle, and the deltoid inserted too high on the arm. [S] — [Creative Bloq, 10 anatomy tips](https://www.creativebloq.com/10-anatomy-tips-3d-artists-3113091)
- Anatomy for Sculptors: prefer bony landmarks to fleshy ones (navel, nipples, bottom of the buttocks) for measuring, because "the skin is stretchy and can sag, so the person's age and body type will impact their position". [S] — [Anatomy for Sculptors blog](https://anatomy4sculptors.com/blog/anatomy-for-artists/)
- Anatomy for Sculptors on fat: in men, typically only two fat pads shape hips and buttocks, the medial gluteal pad (responsible for the roundness of the buttock) and the flank pad; women have six. Male buttock fat is typically low, so the gluteal muscle shapes show through. [S] — [Butt anatomy: muscles and fat](https://anatomy4sculptors.com/blog/butt-anatomy-muscles-and-fat/)
- Anatomy for Sculptors publishes a dedicated "Bony landmarks" plate and a "Male torso cross-section" plate. [S] — [ArtStation: Bony landmarks](https://anatomy4sculptors.artstation.com/projects/PeXO38), [project index](https://anatomy4sculptors.artstation.com/projects)

Trunk
- Linea alba runs in the midline from xiphoid process to pubic symphysis with the rectus abdominis either side; the linea semilunaris (outer edge of the rectus) curves from the 9th rib to the pubic tubercle; the tendinous intersections plus linea alba make the "six pack". [S] — [TeachMeAnatomy](https://teachmeanatomy.info/abdomen/muscles/the-abdominal-wall/); [The Plastics Fella](https://www.theplasticsfella.com/abdominal-wall-anatomy/)
- The navel lies between vertebral levels L3 and L4 in physically fit people. [S; one of the abdominal-wall pages in the same search as the two sources above, not identified]. The top of the iliac crest is at L4. [S] — [study-aid page](https://getoncourse.ai/lessons/us-medical-pg/step-2-ck/anatomy/surface-anatomy/back-surface-landmarks) (uneven quality)
- C7 (vertebra prominens) has the most prominent spinous process at the base of the neck. [S] — same study-aid source
- Male nipple, Beckenstein et al. 1996 (100 men aged 17 to 30, ideal weight): about 20 cm from the sternal notch and 18 cm from the mid-clavicular line (the abstract's wording); ideal nipple-to-nipple distance 21 cm; mean areola diameter 2.8 cm. [S] — [PubMed 8722981](https://pubmed.ncbi.nlm.nih.gov/8722981/)
- Male nipple, Shulman et al. 2001 (100 men aged 20 to 36): the nipple-areola complex is oval in most men, mean 27 mm wide by 20 mm high; its centre is in the 4th intercostal space in 75 %; horizontal distance from the mid-sternal line = 2.4 cm + 0.09 × chest circumference (cm). [S] — [QxMD record](https://www.qxmd.com/r/11743381). For a 100 cm chest this gives 11.4 cm from the midline, 22.8 cm between nipples [C].
- The male nipple-areola complex is more oval, more lateral and higher than the female one. [S] — [PMC6212119](https://pmc.ncbi.nlm.nih.gov/articles/PMC6212119)

Limbs
- The tibial crest, the head of the fibula and both malleoli are visible directly under the skin. [S] — [Rubenstein, drawing the leg (PDF)](https://ephraimrubenstein.com/wp-content/uploads/DrawingLegRotOCR.pdf)
- The inner ankle bone sits higher than the outer; the medial head of the gastrocnemius is bigger, rounder and lower than the lateral; the vastus medialis forms a low, heavy "teardrop" near the knee. [S] — [Proko, lower leg](https://www.proko.com/course-lesson/how-to-draw-the-lower-leg-anatomy-for-artists); [Proko, calf](https://www.proko.com/course-lesson/how-to-draw-the-calf-anatomy-for-artists)
- The tibial tuberosity is the bump just below the patella; the acromion is the palpable top of the shoulder; the lateral epicondyle lies in a depression beside the olecranon. [S] — [Human Kinetics excerpt](https://canada.humankinetics.com/blogs/excerpt/bony-landmarks-seen-or-felt-near-the-body-surface) and study-aid pages
- The knees carry infrapatellar fat pads. [S] — [ABMP, Fat 101](https://abmp.com/massage-and-bodywork-magazine/node/3175)

Asymmetry
- Upper-limb bones show a systematic right bias in all dimensions; lower-limb bones are near zero with a slight left bias in femur length and shaft breadth (Auerbach & Ruff). Percentages were not in the extract. [S] — [record](https://data.zhenzhi.com/details/1/871691736)
- A 2025 body-scanning paper: people are asymmetrical left to right "even in healthy individuals", enough to matter for garment fit. [S] — [3DBODY.TECH 2025](https://proc.3dbody.tech/papers/2025/2530.pdf)

Skin colour by body site
- Skin colour clearly differs across the body even in late winter; buttock and inner upper arm are the unexposed reference sites; tanning develops most on hands, arms and instep, then the face (20 women, 18 sites, CIELAB). [S] — [Schmalwieser et al. 2024](https://link.springer.com/article/10.1007/s43630-024-00533-6)
- In a 12-site Korean chromameter study the medial arm was lightest and the forehead darkest. [S, URL attribution uncertain] — [record](https://ngdc.cncb.ac.cn:443/openlb/publication/OLB-PM-16827691)
- The elbow had the lowest lightness and the highest redness (a*) and yellowness (b*) among upper arm, forearm, elbow, shin, thigh and knee. [S] — [MDPI J. Clin. Med. 2024](https://mdpi.com/2077-0383/13/9/2500)
- The forehead had the highest erythema (redness) index and the back of the forearm the highest melanin index (137 subjects). [S] — [Université de Liège](https://orbi.uliege.be/handle/2268/88002)
- Two weeks of sun changed facial and hand skin by about 3.6 to 3.9 CIELAB units: darker, redder, more saturated. [S] — [Jiang et al. 2022](https://eprints.whiterose.ac.uk/id/eprint/187764/)

Skin micro-surface
- Skin microrelief becomes clearly visible at 5 to 10 times magnification as polygonal plateaus (mostly triangles and quadrangles) bounded by furrows; with age the line density falls and mean depth rises. [S, URL attribution uncertain] — [PMC9838641](https://pmc.ncbi.nlm.nih.gov/articles/PMC9838641); [Springer](https://link.springer.com/doi/10.1007/s004030000166)

### Inferences

Region-by-region list for a lean, slightly muscular standing man. All [R] unless a cited finding above covers it. Verify against Gray 1918 (surface anatomy chapter), Richer 1890 and Goldfinger; the team already uses the first two.

Principles
- Bone that is subcutaneous reads hard and fixed: clavicle, acromion, sternum, spine of scapula, olecranon and the whole rear edge of the ulna, head of ulna, iliac crest and ASIS, patella, front-inner face of the tibia, both malleoli, knuckles. Skin plus fat over these is only about 2 to 4 mm in a lean man (section 3), so the surface should sit almost on the bone.
- In a lean man landmarks are bumps and ridges; as fat or muscle around them grows they become flats, then dimples (acromion, ASIS, spine of scapula, greater trochanter, sacral dimples). A slightly muscular 14 % man is in between: clavicle, shin and ankle are ridges, greater trochanter and sacral dimples are hollows.
- Muscles show as soft masses, not as separate strands. Definition at about 14 % fat is uneven: clear at forearms, calves, shoulders and around the knee; soft over lower belly, flanks and lower back, where men store fat first.
- Contours stagger: on a limb the high point of one side never faces the high point of the other (calf: outer bulge high, inner low; ankle: inner bone high, outer low; forearm likewise).
- The big masses are not stacked vertically: rib cage tilts back, pelvis tilts forward, neck leans forward, lumbar curve hollow. Thigh bones slant inward to the knees; shins are near vertical.

Neck and shoulders
- Sternal (jugular) notch between the clavicle heads, framed by the two sternocleidomastoid tendons; hollow above each clavicle.
- Clavicle visible along its whole length, S-shaped: inner two thirds bow forward, outer third bows back. A small step at the acromioclavicular joint.
- Laryngeal prominence in men; one or two faint horizontal neck creases.
- Trapezius slope to the acromion; deltoid caps the shoulder and inserts halfway down the outer upper arm, not near the top (Eaton's point above).
- Hollow below the outer clavicle between deltoid and chest muscle.

Chest
- Midline furrow over the sternum; sternal angle as a slight ridge about 5 cm below the notch at the 2nd rib; small pit at the lower end of the sternum.
- Chest muscle: lower border curves up and out into the front armpit fold; it does not run under the biceps.
- Rib cage edge (costal margin) visible below the chest, more on breathing in; 3 or 4 finger-like serratus slips on the side ribs interlocking with the oblique.
- Nipples: positions and size as measured above; oval, slightly raised, darker.
- Armpit: a deep hollow between front fold (chest muscle) and rear fold (latissimus and teres major), with skin creases.

Abdomen
- Linea alba is a clearer groove above the navel than below. Usually three tendinous intersections (near the lower end of the sternum, at the navel, and between), often not level left to right.
- The lower belly is gently convex even in lean men. Flank mass (oblique muscle plus the flank fat pad) overhangs the iliac crest, leaving a furrow along the crest that continues forward and down as the groin line (inguinal ligament, ASIS to pubis).
- Navel: a real depression with a small hood of skin above it, at about the level of the top of the iliac crests.
- Groin crease and pubic fat pad; genitals hang under gravity.

Back
- Median furrow over the spine, deepest in the loin between the two erector columns; C7 and T1 as bumps; other vertebrae show mainly when bending.
- Shoulder blades: inner border and lower corner show through; the scapular spine is a ridge in thin people and a groove in muscular ones.
- Two sacral dimples over the posterior superior iliac spines, a flat sacral triangle between them and the top of the gluteal cleft.

Hips and buttocks
- Men: squarer buttock with a hollow on the side over the greater trochanter. The gluteal fold is a horizontal skin crease that crosses the oblique lower edge of the gluteus maximus; it is not the muscle's edge.

Arm and hand
- Elbow from behind: olecranon point, inner epicondyle prominent, outer epicondyle in a dimple when the arm is straight. Forearm hangs at a slight outward angle (carrying angle, roughly 5 to 15 degrees).
- Forearm: outer muscle mass sits higher than the inner; a furrow follows the rear edge of the ulna down to the ulnar head, the round bump on the little-finger side of the wrist. The radius ends lower than the ulna.
- Wrist: two or three transverse creases on the palm side with tendons showing; cubital crease at the elbow.
- Hand: knuckles, extensor tendons, dorsal veins, knuckle wrinkles, nails. At 14 % fat, veins show on the back of the hand, forearm and often the biceps.
- A relaxed arm hangs with elbow slightly bent, forearm half turned and fingers curled.

Leg and foot
- Thigh: sartorius crossing from ASIS to the inner knee; outer quadriceps ends higher than the inner teardrop; a flat band down the outer thigh (iliotibial tract).
- Knee, standing relaxed: patella, the ligament below it to the tibial tuberosity, fat pads bulging either side of that ligament, head of fibula at the outer side below the joint. The back of a straight knee is full, not hollow, with tendons either side and a transverse crease.
- Shin: the inner face of the tibia is a flat bare plane from knee to ankle with a sharp, slightly S-curved front edge.
- Calf: inner head lower and fuller; Achilles tendon with a hollow on each side.
- Ankle: inner malleolus higher and further forward, outer lower and further back.
- Foot: tendons and veins on top, bony inner arch, heel pad and ball pad spread under body weight, toes splay slightly.

Folds and creases that must be actual sharp creases: armpit, groin, gluteal fold and cleft, behind the knee, elbow, wrist, knuckles, neck lines, under the chest muscle at the armpit, navel, between toes and fingers.

Women and other builds, briefly. Women: thicker and differently placed subcutaneous fat (six pads at hip and buttock against two, [S] above), thinner dermis at most sites ([S], section 3), wider pelvis relative to shoulders, larger carrying angle, fewer visible veins and tendons, landmarks more often dimples than bumps. Heavier builds of either sex: bony ridges turn into dimples, fat folds appear at flank, belly and back, creases deepen. Very lean or muscular builds: more veins, sharper muscle boundaries, striations.

### Gaps
- No ArtStation, 80.lv or GDC breakdown by a named character artist at Epic, Naughty Dog, Santa Monica or Wētā was retrieved; the practitioner bullets rest on tutorials and Anatomy for Sculptors blog pages.
- Publisher descriptions or reviews of Goldfinger, Bammes and Richer were not retrieved; the region list is recalled.
- No published magnitudes for normal left-right asymmetry of girths in healthy adults were retrieved (Auerbach & Ruff percentages not in the extract).
- No male navel-position ratio (xiphoid to navel to pubis) was found; only the vertebral level.
- No source was found for infrasternal angle, sternal angle position, sacral dimple level, or the height difference between the malleoli; all are [R].
- No numbers for pore diameter or microrelief depth were retrieved.
- No source was found describing what 14 % body fat looks like in terms of measured tissue; the appearance statements are [R] and of low confidence.

---

## 3. Published measurements usable as numbers

### Takeaway
The ANSUR II male means found this session come from search extracts of third-party pages that quote or recompute the survey, not from the report or the CSV, and the average soldier (175.6 cm, 85.5 kg) is far heavier for his height than the game's Body, so girth means are upper bounds, not targets. Tissue data say a lean man's subcutaneous fat averages only a few millimetres over the whole body (about 2 to 6.5 mm) and skin itself is 1.2 to 2.5 mm thick depending on site.

### Cited Findings

ANSUR II (2012 Anthropometric Survey of US Army Personnel; report NATICK/TR-15/007, Gordon et al. 2014)
- The male working database has 4,082 subjects (1,986 women), 93 directly measured dimensions; the data are cleared for unlimited public release as "ANSUR II MALE Public.csv" and were released in 2017; the Penn State Open Lab hosts CSVs in millimetres (mass in hectograms) and the 444-page summary report. [S] — [Army public health page](https://ph.health.mil/topics/workplacehealth/ergo/Pages/Anthropometric-Database.aspx); [data memo](https://ph.health.mil/PHC%20Resource%20Library/ANSURIIDatabasesOverview.pdf); [Penn State Open Lab](https://www.openlab.psu.edu/ansur2/); [report on DTIC](https://apps.dtic.mil/sti/pdfs/ADA611869.pdf); [army.mil release note](https://www.army.mil/article/188601/for_good_measure_natick_releases_raw_data_from_army_wide_anthropometric_survey)

Male values found (mean, SD). None read from the report itself.

| Dimension | Mean | SD | Tag and source |
|---|---|---|---|
| Stature | 1756 mm | 69 mm | [S] comparison table in [Zhou et al. 2016](https://www.researchgate.net/publication/317634404_Anthropometry_model_generation_based_on_ANSUR_II_database); column labels garbled in the extract |
| Body mass | 85.5 kg | 14.2 kg | [S] same table |
| Chest circumference | 1059 mm | 87 mm | [S] [Nathan Tailors](https://www.nathantailors.com/en/percentile/men/chest), citing TR-15/007; median 1056 mm, 5th percentile 922 mm per [second site](https://bodytype-calculator.com/average-chest-size-men/) |
| Waist circumference at navel | 941 mm | not found | [S] one ergonomics site, probably [ergoassessment.cam](https://ergoassessment.cam/ansur-2-data-explorer/), which contrasts it with 862 mm in the 1988 survey; median 937 mm on another site. Conflict: a slide deck gives 1081 mm, SD 115 for "ANSUR II men" with unclear definition or weighting — [Bradtmiller slides](https://www.iise.org/uploadedFiles/Webcasts/Public/Anthropemetric%20Change_Bradtmiller%20-%20for%20AEC%202016%20webinar%20(2).pdf) |
| Buttock (hip) circumference | 1020 mm | 77 mm | [S] Zhou et al. table. ANSUR II pilot study (different sample) gives 1029 mm, SD 75 — [pilot report](https://apps.dtic.mil/sti/pdfs/ADA498172.pdf) |
| Thigh circumference | 625 mm | 59 mm | [S] Zhou et al. table; same mean on [Nathan Tailors guide](https://www.nathantailors.com/guides/average-male-body-measurements) |
| Calf circumference | 392 mm | 30 mm | [S] same two sources |
| Neck circumference | 398 mm | 26 mm | [S] same two sources; 50th percentile 395 mm in [PMC6986765](https://pmc.ncbi.nlm.nih.gov/articles/PMC6986765/) |
| Biceps circumference, flexed | 358 mm | not found | [S] [Nathan Tailors](https://www.nathantailors.com/en/percentile/men/biceps) |
| Forearm circumference, flexed | 310 mm | 22 mm | [S] [Nathan Tailors](https://www.nathantailors.com/en/percentile/men/forearm) |
| Wrist circumference | 176 mm | 9 mm | [S] [Nathan Tailors](https://www.nathantailors.com/en/percentile/men/wrist) |
| Biacromial breadth | 416 mm | 19 mm | [S] [Nathan Tailors](https://www.nathantailors.com/en/percentile/men/shoulder-width); 41.6 cm also on [realbodyfat.com](https://realbodyfat.com/blog/average-shoulder-width/) |
| Bideltoid breadth | about 510 mm (20.1 in) | not found | [S] realbodyfat.com |
| Shoulder circumference | 1179 mm | 64 mm | [S] [Nathan Tailors](https://www.nathantailors.com/en/percentile/men/shoulder-circumference) |
| Chest depth | 254 mm | 26 mm | [S] Zhou et al. table, labels unclear |
| Hand length | 193 mm | 9.9 mm | [S] table quoting n = 4082, source page not identified among the results |

- Nathan Tailors states its averages were "computed directly from the published per-person data"; that claim could not be checked. [S] — [site](https://www.nathantailors.com/guides/average-male-body-measurements)
- An interactive explorer of all ANSUR II measures with 5th, 50th and 95th percentiles exists. [S] — [ergoassessment.cam](https://ergoassessment.cam/ansur-2-data-explorer/)

CAESAR and SizeUSA
- CAESAR measured about 2,500 people in the United States and 2,500 in Europe, aged 18 to 65, per the extract (I recall about 2,400 North American and 2,000 European subjects [R]); its one-dimensional measurements are accessible through DINED (TU Delft, free web tool) and through WEAR, whose membership costs 300 USD per year for the 1D datasets, with the 3D scan collection sold separately (price not found). [S] — [WEAR / bodysizeshape.com](https://bodysizeshape.com/); [DINED](https://dined.nl/en/database/tool); [CAESAR report on DTIC](https://apps.dtic.mil/sti/pdfs/ADA406704.pdf)
- SizeUSA scanned over 10,000 people in 12 US cities ([TC]²); access terms and price not found. [S] — [HFESA resource list](https://www.ergonomics.org.au/anthropometry-resources/)

Subcutaneous fat thickness (ultrasound)
- Müller et al. 2016 (IOC working group) standardised eight sites: upper abdomen, lower abdomen, erector spinae, distal triceps, brachioradialis, lateral thigh, front thigh, medial calf; accuracy about 0.2 mm with an 18 MHz probe. [S] — [PMC4717413](https://pmc.ncbi.nlm.nih.gov/articles/PMC4717413/)
- Störchle et al. 2018 (Scientific Reports): ten men with BMI below 28.5 had eight-site means from 3 mm to 10 mm; measuring 216 random sites per man showed the eight-site mean overestimates the whole-body mean, calibration factor 0.65 (SD 0.05). So whole-body mean subcutaneous fat thickness in these men was about 2 to 6.5 mm [C]. [S] — [Nature Sci. Rep.](https://www.nature.com/articles/s41598-018-34213-0)
- One table (population not stated in the extract): front thigh 7.9 ± 3.5 mm, distal triceps 6.8 ± 3.0 mm, lower abdomen 10.4 ± 4.0 mm, sum of eight sites 60.7 ± 24.6 mm. [S] — [Utah State University paper](https://digitalcommons.usu.edu/cgi/viewcontent.cgi?article=1600&context=hper_facpub)
- In 135 young adults (83 men), fat thickness at abdomen and front thigh predicted percent body fat with r = 0.947. [S] — [Ultrasound Med. Biol.](https://www.umbjournal.org/article/S0301-5629(11)01418-9/fulltext)
- Abe et al. 1994 measured fat and muscle thickness at nine sites in 62 Japanese men (lateral forearm, front and back upper arm, abdomen, subscapula, front and back thigh, front and back lower leg); abdomen correlated best with body density. Per-site values not retrieved. [S] — [record](https://zendy.io/title/10.1002/ajhb.1310060204)
- Skinfold sums of eight sites in elite male athletes: swimmers 64.6 ± 16.1 mm, boxers 63.5 ± 16.1 mm, cricketers 86.1 ± 21.3 mm (a skinfold is a pinched double layer of skin and fat). [S] — [J. Human Sport & Exercise 2022](https://doaj.org/article/ed40bfd8d39e4424a08badc48abb42b9)
- At matched BMI, women have more total and more subcutaneous abdominal fat and less visceral fat than men (whole-body MRI). [S] — [record](https://scilit.net/publications/72b7e698899a2e1bd11ac5026edefb87)

Skin thickness (epidermis plus dermis)
- Laurent et al. 2007 (Vaccine; 20 MHz ultrasound, 205 women and 137 men aged 18 to 70): mean 2.54 mm at the suprascapular site, 2.02 mm at the deltoid, 1.91 mm at the waist, 1.55 mm at the thigh. [S] — [PubMed search pointer](https://pubmed.ncbi.nlm.nih.gov/?term=Laurent+echographic+measurement+skin+thickness+intradermal+2007) (pointer URL; the abstract came through a search extract)
- A 2016 Vaccine study: 1.19 mm (0.65 to 1.55) at the proximal ventral forearm, 1.44 mm (0.78 to 1.84) at the dorsal forearm, 2.12 mm (1.16 to 3.19) at the deltoid. [S] — same search; source page not identified
- Dermis in men versus women: thigh 1.89 versus 1.65 mm; abdomen 2.10 versus 1.99 mm (people with diabetes). [S] — [PMC3897752](https://pmc.ncbi.nlm.nih.gov/articles/PMC3897752)
- High-frequency ultrasound at 13 sites in healthy Chinese adults: epidermis of face and trunk is thinner than on the limbs, the dermis shows the opposite pattern, and the dermis is thicker in men at most sites. [S] — [record](https://ngdc.cncb.ac.cn:443/openlb/publication/OLB-PM-36331142); see also [QIMS study](https://qims.amegroups.org/article/view/137923/html)
- Mean epidermal thickness about 84 ± 17 µm by histology (71 Caucasians). [S] — [Acta Derm. Venereol.](https://medicaljournals.se/acta/download/10.2340/00015555-0875)

Visible Human Project (cross-section data)
- NLM: "As of 2019, a license is no longer required to access the VHP datasets." Before 2019 a signed licence stating the intended use was required, with credit to NLM. A data.gov catalogue entry lists the licence as ODbL, which conflicts; NLM's own page is the authority. [S] — [NLM VHP page](https://www.nlm.nih.gov/research/visible/visible_human.html); [data.gov entry](https://catalog.data.gov/dataset/visible-human-project); [old agreement](https://webarchive.library.unt.edu/web/20121014015102/http://www.nlm.nih.gov/research/visible/vhpagree.txt)
- Male set: 1,871 axial cross-sections at 1 mm spacing, as CT and as colour cryosection photographs; photographs are 2048 × 1216 pixels, 24-bit colour, 0.33 mm per pixel, about 7.5 MB each, about 15 GB in all. 70 mm film scans of the same sections exist at higher resolution (older pages: 4096 × 2700 pixels; a newer page: 0.17 mm). [S] — [NLM getting data](https://www.nlm.nih.gov/research/visible/getting_data.html); [NLM fact sheet](https://www.nlm.nih.gov/pubs/factsheets/visible_human.html)
- Female set: 5,189 sections at 0.33 mm spacing (cubic voxels), about 40 GB. [S] — same pages
- Downloads: NLM's public server and the NCI Imaging Data Commons. [S] — [male images directory](https://data.lhncbc.nlm.nih.gov/public/Visible-Human/Male-Images/index.html); [IDC collection](https://portal.imaging.datacommons.cancer.gov/collections/nlm_visible_human_project)
- The male donor was 38 (one source says 39) years old. [S] — [Wikipedia](https://en.wikipedia.org/wiki/Visible_Human_Project); technical report: [Spitzer et al. 1996](https://pmc.ncbi.nlm.nih.gov/articles/PMC116294)

### Inferences
- The ANSUR II mean man has a body-mass index of 27.7 [C: 85.5 / 1.756²]. The Body (1.80 m, about 14 % fat, slightly muscular, plausibly 76 to 80 kg, index 23.5 to 24.7) is roughly one standard deviation lighter. Use ANSUR means only for bone-governed sizes scaled by 1.80 / 1.756 = 1.025 (biacromial about 426 mm, hand length about 198 mm) [C]. For girths, the correct method is to filter the public CSV to men of 1780 to 1820 mm stature and index 23 to 25 and take that subgroup's means. This is a small script once the CSV is reachable, and it stays inside the project rule (published numbers only).
- Recalled ANSUR II male means not confirmed this session [R, check against the CSV]: waist circumference SD about 112 mm; waist depth about 240 mm; chest breadth about 290 mm; hip breadth about 348 mm; buttock depth about 248 mm; bideltoid SD about 33 mm; foot length about 271 mm (SD 13); foot breadth about 102 mm (SD 5); hand breadth about 88 mm (SD 4); ankle circumference about 229 mm (SD 15). ANSUR II also holds breadth and depth pairs for chest, waist and hip, which give the trunk's cross-section aspect ratio at three levels (chest roughly 290 by 254 mm, a ratio near 1.14) [R/C].
- Fat budget cross-check [C, with assumptions marked R]. At 78 kg and 14 % fat, fat mass is 10.9 kg; if about 3 to 4 kg is internal (R), about 7.5 kg, or 8.3 litres at 0.9 kg/l (R), is subcutaneous. Spread over a body surface of 1.98 m² (Du Bois formula for 1.80 m, 78 kg) this is a mean layer of about 4.2 mm, inside Störchle's 2 to 6.5 mm. So the fat-and-skin shell over the muscles should average about 4 mm of fat plus 1.2 to 2.5 mm of skin, not a uniform centimetre.
- Distribution of that layer for a lean man, combining the extracts: thickest at lower abdomen, flank and buttock (order of 8 to 12 mm), medium at front thigh and back of upper arm (5 to 8 mm), thin at forearm, calf and back (2 to 5 mm), near zero over shin, clavicle, sternum, hand and foot backs, knee cap, elbow point. Values are indicative; only the USU table and Störchle's range support them.
- Skin thickness varies about twofold over the body (back 2.5 mm, forearm 1.2 mm). A thicker dermis forms rounder, blunter folds; a thinner one forms finer wrinkles. This is a reason back and shoulder skin looks smoother than the inner forearm and wrist [R, inference].
- Visible Human male as a cross-section source: licence-free to use since 2019, and one may measure outline shapes of thigh, calf, upper arm, forearm and trunk at any level (the project rule allows looking and measuring). Cautions [R]: he was a cadaver frozen lying on his back, so the back, buttocks and calves are flattened and muscles have no tone; I recall him as about 1.80 m and 90 kg (not confirmed), heavier than the Body.

### Gaps
- None of the ANSUR II values was read from NATICK/TR-15/007 or computed from the CSV (hosts blocked). Not found at all: ankle circumference, foot length and breadth, hand breadth, waist depth, standard deviations for waist and biceps, bideltoid SD.
- No CAESAR summary statistics were retrieved, nor the 3D collection's price.
- No per-site subcutaneous fat table for lean men was retrieved (the Müller 2016 and Störchle 2018 full texts and the Abe 1994 table hold them).
- No MRI or CT study of subcutaneous fat thickness by site in lean men was retrieved.
- No published table of limb cross-section shape (aspect ratio by level) was found; measuring Visible Human slices appears to be the practical route.
- No measured soft-tissue depth over body bony landmarks (shin, sternum, clavicle, iliac crest) was found; searches returned only facial tissue-depth studies.
- Visible Human male height and weight not confirmed; the film-scan resolution is stated differently on different NLM pages.

---

## 4. Freely licensed colour photographs of whole nude or near-nude adults, body parts and skin

### Takeaway
One confirmed candidate fits the need: Mikael Häggström's 2011 studio photographs of a nude man and woman, front and back, on Wikimedia Commons under CC0, about 4,089 × 4,334 pixels for the pair. Several other Commons photographs of standing nude men exist by file name and size, but their licences could not be read; everything else found is either black-and-white historical (Eakins at the Cleveland Museum of Art, CC0) or cross-sectional (Visible Human).

### Cited Findings

Confirmed through mirrors of the Commons page (not the page itself)
- "Anterior view of human female and male, without labels.jpg" (also "with labels" JPG and SVG, and "with labels 2.png"): uploader Mikael Häggström; licence CC0 1.0 public-domain dedication ("copy, modify, distribute and perform the work, even for commercial purposes"); labelled version uploaded 4 October 2011 at 4,089 × 4,334 pixels; the page states "both models have consented to the licence of the image, and its usage in Wikipedia"; one mirror says the photographs were taken at a Stockholm studio in September 2011 with a life-model organisation's help. Shows a nude man and woman standing, front view, arms slightly away from the body. [S] — [mirror of the file page](https://www.wikipedia.org/wiki/File:Anterior_view_of_human_female_and_male,_without_labels.jpg); [mirror with CC0 deed](https://lt.wikipedia.com/wiki/Vaizdas:Anterior_view_of_human_female_and_male,_with_labels_2.png); original (URL built from the file name, not opened): https://commons.wikimedia.org/wiki/File:Anterior_view_of_human_female_and_male,_without_labels.jpg
- "Posterior view of human female and male, without labels.jpg" (and a PNG version) is listed with the same series. [S] — [description template mirror](https://download.osmand.net/wiki/Template:Human_female_and_male_image_description); original (built, not opened): https://commons.wikimedia.org/wiki/File:Posterior_view_of_human_female_and_male,_without_labels.jpg
- Häggström's user page: his works are "Public Domain (CC0 1.0) (unless another license is given for the image)"; the category "Medical images by Mikael Häggström in Public Domain" holds 285 files. [S] — [user page](https://commons.wikimedia.org/wiki/User:Mikael_H%C3%A4ggstr%C3%B6m); [category mirror](https://download.osmand.net/wiki/Category:Medical_images_by_Mikael_H%C3%A4ggstr%C3%B6m_in_Public_Domain)
- A mirror carries Commons' personality-rights warning for the series: the images show identifiable people, and such rights can restrict some uses regardless of copyright. [S] — [mirror](https://www.wikipedia.org/wiki/File:Anterior_view_of_human_female_and_male,_with_labels_2.png)

Exist on Commons, licence not read (must be checked on each file page)
- Category "Male human anatomy" (74 files): "Human male body anatomy.jpg" (4,320 × 5,760 pixels, 2.87 MB), "Male Human Torso.jpg", "Male human anatomy, unannotated.png" (1,702 × 3,288). [S] — [category mirror](https://c.enwp.org/wiki/Category:Male_human_anatomy)
- Category "Human anatomy": "Anatomy of a standing male.jpg" (1,667 × 2,500, 1.66 MB), "Anatomy of a seated male.jpg". [S] — [Commons category](https://commons.wikimedia.org/wiki/Category:Human_anatomy)
- Category "Human surface anatomy": "Akt männlich stehend(2).jpg" (2,764 × 3,456), a standing male nude. [S] — [category mirror](https://c.enwp.org/wiki/Category:Human_surface_anatomy)
- "NLM Visible Human Project - section through the abdomen of a human male.jpg" is on Commons. [S] — [mirror](https://wiki.riteme.site/wiki/File:NLM_Visible_Human_Project_-_section_through_the_abdomen_of_a_human_male.jpg)

Museum open access (black-and-white, historical)
- Cleveland Museum of Art, "Photographs of a Standing Male Nude Model ('Joseph Smith')", circle of Thomas Eakins, about 1883: seven contact prints showing the model from the front, side and rear; Open Access, "copy, modify, and distribute without asking permission", free download. A second record, "Naked Series", is at the same museum. [S] — [CMA 159763](https://www.clevelandart.org/art/159763); [CMA 1997.131](https://clevelandart.org/art/1997.131)
- Philadelphia Museum of Art holds Eakins "Naked Series" prints but shares images "for educational use" only; PAFA lists many with no reuse terms shown. [S] — [PMA object](https://philamuseum.org/collection/object/76781)
- Wellcome Collection records carry either a Public Domain Mark or CC BY 4.0, item by item; Commons hosts Wellcome photographs such as "A man posing naked, with his back Wellcome L0034530.jpg". [S] — [Wellcome example, PDM](https://wellcomecollection.org/works/v4zejre6); [Wellcome example, CC BY 4.0](https://wellcomecollection.org/works/sc3ejzfr); [Commons mirror](https://download.osmand.net/wiki/File:A_man_posing_naked,_with_his_back_Wellcome_L0034530.jpg)

Skin close-ups and stock sites
- EurekAlert lists a close-up photograph of human skin marked CC0. [S] — [EurekAlert multimedia 920061](https://www.eurekalert.org/multimedia/920061)
- Unsplash uses its own Unsplash Licence (not CC0): commercial use allowed, no compiling into a competing library. Pexels: own licence, no selling unmodified copies. Pixabay: own Content Licence since January 2019, no standalone redistribution. None guarantees model releases. Secondary source. [S] — [licenseorg.com summary](https://licenseorg.com/blog/free-stock-photos-licensing-traps)
- Visible Human colour photographs are cross-sections, not surface views (see section 3 for licence and resolution). [S] — [NLM](https://www.nlm.nih.gov/research/visible/getting_data.html)

### Inferences
- For the project's purpose (look and measure, never ship or trace), any lawfully viewable photograph may be looked at; licence matters only if images are stored in the repository or redistributed. The CC0 Häggström pair and the CMA Eakins strips can even be kept in the repository as reference; the unverified Commons files should not be until their pages are read.
- The Häggström male model is, as I recall [R], of ordinary build rather than lean and muscular, lit frontally and softly. It is good for proportion, landmark position, skin colour zoning and where fat sits on an average man; it is weaker for muscle definition at 14 % fat.
- Eadweard Muybridge's "Animal Locomotion" (1887) is public domain by age and shows nude men standing and moving against a measured grid [R]; black-and-white, useful for silhouette and proportion.
- Likely further Commons categories to browse once the host is reachable [R, names unverified]: "Nude standing men", "Male backs", "Human male torsos", "Human hands", "Human feet", "Human knees", "Human skin". Each file there has its own licence.
- The strongest free colour reference available to a small team is its own photographs of a consenting person under known light, which also solves the matched-light problem in section 6. That is not third-party material.

### Gaps
- commons.wikimedia.org was unreachable, so no licence was read on its own page. The Häggström licence rests on mirrors; the other Commons files have no licence information at all here.
- No single-person, high-resolution, freely licensed colour photograph of a lean muscular man in neutral stance, front, side and back, was confirmed.
- No freely licensed macro photographs of skin (pores, forearm, hand, face) or of single body parts were confirmed with licence and resolution. The ISIC dermatology archive and CDC image library were not checked.
- No NIH or other government whole-body surface photograph set was found.
- Whether the Met or Getty hold openly licensed Eakins nudes was not confirmed.

---

## 5. Open 3D or image datasets that may be looked at but not shipped

### Takeaway
The scan datasets named in the brief are licensed for non-commercial research only (THuman2.0, DFAUST per a secondary table) or need a signed institutional agreement (3DBodyTex), so a commercial game team should not rely on them even for looking. The clean options are the Visible Human data (no licence since 2019), ANSUR II's public tables, and the Apache-2.0 "Anny" body model built on MakeHuman assets.

### Cited Findings
- THuman2.0 (Tsinghua): "non-commercial research purposes only"; commercial use including "incorporation in a commercial product" and use as training data for a commercial product is barred; no redistribution without Tsinghua's written permission. [S] — [dataset repository](https://github.com/ytrock/THuman2.0-Dataset)
- 3DBodyTex.v2 (University of Luxembourg): about 3,000 static scans with high-resolution texture; access requires a licence agreement "signed by the recipient and the research administration office director of your institution"; citation required. [S] — [3DBodyTex.v2 page](https://cvi2.uni.lu/3dbodytexv2/)
- DFAUST is listed as "Non-commercial" and RenderPeople as "Commercial" in a comparison table of human-body datasets. Secondary; official pages not read. [S] — [arXiv 2303.15108](https://arxiv.org/pdf/2303.15108)
- RenderPeople's general terms: it "also provides free 3D data for download and thereby grants a free license for the use of the 3D data", under the same terms as paid data. The exact scope was not in the extract. [S] — [RenderPeople terms](https://renderpeople.com/?p=3072)
- SMPL: non-commercial licence; commercial licensing through Meshcapade. Secondary source. [S] — [developer blog](https://dev.to/arkadiuss/a-3d-body-scan-for-nine-cents-without-smpl-4me1)
- Anny (NAVER LABS Europe, November 2025): a parametric human body model for all ages, "free and open-source, released under the Apache 2.0 license", "based on the open source assets developed by the MakeHuman community". [S] — [NAVER LABS blog](https://europe.naverlabs.com/blog/anny-a-free-to-use-3d-human-parametric-model-for-all-ages/); [paper](https://arxiv.org/html/2511.03589v2)
- CAESAR: 1D data through DINED and WEAR (300 USD per year); 3D scans sold by WEAR. SizeUSA: commercial, through [TC]². [S] — [WEAR](https://bodysizeshape.com/); [DINED](https://dined.nl/en/database/tool)
- ANSUR II: the public release is the 1D measurement tables; 3D scans exist for the surveyed soldiers and were used to build shape models. [S] — [Zhou et al. 2016](https://www.inderscience.com/info/inarticle.php?artid=84584)
- Visible Human: no licence needed since 2019. [S] — [NLM](https://www.nlm.nih.gov/research/visible/visible_human.html)

### Inferences
- "Looking" at a non-commercial research dataset in order to tune a commercial product is arguably commercial use under wording like THuman2.0's. Treat THuman, FAUST/DFAUST, SMPL and 3DBodyTex as off limits unless a licence is obtained.
- None of the scan sets shows nude adults anyway [R]: CAESAR, DFAUST and 3DBodyTex subjects wear tight shorts or underwear; THuman2.0 and RenderPeople samples are clothed. They help with body shape, not skin.
- Anny (and the MakeHuman base it derives from, which I recall as CC0 [R]) is a permissively licensed mesh one may open beside the game's body to compare proportions and silhouettes across builds, sexes and ages. Shipping any of it would break the project's own no-third-party-mesh rule, though not the licence.

### Gaps
- Official licence pages for FAUST, DFAUST, SMPL and MakeHuman were not read; the statements above are secondary or recalled.
- RenderPeople's free-model terms were not read in full.
- CAESAR 3D and SizeUSA prices and licence terms were not found.

---

## 6. How realism of digital humans is evaluated, and a practical protocol for a small team

### Takeaway
Studios and researchers judge photorealism mainly by eye against photographs taken under matched, measured light (Cornell box, light-stage work, look-development with grey ball, chrome ball and colour chart), and by blind "photo or render?" tests; automatic metrics (LPIPS, FLIP, FID, CMMD) are proxies that correlate weakly with human judgement of digital humans and need a pixel-aligned or statistically matched reference. A small team can copy the method cheaply: fixed cameras and lights, a small set of standard views, flip comparison against CC0 or self-shot photographs, a raking-light test for dents, and a short blind test.

### Cited Findings

Side-by-side against photographs
- Meyer, Rushmeier, Cohen, Greenberg & Torrance 1986 ("An experimental evaluation of computer graphics imagery", ACM TOG 5(1)): a simple physical environment (the Cornell box) is built, measured and photographed, and the rendering is compared with it, separating physical from perceptual checks. Observer results were not in the extract. [S] — [paper PDF](https://www-users.cse.umn.edu/~gmeyer/papers/meyer-rushmeier-tog-1986.pdf); [Cornell box](https://en.wikipedia.org/wiki/Cornell_box)
- Weyrich et al. 2006 measured face geometry, reflectance and subsurface scattering for 149 people; validation is by figure: images generated from the model "come very close to real photographs". [S] — [paper PDF](https://cdfg.csail.mit.edu/pdf/journal/2006-weyrich-analysis-of-human-faces-using-a-measurement-based-skin.pdf)
- Digital Emily (Image Metrics and USC ICT, 2008 to 2009): the actress was captured in Light Stage 5; the rendered face was "generally accepted as being a real face". The evidence is audience judgement, not a metric. [S] — [CVMP 2009 paper](https://vgl.ict.usc.edu/Research/DigitalEmily/DigitalEmily_CVMP2009.pdf); [fxguide](https://www.fxguide.com/fxfeatured/the-art-of-digital-faces-at-ict-from-digital-emily-to-digital-ira/)
- Appearance research also uses pixel-by-pixel comparison of renderings with photographs, and colour difference (ΔE) between photograph and simulation, which requires the same camera settings for both. [S] — [DTU paper](https://people.compute.dtu.dk/jerf/papers/reassembly.pdf); [Eclat Digital](https://eclat-digital.com/photography-simulation-comparison/)

Look-development practice
- The standard reference kit is a colour chart, a grey ball and a chrome ball, "used to grade and expose the reference and match digital lighting to onset lighting"; the grey ball shows light intensity and shadow, the chrome ball the environment and its orientation, the chart colour and saturation; a grey ball is often not truly neutral; "using a HDRI for CG lighting alone does not get you a fully photo-realistic or believable result". [S] — [Cave Academy](https://caveacademy.com/wiki/post-production-assets/surfacing/surfacing-training/creating-a-neutral-look-development-environment/); [forum summary](https://blenderartists.org/t/color-chart-question/1375162)
- Asset validation means confirming assets "behave as expected in different lighting environments". [S] — [Unity Look Dev manual](https://docs.unity3d.com/2018.2/Documentation/Manual/LookDev.html)

Blind tests
- Holmes, Banks & Farid 2016: 92 % correct on photographs, 60 % on CG; bias toward "photograph"; training lifts CG detection to 76 %. [S] — [EurekAlert](https://www.eurekalert.org/news-releases/780736)
- Farid & Bravo 2012 varied resolution, JPEG compression and colour, and used inverted images to test whether observers rely on holistic face processing. [S] — [paper PDF](https://farid.berkeley.edu/downloads/publications/diginv11.pdf)
- Avatar research uses two-alternative forced choice: a real image and an avatar image are shown and the participant picks the real one. [S] — [ANR, arXiv 2012.12890](https://arxiv.org/pdf/2012.12890)

Automatic metrics and their weaknesses
- SSIM, LPIPS and FLIP are "merely proxy metrics which do not pay attention to salient regions (e.g., for faces…) and do not strictly measure perceptual quality". [S] — [ANR paper](https://arxiv.org/pdf/2012.12890)
- Cutler et al.: for photoreal avatars, nine of ten subjective quality dimensions correlate only weakly with PSNR, SSIM, LPIPS, FID and FVD; they publish an open crowdsourcing test framework covering ten dimensions. [S] — [arXiv 2411.09066](https://arxiv.org/html/2411.09066v3)
- LPIPS: scores can be inflated by preprocessing without better subjective quality; imperceptible adversarial changes can break it; it is not robust to small misalignments; it works at patch level and misses higher-level structure; reported rank correlation with human scores is about 0.67 to 0.75. [S] — [arXiv 2212.05499](https://arxiv.org/pdf/2212.05499); [DreamSim, arXiv 2306.09344](https://arxiv.org/html/2306.09344v3); [arXiv 2207.02512 summary](https://arxiv.deeppaper.ai/papers/2207.02512v1)
- FLIP (Andersson et al. 2020, NVIDIA): a full-reference metric for rendered images against a ground truth; its output is a per-pixel map of the difference a person sees when flipping between the two images, and it depends on viewing distance and pixel size. A psychophysical benchmark finds it over-weights low-frequency differences and is too sensitive between 2 and 16 cycles per degree. [S] — [FLIP paper](https://research.nvidia.com/sites/default/files/node/3260/FLIP_Paper.pdf); [NVIDIA blog](https://developer.nvidia.com/blog/flip-a-difference-evaluator-for-alternating-images); [benchmark, arXiv 2503.16264](https://arxiv.org/html/2503.16264v1)
- FID assumes Inception features are normally distributed, which they are not; it disagrees with human raters and changes with sample size. CMMD replaces it with CLIP embeddings and a maximum-mean-discrepancy distance, claimed unbiased and sample-efficient (authors' claims, CVPR 2024). [S] — [Rethinking FID, arXiv 2401.09603](https://arxiv.org/html/2401.09603v2)
- A study of 3D human animation quality found MS-SSIM and CLIP-based scores the most consistent with human ratings. Secondary mention. [S] — surfaced with [arXiv 2411.09066](https://arxiv.org/html/2411.09066v3)

### Inferences

Why metrics cannot be the main judge here. All of LPIPS, FLIP, PSNR and SSIM need a pixel-aligned reference of the same person in the same pose and light, which a procedural body does not have. FID and CMMD compare sets of hundreds to thousands of images and say nothing about where a body is wrong. Their sound use for this project is regression: FLIP between today's and yesterday's render of the same view to see what changed.

A practical protocol for a small team (my synthesis; each step copies a method cited above).
1. Fixed rig in the game. Cameras stored as presets so every build renders identical frames. Narrow field of view for whole-body views to avoid perspective distortion: about 40 degrees vertical (a 50 mm lens on a full-frame camera held upright) at 3 to 4 m, which frames 2.2 to 2.9 m of height [C]; longer lenses need more distance. Camera at about 1.0 to 1.1 m height. Match whatever lens and distance the reference photograph used when that is known.
2. Views. At 3 to 4 m: front, back, left, right, three-quarter front, three-quarter back. At about 1 m: torso front, torso back, hips and thighs, knees and shins. At about 0.5 m: face, shoulder and clavicle, armpit, navel, hand back and palm, wrist, elbow, knee front and back, ankle and foot.
3. Three fixed light setups: (a) large soft frontal light, to match the Häggström studio photographs; (b) one hard light raking at about 80 degrees from the camera axis, the sculptor's test, which makes every lump and dent cast a shadow; (c) an outdoor or studio environment map with a grey ball, a chrome ball and a colour chart rendered beside the body.
4. Form-only pass. Render the body as plain grey with no skin shading, and compare with a desaturated, slightly blurred photograph. This separates shape errors from shading errors, which Zell et al. show matter in that order.
5. Silhouette overlay. Scale photograph and render to the same stature, overlay outlines for front, side and back, and note where contours differ; measure widths at ANSUR-defined levels (chest at nipple, waist at navel, hip at greatest buttock protrusion, thigh at gluteal fold, calf and ankle).
6. Flip comparison. Alternate render and photograph in place at the same size (what FLIP models); differences that jump out are the work list.
7. Highlight continuity check. Render with a glossy material or stripe reflections; wobbling stripes locate lumps of a millimetre or less.
8. Blind test. Mix the team's renders among real photographs, cropped the same way (for example torso only, hand only), shown first small then large; ask "photo or render?" and "what gave it away?". Because viewers are biased toward answering "photo" and detect CG only about 60 % of the time untrained, use people who do not know the project, include at least as many real photographs as renders, and record reasons, not only the score.
9. Self-shot references. Photograph a consenting person with the same grey ball and chart under a simple light, from the same standard views; this gives matched light, which no found photograph offers.
10. Record every build's standard frames and run FLIP between consecutive builds to catch regressions.

### Gaps
- No studio's written protocol for validating a digital double's skin against photographs under matched light was retrieved; the light-stage "render next to photograph under the same lighting" comparison is recalled as standard in Debevec's group's papers [R] but not confirmed here.
- The observer results of Meyer et al. 1986 and the validation details of the 2010 IEEE CG&A Digital Emily paper were not retrieved.
- No published sample-size or scoring guidance for small blind "photo or render" tests was found.
- No evaluation work specific to nude bodies or to real-time procedural bodies was found.
- Nothing later than 2025 on perceptual metrics for digital humans surfaced; it is unknown whether a newer standard exists as of November 2026.

---

## 7. Failure signatures of procedural and implicit-surface humans ("lumpy", "dented", "melted", "like clay") and their causes

### Takeaway
The implicit-surface literature names the mechanism behind "lumpy" directly: blending separate primitives produces unwanted bulges and unwanted smoothing at joins, an acknowledged long-standing problem. The anatomy and rendering sources name the rest: no bony landmarks gives "soft" and "melted", no fat and skin layer gives "shrink-wrapped", surface-only shading gives "hard plastic", and perfect symmetry and uniform softness give "mannequin".

### Cited Findings
- Bulging where blended primitives meet is a classic implicit-surface problem: "a straightforward implementation produces a bulge where two line primitives touch". [S] — [Paul Bourke, implicit surfaces](https://paulbourke.net/geometry/implicitsurf/)
- Gourmel et al. (SIGGRAPH 2013, "A gradient-based implicit blend") list "bulging" as one of four unsolved problems of implicit blending; their method suppresses the unwanted bulge while keeping the intended topology. [S] — [paper](https://core.ac.uk/download/50538578.pdf). As I recall [R], the other problems are unwanted blending at a distance, loss of small details and unwanted change of topology, and the method steers the blend by the angle between the two fields' gradients. A related approach restricts blending to a "blending volume" where the shapes actually intersect [S, same search; paper not identified].
- An older ratio-weighted blend reduces the bulge but does not remove it. [S] — [Graphics Interface 1994 review](https://graphicsinterface.org/wp-content/uploads/gi1994-20.pdf)
- Polynomial smooth-minimum on distance fields leaves the blended surface slightly off where it should be and needs correction; Quilez documents the family of smooth-minimum functions and that a blend factor can be extracted for shading. [S] — [GameDev.net](https://gamedev.net/shaderlab/28-smooth-sdf-blending/); [Inigo Quilez, smooth minimum](https://iquilezles.org/articles/smin)
- Without bony landmarks "the anatomy becomes very soft, and muscle groups tend to flow in strange directions". [S] — [The Rookies](https://blog.therookies.co/2024/01/21/a-rookies-guide-to-sculpting-an-anatomy-study/)
- Figures with muscles but no fat and skin thickness look "shrink-wrapped". [S] — [Hitem3D blog](https://blog.hitem3d.ai/blog/en-Anatomy-for-3D-Artists-Essential-Knowledge-for-Sculpting-Realistic-Characters/)
- Surface-only shading looks "like hard plastic". [S] — [Jensen et al. 2001](https://www.cs.cornell.edu/courses/cs667/2005sp/readings/jensen01.pdf)
- Hard-edged shadows and perfectly smooth surfaces lower perceived realism. [S for significance, R for direction] — [Rademacher et al. 2001](https://diglib.eg.org/handle/10.2312/EGWR.EGWR01.235-248)
- A realistic material on a shape that is not realistic does not raise realism and can read as eerie. [S] — [Zell et al. 2015](https://ls7-gv.cs.tu-dortmund.de/publications/2015-stylize.page/)

### Inferences

Signature, likely cause, check. Causes are my reasoning from the findings above and from general graphics knowledge [R]; none was tested on the project.

| What a viewer says | Likely cause | How to confirm |
|---|---|---|
| "Lumpy", "bumpy", "like a sack of walnuts" | Each muscle primitive keeps its own convexity through the skin; smooth-union bulges where two primitives overlap; a fat and skin offset that follows every muscle instead of bridging between them | Raking light; grey form-only render; stripe reflections wobble at 2 to 10 cm spacing |
| "Dented", "pitted", "weird shapes" | Gaps between muscle primitives where nothing fills (real bodies have fat and fascia there); smooth-minimum valleys at joins; a primitive ending abruptly under the skin; subtraction-type blends | Raking light from two directions; look at joins of deltoid and arm, chest and shoulder, hip and thigh, around the knee |
| "Melted", "like clay", "soft all over" | Blend radius too large everywhere, so ridges (clavicle, shin, ulna, iliac crest) and creases (groin, armpit, gluteal fold) are rounded away; landmarks missing | Compare with the landmark list in section 2; check for any sharp crease at all |
| "Mannequin", "doll", "plastic" | Uniform softness and uniform colour; perfect left-right symmetry; no hair of any kind; no subsurface light; one smooth specular lobe; no veins, tendons, nipples or navel detail | Colour-zone check; flip the image left to right (nothing changes on a symmetric body); look at the highlight up close |
| "Shrink-wrapped", "anatomy chart", "skinless" | Every muscle equally defined; skin follows muscle with constant small offset; fat not concentrated where men carry it | Compare belly, flank and lower back softness with forearm and calf definition |
| "Inflated", "balloon", "sausage limbs" | Uniform fat thickness all round each limb; circular cross-sections; no flat planes (shin, sacrum, sternum) | Cross-section outlines against Visible Human slices; flat-plane check on the shin |
| "Faceted", "noisy", "dirty shading" | Shading normals taken from a coarse or noisy field (finite differences at the wrong step, low-resolution grid, meshing artefacts) | Render normals as colour; shading noise that moves with the grid, not the body |
| "Floating", "pasted on" | No contact shadow under the feet, no occlusion in armpit, groin and between thighs; hard shadows | Compare with a photograph's foot contact; toggle occlusion |
| "Waxy" | Too much subsurface light, washing out form and pores | Compare shadow-edge softness with a photograph under hard light |
| "Dead", "statue" | No breathing, sway or blinking; rigid symmetric stance | Watch 10 seconds of the idle |

Three structural points for an implicit or blended-primitive body.
- A real body's surface is not the union of its muscles. It is muscles, plus fat pads that fill the valleys between them, plus a skin of nearly constant thickness stretched over the result and tethered at creases and bony points. Skin under tension bridges concavities. A model that offsets or blends muscles directly reproduces every inter-muscle valley and every primitive's bulge; this alone explains both "lumpy" and "dented".
- Smooth blending has one softness. Real bodies need at least three: sharp creases (skin folded on itself), firm ridges (bone under 2 to 4 mm of cover), and soft swells (muscle and fat). A single blend radius makes clay; landmarks and creases need to be added after the soft blend, not through it.
- Small errors are large in shading. A 1 mm bump over 3 cm tilts the normal by about 6 degrees, and a 3 mm dent over 5 cm by about 11 degrees [C], both easily seen in a skin highlight or under raking light at any distance where the region covers more than a few pixels. "Smooth" therefore means continuity of normals and curvature over centimetres, more than fine tessellation.

### Gaps
- No article was found that discusses these failure signatures specifically for procedural or implicit human bodies; the table links general implicit-modelling problems and sculpting advice to the complaint words by inference.
- No source was found on shading-normal noise from distance-field gradients as a cause of "lumpy" appearance.
- No measurements of how large a surface error viewers notice on a body were found; the slope figures are geometry, not perception data.
- Implicit-skinning and muscle-simulation literature on how skin slides and bridges over muscles was not searched and may hold directly usable methods.
