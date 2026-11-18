---
name: The Game
type: economic
prevalence: universal
---

# The Game

The game's reference sheet and its single source of truth: how the economy, the coops, survival and the race work. Anything about how the game plays is decided here first; the code and the stories follow it. Set with Samuel on 18 November 2026 (intent 0038); this is the MVP, the essential fixed tree. Players may propose more later.

## Overview

**A survival game that becomes a startup hub.** Every European country founds one fictional city in the game (*Maia City Germania*, *Maia City Portugal*, …). Its citizens have to survive first, then feed and power themselves, then become export-positive, by founding one startup coop after another and owning them together. The score is always wealth. The richest city is built for real; inside it, the richest village is built first, as the pilot.

What the game proves, in real numbers: a post-labour economy that runs on **ownership through coops**, not on labour.

## Rules & Limitations

### The three levels of coops

| Level | What it is | Owns | Who is in |
| --- | --- | --- | --- |
| **City coop**, one per country | The incubator, as a protocol | All **land**; all **connecting infrastructure** underground (tunnels, fibre, water lines, power lines), rented to the utility coops; and the **liquidity pool** between every coop's MINDS, the city's HEARTS and in-game € | Every citizen, through their start capital |
| **Village coop** | The startup hub on the ground | All **buildings** in the village; leases its land from the city coop | **By invitation only** |
| **Startup coop** (food, solar, tractors, …) | A factory | What it makes | **Founded by citizens**, any citizen; each kind is **unlocked along the way** by the milestones |

### The money

| | Amount | Rules |
| --- | --- | --- |
| **In-game €** | €10,000 per citizen at the start | Invested once, half each: €5,000 into the city coop (a founder's share of the land) and €5,000 into the village coop |
| **Personal HEARTS** | 125,000 at the start, plus 24 a day | 7% demurrage a year. 7% of 125,000 is 8,750 a year, about 24 a day: the daily HEARTS hold an idle balance level, so only investing gets anyone ahead |
| **City HEARTS** | What personal HEARTS become when invested in a coop | Sit in that coop's treasury. Backed by the city's liquidity pool, so they are the game's most valuable currency |
| **MINDS** | Ownership stake in one coop (*Solar MINDS*, *Food Dome MINDS*, *Maia City MINDS*, …) | Bought on the coop's funding curve |

**Every coop that is not a village or city coop is unlocked along the way and founded on a citizen's initiative.** **Startup coops and city-wide coops are the same thing:** a startup coop serves the whole city. The six of the essential fixed tree are the first six of the ten every citizen's start reserve funds; the last four are unlocked later. The milestones open what may be founded next; citizens found it.

### The start capital

Every citizen's start is invested the same way, so wealth is split across real coops from the first day:

| Amount | Into | What it gives |
| --- | --- | --- |
| €5,000 | The city coop | A founder's share of the land |
| €5,000 | Their village coop | A founder's share of the village |
| 50,000 HEARTS | The city coop | A share of the land's infrastructure and the liquidity pool |
| 25,000 HEARTS | Their village coop | A share of the village's buildings |
| 50,000 HEARTS | 5,000 each into **10 city-wide coops**, founded by citizens and **unlocked one after another as the villages reach their milestones** | A spread of MINDS across the city's startups |

On day one, 75,000 HEARTS go in (the city coop and the village coop). The other 50,000 are reserved for the city-wide coops: each time a village milestone is reached, the next coop opens and 5,000 of every citizen's reserve flows into it, until all ten are funded. Besides that, every citizen invests their 24 new HEARTS a day as they choose.

### The city's economy: one currency inside

**Everything in the city is paid in city HEARTS.** € exist only at the gate to the outside.

- **Living costs:** every citizen pays **rent** to their village coop and **food money**, in city HEARTS.
- **Earning:** citizens earn city HEARTS by making **work proposals** to the village and city coops; a proposal a coop accepts is paid.
- **The global rule, hard-coded: every coop pays 50% of its turnover, in real time, to its MINDS holders.** Turnover, not profit: each coop runs on the other half.
- **The circle:** rent and food money are the village coop's turnover; half of it flows straight back to its MINDS holders, the citizens, who pay rent and food with it again.
- **Personal HEARTS are for investing** (they buy MINDS and become city HEARTS in a coop's treasury); living costs are paid only in city HEARTS, from proposals or payouts.
- **A free citizen** is one whose MINDS payouts cover their rent and food: they no longer need to make proposals to live. How many are free is the game's proof of a post-labour economy.
- **Your harvest is income.** Every citizen sells what they harvest back to **their own village coop's market**, for city HEARTS. The daily harvest is tied straight into the economy.
- **Prices:** the village coop sets rent and food prices. **Anything imported, food or goods, is resold at a markup of at least 10%.**
- **Governance:** every village coop and the city coop has **its own governance model**, which sets its decision logic locally: who accepts work proposals, how prices are set, what is founded next.
- **The gate:** city HEARTS and € meet in the city coop's liquidity pools, an **automated market maker**: prices move by supply and demand. **Only coops may pass the gate**; citizens never hold €. € come in from investors and exports; € go out for imports at the market interface.
- **Bootstrap liquidity:** the city coop keeps a small pool for every coop, about **10% of that coop's MINDS supply**, matched with an initial amount of city HEARTS. It is **protocol-owned and one-way**: it never leaves the pool, unless the coop is liquidated.

### The funding curve

- Every coop is funded on a **continuous funding curve** (a bonding curve): the more is invested, the higher the price of the next MINDS.
- **Buy only. MINDS are never sold back to the curve.** What goes into a coop stays in it.
- A coop that fails goes **insolvent**: what is left of it is auctioned, and the proceeds are paid out to its MINDS holders. (The rest of insolvency is decided later.)

### Wealth, the score

- **Wealth is measured in HEARTS against the € pools.** Every coop, village and city therefore has a value in €.
- The total wealth of every **city** and every **village** is measured, always, in public.

### The Fibonacci gates

- A village climbs by **Fibonacci gates, measured in the total treasury wealth of its village coop.**
- Each gate unlocks the next village level and **external investors** (fictional, in €), as the milestones do in a city-builder. They take a stake in the village coop.
- **Citizens always own at least 51%.** External investors together never hold more than 49%.
- Each gate reached also gives someone a **real dome**: a co-living, food-forest dome, larger as the project grows.

### The market interface

- One clearly defined window to the market outside the game, at **central market prices in €**: a tractor, a tent, a generator, wood, steel for domes, food. Everything needed to build anything in the game that the city cannot make yet.
- **Import** what the city cannot make: € and HEARTS leave the city. **Export** its surplus: € flows in. External money flows out in €.

### Survival, sovereignty, export

Every citizen needs food and electricity every day. Three meters, per city:

| Meter | Measures | When short |
| --- | --- | --- |
| **Food** | Food grown in the city ÷ food its people need | Imports: wealth leaves |
| **Power** | Electricity made ÷ electricity used | Imports: wealth leaves |
| **Trade balance** | € from exports − € spent on imports | The city bleeds |

Every city goes through three stages: **survive** (imported food, tents and generators keep people alive, at a cost), **sovereign** (food and power at 100% or more) and **export-positive** (its surplus sold, wealth flowing in). Growth pulls against it: every new citizen raises the need.

### Daily play: ten minutes

- **The hook is the harvest.** The clock follows modern greenhouse growing cycles, with **one game month to one real day**, so nearly every day something of a citizen's own is ripe.
- **No seasons in the MVP.** Everything grows inside the domes, all year. What changes with the levels is the domes' **inner climate**: steadier at every gate, so they yield more of the year, until the geothermal star at 610 holds 24 °C or more all year round.
- **Every citizen tends their own plants** in the shared dome's food-forest garden. **There are only shared domes.**
- **Neglect costs yield.** A day missed, and that day's ripe harvest rots. So every citizen comes back to harvest every day, for their own and their village's export goals.
- Then the day's 24 HEARTS are invested.

### The essential fixed tree (MVP)

| # | Coop | Replaces or makes | Stage |
| --- | --- | --- | --- |
| 1 | **Food**: food dome, food forest | Imported food | Survive |
| 2 | **Power**: solar | Generators | Survive |
| 3 | **Water** | Imported water | Survive |
| 4 | **Shelter**: dome building | Tents | Sovereign |
| 5 | **Materials**: wood, earth blocks, steel processing | Imported building materials | Sovereign |
| 6 | **Machines**: tractor, tools | Faster everything else | Export |

Later, not in the MVP: underground transport, the dome factory, robotics, and coops players propose. Inspired by Open Source Ecology's *Global Village Construction Set*: a small civilization built from a set of open machines, here each one a coop.

### The village ladder

**A village starts with at least 3 settlers,** who get the starter pack: a used pickup, 3 tents, a small generator, a 3 m growing dome for herbs and berries, and a 5 m dome in the centre for the village market, which they raise together. It fits what three settlers bring: €30k in all, €15k of it in the village treasury, which pays for the pack; the other €15k is the city coop's. From there it climbs by **Fibonacci gates in villagers**, through four phases. **The village coop owns every dome.** Two kinds: **living domes** (for 4, 12, 24 and 48 people; the tents move inside them, and none is ever taken down) and **growing domes** (Fibonacci diameters). **Every dome comes with its own tech box:** battery, a few small CPUs, internet, a heat pump and converters, all its technology in one container. Its solar cells are on the dome.

**The geothermal star:** from 610 villagers, the geothermal plant in the village centre feeds heat and power in a star to every dome's heat pump, and the domes hold **24 °C or more all year**. Until then, every gate makes their climate steadier. **Energy is never exported out of the city;** a surplus goes only to neighbouring villages that started later.

**Large growing domes, 55 m and up, hold aquaponics, fish and water ponds** beside the food forest: fish and greens in one water cycle.

**The village market** stands in the centre from the first day: a 5 m dome the first three settlers raise themselves. Every citizen sells their harvest there. It grows with the village: into the market hall at 144 villagers, and into the village centre tower later.

**Compute arrives once, all of it,** at 987 villagers: one server farm in the village centre tower. Compute is what the village exports.

| Phase | Villagers | Goal | Investment | Funded by |
| --- | --- | --- | ---: | --- |
| 1 · Food | 3 – 377 | Food sovereignty | ≈ €21M | The citizens; angels from 13, seed from 55 |
| 2 · Energy | 378 – 610 | Energy sovereignty: the geothermal star, built once 610 is reached | ≈ €40M | The first major investor |
| 3 · Compute | 611 – 987 | The server farm in the tower; compute exported | ≈ €127M | The second major investor |
| 4 · Factories | 988 – 1,597 | Startup factory coops around the centre; fewer imports; the city export-positive | ≈ €113M | The third major investor |

| Villagers | Phase | Added | € this level | € in total | Funded by | Food import | Energy import |
| ---: | --- | --- | ---: | ---: | --- | ---: | ---: |
| 3 | 1 · Food | **The starter pack:** a used pickup, 3 tents, a small generator, a 3 m growing dome for herbs and berries with its tech box, and **the village market dome**, a 5 m dome in the centre, raised by the three settlers | €15k | €15k | The village treasury | 98% | 99% |
| 5 | 1 · Food | 2 tents, one shared; a 5 m dome (vegetables) and its tech box | €19k | €34k | Citizens | 97% | 97% |
| 8 | 1 · Food | The first 4-person living dome; an 8 m dome; a rainwater tank | €93k | €127k | Citizens | 94% | 94% |
| 13 | 1 · Food | A 4-person dome; a 13 m dome, the first food forest; the kitchen container | €210k | €337k | First angels | 88% | 90% |
| 21 | 1 · Food | The first 12-person dome; a 21 m dome; the bath and sanitary container | €375k | €712k | Angels | 80% | 86% |
| 34 | 1 · Food | A 12-person dome; a 34 m dome; the workshop and store container | €500k | €1.2M | Angels | 70% | 82% |
| 55 | 1 · Food | The first 24-person dome; a 55 m dome, the full food forest, with the first aquaponics and fish pond; the water-cycle plant | €1.1M | €2.4M | Seed | 58% | 78% |
| 89 | 1 · Food | The first 48-person dome; an 89 m dome | €2.6M | €4.9M | Seed | 45% | 74% |
| 144 | 1 · Food | A 48- and a 24-person dome; the 144 m district dome; the market dome grows into the market hall | €6.9M | €11.8M | Seed | 30% | 70% |
| 233 | 1 · Food | Two 48-person domes; two 55 m domes; the compost and seed bank | €2.8M | €14.6M | Seed | 15% | 66% |
| 377 | 1 · Food | Three 48-person domes; two 89 m domes; the cold store and processing | €6.0M | €20.6M | Seed | 0%, food-sovereign | 62% |
| 610 | 2 · Energy | Five 48-person domes; two 144 m domes; the geothermal star, about 3 MWe and the heat network to every dome | €39.5M | €60M | First major investor | 0% | 0%, energy-sovereign |
| 987 | 3 · Compute | Eight 48-person domes; three 144 m domes; the village centre tower, first stage, with the server farm (about 2 MW of compute, storage, cooling); geothermal grown by about 5 MW | €127M | €187M | Second major investor | 0% | 0%; compute exported |
| 1,597 | 4 · Factories | Twelve 48-person domes; four 144 m domes; the tower completed; startup factory coops around the centre: domes, batteries, solar panels, geothermal drilling, open-source machines, avenCEO | €113M | €300M | Third major investor | 0% | 0%; export-positive |

- **Room for everyone, always:** the living domes hold 416 people at 377, 656 at 610, 1,040 at 987 and 1,616 at 1,597.
- **The € figures are rough estimates** (2025–26 market levels for tents, domes, containers, geothermal and computing), for sizing the game; each needs a real quote before it is shown as fact. The percentages are design values, to tune.
- **The 49% cap:** citizens pay in about €16M by 1,597 (€8M to the village coop) against about €300M invested, so their 51% holds only because their stake is valued through the HEARTS–€ pool, as treasury wealth.
- Phases 2 to 4 are one gate each and long to build; their build steps (drilling begins, plant online, tower shell, server farm online) may become sub-milestones.

### The race

- **Between countries:** the richest city, by total wealth, wins the real city.
- **Inside the winning city:** its richest village is built for real first, as the pilot programme, before the real city.

## History

The first phase of the game is the **monetary primitive with survival**: the city coop, one village coop, citizens with their start capital and HEARTS, survival by importing food, tents and generators through the market interface, and the first startup coops founded to stop those imports. Everything else stands on it.

## Practitioners

- **Citizens:** every player; part owner of the city coop from the start.
- **Founders:** anyone who founds a startup coop.
- **Village members:** citizens invited into a village coop.
- **External investors:** fictional, in €, never more than 49% of a village.
- **Maia:** runs the protocol (the funding curves, the pool, the market interface) and pushes everyone to found the next coop.

## Impact on Society

Every city is a startup hub: founding the next coop is what people do, every day. That is the vision as a game mechanic: making a sparkling vision real becomes the norm, not the exception.

The numbers the game publishes, the proof:

- **Free citizens:** the share whose MINDS payouts cover their rent and food.
- **Days to sovereignty:** how fast a city feeds and powers itself through owned coops.
- **Food and power per citizen.**
- **Trade balance**, per city and per country.
- **Wealth**, per coop, village, city and country.

## Open

- Insolvency in full.
- Each coop's governance model, in detail.
- The ladder's percentages (food, energy, climate) and the plants per dome size with their real growing cycles: to be tuned, and sourced before they are shown as fact.
- Real-world numbers (dome yields, solar output, market prices) need sources before they are shown as fact.
