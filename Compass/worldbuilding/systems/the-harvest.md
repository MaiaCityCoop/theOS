---
name: The Harvest
type: economic
prevalence: universal
---

# The Harvest

The growing sheet: how every plant, mushroom and, later, every fish in the game grows, is harvested, levels up and breeds its own seed. Its single source of truth, beside [the game](the-game.md). Set with Samuel on 18 November 2026 (intent 0038).

**The goal of every recipe is the same as the game's: export-positive.** A village grows more of a plant than its own people eat, and sells the rest.

## Overview

Everything that grows runs on **one recipe engine**. A plant is not code; it is a recipe, a row of numbers the engine reads. The same engine grows a basil bed, a strawberry bed, an oyster-mushroom crate and, from 55 villagers, the fish of the aquaponics. Adding a new crop is adding a recipe.

**The clock:** one game month is one real day. All times below are given both ways.

**The figures are estimates** from common greenhouse and mushroom practice, for designing the game; every one needs a source before it is shown as fact, and every one is to be tuned in play.

## Rules & Limitations

### The recipe

Every growable thing is one recipe with these fields:

| Field | What it holds |
| --- | --- |
| **Family** | herb, leaf, root, berry, mushroom, sprout, later fruit and fish |
| **Grows in** | the smallest dome or place it needs: a 3 m dome, a mushroom crate, the aquaponics |
| **Starts from** | seed, runner, cutting, division, or spawn (mushrooms); bought at first, then the village's own |
| **Grow time** | from start to the first harvest |
| **Ready window** | how long a ripe harvest waits; after it, it rots |
| **Harvest kind** | **once** (then start again), **regrow** (cut, it grows back, n times), **continuous** (something ripe every day), **perennial** (years to its full crop, then yearly) |
| **Yield** | portions per bed per harvest |
| **Needs** | water and energy per bed per day |
| **Goes to seed** | how long a plant left unharvested takes to give seed, and how much |
| **Propagates** | runners, cuttings, divisions: new plants for free |

### The engine

For every bed, every day:

- **Time:** grow time × (1 − 5% × (level − 1)).
- **Yield:** base yield × (1 + 15% × (level − 1)) × **climate** × **care** × **seed line**.
  - **Climate** is the village's inner climate from the ladder: from about 55% with the first dome to 100% once the geothermal star holds 24 °C or more all year.
  - **Care:** a ripe harvest left past its window rots. Picked in time, care is 100%.
  - **Seed line:** the quality of the village's own seed (below).
- **Harvest** puts portions in the citizen's hands; they **sell them to their village market** for city HEARTS.
- **A portion is a person's share of a meal.** A citizen eats **3 portions a day**, of any mix. The village market tracks, for every recipe, portions made against portions eaten.

### Levelling a bed

Every bed levels up by its successful harvests, on the Fibonacci numbers:

| Level | Harvests | Unlocks |
| --- | --- | --- |
| 1 | 0 | The recipe as it is |
| 2 | 3 | 5% faster, 15% more |
| 3 | 8 | **Propagation**: take runners, cuttings or divisions; **go to seed** |
| 4 | 21 | A bigger bed: double the plants on the same ground (vertical growing) |
| 5 | 55 | **Mother stock**: the bed sells starts and seed to the village market, for every citizen to plant |

A bed that rots a harvest does not lose its level, but it earns nothing that day.

### Seeds and starts: buying, saving, breeding

- **At first, every start is imported**: seed, plugs and spawn, bought at the market interface with the 10% markup.
- **Go to seed is a choice:** a bed left unharvested gives no crop for its seed time, then gives seed. Income today, against fewer imports tomorrow.
- **Free propagation:** runners (strawberries), cuttings (mint, rosemary, thyme), division (chives): once a village has one plant, it can have many.
- **Breeding the village's own seed lines.** Seed saved from a village's best beds becomes **its seed line** for that recipe. Every generation saved from a level 4 or 5 bed raises the line by one step, up to five: **+5% yield per step**, and the line fits its village's climate. Seed lines are open-pollinated, so they breed true; bought hybrid seed cannot be saved.
- **Seed is an item**: sold at the village market, so neighbours plant local seed instead of imported, and later exported as a village's own line.
- **The seed meter**: next to food and energy, a village counts how much of its seed and spawn is its own.
- **The first seed store** comes with the workshop and store container at 34 villagers; the seed bank at 233.

### The export goal, per recipe

For every recipe the village market shows **made ÷ eaten**. Below 100%, the village imports it. **Above 100%, the surplus is sold**: to other villages in the city for city HEARTS, or, through the gate, out of the city for €. A recipe above 100% is export-positive; a village whose recipes are, is.

## History

The first recipes are for the starter dome (3 m) and the first mushroom crate: plants and fungi that give something nearly every day, so the ten minutes a day always hold a harvest.

## Practitioners

Every citizen tends their own beds in the shared domes. The village market buys what they harvest. From level 5, a bed's tender is a supplier of starts to the whole village.

## Impact on Society

Food is the first thing a village makes for itself, and the first it can sell. Every recipe at more than 100% is a small export, and every seed line a village breeds is a thing no one else has.

## The recipes

Times as **real-world time → game days** (1 game month = 1 day). Yields in portions per bed per harvest, design values.

### Sprouts and microgreens · the same-day reward

| | |
| --- | --- |
| Family | sprout, leaf |
| Grows in | a 3 m dome, on trays |
| Starts from | seed (radish, pea, sunflower, broccoli, mustard, basil) |
| Grow time | sprouts 3–7 days → **0.1–0.25 day**; microgreens 7–14 days → **0.25–0.5 day** |
| Harvest kind | once, then sow again |
| Yield | 2 portions |
| Goes to seed | not as a microgreen: a parent bed of radish, pea or mustard left to flower gives seed in 2–3 months → 2–3 days |
| Levelling | level 3: the village saves its own microgreen seed; level 5: sells trays of seed |

### Basil

| | |
| --- | --- |
| Family | herb · grows in a 3 m dome · from seed |
| Grow time | 4–6 weeks → **≈1.5 days** |
| Harvest kind | regrow: cut every 1–2 weeks → **every ≈0.5 day**, about 8 times |
| Yield | 1 portion |
| Goes to seed | 3 months → 3 days |

### Mint

| | |
| --- | --- |
| Family | herb · grows in a 3 m dome · from cuttings |
| Grow time | 6–8 weeks → **≈2 days** |
| Harvest kind | regrow: every 2–4 weeks → **every ≈1 day**, for good |
| Yield | 1 portion |
| Propagates | cuttings, from level 3 |

### Parsley

| | |
| --- | --- |
| Family | herb · grows in a 3 m dome · from seed |
| Grow time | 8–10 weeks → **≈2.5 days** |
| Harvest kind | regrow: every 2–3 weeks → **every ≈0.7 day** |
| Yield | 1 portion |
| Goes to seed | in its second year → 12 days |

### Chives

| | |
| --- | --- |
| Family | herb · grows in a 3 m dome · from seed or division |
| Grow time | 8–12 weeks → **≈3 days** |
| Harvest kind | regrow: every 3–4 weeks → **every ≈1 day**, for good |
| Yield | 1 portion |
| Propagates | division, from level 3 |

### Coriander

| | |
| --- | --- |
| Family | herb · grows in a 3 m dome · from seed |
| Grow time | 4–6 weeks → **≈1.5 days** |
| Harvest kind | regrow: every 2–3 weeks → every ≈0.7 day, about 3 times, then it flowers |
| Yield | 1 portion |
| Goes to seed | quickly: its seed is coriander seed, a second crop |

### Thyme and rosemary

| | |
| --- | --- |
| Family | herb · grows in a 3 m dome · from cuttings |
| Grow time | 3–4 months → **≈3.5 days** |
| Harvest kind | perennial: light trims monthly → **every ≈1 day**, for years |
| Yield | 0.5 portion |
| Propagates | cuttings, from level 3 |

### Strawberries · the daily berry

| | |
| --- | --- |
| Family | berry · grows in a 3 m dome · from young plants, then runners |
| Grow time | 8–12 weeks → **≈2.5 days** |
| Harvest kind | continuous: something ripe **every day**, for months; each fruit 4–5 weeks from flower → ≈1 day |
| Yield | 1 portion a day |
| Propagates | runners, from level 3: the village never buys strawberry plants again |

### Raspberries

| | |
| --- | --- |
| Family | berry · grows from an 8 m dome · from canes |
| Grow time | 3–4 months → **≈3.5 days** |
| Harvest kind | continuous over a long season |
| Yield | 1.5 portions a day in season |
| Propagates | suckers, from level 3 |

### Blueberries · the long wait

| | |
| --- | --- |
| Family | berry · grows from an 8 m dome · from young bushes |
| Grow time | 2–3 years to a good crop → **≈24–36 days** |
| Harvest kind | perennial: yearly, for decades → every ≈12 days |
| Yield | 20 portions a picking |
| Why it is here | the plant you invest in and wait for: a reason to come back for weeks |

### Goji

| | |
| --- | --- |
| Family | berry · grows from an 8 m dome · from young plants |
| Grow time | 1–2 years → **≈12–24 days** |
| Harvest kind | perennial |
| Yield | 10 portions a picking |
| Propagates | cuttings, from level 3 |

### The fast greens · ready in one to two days

| Recipe | Real time | Game days | Harvest kind | Starts from |
| --- | --- | --- | --- | --- |
| **Pea shoots** | 2–3 weeks | ≈0.6 | regrow, twice | seed (own from level 3) |
| **Radish** | 25–30 days | ≈1 | once | seed |
| **Rocket (arugula), baby leaf** | 3–4 weeks | ≈1 | regrow, 3 times | seed |
| **Lettuce, baby leaf** | 3–4 weeks | ≈1 | regrow, 3 times | seed |
| **Baby spinach** | 4–5 weeks | ≈1.2 | regrow, twice | seed |
| **Pak choi, baby** | 4–5 weeks | ≈1.3 | once | seed |

### The mushrooms · grown in the shade

Mushrooms need no light: they grow in a **mushroom crate**, a dark shelf in the shade of a dome, or, from 34 villagers, in the workshop and store container. They grow on **straw, sawdust or spent coffee grounds**, and what is left after the harvest goes to the compost: the first closed loop of the village.

| Recipe | Spawn run (colonising) | Fruiting | Game days to the first harvest | Then | Starts from |
| --- | --- | --- | --- | --- | --- |
| **Pink oyster** | 10–14 days | 4–5 days | **≈0.6** | 2–3 flushes, every ≈0.3 day | spawn |
| **Oyster** | 2–3 weeks | 5–7 days | **≈0.8** | 2–3 flushes, every ≈0.4 day | spawn |
| **Lion's mane** | 2–3 weeks | 1–2 weeks | **≈1** | 2 flushes | spawn |
| **King oyster** | 4–6 weeks | ≈2 weeks | **≈2** | 1–2 flushes | spawn |
| **Shiitake**, on blocks | 6–12 weeks | 1–2 weeks | **≈2–3** | flushes every few weeks, for months | spawn |

- **Yield:** 3 portions a crate, per flush, a design value.
- **Their own spawn:** at first spawn is bought; from the workshop and store container at 34, a village can culture its own, and its spawn becomes a line it breeds, as seed does.

### Later recipes

From 13 villagers the food forest's trees and shrubs; from 55 the aquaponics, with **duckweed** (it doubles in 1–3 days, fish food and green protein) and the **fish** themselves. Each will be a recipe in the same engine.
