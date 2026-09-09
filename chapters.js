// Single source of truth for the journey.
// Order here must match the order of [data-chapter] elements in index.html.
//
//  stage : which 3D stage group the chapter looks at
//  cam   : camera offset from the stage origin
//  look  : look-at offset from the stage origin
//          (shifting cam.x and look.x together slides the subject sideways so
//           it sits opposite the text column)
//  bg    : background / fog colour while this chapter is active
//  light : switch the page to the light theme (for the birth scenes)

export const chapters = [
  { id: 'hero',          stage: 'dna',     cam: [0, 0, 11],         look: [0, 0, 0],         day: 'Welcome',                        short: 'Begin',         bg: '#0a0c18' },
  { id: 'stimulation',   stage: 'syringe', cam: [0, 0.1, 8.5],      look: [0, 0, 0],         day: 'Days 1–12 · Stimulation',        short: 'Stimulation',   bg: '#0b1024' },
  { id: 'monitoring',    stage: 'ovary',   cam: [1.7, 0.4, 7.4],    look: [1.7, 0.2, 0],     day: 'Days 5–12 · Monitoring',         short: 'Monitoring',    bg: '#0a1624' },
  { id: 'retrieval',     stage: 'ovary',   cam: [1.2, 1.1, 5.4],    look: [-1.1, 0.2, 0],    day: 'Day 14 · Egg collection',        short: 'Collection',    bg: '#0d1226' },
  { id: 'fertilisation', stage: 'egg',     cam: [1.6, 0, 6.4],      look: [1.6, 0, 0],       day: 'Day 14 · Fertilisation (ICSI)',  short: 'Fertilisation', bg: '#071a22' },
  { id: 'embryo',        stage: 'embryo',  cam: [-1.6, 0, 6.0],     look: [-1.6, 0, 0],      day: 'Days 15–19 · Embryo culture',    short: 'Embryo',        bg: '#0a1b20' },
  { id: 'transfer',      stage: 'uterus',  cam: [2.0, -0.4, 9.2],   look: [2.0, -0.3, 0],    day: 'Day 19 · Embryo transfer',       short: 'Transfer',      bg: '#170b1a' },
  { id: 'implantation',  stage: 'uterus',  cam: [-0.9, 1.0, 5.2],   look: [-0.8, 0.75, 0],   day: 'Days 20–33 · The two-week wait', short: 'Implantation',  bg: '#1b0b16' },
  { id: 'growing',       stage: 'fetus',   cam: [1.7, 0, 7.6],      look: [1.7, 0, 0],       day: 'Weeks 6–40 · Pregnancy',         short: 'Pregnancy',     bg: '#200f13' },
  { id: 'welcome',       stage: 'baby',    cam: [-1.4, 0.2, 6.6],   look: [-1.4, 0.1, 0],    day: 'Day one · Welcome',              short: 'Welcome',       bg: '#f4e8e3', light: true },
  { id: 'begin',         stage: 'baby',    cam: [0, 3.6, 13],       look: [0, 1.4, 0],       day: 'Your story',                     short: 'Begin yours',   bg: '#f8f0ec', light: true },
];

// World-space origin of each stage. The camera flies along this path.
export const stagePositions = {
  dna:     [0, 0, 0],
  syringe: [2.5, 0.2, -42],
  ovary:   [-2.5, 0, -84],
  egg:     [1.5, 0.3, -126],
  embryo:  [0, 0, -164],
  uterus:  [0, -0.5, -206],
  fetus:   [0, 0, -250],
  baby:    [0, 0, -292],
};
