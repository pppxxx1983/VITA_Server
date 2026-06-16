const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;

class TrackingRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async ensureTable() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS tracking_events (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        event_id VARCHAR(96) NOT NULL UNIQUE,
        event_name VARCHAR(64) NOT NULL,
        player_id VARCHAR(191) NULL,
        session_id VARCHAR(96) NULL,
        platform VARCHAR(32) NULL,
        app_version VARCHAR(32) NULL,
        client_time DATETIME(3) NOT NULL,
        server_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        properties JSON NULL,
        user_ip VARCHAR(45) NULL,
        INDEX idx_tracking_event_time (event_name, client_time),
        INDEX idx_tracking_player_time (player_id, client_time),
        INDEX idx_tracking_server_time (server_time)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async insertEvents(input, userIp) {
    const rawEvents = Array.isArray(input && input.events) ? input.events : [input];
    if (!rawEvents.length || rawEvents.length > 100) {
      throw new Error('events must contain between 1 and 100 items');
    }
    const rows = rawEvents.map((event) => this.normalizeEvent(event, userIp));
    const placeholders = rows.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
    const values = [];
    for (const row of rows) values.push(...row);
    const [result] = await this.pool.execute(
      `INSERT IGNORE INTO tracking_events
       (event_id, event_name, player_id, session_id, platform, app_version,
        client_time, properties, user_ip)
       VALUES ${placeholders}`,
      values
    );
    return { received: rows.length, inserted: result.affectedRows };
  }

  normalizeEvent(event, userIp) {
    if (!event || typeof event !== 'object') throw new Error('event must be an object');
    const eventName = String(event.eventName || event.event_name || '').trim();
    if (!EVENT_NAME_PATTERN.test(eventName)) throw new Error(`invalid eventName: ${eventName}`);
    const eventId = String(event.eventId || event.event_id || '').trim();
    if (!eventId || eventId.length > 96) throw new Error('eventId is required');
    const clientDate = event.clientTime ? new Date(event.clientTime) : new Date();
    if (Number.isNaN(clientDate.getTime())) throw new Error('invalid clientTime');
    const properties = event.properties && typeof event.properties === 'object' && !Array.isArray(event.properties)
      ? event.properties
      : {};
    return [
      eventId,
      eventName,
      this.text(event.playerId, 191),
      this.text(event.sessionId, 96),
      this.text(event.platform, 32),
      this.text(event.appVersion, 32),
      clientDate,
      JSON.stringify(properties),
      this.text(userIp, 45),
    ];
  }

  text(value, maxLength) {
    if (value === undefined || value === null || value === '') return null;
    return String(value).slice(0, maxLength);
  }
}

module.exports = { TrackingRepository };
