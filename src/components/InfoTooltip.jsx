import React, { useState } from 'react';
import { Info, BadgeCent, Globe, Truck, BookOpen, Anchor, Earth, Cloud } from 'lucide-react';

const InfoTooltip = () => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);

  return (
    <div className="info-tooltip-container" style={{ position: 'relative' }}>
      <Info
        size={24}
        color="#f7a600"
        style={{ cursor: 'pointer' }}
        onMouseEnter={() => setIsTooltipVisible(true)}
        onMouseLeave={() => setIsTooltipVisible(false)}
      />
      {isTooltipVisible && (
        <div className="tooltip" style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          backgroundColor: '#333',
          color: 'white',
          padding: '10px',
          borderRadius: '4px',
          boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
          width: '320px',
          zIndex: 1000,
          border: '2px solid #222222',
        }}>
          <h4 style={{ margin: '0 0 10px 0' }}>Symbol Legend</h4>
          <h5 style={{ margin: '10px 0 5px 0' }}>Planet Types:</h5>
          <ul style={{ padding: 0, margin: 0, listStyle: 'none' }}>
            <li><Earth size={16} style={{marginRight: '5px', color: '#f7a600'}} /> Rocky Planet</li>
            <li><Cloud size={16} style={{marginRight: '5px', color: '#f7a600'}} /> Gas Giant</li>
          </ul>
          <h5 style={{ margin: '10px 0 5px 0' }}>Resources:</h5>
          <ul style={{ padding: 0, margin: 0, listStyle: 'none' }}>
            <li>🪨 - Mineral resource</li>
            <li>💨 - Gaseous resource</li>
            <li>💧 - Liquid resource</li>
          </ul>
          <h5 style={{ margin: '10px 0 5px 0' }}>Facilities:</h5>
          <ul style={{ padding: 0, margin: 0, listStyle: 'none' }}>
            <li><BadgeCent size={16} style={{marginRight: '5px', color: '#f7a600'}} /> - Local Market</li>
            <li><Globe size={16} style={{marginRight: '5px', color: '#f7a600'}} /> - Chamber of Commerce</li>
            <li><Truck size={16} style={{marginRight: '5px', color: '#f7a600'}} /> - Warehouse</li>
            <li><BookOpen size={16} style={{marginRight: '5px', color: '#f7a600'}} /> - Administration Center</li>
            <li><Anchor size={16} style={{marginRight: '5px', color: '#f7a600'}} /> - Shipyard</li>
          </ul>
          
          {/* EXCESSIVE COMMENTING: Added comprehensive tooltip block describing the specific architectural layout parameters guiding the 400 density heuristic. */}
          <h5 style={{ margin: '10px 0 5px 0', color: '#f7a600' }}>Heuristic Disclaimers:</h5>
          <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: '#ccc', lineHeight: '1.3' }}>
            <strong>Uncongested Filter:</strong> Due to server limitations, this calculation utilizes a relative density ceiling rather than tracking actual open slots. Any planet hosting more than <strong>400 active plots</strong> via FIO data streams is classified as overbuilt. This measurement serves as an approximation and is subject to error as the meta dictates core hub movement.
          </p>

          <h5 style={{ margin: '10px 0 5px 0' }}>Planet Rating:</h5>
          <ul style={{ padding: 0, margin: 0, listStyle: 'none' }}>
            <li>Start at <strong>3★</strong>. Deduct stars by environment penalties.</li>
            <li>Penalties:</li>
            <ul style={{ paddingLeft: '16px', margin: '4px 0', listStyle: 'circle' }}>
              <li><code>MCG</code>,<code>SEA</code>: 0</li>
              <li><code>BL</code>, <code>INS</code>, <code>HSE</code>, <code>AEF</code>: −1</li>
              <li><code>MGC</code>, <code>TSH</code>: −2</li>
            </ul>
          </ul>

          <p style={{ margin: '8px 0 0 0' }}>
            Examples:
            <br/>• <code>HSE</code>: 3 − 1 = <strong>2★</strong>
            <br/>• <code>HSE+INS</code>: 3 − (1+1) = <strong>1★</strong>
            <br/>• <code>MGC</code>: 3 − 2 = <strong>1★</strong>
            <br/>• <code>TSH+HSE</code>: 3 − (2+1) = <strong>0★</strong>
            <br/>• <code>SEA</code> or <code>MCG</code> only: <strong>3★</strong>
          </p>
        </div>
      )}
    </div>
  );
};

export default InfoTooltip;