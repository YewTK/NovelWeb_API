/**
 * Voice presets for the writing studio. Each describes an author's *craft* —
 * narration, pacing, structure, how chapters open and end — so the model can
 * write in that manner. None of them quote the source works, and the prompt
 * forbids borrowing their characters, places, systems or text: the reader gets
 * a new story told the way that author tells stories.
 */

export interface AuthorStyle {
  id: string;
  /** the author as readers know them */
  author: string;
  /** Thai-facing name for the card */
  label: string;
  /** the works this voice is known for */
  works: string;
  /** one-line pitch shown on the card */
  tagline: string;
  /** three or four short traits for the card */
  traits: string[];
  /** tags that suit the voice, offered as one-tap suggestions */
  tags: string[];
  /** the point of view this author usually writes in */
  pov: "first" | "third-limited" | "third-omniscient";
  /** 0–360, for the card's glow */
  hue: number;
  /** the craft brief sent to the model */
  brief: string;
}

export const AUTHOR_STYLES: AuthorStyle[] = [
  {
    id: "shadow-slave",
    author: "Guiltythree",
    label: "Guiltythree",
    works: "Shadow Slave",
    tagline: "ดาร์กแฟนตาซีเอาตัวรอด ประชดประชันจนขำแต่หลอนลึก",
    traits: [
      "ตัวเอกหวาดระแวง ปากร้าย มองโลกแง่ร้ายแต่ฉลาดเกมส์",
      "ข้อความระบบ/คำสาปในวงเล็บ แทรกกลางฉาก",
      "ต่อสู้แบบวางแผน ใช้กฎของโลกให้เป็นประโยชน์",
      "ปิดตอนด้วยจุดพลิกหรือความสยองที่ค้างคา",
    ],
    tags: ["ดาร์กแฟนตาซี", "เอาตัวรอด", "ระบบ", "สยองขวัญ", "เทพปกรณัม"],
    pov: "third-limited",
    hue: 262,
    brief: `Voice modelled on Guiltythree's craft:
- Close third person locked inside one protagonist's head. The narration carries his wry, paranoid, darkly funny inner commentary — sarcasm as a survival mechanism, never as a punchline that breaks tension.
- Grim mythic survival: a hostile supernatural world with hard, often cruel rules. Danger is constant; every victory costs something.
- Supernatural "system" messages appear as short standalone lines in square brackets (e.g. an ability awakening or a rank change). Keep them terse, ominous, occasionally ironic. Invent your own system — do not reuse any from existing works.
- Fights are tactical puzzles: the protagonist studies the enemy, notices a rule or weakness, and wins through cunning and ugly improvisation rather than raw power. Explain the reasoning in quick, clear beats.
- Sensory dread: darkness, silence, wrongness, cosmic scale. Let horror breathe in short, heavy paragraphs.
- Rhythm: many short paragraphs, frequent one-line punches, internal questions. Occasional longer paragraph for awe or despair.
- Themes: fate versus will, the price of ambition, trust as a liability, found companions.
- End each chapter on a sharp reversal, a revelation, or a line of quiet menace.`,
  },
  {
    id: "lotm",
    author: "Cuttlefish That Loves Diving (爱潜水的乌贼)",
    label: "ปลาหมึกดำน้ำ (Cuttlefish)",
    works: "Lord of the Mysteries",
    tagline: "สืบสวนลี้ลับยุควิกตอเรีย ระบบพลังเคร่งกฎ ความบ้าคลั่งจ้องอยู่ทุกก้าว",
    traits: [
      "บรรยากาศไอน้ำ-ยุควิกตอเรีย รายละเอียดชีวิตประจำวันแน่น",
      "ระบบพลังมีราคาและกฎเคร่งครัด พลาดคือเสียสติ",
      "ตัวเอกสุขุม ซ่อนตัวตนหลายหน้า",
      "ปูปมยาว เฉลยทีละชั้น",
    ],
    tags: ["ลี้ลับ", "สืบสวน", "สตีมพังก์", "คธูลู", "สมาคมลับ"],
    pov: "third-limited",
    hue: 38,
    brief: `Voice modelled on Cuttlefish That Loves Diving's craft:
- An industrial-age / Victorian-flavoured city rendered with dense, grounded everyday detail: prices, newspapers, meals, rent, weather, the texture of streets. The mundane makes the uncanny land harder.
- Cosmic horror under the surface. Knowledge is dangerous; looking too closely invites madness. Hint rather than show the full horror.
- A rigorous, invented supernatural system with strict rules, ranks and costs — power is earned step by step and abused at great risk. Invent your own terms; never borrow any from existing works.
- The protagonist is calm, rational, cautious and quietly humorous in his inner voice; he hides behind secret identities and masks, and thinks through risks methodically before acting.
- Mystery structure: clues planted early, investigations, deductions, reveals that recontextualise earlier scenes. Pacing is measured and patient, then sharpens in set pieces.
- Recurring rituals and secret gatherings give a sense of ceremony and conspiracy.
- Prose: clear, precise, lightly ironic; long observational paragraphs balanced by crisp dialogue.
- End chapters on a discovery, an eerie detail, or a quiet decision that raises the stakes.`,
  },
  {
    id: "ergen",
    author: "Er Gen (耳根)",
    label: "เออเกิร์น (Er Gen)",
    works: "I Shall Seal the Heavens · Renegade Immortal · A Will Eternal",
    tagline: "เซียนบำเพ็ญเพียรมหากาพย์ ขำเจ้าเล่ห์แล้วตัดเข้าโศกสะเทือนใจ",
    traits: [
      "เริ่มจากคนธรรมดา ไต่ขั้นพลังผ่านทัณฑ์สวรรค์",
      "อารมณ์ขันเจ้าเล่ห์สลับโศกนาฏกรรมลึกซึ้ง",
      "ปรัชญาเต๋า ชีวิต ความตาย ความทรงจำ",
      "ฉากฝูงชนตกตะลึง ไคลแมกซ์อารมณ์พุ่ง",
    ],
    tags: ["เซียน/บำเพ็ญเพียร", "กำลังภายใน", "มหากาพย์", "ตลก", "ดราม่า"],
    pov: "third-limited",
    hue: 196,
    brief: `Voice modelled on Er Gen's craft:
- Xianxia cultivation epic. The protagonist starts humble and ordinary, and climbs through clearly marked realms, breakthroughs and heavenly tribulations. Invent your own realm names and sects.
- Tonal whiplash done deliberately: scenes of scheming, greed, cowardice or comic shamelessness that make readers laugh, then sudden turns into grief, loyalty and sacrifice that hit hard.
- Philosophy woven into action: the Dao, the meaning of immortality, memory and loss, what a person holds onto across centuries. Let the protagonist reflect in lyrical, quiet passages.
- Scale expands steadily — a village, a sect, a nation, a world, a starry sky — and the prose makes each jump feel vast.
- Set pieces build to crescendos: onlookers gasp, elders turn pale, the heavens themselves react. Use repetition and rising rhythm to sell the climax.
- Recurring motifs or lines return at key moments to deliver emotional payoff.
- Sect politics, rival geniuses, treasures and ancient legacies drive the plot.
- End chapters on a breakthrough, an arrival, a shocking reveal of strength, or an aching emotional note.`,
  },
  {
    id: "tomato",
    author: "I Eat Tomatoes (我吃西红柿)",
    label: "มะเขือเทศ (I Eat Tomatoes)",
    works: "Coiling Dragon · Swallowed Star · Desolate Era",
    tagline: "ไต่ระดับพลังชัดเจน ฉากต่อสู้ยิ่งใหญ่ อ่านลื่น เดินเรื่องเร็ว",
    traits: [
      "ขั้นพลังเป็นระบบ วัดผลได้ชัด",
      "ตัวเอกมุ่งมั่น ซื่อตรง รักครอบครัว",
      "ฝึกฝนมีหลักไมล์ เห็นการเติบโตทุกช่วง",
      "โลกขยายจากเมืองสู่จักรวาล",
    ],
    tags: ["แฟนตาซี", "ไต่ระดับ", "แอ็กชัน", "ไซไฟ", "มหากาพย์"],
    pov: "third-limited",
    hue: 8,
    brief: `Voice modelled on I Eat Tomatoes' craft:
- Clean, accessible, forward-moving prose. Readers always know where the protagonist stands and what he is striving for next.
- A systematic, legible power hierarchy with named tiers and concrete milestones. Training arcs show measurable progress; breakthroughs are earned and satisfying. Invent your own tiers.
- A determined, upright, hard-working protagonist with a strong sense of family and loyalty. Mentors, parents and sworn brothers matter.
- Epic combat described with clarity: positioning, techniques, the exact moment the balance tips. Big-scale battles feel grand but never confusing.
- Worldbuilding grows in layers — a town, a kingdom, a continent, planes and universes — each unveiled when the protagonist is ready.
- Pacing is brisk: every chapter moves the plot or the power curve forward. Minimal navel-gazing, steady dopamine of progress.
- Dialogue is straightforward and purposeful.
- End chapters on a new goal, a breakthrough, an incoming threat or a reward about to be revealed.`,
  },
  {
    id: "reverend",
    author: "Gu Zhen Ren (蛊真人)",
    label: "กู่เจินเหริน (Gu Zhen Ren)",
    works: "Reverend Insanity",
    tagline: "ตัวเอกสายมาร เย็นชา คำนวณทุกผลประโยชน์",
    traits: [
      "ตัวเอกไร้ศีลธรรม มองทุกอย่างเป็นทรัพยากร",
      "วางแผนซ้อนแผน ความสำเร็จมาจากไหวพริบ",
      "ระบบพลังเชิงเศรษฐศาสตร์ ต้นทุน-กำไร",
      "สังคมโหดร้ายสมจริง",
    ],
    tags: ["ตัวเอกสายมาร", "วางแผน", "เซียน/บำเพ็ญเพียร", "ดาร์ก"],
    pov: "third-omniscient",
    hue: 350,
    brief: `Voice modelled on Gu Zhen Ren's craft:
- A ruthless, utterly pragmatic protagonist who views morality as a tool and people as resources. He is patient, cold and calculating — never cartoonishly evil, always coherent.
- Schemes within schemes. Show the plan partially, let events unfold, then reveal the hidden layer. Victories come from foresight, information and exploitation of others' greed.
- An invented power system that behaves like an economy: costs, upkeep, trade-offs, scarcity. Characters constantly weigh profit against risk.
- The world is harsh and realistic: clans, factions and elders act in self-interest; kindness is rare and often punished.
- Narration mixes the protagonist's cold analysis with an omniscient, aphoristic voice that comments on human nature.
- Pacing alternates careful setup with sudden, decisive action.
- End chapters on a cold reversal, a revealed trump card, or a chilling line about human nature.`,
  },
  {
    id: "chugong",
    author: "Chugong (추공)",
    label: "ชูกง (Chugong)",
    works: "Solo Leveling",
    tagline: "ระบบเลเวลอัป ดันเจี้ยน ความเท่แบบพาวเวอร์แฟนตาซี",
    traits: [
      "ข้อความระบบ ภารกิจ ค่าสถานะ",
      "จากอ่อนแอที่สุดสู่แข็งแกร่งที่สุด",
      "ฉากสั้นกระชับ ภาพชัดแบบเว็บตูน",
      "ช่วงเวลาเท่ที่ทำให้คนรอบข้างอึ้ง",
    ],
    tags: ["ระบบ", "ดันเจี้ยน", "เลเวลอัป", "แอ็กชัน", "โลกยุคใหม่"],
    pov: "third-limited",
    hue: 220,
    brief: `Voice modelled on Chugong's craft:
- Modern-world power fantasy with dungeons, gates, hunters and rankings. The protagonist begins as the weakest and climbs relentlessly. Invent your own organisations and monsters.
- A personal "system" speaks in terse bracketed windows: quests, stats, rewards, penalties, level-ups. Use them as rhythmic punctuation and as a source of suspense.
- Very short paragraphs and punchy sentences; cinematic, visual action that reads like webtoon panels.
- Cool moments: the quiet protagonist does something impossible and onlookers react in disbelief. Build to these deliberately.
- Stakes are personal (family, survival) as well as global.
- Minimal introspection — show resolve through action.
- End chapters on a level-up, a new quest window, or an ominous arrival.`,
  },
  {
    id: "singshong",
    author: "sing N song (싱숑)",
    label: "ซิงซอง (sing N song)",
    works: "Omniscient Reader's Viewpoint",
    tagline: "เมทาแฟนตาซี ผู้อ่านรู้อนาคต เล่าเรื่องซ้อนเรื่อง",
    traits: [
      "ตัวเอกคือ 'ผู้อ่าน' ที่รู้เนื้อเรื่องล่วงหน้า",
      "เล่นกับเรื่องเล่า นิยาย และผู้ชม",
      "สถานการณ์เอาตัวรอดแบบภารกิจบังคับ",
      "อารมณ์ขันแห้ง ๆ ปนความผูกพัน",
    ],
    tags: ["เมทา", "วันสิ้นโลก", "เอาตัวรอด", "ระบบ", "สมัยใหม่"],
    pov: "first",
    hue: 160,
    brief: `Voice modelled on sing N song's craft:
- Meta-fantasy: the story is aware of stories. The protagonist has knowledge others lack (a book, a prophecy, a previous loop) and uses it — but reality keeps diverging from what he knows.
- Apocalyptic "scenario" structure: sudden mandatory trials with rules announced by an unseen authority, and cosmic spectators who comment and sponsor. Invent your own versions.
- First-person narration that is dry, self-deprecating and observant, with asides to the reader and occasional quoted lines from the in-world text.
- Clever rule-lawyering to survive, often at personal cost.
- Deep found-family bonds that grow quietly under the jokes; sacrifice lands hard.
- Mix short reactive lines with occasional reflective passages about stories and endings.
- End chapters on a scenario twist, a spectator reaction, or an emotional line that reframes the chapter.`,
  },
  {
    id: "custom",
    author: "กำหนดเอง",
    label: "สไตล์ของคุณเอง",
    works: "อธิบายน้ำเสียงที่ต้องการในช่องโน้ต",
    tagline: "บอก AI ว่าอยากได้สำนวนแบบไหน — ผสมหลายสไตล์ก็ได้",
    traits: ["กำหนดน้ำเสียง จังหวะ มุมมอง", "ผสมหลายสไตล์เข้าด้วยกัน", "ระบุสิ่งที่ห้ามทำ"],
    tags: [],
    pov: "third-limited",
    hue: 280,
    brief: `Follow the reader's own style notes below as the primary voice brief. Where they are silent, write polished, immersive, commercially successful web-novel prose.`,
  },
];

export function authorStyle(id: string | undefined): AuthorStyle {
  return AUTHOR_STYLES.find((s) => s.id === id) ?? AUTHOR_STYLES[0];
}

/** Common web-novel tags offered as one-tap suggestions in the studio. */
export const TAG_SUGGESTIONS = [
  "แฟนตาซี",
  "ดาร์กแฟนตาซี",
  "เซียน/บำเพ็ญเพียร",
  "กำลังภายใน",
  "ต่างโลก",
  "เกิดใหม่",
  "ย้อนเวลา",
  "ระบบ",
  "ดันเจี้ยน",
  "ลี้ลับ",
  "สืบสวน",
  "สยองขวัญ",
  "ไซไฟ",
  "วันสิ้นโลก",
  "โรแมนติก",
  "ดราม่า",
  "ตลก",
  "การเมือง/ราชสำนัก",
  "สงคราม",
  "ตัวเอกสายมาร",
  "ตัวเอกเก่งตั้งแต่ต้น",
  "ไต่ระดับ",
];
