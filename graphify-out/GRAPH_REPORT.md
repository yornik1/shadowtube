# Graph Report - .  (2026-06-17)

## Corpus Check
- 117 files · ~174,743 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 663 nodes · 989 edges · 50 communities (45 shown, 5 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 34 edges (avg confidence: 0.83)
- Token cost: 50,828 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Gemini Translation & Settings|Gemini Translation & Settings]]
- [[_COMMUNITY_Mobile App Dependencies|Mobile App Dependencies]]
- [[_COMMUNITY_E2E Test Scripts|E2E Test Scripts]]
- [[_COMMUNITY_Session Player & Pause-on-End|Session Player & Pause-on-End]]
- [[_COMMUNITY_Screens & SQLite Store|Screens & SQLite Store]]
- [[_COMMUNITY_Monorepo Root Config|Monorepo Root Config]]
- [[_COMMUNITY_YouTube Transcript Client|YouTube Transcript Client]]
- [[_COMMUNITY_Logging & Error Boundary|Logging & Error Boundary]]
- [[_COMMUNITY_Node Proxy Server|Node Proxy Server]]
- [[_COMMUNITY_Themed UI Boilerplate|Themed UI Boilerplate]]
- [[_COMMUNITY_Sentence Chunker & Shared Types|Sentence Chunker & Shared Types]]
- [[_COMMUNITY_E2E Pause Harness|E2E Pause Harness]]
- [[_COMMUNITY_Cloudflare Worker Proxy|Cloudflare Worker Proxy]]
- [[_COMMUNITY_Proxy Dependencies|Proxy Dependencies]]
- [[_COMMUNITY_Pause-on-End E2E Docs|Pause-on-End E2E Docs]]
- [[_COMMUNITY_Proxy Deploy & Infra|Proxy Deploy & Infra]]
- [[_COMMUNITY_Web Platform Stubs|Web Platform Stubs]]
- [[_COMMUNITY_Local APK Build Script|Local APK Build Script]]
- [[_COMMUNITY_Proxy TS Config|Proxy TS Config]]
- [[_COMMUNITY_Ngrok Tunnel Script|Ngrok Tunnel Script]]
- [[_COMMUNITY_Android MainActivity|Android MainActivity]]
- [[_COMMUNITY_Shared Package Config|Shared Package Config]]
- [[_COMMUNITY_Shared TS Config|Shared TS Config]]
- [[_COMMUNITY_Android MainApplication|Android MainApplication]]
- [[_COMMUNITY_Mobile TS Config|Mobile TS Config]]
- [[_COMMUNITY_APK Build (EAS) Script|APK Build (EAS) Script]]
- [[_COMMUNITY_Metro Bundler Config|Metro Bundler Config]]
- [[_COMMUNITY_Web DB Stub|Web DB Stub]]
- [[_COMMUNITY_Expo App Manifest|Expo App Manifest]]
- [[_COMMUNITY_E2E Dev Runner|E2E Dev Runner]]
- [[_COMMUNITY_Expo Go Install Script|Expo Go Install Script]]
- [[_COMMUNITY_Emulator Start Script|Emulator Start Script]]
- [[_COMMUNITY_Home  URL Input Screen|Home / URL Input Screen]]
- [[_COMMUNITY_Dynamic Expo Config|Dynamic Expo Config]]
- [[_COMMUNITY_Product & MVP Scope|Product & MVP Scope]]
- [[_COMMUNITY_Cleartext Traffic Plugin|Cleartext Traffic Plugin]]
- [[_COMMUNITY_Emulator Routing Note|Emulator Routing Note]]

## God Nodes (most connected - your core abstractions)
1. `fetch()` - 26 edges
2. `scripts` - 25 edges
3. `getDb()` - 17 edges
4. `checkInvariants()` - 13 edges
5. `main()` - 13 edges
6. `fetchDirectTranscript()` - 12 edges
7. `main()` - 12 edges
8. `chunk()` - 11 edges
9. `Chunk` - 10 edges
10. `main()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Maestro pause-on-end E2E flow` --semantically_similar_to--> `Log-driven E2E via proxy /log/tail`  [INFERRED] [semantically similar]
  .maestro/pause-on-end.yaml → docs/E2E-ANDROID.md
- `stopAt() pulse pause in YouTubePlayer` --semantically_similar_to--> `youtube-iframe play/pause patch (injectJavaScript)`  [INFERRED] [semantically similar]
  docs/E2E-ANDROID.md → AGENTS.md
- `clearLog()` --calls--> `fetch()`  [INFERRED]
  scripts/e2e-pause.mjs → apps/proxy/src/index.ts
- `fetchTail()` --calls--> `fetch()`  [INFERRED]
  scripts/e2e-pause.mjs → apps/proxy/src/index.ts
- `preflight()` --calls--> `fetch()`  [INFERRED]
  scripts/e2e-pause.mjs → apps/proxy/src/index.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Pause-on-end watcher flow (replay→tick→stop→pause)** — e2e_android_session_screen_content, e2e_android_end_watcher_logic, e2e_android_stop_at_pulse, e2e_android_bridge_time, shadowtube_agents_youtube_player [EXTRACTED 0.85]
- **EC2 production deploy pipeline** — deploy_ec2_workflow, docker_compose_prod_proxy_service, deploy_ec2_health_check, shadowtube_agents_node_server [INFERRED 0.85]
- **Core data flow: URL→proxy→chunker→SQLite→player→Gemini** — shadowtube_agents_proxy_api, shadowtube_agents_transcript_client, shadowtube_agents_chunker, shadowtube_agents_sqlite, shadowtube_agents_youtube_player, shadowtube_agents_gemini_byok [EXTRACTED 0.85]

## Communities (50 total, 5 thin omitted)

### Community 0 - "Gemini Translation & Settings"
Cohesion: 0.07
Nodes (44): callModel(), callWithFallback(), chunkCache, chunkInflight, ChunkMap, extractJson(), FALLBACK_MODELS, formatApiError() (+36 more)

### Community 1 - "Mobile App Dependencies"
Cohesion: 0.04
Nodes (48): dependencies, drizzle-orm, expo, expo-constants, expo-font, expo-linking, @expo/metro-runtime, expo-modules-core (+40 more)

### Community 2 - "E2E Test Scripts"
Cohesion: 0.09
Nodes (41): checkI1bPauseFailed(), checkI1PauseDelivered(), checkI2GenMonotonic(), checkI3NoZombieTicks(), checkI4NoTicksAfterStop(), checkI5NoDegenerateDuration(), checkI6Liveness(), checkI7NoErrors() (+33 more)

### Community 3 - "Session Player & Pause-on-End"
Cohesion: 0.09
Nodes (27): ChunkBlock(), Props, styles, tokenize(), TranscriptView(), Props, styles, YouTubePlayerHandle (+19 more)

### Community 4 - "Screens & SQLite Store"
Cohesion: 0.10
Nodes (25): Database, db, getDb(), runMigrations(), chunks, sessions, videos, vocabulary (+17 more)

### Community 5 - "Monorepo Root Config"
Cohesion: 0.05
Nodes (36): devDependencies, concurrently, qrcode-terminal, engines, node, name, packageManager, react-native-youtube-iframe@2.4.1 (+28 more)

### Community 6 - "YouTube Transcript Client"
Cohesion: 0.12
Nodes (24): errorMessage(), fetchMetadata(), fetchTranscript(), formatProxyHttpError(), get(), ProxyHttpError, mockedDirectMetadata, mockedDirectTranscript (+16 more)

### Community 7 - "Logging & Error Boundary"
Cohesion: 0.09
Nodes (19): boot, eb, RootLayout(), styles, theme, DevErrorBoundary, Props, State (+11 more)

### Community 8 - "Node Proxy Server"
Cohesion: 0.12
Nodes (24): appendLog(), asRecord(), CaptionTrackDebug, classifyTranscriptError(), CORS, devLogsEnabled(), fetchMetadata(), fetchTranscript() (+16 more)

### Community 9 - "Themed UI Boilerplate"
Cohesion: 0.15
Nodes (14): styles, styles, EditScreenInfo(), styles, ExternalHref, ExternalLink(), MonoText(), Text() (+6 more)

### Community 10 - "Sentence Chunker & Shared Types"
Cohesion: 0.14
Nodes (19): ABBREVIATIONS, buildCharMap(), CharMap, chunk(), chunkByPauses(), chunkBySentences(), ChunkerOptions, clampChunkEnds() (+11 more)

### Community 11 - "E2E Pause Harness"
Cohesion: 0.14
Nodes (22): args, assertOnly, autoOpen, clearLog(), __dirname, DURATION_MS, fetchTail(), findBestStop() (+14 more)

### Community 12 - "Cloudflare Worker Proxy"
Cohesion: 0.18
Nodes (19): cachedFetch(), CaptionTrack, CORS_HEADERS, corsPreflight(), decodeXmlEntities(), extractPlayerResponse(), fetch(), fetchMetadata() (+11 more)

### Community 13 - "Proxy Dependencies"
Cohesion: 0.10
Nodes (19): dependencies, youtube-transcript, youtubei.js, devDependencies, @cloudflare/workers-types, tsx, @types/node, typescript (+11 more)

### Community 14 - "Pause-on-End E2E Docs"
Cohesion: 0.13
Nodes (19): Failed to download remote update (double Metro), Metro terminal as primary error source, bridgeTime.ts (getCurrentTime bridge), endWatcherLogic.ts (pure watcher logic + unit tests), Log-driven E2E via proxy /log/tail, E2E log events (replay_start→watcher_tick→watcher_stop→player_state), SessionScreenContent.tsx (watcher + replay), stopAt() pulse pause in YouTubePlayer (+11 more)

### Community 15 - "Proxy Deploy & Infra"
Cohesion: 0.16
Nodes (17): Expo Go SDK 56 version mismatch issue, Post-deploy health check (curl :8788), Deploy EC2 (SSH) GitHub Actions workflow, YOUTUBE_COOKIE for authenticated YouTube requests, Port mapping 8788:8787 (public:container), docker-compose.prod.yml proxy service (shadowtube-proxy), scripts/tunnel.mjs (proxy+ngrok+Metro tunnel), index.ts (Cloudflare Worker proxy) (+9 more)

### Community 17 - "Local APK Build Script"
Cohesion: 0.18
Nodes (10): androidDir, apkDst, apkSrc, __dirname, distDir, env, mobileDir, root (+2 more)

### Community 18 - "Proxy TS Config"
Cohesion: 0.18
Nodes (10): compilerOptions, lib, module, moduleResolution, noEmit, skipLibCheck, strict, target (+2 more)

### Community 19 - "Ngrok Tunnel Script"
Cohesion: 0.20
Nodes (8): children, clearCache, __dirname, expoArgs, expoEnv, root, sleep(), waitForNgrokUrl()

### Community 20 - "Android MainActivity"
Cohesion: 0.20
Nodes (5): MainActivity, Bundle, ReactActivity, ReactActivityDelegate, String

### Community 21 - "Shared Package Config"
Cohesion: 0.20
Nodes (9): devDependencies, typescript, main, name, private, scripts, typecheck, types (+1 more)

### Community 22 - "Shared TS Config"
Cohesion: 0.20
Nodes (9): compilerOptions, declaration, module, moduleResolution, noEmit, skipLibCheck, strict, target (+1 more)

### Community 23 - "Android MainApplication"
Cohesion: 0.25
Nodes (5): MainApplication, Application, Configuration, ReactApplication, ReactHost

### Community 24 - "Mobile TS Config"
Cohesion: 0.25
Nodes (7): compilerOptions, paths, strict, extends, include, @/*, @shadowtube/shared

### Community 25 - "APK Build (EAS) Script"
Cohesion: 0.29
Nodes (6): args, child, __dirname, mobileDir, profileArg, profileFlagIdx

### Community 26 - "Metro Bundler Config"
Cohesion: 0.33
Nodes (5): config, { getDefaultConfig }, monorepoRoot, path, sharedRoot

### Community 27 - "Web DB Stub"
Cohesion: 0.40
Nodes (3): AnyDb, Database, db

### Community 28 - "Expo App Manifest"
Cohesion: 0.40
Nodes (4): expo, name, owner, slug

### Community 29 - "E2E Dev Runner"
Cohesion: 0.50
Nodes (4): __dirname, main(), ROOT, run()

### Community 30 - "Expo Go Install Script"
Cohesion: 0.50
Nodes (3): ANDROID_HOME, PATH, install-expo-go.sh script

### Community 31 - "Emulator Start Script"
Cohesion: 0.50
Nodes (3): ANDROID_HOME, PATH, start-emulator.sh script

### Community 34 - "Product & MVP Scope"
Cohesion: 0.67
Nodes (3): Language Shadowing, MVP scope (Android only, en→ru, no SRS/auth/sync), ShadowTube (product)

## Knowledge Gaps
- **253 isolated node(s):** `Bundle`, `String`, `ReactActivityDelegate`, `ReactHost`, `Configuration` (+248 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `fetch()` connect `Cloudflare Worker Proxy` to `Gemini Translation & Settings`, `E2E Test Scripts`, `YouTube Transcript Client`, `Logging & Error Boundary`, `Node Proxy Server`, `Sentence Chunker & Shared Types`, `E2E Pause Harness`, `Ngrok Tunnel Script`?**
  _High betweenness centrality (0.160) - this node is a cross-community bridge._
- **Why does `youtubeFetch()` connect `Node Proxy Server` to `Cloudflare Worker Proxy`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `fetchDirectTranscript()` connect `YouTube Transcript Client` to `Cloudflare Worker Proxy`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Are the 13 inferred relationships involving `fetch()` (e.g. with `clearLog()` and `fetchTail()`) actually correct?**
  _`fetch()` has 13 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Bundle`, `String`, `ReactActivityDelegate` to the rest of the system?**
  _259 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Gemini Translation & Settings` be split into smaller, more focused modules?**
  _Cohesion score 0.06801346801346801 - nodes in this community are weakly interconnected._
- **Should `Mobile App Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.04081632653061224 - nodes in this community are weakly interconnected._