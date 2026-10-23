import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Explicit private fixture only: no published ports, models, database or app data.
test('actual NGINX preserves business503 JSON while retaining gateway fallbacks and SSE', { timeout: 60000 }, async () => {
  assert.equal(process.env.NGINX_FIXTURE_SYNTHETIC, '1');
  const prefix = `interview-nginx-check-${process.pid}`;
  const directory = mkdtempSync(join(tmpdir(), 'interview-nginx-config-'));
  const docker = args => execFileSync('docker', args, { encoding: 'utf8', timeout: 15000 });
  const source = process.env.NGINX_FIXTURE_BASELINE === '1'
    ? execFileSync('git', ['show', 'HEAD:apps/web/nginx.conf'], { encoding: 'utf8' })
    : readFileSync(resolve('apps/web/nginx.conf'), 'utf8');
  writeFileSync(join(directory, 'default.conf'), source);
  const apiImage = process.env.NGINX_FIXTURE_API_IMAGE || 'interview-api:verification';
  const webImage = process.env.NGINX_FIXTURE_WEB_IMAGE || 'interview-web:verification';
  let primary;
  try {
    docker(['image', 'inspect', apiImage]); docker(['image', 'inspect', webImage]);
    docker(['network', 'create', '--internal', prefix]);
    docker(['run', '-d', '--name', `${prefix}-api`, '--network', prefix, '--network-alias', 'api', '--entrypoint', 'node', apiImage, '-e', `
      require('node:http').createServer((req,res)=>{
        const status=Number(req.url.split('/').at(-1));
        if(req.url==='/api/sse'){res.setHeader('Content-Type','text/event-stream');return res.end('data: {"type":"token","content":"synthetic"}\\n\\ndata: [DONE]\\n\\n');}
        res.writeHead(status,{'Content-Type':'application/json','X-Synthetic-Upstream':'yes'});
        res.end(JSON.stringify({statusCode:status,message:status===503?'synthetic storage result unknown':'synthetic upstream'}));
      }).listen(3001,'0.0.0.0');
    `]);
    docker(['run', '-d', '--name', `${prefix}-web`, '--network', prefix, '--network-alias', 'proxy', '-v', `${join(directory, 'default.conf')}:/etc/nginx/conf.d/default.conf:ro`, webImage]);
    docker(['exec', `${prefix}-web`, 'nginx', '-t']);
    let ready = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      try { docker(['exec', `${prefix}-web`, 'wget', '-q', '-O', '/dev/null', 'http://127.0.0.1/']); ready = true; break; }
      catch { await new Promise(resolveReady => setTimeout(resolveReady, 200)); }
    }
    assert.ok(ready);
    const result = JSON.parse(docker(['exec', `${prefix}-api`, 'node', '-e', `
      (async()=>{const result=[];for(const path of ['503','502','504','200','sse']){
        const response=await fetch('http://proxy/api/'+path,{signal:AbortSignal.timeout(5000)});
        result.push({path,status:response.status,type:response.headers.get('content-type'),body:await response.text(),upstream:response.headers.get('x-synthetic-upstream')});
      }process.stdout.write(JSON.stringify(result));})().catch(error=>{console.error(error);process.exitCode=1;});
    `]));
    const business = result.find(item => item.path === '503');
    assert.equal(business.status, 503); assert.equal(business.upstream, 'yes');
    assert.deepEqual(JSON.parse(business.body), { statusCode: 503, message: 'synthetic storage result unknown' });
    for (const path of ['502', '504']) {
      const fallback = result.find(item => item.path === path);
      // A named error location preserves the original upstream status here.
      assert.equal(fallback.status, Number(path)); assert.equal(JSON.parse(fallback.body).statusCode, 502);
      assert.equal(JSON.parse(fallback.body).message, 'API 服务暂不可用，请稍后重试');
    }
    const success = result.find(item => item.path === '200');
    assert.equal(success.status, 200); assert.equal(success.upstream, 'yes');
    const stream = result.find(item => item.path === 'sse');
    assert.equal(stream.status, 200); assert.match(stream.type, /text\/event-stream/);
    assert.equal(stream.body, 'data: {"type":"token","content":"synthetic"}\n\ndata: [DONE]\n\n');
  } catch (error) { primary = error; throw error; }
  finally {
    const errors = [];
    try { docker(['rm', '-fv', `${prefix}-web`, `${prefix}-api`]); } catch (error) { errors.push(error); }
    try { docker(['network', 'rm', prefix]); } catch (error) { errors.push(error); }
    rmSync(directory, { recursive: true, force: true });
    if (errors.length) throw new AggregateError([...(primary ? [primary] : []), ...errors], 'Private NGINX fixture cleanup failed');
  }
});
