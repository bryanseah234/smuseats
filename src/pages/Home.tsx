import { Link } from 'react-router-dom';
import registry from '../data/registry.json';

const Home = () => {
  return (
    <main>
      <h1>Smuseats</h1>
      <p>Select a room to enter.</p>
      <ul>
        {registry.rooms.map((room) => (
          <li key={room.id}>
            <h2>{room.name}</h2>
            <p>{room.description}</p>
            <Link to={`/room/${room.id}`}>{`Open ${room.name}`}</Link>
          </li>
        ))}
      </ul>
      <Link to="/create">Create a new map</Link>
    </main>
  );
};

export default Home;
