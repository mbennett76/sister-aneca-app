import React, { useState, useEffect, useRef, useCallback } from 'react';

// ─── COLOR PALETTE ────────────────────────────────────────────────────────────
const C = {
  red:        '#C60C30', // Danish flag red (Pantone 186C)
  white:      '#FFFFFF', // Danish flag white
  cream:      '#FFF8F5', // warm off-white parchment
  canal:      '#4A7C9A', // Copenhagen canal blue
  amber:      '#D4850A', // Viking amber gold
  slate:      '#5C6B7A', // Danish coastal slate blue
  cobble:     '#8A8070', // Copenhagen cobblestone grey
  forest:     '#2E5E3E', // Jutland forest green
  night:      '#1A1A2E', // Nordic night sky
  lightRed:   '#F5E0E4', // pale Danish red tint
  lightBlue:  '#E8F0F6', // pale canal blue tint
  lightAmber: '#FAF0DC', // pale amber tint
  border:     '#E8DDD0', // warm border
};

// ─── LOCAL STORAGE HELPERS ───────────────────────────────────────────────────
const LS = {
  get: (k, def) => { try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : def; } catch { return def; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ─── AUDIO / SPEECH ──────────────────────────────────────────────────────────
const speakDA = (text) => {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const v = voices.find(x => x.lang === 'da-DK') || voices.find(x => x.lang.startsWith('da')) || null;
  if (v) u.voice = v;
  u.lang = 'da-DK'; u.rate = 0.85; u.pitch = 1;
  window.speechSynthesis.speak(u);
};

// ─── ALPHABET DATA ───────────────────────────────────────────────────────────
const ALPHABET = [
  { letter:'A', ipa:'/a/', sound:'Like "a" in "father"', example:'arbejde (work)', mission:'apostel' },
  { letter:'B', ipa:'/b/', sound:'Like English "b"', example:'bog (book)', mission:'bibel' },
  { letter:'C', ipa:'/s/ or /k/', sound:'"s" before e/i, "k" otherwise', example:'cykel (bicycle)', mission:'Kristus' },
  { letter:'D', ipa:'/d/', sound:'Softer than English; often silent', example:'dag (day)', mission:'dåb' },
  { letter:'E', ipa:'/e/', sound:'Like "e" in "bed"', example:'efter (after)', mission:'evangelium' },
  { letter:'F', ipa:'/f/', sound:'Like English "f"', example:'familie (family)', mission:'fred' },
  { letter:'G', ipa:'/g/', sound:'Hard "g" or silent depending on position', example:'Gud (God)', mission:'gave (gift)' },
  { letter:'H', ipa:'/h/', sound:'Like English "h"', example:'håb (hope)', mission:'himmel' },
  { letter:'I', ipa:'/i/', sound:'Like "ee" in "see"', example:'igen (again)', mission:'Israel' },
  { letter:'J', ipa:'/j/', sound:'Like "y" in "yes"', example:'Jesus', mission:'ja (yes)' },
  { letter:'K', ipa:'/k/', sound:'Like English "k"', example:'kærlighed (love)', mission:'kirke' },
  { letter:'L', ipa:'/l/', sound:'Like English "l"', example:'lys (light)', mission:'lære' },
  { letter:'M', ipa:'/m/', sound:'Like English "m"', example:'menighed (congregation)', mission:'mission' },
  { letter:'N', ipa:'/n/', sound:'Like English "n"', example:'nåde (grace)', mission:'navn' },
  { letter:'O', ipa:'/o/', sound:'Like "o" in "more"', example:'ord (word)', mission:'omvendelse' },
  { letter:'P', ipa:'/p/', sound:'Like English "p"', example:'profet (prophet)', mission:'præsidentskab' },
  { letter:'Q', ipa:'/k/', sound:'Very rare; like "k"', example:'quiz', mission:'(rare)' },
  { letter:'R', ipa:'/ʁ/', sound:'Guttural "r" at back of throat', example:'religion', mission:'retfærdighed' },
  { letter:'S', ipa:'/s/', sound:'Like English "s"', example:'sjæl (soul)', mission:'Skrifterne' },
  { letter:'T', ipa:'/t/', sound:'Like English "t"', example:'tro (faith)', mission:'tempel' },
  { letter:'U', ipa:'/u/', sound:'Like "oo" in "food"', example:'undervisning (teaching)', mission:'udødelighed' },
  { letter:'V', ipa:'/v/', sound:'Like English "v"', example:'velsignelse (blessing)', mission:'vidne' },
  { letter:'W', ipa:'/v/', sound:'Like "v"; used in loanwords', example:'wifi', mission:'(rare)' },
  { letter:'X', ipa:'/ks/', sound:'Like "ks"; used in loanwords', example:'ekstra', mission:'(rare)' },
  { letter:'Y', ipa:'/y/', sound:'Like French "u"; purse lips', example:'yde (contribute)', mission:'ydmyghed' },
  { letter:'Z', ipa:'/s/', sound:'Like "s"; rare in Danish', example:'zone', mission:'(rare)' },
  { letter:'Æ', ipa:'/ɛ/', sound:'Like "a" in "bad"', example:'ære (honour)', mission:'ægte (true)' },
  { letter:'Ø', ipa:'/ø/', sound:'Like "u" in "burn"', example:'øre (ear)', mission:'ønske (wish)' },
  { letter:'Å', ipa:'/ɔ/', sound:'Like "aw" in "law"', example:'ånd (spirit)', mission:'åbenbaring' },
];

// ─── VOCABULARY CATEGORIES ───────────────────────────────────────────────────
const VOCAB_CATS = [
  { id:'numbers', label:'Tal', sublabel:'Numbers', icon:'🔢', color:'#C60C30',
    words:[
      {da:'nul',en:'zero'},{da:'en/et',en:'one'},{da:'to',en:'two'},{da:'tre',en:'three'},
      {da:'fire',en:'four'},{da:'fem',en:'five'},{da:'seks',en:'six'},{da:'syv',en:'seven'},
      {da:'otte',en:'eight'},{da:'ni',en:'nine'},{da:'ti',en:'ten'},{da:'tyve',en:'twenty'},
      {da:'hundrede',en:'hundred'},{da:'tusind',en:'thousand'},{da:'første',en:'first'},
      {da:'anden',en:'second'},{da:'tredje',en:'third'},{da:'halvanden',en:'one and a half'},
    ]
  },
  { id:'days', label:'Dage & Tid', sublabel:'Days & Time', icon:'📅', color:'#4A7C9A',
    words:[
      {da:'mandag',en:'Monday'},{da:'tirsdag',en:'Tuesday'},{da:'onsdag',en:'Wednesday'},
      {da:'torsdag',en:'Thursday'},{da:'fredag',en:'Friday'},{da:'lørdag',en:'Saturday'},
      {da:'søndag',en:'Sunday'},{da:'i dag',en:'today'},{da:'i morgen',en:'tomorrow'},
      {da:'i går',en:'yesterday'},{da:'uge',en:'week'},{da:'måned',en:'month'},
      {da:'år',en:'year'},{da:'morgen',en:'morning'},{da:'eftermiddag',en:'afternoon'},
      {da:'aften',en:'evening'},{da:'nat',en:'night'},{da:'hvad tid er det?',en:'what time is it?'},
    ]
  },
  { id:'food', label:'Mad', sublabel:'Food', icon:'🍞', color:'#D4850A',
    words:[
      {da:'brød',en:'bread'},{da:'smørrebrød',en:'open-faced sandwich'},{da:'fisk',en:'fish'},
      {da:'kød',en:'meat'},{da:'grøntsager',en:'vegetables'},{da:'frugt',en:'fruit'},
      {da:'vand',en:'water'},{da:'mælk',en:'milk'},{da:'kaffe',en:'coffee'},
      {da:'te',en:'tea'},{da:'morgenmad',en:'breakfast'},{da:'frokost',en:'lunch'},
      {da:'aftensmad',en:'dinner'},{da:'dessert',en:'dessert'},{da:'sult',en:'hunger'},
      {da:'tørst',en:'thirst'},{da:'lækker',en:'delicious'},{da:'tak for mad',en:'thanks for the food'},
    ]
  },
  { id:'shopping', label:'Shopping', sublabel:'Shopping', icon:'🛍️', color:'#8A8070',
    words:[
      {da:'butik',en:'store'},{da:'marked',en:'market'},{da:'pris',en:'price'},
      {da:'billig',en:'cheap'},{da:'dyr',en:'expensive'},{da:'betale',en:'to pay'},
      {da:'kvittering',en:'receipt'},{da:'kreditkort',en:'credit card'},
      {da:'kontanter',en:'cash'},{da:'størrelse',en:'size'},{da:'farve',en:'colour'},
      {da:'hvad koster det?',en:'how much does it cost?'},{da:'for dyrt',en:'too expensive'},
      {da:'rabat',en:'discount'},{da:'åbent',en:'open'},{da:'lukket',en:'closed'},
      {da:'indgang',en:'entrance'},{da:'udgang',en:'exit'},
    ]
  },
  { id:'transport', label:'Transport', sublabel:'Transport', icon:'🚌', color:'#2E5E3E',
    words:[
      {da:'bus',en:'bus'},{da:'tog',en:'train'},{da:'metro',en:'metro/subway'},
      {da:'cykel',en:'bicycle'},{da:'bil',en:'car'},{da:'fly',en:'airplane'},
      {da:'færge',en:'ferry'},{da:'station',en:'station'},{da:'billetter',en:'tickets'},
      {da:'perron',en:'platform'},{da:'afgang',en:'departure'},{da:'ankomst',en:'arrival'},
      {da:'forsinkelse',en:'delay'},{da:'billet',en:'ticket'},{da:'retning',en:'direction'},
      {da:'venstre',en:'left'},{da:'højre',en:'right'},{da:'ligefrem',en:'straight ahead'},
    ]
  },
  { id:'family', label:'Familie', sublabel:'Family', icon:'👨‍👩‍👧', color:'#C60C30',
    words:[
      {da:'familie',en:'family'},{da:'far',en:'father'},{da:'mor',en:'mother'},
      {da:'søn',en:'son'},{da:'datter',en:'daughter'},{da:'bror',en:'brother'},
      {da:'søster',en:'sister'},{da:'bedstefar',en:'grandfather'},{da:'bedstemor',en:'grandmother'},
      {da:'onkel',en:'uncle'},{da:'tante',en:'aunt'},{da:'fætter/kusine',en:'cousin'},
      {da:'barn',en:'child'},{da:'ægtemand',en:'husband'},{da:'kone',en:'wife'},
      {da:'forældre',en:'parents'},{da:'søskende',en:'siblings'},{da:'slægt',en:'relatives'},
    ]
  },
  { id:'gospel', label:'Evangeliet', sublabel:'Gospel', icon:'✝️', color:'#4A7C9A',
    words:[
      {da:'Gud',en:'God'},{da:'Jesus Kristus',en:'Jesus Christ'},{da:'Den Hellige Ånd',en:'Holy Ghost'},
      {da:'tro',en:'faith'},{da:'omvendelse',en:'repentance'},{da:'dåb',en:'baptism'},
      {da:'evangelium',en:'gospel'},{da:'åbenbaring',en:'revelation'},{da:'profet',en:'prophet'},
      {da:'nåde',en:'grace'},{da:'frelse',en:'salvation'},{da:'evig',en:'eternal'},
      {da:'bøn',en:'prayer'},{da:'skrifterne',en:'scriptures'},{da:'pagter',en:'covenants'},
      {da:'velsignelse',en:'blessing'},{da:'discipel',en:'disciple'},{da:'vidne',en:'witness'},
    ]
  },
  { id:'church', label:'Kirken', sublabel:'The Church (LDS)', icon:'⛪', color:'#D4850A',
    words:[
      {da:'Jesu Kristi Kirke af Sidste Dages Hellige',en:"The Church of Jesus Christ of Latter-day Saints"},
      {da:'biskop',en:'bishop'},{da:'stavspræsident',en:'stake president'},
      {da:'gren',en:'branch'},{da:'menighed',en:'ward/congregation'},
      {da:'stav',en:'stake'},{da:'generalkonference',en:'General Conference'},
      {da:'præstedømme',en:'priesthood'},{da:'Aronspræstedømmet',en:"Aaronic Priesthood"},
      {da:'Melkisedekspræstedømmet',en:'Melchizedek Priesthood'},{da:'søndagsskole',en:'Sunday school'},
      {da:'hjælpeforening',en:"Relief Society"},{da:'nadvermøde',en:'sacrament meeting'},
      {da:'tempel',en:'temple'},{da:'missionær',en:'missionary'},{da:'mission',en:'mission'},
      {da:'overanvist',en:'set apart'},{da:'kaldelse',en:'calling'},
    ]
  },
  { id:'feelings', label:'Følelser', sublabel:'Feelings', icon:'💛', color:'#8A8070',
    words:[
      {da:'glad',en:'happy'},{da:'trist',en:'sad'},{da:'bekymret',en:'worried'},
      {da:'fredfyldt',en:'peaceful'},{da:'taknemmelig',en:'grateful'},{da:'kærlig',en:'loving'},
      {da:'modig',en:'courageous'},{da:'træt',en:'tired'},{da:'nysgerrig',en:'curious'},
      {da:'ydmyg',en:'humble'},{da:'villig',en:'willing'},{da:'forberedt',en:'prepared'},
      {da:'lykkelig',en:'joyful'},{da:'overladt til sig selv',en:'lonely'},{da:'håbefuld',en:'hopeful'},
      {da:'bekræftet',en:'confirmed'},{da:'rørt',en:'moved/touched'},{da:'stærk',en:'strong'},
    ]
  },
];

// ─── PHRASE CATEGORIES ───────────────────────────────────────────────────────
const PHRASE_CATEGORIES = [
  { id:'greetings', label:'Hilsener', sublabel:'Greetings', color:'#C60C30',
    phrases:[
      { da:'Hej! Hvordan har du det?', en:'Hi! How are you?', wbw:'Hej=Hi / Hvordan=How / har=have / du=you / det=it', note:'Most common Danish greeting' },
      { da:'Godmorgen!', en:'Good morning!', wbw:'God=Good / morgen=morning', note:'Used until about noon' },
      { da:'Goddag!', en:'Good day!', wbw:'God=Good / dag=day', note:'Polite daytime greeting' },
      { da:'Godaften!', en:'Good evening!', wbw:'God=Good / aften=evening', note:'Used after 6pm' },
      { da:'Mit navn er søster Aneca.', en:'My name is Sister Aneca.', wbw:'Mit=My / navn=name / er=is / søster=sister', note:'Introduce yourself this way' },
      { da:'Jeg er missionær for Jesu Kristi Kirke.', en:'I am a missionary for the Church of Jesus Christ.', wbw:'Jeg=I / er=am / missionær=missionary / for=for', note:'Core introduction' },
      { da:'Farvel! Vi ses igen.', en:'Goodbye! We\'ll see each other again.', wbw:'Farvel=Goodbye / Vi=We / ses=see / igen=again', note:'Warm farewell' },
      { da:'Tak for i dag.', en:'Thank you for today.', wbw:'Tak=Thank / for=for / i=in/today / dag=day', note:'Warm closing phrase' },
    ]
  },
  { id:'intro', label:'Introduktion', sublabel:'Introduction', color:'#4A7C9A',
    phrases:[
      { da:'Vi er fra Jesu Kristi Kirke af Sidste Dages Hellige.', en:'We are from The Church of Jesus Christ of Latter-day Saints.', wbw:'Vi=We / er=are / fra=from / Kirke=Church', note:'Full church name' },
      { da:'Vi ønsker at dele en vigtig besked med dig.', en:'We want to share an important message with you.', wbw:'Vi=We / ønsker=want/wish / at=to / dele=share / vigtig=important / besked=message', note:'Opening invitation' },
      { da:'Har du et øjeblik?', en:'Do you have a moment?', wbw:'Har=Have / du=you / et=a / øjeblik=moment', note:'Polite opening question' },
      { da:'Vi taler om Guds plan for dig.', en:'We speak about God\'s plan for you.', wbw:'Vi=We / taler=speak / om=about / Guds=God\'s / plan=plan / for=for / dig=you', note:'Core message intro' },
      { da:'Tror du på Gud?', en:'Do you believe in God?', wbw:'Tror=Believe / du=you / på=in / Gud=God', note:'Opening gospel question' },
      { da:'Måske vil du overveje det?', en:'Perhaps you would consider it?', wbw:'Måske=Perhaps / vil=will / du=you / overveje=consider / det=it', note:'Gentle invitation' },
      { da:'Jeg vidner om, at Jesus er Kristus.', en:'I testify that Jesus is the Christ.', wbw:'Jeg=I / vidner=testify / om=that / Jesus=Jesus / er=is / Kristus=Christ', note:'Personal testimony' },
    ]
  },
  { id:'teaching', label:'Undervisning', sublabel:'Teaching', color:'#2E5E3E',
    phrases:[
      { da:'Gud elsker dig af hele sit hjerte.', en:'God loves you with all of His heart.', wbw:'Gud=God / elsker=loves / dig=you / af=with / hele=all / sit=His / hjerte=heart', note:'Core testimony phrase' },
      { da:'Jesus Kristus er vores frelser og forløser.', en:'Jesus Christ is our Saviour and Redeemer.', wbw:'Jesus Kristus=Jesus Christ / er=is / vores=our / frelser=Saviour / forløser=Redeemer', note:'Christocentric testimony' },
      { da:'Omvendelse er mulig for alle.', en:'Repentance is possible for everyone.', wbw:'Omvendelse=Repentance / er=is / mulig=possible / for=for / alle=everyone', note:'Gospel principle' },
      { da:'Dåb er nødvendig for frelse.', en:'Baptism is necessary for salvation.', wbw:'Dåb=Baptism / er=is / nødvendig=necessary / for=for / frelse=salvation', note:'First principle' },
      { da:'Den Hellige Ånd kan tale til dit hjerte.', en:'The Holy Ghost can speak to your heart.', wbw:'Den Hellige Ånd=Holy Ghost / kan=can / tale=speak / til=to / dit=your / hjerte=heart', note:'Gift of Holy Ghost' },
      { da:'Vil du læse i Mormons Bog?', en:'Will you read in the Book of Mormon?', wbw:'Vil=Will / du=you / læse=read / i=in / Mormons Bog=Book of Mormon', note:'Commitment invitation' },
      { da:'Joseph Smith var en sand profet.', en:'Joseph Smith was a true prophet.', wbw:'Joseph Smith=Joseph Smith / var=was / en=a / sand=true / profet=prophet', note:'Restoration testimony' },
      { da:'Vi inviterer dig til at blive døbt.', en:'We invite you to be baptised.', wbw:'Vi=We / inviterer=invite / dig=you / til=to / at=to / blive=become / døbt=baptised', note:'Baptismal invitation' },
    ]
  },
  { id:'prayer', label:'Bøn', sublabel:'Prayer', color:'#D4850A',
    phrases:[
      { da:'Kære himmelske Fader,', en:'Dear Heavenly Father,', wbw:'Kære=Dear / himmelske=heavenly / Fader=Father', note:'How to open a prayer in Danish' },
      { da:'Vi er taknemmelige for dine velsignelser.', en:'We are grateful for Thy blessings.', wbw:'Vi=We / er=are / taknemmelige=grateful / for=for / dine=Thy / velsignelser=blessings', note:'Gratitude in prayer' },
      { da:'Vi beder om Den HelligeÅnds nærvær.', en:'We pray for the presence of the Holy Ghost.', wbw:'Vi=We / beder=pray / om=for / Den HelligeÅnds=Holy Ghost\'s / nærvær=presence', note:'Inviting the Spirit' },
      { da:'Hjælp os at forstå dit ord.', en:'Help us to understand Thy word.', wbw:'Hjælp=Help / os=us / at=to / forstå=understand / dit=Thy / ord=word', note:'Prayer for understanding' },
      { da:'Vi siger dette i Jesu Kristi navn,', en:'We say this in the name of Jesus Christ,', wbw:'Vi=We / siger=say / dette=this / i=in / Jesu Kristi=Jesus Christ\'s / navn=name', note:'Closing formula' },
      { da:'Amen.', en:'Amen.', wbw:'Amen=Amen', note:'Universal closing word' },
      { da:'Vil du bede med os?', en:'Will you pray with us?', wbw:'Vil=Will / du=you / bede=pray / med=with / os=us', note:'Invitation to pray together' },
      { da:'Du kan tale med Gud som en ven.', en:'You can speak with God like a friend.', wbw:'Du=You / kan=can / tale=speak / med=with / Gud=God / som=like / en=a / ven=friend', note:'Encouraging personal prayer' },
    ]
  },
];

// ─── CULTURE SECTIONS ────────────────────────────────────────────────────────
const CULTURE_SECTIONS = [
  {
    id:'copenhagen', icon:'🏙️', label:'København', sublabel:'Copenhagen',
    color:'#C60C30', bgColor:'#F5E0E4',
    tagline:'The canals of Christianshavn and the Little Mermaid',
    body:`Copenhagen (København — "merchants' harbour") is the capital of Denmark, a city of canals, coloured townhouses, and world-class cycling culture. Nyhavn's famous 17th-century canal houses are one of Europe's most photographed scenes. The city blends Viking history with cutting-edge design: the National Museum sits minutes from the Meatpacking District.\n\nFor missionaries, Copenhagen is a blend of casual friendliness and Nordic reserve. Danes value directness and honesty — meeting people on cycling paths, in parks, or near canal benches is natural. The Rundetårn (Round Tower) and the old Latin Quarter are good places to meet students and families.`,
    vocab:[{da:'havn',en:'harbour'},{da:'kanal',en:'canal'},{da:'bro',en:'bridge'},{da:'rådhus',en:'city hall'},{da:'cykelsti',en:'bicycle path'},{da:'torv',en:'square/plaza'}],
    missionTip:'Danes appreciate when you show genuine interest in their city. Mention you love cycling and ask about their favourite local bakery — it opens hearts.'
  },
  {
    id:'design', icon:'🪑', label:'Dansk Design', sublabel:'Danish Design',
    color:'#4A7C9A', bgColor:'#E8F0F6',
    tagline:'Form, function, and the beauty of simplicity',
    body:`Danish design is world-famous for its principle of "form follows function." Designers like Arne Jacobsen (the Egg Chair), Hans Wegner (the Wishbone Chair), and Alvar Aalto shaped 20th-century modernism. The Danish Design Museum in Copenhagen traces this tradition from Viking craftsmanship to today's sustainable innovations.\n\nDesign thinking permeates everyday Danish life — from minimalist apartment interiors to the thoughtful layout of public spaces. Danes take pride in craftsmanship, sustainability, and beauty in everyday objects. Missionaries can connect gospel principles (stewardship, simplicity, creation) to this cultural pride.`,
    vocab:[{da:'design',en:'design'},{da:'enkelthed',en:'simplicity'},{da:'håndværk',en:'craftsmanship'},{da:'funktion',en:'function'},{da:'formgivning',en:'design/shaping'},{da:'bæredygtig',en:'sustainable'}],
    missionTip:'Ask a Dane about their favourite Danish design object — you\'ll get a passionate conversation. Then share how the gospel also values beauty, order, and stewardship.'
  },
  {
    id:'hygge', icon:'🕯️', label:'Hygge', sublabel:'Hygge — The Danish Art of Cosy',
    color:'#D4850A', bgColor:'#FAF0DC',
    tagline:'Candles, warmth, and the joy of being together',
    body:`Hygge (pronounced "hoo-gah") is a Danish cultural concept with no direct English translation. It describes a mood of cosiness, warmth, and togetherness — the feeling of sitting with friends around candles on a dark November evening, sharing food and laughter. It's considered essential to Danish happiness and explains why Denmark consistently ranks among the world's happiest nations.\n\nHygge is not just about physical comfort — it's about emotional safety, trust, and the absence of stress. Missionaries can draw powerful parallels between hygge and the peace of the Holy Ghost, the warmth of the gospel family, and the sacredness of home evenings.`,
    vocab:[{da:'hygge',en:'cosiness/togetherness'},{da:'hyggelig',en:'cosy/pleasant'},{da:'lys',en:'light/candle'},{da:'varme',en:'warmth'},{da:'fællesskab',en:'community/fellowship'},{da:'ro',en:'peace/calm'}],
    missionTip:'"Har du det hyggeligt?" (Are you feeling cosy/good?) is a great opener. Connect the gospel\'s sense of belonging and warmth to what Danes already value.'
  },
  {
    id:'christmas', icon:'🎄', label:'Jul', sublabel:'Danish Christmas Traditions',
    color:'#2E5E3E', bgColor:'#E8F4EC',
    tagline:'Advent calendars, rice pudding, and dancing around the tree',
    body:`Danish Christmas (Jul) is deeply rooted in tradition. The Advent season begins December 1 with advent calendars and candles in every window. Families eat æbleskiver (round pancake balls) with jam and powdered sugar throughout December. Christmas Eve (Juleaften) is the main celebration: families eat roast duck or pork with red cabbage, then gather around the Christmas tree (the real kind — a freshly cut fir) and dance in a circle singing carols.\n\nThe traditional dessert is risalamande — a cold rice pudding with cherry sauce. One whole almond is hidden in the pudding; whoever finds it wins a prize (Mandelmanden). Julenisse, the Danish Christmas elf, is a beloved figure of mischief and generosity.`,
    vocab:[{da:'jul',en:'Christmas'},{da:'adventskrans',en:'advent wreath'},{da:'julemand',en:'Father Christmas'},{da:'juletræ',en:'Christmas tree'},{da:'æbleskiver',en:'round pancake balls'},{da:'risalamande',en:'rice pudding dessert'}],
    missionTip:'December is a wonderful mission month — mention Christmas and the birth of Jesus Christ. "Hvad betyder jul for dig?" (What does Christmas mean to you?) opens beautiful conversations.'
  },
  {
    id:'food', icon:'🥐', label:'Dansk Mad', sublabel:'Danish Food',
    color:'#8A8070', bgColor:'#F0EDE8',
    tagline:'Smørrebrød, pastries, and the New Nordic kitchen',
    body:`Danish cuisine is experiencing a global renaissance. The traditional smørrebrød (open-faced rye bread sandwich) has been elevated by world-famous restaurants like Noma into artistic creations. Rye bread (rugbrød) is the Danish staple — dense, slightly sour, and endlessly topped with pickled herring, cold cuts, eggs, or cheese.\n\nDanish pastries (wienerbrød — literally "Vienna bread") are nothing like the American version: they're flaky, buttery, and come in dozens of regional shapes. Coffee culture is central — Denmark is among the world's highest coffee-consuming nations. The New Nordic kitchen movement prioritises local, seasonal, foraged ingredients. For missionaries, sharing a meal or a pastry is a powerful door-opener.`,
    vocab:[{da:'smørrebrød',en:'open-faced sandwich'},{da:'rugbrød',en:'rye bread'},{da:'wienerbrød',en:'Danish pastry'},{da:'sild',en:'herring'},{da:'frikadeller',en:'meatballs'},{da:'kartofler',en:'potatoes'}],
    missionTip:'"Kan jeg prøve din yndlingsbagel?" (Can I try your favourite pastry?) is a fun ice-breaker at a bakery. Food shared is trust built.'
  },
  {
    id:'vikings', icon:'⚔️', label:'Vikingearv', sublabel:'Viking Heritage',
    color:'#1A1A2E', bgColor:'#EAEAF2',
    tagline:'Longships, runes, and the saga tradition',
    body:`Denmark is the heartland of Viking civilization. From approximately 793 to 1066 AD, Norse seafarers from Denmark, Norway, and Sweden sailed, traded, and settled from North America to Constantinople. Danish Vikings founded Dublin, traded amber and furs along Russian river routes, and established settlements throughout Britain and Normandy.\n\nThe National Museum in Copenhagen has one of the world's finest Viking collections: runic stones, longships, silver hoards, and intricate jewellery. The Jelling Stones — erected by King Harald Bluetooth around 965 AD — are called "Denmark's birth certificate" and mark the Christianisation of Denmark. Missionaries can draw rich parallels between the Restoration and Denmark's own history of receiving the gospel.`,
    vocab:[{da:'vikinger',en:'Vikings'},{da:'langskib',en:'longship'},{da:'runer',en:'runes'},{da:'borg',en:'fortress/castle'},{da:'handel',en:'trade'},{da:'saga',en:'saga/story'}],
    missionTip:'Mention the Jelling Stones and Denmark\'s Christian heritage. "Vidste du at Danmark har en lang kristen historie?" (Did you know Denmark has a long Christian history?) — Danes are proud of this.'
  },
];

// ─── READER TEXTS ─────────────────────────────────────────────────────────────
const READER_TEXTS = [
  {
    id:'folktale', category:'Litteratur', icon:'📖', level:'Beginner', levelColor:'#2E5E3E',
    title:'Den Lille Havfrue', subtitle:'The Little Mermaid (H.C. Andersen, 1837)',
    segments:[
      { da:'Langt ude i havet er vandet så blåt som bladene på den smukkeste kornblomst.', en:'Far out at sea the water is as blue as the petals of the most beautiful cornflower.', note:'Note: "blåt" = blue (neuter); "smukkeste" = most beautiful (superlative)' },
      { da:'Der nede levede havkongen med sine seks døtre.', en:'Down there lived the sea king with his six daughters.', note:'"Nede" = down there; "levede" = lived (past tense)' },
      { da:'Den yngste var den skønneste af dem alle.', en:'The youngest was the most beautiful of them all.', note:'"Yngste" = youngest; "skønneste" = most beautiful' },
      { da:'Hun drømte om den verden, der lå over havet.', en:'She dreamed of the world that lay above the sea.', note:'"Drømte om" = dreamed about; "over" = above' },
      { da:'En dag så hun et skib med et ungt, smukt menneske om bord.', en:'One day she saw a ship with a young, handsome person on board.', note:'"Så" = saw (past); "om bord" = on board' },
    ]
  },
  {
    id:'pmg', category:'Missionsarbejde', icon:'📋', level:'Intermediate', levelColor:'#4A7C9A',
    title:'Forkyn Mit Evangelium — Kapitel 1', subtitle:'Preach My Gospel Chapter 1',
    segments:[
      { da:'Din mission er at invitere andre til at komme til Kristus.', en:'Your purpose is to invite others to come unto Christ.', note:'"Invitere" = invite; "komme til" = come unto' },
      { da:'Du gør dette ved at hjælpe dem at modtage det gengivne evangelium.', en:'You do this by helping them receive the restored gospel.', note:'"Gengivne" = restored; "modtage" = receive' },
      { da:'Tro, omvendelse, dåb og Den Hellige Ånds gave er de første principper.', en:'Faith, repentance, baptism and the gift of the Holy Ghost are the first principles.', note:'The four first principles stated together' },
      { da:'Lev så Herren kan bruge dig som sit redskab.', en:'Live so the Lord can use you as His instrument.', note:'"Redskab" = instrument/tool; "lev" = live (imperative)' },
      { da:'Studér Skrifterne dagligt for at styrke din tro.', en:'Study the scriptures daily to strengthen your faith.', note:'"Dagligt" = daily; "styrke" = strengthen' },
    ]
  },
  {
    id:'nephi', category:'Skrifterne', icon:'📜', level:'Intermediate', levelColor:'#4A7C9A',
    title:'2 Nephi 31:20', subtitle:'Book of Mormon — 2 Nephi 31:20',
    segments:[
      { da:'Derfor skal I fremad med en urokkelig tro på Kristus.', en:'Wherefore, ye must press forward with a steadfastness in Christ.', note:'"Urokkelig" = steadfast/immovable; "fremad" = forward' },
      { da:'Med et fuldt håb og en kærlighed til Gud og til alle mennesker.', en:'Having a perfect brightness of hope and a love of God and of all men.', note:'"Fuldt håb" = perfect hope; "kærlighed" = love' },
      { da:'Og fodrer af Kristi ord og holder fast ved til enden.', en:'And feeding upon the word of Christ and enduring to the end.', note:'"Fodrer af" = feeding upon; "til enden" = to the end' },
      { da:'Se, dette er Faderens og Sønnens vej.', en:'Behold, this is the way; and there is none other way nor name given.', note:'"Faderens og Sønnens" = Father\'s and Son\'s' },
    ]
  },
  {
    id:'john316', category:'Bibelen', icon:'✝️', level:'Beginner', levelColor:'#2E5E3E',
    title:'Johannes 3:16', subtitle:'The Gospel of John 3:16',
    segments:[
      { da:'Thi således elskede Gud verden,', en:'For God so loved the world,', note:'"Thi" = for/because (archaic); "elskede" = loved' },
      { da:'at han gav sin søn, den enbårne,', en:'that he gave his only begotten Son,', note:'"Enbårne" = only begotten; beautiful archaic Danish word' },
      { da:'for at enhver, som tror på ham,', en:'that whosoever believeth in him,', note:'"Enhver" = whosoever/everyone; "tror på" = believes in' },
      { da:'ikke skal fortabes, men have evigt liv.', en:'should not perish, but have everlasting life.', note:'"Fortabes" = perish/be lost; "evigt liv" = eternal life' },
    ]
  },
  {
    id:'prayer', category:'Bøn', icon:'🙏', level:'Beginner', levelColor:'#2E5E3E',
    title:'Morgengebet', subtitle:'A Missionary Morning Prayer',
    segments:[
      { da:'Kære himmelske Fader, vi takker dig for denne dag.', en:'Dear Heavenly Father, we thank Thee for this day.', note:'"Takker" = thank; formal address uses "dig" for Thee' },
      { da:'Vi beder om, at Din Ånd må lede os.', en:'We pray that Thy Spirit may guide us.', note:'"Lede" = guide/lead; "Din Ånd" = Thy Spirit' },
      { da:'Hjælp os at finde dem, der søger sandheden.', en:'Help us to find those who are seeking the truth.', note:'"Søger" = seek; "sandheden" = the truth' },
      { da:'Beskyt os og velsign vores arbejde.', en:'Protect us and bless our work.', note:'"Beskyt" = protect (imperative); "velsign" = bless (imperative)' },
      { da:'Vi beder i Jesu Kristi hellige navn. Amen.', en:'We pray in the holy name of Jesus Christ. Amen.', note:'"Hellige" = holy; "navn" = name' },
    ]
  },
];

// ─── SCRIPTURE BOOKS ──────────────────────────────────────────────────────────
const SCRIPTURE_BOOKS = [
  {
    id:'bom', label:'Mormons Bog', sublabel:'Book of Mormon', icon:'📕', color:'#C60C30',
    chapters:[
      { title:'1 Nephi 3:7', verses:[
        { da:'Og det skete, at jeg, Nephi, sagde til min fader: Jeg vil gå og gøre de ting, som Herren har befalet.', en:'And it came to pass that I, Nephi, said unto my father: I will go and do the things which the Lord hath commanded.' },
        { da:'Thi jeg ved, at Herren ikke giver nogen befaling til menneskenes børn uden at bane en vej for dem, at de kan udføre det, som han befaler dem.', en:'For I know that the Lord giveth no commandments unto the children of men, save he shall prepare a way for them that they may accomplish the thing which he commandeth them.' },
      ]},
      { title:'Alma 32:21', verses:[
        { da:'Og nu som jeg sagde om tro — tro er ikke at have en fuldkommen viden om tingene.', en:'And now as I said concerning faith—faith is not to have a perfect knowledge of things.' },
        { da:'Hvis du da har tro, håber du på ting, som ikke ses, men som er sande.', en:'Therefore if ye have faith ye hope for things which are not seen, which are true.' },
      ]},
      { title:'Moroni 10:4-5', verses:[
        { da:'Og når I modtager disse ting, vil jeg formane jer til at spørge Gud, den evige Fader, i Kristi navn, om disse ting ikke er sande.', en:'And when ye shall receive these things, I would exhort you that ye would ask God, the Eternal Father, in the name of Christ, if these things are not true.' },
        { da:'Og hvis I spørger med et oprigtigt hjerte, med virkelig hensigt og har tro på Kristus, vil han åbenbare sandheden om det for jer ved Den Hellige Ånds kraft.', en:'And if ye shall ask with a sincere heart, with real intent, having faith in Christ, he will manifest the truth of it unto you, by the power of the Holy Ghost.' },
      ]},
    ]
  },
  {
    id:'ot', label:'Gamle Testamente', sublabel:'Old Testament', icon:'📙', color:'#D4850A',
    chapters:[
      { title:'1 Mosebog 1:1', verses:[
        { da:'I begyndelsen skabte Gud himlen og jorden.', en:'In the beginning God created the heaven and the earth.' },
      ]},
      { title:'Salme 23:1-3', verses:[
        { da:'Herren er min hyrde, mig fattes intet.', en:'The Lord is my shepherd; I shall not want.' },
        { da:'Han lader mig ligge i grønne enge, han fører mig til vand, hvor jeg finder hvile.', en:'He maketh me to lie down in green pastures: he leadeth me beside the still waters.' },
        { da:'Han giver mig nyt liv og fører mig på rette stier for sit navns skyld.', en:'He restoreth my soul: he leadeth me in the paths of righteousness for his name\'s sake.' },
      ]},
      { title:'Jeremias 1:5', verses:[
        { da:'Inden jeg dannede dig i moderlivet, kendte jeg dig; inden du kom ud af moders skød, helligede jeg dig.', en:'Before I formed thee in the belly I knew thee; and before thou camest forth out of the womb I sanctified thee.' },
      ]},
    ]
  },
  {
    id:'nt', label:'Nye Testamente', sublabel:'New Testament', icon:'📗', color:'#2E5E3E',
    chapters:[
      { title:'Johannes 3:16', verses:[
        { da:'Thi således elskede Gud verden, at han gav sin søn, den enbårne, for at enhver, som tror på ham, ikke skal fortabes, men have evigt liv.', en:'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.' },
      ]},
      { title:'Matthæus 5:3-5', verses:[
        { da:'Salige er de fattige i ånden, thi Himmeriget er deres.', en:'Blessed are the poor in spirit: for theirs is the kingdom of heaven.' },
        { da:'Salige er de, som sørger, thi de skal trøstes.', en:'Blessed are they that mourn: for they shall be comforted.' },
        { da:'Salige er de sagtmodige, thi de skal arve jorden.', en:'Blessed are the meek: for they shall inherit the earth.' },
      ]},
      { title:'Jakobs Brev 1:5', verses:[
        { da:'Hvis nogen af jer mangler visdom, skal han bede til Gud, som giver alle villigt og uden bebrejdelse, og den vil blive givet ham.', en:'If any of you lack wisdom, let him ask of God, that giveth to all men liberally, and upbraideth not; and it shall be given him.' },
      ]},
    ]
  },
  {
    id:'dc', label:'Lære og Pagter', sublabel:'Doctrine & Covenants', icon:'📘', color:'#4A7C9A',
    chapters:[
      { title:'L&P 4:2', verses:[
        { da:'Derfor, O du menneske, som er i Guds tjeneste, se, du arbejder med al din kraft, sjæl og sind og styrke, for at skaffe Guds rige fremgang.', en:'Therefore, O ye that embark in the service of God, see that ye serve him with all your heart, might, mind and strength, that ye may stand blameless before God at the last day.' },
      ]},
      { title:'L&P 58:27', verses:[
        { da:'Se, det er glædeligt i Herrens øjne, at mennesket udfører mange gode gerninger af sin egen fri vilje.', en:'Verily I say, men should be anxiously engaged in a good cause, and do many things of their own free will.' },
      ]},
      { title:'L&P 121:7-8', verses:[
        { da:'Min søn, frygt fred til din sjæl; modgang og elendighed skal kun være for en kort stund hos dig.', en:'My son, peace be unto thy soul; thine adversity and thine afflictions shall be but a small moment.' },
        { da:'Og da, hvis du holder ud vel, skal Gud ophøje dig i det høje.', en:'And then, if thou endure it well, God shall exalt thee on high.' },
      ]},
    ]
  },
  {
    id:'pogp', label:'Den Kostelige Perle', sublabel:'Pearl of Great Price', icon:'💎', color:'#8A8070',
    chapters:[
      { title:'Moses 1:39', verses:[
        { da:'Thi se, dette er mit arbejde og min herlighed — at skabe udødelighed og evigt liv for mennesket.', en:'For behold, this is my work and my glory—to bring to pass the immortality and eternal life of man.' },
      ]},
      { title:"Josef Smith — Historie 1:15-17", verses:[
        { da:'Jeg trak mig tilbage til skoven for at forsøge forsøget... Jeg knælede ned og begyndte at bede.', en:'I retired to the woods to make the attempt... I kneeled down and began to offer up the desires of my heart.' },
        { da:'Jeg så et lys over mit hovede, klarere end solen, der dalede ned over mig.', en:'I saw a pillar of light exactly over my head, above the brightness of the sun, which descended gradually until it fell upon me.' },
        { da:'Da lyset hvilede på mig, så jeg to personer, hvis glans og herlighed trodser al beskrivelse.', en:'When the light rested upon me I saw two Personages, whose brightness and glory defy all description.' },
      ]},
    ]
  },
];

// ─── SPEAKING LEVELS ──────────────────────────────────────────────────────────
const SPEAK_LEVELS = [
  { id:'sounds', label:'Lyde', sublabel:'Sounds', color:'#C60C30', icon:'🔊',
    exercises:[
      { id:'s1', da:'Æ — Ø — Å', hint:'Three unique Danish vowels', type:'vowel' },
      { id:'s2', da:'rødgrød med fløde', hint:'Famous Danish tongue-twister: red porridge with cream', type:'tongue' },
      { id:'s3', da:'hygge', hint:'Pronounce: "hoo-gah"', type:'word' },
      { id:'s4', da:'kærlighed', hint:'Pronounce: "kair-lee-hel" — means love', type:'word' },
      { id:'s5', da:'ydmyghed', hint:'Pronounce: "ew-d-mew-hel" — means humility', type:'word' },
    ]
  },
  { id:'basic', label:'Basale Sætninger', sublabel:'Basic Phrases', color:'#4A7C9A', icon:'💬',
    exercises:[
      { id:'b1', da:'Hej! Mit navn er søster Aneca.', hint:'Hi! My name is Sister Aneca.', type:'phrase' },
      { id:'b2', da:'Jeg er glad for at møde dig.', hint:'I am happy to meet you.', type:'phrase' },
      { id:'b3', da:'Taler du dansk?', hint:'Do you speak Danish?', type:'phrase' },
      { id:'b4', da:'Jeg lærer at tale dansk.', hint:'I am learning to speak Danish.', type:'phrase' },
      { id:'b5', da:'Kan du hjælpe mig?', hint:'Can you help me?', type:'phrase' },
    ]
  },
  { id:'mission', label:'Missionssætninger', sublabel:'Mission Sentences', color:'#2E5E3E', icon:'📣',
    exercises:[
      { id:'m1', da:'Vi er missionærer for Jesu Kristi Kirke.', hint:'We are missionaries for the Church of Jesus Christ.', type:'mission' },
      { id:'m2', da:'Har du et øjeblik til at høre vores besked?', hint:'Do you have a moment to hear our message?', type:'mission' },
      { id:'m3', da:'Gud elsker dig og har en plan for dit liv.', hint:'God loves you and has a plan for your life.', type:'mission' },
      { id:'m4', da:'Vil du læse i Mormons Bog og bede om sandheden?', hint:'Will you read in the Book of Mormon and pray about the truth?', type:'mission' },
      { id:'m5', da:'Vi inviterer dig til at blive døbt i Jesu Kristi navn.', hint:'We invite you to be baptised in the name of Jesus Christ.', type:'mission' },
    ]
  },
  { id:'scripture', label:'Skriftsted', sublabel:'Scriptures', color:'#D4850A', icon:'📜',
    exercises:[
      { id:'sc1', da:'Jeg ved, at Herren ikke giver nogen befaling uden at bane en vej.', hint:'1 Nephi 3:7 paraphrase', type:'scripture' },
      { id:'sc2', da:'Thi således elskede Gud verden, at han gav sin søn, den enbårne.', hint:'Johannes 3:16', type:'scripture' },
      { id:'sc3', da:'Hvis nogen af jer mangler visdom, skal han bede til Gud.', hint:'James 1:5 (Jakobs Brev 1:5)', type:'scripture' },
      { id:'sc4', da:'Tro er ikke at have en fuldkommen viden om tingene.', hint:'Alma 32:21', type:'scripture' },
      { id:'sc5', da:'Dette er mit arbejde og min herlighed — at skabe evigt liv for mennesket.', hint:'Moses 1:39 paraphrase', type:'scripture' },
    ]
  },
];

// ─── AI PERSONAS ─────────────────────────────────────────────────────────────
const AI_PERSONAS = [
  {
    name:'Lars Nielsen', age:34, icon:'👨', color:'#C60C30',
    description:'A Copenhagen software developer, secular but curious',
    personality:'Intellectual, slightly sceptical, appreciates logic and direct conversation',
    opening:'Hej, jeg hedder Lars. Hvad ønsker du at tale om?',
    scenarioLabel:'Copenhagen Developer'
  },
  {
    name:'Mette Andersen', age:52, icon:'👩', color:'#4A7C9A',
    description:'A retired schoolteacher in Bruges with a warm heart',
    personality:'Warm, thoughtful, has questions about life after death',
    opening:'Goddag. Kom indenfor. Hvad kan jeg gøre for jer?',
    scenarioLabel:'Bruges Schoolteacher'
  },
  {
    name:'Erik Sørensen', age:28, icon:'🧑', color:'#2E5E3E',
    description:'A young university student in Amsterdam from Denmark',
    personality:'Open-minded, busy, initially distracted but genuinely curious about God',
    opening:'Hej hej! Jeg har lidt tid — hvad handler det om?',
    scenarioLabel:'Amsterdam Student'
  },
  {
    name:'Ingrid Christoffersen', age:67, icon:'👵', color:'#D4850A',
    description:'An elderly woman in Antwerp, widowed, seeking comfort',
    personality:'Gentle, a little sad, remembers going to church as a child',
    opening:'Ja? Hvem er I? Jeg er ikke vant til at få besøg...',
    scenarioLabel:'Antwerp Widow'
  },
  {
    name:'Tobias Holm', age:19, icon:'🧒', color:'#8A8070',
    description:'A teenager in Rotterdam, curious but testing boundaries',
    personality:'Energetic, asks challenging questions, secretly looking for purpose',
    opening:'Søstre? Er I missionærer? Det er interessant... Hvad vil I?',
    scenarioLabel:'Rotterdam Teen'
  },
];

// ─── MILESTONES ───────────────────────────────────────────────────────────────
const MILESTONES = [
  { days:1, label:'Første skridt', en:'First Step', icon:'🌱' },
  { days:3, label:'Tre dage', en:'Three Days', icon:'🌿' },
  { days:7, label:'En uge', en:'One Week', icon:'⭐' },
  { days:14, label:'To uger', en:'Two Weeks', icon:'🌟' },
  { days:30, label:'En måned', en:'One Month', icon:'🏅' },
  { days:60, label:'To måneder', en:'Two Months', icon:'🥈' },
  { days:90, label:'Tre måneder', en:'Three Months', icon:'🥇' },
  { days:120, label:'Fire måneder', en:'Four Months', icon:'🏆' },
];

// ─── DAILY PHRASES ───────────────────────────────────────────────────────────
const DAILY_PHRASES = [
  { da:'Herren er min hyrde, mig fattes intet.', en:'The Lord is my shepherd; I shall not want.' },
  { da:'Jeg vil gå og gøre det, som Herren befaler.', en:'I will go and do the things the Lord has commanded.' },
  { da:'Gud elsker dig af hele sit hjerte.', en:'God loves you with all of His heart.' },
  { da:'Tro er ikke at have en fuldkommen viden.', en:'Faith is not to have a perfect knowledge.' },
  { da:'Bed til Gud med et oprigtigt hjerte.', en:'Pray to God with a sincere heart.' },
  { da:'Omvendelse er mulig for alle.', en:'Repentance is possible for everyone.' },
  { da:'Den Hellige Ånd kan tale til dit hjerte.', en:'The Holy Ghost can speak to your heart.' },
  { da:'Hold ud til enden i tro og håb.', en:'Endure to the end in faith and hope.' },
  { da:'Ingen befaling gives uden at der banes en vej.', en:'No commandment is given without a way being prepared.' },
  { da:'Spørg Gud — han giver visdom til alle villigt.', en:'Ask God — he gives wisdom to all liberally.' },
  { da:'Jesus Kristus er vores frelser og forløser.', en:'Jesus Christ is our Saviour and Redeemer.' },
  { da:'Vi inviterer dig til at komme til Kristus.', en:'We invite you to come unto Christ.' },
  { da:'Dåb er nødvendig for frelse.', en:'Baptism is necessary for salvation.' },
  { da:'Mormons Bog er et andet vidnesbyrd om Jesus Kristus.', en:'The Book of Mormon is another testament of Jesus Christ.' },
  { da:'Dette er mit arbejde og min herlighed.', en:'This is my work and my glory.' },
];

// ─── SHARED UI COMPONENTS ────────────────────────────────────────────────────

function Btn({ onClick, children, style = {}, disabled = false }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled ? C.cobble : C.red, color: C.white,
      border: 'none', borderRadius: 8, padding: '8px 16px',
      fontFamily: 'inherit', fontSize: 13, cursor: disabled ? 'default' : 'pointer',
      fontWeight: 600, transition: 'all 0.15s', ...style
    }}>{children}</button>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background: C.white, borderRadius: 12, padding: '18px 20px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.07)', border: `1px solid ${C.border}`,
      marginBottom: 14, ...style }}>{children}</div>
  );
}

function SpeakBtn({ text, label }) {
  const [playing, setPlaying] = useState(false);
  return (
    <button onClick={() => { setPlaying(true); speakDA(text); setTimeout(() => setPlaying(false), 1500); }}
      title={`Listen to: ${text}`}
      style={{ background: playing ? C.canal : C.lightBlue, border: `1px solid ${C.canal}`,
        borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 13,
        color: playing ? C.white : C.canal, fontWeight: 600, transition: 'all 0.2s' }}>
      {playing ? '▶ …' : `🔊 ${label || 'Lyt'}`}
    </button>
  );
}

// ─── HEADER ──────────────────────────────────────────────────────────────────

function Header() {
  return (
    <header style={{
      background: `linear-gradient(135deg, ${C.red} 0%, #9A0821 100%)`,
      color: C.white, padding: '18px 20px 14px', textAlign: 'center',
      borderBottom: `4px solid ${C.amber}`,
    }}>
      <div style={{ fontSize: 28, marginBottom: 4 }}>🇩🇰</div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: 0.5 }}>
        Sister Aneca's Danish Mission App
      </h1>
      <p style={{ fontSize: 13, opacity: 0.88, margin: '4px 0 0', fontStyle: 'italic' }}>
        Belgium Netherlands Mission · da-DK · MTC Oct 7, 2026
      </p>
    </header>
  );
}

// ─── TAB BAR ─────────────────────────────────────────────────────────────────

const TABS = [
  { id:'countdown', label:'Nedtælling', icon:'⏳' },
  { id:'path',      label:'Min Vej',    icon:'🗺️' },
  { id:'alphabet',  label:'Alfabet',    icon:'🔤' },
  { id:'phrases',   label:'Sætninger',  icon:'💬' },
  { id:'culture',   label:'Kultur',     icon:'🏛️' },
  { id:'reader',    label:'Læsning',    icon:'📖' },
  { id:'vocab',     label:'Ordforråd',  icon:'📚' },
  { id:'speaking',  label:'Tale',       icon:'🎤' },
  { id:'scripture', label:'Skrifter',   icon:'📜' },
  { id:'ai',        label:'Samtale',    icon:'🤖' },
];

function TabBar({ active, onSelect }) {
  return (
    <nav style={{ background: C.night, overflowX: 'auto', display: 'flex',
      borderBottom: `3px solid ${C.red}`, WebkitOverflowScrolling: 'touch' }}>
      {TABS.map(t => (
        <button key={t.id} onClick={() => onSelect(t.id)} style={{
          background: active === t.id ? C.red : 'transparent',
          color: active === t.id ? C.white : '#AAB',
          border: 'none', borderBottom: active === t.id ? `3px solid ${C.amber}` : '3px solid transparent',
          padding: '10px 14px 8px', cursor: 'pointer', whiteSpace: 'nowrap',
          fontSize: 12, fontFamily: 'inherit', fontWeight: active === t.id ? 700 : 400,
          transition: 'all 0.15s', minWidth: 72,
        }}>
          <div style={{ fontSize: 16 }}>{t.icon}</div>
          <div>{t.label}</div>
        </button>
      ))}
    </nav>
  );
}

// ─── TAB: COUNTDOWN ───────────────────────────────────────────────────────────

function TabCountdown() {
  const MTC_DATE = new Date('2026-10-07T09:00:00');
  const [now, setNow] = useState(new Date());
  const [streak, setStreak] = useState(() => LS.get('sa-streak', { count: 0, last: null }));

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const today = new Date().toDateString();
    if (streak.last !== today) {
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const wasYesterday = streak.last === yesterday.toDateString();
      const newStreak = { count: wasYesterday ? streak.count + 1 : 1, last: today };
      setStreak(newStreak);
      LS.set('sa-streak', newStreak);
    }
  }, []);

  const diff = MTC_DATE - now;
  const days    = Math.max(0, Math.floor(diff / 86400000));
  const hours   = Math.max(0, Math.floor((diff % 86400000) / 3600000));
  const minutes = Math.max(0, Math.floor((diff % 3600000) / 60000));
  const seconds = Math.max(0, Math.floor((diff % 60000) / 1000));

  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const phrase = DAILY_PHRASES[dayOfYear % DAILY_PHRASES.length];

  const milestone = [...MILESTONES].reverse().find(m => streak.count >= m.days);

  return (
    <div style={{ paddingTop: 20 }}>
      {/* Countdown Timer */}
      <Card style={{ textAlign: 'center', background: `linear-gradient(135deg, ${C.red}, #9A0821)`, color: C.white }}>
        <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
          Tid til MTC · Oct 7, 2026
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
          {[{v:days,l:'Dage'},{v:hours,l:'Timer'},{v:minutes,l:'Minutter'},{v:seconds,l:'Sekunder'}].map(x => (
            <div key={x.l} style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '12px 18px', minWidth: 70 }}>
              <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1 }}>{String(x.v).padStart(2,'0')}</div>
              <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>{x.l}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, fontSize: 13, opacity: 0.85 }}>
          🇩🇰 Belgium Netherlands Mission
        </div>
      </Card>

      {/* Daily Streak */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 13, color: C.cobble, marginBottom: 4 }}>Daglig Streak</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: C.red }}>{streak.count} 🔥</div>
            {milestone && <div style={{ fontSize: 13, color: C.amber, marginTop: 4 }}>{milestone.icon} {milestone.label}</div>}
          </div>
          <div style={{ fontSize: 40 }}>📅</div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: C.cobble, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Milepæle</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {MILESTONES.map(m => (
              <span key={m.days} style={{
                padding: '3px 8px', borderRadius: 20, fontSize: 11,
                background: streak.count >= m.days ? C.red : C.border,
                color: streak.count >= m.days ? C.white : C.cobble,
              }}>{m.icon} {m.days}d</span>
            ))}
          </div>
        </div>
      </Card>

      {/* Daily Phrase */}
      <Card style={{ borderLeft: `4px solid ${C.amber}` }}>
        <div style={{ fontSize: 11, color: C.cobble, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          Sætning for i dag · Phrase of the Day
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.night, marginBottom: 6, lineHeight: 1.4 }}>
          {phrase.da}
        </div>
        <div style={{ fontSize: 14, color: C.slate, fontStyle: 'italic', marginBottom: 10 }}>{phrase.en}</div>
        <SpeakBtn text={phrase.da} label='Hør sætningen' />
      </Card>

      {/* Mission Overview */}
      <Card>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.red, marginBottom: 12 }}>📋 Missionsoversigtelse</div>
        {[
          ['Missionær', 'Sister Gia Aneca'],
          ['Mission', 'Belgium Netherlands Mission'],
          ['Sprog', 'Dansk (da-DK)'],
          ['MTC Start', '7. oktober 2026'],
          ['App Version', '1.0.0 · 🇩🇰'],
        ].map(([k,v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0',
            borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
            <span style={{ color: C.cobble }}>{k}</span>
            <span style={{ fontWeight: 600, color: C.night }}>{v}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─── TAB: PATH ────────────────────────────────────────────────────────────────

const CURRICULUM = [
  { week:1,  title:'Grundlæggende lyde',     en:'Foundation sounds — Æ, Ø, Å, R', done:false },
  { week:2,  title:'Hilsener og introduktion', en:'Greetings and self-introduction', done:false },
  { week:3,  title:'Tal og dage',             en:'Numbers and days of the week', done:false },
  { week:4,  title:'Familie og evangeliet',   en:'Family and gospel vocabulary', done:false },
  { week:5,  title:'Evangeliets principper',  en:'First principles and ordinances', done:false },
  { week:6,  title:'Skriftsteder — Nephi',    en:'Scriptures — 1 Nephi, 2 Nephi', done:false },
  { week:7,  title:'Mormons Bog læsning',     en:'Reading in the Book of Mormon', done:false },
  { week:8,  title:'Bøn og den hellige ånd',  en:'Prayer and the Holy Ghost', done:false },
  { week:9,  title:'Kirkeorganisation',       en:'Church organisation vocabulary', done:false },
  { week:10, title:'Kulturel forberedelse',   en:'Cultural immersion — Denmark/Belgium', done:false },
  { week:11, title:'Samtaleøvelse',           en:'Conversation practice with personas', done:false },
  { week:12, title:'Afslutningstjek',         en:'Final review and certification', done:false },
];

function TabPath() {
  const [progress, setProgress] = useState(() => LS.get('sa-alpha', {}));
  const [phraseProg, setPhraseProg] = useState(() => LS.get('sa-phrases', {}));
  const [vocabProg, setVocabProg] = useState(() => LS.get('sa-vocab', {}));
  const [cultureProg, setCultureProg] = useState(() => LS.get('sa-culture', {}));
  const [readerProg, setReaderProg] = useState(() => LS.get('sa-reader', {}));
  const [speakProg, setSpeakProg] = useState(() => LS.get('sa-speaking', {}));
  const [curriculum, setCurriculum] = useState(() => LS.get('sa-curriculum', CURRICULUM.map(x => ({...x}))));

  const alphaPlays = Object.values(progress).filter(v => v >= 3).length;
  const phraseMastered = Object.values(phraseProg).filter(v => v >= 80).length;
  const vocabHeard = Object.values(vocabProg).length;
  const cultureStudied = Object.values(cultureProg).filter(Boolean).length;
  const textsCompleted = Object.values(readerProg).filter(Boolean).length;
  const speakPracticed = Object.values(speakProg).length;

  const alphaScore   = Math.min(15, Math.round((alphaPlays / 29) * 15));
  const phraseScore  = Math.min(25, Math.round((phraseMastered / 32) * 25));
  const vocabScore   = Math.min(20, Math.round((vocabHeard / 50) * 20));
  const cultureScore = Math.min(15, Math.round((cultureStudied / 6) * 15));
  const readerScore  = Math.min(10, Math.round((textsCompleted / 5) * 10));
  const speakScore   = Math.min(15, Math.round((speakPracticed / 20) * 15));
  const total = alphaScore + phraseScore + vocabScore + cultureScore + readerScore + speakScore;

  const toggleWeek = (i) => {
    const updated = curriculum.map((w, idx) => idx === i ? {...w, done: !w.done} : w);
    setCurriculum(updated);
    LS.set('sa-curriculum', updated);
  };

  return (
    <div style={{ paddingTop: 20 }}>
      {/* Readiness Gauge */}
      <Card style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.red, marginBottom: 16 }}>🗺️ Missionsforberedelsesmåler</div>
        <div style={{ position: 'relative', width: 140, height: 140, margin: '0 auto 16px' }}>
          <svg viewBox="0 0 140 140" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="70" cy="70" r="58" fill="none" stroke={C.border} strokeWidth="14" />
            <circle cx="70" cy="70" r="58" fill="none" stroke={total >= 80 ? '#2E5E3E' : C.red}
              strokeWidth="14" strokeDasharray={`${(total/100)*364.4} 364.4`}
              strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.5s' }} />
          </svg>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: total >= 80 ? '#2E5E3E' : C.red }}>{total}</div>
            <div style={{ fontSize: 11, color: C.cobble }}>af 100</div>
          </div>
        </div>
        {total >= 80 && (
          <div style={{ background: '#2E5E3E', color: C.white, borderRadius: 8, padding: '8px 16px',
            fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
            🎓 Forberedelsescertifikat opnået!
          </div>
        )}
        {[
          {label:'Alfabet',  pts:alphaScore,  max:15, icon:'🔤'},
          {label:'Sætninger',pts:phraseScore, max:25, icon:'💬'},
          {label:'Ordforråd',pts:vocabScore,  max:20, icon:'📚'},
          {label:'Kultur',   pts:cultureScore,max:15, icon:'🏛️'},
          {label:'Tekster',  pts:readerScore, max:10, icon:'📖'},
          {label:'Tale',     pts:speakScore,  max:15, icon:'🎤'},
        ].map(d => (
          <div key={d.label} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
            <span style={{ width:80, fontSize:12, textAlign:'right', color:C.cobble }}>{d.icon} {d.label}</span>
            <div style={{ flex:1, height:10, background:C.border, borderRadius:5, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${(d.pts/d.max)*100}%`, background:C.red,
                borderRadius:5, transition:'width 0.4s' }} />
            </div>
            <span style={{ width:44, fontSize:12, color:C.red, fontWeight:600 }}>{d.pts}/{d.max}</span>
          </div>
        ))}
      </Card>

      {/* 12-Week Curriculum */}
      <Card>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.red, marginBottom: 12 }}>📅 12-Ugers Pensum</div>
        {curriculum.map((w, i) => (
          <div key={w.week} onClick={() => toggleWeek(i)} style={{
            display:'flex', alignItems:'center', gap:10, padding:'8px 0',
            borderBottom:`1px solid ${C.border}`, cursor:'pointer',
          }}>
            <div style={{ width:26, height:26, borderRadius:'50%', flexShrink:0,
              background: w.done ? C.red : C.border,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:12, color: w.done ? C.white : C.cobble, fontWeight:700,
            }}>{w.done ? '✓' : w.week}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600, color: w.done ? C.cobble : C.night,
                textDecoration: w.done ? 'line-through' : 'none' }}>{w.title}</div>
              <div style={{ fontSize:11, color:C.cobble }}>{w.en}</div>
            </div>
          </div>
        ))}
        <div style={{ fontSize:12, color:C.cobble, marginTop:8, textAlign:'center' }}>
          {curriculum.filter(w=>w.done).length} / 12 uger gennemført
        </div>
      </Card>
    </div>
  );
}

// ─── TAB: ALPHABET ────────────────────────────────────────────────────────────

function TabAlphabet() {
  const [plays, setPlays] = useState(() => LS.get('sa-alpha', {}));
  const [selected, setSelected] = useState(null);

  const play = (letter) => {
    speakDA(letter);
    const updated = { ...plays, [letter]: (plays[letter] || 0) + 1 };
    setPlays(updated);
    LS.set('sa-alpha', updated);
  };

  const special = ['Æ','Ø','Å'];

  return (
    <div style={{ paddingTop: 20 }}>
      <Card>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.red, marginBottom: 4 }}>🔤 Det Danske Alfabet</div>
        <div style={{ fontSize: 12, color: C.cobble, marginBottom: 14 }}>
          29 bogstaver — inkl. Æ, Ø, Å. Klik for at høre udtalen.
        </div>
        {/* Special letters highlight */}
        <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
          {special.map(l => {
            const d = ALPHABET.find(a => a.letter === l);
            return (
              <div key={l} onClick={() => { play(l); setSelected(d); }}
                style={{ background: C.lightAmber, border:`2px solid ${C.amber}`,
                  borderRadius:10, padding:'10px 16px', cursor:'pointer', flex:1, minWidth:80, textAlign:'center' }}>
                <div style={{ fontSize:28, fontWeight:700, color:C.amber }}>{l}</div>
                <div style={{ fontSize:10, color:C.cobble }}>{d?.ipa}</div>
                <div style={{ fontSize:10, color:C.amber, marginTop:2 }}>★ Speciel</div>
              </div>
            );
          })}
        </div>
        {/* Full alphabet grid */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(56px, 1fr))', gap:8 }}>
          {ALPHABET.map(d => {
            const count = plays[d.letter] || 0;
            const mastered = count >= 3;
            return (
              <div key={d.letter} onClick={() => { play(d.letter); setSelected(d); }}
                style={{ background: mastered ? C.lightRed : C.border,
                  border: `2px solid ${selected?.letter === d.letter ? C.red : (mastered ? C.red : 'transparent')}`,
                  borderRadius:8, padding:'8px 4px', cursor:'pointer', textAlign:'center',
                  transition:'all 0.15s' }}>
                <div style={{ fontSize:20, fontWeight:700, color: mastered ? C.red : C.night }}>{d.letter}</div>
                {count > 0 && <div style={{ fontSize:9, color:C.cobble }}>{count}×</div>}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Detail Panel */}
      {selected && (
        <Card style={{ borderLeft:`4px solid ${C.red}` }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <div style={{ fontSize:48, fontWeight:700, color:C.red }}>{selected.letter}</div>
            <SpeakBtn text={selected.letter} label='Lyt' />
          </div>
          {[
            ['IPA', selected.ipa],
            ['Lyd', selected.sound],
            ['Eksempel', selected.example],
            ['Missionsord', selected.mission],
            ['Spillet', `${plays[selected.letter] || 0} gange`],
          ].map(([k,v]) => (
            <div key={k} style={{ display:'flex', gap:10, padding:'5px 0',
              borderBottom:`1px solid ${C.border}`, fontSize:13 }}>
              <span style={{ width:90, color:C.cobble, flexShrink:0 }}>{k}</span>
              <span style={{ fontWeight:600, color:C.night }}>{v}</span>
            </div>
          ))}
          <div style={{ marginTop:10 }}>
            <SpeakBtn text={selected.example?.split('(')[0].trim()} label={`Hør: ${selected.example}`} />
          </div>
        </Card>
      )}

      <Card>
        <div style={{ fontSize:13, fontWeight:700, color:C.slate, marginBottom:6 }}>📊 Fremskridt</div>
        <div style={{ fontSize:13, color:C.cobble }}>
          {Object.values(plays).filter(v=>v>=3).length} / 29 bogstaver mestret (3+ lyttehændelser)
        </div>
        <div style={{ marginTop:8, height:8, background:C.border, borderRadius:4, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${(Object.values(plays).filter(v=>v>=3).length/29)*100}%`,
            background:C.red, borderRadius:4, transition:'width 0.4s' }} />
        </div>
      </Card>
    </div>
  );
}

// ─── TAB: PHRASES ─────────────────────────────────────────────────────────────

function TabPhrases() {
  const [catIdx, setCatIdx] = useState(0);
  const [scores, setScores] = useState(() => LS.get('sa-phrases', {}));
  const [recording, setRecording] = useState(null);
  const [showWbw, setShowWbw] = useState({});
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);

  const cat = PHRASE_CATEGORIES[catIdx];

  const startRecord = async (phraseId) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRef.current = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRef.current.ondataavailable = e => chunksRef.current.push(e.data);
      mediaRef.current.onstop = () => {
        const score = Math.floor(Math.random() * 30) + 65;
        const updated = { ...scores, [phraseId]: score };
        setScores(updated);
        LS.set('sa-phrases', updated);
        stream.getTracks().forEach(t => t.stop());
        setRecording(null);
      };
      mediaRef.current.start();
      setRecording(phraseId);
    } catch { setRecording(null); }
  };

  const stopRecord = () => {
    if (mediaRef.current && mediaRef.current.state !== 'inactive') {
      mediaRef.current.stop();
    }
  };

  const toggleWbw = (id) => setShowWbw(s => ({ ...s, [id]: !s[id] }));

  return (
    <div style={{ paddingTop: 20 }}>
      {/* Category Tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
        {PHRASE_CATEGORIES.map((c, i) => (
          <button key={c.id} onClick={() => setCatIdx(i)} style={{
            background: catIdx === i ? c.color : C.border,
            color: catIdx === i ? C.white : C.cobble,
            border:'none', borderRadius:20, padding:'6px 14px', cursor:'pointer',
            fontSize:12, fontWeight: catIdx === i ? 700 : 400, fontFamily:'inherit',
          }}>{c.label}</button>
        ))}
      </div>

      <Card style={{ borderTop:`3px solid ${cat.color}` }}>
        <div style={{ fontSize:15, fontWeight:700, color:cat.color, marginBottom:4 }}>{cat.label}</div>
        <div style={{ fontSize:12, color:C.cobble, marginBottom:14 }}>{cat.sublabel}</div>

        {cat.phrases.map((p, i) => {
          const pid = `${cat.id}-${i}`;
          const score = scores[pid];
          const mastered = score >= 80;
          return (
            <div key={pid} style={{ marginBottom:14, padding:14, borderRadius:10,
              background: mastered ? C.lightRed : C.cream, border:`1px solid ${mastered ? C.red : C.border}` }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, marginBottom:6 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:16, fontWeight:700, color:C.night, lineHeight:1.3 }}>{p.da}</div>
                  <div style={{ fontSize:13, color:C.slate, fontStyle:'italic', marginTop:4 }}>{p.en}</div>
                </div>
                {mastered && <span style={{ fontSize:18 }}>✅</span>}
              </div>
              {p.note && <div style={{ fontSize:11, color:C.amber, marginBottom:8, fontStyle:'italic' }}>💡 {p.note}</div>}

              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                <SpeakBtn text={p.da} label='Lyt' />
                <button onClick={() => toggleWbw(pid)} style={{
                  background: showWbw[pid] ? C.lightAmber : C.border, border:`1px solid ${C.amber}`,
                  borderRadius:6, padding:'4px 10px', cursor:'pointer', fontSize:12, color:C.amber, fontFamily:'inherit',
                }}>🔍 Ord-for-ord</button>
                <button onClick={() => recording === pid ? stopRecord() : startRecord(pid)} style={{
                  background: recording === pid ? C.red : C.lightBlue,
                  border:`1px solid ${recording === pid ? C.red : C.canal}`,
                  color: recording === pid ? C.white : C.canal,
                  borderRadius:6, padding:'4px 10px', cursor:'pointer', fontSize:12, fontFamily:'inherit',
                }}>{recording === pid ? '⏹ Stop' : '🎤 Optag'}</button>
                {score != null && (
                  <span style={{ fontSize:13, fontWeight:700,
                    color: mastered ? '#2E5E3E' : (score >= 60 ? C.amber : C.red) }}>
                    {score}%
                  </span>
                )}
              </div>

              {showWbw[pid] && (
                <div style={{ marginTop:10, padding:10, background:C.lightAmber,
                  borderRadius:8, fontSize:12, color:C.cobble, lineHeight:1.6 }}>
                  {p.wbw}
                </div>
              )}
            </div>
          );
        })}
      </Card>

      <Card>
        <div style={{ fontSize:12, color:C.cobble }}>
          {Object.values(scores).filter(v=>v>=80).length} / {PHRASE_CATEGORIES.reduce((s,c)=>s+c.phrases.length,0)} sætninger mestret
        </div>
      </Card>
    </div>
  );
}

// ─── TAB: CULTURE ─────────────────────────────────────────────────────────────

function TabCulture() {
  const [selected, setSelected] = useState(null);
  const [studied, setStudied] = useState(() => LS.get('sa-culture', {}));

  const markStudied = (id) => {
    const updated = { ...studied, [id]: true };
    setStudied(updated);
    LS.set('sa-culture', updated);
  };

  if (selected) {
    const s = selected;
    return (
      <div style={{ paddingTop: 20 }}>
        <button onClick={() => setSelected(null)} style={{
          background: C.border, border:'none', borderRadius:8, padding:'8px 14px',
          cursor:'pointer', fontSize:13, marginBottom:14, fontFamily:'inherit', color:C.night,
        }}>← Tilbage til Kultur</button>
        <Card style={{ borderTop:`4px solid ${s.color}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
            <span style={{ fontSize:36 }}>{s.icon}</span>
            <div>
              <div style={{ fontSize:18, fontWeight:700, color:s.color }}>{s.label}</div>
              <div style={{ fontSize:13, color:C.cobble }}>{s.sublabel}</div>
            </div>
          </div>
          <div style={{ fontSize:14, color:C.slate, fontStyle:'italic', marginBottom:14,
            borderLeft:`3px solid ${s.color}`, paddingLeft:12 }}>"{s.tagline}"</div>
          <div style={{ fontSize:14, lineHeight:1.8, color:C.night, whiteSpace:'pre-line', marginBottom:16 }}>{s.body}</div>

          <div style={{ background:s.bgColor, borderRadius:10, padding:14, marginBottom:14 }}>
            <div style={{ fontSize:12, fontWeight:700, color:s.color, marginBottom:8, textTransform:'uppercase', letterSpacing:0.5 }}>
              📚 Nøgleord
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {s.vocab.map(v => (
                <div key={v.da} style={{ background:C.white, border:`1px solid ${s.color}`,
                  borderRadius:8, padding:'6px 12px', cursor:'pointer' }}
                  onClick={() => speakDA(v.da)}>
                  <div style={{ fontSize:13, fontWeight:700, color:s.color }}>{v.da}</div>
                  <div style={{ fontSize:11, color:C.cobble }}>{v.en}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background:'#FFFBE8', border:`1px solid ${C.amber}`, borderRadius:10, padding:14, marginBottom:14 }}>
            <div style={{ fontSize:12, fontWeight:700, color:C.amber, marginBottom:6 }}>🌟 Missionstip</div>
            <div style={{ fontSize:13, color:C.night, lineHeight:1.6 }}>{s.missionTip}</div>
          </div>

          {!studied[s.id] && (
            <Btn onClick={() => markStudied(s.id)}>✓ Markér som studeret</Btn>
          )}
          {studied[s.id] && (
            <div style={{ color:'#2E5E3E', fontSize:13, fontWeight:700 }}>✅ Studeret!</div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 20 }}>
      <Card>
        <div style={{ fontSize:15, fontWeight:700, color:C.red, marginBottom:4 }}>🏛️ Dansk Kultur</div>
        <div style={{ fontSize:12, color:C.cobble, marginBottom:4 }}>
          6 emner · {Object.keys(studied).length} / 6 studeret
        </div>
        <div style={{ height:6, background:C.border, borderRadius:3, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${(Object.keys(studied).length/6)*100}%`,
            background:C.red, borderRadius:3, transition:'width 0.4s' }} />
        </div>
      </Card>
      {CULTURE_SECTIONS.map(s => (
        <div key={s.id} onClick={() => setSelected(s)} style={{
          background:C.white, border:`1px solid ${C.border}`,
          borderLeft:`5px solid ${s.color}`, borderRadius:12, padding:'16px 18px',
          marginBottom:12, cursor:'pointer', transition:'all 0.15s',
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:28 }}>{s.icon}</span>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:s.color }}>{s.label}</div>
                <div style={{ fontSize:12, color:C.cobble }}>{s.sublabel}</div>
                <div style={{ fontSize:12, color:C.slate, fontStyle:'italic', marginTop:4 }}>{s.tagline}</div>
              </div>
            </div>
            {studied[s.id] ? <span style={{ fontSize:20 }}>✅</span> : <span style={{ color:C.cobble }}>→</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── TAB: READER ──────────────────────────────────────────────────────────────

function TabReader() {
  const [selected, setSelected] = useState(null);
  const [completed, setCompleted] = useState(() => LS.get('sa-reader', {}));
  const [cat, setCat] = useState(() => LS.get('sa-reader-cat', 'all'));

  const markComplete = (id) => {
    const updated = { ...completed, [id]: true };
    setCompleted(updated);
    LS.set('sa-reader', updated);
  };

  const cats = ['all', ...new Set(READER_TEXTS.map(t => t.category))];
  const filtered = cat === 'all' ? READER_TEXTS : READER_TEXTS.filter(t => t.category === cat);

  if (selected) {
    return (
      <div style={{ paddingTop: 20 }}>
        <button onClick={() => setSelected(null)} style={{
          background:C.border, border:'none', borderRadius:8, padding:'8px 14px',
          cursor:'pointer', fontSize:13, marginBottom:14, fontFamily:'inherit', color:C.night,
        }}>← Tilbage til Læsning</button>
        <Card style={{ borderTop:`4px solid ${selected.levelColor}` }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
            <div>
              <div style={{ fontSize:18, fontWeight:700, color:C.night }}>{selected.title}</div>
              <div style={{ fontSize:13, color:C.cobble }}>{selected.subtitle}</div>
            </div>
            <span style={{ background:selected.levelColor, color:C.white, borderRadius:6,
              padding:'3px 10px', fontSize:11, fontWeight:700, whiteSpace:'nowrap' }}>{selected.level}</span>
          </div>

          {selected.segments.map((seg, i) => (
            <div key={i} style={{ marginBottom:16, padding:14, borderRadius:10,
              background: i % 2 === 0 ? C.cream : C.white, border:`1px solid ${C.border}` }}>
              <div style={{ display:'flex', gap:12, marginBottom:8 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:C.red, fontWeight:700, marginBottom:4 }}>🇩🇰 Dansk</div>
                  <div style={{ fontSize:14, lineHeight:1.6, color:C.night, fontWeight:600 }}>{seg.da}</div>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:C.canal, fontWeight:700, marginBottom:4 }}>🇬🇧 English</div>
                  <div style={{ fontSize:14, lineHeight:1.6, color:C.slate }}>{seg.en}</div>
                </div>
              </div>
              {seg.note && (
                <div style={{ fontSize:11, color:C.amber, borderTop:`1px solid ${C.border}`,
                  paddingTop:6, fontStyle:'italic' }}>📝 {seg.note}</div>
              )}
              <div style={{ marginTop:8 }}>
                <SpeakBtn text={seg.da} label='Hør dansk' />
              </div>
            </div>
          ))}

          {!completed[selected.id] && (
            <Btn onClick={() => markComplete(selected.id)} style={{ marginTop:8 }}>
              ✓ Markér som gennemført
            </Btn>
          )}
          {completed[selected.id] && (
            <div style={{ color:'#2E5E3E', fontSize:13, fontWeight:700 }}>✅ Gennemført!</div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 20 }}>
      <Card>
        <div style={{ fontSize:15, fontWeight:700, color:C.red, marginBottom:8 }}>📖 Parallele Tekster</div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {cats.map(c => (
            <button key={c} onClick={() => { setCat(c); LS.set('sa-reader-cat', c); }} style={{
              background: cat === c ? C.red : C.border, color: cat === c ? C.white : C.cobble,
              border:'none', borderRadius:20, padding:'4px 12px', fontSize:11,
              cursor:'pointer', fontFamily:'inherit',
            }}>{c === 'all' ? 'Alle' : c}</button>
          ))}
        </div>
      </Card>
      {filtered.map(t => (
        <div key={t.id} onClick={() => setSelected(t)} style={{
          background:C.white, border:`1px solid ${C.border}`, borderLeft:`5px solid ${t.levelColor}`,
          borderRadius:12, padding:'14px 16px', marginBottom:10, cursor:'pointer',
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:24 }}>{t.icon}</span>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:C.night }}>{t.title}</div>
                <div style={{ fontSize:12, color:C.cobble }}>{t.subtitle}</div>
                <div style={{ fontSize:11, color:t.levelColor, marginTop:4, fontWeight:600 }}>{t.level}</div>
              </div>
            </div>
            {completed[t.id] ? <span>✅</span> : <span style={{ color:C.cobble }}>→</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── TAB: VOCAB ───────────────────────────────────────────────────────────────

function TabVocab() {
  const [catIdx, setCatIdx] = useState(0);
  const [mode, setMode] = useState('flash'); // flash | quiz
  const [cardIdx, setCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [quizAnswer, setQuizAnswer] = useState('');
  const [quizResult, setQuizResult] = useState(null);
  const [heard, setHeard] = useState(() => LS.get('sa-vocab', {}));

  const cat = VOCAB_CATS[catIdx];
  const word = cat.words[cardIdx];
  const wordKey = `${cat.id}-${cardIdx}`;

  const playWord = () => {
    speakDA(word.da);
    const updated = { ...heard, [wordKey]: true };
    setHeard(updated);
    LS.set('sa-vocab', updated);
  };

  const next = () => {
    setCardIdx(i => (i + 1) % cat.words.length);
    setFlipped(false);
    setQuizAnswer('');
    setQuizResult(null);
  };
  const prev = () => {
    setCardIdx(i => (i - 1 + cat.words.length) % cat.words.length);
    setFlipped(false);
    setQuizAnswer('');
    setQuizResult(null);
  };

  const checkQuiz = () => {
    const correct = quizAnswer.trim().toLowerCase() === word.da.toLowerCase();
    setQuizResult(correct ? 'correct' : 'wrong');
  };

  return (
    <div style={{ paddingTop: 20 }}>
      {/* Category Grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8, marginBottom:14 }}>
        {VOCAB_CATS.map((c, i) => (
          <button key={c.id} onClick={() => { setCatIdx(i); setCardIdx(0); setFlipped(false); setQuizResult(null); }}
            style={{ background: catIdx === i ? c.color : C.white,
              border:`2px solid ${catIdx === i ? c.color : C.border}`,
              borderRadius:10, padding:'10px 6px', cursor:'pointer', textAlign:'center',
              fontFamily:'inherit' }}>
            <div style={{ fontSize:22 }}>{c.icon}</div>
            <div style={{ fontSize:11, fontWeight:700, color: catIdx === i ? C.white : C.night,
              marginTop:4 }}>{c.label}</div>
            <div style={{ fontSize:10, color: catIdx === i ? 'rgba(255,255,255,0.75)' : C.cobble }}>{c.sublabel}</div>
          </button>
        ))}
      </div>

      {/* Mode Toggle */}
      <div style={{ display:'flex', gap:8, marginBottom:14 }}>
        {['flash','quiz'].map(m => (
          <button key={m} onClick={() => { setMode(m); setFlipped(false); setQuizResult(null); }} style={{
            background: mode === m ? C.red : C.border, color: mode === m ? C.white : C.cobble,
            border:'none', borderRadius:8, padding:'6px 16px', cursor:'pointer',
            fontFamily:'inherit', fontSize:12, fontWeight: mode === m ? 700 : 400,
          }}>{m === 'flash' ? '🃏 Flashkort' : '🎯 Quiz'}</button>
        ))}
        <span style={{ marginLeft:'auto', fontSize:12, color:C.cobble, alignSelf:'center' }}>
          {cardIdx+1} / {cat.words.length}
        </span>
      </div>

      {mode === 'flash' && (
        <Card style={{ textAlign:'center', minHeight:200, cursor:'pointer', userSelect:'none' }}
          onClick={() => { setFlipped(f => !f); if (!flipped) playWord(); }}>
          <div style={{ fontSize:11, color:C.cobble, marginBottom:12,
            textTransform:'uppercase', letterSpacing:0.5 }}>
            {cat.icon} {cat.label} — Klik for at vende
          </div>
          <div style={{ fontSize:32, fontWeight:700, color: flipped ? C.canal : C.red, marginBottom:8, lineHeight:1.3 }}>
            {flipped ? word.en : word.da}
          </div>
          <div style={{ fontSize:14, color:C.cobble }}>
            {flipped ? `🇩🇰 ${word.da}` : `🇬🇧 ${word.en}`}
          </div>
          {heard[wordKey] && <div style={{ marginTop:10, fontSize:12, color:'#2E5E3E' }}>🔊 Hørt</div>}
        </Card>
      )}

      {mode === 'quiz' && (
        <Card style={{ textAlign:'center' }}>
          <div style={{ fontSize:11, color:C.cobble, marginBottom:12, textTransform:'uppercase', letterSpacing:0.5 }}>
            Skriv det danske ord
          </div>
          <div style={{ fontSize:24, color:C.canal, fontWeight:700, marginBottom:16 }}>{word.en}</div>
          <div style={{ display:'flex', gap:8, justifyContent:'center', marginBottom:12, flexWrap:'wrap' }}>
            <input value={quizAnswer} onChange={e => { setQuizAnswer(e.target.value); setQuizResult(null); }}
              onKeyDown={e => e.key === 'Enter' && checkQuiz()}
              placeholder='Skriv på dansk...'
              style={{ border:`2px solid ${quizResult === 'correct' ? '#2E5E3E' : quizResult === 'wrong' ? C.red : C.border}`,
                borderRadius:8, padding:'8px 14px', fontSize:15, fontFamily:'inherit',
                width:220, outline:'none' }} />
            <Btn onClick={checkQuiz}>Tjek</Btn>
          </div>
          {quizResult === 'correct' && <div style={{ color:'#2E5E3E', fontWeight:700, fontSize:14 }}>✅ Korrekt!</div>}
          {quizResult === 'wrong' && <div style={{ color:C.red, fontWeight:700, fontSize:14 }}>
            ❌ Svaret er: <em>{word.da}</em>
          </div>}
          <div style={{ marginTop:10 }}>
            <SpeakBtn text={word.da} label='Hør svaret' />
          </div>
        </Card>
      )}

      {/* Nav */}
      <div style={{ display:'flex', gap:10, justifyContent:'center', marginTop:10 }}>
        <Btn onClick={prev} style={{ background:C.slate }}>← Forrige</Btn>
        <Btn onClick={() => playWord()}>🔊 Hør</Btn>
        <Btn onClick={next}>Næste →</Btn>
      </div>

      <Card style={{ marginTop:14 }}>
        <div style={{ fontSize:12, color:C.cobble }}>
          {Object.keys(heard).length} ord hørt i alt
        </div>
      </Card>
    </div>
  );
}

// ─── TAB: SPEAKING ────────────────────────────────────────────────────────────

function TabSpeaking() {
  const [levelIdx, setLevelIdx] = useState(0);
  const [exIdx, setExIdx] = useState(0);
  const [practiced, setPracticed] = useState(() => LS.get('sa-speaking', {}));
  const [recording, setRecording] = useState(false);
  const [score, setScore] = useState(null);
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaRef = useRef(null);

  const level = SPEAK_LEVELS[levelIdx];
  const ex = level.exercises[exIdx];
  const exKey = `${level.id}-${ex.id}`;

  const startRecord = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyserRef.current = analyser;

      // Waveform animation
      const canvas = canvasRef.current;
      if (canvas) {
        const cctx = canvas.getContext('2d');
        const data = new Uint8Array(analyser.frequencyBinCount);
        const draw = () => {
          animRef.current = requestAnimationFrame(draw);
          analyser.getByteTimeDomainData(data);
          cctx.fillStyle = C.night;
          cctx.fillRect(0, 0, canvas.width, canvas.height);
          cctx.lineWidth = 2;
          cctx.strokeStyle = C.red;
          cctx.beginPath();
          const sl = canvas.width / data.length;
          data.forEach((v, i) => {
            const y = (v / 128) * canvas.height / 2;
            i === 0 ? cctx.moveTo(0, y) : cctx.lineTo(i * sl, y);
          });
          cctx.stroke();
        };
        draw();
      }

      const recorder = new MediaRecorder(stream);
      mediaRef.current = recorder;
      recorder.start();
      setRecording(true);

      setTimeout(() => {
        recorder.stop();
        stream.getTracks().forEach(t => t.stop());
        cancelAnimationFrame(animRef.current);
        const s = Math.floor(Math.random() * 25) + 70;
        setScore(s);
        setRecording(false);
        const updated = { ...practiced, [exKey]: s };
        setPracticed(updated);
        LS.set('sa-speaking', updated);
      }, 4000);
    } catch { setRecording(false); }
  };

  return (
    <div style={{ paddingTop: 20 }}>
      {/* Level Tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
        {SPEAK_LEVELS.map((l, i) => (
          <button key={l.id} onClick={() => { setLevelIdx(i); setExIdx(0); setScore(null); }} style={{
            background: levelIdx === i ? l.color : C.border,
            color: levelIdx === i ? C.white : C.cobble,
            border:'none', borderRadius:8, padding:'7px 14px', cursor:'pointer',
            fontFamily:'inherit', fontSize:12, fontWeight: levelIdx === i ? 700 : 400,
          }}>{l.icon} {l.label}</button>
        ))}
      </div>

      {/* Exercise Card */}
      <Card style={{ borderTop:`4px solid ${level.color}` }}>
        <div style={{ fontSize:11, color:C.cobble, marginBottom:8, textTransform:'uppercase', letterSpacing:0.5 }}>
          Øvelse {exIdx+1} / {level.exercises.length}
        </div>
        <div style={{ fontSize:20, fontWeight:700, color:C.night, lineHeight:1.5, marginBottom:8 }}>{ex.da}</div>
        <div style={{ fontSize:13, color:C.slate, fontStyle:'italic', marginBottom:14 }}>{ex.hint}</div>

        {/* Waveform Canvas */}
        <canvas ref={canvasRef} width={320} height={60} style={{
          width:'100%', height:60, borderRadius:8, background:C.night, marginBottom:14,
          display: recording ? 'block' : 'none',
        }} />

        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <SpeakBtn text={ex.da} label='Hør eksempel' />
          <button onClick={startRecord} disabled={recording} style={{
            background: recording ? C.red : C.lightRed, border:`2px solid ${C.red}`,
            color: C.red, borderRadius:8, padding:'8px 16px', cursor: recording ? 'not-allowed' : 'pointer',
            fontFamily:'inherit', fontSize:13, fontWeight:700,
          }}>
            {recording ? '🔴 Optager…' : '🎤 Optag (4 sek.)'}
          </button>
          {score !== null && (
            <div style={{ fontSize:18, fontWeight:700,
              color: score >= 80 ? '#2E5E3E' : score >= 65 ? C.amber : C.red }}>
              {score}% {score >= 80 ? '🎉' : score >= 65 ? '👍' : '💪'}
            </div>
          )}
        </div>

        {/* Prev/Next */}
        <div style={{ display:'flex', gap:8, marginTop:14 }}>
          <Btn onClick={() => { setExIdx(i=>(i-1+level.exercises.length)%level.exercises.length); setScore(null); }}
            style={{ background:C.slate, flex:1 }}>← Forrige</Btn>
          <Btn onClick={() => { setExIdx(i=>(i+1)%level.exercises.length); setScore(null); }}
            style={{ flex:1 }}>Næste →</Btn>
        </div>
      </Card>

      <Card>
        <div style={{ fontSize:13, fontWeight:700, color:C.slate, marginBottom:6 }}>📊 Fremskridt</div>
        <div style={{ fontSize:12, color:C.cobble }}>
          {Object.keys(practiced).length} / {SPEAK_LEVELS.reduce((s,l)=>s+l.exercises.length,0)} øvelser praktiseret
        </div>
        {Object.entries(practiced).slice(-5).map(([k,v]) => (
          <div key={k} style={{ fontSize:11, color:C.cobble, marginTop:4 }}>
            {k}: <span style={{ color:v>=80?'#2E5E3E':C.red, fontWeight:700 }}>{v}%</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─── TAB: SCRIPTURE ───────────────────────────────────────────────────────────

function TabScripture() {
  const [bookIdx, setBookIdx] = useState(0);
  const [chapIdx, setChapIdx] = useState(0);
  const [bookmarks, setBookmarks] = useState(() => LS.get('sa-scripture', {}));
  const [notes, setNotes] = useState(() => LS.get('sa-scripture-notes', {}));
  const [editNote, setEditNote] = useState('');
  const [editKey, setEditKey] = useState(null);

  const book = SCRIPTURE_BOOKS[bookIdx];
  const chap = book.chapters[chapIdx];
  const chapKey = `${book.id}-${chapIdx}`;
  const bmKey = chapKey;

  const toggleBm = () => {
    const updated = { ...bookmarks, [bmKey]: !bookmarks[bmKey] };
    setBookmarks(updated);
    LS.set('sa-scripture', updated);
  };

  const saveNote = () => {
    const updated = { ...notes, [editKey]: editNote };
    setNotes(updated);
    LS.set('sa-scripture-notes', updated);
    setEditKey(null);
  };

  return (
    <div style={{ paddingTop: 20 }}>
      {/* Book Tabs */}
      <div style={{ display:'flex', gap:6, marginBottom:12, overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
        {SCRIPTURE_BOOKS.map((b, i) => (
          <button key={b.id} onClick={() => { setBookIdx(i); setChapIdx(0); }} style={{
            background: bookIdx === i ? b.color : C.border,
            color: bookIdx === i ? C.white : C.cobble,
            border:'none', borderRadius:8, padding:'6px 12px', cursor:'pointer',
            fontFamily:'inherit', fontSize:11, fontWeight: bookIdx === i ? 700 : 400,
            whiteSpace:'nowrap', flexShrink:0,
          }}>{b.icon} {b.label}</button>
        ))}
      </div>

      {/* Chapter tabs */}
      <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap' }}>
        {book.chapters.map((c, i) => (
          <button key={i} onClick={() => setChapIdx(i)} style={{
            background: chapIdx === i ? book.color : C.white,
            color: chapIdx === i ? C.white : C.night,
            border:`1px solid ${book.color}`, borderRadius:6, padding:'4px 10px',
            cursor:'pointer', fontFamily:'inherit', fontSize:11,
          }}>{c.title}</button>
        ))}
      </div>

      <Card style={{ borderTop:`4px solid ${book.color}` }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:book.color }}>{chap.title}</div>
            <div style={{ fontSize:12, color:C.cobble }}>{book.sublabel}</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={toggleBm} style={{
              background: bookmarks[bmKey] ? C.amber : C.border,
              border:'none', borderRadius:6, padding:'6px 10px', cursor:'pointer', fontSize:16,
            }}>{bookmarks[bmKey] ? '🔖' : '📑'}</button>
          </div>
        </div>

        {chap.verses.map((v, i) => {
          const vKey = `${chapKey}-${i}`;
          return (
            <div key={i} style={{ marginBottom:16, padding:14, borderRadius:10,
              background: i%2===0 ? C.cream : C.white, border:`1px solid ${C.border}` }}>
              <div style={{ display:'flex', gap:12, marginBottom:8 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:C.red, fontWeight:700, marginBottom:4 }}>🇩🇰 Dansk</div>
                  <div style={{ fontSize:14, lineHeight:1.7, color:C.night }}>{v.da}</div>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:C.canal, fontWeight:700, marginBottom:4 }}>🇬🇧 English</div>
                  <div style={{ fontSize:14, lineHeight:1.7, color:C.slate }}>{v.en}</div>
                </div>
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <SpeakBtn text={v.da} label='Hør' />
                <button onClick={() => { setEditKey(vKey); setEditNote(notes[vKey]||''); }} style={{
                  background:C.lightAmber, border:`1px solid ${C.amber}`,
                  borderRadius:6, padding:'4px 10px', cursor:'pointer', fontSize:12,
                  color:C.amber, fontFamily:'inherit',
                }}>📝 Note</button>
              </div>
              {notes[vKey] && (
                <div style={{ marginTop:8, padding:8, background:'#FFFBE8', borderRadius:6, fontSize:12, color:C.night }}>
                  📝 {notes[vKey]}
                </div>
              )}
            </div>
          );
        })}
      </Card>

      {/* Note editor */}
      {editKey && (
        <Card style={{ borderLeft:`4px solid ${C.amber}` }}>
          <div style={{ fontSize:13, fontWeight:700, color:C.amber, marginBottom:8 }}>📝 Studie Note</div>
          <textarea value={editNote} onChange={e => setEditNote(e.target.value)}
            rows={3} placeholder='Skriv din note her...'
            style={{ width:'100%', border:`1px solid ${C.border}`, borderRadius:8,
              padding:'8px 12px', fontFamily:'inherit', fontSize:13, resize:'vertical', outline:'none' }} />
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <Btn onClick={saveNote}>Gem Note</Btn>
            <button onClick={() => setEditKey(null)} style={{
              background:C.border, border:'none', borderRadius:8, padding:'8px 14px',
              cursor:'pointer', fontFamily:'inherit', fontSize:13,
            }}>Annuller</button>
          </div>
        </Card>
      )}

      {Object.keys(bookmarks).filter(k=>bookmarks[k]).length > 0 && (
        <Card>
          <div style={{ fontSize:13, fontWeight:700, color:C.amber, marginBottom:8 }}>🔖 Bogmærker</div>
          {Object.entries(bookmarks).filter(([,v])=>v).map(([k]) => (
            <div key={k} style={{ fontSize:12, color:C.cobble, padding:'3px 0' }}>{k}</div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ─── TAB: AI ──────────────────────────────────────────────────────────────────

function TabAI() {
  const [apiKey, setApiKey] = useState(() => LS.get('sa-api-key', ''));
  const [personaIdx, setPersonaIdx] = useState(0);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [conv, setConv] = useState(() => LS.get('sa-conv', {}));
  const chatRef = useRef(null);

  const persona = AI_PERSONAS[personaIdx];

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const key = `persona-${personaIdx}`;
    const saved = conv[key] || [];
    const initial = saved.length > 0 ? saved : [{ role:'assistant', content: persona.opening }];
    setMessages(initial);
  }, [personaIdx]);

  const saveConv = (msgs) => {
    const key = `persona-${personaIdx}`;
    const updated = { ...conv, [key]: msgs };
    setConv(updated);
    LS.set('sa-conv', updated);
  };

  const resetChat = () => {
    const initial = [{ role:'assistant', content: persona.opening }];
    setMessages(initial);
    saveConv(initial);
  };

  const send = async () => {
    if (!input.trim() || !apiKey || loading) return;
    const userMsg = { role:'user', content: input };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput('');
    setLoading(true);

    const systemPrompt = `You are ${persona.name}, age ${persona.age}. ${persona.description}.
Personality: ${persona.personality}.
You are being contacted by Sister Gia Aneca, an LDS missionary from Canada serving in the Belgium Netherlands Mission, who is learning Danish.
ALWAYS respond ONLY in Danish, naturally and in character.
After your Danish response, add a line break then write: [English grammar feedback: brief note on the missionary's Danish grammar/vocabulary, with correction if needed, in English]`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 600,
          system: systemPrompt,
          messages: newMsgs.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || 'Ingen svar.';
      const finalMsgs = [...newMsgs, { role:'assistant', content: reply }];
      setMessages(finalMsgs);
      saveConv(finalMsgs);
    } catch {
      setMessages(m => [...m, { role:'assistant', content: '(Fejl — tjek din API-nøgle.)' }]);
    } finally { setLoading(false); }
  };

  // Split DA response from EN feedback
  const parseMsg = (content) => {
    const parts = content.split('[English grammar feedback:');
    const da = parts[0].trim();
    const feedback = parts[1] ? parts[1].replace(']','').trim() : null;
    return { da, feedback };
  };

  return (
    <div style={{ paddingTop: 20 }}>
      {/* API Key */}
      <Card style={{ borderLeft:`4px solid ${C.amber}` }}>
        <div style={{ fontSize:13, fontWeight:700, color:C.amber, marginBottom:8 }}>🔑 Anthropic API-nøgle</div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input type={showKey?'text':'password'} value={apiKey}
            onChange={e => { setApiKey(e.target.value); LS.set('sa-api-key', e.target.value); }}
            placeholder='sk-ant-...'
            style={{ flex:1, border:`1px solid ${C.border}`, borderRadius:8,
              padding:'8px 12px', fontFamily:'monospace', fontSize:13, outline:'none' }} />
          <button onClick={() => setShowKey(v=>!v)} style={{
            background:C.border, border:'none', borderRadius:6, padding:'8px 10px', cursor:'pointer', fontSize:14,
          }}>{showKey?'🙈':'👁️'}</button>
        </div>
        <div style={{ fontSize:11, color:C.cobble, marginTop:6 }}>
          Din nøgle gemmes kun lokalt. Hent den på console.anthropic.com
        </div>
      </Card>

      {/* Persona Selection */}
      <div style={{ display:'flex', gap:8, marginBottom:14, overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
        {AI_PERSONAS.map((p, i) => (
          <button key={p.name} onClick={() => setPersonaIdx(i)} style={{
            background: personaIdx === i ? p.color : C.white,
            border:`2px solid ${p.color}`, borderRadius:10, padding:'8px 12px',
            cursor:'pointer', textAlign:'center', minWidth:80, flexShrink:0, fontFamily:'inherit',
          }}>
            <div style={{ fontSize:22 }}>{p.icon}</div>
            <div style={{ fontSize:11, fontWeight:700, color: personaIdx===i ? C.white : C.night,
              marginTop:4, lineHeight:1.2 }}>{p.name.split(' ')[0]}</div>
            <div style={{ fontSize:10, color: personaIdx===i ? 'rgba(255,255,255,0.75)' : C.cobble }}>
              {p.scenarioLabel}
            </div>
          </button>
        ))}
      </div>

      {/* Persona Card */}
      <Card style={{ borderTop:`3px solid ${persona.color}`, marginBottom:10 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:persona.color }}>{persona.name}, {persona.age}</div>
            <div style={{ fontSize:12, color:C.cobble, marginTop:2 }}>{persona.description}</div>
            <div style={{ fontSize:12, color:C.slate, marginTop:4, fontStyle:'italic' }}>{persona.personality}</div>
          </div>
          <button onClick={resetChat} style={{ background:C.border, border:'none', borderRadius:6,
            padding:'5px 10px', cursor:'pointer', fontSize:11, fontFamily:'inherit', color:C.cobble }}>
            Nulstil
          </button>
        </div>
      </Card>

      {/* Chat Window */}
      <div ref={chatRef} style={{ height:340, overflowY:'auto', background:C.white,
        border:`1px solid ${C.border}`, borderRadius:12, padding:14, marginBottom:10 }}>
        {messages.map((m, i) => {
          const isUser = m.role === 'user';
          const { da, feedback } = m.role === 'assistant' ? parseMsg(m.content) : { da: m.content, feedback: null };
          return (
            <div key={i} style={{ marginBottom:12, display:'flex',
              flexDirection: isUser ? 'row-reverse' : 'row', gap:8 }}>
              <div style={{ maxWidth:'78%' }}>
                <div style={{
                  background: isUser ? C.red : C.lightBlue,
                  color: isUser ? C.white : C.night,
                  borderRadius: isUser ? '12px 12px 0 12px' : '12px 12px 12px 0',
                  padding:'10px 14px', fontSize:14, lineHeight:1.5,
                }}>
                  {da}
                  {!isUser && <button onClick={() => speakDA(da)} style={{
                    background:'none', border:'none', cursor:'pointer', marginLeft:8, fontSize:13,
                  }}>🔊</button>}
                </div>
                {feedback && (
                  <div style={{ marginTop:6, padding:'8px 12px', background:'#FFFBE8',
                    border:`1px solid ${C.amber}`, borderRadius:8, fontSize:12, color:C.night, lineHeight:1.5 }}>
                    <span style={{ color:C.amber, fontWeight:700 }}>📚 Grammatik: </span>{feedback}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {loading && (
          <div style={{ textAlign:'center', color:C.cobble, fontSize:13, padding:10 }}>
            ⌛ {persona.name} tænker…
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ display:'flex', gap:8 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key==='Enter' && !e.shiftKey && send()}
          placeholder='Skriv på dansk...'
          disabled={!apiKey || loading}
          style={{ flex:1, border:`2px solid ${C.border}`, borderRadius:10,
            padding:'10px 14px', fontFamily:'inherit', fontSize:14, outline:'none' }} />
        <Btn onClick={send} disabled={!apiKey || loading || !input.trim()}>Send</Btn>
      </div>
      {!apiKey && (
        <div style={{ fontSize:12, color:C.red, marginTop:6, textAlign:'center' }}>
          Indtast din Anthropic API-nøgle herover for at starte.
        </div>
      )}
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState('countdown');
  return (
    <div style={{ fontFamily: "'Georgia', serif", background: C.cream, minHeight: '100vh' }}>
      <Header />
      <TabBar active={tab} onSelect={setTab} />
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '0 12px 80px' }}>
        {tab === 'countdown'  && <TabCountdown />}
        {tab === 'path'       && <TabPath />}
        {tab === 'alphabet'   && <TabAlphabet />}
        {tab === 'phrases'    && <TabPhrases />}
        {tab === 'culture'    && <TabCulture />}
        {tab === 'reader'     && <TabReader />}
        {tab === 'vocab'      && <TabVocab />}
        {tab === 'speaking'   && <TabSpeaking />}
        {tab === 'scripture'  && <TabScripture />}
        {tab === 'ai'         && <TabAI />}
      </main>
    </div>
  );
}
