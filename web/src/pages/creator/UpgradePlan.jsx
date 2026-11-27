import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon';
import { planStatus } from '../../lib/creator';
import PlanWall, { PlanActivated } from './Plans';
import { PageLoader } from '../Details';

// Sidebar → "Upgrade plan": every plan, with the organizer's current plan marked.
export default function UpgradePlan() {
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [activated, setActivated] = useState(null);
  const load = useCallback(() => { planStatus().then(setD).catch((e) => setErr(e.status === 404 ? 'Plans aren’t available on this server yet.' : e.message)); }, []);
  useEffect(() => { load(); }, [load]);
  if (activated) return <PlanActivated sub={activated.subscription} credits={activated.credits} onContinue={() => nav('/creator/create')} />;
  if (err) return <div className="empty"><div className="ic"><Icon name="info" size={26} /></div><h3>Plans unavailable</h3><p>{err}</p></div>;
  if (!d) return <PageLoader />;
  return <PlanWall plans={d.plans} trial={d.trial} trialAvailable={d.trialAvailable} creditValue={d.creditReferenceValue} current={d.subscription} onActivated={setActivated} />;
}
