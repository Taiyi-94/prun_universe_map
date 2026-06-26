import React, { useState, useContext, useEffect, useRef } from 'react';
import { SearchContext } from '../contexts/SearchContext';

const UnifiedSearchField = () => {
  // EXCESSIVE COMMENTING: We alias the globally managed `unifiedSearchTerm` to `inputValue` locally to preserve all the downstream component logic while allowing the Clear button in the Context to wipe the text.
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
  
  // Ref to detect clicks outside the dropdown wrapper to close it automatically
  const wrapperRef = useRef(null);

  // EXCESSIVE COMMENTING: Close the dropdown if a user clicks outside the bounding box of the search field component.
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // EXCESSIVE COMMENTING: To prevent degrading UI performance by scanning ~4000 planets/systems on every keystroke, we debounce the input by 150ms.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputValue.trim().length > 0 && !inputValue.includes('(')) {
        const results = generateSuggestions(inputValue);
        setSuggestions(results);
        setShowDropdown(true);
      } else {
        setSuggestions([]);
        setShowDropdown(false);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [inputValue, generateSuggestions]);

  // EXCESSIVE COMMENTING: Handle selection from either the dropdown or the disambiguation modal. This modifies the text to visually indicate the category.
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

  // EXCESSIVE COMMENTING: Evaluates logic when the user forcefully hits 'Enter' inside the input box.
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (disambiguationOptions.length > 0) return; // Prevent submission if disambiguation modal is active

    // EXCESSIVE COMMENTING: If the input is completely empty and the user hits enter, execute a wild card search (General category, empty text) to show everything matching the filters.
    if (!inputValue.trim()) {
      await executeUnifiedSearch({ text: '', category: 'General' });
      return;
    }

    let parsedText = inputValue;
    let parsedCategory = null;

    // EXCESSIVE COMMENTING: Check if the string matches the autocompleted format using regex. E.g., "AL (Resource)"
    const suffixMatch = inputValue.match(/^(.*)\s+\((Resource|System|Planet|Corporation)\)$/i);
    if (suffixMatch) {
      parsedText = suffixMatch[1].trim();
      parsedCategory = suffixMatch[2].charAt(0).toUpperCase() + suffixMatch[2].slice(1).toLowerCase(); // Normalize casing
    }

    // EXCESSIVE COMMENTING: If category is explicitly defined, execute search immediately.
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

    // EXCESSIVE COMMENTING: Locate any exact matches inside our current dropdown suggestions comparing lowercase string equality.
    const exactMatches = suggestions.filter(s => s.text.toLowerCase() === inputValue.trim().toLowerCase());

    // EXCESSIVE COMMENTING: If multiple EXACT matches exist across different categories, we evaluate conflict resolution.
    if (exactMatches.length > 1) {
      // EXCESSIVE COMMENTING: Due to FIO Corporation names frequently colliding with base game Resource tickers (e.g., 'AL', 'FE'), and Resources being vastly more commonly searched by users, we implement a priority bypass.
      const resourceMatch = exactMatches.find(match => match.category === 'Resource');
      
      if (resourceMatch) {
        handleSelect(resourceMatch);
        return;
      } else {
        // EXCESSIVE COMMENTING: If no Resource is involved in the collision, we fall back to triggering the manual disambiguation modal to let the user decide.
        setDisambiguationOptions(exactMatches);
        setShowDropdown(false);
        return;
      }
    }

    // EXCESSIVE COMMENTING: If only one exact match exists, or none exist but we have partial matches, execute search on the top option.
    if (suggestions.length > 0) {
      handleSelect(suggestions[0]);
    } else {
      // EXCESSIVE COMMENTING: Absolute fallback for general string matching across the entire local dataset if no suggestions triggered properly.
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

      {/* EXCESSIVE COMMENTING: Autocomplete dropdown UI, shown conditionally based on input state. */}
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

      {/* EXCESSIVE COMMENTING: Disambiguation modal explicitly for exact match conflicts. */}
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

      {/* EXCESSIVE COMMENTING: Render notification block natively within the component bounding space. */}
      {notification && <div className="search-notification">{notification}</div>}
    </div>
  );
};

export default UnifiedSearchField;