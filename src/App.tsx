function App() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-50">
      <section className="mx-auto max-w-3xl rounded-xl border border-slate-800 bg-slate-900/60 p-8 shadow-lg shadow-slate-950/40">
        <h1 className="text-3xl font-semibold tracking-tight">SMU Seats</h1>
        <p className="mt-4 text-slate-300">
          Vite + React + TypeScript baseline initialized with PRD-required dependencies.
        </p>
      </section>
    </main>
  )
}

export default App
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
