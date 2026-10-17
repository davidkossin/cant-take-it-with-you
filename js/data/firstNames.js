/**
 * Common US first names, used to give a child sprite the look usually associated with the name.
 * Names not listed (or listed as neutral on purpose, like Alex or Taylor) get a random look
 * seeded by the name, so it stays stable.
 */
const GIRL = `abigail ada addison adriana aaliyah alexis alice alicia alina alison alyssa amanda amber amelia amy
ana andrea angela angelina anna annabelle anne annie aria ariana arianna ashley aubrey audrey autumn ava avery
bailey barbara beatrice becky bella beth bethany betty bianca brenda brianna bridget brittany brooke brooklyn
camila caitlin candace carla carly carmen carol caroline carolyn cassandra catherine charlotte chelsea cheryl chloe
christina christine cindy claire clara claudia colleen cora courtney crystal cynthia daisy dana danielle daphne
dawn deborah denise diana diane donna dorothy eden elaine eleanor elena eliana elise eliza elizabeth ella ellie
elsa emily emma erica erin esther eva evelyn faith fiona florence frances gabriella gabrielle gemma georgia
gianna gina grace gracie hailey hannah harper hazel heather heidi helen holly hope ida irene iris isabel isabella
isabelle ivy jackie jacqueline jada jane janet janice jasmine jean jenna jennifer jenny jessica jill joan joanna
josephine joy joyce judith julia juliana julie june kaitlyn kate katherine kathleen kathryn katie kayla kaylee
kelly kendra kennedy kimberly kylie lacey laura lauren layla leah leila lena leslie lillian lily linda lindsay
lisa lola lori lucia lucy luna lydia lynn mackenzie madeline madison maggie maria mariah marie marilyn martha mary
maya megan melanie melissa mia michelle mila mina molly monica morgan nadia nancy naomi natalie natasha nevaeh
nicole nina nora olivia paige pamela patricia paula penelope peyton phoebe piper priscilla quinn rachel rebecca
renee riley rita robin rosa rose rosie ruby ruth sabrina sadie sally samantha sandra sara sarah savannah scarlett
selena serena shannon sharon sheila shirley sierra sofia sophia sophie stella stephanie summer susan suzanne sydney
sylvia tabitha tamara tammy tara teresa tessa tiffany tina tracy vanessa vera veronica victoria violet virginia vivian
wendy whitney willow yvonne zoe zoey`.split(/\s+/);

const BOY = `aaron abel adam adrian aiden alan albert alexander alfred andre andrew angel anthony antonio archer arthur
asher austin axel barry ben benjamin bennett bill billy blake bobby brad bradley brandon brayden brendan brian
brody bruce bryan bryce caleb calvin cameron carl carlos carter casey chad charles charlie chase chris christian
christopher clarence clark clayton cody colby cole colin connor cooper corey craig dale damian dan daniel danny
darren dave david dean dennis derek devin diego dominic donald douglas drew dustin dylan earl eddie edgar edward
edwin eli elijah elliot emmett eric ethan eugene evan ezra felix fernando finn francis frank franklin fred gabriel
gary gavin gene geoffrey george gerald gideon gordon grant graham greg gregory griffin guy harold harrison harry
harvey hayden henry herbert howard hudson hugh hunter ian ivan jack jackson jacob jaden jake james jason jasper
javier jay jeff jeffrey jeremy jerry jesse jesus jim jimmy joe joel john johnny jonah jonathan jordan jose joseph
joshua josiah juan julian justin kai keith kenneth kevin kyle lance landon larry lawrence leo leon leonard levi
liam lincoln logan louis lucas luis luke malcolm marcus mario mark marshall martin mason matt matthew max maxwell
michael miguel mike miles mitchell nathan nathaniel neil nelson nicholas nick noah nolan norman oliver oscar owen
parker patrick paul pedro peter philip phillip preston randy raymond reed rex ricardo richard rick ricky robert
roberto rodney roger ronald ross roy russell ryan sam samuel scott sean sebastian seth shane shawn simon spencer
stanley stephen steve steven stuart taylor ted terry theodore thomas tim timothy toby todd tom tommy tony travis
trevor tristan tyler victor vincent wade wallace walter warren wayne wesley william willie wyatt xavier zachary zach`.split(/\s+/);

// Names that are used for either (or that read as either), left out on purpose so they stay neutral.
const NEUTRAL = new Set(['alex', 'avery', 'bailey', 'casey', 'charlie', 'dana', 'jordan', 'morgan', 'peyton', 'quinn', 'riley', 'robin', 'sam', 'taylor', 'cameron', 'jesse', 'kai', 'logan', 'max', 'parker', 'reed', 'rowan', 'sydney', 'jamie', 'drew', 'finley', 'hayden', 'emerson', 'skyler', 'dakota', 'jackie', 'angel', 'jean', 'leslie', 'kennedy', 'jay', 'mackenzie', 'blake', 'harper', 'carter']);

const GIRLS = new Set(GIRL.filter((n) => !NEUTRAL.has(n)));
const BOYS = new Set(BOY.filter((n) => !NEUTRAL.has(n) && !GIRLS.has(n)));

/** 'girl', 'boy' or 'neutral' from the first word of a name (case-insensitive). */
export function nameGender(name) {
  const first = String(name ?? '').trim().split(/[\s\-_.]+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
  if (GIRLS.has(first)) return 'girl';
  if (BOYS.has(first)) return 'boy';
  return 'neutral';
}

export const GIRL_NAME_COUNT = GIRLS.size;
export const BOY_NAME_COUNT = BOYS.size;
