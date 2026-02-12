import { Navigate, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import RoomView from './pages/RoomView';
import CreateMap from './pages/CreateMap';

const App = () => {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/room/:roomId" element={<RoomView />} />
      <Route path="/create" element={<CreateMap />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
