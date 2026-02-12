import MapBuilder from '../components/creator/MapBuilder';

const CreateMap = () => {
  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ marginTop: 0 }}>Create Seat Map</h1>
      <p style={{ color: '#4b5563' }}>
        Upload a floorplan, click to place seats, and download a JSON configuration for runtime use.
      </p>
      <MapBuilder />
    </main>
  );
};

export default CreateMap;
