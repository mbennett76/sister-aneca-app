import { useState, useEffect, useRef, useCallback } from 'react';

// ─── COLOR PALETTE ────────────────────────────────────────────────────────────
const C = {
  red:        '#C60C30', white:   '#FFFFFF', cream:  '#FFF8F5',
  canal:      '#4A7C9A', amber:   '#D4850A', slate:  '#5C6B7A',
  cobble:     '#8A8070', forest:  '#2E5E3E', night:  '#1A1A2E',
  viking:     '#2C3E6B',
  // Surface / text
  bg:      '#FFF8F5', surface: '#F5EEE8', border: '#E8DDD0',
  softRed: '#F8E8EC', softBlue:'#E8EFF6', softAmber:'#FDF4E0', softGreen:'#E8F4EC',
  ink:     '#1A1010', muted:   '#6B5040', faint:  '#9A8070', onDark:  '#FFF8F5',
  // Aliases kept for existing code
  lightRed:   '#F5E0E4', lightBlue: '#E8F0F6', lightAmber: '#FAF0DC',
};

// ─── LOCAL STORAGE HOOK ──────────────────────────────────────────────────────
const LS = {
  get: (k, def) => { try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : def; } catch { return def; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
function useLS(key, init) {
  const [val, setVal] = useState(() => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : init; } catch { return init; } });
  const save = useCallback((v) => { setVal(v); try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key]);
  return [val, save];
}
const toDay = () => new Date().toISOString().split('T')[0];
const dayOff = n => new Date(Date.now() + n * 86400000).toISOString().split('T')[0];

function useStreak() {
  const [data, save] = useLS('sa-streak', { current: 0, longest: 0, lastDate: null, total: 0, log: [] });
  useEffect(() => {
    const today = toDay(); if (data.lastDate === today) return;
    const yest = dayOff(-1);
    const streak = data.lastDate === yest ? (data.current || 0) + 1 : 1;
    save({ current: streak, longest: Math.max(streak, data.longest || 0), lastDate: today, total: (data.total || 0) + 1, log: [...(data.log || []).slice(-90), today] });
  }, []);
  return data;
}

// ─── AZURE TTS — da-DK-ChristelNeural, fallback to browser ───────────────────
const _audioCache = {};
async function speakDA(text, rate = 0.82) {
  const azKey    = (() => { try { return JSON.parse(localStorage.getItem('sa-azure-key')) || ''; } catch { return ''; } })();
  const azRegion = (() => { try { return JSON.parse(localStorage.getItem('sa-azure-region')) || 'eastus'; } catch { return 'eastus'; } })();
  if (azKey) {
    const ck = text.slice(0, 80);
    if (_audioCache[ck]) { _audioCache[ck].pause(); _audioCache[ck].currentTime = 0; _audioCache[ck].play(); return; }
    try {
      const ssml = `<speak version='1.0' xml:lang='da-DK'><voice name='da-DK-ChristelNeural'><prosody rate='${rate < 0.9 ? '-15%' : '0%'}'>${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</prosody></voice></speak>`;
      const res = await fetch(`https://${azRegion}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: 'POST',
        headers: { 'Ocp-Apim-Subscription-Key': azKey, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3' },
        body: ssml
      });
      if (!res.ok) throw new Error(`Azure ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      _audioCache[ck] = audio;
      audio.play();
    } catch (e) { _browserSpeak(text, rate); }
  } else { _browserSpeak(text, rate); }
}
function _browserSpeak(text, rate = 0.82) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.lang = 'da-DK'; u.rate = rate;
  const vs = window.speechSynthesis.getVoices();
  const v = vs.find(v => v.lang === 'da-DK') || vs.find(v => v.lang.startsWith('da-DK')) || vs.find(v => v.lang.startsWith('da'));
  if (v) u.voice = v;
  window.speechSynthesis.speak(u);
}

// ─── SPEECH RECOGNITION MIC HOOK ─────────────────────────────────────────────
function useLetterMic(target) {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [score, setScore] = useState(null);
  const recRef = useRef(null);
  const start = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setTranscript('Taleregistrering kræver Chrome eller Edge.'); return; }
    if (recording) { recRef.current?.stop(); setRecording(false); return; }
    const rec = new SR(); rec.lang = 'da-DK'; rec.continuous = false; rec.interimResults = false;
    recRef.current = rec;
    rec.onresult = e => {
      const said = e.results[0][0].transcript.trim();
      setTranscript(said);
      const cl = s => s.toLowerCase().replace(/[.,!?;:]/g, '').trim();
      const tW = cl(target).split(' '); const gW = cl(said).split(' ');
      const mt = tW.filter(w => gW.some(g => g.includes(w.slice(0,3)) || w.includes(g.slice(0,3)))).length;
      setScore(Math.round((mt / tW.length) * 100));
    };
    rec.onerror = () => { setRecording(false); setTranscript('Kunne ikke høre — prøv igen.'); };
    rec.onend = () => setRecording(false);
    rec.start(); setRecording(true); setTranscript(''); setScore(null);
  };
  const reset = () => { setTranscript(''); setScore(null); };
  return { recording, transcript, score, start, reset };
}

function MicResult({ transcript, score, recording, onStart, color }) {
  const clr = color || C.red;
  return (
    <>
      <button onClick={onStart} style={{ background: recording ? C.red : 'rgba(255,255,255,0.14)', border: 'none', borderRadius: 9, padding: '8px 13px', color: C.onDark, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'background 0.2s' }}>
        {recording ? '🔴 Lytter…' : '🎤 Sig det'}
      </button>
      {transcript && (
        <div style={{ marginTop: 10, background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '10px 13px' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,248,245,0.6)', marginBottom: 3 }}>Du sagde</div>
          <div style={{ fontFamily: 'Georgia,serif', fontSize: 14, color: C.onDark, marginBottom: 7 }}>"{transcript}"</div>
          {score !== null && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3 }}>
                <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${score}%`, height: '100%', borderRadius: 3, background: score >= 80 ? '#4CAF50' : score >= 50 ? C.amber : C.red, transition: 'width 0.6s' }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, minWidth: 34, color: score >= 80 ? '#90EE90' : score >= 50 ? C.amber : '#FF9999' }}>{score}%</span>
              </div>
              <div style={{ fontSize: 12, color: score >= 80 ? '#90EE90' : score >= 50 ? C.amber : '#FF9999' }}>
                {score >= 80 ? '🎉 Fremragende udtale!' : score >= 50 ? '👍 Godt — prøv igen!' : '🔄 Lyt og prøv igen!'}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

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
      { title:'2 Nephi 2:25', verses:[
        { da:'Adam faldt, for at mennesker kunne eksistere; og mennesker er til, for at de kunne have glæde.', en:'Adam fell that men might be; and men are, that they might have joy.' },
      ]},
      { title:'2 Nephi 9:28-29', verses:[
        { da:'Ak, den lærdes og den uddannedes ord lyder godt; og dog er mange faldne i fælder og listige snarer, som Djævelens er; thi de lytter ikke til Guds råd, men tilsidesætter det og følger eget råd.', en:'O that cunning plan of the evil one! O the vainness, and the frailties, and the foolishness of men! When they are learned they think they are wise, and they hearken not unto the counsel of God.' },
        { da:'Men at være lært er godt, såfremt de lytter til Guds råd.', en:'But to be learned is good if they hearken unto the counsels of God.' },
      ]},
      { title:'2 Nephi 25:23', verses:[
        { da:'Thi vi arbejder ivrigt for at skrive, for at overtale vore børn og brødre til at tro på Kristus og til at forsones med Gud; thi vi ved, at det er ved nåde vi frelses, efter al den møje vi kan yde.', en:'For we labor diligently to write, to persuade our children, and also our brethren, to believe in Christ, and to be reconciled to God; for we know that it is by grace that we are saved, after all we can do.' },
      ]},
      { title:'2 Nephi 31:17-20', verses:[
        { da:'Hvortil siger jeg jer: efter at I har modtaget Den Hellige Ånd, som vidner om Faderen og om Sønnen, opfyld da Sønnens ord ved at følge ham med fuld sjæl, hjerte, sind og styrke; og da vil I opnå evigt liv i enden.', en:'Wherefore, do the things which I have told you I have seen that your Lord and your Redeemer should do; for, for this cause have they been shown unto me, that ye might know the gate by which ye should enter.' },
        { da:'Fremad med en urokkelig tro på Kristus, med et fuldkomment lys af håb og en kærlighed til Gud og til alle mennesker. Og fodrer af Kristi ord og holder fast ved til enden — da vil I have evigt liv.', en:'Wherefore, ye must press forward with a steadfastness in Christ, having a perfect brightness of hope, and a love of God and of all men. Wherefore, if ye shall press forward, feasting upon the word of Christ, and endure to the end, behold, thus saith the Father: Ye shall have eternal life.' },
      ]},
      { title:'Enos 1:3-5', verses:[
        { da:'Og min sjæl hungrede; og jeg knælede ned foran min skaber og råbte til ham i mægtig bøn om min sjæls frelse; og hele dagen råbte jeg, og der kom nat, og jeg rejste stadig min stemme til Gud.', en:'And my soul hungered; and I kneeled down before my Maker, and I cried unto him in mighty prayer and supplication for mine own soul; and all the day long did I cry unto him; yea, and when the night came I did still raise my voice high.' },
        { da:'Og der kom en stemme til mig og sagde: Enos, dine synder er dig tilgivet, og du skal velsignes. Og jeg vidste, at Gud ikke kunne lyve; og min skyld blev fejet bort.', en:'And there came a voice unto me, saying: Enos, thy sins are forgiven thee, and thou shalt be blessed. And I, Enos, knew that God could not lie; wherefore, my guilt was swept away.' },
      ]},
      { title:'Mosias 2:17', verses:[
        { da:'Og se, jeg fortæller jer disse ting, for at I kan lære visdom; for at I kan lære, at da I er i jeres medmenneskers tjeneste, er I kun i Guds tjeneste.', en:'And behold, I tell you these things that ye may learn wisdom; that ye may learn that when ye are in the service of your fellow beings ye are only in the service of your God.' },
      ]},
      { title:'Mosias 3:17', verses:[
        { da:'Og hvad mere er — der er intet andet navn givet under himlen, ved hvilket frelse kommer; thi frelsen kommer ikke ved noget andet middel eller måde end ved Kristi forsoning og genopstandelsens kraft.', en:'And moreover, I say unto you, that there shall be no other name given nor any other way nor means whereby salvation can come unto the children of men, only in and through the name of Christ, the Lord Omnipotent.' },
      ]},
      { title:'Alma 5:14', verses:[
        { da:'Og nu beder jeg jer, mine brødre — er I åndelig genfødt af Gud? Har I modtaget hans billede i jeres ansigt? Har I oplevet denne mægtige forandring i jeres hjerte?', en:'And now behold, I ask of you, my brethren of the church, have ye spiritually been born of God? Have ye received his image in your countenances? Have ye experienced this mighty change in your hearts?' },
      ]},
      { title:'Alma 7:11-12', verses:[
        { da:'Og han skal gå frem og lide smerter og lidelse og fristelser af enhver art; og dette for at opfylde det ord, som siger, at han skal tage på sig sit folks smerter og sygdomme.', en:'And he shall go forth, suffering pains and afflictions and temptations of every kind; and this that the word might be fulfilled which saith he will take upon him the pains and the sicknesses of his people.' },
        { da:'Og han vil tage på sig døden for at løse dødens bånd, som binder sit folk; og han vil tage på sig deres skrøbeligheder, for at hans indre kan fyldes med barmhjertighed, og for at han kan vide, efter kødet, hvordan han hjælper sit folk i deres skrøbeligheder.', en:'And he will take upon him death, that he may loose the bands of death which bind his people; and he will take upon him their infirmities, that his bowels may be filled with mercy, according to the flesh, that he may know according to the flesh how to succor his people according to their infirmities.' },
      ]},
      { title:'Alma 11:43-44', verses:[
        { da:'Ånden og legemet vil blive genforenet igen i sin fuldkomne form; både lem og led vil blive genoprettet til sin rette form, ligesom vi er nu; og vi vil stå foran Gud og vide, ligesom vi ved nu, og have en klar erindring om al vor skyld.', en:'The spirit and the body shall be reunited again in its perfect form; both limb and joint shall be restored to its proper frame, even as we now are at this time; and we shall be brought to stand before God, knowing even as we know now, and have a bright recollection of all our guilt.' },
        { da:'Nu skal denne genoprettelse komme til alle, både gamle og unge, både bundet og fri, både mand og kvinde, både ugudelige og retfærdige; og ikke så meget som et hår på deres hoved vil gå tabt, men alt vil blive genoprettet til sin fuldkomne form.', en:'Now, this restoration shall come to all, both old and young, both bond and free, both male and female, both the wicked and the righteous; and even there shall not so much as a hair of their heads be lost; but every thing shall be restored to its perfect frame.' },
      ]},
      { title:'Alma 32:21 & 27', verses:[
        { da:'Og nu som jeg sagde om tro — tro er ikke at have en fuldkommen viden om tingene; thi hvis I har tro, håber I på ting, som ikke ses, men som er sande.', en:'And now as I said concerning faith—faith is not to have a perfect knowledge of things; therefore if ye have faith ye hope for things which are not seen, which are true.' },
        { da:'Men se, hvis I vil vågne op og ophidse jeres sanser til et forsøg på mine ord og øve en smule tro, ja, om I ikke kan gøre mere end ønske at tro, lad dette ønske arbejde i jer, indtil I tror på en måde, at I kan give plads for en del af mine ord.', en:'But behold, if ye will awake and arouse your faculties, even to an experiment upon my words, and exercise a particle of faith, yea, even if ye can no more than desire to believe, let this desire work in you, even until ye believe in a manner that ye can give place for a portion of my words.' },
      ]},
      { title:'Alma 34:32-33', verses:[
        { da:'Thi se, dette liv er den tid for menneskene til at forberede sig for at møde Gud; ja, se, dette legemes dag er livets dag for menneskene til at udføre deres gerninger.', en:'For behold, this life is the time for men to prepare to meet God; yea, behold the day of this life is the day for men to perform their labors.' },
        { da:'Og nu, som jeg sagde jer, udskyd ikke dagen for jeres omvendelse til enden; thi efter dette livets dag, som gives os til at forberede os til evighed, se, hvis vi ikke forbedrer vor tid, mens vi er i dette liv, da kommer mørkets nat, hvori der ikke kan udføres nogen gerning.', en:'And now, as I said unto you before, as ye have had so many witnesses, therefore, I beseech of you that ye do not procrastinate the day of your repentance until the end; for after this day of life, which is given us to prepare for eternity, behold, if we do not improve our time while in this life, then cometh the night of darkness wherein there can be no labor performed.' },
      ]},
      { title:'Alma 36:3', verses:[
        { da:'Thi jeg siger dig, at i så høj grad I sætter jeres tillid til Gud, i så høj grad vil I reddes ud af jeres prøvelser, jeres sorger og jeres lidelser, og I vil blive ophøjet på den yderste dag.', en:'For I do know that whosoever shall put their trust in God shall be supported in their trials, and their troubles, and their afflictions, and shall be lifted up at the last day.' },
      ]},
      { title:'Alma 37:6-7', verses:[
        { da:'Nu ved I, at det er ved små og simple ting, at store ting sker; og små midler bringer Herren mange sjæles frelse.', en:'Now ye may suppose that this is foolishness in me; but behold I say unto you, that by small and simple things are great things brought to pass; and small means in many instances doth confound the wise.' },
        { da:'Og Gud Herren arbejder ved midler for at frembringe sine store og evige formål; og ved meget små midler forvirrer Herren de vise og bringer mange sjæles frelse til veje.', en:'And the Lord God doth work by means to bring about his great and eternal purposes; and by very small means the Lord doth confound the wise and bringeth about the salvation of many souls.' },
      ]},
      { title:'3 Nephi 11:10-11', verses:[
        { da:'Se, jeg er Jesus Kristus, om hvem profeterne vidnede at han skulle komme til verden.', en:'Behold, I am Jesus Christ, whom the prophets testified shall come into the world.' },
        { da:'Og se, jeg er verdens lys og verdens liv; og jeg har drukket af den bitre kalk, som Faderen gav mig, og har æret Faderen ved at tage verdens synder på mig.', en:'And behold, I am the light and the life of the world; and I have drunk out of that bitter cup which the Father hath given me, and have glorified the Father in taking upon me the sins of the world.' },
      ]},
      { title:'3 Nephi 27:13-14', verses:[
        { da:'Se, jeg er kommet til verden for at gøre Faderens vilje, fordi min Fader sendte mig.', en:'Behold I have given unto you my gospel, and this is the gospel which I have given unto you—that I came into the world to do the will of my Father, because my Father sent me.' },
        { da:'Og min Fader sendte mig, for at jeg skulle ophøjes på korset; og efter at jeg er ophøjet på korset, for at drage alle mennesker til mig, som Faderen har kærlighed til, idet de omvender sig og bliver døbt i mit navn.', en:'And my Father sent me that I might be lifted up upon the cross; and after that I had been lifted up upon the cross, that I might draw all men unto me, that as I have been lifted up by men even so should men be lifted up by the Father.' },
      ]},
      { title:'Moroni 7:33', verses:[
        { da:'Og Kristus har sagt: Hvis I har tro på mig, vil I have kraft til at gøre alt, hvad der er nyttigt for mig.', en:'And Christ hath said: If ye will have faith in me ye shall have power to do whatsoever thing is expedient in me.' },
      ]},
      { title:'Moroni 7:47-48', verses:[
        { da:'Men kærlighed er den rene Kristi kærlighed, og den varer evigt; og hvem som helst, der er fundet besiddende den på den yderste dag, det vil gå ham vel.', en:'But charity is the pure love of Christ, and it endureth forever; and whoso is found possessed of it at the last day, it shall be well with him.' },
        { da:'Bed derfor til Faderen af hele dit hjerte, at du må blive fyldt med denne kærlighed, som han har skænket alle sande efterfølgere af sin søn Jesus Kristus; at du måtte blive som ham, da vi er rensede, så vi kan ved ham være rene.', en:'Wherefore, my beloved brethren, pray unto the Father with all the energy of heart, that ye may be filled with this love, which he hath bestowed upon all who are true followers of his Son, Jesus Christ; that ye may become the sons of God; that when he shall appear we shall be like him.' },
      ]},
      { title:'Moroni 10:3-5', verses:[
        { da:'Se, jeg formaner jer til, at da I læser disse ting, husker I, hvor barmhjertig Herren har været mod menneskenes børn fra Adams skabelse og ned til den tid I modtager disse ting, og tænker over det i jeres hjerte.', en:'Behold, I would exhort you that when ye shall read these things, if it be wisdom in God that ye should read them, that ye would remember how merciful the Lord hath been unto the children of men, from the creation of Adam even down until the time that ye shall receive these things, and ponder it in your hearts.' },
        { da:'Og når I modtager disse ting, vil jeg formane jer til at spørge Gud, den evige Fader, i Kristi navn, om disse ting ikke er sande.', en:'And when ye shall receive these things, I would exhort you that ye would ask God, the Eternal Father, in the name of Christ, if these things are not true.' },
        { da:'Og hvis I spørger med et oprigtigt hjerte, med virkelig hensigt og har tro på Kristus, vil han åbenbare sandheden om det for jer ved Den Hellige Ånds kraft.', en:'And if ye shall ask with a sincere heart, with real intent, having faith in Christ, he will manifest the truth of it unto you, by the power of the Holy Ghost.' },
      ]},
    ]
  },
  {
    id:'ot', label:'Gamle Testamente', sublabel:'Old Testament', icon:'📙', color:'#D4850A',
    chapters:[
      { title:'1 Mosebog 1:26-27', verses:[
        { da:'Da sagde Gud: Lad os skabe mennesker i vort billede, så de ligner os! De skal herske over havets fisk og over himlens fugle og over kvæget og over hele jorden.', en:'And God said, Let us make man in our image, after our likeness: and let them have dominion over the fish of the sea, and over the fowl of the air, and over the cattle, and over all the earth.' },
        { da:'Gud skabte mennesket i sit billede; i Guds billede skabte han det, som mand og kvinde skabte han dem.', en:'So God created man in his own image, in the image of God created he him; male and female created he them.' },
      ]},
      { title:'Josua 24:15', verses:[
        { da:'Men hvis det forekommer jer ondt at tjene Herren, så vælg i dag, hvem I vil tjene... Men jeg og mit hus, vi tjener Herren.', en:'And if it seem evil unto you to serve the LORD, choose you this day whom ye will serve... but as for me and my house, we will serve the LORD.' },
      ]},
      { title:'1 Kongebog 19:11-12', verses:[
        { da:'Han sagde: Gå ud og stå på bjerget over for Herren! Herren drog forbi; der kom en voldsom storm, der spaltede bjerge og knuste klipper — men Herren var ikke i stormen. Efter stormen kom et jordskælv — men Herren var ikke i jordskælvet.', en:'And he said, Go forth, and stand upon the mount before the LORD. And, behold, the LORD passed by, and a great and strong wind rent the mountains, and brake in pieces the rocks before the LORD; but the LORD was not in the wind: and after the wind an earthquake; but the LORD was not in the earthquake.' },
        { da:'Efter jordskælvet kom en ild — men Herren var ikke i ilden. Og efter ilden kom lyden af en sagte susen.', en:'And after the earthquake a fire; but the LORD was not in the fire: and after the fire a still small voice.' },
      ]},
      { title:'Salme 46:10', verses:[
        { da:'Hold op og forstå, at jeg er Gud, ophøjet over folkeslagene, ophøjet over jorden.', en:'Be still, and know that I am God: I will be exalted among the heathen, I will be exalted in the earth.' },
      ]},
      { title:'Esajas 1:18', verses:[
        { da:'Kom, lad os gøre op med hinanden, siger Herren. Selv om jeres synder er som skarlagen, kan de blive hvide som sne; selv om de er røde som purpur, kan de blive hvide som uld.', en:'Come now, and let us reason together, saith the LORD: though your sins be as scarlet, they shall be as white as snow; though they be red like crimson, they shall be as wool.' },
      ]},
      { title:'Esajas 55:8-9', verses:[
        { da:'Thi mine tanker er ikke jeres tanker, og jeres veje er ikke mine veje, siger Herren.', en:'For my thoughts are not your thoughts, neither are your ways my ways, saith the LORD.' },
        { da:'Som himlen er højere end jorden, er mine veje højere end jeres veje og mine tanker højere end jeres tanker.', en:'For as the heavens are higher than the earth, so are my ways higher than your ways, and my thoughts than your thoughts.' },
      ]},
      { title:'Jeremias 1:5', verses:[
        { da:'Inden jeg dannede dig i moderlivet, kendte jeg dig; inden du kom ud af moders skød, helligede jeg dig; til profet for folkeslagene satte jeg dig.', en:'Before I formed thee in the belly I knew thee; and before thou camest forth out of the womb I sanctified thee, and I ordained thee a prophet unto the nations.' },
      ]},
      { title:'Amos 3:7', verses:[
        { da:'Sandelig, Gud Herren gør intet uden at åbenbare sin hemmelighed for sine tjenere profeterne.', en:'Surely the Lord GOD will do nothing, but he revealeth his secret unto his servants the prophets.' },
      ]},
      { title:'Malakias 4:5-6', verses:[
        { da:'Se, jeg sender jer profeten Elias, inden Herrens store og frygtelige dag kommer.', en:'Behold, I will send you Elijah the prophet before the coming of the great and dreadful day of the LORD.' },
        { da:'Han skal vende fædrenes hjerte til børnene og børnenes hjerte til deres fædre, så jeg ikke kommer og slår landet med forbandelse.', en:'And he shall turn the heart of the fathers to the children, and the heart of the children to their fathers, lest I come and smite the earth with a curse.' },
      ]},
    ]
  },
  {
    id:'nt', label:'Nye Testamente', sublabel:'New Testament', icon:'📗', color:'#2E5E3E',
    chapters:[
      { title:'Matthæus 3:16-17', verses:[
        { da:'Da Jesus var blevet døbt, steg han straks op af vandet, og se, himlene åbnede sig for ham, og han så Guds Ånd dale ned som en due og komme over ham.', en:'And Jesus, when he was baptized, went up straightway out of the water: and, lo, the heavens were opened unto him, and he saw the Spirit of God descending like a dove, and lighting upon him.' },
        { da:'Og se, der lød en røst fra himlene: Det er min elskede søn, i hvem jeg har velbehag.', en:'And lo a voice from heaven, saying, This is my beloved Son, in whom I am well pleased.' },
      ]},
      { title:'Matthæus 5:48', verses:[
        { da:'Vær da fuldkomne, som jeres himmelske Fader er fuldkommen.', en:'Be ye therefore perfect, even as your Father which is in heaven is perfect.' },
      ]},
      { title:'Matthæus 7:7-8', verses:[
        { da:'Bed, og I skal få; søg, og I skal finde; bank på, og der skal lukkes op for jer.', en:'Ask, and it shall be given you; seek, and ye shall find; knock, and it shall be opened unto you.' },
        { da:'Thi enhver, som beder, får; den, som søger, finder; og for den, som banker på, åbnes der.', en:'For every one that asketh receiveth; and he that seeketh findeth; and to him that knocketh it shall be opened.' },
      ]},
      { title:'Matthæus 22:36-40', verses:[
        { da:'Mester, hvilket bud er det største i loven? Han svarede: Du skal elske Herren din Gud af hele dit hjerte og af hele din sjæl og af hele din forstand. Det er det største og første bud.', en:'Master, which is the great commandment in the law? Jesus said unto him, Thou shalt love the Lord thy God with all thy heart, and with all thy soul, and with all thy mind. This is the first and great commandment.' },
        { da:'Det andet ligner det: Du skal elske din næste som dig selv. Hele loven og profeterne hviler på disse to bud.', en:'And the second is like unto it, Thou shalt love thy neighbour as thyself. On these two commandments hang all the law and the prophets.' },
      ]},
      { title:'Johannes 3:5', verses:[
        { da:'Jesus svarede: Sandelig, sandelig siger jeg dig: Den, der ikke fødes af vand og ånd, kan ikke komme ind i Guds rige.', en:'Jesus answered, Verily, verily, I say unto thee, Except a man be born of water and of the Spirit, he cannot enter into the kingdom of God.' },
      ]},
      { title:'Johannes 3:16-17', verses:[
        { da:'Thi således elskede Gud verden, at han gav sin søn, den enbårne, for at enhver, som tror på ham, ikke skal fortabes, men have evigt liv.', en:'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.' },
        { da:'Thi Gud sendte ikke sin søn til verden for at dømme verden, men for at verden skal frelses ved ham.', en:'For God sent not his Son into the world to condemn the world; but that the world through him might be saved.' },
      ]},
      { title:'Johannes 7:17', verses:[
        { da:'Hvis nogen ønsker at gøre hans vilje, skal han forstå om læren, om den er fra Gud, eller om jeg taler af mig selv.', en:'If any man will do his will, he shall know of the doctrine, whether it be of God, or whether I speak of myself.' },
      ]},
      { title:'Johannes 14:6', verses:[
        { da:'Jesus sagde til ham: Jeg er vejen og sandheden og livet; ingen kommer til Faderen uden ved mig.', en:'Jesus saith unto him, I am the way, the truth, and the life: no man cometh unto the Father, but by me.' },
      ]},
      { title:'Johannes 14:26-27', verses:[
        { da:'Men Talsmanden, Helligånden, som Faderen vil sende i mit navn, han skal lære jer alt og minde jer om alt, hvad jeg har sagt jer.', en:'But the Comforter, which is the Holy Ghost, whom the Father will send in my name, he shall teach you all things, and bring all things to your remembrance, whatsoever I have said unto you.' },
        { da:'Fred efterlader jeg jer; min fred giver jeg jer. Ikke som verden giver, giver jeg jer. Jeres hjerte må ikke forfærdes og ikke forgribe sig.', en:'Peace I leave with you, my peace I give unto you: not as the world giveth, give I unto you. Let not your heart be troubled, neither let it be afraid.' },
      ]},
      { title:'Apostlenes Gerninger 3:19-21', verses:[
        { da:'Omvend jer da og vend om, for at jeres synder kan blive udslettede, så at tider for vederkvægelse kan komme fra Herrens ansigt.', en:'Repent ye therefore, and be converted, that your sins may be blotted out, when the times of refreshing shall come from the presence of the Lord.' },
        { da:'Og at han kan sende Jesus Kristus, som er forudbestemt for jer, hvem himlen måtte modtage, indtil genoprettelsens tider for alle ting, som Gud talte om ved sine hellige profeters mund fra arilds tid.', en:'And he shall send Jesus Christ, which before was preached unto you: Whom the heaven must receive until the times of restitution of all things, which God hath spoken by the mouth of all his holy prophets since the world began.' },
      ]},
      { title:'Apostlenes Gerninger 8:14-17', verses:[
        { da:'Da apostlene i Jerusalem hørte, at Samaria havde modtaget Guds ord, sendte de Peter og Johannes til dem, som kom ned og bad for dem, for at de måtte modtage Den Hellige Ånd.', en:'Now when the apostles which were at Jerusalem heard that Samaria had received the word of God, they sent unto them Peter and John: Who, when they were come down, prayed for them, that they might receive the Holy Ghost.' },
        { da:'Thi han var endnu ikke faldet på nogen af dem; de var kun døbt til Herrens Jesu navn. Da lagde de hænderne på dem, og de modtog Den Hellige Ånd.', en:'(For as yet he was fallen upon none of them: only they were baptized in the name of the Lord Jesus.) Then laid they their hands on them, and they received the Holy Ghost.' },
      ]},
      { title:'Romerne 8:16-17', verses:[
        { da:'Ånden selv vidner med vores ånd om, at vi er Guds børn.', en:'The Spirit itself beareth witness with our spirit, that we are the children of God.' },
        { da:'Men er vi børn, er vi også arvinger — Guds arvinger og Kristi medarvinger, når vi lider med ham, for at vi også kan herliggøres med ham.', en:'And if children, then heirs; heirs of God, and joint-heirs with Christ; if so be that we suffer with him, that we may be also glorified together.' },
      ]},
      { title:'Efeserne 2:19-20', verses:[
        { da:'Så er I altså ikke længere fremmede og udlændinge, men I er de helliges medborgere og Guds husfolk.', en:'Now therefore ye are no more strangers and foreigners, but fellowcitizens with the saints, and of the household of God.' },
        { da:'Bygget på apostlenes og profeternes grundvold, med Jesus Kristus selv som den øverste hjørnesten.', en:'And are built upon the foundation of the apostles and prophets, Jesus Christ himself being the chief corner stone.' },
      ]},
      { title:'Efeserne 4:11-14', verses:[
        { da:'Og det var ham, der gav nogle til apostle, andre til profeter, andre til evangelister, andre til hyrder og lærere, for at de hellige skulle udstyres til en tjenestegerning til opbyggelse af Kristi legeme.', en:'And he gave some, apostles; and some, prophets; and some, evangelists; and some, pastors and teachers; For the perfecting of the saints, for the work of the ministry, for the edifying of the body of Christ.' },
        { da:'Indtil vi alle når frem til enheden i troen og i erkendelsen af Guds søn, til det myndige menneske, til det mål af vækst, der svarer til Kristi fylde — så vi ikke længere er umodne børn, der kastes hid og did af enhver lærdomsvind.', en:'Till we all come in the unity of the faith, and of the knowledge of the Son of God, unto a perfect man, unto the measure of the stature of the fulness of Christ: That we henceforth be no more children, tossed to and fro, and carried about with every wind of doctrine.' },
      ]},
      { title:'Jakobs Brev 1:5', verses:[
        { da:'Hvis nogen af jer mangler visdom, skal han bede til Gud, som giver alle villigt og uden bebrejdelse, og den vil blive givet ham.', en:'If any of you lack wisdom, let him ask of God, that giveth to all men liberally, and upbraideth not; and it shall be given him.' },
      ]},
      { title:'Jakobs Brev 2:17', verses:[
        { da:'Således er troen også i sig selv uden gerninger en død ting.', en:'Even so faith, if it hath not works, is dead, being alone.' },
      ]},
      { title:'Hebræerne 5:4', verses:[
        { da:'Og ingen tager selv denne ære til sig, men den, som kaldes af Gud, ligesom Aron.', en:'And no man taketh this honour unto himself, but he that is called of God, as was Aaron.' },
      ]},
    ]
  },
  {
    id:'dc', label:'Lære og Pagter', sublabel:'Doctrine & Covenants', icon:'📘', color:'#4A7C9A',
    chapters:[
      { title:'L&P 1:30', verses:[
        { da:'Den eneste sande og levende kirke på hele jordens overflade, med hvilken jeg, Herren, er velbehagelig — idet jeg taler til kirken samlet og ikke individuelt.', en:'The only true and living church upon the face of the whole earth, with which I, the Lord, am well pleased, speaking unto the church collectively and not individually.' },
      ]},
      { title:'L&P 4:2-4', verses:[
        { da:'Derfor, O du menneske, som er i Guds tjeneste, se, du arbejder med al din kraft, sjæl og sind og styrke, for at skaffe Guds rige fremgang; da vil du velsignes for at stå skyldfri foran Gud på den yderste dag.', en:'Therefore, O ye that embark in the service of God, see that ye serve him with all your heart, might, mind and strength, that ye may stand blameless before God at the last day.' },
        { da:'Thi se, marken er allerede hvid til høst; og se, den som stikker sin segl med kraft, han samler forråd, så han ikke forgår, men bringer sin sjæls frelse.', en:'Therefore, if ye have desires to serve God ye are called to the work. For behold the field is white already to harvest; and lo, he that thrusteth in his sickle with his might, the same layeth up in store that he perisheth not, but bringeth salvation to his soul.' },
        { da:'Husk tro, dyd, viden, tålmodighed, gudfrygtighed, broderkærlighed, kærlighed, ydmyghed, flid.', en:'Remember faith, virtue, knowledge, temperance, patience, brotherly kindness, godliness, charity, humility, diligence.' },
      ]},
      { title:'L&P 6:36', verses:[
        { da:'Se på mig i enhver tanke; tvivl ikke, frygt ikke.', en:'Look unto me in every thought; doubt not, fear not.' },
      ]},
      { title:'L&P 8:2-3', verses:[
        { da:'Ja, jeg vil meddele dig i dit sind og i dit hjerte ved Den Hellige Ånd, som vil komme over dig og som vil bo i dit hjerte.', en:'Yea, I will tell you in your mind and in your heart, by the Holy Ghost, which shall come upon you and which shall dwell in your heart.' },
        { da:'Nu, se, dette er åbenbaringens ånd; se, dette er den ånd, ved hvilken Moses bragte Israels børn gennem Det Røde Hav på tørt land.', en:'Now, behold, this is the spirit of revelation; behold, this is the spirit by which Moses brought the children of Israel through the Red Sea on dry ground.' },
      ]},
      { title:'L&P 9:7-9', verses:[
        { da:'Se, du overvejede ikke det i dit hjerte; thi det var rigtigt, at du skulle oversætte ved hjælp af Urim og Thummim.', en:'Behold, you have not understood; you have supposed that I would give it unto you, when you took no thought save it was to ask me.' },
        { da:'Men se, jeg siger dig, at du må undersøge det i dit sind; da må du spørge mig, om det er rigtigt, og hvis det er rigtigt, vil jeg lade dit bryst brænde i dig; og da vil du føle, at det er rigtigt.', en:'But, behold, I say unto you, that you must study it out in your mind; then you must ask me if it be right, and if it is right I will cause that your bosom shall burn within you; therefore, you shall feel that it is right.' },
        { da:'Men hvis det ikke er rigtigt, vil du ikke have sådanne følelser, men du vil have en sløvhed af tankerne, som vil få dig til at glemme det, som er forkert.', en:'But if it be not right you shall have no such feelings, but you shall have a stupor of thought that shall cause you to forget the thing which is wrong.' },
      ]},
      { title:'L&P 11:21', verses:[
        { da:'Søg ikke at forkynde mit ord, men søg først at opnå mit ord, og da skal din tunge løses; da, hvis du ønsker det, skal du have min Ånd og mit ord, ja Guds kraft til at overbevise menneskene.', en:'Seek not to declare my word, but first seek to obtain my word, and then shall your tongue be loosed; then, if you desire, you shall have my Spirit and my word, yea, the power of God unto the convincing of men.' },
      ]},
      { title:'L&P 14:7', verses:[
        { da:'Og hvis du holder mine bud og holder ud til enden, vil du have evigt liv, som er den største af alle Guds gaver.', en:'And, if you keep my commandments and endure to the end you shall have eternal life, which gift is the greatest of all the gifts of God.' },
      ]},
      { title:'L&P 18:10-11', verses:[
        { da:'Husk, at sjælens værdi er stor i Guds øjne.', en:'Remember the worth of souls is great in the sight of God.' },
        { da:'Thi se, Herren, din Forløser, led døden i kødet; og led smerte for alle mennesker, for at alle mennesker måtte omvende sig og komme til ham.', en:'For, behold, the Lord your Redeemer suffered death in the flesh; wherefore he suffered the pain of all men, that all men might repent and come unto him.' },
      ]},
      { title:'L&P 20:37', verses:[
        { da:'Alle dem, der ydmyger sig foran Gud og ønsker at blive døbt, og som er kommet frem med et knust hjerte og en ydmyg ånd, og som virkelig omvender sig fra alle deres synder, og er villige til at tage på sig Jesu Kristi navn, med den faste beslutning om at tjene ham til enden — de er egnede til at modtage dåben.', en:'All those who humble themselves before God, and desire to be baptized, and have come forth with broken hearts and contrite spirits, and witness before the church that they have truly repented of all their sins, and are willing to take upon them the name of Jesus Christ, having a determination to serve him to the end — they are received unto baptism.' },
      ]},
      { title:'L&P 50:13-14', verses:[
        { da:'Hvortil spørger jeg jer: Til hvad var I ordineret? Til at prædike mit evangelium ved Ånden, ja Talsmanden, som blev sendt frem for at lære sandheden.', en:'Wherefore, I the Lord ask you this question—unto what were ye ordained? To preach my gospel by the Spirit, even the Comforter which was sent forth to teach the truth.' },
        { da:'Og det er min hensigt, at I skal undervise kun dem, som modtager undervisningen og glæder sig deri, at I alle kan opbygges i det gode.', en:'And then received ye spirits which ye could not understand, and received them to be of God; and in this are ye justified? Behold ye shall answer this question yourselves.' },
      ]},
      { title:'L&P 58:26-27', verses:[
        { da:'Thi se, det er ikke rigtigt at et menneske skal befales i alle ting; thi han, der er tvunget i alle ting, er en doven og ikke vis tjener.', en:'For behold, it is not meet that I should command in all things; for he that is compelled in all things, the same is a slothful and not a wise servant.' },
        { da:'Se, det er glædeligt i Herrens øjne, at manden udfører mange gode gerninger af sin egen fri vilje og bringer mange retfærdighedens ting til veje og opnår en stor belønning.', en:'Verily I say, men should be anxiously engaged in a good cause, and do many things of their own free will, and bring to pass much righteousness; For the power is in them, wherein they are agents unto themselves.' },
      ]},
      { title:'L&P 76:22-24', verses:[
        { da:'Og nu, efter de mange vidnesbyrd, som er givet om ham, er dette vidnesbyrd, det sidste af alle, som vi giver om ham: At han lever!', en:'And now, after the many testimonies which have been given of him, this is the testimony, last of all, which we give of him: That he lives!' },
        { da:'Thi vi så ham, nemlig til Guds højre hånd; og vi hørte stemmen, som bærer vidne om, at han er den Enbårne af Faderen.', en:'For we saw him, even on the right hand of God; and we heard the voice bearing record that he is the Only Begotten of the Father.' },
        { da:'At ved ham og gennem ham og af ham er verdenerne skabt, og beboerne deraf er avlede sønner og døtre til Gud.', en:'That by him, and through him, and of him, the worlds are and were created, and the inhabitants thereof are begotten sons and daughters unto God.' },
      ]},
      { title:'L&P 88:63', verses:[
        { da:'Træd nær til mig, og jeg vil træde nær til jer; søg mig flittigt, og I skal finde mig; bed, og I skal modtage; bank på, og det skal åbnes for jer.', en:'Draw near unto me and I will draw near unto you; seek me diligently and ye shall find me; ask, and ye shall receive; knock, and it shall be opened unto you.' },
      ]},
      { title:'L&P 121:7-8', verses:[
        { da:'Min søn, frygt fred til din sjæl; modgang og elendighed skal kun være for en kort stund hos dig.', en:'My son, peace be unto thy soul; thine adversity and thine afflictions shall be but a small moment.' },
        { da:'Og da, hvis du holder ud vel, skal Gud ophøje dig i det høje; du skal triumfere over alle dine fjender.', en:'And then, if thou endure it well, God shall exalt thee on high; thou shalt triumph over all thy foes.' },
      ]},
      { title:'L&P 130:22-23', verses:[
        { da:'Faderen har et legeme af kød og ben, ligesom håndgribeligt som menneskets; det har Sønnen også; men Den Hellige Ånd har ikke et legeme af kød og ben, men er en personlighed af ånd.', en:'The Father has a body of flesh and bones as tangible as man\'s; the Son also; but the Holy Ghost has not a body of flesh and bones, but is a personage of Spirit. Were it not so, the Holy Ghost could not dwell in us.' },
        { da:'Et menneske kan modtage Den Hellige Ånd, og den kan dale ned over ham og ikke forblive hos ham.', en:'A man may receive the Holy Ghost, and it may descend upon him and not tarry with him.' },
      ]},
      { title:'L&P 131:1-4', verses:[
        { da:'I den himmelske herlighed er der tre himle eller grader; og for at opnå den højeste, skal et menneske indgå i dette ordens embede — den nye og evige pagts embede.', en:'In the celestial glory there are three heavens or degrees; And in order to obtain the highest, a man must enter into this order of the priesthood [meaning the new and everlasting covenant of marriage].' },
        { da:'Og hvis han ikke gør det, kan han ikke opnå det. Han kan muligvis gå ind i den anden, men det er slut med hans udvidelse. Han kan ikke have ophøjelse — dette er loven.', en:'And if he does not, he cannot obtain it. He may enter into the other, but that is the end of his kingdom; he cannot have an increase.' },
      ]},
    ]
  },
  {
    id:'pogp', label:'Den Kostelige Perle', sublabel:'Pearl of Great Price', icon:'💎', color:'#8A8070',
    chapters:[
      { title:'Moses 1:39', verses:[
        { da:'Thi se, dette er mit arbejde og min herlighed — at skabe udødelighed og evigt liv for mennesket.', en:'For behold, this is my work and my glory—to bring to pass the immortality and eternal life of man.' },
      ]},
      { title:'Moses 7:18', verses:[
        { da:'Og Herren kaldte sit folk Zion, fordi de var af ét hjerte og ét sind og boede i retfærdighed; og der var ingen fattige iblandt dem.', en:'And the Lord called his people Zion, because they were of one heart and one mind, and dwelt in righteousness; and there was no poor among them.' },
      ]},
      { title:'Abraham 3:22-23', verses:[
        { da:'Nu havde Herren vist mig, Abraham, de intelligenser, som var organiseret før verden var; og iblandt alle disse var der mange af de ædle og store.', en:'Now the Lord had shown unto me, Abraham, the intelligences that were organized before the world was; and among all these there were many of the noble and great ones.' },
        { da:'Og Gud så disse sjæle, at de var gode; og han sagde til mig: Abraham, du er en af dem; du var udvalgt, inden du var født.', en:'And God saw these souls that they were good, and he stood in the midst of them, and he said: These I will make my rulers; and he said unto me: Abraham, thou art one of them; thou wast chosen before thou wast born.' },
      ]},
      { title:'Josef Smith — Historie 1:15-17', verses:[
        { da:'Jeg trak mig tilbage til skoven og knælede ned og begyndte at frembære mit hjertes ønsker for Gud.', en:'I retired to the woods and kneeled down and began to offer up the desires of my heart to God.' },
        { da:'Jeg så et lys over mit hoved, klarere end solen, som langsomt dalede ned, til det faldt over mig.', en:'I saw a pillar of light exactly over my head, above the brightness of the sun, which descended gradually until it fell upon me.' },
        { da:'Da lyset hvilede på mig, så jeg to Personer, hvis glans og herlighed trodser al beskrivelse, stående over mig i luften.', en:'When the light rested upon me I saw two Personages, whose brightness and glory defy all description, standing above me in the air.' },
      ]},
      { title:'Josef Smith — Historie 1:19', verses:[
        { da:'Det svarede mig, at jeg ikke måtte tilslutte mig nogen af dem, for de alle tog fejl; og personen, der henvendte sig til mig, sagde, at alle deres trosbekendelser var en vederstyggelighed for ham; at disse lærere alle var fordærvede.', en:'I was answered that I must join none of them, for they were all wrong; and the Personage who addressed me said that all their creeds were an abomination in his sight; that those professors were all corrupt.' },
        { da:'De nærmer sig mig med deres læber, men deres hjerte er langt fra mig, de underviser menneskenes bud som lærdomme, og har en form for gudsfrygt, men fornægter dens kraft.', en:'They draw near to me with their lips, but their hearts are far from me, they teach for doctrines the commandments of men, having a form of godliness, but they deny the power thereof.' },
      ]},
      { title:'Trosartikler 1:1-4', verses:[
        { da:'Vi tror på Gud, den evige Fader, og på hans søn Jesus Kristus og på Den Hellige Ånd.', en:'We believe in God, the Eternal Father, and in His Son, Jesus Christ, and in the Holy Ghost.' },
        { da:'Vi tror, at mennesker vil blive straffet for egne synder, og ikke for Adams overtrædelse.', en:'We believe that men will be punished for their own sins, and not for Adam\'s transgression.' },
        { da:'Vi tror, at ved Kristi forsoning kan hele menneskeheden blive frelst ved at adlyde evangeliets love og ordinanser.', en:'We believe that through the Atonement of Christ, all mankind may be saved, by obedience to the laws and ordinances of the Gospel.' },
        { da:'Vi tror, at disse evangeliets første principper og ordinanser er: tro på Herren Jesus Kristus; omvendelse; dåb ved neddykning til syndernes forladelse; håndspålæggelse for Den Hellige Ånds gave.', en:'We believe that the first principles and ordinances of the Gospel are: first, Faith in the Lord Jesus Christ; second, Repentance; third, Baptism by immersion for the remission of sins; fourth, Laying on of hands for the gift of the Holy Ghost.' },
      ]},
      { title:'Trosartikler 1:6-7', verses:[
        { da:'Vi tror i den samme organisation, som eksisterede i den første kirke, nemlig apostle, profeter, hyrder, lærere, evangelister og så videre.', en:'We believe in the same organization that existed in the Primitive Church, namely, apostles, prophets, pastors, teachers, evangelists, and so forth.' },
        { da:'Vi tror i tungernes gave, profeti, åbenbaring, syner, helbredelse, tungernes tydning og så videre.', en:'We believe in the gift of tongues, prophecy, revelation, visions, healing, interpretation of tongues, and so forth.' },
      ]},
      { title:'Trosartikler 1:13', verses:[
        { da:'Vi tror i at være ærlige, sande, kyske, velvillige og dydige og i at gøre godt mod alle mennesker; vi følger Paulus\' formaning — Vi tror alle ting, vi håber alle ting, vi har udholdt mange ting og håber at kunne holde ud alle ting.', en:'We believe in being honest, true, chaste, benevolent, virtuous, and in doing good to all men; indeed, we may say that we follow the admonition of Paul—We believe all things, we hope all things, we have endured many things, and hope to be able to endure all things.' },
        { da:'Hvis der er noget dydigt, kæreligt, af godt rygte eller prisværdigt, søger vi efter disse ting.', en:'If there is anything virtuous, lovely, or of good report or praiseworthy, we seek after these things.' },
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

// ─── DANISH FLAG SVG ─────────────────────────────────────────────────────────
function DanishFlag({ width = 48, height = 8 }) {
  const cx = Math.round(width * 0.38), cw = Math.round(width * 0.12);
  const cy = Math.round(height * 0.35), ch = Math.round(height * 0.3);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ borderRadius: 2, display: 'block' }}>
      <rect width={width} height={height} fill={C.red} />
      <rect x={cx} width={cw} height={height} fill={C.white} />
      <rect y={cy} width={width} height={ch} fill={C.white} />
    </svg>
  );
}

// ─── STREAK BADGE (compact, for header) ──────────────────────────────────────
function StreakBadge({ streak }) {
  const cur = streak.current || 0;
  const ms = [...MILESTONES].reverse().find(m => m.days <= cur);
  return (
    <div style={{ background: 'rgba(212,133,10,0.2)', border: `0.5px solid ${C.amber}`, borderRadius: 20, padding: '5px 11px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <span style={{ fontSize: 16, lineHeight: 1 }}>{cur === 0 ? '✨' : ms ? ms.icon : '🔥'}</span>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.amber, lineHeight: 1 }}>{cur}</div>
        <div style={{ fontSize: 9, color: 'rgba(212,133,10,0.7)', lineHeight: 1, letterSpacing: '0.08em', textTransform: 'uppercase' }}>streak</div>
      </div>
    </div>
  );
}

// ─── STREAK CARD (full — for Countdown tab) ───────────────────────────────────
function StreakCard({ streak }) {
  const cur = streak.current || 0;
  const nextMs = MILESTONES.find(m => m.days > cur);
  const prevMs = [...MILESTONES].reverse().find(m => m.days <= cur);
  const pct = nextMs ? Math.round(((cur - (prevMs?.days || 0)) / (nextMs.days - (prevMs?.days || 0))) * 100) : 100;
  const last30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86400000);
    const str = d.toISOString().split('T')[0];
    return { str, studied: (streak.log || []).includes(str), isToday: str === toDay() };
  });
  const earned = MILESTONES.filter(m => m.days <= cur);
  return (
    <div style={{ background: C.surface, border: `0.5px solid ${C.border}`, borderRadius: 18, padding: 20, marginBottom: 16, borderTop: `3px solid ${C.amber}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.faint, marginBottom: 4 }}>Daglig Streak</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'Georgia,serif', fontSize: 48, fontWeight: 400, color: C.red, lineHeight: 1 }}>{cur}</span>
            <span style={{ fontSize: 15, color: C.muted }}>dage</span>
          </div>
          {prevMs && <div style={{ fontSize: 13, color: prevMs.clr, marginTop: 2 }}>{prevMs.icon} {prevMs.label}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: C.faint }}>Længste streak</div>
          <div style={{ fontFamily: 'Georgia,serif', fontSize: 26, color: C.muted }}>{streak.longest || 0}</div>
          <div style={{ fontSize: 11, color: C.faint, marginTop: 6 }}>Dage studeret i alt</div>
          <div style={{ fontFamily: 'Georgia,serif', fontSize: 22, color: C.muted }}>{streak.total || 0}</div>
        </div>
      </div>
      {nextMs && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 12, color: C.muted }}>Næste: {nextMs.icon} <strong>{nextMs.label}</strong></span>
            <span style={{ fontSize: 12, color: C.muted }}>{nextMs.days - cur} dage</span>
          </div>
          <div style={{ height: 8, background: C.border, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: `linear-gradient(to right,${C.red},${C.amber})`, transition: 'width 0.8s' }} />
          </div>
        </div>
      )}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: C.faint, marginBottom: 7, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Seneste 30 dage</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10,1fr)', gap: 4 }}>
          {last30.map((d, i) => <div key={i} title={d.str} style={{ aspectRatio: '1', borderRadius: 3, background: d.studied ? C.red : d.isToday ? C.softAmber : C.border, border: d.isToday ? `1.5px solid ${C.amber}` : 'none' }} />)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: C.faint }}>
          <span>30 dage siden</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: C.red }} /><span>Studeret</span>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: C.border, marginLeft: 6 }} /><span>Misset</span>
          </div>
          <span>I dag</span>
        </div>
      </div>
      {earned.length > 0
        ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{earned.map(m => <div key={m.days} style={{ background: C.softAmber, border: `0.5px solid ${C.border}`, borderRadius: 20, padding: '4px 11px', fontSize: 12, color: C.amber }}>{m.icon} {m.label}</div>)}</div>
        : <div style={{ background: C.softAmber, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: C.amber, textAlign: 'center' }}>🌟 Studér i dag for din første milepæl — <strong>Første skridt!</strong></div>}
    </div>
  );
}

// ─── AZURE SETTINGS PANEL ────────────────────────────────────────────────────
function AzureSettingsPanel({ onClose }) {
  const [localKey, setLocalKey] = useLS('sa-azure-key', '');
  const [localRegion, setLocalRegion] = useLS('sa-azure-region', 'eastus');
  const [testState, setTestState] = useState(null);
  const REGIONS = ['eastus','westeurope','northeurope','eastus2','westus','australiaeast','uksouth'];
  const handleTest = async () => {
    setTestState('testing');
    try { await speakDA('Hej søster Aneca! Din danske Azure-stemme virker!'); setTestState('ok'); } catch { setTestState('fail'); }
    setTimeout(() => setTestState(null), 4000);
  };
  return (
    <div style={{ background: C.surface, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>🔊 Azure TTS — da-DK-ChristelNeural</div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 16, cursor: 'pointer', color: C.faint }}>✕</button>
      </div>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, marginBottom: 14, padding: '10px 12px', background: C.softBlue, borderRadius: 9 }}>
        Brug en <strong>Microsoft Azure Speech</strong>-nøgle for den bedste danske udtale med <strong>ChristelNeural</strong>. Gratis nøgle på <strong>portal.azure.com</strong> → Create a resource → Speech.
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: C.muted, marginBottom: 5 }}>Azure Speech API-nøgle</div>
        <input type="password" value={localKey} onChange={e => setLocalKey(e.target.value)} placeholder="Indsæt din Azure KEY 1 her..."
          style={{ width: '100%', padding: '9px 12px', background: C.surface, border: `0.5px solid ${C.border}`, borderRadius: 9, fontSize: 13, color: C.ink, fontFamily: 'monospace', boxSizing: 'border-box' }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: C.muted, marginBottom: 5 }}>Azure Region</div>
        <select value={localRegion} onChange={e => setLocalRegion(e.target.value)}
          style={{ width: '100%', padding: '9px 12px', background: C.surface, border: `0.5px solid ${C.border}`, borderRadius: 9, fontSize: 13, color: C.ink, boxSizing: 'border-box' }}>
          {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      {testState === 'ok'      && <div style={{ fontSize: 13, color: C.forest, marginBottom: 12, textAlign: 'center' }}>🎉 Stemmetest lykkedes!</div>}
      {testState === 'fail'    && <div style={{ fontSize: 13, color: C.red, marginBottom: 12, textAlign: 'center' }}>❌ Test mislykkedes — tjek din nøgle og region</div>}
      {testState === 'testing' && <div style={{ fontSize: 13, color: C.muted, marginBottom: 12, textAlign: 'center' }}>🔊 Tester stemme...</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleTest} disabled={!localKey.trim() || testState === 'testing'}
          style={{ flex: 1, padding: 10, borderRadius: 10, fontSize: 13, cursor: 'pointer', border: `0.5px solid ${C.border}`, background: C.surface, color: C.muted, fontFamily: 'inherit' }}>🔊 Test stemme</button>
        <button onClick={onClose} disabled={!localKey.trim()}
          style={{ flex: 2, padding: 10, borderRadius: 10, fontSize: 13, cursor: 'pointer', border: 'none', background: localKey.trim() ? C.red : C.border, color: C.onDark, fontWeight: 500, fontFamily: 'inherit' }}>Gem og aktiver</button>
      </div>
      <div style={{ marginTop: 14, padding: '10px 12px', background: C.surface, borderRadius: 9, fontSize: 11, color: C.faint, lineHeight: 1.7 }}>
        🔒 Din nøgle gemmes kun på denne enhed. Den sendes kun direkte til Microsoft Azure.
      </div>
    </div>
  );
}

// ─── CERTIFICATE ──────────────────────────────────────────────────────────────
function Certificate({ score, streak }) {
  return (
    <div style={{ background: 'linear-gradient(135deg,#fff8f5,#ffe8ec)', border: `2px solid ${C.red}`, borderRadius: 16, padding: 24, marginBottom: 12, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: `linear-gradient(to right,${C.red},${C.amber},${C.red})` }} />
      <div style={{ fontSize: 32, marginBottom: 8 }}>🇩🇰</div>
      <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.faint, marginBottom: 4 }}>Missionsforberedelsescertifikat</div>
      <div style={{ fontFamily: 'Georgia,serif', fontSize: 22, color: C.red, marginBottom: 4 }}>Sister Gia Aneca</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Belgium Netherlands Mission · Dansk (da-DK)</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 16 }}>
        <div><div style={{ fontFamily: 'Georgia,serif', fontSize: 36, color: C.red }}>{score}%</div><div style={{ fontSize: 11, color: C.faint }}>Parathed</div></div>
        <div><div style={{ fontFamily: 'Georgia,serif', fontSize: 36, color: C.amber }}>{streak.current || 0}</div><div style={{ fontSize: 11, color: C.faint }}>Dages streak</div></div>
        <div><div style={{ fontFamily: 'Georgia,serif', fontSize: 36, color: C.forest }}>{streak.total || 0}</div><div style={{ fontSize: 11, color: C.faint }}>Dage studeret</div></div>
      </div>
      <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic' }}>"Jeg vil gå og gøre det, som Herren befaler." — 1 Nephi 3:7</div>
      <div style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>MTC Begynder: 7. oktober 2026</div>
    </div>
  );
}

// ─── READINESS SCORE ─────────────────────────────────────────────────────────
function calcReadiness(alphaData, phraseData, vocabData, cultureData, readerData, speakingData) {
  const totalPhrases = PHRASE_CATEGORIES.reduce((a, c) => a + c.phrases.length, 0);
  const totalVocab   = VOCAB_CATS.reduce((a, c) => a + c.words.length, 0);
  const totalSpeakEx = SPEAK_LEVELS.reduce((a, l) => a + l.exercises.length, 0);
  const lettersMastered = Object.values(alphaData.plays || {}).filter(v => v >= 3).length;
  const phrasesMastered = Object.keys(phraseData.mastered || {}).length;
  const vocabHeard      = Object.keys(vocabData.heard || {}).length;
  const cultureRead     = Object.keys(cultureData.read || {}).length;
  const textsCompleted  = Object.keys(readerData.completed || {}).length;
  const speakPracticed  = Object.keys(speakingData.scores || {}).length;
  const a = (lettersMastered / 29) * 15;
  const b = (phrasesMastered / totalPhrases) * 25;
  const c = (vocabHeard / totalVocab) * 20;
  const d = (cultureRead / 6) * 15;
  const e = (textsCompleted / 5) * 10;
  const f = Math.min((speakPracticed / totalSpeakEx) * 15, 15);
  return {
    total: Math.round(a + b + c + d + e + f),
    breakdown: [
      { label: 'Alfabet mestret',    score: Math.round(a), max: 15, value: `${lettersMastered}/29`,           color: C.red },
      { label: 'Sætninger mestret',  score: Math.round(b), max: 25, value: `${phrasesMastered}/${totalPhrases}`, color: C.canal },
      { label: 'Ordforråd hørt',     score: Math.round(c), max: 20, value: `${vocabHeard}/${totalVocab}`,     color: C.amber },
      { label: 'Kultur studeret',    score: Math.round(d), max: 15, value: `${cultureRead}/6`,                color: C.forest },
      { label: 'Tekster gennemført', score: Math.round(e), max: 10, value: `${textsCompleted}/5`,             color: C.viking },
      { label: 'Tale øvelse',        score: Math.round(f), max: 15, value: `${speakPracticed}/${totalSpeakEx}`, color: C.cobble },
    ],
  };
}

// ─── TABS + HEADER (stateful, merged into App) ────────────────────────────────
const TABS = [
  { id:'countdown', icon:'⏱',  da:'Nedtælling',  en:'Countdown'   },
  { id:'path',      icon:'🗺',  da:'Min Vej',     en:'My Path'     },
  { id:'alphabet',  icon:'🔡',  da:'Alfabet',     en:'Alphabet'    },
  { id:'phrases',   icon:'🙏',  da:'Sætninger',   en:'Phrases'     },
  { id:'culture',   icon:'🏛',  da:'Kultur',      en:'Culture'     },
  { id:'reader',    icon:'📖',  da:'Læsning',     en:'Reader'      },
  { id:'vocab',     icon:'📚',  da:'Ordforråd',   en:'Vocabulary'  },
  { id:'speaking',  icon:'🎤',  da:'Tale',        en:'Speaking'    },
  { id:'scripture', icon:'📜',  da:'Skrifter',    en:'Scriptures'  },
  { id:'ai',        icon:'🤖',  da:'Samtale',     en:'Conversation'},
];

// ─── TAB: COUNTDOWN ───────────────────────────────────────────────────────────

function TabCountdown({ streak, alphaData, phraseData, cultureData, readerData }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);

  const MTC_DATE = new Date('2026-10-07T09:00:00');
  const diff = MTC_DATE - now;
  const months  = Math.max(0, Math.floor(diff / (30.44 * 86400000)));
  const weeks   = Math.max(0, Math.floor(diff / (7 * 86400000)));
  const days    = Math.max(0, Math.floor(diff / 86400000));
  const hours   = Math.max(0, Math.floor((diff % 86400000) / 3600000));
  const minutes = Math.max(0, Math.floor((diff % 3600000) / 60000));
  const seconds = Math.max(0, Math.floor((diff % 60000) / 1000));
  const done    = diff <= 0;

  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const phrase = DAILY_PHRASES[dayOfYear % DAILY_PHRASES.length];

  const totalPhrases = PHRASE_CATEGORIES.reduce((a,c) => a + c.phrases.length, 0);
  const totalSegs    = READER_TEXTS.reduce((a,t) => a + t.segments.length, 0);
  const stats = [
    { label:'Bogstaver hørt',     value:`${Object.keys(alphaData.plays||{}).length}/29`,                     color:C.canal },
    { label:'Sætninger hørt',     value:`${Object.keys(phraseData.plays||{}).length}/${totalPhrases}`,        color:C.amber },
    { label:'Sætninger mestret',  value:`${Object.keys(phraseData.mastered||{}).length}/${totalPhrases}`,     color:C.red },
    { label:'Kultur studeret',    value:`${Object.keys(cultureData.read||{}).length}/${CULTURE_SECTIONS.length}`, color:C.forest },
    { label:'Læsning segmenter',  value:`${Object.keys(readerData.progress||{}).length}/${totalSegs}`,        color:C.viking },
    { label:'Tekster gennemført', value:`${Object.keys(readerData.completed||{}).length}/${READER_TEXTS.length}`, color:C.cobble },
  ];

  return (
    <div style={{ paddingTop: 20 }}>
      {/* Heading */}
      <div style={{ textAlign: 'center', marginBottom: 10 }}>
        <div style={{ display: 'inline-block' }}><DanishFlag width={56} height={9} /></div>
        <div style={{ marginTop: 8, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.muted }}>Home MTC begynder</div>
      </div>
      <h2 style={{ fontFamily: 'Georgia,serif', textAlign: 'center', fontSize: 20, fontWeight: 400, color: C.red, marginBottom: 20 }}>
        7. oktober 2026 · Belgium Netherlands Mission 🇩🇰
      </h2>
      {/* Countdown tiles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 9, marginBottom: 24 }}>
        {[{l:'Måneder',v:months},{l:'Uger',v:weeks},{l:'Dage',v:days},{l:'Timer',v:hours},{l:'Minutter',v:minutes},{l:'Sekunder',v:seconds}].map((u,i) => (
          <div key={u.l} style={{ background: i < 3 ? C.red : C.viking, borderRadius: 14, padding: '14px 10px', minWidth: 64, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
            <div style={{ fontFamily: 'Georgia,serif', fontSize: 30, fontWeight: 400, color: C.onDark, lineHeight: 1 }}>{done ? '0' : String(u.v ?? '--').padStart(2,'0')}</div>
            <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,248,245,0.6)', marginTop: 4 }}>{u.l}</div>
          </div>
        ))}
      </div>
      {/* Full streak card */}
      <StreakCard streak={streak} />
      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9, marginBottom: 18 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: C.surface, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 12, textAlign: 'center', borderTop: `3px solid ${s.color}` }}>
            <div style={{ fontFamily: 'Georgia,serif', fontSize: 18, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 10, color: C.faint, marginTop: 5, lineHeight: 1.3 }}>{s.label}</div>
          </div>
        ))}
      </div>
      {/* Daily phrase card */}
      <div style={{ borderRadius: 18, overflow: 'hidden', marginBottom: 18, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
        <div style={{ background: C.viking, padding: '20px 24px' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(212,133,10,0.85)', marginBottom: 9 }}>Sætning for i dag · Daily phrase</div>
          <div style={{ fontFamily: 'Georgia,serif', fontSize: 19, color: C.onDark, marginBottom: 6, lineHeight: 1.45 }}>"{phrase.da}"</div>
          <div style={{ fontSize: 13, color: 'rgba(255,248,245,0.6)', marginBottom: 14 }}>{phrase.en}</div>
          <button onClick={() => speakDA(phrase.da, 0.75)} style={{ background: 'rgba(255,255,255,0.12)', border: `0.5px solid ${C.amber}`, borderRadius: 10, padding: '8px 16px', color: C.onDark, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>🔊 Hør på dansk</button>
        </div>
      </div>
      {/* Mission info */}
      <div style={{ background: C.surface, borderRadius: 14, padding: 16, border: `0.5px solid ${C.border}` }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 11 }}><DanishFlag width={42} height={7} /><span style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>Missionsoversigt</span></div>
        {[['Missionær','Sister Gia Aneca'],['Mission','Belgium Netherlands Mission'],['Sprog','Dansk (da-DK)'],['MTC Start','7. oktober 2026'],['Tjeneste','18 måneder']].map(([k,v]) => (
          <div key={k} style={{ display: 'flex', gap: 12, padding: '5px 0', borderBottom: `0.5px solid ${C.border}` }}>
            <div style={{ fontSize: 12, color: C.faint, width: 100, flexShrink: 0 }}>{k}</div>
            <div style={{ fontSize: 12, color: C.ink }}>{v}</div>
          </div>
        ))}
      </div>
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

function TabPath({ streak, alphaData, phraseData, vocabData, cultureData, readerData, speakData, setTab }) {
  const r = calcReadiness(alphaData, phraseData, vocabData, cultureData, readerData, speakData);
  const missionReady = r.total >= 80;
  const [curriculum, setCurriculum] = useLS('sa-curriculum', CURRICULUM.map(x => ({...x})));
  const toggleWeek = (i) => setCurriculum(curriculum.map((w, idx) => idx === i ? {...w, done: !w.done} : w));

  return (
    <div style={{ paddingTop: 20 }}>
      {/* Readiness gauge + breakdown */}
      <div style={{ background: C.surface, border: `0.5px solid ${C.border}`, borderRadius: 18, padding: 20, marginBottom: 18, borderTop: `3px solid ${C.red}` }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 16 }}>
          <div style={{ position: 'relative', width: 100, height: 100, flexShrink: 0 }}>
            <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="50" cy="50" r="42" fill="none" stroke={C.border} strokeWidth="10" />
              <circle cx="50" cy="50" r="42" fill="none" stroke={missionReady ? C.forest : C.red}
                strokeWidth="10" strokeDasharray={`${(r.total/100)*264} 264`}
                strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.5s' }} />
            </svg>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Georgia,serif', fontSize: 26, color: missionReady ? C.forest : C.red, lineHeight: 1 }}>{r.total}</div>
              <div style={{ fontSize: 9, color: C.faint }}>af 100</div>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.faint, marginBottom: 4 }}>Missionsforberedelse</div>
            {missionReady
              ? <div style={{ background: C.forest, color: C.onDark, borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>🎓 Certifikat opnået!</div>
              : <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>{80 - r.total} point til certifikatet</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[{id:'alphabet',da:'Alfabet'},{id:'phrases',da:'Sætninger'},{id:'vocab',da:'Ordforråd'},{id:'speaking',da:'Tale'}].map(x => (
                <button key={x.id} onClick={() => setTab(x.id)} style={{ background: C.red, border: 'none', borderRadius: 6, padding: '4px 10px', color: C.onDark, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>→ {x.da}</button>
              ))}
            </div>
          </div>
        </div>
        {r.breakdown.map(d => (
          <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
            <span style={{ width: 130, fontSize: 11, textAlign: 'right', color: C.faint, flexShrink: 0 }}>{d.label}</span>
            <div style={{ flex: 1, height: 8, background: C.border, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(d.score/d.max)*100}%`, background: d.color, borderRadius: 4, transition: 'width 0.4s' }} />
            </div>
            <span style={{ width: 44, fontSize: 11, color: d.color, fontWeight: 600, flexShrink: 0 }}>{d.score}/{d.max}</span>
            <span style={{ fontSize: 10, color: C.faint, width: 56, flexShrink: 0 }}>{d.value}</span>
          </div>
        ))}
      </div>
      {/* Streak summary */}
      <div style={{ background: C.surface, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: '14px 16px', marginBottom: 18, display: 'flex', gap: 16 }}>
        {[['Nuværende', `${streak.current||0} dage`, C.amber],['Længste', `${streak.longest||0} dage`, C.red],['I alt', `${streak.total||0}`, C.canal]].map(([l,v,c]) => (
          <div key={l} style={{ flex: 1, textAlign: 'center', borderLeft: `2px solid ${c}`, paddingLeft: 10 }}>
            <div style={{ fontFamily: 'Georgia,serif', fontSize: 20, color: c }}>{v}</div>
            <div style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>
      {/* 12-Week Curriculum */}
      <div style={{ background: C.surface, border: `0.5px solid ${C.border}`, borderRadius: 18, padding: 18, marginBottom: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.red, marginBottom: 12, fontFamily: 'Georgia,serif' }}>📅 12-Ugers Pensum</div>
        {curriculum.map((w, i) => (
          <div key={w.week} onClick={() => toggleWeek(i)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `0.5px solid ${C.border}`, cursor: 'pointer' }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: w.done ? C.red : C.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: w.done ? C.onDark : C.muted, fontWeight: 700 }}>
              {w.done ? '✓' : w.week}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: w.done ? C.faint : C.ink, textDecoration: w.done ? 'line-through' : 'none' }}>{w.title}</div>
              <div style={{ fontSize: 11, color: C.faint }}>{w.en}</div>
            </div>
          </div>
        ))}
        <div style={{ fontSize: 12, color: C.faint, marginTop: 10, textAlign: 'center' }}>
          {curriculum.filter(w => w.done).length} / 12 uger gennemført
        </div>
      </div>
    </div>
  );
}

// ─── TAB: ALPHABET ────────────────────────────────────────────────────────────

function TabAlphabet({ alphaData, saveAlpha }) {
  const plays = alphaData.plays || {};
  const [selected, setSelected] = useState(null);
  const [section, setSection] = useState('letters');
  const [songPlaying, setSongPlaying] = useState(false);
  const [songIdx, setSongIdx] = useState(-1);
  const songRef = useRef(null);
  const [micLetter, setMicLetter] = useState(null);
  const [micSpecial, setMicSpecial] = useState(null);

  const logPlay = (letter) => { const p = {...plays, [letter]: (plays[letter]||0)+1}; saveAlpha({...alphaData, plays: p}); };
  const masteredCount = Object.values(plays).filter(v => v >= 3).length;

  const playSong = () => {
    if (songPlaying) { setSongPlaying(false); setSongIdx(-1); if (songRef.current) clearTimeout(songRef.current); window.speechSynthesis?.cancel(); return; }
    setSongPlaying(true);
    let delay = 0;
    ALPHABET_DATA.forEach((l, i) => {
      songRef.current = setTimeout(() => {
        setSongIdx(i); speakDA(l.name, 0.8);
        if (i === ALPHABET_DATA.length - 1) setTimeout(() => { setSongPlaying(false); setSongIdx(-1); }, 1200);
      }, delay);
      delay += 900;
    });
  };

  function LetterMic({ letter, name }) {
    const mic = useLetterMic(name);
    if (micLetter !== letter) return <button onClick={() => setMicLetter(letter)} style={{ background: 'rgba(255,255,255,0.14)', border: 'none', borderRadius: 9, padding: '7px 12px', color: C.onDark, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>🎤 Sig det</button>;
    return (
      <div>
        <MicResult {...mic} onStart={mic.start} color={C.red} />
        <button onClick={() => { mic.reset(); setMicLetter(null); }} style={{ marginTop: 6, background: 'transparent', border: 'none', color: 'rgba(255,248,245,0.45)', fontSize: 11, cursor: 'pointer' }}>✕ Luk</button>
      </div>
    );
  }

  function SpecialMic({ combo, example, clr }) {
    const mic = useLetterMic(example);
    if (micSpecial !== combo) return <button onClick={() => setMicSpecial(combo)} style={{ background: 'rgba(255,255,255,0.14)', border: 'none', borderRadius: 9, padding: '7px 12px', color: C.onDark, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>🎤 Sig det</button>;
    return (
      <div>
        <MicResult {...mic} onStart={mic.start} color={clr} />
        <button onClick={() => { mic.reset(); setMicSpecial(null); }} style={{ marginTop: 6, background: 'transparent', border: 'none', color: 'rgba(255,248,245,0.45)', fontSize: 11, cursor: 'pointer' }}>✕ Luk</button>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 20 }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {['letters','special'].map(s => (
          <button key={s} onClick={() => setSection(s)} style={{ background: section===s ? C.red : C.surface, color: section===s ? C.onDark : C.muted, border: `0.5px solid ${section===s ? C.red : C.border}`, borderRadius: 9, padding: '7px 14px', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
            {s === 'letters' ? '🔤 Bogstaver' : '⭐ Særlige lyde'}
          </button>
        ))}
        <button onClick={playSong} style={{ background: songPlaying ? C.red : C.surface, color: songPlaying ? C.onDark : C.muted, border: `0.5px solid ${songPlaying ? C.red : C.border}`, borderRadius: 9, padding: '7px 14px', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', marginLeft: 'auto' }}>
          {songPlaying ? '⏹ Stop sang' : '🎵 Alfabet-sang'}
        </button>
      </div>
      {/* Progress bar */}
      <div style={{ background: C.surface, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: '12px 16px', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: C.muted }}>Bogstaver mestret (3+ lyttehændelser)</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: C.red }}>{masteredCount}/29</span>
        </div>
        <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${(masteredCount/29)*100}%`, height: '100%', background: C.red, borderRadius: 3 }} />
        </div>
      </div>

      {section === 'letters' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ALPHABET_DATA.map((l, i) => {
            const count = plays[l.letter] || 0;
            const mastered = count >= 3;
            const isActive = songPlaying && songIdx === i;
            const isSpecial = ['Æ','Ø','Å'].includes(l.letter);
            return (
              <div key={l.letter} style={{ background: isActive ? '#1a3a68' : isSpecial ? C.softAmber : C.surface, border: `0.5px solid ${isSpecial ? C.amber : C.border}`, borderRadius: 14, overflow: 'hidden', boxShadow: isActive ? `0 0 0 2px ${C.amber}` : 'none', transition: 'all 0.2s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', cursor: 'pointer' }} onClick={() => { logPlay(l.letter); speakDA(l.name, 0.75); setTimeout(() => speakDA(l.example, 0.85), 950); }}>
                  <div style={{ width: 46, height: 46, borderRadius: 12, background: mastered ? C.red : isSpecial ? C.amber : C.border, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontFamily: 'Georgia,serif', fontSize: 22, color: mastered||isSpecial ? C.onDark : C.muted }}>{l.letter}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontFamily: 'Georgia,serif', fontSize: 15, color: C.ink }}>{l.name}</span>
                      <span style={{ fontSize: 12, color: C.faint }}>{l.phonetic}</span>
                      <span style={{ fontSize: 11, fontFamily: 'monospace', color: C.canal }}>{l.ipa}</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.muted }}><strong style={{ color: C.red }}>{l.example}</strong> = {l.meaning}</div>
                    <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>{l.tip}</div>
                  </div>
                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    {count > 0 && <span style={{ fontSize: 10, color: mastered ? C.red : C.faint }}>{count}×{mastered?' ✓':''}</span>}
                    {isActive && <span style={{ fontSize: 18 }}>▶️</span>}
                  </div>
                </div>
                <div style={{ padding: '0 16px 12px' }}>
                  <LetterMic letter={l.letter} name={l.name} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {section === 'special' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {SPECIAL_SOUNDS.map(s => (
            <div key={s.combo} style={{ background: 'linear-gradient(135deg,#1A1A2E,#2C3E6B)', border: `0.5px solid ${s.clr}40`, borderRadius: 16, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <div style={{ fontFamily: 'Georgia,serif', fontSize: 34, color: s.clr, lineHeight: 1, marginBottom: 4 }}>{s.combo}</div>
                  <div style={{ fontSize: 13, fontFamily: 'monospace', color: 'rgba(255,248,245,0.7)', marginBottom: 2 }}>{s.ipa}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,248,245,0.5)' }}>{s.why}</div>
                </div>
                <button onClick={() => speakDA(s.example, 0.75)} style={{ background: `${s.clr}33`, border: `0.5px solid ${s.clr}66`, borderRadius: 10, padding: '9px 13px', cursor: 'pointer', color: s.clr, fontSize: 13, fontFamily: 'inherit' }}>🔊 {s.example}</button>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: C.onDark, marginBottom: 4 }}>{s.tip}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,248,245,0.6)' }}>Eksempel: <strong style={{ color: s.clr }}>{s.example}</strong> = {s.meaning}</div>
              </div>
              <SpecialMic combo={s.combo} example={s.example} clr={s.clr} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── TAB: PHRASES ─────────────────────────────────────────────────────────────

function TabPhrases({ phraseData, savePhrases }) {
  const [catIdx, setCatIdx] = useState(0);
  const [showWbw, setShowWbw] = useState({});
  const [micPhrase, setMicPhrase] = useState(null);
  const plays    = phraseData.plays    || {};
  const scores   = phraseData.scores   || {};
  const mastered = phraseData.mastered || {};

  const cat = PHRASE_CATEGORIES[catIdx];
  const logPlay  = id => { const p={...plays,[id]:(plays[id]||0)+1}; savePhrases({...phraseData,plays:p}); };
  const logScore = (id, score) => {
    const s = {...scores,[id]:score};
    const m = {...mastered};
    if (score >= 80) m[id]=true; else delete m[id];
    savePhrases({...phraseData,scores:s,mastered:m});
  };

  function PhraseMic({ phraseId, text }) {
    const mic = useLetterMic(text);
    useEffect(() => { if (mic.score !== null) logScore(phraseId, mic.score); }, [mic.score]);
    if (micPhrase !== phraseId) return (
      <button onClick={() => setMicPhrase(phraseId)} style={{ background: C.softRed, border: `0.5px solid ${C.red}`, borderRadius: 7, padding: '5px 11px', cursor: 'pointer', fontSize: 12, color: C.red, fontFamily: 'inherit' }}>🎤 Optag</button>
    );
    return (
      <div style={{ background: `linear-gradient(135deg,${C.red},#9A0821)`, borderRadius: 12, padding: 14, marginTop: 10 }}>
        <MicResult {...mic} onStart={mic.start} color={C.red} />
        <button onClick={() => { mic.reset(); setMicPhrase(null); }} style={{ marginTop: 8, background: 'transparent', border: 'none', color: 'rgba(255,248,245,0.45)', fontSize: 11, cursor: 'pointer' }}>✕ Luk</button>
      </div>
    );
  }

  const totalPhrases = PHRASE_CATEGORIES.reduce((a,c)=>a+c.phrases.length,0);
  const masteredCount = Object.keys(mastered).length;
  const toggleWbw = (id) => setShowWbw(s => ({ ...s, [id]: !s[id] }));

  return (
    <div style={{ paddingTop: 20 }}>
      {/* Progress */}
      <div style={{ background: C.surface, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: '12px 16px', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: C.muted }}>Sætninger mestret</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: C.red }}>{masteredCount}/{totalPhrases}</span>
        </div>
        <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${(masteredCount/totalPhrases)*100}%`, height: '100%', background: C.red, borderRadius: 3 }} />
        </div>
      </div>
      {/* Category tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {PHRASE_CATEGORIES.map((c, i) => (
          <button key={c.id} onClick={() => setCatIdx(i)} style={{ background: catIdx===i ? c.color : C.surface, color: catIdx===i ? C.onDark : C.muted, border: `0.5px solid ${catIdx===i ? c.color : C.border}`, borderRadius: 9, padding: '7px 14px', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: catIdx===i ? 500 : 400 }}>{c.label}</button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: C.faint, marginBottom: 14 }}>
        <strong style={{ color: cat.color }}>{cat.label}</strong> — {cat.sublabel} · 🔊 Hør · 🔍 Ord-for-ord · 🎤 Optag
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {cat.phrases.map((p, i) => {
          const pid = `${cat.id}-${i}`;
          const isMastered = !!mastered[pid];
          const sc = scores[pid];
          const played = (plays[pid]||0) > 0;
          return (
            <div key={pid} style={{ background: isMastered ? C.softGreen : C.surface, border: `0.5px solid ${isMastered ? C.forest : C.border}`, borderRadius: 14, padding: 16, borderLeft: `4px solid ${isMastered ? C.forest : played ? cat.color : C.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'Georgia,serif', fontSize: 17, color: C.ink, lineHeight: 1.35, marginBottom: 4 }}>{p.da}</div>
                  <div style={{ fontSize: 13, color: C.muted, fontStyle: 'italic' }}>{p.en}</div>
                </div>
                {isMastered && <span style={{ fontSize: 18, marginLeft: 10 }}>✅</span>}
              </div>
              {p.note && <div style={{ fontSize: 11, color: C.amber, marginBottom: 10, padding: '5px 10px', background: C.softAmber, borderRadius: 7 }}>💡 {p.note}</div>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={() => { logPlay(pid); speakDA(p.da, 0.75); }} style={{ background: cat.color, border: 'none', borderRadius: 7, padding: '6px 13px', color: C.onDark, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>🔊 Hør</button>
                <button onClick={() => toggleWbw(pid)} style={{ background: showWbw[pid] ? C.softAmber : C.surface, border: `0.5px solid ${C.amber}`, borderRadius: 7, padding: '6px 13px', cursor: 'pointer', fontSize: 12, color: C.amber, fontFamily: 'inherit' }}>🔍 Ord-for-ord</button>
                <PhraseMic phraseId={pid} text={p.da} />
                {sc != null && <span style={{ fontSize: 13, fontWeight: 600, color: sc>=80 ? C.forest : sc>=60 ? C.amber : C.red }}>{sc}%</span>}
                {plays[pid] > 0 && <span style={{ fontSize: 11, color: C.faint }}>×{plays[pid]}</span>}
              </div>
              {showWbw[pid] && <div style={{ marginTop: 10, padding: '10px 13px', background: C.softAmber, borderRadius: 9, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>{p.wbw}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── TAB: CULTURE ─────────────────────────────────────────────────────────────

function TabCulture({ cultureData, saveCulture }) {
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

function TabReader({ readerData, saveReader }) {
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

function TabVocab({ vocabData, saveVocab }) {
  const [catIdx, setCatIdx] = useState(0);
  const [mode, setMode] = useState('flash'); // flash | quiz
  const [cardIdx, setCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [quizAnswer, setQuizAnswer] = useState('');
  const [quizResult, setQuizResult] = useState(null);
  const heard = vocabData.heard || {};
  const correct = vocabData.correct || {};

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

function TabSpeaking({ speakData, saveSpeak }) {
  const [levelIdx, setLevelIdx] = useState(0);
  const [exIdx, setExIdx] = useState(0);
  const [micEx, setMicEx] = useState(null);
  const scores = speakData.scores || {};
  const sessions = speakData.sessions || 0;

  const level = SPEAK_LEVELS[levelIdx];
  const ex = level.exercises[exIdx];

  const logScore = (key, score) => {
    saveSpeak({ ...speakData, scores: { ...scores, [key]: score }, sessions: sessions + 1 });
  };

  function ExMic({ exKey, text }) {
    const mic = useLetterMic(text);
    useEffect(() => { if (mic.score !== null) logScore(exKey, mic.score); }, [mic.score]);
    if (micEx !== exKey) return (
      <button onClick={() => setMicEx(exKey)} style={{ background: level.color, border: 'none', borderRadius: 9, padding: '8px 16px', color: C.onDark, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>🎤 Optag med mikrofon</button>
    );
    return (
      <div style={{ background: 'linear-gradient(135deg,#1A1A2E,#2C3E6B)', borderRadius: 14, padding: 16, marginTop: 10 }}>
        <MicResult {...mic} onStart={mic.start} color={level.color} />
        <button onClick={() => { mic.reset(); setMicEx(null); }} style={{ marginTop: 8, background: 'transparent', border: 'none', color: 'rgba(255,248,245,0.45)', fontSize: 11, cursor: 'pointer' }}>✕ Luk mikrofon</button>
      </div>
    );
  }

  const totalEx = SPEAK_LEVELS.reduce((a,l)=>a+l.exercises.length,0);
  const practicedCount = Object.keys(scores).length;

  return (
    <div style={{ paddingTop: 20 }}>
      {/* Progress */}
      <div style={{ background: C.surface, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: '12px 16px', marginBottom: 14, display: 'flex', gap: 20 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: C.muted }}>Øvelser praktiseret</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: C.red }}>{practicedCount}/{totalEx}</span>
          </div>
          <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${(practicedCount/totalEx)*100}%`, height: '100%', background: C.red, borderRadius: 3 }} />
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 14, color: C.red, fontWeight: 600 }}>{sessions}</div>
          <div style={{ fontSize: 10, color: C.faint }}>sessioner</div>
        </div>
      </div>
      {/* Level tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {SPEAK_LEVELS.map((l, i) => (
          <button key={l.id} onClick={() => { setLevelIdx(i); setExIdx(0); setMicEx(null); }} style={{ background: levelIdx===i ? l.color : C.surface, color: levelIdx===i ? C.onDark : C.muted, border: `0.5px solid ${levelIdx===i ? l.color : C.border}`, borderRadius: 9, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: levelIdx===i ? 500 : 400 }}>
            {l.label} — {l.sublabel}
          </button>
        ))}
      </div>
      <div style={{ background: C.softBlue, borderLeft: `3px solid ${level.color}`, borderRadius: 9, padding: '9px 13px', marginBottom: 14, fontSize: 12, color: C.canal }}>{level.note}</div>
      {/* Exercise list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {level.exercises.map((e, i) => {
          const key = `${level.id}-${e.id}`;
          const sc = scores[key];
          return (
            <div key={e.id} style={{ background: C.surface, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 16, borderLeft: `4px solid ${sc!=null?(sc>=80?C.forest:sc>=60?C.amber:C.red):C.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'Georgia,serif', fontSize: 17, color: C.ink, lineHeight: 1.4, marginBottom: 4 }}>{e.da}</div>
                  <div style={{ fontSize: 12, color: C.faint, fontStyle: 'italic' }}>{e.hint}</div>
                </div>
                {sc != null && <div style={{ fontSize: 16, fontWeight: 600, color: sc>=80?C.forest:sc>=60?C.amber:C.red, marginLeft: 10, flexShrink: 0 }}>{sc}%</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => speakDA(e.da, 0.75)} style={{ background: level.color, border: 'none', borderRadius: 7, padding: '6px 13px', color: C.onDark, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>🔊 Hør eksempel</button>
                <ExMic exKey={key} text={e.da} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── TAB: SCRIPTURE ───────────────────────────────────────────────────────────

function TabScripture({ scriptData, saveScript }) {
  const [book, setBook] = useState('bom');
  const [activeRef, setActiveRef] = useState(null);
  const [noteVal, setNoteVal] = useState('');
  const [filterBkmk, setFilterBkmk] = useState(false);
  const [playing, setPlaying] = useState(null);
  const bookmarks = scriptData.bookmarks || {};
  const notes     = scriptData.notes     || {};
  const heard     = scriptData.heard     || {};

  const toggleBkmk = ref => saveScript({...scriptData, bookmarks: {...bookmarks, [ref]: !bookmarks[ref]}});
  const saveNote   = (ref, val) => saveScript({...scriptData, notes: {...notes, [ref]: val}});
  const logHeard   = ref => saveScript({...scriptData, heard: {...heard, [ref]: (heard[ref]||0)+1}});

  const activeBook = SCRIPTURE_BOOKS.find(b => b.id === book);

  const playPassage = chap => {
    if (playing === chap.ref) { window.speechSynthesis?.cancel(); setPlaying(null); return; }
    const txt = chap.verses.map(v => v.da).join(' ');
    speakDA(txt, 0.78);
    setPlaying(chap.ref);
    logHeard(chap.ref);
    setTimeout(() => setPlaying(null), Math.max(3000, txt.length * 85));
  };

  const totalChapters = SCRIPTURE_BOOKS.reduce((a,b) => a+b.chapters.length, 0);
  const heardCount    = Object.keys(heard).length;
  const bookmarkCount = Object.values(bookmarks).filter(Boolean).length;
  const chapters      = filterBkmk ? activeBook.chapters.filter(c=>bookmarks[c.ref]) : activeBook.chapters;

  return (
    <div style={{ paddingTop: 20 }}>
      {/* Stats bar */}
      <div style={{ background: C.surface, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: '12px 16px', marginBottom: 14, display: 'flex', gap: 20, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: C.muted }}>Passager studeret</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: C.red }}>{heardCount}/{totalChapters}</span>
          </div>
          <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${(heardCount/totalChapters)*100}%`, height: '100%', background: C.red, borderRadius: 3 }} />
          </div>
        </div>
        <button onClick={() => setFilterBkmk(v=>!v)} style={{ padding: '6px 12px', borderRadius: 9, fontSize: 12, cursor: 'pointer', border: `0.5px solid ${filterBkmk?C.amber:C.border}`, background: filterBkmk?C.softAmber:'transparent', color: filterBkmk?C.amber:C.muted, flexShrink: 0, fontFamily: 'inherit' }}>
          🔖 Bogmærker ({bookmarkCount})
        </button>
      </div>
      {/* Book selector */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 14 }}>
        {SCRIPTURE_BOOKS.map(b => (
          <button key={b.id} onClick={() => { setBook(b.id); setActiveRef(null); }} style={{ flex: '1 1 auto', minWidth: 78, padding: '8px 6px', borderRadius: 11, fontSize: 11, cursor: 'pointer', border: book===b.id ? 'none' : `0.5px solid ${C.border}`, background: book===b.id ? b.color : 'transparent', color: book===b.id ? C.onDark : C.muted, fontWeight: book===b.id ? 500 : 400, textAlign: 'center', fontFamily: 'inherit' }}>
            <div style={{ fontSize: 18, marginBottom: 2 }}>{b.icon}</div>
            <div style={{ fontSize: 11, lineHeight: 1.3 }}>{b.label}</div>
          </button>
        ))}
      </div>
      {/* Tip */}
      <div style={{ background: C.softBlue, borderLeft: `3px solid ${C.canal}`, borderRadius: 10, padding: '9px 13px', marginBottom: 14, fontSize: 12, color: C.canal }}>
        🔊 Hør passagen · 🔖 Bogmærk · 📝 Tilføj noter · Alt gemmes automatisk.
      </div>
      {chapters.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: C.faint, fontSize: 13 }}>Ingen bogmærkede skriftsteder endnu.</div>}
      {/* Accordion list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {chapters.map(chap => {
          const isOpen  = activeRef === chap.ref;
          const isBkmk  = !!bookmarks[chap.ref];
          const isPlay  = playing === chap.ref;
          const wasHeard= (heard[chap.ref]||0)>0;
          const hasNote = !!(notes[chap.ref]);
          return (
            <div key={chap.ref} style={{ background: isBkmk ? C.softAmber : C.surface, border: `0.5px solid ${isOpen?activeBook.color:isBkmk?C.amber:C.border}`, borderRadius: 14, overflow: 'hidden', borderLeft: `4px solid ${isBkmk?C.amber:wasHeard?activeBook.color:C.border}` }}>
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', cursor: 'pointer' }} onClick={() => { setActiveRef(isOpen?null:chap.ref); setNoteVal(notes[chap.ref]||''); }}>
                <div>
                  <div style={{ fontFamily: 'Georgia,serif', fontSize: 15, color: activeBook.color, marginBottom: 2 }}>{chap.ref}</div>
                  <div style={{ fontSize: 12, color: C.faint, display: 'flex', gap: 8 }}>
                    <span>{chap.topic}</span>
                    {wasHeard && <span style={{ color: activeBook.color }}>· hørt ×{heard[chap.ref]}</span>}
                    {hasNote  && <span style={{ color: C.amber }}>· 📝</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {isBkmk && <span style={{ fontSize: 14 }}>🔖</span>}
                  <span style={{ color: C.faint, fontSize: 13 }}>{isOpen?'▲':'▼'}</span>
                </div>
              </div>
              {/* Expanded */}
              {isOpen && (
                <div style={{ padding: '0 16px 16px' }}>
                  {chap.verses.map((v, vi) => (
                    <div key={vi} style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: vi%2===0?C.bg:C.surface, border: `0.5px solid ${C.border}` }}>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, color: C.red, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>🇩🇰 Dansk</div>
                          <div style={{ fontFamily: 'Georgia,serif', fontSize: 14, color: C.ink, lineHeight: 1.65 }}>{v.da}</div>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, color: C.canal, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>🇬🇧 English</div>
                          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.65 }}>{v.en}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    <button onClick={() => playPassage(chap)} style={{ background: isPlay?C.red:activeBook.color, border: 'none', borderRadius: 7, padding: '7px 14px', color: C.onDark, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {isPlay ? '⏹ Stop' : '🔊 Hør på dansk'}
                    </button>
                    <button onClick={() => toggleBkmk(chap.ref)} style={{ background: isBkmk?C.softAmber:C.surface, border: `0.5px solid ${isBkmk?C.amber:C.border}`, borderRadius: 7, padding: '7px 14px', fontSize: 12, cursor: 'pointer', color: isBkmk?C.amber:C.muted, fontFamily: 'inherit' }}>
                      {isBkmk ? '🔖 Bogmærket' : '📑 Bogmærk'}
                    </button>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: C.faint, marginBottom: 5 }}>📝 Studie note</div>
                    <textarea value={noteVal} onChange={e => setNoteVal(e.target.value)} rows={2} placeholder="Skriv din note her..."
                      style={{ width: '100%', border: `0.5px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontSize: 13, resize: 'vertical', outline: 'none', background: C.bg, boxSizing: 'border-box' }} />
                    <button onClick={() => saveNote(chap.ref, noteVal)} style={{ marginTop: 6, background: C.red, border: 'none', borderRadius: 7, padding: '6px 14px', color: C.onDark, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Gem note</button>
                    {notes[chap.ref] && <div style={{ marginTop: 8, padding: '8px 12px', background: C.softAmber, borderRadius: 8, fontSize: 12, color: C.ink }}>📝 {notes[chap.ref]}</div>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── TAB: AI ──────────────────────────────────────────────────────────────────

function TabAI({ apiKey, saveApiKey }) {
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
  const [tab, setTab]               = useState('countdown');
  const streak                      = useStreak();
  const [alphaData,   saveAlpha]    = useLS('sa-alpha',    { plays: {} });
  const [phraseData,  savePhrases]  = useLS('sa-phrases',  { plays: {}, scores: {}, mastered: {} });
  const [cultureData, saveCulture]  = useLS('sa-culture',  { read: {}, vocab: {} });
  const [readerData,  saveReader]   = useLS('sa-reader',   { progress: {}, completed: {} });
  const [vocabData,   saveVocab]    = useLS('sa-vocab',    { heard: {}, correct: {} });
  const [speakData,   saveSpeak]    = useLS('sa-speaking', { scores: {}, sessions: 0 });
  const [scriptData,  saveScript]   = useLS('sa-scripture',{ bookmarks: {}, notes: {}, heard: {} });
  const [apiKey,      saveApiKey]   = useLS('sa-api-key',  '');
  const [showCert,    setShowCert]  = useState(false);
  const [showAzure,   setShowAzure] = useState(false);
  const [azureKey]                  = useLS('sa-azure-key', '');

  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
  }, []);

  const r = calcReadiness(alphaData, phraseData, vocabData, cultureData, readerData, speakData);
  const missionReady = r.total >= 80;

  return (
    <div style={{ fontFamily: "'Segoe UI',system-ui,sans-serif", background: C.bg, minHeight: '100vh' }}>

      {/* ── HEADER ── */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{ background: C.red, height: '100%', position: 'absolute', inset: 0 }} />
        {/* White cross overlay */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: "repeating-linear-gradient(45deg,rgba(255,255,255,0.03) 0,rgba(255,255,255,0.03) 1px,transparent 1px,transparent 22px)", backgroundSize: '22px 22px' }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '38%', width: '12%', background: 'rgba(255,255,255,0.15)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: '35%', height: '28%', background: 'rgba(255,255,255,0.15)' }} />
        <div style={{ position: 'relative', zIndex: 3, padding: '16px 14px 0', maxWidth: 720, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: '0.2em', color: 'rgba(255,248,245,0.65)', textTransform: 'uppercase', marginBottom: 2 }}>🇩🇰 Belgium Netherlands Mission</div>
              <h1 style={{ fontFamily: 'Georgia,serif', fontSize: 20, fontWeight: 400, color: C.onDark, margin: '0 0 1px', textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>Søster Aneca</h1>
              <div style={{ fontSize: 10, color: 'rgba(255,248,245,0.45)', marginBottom: 12 }}>Dansk (da-DK) · MTC 7. oktober 2026</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
              <StreakBadge streak={streak} />
              <button onClick={() => setShowAzure(v => !v)} style={{ background: azureKey ? 'rgba(46,94,62,0.25)' : 'rgba(255,255,255,0.12)', border: `0.5px solid ${azureKey ? C.forest : 'rgba(255,255,255,0.25)'}`, borderRadius: 10, padding: '4px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer', color: azureKey ? C.forest : 'rgba(255,248,245,0.8)', fontFamily: 'inherit' }}>
                {azureKey ? '🔊 Christel Neural' : '🔊 Indstil stemme'}
              </button>
              <button onClick={() => setShowCert(v => !v)} style={{ background: missionReady ? 'rgba(46,94,62,0.25)' : 'rgba(212,133,10,0.18)', border: `0.5px solid ${missionReady ? C.forest : C.amber}`, borderRadius: 10, padding: '4px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer', color: missionReady ? C.forest : C.amber, fontFamily: 'inherit' }}>
                {missionReady ? `🏆 ${r.total}% · Certifikat` : `🎯 ${r.total}% klar`}
              </button>
            </div>
          </div>
          {showAzure && <AzureSettingsPanel onClose={() => setShowAzure(false)} />}
          {showCert && missionReady && <Certificate score={r.total} streak={streak} />}
          {showCert && missionReady && (
            <div style={{ padding: '8px 0', textAlign: 'center' }}>
              <button onClick={() => window.print()} style={{ background: C.red, border: 'none', borderRadius: 9, padding: '8px 20px', color: C.onDark, fontSize: 12, cursor: 'pointer', marginRight: 8, fontFamily: 'inherit' }}>🖨 Udskriv</button>
              <button onClick={() => setShowCert(false)} style={{ background: 'transparent', border: `0.5px solid ${C.border}`, borderRadius: 9, padding: '8px 14px', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Luk</button>
            </div>
          )}
          {showCert && !missionReady && (
            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 12, marginBottom: 8, textAlign: 'center', fontSize: 12, color: 'rgba(255,248,245,0.75)' }}>
              Nå 80% for at låse op for dit certifikat. Nu {r.total}% — {80 - r.total} point tilbage!
            </div>
          )}
          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 6, scrollbarWidth: 'none', marginTop: 10, WebkitOverflowScrolling: 'touch' }}>
            {TABS.map(t => {
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => { setTab(t.id); setShowCert(false); }} style={{
                  flexShrink: 0, width: 84,
                  background: active ? C.bg : 'rgba(0,0,0,0.45)',
                  border: active ? `2px solid ${C.amber}` : '1px solid rgba(255,255,255,0.25)',
                  borderRadius: '12px 12px 0 0',
                  borderBottom: active ? '2px solid ' + C.bg : '1px solid rgba(255,255,255,0.25)',
                  padding: '9px 4px 7px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
                }}>
                  <div style={{ fontSize: 17, lineHeight: 1, marginBottom: 4 }}>{t.icon}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: active ? C.red : '#FFFFFF', fontFamily: 'Georgia,serif', whiteSpace: 'nowrap', marginBottom: 2 }}>{t.da}</div>
                  <div style={{ fontSize: 9, color: active ? C.muted : 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap', marginBottom: 3 }}>{t.en}</div>
                  {active && <div style={{ width: 16, height: 3, borderRadius: 2, background: C.amber, margin: '0 auto' }} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '0 12px 80px' }}>
        {tab === 'countdown'  && <TabCountdown streak={streak} alphaData={alphaData} phraseData={phraseData} cultureData={cultureData} readerData={readerData} />}
        {tab === 'path'       && <TabPath streak={streak} alphaData={alphaData} phraseData={phraseData} vocabData={vocabData} cultureData={cultureData} readerData={readerData} speakData={speakData} setTab={setTab} />}
        {tab === 'alphabet'   && <TabAlphabet alphaData={alphaData} saveAlpha={saveAlpha} />}
        {tab === 'phrases'    && <TabPhrases phraseData={phraseData} savePhrases={savePhrases} />}
        {tab === 'culture'    && <TabCulture cultureData={cultureData} saveCulture={saveCulture} />}
        {tab === 'reader'     && <TabReader readerData={readerData} saveReader={saveReader} />}
        {tab === 'vocab'      && <TabVocab vocabData={vocabData} saveVocab={saveVocab} />}
        {tab === 'speaking'   && <TabSpeaking speakData={speakData} saveSpeak={saveSpeak} />}
        {tab === 'scripture'  && <TabScripture scriptData={scriptData} saveScript={saveScript} />}
        {tab === 'ai'         && <TabAI apiKey={apiKey} saveApiKey={saveApiKey} />}
      </main>

      {/* ── FOOTER ── */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '14px 16px', borderTop: `0.5px solid ${C.border}` }}>
        <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginBottom: 5 }}>
          <DanishFlag width={34} height={6} />
          <span style={{ fontSize: 11, color: C.faint }}>Sister Aneca's Danish Mission App · Belgium Netherlands Mission 🇩🇰</span>
        </div>
        <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.7 }}>
          10 moduler · Fremskridt gemt lokalt · Daglig streak · 🔊 Azure Neural TTS (ChristelNeural) eller browser · 🎤 Mikrofon til Tale og Alfabet · 🤖 AI-samtale (kræver API-nøgle)
        </div>
      </div>
    </div>
  );
}
