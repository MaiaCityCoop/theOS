# Ready-made open characters for three.js, looked at by hand

2026-11-18. Not a research line: Samuel stopped the research and asked for the reference libraries. Everything
below was fetched from GitHub into this environment, its licence read from the repository's own file, and, where
a figure could be obtained, loaded in three.js 0.187 and drawn under one studio light (software GPU). Nothing here
was timed, and nothing was seen on a real GPU. The renders are not in the repository: they show third-party
figures and were sent to Samuel directly.

## Characters that load and were drawn

| Library | Licence (as read) | What is in it | What was measured on the figures drawn | Link |
| --- | --- | --- | --- | --- |
| Microsoft Rocketbox | MIT | 19 adult women, 21 adult men under `Assets/Avatars/Adults`, more elsewhere; FBX, TGA maps | `Female_Adult_01`, `Male_Adult_01`: about 8,700 and 7,400 triangles, 81 bones, 175 shapes in the `_facial.fbx` (the 52 ARKit names as `AK_01…52`, visemes as `AA_VI_*`), head and body maps of 2048 | https://github.com/microsoft/Microsoft-Rocketbox |
| VALID (UCF and Google) | MIT | 234 FBX files of 42 figures (three women and three men of seven groups), each in up to six outfits; textures embedded | `White_F_1`, `White_M_1`, `Black_F_1`, `Asian_M_1` (Casual): 58,700 triangles (68,100 with a wig), 65 expression shapes with their own names (`RsmileOpen_h`, `AE_AA_h`, not ARKit's), a skeleton of 84 bones of which 54 carry the skin (Blender's count; three.js's loader names some 500 nodes bones), teeth and eyes as meshes of their own, a colour map and a normal map of 2048 for the whole figure, the wig's own map of 2048, files of 7 to 8 MB | https://github.com/xrtlab/Validated-Avatar-Library-for-Inclusion-and-Diversity---VALID and https://github.com/google/valid-avatar-library |
| MakeHuman through MPFB | add-on's code GPLv3, its assets CC0; the makers claim nothing over what it puts out | a builder inside Blender (age, gender, build, face), not a set of finished figures | one finished woman, TalkingHead's `mpfb.glb` (CC0): 83,686 triangles in 8 meshes, 67 bones, 66 shapes (52 ARKit and 14 visemes), eyes, teeth, tongue, brows, lashes, hair and clothes apart. A man could not be built here: the skin packs sit on a host this environment may not reach | https://github.com/makehumancommunity/mpfb2 and https://github.com/met4citizen/TalkingHead/blob/main/avatars/mpfb.glb |
| CharMorph's characters | add-on's code GPL-3; Antonia CC BY 3.0, Reom "CC-BY" (no version given), the MB-Lab man and woman AGPL-3 | Blender files of base meshes, shapes and skin maps; made for Blender, to be exported | Antonia 35,990 faces, Reom 8,438 faces with skin maps of 4096 and 8192; exported here with headless Blender 5.3 to GLB and drawn: bare bases, no hair, Reom without brows; their shapes and rigs are the add-on's to apply and were not exported | https://github.com/Upliner/CharMorph and https://github.com/Upliner/CharMorph-db |

Seen side by side, none of them stands beside Samuel's photograph. The nearest to a photograph are Rocketbox's
faces (their skin reads as painted from photographs), then VALID's, then the MakeHuman woman. Antonia and Reom are
smooth, drawn bases.

## VALID's figures share one layout

Checked with headless Blender on the four figures fetched (a white woman, a white man, a black woman, an Asian
man): the body's mesh has the same 20,951 points and 20,896 faces in each, joined in the same order, and the same
UV layout to the fourth decimal; so have the eyes and both rows of teeth. Each carries the same 65 shapes and the
same 84 bones (`Hips`, `Spine`, `Neck`, `Head`, `LeftEye`…). So any two of these figures can be blended point by
point, and a skin map drawn for one lies right on every other. The other 38 figures were not checked that closely.
Read later from all 42 casual files as converted to glTF: every body is 41,792 triangles with 65 shapes; the
skeleton is 84 bones in 19 of them, 99 in 9, 114 in 13 and 129 in one; 12 have their hair as a mesh of its own.

## Open but not a finished person

- **Lee Perry-Smith's head** (three.js `examples/models/gltf/LeePerrySmith`): CC BY 3.0, read. One scanned man's
  head with colour, gloss and normal maps; no eyes of its own, no rig, no shapes.
- **ICT-FaceKit, Google GNM, Meta MHR, NAVER Anny**: open shape models of heads or bodies; no skin maps came with
  what was fetched (seen earlier this day).
- **Open Source Avatars** (https://github.com/ToxSam/open-source-avatars): a register of VRM avatars, its own
  collections CC0; drawn figures in a cartoon manner, their files on a host not reached from here. Not drawn.

## Tools on three.js that can be reused (licences read)

- **TalkingHead** (MIT, https://github.com/met4citizen/TalkingHead): a three.js class that makes an avatar speak and
  look: wants a Mixamo-compatible rig and the ARKit and Oculus viseme shapes. Brings Blender scripts that turn a
  MakeHuman figure, and Rocketbox's shape names, into what it wants. Its readme says Rocketbox figures must be
  rigged anew for it. Of its sample avatars only `mpfb.glb` is CC0; the others are for non-commercial use.
- **CharacterStudio** (MIT, https://github.com/M3-org/CharacterStudio): an avatar builder on three.js 0.183 and
  three-vrm: parts chosen by click, colours, export as GLB or VRM, meshes merged to one draw. It swaps ready parts;
  it does not shape a face.
- **Mesh2Motion** (code MIT, art CC0, https://github.com/Mesh2Motion/mesh2motion-app): on three.js 0.187; rigs a
  model in the browser and brings 234 movements for a human skeleton as GLB.
- **three.js's own examples**: the webcam example drives a face from MediaPipe's values on `facecap.glb` (credited
  to Face Cap); the skinning examples use Mixamo figures (credited to mixamo.com). No licence file lies beside
  those figures in the repository.

## img2threejs (Samuel's link)

https://github.com/hoainho/img2threejs, Apache-2.0, read from its repository (its site, img2threejs.io, is not
reachable from here). A skill for coding agents that rebuilds one reference picture as three.js code, pass by pass
(blockout, structure, form, material, surface, light), each pass looked at against the reference and held by
scripted gates. What it says of itself: "It is strong for hard-surface objects; characters are stylized
reconstructions, not photoreal likeness." For a likeness it names two levers only: fit a shape model and the
camera to the picture's landmarks, and lay the picture's own pixels, with their light taken out, on the mesh. For
characters its newer way starts from a generated GLB used "as a measurement instrument", not shipped.

## Not found or not reached

`makehumancommunity/makehuman-assets` and `wassname/makehuman-js` did not clone (asked for a login). MakeHuman's
main repository holds one default skin only.
