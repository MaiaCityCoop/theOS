---
id: "0031"
title: What is not photoreal yet in a person
state: idea               # idea | define | build | propose | story | archived
outcome:
opened: 2026-11-16
story:
---

# 0031 · What is not photoreal yet in a person

## Idea

> Also tell me everything that is not photorealistic now. So we have the inventory of stuff we need to fix.
> […] The inventory was about all the non realistic traits of the human body!
> Isn't it possible to push procedurally generated code to full realism?

Samuel wants the person to look and move like a photographed human, and asks whether code that generates the person can
get there. Below: every trait of the person (`characters/kit/human.js`, `characters/settler.js`) that is not like a real
body, as the code stands on 2026-11-16, each with where it lives; then the answer to the question.

### Form (the mesh: `body()`, `chain()`)

1. The body is seven kinds of tube (trunk with head, arms, hands, legs, feet, ears, nose), each ring an ellipse: no
   anatomy in its sections. No collarbones, shoulder blades, chest, buttocks, kneecaps, ankle bones, calf or forearm
   muscles; the same smooth sausage from every side.
2. The tubes meet by passing through each other at the shoulders, hips and neck, where a body flows from one part
   into the next.
3. The hands are mittens: one tube each, no fingers, no thumb, no knuckles, no nails.
4. The head is the top of the trunk's tube: no skull shape, jaw, chin, cheekbones or brow ridge. The eye sockets are
   dents 4 mm deep, there are no eyelids, the mouth is not an opening, there are no teeth or tongue.
5. The ears are two little tubes and the nose one: no cartilage, nostrils or folds.
6. The feet are one shoe-shaped tube with its sole pressed flat; there is no foot inside, no toes.
7. Everyone has the same face. A person differs only by five numbers (leg length, build, head size, stoutness, lean)
   and height: no age, no sex differences in the body, no fat or muscle where people differ.

### Skin and face (the shader: `materialOf()`)

8. The skin is one colour per person with 6% noise, a warmth on the cheeks and pores as noise in the normals: no
   freckles, moles, veins, redness on knuckles, elbows and knees, no shine where skin is oily, no hairs.
9. Light through the skin is a tint where it turns from the light (wrap and reddening), not light scattered by the
   skin's thickness: ears and fingertips never glow red against the sun.
10. The eyes are painted on the surface: a white ellipse and a dark disc. No eyeball, no iris pattern or colour, no
    pupil, no wet cornea that catches the light, no eyelashes, no tear line.
11. The brows are painted lines, the lips a band of colour.

### Hair (`hairJS`, `hairTSL`)

12. The hair is the head's surface raised 13 to 19 mm where hair grows, with a hair texture on it: no strands, no
    silhouette against the sky, no parting, no stray hairs, and it never moves.

### Clothes (the same mesh and shader)

13. The shirt, trousers, belt and shoes are colour regions of the skin's one surface, not garments: the cloth has no
    thickness, nothing hangs away from the body, the collar does not stand, nothing can come off.
14. The folds are a pattern in the light (normals), not shape; they do not follow the pose, and the cloth never moves
    on its own.

### Skeleton and skinning (`body()`, `humanOf()`)

15. Twenty bones: no fingers, toes, jaw, eyes, eyelids, no twist bones in the forearms and thighs, two bones for the
    whole spine.
16. Each point follows at most two bones, blended straight: elbows, knees and shoulders thin and fold like a tube
    when bent, a twisted wrist pinches, no muscle swells, no skin slides over the bones.

### Movement (`MOVES`, `step()`)

17. Three moves (walk, idle, wave), each written as sine curves: no captured motion, no variation from one step to the
    next, no person who moves differently from another.
18. The moves are blended by mixing angles, which can twist a joint the long way round between two poses.
19. The feet are kept on the ground by lowering the hips only: they slide while walking, do not meet a slope or a
    step, and the body turns on the spot by spinning, not by stepping round.
20. No walk that speeds up into a run, no stopping, starting, turning or standing up.
21. The face never moves: no blinking, no looking at things with the eyes, no mouth or expression; the head looks about
    on a slow curve, not at anything.
22. Nothing moves by itself: hair, cloth, the belly with the breath, flesh with each step.

### In the light (`materialOf()`, `src/world/light.js`, `src/world/shadow.js`)

23. The person never takes a shadow: the material does not read the shadow map or the clouds' shade (every other
    material does, through `cloudAt`), so they stay sunlit under a tree, under a cloud and inside the tent, and an arm
    never shades the body.
24. The person casts no shadow: they are not on the casters' layer, so nothing darkens on the ground under them.
25. No shade where parts touch (between the arm and the body, under the chin, between the legs) beyond the cloth
    textures' own.

### Can code alone get there?

Yes, as far as how it is made: "generated by code" is a way of authoring, not a limit on detail. A body can be built in
code from anatomy (bones as landmarks, muscles and fat as volumes, the skin as the surface over them), skin can be lit
by scattering through its thickness, eyes and hair can be grown, cloth can be cut from patterns and hung, and movement
can be made by physics and foot placement rather than by hand-written curves. Film and game studios generate much of
this procedurally today (hair grooms, skin detail, cloth, gaits).

What code cannot make up is how real people are: proportions, the shape of faces, the way a body moves. That knowledge
has to come from measurements, and it can be taken in as numbers rather than as someone else's 3D models: public
anthropometric surveys (body measures by age, sex and build: the US Army's ANSUR II is in the public domain), and
measured motion (gait cycles, joint angle curves). With those numbers in the code, a generated person can go a long way
towards realistic. The last steps, a face that holds up to a close-up and motion that never looks wrong, are the
hardest anywhere, and the cost on a phone (scattering skin, strands of hair) needs levels of detail as everything else
has.

## Define

## Build

## Propose

## Story

## Archived

---

## Todo

- [ ] Samuel picks which groups to take up first, and whether real measurements (as numbers) may come in

## Changelog

### 2026-11-16

- **Asked:** "Tell me everything that is not photorealistic now. So we have the inventory of stuff we need to fix."
- **Delivered:** the inventory above, 28 points in 8 groups, from the code and the screenshots of the day.
- **Good:** Each point names the file it lives in.
- **Broke / not there yet:** Judged on a software GPU and by reading the code, not on a real GPU or an iPhone; some points may look better there than here.

### 2026-11-16 (2)

- **Asked:** "Isn't it possible to push procedurally generated code to full realism? The inventory was about all the non realistic traits of the human body!"
- **Delivered:** the inventory redone for the person only: 25 points in 7 groups (form, skin and face, hair, clothes, skeleton and skinning, movement, light), read in `characters/kit/human.js`; and the answer on code alone. The first list, the whole world, is replaced.
- **Good:** Found on the way: the person never takes or casts a shadow (points 23, 24).
- **Broke / not there yet:** The first answer covered the whole world, not the person Samuel asked about.

## Trail

| When | Commit | What |
| --- | --- | --- |
| 2026-11-16 | `9a8e050` | the inventory, 28 points in 8 groups |
