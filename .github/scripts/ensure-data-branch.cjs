module.exports = async ({ github, context }) => {
  const repo = context.repo;
  try { await github.rest.git.getRef({ ...repo, ref: 'heads/tracker-data' }); return; }
  catch (error) { if (error.status !== 404) throw error; }
  const { data: tree } = await github.rest.git.createTree({ ...repo, tree: [{ path: 'README.md', mode: '100644', type: 'blob', content: '# Tracker checkpoints\n\nDurable data used by the Pages collector. Daily recovery copies are stored in Actions artifacts.\n' }] });
  const { data: commit } = await github.rest.git.createCommit({ ...repo, message: 'Initialize independent tracker data', tree: tree.sha, parents: [] });
  await github.rest.git.createRef({ ...repo, ref: 'refs/heads/tracker-data', sha: commit.sha });
};
