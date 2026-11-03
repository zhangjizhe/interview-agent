// Idempotency, finite daily admissions, visitor frequency and active slots are one Redis operation.
export const PORTFOLIO_ADMIT_SCRIPT = `
local previous = redis.call('GET', KEYS[1])
if previous then return {0, previous} end
if tonumber(redis.call('GET', KEYS[2]) or '0') >= tonumber(ARGV[3]) then return {-1, 'daily'} end
if tonumber(redis.call('GET', KEYS[3]) or '0') >= 3 then return {-1, 'visitor'} end
if redis.call('SCARD', KEYS[4]) >= 2 then return {-1, 'active'} end
redis.call('SET', KEYS[1], ARGV[1], 'EX', 86400)
redis.call('SET', KEYS[5], ARGV[2])
redis.call('SADD', KEYS[4], ARGV[1])
redis.call('INCR', KEYS[2]); redis.call('EXPIRE', KEYS[2], 172800)
redis.call('INCR', KEYS[3]); redis.call('EXPIRE', KEYS[3], 60)
return {1, ARGV[1]}`;
export const PORTFOLIO_RELEASE_SCRIPT = `redis.call('SREM', KEYS[1], ARGV[1]); if redis.call('EXISTS', KEYS[2]) == 1 then redis.call('EXPIRE', KEYS[2], 86400) end; return 1`;
