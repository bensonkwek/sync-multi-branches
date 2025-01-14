const core = require("@actions/core");
const github = require("@actions/github");

const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");

async function run() {
  try {
    const fromBranch = core.getInput("FROM_BRANCH", { required: true });
    const toBranch = core.getInput("TO_BRANCH", { required: true });
    const githubToken = core.getInput("GITHUB_TOKEN", { required: true });
    const pullRequestTitle = core.getInput("PULL_REQUEST_TITLE");
    const pullRequestBody = core.getInput("PULL_REQUEST_BODY");
    const pullRequestIsDraft =
      core.getInput("PULL_REQUEST_IS_DRAFT").toLowerCase() === "true";
    const contentComparison =
      core.getInput("CONTENT_COMPARISON").toLowerCase() === "true";
    const reviewers = JSON.parse(core.getInput("REVIEWERS"));
    const team_reviewers = JSON.parse(core.getInput("TEAM_REVIEWERS"));
    const labels = JSON.parse(core.getInput("LABELS"));

    const toBranchesArray = toBranch.split(",");

    for (let branch of toBranchesArray) {
      try {
        
        console.log(
          `branches are ${toBranchesArray}`
        );
        
        console.log(
          `Should a pull request to ${branch} from ${fromBranch} be created?`
        );

        const octokit = new github.getOctokit(githubToken);

        const { data: currentPulls } = await octokit.rest.pulls.list({
          owner,
          repo,
        });

        const currentPull = currentPulls.find((pull) => {
          return pull.head.ref === fromBranch && pull.base.ref === branch;
        });

        if (!currentPull) {
          let shouldCreatePullRequest = true;
          if (contentComparison) {
            shouldCreatePullRequest = await hasContentDifference(
              octokit,
              fromBranch,
              branch
            );
          }

          if (shouldCreatePullRequest) {
            const { data: pullRequest } = await octokit.rest.pulls.create({
              owner,
              repo,
              head: fromBranch,
              base: branch,
              title: pullRequestTitle
                ? pullRequestTitle
                : `sync: ${fromBranch} to ${branch}`,
              body: pullRequestBody
                ? pullRequestBody
                : `sync-branches: New code has just landed in ${fromBranch}, so let's bring ${branch} up to speed!`,
              draft: pullRequestIsDraft,
            });

            if (reviewers.length > 0 || team_reviewers.length > 0) {
              octokit.rest.pulls.requestReviewers({
                owner,
                repo,
                pull_number: pullRequest.number,
                reviewers,
                team_reviewers,
              });
            }

            if (labels.length > 0) {
              octokit.rest.issues.addLabels({
                owner,
                repo,
                issue_number: pullRequest.number,
                labels
              })
            }

            console.log(
              `Pull request (${pullRequest.number}) successful! You can view it here: ${pullRequest.url}`
            );

            core.setOutput("PULL_REQUEST_URL", pullRequest.url.toString());
            core.setOutput("PULL_REQUEST_NUMBER", pullRequest.number.toString());
          } else {
            console.log(
              `There is no content difference between ${fromBranch} and ${branch}.`
            );
          }
        } else {
          console.log(
            `There is already a pull request (${currentPull.number}) to ${branch} from ${fromBranch}.`,
            `You can view it here: ${currentPull.url}`
          );

          core.setOutput("PULL_REQUEST_URL", currentPull.url.toString());
          core.setOutput("PULL_REQUEST_NUMBER", currentPull.number.toString());
        }
      } catch (error) {
        core.setFailed(error.message);
      }
    }
      
      async function hasContentDifference(octokit, fromBranch, branch) {
        const { data: response } = await octokit.rest.repos.compareCommits({
          owner,
          repo,
          base: branch,
          head: fromBranch,
          page: 1,
          per_page: 1,
        });
        return response.files.length > 0;
      }
      
    }
    
    catch (error) {
      core.setFailed(error.message);
    }
  }
run();
