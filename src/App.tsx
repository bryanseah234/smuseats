/**
 * App.tsx — Root router.
 *
 * Defines every client-side route in the SPA:
 *   /         → Landing page (Home)
 *   /rooms    → Filterable room browser (RoomsPage)
 *   /room/:id → Interactive seat map for a single room (RoomView)
 *   /edit     → Seat-position editor for contributors (EditSeats)
 *   *         → Fallback redirect to /
 */
import { Navigate, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import RoomView from './pages/RoomView';
import RoomsPage from './pages/RoomsPage';
import EditSeats from './pages/EditSeats';
import Compare from './pages/Compare';

const App = () => {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/rooms" element={<RoomsPage />} />
      <Route path="/room/:roomId" element={<RoomView />} />
      <Route path="/edit" element={<EditSeats />} />
      <Route path="/compare" element={<Compare />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
