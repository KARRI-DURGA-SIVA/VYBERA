import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon';
import { useCreator } from '../../lib/creatorStore';
import { myEvents, scanLog, validateTicket } from '../../lib/creator';
import { CrHead } from './CreatorHome';

const hasDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;

export default function Scanner() {
  const { creator } = useCreator();
  const [ids, setIds] = useState(new Set());
  const [log, setLog] = useState(() => scanLog(creator));
  const [last, setLast] = useState(null);
  const [manual, setManual] = useState('');
  const [cam, setCam] = useState('off'); // off | starting | on | error
  const [camErr, setCamErr] = useState('');
  const [busy, setBusy] = useState(false);
  const video = useRef(null);
  const stream = useRef(null);
  const loop = useRef(0);
  const lastCode = useRef({ code: '', at: 0 });

  useEffect(() => { myEvents(creator).then((evs) => setIds(new Set(evs.map((e) => e.id)))).catch(() => {}); }, [creator]);

  const check = useCallback(async (code) => {
    if (!code) return;
    setBusy(true);
    const r = await validateTicket(creator, code, ids);
    setLast(r);
    setLog(scanLog(creator));
    setBusy(false);
    try { navigator.vibrate?.(r.result === 'valid' ? 80 : [60, 40, 60]); } catch { /* ignore */ }
  }, [creator, ids]);

  const stop = useCallback(() => {
    cancelAnimationFrame(loop.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCam('off');
  }, []);
  useEffect(() => stop, [stop]);

  const start = async () => {
    setCamErr('');
    if (!hasDetector) { setCam('error'); setCamErr('This browser can’t read QR codes from the camera. Use Chrome or Edge, or enter the code manually.'); return; }
    setCam('starting');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.current.srcObject = stream.current;
      await video.current.play();
      setCam('on');
      const det = new window.BarcodeDetector({ formats: ['qr_code'] });
      const tick = async () => {
        if (!stream.current) return;
        try {
          const codes = await det.detect(video.current);
          const v = codes[0]?.rawValue;
          // ignore the same code for 3 s so one ticket isn't scanned repeatedly
          if (v && (v !== lastCode.current.code || Date.now() - lastCode.current.at > 3000)) { lastCode.current = { code: v, at: Date.now() }; await check(v); }
        } catch { /* frame not ready */ }
        loop.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      stop();
      setCam('error');
      setCamErr(e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in your browser, or enter the code manually.' : 'No camera available. Enter the ticket code manually.');
    }
  };

  const fromImage = async (file) => {
    if (!file) return;
    if (!hasDetector) { setCamErr('This browser can’t read QR images. Paste the code instead.'); return; }
    try {
      const bmp = await createImageBitmap(file);
      const codes = await new window.BarcodeDetector({ formats: ['qr_code'] }).detect(bmp);
      if (!codes.length) { setLast({ result: 'invalid', message: 'No QR code found in that image' }); return; }
      check(codes[0].rawValue);
    } catch { setLast({ result: 'invalid', message: 'Could not read that image' }); }
  };

  const today = new Date().toDateString();
  const todays = log.filter((s) => new Date(s.at).toDateString() === today);
  const count = (r) => todays.filter((s) => s.result === r).length;

  return (
    <>
      <CrHead title="QR scanner" sub="Check guests in at the gate. Each ticket can be admitted once." />
      <div className="scan-grid">
        <div className="panel">
          <div className={`scan-view ${cam}`}>
            <video ref={video} playsInline muted />
            {cam !== 'on' && (
              <div className="scan-idle">
                <Icon name="qr" size={42} />
                <b>{cam === 'starting' ? 'Starting camera…' : 'Point the camera at a ticket QR'}</b>
                {camErr && <small>{camErr}</small>}
              </div>
            )}
            {cam === 'on' && <div className="scan-frame"><i /><i /><i /><i /><span className="scan-line" /></div>}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            {cam === 'on' ? <button className="btn btn-ghost" onClick={stop}>Stop camera</button> : <button className="btn btn-primary" onClick={start} disabled={cam === 'starting'}><Icon name="qr" size={16} /> Open camera</button>}
            <label className="btn btn-ghost" style={{ cursor: 'pointer' }}><Icon name="download" size={16} /> Scan from image<input type="file" accept="image/*" hidden onChange={(e) => fromImage(e.target.files[0])} /></label>
          </div>
          <form className="scan-manual" onSubmit={(e) => { e.preventDefault(); check(manual.trim()); setManual(''); }}>
            <input className="input mono" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Or paste the ticket code (from the QR)" aria-label="Ticket code" />
            <button className="btn btn-primary" disabled={!manual.trim() || busy}>Validate</button>
          </form>
        </div>
        <div>
          <div className={`scan-result ${last ? last.result : 'idle'}`} aria-live="assertive">
            {last ? (
              <>
                <span className="sr-ic"><Icon name={last.result === 'valid' ? 'check' : last.result === 'duplicate' ? 'info' : 'x'} size={30} stroke={2.4} /></span>
                <div>
                  <b>{last.result === 'valid' ? 'Valid — let them in' : last.result === 'duplicate' ? 'Already checked in' : 'Invalid ticket'}</b>
                  <p>{last.message}</p>
                  {last.booking && <small>{last.booking.buyerName || last.booking.buyer} · {last.booking.ticketType} × {last.booking.qty} · {last.booking.eventName}</small>}
                </div>
              </>
            ) : <><span className="sr-ic"><Icon name="qr" size={26} /></span><div><b>Ready to scan</b><p>Results appear here instantly.</p></div></>}
          </div>
          <div className="scan-counts">
            <div><b>{count('valid')}</b><small>Entries</small></div>
            <div><b>{count('duplicate')}</b><small>Duplicates</small></div>
            <div><b>{count('invalid')}</b><small>Invalid</small></div>
          </div>
          <div className="panel" style={{ marginTop: 16 }}>
            <h3>Recent scans</h3>
            {log.length ? log.slice(0, 8).map((s, i) => (
              <div key={i} className="scan-log">
                <span className={`dot-${s.result}`} />
                <span><b>{s.booking?.buyerName || s.booking?.buyer || s.bookingId || 'Unknown code'}</b><small>{s.message}</small></span>
                <time>{new Date(s.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</time>
              </div>
            )) : <p className="muted" style={{ fontSize: 14 }}>No scans yet.</p>}
          </div>
        </div>
      </div>
    </>
  );
}
