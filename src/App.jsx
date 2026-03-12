import { useState, useCallback } from "react";

const DICT_API = "https://api.dictionaryapi.dev/api/v2/entries/en/";

const C = {
  bg:       "#0c0c14",
  panel:    "#11111e",
  panelAlt: "#0e0e1c",
  border:   "#252540",
  text:     "#e8e4de",
  textMid:  "#a09898",
  textDim:  "#5a5568",
  gold:     "#d4a84c",
  goldDim:  "#6a5020",
  green:    "#4db88a",
  nodeColors: [
    "#d4a84c","#5b8fd4","#9b6fd4","#4db88a",
    "#d47a4d","#4db8d4","#d44d7a","#8ab84d",
  ],
};
const nc  = (d) => C.nodeColors[d % C.nodeColors.length];
const lbl = (d) => d === 0 ? "ROOT" : `G·${d}`;
const INDENT = 28;

// ─── Dictionary helpers ───────────────────────────────────────────────────────
const STOP = new Set([
  "the","a","an","is","are","of","to","in","for","on","with","as","by","from",
  "that","which","this","it","be","or","and","not","but","have","had","has",
  "its","at","so","do","if","up","out","any","all","can","was","were","been",
  "being","their","they","them","what","when","where","who","how","each",
  "other","such","into","than","then","also","more","most","some","used",
  "using","relating","especially","particularly","often","usually","typically",
  "one","two","three","many","much","very","well","just","about","above",
  "between","without","within","through","during","before","after","under",
  "over","again","further","once","both","few","same","own","while","because",
]);

function parseGD(raw) {
  if (!raw) return { genus: "—", differentia: "—" };
  // Strip leading article, trailing period
  let def = raw.replace(/^(the|a|an)\s+/i, "").replace(/\.$/, "").trim();

  // Strip leading adverbial modifiers (e.g. "legally or socially binding X" → "binding X")
  // Words ending in -ly, or connectives like "or"/"and" before the real noun phrase
  def = def.replace(/^((?:\w+ly\s+|or\s+|and\s+)+)/i, "").trim();

  // 1. Strong relational markers — split here
  const strong = [" that "," which "," who "," whose ",
    " consisting of "," characterized by ",
    " used to "," used for "," designed to "," designed for ",
    " intended to "," intended for "];
  for (const m of strong) {
    const i = def.indexOf(m);
    if (i > 2 && i < 80) return { genus: def.slice(0, i).trim(), differentia: def.slice(i + m.length).trim() };
  }

  // 2. Find head noun: look for first preposition ("of","for","in",...) but only
  //    after we've seen at least one real word (skip adj chains).
  //    We want the noun phrase up to the first preposition.
  const words = def.split(" ");
  const PREPS = new Set(["of","for","in","by","with","about","from","between","among","relating","void","payable","regulated","toward","towards","into","onto","upon","through","without","within"]);
  let nounEnd = -1;
  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase().replace(/,.*$/, "");
    if (i > 0 && PREPS.has(w)) { nounEnd = i; break; }
  }
  if (nounEnd > 0 && nounEnd <= 6) {
    const genus = words.slice(0, nounEnd).join(" ").replace(/,$/, "").trim();
    const differentia = words.slice(nounEnd).join(" ").trim();
    if (genus && differentia) return { genus, differentia };
  }

  // 3. Comma split — first clause as genus if short
  const comma = def.indexOf(",");
  if (comma > 4 && comma < 50) {
    return { genus: def.slice(0, comma).trim(), differentia: def.slice(comma + 1).trim() };
  }

  // 4. Semicolon split
  const semi = def.indexOf(";");
  if (semi > 4 && semi < 50) return { genus: def.slice(0, semi).trim(), differentia: def.slice(semi + 1).trim() };

  // 5. Fallback: first 1-3 words as genus
  const cut = words.length <= 4 ? 1 : Math.min(2, Math.max(1, Math.floor(words.length / 5)));
  return { genus: words.slice(0, cut).join(" "), differentia: words.slice(cut).join(" ") || "—" };
}

function extractTerms(definition, concept, synonyms = []) {
  const skip = new Set([...STOP, concept.toLowerCase(), ...synonyms.map(s => s.toLowerCase())]);
  const words = definition.replace(/[^a-zA-Z\s-]/g, " ").split(/\s+/)
    .map(w => w.toLowerCase().replace(/^-|-$/g, ""))
    .map(w => {
      // Convert adverbs to their root adjective/noun form
      if (w.endsWith('ily') && w.length > 4) return w.slice(0, -3) + 'y'; // happily→happy
      if (w.endsWith('ly') && w.length > 4)  return w.slice(0, -2);        // legally→legal, reciprocally→reciprocal
      return w;
    })
    .filter(w => w.length >= 3 && !skip.has(w));
  const seen = new Set(); const out = [];
  // All unique non-stopword terms, longer words first
  const longer = words.filter(w => w.length >= 5);
  const shorter = words.filter(w => w.length < 5);
  for (const w of [...longer, ...shorter]) {
    if (!seen.has(w)) { seen.add(w); out.push(w); }
  }
  return out;
}

// Returns ALL senses, each with its own GD parse and keyTerms
async function fetchAllSenses(concept) {
  const res = await fetch(DICT_API + encodeURIComponent(concept.toLowerCase()));
  if (!res.ok) throw new Error(res.status === 404 ? `"${concept}" not found` : `API error ${res.status}`);
  const entries = await res.json();
  const entry = entries[0];
  const phonetic = entry?.phonetic || "";

  const senses = [];
  for (const meaning of (entry?.meanings || [])) {
    for (const defObj of (meaning.definitions || [])) {
      if (!defObj.definition || defObj.definition.length < 8) continue;
      const { genus, differentia } = parseGD(defObj.definition);
      const synonyms = (defObj.synonyms || []).concat(entry.synonyms || []);
      senses.push({
        pos: meaning.partOfSpeech,
        text: defObj.definition,
        genus,
        differentia,
        example: defObj.example || null,
        keyTerms: extractTerms(defObj.definition, concept, synonyms),
      });
    }
  }
  if (!senses.length) throw new Error("No definitions found");
  return { concept, phonetic, senses };
}

// ─── Dots ─────────────────────────────────────────────────────────────────────
function Dots({ color }) {
  return (
    <span style={{ display:"inline-flex", gap:3, verticalAlign:"middle", marginRight:4 }}>
      {[0,1,2].map(i => (
        <span key={i} style={{
          display:"inline-block", width:4, height:4, borderRadius:"50%",
          background:color, animation:`pulse 1.1s ease-in-out ${i*0.2}s infinite`,
        }}/>
      ))}
    </span>
  );
}

// ─── Sense picker panel ───────────────────────────────────────────────────────
// Shows all senses; user clicks one → becomes the active definition and branches
function SensePicker({ data, depth, chosenSenseIdx, onChoose }) {
  const color = nc(depth);
  const indent = depth * INDENT + (depth > 0 ? 16 : 0) + 22;

  return (
    <div style={{
      marginLeft: indent,
      marginTop: 6, marginBottom: 10,
      maxWidth: 620,
      animation: "slideDown 0.15s ease",
    }}>
      {/* header */}
      <div style={{
        fontSize: 11, fontFamily: "monospace", color: C.textDim,
        textTransform: "uppercase", letterSpacing: 1.5,
        marginBottom: 8,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ color }}>"{data.concept}"</span>
        {data.phonetic && <span style={{ color: C.textDim }}>{data.phonetic}</span>}
        {chosenSenseIdx === null
          ? <span>— choose a sense to branch from:</span>
          : <span
              onClick={(e) => { e.stopPropagation(); onChoose(null); }}
              style={{ color: C.gold, cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted" }}
            >change sense</span>
        }
      </div>

      {(chosenSenseIdx !== null ? [data.senses[chosenSenseIdx]] : data.senses).map((sense, i) => {
        const realIdx = chosenSenseIdx !== null ? chosenSenseIdx : i;
        const isChosen = chosenSenseIdx === realIdx;
        const { genus, differentia } = sense;
        return (
          <div
            key={i}
            onClick={() => onChoose(isChosen ? null : realIdx)}
            style={{
              background: isChosen ? `${color}18` : C.panelAlt,
              border: `1px solid ${isChosen ? color : C.border}`,
              borderLeft: `3px solid ${isChosen ? color : C.border}`,
              borderRadius: "0 8px 8px 0",
              padding: "12px 16px",
              marginBottom: 6,
              cursor: "pointer",
              transition: "all 0.15s",
              position: "relative",
            }}
            onMouseEnter={e => { if (!isChosen) e.currentTarget.style.borderColor = `${color}70`; }}
            onMouseLeave={e => { if (!isChosen) e.currentTarget.style.borderColor = C.border; }}
          >
            {/* chosen badge */}
            {isChosen && (
              <div style={{
                position:"absolute", top:10, right:12,
                fontSize:9, fontFamily:"monospace",
                background: color, color:"#060610",
                padding:"2px 7px", borderRadius:3,
                fontWeight:700, letterSpacing:1,
              }}>BRANCHING FROM THIS</div>
            )}

            {/* pos badge + definition */}
            <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:8 }}>
              <span style={{
                fontSize:10, fontFamily:"monospace",
                padding:"2px 7px",
                background:`${color}20`, border:`1px solid ${color}40`,
                borderRadius:3, color, flexShrink:0,
              }}>{sense.pos}</span>
              <span style={{ fontSize:14, color: C.text, lineHeight:1.5, fontStyle:"italic" }}>
                "{sense.text}"
              </span>
            </div>

            {/* G/D */}
            <div style={{ display:"grid", gridTemplateColumns:"90px 1fr", gap:"5px 10px", marginBottom: sense.example ? 8 : 0 }}>
              {[["Genus", genus], ["Differentia", differentia]].map(([k,v]) => (
                <>
                  <span key={k+"k"} style={{ fontSize:9, fontFamily:"monospace", fontWeight:700, textTransform:"uppercase", letterSpacing:1.5, color:C.goldDim, paddingTop:2 }}>{k}</span>
                  <span key={k+"v"} style={{ fontSize:13, color:C.textMid, fontStyle:"italic" }}>{v}</span>
                </>
              ))}
            </div>

            {/* example */}
            {sense.example && (
              <div style={{ fontSize:12, color:C.textDim, fontStyle:"italic", marginTop:6, borderTop:`1px solid ${C.border}`, paddingTop:6 }}>
                e.g. "{sense.example}"
              </div>
            )}

            {/* key terms preview */}
            {sense.keyTerms?.length > 0 && (
              <div style={{ marginTop:8, display:"flex", flexWrap:"wrap", gap:5, alignItems:"center" }}>
                <span style={{ fontSize:9, fontFamily:"monospace", color:C.textDim, textTransform:"uppercase", letterSpacing:1 }}>
                  would branch into →
                </span>
                {sense.keyTerms.map(t => (
                  <span key={t} style={{
                    fontSize:11, padding:"2px 8px",
                    background:`${color}14`, border:`1px solid ${color}35`,
                    borderRadius:10, color, fontFamily:"'Georgia',serif",
                  }}>{t}</span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Tree row ─────────────────────────────────────────────────────────────────
function TreeRow({ concept, depth, nodeMap, loadingSet, expandedSet, chosenSenses, onExpand, onChooseSense, isLast }) {
  const [hovered, setHovered] = useState(false);
  const nodeKey     = `${concept}@${depth}`;
  const data        = nodeMap[concept];          // { concept, phonetic, senses }
  const loading     = loadingSet.has(concept);
  const expanded    = expandedSet.has(nodeKey);
  const color       = nc(depth);
  const isDefined   = !!data;
  const chosenIdx   = chosenSenses[nodeKey] ?? null;
  const chosenSense = (chosenIdx !== null && data) ? data.senses[chosenIdx] : null;
  const children    = (chosenSense && expanded) ? chosenSense.keyTerms : [];

  return (
    <div>
      {/* ── row ── */}
      <div
        style={{ display:"flex", alignItems:"center", minHeight:34, position:"relative", cursor:"pointer" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* guide lines */}
        {Array.from({ length: depth }).map((_, i) => (
          <div key={i} style={{
            position:"absolute", left:i*INDENT+13,
            top:0, bottom:0, width:1,
            background:`${C.nodeColors[i % C.nodeColors.length]}20`,
          }}/>
        ))}

        {/* elbow */}
        {depth > 0 && <>
          <div style={{ position:"absolute", left:(depth-1)*INDENT+13, top:0, height:"50%", width:16, borderBottom:`1px solid ${color}40` }}/>
          {!isLast && <div style={{ position:"absolute", left:(depth-1)*INDENT+13, top:"50%", bottom:"-100%", width:1, background:`${color}40` }}/>}
        </>}

        {/* content */}
        <div
          onClick={() => onExpand(concept, depth)}
          style={{
            display:"flex", alignItems:"center", gap:10,
            marginLeft: depth * INDENT + (depth > 0 ? 16 : 0),
            padding:"5px 14px 5px 8px",
            borderRadius:6,
            background: hovered ? `${color}12` : "transparent",
            border:`1px solid ${hovered ? `${color}35` : "transparent"}`,
            transition:"all 0.12s",
            userSelect:"none", position:"relative",
          }}
        >
          {/* chevron */}
          <span style={{ fontSize:10, width:12, textAlign:"center", color:`${color}90`, flexShrink:0 }}>
            {loading ? "·" : !isDefined ? "▷" : expanded ? "▾" : "▸"}
          </span>

          {/* icon */}
          <span style={{ fontSize:14, flexShrink:0 }}>
            {!isDefined ? "○" : chosenSense ? (expanded && children.length > 0 ? (expanded ? "📂" : "📁") : "📄") : "❓"}
          </span>

          {/* name */}
          <span style={{
            fontSize: depth === 0 ? 18 : depth === 1 ? 16 : 15,
            fontWeight: depth === 0 ? 700 : isDefined ? 600 : 400,
            color: isDefined ? color : loading ? `${color}55` : C.textDim,
            fontFamily:"'Georgia','Times New Roman',serif",
            letterSpacing: depth === 0 ? "-0.01em" : "0",
            lineHeight:1,
          }}>
            {loading ? <><Dots color={color}/>{concept}</> : concept}
          </span>

          {/* chosen sense summary (short) */}
          {chosenSense && (
            <span style={{ fontSize:11, color:C.textDim, fontStyle:"italic", maxWidth:260, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              ({chosenSense.pos}) {chosenSense.text.slice(0,60)}{chosenSense.text.length > 60 ? "…" : ""}
            </span>
          )}

          {/* depth badge */}
          <span style={{
            fontSize:10, fontFamily:"monospace", padding:"2px 7px",
            background:`${color}18`, border:`1px solid ${color}30`,
            borderRadius:4, color, letterSpacing:0.5, flexShrink:0,
          }}>{lbl(depth)}</span>

          {!isDefined && !loading && (
            <span style={{ fontSize:11, color:C.textDim, fontStyle:"italic" }}>click to look up</span>
          )}
          {isDefined && chosenIdx === null && !loading && (
            <span style={{ fontSize:11, color:C.gold, fontStyle:"italic" }}>↓ pick a sense below</span>
          )}
        </div>
      </div>

      {/* ── sense picker (always visible when expanded and no sense chosen, or sense chosen) ── */}
      {isDefined && expanded && (
        <SensePicker
          data={data}
          depth={depth}
          chosenSenseIdx={chosenIdx}
          onChoose={(i) => onChooseSense(concept, depth, i)}
        />
      )}

      {/* ── children (only when a sense is chosen) ── */}
      {expanded && chosenSense && children.length > 0 && (
        <div>
          {children.map((child, i) => (
            <TreeRow
              key={`${child}-d${depth+1}-${i}`}
              concept={child}
              depth={depth + 1}
              nodeMap={nodeMap}
              loadingSet={loadingSet}
              expandedSet={expandedSet}
              chosenSenses={chosenSenses}
              onExpand={onExpand}
              onChooseSense={onChooseSense}
              isLast={i === children.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [rootConcept, setRootConcept] = useState("");
  const [input,       setInput]       = useState("");
  const [nodeMap,     setNodeMap]     = useState({});       // concept → {concept, phonetic, senses[]}
  const [loadingSet,  setLoadingSet]  = useState(new Set());
  const [expandedSet, setExpandedSet] = useState(new Set()); // nodeKey = concept@depth
  const [chosenSenses,setChosenSenses]= useState({});       // nodeKey → senseIdx
  const [errors,      setErrors]      = useState({});
  const [searching,   setSearching]   = useState(false);

  const addLoading    = (c) => setLoadingSet(p => new Set([...p, c]));
  const removeLoading = (c) => setLoadingSet(p => { const n = new Set(p); n.delete(c); return n; });

  const handleExpand = useCallback(async (concept, depth) => {
    const nodeKey = `${concept}@${depth}`;
    // Already loaded — just toggle expand
    if (nodeMap[concept]) {
      setExpandedSet(p => { const n = new Set(p); n.has(nodeKey) ? n.delete(nodeKey) : n.add(nodeKey); return n; });
      return;
    }
    if (loadingSet.has(concept)) return;
    addLoading(concept);
    setErrors(p => { const n={...p}; delete n[concept]; return n; });
    try {
      const data = await fetchAllSenses(concept);
      setNodeMap(p => ({ ...p, [concept]: data }));
      setExpandedSet(p => new Set([...p, nodeKey]));
    } catch(e) {
      setErrors(p => ({ ...p, [concept]: e.message }));
    } finally { removeLoading(concept); }
  }, [nodeMap, loadingSet]);

  const handleChooseSense = useCallback((concept, depth, senseIdx) => {
    const nodeKey = `${concept}@${depth}`;
    if (senseIdx === null) {
      setChosenSenses(p => { const n = {...p}; delete n[nodeKey]; return n; });
    } else {
      setChosenSenses(p => ({ ...p, [nodeKey]: senseIdx }));
      setExpandedSet(p => new Set([...p, nodeKey]));
    }
  }, []);

  const handleSearch = async () => {
    const term = input.trim().toLowerCase();
    if (!term || searching) return;
    setRootConcept(term);
    setNodeMap({}); setExpandedSet(new Set()); setChosenSenses({});
    setLoadingSet(new Set()); setErrors({}); setSearching(true);
    addLoading(term);
    try {
      const data = await fetchAllSenses(term);
      setNodeMap({ [term]: data });
      setExpandedSet(new Set([`${term}@0`]));
      removeLoading(term);
    } catch(e) {
      setErrors({ [term]: e.message });
      removeLoading(term);
    } finally { setSearching(false); }
  };

  const suggestions = ["justice","knowledge","reason","art","virtue","concept","mind","value"];

  return (
    <div style={{ minHeight:"100vh", width:"100%", background:C.bg, color:C.text, fontFamily:"'Georgia',serif" }}>
      <style>{`
        html,body,#root { margin:0; padding:0; width:100%; min-height:100vh; background:${C.bg}; }
        * { box-sizing:border-box; }
        @keyframes pulse { 0%,100%{opacity:0.2;transform:scale(0.7)} 50%{opacity:1;transform:scale(1.2)} }
        @keyframes slideDown { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        input:focus { outline:none; }
        ::-webkit-scrollbar { width:6px; }
        ::-webkit-scrollbar-thumb { background:${C.goldDim}; border-radius:3px; }
      `}</style>

      {/* Header */}
      <div style={{
        borderBottom:`1px solid ${C.border}`,
        padding:"22px 40px 18px",
        background:"linear-gradient(to bottom, #0f0f20, #0c0c14)",
        position:"sticky", top:0, zIndex:50,
      }}>
        <div style={{ maxWidth:820, margin:"0 auto" }}>
          <div style={{ fontSize:10, fontFamily:"monospace", letterSpacing:3, color:C.goldDim, textTransform:"uppercase", marginBottom:4 }}>
            Conceptual Hierarchy · Genus & Differentia
          </div>
          <h1 style={{ fontSize:26, fontWeight:700, color:C.gold, margin:"0 0 4px", letterSpacing:"-0.02em" }}>
            Definition Reduction Explorer
          </h1>
          <p style={{ color:C.textMid, fontSize:13, margin:"0 0 16px", lineHeight:1.5 }}>
            Click any node to expand it. Pick which sense you want to branch from — the tree follows your chosen definition.
          </p>
          <div style={{ display:"flex", gap:10 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="Enter any concept — justice, knowledge, reason…"
              style={{
                flex:1, background:"#0e0e1c", border:`1px solid ${C.border}`,
                borderRadius:7, padding:"11px 16px",
                color:C.text, fontSize:15, fontFamily:"'Georgia',serif",
                transition:"border-color 0.2s",
              }}
              onFocus={e => e.target.style.borderColor = C.gold}
              onBlur={e => e.target.style.borderColor = C.border}
            />
            <button
              onClick={handleSearch}
              disabled={searching || !input.trim()}
              style={{
                background: searching ? C.goldDim : C.gold,
                color:"#08080e", border:"none", borderRadius:7,
                padding:"11px 22px", fontFamily:"monospace",
                fontSize:11, fontWeight:700, letterSpacing:2,
                textTransform:"uppercase", cursor: searching ? "wait" : "pointer",
                whiteSpace:"nowrap",
              }}
            >{searching ? "Looking up…" : "Define →"}</button>
          </div>
        </div>
      </div>

      {/* Errors */}
      {Object.entries(errors).filter(([k]) => k === rootConcept).map(([k, msg]) => (
        <div key={k} style={{ maxWidth:700, margin:"16px auto", padding:"10px 16px", background:"#1e0c0c", border:"1px solid #5a2020", borderRadius:6, color:"#e07070", fontSize:13 }}>
          ⚠ {msg}
        </div>
      ))}

      {/* Empty state */}
      {!rootConcept && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"60vh", gap:20 }}>
          <div style={{ fontSize:48, opacity:0.12 }}>⬡</div>
          <div style={{ textAlign:"center", maxWidth:440 }}>
            <div style={{ fontSize:18, color:C.gold, fontWeight:700, marginBottom:8 }}>Start with any concept</div>
            <div style={{ color:C.textMid, fontSize:14, lineHeight:1.8 }}>
              Each node shows all dictionary senses. Each node shows all dictionary senses. Pick the meaning you want — the tree builds the conceptual hierarchy from that definition.
            </div>
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", justifyContent:"center", marginTop:4 }}>
            {suggestions.map(s => (
              <button key={s} onClick={() => setInput(s)} style={{
                background:"transparent", border:`1px solid ${C.goldDim}`,
                borderRadius:16, padding:"6px 16px",
                color:C.goldDim, fontSize:13, cursor:"pointer",
                fontFamily:"'Georgia',serif", transition:"all 0.15s",
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor=C.gold; e.currentTarget.style.color=C.gold; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor=C.goldDim; e.currentTarget.style.color=C.goldDim; }}
              >{s}</button>
            ))}
          </div>
        </div>
      )}

      {/* Tree */}
      {rootConcept && (
        <div style={{ padding:"32px 40px 80px", maxWidth:920, margin:"0 auto" }}>
          <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:10, padding:"18px 16px 20px" }}>
            {/* titlebar */}
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:18, paddingBottom:14, borderBottom:`1px solid ${C.border}` }}>
              <div style={{ display:"flex", gap:6 }}>
                {["#e05555","#e0a020","#50a050"].map(col => (
                  <div key={col} style={{ width:11, height:11, borderRadius:"50%", background:col, opacity:0.75 }}/>
                ))}
              </div>
              <span style={{ fontSize:12, fontFamily:"monospace", color:C.textDim, letterSpacing:1 }}>
                CONCEPTUAL HIERARCHY · {rootConcept.toUpperCase()}
              </span>
            </div>

            <TreeRow
              concept={rootConcept}
              depth={0}
              nodeMap={nodeMap}
              loadingSet={loadingSet}
              expandedSet={expandedSet}
              chosenSenses={chosenSenses}
              onExpand={handleExpand}
              onChooseSense={handleChooseSense}
              isLast={true}
            />

            {Object.entries(errors).filter(([k]) => k !== rootConcept).map(([k,msg]) => (
              <div key={k} style={{ marginTop:6, fontSize:11, color:"#c06060", fontFamily:"monospace", paddingLeft:32 }}>⚠ {k}: {msg}</div>
            ))}
          </div>

          <div style={{ display:"flex", gap:16, marginTop:14, flexWrap:"wrap", alignItems:"center" }}>
            {[0,1,2,3,4,5].map(d => (
              <div key={d} style={{ display:"flex", alignItems:"center", gap:6 }}>
                <div style={{ width:8, height:8, borderRadius:2, background:nc(d) }}/>
                <span style={{ fontSize:11, fontFamily:"monospace", color:nc(d) }}>{lbl(d)}</span>
              </div>
            ))}
            <span style={{ fontSize:11, fontFamily:"monospace", color:C.textDim, marginLeft:"auto" }}>source: dictionaryapi.dev (Wiktionary)</span>
          </div>
        </div>
      )}
    </div>
  );
}
