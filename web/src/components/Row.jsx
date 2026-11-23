import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';

export default function Row({ title, subtitle, seeAll, children }) {
  const ref = useRef(null);
  const [edges, setEdges] = useState({ l: false, r: false });

  const update = () => {
    const el = ref.current;
    if (!el) return;
    setEdges({ l: el.scrollLeft > 4, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  useEffect(() => {
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [children]);

  const go = (dir) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });

  return (
    <section className="section">
      <div className="wrap">
        <div className="section-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {seeAll && <Link to={seeAll} className="see-all">See all <Icon name="chevR" size={15} /></Link>}
        </div>
        <div className="row">
          {edges.l && <button className="row-btn l" onClick={() => go(-1)} aria-label="Scroll left"><Icon name="chevL" /></button>}
          <div className="row-scroll" ref={ref} onScroll={update}>{children}</div>
          {edges.r && <button className="row-btn r" onClick={() => go(1)} aria-label="Scroll right"><Icon name="chevR" /></button>}
        </div>
      </div>
    </section>
  );
}
