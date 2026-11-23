import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { useApp } from './lib/store';
import Home from './pages/Home';
import Explore from './pages/Explore';
import Details, { PageLoader } from './pages/Details';
import Booking from './pages/Booking';
import Checkout from './pages/Checkout';
import Confirmation from './pages/Confirmation';
import MyBookings, { BookingDetail } from './pages/MyBookings';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import { Login, Register } from './pages/Auth';
import { About, Contact, Help, NotFound } from './pages/Info';
import Opportunities from './pages/Opportunities';
import Saved from './pages/Saved';
import Search from './pages/Search';
import Account from './pages/Account';
import CreatorLayout from './pages/creator/CreatorLayout';
import CreatorDashboard, { CreatorEvents, CreatorRevenue } from './pages/creator/CreatorHome';
import CreateEvent from './pages/creator/CreateEvent';
import Scanner from './pages/creator/Scanner';
import Staff from './pages/creator/Staff';
import OppManage from './pages/creator/OppManage';
import { PaymentReturn, StaffDashboard, StaffHome, StaffJoin, StaffLayout } from './pages/staff/StaffPages';

function RequireAuth({ children }) {
  const { user, authReady } = useApp();
  const loc = useLocation();
  if (!authReady && !user) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="creator" element={<CreatorLayout />}>
        <Route index element={<CreatorDashboard />} />
        <Route path="events" element={<CreatorEvents />} />
        <Route path="create" element={<CreateEvent />} />
        <Route path="revenue" element={<CreatorRevenue />} />
        <Route path="scanner" element={<Scanner />} />
        <Route path="staff" element={<Staff />} />
        <Route path="opportunity/:id" element={<OppManage />} />
        <Route path="*" element={<CreatorDashboard />} />
      </Route>
      <Route path="staff" element={<StaffLayout />}>
        <Route index element={<StaffHome />} />
        <Route path="m/:memberId" element={<StaffDashboard />} />
      </Route>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="explore" element={<Explore />} />
        <Route path="saved" element={<Saved />} />
        <Route path="search" element={<Search />} />
        <Route path="account" element={<RequireAuth><Account /></RequireAuth>} />
        <Route path="opportunities" element={<Opportunities />} />
        <Route path="event/:id" element={<Details />} />
        <Route path="opportunity/event/:id" element={<Details />} />
        <Route path="opportunity/event/:id/join" element={<StaffJoin />} />
        <Route path="payment/return" element={<PaymentReturn />} />
        <Route path="event/:id/book" element={<Booking />} />
        <Route path="event/:id/pay" element={<RequireAuth><Booking mode="pay" /></RequireAuth>} />
        <Route path="checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
        <Route path="confirmation/:id" element={<RequireAuth><Confirmation /></RequireAuth>} />
        <Route path="dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="bookings" element={<RequireAuth><MyBookings /></RequireAuth>} />
        <Route path="bookings/:id" element={<RequireAuth><BookingDetail /></RequireAuth>} />
        <Route path="profile" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="about" element={<About />} />
        <Route path="contact" element={<Contact />} />
        <Route path="help" element={<Help />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
