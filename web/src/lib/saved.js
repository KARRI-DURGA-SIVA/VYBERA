// Saved (wishlisted) events, kept on this device.
import { useEffect, useState } from 'react';
import { storage } from './api';

const KEY = 'beeoak.web.saved';
const EVT = 'beeoak:saved';
export const savedIds = () => storage.get(KEY, []);
export function toggleSaved(id) {
  const cur = savedIds();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur];
  storage.set(KEY, next);
  window.dispatchEvent(new Event(EVT));
  return next.includes(id);
}
export function useSaved() {
  const [ids, setIds] = useState(savedIds);
  useEffect(() => {
    const on = () => setIds(savedIds());
    window.addEventListener(EVT, on); window.addEventListener('storage', on);
    return () => { window.removeEventListener(EVT, on); window.removeEventListener('storage', on); };
  }, []);
  return ids;
}
