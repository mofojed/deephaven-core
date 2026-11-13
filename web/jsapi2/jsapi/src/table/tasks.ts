/**
 * Approximate task tracking. A pending table may only be used in the task that created it; a zero-delay timer marks
 * when that task (and the microtasks it queued, where `await` calls `then`) has ended.
 */
let task = 0;
let taskEndScheduled = false;
const atEnd: (() => void)[] = [];

export function currentTask(): number {
  if (!taskEndScheduled) {
    taskEndScheduled = true;
    setTimeout(() => {
      taskEndScheduled = false;
      task++;
      for (const action of atEnd.splice(0)) {
        try {
          action();
        } catch (e) {
          console.error('Error at end of task', e);
        }
      }
    }, 0);
  }
  return task;
}

/** Runs `action` once the current task has ended. */
export function atTaskEnd(action: () => void): void {
  currentTask();
  atEnd.push(action);
}
