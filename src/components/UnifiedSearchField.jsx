import React, { useState, useContext, useEffect, useRef, useMemo } from 'react';
import { SearchContext } from '../contexts/SearchContext';

const UnifiedSearchField = () => {
  const {
    unifiedSearchTerm: inputValue,
    setUnifiedSearchTerm: setInputValue,
    generateLocalSuggestions,
    hasExactLocalMatch,
    fetchFioCompany,
    executeUnifiedSearch
  } = useContext(SearchContext);

  const [localSuggestions, setLocalSuggestions] = useState([]);
  const [fioSuggestion, setFioSuggestion] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // EXCESSIVE COMMENTING: Merge the fast local suggestions with the slow FIO corporation hit. The corporation is appended last so it sits at the bottom of the dropdown, preserving the prior "native game elements win" ordering.
  const suggestions = useMemo(
    () => (fioSuggestion ? [...localSuggestions, fioSuggestion] : localSuggestions),
    [localSuggestions, fioSuggestion]
  );
  const [disambiguationOptions, setDisambiguationOptions] = useState([]);
  const [notification, setNotification] = useState('');
  
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // EXCESSIVE COMMENTING: Fast path — local suggestions on the original 250ms debounce. Purely synchronous data scans, no network.
  useEffect(() => {
    let isCurrent = true;

    const timer = setTimeout(() => {
      if (inputValue.trim().length > 0 && !inputValue.includes('(')) {
        const results = generateLocalSuggestions(inputValue);
        if (isCurrent) {
          setLocalSuggestions(results);
          setShowDropdown(true);
        }
      } else {
        if (isCurrent) {
          setLocalSuggestions([]);
          setShowDropdown(false);
        }
      }
    }, 100);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [inputValue, generateLocalSuggestions]);

  // EXCESSIVE COMMENTING: Slow path — FIO API lookup on its own 1 second debounce. Skipped entirely when the term cleanly maps to an existing Resource/Planet, so common ticker/planet lookups never hit the network.
  useEffect(() => {
    setFioSuggestion(null);

    if (!inputValue.trim() || inputValue.includes('(') || hasExactLocalMatch(inputValue)) {
      return;
    }

    let isCurrent = true;
    const timer = setTimeout(async () => {
      const hit = await fetchFioCompany(inputValue);
      if (isCurrent) {
        setFioSuggestion(hit);
      }
    }, 1000);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [inputValue, hasExactLocalMatch, fetchFioCompany]);

  const handleSelect = async (option) => {
    setInputValue(`${option.text} (${option.category})`);
    setShowDropdown(false);
    setDisambiguationOptions([]);
    
    const results = await executeUnifiedSearch(option);
    if (!results || results.length === 0) {
      setNotification('No matches found');
      setTimeout(() => setNotification(''), 3000);
    } else {
      setNotification('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (disambiguationOptions.length > 0) return; 

    if (!inputValue.trim()) {
      await executeUnifiedSearch({ text: '', category: 'General' });
      return;
    }

    let parsedText = inputValue;
    let parsedCategory = null;

    const suffixMatch = inputValue.match(/^(.*)\s+\((Resource|System|Planet|Corporation)\)$/i);
    if (suffixMatch) {
      parsedText = suffixMatch[1].trim();
      parsedCategory = suffixMatch[2].charAt(0).toUpperCase() + suffixMatch[2].slice(1).toLowerCase(); 
    }

    if (parsedCategory) {
      const results = await executeUnifiedSearch({ text: parsedText, category: parsedCategory });
      if (!results || results.length === 0) {
        setNotification('No matches found');
        setTimeout(() => setNotification(''), 3000);
      } else {
        setNotification('');
      }
      return;
    }

    const exactMatches = suggestions.filter(s => s.text.toLowerCase() === inputValue.trim().toLowerCase());
    
    // EXCESSIVE COMMENTING: Filter out the Corporation category entirely before checking for exact match collisions. Because our updated sorting algorithm pushes Corporations securely to the bottom of the list natively, ignoring them here ensures partial System/Planet matches will naturally win execution if we fall through to `handleSelect(suggestions[0])`.
    const nonCorpExactMatches = exactMatches.filter(s => s.category !== 'Corporation');

    // If multiple native game elements match (e.g. Planet "XYZ" and System "XYZ"), throw the disambiguation modal.
    if (nonCorpExactMatches.length > 1) {
        setDisambiguationOptions(nonCorpExactMatches);
        setShowDropdown(false);
        return;
    }

    // If exactly one native game element matches exactly, immediately select it, silently out-prioritizing any exact corporation matches.
    if (nonCorpExactMatches.length === 1) {
        handleSelect(nonCorpExactMatches[0]);
        return;
    }

    // If no native elements match exactly, but the dropdown has suggestions, execute the top suggestion. 
    // This allows a partial system match (e.g. "Benten") to execute over an exact corp match (e.g. "BEN"), because our revised array sorting algorithm natively demotes the corporation below the partial system match!
    if (suggestions.length > 0) {
      handleSelect(suggestions[0]);
    } else {
      const results = await executeUnifiedSearch({ text: inputValue, category: 'General' });
      if (!results || results.length === 0) {
        setNotification('No matches found');
        setTimeout(() => setNotification(''), 3000);
      } else {
        setNotification('');
      }
    }
  };

  return (
    <div className="unified-search-container" ref={wrapperRef}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', width: '100%' }}>
        <input
          type="text"
          className="unified-search-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Search universe, resources, or companies..."
          onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
        />
        <button type="submit" className="search-button">Search</button>
      </form>

      {showDropdown && suggestions.length > 0 && (
        <ul className="search-dropdown">
          {suggestions.map((opt, idx) => (
            <li key={idx} className="dropdown-item" onClick={() => handleSelect(opt)}>
              <div>
                <span className="dropdown-item-text">{opt.text}</span>
                {opt.label && opt.label !== opt.text && opt.label !== 'Search FIO Database' && (
                  <span className="dropdown-item-label">- {opt.label}</span>
                )}
                {opt.label === 'Search FIO Database' && (
                  <span className="dropdown-item-label" style={{fontStyle:'italic'}}> - Search FIO</span>
                )}
              </div>
              <span className="cat-badge">{opt.category}</span>
            </li>
          ))}
        </ul>
      )}

      {disambiguationOptions.length > 0 && (
        <div className="disambiguation-overlay">
          <div className="disambiguation-dialog">
            <h3>Disambiguation Required</h3>
            <p style={{fontSize: '13px', color: '#ccc'}}>Multiple exact matches found for "<strong>{inputValue}</strong>". Please clarify your intent:</p>
            <ul>
              {disambiguationOptions.map((opt, i) => (
                <li key={i} onClick={() => handleSelect(opt)}>
                  <span>{opt.text} <span style={{fontSize: '11px', color: '#aaa', marginLeft:'5px'}}>{opt.label && opt.label !== opt.text ? `(${opt.label})` : ''}</span></span>
                  <span className="cat-badge">{opt.category}</span>
                </li>
              ))}
            </ul>
            <button className="disambiguation-cancel" onClick={() => setDisambiguationOptions([])}>Cancel</button>
          </div>
        </div>
      )}

      {notification && <div className="search-notification">{notification}</div>}
    </div>
  );
};

export default UnifiedSearchField;