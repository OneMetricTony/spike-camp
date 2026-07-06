/* llsp3_client.js — parse a .llsp3 file entirely in the browser (no server).
 *
 * A .llsp3 is a zip: manifest.json + scratch.sb3; scratch.sb3 is itself a zip
 * containing project.json (Scratch/Blockly VM format). This is a faithful JS
 * port of spike-web-wrapper/llsp3_to_blocks.py + spike-camp-site/build_programs.py,
 * producing the same { name, stacks:[[{opcode,text,depth,kind,hat,container,cond,x,y,label}]] }
 * that the editor's buildProgram() already consumes for the lessons.
 *
 * Requires JSZip on the page. Exposes: window.parseLlsp3(arrayBuffer) -> Promise<{name,stacks}>
 */
(function () {
  "use strict";

  const OPCODE_LABELS = {
    "flipperevents_whenProgramStarts": "when program starts",
    "flipperevents_whenCondition": "when {condition}",
    "control_forever": "forever",
    "control_if": "if {CONDITION} then",
    "control_wait_until": "wait until {CONDITION}",
    "control_repeat": "repeat {TIMES}",
    "flippersound_beepForTime": "play beep {NOTE} for {DURATION} seconds",
    "flippersound_beep": "play beep {NOTE}",
    "flippermotor_motorSetSpeed": "set motor {PORT} speed to {SPEED} %",
    "flippermotor_motorStartDirection": "start motor {PORT} {DIRECTION}",
    "flippermotor_motorStop": "stop motor {PORT}",
    "flippermotor_motorGoDirectionToPosition": "motor {PORT} go {DIRECTION} to position {POSITION}",
    "flippermoremotor_motorStartPower": "start motor {PORT} at {POWER} % power",
    "flipperlight_lightDisplayImageOn": "turn on light matrix image {MATRIX}",
    "flipperlight_lightDisplayText": "write {TEXT}",
    "flippersensors_isColor": "{PORT} is color {COLOR}",
    "flippersensors_isPressed": "{PORT} is {STATE}",
    "flippersensors_isDistance": "{PORT} distance {COMPARATOR} {VALUE}",
    "operator_or": "{OPERAND1} or {OPERAND2}",
    "operator_and": "{OPERAND1} and {OPERAND2}",
    // --- extended (build_programs.py) ---
    "control_if_else": "if {CONDITION} then",
    "control_wait": "wait {DURATION} seconds",
    "control_repeat_until": "repeat until {CONDITION}",
    "flipperlight_centerButtonLight": "set center button light to {COLOR}",
    "flipperlight_lightDisplayImageOnForTime": "turn on {MATRIX} for {VALUE} seconds",
    "flippersound_playSound": "start sound {SOUND}",
    "flippersound_playSoundUntilDone": "play sound {SOUND} until done",
    "flipperdisplay_ultrasonicLightUp": "light up distance sensor {PORT} {VALUE}",
    "flipperevents_whenDistance": "when {PORT} closer than {VALUE} {UNIT}",
    "flippermove_move": "move {DIRECTION} for {VALUE} {UNIT}",
    "flippermove_movementSpeed": "set movement speed to {SPEED} %",
    "flippermove_setMovementPair": "set movement motors to {PAIR}",
    "flippermove_stopMove": "stop moving",
    "flippermoremove_startSteerAtSpeed": "start moving steer {STEERING} at {SPEED} % speed",
    "flippermoremove_steerDistanceAtSpeed": "move steer {STEERING} for {DISTANCE} {UNIT} at {SPEED} % speed",
    "flipperdisplay_ledImage": "turn on {MATRIX}",
    "flipperdisplay_ledImageFor": "turn on {MATRIX} for {VALUE} seconds",
    "flipperdisplay_ledText": "write {TEXT}",
    "flipperdisplay_ledMatrix": "{PORT} turn on {MATRIX}",
    "flipperdisplay_ledMatrixFor": "{PORT} turn on {MATRIX} for {VALUE} seconds",
    "flipperdisplay_ledMatrixText": "{PORT} write {TEXT}",
    "flippermusic_playNoteForBeats": "play note {NOTE} for {BEATS} beats",
    "flippermusic_restForBeats": "rest for {BEATS} beats",
    "flippermusic_setInstrument": "set instrument to {INSTRUMENT}",
    "flippermusic_setTempo": "set tempo to {TEMPO} bpm",
    "flipperevents_whenButton": "when {BUTTON} button {EVENT}",
    "flippermotor_motorTurnForDirection": "motor {PORT} turn {DIRECTION} for {VALUE} {UNIT}",
    "flippersensors_resetYaw": "reset yaw angle",
    "flippercontrol_stop": "stop {STOP_OPTION}",
    "data_setvariableto": "set {VARIABLE} to {VALUE}",
    "data_changevariableby": "change {VARIABLE} by {VALUE}",
    "data_addtolist": "add {ITEM} to {LIST}",
    "data_deletealloflist": "delete all of {LIST}",
    "data_itemoflist": "item {INDEX} of {LIST}",
    "data_lengthoflist": "length of {LIST}",
    "event_broadcast": "broadcast {BROADCAST_INPUT}",
    "event_broadcastandwait": "broadcast {BROADCAST_INPUT} and wait",
    "event_whenbroadcastreceived": "when I receive {BROADCAST_OPTION}",
    "operator_equals": "{OPERAND1} = {OPERAND2}",
    "operator_gt": "{OPERAND1} > {OPERAND2}",
    "operator_lt": "{OPERAND1} < {OPERAND2}",
    "operator_add": "{NUM1} + {NUM2}",
    "operator_subtract": "{NUM1} - {NUM2}",
    "operator_random": "pick random {FROM} to {TO}",
    "operator_join": "join {STRING1} {STRING2}",
    "operator_not": "not {OPERAND}",
    "flippersensors_color": "{PORT} color",
    "flippersensors_distance": "{PORT} distance in {UNIT}",
    "flippersensors_orientationAxis": "{AXIS} angle",
    "flippersound_stopSound": "stop all sounds",
    "flipperdisplay_centerButtonLight": "set center button light to {COLOR}",
    "flipperdisplay_displayOff": "turn off pixels",
    "flippercontrol_stopOtherStacks": "stop other stacks",
  };

  const COLOR_NAMES = {
    "0": "black", "1": "magenta", "2": "purple", "3": "blue", "4": "azure",
    "5": "cyan", "6": "green", "7": "yellow", "8": "orange", "9": "red",
    "10": "white", "-1": "none",
  };

  const PLACEHOLDER_SELECTOR_HINT = {
    COLOR: "color-selector", PORT: "selector",
    CONDITION: null, OPERAND1: null, OPERAND2: null,
  };
  const CONTAINER_OPS = new Set([
    "control_forever", "control_if", "control_if_else", "control_repeat", "control_repeat_until",
  ]);
  const HAT_PREFIXES = ["flipperevents_", "event_whenbroadcastreceived", "procedures_definition"];

  const isStr = v => typeof v === "string";
  const ends = (s, suf) => s.slice(-suf.length) === suf;

  function flattenCondition(bid, blocks) {
    const b = blocks[bid];
    if (!b || typeof b !== "object") return [];
    const op = b.opcode || "";
    if (ends(op, "operator_or") || ends(op, "operator_and")) {
      const join = ends(op, "or") ? "or" : "and";
      let terms = [];
      ["OPERAND1", "OPERAND2"].forEach(k => {
        const inp = (b.inputs || {})[k];
        if (inp && isStr(inp[1])) terms = terms.concat(flattenCondition(inp[1], blocks));
      });
      terms.forEach(t => { if (t.join === undefined) t.join = join; });
      return terms;
    }
    if (ends(op, "isColor")) {
      let port = "F", color = "?";
      Object.values(b.inputs || {}).forEach(inp => {
        if (isStr(inp[1])) {
          const child = blocks[inp[1]] || {};
          const copc = child.opcode || "";
          Object.values(child.fields || {}).forEach(fv => {
            if (copc.indexOf("color-sensor-selector") >= 0) port = String(fv[0]);
            else if (copc.indexOf("color-selector") >= 0) color = COLOR_NAMES[String(fv[0])] || String(fv[0]);
          });
        }
      });
      return [{ type: "is_color", port: port, color: color }];
    }
    if (ends(op, "isPressed") || ends(op, "buttonIsPressed")) {
      let port = "D", state = "pressed";
      Object.entries(b.fields || {}).forEach(([fk, fv]) => {
        if (fk.toUpperCase().indexOf("STATE") >= 0 || fv[0] === "pressed" || fv[0] === "released") state = fv[0];
      });
      Object.values(b.inputs || {}).forEach(inp => {
        if (isStr(inp[1])) {
          const child = blocks[inp[1]] || {};
          Object.values(child.fields || {}).forEach(fv => {
            if (isStr(fv[0]) && fv[0].length === 1 && "ABCDEF".indexOf(fv[0]) >= 0) port = String(fv[0]);
            if (fv[0] === "pressed" || fv[0] === "released") state = fv[0];
          });
        }
      });
      return [{ type: "is_pressed", port: port, state: state }];
    }
    return [];
  }

  function extractCond(b, blocks) {
    const inp = (b.inputs || {}).CONDITION;
    if (inp && isStr(inp[1])) {
      const terms = flattenCondition(inp[1], blocks);
      if (terms.length) {
        const join = terms.length > 1 ? (terms[0].join || "or") : "single";
        return { join: join, terms: terms };
      }
    }
    return null;
  }

  function resolveInput(inp, blocks) {
    let payload;
    try { payload = inp[1]; } catch (e) { return null; }
    if (Array.isArray(payload)) return String(payload[1]);
    if (isStr(payload)) {
      const child = blocks[payload];
      if (child && typeof child === "object") return describeBlock(child, blocks);
    }
    return null;
  }

  function resolveField(block, blocks, name) {
    const fields = block.fields || {};
    if (name in fields) return fields[name][0];
    const inputs = block.inputs || {};
    if (name in inputs) {
      const r = resolveInput(inputs[name], blocks);
      if (r !== null && r !== undefined) return r;
    }
    const hint = (name in PLACEHOLDER_SELECTOR_HINT) ? PLACEHOLDER_SELECTOR_HINT[name] : "sentinel-none";
    for (const inp of Object.values(inputs)) {
      const payload = inp.length > 1 ? inp[1] : null;
      const childId = isStr(payload) ? payload : null;
      if (!childId) continue;
      const child = blocks[childId];
      if (!child || typeof child !== "object") continue;
      const opc = child.opcode || "";
      if (hint === null) return describeBlock(child, blocks);
      if (hint !== "sentinel-none" && opc.indexOf(hint) >= 0) return describeBlock(child, blocks);
    }
    return null;
  }

  function humanize(opcode, block, blocks) {
    const f = block.fields || {};
    // --- extended overrides (build_programs.py) ---
    if (opcode === "procedures_call") {
      const name = (block.mutation || {}).proccode || "?";
      return "call " + name.replace(/%[sbn]/g, "( )").trim();
    }
    if (opcode === "procedures_definition") {
      const inp = (block.inputs || {}).custom_block;
      const proto = (inp && isStr(inp[1])) ? blocks[inp[1]] : null;
      const name = ((proto || {}).mutation || {}).proccode || "?";
      return "define " + name.replace(/%[sbn]/g, "( )").trim();
    }
    if (ends(opcode, "color-selector-vertical")) {
      for (const v of Object.values(f)) return COLOR_NAMES[String(v[0])] || String(v[0]);
    }
    if (ends(opcode, "sound-selector")) {
      for (const v of Object.values(f)) {
        try { return '"' + JSON.parse(v[0]).name + '"'; } catch (e) { return String(v[0]); }
      }
    }
    if (ends(opcode, "custom-matrix") || ends(opcode, "matrix-5x5-brightness-image")) return "[5x5 image]";
    if (ends(opcode, "led-selector")) { for (const v of Object.values(f)) return "[" + String(v[0]) + "]"; }
    if (ends(opcode, "menu_INSTRUMENT") || ends(opcode, "rotation-wheel") || opcode === "note" ||
        ends(opcode, "custom-matrix-port") || ends(opcode, "movement-port-selector") ||
        ends(opcode, "distance-sensor-selector")) {
      for (const v of Object.values(f)) return String(v[0]);
    }
    // --- base (llsp3_to_blocks.py) ---
    const label = OPCODE_LABELS[opcode];
    if (ends(opcode, "multiple-port-selector") || ends(opcode, "color-sensor-selector") ||
        ends(opcode, "force-sensor-selector") || ends(opcode, "distance-sensor-selector")) {
      for (const v of Object.values(f)) return String(v[0]);
      return "?";
    }
    if (ends(opcode, "color-selector")) {
      for (const v of Object.values(f)) return COLOR_NAMES[String(v[0])] || String(v[0]);
      return "?";
    }
    if (ends(opcode, "custom-icon-direction") || ends(opcode, "custom-angle") ||
        ends(opcode, "custom-piano") || ends(opcode, "matrix-5x5-brightness-image")) {
      for (const v of Object.values(f)) return String(v[0]);
      return "<img>";
    }
    if (label === undefined) return opcode; // unknown → raw opcode (never silently dropped)
    return label.replace(/\{(\w+)\}/g, (m, ph) => {
      const val = resolveField(block, blocks, ph);
      return (val !== null && val !== undefined) ? String(val) : "?";
    });
  }

  function describeBlock(block, blocks) {
    return humanize(block.opcode || "?", block, blocks);
  }

  function kindOf(opcode) {
    const pairs = [
      ["flipperevents", "event"], ["event_", "event"], ["procedures", "proc"],
      ["control", "control"], ["flippermotor", "motor"], ["flippermoremotor", "motor"],
      ["flippermove", "move"], ["flippermoremove", "move"], ["flippersensors", "sensor"],
      ["flippersound", "sound"], ["flippermusic", "music"], ["flipperlight", "light"],
      ["flipperdisplay", "light"], ["operator", "op"], ["data_", "data"], ["flippercontrol", "control"],
    ];
    for (const [pre, k] of pairs) if (opcode.indexOf(pre) === 0) return k;
    return "control";
  }

  function walk(blockId, blocks, depth, out) {
    while (blockId) {
      const b = blocks[blockId];
      if (!b || typeof b !== "object") break;
      const op = b.opcode || "";
      const entry = { opcode: op, depth: depth, text: describeBlock(b, blocks), kind: kindOf(op) };
      if (CONTAINER_OPS.has(op)) entry.container = true;
      const cond = extractCond(b, blocks);
      if (cond) entry.cond = cond;
      out.push(entry);
      const sub = (b.inputs || {}).SUBSTACK;
      if (sub && isStr(sub[1])) walk(sub[1], blocks, depth + 1, out);
      const sub2 = (b.inputs || {}).SUBSTACK2;
      if (sub2 && isStr(sub2[1])) {
        out.push({ opcode: "else", depth: depth, text: "else", kind: "control", container: true });
        walk(sub2[1], blocks, depth + 1, out);
      }
      blockId = b.next;
    }
  }

  function startsWithAny(s, prefixes) { return prefixes.some(p => s.indexOf(p) === 0); }

  function extract(proj) {
    const stacks = [];
    (proj.targets || []).forEach(t => {
      const blocks = t.blocks || {};
      const labelByBlock = {};
      Object.values(t.comments || {}).forEach(c => {
        if (c && typeof c === "object" && c.blockId && (c.text || "").trim())
          labelByBlock[c.blockId] = c.text.trim();
      });
      let tops = Object.keys(blocks).filter(bid => {
        const b = blocks[bid];
        return b && typeof b === "object" && b.topLevel && startsWithAny(b.opcode || "", HAT_PREFIXES);
      });
      if (!tops.length) {
        tops = Object.keys(blocks).filter(bid => {
          const b = blocks[bid];
          return b && typeof b === "object" && b.topLevel && !b.parent;
        });
      }
      tops.forEach(top => {
        const out = [];
        walk(top, blocks, 0, out);
        if (out.length) {
          const tb = blocks[top] || {};
          out[0].x = tb.x || 0;
          out[0].y = tb.y || 0;
          out[0].hat = true;
          if (top in labelByBlock) out[0].label = labelByBlock[top];
          stacks.push(out);
        }
      });
    });
    stacks.sort((a, b) => {
      const ay = Math.round((a[0].y || 0) / 40), by = Math.round((b[0].y || 0) / 40);
      return ay !== by ? ay - by : (a[0].x || 0) - (b[0].x || 0);
    });
    return stacks;
  }

  async function parseLlsp3(arrayBuffer) {
    if (typeof JSZip === "undefined") throw new Error("JSZip not loaded");
    const outer = await JSZip.loadAsync(arrayBuffer);
    let manifest = {};
    const mf = outer.file("manifest.json");
    if (mf) { try { manifest = JSON.parse(await mf.async("string")); } catch (e) {} }
    const sb3file = outer.file("scratch.sb3");
    if (!sb3file) throw new Error("not a SPIKE .llsp3 (no scratch.sb3 inside)");
    const inner = await JSZip.loadAsync(await sb3file.async("arraybuffer"));
    const pj = inner.file("project.json");
    if (!pj) throw new Error("no project.json inside scratch.sb3");
    const proj = JSON.parse(await pj.async("string"));
    const stacks = extract(proj);
    const name = manifest.name || "SPIKE program";
    return { name: name, stacks: stacks };
  }

  window.parseLlsp3 = parseLlsp3;
})();
