#!/usr/bin/env python3
"""Build per-lesson program JSON for the SPIKE camp site.

Extends spike-web-wrapper/llsp3_to_blocks.py with full opcode coverage
(movement, music, display, variables/lists, broadcasts, My Blocks, if/else)
so every block of every camp project renders in the web editor.

Output: programs/<lesson>.json  {name, stacks:[[{text,depth,kind,hat,container,...}]]}
"""
import io
import json
import os
import re
import sys

sys.path.insert(0, r"C:\Users\7humi\Documents\spike-web-wrapper")
import llsp3_to_blocks as base

sys.stdout.reconfigure(encoding="utf-8")

SRC = r"C:\Users\7humi\Downloads\SPIKE_Notes_Package\_src"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "programs")

base.OPCODE_LABELS.update({
    "control_if_else":                        "if {CONDITION} then",
    "control_wait":                           "wait {DURATION} seconds",
    "control_repeat_until":                   "repeat until {CONDITION}",
    "flipperlight_centerButtonLight":         "set center button light to {COLOR}",
    "flipperlight_lightDisplayImageOnForTime": "turn on {MATRIX} for {VALUE} seconds",
    "flippersound_playSound":                 "start sound {SOUND}",
    "flippersound_playSoundUntilDone":        "play sound {SOUND} until done",
    "flipperdisplay_ultrasonicLightUp":       "light up distance sensor {PORT} {VALUE}",
    "flipperevents_whenDistance":             "when {PORT} closer than {VALUE} {UNIT}",
    "flippermove_move":                       "move {DIRECTION} for {VALUE} {UNIT}",
    "flippermove_movementSpeed":              "set movement speed to {SPEED} %",
    "flippermove_setMovementPair":            "set movement motors to {PAIR}",
    "flippermove_stopMove":                   "stop moving",
    "flippermoremove_startSteerAtSpeed":      "start moving steer {STEERING} at {SPEED} % speed",
    "flippermoremove_steerDistanceAtSpeed":   "move steer {STEERING} for {DISTANCE} {UNIT} at {SPEED} % speed",
    "flipperdisplay_ledImage":                "turn on {MATRIX}",
    "flipperdisplay_ledImageFor":             "turn on {MATRIX} for {VALUE} seconds",
    "flipperdisplay_ledText":                 "write {TEXT}",
    "flipperdisplay_ledMatrix":               "{PORT} turn on {MATRIX}",
    "flipperdisplay_ledMatrixFor":            "{PORT} turn on {MATRIX} for {VALUE} seconds",
    "flipperdisplay_ledMatrixText":           "{PORT} write {TEXT}",
    "flippermusic_playNoteForBeats":          "play note {NOTE} for {BEATS} beats",
    "flippermusic_restForBeats":              "rest for {BEATS} beats",
    "flippermusic_setInstrument":             "set instrument to {INSTRUMENT}",
    "flippermusic_setTempo":                  "set tempo to {TEMPO} bpm",
    "flipperevents_whenButton":               "when {BUTTON} button {EVENT}",
    "flippermotor_motorTurnForDirection":     "motor {PORT} turn {DIRECTION} for {VALUE} {UNIT}",
    "flippersensors_resetYaw":                "reset yaw angle",
    "flippercontrol_stop":                    "stop {STOP_OPTION}",
    "data_setvariableto":                     "set {VARIABLE} to {VALUE}",
    "data_changevariableby":                  "change {VARIABLE} by {VALUE}",
    "data_addtolist":                         "add {ITEM} to {LIST}",
    "data_deletealloflist":                   "delete all of {LIST}",
    "data_itemoflist":                        "item {INDEX} of {LIST}",
    "data_lengthoflist":                      "length of {LIST}",
    "event_broadcast":                        "broadcast {BROADCAST_INPUT}",
    "event_broadcastandwait":                 "broadcast {BROADCAST_INPUT} and wait",
    "event_whenbroadcastreceived":            "when I receive {BROADCAST_OPTION}",
    "operator_equals":                        "{OPERAND1} = {OPERAND2}",
    "operator_gt":                            "{OPERAND1} > {OPERAND2}",
    "operator_lt":                            "{OPERAND1} < {OPERAND2}",
    "operator_add":                           "{NUM1} + {NUM2}",
    "operator_subtract":                      "{NUM1} - {NUM2}",
    "operator_random":                        "pick random {FROM} to {TO}",
    "operator_join":                          "join {STRING1} {STRING2}",
    "operator_not":                           "not {OPERAND}",
    "flippersensors_color":                   "{PORT} color",
    "flippersensors_distance":                "{PORT} distance in {UNIT}",
    "flippersensors_orientationAxis":         "{AXIS} angle",
    "flippersound_stopSound":                 "stop all sounds",
    "flipperdisplay_centerButtonLight":       "set center button light to {COLOR}",
    "flipperdisplay_displayOff":              "turn off pixels",
    "flippercontrol_stopOtherStacks":         "stop other stacks",
})

_orig_humanize = base.humanize

def humanize(opcode, block, blocks):
    # My Blocks: name lives in the mutation proccode, not fields/inputs
    if opcode == "procedures_call":
        name = (block.get("mutation") or {}).get("proccode", "?")
        return "call " + re.sub(r"%[sbn]", "( )", name).strip()
    if opcode == "procedures_definition":
        inp = block.get("inputs", {}).get("custom_block")
        proto = blocks.get(inp[1]) if inp and isinstance(inp[1], str) else None
        name = ((proto or {}).get("mutation") or {}).get("proccode", "?")
        return "define " + re.sub(r"%[sbn]", "( )", name).strip()
    # selector shadows the base script doesn't know
    f = block.get("fields", {})
    if opcode.endswith("color-selector-vertical"):
        for v in f.values():
            return base.COLOR_NAMES.get(str(v[0]), str(v[0]))
    if opcode.endswith("sound-selector"):
        for v in f.values():
            try:
                return '"' + json.loads(v[0])["name"] + '"'
            except Exception:
                return str(v[0])
    if opcode.endswith("custom-matrix") or opcode.endswith("matrix-5x5-brightness-image"):
        return "[5x5 image]"
    if opcode.endswith("led-selector"):
        for v in f.values():
            return "[" + str(v[0]) + "]"
    if (opcode.endswith("menu_INSTRUMENT") or opcode.endswith("rotation-wheel")
            or opcode == "note" or opcode.endswith("custom-matrix-port")
            or opcode.endswith("movement-port-selector")
            or opcode.endswith("distance-sensor-selector")):
        for v in f.values():
            return str(v[0])
    return _orig_humanize(opcode, block, blocks)

base.humanize = humanize

CONTAINER_OPS = {"control_forever", "control_if", "control_if_else",
                 "control_repeat", "control_repeat_until"}

def kind_of(opcode):
    for pre, k in (("flipperevents", "event"), ("event_", "event"),
                   ("procedures", "proc"), ("control", "control"),
                   ("flippermotor", "motor"), ("flippermoremotor", "motor"),
                   ("flippermove", "move"), ("flippermoremove", "move"),
                   ("flippersensors", "sensor"), ("flippersound", "sound"),
                   ("flippermusic", "music"), ("flipperlight", "light"),
                   ("flipperdisplay", "light"), ("operator", "op"),
                   ("data_", "data"), ("flippercontrol", "control")):
        if opcode.startswith(pre):
            return k
    return "control"

def walk(block_id, blocks, depth, out):
    """Like base.walk but marks kind/hat/container and inserts an 'else' row."""
    while block_id:
        b = blocks.get(block_id)
        if not isinstance(b, dict):
            break
        op = b.get("opcode", "")
        entry = {"opcode": op, "depth": depth, "text": base.describe_block(b, blocks),
                 "kind": kind_of(op)}
        if op in CONTAINER_OPS:
            entry["container"] = True
        cond = base.extract_cond(b, blocks)
        if cond:
            entry["cond"] = cond
        out.append(entry)
        sub = b.get("inputs", {}).get("SUBSTACK")
        if sub and isinstance(sub[1], str):
            walk(sub[1], blocks, depth + 1, out)
        sub2 = b.get("inputs", {}).get("SUBSTACK2")
        if sub2 and isinstance(sub2[1], str):
            out.append({"opcode": "else", "depth": depth, "text": "else",
                        "kind": "control", "container": True})
            walk(sub2[1], blocks, depth + 1, out)
        block_id = b.get("next")

HAT_OPS = ("flipperevents_", "event_whenbroadcastreceived", "procedures_definition")

def extract(path):
    proj, manifest = base.load_project_json(path)
    stacks = []
    for t in proj.get("targets", []):
        blocks = t.get("blocks", {})
        label_by_block = {}
        for c in t.get("comments", {}).values():
            if isinstance(c, dict) and c.get("blockId") and (c.get("text") or "").strip():
                label_by_block[c["blockId"]] = c["text"].strip()
        tops = [bid for bid, b in blocks.items()
                if isinstance(b, dict) and b.get("topLevel")
                and b.get("opcode", "").startswith(HAT_OPS)]
        known = set()
        for tp in tops:
            pass
        if not tops:
            tops = [bid for bid, b in blocks.items()
                    if isinstance(b, dict) and b.get("topLevel") and not b.get("parent")]
        for top in tops:
            out = []
            walk(top, blocks, 0, out)
            if out:
                tb = blocks.get(top, {})
                out[0]["x"] = tb.get("x", 0)
                out[0]["y"] = tb.get("y", 0)
                out[0]["hat"] = True
                if top in label_by_block:
                    out[0]["label"] = label_by_block[top]
                stacks.append(out)
    stacks.sort(key=lambda s: (round(s[0].get("y", 0) / 40), s[0].get("x", 0)))
    return manifest, stacks

LESSONS = {
    "robot_arm_1":         "Robot_Arm.llsp3",
    "barrier_gate":        "Barrier_Gate.llsp3",
    "bird":                "Bird.llsp",
    "domino":              "Domino_curved.llsp",
    "guitar":              "Guitar.llsp",
    "robot_arm_2":         "Robot_Arm_II.llsp",
    "rock_paper_scissors": "Rock_Paper_Scissor.llsp",
    "simon_says":          "Simon_Says.llsp",
    "sumo":                "Sumo.llsp",
}

def main():
    os.makedirs(OUT, exist_ok=True)
    for lesson, fn in LESSONS.items():
        manifest, stacks = extract(os.path.join(SRC, fn))
        name = manifest.get("name") or fn
        n = sum(len(s) for s in stacks)
        unmapped = sorted({b["text"] for s in stacks for b in s
                           if b["text"] == b.get("opcode")})
        with open(os.path.join(OUT, lesson + ".json"), "w", encoding="utf-8") as f:
            json.dump({"name": name, "stacks": stacks}, f, ensure_ascii=False, indent=1)
        flag = ("  UNMAPPED: " + ", ".join(unmapped)) if unmapped else ""
        print(f"{lesson}: {len(stacks)} stacks, {n} blocks{flag}")

if __name__ == "__main__":
    main()
