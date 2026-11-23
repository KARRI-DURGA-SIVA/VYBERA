import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { useApp } from '../lib/store';
import { ThemeSwitch } from '../lib/theme';
import { locationLabel } from '../lib/location';
import { displayName, initials } from '../lib/utils';
import { bookingPast, useMyBookings } from './MyBookings';
import { version as APP_VERSION } from '../../package.json';

// Mobile account screen (opened from the profile icon / Profile tab).
export default function Account() {
  const { user, setSignOutAsk, location, openLocPicker } = useApp();
  const nav = useNavigate();
  const bookings = useMyBookings();
  const upcoming = (bookings || []).filter((b) => !bookingPast(b)).length;
  const back = () => (window.history.length > 1 ? nav(-1) : nav('/'));
  const Row = ({ icon, label, value, onClick }) => (
    <button className="acc-row" onClick={onClick}>
      <Icon name={icon} size={22} /><b>{label}</b>{value && <span>{value}</span>}<Icon name="chevR" size={18} />
    </button>
  );
  return (
    <div className="acc">
      <button className="acc-back" onClick={back} aria-label="Back"><Icon name="arrowR" size={26} style={{ transform: 'rotate(180deg)' }} /></button>
      <div className="acc-who">
        <span className="acc-av">{initials(user)}</span>
        <div><h1>{displayName(user)}</h1><small>{user.email}</small></div>
      </div>

      <h6>Account</h6>
      <Row icon="user" label="Personal details" onClick={() => nav('/profile')} />
      <Row icon="ticket" label="My bookings" value={bookings ? `${upcoming} upcoming` : ''} onClick={() => nav('/bookings')} />

      <h6>Make it yours</h6>
      <Row icon="pin" label="Your city" value={locationLabel(location)} onClick={openLocPicker} />
      <Row icon="heart" label="Saved events" onClick={() => nav('/saved')} />
      <div className="acc-row acc-theme"><Icon name="moon" size={22} /><b>Appearance</b><ThemeSwitch /></div>
      <Row icon="bell" label="Notifications" value="On" onClick={() => nav('/profile?tab=prefs')} />

      <h6>Host &amp; sell</h6>
      <Row icon="spark" label="Creator mode" onClick={() => nav('/profile?tab=creator')} />

      <h6>We’ve got you</h6>
      <Row icon="help" label="Help & support" onClick={() => nav('/help')} />
      <Row icon="shield" label="Privacy & security" onClick={() => nav('/profile?tab=security')} />

      <button className="acc-out" onClick={() => setSignOutAsk(true)}>Sign out</button>

      <div className="acc-brand" aria-label={`BEE-OAK app version ${APP_VERSION}`}>
        <span className="acc-brand-mark"><img src="/logo.png" alt="" /><b>BEE·OAK</b></span>
        <small>App Version: {APP_VERSION}</small>
      </div>
    </div>
  );
}
