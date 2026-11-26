# bit of land

A shared voxel world where everyone can claim a small plot and build something of their own.

## Development

```bash
npm install
npm run dev
```

## Prototype notes

- Vite + Three.js frontend.
- 6 × 6 plot starter map; each plot is 10 × 10 blocks with 5-block streets.
- Admin and buyer modes are frontend demonstrations only.
- Checkout is simulated; no payment is collected.
- Data is stored locally in the browser for this prototype. Production authentication, persistence, authorization and payments require a secure backend.

## Controls

- Explore: click plots to select available land.
- Build: select an owned plot, choose a block and click the grid to place it; right-click to remove a block.
- Admin: switch to Admin mode to edit the map, terrain palette and plot availability.
- My Land: view your claimed plots and generate a preview card.
