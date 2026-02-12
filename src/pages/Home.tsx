import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

type Room = {
  id: string | number;
  name: string;
  description: string;
};

type Registry = {
  rooms: Room[];
};

const Home = () => {
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadRegistry = async () => {
      try {
        const response = await fetch('/data/registry.json');
        if (!response.ok) {
          throw new Error(`Failed to load registry: ${response.status} ${response.statusText}`);
        }
        const data = (await response.json()) as Registry;
        setRegistry(data);
      } catch (err) {
        console.error(err);
        setError('Failed to load rooms.');
      }
    };

    loadRegistry();
  }, []);

  return (
    <main>
      <h1>Smuseats</h1>
      <p>Select a room to enter.</p>
      {error && <p>{error}</p>}
      {!error && !registry && <p>Loading rooms...</p>}
      {registry && (
        <>
          <ul>
            {registry.rooms.map((room) => (
              <li key={room.id}>
                <h2>{room.name}</h2>
                <p>{room.description}</p>
                <Link to={`/room/${room.id}`}>Open room</Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <Link to="/create">Create a new map</Link>
    </main>
  );
};

export default Home;
