# premiere-mcp-bridge

Control **Adobe Premiere Pro** from Claude, Codex, or any [MCP](https://modelcontextprotocol.io) client — in plain language. 170+ tools for editing, effects, captions, audio, graphics and export, driven through a fast local WebSocket bridge and a panel that docks inside Premiere.

![Claude Code controlling Premiere Pro via MCP](assets/demo.png)

- **170+ tools** across project, sequence, timeline, effects, audio, markers, graphics, captions, export, metadata and playback.
- **Local & fast** — commands push over a WebSocket (no polling, no cloud), so edits land instantly.
- **One-command install** — `npm i -g premiere-mcp-bridge` then `premiere-mcp-bridge --install-cep`.
- **Works with** Claude Desktop, Claude Code, and Codex.

> **Local only, by design.** Premiere has no remote/cloud API — the only way to script it is on the same machine. So Premiere, this package, and your MCP client must all run on one computer. There is no "connect from the cloud" option for *any* Premiere MCP; that's a Premiere limitation, not a choice here.

---

## How it works

```
Your MCP client  ─→  MCP server (Node.js)  ─→  WebSocket :8097  ─→  CEP panel  ─→  ExtendScript  ─→  Premiere Pro
(Claude / Codex)       (premiere-mcp-bridge)                        (MCP Bridge)    (evalScript)
```

You ask your assistant to do something ("add these clips to the timeline"). It calls a tool. The server forwards the call over the WebSocket to the **MCP Bridge** panel running inside Premiere, which executes it as ExtendScript and sends the result back.

---

## Requirements

- **Adobe Premiere Pro 2023+** (CEP 11/12; tested on 2026)
- **Node.js 18+**
- **Windows** or **macOS**
- An MCP client: **Claude Desktop**, **Claude Code**, or **Codex**

---

## Install

### Option A — npm (recommended)

```bash
npm install -g premiere-mcp-bridge
premiere-mcp-bridge --install-cep
```

`--install-cep` enables unsigned CEP extensions (debug mode) and links the **MCP Bridge** panel into Premiere's extensions folder. Then restart Premiere.

### Option B — from source

```bash
git clone <your-repo-url>
cd premiere-mcp-bridge
npm install
npm run build
node dist/cli.js --install-cep
```

Verify any time with:

```bash
premiere-mcp-bridge --doctor
```

---

## Connect your MCP client

Because the command is on your PATH after a global install, the config is just one line — no file paths.

**Claude Desktop** — `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "premiere-pro": { "command": "premiere-mcp-bridge" }
  }
}
```

**Claude Code**:

```bash
claude mcp add premiere-pro -- premiere-mcp-bridge
```

**Codex** — `~/.codex/config.toml`:

```toml
[mcp_servers.premiere-pro]
command = "premiere-mcp-bridge"
```

Pass secrets (like an ElevenLabs key) via the client's `env` block if you don't use a `config.json`:

```json
{
  "mcpServers": {
    "premiere-pro": {
      "command": "premiere-mcp-bridge",
      "env": { "ELEVENLABS_API_KEY": "sk_..." }
    }
  }
}
```

---

## First run

1. Open Premiere Pro (with a project open).
2. **Window → Extensions → MCP Bridge** — the panel docks open.
3. Start your MCP client. When it launches the server, the panel flips to **Connected** (green) and the command log starts streaming.

The panel shows the live connection state, the server endpoint, every incoming command / outgoing response, and a Reconnect control.

---

## Usage

Talk to your assistant normally — it picks the tools. Examples:

| You say | Tools it uses |
|---|---|
| "Import every clip in `D:/shoot/day1` and make a 1080p sequence." | `import_media`, `create_sequence` |
| "Put clips 1–5 on V1 back to back, no gaps." | `add_clip_to_timeline`, `set_clip_position` |
| "Cut the selected clip at the playhead and ripple-delete the left half." | `razor_clip`, `ripple_delete` |
| "Add a cross dissolve between the last two clips." | `apply_transition` |
| "Burn in TikTok-style captions for this sequence." | `add_tiktok_caption` |
| "Normalize the music track to -14 LUFS and duck it under VO." | `set_track_volume`, `add_audio_keyframe` |
| "Export H.264 to `D:/out/final.mp4` with the YouTube 1080p preset." | `export_sequence`, `get_encoder_presets` |
| "Generate a voiceover for this script with ElevenLabs and drop it on A2." | `elevenlabs_generate_speech`, `add_clip_to_timeline` |

For anything not covered by a named tool, `execute_extendscript` runs raw ExtendScript, and `get_connection_status` reports the bridge state.

---

## CLI reference

```
premiere-mcp-bridge                 run the MCP server (what the client launches)
premiere-mcp-bridge --install-cep   enable CEP debug mode + link the panel into Premiere
premiere-mcp-bridge --doctor        check Node, build, panel link, and setup
premiere-mcp-bridge --help          show usage
```

---

## Configuration

Settings resolve in this order: **environment variables → `config.json` → defaults.**

`config.json` (copy from `config.example.json`):

```json
{
  "port": 8097,
  "elevenlabs": {
    "api_key": "your-elevenlabs-api-key",
    "default_voice_id": "21m00Tcm4TlvDq8ikWAM",
    "default_model": "eleven_multilingual_v2"
  }
}
```

| Setting | Env var | Description | Default |
|---|---|---|---|
| `port` | `PPRO_MCP_PORT` | WebSocket port for the CEP bridge | `8097` |
| `elevenlabs.api_key` | `ELEVENLABS_API_KEY` | ElevenLabs API key for AI voiceover | `""` |
| `elevenlabs.default_voice_id` | — | Default voice (Rachel) | `21m00Tcm4TlvDq8ikWAM` |
| `elevenlabs.default_model` | — | TTS model | `eleven_multilingual_v2` |

> If you set `port`, set the **same** port in the panel (`cep/js/main.js`, `WS_PORT`) so both ends match.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Panel stuck on **Disconnected** | Start your MCP client (it launches the server). The panel retries every 5s and connects automatically. |
| **MCP Bridge** not in the Extensions menu | Run `premiere-mcp-bridge --install-cep`, then fully restart Premiere. Confirm with `--doctor`. Upgrading from 1.0.0? Its panel ID clashed with the `premiere-pro-mcp` extension; 1.0.1+ uses its own ID, so re-run `--install-cep`. |
| `command not found` from the client | Ensure npm's global bin dir is on your PATH, or point the client at the absolute path to `dist/cli.js`. |
| Using several clients at once | Supported. The first server owns port `8097`; others relay through it automatically (e.g. Claude and Codex side by side). |
| Tools time out | Keep the panel open and a project loaded; check the panel log for the ExtendScript error. |

---

## Tools (170+)

<details>
<summary><b>Project (28)</b></summary>

`open_project` `save_project` `close_project` `import_media` `create_bin` `find_project_items` `get_project_info` `get_project_items` `create_proxy` `attach_proxy` `toggle_proxy_mode` `create_sub_clip` `relink_media` `refresh_media` `import_ae_comps` `import_sequences` `flush_cache` `delete_project_items` `consolidate_duplicates` `set_project_settings` `set_project_item_in_out` `clear_project_item_in_out` `rename_project_item` `get_project_item_info` `get_project_item_type_info` `set_override_frame_rate` `set_override_pixel_aspect_ratio` `move_project_item`
</details>

<details>
<summary><b>Sequence (23)</b></summary>

`create_sequence` `create_sequence_from_clip` `clone_sequence` `delete_sequence` `set_active_sequence` `get_active_sequence` `get_sequences` `get_sequence_settings` `add_tracks` `remove_track` `rename_track` `get_track_info` `set_track_locked` `set_track_muted` `create_subsequence` `nest_clips` `auto_reframe_sequence` `scene_edit_detection` `set_sequence_in_out` `clear_sequence_in_out` `get_work_area` `set_work_area` `deselect_all`
</details>

<details>
<summary><b>Timeline (24)</b></summary>

`add_clip_to_timeline` `overwrite_clip_to_timeline` `remove_clip` `move_clip_to_track` `set_clip_position` `set_clip_in_out` `set_clip_speed` `razor_clip` `razor_all_tracks` `ripple_delete` `enable_disable_clip` `set_timeline_clip_label` `rename_clip` `link_clips` `unlink_clip` `duplicate_clip` `freeze_frame` `slip_clip` `slide_clip` `get_clip_info` `get_clip_speed` `get_selection` `select_clips` `set_scale_to_frame_size`
</details>

<details>
<summary><b>Effects (19)</b></summary>

`apply_effect` `remove_effect` `get_clip_effects` `set_effect_enabled` `get_effect_property` `set_effect_property` `get_video_effects_list` `get_audio_effects_list` `apply_transition` `remove_transition` `get_video_transitions_list` `get_audio_transitions_list` `set_default_transition` `add_keyframe` `remove_keyframe` `get_keyframes` `set_keyframe_interpolation` `get_clip_transform` `set_clip_transform`
</details>

<details>
<summary><b>Markers (8)</b></summary>

`add_marker` `get_markers` `remove_marker` `clear_all_markers` `update_marker` `add_clip_marker` `get_clip_markers` `add_project_item_marker`
</details>

<details>
<summary><b>Audio (10)</b></summary>

`set_clip_volume` `get_clip_volume` `set_track_volume` `set_track_pan` `solo_track` `get_audio_channel_mapping` `set_audio_channel_mapping` `apply_audio_crossfade` `add_audio_keyframe` `set_clip_mute`
</details>

<details>
<summary><b>Export (9)</b></summary>

`export_sequence` `export_direct` `export_frame` `export_aaf` `export_omf` `export_edl` `export_final_cut_xml` `export_captions` `get_encoder_presets`
</details>

<details>
<summary><b>Graphics & Captions (18)</b></summary>

`add_text_graphic` `add_tiktok_caption` `add_caption_sequence` `style_text_graphic` `get_available_mogrts` `import_mogrt` `add_mogrt_to_timeline` `get_mogrt_properties` `set_mogrt_property` `add_color_matte` `add_black_video` `add_bars_and_tone` `add_caption_track` `get_caption_tracks` `get_captions` `add_caption` `update_caption` `remove_caption`
</details>

<details>
<summary><b>Playback & Scripting (22)</b></summary>

`play` `stop` `step_forward` `step_backward` `go_to_start` `go_to_end` `go_to_next_edit` `go_to_previous_edit` `go_to_in_point` `go_to_out_point` `set_playhead` `get_playhead` `set_workspace` `open_in_source_monitor` `get_source_monitor_clip` `set_source_in_out` `execute_extendscript` `execute_qe_script` `get_app_version` `undo` `redo` `get_connection_status`
</details>

<details>
<summary><b>Metadata (10)</b></summary>

`get_clip_metadata` `set_clip_metadata` `get_file_metadata` `get_xmp_metadata` `set_xmp_metadata` `get_clip_color_space` `set_clip_description` `set_project_item_label` `set_label_defaults` `set_scale_to_frame_size`
</details>

<details>
<summary><b>AI (3)</b></summary>

`elevenlabs_list_voices` `elevenlabs_generate_speech` `elevenlabs_generate_captions_voice`
</details>

---

## Architecture

```
premiere-mcp-bridge/
├── src/                    # MCP server (TypeScript)
│   ├── cli.ts              # CLI: run server / --install-cep / --doctor
│   ├── server.ts           # MCP entry point
│   ├── bridge.ts           # WebSocket bridge to the CEP panel
│   ├── config.ts           # Config loader (env → config.json → defaults)
│   └── tools/              # 14 tool modules (project, timeline, effects, …)
├── cep/                    # CEP extension (runs inside Premiere)
│   ├── CSXS/manifest.xml   # Extension manifest
│   ├── index.html          # Panel markup
│   ├── panel.css           # Panel styling (Spectrum-dark)
│   ├── preview.html        # Browser preview of the panel (dev)
│   ├── js/
│   │   ├── CSInterface.js  # Adobe CSInterface v11
│   │   ├── panel-ui.js     # Status + command-log rendering
│   │   └── main.js         # WebSocket client + ExtendScript loader
│   └── jsx/                # ExtendScript modules (one per tool group)
├── config.example.json
├── package.json
└── tsconfig.json
```

---

## License

MIT
