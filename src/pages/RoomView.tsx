import { Link, useParams } from 'react-router-dom';
import registry from '../data/registry.json';

type RoomConfig = (typeof registry.rooms)[number];

const getRoomConfig = (roomId?: string): RoomConfig | null => {
  if (!roomId) {
    return null;
  }

  return registry.rooms.find((room) => room.id === roomId) ?? null;
};

const RoomView = () => {
  const { roomId } = useParams<'roomId'>();
  const room = getRoomConfig(roomId);

  if (!room) {
    return (
      <main>
        <h1>Room not found</h1>
        <p>We could not find a room with id "{roomId}".</p>
        <Link to="/">Back home</Link>
      </main>
    );
  }

  return (
    <main>
      <h1>{room.name}</h1>
      <p>{room.description}</p>
      <dl>
        <dt>Room ID</dt>
        <dd>{room.id}</dd>
        <dt>Dimensions</dt>
        <dd>
          {room.layout.width} × {room.layout.height}
        </dd>
        <dt>Spawn point</dt>
        <dd>
          ({room.layout.spawn[0]}, {room.layout.spawn[1]})
        </dd>
      </dl>
      <Link to="/">Back home</Link>
    </main>
  );
};

export default RoomView;
