import { describe, expect, it } from "vitest";
import { CANONICAL_EVENT_TYPES, hasRenderer, renderEvent } from "./events";
import { renderHeadline } from "./headlines";
import { renderLife } from "./life";
import { shortName } from "./names";
import { createNarrativeService } from "./index";
import { buildFixture, extraSampleEvents, sampleEvents } from "./fixture";
import { joinList, numberWord, ordinalWord, sanitize } from "./text";

const ARTIFACTS = /undefined|\[object|NaN/;
const EM_DASH = /[–—]/;
const FALLBACK_MARKERS = /The chronicle sets down a|The chronicle sets down an|found its way into the record|Among the year's entries/;

describe("renderEvent", () => {
  it("covers every canonical EventType with a bespoke renderer", () => {
    const f = buildFixture();
    const evs = sampleEvents(f);
    const sampled = new Set(evs.map((e) => String(e.type)));
    expect(evs.length).toBe(CANONICAL_EVENT_TYPES.length);
    for (const t of CANONICAL_EVENT_TYPES) {
      expect(sampled.has(t), `no sample event for ${t}`).toBe(true);
      expect(hasRenderer(t), `no renderer for ${t}`).toBe(true);
    }
  });

  it("renders clean, non-fallback prose for every canonical type", () => {
    const f = buildFixture();
    for (const ev of sampleEvents(f)) {
      const prose = renderEvent(f.world, ev);
      expect(prose.length, `${ev.type} too short: "${prose}"`).toBeGreaterThan(25);
      expect(prose, `${ev.type} has artifacts: "${prose}"`).not.toMatch(ARTIFACTS);
      expect(prose, `${ev.type} has a dash: "${prose}"`).not.toMatch(EM_DASH);
      expect(prose, `${ev.type} fell back: "${prose}"`).not.toMatch(FALLBACK_MARKERS);
      expect(prose.endsWith("."), `${ev.type} lacks a full stop: "${prose}"`).toBe(true);
      // Starts with a capital (or a quotable name).
      expect(prose[0]).toMatch(/[A-Z"']/);
    }
  });

  it("renders known extra types and degrades gracefully on unknown ones", () => {
    const f = buildFixture();
    const extras = extraSampleEvents(f);
    for (const ev of extras) {
      const prose = renderEvent(f.world, ev);
      expect(prose.length).toBeGreaterThan(15);
      expect(prose).not.toMatch(ARTIFACTS);
      expect(prose).not.toMatch(EM_DASH);
    }
    const unknown = extras.find((e) => e.type === "wholly-unknown-type")!;
    expect(hasRenderer(String(unknown.type))).toBe(false);
    const prose = renderEvent(f.world, unknown);
    expect(prose).toMatch(/wholly unknown type/);
    expect(prose).toContain("Kaerel");
  });

  it("frames secret events conspiratorially", () => {
    const f = buildFixture();
    const secrets = [...sampleEvents(f), ...extraSampleEvents(f)].filter((e) => e.secret);
    expect(secrets.length).toBeGreaterThanOrEqual(4);
    for (const ev of secrets) {
      const prose = renderEvent(f.world, ev);
      expect(prose, `${ev.type} not conspiratorial: "${prose}"`).toMatch(
        /None yet know|kept dark|night knows|No tongue/,
      );
    }
  });

  it("weaves in death causes, funeral rites, and battle names verbatim", () => {
    const f = buildFixture();
    const evs = sampleEvents(f);
    const death = evs.find((e) => e.type === "death")!;
    const deathProse = renderEvent(f.world, death);
    expect(deathProse).toContain("a wound gone sour after a skirmish");
    expect(deathProse).toContain("given to the tide"); // religion.funeralRite
    const battle = evs.find((e) => e.type === "battle")!;
    expect(renderEvent(f.world, battle)).toContain("attle of the Salt Meadow");
    const plague = evs.find((e) => e.type === "plague-outbreak")!;
    expect(renderEvent(f.world, plague)).toContain("Grey Sweat");
    const duel = evs.find((e) => e.type === "duel")!;
    expect(renderEvent(f.world, duel)).toContain("an insult at the feast");
  });

  it("mentions cultural traditions for weddings and twin births", () => {
    const f = buildFixture();
    const evs = sampleEvents(f);
    const wedding = evs.find((e) => e.type === "wedding")!;
    expect(renderEvent(f.world, wedding)).toContain("the Salt Cup");
    const twins = evs.find((e) => e.type === "twin-birth")!;
    expect(renderEvent(f.world, twins)).toContain("share one soul between two boats");
  });

  it("uses the culture's month names when the subject's culture is known", () => {
    const f = buildFixture();
    const birth = sampleEvents(f).find((e) => e.type === "birth")!;
    const prose = renderEvent(f.world, birth);
    expect(prose).toMatch(
      /month of (Teshvar|Ondrel|Veshtir|Salka|Neriv|Toldan|Iskel|Varn|Melest|Ondar|Kirev|Sallun)/,
    );
  });

  it("names ages at the time of the event", () => {
    const f = buildFixture();
    const death = sampleEvents(f).find((e) => e.type === "death")!;
    const prose = renderEvent(f.world, death);
    expect(prose).toMatch(/thirty-eight|thirty-eighth/);
  });
});

describe("renderHeadline", () => {
  it("produces short clean headlines for every type", () => {
    const f = buildFixture();
    for (const ev of [...sampleEvents(f), ...extraSampleEvents(f)]) {
      const head = renderHeadline(f.world, ev);
      expect(head.length).toBeGreaterThan(0);
      const words = head.split(/\s+/).length;
      expect(words, `${ev.type} headline wrong size: "${head}"`).toBeGreaterThanOrEqual(2);
      expect(words, `${ev.type} headline wrong size: "${head}"`).toBeLessThanOrEqual(10);
      expect(head).not.toMatch(ARTIFACTS);
      expect(head).not.toMatch(EM_DASH);
      expect(head.endsWith("."), `headline ends with period: "${head}"`).toBe(false);
    }
  });

  it("gives evocative specific headlines", () => {
    const f = buildFixture();
    const evs = sampleEvents(f);
    const plague = evs.find((e) => e.type === "plague-outbreak")!;
    expect(renderHeadline(f.world, plague)).toBe("The Grey Sweat Reaches the Harrowmarch");
    const duel = evs.find((e) => e.type === "duel")!;
    expect(renderHeadline(f.world, duel)).toBe("Duel at Velle");
    const death = evs.find((e) => e.type === "death")!;
    expect(renderHeadline(f.world, death)).toContain("Kaerel the Unbowed");
  });
});

describe("renderLife", () => {
  it("writes a multi-paragraph biography for a dramatic dead man", () => {
    const f = buildFixture();
    const kaerel = f.world.people.get(f.ids.kaerel)!;
    const bio = renderLife(f.world, kaerel);
    const paragraphs = bio.split("\n\n");
    expect(paragraphs.length).toBeGreaterThanOrEqual(4);
    expect(paragraphs.length).toBeLessThanOrEqual(8);
    // Birth & blood.
    expect(paragraphs[0]).toContain("Kaerel");
    expect(paragraphs[0]).toMatch(/Torvald|Senna/);
    expect(paragraphs[0]).toMatch(/House Maren/);
    // Appearance drawn from phenotype and parents.
    expect(bio).toMatch(/hair|eyes/);
    // Temperament from the axes.
    expect(bio).toContain("quick to anger and slow to forget");
    // The rivalry arc leads a chapter, with its outcome.
    expect(bio).toMatch(/rivalry/i);
    expect(bio).toContain("ended with a handshake neither man trusted");
    // Children compressed to one line.
    expect(bio).toMatch(/Aeli, Brann, and Berra/);
    // Death, funeral rite, epithet, survivors.
    expect(bio).toContain("a wound gone sour after a skirmish");
    expect(bio).toContain("given to the tide");
    expect(bio).toContain("the Unbowed");
    expect(bio).toMatch(/Maève/);
    // Clean prose.
    expect(bio).not.toMatch(ARTIFACTS);
    expect(bio).not.toMatch(EM_DASH);
  });

  it("mentions clearly shared features with parents", () => {
    const f = buildFixture();
    const aeli = f.world.people.get(f.ids.aeli)!;
    const bio = renderLife(f.world, aeli);
    // Aeli shares her mother's hair color index (flame-red) and her father's face shape.
    expect(bio).toMatch(/her mother's flame-red hair|the same broad face as her father/);
    expect(bio).not.toMatch(ARTIFACTS);
  });

  it("covers twins, rare traits, and sanitizes borrowed descriptions", () => {
    const f = buildFixture();
    const brann = f.world.people.get(f.ids.twinA)!;
    const bio = renderLife(f.world, brann);
    expect(bio).toMatch(/same hour as Berra/);
    expect(bio).toContain("share one soul between two boats"); // twin tradition
    expect(bio).toMatch(/Moon-pale|moon-pale/); // visible rare trait
    expect(bio).not.toMatch(EM_DASH); // RARE_TRAITS description em-dash scrubbed
    expect(bio).not.toMatch(ARTIFACTS);

    const aeli = f.world.people.get(f.ids.aeli)!;
    const aeliBio = renderLife(f.world, aeli);
    expect(aeliBio).toMatch(/The Sight|the Sight/); // hidden trait at birth
  });

  it("gives the living a present-state closing paragraph", () => {
    const f = buildFixture();
    const maeve = f.world.people.get(f.ids.maeve)!;
    const bio = renderLife(f.world, maeve);
    const paragraphs = bio.split("\n\n");
    expect(paragraphs.length).toBeGreaterThanOrEqual(3);
    expect(paragraphs.length).toBeLessThanOrEqual(8);
    expect(bio).toContain("So the chronicle stands for now");
    expect(bio).toMatch(/buried a husband/);
    expect(bio).not.toMatch(ARTIFACTS);
    expect(bio).not.toMatch(EM_DASH);
  });

  it("handles a person with a nearly empty chronicle", () => {
    const f = buildFixture();
    const priest = f.world.people.get(f.ids.priest)!;
    const bio = renderLife(f.world, priest);
    const paragraphs = bio.split("\n\n");
    expect(paragraphs.length).toBeGreaterThanOrEqual(3);
    expect(bio).not.toMatch(ARTIFACTS);
  });
});

describe("shortName", () => {
  it("prefers epithet, then nickname, then surname", () => {
    const f = buildFixture();
    const kaerel = f.world.people.get(f.ids.kaerel)!;
    expect(shortName(f.world, kaerel)).toBe("Kaerel the Unbowed");
    const maeve = f.world.people.get(f.ids.maeve)!;
    expect(shortName(f.world, maeve)).toBe("Maève Maren");
    const rival = f.world.people.get(f.ids.rival)!;
    rival.nickname = "Coals";
    expect(shortName(f.world, rival)).toBe("Dorrek called Coals");
    rival.epithet = "the Bent";
    expect(shortName(f.world, rival)).toBe("Dorrek the Bent");
  });
});

describe("service factory", () => {
  it("exposes exactly the NarrativeService surface", () => {
    const svc = createNarrativeService();
    const f = buildFixture();
    const ev = sampleEvents(f)[0];
    expect(typeof svc.renderEvent(f.world, ev)).toBe("string");
    expect(typeof svc.renderHeadline(f.world, ev)).toBe("string");
    expect(typeof svc.renderLife(f.world, f.world.people.get(f.ids.kaerel)!)).toBe("string");
    expect(typeof svc.shortName(f.world, f.world.people.get(f.ids.kaerel)!)).toBe("string");
  });
});

describe("determinism", () => {
  it("renders byte-identical output from independently built worlds", () => {
    const render = () => {
      const f = buildFixture();
      const out: string[] = [];
      for (const ev of sampleEvents(f)) {
        out.push(renderEvent(f.world, ev));
        out.push(renderHeadline(f.world, ev));
      }
      for (const ev of extraSampleEvents(f)) {
        out.push(renderEvent(f.world, ev));
        out.push(renderHeadline(f.world, ev));
      }
      for (const id of [...f.world.people.keys()].sort((a, b) => a - b)) {
        out.push(renderLife(f.world, f.world.people.get(id)!));
      }
      // Recorded chronicle events too.
      for (const id of [...f.world.events.keys()].sort((a, b) => a - b)) {
        out.push(renderEvent(f.world, f.world.events.get(id)!));
      }
      return out.join("\n@@\n");
    };
    const a = render();
    const b = render();
    expect(a).toBe(b);
    expect(a).not.toMatch(ARTIFACTS);
    expect(a).not.toMatch(EM_DASH);
  });

  it("is stable across repeated calls on the same world", () => {
    const f = buildFixture();
    const ev = sampleEvents(f).find((e) => e.type === "coronation")!;
    expect(renderEvent(f.world, ev)).toBe(renderEvent(f.world, ev));
    const kaerel = f.world.people.get(f.ids.kaerel)!;
    expect(renderLife(f.world, kaerel)).toBe(renderLife(f.world, kaerel));
  });
});

describe("text helpers", () => {
  it("joins lists with the serial comma", () => {
    expect(joinList(["Ash"])).toBe("Ash");
    expect(joinList(["Ash", "Birch"])).toBe("Ash and Birch");
    expect(joinList(["Ash", "Birch", "Elm"])).toBe("Ash, Birch, and Elm");
  });

  it("spells numbers and ordinals", () => {
    expect(numberWord(3)).toBe("three");
    expect(numberWord(38)).toBe("thirty-eight");
    expect(ordinalWord(61)).toBe("sixty-first");
    expect(ordinalWord(12)).toBe("twelfth");
  });

  it("scrubs em-dashes and doubled spaces", () => {
    expect(sanitize("born without color — chalk skin")).toBe("born without color, chalk skin");
    expect(sanitize("a  b ,c")).toBe("a b,c");
  });
});
