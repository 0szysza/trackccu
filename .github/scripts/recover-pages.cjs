const terminal = new Set([
  'succeed',
  'deployment_cancelled',
  'deployment_failed',
  'deployment_content_failed',
  'deployment_lost'
]);

module.exports = async function recoverPages({ github, context, core }, {
  currentOnly = false,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms))
} = {}) {
  const repo = context.repo;
  const statusRoute = 'GET /repos/{owner}/{repo}/pages/deployments/{pages_deployment_id}';
  const cancelRoute = 'POST /repos/{owner}/{repo}/pages/deployments/{pages_deployment_id}/cancel';

  async function getStatus(sha) {
    try {
      const { data } = await github.request(statusRoute, { ...repo, pages_deployment_id: sha });
      return data.status;
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }

  async function cancelPending(sha) {
    const status = await getStatus(sha);
    if (!status || terminal.has(status)) return;
    core.info(`Canceling interrupted Pages deployment ${sha} (${status}).`);
    await github.request(cancelRoute, { ...repo, pages_deployment_id: sha });
    for (let attempt = 0; attempt < 12; attempt++) {
      const next = await getStatus(sha);
      if (!next || terminal.has(next)) {
        core.info(`Pages deployment ${sha} is no longer active (${next || 'not found'}).`);
        return;
      }
      await wait(5000);
    }
    throw new Error(`Pages deployment ${sha} did not finish canceling within 60 seconds.`);
  }

  // A failed creation request can return 502 after Pages has accepted it.
  // The commit SHA also works as the deployment ID when no ID was returned.
  if (currentOnly) return cancelPending(context.sha);

  const { data: current } = await github.rest.actions.getWorkflowRun({ ...repo, run_id: context.runId });
  const { data: { workflow_runs: runs } } = await github.rest.actions.listWorkflowRuns({
    ...repo, workflow_id: current.workflow_id, branch: 'main', per_page: 100
  });
  const seen = new Set();
  for (const run of runs) {
    if (run.id === context.runId || run.status !== 'completed') continue;
    if (run.conclusion === 'success') break;
    if (!['failure', 'cancelled', 'timed_out'].includes(run.conclusion) || seen.has(run.head_sha)) continue;
    seen.add(run.head_sha);
    await cancelPending(run.head_sha);
  }
};
