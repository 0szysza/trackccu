import { emptyState, delay } from './core.mjs';

export class GitHubState {
  constructor({ token = process.env.GITHUB_TOKEN, repository = process.env.GITHUB_REPOSITORY, branch = 'bgsi-alert-state', fetchImpl = fetch } = {}) {
    if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('Missing GitHub Actions state configuration');
    this.token = token; this.repository = repository; this.branch = branch; this.fetch = fetchImpl; this.sha = null;
  }
  async request(endpoint, options = {}) {
    return this.fetch(`https://api.github.com/repos/${this.repository}/${endpoint}`, { ...options, signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' } });
  }
  async ensureBranch() {
    const existing = await this.request(`git/ref/heads/${this.branch}`);
    if (existing.ok) return;
    if (existing.status !== 404) throw new Error(`Cannot read BGSI state branch (HTTP ${existing.status})`);
    const main = await this.request('git/ref/heads/main');
    if (!main.ok) throw new Error(`Cannot initialize BGSI state branch (HTTP ${main.status})`);
    const head = await main.json();
    const created = await this.request('git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${this.branch}`, sha: head.object.sha }) });
    if (!created.ok) throw new Error(`Cannot create BGSI state branch (HTTP ${created.status})`);
  }
  async read() {
    await this.ensureBranch();
    const response = await this.request(`contents/bgsi-alert-state.json?ref=${this.branch}`);
    if (response.status === 404) return emptyState();
    if (!response.ok) throw new Error(`Cannot read BGSI state (HTTP ${response.status}); refusing to reset history`);
    const file = await response.json();
    const state = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
    this.sha = file.sha;
    return state;
  }
  async write(state) {
    const text = JSON.stringify(state, null, 2) + '\n';
    const originalSha = this.sha;
    for (let attempt = 0; attempt < 5; attempt++) {
      let response;
      try {
        response = await this.request('contents/bgsi-alert-state.json', { method: 'PUT', body: JSON.stringify({ branch: this.branch, message: 'Persist BGSI notification state [skip ci]', content: Buffer.from(text).toString('base64'), ...(this.sha ? { sha: this.sha } : {}) }) });
        if (response.ok) { this.sha = (await response.json()).content.sha; return; }
        if (response.status < 500 && response.status !== 429) throw new Error(`Cannot persist BGSI state (HTTP ${response.status})`);
      } catch (error) {
        if (response && response.status < 500 && response.status !== 429) throw error;
      }
      // A timed-out write may have succeeded. Verify its exact contents before retrying.
      const check = await this.request(`contents/bgsi-alert-state.json?ref=${this.branch}`).catch(() => null);
      if (check?.ok) {
        const file = await check.json();
        if (Buffer.from(file.content, 'base64').toString('utf8') === text) { this.sha = file.sha; return; }
        if (file.sha !== originalSha) throw new Error('BGSI state changed concurrently; refusing to overwrite it');
      }
      if (attempt < 4) await delay(1000 * 2 ** attempt);
    }
    throw new Error('Could not persist BGSI state; notifications paused for this run');
  }
}
