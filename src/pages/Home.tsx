import { Link } from 'react-router-dom';

import registry from '../data/registry.json';
import { pdfRooms } from '../data/pdfRooms';

const rooms = pdfRooms.length > 0 ? pdfRooms : registry.rooms;

const Home = () => {
  return (
    <main style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <h1>SMU Seats</h1>
      <p>Choose a room to preview its seating canvas.</p>

      <ul style={{ display: 'grid', gap: 12, listStyle: 'none', padding: 0 }}>
        {rooms.map((room) => (
          <li key={room.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
            <h2 style={{ margin: '0 0 6px' }}>{room.name}</h2>
            <p style={{ margin: '0 0 8px', color: '#4b5563' }}>{room.description}</p>
            <Link to={`/room/${room.id}`}>Open room</Link>
          </li>
        ))}
      </ul>

      <div style={{ marginTop: 16 }}>
        <Link to="/create">Create a new map</Link>
      </div>
    </main>
  );
};

export default Home;
