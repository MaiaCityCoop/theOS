Measuring scripts from the Mac session (intent 0033). bun, Playwright 1.63.0 (outside the repo), dev server on 5180,
`S=<scratch dir>` for outputs.
- band.mjs + sheet.mjs: an oak and a pine at set distances per config (MODES="name:&flags,..."), 4K crops, a sheet.
- stills.mjs + diff.mjs: full 4K stills of fixed views per mode, and their difference (mean, px > 8, blocks, heatmap).
- cfgbench.mjs: tools/bench.js at a ratio (RATIO, 3 = 4K) for configs, two alternating runs.
- ab.mjs: old vs new bench and parts() in Chrome and WebKit.
- loo.mjs, lx.mjs: the land's cost by leaving parts out; lx.mjs used temporary shader switches not in the code.
