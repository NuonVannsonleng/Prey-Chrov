# Khmer & cultural review pack

Generated from `src/data/*.json` and the code by `npm run l10n:export`. Do not edit by hand; regenerate after content changes.

**95 lines to review:** 42 in Khmer script, 53 English lines that touch Khmer culture or belief.

For each line, a native Khmer speaker (and, for cultural lines, a cultural advisor) can mark it OK, suggest a correction, or flag it to cut. The CSV beside this file (`review_pack.csv`) has the same rows with empty **status**, **suggestion** and **reviewer** columns for a spreadsheet.

Ground rules from the design: Neak Ta are guardian spirits and never enemies. Ap and Arak are hostile *fictional interpretations*. The game must not depict or instruct literal religious practice. The fiction disclaimer stays in the credits.

## achievements.json

| Kind | Where | Labels | Text |
| --- | --- | --- | --- |
| Cultural | `achievements[12].description` | guardian_respect | Bow at a Neak Ta shrine and leave an offering of food. |

## biomes.json

| Kind | Where | Labels | Text |
| --- | --- | --- | --- |
| Khmer | `[0].nameKm` | clearing | វាលស្មៅក្នុងព្រៃ |
| Khmer | `[1].nameKm` | deep_jungle | ព្រៃជ្រៅ |
| Khmer | `[2].nameKm` | bamboo_grove | ព្រៃឫស្សី |
| Khmer | `[3].nameKm` | river_swamp | វាលភក់ស្ទឹង |
| Khmer | `[4].nameKm` | ancient_ruins | ប្រាសាទបុរាណ |
| Cultural | `[4].ambience` | ancient_ruins | Moss-choked stone and a heavy hush; incense long burnt out still seems to linger, and the wind carries whispers. |
| Khmer | `[5].nameKm` | rocky_ridge | ជួរថ្មក្រហម |

## ending.json

| Kind | Where | Labels | Text |
| --- | --- | --- | --- |
| Cultural | `text.prompt` |  | Make an offering at the Heart Tree |
| Cultural | `text.needOffering` |  | Hold food as an offering, and bring two spirit dust from the restless ones. |
| Cultural | `text.restored` |  | You lay down your offering with both hands. The old promise is spoken again. |
| Cultural | `epilogue[0]` |  | The Heart Tree stirs. A warm wind passes through the branches, and the old promise is renewed. |
| Cultural | `epilogue[1]` |  | Far along the forest paths, the Neak Ta return to their shrines, and the offerings left for them are honoured once more. |
| Cultural | `epilogue[2]` |  | The Ap and Arak grow quiet. The wound that called them begins to close, and the restless ones fade into the dark. |
| Cultural | `river.epilogueUnrestored[1]` |  | The forest's wound is still open. The Ap and Arak still wander restless in the dark, and the shrines wait for better days. |
| Cultural | `river.epilogueRestored[1]` |  | The Heart Tree is at peace. The Neak Ta rest at their shrines, and the Ap and Arak have faded into the dark. |
| Khmer | `credits[0]` |  | Prey Chrov (ព្រៃជ្រៅ) — a work of fiction |
| Cultural | `credits[3]` |  | Folklore-inspired creatures and places are creative interpretations, not authoritative descriptions of Khmer religion or culture |
| Cultural | `credits[4]` |  | To be reviewed with Khmer speakers and cultural advisors |

## enemies.json

| Kind | Where | Labels | Text |
| --- | --- | --- | --- |
| Khmer | `[0].nameKm` | wild_boar | ជ្រូកព្រៃ |
| Khmer | `[2].nameKm` | tiger | ខ្លា |
| Cultural | `[3].name` | ap | Ap |
| Khmer | `[3].nameKm` | ap | អាប |
| Cultural | `[3].description` | ap | A fictional game interpretation of the Ap of Khmer folklore: a hostile, restless floating head with a pale glow. It shrinks from firelight. |
| Cultural | `[4].name` | arak | Arak |
| Khmer | `[4].nameKm` | arak | អារក្ស |
| Cultural | `[4].description` | arak | A fictional game interpretation of the Arak of Khmer folklore: a hostile, sorrowful shadow that keeps its distance and casts cold violet light. It will not enter firelight. |

## items.json

| Kind | Where | Labels | Text |
| --- | --- | --- | --- |
| Khmer | `[0].nameKm` | wood | ឈើ |
| Khmer | `[2].nameKm` | bamboo | ឫស្សី |
| Khmer | `[3].nameKm` | stone | ថ្ម |
| Khmer | `[7].nameKm` | leaf | ស្លឹក |
| Khmer | `[10].nameKm` | spear | លំពែង |
| Khmer | `[11].nameKm` | torch | ពិល |
| Khmer | `[14].nameKm` | bamboo_shoot | ទំពាំងឫស្សី |
| Khmer | `[16].nameKm` | raw_meat | សាច់ឆៅ |
| Cultural | `[20].name` | spirit_dust | Spirit Dust |
| Cultural | `[20].description` | spirit_dust | Cold violet ash left where a night spirit faded. Fictional, and faintly glowing. |
| Khmer | `[22].nameKm` | cooked_fish | ត្រីអាំង |

## lore.json

| Kind | Where | Labels | Text |
| --- | --- | --- | --- |
| Cultural | `disclaimer` |  | Prey Chrov is a work of fiction. Its creatures, ruins, tablets and story are creative interpretations inspired by folklore, not authoritative descriptions of Khmer religion or culture. They will be reviewed with cultural advisors. |
| Cultural | `entries[0].term` |  | Neak Ta |
| Khmer | `entries[0].termKm` |  | អ្នកតា |
| Cultural | `entries[0].text` |  | In Khmer tradition, Neak Ta are respected guardian spirits of a place, honoured with shrines and offerings. In this game they are always benevolent protectors, never enemies. |
| Cultural | `entries[1].term` |  | Ap |
| Khmer | `entries[1].termKm` |  | អាប |
| Cultural | `entries[1].text` |  | In Khmer folklore, Ap is a feared night spirit. In this game it is a hostile creature of the dark, and an invention for play rather than a faithful portrayal. |
| Cultural | `entries[2].term` |  | Arak |
| Khmer | `entries[2].termKm` |  | អារក្ស |
| Cultural | `entries[2].text` |  | Arak is a malevolent spirit in Khmer folk belief. Here it is a dangerous night enemy, loosely inspired and fictionalised. |
| Khmer | `entries[3].termKm` |  | ប្រាសាទ |
| Cultural | `entries[3].text` |  | A prasat is a Khmer temple tower or sanctuary, many of them sacred places still. The overgrown ruins in this game are imagined and do not depict any real site. |
| Cultural | `entries[4].term` |  | Krama |
| Khmer | `entries[4].termKm` |  | ក្រមា |
| Cultural | `entries[4].text` |  | The krama is the everyday checked cotton scarf of Cambodia, used as a head covering, sling and more. In this game it is a nod to that practical, familiar cloth. |

## progression.json

| Kind | Where | Labels | Text |
| --- | --- | --- | --- |
| Cultural | `sources.shrine.text` |  | a shrine honoured |

## quests.json

| Kind | Where | Labels | Text |
| --- | --- | --- | --- |
| Khmer | `[0].titleKm` | the_five_tablets | ផ្ទាំងថ្មទាំងប្រាំ |
| Cultural | `[0].steps[2].text` | renew_promise | Make an offering at the Heart Tree. |

## season.json

| Kind | Where | Labels | Text |
| --- | --- | --- | --- |
| Khmer | `ecology.seasons[0].nameKm` | cool | រដូវត្រជាក់ |
| Khmer | `ecology.seasons[1].nameKm` | hot | រដូវក្តៅ |
| Khmer | `ecology.seasons[2].nameKm` | rainy | រដូវវស្សា |

## setpieces.json

| Kind | Where | Labels | Text |
| --- | --- | --- | --- |
| Cultural | `text.blightCleared` |  | The blight withers away. The Heart Tree breathes again — you may make your offering. |

## shrines.json

| Kind | Where | Labels | Text |
| --- | --- | --- | --- |
| Cultural | `text.offered` |  | You leave your offering at the Neak Ta shrine and bow. The forest feels watchful, and kind. |
| Cultural | `text.resting` |  | Fresh flowers still rest here. Let the guardian be — return another day. |
| Cultural | `text.needOffering` |  | Hold some food to leave as an offering. |
| Cultural | `text.prompt` |  | Offer food at the Neak Ta shrine |

## sidequests.json

| Kind | Where | Labels | Text |
| --- | --- | --- | --- |
| Cultural | `[0].offer` | ash_and_timber | In your sleep you see a woodcutter with a worn krama knotted at his neck, resting his axe against a great tree. He seems to be remembering something, and the dream lingers when you wake. Follow the memory? |
| Cultural | `[0].steps[1].memory` | ash_and_timber | Every season he built a small camp and left it a little better than he found it, for whoever came next. It was a kind of promise, kept quietly. |
| Cultural | `[1].steps[2].options[0].description` | share | Leave 2 Grilled Fish as an offering. From now on your fishing window is wider, and Foraging grows. |
| Cultural | `[2].steps[0].text` | embers_in_stone | Drive off two restless spirits at night |
| Cultural | `[2].steps[1].memory` | embers_in_stone | The tablets speak of keepers who tended the lamps until the promise with the forest was broken. |

## tablets.json

| Kind | Where | Labels | Text |
| --- | --- | --- | --- |
| Khmer | `[0].titleKm` | tablet_1 | ពាក្យសន្យា |
| Cultural | `[0].titleEn` | tablet_1 | The Promise |
| Cultural | `[0].text` | tablet_1 | Long ago the people of this place made a promise to the guardians of the forest. Each season they gave thanks, and the forest gave back. |
| Khmer | `[1].titleKm` | tablet_2 | របស់ដែលត្រូវបានយក |
| Cultural | `[1].text` | tablet_2 | Then one hand reached into the forest's heart and took what was never offered. The shrines went quiet that night. |
| Khmer | `[2].titleKm` | tablet_3 | អ្នកការពារដែលត្រូវបានធ្វើបាប |
| Cultural | `[2].text` | tablet_3 | The Neak Ta did not curse the people. They only withdrew, grieving, and left the paths unguarded. |
| Khmer | `[3].titleKm` | tablet_4 | វិញ្ញាណដែលមិនស្ងប់ |
| Cultural | `[3].text` | tablet_4 | Where balance breaks, restless spirits gather. Ap and Arak wander the dark, drawn to the wound in the forest. |
| Khmer | `[4].titleKm` | tablet_5 | បេះដូងនៃព្រៃ |
| Cultural | `[4].text` | tablet_5 | The forest closes around what was taken, and waits. Seek the Heart of the Forest, and carry an offering. |

## travelers.json

| Kind | Where | Labels | Text |
| --- | --- | --- | --- |
| Khmer | `travelers[0].nameKm` | river_trader | សុខា |
| Khmer | `travelers[1].nameKm` | honey_gatherer | វិបុល |
| Khmer | `travelers[2].nameKm` | mapmaker | ដារា |

## src/config.ts

| Kind | Where | Labels | Text |
| --- | --- | --- | --- |
| Cultural | `(code)` |  | 'Moul', 'Khmer OS Muol Light', 'Khmer OS Muol', 'Khmer UI', 'Leelawadee UI', serif |
| Cultural | `(code)` |  | 'Kantumruy Pro', 'Khmer UI', 'Leelawadee UI', 'Segoe UI', system-ui, sans-serif |

## src/data/schema.ts

| Kind | Where | Labels | Text |
| --- | --- | --- | --- |
| Cultural | `(code)` |  | shrines.json: must be an object |
| Cultural | `(code)` |  | shrines.offeringCategory unknown |
| Cultural | `(code)` |  | shrines.text needs offered, resting, needOffering, prompt |

## src/scenes/Boot.ts

| Kind | Where | Labels | Text |
| --- | --- | --- | --- |
| Khmer | `(code)` |  | ព្រៃជ្រៅ |
| Khmer | `(code)` |  | Prey Chrov ព្រៃ |

## src/scenes/Ending.ts

| Kind | Where | Labels | Text |
| --- | --- | --- | --- |
| Khmer | `(code)` |  | ព្រៃជ្រៅ |

## src/scenes/Menu.ts

| Kind | Where | Labels | Text |
| --- | --- | --- | --- |
| Khmer | `(code)` |  | ព្រៃជ្រៅ |

## src/scenes/UI.ts

| Kind | Where | Labels | Text |
| --- | --- | --- | --- |
| Khmer | `(code)` |  | ព្រៃជ្រៅ |

## src/scenes/World.ts

| Kind | Where | Labels | Text |
| --- | --- | --- | --- |
| Cultural | `(code)` |  | E — ${this.gameData.shrines.text.prompt} |

## src/ui/panels/MapPanel.ts

| Kind | Where | Labels | Text |
| --- | --- | --- | --- |
| Cultural | `(code)` |  | • Shrine (Neak Ta) |
