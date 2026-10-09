/** 并发池（p-limit 等价实现，无依赖） */
export type LimitFn = <T>(task: () => Promise<T>) => Promise<T>

export function createLimiter(concurrency: number): LimitFn {
  const max = Math.max(1, Math.floor(concurrency) || 1)
  let active = 0
  const queue: Array<() => void> = []

  const next = () => {
    active--
    const run = queue.shift()
    if (run) run()
  }

  return function limit<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        active++
        task().then(resolve, reject).finally(next)
      }
      if (active < max) run()
      else queue.push(run)
    })
  }
}
