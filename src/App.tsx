import { Navigate, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import RoomView from './pages/RoomView';

const App = () => {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/room/:roomId" element={<RoomView />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
