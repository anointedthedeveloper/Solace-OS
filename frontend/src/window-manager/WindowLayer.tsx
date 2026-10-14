import { useShallow } from 'zustand/react/shallow';
import { useWindows } from '@/stores/windowStore';
import { WindowFrame } from './WindowFrame';

/** Renders every window once, in creation order; stacking is handled by z-index only. */
export function WindowLayer() {
  const ids = useWindows(useShallow((s) => Object.keys(s.windows)));
  return (
    <>
      {ids.map((id) => (
        <WindowFrame key={id} id={id} />
      ))}
    </>
  );
}
