// Navigation and dialogs may overlap during a React commit. Restore scrolling
// only after the last owner releases it, preserving the user's prior setting.
const locks = new WeakMap<Document, { count: number; overflow: string }>();
export function acquirePageScrollLock(doc: Document = document) {
  const state = locks.get(doc) ?? { count: 0, overflow: doc.body.style.overflow };
  state.count += 1;
  locks.set(doc, state);
  doc.body.style.overflow = 'hidden';
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.count -= 1;
    if (!state.count) { doc.body.style.overflow = state.overflow; locks.delete(doc); }
  };
}
