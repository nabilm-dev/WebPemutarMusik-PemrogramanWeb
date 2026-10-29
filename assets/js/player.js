const $=s=>document.querySelector(s), a=$('#a');
let tracks=[], cur=-1, shuffle=false, repeat=0;

/* ---------- Lagu demo (dari folder demolagu/) ---------- */
function addDemo(){
  add([
    {
      name:'Rex Orange County - Best Friend',
      src:encodeURI('demolagu/Rex Orange County - Best Friend.mp3'),
      tag:'Demo'
    },
    {
      name:'Rex Orange County - Hannah Montana',
      src:encodeURI('demolagu/Rex Orange County - Hannah Montana.mp3'),
      tag:'Demo'
    }
  ]);
}

/* ---------- Daftar putar ---------- */
function add(items){
  const first=tracks.length;
  tracks.push(...items); render();
  if(cur<0) load(first,false);
}
function render(){
  const ul=$('#ul');
  $('#count').textContent=tracks.length?`Daftar putar (${tracks.length})`:'Daftar putar';
  if(!tracks.length){ul.innerHTML='<li class="empty">Belum ada lagu. Tekan <b>Tambah lagu</b>, atau seret berkas audio ke halaman ini.</li>';return}
  ul.innerHTML='';
  tracks.forEach((t,i)=>{
    const li=document.createElement('li'); if(i===cur) li.className='cur';
    li.innerHTML='<button><span class="n"></span><span class="t"></span><span class="s"></span></button>';
    li.querySelector('.n').textContent=i===cur&&!a.paused?'▶':i+1;
    li.querySelector('.t').textContent=t.name;
    li.querySelector('.s').textContent=t.tag;
    li.firstChild.onclick=()=>{i===cur?toggle():load(i,true)};
    ul.appendChild(li);
  });
}
function load(i,play){
  cur=i; const t=tracks[i];
  a.src=t.src; $('#title').textContent=t.name; $('#sub').textContent=t.tag==='Demo'?'Lagu demo':'Dari perangkatmu';
  $('#ini').textContent=t.name.trim()[0]?.toUpperCase()||'♪';
  document.title=t.name+' – Putar'; render();
  if(play) a.play().catch(()=>{});
}
function toggle(){
  if(cur<0){tracks.length?load(0,true):$('#pick').click();return}
  a.paused?a.play().catch(()=>{}):a.pause();
}
function step(d){
  if(!tracks.length) return;
  let i = shuffle&&tracks.length>1 ? (()=>{let r;do{r=Math.floor(Math.random()*tracks.length)}while(r===cur);return r})()
        : (cur+d+tracks.length)%tracks.length;
  load(i,true);
}

/* ---------- Kontrol ---------- */
const fmt=s=>isFinite(s)?Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'):'0:00';
const fill=(el)=>el.style.setProperty('--p',(el.value-el.min)/(el.max-el.min)*100+'%');
$('#play').onclick=toggle; $('#next').onclick=()=>step(1); $('#prev').onclick=()=>{a.currentTime>3?a.currentTime=0:step(-1)};
$('#shuf').onclick=e=>{shuffle=!shuffle;e.currentTarget.classList.toggle('act',shuffle);e.currentTarget.title='Acak: '+(shuffle?'nyala':'mati')};
$('#rep').onclick=e=>{repeat=(repeat+1)%3;const b=e.currentTarget;b.classList.toggle('act',repeat>0);b.title='Ulangi: '+['mati','semua','satu lagu'][repeat]};
$('#pick').onclick=()=>$('#file').click();
$('#demo').onclick=addDemo;
$('#file').onchange=e=>{addFiles(e.target.files);e.target.value=''};
function addFiles(fs){
  const items=[...fs].filter(f=>f.type.startsWith('audio/')||/\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(f.name))
    .map(f=>({name:f.name.replace(/\.[^.]+$/,''),src:URL.createObjectURL(f),tag:'Berkas'}));
  if(items.length) add(items);
}
const seek=$('#seek'), vol=$('#vol');
seek.oninput=()=>{if(a.duration) a.currentTime=seek.value/1000*a.duration; fill(seek)};
vol.oninput=()=>{a.volume=vol.value/100; fill(vol)};
a.volume=.8; fill(vol); fill(seek);
a.ontimeupdate=()=>{ if(a.duration&&document.activeElement!==seek){seek.value=a.currentTime/a.duration*1000;fill(seek)} $('#cur').textContent=fmt(a.currentTime)};
a.onloadedmetadata=()=>{$('#dur').textContent=fmt(a.duration)};
a.onplay=()=>state(true);
a.onpause=()=>state(false);
a.onended=()=>{ if(repeat===2){a.currentTime=0;a.play()} else if(repeat===1||cur<tracks.length-1){step(1)} else {state(false)} };
function state(on){
  $('#disc').classList.toggle('on',on);
  $('#pi').innerHTML=on?'<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>':'<path d="M8 5v14l11-7z"/>';
  $('#play').setAttribute('aria-label',on?'Jeda':'Putar'); render();
}
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='BUTTON') return;
  if(e.code==='Space'){e.preventDefault();toggle()}
  if(e.code==='ArrowRight') a.currentTime+=5;
  if(e.code==='ArrowLeft') a.currentTime-=5;
});
addEventListener('dragover',e=>{e.preventDefault();document.body.classList.add('drop')});
addEventListener('dragleave',()=>document.body.classList.remove('drop'));
addEventListener('drop',e=>{e.preventDefault();document.body.classList.remove('drop');addFiles(e.dataTransfer.files)});

render();