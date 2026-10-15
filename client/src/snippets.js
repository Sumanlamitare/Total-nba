// Ready-to-paste integrations for a ping URL
export function snippets(url) {
  return [
    ['cron', 'Crontab', `# runs at 03:00 every day, pings Nightjar only if the job succeeds
0 3 * * * /opt/backup.sh && curl -fsS -m 10 --retry 5 -o /dev/null ${url}`],
    ['bash', 'Bash', `#!/usr/bin/env bash
# times the run, reports failures, and sends the last lines of output
curl -fsS -m 10 --retry 5 -o /dev/null ${url}/start
output=$(/opt/backup.sh 2>&1)
code=$?
curl -fsS -m 10 --retry 5 -o /dev/null --data-raw "$(echo "$output" | tail -c 1000)" ${url}/$code`],
    ['python', 'Python', `import urllib.request

def run():
    ...  # your job

urllib.request.urlopen("${url}/start", timeout=10)
try:
    run()
    urllib.request.urlopen("${url}", timeout=10)
except Exception:
    urllib.request.urlopen("${url}/fail", timeout=10)
    raise`],
    ['node', 'Node.js', `const PING = "${url}";

await fetch(PING + "/start");
try {
  await runJob();
  await fetch(PING);
} catch (err) {
  await fetch(PING + "/fail", { method: "POST", body: String(err).slice(0, 1000) });
  throw err;
}`],
    ['gha', 'GitHub Actions', `# at the end of a scheduled workflow
      - name: Tell Nightjar
        if: always()
        run: curl -fsS -m 10 --retry 5 -o /dev/null ${url}/\${{ job.status == 'success' && '0' || 'fail' }}`],
    ['k8s', 'Kubernetes', `# CronJob container command
command: ["/bin/sh", "-c", "/app/job.sh && wget -q -T 10 -O /dev/null ${url}"]`],
    ['ps', 'PowerShell', `# Task Scheduler on Windows
& C:\\jobs\\backup.ps1
if ($?) { Invoke-RestMethod ${url} } else { Invoke-RestMethod ${url}/fail }`],
  ];
}
