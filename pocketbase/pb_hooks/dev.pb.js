/** @typedef {import('../pb_data/types').RequestEvent} RequestEvent */
/** @typedef {import('../pb_data/types').Record} PBRecord */

// Expose a dev-only helper route that returns up to 10 users
// with emails ending in @example.com. This route is intentionally
// accessible without auth for local development convenience.
//
// GET /api/dev/example-users -> [{ id, email, name }]

// Enable only when IS_DEV=true is set in the env
const __devEnabled = (String(($os?.getenv?.('IS_DEV')) || '')).toLowerCase() === 'true'

if (__devEnabled) {
  /**
   * @param {RequestEvent} e
   */
  routerAdd('GET', '/api/dev/example-users', (e) => {
  try {
    /** @type {(PBRecord|undefined)[]} */
    const recs = $app.findRecordsByFilter(
      '_pb_users_auth_',
      'email ~ {:suffix}',
      '-created',
      10,
      0,
      { suffix: '@example.com' }
    );
    const items = recs.map((r) => ({
      id: r.id,
      email: r.getString('email'),
      name: r.getString('name')
    }));
    return e.json(200, items);
  } catch (err) {
    // mark as used to satisfy lint; avoid leaking details
    void err;
    return e.json(500, { error: 'failed' });
  }
  });
}
