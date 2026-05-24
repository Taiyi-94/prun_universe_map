import React, { useState, useContext, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { ChevronRight, ChevronLeft, Earth, Cloud, Thermometer, Gauge, Weight, Users, X, Plus } from 'lucide-react';
import { GraphContext } from '../contexts/GraphContext';
import { SearchContext } from '../contexts/SearchContext';
import { SelectionContext } from '../contexts/SelectionContext';
import { useCogcOverlay } from '../contexts/CogcOverlayContext';
import { useMapMode, MAP_MODES, GATEWAY_STRATEGIES } from '../contexts/MapModeContext';
import { cogcPrograms } from '../constants/cogcPrograms';
import { colors } from '../config/config';

// --- Reusing Existing Helper Components (ResourceIcon, etc.) ---
const ResourceIcon = ({ type }) => {
  let icon = '❓';
  switch (type) {
    case 'MINERAL': icon = '🪨'; break;
    case 'GASEOUS': icon = '💨'; break;
    case 'LIQUID': icon = '💧'; break;
    default: icon = '❓'; break;
  }
  return <span title={type}>{icon}</span>;
};

const PlanetTypeIcon = ({ isRocky, cogcProgram }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const iconRef = useRef(null);
  const [tooltipStyle, setTooltipStyle] = useState({});

  const IconComponent = isRocky ? Earth : Cloud;
  const typeText = isRocky ? "Rocky Planet" : "Gas Giant";

  const formatProgram = (prog) => {
    if (!prog) return '';
    return prog.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ');
  };

  const getAgeString = (timestamp) => {
    if (!timestamp) return '';
    const diffMs = Date.now() - timestamp;
    const days = diffMs / 86400000; 
    if (days < 0.1) return "Just now";
    return `${days.toFixed(1)} days ago`;
  };

  const handleMouseEnter = () => {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setTooltipStyle({
        position: 'fixed',
        top: rect.bottom + 5,
        left: rect.left,
        backgroundColor: '#333',
        color: 'white',
        padding: '10px',
        borderRadius: '4px',
        boxShadow: '0 4px 8px rgba(0,0,0,0.5)',
        border: '2px solid #222222',
        minWidth: '150px',
        zIndex: 2000,
        pointerEvents: 'none'
      });
    }
    setShowTooltip(true);
  };

  return (
    <>
      <div 
        ref={iconRef}
        className="planet-condition-icon" 
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setShowTooltip(false)}
        style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '5px', cursor: 'help' }}
      >
        <IconComponent
          size={18}
          color="#f7a600"
          strokeWidth={1.5}
          style={{
            display: 'inline-block',
            verticalAlign: 'middle',
            width: '18px',
            height: '18px',
            color: '#f7a600',
            fill: 'none',
            stroke: 'currentColor',
          }}
        />
      </div>
      {showTooltip && ReactDOM.createPortal(
        <div className="tooltip" style={tooltipStyle}>
          <strong>{typeText}</strong>
          {cogcProgram && (
            <div style={{ marginTop: '5px', borderTop: '1px solid #555', paddingTop: '3px' }}>
              <span style={{ fontSize: '10px', color: '#aaa' }}>CoGC Program:</span><br/>
              <span style={{ color: '#f7a600' }}>{formatProgram(cogcProgram.ProgramType)}</span>
              <div style={{ fontSize: '10px', color: '#aaa', marginTop: '2px', fontStyle: 'italic' }}>
                Started: {getAgeString(cogcProgram.StartEpochMs)}
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
};

const PlanetConditionIcon = ({ condition, value, ticker }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  let IconComponent;
  let tooltipContent;
  let iconColor;

  const isLow = (condition, value) => {
    switch (condition) {
      case 'gravity': return value < 0.25;
      case 'temperature': return value < -25.0;
      case 'pressure': return value < 0.25;
      default: return false;
    }
  };

  switch (condition) {
    case 'gravity':
      IconComponent = Weight;
      tooltipContent = `Gravity: ${value.toFixed(2)} (${ticker})`;
      iconColor = isLow(condition, value) ? '#6f6ff7' : '#f54c4c';
      break;
    case 'temperature':
      IconComponent = Thermometer;
      tooltipContent = `Temperature: ${value.toFixed(2)}°C (${ticker})`;
      iconColor = isLow(condition, value) ? '#6f6ff7' : '#f54c4c';
      break;
    case 'pressure':
      IconComponent = Gauge;
      tooltipContent = `Pressure: ${value.toFixed(2)} atm (${ticker})`;
      iconColor = isLow(condition, value) ? '#6f6ff7' : '#f54c4c';
      break;
    default:
      return null;
  }

  return (
    <div
      className="planet-condition-icon"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <IconComponent size={16} color={iconColor} strokeWidth={1.5} />
      {showTooltip && (
        <div className="tooltip">{tooltipContent}</div>
      )}
    </div>
  );
};

const WorkforceIcon = ({ planetId, populationData }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const iconRef = useRef(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, right: 0 });
  const data = populationData ? populationData[planetId] : null;

  if (!data) return null;

  const tiers = ['Pioneer', 'Settler', 'Technician', 'Engineer', 'Scientist'];
  let totalOpenJobs = 0;
  let totalUnemployed = 0;

  tiers.forEach(tier => {
    const tierData = data.Workforce[tier];
    if (tierData) {
      totalOpenJobs += tierData.OpenJobs;
      totalUnemployed += tierData.Unemployed;
    }
  });

  const totalPop = tiers.reduce((sum, tier) => sum + (data.Workforce[tier]?.Population || 0), 0);
  if (totalPop <= 10) return null;

  let iconColor = '#888888'; 
  if (totalOpenJobs > 0) iconColor = '#f54c4c';
  else if (totalUnemployed > 0) iconColor = '#66ff66';

  const getAgeString = (timestamp) => {
    const diffMs = Date.now() - timestamp;
    const days = diffMs / 86400000;
    if (days < 0.1) return "Just now";
    return `${days.toFixed(1)} days ago`;
  };

  const handleMouseEnter = () => {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setTooltipPos({
        top: rect.bottom + 5, 
        right: window.innerWidth - rect.right 
      });
    }
    setShowTooltip(true);
  };

  return (
    <>
      <div
        ref={iconRef}
        className="planet-condition-icon"
        style={{ marginLeft: '8px', cursor: 'pointer' }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => setShowTooltip(!showTooltip)}
      >
        <Users size={16} color={iconColor} strokeWidth={1.5} />
      </div>
      
      {showTooltip && ReactDOM.createPortal(
        <div className="tooltip" style={{ 
          minWidth: '230px', 
          textAlign: 'left', 
          backgroundColor: '#222', 
          border: '1px solid #444',
          zIndex: 2000,
          position: 'fixed',
          top: tooltipPos.top,
          right: tooltipPos.right,
          pointerEvents: 'none',
          boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
        }}>
          <div style={{ 
            borderBottom: '1px solid #444', 
            paddingBottom: '5px', 
            marginBottom: '5px', 
            fontSize: '11px', 
            color: '#aaa',
            display: 'flex',
            justifyContent: 'space-between'
          }}>
            <span>Population: {totalPop.toLocaleString()}</span>
            <span style={{ fontStyle: 'italic' }}>{getAgeString(data.Timestamp)}</span>
          </div>

          <div style={{ display: 'flex', fontSize: '10px', color: '#888', marginBottom: '2px' }}>
            <span style={{ flex: 1 }}>Tier</span>
            <span style={{ width: '65px', textAlign: 'right' }}>Unemployed</span>
            <span style={{ width: '60px', textAlign: 'right' }}>Open Jobs</span>
          </div>

          {tiers.map(tier => {
            const wf = data.Workforce[tier];
            if (!wf || (wf.Population === 0 && wf.OpenJobs === 0)) return null;
            const hasUnemployment = wf.Unemployed > 0;
            const hasOpenJobs = wf.OpenJobs > 0;

            return (
              <div key={tier} style={{ display: 'flex', fontSize: '11px', marginBottom: '2px' }}>
                <span style={{ flex: 1, color: '#ddd' }}>{tier}</span>
                <span style={{ 
                  width: '65px', 
                  textAlign: 'right', 
                  color: hasUnemployment ? '#66ff66' : '#444',
                  fontWeight: hasUnemployment ? 'bold' : 'normal'
                }}>
                  {wf.Unemployed > 0 ? wf.Unemployed : '-'}
                </span>
                <span style={{ 
                  width: '60px', 
                  textAlign: 'right', 
                  color: hasOpenJobs ? '#f54c4c' : '#444',
                  fontWeight: hasOpenJobs ? 'bold' : 'normal'
                }}>
                  {wf.OpenJobs > 0 ? wf.OpenJobs : '-'}
                </span>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
};

const GatewayLegend = () => (
    <div className="gateway-legend">
      <h4>Distance Legend (pc)</h4>
      <div className="legend-items">
        <div className="legend-item"><span className="color-box" style={{background: colors.gateway.under10}}></span> &lt; 10</div>
        <div className="legend-item"><span className="color-box" style={{background: colors.gateway.under15}}></span> 10 - 15</div>
        <div className="legend-item"><span className="color-box" style={{background: colors.gateway.under20}}></span> 15 - 20</div>
        <div className="legend-item"><span className="color-box" style={{background: colors.gateway.under25}}></span> 20 - 25</div>
        <div className="legend-item"><span className="color-box" style={{background: colors.gateway.over25}}></span> &gt; 25</div>
      </div>
    </div>
);

const Sidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(window.innerWidth < 768);
  const { universeData, planetData, materials, populationData } = useContext(GraphContext);
  const { selectedSystem } = useContext(SelectionContext);
  const { searchMaterial, searchResults, isRelativeThreshold, isCompanySearch } = useContext(SearchContext);
  const { activeMode, gatewayData, removePlannedGateway, candidateList, addPlannedGateway, addDualRoute, setHoveredSystemId } = useMapMode();
  const { overlayProgram } = useCogcOverlay();
  
  const selectedProgramValue = cogcPrograms.find(program => program.display === overlayProgram)?.value;

  const toggleSidebar = () => setIsCollapsed(!isCollapsed);

  var materialsMap = [];
  if (materials && materials.length > 0) {
    materialsMap = materials.reduce((acc, material) => {
      acc[material.MaterialId] = material;
      return acc;
    }, {});
  }

  // --- Logic Helpers ---

  const getActiveCogc = (planet) => {
    if (!planet.COGCPrograms || planet.COGCPrograms.length === 0) return null;
    const sortedPrograms = [...planet.COGCPrograms].sort((a, b) => b.StartEpochMs - a.StartEpochMs);
    const relevantProgram = sortedPrograms[1] || sortedPrograms[0];
    return relevantProgram || null;
  };

  const isCardHighlighted = (planetId, planet) => {
    const isPlanetInSearchResults = searchResults.some(result =>
      (result.type === 'planet' && result.id === planetId) ||
      (result.type === 'company_base' && result.planetNaturalId === planetId)
    );
    if (selectedProgramValue) {
        const activeCogc = getActiveCogc(planet);
        if (activeCogc && activeCogc.ProgramType === selectedProgramValue) return true;
    }
    return isPlanetInSearchResults;
  };

  const isResourceHighlighted = (materialId, planetId) => {
    const isPlanetInSearchResults = searchResults.some(result =>
      (result.type === 'planet' && result.id === planetId) ||
      (result.type === 'material' && result.planetId === planetId) ||
      (result.type === 'company_base' && result.planetNaturalId === planetId)
    );
    const isMaterialInSearchMaterial = searchMaterial.includes(materialId);
    return (isMaterialInSearchMaterial && isPlanetInSearchResults) || (isCompanySearch && isPlanetInSearchResults);
  };

  const isConditionAbnormal = (condition, value) => {
    switch (condition) {
      case 'gravity': return value < 0.25 || value > 2.5;
      case 'temperature': return value < -25.0 || value > 75.0;
      case 'pressure': return value < 0.25 || value > 2.0;
      default: return false;
    }
  };

  const getConditionTicker = (condition, value) => {
    switch (condition) {
      case 'gravity': return value < 0.25 ? 'MGC' : 'BL';
      case 'temperature': return value < -25.0 ? 'INS' : 'TSH';
      case 'pressure': return value < 0.25 ? 'SEA' : 'HSE';
      default: return '';
    }
  };

  const phaseMultiplier = {
    'LIQUID': 1867.7/32.32, // 36 RIG on AM-528g
    'GASEOUS': 307.86/8.34, // 23 COL on CG-339b
    'MINERAL': 1009.31/41.92, // 15 EXT on AW-284f
  };
  const maxConcentrations = useMemo(() => {
    const maxConc = {};
    if (planetData) {
      Object.values(planetData).flat().forEach(planet => {
        planet.Resources.forEach(resource => {
          const conc = resource.Factor * phaseMultiplier[resource.ResourceType];
          if (!maxConc[resource.MaterialId] || conc > maxConc[resource.MaterialId]) {
            maxConc[resource.MaterialId] = conc;
          }
        });
      });
    }
    return maxConc;
  }, [planetData]);

  const ConcentrationBar = ({ concentration, materialId, resourceType }) => {
    const maxConcentration = maxConcentrations[materialId] || concentration;
    const percentage = isRelativeThreshold
      ? (concentration * phaseMultiplier[resourceType] / maxConcentration) * 100
      : concentration * 100;
    const hue = (percentage / 100) * 120; 
    const backgroundColor = `hsl(${hue}, 100%, 50%)`;

    return (
      <div className="concentration-bar-container-sb" style={{ width: '100px', backgroundColor: '#ddd', height: '10px', marginLeft: '5px' }}>
        <div className="concentration-bar-sb" style={{ width: `${percentage}%`, backgroundColor, height: '100%' }} />
      </div>
    );
  };

  // --- Render Functions ---

  const renderStandardContent = () => {
    const planets = selectedSystem ? planetData[selectedSystem] : null;
    const sortedPlanets = planets ? [...planets].sort((a, b) => a.PlanetNaturalId.localeCompare(b.PlanetNaturalId)) : null;

    if (!selectedSystem) {
        return <div className="placeholder-text" style={{marginTop:'50px'}}>Select a system to view details.</div>;
    }

    return (
      <>
        <h2>{universeData[selectedSystem] ? universeData[selectedSystem][0].Name : 'No System Selected'}</h2>
        {sortedPlanets && sortedPlanets.map((planet) => {
          const activeCogc = getActiveCogc(planet);
          const shouldHighlightCard = isCardHighlighted(planet.PlanetNaturalId, planet);

          return (
            <div key={planet.PlanetNaturalId} className={`planet-info-sb ${shouldHighlightCard ? 'highlighted' : ''}`}>
              <h3>
                <PlanetTypeIcon isRocky={planet.Surface} cogcProgram={activeCogc} />
                <span style={{ marginLeft: '5px' }}>
                  {planet.PlanetName}{' '}
                  (<a href={`https://prunplanner.org/plan/${planet.PlanetNaturalId}`} className="planet-id-link" target="_blank" rel="noopener noreferrer">{planet.PlanetNaturalId}</a>)
                </span>
                {isConditionAbnormal('gravity', planet.Gravity) && (
                  <PlanetConditionIcon condition="gravity" value={planet.Gravity} ticker={getConditionTicker('gravity', planet.Gravity)} />
                )}
                {isConditionAbnormal('temperature', planet.Temperature) && (
                  <PlanetConditionIcon condition="temperature" value={planet.Temperature} ticker={getConditionTicker('temperature', planet.Temperature)} />
                )}
                {isConditionAbnormal('pressure', planet.Pressure) && (
                  <PlanetConditionIcon condition="pressure" value={planet.Pressure} ticker={getConditionTicker('pressure', planet.Pressure)} />
                )}
                {populationData && (
                  <WorkforceIcon planetId={planet.PlanetNaturalId} populationData={populationData} />
                )}
              </h3>
              <ul>
                {planet.Resources.map((resource, idx) => {
                  const shouldHighlightResource = isResourceHighlighted(resource.MaterialId, planet.PlanetNaturalId);
                  
                  return (
                    <li
                      key={idx}
                      className="resource-item-sb"
                      style={{
                        display: 'flex', alignItems: 'center', marginBottom: '5px',
                        fontWeight: shouldHighlightResource ? 'bold' : 'normal',
                        color: shouldHighlightResource ? '#4a90e2' : 'inherit',
                        backgroundColor: shouldHighlightResource ? 'rgba(74, 144, 226, 0.1)' : 'transparent',
                        padding: '2px 5px', borderRadius: '3px'
                      }}
                    >
                      <ResourceIcon type={resource.ResourceType} />
                      <span style={{ marginLeft: '5px', minWidth: '50px' }}>{materialsMap[resource.MaterialId]?.Ticker || 'Unknown'}</span>
                      <ConcentrationBar concentration={resource.Factor} materialId={resource.MaterialId} resourceType={resource.ResourceType} />
                      <span className="resource-percentage">
                        {isRelativeThreshold
                          ? (resource.Factor * phaseMultiplier[resource.ResourceType] / maxConcentrations[resource.MaterialId] * 100).toFixed(2)
                          : (resource.Factor * 100).toFixed(2)}%
                      </span>
                    </li>
                  );
                })}
              </ul>
              {isCompanySearch && shouldHighlightCard && <div className="company-base-indicator">Company Base</div>}
            </div>
          );
        })}
      </>
    );
  };

  const renderGatewayContent = () => (
    <div className="gateway-sidebar-content">
      <GatewayLegend />
      
      <div className="gateway-selection-info">
          {gatewayData.strategy === GATEWAY_STRATEGIES.SINGLE && (
              <>
                  <h4>Origin: {gatewayData.originA ? gatewayData.originA.Name : 'None Selected'}</h4>
                  <div className="results-list">
                      {candidateList.length === 0 ? (
                          <p className="placeholder-text">Select a system on the map to see nearby candidates.</p>
                      ) : (
                          candidateList.map(cand => (
                              <div 
                                key={cand.system.SystemId} 
                                className="planned-gateway-item"
                                onMouseEnter={() => setHoveredSystemId(cand.system.SystemId)} // Signal Enter
                                onMouseLeave={() => setHoveredSystemId(null)}                 // Signal Leave
                              >
                                  <span>{cand.system.Name}</span>
                                  <span className="dist">{cand.distance.toFixed(2)} pc</span>
                                  <button className="delete-gw-btn" title="Add to Plan" onClick={() => addPlannedGateway({
                                      id: Date.now().toString(),
                                      sourceId: gatewayData.originA.SystemId,
                                      targetId: cand.system.SystemId,
                                      source: gatewayData.originA.Name,
                                      target: cand.system.Name,
                                      distance: cand.distance.toFixed(2),
                                      ftlDistance: cand.ftlDistance.toFixed(1)
                                  })}>
                                      <Plus size={16} />
                                  </button>
                              </div>
                          ))
                      )}
                  </div>
              </>
          )}
           {gatewayData.strategy === GATEWAY_STRATEGIES.DUAL && (
              <>
                  <h4>Origin A: {gatewayData.originA ? gatewayData.originA.Name : 'None'}</h4>
                  <h4>Origin B: {gatewayData.originB ? gatewayData.originB.Name : 'None'}</h4>
                  <div className="results-list">
                       {candidateList.length === 0 ? (
                           <p className="placeholder-text">Select two systems to find midpoints.</p>
                       ) : (
                           candidateList.map(cand => (
                               <div 
                                key={cand.system.SystemId} 
                                className="planned-gateway-item" 
                                style={{flexDirection:'column', alignItems:'stretch'}}
                                onMouseEnter={() => setHoveredSystemId(cand.system.SystemId)} // Signal Enter
                                onMouseLeave={() => setHoveredSystemId(null)}                 // Signal Leave
                               >
                                   <div style={{display:'flex', justifyContent:'space-between'}}>
                                      <span style={{fontWeight:'bold', color:'#f7a600'}}>{cand.system.Name}</span>
                                      <button className="delete-gw-btn" title="Add Dual Route" 
                                          onClick={() => addDualRoute(
                                              gatewayData.originA, 
                                              gatewayData.originB, 
                                              cand.system, 
                                              cand.ftlDistA, 
                                              cand.ftlDistB
                                          )}>
                                        <Plus size={16} />
                                      </button>
                                   </div>
                                   <div style={{display:'flex', justifyContent:'space-between', fontSize:'11px', marginTop:'2px', color:'#aaa'}}>
                                       <span>To A: {cand.distA.toFixed(2)}</span>
                                       <span>To B: {cand.distB.toFixed(2)}</span>
                                       <span style={{color:'#fff'}}>Tot: {cand.totalDist.toFixed(2)}</span>
                                   </div>
                               </div>
                           ))
                       )}
                  </div>
              </>
          )}
      </div>

      <div className="planned-gateways-section">
        <h4>Planned Gateways</h4>
        {gatewayData.plannedGateways.length === 0 ? (
            <p className="placeholder-text">No gateways planned yet.</p>
        ) : (
            <ul className="planned-list" style={{listStyle:'none', padding:0}}>
                {gatewayData.plannedGateways.map(gw => {
                    const savings = gw.ftlDistance && gw.ftlDistance !== "Infinity" 
                        ? Math.round((1 - parseFloat(gw.distance) / parseFloat(gw.ftlDistance)) * 100) 
                        : 0;

                    return (
                        <li key={gw.id} className="planned-gateway-item" style={{flexDirection: 'column', alignItems: 'flex-start', gap: '4px'}}>
                            <div style={{display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center'}}>
                                <span style={{fontWeight: 'bold', color: '#f7a600'}}>{gw.source} ↔ {gw.target}</span>
                                <button className="delete-gw-btn" onClick={() => removePlannedGateway(gw.id)}>
                                    <X size={14} />
                                </button>
                            </div>
                            <div style={{fontSize: '11px', color: '#bbb'}}>
                                Direct: <span style={{color: '#fff'}}>{gw.distance} pc</span> 
                                {" "} FTL Path: <span style={{color: '#fff'}}>{gw.ftlDistance} pc</span>
                            </div>
                            {savings > 0 && (
                                <div style={{fontSize: '11px', color: '#66ff66', fontWeight: 'bold'}}>
                                    Saves {savings}%
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
          )}
      </div>
    </div>
  );

  return (
    <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <button className="toggle-btn" onClick={toggleSidebar}>
        {isCollapsed ? <ChevronLeft /> : <ChevronRight />}
      </button>
      {!isCollapsed && (
        <div className="sidebar-content">
           {activeMode === MAP_MODES.STANDARD ? renderStandardContent() : renderGatewayContent()}
        </div>
      )}
    </div>
  );
};

export default Sidebar;
