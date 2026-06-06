# Global Settings HTTP Server

This is a zero-dependency Node.js HTTP server. It stores client `GlobalSettings` data in a simple JSON database and splits global data into sections.

## Server Config

Edit:

```text
C:\CocosProject\http_server\server.config.json
```

Example:

```json
{
  "host": "0.0.0.0",
  "port": 8787,
  "dbFile": "./db/global_db.json",
  "maxBodyBytes": 1048576
}
```

- `host`: server bind IP. Use `0.0.0.0` when other devices need to connect.
- `port`: server port.
- `dbFile`: JSON database file path. Relative paths are resolved from `C:\CocosProject\http_server`.
- `maxBodyBytes`: maximum request body size.

Environment variables can override config values:

```bash
HOST=0.0.0.0 PORT=8787 DB_FILE=./db/global_db.json MAX_BODY_BYTES=1048576 node server.js
```

## Start

```powershell
cd C:\CocosProject\http_server
cmd /c npm start
```

Or:

```powershell
cd C:\CocosProject\http_server
node server.js
```

Health check:

```http
GET /health
```

Default database file:

```text
C:\CocosProject\http_server\db\global_db.json
```

## Client Config

Edit the Cocos client config:

```text
C:\CocosProject\VITA\assets\script\net\ServerConfig.ts
```

Example:

```ts
const ServerConfig = {
    protocol: 'http',
    ip: '127.0.0.1',
    port: 8787,
    timeoutMs: 10000,
};
```

All clients should point `ip` and `port` to the server machine. If phones or other LAN devices connect to the server, set:

- server `host` to `0.0.0.0`
- client `ip` to the server computer's LAN IP
- client `port` to the server `port`

## Data Sections

- `settings`: `language`, `musicEnabled`, `soundEnabled`, `voiceEnabled`, `shockEnabled`
- `profile`: `bgIndex`, `avatarIndex`, `frameIndex`
- `daily`: `dailySelectedYear`, `dailySelectedMonth`, `dailySelectedDay`, `dailyClearData`
- `progress`: `currentLevel`
- `misc`: extra fields

## APIs

```http
GET   /api/global/:playerId
PUT   /api/global/:playerId
PATCH /api/global/:playerId
GET   /api/global/:playerId/sections
GET   /api/global/:playerId/sections/:section
PUT   /api/global/:playerId/sections/:section
PATCH /api/global/:playerId/sections/:section

POST  /api/rank/settlement

GET   /api/user/info/:playerId
POST  /api/user/info/:playerId
PATCH /api/user/info/:playerId
```

Rank settlement request:

```http
POST /api/rank/settlement
Content-Type: application/json

{
  "playerId": "player_001",
  "level": 1,
  "score": 3600,
  "combo": 12,
  "timeMs": 128000
}
```

Rank response:

```json
{
  "ok": true,
  "rank": {
    "beatPercent": 80,
    "improved": true,
    "totalPlayers": 10,
    "oldRank": 50,
    "previousRank": 50,
    "newRank": 47,
    "rank": 47,
    "rankUp": true,
    "rankIncreased": true,
    "self": {},
    "top100": [],
    "surrounding": []
  }
}
```

Rank comparison order is score first, then combo, then shorter time. The returned percentage is rounded to an integer for a fuzzy display result.
When `specialScore` is submitted, the server also returns the daily special score rank transition fields above. The client opens `ChallengeLevelUpUI` only when `rankUp`/`rankIncreased` is true and `newRank < oldRank`.

## Server Framework

- `json_data_store.js`: shared JSON data read/write helper.
- `route_registry.js`: shared route registration and matching helper.
- `level_rank_service.js`: level ranking business logic only.
- `server.js`: wires common data, common routes, and business services together.

Example:

```http
PATCH /api/global/player_001/sections/profile
Content-Type: application/json

{
  "avatarIndex": 2,
  "frameIndex": 4
}
```

## Cocos Usage

```ts
import GlobalSettingsApi from "./net/GlobalSettingsApi";
import GlobalSettings from "./config/GlobalSettings";

const api = new GlobalSettingsApi({
    playerId: "player_001",
});

api.saveGlobal(GlobalSettings.getAll());
api.patchSection("profile", {
    avatarIndex: GlobalSettings.avatarIndex,
    frameIndex: GlobalSettings.frameIndex,
});
api.getGlobal().then((global) => GlobalSettings.setAll(global));
```

## User Info

User info is handled by `user_info_service.js`, using the shared `JsonDataStore` and `RouteRegistry`.

```http
PATCH /api/user/info/player_001
Content-Type: application/json

{
  "avatarId": 2,
  "avatarFrameId": 4
}
```
