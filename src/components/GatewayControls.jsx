import React from 'react';
import { useMapMode, GATEWAY_STRATEGIES, MAP_MODES } from '../contexts/MapModeContext';

const GatewayControls = () => {
  const { gatewayData, setGatewayStrategy, clearAllGateways, toggleMode } = useMapMode();

  // EXCESSIVE COMMENTING: When Gateway Mode activates, `StandardControls` is unmounted. Because the mode-toggle is now inside the Advanced menu of `StandardControls`, users need a manual escape hatch. We've appended a bold red exit button here.
  return (
    <div className="gateway-controls" style={{ display: 'flex', gap: '15px', alignItems: 'center', width: '100%', justifyContent: 'flex-start' }}>
      <div className="strategy-toggle" style={{ display: 'flex', background: '#333', borderRadius: '15px', padding: '2px' }}>
        <button 
          className={`toggle-token ${gatewayData.strategy === GATEWAY_STRATEGIES.SINGLE ? 'active' : ''}`}
          onClick={() => setGatewayStrategy(GATEWAY_STRATEGIES.SINGLE)}
          style={{ margin: 0, borderRadius: '15px 0 0 15px', borderRight: 'none' }}
        >
          Single Origin
        </button>
        <button 
           className={`toggle-token ${gatewayData.strategy === GATEWAY_STRATEGIES.DUAL ? 'active' : ''}`}
           onClick={() => setGatewayStrategy(GATEWAY_STRATEGIES.DUAL)}
           style={{ margin: 0, borderRadius: '0 15px 15px 0' }}
        >
          Dual Origin (Midpoint)
        </button>
      </div>
      
      <button className="clear-button" onClick={clearAllGateways}>
        Clear Selection
      </button>

      <button className="clear-button" onClick={toggleMode} style={{ backgroundColor: '#f54c4c', marginLeft: 'auto' }}>
        Exit Gateway Mode
      </button>
    </div>
  );
};

export default GatewayControls;