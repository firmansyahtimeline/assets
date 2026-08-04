// ==UserScript==
// @name         Prefill Engine Inline UI
// @version      8.0
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
'use strict';

const pf_API = "/prefilled.php";

// ================= HELPERS =================
const pf_getEl = s => document.querySelector(s);

const pf_style = (el, styles) => Object.assign(el.style, styles);

const pf_collect = map => {
  let o = {};
  for (let k in map) {
    let el = pf_getEl(map[k]);
    if (el) o[k] = el.value;
  }
  return o;
};

const pf_apply = (data, map) => {
  for (let k in map) {
    let el = pf_getEl(map[k]);
    if (el && data[k] !== undefined) el.value = data[k];
  }
};

const pf_api = async (url, opt={}) => {
  let r = await fetch(pf_API + url, opt);
  return r.json();
};

// ================= OVERLAY =================
function pf_overlay() {

  let o = document.createElement("div");
  pf_style(o, {
    position:"fixed", inset:"0",
    background:"rgba(0,0,0,.6)",
    zIndex:999999,
    display:"flex",
    alignItems:"center",
    justifyContent:"center"
  });

  let m = document.createElement("div");
  pf_style(m, {
    background:"#fff",
    width:"95%",
    maxWidth:"420px",
    borderRadius:"12px",
    padding:"15px",
    fontFamily:"Arial",
    color:"#111",
    boxShadow:"0 10px 40px rgba(0,0,0,.3)"
  });

  o.appendChild(m);
  document.body.appendChild(o);

  return {o,m};
}

// ================= BUTTON =================
function pf_btn(text, color="#eee") {
  let b = document.createElement("button");
  b.innerText = text;

  pf_style(b, {
    padding:"10px",
    borderRadius:"8px",
    border:"none",
    cursor:"pointer",
    background:color,
    color: color==="#111" ? "#fff" : "#111",
    flex:"1"
  });

  return b;
}

// ================= INPUT =================
function pf_input(value="") {
  let i = document.createElement("input");
  i.value = value;

  pf_style(i, {
    width:"100%",
    padding:"10px",
    borderRadius:"8px",
    border:"1px solid #ccc",
    marginBottom:"10px"
  });

  return i;
}

// ================= PREVIEW =================
function pf_preview(item, map) {

  const {o,m} = pf_overlay();

  let title = document.createElement("div");
  title.innerText = "Preview";
  pf_style(title,{fontWeight:"bold",marginBottom:"10px",fontSize:"16px"});

  m.appendChild(title);

  Object.entries(item).forEach(([k,v])=>{
    let d = document.createElement("div");
    d.innerHTML = `<b>${k}</b><br>${v}`;
    pf_style(d,{marginBottom:"8px"});
    m.appendChild(d);
  });

  let actions = document.createElement("div");
  pf_style(actions,{display:"flex",gap:"6px",marginTop:"10px"});

  let applyBtn = pf_btn("Apply","#111");
  let cancelBtn = pf_btn("Cancel","#ccc");

  applyBtn.onclick = ()=>{
    pf_apply(item,map);
    o.remove();
  };

  cancelBtn.onclick = ()=>o.remove();

  actions.append(applyBtn,cancelBtn);
  m.appendChild(actions);
}

// ================= PICKER =================
async function pf_picker(map, key="") {

  const {o,m} = pf_overlay();

  let title = document.createElement("div");
  title.innerText = "Profiles";
  pf_style(title,{fontWeight:"bold",marginBottom:"10px"});
  m.appendChild(title);

  let wrap = document.createElement("div");
  pf_style(wrap,{display:"flex",gap:"6px"});

  let input = pf_input(key);
  let searchBtn = pf_btn("Search","#111");

  wrap.append(input,searchBtn);
  m.appendChild(wrap);

  let list = document.createElement("div");
  pf_style(list,{maxHeight:"300px",overflow:"auto",marginTop:"10px"});
  m.appendChild(list);

  let actions = document.createElement("div");
  pf_style(actions,{display:"flex",gap:"6px",marginTop:"10px"});

  let saveBtn = pf_btn("Save","#111");
  let closeBtn = pf_btn("Close","#ccc");

  actions.append(saveBtn,closeBtn);
  m.appendChild(actions);

  closeBtn.onclick = ()=>o.remove();

  async function load(q="") {

    list.innerHTML = "Loading...";

    let data = await pf_api(`?action=search&q=${encodeURIComponent(q)}&limit=100`);

    list.innerHTML = "";

    if (!Object.keys(data).length) {
      list.innerText = "No results";
      return;
    }

    Object.entries(data).forEach(([k,item])=>{

      let card = document.createElement("div");
      pf_style(card,{
        border:"1px solid #eee",
        borderRadius:"8px",
        padding:"10px",
        marginBottom:"8px",
        background:"#fafafa"
      });

      let title = document.createElement("div");
      title.innerHTML = `<b>${k}</b>`;
      card.appendChild(title);

      let content = document.createElement("div");
      content.innerHTML = Object.entries(item||{})
        .map(([kk,v])=>`${kk}: ${v}`).join("<br>");
      card.appendChild(content);

      let row = document.createElement("div");
      pf_style(row,{display:"flex",gap:"6px",marginTop:"6px"});

      let previewBtn = pf_btn("Preview","#111");
      let delBtn = pf_btn("Delete","#e53935");

      previewBtn.onclick = ()=>pf_preview(item,map);

      delBtn.onclick = async ()=>{
        await pf_api(`?action=delete&key=${k}&index=0`);
        load(input.value);
      };

      row.append(previewBtn,delBtn);
      card.appendChild(row);

      list.appendChild(card);
    });
  }

  searchBtn.onclick = ()=>load(input.value);
  input.onkeypress = e => { if(e.key==="Enter") load(input.value); };

  saveBtn.onclick = async ()=>{
    let payload = pf_collect(map);
    let saveKey = prompt("Save key:", key || payload.phone || "");
    if (!saveKey) return;

    await pf_api(`?action=save&key=${saveKey}`, {
      method:"POST",
      body:JSON.stringify(payload)
    });

    load(input.value);
  };

  load(key);
}

// ================= INIT =================
function pf_init(key,map){
  pf_picker(map,key);
}

// ================= EXPORT =================
window.prefill = {
  init: pf_init,
  picker: pf_picker,
  preview: pf_preview
};

})();