MAFIA NIGHT - standalone version (no Claude needed)

Files:
  server.js         the whole backend, no packages to install
  public/index.html the game
  package.json      tells hosting sites how to start it

Run it on your own computer (friends on the same Wi-Fi):
  1. Install Node.js (version 18 or newer) from nodejs.org
  2. Open a terminal in this folder and run:  node server.js
  3. It prints a link like http://192.168.1.20:3000 - friends open that on their phones.

Put it online (friends anywhere): upload this folder to a Node host
(Render, Railway, Replit, etc.). Start command: node server.js
It reads the PORT the host gives it automatically.

Notes:
  - Rooms live in the server's memory. Restarting the server clears them.
  - The host's phone runs the game timers, so the host keeps the page open.
