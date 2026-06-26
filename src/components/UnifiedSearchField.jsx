import React, { useState, useContext, useEffect, useRef } from 'react';
import { SearchContext } from '../contexts/SearchContext';

const UnifiedSearchField = () => {
  const { 
    unifiedSearchTerm: inputValue, 
    setUnifiedSearchTerm: setInputValue, 
    generateSuggestions, 
    executeUnifiedSearch 
  } = useContext(SearchContext);

  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
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

  // EXCESSIVE COMMENTING: Upgraded to an asynchronous debounce. We added an `isCurrent` boolean to guard against race conditions: if a user types rapidly, we only want the final, most recent API poll to update the `suggestions` state. 
  useEffect(() => {
    let isCurrent = true;
    
    const timer = setTimeout(async () => {
      if (inputValue.trim().length > 0 && !inputValue.includes('(')) {
        const results = await generateSuggestions(inputValue);
        
        // Prevent state updates if the user continued typing while the FIO network request was resolving
        if (isCurrent) {
          setSuggestions(results);
          setShowDropdown(true);
        }
      } else {
        if (isCurrent) {
          setSuggestions([]);
          setShowDropdown(false);
        }
      }
    }, 250); // Increased debounce slightly to 250ms to be polite to the external FIO database
    
    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [inputValue, generateSuggestions]);

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

    if (exactMatches.length > 1) {
      const resourceMatch = exactMatches.find(match => match.category === 'Resource');
      
      if (resourceMatch) {
        handleSelect(resourceMatch);
        return;
      } else {
        setDisambiguationOptions(exactMatches);
        setShowDropdown(false);
        return;
      }
    }

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