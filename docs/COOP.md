# Co-op: design note (not implemented)

The master prompt lists an optional cooperative mode under "M19+ possible future expansions", with a warning: co-op needs major architecture changes, so multiplayer networking must **not** be added to the single-player foundation too early. This note records what co-op would take. **No networking code exists in the game, and none was added.**

## Why it isn't a small change

- **One authority for the world.** The world is simulated in one scene (`World.ts`): survival, creatures, weather, quests and saves. Co-op needs a single authority (a host or a server) that runs the simulation and sends state to the other player. Today every system assumes it is that authority and that there is exactly one player.
- **One player everywhere.** Creatures choose a target, encounters spawn around the player, stealth measures the player's noise, and the camera, lighting, minimap and HUD follow one player. Each of these would need to know about several players.
- **Story moments pause the world.** Story choices, traveler talks and sleeping stop the simulation for one player. In co-op the world keeps going for the other, so these need a shared or per-player design.
- **Saves are local.** Journeys live in this browser's `localStorage`. A shared journey needs an agreed owner and a save the other player can't corrupt.
- **Privacy.** The game makes no requests to other sites and has no telemetry (see PRIVACY.md). Its only requests are for its own files, including the optional art manifest. Any co-op mode would need its own privacy note and the project owner's explicit approval before anything is sent anywhere.

## A path, if it is ever wanted

1. **Separate the simulation from the scene.** Move survival, creatures, weather and quests into plain systems that take inputs ("player N wants to move east") and produce state. Many systems are already Phaser-free (Season, Rules, Records, Travelers, Gamepad mapping, Save).
2. **Make the input layer multi-player.** M19 already turns devices into actions. A second local player (couch co-op with a second controller) is the cheapest first step: no network, no new privacy questions, and it proves the "several players" changes.
3. **Use deterministic state where possible.** Terrain, ruins, landmarks and traveler visits are already pure functions of the seed. Only what changes (nodes, structures, creatures, inventories) would need syncing.
4. **Network last.** Use a host-authoritative design over WebRTC data channels, so no game server needs running. Add it only after 1–3 work, with a privacy review.

## Recommendation

If co-op is wanted, start with **local couch co-op**: one screen, two controllers, no network. It delivers most of the fun, keeps the no-telemetry promise, and does the architectural groundwork. Online play should be a separate, explicitly approved project.
