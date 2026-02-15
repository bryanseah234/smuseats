import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import registry from '../data/registry.json';
import { BUILDING_CONFIG, BUILDING_ORDER } from '../utils/roomMeta';

const Home = () => {
  const stats = useMemo(() => {
    const buildingCounts = new Map<string, number>();
    let totalSeats = 0;
    registry.rooms.forEach((room) => {
      const building = room.image.replace(/^\/maps(?:-masked)?\//, '').split(' ')[0];
      buildingCounts.set(building, (buildingCounts.get(building) ?? 0) + 1);
      totalSeats += room.seats.length;
    });
    return { totalRooms: registry.rooms.length, totalSeats, buildingCounts };
  }, []);

  return (
    <div className="home-page">
      <section className="hero">
        <div className="hero__content">
          <img src="/logo.png" alt="SMU Seats" className="hero__logo" />
          <h1 className="hero__title">SMU Seats</h1>
          <p className="hero__subtitle">
            Show your friends where you are seated in class
          </p>
          <Link to="/rooms" className="hero__cta">
            Browse Rooms →
          </Link>
        </div>
      </section>

      <section className="stats-strip">
        <h2 className="section-title">We have</h2>
        <div className="stats-strip__cards">
          <div className="stat-card">
            <span className="stat-card__number">{stats.totalRooms}</span>
            <span className="stat-card__label">Rooms</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__number">{stats.buildingCounts.size}</span>
            <span className="stat-card__label">Buildings</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__number">{stats.totalSeats.toLocaleString()}+</span>
            <span className="stat-card__label">Seats</span>
          </div>
        </div>
      </section>

      <section className="how-it-works">
        <h2 className="section-title">How It Works</h2>
        <div className="steps">
          <div className="step">
            <span className="step__icon">🏫</span>
            <h3>Pick a room</h3>
            <p>Browse by building, floor, or room type</p>
          </div>
          <div className="step">
            <span className="step__icon">👆</span>
            <h3>Click your seat(s)</h3>
            <p>Select seats on the interactive floor plan</p>
          </div>
          <div className="step">
            <span className="step__icon">🔗</span>
            <h3>Share the link</h3>
            <p>Copy the URL and send it to your friends</p>
          </div>
        </div>
      </section>

      <section className="building-shortcuts">
        <h2 className="section-title">Buildings</h2>
        <div className="building-grid">
          {BUILDING_ORDER.filter((b) => stats.buildingCounts.has(b)).map((building) => {
            const config = BUILDING_CONFIG[building] ?? { label: building, color: '#6b7280', icon: '🏢' };
            const count = stats.buildingCounts.get(building) ?? 0;
            return (
              <Link key={building} to={`/rooms?building=${building}`} className="building-card">
                <div className="building-card__icon" style={{ background: config.color }}>
                  {config.label.charAt(0)}
                </div>
                <div className="building-card__body">
                  <h3>{config.label}</h3>
                  <p>{count} {count === 1 ? 'room' : 'rooms'}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <footer className="home-footer">Built for SMU students</footer>
    </div>
  );
};

export default Home;
