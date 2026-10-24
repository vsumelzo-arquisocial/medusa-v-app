import { FLEET_PROFILES } from "../src/lib/naval2/factions";
const names: Record<string, string> = { imperium: "Imperium", chaos: "Caos", tau: "Tau", aeldari: "Aeldari", drukhari: "Drukhari", orks: "Orkos", necrons: "Necrones", tyranids: "Tiránidos", daemons: "Demonios", votann: "Votann", genestealer: "Culto genestealer" };
console.log("| Flota | V | E | B | Bat | L | T | Tor | Ab | Casco | Regla pasiva | Orden única |\n|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const [k, p] of Object.entries(FLEET_PROFILES)) console.log(`| ${names[k]} | ${p.speed} | ${p.shields} | ${p.armourFront}+/${p.armourSide}+ | ${k === "orks" ? "2d6+1" : p.batteries} | ${p.lances} | ${p.torpedoes} | ${p.turrets} | ${p.boarding} | ${p.hull} | ${p.passive} | **${p.orderName}:** ${p.orderText} |`);
